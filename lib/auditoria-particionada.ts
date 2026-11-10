/**
 * lib/auditoria-particionada.ts
 *
 * Motor de Auditoria Fiscal Pericial Particionada de NF-e
 *
 * Implementa arquitetura em duas etapas:
 * 1. IA Local: Ollama na GPU AMD Radeon RX 580 (Polaris 20 - 8GB VRAM)
 *    - Particionamento sequencial item a item (batchSize = 1) eliminando estouro de timeout (180s)
 *    - Limpeza de contexto (strip de tags não tributárias: transp, cobr, pag, infAdic)
 *    - Timeout seguro de 35s por item, num_ctx: 4096, temperatura 0.1
 *    - Grounding com injeção da descrição oficial do Siscomex (10.515 registros em memória)
 *    - Modelo primário: qwen2.5:7b (precisão jurídica) com fallback para qwen3.5:4b
 * 2. IA Externa: Google Gemini API (gemini-3.8-flash via @google/genai)
 *    - Validação de chave GEMINI_API_KEY e respeito a AI_SOVEREIGNTY_MODE
 *    - Schema estruturado responseSchema com @google/genai Type
 *    - Saneamento determinístico pós-inferência contra Siscomex (getMapaD8())
 * 3. Dual Bridge: suporta tanto estruturas aninhadas quanto aliases planos para
 *    integração perfeita com ParametrizacaoERP e geradores de relatórios.
 */

import { GoogleGenAI, Type } from '@google/genai';
import {
  generateOllama,
  isOllamaOnline,
  getOllamaModels,
  getBestPericiaModel,
  getSovereigntyMode,
  extrairJsonOllama,
} from './ollama-client';
import { getMapaD8 } from './ai/ncm-server';
import { validarNcmIA } from './ai/validar';
import type {
  AuditRequestPayload,
  ExtractedItem,
  ContextoAdquirente,
  DocumentoContexto,
} from './extrator-nfe';

/* =========================================================================
 * 1. INTERFACES E CONTRATOS DO MOTOR DE AUDITORIA (M2 <-> M3)
 * ========================================================================= */

export interface AuditedItemFinding {
  index: number;
  cProd: string;
  xProd: string;
  ncm: {
    declarado: string;
    auditado: string;
    validoSiscomex: boolean;
    divergente: boolean;
    descricaoOficialSiscomex: string;
    confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
    rgiAplicada?: string[];
    fundamentacaoNcm: string;
  };
  cfop: {
    saidaFornecedor: string;
    entradaSugerido: string;
    descricaoCfop: string;
    justificativa: string;
  };
  icms: {
    cstCsosnDeclarado: string;
    cstIcmsEntradaSugerido: string;
    permiteCredito: boolean;
    aliqIcmsCredito: string;
    alertaStDifal?: string;
    fundamentoIcms: string;
  };
  pisCofins: {
    cstPisDeclarado?: string;
    cstPisCofinsEntradaSugerido: string;
    permiteCredito: boolean;
    enquadramento: string;
  };
  reforma: {
    cClassTrib: string;
    descricaoClassTrib: string;
    cstIbsCbs: string;
    aliqIbsTeste2026: string;
    aliqCbsTeste2026: string;
    sujeitoImpostoSeletivo: boolean;
    alertaTransicao?: string;
  };
  instrucaoCadastroERP: string;
  statusItem: 'Regular' | 'Atenção' | 'Inconsistente';

  // Aliases planos para compatibilidade direta com ParametrizacaoERP e Relatórios
  cfopEntrada?: string;
  cstIcmsEntrada?: string;
  aliqIcms?: string;
  permiteCredito?: boolean;
  cstPisCofinsEntrada?: string;
  aliqPis?: string;
  aliqCofins?: string;
  cClassTrib?: string;
  aliqIbsTransitorio?: string;
  aliqCbsTransitorio?: string;
  regimeEspecial?: string;
  instrucaoCadastro?: string;
}

export interface AuditedInvoiceResponse {
  motorUtilizado: string;
  tempoExecucaoMs: number;
  statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente';
  parecerTecnicoGeral: string;
  parecerConformidadeCreditos: string;
  totalItensAuditados: number;
  itens: AuditedItemFinding[];
}

/* =========================================================================
 * 2. LIMPEZA DE CONTEXTO E PROMPT PERICIAL ATERRADO (R4 & ZERO HALLUCINATION)
 * ========================================================================= */

export interface StrippedFiscalItem {
  index: number;
  cProd: string;
  xProd: string;
  ncm: string;
  ncmValidoSiscomex: boolean;
  descricaoSiscomexOficial: string;
  cest?: string;
  cfopSaida: string;
  origemMercadoria?: number;
  tributosFornecedor: {
    cstIcms?: string;
    csosn?: string;
    pICMS?: number;
    vBC?: number;
    vICMS?: number;
    vBCST?: number;
    vICMSST?: number;
    pMVAST?: number;
    cstIpi?: string;
    pIPI?: number;
    vIPI?: number;
    cstPis?: string;
    pPIS?: number;
    vPIS?: number;
    cstCofins?: string;
    pCOFINS?: number;
    vCOFINS?: number;
    cClassTrib?: string;
    cstIbsCbs?: string;
  };
  motivosSensibilidade?: string[];
}

/**
 * Remove todas as tags não-tributárias (<transp>, <cobr>, <pag>, <infAdic>),
 * preservando estritamente os campos fiscais sensíveis para a auditoria de entrada.
 */
