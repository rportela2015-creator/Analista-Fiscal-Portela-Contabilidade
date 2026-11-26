/**
 * Motor de Precificação Dual-Stack 2026–2027 e Mesa de Compras do Paraná (RICMS/PR)
 *
 * Funções puras e determinísticas para:
 *  A) CMV Líquido por Regime Tributário (CPC 16 / NBC TG 16 / Lei nº 14.592/2023)
 *  B) Preço de Venda pelo Mark-Up Divisor com exclusão Tema 69/STF (RE 574.706/PR)
 *  C) Simulação Dual-Stack 2027 (Consulta SEFA/PR nº 48/2026 × Tese Judicial de Exclusão)
 *  D) Simulador da Mesa de Compras PR (Custo Efetivo Aterrissado com ST / DIFAL / Custo Financeiro)
 *  E) Simulação de Virada de Combustíveis Monofásicos Ad Rem em 01/02/2027 (Convênios 127/2026 e 128/2026)
 */

import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from './matriz-icms-pr';
import { consultarMvaStPr } from './tabelas-pr';
import { calcularIcmsStPR, r2, r4 } from './icms-pr-regras';
import { apurarDifalEntradaPR } from './difal-pr';

// ============================================================================
// A) CMV LÍQUIDO POR REGIME TRIBUTÁRIO (CPC 16 / NBC TG 16)
// ============================================================================

export type RegimeComprador = 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES_NACIONAL' | 'MEI';

export interface EntradaCmvLiquidoPR {
  valorProdutos: number;
  vFrete?: number;
  vSeg?: number;
  vOutro?: number;
  vDesc?: number;
  vIpi?: number;
  vIcmsOrigem?: number;
  vIcmsStEntrada?: number;
  vDifalOuAntecipacaoEntrada?: number;
  vFecopEntrada?: number;
  vCredIcmsSn?: number;
  regimeComprador: RegimeComprador;
  ehIndustria?: boolean;
  aplicarTema69CreditoPisCofins?: boolean; // default true (Lei nº 14.592/2023)
  aliquotaPisCofinsCreditoPct?: number; // default 9.25 no Lucro Real
  percentualEstornoAnexoVI?: number; // default 0
  mercadoriaComStParaRevenda?: boolean;
}

export interface ResultadoCmvLiquidoPR {
  valorTotalNotaEntrada: number;
  creditoIcmsLiquido: number;
  baseCreditoPisCofins: number;
  creditoPisCofins: number;
  creditoIpi: number;
  tributosNaoRecuperaveisIncorporados: number;
  cmvLiquido: number;
  fundamentacao: string;
  memoriaCalculo: string[];
}

/**
 * Calcula o CMV Líquido (Custo das Mercadorias Vendidas / Custo de Estoque)
 * segundo NBC TG 16 (CPC 16, R1) e regras do Paraná e federais (Lei 14.592/2023).
 */
