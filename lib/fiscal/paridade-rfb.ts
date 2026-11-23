/**
 * Motor de Diagnóstico e Auditoria de Paridade: RFB Oficial vs. Motor Local
 * Analista Fiscal Portela Contabilidade — Ciclo 6 (Sub-Etapa 19.7)
 *
 * Utiliza DecimalHalfEven (ADR003) para comparação item a item e dos totalizadores,
 * identificando divergências de centavos, bases de cálculo e alíquotas com tolerância configurável.
 */

import type Decimal from 'decimal.js';
import {
  DecimalHalfEven,
  arredondarMoedaRfb,
} from '../math/decimal-fiscal';
import type { ResultadoCalculoRegimeRegularNormalizado } from '../integracoes/rtc-regime-regular/normalizer';
import type { ResultadoSimplesNormalizado } from '../integracoes/rtc-simples/normalizer';

export type CausaDivergenciaRtc =
  | 'ARREDONDAMENTO_HALF_EVEN'
  | 'DIVERGENCIA_BASE_CALCULO'
  | 'DIVERGENCIA_ALIQUOTA_OU_REDUCAO'
  | 'ITEM_NAO_CALCULADO_RFB';

export interface DivergenciaItemParidade {
  numeroItem: number | 'TOTAL';
  campo: string;
  valorOficialRfb: string;
  valorLocal: string;
  diferencaAbsoluta: string;
  causaProvavel: CausaDivergenciaRtc;
}

export interface MetadadosVersaoParidade {
  versaoAplicacaoRfb?: string;
  versaoBaseDadosRfb?: string;
  motorLocalVersao: string;
  comparadoEm: string;
}

export interface RelatorioParidadeRfb {
  paridadeTotal: boolean;
  qtdItensComparados: number;
  qtdDivergencias: number;
  maiorDesvioAbsoluto: string;
  divergencias: DivergenciaItemParidade[];
  metadadosVersao: MetadadosVersaoParidade;
}

export interface OpcoesComparacaoParidade {
  toleranciaCentavos?: number; // Padrão: 0.00 (tolerância estrita de zero centavos)
  motorLocalVersao?: string;
}

export interface EntradaCálculoPadronizada {
  totais: {
    baseCalculoTotal?: string | number;
    valorIbsEstadualTotal?: string | number;
    valorIbsMunicipalTotal?: string | number;
    valorIbsTotal?: string | number;
    valorCbsTotal?: string | number;
    valorImpostoSeletivoTotal?: string | number;
    valorTributosTotal?: string | number;
  };
  itens: Array<{
    numero: number;
    estadoItem?: string;
    baseCalculo?: string | number;
    valorIbsEstadual?: string | number;
    valorIbsMunicipal?: string | number;
    valorIbsTotal?: string | number;
    valorCbs?: string | number;
    valorImpostoSeletivo?: string | number;
    valorTributosTotal?: string | number;
  }>;
  versaoMotor?: string;
  versaoBaseDados?: string;
}

function toDec(val: string | number | undefined | null): Decimal {
  if (val === undefined || val === null || val === '') return new DecimalHalfEven(0);
  return new DecimalHalfEven(val);
}

