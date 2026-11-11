/**
 * Tipos e Utilitários Compartilhados de Extração de NF-e (Client e Server-Safe)
 * Sem dependências de módulos do Node (como node:fs ou bibliotecas nativas).
 */
import { mapearCfopEntrada, type DestinacaoMercadoria } from './marco-legal';

export class FiscalExtractionError extends Error {
  codigo: string;
  statusCode: number;

  constructor(message: string, codigo: string = 'ERRO_EXTRACAO', statusCode: number = 400) {
    super(message);
    this.name = 'FiscalExtractionError';
    this.codigo = codigo;
    this.statusCode = statusCode;
  }
}

export interface ExtractedTributosResumo {
  cstIcms?: string;
  csosn?: string;
  orig?: number;
  vBC?: number;
  pICMS?: number;
  vICMS?: number;
  vBCST?: number;
  pICMSST?: number;
  vICMSST?: number;
  pMVAST?: number;
  pRedBC?: number;
  pRedBCST?: number;
  vICMSDeson?: number;
  motDesICMS?: string;
  pCredSN?: number;
  vCredICMSSN?: number;

  cstIpi?: string;
  cEnq?: string;
  vBCIpi?: number;
  pIPI?: number;
  vIPI?: number;

  vII?: number;
  pII?: number;
  vBCII?: number;

  cstPis?: string;
  vBCPis?: number;
  pPIS?: number;
  vPIS?: number;

  cstCofins?: string;
  vBCCofins?: number;
  pCOFINS?: number;
  vCOFINS?: number;

  cClassTrib?: string;
  cstIbsCbs?: string;
  vBCIbsCbs?: number;
  pIBSUF?: number;
  pIBSMun?: number;
  pIBS?: number;
  vIBS?: number;
  pCBS?: number;
  vCBS?: number;
  pIS?: number;
  vIS?: number;
}

export interface ExtractedItem {
  index: number;
  cProd: string;
  cEAN?: string;
  xProd: string;
  ncm: string;
  ncmOriginal?: string;
  ncmValidoSiscomex: boolean;
  descricaoSiscomex?: string;
  descricaoOficialSiscomex?: string;
  cest?: string;
  cfop: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  vFrete?: number;
  vSeg?: number;
  vDesc?: number;
  vOutro?: number;
  modFrete?: '0' | '1' | '2' | '9';
  pesoBruto?: number;
  origemMercadoria?: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  crtEmitente?: '1' | '2' | '3' | '4';
  pRedBC?: number;
  vICMSDeson?: number;
  motDesICMS?: string;
  pMVAST?: number;
  pRedBCST?: number;
  cfopEntradaMapeado?: string;
  infAdProd?: string;
  aliquotaCreditoIcmsSimplesPct?: number;
  tributos: ExtractedTributosResumo;
  sensivelParaAuditoria: boolean;
  motivosSensibilidade?: string[];
}

export interface ExtractedInvoiceData {
  tipoDocumento: 'XML' | 'PDF';
  versaoSchema?: string;
  tempoExtracaoMs?: number;
  infCpl?: string;
  identificacao: {
    chaveAcesso?: string;
    numero?: string;
    serie?: string;
    dataEmissao?: string;
    naturezaOperacao?: string;
    modelo?: string;
    tipoOperacao?: '0' | '1';
    ufEmitente?: string;
  };
  emitente: {
    cnpj?: string;
    cpf?: string;
    nome?: string;
    nomeFantasia?: string;
    uf?: string;
    municipio?: string;
    crt?: '1' | '2' | '3' | '4';
    regimeDescricao?: string;
    ie?: string;
  };
  destinatario: {
    cnpj?: string;
    cpf?: string;
    nome?: string;
    uf?: string;
    municipio?: string;
    ie?: string;
  };
  transporte?: {
    modFrete?: '0' | '1' | '2' | '9';
    pesoBruto?: number;
    pesoLiquido?: number;
  };
  resumoFinanceiro: {
    vProdTotal: number;
    vNF: number;
    vICMSTotal?: number;
    vICMSSTTotal?: number;
    vIPITotal?: number;
    vPISTotal?: number;
    vCOFINSTotal?: number;
    vFreteTotal?: number;
    vSegTotal?: number;
    vDescTotal?: number;
    vOutroTotal?: number;
  };
  totalItens: number;
  totalItensSensiveis?: number;
  itens: ExtractedItem[];
}

export interface ExtractionOptions {
  regime?: string;
  finalidade?: string;
}

export interface MotivoSensibilidadeInfo {
  rotulo: string;
  descricao: string;
  severidade: 'critico' | 'atencao' | 'info';
}