export function calcularCmvLiquidoPR(input: EntradaCmvLiquidoPR): ResultadoCmvLiquidoPR {
  const vProd = Number(input.valorProdutos || 0);
  const vFrete = Number(input.vFrete || 0);
  const vSeg = Number(input.vSeg || 0);
  const vOutro = Number(input.vOutro || 0);
  const vDesc = Number(input.vDesc || 0);
  const vIpi = Number(input.vIpi || 0);
  const vIcmsOrigem = Number(input.vIcmsOrigem || 0);
  const vIcmsStEntrada = Number(input.vIcmsStEntrada || 0);
  const vDifalOuAntecipacaoEntrada = Number(input.vDifalOuAntecipacaoEntrada || 0);
  const vFecopEntrada = Number(input.vFecopEntrada || 0);
  const vCredIcmsSn = Number(input.vCredIcmsSn || 0);
  const aplicarTema69 = input.aplicarTema69CreditoPisCofins !== false;
  const aliqPisCofCred = Number(input.aliquotaPisCofinsCreditoPct ?? 9.25);
  const estornoAnexoVI = Number(input.percentualEstornoAnexoVI ?? 0);

  const memoriaCalculo: string[] = [];

  const valorTotalNotaEntrada = r2(
    vProd - vDesc + vFrete + vSeg + vOutro + vIpi + vIcmsStEntrada + vDifalOuAntecipacaoEntrada + vFecopEntrada
  );
  memoriaCalculo.push(`Valor Total da Entrada: R$ ${valorTotalNotaEntrada.toFixed(2)}`);

  let creditoIcmsLiquido = 0;
  let baseCreditoPisCofins = 0;
  let creditoPisCofins = 0;
  let creditoIpi = 0;

  if (input.regimeComprador === 'LUCRO_REAL') {
    // Crédito ICMS: se mercadoria com ST para revenda, adquirente não toma crédito
    if (!input.mercadoriaComStParaRevenda) {
      const icmsBase = vIcmsOrigem > 0 ? vIcmsOrigem : vCredIcmsSn;
      creditoIcmsLiquido = r2(icmsBase * (1 - estornoAnexoVI / 100));
    }

    // PIS/COFINS (Lei 14.592/2023 - Tema 69 STF no Crédito de Entrada)
    const baseBrutaAquisicao = vProd - vDesc + vFrete + vSeg + vOutro;
    baseCreditoPisCofins = aplicarTema69
      ? Math.max(0, baseBrutaAquisicao - vIcmsOrigem)
      : baseBrutaAquisicao;
    creditoPisCofins = r2(baseCreditoPisCofins * (aliqPisCofCred / 100));

    // IPI recuperável apenas se indústria
    creditoIpi = input.ehIndustria ? vIpi : 0;

    memoriaCalculo.push(`Lucro Real: Crédito ICMS = R$ ${creditoIcmsLiquido.toFixed(2)} (estorno Anexo VI: ${estornoAnexoVI}%)`);
    memoriaCalculo.push(`Lucro Real: Base PIS/COFINS = R$ ${baseCreditoPisCofins.toFixed(2)} (exclusão ICMS: ${aplicarTema69}) ➔ Crédito: R$ ${creditoPisCofins.toFixed(2)} (${aliqPisCofCred}%)`);
    if (creditoIpi > 0) memoriaCalculo.push(`Lucro Real (Indústria): Crédito IPI = R$ ${creditoIpi.toFixed(2)}`);
  } else if (input.regimeComprador === 'LUCRO_PRESUMIDO') {
    if (!input.mercadoriaComStParaRevenda) {
      const icmsBase = vIcmsOrigem > 0 ? vIcmsOrigem : vCredIcmsSn;
      creditoIcmsLiquido = r2(icmsBase * (1 - estornoAnexoVI / 100));
    }
    creditoPisCofins = 0; // Cumulativo - sem crédito
    creditoIpi = input.ehIndustria ? vIpi : 0;

    memoriaCalculo.push(`Lucro Presumido: Crédito ICMS = R$ ${creditoIcmsLiquido.toFixed(2)}; PIS/COFINS cumulativo sem crédito.`);
    if (creditoIpi > 0) memoriaCalculo.push(`Lucro Presumido (Indústria): Crédito IPI = R$ ${creditoIpi.toFixed(2)}`);
  } else {
    // SIMPLES_NACIONAL ou MEI
    creditoIcmsLiquido = 0;
    creditoPisCofins = 0;
    creditoIpi = 0;
    memoriaCalculo.push(`${input.regimeComprador}: Tributos de entrada não recuperáveis. Custos fiscais incorporados 100% ao CMV.`);
  }

  const cmvLiquido = r2(valorTotalNotaEntrada - creditoIcmsLiquido - creditoPisCofins - creditoIpi);
  const tributosNaoRecuperaveisIncorporados = r2(
    vIpi - creditoIpi + vIcmsStEntrada + vDifalOuAntecipacaoEntrada + vFecopEntrada + (vIcmsOrigem - creditoIcmsLiquido)
  );

  memoriaCalculo.push(`CMV Líquido = R$ ${valorTotalNotaEntrada.toFixed(2)} - R$ ${creditoIcmsLiquido.toFixed(2)} - R$ ${creditoPisCofins.toFixed(2)} - R$ ${creditoIpi.toFixed(2)} = R$ ${cmvLiquido.toFixed(2)}`);

  return {
    valorTotalNotaEntrada,
    creditoIcmsLiquido,
    baseCreditoPisCofins,
    creditoPisCofins,
    creditoIpi,
    tributosNaoRecuperaveisIncorporados,
    cmvLiquido,
    fundamentacao: 'NBC TG 16 (CPC 16, R1) — Item 11; Lei Federal nº 14.592/2023 (Tema 69 STF no Crédito PIS/COFINS); RICMS/PR.',
    memoriaCalculo,
  };
}

// ============================================================================
// B) PREÇO DE VENDA 2026 PELO MARK-UP DIVISOR COM TEMA 69 STF
// ============================================================================

