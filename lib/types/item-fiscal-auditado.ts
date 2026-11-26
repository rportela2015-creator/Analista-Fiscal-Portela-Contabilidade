/**
 * Contrato Canônico Único da Ponte Fiscal:
 * Empresa Ativa (bitemporal dhEmi) -> Auditoria de Entrada (NF-e + CT-e FOB) -> Parametrização ERP -> Precificação.
 *
 * Elimina perda silenciosa de contexto entre abas, segrega custos segundo o CPC 16 (R1) com aritmética
 * DecimalHalfEven (`lib/math/decimal-fiscal.ts`), aplica exclusão do ICMS da base de PIS/COFINS
 * (Lei nº 14.592/2023), suporta NT 2026.008 v1.01 sem dupla contagem de IBS/CBS e preserva flags
 * de confirmação de destinação / Anexo IX e bloqueios do Simples Nacional (LC 123/06 e faixa isenta PR <= R$ 360k).
 */

import type Decimal from 'decimal.js';
import { DecimalHalfEven, somarDecimaisRfb } from '../math/decimal-fiscal';
import {
  resolverPerfilVigenteNaData,
  sanitizarCnpj,
  type Empresa,
  type PerfilTributario,
  type RegimeTributario as RegimePerfilTributario,
} from '../fiscal/perfil-tributario';
import {
  classificarCreditosItemEntrada,
  type ClassificacaoTripartidaCreditos,
  type RegimeAdquirente,
  type StatusExtincaoDebitoFornecedor,
} from '../fiscal/credito-tributario';
import { apurarDifalEntradaPR } from '../engine/difal-pr';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from '../engine/matriz-icms-pr';
import { consultarMvaStPr } from '../engine/tabelas-pr';
import {
  calcularMvaAjustada,
  mapearCfopEntrada,
  detectarReducoesFiscaisPorNcm,
  obterFcpPorUf,
  type DestinacaoMercadoria,
  type MarcoLegal,
} from '../marco-legal';
import type {
  ExtractedCteData,
  ItemRateioCteResult,
  RateioCteSobreItensResult,
} from '../fiscal/extrator-cte';
import { ratearCteSobreItensNfe } from '../fiscal/extrator-cte';
import type { DiagnosticoDifalEntrada } from './motor-tributario';
import type {
  ExtractedInvoiceData,
  ExtractedItem,
  ParametrizacaoItemInput,
  PrecificacaoItemInput,
} from '../extrator-nfe-types';

export type RegimeCanonicoEmpresa = 'SN' | 'SN_SUBLIMITE' | 'SN_HIBRIDO' | 'LP' | 'LR' | 'MEI';
export type RegimeMotorPrecificacao = 'simples' | 'simples_hibrido' | 'presumido' | 'real';
export type PerfilAtividadeEmpresa = 'comercio' | 'industria' | 'servico' | 'alimentacao_3_2' | 'rural';
export type DestinacaoExplicita = 'revenda' | 'insumo_industrial' | 'uso_consumo' | 'ativo_imobilizado';

export interface ContextoEmpresaAuditada {
  empresaAtivaInformada: boolean;
  alertaEmpresaNaoSelecionada?: string;
  empresaId?: string;
  cnpj?: string;
  razaoSocial?: string;
  uf: string;
  dataFatoGerador: string; // YYYY-MM-DD (extraída de dhEmi)
  perfilVigenciaId?: string;
  regimeTributario: RegimeCanonicoEmpresa;
  regimeMotor: RegimeMotorPrecificacao;
  regimeAdquirenteCredito: RegimeAdquirente;
  cnaePrincipal?: string;
  cnaesSecundarios: string[];
  perfilAtividade: PerfilAtividadeEmpresa;
  tipoEstabelecimento: 'comercio' | 'industria';
  rotSt: boolean;
  diferimentoParcialArt28: boolean;
  faixaIsentaIcmsPrSn: boolean;
  faturamentoAnualRbt12?: number;
  icmsEfetivoSimplesPct?: number;
  pisEfetivoPct?: number;
  cofinsEfetivoPct?: number;
  inscritoEstadualPR: boolean;
}

export interface CustoCpc16Segregado {
  quantidade: number;
  valorProdutoBruto: number;
  descontoIncondicional: number;
  valorProdutoLiquido: number;
  freteNfe: number;
  seguroNfe: number;
  outrasDespesasNfe: number;
  freteCteFob: number;
  freteCteFobUnitario: number;
  icmsCteFob: number;
  freteSeguroOutrosTotal: number;
  vPisEntrada: number;
  vCofinsEntrada: number;
  vIbsEntrada: number;
  vCbsEntrada: number;
  vIsEntrada: number;
  vFecopSt: number;
  vDifalCalculado: number;
  vFecopDifalCalculado: number;
  vAntecipacao4Pct: number;
  tributosNaoRecuperaveis: {
    ipi: number;
    icmsSt: number;
    fecopSt: number;
    ii: number;
    impostoSeletivo: number;
    difalOuAntecipacao: number;
    ibsCbsNaoRecuperavel: number;
    total: number;
  };
  creditosRecuperaveis: {
    icmsNfe: number;
    icmsCteFob: number;
    icmsTotal: number;
    pisCofinsNfe: number;
    pisCofinsCteFob: number;
    pisCofinsTotal: number;
    ipi: number;
    ibs: number;
    cbs: number;
    total: number;
  };
  tributosInclusosSemCreditoInformativo: number;
  custoAterrissadoBruto: number;
  cmvLiquidoTotal: number;
  cmvLiquidoUnitario: number;
  glosadoPorDestinacao: boolean;
  motivoGlosa?: string;
  memoriaCalculo: string[];
}

export interface TributacaoEstadualAuditada {
  cfopSaidaFornecedor: string;
  cfopEntradaSugerido: string;
  cfopSaidaSugerido: string;
  aliqIcmsPrBitemporalPct: number;
  fecopPrPct: number;
  sujeitoStPr: boolean;
  excluidoStPr: boolean;
  normaExclusaoStPr?: string;
  mvaOriginalPrPct: number;
  mvaAplicadaPrPct: number;
  tipoMvaPr: 'original_conv_35_2011' | 'ajustada' | 'nao_aplicavel';
  diagnosticoDifal?: DiagnosticoDifalEntrada;
}

export interface TributacaoReformaAuditada {
  cClassTrib?: string;
  cstIbsCbs?: string;
  reducaoIbsCbsPct: number;
  enquadramentoPendente: boolean;
  requerConferenciaAnexoIX: boolean;
  observacaoNormativa?: string;
}

export interface ItemFiscalAuditado {
  chaveNfe?: string;
  numeroNf?: string;
  serieNf?: string;
  dhEmi: string;
  nItem: number;
  cProd: string;
  xProd: string;
  ncm: string;
  cest?: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  cfopEntrada: string;
  origTabelaA: number;
  emitCrt: '1' | '2' | '3' | '4';
  emitCnpj?: string;
  emitNome?: string;
  emitSnIsentoPr: boolean;
  ufOrigem: string;
  ufDestino: string;
  cstOuCsosnEntrada: string;
  destinacaoExplicita?: DestinacaoExplicita;
  destinacaoPendenteConfirmacao: boolean;
  alertaDestinacao?: string;
  contextoEmpresa: ContextoEmpresaAuditada;
  custoCpc16: CustoCpc16Segregado;
  tributacaoEstadual: TributacaoEstadualAuditada;
  tributacaoReforma: TributacaoReformaAuditada;
  auditoriaCreditos: ClassificacaoTripartidaCreditos;
  cteFobVinculado: boolean;
  chaveCteFob?: string;
  alertasFiscais: string[];
  rawItem?: ExtractedItem;
}

