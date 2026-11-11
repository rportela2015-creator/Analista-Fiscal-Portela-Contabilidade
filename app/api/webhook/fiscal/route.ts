/**
 * BARRAMENTO DE WEBHOOK FISCAL BIDIRECIONAL (ENTRADA & SAÍDA)
 *
 * Suporta três modos determinísticos de alta velocidade (zero LLM / zero tokens):
 * 1. 'xml_nfe': Ingestão direta de XML de NF-e -> Extração determinística (<20ms) -> Parametrização ERP em lote.
 * 2. 'lote_produtos': Recebe array de mercadorias -> Classificação O(1) Siscomex -> Parametrização ERP em lote.
 * 3. 'status_marco_legal': Retorna estatísticas e hash de conformidade do marco legal.
 *
 * Recursos de Segurança:
 * - Rate limiting (20 req/min por IP) via lib/rate-limit.ts.
 * - Autenticação por token seguro em tempo constante via crypto.timingSafeEqual.
 * - Callback outbound assinado via HMAC-SHA256 (header X-MCM-Signature).
 * - Headers imutáveis de proteção contra cache (Cache-Control: no-store).
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { extrairDadosXmlNfe } from '@/lib/extrator-nfe';
import { parametrizarLoteNfe } from '@/lib/parametrizacao';
import { loadDataset } from '@/lib/data';
import { getServerDataset } from '@/lib/ai/ncm-server';
import { classify } from '@/lib/engine';
import type { DestinacaoMercadoria } from '@/lib/marco-legal';
import fs from 'fs';
import path from 'path';

// Headers comuns de segurança e cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Content-Type': 'application/json',
};

// Segredo do Webhook (obtido de variáveis de ambiente com fallback)
function getWebhookSecret(): string {
  return (
    process.env.MCM_WEBHOOK_SECRET ||
    process.env.API_SECRET_TOKEN ||
    'mcm-secret-token-padrao'
  );
}

// Comparação estrita de tokens em tempo constante
function safeCompareTokens(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const DestinacaoSchema = z.enum([
  'comercializacao',
  'industrializacao',
  'uso_consumo',
  'ativo_imobilizado',
  'consumo',
  'ativo',
]);

function normalizarDestinacao(d?: string): DestinacaoMercadoria | undefined {
  if (!d) return undefined;
  if (d === 'consumo') return 'uso_consumo';
  if (d === 'ativo') return 'ativo_imobilizado';
  return d as DestinacaoMercadoria;
}

// Schemas Zod de Validação do Payload
const ModoXmlSchema = z.object({
  modo: z.literal('xml_nfe'),
  xmlConteudo: z.string().min(10, 'Conteúdo do XML da NF-e é obrigatório'),
  ufOrigem: z.string().length(2).optional(),
  ufDestino: z.string().length(2).optional(),
  regimeDestinatario: z.enum(['simples', 'presumido', 'real']).optional(),
  destinacao: DestinacaoSchema.optional(),
  callbackUrl: z.string().url('callbackUrl deve ser uma URL válida').optional(),
});

const ItemProdutoLoteSchema = z.object({
  codigo: z.string().optional(),
  descricao: z.string().min(2, 'Descrição do produto é obrigatória'),
  ncm: z.string().optional(),
  valorUnitario: z.number().nonnegative().optional(),
  quantidade: z.number().positive().optional(),
});

const ModoProdutosSchema = z.object({
  modo: z.literal('lote_produtos'),
  produtos: z.array(ItemProdutoLoteSchema).min(1, 'Lista de produtos não pode ser vazia'),
  ufOrigem: z.string().length(2).optional(),
  ufDestino: z.string().length(2).optional(),
  regimeDestinatario: z.enum(['simples', 'presumido', 'real']).optional(),
  destinacao: DestinacaoSchema.optional(),
  callbackUrl: z.string().url('callbackUrl deve ser uma URL válida').optional(),
});

const ModoMarcoLegalSchema = z.object({
  modo: z.literal('status_marco_legal'),
  callbackUrl: z.string().url('callbackUrl deve ser uma URL válida').optional(),
});

const WebhookRequestSchema = z.discriminatedUnion('modo', [
  ModoXmlSchema,
  ModoProdutosSchema,
  ModoMarcoLegalSchema,
]);

// Carrega metadados do marco legal de forma resiliente
function obterMetadadosMarcoLegal() {
  try {
    const caminhoMarco = path.join(process.cwd(), 'rules', 'marco-legal.json');
    if (fs.existsSync(caminhoMarco)) {
      const conteudo = JSON.parse(fs.readFileSync(caminhoMarco, 'utf-8'));
      return {
        versao: conteudo.versao || '3.0.0',
        totalNormas: conteudo.catalogo_normas?.length || 35,
        circuitBreakerMinNormas: conteudo.circuit_breaker?.min_normas || 35,
        hashSha256: crypto.createHash('sha256').update(JSON.stringify(conteudo)).digest('hex').substring(0, 16),
      };
    }
  } catch {
    /* fallback */
  }
  return {
    versao: '3.0.0',
    totalNormas: 35,
    circuitBreakerMinNormas: 35,
    hashSha256: 'desconhecido',
  };
}