function normalizarEntradaParaParidade(input: any): EntradaCálculoPadronizada {
  if (!input) {
    return { totais: {}, itens: [] };
  }

  // Se já for estrutura normalizada de Regime Regular
  if (input.totais && input.itens) {
    return {
      totais: {
        baseCalculoTotal: input.totais.baseCalculoTotal,
        valorIbsEstadualTotal: input.totais.valorIbsEstadualTotal,
        valorIbsMunicipalTotal: input.totais.valorIbsMunicipalTotal,
        valorIbsTotal: input.totais.valorIbsTotal ?? input.totais.valorIbsSnTotal,
        valorCbsTotal: input.totais.valorCbsTotal ?? input.totais.valorCbsSnTotal,
        valorImpostoSeletivoTotal: input.totais.valorImpostoSeletivoTotal,
        valorTributosTotal: input.totais.valorTributosTotal ?? input.totais.valorTributosSnTotal,
      },
      itens: (input.itens || []).map((it: any) => ({
        numero: it.numero,
        estadoItem: it.estadoItem,
        baseCalculo: it.baseCalculo,
        valorIbsEstadual: it.valorIbsEstadual,
        valorIbsMunicipal: it.valorIbsMunicipal,
        valorIbsTotal: it.valorIbsTotal ?? it.valorIbsSn,
        valorCbs: it.valorCbs ?? it.valorCbsSn,
        valorImpostoSeletivo: it.valorImpostoSeletivo,
        valorTributosTotal: it.valorTributosTotal ?? it.valorTributosSn,
      })),
      versaoMotor: input.versaoMotor,
      versaoBaseDados: input.versaoBaseDados,
    };
  }

  // Fallback genérico para objeto simples com totais/itens
  return {
    totais: input.totais || {},
    itens: input.itens || [],
    versaoMotor: input.versaoMotor,
    versaoBaseDados: input.versaoBaseDados,
  };
}

/**
 * Compara o resultado do cálculo oficial da Receita Federal (sidecar RTC) contra o cálculo do motor local,
 * gerando diagnóstico pericial de paridade e apontando causas prováveis de divergência.
 */