export function stripFiscalItemContext(item: ExtractedItem): StrippedFiscalItem {
  return {
    index: item.index,
    cProd: item.cProd,
    xProd: item.xProd,
    ncm: item.ncm,
    ncmValidoSiscomex: Boolean(item.ncmValidoSiscomex),
    descricaoSiscomexOficial: item.descricaoOficialSiscomex || item.descricaoSiscomex || '',
    cest: item.cest,
    cfopSaida: item.cfop,
    origemMercadoria: item.tributos?.orig,
    tributosFornecedor: {
      cstIcms: item.tributos?.cstIcms,
      csosn: item.tributos?.csosn,
      pICMS: item.tributos?.pICMS,
      vBC: item.tributos?.vBC,
      vICMS: item.tributos?.vICMS,
      vBCST: item.tributos?.vBCST,
      vICMSST: item.tributos?.vICMSST,
      pMVAST: item.tributos?.pMVAST,
      cstIpi: item.tributos?.cstIpi,
      pIPI: item.tributos?.pIPI,
      vIPI: item.tributos?.vIPI,
      cstPis: item.tributos?.cstPis,
      pPIS: item.tributos?.pPIS,
      vPIS: item.tributos?.vPIS,
      cstCofins: item.tributos?.cstCofins,
      pCOFINS: item.tributos?.pCOFINS,
      vCOFINS: item.tributos?.vCOFINS,
      cClassTrib: item.tributos?.cClassTrib,
      cstIbsCbs: item.tributos?.cstIbsCbs,
    },
    motivosSensibilidade: item.motivosSensibilidade,
  };
}

/**
 * Validação prévia de payload para execução de auditoria.
 */
export function validarAuditPayload(payload: any): payload is AuditRequestPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload nulo ou indefinido.');
  }
  if (payload.motor !== 'ollama' && payload.motor !== 'gemini') {
    throw new Error(`Motor inválido: '${payload.motor}'. Motores suportados: 'ollama' ou 'gemini'.`);
  }
  if (!payload.contextoAdquirente || !payload.contextoAdquirente.regime || !payload.contextoAdquirente.regime.trim()) {
    throw new Error('O regime tributário do adquirente é obrigatório (contextoAdquirente.regime).');
  }
  if (!Array.isArray(payload.itensSelecionados)) {
    throw new Error('itensSelecionados deve ser um array.');
  }
  if (payload.itensSelecionados.length === 0) {
    throw new Error('A lista de itens selecionados para auditoria não pode ser vazio (itensSelecionados.length === 0).');
  }
  return true;
}

/**
 * Monta prompt individual pericial focado exclusivamente no item selecionado.
 * Injeta a descrição oficial do Siscomex para ancoragem (grounding).
 */
export function montarPromptOllamaItem(
  item: StrippedFiscalItem,
  contextoAdquirente: ContextoAdquirente,
  documentoContexto: DocumentoContexto
): string {
  const isInterstate = (documentoContexto.emitenteUf || 'SP').toUpperCase() !== (contextoAdquirente.ufDestino || 'SP').toUpperCase();
  const isFornecedorSimples = documentoContexto.emitenteCrt === '1';

  return `Você é um Auditor Fiscal Pericial de Elite da Receita Federal e dos Fiscos Estaduais.
Analise a classificação fiscal e enquadramento de entrada deste item de NF-e:

CONTEXTO DA OPERAÇÃO:
- Adquirente: UF ${contextoAdquirente.ufDestino} | Regime: ${contextoAdquirente.regime} | Finalidade: ${contextoAdquirente.finalidade}
- Emitente: UF ${documentoContexto.emitenteUf || 'SP'} | CRT: ${documentoContexto.emitenteCrt || '3'} (${isFornecedorSimples ? 'Simples Nacional' : 'Regime Normal'})
- Operação: ${isInterstate ? 'INTERESTADUAL' : 'INTERNA'}

DADOS FISCAIS DO ITEM:
- Item: ${item.index} | Código: ${item.cProd} | Descrição: "${item.xProd}"
- NCM Declarado: ${item.ncm} (Válido no Siscomex: ${item.ncmValidoSiscomex ? 'SIM' : 'NÃO'})
- Descrição Oficial Siscomex: "${item.descricaoSiscomexOficial || 'NÃO LOCALIZADA NO SISCOMEX'}"
- CEST: ${item.cest || 'NÃO INFORMADO'} | CFOP Saída Fornecedor: ${item.cfopSaida}
- Tributos Fornecedor: ICMS CST/CSOSN=${item.tributosFornecedor.csosn || item.tributosFornecedor.cstIcms || 'N/A'}, pICMS=${item.tributosFornecedor.pICMS || 0}%, vBCST=${item.tributosFornecedor.vBCST || 0}, PIS=${item.tributosFornecedor.cstPis || 'N/A'}, COFINS=${item.tributosFornecedor.cstCofins || 'N/A'}

REGRAS DE AUDITORIA:
1. NCM: Se válido, confirme e mantenha. Se inválido, aponte NCM auditado oficial e fundamente com RGI 1 a 6.
2. CFOP Entrada: Converta saída para entrada (5xxx -> 1xxx, 6xxx -> 2xxx). Revenda=1102/2102, ST=1403/2403/1405.
3. ICMS / Crédito: Se Fornecedor Simples Nacional (CSOSN 102/103), crédito VEDADO (Art. 23 LC 123/2006), sugerir CST entrada '090', aliq '0%', statusItem 'Atenção'. Se Regime Normal para revenda, permite crédito.
4. Alerta ST / CEST: Se interestadual com ST (vBCST > 0) e CEST ausente, emita alerta obrigatório do Convênio 142/2018 e statusItem 'Inconsistente'.
5. Reforma Tributária (LC 214/2025): Sugira cClassTrib '000001', cstIbsCbs '000', aliqIbs '0,1%', aliqCbs '0,9%'.

Responda ESTRITAMENTE em formato JSON com o seguinte esquema:
{
  "ncmAuditado": "string",
  "validoSiscomex": boolean,
  "rgiAplicada": ["RGI 1", "RGI 6"],
  "fundamentacaoNcm": "string",
  "cfopEntradaSugerido": "string",
  "descricaoCfop": "string",
  "justificativaCfop": "string",
  "cstIcmsEntradaSugerido": "string",
  "permiteCreditoIcms": boolean,
  "aliqIcmsCredito": "string",
  "alertaStDifal": "string ou null",
  "fundamentoIcms": "string",
  "cstPisCofinsEntradaSugerido": "string",
  "permiteCreditoPisCofins": boolean,
  "enquadramentoPisCofins": "string",
  "cClassTrib": "000001",
  "descricaoClassTrib": "Tributação Integral Padrão CBS/IBS",
  "cstIbsCbs": "000",
  "aliqIbsTeste2026": "0,1%",
  "aliqCbsTeste2026": "0,9%",
  "sujeitoImpostoSeletivo": boolean,
  "instrucaoCadastroERP": "string",
  "statusItem": "Regular | Atenção | Inconsistente"
}`;
}