export interface NotaFiscalAuditadaSessao {
  chaveNfe?: string;
  numeroNf?: string;
  serieNf?: string;
  dhEmi: string;
  emitenteCnpj?: string;
  emitenteNome?: string;
  ufOrigem: string;
  ufDestino: string;
  contextoEmpresa: ContextoEmpresaAuditada;
  cteFob?: ExtractedCteData | null;
  rateioCte?: RateioCteSobreItensResult | null;
  itens: ItemFiscalAuditado[];
  totaisCpc16: {
    valorProdutosBruto: number;
    freteNfeTotal: number;
    freteCteFobTotal: number;
    tributosNaoRecuperaveisTotal: number;
    creditosRecuperaveisTotal: number;
    cmvLiquidoTotal: number;
  };
  alertasGlobais: string[];
}

function dec2(v: number | undefined | null): Decimal {
  const n = Number(v || 0);
  return new DecimalHalfEven(Number.isFinite(n) ? n : 0).toDecimalPlaces(2);
}

function somarDec(vals: Array<Decimal | number | string>): Decimal {
  const str = somarDecimaisRfb(vals.map((v) => (typeof v === 'object' ? v.toFixed(2) : v)));
  return new DecimalHalfEven(str).toDecimalPlaces(2);
}

function extrairCodigoCnae(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') {
    const clean = val.trim();
    return clean || undefined;
  }
  if (typeof val === 'object' && val !== null && 'codigo' in val) {
    const c = (val as { codigo?: unknown }).codigo;
    return c ? String(c).trim() : undefined;
  }
  return undefined;
}

/**
 * Infere o perfil de atividade econômica do adquirente a partir do CNAE principal (e secundários).
 */
export function inferirPerfilAtividadePorCnae(
  cnaePrincipal?: string | null,
  cnaesSecundarios?: string[]
): PerfilAtividadeEmpresa {
  const todos = [cnaePrincipal, ...(cnaesSecundarios || [])]
    .map((c) => String(c || '').replace(/\D/g, ''))
    .filter((c) => c.length >= 2);

  if (todos.length === 0) return 'comercio';

  const principal = todos[0];
  const div = Number(principal.slice(0, 2));

  if (div === 56) return 'alimentacao_3_2';
  if (div >= 1 && div <= 3) return 'rural';
  if (div >= 5 && div <= 33) return 'industria';
  if (div >= 45 && div <= 47) return 'comercio';

  return 'servico';
}

function mapearRegimePerfilParaCanonico(
  regime: RegimePerfilTributario | string | undefined,
  hibrido2027?: boolean
): {
  canonico: RegimeCanonicoEmpresa;
  motor: RegimeMotorPrecificacao;
  credito: RegimeAdquirente;
} {
  const norm = String(regime || '').toUpperCase();
  if (norm === 'LUCRO_REAL' || norm === 'REAL' || norm === 'LR') {
    return { canonico: 'LR', motor: 'real', credito: 'LUCRO_REAL' };
  }
  if (norm === 'LUCRO_PRESUMIDO' || norm === 'PRESUMIDO' || norm === 'LP') {
    return { canonico: 'LP', motor: 'presumido', credito: 'LUCRO_PRESUMIDO' };
  }
  if (norm === 'SIMPLES_EXCESSO_SUBLIMITE' || norm === 'SN_SUBLIMITE') {
    return {
      canonico: 'SN_SUBLIMITE',
      motor: hibrido2027 ? 'simples_hibrido' : 'simples',
      credito: hibrido2027 ? 'SIMPLES_HIBRIDO' : 'LUCRO_PRESUMIDO',
    };
  }
  if (norm === 'MEI') {
    return { canonico: 'MEI', motor: 'simples', credito: 'MEI' };
  }
  if (
    norm === 'SIMPLES_HIBRIDO' ||
    norm === 'SN_HIBRIDO' ||
    ((norm === 'SIMPLES_NACIONAL' || norm === 'SIMPLES' || norm === 'SN') && Boolean(hibrido2027))
  ) {
    return { canonico: 'SN_HIBRIDO', motor: 'simples_hibrido', credito: 'SIMPLES_HIBRIDO' };
  }
  return { canonico: 'SN', motor: 'simples', credito: 'SIMPLES_NACIONAL' };
}

export interface ResolverContextoEmpresaInput {
  empresaAtiva?: Empresa | null;
  perfilFallback?: PerfilTributario | null;
  dataEmissao?: string | null;
  regimeFallback?: string | null;
  ufFallback?: string | null;
  tipoEstabelecimentoFallback?: 'comercio' | 'industria';
  cnaeFallback?: string;
  faturamentoAnualRbt12?: number;
  inscritoEstadualPR?: boolean;
}

/**
 * Resolve o contexto fiscal completo da empresa adquirente vigente EXATAMENTE na data `dhEmi`.
 */
