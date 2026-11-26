/**
 * Simulador de Impacto Antes × Depois e Orquestrador Dual-Track de Saneamento NCM
 * (Entrada XML Imutável EFD C100/C170 vs. Saída/ERP/Precificação).
 *
 * Toda aritmética monetária usa `DecimalHalfEven` (`lib/math/decimal-fiscal.ts`).
 */

import { DecimalHalfEven } from '../math/decimal-fiscal';
import { fmtCode, normalizeNcm, type Dataset } from '../data';
import type { MarcoLegal } from '../marco-legal';
import {
  construirItemFiscalAuditado,
  type ItemFiscalAuditado,
} from '../types/item-fiscal-auditado';
import {
  avaliarAderenciaNcm,
  ORIENTACAO_OPERACIONAL_CCE_NCM,
  type ResultadoAderenciaNcm,
} from './aderencia-ncm';

export interface ResumoFiscalComparacaoNcm {
  ncm: string;
  ncmFormatado: string;
  descricaoOficial?: string;
  aliqIcmsPrPct: number;
  fecopPrPct: number;
  aliqTotalPrPct: number;
  sujeitoStPr: boolean;
  excluidoStPr: boolean;
  normaExclusaoStPr?: string;
  mvaOriginalPrPct: number;
  mvaAplicadaPrPct: number;
  difalPrincipal: number;
  fecopDifal: number;
  totalDifalRecolher: number;
  cClassTrib?: string;
  cstIbsCbs?: string;
  reducaoIbsCbsPct: number;
  enquadramentoPendente: boolean;
  requerConferenciaAnexoIX: boolean;
  cfopSaidaSugerido: string;
  tributosNaoRecuperaveisTotal: number;
  creditosRecuperaveisTotal: number;
  cmvLiquidoTotal: number;
  cmvLiquidoUnitario: number;
}

export interface ImpactoSaneamentoNcm {
  ncmOriginal: string;
  ncmCandidato: string;
  ncmCandidatoValidoSiscomex: boolean;
  antes: ResumoFiscalComparacaoNcm;
  depois: ResumoFiscalComparacaoNcm;
  deltaAliqIcmsPrPct: number;
  deltaFecopPrPct: number;
  deltaDifalTotal: number;
  deltaCmvTotal: number;
  deltaCmvUnitario: number;
  deltaCargaTributariaTotal: number;
  haImpactoTributario: boolean;
  itemRecalculado: ItemFiscalAuditado;
}

export interface RastreabilidadeSnapshotFiscal {
  mode: string;
  updatedAt?: string;
  snapshotSha256: string;
  normasVigentes: string[];
  rascunhoNaoOficial?: boolean;
}

export const DEFAULT_NORMAS_VIGENTES_SANEAMENTO: readonly string[] = [
  'EC nº 132/2023 e LC nº 214/2025 (IBS/CBS e Anexo IX)',
  'RICMS/PR Dec. 7.871/2017 (Anexo IX e Art. 14)',
  'Decretos PR nº 6.048/2024 e nº 12.828/2026 (Exclusões ST)',
  'Ajuste SINIEF nº 07/2005 Cl. 14ª-A (Limites CC-e)',
  'Resolução Gecex nº 926/2026 (NCM Siscomex)',
];

/**
 * Normaliza o carimbo de rastreabilidade do snapshot para laudos e relatórios de saneamento.
 */
export function resolverRastreabilidadeSnapshot(
  input?: {
    mode?: string | null;
    updatedAt?: string | null;
    snapshotSha256?: string | null;
    normasVigentes?: (string | null | undefined)[] | null;
    rascunhoNaoOficial?: boolean | null;
  } | null,
  fallbackSha?: string | null
): RastreabilidadeSnapshotFiscal {
  const normasLimpas = Array.isArray(input?.normasVigentes)
    ? input.normasVigentes.map((n) => String(n || '').trim()).filter(Boolean)
    : [];

  return {
    mode: (input?.mode || '').trim() || 'deterministico-local',
    ...(input?.updatedAt && String(input.updatedAt).trim() ? { updatedAt: String(input.updatedAt).trim() } : {}),
    snapshotSha256: (input?.snapshotSha256 || '').trim() || (fallbackSha || '').trim() || 'N/A',
    normasVigentes: normasLimpas.length > 0 ? normasLimpas : [...DEFAULT_NORMAS_VIGENTES_SANEAMENTO],
    ...(input?.rascunhoNaoOficial ? { rascunhoNaoOficial: true } : {}),
  };
}