export const MOTIVOS_SENSIBILIDADE_MAP: Record<string, MotivoSensibilidadeInfo> = {
  NCM_INVALIDO_SISCOMEX: {
    rotulo: 'NCM Inválido',
    descricao: 'Código NCM não consta nos 10.515 registros oficiais da tabela Siscomex vigente ou formatação inconsistente.',
    severidade: 'critico',
  },
  SUBSTITUICAO_TRIBUTARIA: {
    rotulo: 'Substituição Tributária (ST)',
    descricao: 'CST de ST (10/30/60/70/90), CSOSN (201/202/203/500/900), MVA destacada ou presença de código CEST.',
    severidade: 'atencao',
  },
  CFOP_INTERESTADUAL: {
    rotulo: 'CFOP Interestadual',
    descricao: 'Operação interestadual (iniciada em 6.xxx ou 2.xxx) sujeita a alíquotas interestaduais, cálculo de DIFAL e conversão para entrada.',
    severidade: 'atencao',
  },
  CREDITO_VEDADO_SIMPLES_NACIONAL: {
    rotulo: 'Crédito Vedado (Simples)',
    descricao: 'Fornecedor optante pelo Simples Nacional com CSOSN de vedação de crédito (102, 103, 300, 400, 500).',
    severidade: 'critico',
  },
  INCONSISTENCIA_SIMPLES_COM_CST_NORMAL: {
    rotulo: 'Simples com CST Normal',
    descricao: 'Fornecedor cadastrado no Simples Nacional destacando indevidamente CST de Regime Normal (00, 10, 20...).',
    severidade: 'critico',
  },
  REDUCAO_BASE_CALCULO: {
    rotulo: 'Redução de Base de Cálculo',
    descricao: 'Operação com benefício fiscal de redução de base de cálculo de ICMS (CST 20/70 ou pRedBC > 0).',
    severidade: 'atencao',
  },
  ISENCAO_OU_NAO_TRIBUTADO: {
    rotulo: 'Isenção / Não Tributado',
    descricao: 'Operação isenta ou não tributada (CST 40/41/50) — requer atenção quanto ao estorno de créditos.',
    severidade: 'info',
  },
  IPI_DESTACADO: {
    rotulo: 'IPI Destacado',
    descricao: 'IPI destacado no documento — verificar direito a crédito para revenda/industrialização ou vedação para consumo/Simples.',
    severidade: 'atencao',
  },
  PIS_COFINS_MONOFASICO_OU_ZERO: {
    rotulo: 'PIS/COFINS Monofásico / Alíquota Zero',
    descricao: 'CST de PIS/COFINS 04 a 09 — incidência monofásica, alíquota zero ou não incidência na revenda.',
    severidade: 'info',
  },
  DESCRICAO_INSUFICIENTE: {
    rotulo: 'Descrição Genérica',
    descricao: 'Descrição do produto excessivamente curta ou genérica (< 3 caracteres), impossibilitando correlação pericial com NCM.',
    severidade: 'critico',
  },
  ORIGEM_PDF_DANFE: {
    rotulo: 'Origem PDF DANFE',
    descricao: 'Dados extraídos de camada de texto de PDF DANFE. Recomenda-se conferência pericial contra o XML oficial.',
    severidade: 'info',
  },
  ORIGEM_PDF_DANFE_LAYOUT_REDUZIDO: {
    rotulo: 'PDF Layout Reduzido',
    descricao: 'Linha de item reconstituída a partir de layout reduzido no PDF.',
    severidade: 'atencao',
  },
};

export type MotorAuditoria = 'ollama' | 'gemini';

export interface ContextoAdquirente {
  regime: string;
  finalidade: string;
  ufDestino: string;
}

export interface DocumentoContexto {
  emitenteCnpj?: string;
  emitenteNome?: string;
  emitenteUf?: string;
  emitenteCrt?: string;
  chaveAcesso?: string;
  numeroNf?: string;
  serieNf?: string;
  dataEmissao?: string;
  naturezaOperacao?: string;
  tipoDocumento?: 'XML' | 'PDF';
}

export interface AuditRequestPayload {
  motor: MotorAuditoria;
  modelo?: string;
  contextoAdquirente: ContextoAdquirente;
  documentoContexto: DocumentoContexto;
  itensSelecionados: ExtractedItem[];
}