export function resolverContextoEmpresaNaData(
  input: ResolverContextoEmpresaInput
): ContextoEmpresaAuditada {
  const dataIso =
    input.dataEmissao && input.dataEmissao.trim()
      ? input.dataEmissao.trim().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const empresa = input.empresaAtiva ?? null;

  if (!empresa) {
    const regimes = mapearRegimePerfilParaCanonico(input.regimeFallback || 'presumido');
    const cnaePrinc = input.cnaeFallback;
    const atividade = cnaePrinc
      ? inferirPerfilAtividadePorCnae(cnaePrinc)
      : input.tipoEstabelecimentoFallback === 'industria'
      ? 'industria'
      : 'comercio';
    const tipoEstab =
      input.tipoEstabelecimentoFallback ||
      (atividade === 'industria' ? 'industria' : 'comercio');
    const uf = (input.ufFallback || 'PR').toUpperCase();
    const faixaIsenta =
      uf === 'PR' &&
      regimes.canonico === 'SN' &&
      input.faturamentoAnualRbt12 !== undefined &&
      input.faturamentoAnualRbt12 <= 360000;

    return {
      empresaAtivaInformada: false,
      alertaEmpresaNaoSelecionada:
        'Empresa ativa não selecionada: utilizando regime/CNAE fallback sem validação bitemporal de CNPJ no cadastro.',
      uf,
      dataFatoGerador: dataIso,
      regimeTributario: regimes.canonico,
      regimeMotor: regimes.motor,
      regimeAdquirenteCredito: regimes.credito,
      cnaePrincipal: cnaePrinc,
      cnaesSecundarios: [],
      perfilAtividade: atividade,
      tipoEstabelecimento: tipoEstab,
      rotSt: false,
      diferimentoParcialArt28: false,
      faixaIsentaIcmsPrSn: faixaIsenta,
      faturamentoAnualRbt12: input.faturamentoAnualRbt12,
      inscritoEstadualPR: input.inscritoEstadualPR ?? true,
    };
  }

  const perfilVigente =
    resolverPerfilVigenteNaData(empresa.perfis || [], dataIso) ||
    input.perfilFallback ||
    (empresa.perfis && empresa.perfis[0]) ||
    null;

  const regimes = mapearRegimePerfilParaCanonico(
    perfilVigente?.regimeTributario || input.regimeFallback || 'SIMPLES_NACIONAL',
    perfilVigente?.simplesOptanteHibrido2027
  );

  const meta = (empresa.metadata || {}) as Record<string, unknown>;
  const cnaePrincipal =
    extrairCodigoCnae(empresa.cnaePrincipal) ||
    extrairCodigoCnae(meta.cnaePrincipal) ||
    input.cnaeFallback;

  const rawSec = empresa.cnaesSecundarios ?? (Array.isArray(meta.cnaesSecundarios) ? meta.cnaesSecundarios : []);
  const cnaesSecundarios = (rawSec || [])
    .map(extrairCodigoCnae)
    .filter((c): c is string => Boolean(c));

  const atividade = inferirPerfilAtividadePorCnae(cnaePrincipal, cnaesSecundarios);
  const tipoEstab: 'comercio' | 'industria' =
    atividade === 'industria' ? 'industria' : 'comercio';
  const uf = (empresa.uf || input.ufFallback || 'PR').toUpperCase();
  const rbt12 = input.faturamentoAnualRbt12;
  const icmsEfetivo = perfilVigente?.aliquotasEfetivas?.icmsEfetivo;
  const faixaIsenta =
    uf === 'PR' &&
    regimes.canonico === 'SN' &&
    ((rbt12 !== undefined && rbt12 <= 360000) || icmsEfetivo === 0);

  return {
    empresaAtivaInformada: true,
    empresaId: empresa.id,
    cnpj: sanitizarCnpj(empresa.cnpj),
    razaoSocial: empresa.razaoSocial,
    uf,
    dataFatoGerador: dataIso,
    perfilVigenciaId: perfilVigente?.id,
    regimeTributario: regimes.canonico,
    regimeMotor: regimes.motor,
    regimeAdquirenteCredito: regimes.credito,
    cnaePrincipal,
    cnaesSecundarios,
    perfilAtividade: atividade,
    tipoEstabelecimento: tipoEstab,
    rotSt: Boolean(perfilVigente?.beneficiosParana?.optanteRotSt),
    diferimentoParcialArt28: Boolean(perfilVigente?.beneficiosParana?.diferimentoParcialArt28),
    faixaIsentaIcmsPrSn: faixaIsenta,
    faturamentoAnualRbt12: rbt12,
    icmsEfetivoSimplesPct: icmsEfetivo,
    pisEfetivoPct: perfilVigente?.aliquotasEfetivas?.pisEfetivo,
    cofinsEfetivoPct: perfilVigente?.aliquotasEfetivas?.cofinsEfetivo,
    inscritoEstadualPR:
      input.inscritoEstadualPR ?? Boolean(empresa.inscricaoEstadual && empresa.inscricaoEstadual !== 'ISENTO'),
  };
}

export interface NormalizacaoDestinacaoResult {
  destinacaoExplicita?: DestinacaoExplicita;
  destinacaoParaMotores: DestinacaoMercadoria;
  destinacaoPendenteConfirmacao: boolean;
  alertaDestinacao?: string;
}

/**
 * Normaliza a destinação do item; caso ausente ou ambígua, sinaliza pendência explícita
 * sem assumir isenção nem zerar DIFAL silenciosamente.
 */
export function normalizarDestinacaoExplicita(raw?: string | null): NormalizacaoDestinacaoResult {
  const val = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (val === 'revenda' || val === 'comercializacao') {
    return {
      destinacaoExplicita: 'revenda',
      destinacaoParaMotores: 'comercializacao',
      destinacaoPendenteConfirmacao: false,
    };
  }
  if (val === 'insumo_industrial' || val === 'insumo' || val === 'industrializacao') {
    return {
      destinacaoExplicita: 'insumo_industrial',
      destinacaoParaMotores: 'industrializacao',
      destinacaoPendenteConfirmacao: false,
    };
  }
  if (val === 'uso_consumo' || val === 'consumo' || val === 'uso e consumo') {
    return {
      destinacaoExplicita: 'uso_consumo',
      destinacaoParaMotores: 'uso_consumo',
      destinacaoPendenteConfirmacao: false,
    };
  }
  if (val === 'ativo_imobilizado' || val === 'ativo' || val === 'imobilizado') {
    return {
      destinacaoExplicita: 'ativo_imobilizado',
      destinacaoParaMotores: 'ativo_imobilizado',
      destinacaoPendenteConfirmacao: false,
    };
  }

  return {
    destinacaoExplicita: undefined,
    destinacaoParaMotores: 'uso_consumo',
    destinacaoPendenteConfirmacao: true,
    alertaDestinacao:
      'Destinação explícita não informada ou ambígua: confirme se o item é revenda, insumo_industrial, uso_consumo ou ativo_imobilizado (DIFAL preservada por cautela; crédito requer confirmação).',
  };
}

export interface ConstruirItemAuditadoInput {
  item: ExtractedItem;
  documento?: {
    chaveNfe?: string;
    numeroNf?: string;
    serieNf?: string;
    dhEmi?: string;
    ufOrigem?: string;
    ufDestino?: string;
    emitCrt?: '1' | '2' | '3' | '4' | string;
    emitCnpj?: string;
    emitNome?: string;
    emitSnIsentoPr?: boolean;
  };
  contextoEmpresa: ContextoEmpresaAuditada;
  destinacao?: string | null;
  rateioCte?: ItemRateioCteResult | null;
  cteAplicado?: boolean;
  chaveCteFob?: string;
  opcoes?: {
    marco?: MarcoLegal | null;
    statusExtincaoRtc?: StatusExtincaoDebitoFornecedor;
    recalcularPisCofinsTema69?: boolean;
    aplicarCarga12Art16SN?: boolean;
  };
}

/**
 * Constrói o contrato canônico `ItemFiscalAuditado` integrando empresa ativa bitemporal,
 * item XML, rateio de CT-e FOB, apuração DIFAL PR, matriz ICMS/PR, Reforma LC 214/2025 e CPC 16 R1.
 */