/**
 * Diferencia explicitamente pendência específica de Anexo IX LC 214 (agropecuária 8432..8701)
 * de ausência genérica de mapeamento cClassTrib (ex.: 8471.30.12 -> "cClassTrib a confirmar").
 */
export function formatarStatusReformaSaneamento(info?: {
  cClassTrib?: string | null;
  reducaoIbsCbsPct?: number | null;
  enquadramentoPendente?: boolean | null;
  requerConferenciaAnexoIX?: boolean | null;
} | null): {
  tipo: 'anexo_ix_pendente' | 'cclasstrib_confirmar' | 'confirmado';
  rotulo: string;
} {
  if (!info) {
    return { tipo: 'confirmado', rotulo: '—' };
  }
  const cod = (info.cClassTrib || '').trim();
  const red = Number(info.reducaoIbsCbsPct || 0);

  if (info.requerConferenciaAnexoIX === true) {
    return {
      tipo: 'anexo_ix_pendente',
      rotulo: cod ? `${cod} · Anexo IX LC 214 pendente` : 'Anexo IX LC 214 pendente',
    };
  }

  if (info.enquadramentoPendente === true) {
    return {
      tipo: 'cclasstrib_confirmar',
      rotulo: 'cClassTrib a confirmar',
    };
  }

  return {
    tipo: 'confirmado',
    rotulo: `${cod || '—'}${red > 0 ? ` (-${red}%)` : ''}`,
  };
}

export interface SaneamentoNcmAuditado {
  aderencia: ResultadoAderenciaNcm;
  overrideAtivo: boolean;
  ncmSaneadoSaida: string | null;
  justificativaPericial: string;
  aplicadoEmIso: string | null;
  impactoAntesDepois: ImpactoSaneamentoNcm | null;
  orientacaoOperacional: string;
}

function dec2Num(val: number | undefined | null): number {
  return new DecimalHalfEven(Number(val || 0)).toDecimalPlaces(2).toNumber();
}

function diffDec2(depois: number, antes: number): number {
  return new DecimalHalfEven(depois || 0)
    .minus(new DecimalHalfEven(antes || 0))
    .toDecimalPlaces(2)
    .toNumber();
}

function extrairResumo(aud: ItemFiscalAuditado, ds?: Dataset | null): ResumoFiscalComparacaoNcm {
  const est = aud.tributacaoEstadual;
  const ref = aud.tributacaoReforma;
  const cp = aud.custoCpc16;
  const d8 = normalizeNcm(aud.ncm);
  const rec = ds?.byD8.get(d8);
  const aliqTotal = new DecimalHalfEven(est.aliqIcmsPrBitemporalPct || 0)
    .plus(new DecimalHalfEven(est.fecopPrPct || 0))
    .toDecimalPlaces(2)
    .toNumber();

  return {
    ncm: d8,
    ncmFormatado: d8.length === 8 ? fmtCode(d8) : aud.ncm,
    descricaoOficial: rec?.desc,
    aliqIcmsPrPct: dec2Num(est.aliqIcmsPrBitemporalPct),
    fecopPrPct: dec2Num(est.fecopPrPct),
    aliqTotalPrPct: aliqTotal,
    sujeitoStPr: Boolean(est.sujeitoStPr),
    excluidoStPr: Boolean(est.excluidoStPr),
    normaExclusaoStPr: est.normaExclusaoStPr,
    mvaOriginalPrPct: dec2Num(est.mvaOriginalPrPct),
    mvaAplicadaPrPct: dec2Num(est.mvaAplicadaPrPct),
    difalPrincipal: dec2Num(cp.vDifalCalculado),
    fecopDifal: dec2Num(cp.vFecopDifalCalculado),
    totalDifalRecolher: dec2Num(est.diagnosticoDifal?.valorTotalRecolher),
    cClassTrib: ref.cClassTrib,
    cstIbsCbs: ref.cstIbsCbs,
    reducaoIbsCbsPct: dec2Num(ref.reducaoIbsCbsPct),
    enquadramentoPendente: Boolean(ref.enquadramentoPendente),
    requerConferenciaAnexoIX: Boolean(ref.requerConferenciaAnexoIX),
    cfopSaidaSugerido: est.cfopSaidaSugerido,
    tributosNaoRecuperaveisTotal: dec2Num(cp.tributosNaoRecuperaveis.total),
    creditosRecuperaveisTotal: dec2Num(cp.creditosRecuperaveis.total),
    cmvLiquidoTotal: dec2Num(cp.cmvLiquidoTotal),
    cmvLiquidoUnitario: dec2Num(cp.cmvLiquidoUnitario),
  };
}