export interface EntradaPrecoVenda2026PR {
  cmvLiquido: number;
  aliquotaIcmsEfetivaSaidaPct: number;
  aliquotaPisCofinsSaidaPct: number;
  despesasVariaveisPct: number;
  margemAlvoPct: number;
  aplicarTema69Saida?: boolean; // default true
}

export interface ResultadoPrecoVenda2026PR {
  cmvLiquido: number;
  divisor: number;
  markupMultiplicador: number;
  precoVenda: number;
  valorIcmsSaida: number;
  basePisCofinsSaida: number;
  valorPisCofinsSaida: number;
  valorDespesasVariaveis: number;
  valorMargemLiquida: number;
  fundamentacao: string;
  memoriaCalculo: string[];
}

/**
 * Calcula o Preço de Venda pelo Mark-Up Divisor com exclusão do ICMS da base do PIS/COFINS
 * (Tema 69 STF — RE 574.706/PR).
 */
export function calcularPrecoVenda2026PR(input: EntradaPrecoVenda2026PR): ResultadoPrecoVenda2026PR {
  const aplicarTema69 = input.aplicarTema69Saida !== false;
  const icmsDec = input.aliquotaIcmsEfetivaSaidaPct / 100;
  const pisCofinsNominalDec = input.aliquotaPisCofinsSaidaPct / 100;
  const pisCofinsEfetivoDec = aplicarTema69
    ? pisCofinsNominalDec * (1 - icmsDec)
    : pisCofinsNominalDec;
  const despDec = input.despesasVariaveisPct / 100;
  const margemDec = input.margemAlvoPct / 100;

  const divisorRaw = 1 - icmsDec - pisCofinsEfetivoDec - despDec - margemDec;
  const divisor = Math.round((divisorRaw + 1e-9) * 1000000) / 1000000;
  const memoriaCalculo: string[] = [];

  memoriaCalculo.push(`CMV Líquido: R$ ${input.cmvLiquido.toFixed(2)}`);
  memoriaCalculo.push(`ICMS Efetivo Saída: ${input.aliquotaIcmsEfetivaSaidaPct}%`);
  memoriaCalculo.push(
    `PIS/COFINS Nominal: ${input.aliquotaPisCofinsSaidaPct}% ➔ Efetivo s/ ICMS (Tema 69): ${(pisCofinsEfetivoDec * 100).toFixed(6)}%`
  );
  memoriaCalculo.push(`Despesas Variáveis: ${input.despesasVariaveisPct}% | Margem Alvo: ${input.margemAlvoPct}%`);
  memoriaCalculo.push(`Divisor Mark-Up = 1 - ${icmsDec} - ${pisCofinsEfetivoDec.toFixed(6)} - ${despDec} - ${margemDec} = ${divisor.toFixed(6)}`);

  if (divisor <= 0.01) {
    throw new Error(
      `Mark-Up Divisor inválido (${divisor.toFixed(4)}): a soma dos tributos e margem ultrapassa 99%. Reduza a margem ou custos.`
    );
  }

  const precoVenda = r2(input.cmvLiquido / divisor);
  const valorIcmsSaida = r2(precoVenda * icmsDec);
  const basePisCofinsSaida = aplicarTema69 ? r2(precoVenda - valorIcmsSaida) : precoVenda;
  const valorPisCofinsSaida = r2(basePisCofinsSaida * pisCofinsNominalDec);
  const valorDespesasVariaveis = r2(precoVenda * despDec);
  const valorMargemLiquida = r2(precoVenda - input.cmvLiquido - valorIcmsSaida - valorPisCofinsSaida - valorDespesasVariaveis);
  const markupMultiplicador = r2(precoVenda / Math.max(0.01, input.cmvLiquido));

  memoriaCalculo.push(`Preço de Venda = R$ ${precoVenda.toFixed(2)} (Multiplicador: ${markupMultiplicador.toFixed(2)}x)`);
  memoriaCalculo.push(`ICMS Saída: R$ ${valorIcmsSaida.toFixed(2)} | PIS/COFINS: R$ ${valorPisCofinsSaida.toFixed(2)}`);
  memoriaCalculo.push(`Margem Líquida Realizada: R$ ${valorMargemLiquida.toFixed(2)}`);

  return {
    cmvLiquido: input.cmvLiquido,
    divisor: Math.round(divisor * 1000000) / 1000000,
    markupMultiplicador,
    precoVenda,
    valorIcmsSaida,
    basePisCofinsSaida,
    valorPisCofinsSaida,
    valorDespesasVariaveis,
    valorMargemLiquida,
    fundamentacao: 'Mark-Up Divisor com Exclusão do ICMS da Base do PIS/COFINS (Tema 69 STF — RE 574.706/PR).',
    memoriaCalculo,
  };
}