export function construirItemFiscalAuditado(input: ConstruirItemAuditadoInput): ItemFiscalAuditado {
  const { item, documento = {}, contextoEmpresa, rateioCte, opcoes = {} } = input;
  const t = item.tributos || {};
  const alertasFiscais: string[] = [];

  if (!contextoEmpresa.empresaAtivaInformada && contextoEmpresa.alertaEmpresaNaoSelecionada) {
    alertasFiscais.push(contextoEmpresa.alertaEmpresaNaoSelecionada);
  }

  const normDest = normalizarDestinacaoExplicita(input.destinacao);
  if (normDest.destinacaoPendenteConfirmacao && normDest.alertaDestinacao) {
    alertasFiscais.push(normDest.alertaDestinacao);
  }

  const ufOrigem = (documento.ufOrigem || 'PR').toUpperCase();
  const ufDestino = (documento.ufDestino || contextoEmpresa.uf || 'PR').toUpperCase();
  const dhEmi = documento.dhEmi || contextoEmpresa.dataFatoGerador;
  const dataFatoGerador = dhEmi.slice(0, 10);

  const emitCrtRaw = String(item.crtEmitente || documento.emitCrt || '3');
  const emitCrt: '1' | '2' | '3' | '4' =
    emitCrtRaw === '1' || emitCrtRaw === '2' || emitCrtRaw === '4' ? emitCrtRaw : '3';
  const origTabelaA = Number(item.origemTabelaA ?? item.origemMercadoria ?? t.orig ?? 0);
  const cstOuCsosnEntrada = String(t.cstIcms || t.csosn || '');

  const fornecedorSimples =
    emitCrt === '1' || emitCrt === '2' || (!t.cstIcms && Boolean(t.csosn));
  const emitSnIsentoPr = Boolean(documento.emitSnIsentoPr);

  const cfopInfo = mapearCfopEntrada(item.cfop, normDest.destinacaoParaMotores, ufOrigem, ufDestino);
  const matrizPr = resolverAliquotaPrBitemporal(item.ncm, dataFatoGerador);
  const exclusaoStPr = verificarExclusaoStPr(item.ncm, item.cest, dataFatoGerador);
  const mvaPr = consultarMvaStPr({ ncm: item.ncm, cest: item.cest, dataFatoGerador });

  const temStAnterior =
    !exclusaoStPr.excluidoDaSt &&
    (cfopInfo.temSt ||
      (t.vICMSST || 0) > 0 ||
      ['10', '30', '60', '70'].includes(t.cstIcms || '') ||
      ['201', '202', '203', '500'].includes(t.csosn || ''));

  const mvaOriginalPrPct = exclusaoStPr.excluidoDaSt ? 0 : mvaPr.mvaOriginalPct;
  let mvaAplicadaPrPct = 0;
  let tipoMvaPr: 'original_conv_35_2011' | 'ajustada' | 'nao_aplicavel' = 'nao_aplicavel';

  if (mvaOriginalPrPct > 0 && !exclusaoStPr.excluidoDaSt && !matrizPr.ehCombustivelMonofasico) {
    if (fornecedorSimples || ufOrigem === ufDestino) {
      // Convênio ICMS 35/2011: optante do Simples Nacional como substituto aplica MVA Original
      mvaAplicadaPrPct = mvaOriginalPrPct;
      tipoMvaPr = 'original_conv_35_2011';
    } else {
      const aliqInter = [1, 2, 3, 8].includes(origTabelaA) ? 4 : ufOrigem && ['SP', 'RJ', 'MG', 'RS', 'SC'].includes(ufOrigem) ? 12 : 7;
      mvaAplicadaPrPct = calcularMvaAjustada(mvaOriginalPrPct, aliqInter, matrizPr.aliquotaTotalPct);
      tipoMvaPr = 'ajustada';
    }
  }

  if (exclusaoStPr.excluidoDaSt && ((t.vICMSST || 0) > 0 || ['10', '30', '60', '70'].includes(t.cstIcms || ''))) {
    alertasFiscais.push(
      `NCM ${item.ncm} excluído da ST no PR (${exclusaoStPr.decreto || 'Decreto PR'}): destaque de ST/CST na nota requer conferência de ressarcimento ou erro do emitente.`
    );
  }

  // DIFAL / Antecipação PR via motor canônico
  const crtDestDifal: '1' | '3' =
    contextoEmpresa.regimeTributario === 'SN' ||
    contextoEmpresa.regimeTributario === 'SN_HIBRIDO' ||
    contextoEmpresa.regimeTributario === 'MEI'
      ? '1'
      : '3';

  const finalidadeDifal =
    normDest.destinacaoExplicita === 'revenda'
      ? 'revenda'
      : normDest.destinacaoExplicita === 'insumo_industrial'
      ? 'industrializacao'
      : normDest.destinacaoExplicita === 'ativo_imobilizado'
      ? 'ativo_imobilizado'
      : 'uso_consumo';

  const diagnosticoDifal = apurarDifalEntradaPR({
    nItem: item.index,
    xProd: item.xProd,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    cstIcms: t.cstIcms,
    csosn: t.csosn,
    temStAnterior,
    origemMercadoria: origTabelaA,
    finalidadeEntrada: finalidadeDifal,
    crtEmitente: emitCrt,
    crtDestinatario: crtDestDifal,
    ufEmitente: ufOrigem,
    ufDestinatario: ufDestino,
    dataFatoGerador,
    vProd: item.vProd || 0,
    vFrete: item.vFrete || 0,
    vSeg: item.vSeg || 0,
    vDesc: item.vDesc || 0,
    vOutro: item.vOutro || 0,
    vIpi: t.vIPI || 0,
    pIcmsOrigemPct: t.pICMS,
    vIcmsOrigem: t.vICMS,
    vIcmsStDestacado: t.vICMSST,
    vIbs: t.vIBS ?? t.vIbs ?? 0,
    vCbs: t.vCBS ?? t.vCbs ?? 0,
    vIs: t.vIS ?? t.vIs ?? 0,
    aplicarCarga12Art16SN: opcoes.aplicarCarga12Art16SN,
  });

  const ehIndustria =
    contextoEmpresa.perfilAtividade === 'industria' ||
    contextoEmpresa.tipoEstabelecimento === 'industria';

  if (ehIndustria && normDest.destinacaoExplicita === 'insumo_industrial' && (t.vICMSST || 0) > 0) {
    alertasFiscais.push(
      'Insumo adquirido por estabelecimento industrial com ICMS-ST destacado: conferir aproveitamento proporcional de crédito conforme art. 25, § 11 do RICMS/PR.'
    );
  }

  const auditoriaCreditos = classificarCreditosItemEntrada({
    vProd: item.vProd || 0,
    vFrete: item.vFrete || 0,
    vSeg: item.vSeg || 0,
    vOutro: item.vOutro || 0,
    vDesc: item.vDesc || 0,
    vIPI: t.vIPI || 0,
    vICMS: t.vICMS || 0,
    vICMSST: t.vICMSST || 0,
    vPIS: t.vPIS || 0,
    vCOFINS: t.vCOFINS || 0,
    vIBS: t.vIBS ?? t.vIbs ?? 0,
    vCBS: t.vCBS ?? t.vCbs ?? 0,
    vCredICMSSN: t.vCredICMSSN || 0,
    pCredSN: t.pCredSN,
    crtEmitente: emitCrt,
    emitenteSnIsentoPr: emitSnIsentoPr,
    temSt: temStAnterior,
    regimeAdquirente: contextoEmpresa.regimeAdquirenteCredito,
    destinacao:
      normDest.destinacaoExplicita === 'insumo_industrial'
        ? 'industrializacao'
        : normDest.destinacaoExplicita || 'uso_consumo',
    ehIndustria,
    recalcularPisCofinsTema69: opcoes.recalcularPisCofinsTema69 !== false,
    statusExtincaoFornecedor: opcoes.statusExtincaoRtc,
  });

  // Segregação CPC 16 (R1) com DecimalHalfEven
  const q = item.qCom > 0 ? item.qCom : 1;
  // NT 2026.008 v1.01: quando vProdLiq existir, usa-o como valor líquido da mercadoria sem IBS/CBS/IS
  const vProd = dec2(item.vProdLiq ?? t.vProdLiq ?? item.vProd);
  const vDesc = dec2(item.vDesc);
  const vProdLiq = vProd.minus(vDesc).toDecimalPlaces(2);

  const vFreteNfe = dec2(item.vFrete);
  const vSegNfe = dec2(item.vSeg);
  const vOutroNfe = dec2(item.vOutro);

  const cteVinculado = Boolean(input.cteAplicado !== false && rateioCte && rateioCte.vFreteCte > 0);
  const vFreteCteFob = cteVinculado ? dec2(rateioCte!.vFreteCte) : dec2(0);
  const vIcmsCteFob = cteVinculado ? dec2(rateioCte!.vIcmsCte) : dec2(0);
  const freteTotalDec = somarDec([vFreteNfe, vSegNfe, vOutroNfe, vFreteCteFob]);

  const vIpiXml = dec2(t.vIPI);
  const vIcmsXml = dec2(t.vICMS);
  const vIcmsStXml = dec2(t.vICMSST);
  const vIIXml = dec2(t.vII);
  const vIsXml = dec2(t.vIS ?? t.vIs);
  const vPisXml = dec2(t.vPIS);
  const vCofinsXml = dec2(t.vCOFINS);
  const vIbsXml = dec2(t.vIBS ?? t.vIbs);
  const vCbsXml = dec2(t.vCBS ?? t.vCbs);

  const glosadoPorDestinacao = normDest.destinacaoExplicita === 'uso_consumo';
  const isAtivo = normDest.destinacaoExplicita === 'ativo_imobilizado';
  const podeApropriarIcms =
    !glosadoPorDestinacao &&
    !isAtivo &&
    !normDest.destinacaoPendenteConfirmacao &&
    (contextoEmpresa.regimeTributario === 'LR' ||
      contextoEmpresa.regimeTributario === 'LP' ||
      contextoEmpresa.regimeTributario === 'SN_SUBLIMITE');

  // ICMS sobre NF-e
  let credIcmsNfe = dec2(0);
  if (podeApropriarIcms) {
    if (fornecedorSimples) {
      if (emitSnIsentoPr) {
        credIcmsNfe = dec2(0);
        alertasFiscais.push(
          'Emitente Simples Nacional na faixa isenta ICMS/PR (<= R$ 360 mil): transferência de crédito de ICMS bloqueada (RICMS/PR Art. 26 § 15 III).'
        );
      } else if (!temStAnterior) {
        credIcmsNfe =
          (t.vCredICMSSN || 0) > 0
            ? dec2(t.vCredICMSSN)
            : (t.pCredSN || 0) > 0
            ? vProdLiq.mul(t.pCredSN || 0).div(100).toDecimalPlaces(2)
            : dec2(0);
      }
    } else if (!(temStAnterior && normDest.destinacaoExplicita === 'revenda')) {
      credIcmsNfe = vIcmsXml;
    }
  }

  // ICMS sobre CT-e FOB (quando adquirente LR/LP/Sublimite é tomador efetivo do frete)
  const credIcmsCte =
    podeApropriarIcms && !(temStAnterior && normDest.destinacaoExplicita === 'revenda')
      ? vIcmsCteFob
      : dec2(0);
  const credIcmsTotal = credIcmsNfe.plus(credIcmsCte).toDecimalPlaces(2);

  // PIS / COFINS: exclusivamente Lucro Real com exclusão do ICMS da base (Lei 14.592/2023)
  const pisMonofasicoOuZero = ['04', '05', '06', '07', '08', '09'].includes(t.cstPis || '');
  const podeApropriarPisCofinsNfe =
    contextoEmpresa.regimeTributario === 'LR' &&
    !glosadoPorDestinacao &&
    !isAtivo &&
    !normDest.destinacaoPendenteConfirmacao &&
    !fornecedorSimples &&
    !pisMonofasicoOuZero;

  const recalcularTema69 = opcoes.recalcularPisCofinsTema69 !== false;
  let credPisCofinsNfe = dec2(0);
  if (podeApropriarPisCofinsNfe) {
    if (recalcularTema69) {
      const baseTema69 = DecimalHalfEven.max(
        0,
        vProdLiq.plus(vFreteNfe).plus(vSegNfe).plus(vOutroNfe).minus(vIcmsXml)
      );
      credPisCofinsNfe = baseTema69.mul(0.0925).toDecimalPlaces(2);
    } else {
      const destacado = vPisXml.plus(vCofinsXml).toDecimalPlaces(2);
      if (destacado.gt(0)) {
        credPisCofinsNfe = destacado;
      } else {
        const baseTema69 = DecimalHalfEven.max(
          0,
          vProdLiq.plus(vFreteNfe).plus(vSegNfe).plus(vOutroNfe).minus(vIcmsXml)
        );
        credPisCofinsNfe = baseTema69.mul(0.0925).toDecimalPlaces(2);
      }
    }
  }

  // Crédito PIS/COFINS 9,25% sobre frete CT-e FOB líquido de ICMS no Lucro Real (Leis 10.637/02 e 10.833/03 Art. 3º IX)
  const podeCreditarPisCofinsCte =
    contextoEmpresa.regimeTributario === 'LR' &&
    !glosadoPorDestinacao &&
    !isAtivo &&
    !normDest.destinacaoPendenteConfirmacao &&
    vFreteCteFob.gt(0);
  const credPisCofinsCte = podeCreditarPisCofinsCte
    ? DecimalHalfEven.max(0, vFreteCteFob.minus(vIcmsCteFob)).mul(0.0925).toDecimalPlaces(2)
    : dec2(0);
  const credPisCofinsTotal = credPisCofinsNfe.plus(credPisCofinsCte).toDecimalPlaces(2);

  // IPI: recuperável SOMENTE para estabelecimento industrial no regime normal em insumo/industrialização (RIPI Art. 225)
  const podeApropriarIpi =
    ehIndustria &&
    !glosadoPorDestinacao &&
    !isAtivo &&
    !normDest.destinacaoPendenteConfirmacao &&
    !fornecedorSimples &&
    (contextoEmpresa.regimeTributario === 'LR' || contextoEmpresa.regimeTributario === 'LP') &&
    (normDest.destinacaoExplicita === 'insumo_industrial' || normDest.destinacaoExplicita === 'revenda');
  const credIpi = podeApropriarIpi ? vIpiXml : dec2(0);
  const ipiNaoRecuperavel = vIpiXml.minus(credIpi).toDecimalPlaces(2);

  // IBS / CBS (LC 214/2025) — por fora (NT 2026.008 v1.01)
  const podeApropriarIbsCbs =
    !glosadoPorDestinacao &&
    !isAtivo &&
    !normDest.destinacaoPendenteConfirmacao &&
    !fornecedorSimples &&
    (contextoEmpresa.regimeTributario === 'LR' ||
      contextoEmpresa.regimeTributario === 'LP' ||
      contextoEmpresa.regimeTributario === 'SN_HIBRIDO') &&
    opcoes.statusExtincaoRtc !== 'AGUARDANDO_EXTINCAO';
  const credIbs = podeApropriarIbsCbs ? vIbsXml : dec2(0);
  const credCbs = podeApropriarIbsCbs ? vCbsXml : dec2(0);
  const ibsCbsNaoRecup = vIbsXml.plus(vCbsXml).minus(credIbs).minus(credCbs).toDecimalPlaces(2);

  // DIFAL / FECOP / Antecipação PR
  const vFecopSt = dec2(0);
  const vDifalCalc = dec2(diagnosticoDifal.valorDebitoDifal ?? diagnosticoDifal.valorDifal);
  const vFecopDifalCalc = dec2(diagnosticoDifal.valorDebitoFecop ?? diagnosticoDifal.valorFecop);
  const vAntecipacao4Pct =
    diagnosticoDifal.modalidade === 'ANTECIPACAO_4_PCT_ART16'
      ? dec2(diagnosticoDifal.valorTotalDebito ?? diagnosticoDifal.valorTotalRecolher)
      : dec2(0);
  const difalBruto = dec2(diagnosticoDifal.valorTotalDebito ?? diagnosticoDifal.valorTotalRecolher);
  const difalNaoRecup =
    diagnosticoDifal.exigeRecolhimento &&
    !(isAtivo && (contextoEmpresa.regimeTributario === 'LR' || contextoEmpresa.regimeTributario === 'LP'))
      ? difalBruto
      : dec2(0);

  const tribNaoRecupTotal = somarDec([
    ipiNaoRecuperavel,
    vIcmsStXml,
    vFecopSt,
    vIIXml,
    vIsXml,
    difalNaoRecup,
    ibsCbsNaoRecup,
  ]);

  const credTotal = somarDec([
    credIcmsTotal,
    credPisCofinsTotal,
    credIpi,
    credIbs,
    credCbs,
  ]);

  const tribInclusosSemCredito = DecimalHalfEven.max(
    0,
    somarDec([vIcmsXml, vPisXml, vCofinsXml])
      .minus(credIcmsNfe)
      .minus(credPisCofinsNfe)
  ).toDecimalPlaces(2);

  // NT 2026.008 v1.01 + CPC 16 R1: desembolso aterrissado bruto inclui IBS/CBS por fora uma única vez;
  // se creditáveis, são deduzidos integralmente em credTotal -> impacto líquido zero no CMV.
  const custoAterrissadoBruto = somarDec([
    vProdLiq,
    freteTotalDec,
    vIpiXml,
    vIcmsStXml,
    vFecopSt,
    vIIXml,
    vIsXml,
    difalNaoRecup,
    vIbsXml,
    vCbsXml,
  ]);

  const cmvLiquidoTotal = custoAterrissadoBruto.minus(credTotal).toDecimalPlaces(2);
  const cmvLiquidoUnitario = cmvLiquidoTotal.div(q).toDecimalPlaces(2);

  const memoriaCalculo: string[] = [
    `vProd Líquido: R$ ${vProdLiq.toFixed(2)} (Bruto R$ ${vProd.toFixed(2)} - Desc R$ ${vDesc.toFixed(2)})`,
    `Fretes/Despesas: NF-e R$ ${vFreteNfe.plus(vSegNfe).plus(vOutroNfe).toFixed(2)} + CT-e FOB R$ ${vFreteCteFob.toFixed(2)} = R$ ${freteTotalDec.toFixed(2)}`,
    `Tributos Não Recuperáveis: R$ ${tribNaoRecupTotal.toFixed(2)} (IPI R$ ${ipiNaoRecuperavel.toFixed(2)}, ST R$ ${vIcmsStXml.toFixed(2)}, DIFAL/Antec. R$ ${difalNaoRecup.toFixed(2)}, IBS/CBS n/rec R$ ${ibsCbsNaoRecup.toFixed(2)})`,
    `Créditos Recuperáveis (${contextoEmpresa.regimeTributario}/${contextoEmpresa.perfilAtividade}): -R$ ${credTotal.toFixed(2)} (ICMS NF-e R$ ${credIcmsNfe.toFixed(2)} + ICMS CT-e R$ ${credIcmsCte.toFixed(2)}, PIS/COFINS Lei 14.592/23 R$ ${credPisCofinsTotal.toFixed(2)}, IPI R$ ${credIpi.toFixed(2)}, IBS/CBS R$ ${credIbs.plus(credCbs).toFixed(2)})`,
    `CMV Líquido Total: R$ ${cmvLiquidoTotal.toFixed(2)} | Unitário (${q} ${item.uCom || 'UN'}): R$ ${cmvLiquidoUnitario.toFixed(2)}`,
  ];

  // Reforma Tributária (LC 214/2025)
  const reducoes = detectarReducoesFiscaisPorNcm(item.ncm, ufDestino, opcoes.marco);
  const cClassTrib = t.cClassTrib || reducoes?.reforma?.cClassTrib;
  const reducaoIbsCbsPct = reducoes?.reforma?.reducaoIbsCbsPct ?? 0;
  const cstIbsCbs = t.cstIbsCbs || (reducaoIbsCbsPct === 100 ? '02' : reducaoIbsCbsPct > 0 ? '200' : undefined);
  const enquadramentoPendente = Boolean(reducoes?.reforma?.enquadramentoPendente || !cClassTrib);
  const requerConferenciaAnexoIX = Boolean(reducoes?.reforma?.requerConferenciaAnexoIX);

  if (requerConferenciaAnexoIX && reducoes?.reforma?.observacaoNormativa) {
    alertasFiscais.push(reducoes.reforma.observacaoNormativa);
  }

  let cfopSaidaSugerido = '5102';
  if (ufOrigem !== ufDestino) {
    cfopSaidaSugerido = temStAnterior ? '6403' : '6102';
  } else {
    cfopSaidaSugerido = temStAnterior ? '5403' : '5102';
  }

  return {
    chaveNfe: documento.chaveNfe,
    numeroNf: documento.numeroNf,
    serieNf: documento.serieNf,
    dhEmi,
    nItem: item.index,
    cProd: item.cProd,
    xProd: item.xProd,
    ncm: item.ncm,
    cest: item.cest,
    uCom: item.uCom || 'UN',
    qCom: q,
    vUnCom: item.vUnCom,
    cfopEntrada: item.cfopEntradaMapeado || cfopInfo.cfopEntrada,
    origTabelaA,
    emitCrt,
    emitCnpj: documento.emitCnpj,
    emitNome: documento.emitNome,
    emitSnIsentoPr,
    ufOrigem,
    ufDestino,
    cstOuCsosnEntrada,
    destinacaoExplicita: normDest.destinacaoExplicita,
    destinacaoPendenteConfirmacao: normDest.destinacaoPendenteConfirmacao,
    alertaDestinacao: normDest.alertaDestinacao,
    contextoEmpresa,
    custoCpc16: {
      quantidade: q,
      valorProdutoBruto: vProd.toNumber(),
      descontoIncondicional: vDesc.toNumber(),
      valorProdutoLiquido: vProdLiq.toNumber(),
      freteNfe: vFreteNfe.toNumber(),
      seguroNfe: vSegNfe.toNumber(),
      outrasDespesasNfe: vOutroNfe.toNumber(),
      freteCteFob: vFreteCteFob.toNumber(),
      freteCteFobUnitario: cteVinculado ? rateioCte!.freteCteUnitario : 0,
      icmsCteFob: vIcmsCteFob.toNumber(),
      freteSeguroOutrosTotal: freteTotalDec.toNumber(),
      vPisEntrada: vPisXml.toNumber(),
      vCofinsEntrada: vCofinsXml.toNumber(),
      vIbsEntrada: vIbsXml.toNumber(),
      vCbsEntrada: vCbsXml.toNumber(),
      vIsEntrada: vIsXml.toNumber(),
      vFecopSt: vFecopSt.toNumber(),
      vDifalCalculado: vDifalCalc.toNumber(),
      vFecopDifalCalculado: vFecopDifalCalc.toNumber(),
      vAntecipacao4Pct: vAntecipacao4Pct.toNumber(),
      tributosNaoRecuperaveis: {
        ipi: ipiNaoRecuperavel.toNumber(),
        icmsSt: vIcmsStXml.toNumber(),
        fecopSt: vFecopSt.toNumber(),
        ii: vIIXml.toNumber(),
        impostoSeletivo: vIsXml.toNumber(),
        difalOuAntecipacao: difalNaoRecup.toNumber(),
        ibsCbsNaoRecuperavel: ibsCbsNaoRecup.toNumber(),
        total: tribNaoRecupTotal.toNumber(),
      },
      creditosRecuperaveis: {
        icmsNfe: credIcmsNfe.toNumber(),
        icmsCteFob: credIcmsCte.toNumber(),
        icmsTotal: credIcmsTotal.toNumber(),
        pisCofinsNfe: credPisCofinsNfe.toNumber(),
        pisCofinsCteFob: credPisCofinsCte.toNumber(),
        pisCofinsTotal: credPisCofinsTotal.toNumber(),
        ipi: credIpi.toNumber(),
        ibs: credIbs.toNumber(),
        cbs: credCbs.toNumber(),
        total: credTotal.toNumber(),
      },
      tributosInclusosSemCreditoInformativo: tribInclusosSemCredito.toNumber(),
      custoAterrissadoBruto: custoAterrissadoBruto.toNumber(),
      cmvLiquidoTotal: cmvLiquidoTotal.toNumber(),
      cmvLiquidoUnitario: cmvLiquidoUnitario.toNumber(),
      glosadoPorDestinacao,
      motivoGlosa: glosadoPorDestinacao
        ? 'Uso e Consumo: créditos de ICMS/PIS/COFINS/IPI/IBS/CBS vedados pela legislação vigente.'
        : undefined,
      memoriaCalculo,
    },
    tributacaoEstadual: {
      cfopSaidaFornecedor: item.cfop,
      cfopEntradaSugerido: item.cfopEntradaMapeado || cfopInfo.cfopEntrada,
      cfopSaidaSugerido,
      aliqIcmsPrBitemporalPct: matrizPr.aliquotaIcmsPct,
      fecopPrPct: matrizPr.aliquotaFecopPct,
      sujeitoStPr: temStAnterior,
      excluidoStPr: exclusaoStPr.excluidoDaSt,
      normaExclusaoStPr: exclusaoStPr.decreto,
      mvaOriginalPrPct,
      mvaAplicadaPrPct,
      tipoMvaPr,
      diagnosticoDifal,
    },
    tributacaoReforma: {
      cClassTrib,
      cstIbsCbs,
      reducaoIbsCbsPct,
      enquadramentoPendente,
      requerConferenciaAnexoIX,
      observacaoNormativa: reducoes?.reforma?.observacaoNormativa,
    },
    auditoriaCreditos,
    cteFobVinculado: cteVinculado,
    chaveCteFob: cteVinculado ? input.chaveCteFob : undefined,
    alertasFiscais: Array.from(new Set(alertasFiscais)),
    rawItem: item,
  };
}

