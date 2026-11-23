/**
 * Camada de Precisão Numérica Fiscal — Alinhada ao ADR003 da Receita Federal do Brasil (RTC)
 *
 * Utiliza o algoritmo Banker's Rounding (ROUND_HALF_EVEN) com 28 dígitos de precisão,
 * evitando discrepâncias de ponto flutuante IEEE 754 e garantindo conformidade
 * com a Calculadora RTC e interoperabilidade com backends em Java/Go.
 */

import Decimal from 'decimal.js';

// Instâncias isoladas para não contaminar a configuração global do Decimal
export const DecimalHalfEven = Decimal.clone({
  rounding: Decimal.ROUND_HALF_EVEN,
  precision: 28,
});

export const DecimalHalfUp = Decimal.clone({
  rounding: Decimal.ROUND_HALF_UP,
  precision: 28,
});

/**
 * Arredonda valor monetário conforme ADR003 da RFB (HALF_EVEN para 2 casas decimais).
 * Retorna string formatada fixa (ex.: "93.17"), ideal para tráfego JSON e mensageria fiscal.
 */
export function arredondarMoedaRfb(valor: string | number): string {
  if (valor === undefined || valor === null || valor === '') return '0.00';
  const d = new DecimalHalfEven(valor);
  if (!d.isFinite()) return '0.00';
  return d.toFixed(2);
}

/**
 * Retorna o valor monetário arredondado como número JS (para computações numéricas locais).
 */
export function arredondarMoedaRfbNum(valor: string | number): number {
  return Number(arredondarMoedaRfb(valor));
}

/**
 * Formata alíquota percentual preservando a precisão necessária sem truncamento prematuro.
 */
export function arredondarAliquotaRfb(valor: string | number, casas: number = 4): string {
  if (valor === undefined || valor === null || valor === '') return '0.00';
  const d = new DecimalHalfEven(valor);
  if (!d.isFinite()) return '0.00';
  return d.toFixed(casas);
}

/**
 * Soma item a item já arredondados individualmente em 2 casas (HALF_EVEN),
 * conforme a regra estrita de fechamento de totais da NF-e e do ADR003 da RFB.
 */
export function somarDecimaisRfb(valores: Array<string | number>): string {
  let total = new DecimalHalfEven(0);
  for (const v of valores) {
    const itemArredondado = arredondarMoedaRfb(v);
    total = total.plus(new DecimalHalfEven(itemArredondado));
  }
  return total.toFixed(2);
}

/**
 * Multiplica base e alíquota percentual (ex: valor * (aliq / 100)) com precisão de 28 dígitos
 * e arredonda o resultado em HALF_EVEN para 2 casas.
 */
export function calcularTributoRfb(base: string | number, aliqPct: string | number): string {
  const b = new DecimalHalfEven(base || 0);
  const a = new DecimalHalfEven(aliqPct || 0).dividedBy(100);
  return b.times(a).toFixed(2);
}
