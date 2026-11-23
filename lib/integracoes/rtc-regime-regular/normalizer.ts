import {
  arredondarMoedaRfb,
  arredondarMoedaRfbNum,
} from '../../math/decimal-fiscal';
import type { ROCDomainRfb } from './schema';

export interface ItemCalculadoNormalizado {
  numero: number;
  estadoItem: string;
  cst?: string;
  cClassTrib?: string;
  baseCalculo: string;
  aliquotaIbsEstadual?: string;
  valorIbsEstadual: string;
  aliquotaIbsMunicipal?: string;
  valorIbsMunicipal: string;
  valorIbsTotal: string;
  aliquotaCbs?: string;
  valorCbs: string;
  valorImpostoSeletivo: string;
  erros?: Array<{ code?: string; title?: string; detail: string }>;
}

export interface ResultadoCalculoRegimeRegularNormalizado {
  origemCalculo: 'OFICIAL_RFB' | 'FALLBACK_LOCAL_ESTIMADO';
  versaoMotor?: string;
  versaoBaseDados?: string;
  aviso?: string;
  duracaoMs: number;
  totais: {
    baseCalculoTotal: string;
    valorIbsEstadualTotal: string;
    valorIbsMunicipalTotal: string;
    valorIbsTotal: string;
    valorCbsTotal: string;
    valorImpostoSeletivoTotal: string;
    valorTributosTotal: string;
  };
  itens: ItemCalculadoNormalizado[];
  rawRoc?: any;
}

/**
 * Normaliza o payload de resposta oficial do ROC da Receita Federal aplicando HALF_EVEN (ADR003).
 */
export function normalizarRespostaRoc(
  roc: ROCDomainRfb,
  duracaoMs: number,
  headers?: Headers
): ResultadoCalculoRegimeRegularNormalizado {
  const itens: ItemCalculadoNormalizado[] = (roc.objetos || []).map((obj) => {
    const estadoItem = obj.estadoItem || (obj.erros && obj.erros.length > 0 ? 'INCONSISTENCIA_ENTRADA' : 'CALCULADO');
    const ibscbs = obj.tribCalc?.IBSCBS;
    const gIbsCbs = ibscbs?.gIBSCBS;

    const baseCalculo = arredondarMoedaRfb(gIbsCbs?.vBC || '0.00');
    const valorIbsEstadual = arredondarMoedaRfb(gIbsCbs?.gIBSUF?.vIBSUF || '0.00');
    const valorIbsMunicipal = arredondarMoedaRfb(gIbsCbs?.gIBSMun?.vIBSMun || '0.00');
    const valorIbsTotal = arredondarMoedaRfb(gIbsCbs?.vIBS || Number(valorIbsEstadual) + Number(valorIbsMunicipal));
    const valorCbs = arredondarMoedaRfb(gIbsCbs?.gCBS?.vCBS || '0.00');
    const valorImpostoSeletivo = arredondarMoedaRfb(obj.tribCalc?.IS?.vIS || '0.00');

    return {
      numero: obj.nObj,
      estadoItem,
      cst: ibscbs?.CST,
      cClassTrib: ibscbs?.cClassTrib,
      baseCalculo,
      aliquotaIbsEstadual: gIbsCbs?.gIBSUF?.pIBSUF,
      valorIbsEstadual,
      aliquotaIbsMunicipal: gIbsCbs?.gIBSMun?.pIBSMun,
      valorIbsMunicipal,
      valorIbsTotal,
      aliquotaCbs: gIbsCbs?.gCBS?.pCBS,
      valorCbs,
      valorImpostoSeletivo,
      erros: obj.erros?.map((e) => ({ code: e.code, title: e.title, detail: e.detail })),
    };
  });

  const totIbscbs = roc.total?.tribCalc?.IBSCBSTot;
  const totIs = roc.total?.tribCalc?.ISTot;

  // Totais consolidados
  let baseCalculoTotal = totIbscbs?.vBCIBSCBS ? arredondarMoedaRfb(totIbscbs.vBCIBSCBS) : '0.00';
  let valorIbsTotal = totIbscbs?.gIBS?.vIBS ? arredondarMoedaRfb(totIbscbs.gIBS.vIBS) : '0.00';
  let valorCbsTotal = totIbscbs?.gCBS?.vCBS ? arredondarMoedaRfb(totIbscbs.gCBS.vCBS) : '0.00';
  let valorIsTotal = totIs?.vIS ? arredondarMoedaRfb(totIs.vIS) : '0.00';

  // Se o total agregado não veio, totaliza a partir dos itens calculados
  if (baseCalculoTotal === '0.00' && itens.length > 0) {
    const sumBc = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.baseCalculo), 0);
    const sumIbs = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorIbsTotal), 0);
    const sumCbs = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorCbs), 0);
    const sumIs = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorImpostoSeletivo), 0);

    baseCalculoTotal = arredondarMoedaRfb(sumBc);
    valorIbsTotal = arredondarMoedaRfb(sumIbs);
    valorCbsTotal = arredondarMoedaRfb(sumCbs);
    valorIsTotal = arredondarMoedaRfb(sumIs);
  }

  const sumIbsUf = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorIbsEstadual), 0);
  const sumIbsMun = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorIbsMunicipal), 0);
  const valorTributosTotal = arredondarMoedaRfb(
    arredondarMoedaRfbNum(valorIbsTotal) +
      arredondarMoedaRfbNum(valorCbsTotal) +
      arredondarMoedaRfbNum(valorIsTotal)
  );

  return {
    origemCalculo: 'OFICIAL_RFB',
    versaoMotor: headers?.get('x-calc-app-version') || headers?.get('x-version') || roc.versao || '1.0.0',
    versaoBaseDados: headers?.get('x-calc-db-version') || undefined,
    duracaoMs,
    totais: {
      baseCalculoTotal,
      valorIbsEstadualTotal: arredondarMoedaRfb(sumIbsUf),
      valorIbsMunicipalTotal: arredondarMoedaRfb(sumIbsMun),
      valorIbsTotal,
      valorCbsTotal,
      valorImpostoSeletivoTotal: valorIsTotal,
      valorTributosTotal,
    },
    itens,
    rawRoc: roc,
  };
}
