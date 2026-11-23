import {
  arredondarMoedaRfb,
  arredondarMoedaRfbNum,
} from '../../math/decimal-fiscal';

export interface ItemSimplesNormalizado {
  numero: number;
  estadoItem: string;
  cAtivSN?: string;
  cClassTrib?: string;
  baseCalculo: string;
  aliquotaCbsSn?: string;
  valorCbsSn: string;
  aliquotaIbsSn?: string;
  valorIbsSn: string;
  valorTributosSn: string;
  erros?: Array<{ code?: string; title?: string; detail: string; pointer?: string }>;
}

export interface ResultadoSimplesNormalizado {
  origemCalculo: 'OFICIAL_RFB' | 'FALLBACK_LOCAL_ESTIMADO';
  versaoMotor?: string;
  versaoBaseDados?: string;
  aviso?: string;
  duracaoMs: number;
  totais: {
    baseCalculoTotal: string;
    valorCbsSnTotal: string;
    valorIbsSnTotal: string;
    valorTributosSnTotal: string;
  };
  itens: ItemSimplesNormalizado[];
  raw?: any;
}

/**
 * Normaliza o retorno da observabilidade do Simples Nacional da Receita Federal.
 */
export function normalizarRespostaSimples(
  data: any,
  duracaoMs: number,
  headers?: Headers
): ResultadoSimplesNormalizado {
  const objetos = Array.isArray(data?.objetos) ? data.objetos : [];

  const itens: ItemSimplesNormalizado[] = objetos.map((obj: any) => {
    const estadoItem = obj.estadoItem || (obj.erros && obj.erros.length > 0 ? 'INCONSISTENCIA_ENTRADA' : 'CALCULADO');
    const ibscbs = obj.tribCalc?.IBSCBSSN || obj.tribCalc?.IBSCBS;
    const gIbscbs = ibscbs?.gIBSCBSSN || ibscbs?.gIBSCBS;

    const baseCalculo = arredondarMoedaRfb(gIbscbs?.vBC || obj.baseCalculo || '0.00');
    const aliquotaCbsSn = gIbscbs?.pCBSSN || gIbscbs?.gCBS?.pCBS;
    const valorCbsSn = arredondarMoedaRfb(gIbscbs?.vCBSSN || gIbscbs?.gCBS?.vCBS || '0.00');
    const aliquotaIbsSn = gIbscbs?.pIBSSN || gIbscbs?.vIBS;
    const valorIbsSn = arredondarMoedaRfb(gIbscbs?.vIBSSN || gIbscbs?.vIBS || '0.00');
    const valorTributosSn = arredondarMoedaRfb(
      arredondarMoedaRfbNum(valorCbsSn) + arredondarMoedaRfbNum(valorIbsSn)
    );

    return {
      numero: obj.nObj ?? obj.numero ?? 1,
      estadoItem,
      cAtivSN: obj.cAtivSN,
      cClassTrib: ibscbs?.cClassTrib,
      baseCalculo,
      aliquotaCbsSn,
      valorCbsSn,
      aliquotaIbsSn,
      valorIbsSn,
      valorTributosSn,
      erros: obj.erros?.map((e: any) => ({
        code: e.code,
        title: e.title,
        detail: e.detail || e.mensagem || 'Inconsistência no item',
        pointer: e.pointer,
      })),
    };
  });

  const totalTrib = data?.total?.tribCalc?.IBSCBSTot || data?.total?.tribCalc?.IBSCBSSNTot;
  let baseCalculoTotal = totalTrib?.vBCIBSCBS ? arredondarMoedaRfb(totalTrib.vBCIBSCBS) : '0.00';
  let valorCbsSnTotal = totalTrib?.gCBS?.vCBS ? arredondarMoedaRfb(totalTrib.gCBS.vCBS) : '0.00';
  let valorIbsSnTotal = totalTrib?.gIBS?.vIBS ? arredondarMoedaRfb(totalTrib.gIBS.vIBS) : '0.00';

  if (baseCalculoTotal === '0.00' && itens.length > 0) {
    const sumBc = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.baseCalculo), 0);
    const sumCbs = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorCbsSn), 0);
    const sumIbs = itens.reduce((acc, it) => acc + arredondarMoedaRfbNum(it.valorIbsSn), 0);

    baseCalculoTotal = arredondarMoedaRfb(sumBc);
    valorCbsSnTotal = arredondarMoedaRfb(sumCbs);
    valorIbsSnTotal = arredondarMoedaRfb(sumIbs);
  }

  const valorTributosSnTotal = arredondarMoedaRfb(
    arredondarMoedaRfbNum(valorCbsSnTotal) + arredondarMoedaRfbNum(valorIbsSnTotal)
  );

  return {
    origemCalculo: 'OFICIAL_RFB',
    versaoMotor: headers?.get('x-calc-app-version') || headers?.get('x-version') || data?.versao || '3.0.0',
    versaoBaseDados: headers?.get('x-calc-db-version') || undefined,
    duracaoMs,
    totais: {
      baseCalculoTotal,
      valorCbsSnTotal,
      valorIbsSnTotal,
      valorTributosSnTotal,
    },
    itens,
    raw: data,
  };
}