/**
 * Simula em modo estrito o impacto tributário Antes × Depois ao substituir o NCM do XML por `ncmCandidatoRaw`,
 * preservando empresa ativa, `dhEmi`, UF, `emitCrt`, destinação e frete CT-e FOB rateado.
 */
export function simularImpactoSaneamentoNcm(
  itemAuditado: ItemFiscalAuditado,
  ncmCandidatoRaw: string,
  opts: { ds?: Dataset | null; marco?: MarcoLegal | null } = {}
): ImpactoSaneamentoNcm {
  const ncmOriginal = normalizeNcm(itemAuditado.ncmEscrituradoEntrada || itemAuditado.ncm);
  const ncmCandidato = normalizeNcm(ncmCandidatoRaw);
  const validoSiscomex =
    ncmCandidato.length === 8 && (opts.ds ? opts.ds.byD8.has(ncmCandidato) : true);

  const rawBase = itemAuditado.rawItem || {
    index: itemAuditado.nItem,
    cProd: itemAuditado.cProd,
    xProd: itemAuditado.xProd,
    ncm: ncmOriginal,
    ncmValidoSiscomex: true,
    cest: itemAuditado.cest,
    cfop: itemAuditado.tributacaoEstadual.cfopSaidaFornecedor,
    uCom: itemAuditado.uCom,
    qCom: itemAuditado.qCom,
    vUnCom: itemAuditado.vUnCom,
    vProd: itemAuditado.custoCpc16.valorProdutoBruto,
    vDesc: itemAuditado.custoCpc16.descontoIncondicional,
    vFrete: itemAuditado.custoCpc16.freteNfe,
    vSeg: itemAuditado.custoCpc16.seguroNfe,
    vOutro: itemAuditado.custoCpc16.outrasDespesasNfe,
    origemTabelaA: itemAuditado.origTabelaA,
    crtEmitente: itemAuditado.emitCrt,
    sensivelParaAuditoria: false,
    tributos: {
      cstIcms: itemAuditado.cstOuCsosnEntrada.length === 2 ? itemAuditado.cstOuCsosnEntrada : undefined,
      csosn: itemAuditado.cstOuCsosnEntrada.length === 3 ? itemAuditado.cstOuCsosnEntrada : undefined,
      orig: itemAuditado.origTabelaA,
      vIPI: itemAuditado.custoCpc16.tributosNaoRecuperaveis.ipi + itemAuditado.custoCpc16.creditosRecuperaveis.ipi,
      vPIS: itemAuditado.custoCpc16.vPisEntrada,
      vCOFINS: itemAuditado.custoCpc16.vCofinsEntrada,
      vIBS: itemAuditado.custoCpc16.vIbsEntrada,
      vCBS: itemAuditado.custoCpc16.vCbsEntrada,
      vIS: itemAuditado.custoCpc16.vIsEntrada,
    },
  };

  const recCand = opts.ds?.byD8.get(ncmCandidato);
  const cestSug = recCand?.cest?.[0];

  const rateioPreservado = itemAuditado.cteFobVinculado
    ? {
        index: itemAuditado.nItem,
        cProd: itemAuditado.cProd,
        proporcaoPct: 100,
        baseRateio: itemAuditado.custoCpc16.valorProdutoBruto,
        vFreteCte: itemAuditado.custoCpc16.freteCteFob,
        freteCteUnitario: itemAuditado.custoCpc16.freteCteFobUnitario,
        vIcmsCte: itemAuditado.custoCpc16.icmsCteFob,
      }
    : null;

  const itemCandidatoRaw = {
    ...rawBase,
    ncm: ncmCandidato,
    ncmValidoSiscomex: validoSiscomex,
    cest: cestSug ?? rawBase.cest,
    tributos: {
      ...(rawBase.tributos || {}),
      // Limpa cClassTrib XML antigo para permitir recalcular conforme novo NCM
      cClassTrib: undefined,
    },
  };

  const recalcAntesBase = construirItemFiscalAuditado({
    item: { ...rawBase, ncm: ncmOriginal },
    documento: {
      chaveNfe: itemAuditado.chaveNfe,
      numeroNf: itemAuditado.numeroNf,
      serieNf: itemAuditado.serieNf,
      dhEmi: itemAuditado.dhEmi,
      ufOrigem: itemAuditado.ufOrigem,
      ufDestino: itemAuditado.ufDestino,
      emitCrt: itemAuditado.emitCrt,
      emitCnpj: itemAuditado.emitCnpj,
      emitNome: itemAuditado.emitNome,
      emitSnIsentoPr: itemAuditado.emitSnIsentoPr,
    },
    contextoEmpresa: itemAuditado.contextoEmpresa,
    destinacao: itemAuditado.destinacaoExplicita,
    rateioCte: rateioPreservado,
    cteAplicado: itemAuditado.cteFobVinculado,
    chaveCteFob: itemAuditado.chaveCteFob,
    opcoes: { marco: opts.marco, ds: null },
  });

  const itemRecalculado = construirItemFiscalAuditado({
    item: itemCandidatoRaw,
    documento: {
      chaveNfe: itemAuditado.chaveNfe,
      numeroNf: itemAuditado.numeroNf,
      serieNf: itemAuditado.serieNf,
      dhEmi: itemAuditado.dhEmi,
      ufOrigem: itemAuditado.ufOrigem,
      ufDestino: itemAuditado.ufDestino,
      emitCrt: itemAuditado.emitCrt,
      emitCnpj: itemAuditado.emitCnpj,
      emitNome: itemAuditado.emitNome,
      emitSnIsentoPr: itemAuditado.emitSnIsentoPr,
    },
    contextoEmpresa: itemAuditado.contextoEmpresa,
    destinacao: itemAuditado.destinacaoExplicita,
    rateioCte: rateioPreservado,
    cteAplicado: itemAuditado.cteFobVinculado,
    chaveCteFob: itemAuditado.chaveCteFob,
    opcoes: { marco: opts.marco, ds: null },
  });

  const antes = extrairResumo(recalcAntesBase, opts.ds);
  const depois = extrairResumo(itemRecalculado, opts.ds);

  const deltaAliqIcmsPrPct = diffDec2(depois.aliqIcmsPrPct, antes.aliqIcmsPrPct);
  const deltaFecopPrPct = diffDec2(depois.fecopPrPct, antes.fecopPrPct);
  const deltaDifalTotal = diffDec2(depois.totalDifalRecolher, antes.totalDifalRecolher);
  const deltaCmvTotal = diffDec2(depois.cmvLiquidoTotal, antes.cmvLiquidoTotal);
  const deltaCmvUnitario = diffDec2(depois.cmvLiquidoUnitario, antes.cmvLiquidoUnitario);

  const cargaAntes = new DecimalHalfEven(antes.totalDifalRecolher)
    .plus(antes.tributosNaoRecuperaveisTotal)
    .minus(antes.creditosRecuperaveisTotal);
  const cargaDepois = new DecimalHalfEven(depois.totalDifalRecolher)
    .plus(depois.tributosNaoRecuperaveisTotal)
    .minus(depois.creditosRecuperaveisTotal);
  const deltaCargaTributariaTotal = cargaDepois.minus(cargaAntes).toDecimalPlaces(2).toNumber();

  const haImpactoTributario =
    deltaAliqIcmsPrPct !== 0 ||
    deltaFecopPrPct !== 0 ||
    deltaDifalTotal !== 0 ||
    deltaCmvTotal !== 0 ||
    antes.sujeitoStPr !== depois.sujeitoStPr ||
    antes.excluidoStPr !== depois.excluidoStPr ||
    antes.cClassTrib !== depois.cClassTrib;

  return {
    ncmOriginal,
    ncmCandidato,
    ncmCandidatoValidoSiscomex: validoSiscomex,
    antes,
    depois,
    deltaAliqIcmsPrPct,
    deltaFecopPrPct,
    deltaDifalTotal,
    deltaCmvTotal,
    deltaCmvUnitario,
    deltaCargaTributariaTotal,
    haImpactoTributario,
    itemRecalculado,
  };
}