// ============================================================================
// C) SIMULAÇÃO DUAL-STACK 2027 — CONSULTA SEFA/PR 48/2026 VS. TESE JUDICIAL
// ============================================================================

export interface EntradaDualStack2027PR {
  precoLiquidoSemTributos: number; // P_liq
  aliquotaIcmsPrPct: number; // ex: 19.5
  aliquotaFecopPrPct?: number; // default 0
  aliquotaCbsPct?: number; // default 8.8
  aliquotaIbsPct?: number; // default 0.1
  aliquotaIsPct?: number; // default 0
  incluirIbsCbsBcIcms?: boolean; // feature flag jurídica
}

export interface ResultadoModoDualStack {
  modo: 'consulta_48_sefa' | 'tese_judicial';
  descricao: string;
  baseIcms: number;
  valorIcms: number;
  valorFecop: number;
  valorCbs: number;
  valorIbs: number;
  valorIs: number;
  precoFinal: number;
  fundamentacao: string;
}

export interface ResultadoDualStack2027PR {
  modoAtivo: 'consulta_48_sefa' | 'tese_judicial';
  baseIcmsModo1: number;
  valorIcmsModo1: number;
  valorFecopModo1: number;
  precoFinalModo1: number;
  baseIcmsModo2: number;
  valorIcmsModo2: number;
  valorFecopModo2: number;
  precoFinalModo2: number;
  efeitoCascataReais: number;
  aumentoPercentualIcms: number;
  erosaoMargemPpSePrecoTravado: number;
  modoSefa: ResultadoModoDualStack;
  modoTese: ResultadoModoDualStack;
  memoriaCalculo: string[];
}

/**
 * Simula o Choque Dual-Stack de 2027 entre a posição administrativa da SEFA/PR
 * (Consulta 48/2026: IBS/CBS compõe a base do ICMS por dentro) e a Tese Judicial
 * de exclusão recíproca (análoga ao Tema 69 STF).
 */