/* =========================================================================
 * 3. MOTOR LOCAL OLLAMA PARTICIONADO (AMD RADEON RX 580)
 * ========================================================================= */

/**
 * Converte sugestão de CFOP de saída do fornecedor para CFOP de entrada adequado no adquirente.
 */
function calcularCfopEntradaSugerido(cfopSaida: string, parsedEntrada?: string, finalidade?: string): string {
  const saida = (cfopSaida || '').trim();
  const fin = (finalidade || 'revenda').toLowerCase();
  const isUsoConsumo = fin.includes('consumo');
  const isAtivo = fin.includes('ativo');
  const isIndustrializacao = fin.includes('industrial');

  // Se o LLM já produziu algo consistente com a direção interestadual/interna, podemos validar
  if (parsedEntrada && (parsedEntrada.startsWith('1') || parsedEntrada.startsWith('2'))) {
    if (saida.startsWith('6') && !parsedEntrada.startsWith('2')) {
      return '2' + parsedEntrada.slice(1);
    }
    if (saida.startsWith('5') && !parsedEntrada.startsWith('1')) {
      return '1' + parsedEntrada.slice(1);
    }
    return parsedEntrada;
  }

  const isInterstate = saida.startsWith('6');
  const isST = saida.endsWith('403') || saida.endsWith('405') || saida.endsWith('401') || saida.endsWith('404');

  if (isInterstate) {
    if (isST) return isUsoConsumo ? '2407' : '2403';
    if (isIndustrializacao) return '2101';
    if (isAtivo) return '2551';
    if (isUsoConsumo) return '2556';
    return '2102';
  } else {
    if (isST) return isUsoConsumo ? '1407' : '1403';
    if (isIndustrializacao) return '1101';
    if (isAtivo) return '1551';
    if (isUsoConsumo) return '1556';
    return '1102';
  }
}

/**
 * Audita um único item no Ollama local com timeout de 35s e num_ctx de 4096.
 * Executa saneamento pós-inferência contra a tabela oficial do Siscomex.
 */