export function montarAuditRequestPayload(params: {
  motor: MotorAuditoria;
  modelo?: string;
  regime: string;
  finalidade?: string;
  ufDestino?: string;
  extracao: ExtractedInvoiceData;
  selectedIndices: Set<number> | number[];
}): AuditRequestPayload {
  const { motor, modelo, regime, finalidade, ufDestino, extracao, selectedIndices } = params;

  if (motor !== 'ollama' && motor !== 'gemini') {
    throw new Error(`Motor de auditoria inválido: '${motor}'. Motores suportados: 'ollama' ou 'gemini'.`);
  }

  if (!regime || !regime.trim()) {
    throw new Error('O regime tributário do adquirente é obrigatório para a auditoria de créditos.');
  }

  const selectedSet = selectedIndices instanceof Set ? selectedIndices : new Set(selectedIndices || []);
  const itensSelecionados = (extracao.itens || []).filter((item) => selectedSet.has(item.index));

  if (itensSelecionados.length === 0) {
    throw new Error('A lista de itens selecionados para auditoria não pode estar vazia (itensSelecionados.length === 0).');
  }

  const ufFinal = ufDestino || extracao.destinatario?.uf || 'SP';

  return {
    motor,
    modelo: motor === 'ollama' ? (modelo || 'qwen2.5:7b') : 'gemini-3.8-flash',
    contextoAdquirente: {
      regime: regime.trim(),
      finalidade: (finalidade || 'Revenda/Comercialização').trim(),
      ufDestino: ufFinal.trim().toUpperCase(),
    },
    documentoContexto: {
      emitenteCnpj: extracao.emitente?.cnpj,
      emitenteNome: extracao.emitente?.nome,
      emitenteUf: extracao.emitente?.uf,
      emitenteCrt: extracao.emitente?.crt,
      chaveAcesso: extracao.identificacao?.chaveAcesso,
      numeroNf: extracao.identificacao?.numero,
      serieNf: extracao.identificacao?.serie,
      dataEmissao: extracao.identificacao?.dataEmissao,
      naturezaOperacao: extracao.identificacao?.naturezaOperacao,
      tipoDocumento: extracao.tipoDocumento,
    },
    itensSelecionados,
  };
}

/* =========================================================================
 * CONVERSÃO PARA O MOTOR DE PRECIFICAÇÃO (ETAPA 3)
 * ========================================================================= */

export interface PrecificacaoItemInput {
  index?: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string;
  cfop: string;
  cfopEntradaMapeado?: string;
  destinacao?: DestinacaoMercadoria;
  tipoEstabelecimento?: 'comercio' | 'industria';
  cClassTrib?: string;
  cstIbsCbs?: string;
  cstIcms?: string;
  csosn?: string;
  origemMercadoria?: string;
  crtEmitente?: '1' | '2' | '3' | '4';
  modFrete?: '0' | '1' | '2' | '9';
  pesoBruto?: number;
  pRedBC?: number;
  pRedBCST?: number;
  vICMSDeson?: number;
  motDesICMS?: string;
  pMVAST?: number;
  infAdProd?: string;
  aliquotaCreditoIcmsSimplesPct?: number;
  temSt?: boolean;
  pisCofinsMonofasico?: boolean;
  baseReduzidaSaidaPct?: number;
  ufOrigem?: string;
  ufDestino?: string;
  quantidade: number;
  valorBrutoEntrada: number;
  freteSeguroOutrasEntrada: number;
  descontoIncondicionalEntrada: number;
  ipiEntrada: number;
  icmsStEntrada: number;
  iiEntrada: number;
  isEntrada: number;
  credIcmsEntrada: number;
  credPisCofinsEntrada: number;
  credCbsEntrada: number;
  credIbsEntrada: number;
  detalhesTributos?: {
    pICMS?: number;
    vICMS?: number;
    pICMSST?: number;
    vICMSST?: number;
    pIPI?: number;
    vIPI?: number;
    vII?: number;
    pPIS?: number;
    vPIS?: number;
    pCOFINS?: number;
    vCOFINS?: number;
    pIBSUF?: number;
    pIBSMun?: number;
    pIBS?: number;
    vIBS?: number;
    pCBS?: number;
    vCBS?: number;
    vBCIbsCbs?: number;
    pIS?: number;
    vIS?: number;
  };
}

/**
 * Converte um item extraído da NF-e para a estrutura canônica de precificação.
 * Garante retenção de 100% dos dados sensíveis sem truncamento.
 */