export function simularPrecificacaoDualStack2027PR(
  input: EntradaDualStack2027PR
): ResultadoDualStack2027PR {
  const pLiq = input.precoLiquidoSemTributos;
  const aliqIcms = Number(input.aliquotaIcmsPrPct || 0);
  const aliqFecop = Number(input.aliquotaFecopPrPct || 0);
  const aliqCbs = Number(input.aliquotaCbsPct ?? 8.8);
  const aliqIbs = Number(input.aliquotaIbsPct ?? 0.1);
  const aliqIs = Number(input.aliquotaIsPct ?? 0);
  const flagAtiva = input.incluirIbsCbsBcIcms !== false;

  // Parcela "por fora" sem ICMS (Art. 12, § 2º, V LC 214/2025)
  const valorIs = r2(pLiq * (aliqIs / 100));
  const baseIbsCbs = r2(pLiq + valorIs);
  const valorCbs = r2(baseIbsCbs * (aliqCbs / 100));
  const valorIbs = r2(baseIbsCbs * (aliqIbs / 100));

  const aliqEstadualTotalDec = (aliqIcms + aliqFecop) / 100;

  // Modo 1 — Consulta SEFA/PR 48/2026 (IBS/CBS/IS compõem a base do ICMS)
  const baseIcmsModo1 = r2((pLiq + valorCbs + valorIbs + valorIs) / (1 - aliqEstadualTotalDec));
  const valorIcmsModo1 = r2(baseIcmsModo1 * (aliqIcms / 100));
  const valorFecopModo1 = r2(baseIcmsModo1 * (aliqFecop / 100));
  const precoFinalModo1 = r2(pLiq + valorCbs + valorIbs + valorIs + valorIcmsModo1 + valorFecopModo1);

  // Modo 2 — Tese Judicial (IBS/CBS excluídos da base do ICMS)
  const baseIcmsModo2 = r2((pLiq + valorIs) / (1 - aliqEstadualTotalDec));
  const valorIcmsModo2 = r2(baseIcmsModo2 * (aliqIcms / 100));
  const valorFecopModo2 = r2(baseIcmsModo2 * (aliqFecop / 100));
  const precoFinalModo2 = r2(pLiq + valorCbs + valorIbs + valorIs + valorIcmsModo2 + valorFecopModo2);

  // Indicadores de Impacto
  const efeitoCascataReais = r2(precoFinalModo1 - precoFinalModo2);
  const icmsTotalModo1 = valorIcmsModo1 + valorFecopModo1;
  const icmsTotalModo2 = valorIcmsModo2 + valorFecopModo2;
  const aumentoPercentualIcms = r2(((icmsTotalModo1 / Math.max(0.01, icmsTotalModo2)) - 1) * 100);
  const erosaoMargemPpSePrecoTravado = r2((efeitoCascataReais / Math.max(0.01, pLiq)) * 100);

  const memoriaCalculo: string[] = [
    `Preço Líquido sem Tributos: R$ ${pLiq.toFixed(2)}`,
    `Tributos IVA Dual (por fora): CBS ${aliqCbs}% (R$ ${valorCbs.toFixed(2)}) + IBS ${aliqIbs}% (R$ ${valorIbs.toFixed(2)}) + IS ${aliqIs}% (R$ ${valorIs.toFixed(2)})`,
    `Modo 1 (SEFA/PR Consulta 48/2026): Base ICMS = R$ ${baseIcmsModo1.toFixed(2)} ➔ ICMS/FECOP = R$ ${icmsTotalModo1.toFixed(2)} ➔ Preço Final = R$ ${precoFinalModo1.toFixed(2)}`,
    `Modo 2 (Tese Judicial): Base ICMS = R$ ${baseIcmsModo2.toFixed(2)} ➔ ICMS/FECOP = R$ ${icmsTotalModo2.toFixed(2)} ➔ Preço Final = R$ ${precoFinalModo2.toFixed(2)}`,
    `Efeito Cascata: R$ ${efeitoCascataReais.toFixed(2)} | Aumento no ICMS: +${aumentoPercentualIcms.toFixed(2)}% | Erosão de Margem: ${erosaoMargemPpSePrecoTravado.toFixed(2)} p.p.`,
  ];

  return {
    modoAtivo: flagAtiva ? 'consulta_48_sefa' : 'tese_judicial',
    baseIcmsModo1,
    valorIcmsModo1,
    valorFecopModo1,
    precoFinalModo1,
    baseIcmsModo2,
    valorIcmsModo2,
    valorFecopModo2,
    precoFinalModo2,
    efeitoCascataReais,
    aumentoPercentualIcms,
    erosaoMargemPpSePrecoTravado,
    modoSefa: {
      modo: 'consulta_48_sefa',
      descricao: 'Consulta SEFA/PR nº 48/2026: IBS/CBS/IS compõem a base do ICMS (Grossing-up completo)',
      baseIcms: baseIcmsModo1,
      valorIcms: valorIcmsModo1,
      valorFecop: valorFecopModo1,
      valorCbs,
      valorIbs,
      valorIs,
      precoFinal: precoFinalModo1,
      fundamentacao: 'Consulta de Contribuinte SEFA/PR nº 48/2026 e Lei Estadual nº 11.580/1996.',
    },
    modoTese: {
      modo: 'tese_judicial',
      descricao: 'Tese Judicial: Exclusão de IBS e CBS da Base de Cálculo do ICMS (Análogo Tema 69 STF)',
      baseIcms: baseIcmsModo2,
      valorIcms: valorIcmsModo2,
      valorFecop: valorFecopModo2,
      valorCbs,
      valorIbs,
      valorIs,
      precoFinal: precoFinalModo2,
      fundamentacao: 'Precedente RE 574.706/PR (Tema 69 STF) c/c Art. 12, § 2º, V da LC nº 214/2025.',
    },
    memoriaCalculo,
  };
}

// ============================================================================
// D) SIMULADOR DA MESA DE COMPRAS PR (CUSTO EFETIVO ATERRISSADO)
// ============================================================================

export interface CotacaoFornecedorPR {
  id: string;
  nome: string;
  ufEmitente: string;
  crtEmitente: '1' | '2' | '3' | '4' | number;
  origemTabelaA?: number | string;
  precoUnitario: number;
  freteUnitario: number;
  vIpiUnitario: number;
  temProtocoloSt?: boolean;
  pCredSnPct?: number;
}

export interface EntradaComparativoFornecedoresPR {
  regimeComprador: RegimeComprador;
  ncm: string;
  cest?: string;
  dataFatoGerador: string;
  sujeitoStPr?: boolean;
  mvaOriginalPct?: number;
  pmpf?: number;
  taxaCapitalGiroMensalPct?: number; // default 1.5%
  prazoMedioEstoqueDias?: number; // default 45 dias
  cotacoes: CotacaoFornecedorPR[];
}