export async function auditarItemOllamaIndividual(
  item: ExtractedItem,
  contextoAdquirente: ContextoAdquirente,
  documentoContexto: DocumentoContexto,
  modeloPreferido = 'qwen2.5:7b',
  mapaD8 = getMapaD8()
): Promise<AuditedItemFinding> {
  const stripped = stripFiscalItemContext(item);
  const prompt = montarPromptOllamaItem(stripped, contextoAdquirente, documentoContexto);

  let rawResponse = '';
  try {
    rawResponse = await generateOllama({
      model: modeloPreferido,
      prompt,
      system: 'Você é um Auditor Fiscal Pericial de NF-e. Responda estritamente em JSON válido.',
      format: 'json',
      temperature: 0.1,
      timeoutMs: 35000, // Limite de 35s por item na GPU RX 580
      num_ctx: 4096,    // Contexto compacto para evitar paging na VRAM da RX 580
    });
  } catch (err: any) {
    // Se o modelo primário falhar, tenta fallback rápido
    if (modeloPreferido !== 'qwen3.5:4b') {
      try {
        rawResponse = await generateOllama({
          model: 'qwen3.5:4b',
          prompt,
          system: 'Você é um Auditor Fiscal Pericial. Responda estritamente em JSON puro sem raciocínio longo.',
          format: 'json',
          temperature: 0.1,
          timeoutMs: 25000,
          num_ctx: 4096,
        });
      } catch (fallbackErr) {
        throw new Error(`Falha no item ${item.index} (${item.cProd}): ${err.message}`);
      }
    } else {
      throw err;
    }
  }

  let parsed: any = {};
  try {
    parsed = extrairJsonOllama(rawResponse);
  } catch {
    parsed = {};
  }

  // Grounding determinístico contra os 10.515 registros do Siscomex
  const ncmAuditadoRaw = String(parsed.ncmAuditado || item.ncm || '').trim();
  const val = validarNcmIA({ ncm: ncmAuditadoRaw }, mapaD8);
  const ncmValidoSiscomex = val.valido;
  const ncmAuditadoFinal = val.valido ? val.ncm : (item.ncmValidoSiscomex ? item.ncm : ncmAuditadoRaw);
  const recSiscomex = mapaD8.get(ncmAuditadoFinal.replace(/\D/g, ''));

  // Regras de negócio determinísticas para conformidade fiscal estrita
  const isSimples102 = item.tributos?.csosn === '102' || item.tributos?.csosn === '103';
  const isInterstateST = item.cfop.startsWith('6') && (Boolean(item.tributos?.vBCST) || Boolean(item.cest));
  const isMissingCest = Boolean(item.tributos?.vBCST && !item.cest);

  const entradaSugerido = calcularCfopEntradaSugerido(item.cfop, parsed.cfopEntradaSugerido, contextoAdquirente.finalidade);

  const cstIcmsEntrada = isSimples102 ? '090' : (parsed.cstIcmsEntradaSugerido || '00');
  const permiteCreditoIcms = isSimples102 ? false : Boolean(parsed.permiteCreditoIcms ?? true);
  const aliqIcms = isSimples102 ? '0%' : (parsed.aliqIcmsCredito || `${item.tributos?.pICMS || 18}%`);

  let alertaStDifal = parsed.alertaStDifal;
  if (isMissingCest) {
    alertaStDifal = 'ALERTA: Mercadoria com ST interestadual sem preenchimento de CEST obrigatório (Convênio 142/2018)';
  }

  const fundamentoIcms = isSimples102
    ? 'Art. 23 da LC 123/2006 proíbe apropriação de crédito em operações CSOSN 102'
    : (parsed.fundamentoIcms || 'Art. 155 da CF/88');

  let statusItem: 'Regular' | 'Atenção' | 'Inconsistente' = parsed.statusItem || 'Regular';
  if (!ncmValidoSiscomex || isMissingCest) {
    statusItem = 'Inconsistente';
  } else if (isSimples102) {
    statusItem = 'Atenção';
  }

  const instrucaoERP = parsed.instrucaoCadastroERP || `Parametrizar produto ${item.cProd} com CFOP ${entradaSugerido} e CST ${cstIcmsEntrada}`;

  const cClassTrib = parsed.cClassTrib || '000001';
  const aliqIbsTeste = parsed.aliqIbsTeste2026 || '0,1%';
  const aliqCbsTeste = parsed.aliqCbsTeste2026 || '0,9%';
  const cstPisCofinsEntrada = parsed.cstPisCofinsEntradaSugerido || (isSimples102 ? '70' : '50');

  return {
    index: item.index,
    cProd: item.cProd,
    xProd: item.xProd,
    ncm: {
      declarado: item.ncm,
      auditado: ncmAuditadoFinal,
      validoSiscomex: ncmValidoSiscomex,
      divergente: item.ncm.replace(/\D/g, '') !== ncmAuditadoFinal.replace(/\D/g, ''),
      descricaoOficialSiscomex: ncmValidoSiscomex ? (recSiscomex?.desc || val.descricaoNcm || '') : 'NCM Inexistente no Siscomex',
      confianca: ncmValidoSiscomex ? 'ALTA' : 'BAIXA',
      rgiAplicada: parsed.rgiAplicada || ['RGI 1', 'RGI 6'],
      fundamentacaoNcm: parsed.fundamentacaoNcm || 'Classificação aterrada no Siscomex e NESH',
    },
    cfop: {
      saidaFornecedor: item.cfop,
      entradaSugerido,
      descricaoCfop: parsed.descricaoCfop || 'Compra para comercialização',
      justificativa: parsed.justificativaCfop || 'Adequação da operação de saída do emitente para entrada no estabelecimento adquirente',
    },
    icms: {
      cstCsosnDeclarado: item.tributos?.csosn || item.tributos?.cstIcms || '00',
      cstIcmsEntradaSugerido: cstIcmsEntrada,
      permiteCredito: permiteCreditoIcms,
      aliqIcmsCredito: aliqIcms,
      alertaStDifal: alertaStDifal || undefined,
      fundamentoIcms,
    },
    pisCofins: {
      cstPisDeclarado: item.tributos?.cstPis,
      cstPisCofinsEntradaSugerido: cstPisCofinsEntrada,
      permiteCredito: isSimples102 ? false : Boolean(parsed.permiteCreditoPisCofins ?? true),
      enquadramento: parsed.enquadramentoPisCofins || 'Regime Não-Cumulativo',
    },
    reforma: {
      cClassTrib,
      descricaoClassTrib: parsed.descricaoClassTrib || 'Tributação Integral Padrão CBS/IBS',
      cstIbsCbs: parsed.cstIbsCbs || '000',
      aliqIbsTeste2026: aliqIbsTeste,
      aliqCbsTeste2026: aliqCbsTeste,
      sujeitoImpostoSeletivo: Boolean(parsed.sujeitoImpostoSeletivo),
      alertaTransicao: parsed.alertaTransicao || 'Alíquotas de teste para o ano-base 2026 conforme LC 214/2025',
    },
    instrucaoCadastroERP: instrucaoERP,
    statusItem,

    // Aliases planos para compatibilidade direta com ParametrizacaoERP e Relatórios
    cfopEntrada: entradaSugerido,
    cstIcmsEntrada,
    aliqIcms,
    permiteCredito: permiteCreditoIcms,
    cstPisCofinsEntrada,
    aliqPis: `${item.tributos?.pPIS || 1.65}%`,
    aliqCofins: `${item.tributos?.pCOFINS || 7.6}%`,
    cClassTrib,
    aliqIbsTransitorio: aliqIbsTeste,
    aliqCbsTransitorio: aliqCbsTeste,
    regimeEspecial: 'Regime Regular (Padrão)',
    instrucaoCadastro: instrucaoERP,
  };
}

/**
 * Executa a auditoria pericial particionada para todos os itens selecionados.
 * Processa estritamente item a item em fila sequencial para respeitar a VRAM da RX 580.
 */
