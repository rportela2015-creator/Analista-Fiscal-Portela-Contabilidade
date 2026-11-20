/**
 * BARRAMENTO DE WEBHOOK FISCAL BIDIRECIONAL (ENTRADA & SAÍDA)
 *
 * Suporta três modos determinísticos de alta velocidade (zero LLM / zero tokens):
 * 1. 'xml_nfe': Ingestão direta de XML de NF-e -> Extração determinística (<20ms) -> Parametrização ERP em lote.
 * 2. 'lote_produtos': Recebe array de mercadorias -> Classificação O(1) Siscomex -> Parametrização ERP em lote.
 * 3. 'status_marco_legal': Retorna estatísticas e hash de conformidade do marco legal.
 *
 * Recursos de Segurança e Relatórios:
 * - Rate limiting (20 req/min por IP) via lib/rate-limit.ts.
 * - Autenticação por token seguro em tempo constante via crypto.timingSafeEqual.
 * - Suporte a modos de relatório 'resumido' (gerencial) e 'detalhado' (pericial completo).
 * - Cadeia completa de CFOP (Origem -> Entrada -> Venda Destinatário).
 * - Indicadores executivos do Bloco C e custos individualizados CPC 16.
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
import type { DestinacaoMercadoria, RegimeTributario } from '@/lib/marco-legal';
import { determinarCfopVendaDestinatario, r2 } from '@/lib/precificacao';
import { calcularCustoItemCPC16, ratearFreteItensCPC16 } from '@/lib/custos';
import type { ExtractedItem } from '@/lib/extrator-nfe-types';
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

const CrtSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal('1'),
  z.literal('2'),
  z.literal('3'),
  z.literal('4'),
  z.literal('simples_hibrido'),
]);

const FormatoSaidaEnum = z.enum(['resumido', 'detalhado']);
const TipoRelatorioEnum = z.enum(['gerencial', 'pericial']);

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
  regimeDestinatario: z.enum(['simples', 'presumido', 'real', 'simples_hibrido']).optional(),
  destinacao: DestinacaoSchema.optional(),
  crtEmitente: CrtSchema.optional(),
  formatoRelatorio: FormatoSaidaEnum.optional(),
  formato_saida: FormatoSaidaEnum.optional(),
  tipo_relatorio: TipoRelatorioEnum.optional(),
  callbackUrl: z.string().url('callbackUrl deve ser uma URL válida').optional(),
});

const ItemProdutoLoteSchema = z.object({
  codigo: z.string().optional(),
  descricao: z.string().min(2, 'Descrição do produto é obrigatória'),
  ncm: z.string().optional(),
  cest: z.string().optional(),
  cfop: z.string().optional(),
  valorUnitario: z.number().nonnegative().optional(),
  quantidade: z.number().positive().optional(),
  vFrete: z.number().nonnegative().optional(),
  vIPI: z.number().nonnegative().optional(),
  vICMSST: z.number().nonnegative().optional(),
  vICMS: z.number().nonnegative().optional(),
  vPIS: z.number().nonnegative().optional(),
  vCOFINS: z.number().nonnegative().optional(),
  vCBS: z.number().nonnegative().optional(),
  vIBS: z.number().nonnegative().optional(),
  cstIcms: z.string().optional(),
  csosn: z.string().optional(),
});

const ModoProdutosSchema = z.object({
  modo: z.literal('lote_produtos'),
  produtos: z.array(ItemProdutoLoteSchema).min(1, 'Lista de produtos não pode ser vazia'),
  ufOrigem: z.string().length(2).optional(),
  ufDestino: z.string().length(2).optional(),
  regimeDestinatario: z.enum(['simples', 'presumido', 'real', 'simples_hibrido']).optional(),
  destinacao: DestinacaoSchema.optional(),
  crtEmitente: CrtSchema.optional(),
  formatoRelatorio: FormatoSaidaEnum.optional(),
  formato_saida: FormatoSaidaEnum.optional(),
  tipo_relatorio: TipoRelatorioEnum.optional(),
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
      formatosRelatorio: ['resumido', 'detalhado'],
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
      const formatoEfetivo: 'resumido' | 'detalhado' =
        payload.formatoRelatorio === 'resumido' ||
        payload.formato_saida === 'resumido' ||
        payload.tipo_relatorio === 'gerencial'
          ? 'resumido'
          : 'detalhado';

      // Stage 1 Determinístico (< 20ms)
      const extracao = extrairDadosXmlNfe(payload.xmlConteudo);

      const ufOrigem = (payload.ufOrigem || extracao.emitente?.uf || 'PR').toUpperCase();
      const ufDestino = (payload.ufDestino || extracao.destinatario?.uf || 'PR').toUpperCase();
      const regimeDest = (payload.regimeDestinatario || 'simples') as RegimeTributario;
      const destinacaoNormalizada = normalizarDestinacao(payload.destinacao) || 'comercializacao';

      // Determinar CRT Emitente efetivo
      const crtEmitenteEfetivo =
        payload.crtEmitente !== undefined
          ? payload.crtEmitente
          : (extracao.emitente?.crt as any) || '3';

      // Rateio proporcional de frete global se houver vFreteTotal no resumo
      let itensProcessados = extracao.itens;
      const vFreteTotalNota = extracao.resumoFinanceiro?.vFreteTotal || 0;
      const vFreteSomaItens = extracao.itens.reduce((acc, it) => acc + (it.vFrete || 0), 0);
      if (vFreteTotalNota > 0 && vFreteSomaItens === 0) {
        itensProcessados = ratearFreteItensCPC16(extracao.itens, vFreteTotalNota, 'valor');
      }

      // Parametrização em lote de todos os itens da nota fiscal
      const loteResult = parametrizarLoteNfe(itensProcessados, {
        ufOrigem,
        ufDestino,
        regimeDestinatario: regimeDest,
        destinacao: destinacaoNormalizada,
      });

      // Enriquecimento com Bloco C, Cadeia CFOP e CPC 16 individualizado
      const itensParametrizadosEnriquecidos = loteResult.itensParametrizados.map((itemParam, idx) => {
        const itemOriginal = itensProcessados[idx] || ({} as ExtractedItem);

        // Injeta crtEmitente no item se fornecido
        const itemComCrt: ExtractedItem = {
          ...itemOriginal,
          crtEmitente: (typeof crtEmitenteEfetivo === 'number'
            ? String(crtEmitenteEfetivo)
            : crtEmitenteEfetivo) as any,
        };

        // 1. Cálculo CPC 16 Item 11
        const custoCpc16 = calcularCustoItemCPC16(itemComCrt, {
          regime: regimeDest,
          destinacao: destinacaoNormalizada,
          ufOrigem,
          ufDestino,
        });

        // 2. Cadeia Completa de CFOP
        const cfopOrigem = itemParam.cfopOrigem || itemOriginal.cfop || '5102';
        const cfopEntrada = itemParam.cfopEntradaSugerido;
        const cfopVendaDestinatario = determinarCfopVendaDestinatario(
          {
            cstIcms: itemOriginal.tributos?.cstIcms,
            csosn: itemOriginal.tributos?.csosn,
            temSt: Boolean(custoCpc16.tributosNaoRecuperaveis.icmsSt > 0 || (itemParam as any).temSt),
            icmsStEntrada: custoCpc16.tributosNaoRecuperaveis.icmsSt,
            ufOrigem,
            ufDestino,
          },
          ufDestino
        );

        // 3. Bloco C - Resumo Executivo (Custo Efetivo, Margem e Preço de Venda Sugerido)
        const custoEfetivoUnitario = custoCpc16.custoUnitarioReal;
        // Margem padrão gerencial de 30% sobre o custo efetivo
        const margemLiquidaPct = 30.0;
        const precoVendaSugerido = r2(custoEfetivoUnitario * (1 + margemLiquidaPct / 100));

        // Estrutura CPC 16 formatada
        const custoIndividualizadoCpc16 = {
          valorBruto: custoCpc16.valorBruto,
          descontos: custoCpc16.descontoIncondicional,
          freteRateado: custoCpc16.freteSeguroOutros,
          ipiNaoRecuperavel: custoCpc16.tributosNaoRecuperaveis.ipi,
          icmsStDifal: custoCpc16.tributosNaoRecuperaveis.icmsSt,
          tributosRecuperaveis: custoCpc16.impostosRecuperaveis.total,
          custoTotal: custoCpc16.custoTotalReal,
          custoUnitario: custoCpc16.custoUnitarioReal,
          ...(formatoEfetivo === 'detalhado'
            ? {
                fundamentacaoLegal: custoCpc16.fundamentacaoLegal,
                glosado: custoCpc16.glosado,
                motivoGlosa: custoCpc16.motivoGlosa,
              }
            : {}),
        };

        const itemBase: any = {
          ...itemParam,
          cadeiaCfop: {
            cfopOrigem,
            cfopEntrada,
            cfopVendaDestinatario,
          },
          blocoC_ResumoExecutivo: {
            custoEfetivoEntradaUnitario: custoEfetivoUnitario,
            margemLiquidaPct,
            precoVendaSugerido,
          },
          custoIndividualizadoCpc16,
        };

        if (formatoEfetivo === 'resumido') {
          delete itemBase.beneficioIcmsPr;
        }

        return itemBase;
      });

      const t1 = performance.now();
      responseData = {
        modo: 'xml_nfe',
        sucesso: true,
        formatoRelatorio: formatoEfetivo,
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
          crt: crtEmitenteEfetivo,
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
        itensParametrizados: itensParametrizadosEnriquecidos,
        diagnosticos: loteResult.diagnosticos,
        tempoExecucaoMs: Math.round(t1 - t0),
        timestamp: new Date().toISOString(),
      };

      if (formatoEfetivo === 'detalhado') {
        responseData.auditoriaPericialIcmsPr = {
          item11Cpc16R1: 'Custo de aquisição compreende preço de compra, impostos não recuperáveis, frete e seguro, deduzidos de descontos comerciais (CPC 16 R1 Item 11).',
          artigo23Lc123_2006: 'Microempresas e EPPs no Simples Nacional tradicional não farão jus à apropriação nem transferirão créditos (Art. 23 LC 123/2006). No regime Simples Híbrido (LC 214/2025), apropriação plena de IBS/CBS.',
          consultaTributaria48_2026: 'Consulta SEFA/PR nº 48/2026: inclusão compulsória de IBS, CBS e Imposto Seletivo na base de cálculo do ICMS a partir de 2027.',
          codigosEfdAdrcSt: {
            ressarcimentoSt: 'PR020211',
            diferimentoParcial: 'PR000092',
          },
        };
      }
    } else if (payload.modo === 'lote_produtos') {
      const formatoEfetivo: 'resumido' | 'detalhado' =
        payload.formatoRelatorio === 'resumido' ||
        payload.formato_saida === 'resumido' ||
        payload.tipo_relatorio === 'gerencial'
          ? 'resumido'
          : 'detalhado';

      // Ingestão e parametrização de produtos avulsos do ERP
      let dataset: any;
      try {
        dataset = getServerDataset();
      } catch {
        dataset = await loadDataset();
      }
      const itensMapeados: ExtractedItem[] = [];
      const ufOrigem = (payload.ufOrigem || 'PR').toUpperCase();
      const ufDestino = (payload.ufDestino || 'PR').toUpperCase();
      const regimeDest = (payload.regimeDestinatario || 'simples') as RegimeTributario;
      const destinacaoNormalizada = normalizarDestinacao(payload.destinacao) || 'comercializacao';
      const crtEmitenteEfetivo = payload.crtEmitente !== undefined ? payload.crtEmitente : '3';

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

        const qtd = prod.quantidade || 1;
        const vUn = prod.valorUnitario || 0;
        const vProd = qtd * vUn;

        itensMapeados.push({
          index: i + 1,
          cProd: prod.codigo || `PROD-${i + 1}`,
          xProd: prod.descricao,
          ncm: ncmEfetivo,
          ncmValidoSiscomex: ncmEfetivo !== '00000000',
          cest: prod.cest,
          cfop: prod.cfop || (ufOrigem === ufDestino ? '5102' : '6102'),
          uCom: 'UN',
          qCom: qtd,
          vUnCom: vUn,
          vProd,
          vFrete: prod.vFrete || 0,
          sensivelParaAuditoria: false,
          crtEmitente: (typeof crtEmitenteEfetivo === 'number'
            ? String(crtEmitenteEfetivo)
            : crtEmitenteEfetivo) as any,
          tributos: {
            vIPI: prod.vIPI,
            vICMSST: prod.vICMSST,
            vICMS: prod.vICMS,
            vPIS: prod.vPIS,
            vCOFINS: prod.vCOFINS,
            vCBS: prod.vCBS,
            vIBS: prod.vIBS,
            cstIcms: prod.cstIcms,
            csosn: prod.csosn,
          },
        });
      }

      const loteResult = parametrizarLoteNfe(itensMapeados, {
        ufOrigem,
        ufDestino,
        regimeDestinatario: regimeDest,
        destinacao: destinacaoNormalizada,
      });

      const itensParametrizadosEnriquecidos = loteResult.itensParametrizados.map((itemParam, idx) => {
        const itemOriginal = itensMapeados[idx];

        const custoCpc16 = calcularCustoItemCPC16(itemOriginal, {
          regime: regimeDest,
          destinacao: destinacaoNormalizada,
          ufOrigem,
          ufDestino,
        });

        const cfopOrigem = itemParam.cfopOrigem || itemOriginal.cfop || '5102';
        const cfopEntrada = itemParam.cfopEntradaSugerido;
        const cfopVendaDestinatario = determinarCfopVendaDestinatario(
          {
            cstIcms: itemOriginal.tributos?.cstIcms,
            csosn: itemOriginal.tributos?.csosn,
            temSt: Boolean(custoCpc16.tributosNaoRecuperaveis.icmsSt > 0 || (itemParam as any).temSt),
            icmsStEntrada: custoCpc16.tributosNaoRecuperaveis.icmsSt,
            ufOrigem,
            ufDestino,
          },
          ufDestino
        );

        const custoEfetivoUnitario = custoCpc16.custoUnitarioReal;
        const margemLiquidaPct = 30.0;
        const precoVendaSugerido = r2(custoEfetivoUnitario * (1 + margemLiquidaPct / 100));

        const custoIndividualizadoCpc16 = {
          valorBruto: custoCpc16.valorBruto,
          descontos: custoCpc16.descontoIncondicional,
          freteRateado: custoCpc16.freteSeguroOutros,
          ipiNaoRecuperavel: custoCpc16.tributosNaoRecuperaveis.ipi,
          icmsStDifal: custoCpc16.tributosNaoRecuperaveis.icmsSt,
          tributosRecuperaveis: custoCpc16.impostosRecuperaveis.total,
          custoTotal: custoCpc16.custoTotalReal,
          custoUnitario: custoCpc16.custoUnitarioReal,
          ...(formatoEfetivo === 'detalhado'
            ? {
                fundamentacaoLegal: custoCpc16.fundamentacaoLegal,
                glosado: custoCpc16.glosado,
                motivoGlosa: custoCpc16.motivoGlosa,
              }
            : {}),
        };

        const itemBase: any = {
          ...itemParam,
          cadeiaCfop: {
            cfopOrigem,
            cfopEntrada,
            cfopVendaDestinatario,
          },
          blocoC_ResumoExecutivo: {
            custoEfetivoEntradaUnitario: custoEfetivoUnitario,
            margemLiquidaPct,
            precoVendaSugerido,
          },
          custoIndividualizadoCpc16,
        };

        if (formatoEfetivo === 'resumido') {
          delete itemBase.beneficioIcmsPr;
        }

        return itemBase;
      });

      const t1 = performance.now();
      responseData = {
        modo: 'lote_produtos',
        sucesso: true,
        formatoRelatorio: formatoEfetivo,
        totalProdutos: payload.produtos.length,
        totalBloqueantes: loteResult.totalBloqueantes,
        totalAlertas: loteResult.totalAlertas,
        itensParametrizados: itensParametrizadosEnriquecidos,
        diagnosticos: loteResult.diagnosticos,
        tempoExecucaoMs: Math.round(t1 - t0),
        timestamp: new Date().toISOString(),
      };

      if (formatoEfetivo === 'detalhado') {
        responseData.auditoriaPericialIcmsPr = {
          item11Cpc16R1: 'Custo de aquisição compreende preço de compra, impostos não recuperáveis, frete e seguro, deduzidos de descontos comerciais (CPC 16 R1 Item 11).',
          artigo23Lc123_2006: 'Microempresas e EPPs no Simples Nacional tradicional não farão jus à apropriação nem transferirão créditos (Art. 23 LC 123/2006). No regime Simples Híbrido (LC 214/2025), apropriação plena de IBS/CBS.',
          consultaTributaria48_2026: 'Consulta SEFA/PR nº 48/2026: inclusão compulsória de IBS, CBS e Imposto Seletivo na base de cálculo do ICMS a partir de 2027.',
          codigosEfdAdrcSt: {
            ressarcimentoSt: 'PR020211',
            diferimentoParcial: 'PR000092',
          },
        };
      }
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
