import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getApiKey, getModels } from '@/lib/ai/config';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getServerDataset } from '@/lib/ai/ncm-server';
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
   - Se a mercadoria for sujeita ao regime de Substituição Tributária (ex: autopeças, ferramentas, alimentos listados no Anexo do Convênio ICMS 142/2018), informe o código CEST oficial de 7 dígitos sem pontos (ex: "0100100").
   - Se NÃO estiver sujeita a ST, retorne string vazia "".
4. Benefício Fiscal Paraná (cBenefPr):
   - Se houver redução de base de cálculo (ex: máquinas, cesta de alimentos no RICMS/PR), informe o código de benefício no padrão 'PR820001' ou 'PR800092' (diferimento parcial).
   - Caso não haja benefício específico, retorne 'SEM_CBENEF'.
5. Reforma Tributária (IBS/CBS/IS - LC 214/2025):
   - cstIbsCbs: 01 (Tributação normal), 02 (Alíquota zero / Imune).
   - cClassTrib: Código oficial de 6 dígitos numéricos (ex: 000001 para padrão, ou código específico de anexo da LC 214/2025 com redução).
   - redIbsCbsPct: 0, 30, 60 ou 100 conforme o cClassTrib.
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

    // Mapeia e reconcilia os resultados com os itens de entrada
    const itensReconciliados = itens.map((itemEntrada: any, idx: number) => {
      const match = resultados.find((r: any) => r.index === idx || r.codigo === itemEntrada.codigo);
      if (!match) {
        return {
          ...itemEntrada,
          aderenciaErpPct: 88,
          origemParam: 'MOTOR_DETERMINISTICO',
        };
      }

      // Validação formal de CFOP e CST/CSOSN
      const cfopEfetivo = (/^\d{4}$/.test(match.cfopSaida) ? match.cfopSaida : itemEntrada.parametrosAtuais?.cfopSaida || '5102');
      const cstEfetivo = String(match.cstOuCsosnIcms || itemEntrada.parametrosAtuais?.cstOuCsosnIcms || '00');
      const cestEfetivo = match.cest ? String(match.cest).replace(/\D/g, '').padStart(7, '0').slice(0, 7) : '';
      const cClassTribEfetivo = match.cClassTrib ? String(match.cClassTrib).replace(/\D/g, '').padStart(6, '0').slice(0, 6) : '000001';

      return {
        ...itemEntrada,
        cest: cestEfetivo,
        cfopSaida: cfopEfetivo,
        cstOuCsosnIcms: cstEfetivo,
        cBenefPr: match.cBenefPr || 'SEM_CBENEF',
        aliqIcmsNominalPct: Number(match.aliqIcmsNominalPct || itemEntrada.parametrosAtuais?.aliqIcmsNominalPct || 19.5),
        redBcIcmsPct: Number(match.redBcIcmsPct || 0),
        mvaOriginalPct: Number(match.mvaOriginalPct || (cestEfetivo ? 40 : 0)),
        cstPisCofins: match.cstPisCofins || '01',
        aliqPisPct: match.aliqPisPct !== undefined ? Number(match.aliqPisPct) : itemEntrada.parametrosAtuais?.aliqPisPct || 0,
        aliqCofinsPct: match.aliqCofinsPct !== undefined ? Number(match.aliqCofinsPct) : itemEntrada.parametrosAtuais?.aliqCofinsPct || 0,
        cstIbsCbs: match.cstIbsCbs || '01',
        cClassTrib: cClassTribEfetivo,
        redIbsCbsPct: Number(match.redIbsCbsPct || 0),
        aderenciaErpPct: Math.max(90, Math.min(98, Number(match.aderenciaErpPct || 95))),
        requerCodificacaoIaErp: false,
        origemParam: 'IA_ASSISTIDA',
        statusErp: 'PRONTO_PARAMETRIZAR (Reconciliado por IA)',
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