export async function executarAuditoriaOllamaParticionada(
  payload: AuditRequestPayload
): Promise<AuditedInvoiceResponse> {
  const t0 = performance.now();
  const online = await isOllamaOnline(2000);
  if (!online) {
    const err: any = new Error('Serviço Ollama Local (http://127.0.0.1:11434) está indisponível ou desligado.');
    err.codigo = 'OLLAMA_OFFLINE';
    throw err;
  }

  const models = await getOllamaModels();
  const modeloPreferido = payload.modelo || getBestPericiaModel(models);
  const mapaD8 = getMapaD8();

  const itensAuditados: AuditedItemFinding[] = [];

  // Particionamento sequencial estrito item a item (batchSize = 1)
  for (const item of payload.itensSelecionados) {
    const auditado = await auditarItemOllamaIndividual(
      item,
      payload.contextoAdquirente,
      payload.documentoContexto,
      modeloPreferido,
      mapaD8
    );
    itensAuditados.push(auditado);
  }

  // Ordenação garantida pelo índice original da nota fiscal
  itensAuditados.sort((a, b) => a.index - b.index);

  const hasInconsistente = itensAuditados.some((i) => i.statusItem === 'Inconsistente');
  const hasAtencao = itensAuditados.some((i) => i.statusItem === 'Atenção');
  const statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente' = hasInconsistente
    ? 'Inconsistente'
    : hasAtencao
    ? 'Atenção'
    : 'Regular';

  return {
    motorUtilizado: `Ollama Local (${modeloPreferido}) · GPU RX 580`,
    tempoExecucaoMs: Math.round(performance.now() - t0),
    statusGlobal,
    parecerTecnicoGeral: 'Auditoria pericial executada com sucesso com foco estrito em dados fiscais sensíveis de entrada.',
    parecerConformidadeCreditos: 'Direitos creditórios avaliados de acordo com a legislação do Simples Nacional e Regime Regular.',
    totalItensAuditados: itensAuditados.length,
    itens: itensAuditados,
  };
}

/* =========================================================================
 * 4. MOTOR GOOGLE GEMINI CLOUD API (@google/genai & gemini-3.8-flash)
 * ========================================================================= */

export const geminiAuditResponseSchema = {
  type: Type.OBJECT,
  properties: {
    statusGlobal: {
      type: Type.STRING,
      enum: ['Regular', 'Atenção', 'Inconsistente'],
      description: 'Status pericial global da nota fiscal',
    },
    parecerTecnicoGeral: {
      type: Type.STRING,
      description: 'Parecer técnico minucioso sobre os aspectos tributários sensíveis de entrada',
    },
    parecerConformidadeCreditos: {
      type: Type.STRING,
      description: 'Parecer executivo sobre conformidade de créditos de ICMS, PIS/COFINS e transição IBS/CBS',
    },
    itens: {
      type: Type.ARRAY,
      description: 'Lista de pareceres periciais para cada item selecionado',
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER, description: 'Número do item (1-indexed)' },
          cProd: { type: Type.STRING, description: 'Código do produto no fornecedor' },
          xProd: { type: Type.STRING, description: 'Descrição comercial do produto' },
          ncm: {
            type: Type.OBJECT,
            properties: {
              declarado: { type: Type.STRING, description: 'NCM declarado no documento' },
              auditado: { type: Type.STRING, description: 'NCM oficial auditado de 8 dígitos' },
              validoSiscomex: { type: Type.BOOLEAN, description: 'Se o NCM auditado consta na tabela oficial Siscomex' },
              divergente: { type: Type.BOOLEAN, description: 'Se houve divergência entre declarado e auditado' },
              descricaoOficialSiscomex: { type: Type.STRING, description: 'Descrição oficial do subitem no Siscomex' },
              confianca: { type: Type.STRING, enum: ['ALTA', 'MEDIA', 'BAIXA'] },
              rgiAplicada: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Regras Gerais de Interpretação aplicadas (ex.: RGI 1, RGI 6)',
              },
              fundamentacaoNcm: { type: Type.STRING, description: 'Justificativa técnica da classificação' },
            },
            required: ['declarado', 'auditado', 'validoSiscomex', 'divergente', 'confianca', 'fundamentacaoNcm'],
          },
          cfop: {
            type: Type.OBJECT,
            properties: {
              saidaFornecedor: { type: Type.STRING, description: 'CFOP de saída do fornecedor' },
              entradaSugerido: { type: Type.STRING, description: 'CFOP de entrada sugerido para o adquirente (1xxx ou 2xxx)' },
              descricaoCfop: { type: Type.STRING, description: 'Descrição da operação do CFOP de entrada' },
              justificativa: { type: Type.STRING, description: 'Justificativa do enquadramento do CFOP' },
            },
            required: ['saidaFornecedor', 'entradaSugerido', 'descricaoCfop', 'justificativa'],
          },
          icms: {
            type: Type.OBJECT,
            properties: {
              cstCsosnDeclarado: { type: Type.STRING, description: 'CST ou CSOSN de ICMS do documento' },
              cstIcmsEntradaSugerido: { type: Type.STRING, description: 'CST sugerido de entrada (ex: 00, 10, 60, 90)' },
              permiteCredito: { type: Type.BOOLEAN, description: 'Se a operação permite apropriação de crédito pelo adquirente' },
              aliqIcmsCredito: { type: Type.STRING, description: 'Alíquota de crédito de ICMS aplicável (ex: 18%, 12%, 0%)' },
              alertaStDifal: { type: Type.STRING, description: 'Alerta sobre Substituição Tributária ou DIFAL, se aplicável' },
              fundamentoIcms: { type: Type.STRING, description: 'Base legal (ex: Art. 23 LC 123/2006, Convênio 142/2018, Art. 155 CF/88)' },
            },
            required: ['cstCsosnDeclarado', 'cstIcmsEntradaSugerido', 'permiteCredito', 'aliqIcmsCredito', 'fundamentoIcms'],
          },
          pisCofins: {
            type: Type.OBJECT,
            properties: {
              cstPisDeclarado: { type: Type.STRING, description: 'CST de PIS declarado' },
              cstPisCofinsEntradaSugerido: { type: Type.STRING, description: 'CST de crédito sugerido (ex: 50, 70, 73)' },
              permiteCredito: { type: Type.BOOLEAN, description: 'Se permite crédito de PIS/COFINS' },
              enquadramento: { type: Type.STRING, description: 'Regime cumulativo ou não-cumulativo' },
            },
            required: ['cstPisCofinsEntradaSugerido', 'permiteCredito', 'enquadramento'],
          },
          reforma: {
            type: Type.OBJECT,
            properties: {
              cClassTrib: { type: Type.STRING, description: 'Código cClassTrib IBS/CBS da LC 214/2025 (ex: 000001)' },
              descricaoClassTrib: { type: Type.STRING, description: 'Descrição da classificação tributária da reforma' },
              cstIbsCbs: { type: Type.STRING, description: 'CST IBS/CBS sugerido (ex: 000, 200, 400)' },
              aliqIbsTeste2026: { type: Type.STRING, description: 'Alíquota de teste IBS 2026 (0,1%)' },
              aliqCbsTeste2026: { type: Type.STRING, description: 'Alíquota de teste CBS 2026 (0,9%)' },
              sujeitoImpostoSeletivo: { type: Type.BOOLEAN, description: 'Se o item é sujeito ao Imposto Seletivo' },
              alertaTransicao: { type: Type.STRING, description: 'Orientações sobre transição da LC 214/2025' },
            },
            required: ['cClassTrib', 'descricaoClassTrib', 'cstIbsCbs', 'aliqIbsTeste2026', 'aliqCbsTeste2026', 'sujeitoImpostoSeletivo'],
          },
          instrucaoCadastroERP: {
            type: Type.STRING,
            description: 'Instrução direta e cirúrgica para parametrização do produto no ERP',
          },
          statusItem: {
            type: Type.STRING,
            enum: ['Regular', 'Atenção', 'Inconsistente'],
            description: 'Status pericial do item',
          },
        },
        required: [
          'index',
          'cProd',
          'xProd',
          'ncm',
          'cfop',
          'icms',
          'pisCofins',
          'reforma',
          'instrucaoCadastroERP',
          'statusItem',
        ],
      },
    },
  },
  required: ['statusGlobal', 'parecerTecnicoGeral', 'parecerConformidadeCreditos', 'itens'],
};