/**
 * Constrói a sessão consolidada da NF-e + CT-e FOB (se presente) com todos os `ItemFiscalAuditado`.
 */
export function construirNotaFiscalAuditadaSessao(params: {
  invoice: ExtractedInvoiceData;
  contextoEmpresa: ContextoEmpresaAuditada;
  destinacaoPadrao?: string | null;
  destinacaoPorItem?: Record<string | number, string>;
  cteFob?: ExtractedCteData | null;
  criterioRateioCte?: 'valor' | 'peso' | 'auto';
  emitSnIsentoPr?: boolean;
  marco?: MarcoLegal | null;
  statusExtincaoRtc?: StatusExtincaoDebitoFornecedor;
  recalcularPisCofinsTema69?: boolean;
}): NotaFiscalAuditadaSessao {
  const { invoice, contextoEmpresa, cteFob } = params;
  const dhEmi = invoice.identificacao?.dataEmissao || contextoEmpresa.dataFatoGerador;
  const ufOrigem = (invoice.emitente?.uf || invoice.identificacao?.ufEmitente || 'PR').toUpperCase();
  const ufDestino = (invoice.destinatario?.uf || contextoEmpresa.uf || 'PR').toUpperCase();
  const alertasGlobais: string[] = [];

  if (!contextoEmpresa.empresaAtivaInformada && contextoEmpresa.alertaEmpresaNaoSelecionada) {
    alertasGlobais.push(contextoEmpresa.alertaEmpresaNaoSelecionada);
  }

  let rateioCte: RateioCteSobreItensResult | null = null;
  if (cteFob) {
    rateioCte = ratearCteSobreItensNfe(invoice.itens, cteFob, {
      cnpjEmpresaAtiva: contextoEmpresa.cnpj,
      chaveNfe: invoice.identificacao?.chaveAcesso,
      criterio: params.criterioRateioCte || 'auto',
    });
    if (!rateioCte.aplicado && rateioCte.motivoBloqueio) {
      alertasGlobais.push(rateioCte.motivoBloqueio);
    } else if (rateioCte.alertaVinculo) {
      alertasGlobais.push(rateioCte.alertaVinculo);
    }
  }

  const rateioPorIdx = new Map<number, ItemRateioCteResult>();
  if (rateioCte?.aplicado) {
    for (const r of rateioCte.rateios) {
      rateioPorIdx.set(r.index, r);
    }
  }

  const itensAuditados = invoice.itens.map((item) => {
    const destItem =
      params.destinacaoPorItem?.[item.index] ??
      params.destinacaoPorItem?.[item.cProd] ??
      params.destinacaoPadrao;

    return construirItemFiscalAuditado({
      item,
      documento: {
        chaveNfe: invoice.identificacao?.chaveAcesso,
        numeroNf: invoice.identificacao?.numero,
        serieNf: invoice.identificacao?.serie,
        dhEmi,
        ufOrigem,
        ufDestino,
        emitCrt: item.crtEmitente || invoice.emitente?.crt,
        emitCnpj: invoice.emitente?.cnpj,
        emitNome: invoice.emitente?.nome,
        emitSnIsentoPr: params.emitSnIsentoPr,
      },
      contextoEmpresa,
      destinacao: destItem,
      rateioCte: rateioPorIdx.get(item.index) ?? null,
      cteAplicado: Boolean(rateioCte?.aplicado),
      chaveCteFob: cteFob?.chaveAcesso,
      opcoes: {
        marco: params.marco,
        statusExtincaoRtc: params.statusExtincaoRtc,
        recalcularPisCofinsTema69: params.recalcularPisCofinsTema69,
      },
    });
  });

  const totalBruto = somarDec(itensAuditados.map((i) => i.custoCpc16.valorProdutoBruto));
  const totalFreteNfe = somarDec(itensAuditados.map((i) => i.custoCpc16.freteNfe));
  const totalFreteCte = somarDec(itensAuditados.map((i) => i.custoCpc16.freteCteFob));
  const totalTribNaoRecup = somarDec(
    itensAuditados.map((i) => i.custoCpc16.tributosNaoRecuperaveis.total)
  );
  const totalCredRecup = somarDec(
    itensAuditados.map((i) => i.custoCpc16.creditosRecuperaveis.total)
  );
  const totalCmv = somarDec(itensAuditados.map((i) => i.custoCpc16.cmvLiquidoTotal));

  return {
    chaveNfe: invoice.identificacao?.chaveAcesso,
    numeroNf: invoice.identificacao?.numero,
    serieNf: invoice.identificacao?.serie,
    dhEmi,
    emitenteCnpj: invoice.emitente?.cnpj,
    emitenteNome: invoice.emitente?.nome,
    ufOrigem,
    ufDestino,
    contextoEmpresa,
    cteFob: cteFob ?? null,
    rateioCte,
    itens: itensAuditados,
    totaisCpc16: {
      valorProdutosBruto: totalBruto.toNumber(),
      freteNfeTotal: totalFreteNfe.toNumber(),
      freteCteFobTotal: totalFreteCte.toNumber(),
      tributosNaoRecuperaveisTotal: totalTribNaoRecup.toNumber(),
      creditosRecuperaveisTotal: totalCredRecup.toNumber(),
      cmvLiquidoTotal: totalCmv.toNumber(),
    },
    alertasGlobais,
  };
}