export function converterItemExtracaoParaPrecificacao(
  item: ExtractedItem,
  opts?: {
    credIcmsEstimado?: number;
    destinacao?: DestinacaoMercadoria;
    ufOrigem?: string;
    ufDestino?: string;
    modFrete?: '0' | '1' | '2' | '9';
    crtEmitente?: '1' | '2' | '3' | '4';
    tipoEstabelecimento?: 'comercio' | 'industria';
  }
): PrecificacaoItemInput {
  const t = item.tributos || {};
  const vFrete = item.vFrete ?? 0;
  const vSeg = item.vSeg ?? 0;
  const vOutro = item.vOutro ?? 0;
  const freteOutros = Number((vFrete + vSeg + vOutro).toFixed(2));
  const vDesc = item.vDesc ?? 0;

  const ipi = t.vIPI ?? 0;
  const icmsSt = t.vICMSST ?? 0;
  const ii = t.vII ?? 0;
  const isVal = t.vIS ?? 0;
  const credIcms = t.vICMS ?? t.vCredICMSSN ?? opts?.credIcmsEstimado ?? 0;
  const credPis = t.vPIS ?? 0;
  const credCofins = t.vCOFINS ?? 0;
  const credPisCofins = Number((credPis + credCofins).toFixed(2));
  const credCbs = t.vCBS ?? 0;
  const credIbs = t.vIBS ?? 0;

  const destinacao = opts?.destinacao || 'comercializacao';
  const ufOrigem = opts?.ufOrigem || 'PR';
  const ufDestino = opts?.ufDestino || 'PR';
  const cfopEntradaInfo = mapearCfopEntrada(item.cfop, destinacao, ufOrigem, ufDestino);

  return {
    index: item.index,
    codigo: item.cProd || `ITEM-${item.index}`,
    descricao: item.xProd,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    cfopEntradaMapeado: item.cfopEntradaMapeado || cfopEntradaInfo.cfopEntrada,
    destinacao,
    tipoEstabelecimento: opts?.tipoEstabelecimento || 'comercio',
    cClassTrib: t.cClassTrib,
    cstIbsCbs: t.cstIbsCbs,
    cstIcms: t.cstIcms,
    csosn: t.csosn,
    origemMercadoria: item.origemMercadoria ?? (t.orig !== undefined ? String(t.orig) : undefined),
    crtEmitente: item.crtEmitente ?? opts?.crtEmitente,
    modFrete: item.modFrete ?? opts?.modFrete,
    pesoBruto: item.pesoBruto,
    pRedBC: item.pRedBC ?? t.pRedBC,
    pRedBCST: item.pRedBCST ?? t.pRedBCST,
    vICMSDeson: item.vICMSDeson ?? t.vICMSDeson,
    motDesICMS: item.motDesICMS ?? t.motDesICMS,
    pMVAST: item.pMVAST ?? t.pMVAST,
    infAdProd: item.infAdProd,
    aliquotaCreditoIcmsSimplesPct: item.aliquotaCreditoIcmsSimplesPct,
    temSt:
      cfopEntradaInfo.temSt ||
      icmsSt > 0 ||
      ['10', '30', '60', '70'].includes(t.cstIcms || '') ||
      ['201', '202', '203', '500'].includes(t.csosn || ''),
    quantidade: item.qCom > 0 ? item.qCom : 1,
    valorBrutoEntrada: item.vProd,
    freteSeguroOutrasEntrada: freteOutros,
    descontoIncondicionalEntrada: vDesc,
    ipiEntrada: ipi,
    icmsStEntrada: icmsSt,
    iiEntrada: ii,
    isEntrada: isVal,
    credIcmsEntrada: credIcms,
    credPisCofinsEntrada: credPisCofins,
    credCbsEntrada: credCbs,
    credIbsEntrada: credIbs,
    detalhesTributos: {
      pICMS: t.pICMS,
      vICMS: t.vICMS,
      pICMSST: t.pICMSST,
      vICMSST: t.vICMSST,
      pIPI: t.pIPI,
      vIPI: t.vIPI,
      vII: t.vII,
      pPIS: t.pPIS,
      vPIS: t.vPIS,
      pCOFINS: t.pCOFINS,
      vCOFINS: t.vCOFINS,
      pIBSUF: t.pIBSUF,
      pIBSMun: t.pIBSMun,
      pIBS: t.pIBS,
      vIBS: t.vIBS,
      pCBS: t.pCBS,
      vCBS: t.vCBS,
      vBCIbsCbs: t.vBCIbsCbs,
      pIS: t.pIS,
      vIS: t.vIS,
    },
  };
}

export interface ParametrizacaoItemInput {
  codigoProduto: string;
  descricao: string;
  ncm: string;
  cest?: string;
  cfopOrigem: string;
  cfopEntradaSugerido: string;
  cfopSaidaSugerido: string;
  cstIcmsOrigem?: string;
  csosnOrigem?: string;
  cClassTribSugerido?: string;
  cstIbsCbsSugerido?: string;
  reducaoIbsCbsPct: number;
  beneficioIcmsPr?: string;
  pRedBC?: number;
  percentualDiferimento?: number;
  fcpPct: number;
  valorUnitario: number;
  quantidade: number;
}