export function montarPromptGeminiAudit(payload: AuditRequestPayload): string {
  const { contextoAdquirente, documentoContexto, itensSelecionados } = payload;
  const isInterstate = (documentoContexto.emitenteUf || 'SP').toUpperCase() !== (contextoAdquirente.ufDestino || 'SP').toUpperCase();

  const itensSensiveis = itensSelecionados.map((it) => stripFiscalItemContext(it));

  return `Você é um Auditor Fiscal Pericial de Elite da Receita Federal e dos Fiscos Estaduais, especialista em classificação no Sistema Harmonizado (NCM/SH), RGI 1 a 6, tributação de entrada (ICMS, IPI, PIS, COFINS) e Reforma Tributária do Consumo (IBS/CBS/IS - LC 214/2025 e LC 227/2025).

AUDITORIA DE ENTRADA — CONTEXTO FISCAL:
- Adquirente (Destino): UF ${contextoAdquirente.ufDestino} | Regime: ${contextoAdquirente.regime} | Finalidade: ${contextoAdquirente.finalidade}
- Emitente (Origem): UF ${documentoContexto.emitenteUf || 'SP'} | CNPJ: ${documentoContexto.emitenteCnpj || 'N/A'} | CRT: ${documentoContexto.emitenteCrt || '3'} (${documentoContexto.emitenteCrt === '1' ? 'Simples Nacional' : 'Regime Normal'})
- Operação: ${isInterstate ? 'INTERESTADUAL' : 'INTERNA'} | Natureza: ${documentoContexto.naturezaOperacao || 'Venda'}

DIRETRIZES PERICIAIS OBRIGATÓRIAS:
1. NCM: Validar a descrição comercial com o NCM declarado. Se inválido ou incompatível, classificar pelas RGI 1 a 6 e indicar fundamentação.
2. CFOP DE ENTRADA: Converter saída do fornecedor para entrada no adquirente:
   - Saída 5xxx -> Entrada 1xxx (ex: 5102 -> 1102 para Revenda; 5101 -> 1101 para Industrialização; 5551 -> 1551 para Ativo; 5556 -> 1556 para Consumo).
   - Saída 6xxx -> Entrada 2xxx (ex: 6102/6101 -> 2102/2101 para Revenda; 6403/6401 -> 2403 para ST).
   - Saída com ST (5405/6403) -> Entrada 1403/2403 ou 1405/2405.
3. ICMS / CRÉDITOS:
   - Fornecedor Simples Nacional (CRT 1, CSOSN 102/103): VEDADO crédito de ICMS (Art. 23 LC 123/2006). Definir permiteCredito: false, cstIcmsEntradaSugerido: '090', aliqIcmsCredito: '0%', statusItem: 'Atenção', e citar a LC 123/2006 no fundamentoIcms.
   - Adquirente Regime Regular comprando com CST 00/20 de fornecedor Regime Normal para revenda: permiteCredito: true.
   - Finalidade "Uso e Consumo": VEDADO crédito (permiteCredito: false, cstIcmsEntradaSugerido: '090').
4. ALERTA MANDATÓRIO ST E CEST (Convênio ICMS 142/2018):
   - Se a operação for interestadual com cálculo de ST (vBCST > 0 ou CST 10/70) e a tag CEST estiver ausente/vazia, emitir alertaStDifal: "ALERTA: Mercadoria com ST interestadual sem preenchimento de CEST obrigatório (Convênio 142/2018)" e statusItem: 'Inconsistente'.
5. PIS/COFINS: Para adquirente em Regime Não-Cumulativo (Lucro Real) em revenda/industrialização: permiteCredito: true, cstPisCofinsEntradaSugerido: '50'. Se fornecedor for Simples, permiteCredito: false, CST 70.
6. REFORMA TRIBUTÁRIA (LC 214/2025): Sugerir cClassTrib '000001' (Tributação Integral Padrão), cstIbsCbs '000', aliqIbsTeste2026 '0,1%', aliqCbsTeste2026 '0,9%'. Informar se incide Imposto Seletivo (art. 393 LC 214/2025).
7. STATUS ITEM: 'Inconsistente' (falta de CEST em ST, NCM inválido, erro grave), 'Atenção' (Simples CSOSN 102 sem crédito), ou 'Regular'.
8. STATUS GLOBAL: 'Inconsistente' se houver pelo menos um item inconsistente; senão 'Atenção' se houver item atenção; senão 'Regular'.

ITENS SELECIONADOS PARA AUDITORIA (DADOS FISCAIS SENSÍVEIS):
${JSON.stringify(itensSensiveis, null, 2)}`;
}