/**
 * Converte `ItemFiscalAuditado` para `PrecificacaoItemInput` preservando integralmente o contrato auditado.
 */
export function converterAuditadoParaPrecificacao(
  auditado: ItemFiscalAuditado
): PrecificacaoItemInput {
  const t = auditado.rawItem?.tributos || {};
  const c = auditado.custoCpc16;
  const est = auditado.tributacaoEstadual;

  const destinacaoPrecif: DestinacaoMercadoria =
    auditado.destinacaoExplicita === 'revenda'
      ? 'comercializacao'
      : auditado.destinacaoExplicita === 'insumo_industrial'
      ? 'industrializacao'
      : auditado.destinacaoExplicita || 'uso_consumo';

  return {
    index: auditado.nItem,
    codigo: auditado.cProd || `ITEM-${auditado.nItem}`,
    descricao: auditado.xProd,
    ncm: auditado.ncm,
    cest: auditado.cest,
    cfop: est.cfopSaidaFornecedor,
    cfopEntradaMapeado: auditado.cfopEntrada,
    destinacao: destinacaoPrecif,
    tipoEstabelecimento: auditado.contextoEmpresa.tipoEstabelecimento,
    cClassTrib: auditado.tributacaoReforma.cClassTrib || t.cClassTrib,
    cstIbsCbs: auditado.tributacaoReforma.cstIbsCbs || t.cstIbsCbs,
    cstIcms: t.cstIcms,
    csosn: t.csosn,
    origemMercadoria: String(auditado.origTabelaA),
    crtEmitente: auditado.emitCrt,
    modFrete: auditado.cteFobVinculado ? '1' : auditado.rawItem?.modFrete,
    pesoBruto: auditado.rawItem?.pesoBruto,
    pRedBC: auditado.rawItem?.pRedBC ?? t.pRedBC,
    pRedBCST: auditado.rawItem?.pRedBCST ?? t.pRedBCST,
    vICMSDeson: auditado.rawItem?.vICMSDeson ?? t.vICMSDeson,
    motDesICMS: auditado.rawItem?.motDesICMS ?? t.motDesICMS,
    pMVAST: auditado.rawItem?.pMVAST ?? t.pMVAST,
    infAdProd: auditado.rawItem?.infAdProd,
    aliquotaCreditoIcmsSimplesPct: auditado.rawItem?.aliquotaCreditoIcmsSimplesPct ?? t.pCredSN,
    temSt: est.sujeitoStPr,
    quantidade: auditado.qCom,
    valorBrutoEntrada: c.valorProdutoBruto,
    freteSeguroOutrasEntrada: c.freteSeguroOutrosTotal,
    descontoIncondicionalEntrada: c.descontoIncondicional,
    ipiEntrada: c.tributosNaoRecuperaveis.ipi,
    icmsStEntrada: c.tributosNaoRecuperaveis.icmsSt,
    iiEntrada: c.tributosNaoRecuperaveis.ii,
    isEntrada: c.tributosNaoRecuperaveis.impostoSeletivo,
    credIcmsEntrada: c.creditosRecuperaveis.icmsTotal,
    credPisCofinsEntrada: c.creditosRecuperaveis.pisCofinsTotal,
    credCbsEntrada: c.creditosRecuperaveis.cbs,
    credIbsEntrada: c.creditosRecuperaveis.ibs,
    auditoriaCreditos: auditado.auditoriaCreditos,
    freteCteFobRateado: c.freteCteFob,
    cmvLiquidoUnitarioAuditado: c.cmvLiquidoUnitario,
    itemAuditado: auditado,
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
      vIBS: t.vIBS ?? t.vIbs,
      pCBS: t.pCBS,
      vCBS: t.vCBS ?? t.vCbs,
      vBCIbsCbs: t.vBCIbsCbs,
      pIS: t.pIS,
      vIS: t.vIS ?? t.vIs,
    },
  };
}

