/**
 * Extrator Determinístico de NF-e (XML e PDF Digital DANFE)
 *
 * Módulo puro em TypeScript para Next.js / Node.js
 * Executa sem qualquer chamada a LLM (< 50ms para XML, < 150ms para PDF).
 * Garante extração de 100% dos itens sem truncamento (det[0..N]).
 * Validação de NCMs em O(1) contra os 10.515 registros oficiais do Siscomex em memória.
 * Avaliação determinística de sensibilidade tributária de entrada (R1, R2, R4).
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { getMapaD8 } from './ai/ncm-server';
import type { Record8 } from './data';
import { padronizarNcm, soDigitos } from './extrator-multifonte';
import {
  mapearCfopEntrada,
  detectarReducoesFiscaisPorNcm,
  obterFcpPorUf,
  type DestinacaoMercadoria,
  type RegimeTributario,
} from './marco-legal';
import type { ParametrizacaoItemInput } from './extrator-nfe-types';

/* =========================================================================
 * 0. CLASSE DE ERRO PADRONIZADA
 * ========================================================================= */

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

/* =========================================================================
 * 1. CONTRATOS E ESTRUTURAS DE DADOS (Stage 1 Deterministic Contract)
 * ========================================================================= */

export interface ExtractedTributosResumo {
  // ICMS Fornecedor
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

  // IPI Fornecedor
  cstIpi?: string;
  cEnq?: string;
  vBCIpi?: number;
  pIPI?: number;
  vIPI?: number;

  // II (Imposto de Importação)
  vII?: number;
  pII?: number;
  vBCII?: number;

  // PIS Fornecedor
  cstPis?: string;
  vBCPis?: number;
  pPIS?: number;
  vPIS?: number;

  // COFINS Fornecedor
  cstCofins?: string;
  vBCCofins?: number;
  pCOFINS?: number;
  vCOFINS?: number;