export async function executarAuditoriaGemini(payload: AuditRequestPayload): Promise<AuditedInvoiceResponse> {
  const t0 = performance.now();

  // 1. Soberania de dados
  const sovereigntyMode = getSovereigntyMode();
  if (sovereigntyMode === 'local_strict') {
    const err: any = new Error(
      'Modo de Soberania Estrita ativo (AI_SOVEREIGNTY_MODE=local_strict). O envio de dados fiscais sensíveis para a Google Gemini API está bloqueado por política de soberania de dados. Utilize a IA Local Ollama na GPU RX 580.'
    );
    err.codigo = 'SOBERANIA_LOCAL_ESTRITA';
    throw err;
  }

  // 2. Resolução da chave de API
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const err: any = new Error(
      'Chave de API do Google Gemini não configurada no ambiente (GEMINI_API_KEY). Para auditar em nuvem com alta velocidade via gemini-3.8-flash, configure a variável de ambiente GEMINI_API_KEY.'
    );
    err.codigo = 'GEMINI_KEY_MISSING';
    throw err;
  }

  // 3. Validação do payload
  validarAuditPayload(payload);

  const model = payload.modelo || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey });
  const prompt = montarPromptGeminiAudit(payload);

  // 4. Invocação do modelo via SDK oficial
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: geminiAuditResponseSchema,
    },
  });

  const rawText = typeof response.text === 'function' ? (response as any).text() : response.text;
  if (!rawText) {
    throw new Error('A Google Gemini API retornou uma resposta textual vazia.');
  }

  const parsed = JSON.parse(rawText);
  const mapaD8 = getMapaD8();

  // 5. Grounding pericial determinístico e saneamento contra Siscomex (10.515 registros)
  const itensAuditados: AuditedItemFinding[] = (parsed.itens || []).map((itGemini: any) => {
    const origItem = payload.itensSelecionados.find((it) => it.index === itGemini.index) || payload.itensSelecionados[0];
    const ncmClean = (itGemini.ncm?.auditado || itGemini.ncm?.declarado || origItem.ncm || '').replace(/\D/g, '');
    const recSiscomex = mapaD8.get(ncmClean);
    const ncmValidoSiscomex = Boolean(recSiscomex && ncmClean.length === 8);

    const isSimples102 = origItem.tributos?.csosn === '102' || origItem.tributos?.csosn === '103';
    const isInterstateST = origItem.cfop.startsWith('6') && (Boolean(origItem.tributos?.vBCST) || Boolean(origItem.cest));
    const isMissingCest = Boolean(origItem.tributos?.vBCST && !origItem.cest);

    // CFOP fallback de segurança determinístico
    const cfopEntrada = calcularCfopEntradaSugerido(origItem.cfop, itGemini.cfop?.entradaSugerido, payload.contextoAdquirente.finalidade);

    const permiteCreditoIcms = isSimples102 ? false : (itGemini.icms?.permiteCredito ?? true);
    const cstIcmsEntrada = isSimples102 ? '090' : (itGemini.icms?.cstIcmsEntradaSugerido || '00');
    const aliqIcms = isSimples102 ? '0%' : (itGemini.icms?.aliqIcmsCredito || `${origItem.tributos?.pICMS || 18}%`);

    let alertaStDifal = itGemini.icms?.alertaStDifal;
    if (isMissingCest && !alertaStDifal) {
      alertaStDifal = 'ALERTA: Mercadoria com ST interestadual sem preenchimento de CEST obrigatório (Convênio 142/2018)';
    }

    const fundamentoIcms = isSimples102
      ? 'Art. 23 da LC 123/2006 proíbe apropriação de crédito em operações CSOSN 102'
      : (itGemini.icms?.fundamentoIcms || 'Art. 155 da CF/88');

    let statusItem: 'Regular' | 'Atenção' | 'Inconsistente' = itGemini.statusItem || 'Regular';
    if (!ncmValidoSiscomex || isMissingCest) {
      statusItem = 'Inconsistente';
    } else if (isSimples102) {
      statusItem = 'Atenção';
    }

    const cClassTrib = itGemini.reforma?.cClassTrib || '000001';
    const aliqIbsTeste = itGemini.reforma?.aliqIbsTeste2026 || '0,1%';
    const aliqCbsTeste = itGemini.reforma?.aliqCbsTeste2026 || '0,9%';
    const cstPisCofinsEntrada = itGemini.pisCofins?.cstPisCofinsEntradaSugerido || (isSimples102 ? '70' : '50');
    const instrucaoERP = itGemini.instrucaoCadastroERP || `Parametrizar produto ${origItem.cProd} com CFOP ${cfopEntrada} e CST ${cstIcmsEntrada}`;

    return {
      index: itGemini.index || origItem.index,
      cProd: itGemini.cProd || origItem.cProd,
      xProd: itGemini.xProd || origItem.xProd,
      ncm: {
        declarado: itGemini.ncm?.declarado || origItem.ncm,
        auditado: ncmValidoSiscomex ? (recSiscomex?.ncm || ncmClean) : (itGemini.ncm?.auditado || origItem.ncm),
        validoSiscomex: ncmValidoSiscomex,
        divergente: itGemini.ncm?.declarado !== (ncmValidoSiscomex ? recSiscomex?.ncm : ncmClean),
        descricaoOficialSiscomex: ncmValidoSiscomex ? (recSiscomex?.desc || '') : 'NCM Inexistente no Siscomex',
        confianca: ncmValidoSiscomex ? (itGemini.ncm?.confianca || 'ALTA') : 'BAIXA',
        rgiAplicada: itGemini.ncm?.rgiAplicada || ['RGI 1', 'RGI 6'],
        fundamentacaoNcm: itGemini.ncm?.fundamentacaoNcm || 'Classificação aterrada no Siscomex e NESH',
      },
      cfop: {
        saidaFornecedor: origItem.cfop,
        entradaSugerido: cfopEntrada,
        descricaoCfop: itGemini.cfop?.descricaoCfop || 'Compra para comercialização',
        justificativa: itGemini.cfop?.justificativa || 'Adequação da operação de saída do emitente para entrada no estabelecimento adquirente',
      },
      icms: {
        cstCsosnDeclarado: origItem.tributos?.csosn || origItem.tributos?.cstIcms || '00',
        cstIcmsEntradaSugerido: cstIcmsEntrada,
        permiteCredito: permiteCreditoIcms,
        aliqIcmsCredito: aliqIcms,
        alertaStDifal,
        fundamentoIcms,
      },
      pisCofins: {
        cstPisDeclarado: origItem.tributos?.cstPis,
        cstPisCofinsEntradaSugerido: cstPisCofinsEntrada,
        permiteCredito: isSimples102 ? false : (itGemini.pisCofins?.permiteCredito ?? true),
        enquadramento: itGemini.pisCofins?.enquadramento || 'Regime Não-Cumulativo',
      },
      reforma: {
        cClassTrib,
        descricaoClassTrib: itGemini.reforma?.descricaoClassTrib || 'Tributação Integral Padrão CBS/IBS',
        cstIbsCbs: itGemini.reforma?.cstIbsCbs || '000',
        aliqIbsTeste2026: aliqIbsTeste,
        aliqCbsTeste2026: aliqCbsTeste,
        sujeitoImpostoSeletivo: Boolean(itGemini.reforma?.sujeitoImpostoSeletivo),
        alertaTransicao: itGemini.reforma?.alertaTransicao || 'Alíquotas de teste para o ano-base 2026 conforme LC 214/2025',
      },
      instrucaoCadastroERP: instrucaoERP,
      statusItem,

      // Aliases planos
      cfopEntrada,
      cstIcmsEntrada,
      aliqIcms,
      permiteCredito: permiteCreditoIcms,
      cstPisCofinsEntrada,
      aliqPis: `${origItem.tributos?.pPIS || 1.65}%`,
      aliqCofins: `${origItem.tributos?.pCOFINS || 7.6}%`,
      cClassTrib,
      aliqIbsTransitorio: aliqIbsTeste,
      aliqCbsTransitorio: aliqCbsTeste,
      regimeEspecial: 'Regime Regular (Padrão)',
      instrucaoCadastro: instrucaoERP,
    };
  });

  itensAuditados.sort((a, b) => a.index - b.index);

  const hasInconsistente = itensAuditados.some((i) => i.statusItem === 'Inconsistente');
  const hasAtencao = itensAuditados.some((i) => i.statusItem === 'Atenção');
  const statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente' = hasInconsistente ? 'Inconsistente' : (hasAtencao ? 'Atenção' : 'Regular');

  return {
    motorUtilizado: `Gemini Cloud (${model})`,
    tempoExecucaoMs: Math.round(performance.now() - t0),
    statusGlobal,
    parecerTecnicoGeral: parsed.parecerTecnicoGeral || 'Auditoria pericial executada com sucesso com foco estrito em dados fiscais sensíveis de entrada via Google Gemini API.',
    parecerConformidadeCreditos: parsed.parecerConformidadeCreditos || 'Direitos creditórios avaliados de acordo com a legislação do Simples Nacional, Regime Regular e LC 214/2025.',
    totalItensAuditados: itensAuditados.length,
    itens: itensAuditados,
  };
}

/* =========================================================================
 * 5. DESPACHANTE MESTRE (ORCHESTRATOR M2 <-> M3)
 * ========================================================================= */

/**
 * Ponto de entrada universal para execução de auditoria particionada.
 * Roteia automaticamente entre Ollama Local (RX 580) e Google Gemini Cloud API.
 */
export async function executarAuditoriaParticionada(
  payload: AuditRequestPayload
): Promise<AuditedInvoiceResponse> {
  validarAuditPayload(payload);

  if (payload.motor === 'ollama') {
    return executarAuditoriaOllamaParticionada(payload);
  }

  if (payload.motor === 'gemini') {
    return executarAuditoriaGemini(payload);
  }

  throw new Error(`Motor de auditoria não suportado: '${payload.motor}'. Motores aceitos: 'ollama' ou 'gemini'.`);
}