/**
 * Converte `ItemFiscalAuditado` para `ParametrizacaoItemInput` preservando origem, NCM, Anexo IX e CPC 16 R1.
 */
export function converterAuditadoParaParametrizacao(
  auditado: ItemFiscalAuditado,
  marco?: MarcoLegal | null
): ParametrizacaoItemInput {
  const t = auditado.rawItem?.tributos || {};
  const est = auditado.tributacaoEstadual;
  const fcp = est.fecopPrPct || obterFcpPorUf(auditado.ufDestino, marco);

  return {
    codigoProduto: auditado.cProd || `ITEM-${auditado.nItem}`,
    descricao: auditado.xProd,
    ncm: auditado.ncm,
    cest: auditado.cest,
    cfopOrigem: est.cfopSaidaFornecedor,
    cfopEntradaSugerido: est.cfopEntradaSugerido,
    cfopSaidaSugerido: est.cfopSaidaSugerido,
    cstIcmsOrigem: t.cstIcms,
    csosnOrigem: t.csosn,
    cClassTribSugerido: auditado.tributacaoReforma.cClassTrib,
    cstIbsCbsSugerido: auditado.tributacaoReforma.cstIbsCbs,
    reducaoIbsCbsPct: auditado.tributacaoReforma.reducaoIbsCbsPct,
    beneficioIcmsPr: auditado.tributacaoReforma.requerConferenciaAnexoIX ? 'CONV-ICMS-52-1991' : undefined,
    pRedBC: auditado.rawItem?.pRedBC ?? t.pRedBC,
    fcpPct: fcp,
    valorUnitario: auditado.vUnCom || auditado.custoCpc16.valorProdutoBruto / auditado.qCom,
    quantidade: auditado.qCom,
    itemAuditado: auditado,
    custoCpc16: auditado.custoCpc16,
  };
}