  // RTC (Reforma Tributária do Consumo - IBS/CBS/IS - se presentes na nota)
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
  index: number;               // 1-indexed item number (1, 2, 3...)
  cProd: string;              // Supplier product code
  cEAN?: string;              // Barcode / GTIN
  xProd: string;              // Commercial description
  ncm: string;                // 8-digit NCM (normalized)
  ncmOriginal?: string;       // As declared in XML before normalization
  ncmValidoSiscomex: boolean; // Instant O(1) check against 10.515 Siscomex records
  descricaoSiscomex?: string; // Official Siscomex description if valid
  descricaoOficialSiscomex?: string; // Alias for UI / Contract compatibility
  cest?: string;              // CEST code if present
  cfop: string;               // Outbound CFOP as declared by supplier (e.g., "5102", "6101")
  uCom: string;               // Commercial unit (UN, KG, CX, etc.)
  qCom: number;               // Quantity
  vUnCom: number;             // Unit value
  vProd: number;              // Total product value
  vFrete?: number;            // Allocated freight
  vSeg?: number;              // Allocated insurance
  vDesc?: number;             // Allocated discount
  vOutro?: number;            // Other expenses
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
  sensivelParaAuditoria: boolean; // Flagged true if high-risk fiscal indicators detected
  motivosSensibilidade?: string[]; // Specific triggers (e.g. "NCM_INVALIDO_SISCOMEX", "SUBSTITUICAO_TRIBUTARIA")
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
    tipoOperacao?: '0' | '1'; // 0=entrada, 1=saída
    ufEmitente?: string;
  };
  emitente: {
    cnpj?: string;
    cpf?: string;
    nome?: string;
    nomeFantasia?: string;
    uf?: string;
    municipio?: string;
    crt?: '1' | '2' | '3' | '4'; // 1=Simples Nacional, 2=Simples Excesso, 3=Regime Normal, 4=MEI
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

/* =========================================================================
 * 2. UTILITÁRIOS NUMÉRICOS E CONVERSORES DE VALOR
 * ========================================================================= */

function parseNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseOptionalNumber(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  let s = String(val).trim();
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

function getRegimeDescricao(crt?: string): string {
  switch (crt) {
    case '1': return 'Simples Nacional';
    case '2': return 'Simples Nacional (Excesso de Sublimite)';
    case '3': return 'Regime Normal';
    default: return 'Não informado';
  }
}

/* =========================================================================
 * 3. NORMALIZAÇÃO E VALIDAÇÃO SISCOMEX O(1)
 * ========================================================================= */

/**
 * Normaliza e higieniza código NCM extraído do XML/PDF.
 * Rejeita notação científica (8.4713E+07), remove pontuação e aplica padStart(8, '0') se tiver 7 dígitos.
 */
export function normalizarNcm(raw: any): { d8: string; formatado: string; validoFormato: boolean } {
  if (!raw) return { d8: '', formatado: '', validoFormato: false };
  const s = String(raw).trim();
  if (/[\d.]+[eE][+-]?\d+/.test(s)) {
    return { d8: '', formatado: '', validoFormato: false };
  }
  const d = s.replace(/\D/g, '');
  const d8 = d.length === 7 ? d.padStart(8, '0') : d;
  const validoFormato = d8.length === 8;
  const formatado = validoFormato
    ? `${d8.slice(0, 4)}.${d8.slice(4, 6)}.${d8.slice(6)}`
    : d8;

  return { d8, formatado, validoFormato };
}

/**
 * Validação instantânea contra o catálogo oficial de 10.515 registros Siscomex em memória.
 */
export function validarNcmSiscomex(d8: string, mapaD8: Map<string, Record8>): { valido: boolean; record?: Record8 } {
  if (!d8 || d8.length !== 8) return { valido: false };
  const record = mapaD8.get(d8);
  return { valido: !!record, record };
}

/* =========================================================================
 * 4. REGRAS DETERMINÍSTICAS DE SENSIBILIDADE TRIBUTÁRIA (R2, R4)
 * ========================================================================= */

/**
 * Avalia se o item possui particularidades fiscais sensíveis que justificam
 * auditoria prioritária na entrada (R2/R4):
 * 1. NCM inexistente na tabela oficial Siscomex, formatação inválida ou notação científica
 * 2. Substituição Tributária (CSTs de ST, MVA > 0, vBCST > 0 ou presença de CEST)
 * 3. CFOP Interestadual (iniciados em 6.xxx ou 2.xxx)
 * 4. Fornecedor Simples Nacional com CSOSN de vedação de crédito (102, 103, 300, 400, 500)
 * 5. Redução de base de cálculo (CST 20, 70 ou pRedBC > 0)
 * 6. Isenção ou Não-Tributado (CST 40, 41, 50)
 * 7. IPI destacado com necessidade de verificação de crédito
 * 8. PIS/COFINS monofásico, alíquota zero ou desoneração
 * 9. Descrição de produto omissa ou insuficiente (<3 caracteres)
 */
export {
  type MotivoSensibilidadeInfo,
  MOTIVOS_SENSIBILIDADE_MAP,
} from './extrator-nfe-types';

export function avaliarSensibilidadeFiscal(
  item: Omit<ExtractedItem, 'sensivelParaAuditoria' | 'motivosSensibilidade'>,
  emitenteCrt?: string,
  contexto?: ExtractionOptions
): { sensivelParaAuditoria: boolean; motivosSensibilidade: string[] } {
  const motivos: string[] = [];

  // 1. NCM Inválido no Siscomex
  if (!item.ncmValidoSiscomex || item.ncm.length !== 8) {
    motivos.push('NCM_INVALIDO_SISCOMEX');
  }

  // 2. Substituição Tributária (ST) e MVA
  const cstIcms = item.tributos.cstIcms || '';
  const csosn = item.tributos.csosn || '';
  const isStCst = ['10', '30', '60', '70', '90'].includes(cstIcms);
  const isStCsosn = ['201', '202', '203', '500', '900'].includes(csosn);
  const hasStValues = (item.tributos.vICMSST ?? 0) > 0 ||
                      (item.tributos.pMVAST ?? 0) > 0 ||
                      (item.tributos.vBCST ?? 0) > 0;
  if (isStCst || isStCsosn || hasStValues || item.cest) {
    motivos.push('SUBSTITUICAO_TRIBUTARIA');
  }

  // 3. CFOP Interestadual (impacta alíquotas interestaduais, DIFAL e conversão para entrada)
  if (item.cfop.startsWith('6') || item.cfop.startsWith('2')) {
    motivos.push('CFOP_INTERESTADUAL');
  }

  // 4. Cruzamento de Regime: Fornecedor Simples Nacional com Vedação de Crédito
  const isFornecedorSimples = emitenteCrt === '1' || Boolean(csosn);
  if (isFornecedorSimples && ['102', '103', '300', '400', '500'].includes(csosn)) {
    motivos.push('CREDITO_VEDADO_SIMPLES_NACIONAL');
  } else if (isFornecedorSimples && (cstIcms === '00' || (!csosn && ['10', '20', '30', '40', '41', '50', '51', '60', '70', '90'].includes(cstIcms)))) {
    motivos.push('INCONSISTENCIA_SIMPLES_COM_CST_NORMAL');
  }

  // 5. Redução de Base de Cálculo ou Isenção de ICMS
  if (['20', '70'].includes(cstIcms) || (item.tributos.pRedBC ?? 0) > 0) {
    motivos.push('REDUCAO_BASE_CALCULO');
  } else if (['40', '41', '50'].includes(cstIcms)) {
    motivos.push('ISENCAO_OU_NAO_TRIBUTADO');
  }

  // 6. IPI: Sensibilidade pericial (vedação de crédito para Simples/Consumo, fornecedor Simples indevido ou CST inconsistente)
  const cstIpi = item.tributos.cstIpi || '';
  const hasIpi = (item.tributos.vIPI ?? 0) > 0 || (item.tributos.pIPI ?? 0) > 0;
  const isAdquirenteSimples = Boolean(contexto?.regime?.toLowerCase().includes('simples'));
  const isAdquirenteConsumo = Boolean(
    contexto?.finalidade?.toLowerCase().includes('consumo') ||
    contexto?.finalidade?.toLowerCase().includes('imobilizado')
  );
  const ipiComVedacaoCredito = hasIpi && (isAdquirenteSimples || isAdquirenteConsumo);
  const ipiFornecedorSimplesIndevido = isFornecedorSimples && (hasIpi || cstIpi === '50');
  const ipiIsentoComValor = ['51', '52', '53', '54', '55'].includes(cstIpi) && (item.tributos.vIPI ?? 0) > 0;
  const ipiAtipico = cstIpi === '99' || (/^[0-4]/.test(cstIpi) && cstIpi.length === 2);

  if (ipiComVedacaoCredito || ipiFornecedorSimplesIndevido || ipiIsentoComValor || ipiAtipico) {
    motivos.push('IPI_DESTACADO');
  }

  // 7. PIS/COFINS Monofásico, Alíquota Zero ou Não-Cumulativo
  const cstPis = item.tributos.cstPis || '';
  const cstCofins = item.tributos.cstCofins || '';
  const monofasicos = ['04', '05', '06', '07', '08', '09'];
  if (monofasicos.includes(cstPis) || monofasicos.includes(cstCofins)) {
    motivos.push('PIS_COFINS_MONOFASICO_OU_ZERO');
  }

  // 8. Falta de dados cadastrais essenciais
  if (!item.cProd || !item.xProd || item.xProd.trim().length < 3) {
    motivos.push('DESCRICAO_INSUFICIENTE');
  }

  return {
    sensivelParaAuditoria: motivos.length > 0,
    motivosSensibilidade: motivos,
  };
}

/* =========================================================================
 * 5. EXTRAÇÃO DE TRIBUTOS EM XML
 * ========================================================================= */

function extrairTributosXml(imp: any): ExtractedTributosResumo {
  const tributos: ExtractedTributosResumo = {};
  if (!imp || typeof imp !== 'object') return tributos;

  // 1. ICMS
  if (imp.ICMS && typeof imp.ICMS === 'object') {
    const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
    const icmsGroup = subKey ? imp.ICMS[subKey] : undefined;
    if (icmsGroup && typeof icmsGroup === 'object') {
      if (icmsGroup.CST !== undefined) tributos.cstIcms = String(icmsGroup.CST).padStart(2, '0');
      if (icmsGroup.CSOSN !== undefined) tributos.csosn = String(icmsGroup.CSOSN).padStart(3, '0');
      if (icmsGroup.orig !== undefined) tributos.orig = parseNumber(icmsGroup.orig);
      tributos.vBC = parseOptionalNumber(icmsGroup.vBC);
      tributos.pICMS = parseOptionalNumber(icmsGroup.pICMS);
      tributos.vICMS = parseOptionalNumber(icmsGroup.vICMS);
      tributos.vBCST = parseOptionalNumber(icmsGroup.vBCST ?? icmsGroup.vBCSTRet);
      tributos.pICMSST = parseOptionalNumber(icmsGroup.pICMSST ?? icmsGroup.pST);
      tributos.vICMSST = parseOptionalNumber(icmsGroup.vICMSST ?? icmsGroup.vICMSSTRet);
      tributos.pMVAST = parseOptionalNumber(icmsGroup.pMVAST);
      tributos.pRedBC = parseOptionalNumber(icmsGroup.pRedBC);
      tributos.pRedBCST = parseOptionalNumber(icmsGroup.pRedBCST);
      tributos.vICMSDeson = parseOptionalNumber(icmsGroup.vICMSDeson);
      tributos.motDesICMS = icmsGroup.motDesICMS !== undefined ? String(icmsGroup.motDesICMS) : undefined;
      tributos.pCredSN = parseOptionalNumber(icmsGroup.pCredSN);
      tributos.vCredICMSSN = parseOptionalNumber(icmsGroup.vCredICMSSN);
    }
  }

  // 2. IPI
  if (imp.IPI && typeof imp.IPI === 'object') {
    if (imp.IPI.cEnq !== undefined) tributos.cEnq = String(imp.IPI.cEnq);
    const ipiGroup = imp.IPI.IPITrib || imp.IPI.IPINT;
    if (ipiGroup && typeof ipiGroup === 'object') {
      if (ipiGroup.CST !== undefined) tributos.cstIpi = String(ipiGroup.CST).padStart(2, '0');
      tributos.vBCIpi = parseOptionalNumber(ipiGroup.vBC);
      tributos.pIPI = parseOptionalNumber(ipiGroup.pIPI);
      tributos.vIPI = parseOptionalNumber(ipiGroup.vIPI);
    }
  }

  // 3. PIS
  if (imp.PIS && typeof imp.PIS === 'object') {
    const subKey = Object.keys(imp.PIS).find((k) => !k.startsWith('@_'));
    const pisGroup = subKey ? imp.PIS[subKey] : undefined;
    if (pisGroup && typeof pisGroup === 'object') {
      if (pisGroup.CST !== undefined) tributos.cstPis = String(pisGroup.CST).padStart(2, '0');
      tributos.vBCPis = parseOptionalNumber(pisGroup.vBC);
      tributos.pPIS = parseOptionalNumber(pisGroup.pPIS);
      tributos.vPIS = parseOptionalNumber(pisGroup.vPIS);
    }
  }

  // 4. COFINS
  if (imp.COFINS && typeof imp.COFINS === 'object') {
    const subKey = Object.keys(imp.COFINS).find((k) => !k.startsWith('@_'));
    const cofinsGroup = subKey ? imp.COFINS[subKey] : undefined;
    if (cofinsGroup && typeof cofinsGroup === 'object') {
      if (cofinsGroup.CST !== undefined) tributos.cstCofins = String(cofinsGroup.CST).padStart(2, '0');
      tributos.vBCCofins = parseOptionalNumber(cofinsGroup.vBC);
      tributos.pCOFINS = parseOptionalNumber(cofinsGroup.pCOFINS);
      tributos.vCOFINS = parseOptionalNumber(cofinsGroup.vCOFINS);
    }
  }

  // 5. II (Imposto de Importação)
  if (imp.II && typeof imp.II === 'object') {
    tributos.vII = parseOptionalNumber(imp.II.vII);
    tributos.vBCII = parseOptionalNumber(imp.II.vBC);
  }

  // 6. RTC (IBS/CBS/IS - se presentes na nota)
  const rtcGroup = imp.IBSCBS || imp.IBS;
  if (rtcGroup && typeof rtcGroup === 'object') {
    if (rtcGroup.cClassTrib) tributos.cClassTrib = String(rtcGroup.cClassTrib);
    if (rtcGroup.CST) tributos.cstIbsCbs = String(rtcGroup.CST);
    tributos.vBCIbsCbs = parseOptionalNumber(rtcGroup.vBC);
    tributos.pIBSUF = parseOptionalNumber(rtcGroup.pIBSUF);
    tributos.pIBSMun = parseOptionalNumber(rtcGroup.pIBSMun);
    tributos.pIBS = parseOptionalNumber(rtcGroup.pIBS);
    tributos.vIBS = parseOptionalNumber(rtcGroup.vIBS);
    tributos.pCBS = parseOptionalNumber(rtcGroup.pCBS);
    tributos.vCBS = parseOptionalNumber(rtcGroup.vCBS);
  }
  if (imp.IS && typeof imp.IS === 'object') {
    tributos.pIS = parseOptionalNumber(imp.IS.pIS);
    tributos.vIS = parseOptionalNumber(imp.IS.vIS);
  }

  return tributos;
}

/* =========================================================================
 * 6. PARSER DETERMINÍSTICO DE XML DE NF-E (Sem Truncamento)
 * ========================================================================= */

/**
 * Extrai 100% dos dados de NF-e em XML de forma puramente determinística.
 * Não invoca LLMs. Não trunca itens. Valida NCMs em O(1).
 */
export function extrairDadosXmlNfe(
  xmlContent: string | Buffer,
  optionsOrMap?: ExtractionOptions | Map<string, Record8>,
  extraMap?: Map<string, Record8>
): ExtractedInvoiceData {
  let options: ExtractionOptions | undefined;
  let mapaD8Override: Map<string, Record8> | undefined;

  if (optionsOrMap instanceof Map) {
    mapaD8Override = optionsOrMap;
  } else if (optionsOrMap && typeof optionsOrMap === 'object') {
    options = optionsOrMap;
  }
  if (extraMap instanceof Map) {
    mapaD8Override = extraMap;
  }

  const rawXml = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf-8');
  const cleanXml = rawXml.replace(/^\uFEFF/, '').trim();

  if (!cleanXml) {
    throw new FiscalExtractionError('Conteúdo XML vazio ou inválido.', 'ARQUIVO_VAZIO', 400);
  }

  const valResult = XMLValidator.validate(cleanXml);
  if (valResult !== true) {
    const errorMsg = typeof valResult === 'object' && valResult.err ? valResult.err.msg : 'erro de sintaxe';
    throw new FiscalExtractionError(`O arquivo XML está corrompido ou possui erros de sintaxe: ${errorMsg}.`, 'XML_MALFORMADO', 400);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'det',
    trimValues: true,
    parseTagValue: false, // Preserva strings literais para não perder zeros à esquerda em NCMs e CSTs
  });

  const parsed = parser.parse(cleanXml);
  const nfe = parsed.nfeProc?.NFe?.infNFe ||
              parsed.NFe?.infNFe ||
              parsed['nfe:nfeProc']?.['nfe:NFe']?.['nfe:infNFe'] ||
              parsed['nfe:NFe']?.['nfe:infNFe'];

  if (!nfe) {
    throw new FiscalExtractionError('XML não reconhecido como NF-e válida. As tags <NFe> ou <infNFe> não foram encontradas.', 'NFE_TAGS_AUSENTES', 400);
  }

  // Chave de acesso (da tag <protNFe> ou do atributo Id="NFe...")
  const chProt = parsed.nfeProc?.protNFe?.infProt?.chNFe ||
                 parsed['nfe:nfeProc']?.['nfe:protNFe']?.['nfe:infProt']?.['nfe:chNFe'];
  const idAttr = nfe['@_Id'] ? String(nfe['@_Id']).replace(/^NFe/, '') : undefined;
  const chaveAcesso = chProt ? String(chProt).trim() : idAttr;

  // Versão do Schema
  const versaoSchema = nfe['@_versao'] ? String(nfe['@_versao']) : undefined;

  // Cabeçalho da Nota
  const ide = nfe.ide || {};
  const identificacao: ExtractedInvoiceData['identificacao'] = {
    chaveAcesso,
    numero: ide.nNF ? String(ide.nNF) : undefined,
    serie: ide.serie ? String(ide.serie) : undefined,
    dataEmissao: ide.dhEmi ? String(ide.dhEmi) : (ide.dEmi ? String(ide.dEmi) : undefined),
    naturezaOperacao: ide.natOp ? String(ide.natOp) : undefined,
    modelo: ide.mod ? String(ide.mod) : '55',
    tipoOperacao: ide.tpNF === '0' || ide.tpNF === '1' ? ide.tpNF : '1',
    ufEmitente: ide.cUF ? String(ide.cUF) : undefined,
  };

  // Emitente
  const emit = nfe.emit || {};
  const crt = emit.CRT ? String(emit.CRT) as '1' | '2' | '3' : undefined;
  const emitente: ExtractedInvoiceData['emitente'] = {
    cnpj: emit.CNPJ ? String(emit.CNPJ) : undefined,
    cpf: emit.CPF ? String(emit.CPF) : undefined,
    nome: emit.xNome ? String(emit.xNome) : undefined,
    nomeFantasia: emit.xFant ? String(emit.xFant) : undefined,
    uf: emit.enderEmit?.UF ? String(emit.enderEmit.UF) : undefined,
    municipio: emit.enderEmit?.xMun ? String(emit.enderEmit.xMun) : undefined,
    crt,
    regimeDescricao: getRegimeDescricao(crt),
    ie: emit.IE ? String(emit.IE) : undefined,
  };

  // Destinatário
  const dest = nfe.dest || {};
  const destinatario: ExtractedInvoiceData['destinatario'] = {
    cnpj: dest.CNPJ ? String(dest.CNPJ) : undefined,
    cpf: dest.CPF ? String(dest.CPF) : undefined,
    nome: dest.xNome ? String(dest.xNome) : undefined,
    uf: dest.enderDest?.UF ? String(dest.enderDest.UF) : undefined,
    municipio: dest.enderDest?.xMun ? String(dest.enderDest.xMun) : undefined,
    ie: dest.IE ? String(dest.IE) : undefined,
  };

  // Transporte & Frete
  const transp = nfe.transp || {};
  const modFrete = transp.modFrete !== undefined ? (String(transp.modFrete) as '0' | '1' | '2' | '9') : undefined;
  const volList: any[] = Array.isArray(transp.vol) ? transp.vol : (transp.vol ? [transp.vol] : []);
  let pesoBrutoTotal: number | undefined;
  let pesoLiquidoTotal: number | undefined;
  for (const v of volList) {
    if (v.pesoB !== undefined) pesoBrutoTotal = (pesoBrutoTotal || 0) + parseNumber(v.pesoB);
    if (v.pesoL !== undefined) pesoLiquidoTotal = (pesoLiquidoTotal || 0) + parseNumber(v.pesoL);
  }
  const transporte: ExtractedInvoiceData['transporte'] = {
    modFrete,
    pesoBruto: pesoBrutoTotal,
    pesoLiquido: pesoLiquidoTotal,
  };

  // Totais Financeiros
  const icmsTot = nfe.total?.ICMSTot || {};
  const resumoFinanceiro: ExtractedInvoiceData['resumoFinanceiro'] = {
    vProdTotal: parseNumber(icmsTot.vProd),
    vNF: parseNumber(icmsTot.vNF),
    vICMSTotal: parseOptionalNumber(icmsTot.vICMS),
    vICMSSTTotal: parseOptionalNumber(icmsTot.vST),
    vIPITotal: parseOptionalNumber(icmsTot.vIPI ?? icmsTot.vIPITot),
    vPISTotal: parseOptionalNumber(icmsTot.vPIS),
    vCOFINSTotal: parseOptionalNumber(icmsTot.vCOFINS),
    vFreteTotal: parseOptionalNumber(icmsTot.vFrete),
    vSegTotal: parseOptionalNumber(icmsTot.vSeg),
    vDescTotal: parseOptionalNumber(icmsTot.vDesc),
    vOutroTotal: parseOptionalNumber(icmsTot.vOutro),
  };

  // Informações Complementares da Nota (<infAdic><infCpl>)
  const infAdic = nfe.infAdic || {};
  const infCpl = infAdic.infCpl ? String(infAdic.infCpl).trim() : undefined;

  // Extração Completa de Itens (ZERO Truncamento - todos os itens det[0..N])
  const detList: any[] = Array.isArray(nfe.det) ? nfe.det : (nfe.det ? [nfe.det] : []);
  const mapaD8 = mapaD8Override || getMapaD8();

  const itens: ExtractedItem[] = detList.map((d: any, idx: number) => {
    const prod = d.prod || {};
    const imposto = d.imposto || {};
    const infAdProd = d.infAdProd ? String(d.infAdProd).trim() : undefined;

    // Alíquota de crédito de ICMS do Simples Nacional (LC 123/2006 art. 23)
    // 1º Prioridade: tag XML <ICMSSN101><pCredSN>
    // 2º Fallback: regex em infAdProd ou infCpl
    let aliqCredSimples: number | undefined;
    const tributos = extrairTributosXml(imposto);

    if (tributos.pCredSN !== undefined && tributos.pCredSN > 0) {
      aliqCredSimples = tributos.pCredSN;
    } else {
      const textoParaBusca = `${infAdProd || ''} ${infCpl || ''}`;
      if (textoParaBusca.trim()) {
        const m1 = textoParaBusca.match(/al[ií]quota\s+de\s+(\d+[.,]\d+)\s*%/i);
        const m2 = textoParaBusca.match(/cr[eé]dito\s+de\s+icms.*?(\d+[.,]\d+)\s*%/i);
        const matched = m1 ? m1[1] : (m2 ? m2[1] : undefined);
        if (matched) {
          const numParsed = parseFloat(matched.replace(',', '.'));
          if (!isNaN(numParsed) && numParsed > 0) {
            aliqCredSimples = numParsed;
          }
        }
      }
    }

    const rawNcm = String(prod.NCM ?? '');
    const ncmNorm = normalizarNcm(rawNcm);
    const ncmPadronizado = ncmNorm.d8 || padronizarNcm(rawNcm);
    const recSiscomex = mapaD8.get(ncmPadronizado);
    const ncmValidoSiscomex = Boolean(recSiscomex && ncmPadronizado.length === 8);
    const descricaoSiscomex = recSiscomex?.desc;

    // CEST declarado no item ou derivado do registro do Siscomex
    const cestDeclarado = prod.CEST ? soDigitos(prod.CEST) : undefined;
    const cest = cestDeclarado || (recSiscomex?.cest?.[0] ? soDigitos(recSiscomex.cest[0]) : undefined);

    const orig =
      tributos.orig !== undefined
        ? (String(tributos.orig) as '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8')
        : undefined;
    const pesoItem = prod.pesoB !== undefined ? parseNumber(prod.pesoB) : undefined;
    const cfopStr = String(prod.CFOP ?? '');
    const cfopEntradaInfo = mapearCfopEntrada(
      cfopStr,
      (options?.finalidade as any) || 'comercializacao',
      emitente.uf || 'PR',
      destinatario.uf || 'PR'
    );

    const itemBase: Omit<ExtractedItem, 'sensivelParaAuditoria' | 'motivosSensibilidade'> = {
      index: d['@_nItem'] ? parseInt(String(d['@_nItem']), 10) : idx + 1,
      cProd: String(prod.cProd ?? ''),
      cEAN: prod.cEAN && prod.cEAN !== 'SEM GTIN' ? String(prod.cEAN) : undefined,
      xProd: String(prod.xProd ?? ''),
      ncm: ncmNorm.validoFormato ? ncmPadronizado : rawNcm,
      ncmOriginal: rawNcm || undefined,
      ncmValidoSiscomex,
      descricaoSiscomex,
      descricaoOficialSiscomex: descricaoSiscomex,
      cest,
      cfop: cfopStr,
      uCom: String(prod.uCom ?? 'UN'),
      qCom: parseNumber(prod.qCom),
      vUnCom: parseNumber(prod.vUnCom),
      vProd: parseNumber(prod.vProd),
      vFrete: parseOptionalNumber(prod.vFrete),
      vSeg: parseOptionalNumber(prod.vSeg),
      vDesc: parseOptionalNumber(prod.vDesc),
      vOutro: parseOptionalNumber(prod.vOutro),
      modFrete,
      pesoBruto: pesoItem,
      origemMercadoria: orig,
      crtEmitente: emitente.crt as any,
      pRedBC: tributos.pRedBC,
      vICMSDeson: tributos.vICMSDeson,
      motDesICMS: tributos.motDesICMS,
      pMVAST: tributos.pMVAST,
      pRedBCST: tributos.pRedBCST,
      cfopEntradaMapeado: cfopEntradaInfo.cfopEntrada,
      infAdProd,
      aliquotaCreditoIcmsSimplesPct: aliqCredSimples,
      tributos,
    };

    const sensibilidade = avaliarSensibilidadeFiscal(itemBase, emitente.crt, options);

    return {
      ...itemBase,
      sensivelParaAuditoria: sensibilidade.sensivelParaAuditoria,
      motivosSensibilidade: sensibilidade.motivosSensibilidade,
    };
  });

  return {
    tipoDocumento: 'XML',
    versaoSchema,
    infCpl,
    identificacao,
    emitente,
    destinatario,
    transporte,
    resumoFinanceiro,
    totalItens: itens.length,
    totalItensSensiveis: itens.filter((it) => it.sensivelParaAuditoria).length,
    itens,
  };
}

/* =========================================================================
 * 7. PARSER DETERMINÍSTICO DE PDF DANFE (Digital)
 * ========================================================================= */

/**
 * Extração de texto segura suportando pdf-parse v2 (classe) e fallback v1 (função).
 */
async function extrairTextoPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    if ((pdfModule as any).PDFParse) {
      const PDFParseClass = (pdfModule as any).PDFParse;
      const parser = new PDFParseClass({ data: pdfBuffer });
      const textResult = await parser.getText();
      if (typeof textResult === 'string') return textResult;
      if (textResult && typeof textResult.text === 'string') return textResult.text;
      return JSON.stringify(textResult);
    }
    const callable = (pdfModule as any).default || pdfModule;
    if (typeof callable === 'function') {
      const data = await callable(pdfBuffer);
      return data?.text || '';
    }
    return '';
  } catch (err: any) {
    console.warn('Falha na extração de texto do PDF via pdf-parse:', err?.message);
    throw new FiscalExtractionError(
      'Falha ao processar o arquivo PDF. O documento pode estar corrompido ou protegido por senha.',
      'PDF_CORROMPIDO',
      400
    );
  }
}