export function compararParidadeRtc(
  resultadoOficialRfb: ResultadoCalculoRegimeRegularNormalizado | ResultadoSimplesNormalizado | any,
  resultadoLocal: any,
  opcoes?: OpcoesComparacaoParidade
): RelatorioParidadeRfb {
  const tolerancia = new DecimalHalfEven(opcoes?.toleranciaCentavos ?? 0.0);
  const motorLocalVersao = opcoes?.motorLocalVersao || 'v6.0.0-dag';
  const agora = new Date().toISOString();

  const rfb = normalizarEntradaParaParidade(resultadoOficialRfb);
  const local = normalizarEntradaParaParidade(resultadoLocal);

  const divergencias: DivergenciaItemParidade[] = [];
  let maiorDesvio = new DecimalHalfEven(0);

  // Helper para comparar dois campos decimais
  const compararCampo = (
    numeroItem: number | 'TOTAL',
    campo: string,
    valRfbRaw: any,
    valLocalRaw: any,
    estadoItem?: string,
    bcDivergenteNoItem?: boolean
  ) => {
    const decRfb = toDec(valRfbRaw);
    const decLoc = toDec(valLocalRaw);
    const diff = decRfb.minus(decLoc).abs();

    if (diff.greaterThan(tolerancia)) {
      if (diff.greaterThan(maiorDesvio)) {
        maiorDesvio = diff;
      }

      let causaProvavel: CausaDivergenciaRtc = 'DIVERGENCIA_ALIQUOTA_OU_REDUCAO';

      if (estadoItem && estadoItem !== 'CALCULADO') {
        causaProvavel = 'ITEM_NAO_CALCULADO_RFB';
      } else if (campo === 'vBC') {
        causaProvavel = 'DIVERGENCIA_BASE_CALCULO';
      } else if (diff.lessThanOrEqualTo(new DecimalHalfEven(0.02))) {
        causaProvavel = 'ARREDONDAMENTO_HALF_EVEN';
      } else if (bcDivergenteNoItem) {
        causaProvavel = 'DIVERGENCIA_BASE_CALCULO';
      }

      divergencias.push({
        numeroItem,
        campo,
        valorOficialRfb: decRfb.toFixed(2),
        valorLocal: decLoc.toFixed(2),
        diferencaAbsoluta: diff.toFixed(2),
        causaProvavel,
      });
    }
  };

  // 1. Comparação Item a Item
  const maxItens = Math.max(rfb.itens.length, local.itens.length);
  const mapLocalPorNumero = new Map<number, any>();
  for (const it of local.itens) {
    mapLocalPorNumero.set(it.numero, it);
  }

  for (const itRfb of rfb.itens) {
    const itLocal = mapLocalPorNumero.get(itRfb.numero) || {};
    const nItem = itRfb.numero;

    const bcRfb = toDec(itRfb.baseCalculo);
    const bcLoc = toDec(itLocal.baseCalculo);
    const bcDivergente = bcRfb.minus(bcLoc).abs().greaterThan(tolerancia);

    compararCampo(nItem, 'vBC', itRfb.baseCalculo, itLocal.baseCalculo, itRfb.estadoItem);
    compararCampo(nItem, 'vIBSUF', itRfb.valorIbsEstadual, itLocal.valorIbsEstadual, itRfb.estadoItem, bcDivergente);
    compararCampo(nItem, 'vIBSMun', itRfb.valorIbsMunicipal, itLocal.valorIbsMunicipal, itRfb.estadoItem, bcDivergente);
    compararCampo(nItem, 'vIBS', itRfb.valorIbsTotal, itLocal.valorIbsTotal, itRfb.estadoItem, bcDivergente);
    compararCampo(nItem, 'vCBS', itRfb.valorCbs, itLocal.valorCbs, itRfb.estadoItem, bcDivergente);
    compararCampo(nItem, 'vIS', itRfb.valorImpostoSeletivo, itLocal.valorImpostoSeletivo, itRfb.estadoItem, bcDivergente);
    compararCampo(nItem, 'totalTributosRtc', itRfb.valorTributosTotal, itLocal.valorTributosTotal, itRfb.estadoItem, bcDivergente);
  }

  // 2. Comparação dos Totalizadores da Nota
  const totRfb = rfb.totais;
  const totLoc = local.totais;

  const bcTotRfb = toDec(totRfb.baseCalculoTotal);
  const bcTotLoc = toDec(totLoc.baseCalculoTotal);
  const bcTotDivergente = bcTotRfb.minus(bcTotLoc).abs().greaterThan(tolerancia);

  compararCampo('TOTAL', 'baseCalculoTotal', totRfb.baseCalculoTotal, totLoc.baseCalculoTotal);
  compararCampo('TOTAL', 'valorIbsEstadualTotal', totRfb.valorIbsEstadualTotal, totLoc.valorIbsEstadualTotal, undefined, bcTotDivergente);
  compararCampo('TOTAL', 'valorIbsMunicipalTotal', totRfb.valorIbsMunicipalTotal, totLoc.valorIbsMunicipalTotal, undefined, bcTotDivergente);
  compararCampo('TOTAL', 'valorIbsTotal', totRfb.valorIbsTotal, totLoc.valorIbsTotal, undefined, bcTotDivergente);
  compararCampo('TOTAL', 'valorCbsTotal', totRfb.valorCbsTotal, totLoc.valorCbsTotal, undefined, bcTotDivergente);
  compararCampo('TOTAL', 'valorImpostoSeletivoTotal', totRfb.valorImpostoSeletivoTotal, totLoc.valorImpostoSeletivoTotal, undefined, bcTotDivergente);
  compararCampo('TOTAL', 'valorTributosTotal', totRfb.valorTributosTotal, totLoc.valorTributosTotal, undefined, bcTotDivergente);

  return {
    paridadeTotal: divergencias.length === 0,
    qtdItensComparados: maxItens,
    qtdDivergencias: divergencias.length,
    maiorDesvioAbsoluto: maiorDesvio.toFixed(2),
    divergencias,
    metadadosVersao: {
      versaoAplicacaoRfb: rfb.versaoMotor || resultadoOficialRfb?.versaoMotor,
      versaoBaseDadosRfb: rfb.versaoBaseDados || resultadoOficialRfb?.versaoBaseDados,
      motorLocalVersao,
      comparadoEm: agora,
    },
  };
}