export interface CotacaoResultadoAterrissadoPR {
  id: string;
  nome: string;
  ufEmitente: string;
  crtEmitente: string;
  precoUnitario: number;
  freteUnitario: number;
  vIpiUnitario: number;
  icmsDestacadoOuCredito: number;
  icmsStEntrada: number;
  antecipacaoArt16: number;
  cmvLiquido: number;
  desembolsoAntecipadoCaixa: number;
  custoCapitalGiro: number;
  custoEfetivoAterrissado: number;
  justificativaTributaria: string;
}

export interface ResultadoComparativoFornecedoresPR {
  cotacoesRanqueadas: CotacaoResultadoAterrissadoPR[];
  melhorOpcao: CotacaoResultadoAterrissadoPR;
  piorOpcao: CotacaoResultadoAterrissadoPR;
  economiaVsPiorReais: number;
  economiaVsPiorPct: number;
  memoriaCalculo: string[];
}

/**
 * Mesa de Compras PR: calcula e ranqueia as cotações pelo Custo Efetivo Aterrissado,
 * considerando ICMS próprio, ICMS-ST, Antecipação Art. 16 e o Custo de Oportunidade
 * do Capital de Giro imobilizado nas guias antecipadas.
 */
export function compararFornecedoresCustoAterrissadoPR(
  input: EntradaComparativoFornecedoresPR
): ResultadoComparativoFornecedoresPR {
  const taxaCap = Number(input.taxaCapitalGiroMensalPct ?? 1.5) / 100;
  const prazoEstoque = Number(input.prazoMedioEstoqueDias ?? 45);
  const fatorCapGiro = taxaCap * (prazoEstoque / 30);
  const memoriaCalculo: string[] = [];

  const resultados: CotacaoResultadoAterrissadoPR[] = input.cotacoes.map((c) => {
    const isInterna = c.ufEmitente.toUpperCase() === 'PR';
    const crtE = Number(c.crtEmitente);
    const crtCompradorNum = input.regimeComprador === 'SIMPLES_NACIONAL' ? 1 : (input.regimeComprador === 'MEI' ? 4 : 3);

    let icmsDestacado = 0;
    let icmsStEntrada = 0;
    let antecipacaoArt16 = 0;
    let justificativa = '';

    const aliqPrInfo = resolverAliquotaPrBitemporal(input.ncm, input.dataFatoGerador);
    const aliqInternaPr = aliqPrInfo.ehCombustivelMonofasico ? 0 : aliqPrInfo.aliquotaTotalPct;
    const exclusaoSt = verificarExclusaoStPr(input.ncm, undefined, input.dataFatoGerador);
    const mvaTabela =
      input.mvaOriginalPct ??
      consultarMvaStPr({ ncm: input.ncm, dataFatoGerador: input.dataFatoGerador }).mvaOriginalPct;

    if (isInterna) {
      if (aliqPrInfo.ehCombustivelMonofasico) {
        icmsDestacado = r2((aliqPrInfo.aliquotaAdRem || 0) * 1);
        justificativa = `Operação Interna PR (Combustível Monofásico Ad Rem — ${aliqPrInfo.aliquotaAdRem} ${aliqPrInfo.unidadeAdRem}).`;
      } else if (crtE === 3 && crtCompradorNum === 3 && aliqInternaPr > 12) {
        // Diferimento parcial Art. 28 Anexo VIII: carga 12%
        icmsDestacado = r2(c.precoUnitario * 0.12);
        justificativa = 'Operação Interna PR entre contribuintes normais: Diferimento Parcial para 12% (Art. 28 Anexo VIII).';
      } else {
        icmsDestacado = r2(c.precoUnitario * (aliqInternaPr / 100));
        justificativa = `Operação Interna PR: Alíquota cheia ${aliqInternaPr}%.`;
      }
    } else {
      // Interestadual (ex: SC, SP, etc.)
      const aliqOrigem = ['SC', 'SP', 'RJ', 'MG', 'RS', 'PR'].includes(c.ufEmitente.toUpperCase()) ? 12 : 7;
      icmsDestacado = r2(c.precoUnitario * (aliqOrigem / 100));

      if (input.sujeitoStPr && !exclusaoSt.excluidoDaSt && !aliqPrInfo.ehCombustivelMonofasico && mvaTabela > 0) {
        // Se sujeito à ST no PR
        const calcSt = calcularIcmsStPR({
          vProd: c.precoUnitario,
          vFrete: c.freteUnitario,
          vIpi: c.vIpiUnitario,
          aliqInterestadualPct: aliqOrigem,
          aliqInternaPrPct: aliqPrInfo.aliquotaIcmsPct,
          aliqFecopPrPct: aliqPrInfo.aliquotaFecopPct,
          mvaOriginalPct: mvaTabela,
          pmpf: input.pmpf,
          crtEmitente: crtE,
          ufOrigem: c.ufEmitente,
          ufDestino: 'PR',
          dataFatoGerador: input.dataFatoGerador,
          ncm: input.ncm,
        });
        icmsStEntrada = calcSt.valorTotalRecolherSt;
        justificativa = crtE === 1
          ? `Interestadual ${c.ufEmitente} (Simples Nacional): MVA Original sem ajuste (Convênio ICMS 35/2011). ICMS-ST = R$ ${icmsStEntrada.toFixed(2)}.`
          : `Interestadual ${c.ufEmitente} (Regime Normal): MVA Efetiva ${calcSt.mvaEfetivaPct}%. ICMS-ST = R$ ${icmsStEntrada.toFixed(2)}.`;
      } else {
        // Fora da ST - verificar Antecipação Art. 16 ou DIFAL
        const origNum = Number(c.origemTabelaA ?? 0);
        const ehImportado4 = origNum === 1 || origNum === 2 || origNum === 3 || origNum === 8;
        if (ehImportado4) {
          const apDifal = apurarDifalEntradaPR({
            ncm: input.ncm,
            finalidadeEntrada: 'revenda',
            crtEmitente: crtE,
            crtDestinatario: crtCompradorNum,
            ufEmitente: c.ufEmitente,
            ufDestinatario: 'PR',
            dataFatoGerador: input.dataFatoGerador,
            vProd: c.precoUnitario,
            vFrete: c.freteUnitario,
            vIpi: c.vIpiUnitario,
            pIcmsOrigemPct: 4.0,
            sujeitoStInternaPr: false,
          });
          antecipacaoArt16 = apDifal.valorTotalDebito ?? 0;
          justificativa = `Interestadual ${c.ufEmitente} (Origem 4%): Antecipação Art. 16 RICMS/PR = R$ ${antecipacaoArt16.toFixed(2)}.`;
        }
      }
    }

    // Calcula CMV Líquido com o motor contábil
    const cmvCalc = calcularCmvLiquidoPR({
      valorProdutos: c.precoUnitario,
      vFrete: c.freteUnitario,
      vIpi: c.vIpiUnitario,
      vIcmsOrigem: icmsDestacado,
      vIcmsStEntrada: icmsStEntrada,
      vDifalOuAntecipacaoEntrada: antecipacaoArt16,
      regimeComprador: input.regimeComprador,
      mercadoriaComStParaRevenda: input.sujeitoStPr,
    });

    const desembolsoAntecipadoCaixa = r2(icmsStEntrada + antecipacaoArt16);
    const custoCapitalGiro = r2(desembolsoAntecipadoCaixa * fatorCapGiro);
    const custoEfetivoAterrissado = r2(cmvCalc.cmvLiquido + custoCapitalGiro);

    return {
      id: c.id,
      nome: c.nome,
      ufEmitente: c.ufEmitente,
      crtEmitente: String(c.crtEmitente),
      precoUnitario: c.precoUnitario,
      freteUnitario: c.freteUnitario,
      vIpiUnitario: c.vIpiUnitario,
      icmsDestacadoOuCredito: icmsDestacado,
      icmsStEntrada,
      antecipacaoArt16,
      cmvLiquido: cmvCalc.cmvLiquido,
      desembolsoAntecipadoCaixa,
      custoCapitalGiro,
      custoEfetivoAterrissado,
      justificativaTributaria: justificativa,
    };
  });

  resultados.sort((a, b) => a.custoEfetivoAterrissado - b.custoEfetivoAterrissado);
  const melhorOpcao = resultados[0];
  const piorOpcao = resultados[resultados.length - 1];
  const economiaVsPiorReais = r2(piorOpcao.custoEfetivoAterrissado - melhorOpcao.custoEfetivoAterrissado);
  const economiaVsPiorPct = piorOpcao.custoEfetivoAterrissado > 0
    ? r2((economiaVsPiorReais / piorOpcao.custoEfetivoAterrissado) * 100)
    : 0;

  memoriaCalculo.push(`Mesa de Compras PR: ${resultados.length} cotações analisadas.`);
  memoriaCalculo.push(
    `Vencedor: ${melhorOpcao.nome} (${melhorOpcao.ufEmitente}) com Custo Aterrissado de R$ ${melhorOpcao.custoEfetivoAterrissado.toFixed(2)}.`
  );
  memoriaCalculo.push(
    `Economia real vs. ${piorOpcao.nome}: R$ ${economiaVsPiorReais.toFixed(2)} (${economiaVsPiorPct}%).`
  );

  return {
    cotacoesRanqueadas: resultados,
    melhorOpcao,
    piorOpcao,
    economiaVsPiorReais,
    economiaVsPiorPct,
    memoriaCalculo,
  };
}