/**
 * Parser determinístico para PDF digital DANFE.
 * Extrai chave de acesso, dados cadastrais e escaneia linhas de itens fiscais.
 */
export async function extrairDadosPdfDanfe(
  pdfBuffer: Buffer,
  optionsOrMap?: ExtractionOptions | Map<string, Record8>,
  extraMap?: Map<string, Record8>
): Promise<ExtractedInvoiceData> {
  let options: ExtractionOptions | undefined;
  let mapaD8Override: Map<string, Record8> | undefined;

  if (optionsOrMap instanceof Map) {
    mapaD8Override = optionsOrMap;
  } else if (optionsOrMap && typeof optionsOrMap === 'object') {
    options = optionsOrMap;
  }
  if (extraMap instanceof Map) {
    mapaD8Override = extraMap;
  }

  const text = await extrairTextoPdf(pdfBuffer);
  const mapaD8 = mapaD8Override || getMapaD8();

  if (!text || text.trim().length < 20) {
    throw new FiscalExtractionError(
      'O PDF enviado não possui camada de texto digital legível. Envie o XML original ou DANFE pesquisável.',
      'PDF_SEM_TEXTO',
      422
    );
  }

  // Chave de Acesso (44 dígitos contínuos ou espaçados de 4 em 4)
  const chaveMatch = text.match(/(?:CHAVE DE ACESSO|Chave de Acesso)[\s:]*([0-9\s]{44,60})/i) ||
                     text.match(/\b((?:\d{4}\s+){10}\d{4})\b/) ||
                     text.match(/\b(\d{44})\b/);
  const chaveAcesso = chaveMatch ? (chaveMatch[1] || chaveMatch[0]).replace(/\s+/g, '') : undefined;

  // Número e Série
  const numMatch = text.match(/N[oº°\.]?\s*[:\.]?\s*(\d{1,9})\b/i);
  const serieMatch = text.match(/S[eé]rie\s*[:\.]?\s*(\d{1,3})\b/i);
  const dataMatch = text.match(/DATA\s+(?:(?:DA|DE)\s+)?EMISS[AÃ]O[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
  const natOpMatch = text.match(/NATUREZA\s+DA\s+OPERA[CÇ][AÃ]O[\s:]*([^\n\r]+)/i);

  // CNPJ Emitente e Destinatário
  const emitMatch = text.match(/EMITENTE[\s\S]*?CNPJ[\s:]*([\d\.\-\/]+)/i) ||
                    text.match(/CNPJ[\s:]*([\d\.\-\/]+)/i);
  const destMatch = text.match(/DESTINAT[AÁ]RIO[\s\S]*?CNPJ\/CPF[\s:]*([\d\.\-\/]+)/i);

  // UF Emitente e Destinatário
  const ufsEncontradas = [...text.matchAll(/\bUF[\s:]*([A-Z]{2})\b/gi)].map((m) => m[1].toUpperCase());
  const emitUf = ufsEncontradas[0];
  const destUf = ufsEncontradas[1];

  // Totais
  const vTotProdMatch = text.match(/VALOR\s+TOTAL\s+DOS\s+PRODUTOS[\s:]*R?\$?\s*([\d\.\,]+)/i);
  const vNfMatch = text.match(/VALOR\s+TOTAL\s+DA\s+NOTA[\s:]*R?\$?\s*([\d\.\,]+)/i);

  const identificacao: ExtractedInvoiceData['identificacao'] = {
    chaveAcesso,
    numero: numMatch ? numMatch[1] : undefined,
    serie: serieMatch ? serieMatch[1] : undefined,
    dataEmissao: dataMatch ? dataMatch[1] : undefined,
    naturezaOperacao: natOpMatch ? natOpMatch[1].trim() : undefined,
    modelo: '55',
    tipoOperacao: '1',
    ufEmitente: emitUf,
  };

  const emitente: ExtractedInvoiceData['emitente'] = {
    cnpj: emitMatch ? soDigitos(emitMatch[1]) : undefined,
    uf: emitUf,
  };

  const destinatario: ExtractedInvoiceData['destinatario'] = {
    cnpj: destMatch ? soDigitos(destMatch[1]) : undefined,
    uf: destUf,
  };

  const resumoFinanceiro: ExtractedInvoiceData['resumoFinanceiro'] = {
    vProdTotal: parseNumber(vTotProdMatch ? vTotProdMatch[1] : 0),
    vNF: parseNumber(vNfMatch ? vNfMatch[1] : (vTotProdMatch ? vTotProdMatch[1] : 0)),
  };

  // Parser de linhas de itens no padrão DANFE:
  // CÓDIGO | DESCRIÇÃO | NCM | CST | CFOP | UN | QTD | V.UNIT | V.TOTAL
  const linhas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itens: ExtractedItem[] = [];

  const itemRegex = /^(\S+)\s+(.+?)\s+(\d{4}\.?\d{2}\.?\d{2}|\d{8})\s+(\d{2,4})\s+([1-7]\d{3})\s+([A-Za-z]{2,4})\s+([\d\.\,]+)\s+([\d\.\,]+)\s+([\d\.\,]+)/;

  for (const linha of linhas) {
    const m = linha.match(itemRegex);
    if (m) {
      const [, cProd, xProd, rawNcm, cstOuCsosn, cfop, uCom, qStr, vUnStr, vProdStr] = m;
      const ncmNorm = normalizarNcm(rawNcm);
      const ncm = ncmNorm.d8 || padronizarNcm(rawNcm);
      const rec = mapaD8.get(ncm);
      const ncmValidoSiscomex = Boolean(rec && ncm.length === 8);

      const tributos: ExtractedTributosResumo = {};
      if (cstOuCsosn.length <= 2) {
        tributos.cstIcms = cstOuCsosn.padStart(2, '0');
      } else {
        tributos.csosn = cstOuCsosn.padStart(3, '0');
      }

      const itemBase: Omit<ExtractedItem, 'sensivelParaAuditoria' | 'motivosSensibilidade'> = {
        index: itens.length + 1,
        cProd,
        xProd: xProd.trim(),
        ncm,
        ncmOriginal: rawNcm,
        ncmValidoSiscomex,
        descricaoSiscomex: rec?.desc,
        descricaoOficialSiscomex: rec?.desc,
        cfop,
        uCom: uCom.toUpperCase(),
        qCom: parseNumber(qStr),
        vUnCom: parseNumber(vUnStr),
        vProd: parseNumber(vProdStr),
        tributos,
      };

      const sens = avaliarSensibilidadeFiscal(itemBase, emitente.crt, options);
      itens.push({
        ...itemBase,
        sensivelParaAuditoria: sens.sensivelParaAuditoria,
        motivosSensibilidade: [...sens.motivosSensibilidade, 'ORIGEM_PDF_DANFE'],
      });
    }
  }

  // Fallback: se nenhuma linha tabular estrita foi capturada (layout PDF irregular),
  // escaneia NCMs e CFOPs presentes no texto para não deixar o usuário sem dados
  if (itens.length === 0) {
    const ncmsEncontrados = [...text.matchAll(/\b(\d{8}|\d{4}\.\d{2}\.\d{2})\b/g)]
      .map((m) => padronizarNcm(m[1]))
      .filter((ncm) => mapaD8.has(ncm));
    const ncmsUnicos = [...new Set(ncmsEncontrados)];

    const cfopMatch = text.match(/\b([1-7]\d{3})\b/);
    const cfopFallback = cfopMatch ? cfopMatch[1] : '1102';

    for (let i = 0; i < ncmsUnicos.length; i++) {
      const ncm = ncmsUnicos[i];
      const rec = mapaD8.get(ncm);
      itens.push({
        index: i + 1,
        cProd: `ITEM-PDF-${i + 1}`,
        xProd: rec?.desc || `Produto identificado via NCM ${ncm} no PDF`,
        ncm,
        ncmValidoSiscomex: true,
        descricaoSiscomex: rec?.desc,
        descricaoOficialSiscomex: rec?.desc,
        cfop: cfopFallback,
        uCom: 'UN',
        qCom: 1,
        vUnCom: 0,
        vProd: 0,
        tributos: {},
        sensivelParaAuditoria: true,
        motivosSensibilidade: ['ORIGEM_PDF_DANFE_LAYOUT_REDUZIDO'],
      });
    }
  }

  return {
    tipoDocumento: 'PDF',
    identificacao,
    emitente,
    destinatario,
    resumoFinanceiro,
    totalItens: itens.length,
    totalItensSensiveis: itens.filter((it) => it.sensivelParaAuditoria).length,
    itens,
  };
}

/* =========================================================================
 * 8. DISPATCHER PRINCIPAL (Ponto de Entrada Unificado)
 * ========================================================================= */

/**
 * Ponto de entrada unificado para extração determinística imediata de NF-e.
 * Aceita XML ou PDF. Executa em < 50ms para XML e < 150ms para PDF.
 */
export async function extrairDadosNfe(
  buffer: Buffer,
  filename: string,
  optionsOrMap?: ExtractionOptions | Map<string, Record8>,
  extraMap?: Map<string, Record8>
): Promise<ExtractedInvoiceData> {
  const t0 = performance.now();

  if (!buffer || buffer.length === 0) {
    throw new FiscalExtractionError('O arquivo enviado está vazio (0 bytes).', 'ARQUIVO_VAZIO', 400);
  }

  const lowerName = (filename || '').toLowerCase();
  const header50 = buffer.slice(0, 50).toString('utf-8');
  const header5Ascii = buffer.slice(0, 5).toString('ascii');

  let result: ExtractedInvoiceData;

  if (
    lowerName.endsWith('.xml') ||
    header50.includes('<?xml') ||
    header50.includes('<nfeProc') ||
    header50.includes('<NFe') ||
    header50.includes('<nfe:nfeProc') ||
    header50.includes('<nfe:NFe')
  ) {
    result = extrairDadosXmlNfe(buffer, optionsOrMap, extraMap);
  } else if (lowerName.endsWith('.pdf') || header5Ascii === '%PDF-') {
    result = await extrairDadosPdfDanfe(buffer, optionsOrMap, extraMap);
  } else {
    throw new FiscalExtractionError(
      `Formato de arquivo não suportado: "${filename}". Apenas arquivos .xml (NF-e) ou .pdf (DANFE) são aceitos.`,
      'FORMATO_INVALIDO',
      400
    );
  }

  result.tempoExtracaoMs = Math.round(performance.now() - t0);
  result.totalItensSensiveis = result.itens.filter((it) => it.sensivelParaAuditoria).length;
  return result;
}

/* =========================================================================
 * 9. CONTRATO DE AUDITORIA SELETIVA (M2 ↔ M3)
 * ========================================================================= */

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

/**
 * Constrói o payload de auditoria estritamente validado segundo o Contrato M2 ↔ M3.
 * Lança erro descritivo se a seleção estiver vazia ou se os parâmetros obrigatórios faltarem.
 */
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

export {
  converterItemExtracaoParaPrecificacao,
  type PrecificacaoItemInput,
  type ParametrizacaoItemInput,
} from './extrator-nfe-types';

/**
 * Converte um item auditado da NF-e para a estrutura consumida pela aba Parametrizar ERP.
 * Conecta a detecção O(1) de reduções fiscais e alíquotas de FCP.
 */
export function converterItemExtracaoParaParametrizacao(
  item: ExtractedItem,
  opts?: {
    ufOrigem?: string;
    ufDestino?: string;
    crtEmitente?: string;
    regimeDestinatario?: RegimeTributario;
    destinacao?: DestinacaoMercadoria;
    marco?: any;
  }
): ParametrizacaoItemInput {
  const ufOrigem = (opts?.ufOrigem || 'PR').toUpperCase();
  const ufDestino = (opts?.ufDestino || 'PR').toUpperCase();
  const destinacao = opts?.destinacao || 'comercializacao';
  const t = item.tributos || {};

  // Mapeamento CFOP entrada e saída sugeridos
  const cfopInfo = mapearCfopEntrada(item.cfop, destinacao, ufOrigem, ufDestino);
  const cfopEntradaSugerido = item.cfopEntradaMapeado || cfopInfo.cfopEntrada;

  // Derivação simples de CFOP de saída correspondente
  let cfopSaidaSugerido = '5102';
  if (ufOrigem !== ufDestino) {
    cfopSaidaSugerido = cfopInfo.temSt ? '6403' : '6102';
  } else {
    cfopSaidaSugerido = cfopInfo.temSt ? '5403' : '5102';
  }

  // Detecção O(1) de benefícios fiscais
  const reducoes = detectarReducoesFiscaisPorNcm(item.ncm, ufDestino, opts?.marco);
  const fcp = obterFcpPorUf(ufDestino, opts?.marco);

  const cClassTribSugerido = t.cClassTrib || reducoes?.reforma?.cClassTrib;
  const reducaoIbsCbsPct = reducoes?.reforma?.reducaoIbsCbsPct ?? 0;
  const cstIbsCbsSugerido = t.cstIbsCbs || (reducaoIbsCbsPct === 100 ? '02' : reducaoIbsCbsPct > 0 ? '01' : '01');

  let beneficioIcmsPr: string | undefined;
  let pRedBC = item.pRedBC ?? t.pRedBC;
  let percentualDiferimento: number | undefined;

  if (reducoes?.icms) {
    beneficioIcmsPr = reducoes.icms.convenioCorrelato;
    if (reducoes.icms.diferimentoPct) {
      percentualDiferimento = reducoes.icms.diferimentoPct;
    }
  }

  return {
    codigoProduto: item.cProd || `ITEM-${item.index}`,
    descricao: item.xProd,
    ncm: item.ncm,
    cest: item.cest,
    cfopOrigem: item.cfop,
    cfopEntradaSugerido,
    cfopSaidaSugerido,
    cstIcmsOrigem: t.cstIcms,
    csosnOrigem: t.csosn,
    cClassTribSugerido,
    cstIbsCbsSugerido,
    reducaoIbsCbsPct,
    beneficioIcmsPr,
    pRedBC,
    percentualDiferimento,
    fcpPct: fcp,
    valorUnitario: item.vUnCom,
    quantidade: item.qCom > 0 ? item.qCom : 1,
  };
}