/**
 * Aplica saneamento NCM em modo Dual-Track sem alterar `ncmEscrituradoEntrada`.
 */
export function aplicarSaneamentoNcmNoItem(
  itemAuditado: ItemFiscalAuditado,
  params: {
    ncmSaneado: string;
    justificativaPericial: string;
    ds?: Dataset | null;
    marco?: MarcoLegal | null;
    agoraIso?: string;
  }
): ItemFiscalAuditado {
  const ncmEntradaImutavel = normalizeNcm(itemAuditado.ncmEscrituradoEntrada || itemAuditado.ncm);
  const ncmSaneado = normalizeNcm(params.ncmSaneado);
  const aderencia =
    itemAuditado.saneamentoNcm?.aderencia ||
    avaliarAderenciaNcm(itemAuditado.xProd, ncmEntradaImutavel, params.ds);

  const impactoAntesDepois = simularImpactoSaneamentoNcm(
    { ...itemAuditado, ncmEscrituradoEntrada: ncmEntradaImutavel },
    ncmSaneado,
    { ds: params.ds, marco: params.marco }
  );

  return {
    ...itemAuditado,
    ncmEscrituradoEntrada: ncmEntradaImutavel,
    saneamentoNcm: {
      aderencia,
      overrideAtivo: true,
      ncmSaneadoSaida: ncmSaneado,
      justificativaPericial: (params.justificativaPericial || '').trim() ||
        `Saneamento pericial aplicado de ${fmtCode(ncmEntradaImutavel)} para ${fmtCode(ncmSaneado)}.`,
      aplicadoEmIso: params.agoraIso || new Date().toISOString(),
      impactoAntesDepois,
      orientacaoOperacional: ORIENTACAO_OPERACIONAL_CCE_NCM,
    },
  };
}

/**
 * Reverte o override de saneamento, restaurando a propagação para o NCM original do XML.
 */
export function reverterSaneamentoNcmNoItem(
  itemAuditado: ItemFiscalAuditado,
  ds?: Dataset | null
): ItemFiscalAuditado {
  const ncmEntrada = normalizeNcm(itemAuditado.ncmEscrituradoEntrada || itemAuditado.ncm);
  const aderencia =
    itemAuditado.saneamentoNcm?.aderencia ||
    (ds ? avaliarAderenciaNcm(itemAuditado.xProd, ncmEntrada, ds) : undefined);

  return {
    ...itemAuditado,
    ncmEscrituradoEntrada: ncmEntrada,
    saneamentoNcm: aderencia
      ? {
          aderencia,
          overrideAtivo: false,
          ncmSaneadoSaida: null,
          justificativaPericial: '',
          aplicadoEmIso: null,
          impactoAntesDepois: null,
          orientacaoOperacional: ORIENTACAO_OPERACIONAL_CCE_NCM,
        }
      : undefined,
  };
}