// ============================================================================
// E) SIMULAÇÃO DE VIRADA DE COMBUSTÍVEIS MONOFÁSICOS AD REM (01/02/2027)
// ============================================================================

export type TipoCombustivelMonofasicoPR = 'GASOLINA_EAC' | 'DIESEL_BIODIESEL' | 'GLP_GLGN';

export interface ResultadoImpactoCombustivelAdRem {
  tipo: TipoCombustivelMonofasicoPR;
  descricao: string;
  ncmReferencia: string;
  unidade: string;
  aliquota2026: number;
  aliquotaFev2027: number;
  variacaoPercentual: number;
  litrosOuKgMensal: number;
  acrescimoMensalReais: number;
  acrescimoAnualReais: number;
  cstSugerido: string;
  codigoAjusteEfd: string;
  fundamentacao: string;
  memoriaCalculo: string[];
}

/**
 * Simula a virada de alíquotas ad rem de combustíveis monofásicos no Paraná
 * em 01/02/2027 (Convênios ICMS 127/2026 e 128/2026).
 */
export function simularImpactoCombustivelAdRem2027(
  tipo: TipoCombustivelMonofasicoPR,
  litrosOuKgMensal: number
): ResultadoImpactoCombustivelAdRem {
  const ncmMap: Record<TipoCombustivelMonofasicoPR, { ncm: string; desc: string }> = {
    DIESEL_BIODIESEL: { ncm: '27101921', desc: 'Óleo Diesel e Biodiesel B100' },
    GASOLINA_EAC: { ncm: '27101259', desc: 'Gasolina e Etanol Anidro Combustível (EAC)' },
    GLP_GLGN: { ncm: '27111910', desc: 'Gás Liquefeito de Petróleo (GLP/GLGN)' },
  };

  const info = ncmMap[tipo];
  const dados2026 = resolverAliquotaPrBitemporal(info.ncm, '2027-01-31');
  const dados2027 = resolverAliquotaPrBitemporal(info.ncm, '2027-02-01');

  const aliq2026 = dados2026.aliquotaAdRem ?? 0;
  const aliq2027 = dados2027.aliquotaAdRem ?? 0;
  const unidade = dados2027.unidadeAdRem || (tipo === 'GLP_GLGN' ? 'R$/kg' : 'R$/litro');

  const variacaoPercentual = aliq2026 > 0 ? r2(((aliq2027 - aliq2026) / aliq2026) * 100) : 0;
  const difUnit = r2(aliq2027 - aliq2026);
  const acrescimoMensalReais = r2(litrosOuKgMensal * difUnit);
  const acrescimoAnualReais = r2(acrescimoMensalReais * 12);

  const memoriaCalculo: string[] = [
    `${info.desc} (NCM ${info.ncm}):`,
    `Alíquota Ad Rem até 31/01/2027: R$ ${aliq2026.toFixed(2)} ${unidade}`,
    `Alíquota Ad Rem a partir de 01/02/2027: R$ ${aliq2027.toFixed(2)} ${unidade}`,
    `Variação: +${variacaoPercentual.toFixed(2)}% (+R$ ${difUnit.toFixed(2)} ${unidade})`,
    `Impacto no desembolso: R$ ${acrescimoMensalReais.toFixed(2)}/mês (R$ ${acrescimoAnualReais.toFixed(2)}/ano) para volume de ${litrosOuKgMensal} ${unidade.split('/')[1] || 'unidades'}.`,
  ];

  return {
    tipo,
    descricao: info.desc,
    ncmReferencia: info.ncm,
    unidade,
    aliquota2026: aliq2026,
    aliquotaFev2027: aliq2027,
    variacaoPercentual,
    litrosOuKgMensal,
    acrescimoMensalReais,
    acrescimoAnualReais,
    cstSugerido: '61',
    codigoAjusteEfd: 'PR012000',
    fundamentacao: 'Convênios ICMS nº 127/2026 e nº 128/2026 c/c Lei Complementar nº 192/2022.',
    memoriaCalculo,
  };
}
