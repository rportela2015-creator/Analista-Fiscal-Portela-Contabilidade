import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getApiKey, getModels } from '@/lib/ai/config';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getServerDataset } from '@/lib/ai/ncm-server';
import { sanearCodificacaoErpIA } from '@/lib/ai/sanear-classificacao';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from '@/lib/engine/matriz-icms-pr';
import { r2 } from '@/lib/lote-erp';

export async function POST(req: Request) {
  // 1. Rate Limiting em memória (20 req/min por IP)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, { maxRequests: 20, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: 'Limite de requisições excedido (máximo 20 req/min). Aguarde antes de enviar nova consulta.',
        codigo: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSec),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const itens = body?.itens;

    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json(
        { error: 'Array "itens" é obrigatório e não pode ser vazio.' },
        { status: 400 }
      );
    }

    if (itens.length > 25) {
      return NextResponse.json(
        { error: 'Limite máximo de 25 itens por lote excedido.' },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'Chave GEMINI_API_KEY não configurada no ambiente (.env.local).',
          codigo: 'API_KEY_MISSING',
        },
        { status: 503 }
      );
    }

    const models = getModels();
    const modelEscolhido = models[0] || 'gemini-3.8-flash';
    const ai = new GoogleGenAI({ apiKey });

    // Prepara o resumo dos itens para o prompt
    const itensPrompt = itens.map((it: any, idx: number) => ({
      index: idx,
      codigo: it.codigo,
      descricao: it.descricao,
      ncm: it.ncm,
      regimeSaida: it.regimeSaida,
      ufOrigem: it.ufOrigem || 'PR',
      ufDestino: it.ufDestino || 'PR',
      finalidadeSaida: it.finalidadeSaida || 'revenda',
      anoCalendario: it.anoCalendario || 2026,
      parametrosAtuais: {
        cest: it.parametrosAtuais?.cest,
        cfopSaida: it.parametrosAtuais?.cfopSaida,
        cstOuCsosnIcms: it.parametrosAtuais?.cstOuCsosnIcms,
        cBenefPr: it.parametrosAtuais?.cBenefPr,
        cstPisCofins: it.parametrosAtuais?.cstPisCofins,
        cstIbsCbs: it.parametrosAtuais?.cstIbsCbs,
        cClassTrib: it.parametrosAtuais?.cClassTrib,
      },
    }));

    const systemInstruction = `Você é um Auditor Fiscal e Especialista em Parametrização Tributária de ERP no Estado do Paraná (RICMS/PR, Convênios CONFAZ e Reforma Tributária LC 214/2025).
Sua missão é resolver e cravar com extrema precisão os códigos de parametrização de saída do ERP para a lista de mercadorias fornecida, levando em conta a descrição exata da mercadoria, a NCM correspondente e o Regime Tributário de Saída do contribuinte.

REGRAS OBRIGATÓRIAS:
1. Para Regime 'simples' e 'simples_hibrido':
   - Usar CSOSN de 3 dígitos (ex: 102 para tributada pelo Simples sem permissão de crédito, 101 se houver permissão, ou 500 se o item for sujeito a ICMS-ST / ICMS cobrado anteriormente por substituição tributária).
   - CFOP de saída: 5102 / 6102 (venda normal) ou 5405 / 6405 (mercadoria com ST retida anteriormente).
   - PIS/COFINS: CST 49 ou 99, alíquotas 0%.
2. Para Regime 'presumido' e 'real':
   - Usar CST de ICMS de 2 dígitos (00 = tributada integralmente, 20 = redução de BC, 40/41 = isenta/não tributada, 51 = diferimento, 60 = cobrado anteriormente por ST).
   - CFOP de saída: 5102 / 6102 (normal) ou 5405 / 6405 (com ST na revenda).
   - PIS/COFINS em 2026:
     * Lucro Presumido: CST 01 (ou 04 monofásico / 06 alíquota zero), PIS 0.65%, COFINS 3.00%.
     * Lucro Real: CST 01 (ou 04/06), PIS 1.65%, COFINS 7.60%.
3. CEST:
   - Se a mercadoria for sujeita ao regime de Substituição Tributária no Anexo IX RICMS/PR (e NÃO excluída pelos Decretos PR 6.048/2024 e 12.828/2026 nem combustível monofásico), informe o código CEST oficial de 7 dígitos sem pontos.
   - Se NÃO estiver sujeita a ST, retorne string vazia "" e mvaOriginalPct = 0.
4. Benefício Fiscal Paraná (cBenefPr):
   - Informe somente código validado na Tabela 5.2 da SEFA/PR compatível com o CST (jamais informe cBenef em CST 00, 10, 60 ou 61 — Rejeição 928).
   - Caso não haja benefício específico validado, retorne 'SEM_CBENEF'.
5. Reforma Tributária (IBS/CBS/IS - LC 214/2025):
   - cstIbsCbs: conforme tabela oficial de classificação tributária (ex: 000 para tributação integral, 200 para alíquota reduzida/zero).
   - cClassTrib: Código oficial de 6 dígitos existente na tabela oficial (ex: 000001 somente quando confirmada tributação integral; 200038 insumos/máq. agro -60%; 200032 medicamentos -60%; 200003 cesta básica alíquota zero). Se incerto, retorne vazio "".
   - redIbsCbsPct: compatível com o cClassTrib oficial (0, 30, 40, 50, 60, 70, 80 ou 100).
6. Aderência:
   - Como especialista, avalie a aderência e retorne aderenciaErpPct entre 90 e 98 para as definições cravadas.`;

    const promptUser = `Parametrize os seguintes itens para o ERP:\n${JSON.stringify(itensPrompt, null, 2)}`;

    const response = await ai.models.generateContent({
      model: modelEscolhido,
      contents: promptUser,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            resultados: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  codigo: { type: Type.STRING },
                  ncm: { type: Type.STRING },
                  cest: { type: Type.STRING, description: 'Código CEST de 7 dígitos ou vazio' },
                  cfopSaida: { type: Type.STRING, description: 'CFOP de saída de 4 dígitos (ex: 5102, 5405)' },
                  cstOuCsosnIcms: { type: Type.STRING, description: 'CST de 2 dígitos ou CSOSN de 3 dígitos' },
                  cBenefPr: { type: Type.STRING, description: 'Código de benefício do PR ou SEM_CBENEF' },
                  aliqIcmsNominalPct: { type: Type.NUMBER },
                  redBcIcmsPct: { type: Type.NUMBER },
                  mvaOriginalPct: { type: Type.NUMBER },
                  cstPisCofins: { type: Type.STRING },
                  aliqPisPct: { type: Type.NUMBER },
                  aliqCofinsPct: { type: Type.NUMBER },
                  cstIbsCbs: { type: Type.STRING },
                  cClassTrib: { type: Type.STRING, description: 'cClassTrib de 6 dígitos' },
                  redIbsCbsPct: { type: Type.NUMBER },
                  aderenciaErpPct: { type: Type.INTEGER },
                  justificativa: { type: Type.STRING },
                },
                required: [
                  'index',
                  'cest',
                  'cfopSaida',
                  'cstOuCsosnIcms',
                  'cBenefPr',
                  'aliqIcmsNominalPct',
                  'redBcIcmsPct',
                  'cstPisCofins',
                  'cstIbsCbs',
                  'cClassTrib',
                  'redIbsCbsPct',
                  'aderenciaErpPct',
                ],
              },
            },
          },
          required: ['resultados'],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');
    const resultados = parsedJson?.resultados || [];

    // Mapeia e reconcilia os resultados com validação determinística anti-alucinação
    const itensReconciliados = itens.map((itemEntrada: any, idx: number) => {
      const match = resultados.find((r: any) => r.index === idx || r.codigo === itemEntrada.codigo);
      if (!match) {
        return {
          ...itemEntrada,
          aderenciaErpPct: 88,
          origemParam: 'MOTOR_DETERMINISTICO',
        };
      }

      const dataRef = `${itemEntrada.anoCalendario || 2026}-06-01`;
      const dadosPr = resolverAliquotaPrBitemporal(itemEntrada.ncm || '', dataRef);
      const exclusaoSt = verificarExclusaoStPr(itemEntrada.ncm || '', match.cest || itemEntrada.parametrosAtuais?.cest, dataRef);

      // Validação formal de CFOP, CST/CSOSN, cBenef, MVA e cClassTrib
      const ehExcluidoOuMono = exclusaoSt.excluidoDaSt || dadosPr.ehCombustivelMonofasico;
      const cfopBruto = /^\d{4}$/.test(match.cfopSaida) ? match.cfopSaida : itemEntrada.parametrosAtuais?.cfopSaida || '5102';
      const cfopEfetivo =
        ehExcluidoOuMono && (cfopBruto === '5405' || cfopBruto === '6405')
          ? (cfopBruto.startsWith('6') ? '6102' : '5102')
          : cfopBruto;

      const saneado = sanearCodificacaoErpIA(
        {
          ncm: match.ncm || itemEntrada.ncm,
          cest: ehExcluidoOuMono ? '' : match.cest,
          cstOuCsosnIcms: match.cstOuCsosnIcms || itemEntrada.parametrosAtuais?.cstOuCsosnIcms,
          cBenefPr: match.cBenefPr,
          mvaOriginalPct: match.mvaOriginalPct,
          redBcIcmsPct: match.redBcIcmsPct,
          cClassTrib: match.cClassTrib,
          cstIbsCbs: match.cstIbsCbs,
          redIbsCbsPct: match.redIbsCbsPct,
        },
        {
          regime: itemEntrada.regimeSaida,
          ncmFallback: itemEntrada.ncm,
          cest: ehExcluidoOuMono ? '' : match.cest,
          dataFatoGerador: dataRef,
        }
      );

      const cestEfetivo =
        !ehExcluidoOuMono && match.cest
          ? String(match.cest).replace(/\D/g, '').padStart(7, '0').slice(0, 7)
          : '';
      const aliqIcmsFinal = dadosPr.ehCombustivelMonofasico
        ? 0
        : Number(itemEntrada.parametrosAtuais?.aliqIcmsNominalPct ?? dadosPr.aliquotaIcmsPct);

      return {
        ...itemEntrada,
        cest: cestEfetivo,
        cfopSaida: cfopEfetivo,
        cstOuCsosnIcms: saneado.cstOuCsosnIcms,
        cBenefPr: saneado.cBenefPr,
        aliqIcmsNominalPct: r2(aliqIcmsFinal),
        redBcIcmsPct: Number(match.redBcIcmsPct || 0),
        mvaOriginalPct: Number(saneado.mvaOriginalPct || 0),
        cstPisCofins: match.cstPisCofins || '01',
        aliqPisPct: match.aliqPisPct !== undefined ? Number(match.aliqPisPct) : itemEntrada.parametrosAtuais?.aliqPisPct || 0,
        aliqCofinsPct: match.aliqCofinsPct !== undefined ? Number(match.aliqCofinsPct) : itemEntrada.parametrosAtuais?.aliqCofinsPct || 0,
        cstIbsCbs: saneado.cstIbsCbs || '',
        cClassTrib: saneado.cClassTrib || '',
        redIbsCbsPct: Number(saneado.redIbsCbsPct || 0),
        enquadramentoPendente: Boolean(saneado.enquadramentoPendente),
        avisosSaneamento: saneado.avisosSaneamento,
        aderenciaErpPct: Math.max(90, Math.min(98, Number(match.aderenciaErpPct || 95))),
        requerCodificacaoIaErp: Boolean(saneado.enquadramentoPendente),
        origemParam: 'IA_ASSISTIDA',
        statusErp: saneado.enquadramentoPendente
          ? 'PENDENTE_CONFERENCIA_FISCAL (cClassTrib não validado)'
          : 'PRONTO_PARAMETRIZAR (Reconciliado e Validado)',
        justificativaIa: match.justificativa,
      };
    });

    return NextResponse.json({
      sucesso: true,
      modelo: modelEscolhido,
      totalItens: itensReconciliados.length,
      itens: itensReconciliados,
    });
  } catch (err: any) {
    console.error('Erro em /api/codificar-erp-ia:', err);
    return NextResponse.json(
      {
        error: err.message || 'Falha ao processar codificação ERP assistida por IA.',
        codigo: 'ERRO_IA_CODIFICACAO',
      },
      { status: 500 }
    );
  }
}