// Dispara callback assinado para o ERP consumidor (se callbackUrl for informada)
function dispararCallbackAssinado(callbackUrl: string, payload: any, secret: string) {
  try {
    const bodyStr = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');

    fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCM-Signature': `sha256=${signature}`,
        'User-Agent': 'Aplicativo-MCM-Fiscal-Webhook/3.0',
      },
      body: bodyStr,
      signal: AbortSignal.timeout(10000), // 10 segundos de timeout
    }).catch((err) => {
      console.warn('[Webhook Outbound Callback Falhou]', err.message);
    });
  } catch (err: any) {
    console.warn('[Webhook Outbound Callback Erro]', err.message);
  }
}

// -----------------------------------------------------------------------------
// GET /api/webhook/fiscal — Healthcheck e Status do Barramento
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const rate = checkRateLimit(ip, { maxRequests: 20, windowMs: 60_000 });

  if (!rate.success) {
    return NextResponse.json(
      { error: 'Limite de requisições excedido. Tente novamente mais tarde.' },
      {
        status: 429,
        headers: {
          ...NO_CACHE_HEADERS,
          'Retry-After': String(rate.retryAfterSec),
        },
      }
    );
  }

  const marcoInfo = obterMetadadosMarcoLegal();

  return NextResponse.json(
    {
      status: 'online',
      servico: 'Barramento Fiscal de Webhook Bidirecional MCM',
      versao: '3.0.0',
      marcoLegal: marcoInfo,
      modosSuportados: ['xml_nfe', 'lote_produtos', 'status_marco_legal'],
      autenticacao: 'Header X-MCM-Token, X-Webhook-Secret ou Authorization: Bearer <token>',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
}

// -----------------------------------------------------------------------------
// POST /api/webhook/fiscal — Processamento de Eventos e Lotes Fiscais
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const t0 = performance.now();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  // 1. Rate Limiting (20 req/min por IP)
  const rate = checkRateLimit(ip, { maxRequests: 20, windowMs: 60_000 });
  if (!rate.success) {
    return NextResponse.json(
      { error: 'Limite de requisições excedido. Tente novamente mais tarde.' },
      {
        status: 429,
        headers: {
          ...NO_CACHE_HEADERS,
          'Retry-After': String(rate.retryAfterSec),
        },
      }
    );
  }

  // 2. Autenticação Segura em Tempo Constante
  const secretEsperado = getWebhookSecret();
  const tokenHeader =
    req.headers.get('x-mcm-token') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';

  if (!safeCompareTokens(tokenHeader, secretEsperado)) {
    return NextResponse.json(
      { error: 'Não autorizado. Token de webhook ausente ou inválido.' },
      {
        status: 401,
        headers: NO_CACHE_HEADERS,
      }
    );
  }

  // 3. Leitura e Validação do Corpo da Requisição
  let bodyJson: any;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição deve ser um JSON válido.' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const parseResult = WebhookRequestSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Payload inválido para o modo especificado.',
        detalhes: parseResult.error.flatten(),
      },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const payload = parseResult.data;
  let responseData: any;

  // 4. Execução Conforme o Modo Solicitado (Zero LLM / Zero Tokens)
  try {
    if (payload.modo === 'xml_nfe') {
      // Stage 1 Determinístico (< 20ms)
      const extracao = extrairDadosXmlNfe(payload.xmlConteudo);

      const ufOrigem = (payload.ufOrigem || extracao.emitente?.uf || 'PR').toUpperCase();
      const ufDestino = (payload.ufDestino || extracao.destinatario?.uf || 'PR').toUpperCase();

      // Parametrização em lote de todos os itens da nota fiscal
      const loteResult = parametrizarLoteNfe(extracao.itens, {
        ufOrigem,
        ufDestino,
        regimeDestinatario: payload.regimeDestinatario,
        destinacao: normalizarDestinacao(payload.destinacao),
      });

      const t1 = performance.now();
      responseData = {
        modo: 'xml_nfe',
        sucesso: true,
        identificacaoNfe: {
          numero: extracao.identificacao?.numero,
          serie: extracao.identificacao?.serie,
          chaveAcesso: extracao.identificacao?.chaveAcesso,
          dataEmissao: extracao.identificacao?.dataEmissao,
        },
        emitente: {
          nome: extracao.emitente?.nome,
          cnpj: extracao.emitente?.cnpj,
          uf: extracao.emitente?.uf,
          regime: extracao.emitente?.regimeDescricao,
        },
        destinatario: {
          nome: extracao.destinatario?.nome,
          cnpj: extracao.destinatario?.cnpj,
          uf: extracao.destinatario?.uf,
        },
        resumoFinanceiro: extracao.resumoFinanceiro,
        totalItens: extracao.itens.length,
        totalBloqueantes: loteResult.totalBloqueantes,
        totalAlertas: loteResult.totalAlertas,
        itensParametrizados: loteResult.itensParametrizados,
        diagnosticos: loteResult.diagnosticos,
        tempoExecucaoMs: Math.round(t1 - t0),
        timestamp: new Date().toISOString(),
      };
    } else if (payload.modo === 'lote_produtos') {
      // Ingestão e parametrização de produtos avulsos do ERP
      let dataset: any;
      try {
        dataset = getServerDataset();
      } catch {
        dataset = await loadDataset();
      }
      const itensMapeados: any[] = [];

      for (let i = 0; i < payload.produtos.length; i++) {
        const prod = payload.produtos[i];
        let ncmEfetivo = (prod.ncm || '').replace(/\D/g, '');

        // Se NCM não foi informado ou está incompleto, usa classificação determinística O(1)
        if (ncmEfetivo.length !== 8) {
          const resultado = classify(prod.descricao, dataset, { top: 1 });
          if (resultado.candidates.length > 0) {
            ncmEfetivo = resultado.candidates[0].rec.d8;
          } else {
            ncmEfetivo = '00000000';
          }
        }

        itensMapeados.push({
          index: i + 1,
          cProd: prod.codigo || `PROD-${i + 1}`,
          xProd: prod.descricao,
          ncm: ncmEfetivo,
          cfop: payload.ufOrigem === payload.ufDestino ? '5102' : '6102',
          qCom: prod.quantidade || 1,
          vUnCom: prod.valorUnitario || 0,
          vProd: (prod.quantidade || 1) * (prod.valorUnitario || 0),
          tributos: {},
        });
      }

      const loteResult = parametrizarLoteNfe(itensMapeados, {
        ufOrigem: payload.ufOrigem || 'PR',
        ufDestino: payload.ufDestino || 'PR',
        regimeDestinatario: payload.regimeDestinatario,
        destinacao: normalizarDestinacao(payload.destinacao),
      });

      const t1 = performance.now();
      responseData = {
        modo: 'lote_produtos',
        sucesso: true,
        totalProdutos: payload.produtos.length,
        totalBloqueantes: loteResult.totalBloqueantes,
        totalAlertas: loteResult.totalAlertas,
        itensParametrizados: loteResult.itensParametrizados,
        diagnosticos: loteResult.diagnosticos,
        tempoExecucaoMs: Math.round(t1 - t0),
        timestamp: new Date().toISOString(),
      };
    } else if (payload.modo === 'status_marco_legal') {
      const marcoInfo = obterMetadadosMarcoLegal();
      const t1 = performance.now();
      responseData = {
        modo: 'status_marco_legal',
        sucesso: true,
        marcoLegal: marcoInfo,
        tempoExecucaoMs: Math.round(t1 - t0),
        timestamp: new Date().toISOString(),
      };
    }

    // 5. Outbound Callback Assinado (se solicitado)
    if (payload.callbackUrl) {
      dispararCallbackAssinado(payload.callbackUrl, responseData, secretEsperado);
      responseData.callbackDisparado = true;
    }

    return NextResponse.json(responseData, {
      status: 200,
      headers: NO_CACHE_HEADERS,
    });
  } catch (err: any) {
    const t1 = performance.now();
    return NextResponse.json(
      {
        sucesso: false,
        error: err.message || 'Falha no processamento fiscal do webhook.',
        tempoExecucaoMs: Math.round(t1 - t0),
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: NO_CACHE_HEADERS,
      }
    );
  }
}
