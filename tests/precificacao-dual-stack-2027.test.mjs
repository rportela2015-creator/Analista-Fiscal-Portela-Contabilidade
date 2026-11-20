/**
 * Suíte de Testes Numéricos Rigorosos: Núcleo Dual-Stack 2026–2027 e Mesa de Compras PR
 *
 * Fundamentos:
 *  - Lei Federal nº 14.592/2023 (Tema 69 STF no Crédito de Entrada PIS/COFINS)
 *  - RE 574.706/PR (Tema 69 STF na Formação do Preço de Saída)
 *  - Consulta de Contribuinte SEFA/PR nº 48/2026 (Grossing-up de ICMS com IBS/CBS)
 *  - Tese Judicial de Exclusão de IBS/CBS da BC do ICMS
 *  - Art. 28 Anexo VIII, Art. 11 Anexo IX e Art. 16 do RICMS/PR (Decreto nº 7.871/2017)
 *  - Convênio ICMS 35/2011 (MVA Original sem ajuste para Simples Nacional)
 *  - Convênios ICMS nº 127/2026 e nº 128/2026 (virada de combustíveis monofásicos ad rem)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularCmvLiquidoPR,
  calcularPrecoVenda2026PR,
  simularPrecificacaoDualStack2027PR,
  compararFornecedoresCustoAterrissadoPR,
  simularImpactoCombustivelAdRem2027,
} from '../lib/engine/precificacao-pr-2027.ts';

// ----------------------------------------------------------------------------
// TESTE 1: CMV LÍQUIDO 2026 POR REGIME TRIBUTÁRIO (NBC TG 16 / CPC 16)
// Compra SP -> PR R$ 1.000,00, ICMS 12% = R$ 120,00, sem ST/IPI
// ----------------------------------------------------------------------------
test('1. CMV Líquido 2026 por Regime Tributário (Compra SP -> PR R$ 1.000,00)', () => {
  // Cenário A: Lucro Real (Tema 69 STF: PIS/COFINS 9,25% sobre R$ 880,00 = R$ 81,40)
  const resReal = calcularCmvLiquidoPR({
    valorProdutos: 1000.0,
    vIcmsOrigem: 120.0,
    regimeComprador: 'LUCRO_REAL',
    aplicarTema69CreditoPisCofins: true,
    aliquotaPisCofinsCreditoPct: 9.25,
  });

  assert.equal(resReal.valorTotalNotaEntrada, 1000.0);
  assert.equal(resReal.creditoIcmsLiquido, 120.0);
  assert.equal(resReal.baseCreditoPisCofins, 880.0);
  assert.equal(resReal.creditoPisCofins, 81.40);
  assert.equal(resReal.cmvLiquido, 798.60);

  // Cenário B: Lucro Presumido (ICMS 12% apenas; PIS/COFINS cumulativo sem crédito)
  const resPresumido = calcularCmvLiquidoPR({
    valorProdutos: 1000.0,
    vIcmsOrigem: 120.0,
    regimeComprador: 'LUCRO_PRESUMIDO',
  });

  assert.equal(resPresumido.valorTotalNotaEntrada, 1000.0);
  assert.equal(resPresumido.creditoIcmsLiquido, 120.0);
  assert.equal(resPresumido.creditoPisCofins, 0.0);
  assert.equal(resPresumido.cmvLiquido, 880.0);

  // Cenário C: Simples Nacional (sem crédito fiscal recuperável)
  const resSimples = calcularCmvLiquidoPR({
    valorProdutos: 1000.0,
    vIcmsOrigem: 120.0,
    regimeComprador: 'SIMPLES_NACIONAL',
  });

  assert.equal(resSimples.valorTotalNotaEntrada, 1000.0);
  assert.equal(resSimples.creditoIcmsLiquido, 0.0);
  assert.equal(resSimples.creditoPisCofins, 0.0);
  assert.equal(resSimples.cmvLiquido, 1000.0);

  // Cenário D: Simples Nacional com importado 4% + antecipação cheia R$ 155,00
  const resSimplesAntecipacao = calcularCmvLiquidoPR({
    valorProdutos: 1000.0,
    vIcmsOrigem: 40.0,
    vDifalOuAntecipacaoEntrada: 155.0,
    regimeComprador: 'SIMPLES_NACIONAL',
  });

  assert.equal(resSimplesAntecipacao.valorTotalNotaEntrada, 1155.0);
  assert.equal(resSimplesAntecipacao.creditoIcmsLiquido, 0.0);
  assert.equal(resSimplesAntecipacao.cmvLiquido, 1155.0);
});

// ----------------------------------------------------------------------------
// TESTE 2: MARK-UP DIVISOR 2026 COM TEMA 69 DO STF (LUCRO REAL)
// cmvLiquido = 798.60, ICMS = 19.5%, PIS/COFINS = 9.25%, Despesas = 10%, Margem = 20%
// ----------------------------------------------------------------------------
test('2. Mark-Up Divisor 2026 com Tema 69 (Lucro Real: ICMS 19,5%, Margem 20%)', () => {
  const res = calcularPrecoVenda2026PR({
    cmvLiquido: 798.60,
    aliquotaIcmsEfetivaSaidaPct: 19.5,
    aliquotaPisCofinsSaidaPct: 9.25,
    despesasVariaveisPct: 10.0,
    margemAlvoPct: 20.0,
    aplicarTema69Saida: true,
  });

  assert.equal(res.cmvLiquido, 798.60);
  assert.equal(res.divisor, 0.430538);
  assert.equal(res.precoVenda, 1854.89);
  assert.equal(res.valorIcmsSaida, 361.70);
  assert.equal(res.valorPisCofinsSaida, 138.12);
  assert.equal(res.valorDespesasVariaveis, 185.49);
  // Margem líquida realizada
  assert.ok(Math.abs(res.valorMargemLiquida - 370.98) <= 0.05);
});

// ----------------------------------------------------------------------------
// TESTE 3: CHOQUE DUAL-STACK 2027 — CONSULTA SEFA/PR 48/2026 VS. TESE JUDICIAL
// P_liq = 1000.00, ICMS = 19.5%, CBS = 8.8%, IBS = 0.1%, IS = 0%
// ----------------------------------------------------------------------------
test('3. Choque 2027 Consulta SEFA/PR nº 48/2026 vs. Tese Judicial', () => {
  const res = simularPrecificacaoDualStack2027PR({
    precoLiquidoSemTributos: 1000.0,
    aliquotaIcmsPrPct: 19.5,
    aliquotaFecopPrPct: 0.0,
    aliquotaCbsPct: 8.8,
    aliquotaIbsPct: 0.1,
    aliquotaIsPct: 0.0,
    incluirIbsCbsBcIcms: true,
  });

  // Modo 2: Tese Judicial (IBS/CBS por fora da base do ICMS)
  assert.equal(res.baseIcmsModo2, 1242.24);
  assert.equal(res.valorIcmsModo2, 242.24);
  assert.equal(res.precoFinalModo2, 1331.24);

  // Modo 1: Consulta SEFA/PR nº 48/2026 (IBS/CBS por dentro da base do ICMS)
  assert.equal(res.baseIcmsModo1, 1352.80);
  assert.equal(res.valorIcmsModo1, 263.80);
  assert.equal(res.precoFinalModo1, 1352.80);

  // Indicadores de Impacto Comercial
  assert.equal(res.efeitoCascataReais, 21.56);
  assert.equal(res.aumentoPercentualIcms, 8.90);
  assert.equal(res.erosaoMargemPpSePrecoTravado, 2.16);
});

// ----------------------------------------------------------------------------
// TESTE 4: SIMULADOR DA MESA DE COMPRAS PR (SC NORMAL VS. SC SIMPLES NACIONAL COM ST)
// R$ 1.000,00, IPI R$ 100,00, frete R$ 50,00, MVA 40%, Comprador Simples Nacional no PR
// ----------------------------------------------------------------------------
test('4. Simulador da Mesa de Compras PR (SC Normal vs. SC Simples Nacional em item com ST)', () => {
  const res = compararFornecedoresCustoAterrissadoPR({
    regimeComprador: 'SIMPLES_NACIONAL',
    ncm: '87082999',
    dataFatoGerador: '2026-06-15',
    sujeitoStPr: true,
    mvaOriginalPct: 40.0,
    taxaCapitalGiroMensalPct: 1.5,
    prazoMedioEstoqueDias: 45,
    cotacoes: [
      {
        id: 'sc-normal',
        nome: 'Fornecedor SC (Regime Normal)',
        ufEmitente: 'SC',
        crtEmitente: 3,
        precoUnitario: 1000.0,
        freteUnitario: 50.0,
        vIpiUnitario: 100.0,
      },
      {
        id: 'sc-simples',
        nome: 'Fornecedor SC (Simples Nacional)',
        ufEmitente: 'SC',
        crtEmitente: 1,
        precoUnitario: 1000.0,
        freteUnitario: 50.0,
        vIpiUnitario: 100.0,
      },
    ],
  });

  const cotacaoNormal = res.cotacoesRanqueadas.find((c) => c.id === 'sc-normal');
  const cotacaoSimples = res.cotacoesRanqueadas.find((c) => c.id === 'sc-simples');

  assert.ok(cotacaoNormal);
  assert.ok(cotacaoSimples);

  // Fornecedor SC Normal tem MVA Ajustada (53,04%) -> ICMS-ST R$ 217,19 ou R$ 217,20
  assert.ok(Math.abs(cotacaoNormal.icmsStEntrada - 217.19) <= 0.05);

  // Fornecedor SC Simples tem MVA Original (40%) -> ICMS-ST R$ 187,95
  assert.equal(cotacaoSimples.icmsStEntrada, 187.95);

  // Fornecedor Simples vence com economia de ~R$ 29,24 por unidade antes do capital de giro
  const diffSt = Math.abs(cotacaoNormal.icmsStEntrada - cotacaoSimples.icmsStEntrada);
  assert.ok(Math.abs(diffSt - 29.24) <= 0.05);

  // O melhor colocado geral deve ser o fornecedor do Simples Nacional
  assert.equal(res.melhorOpcao.id, 'sc-simples');
});

// ----------------------------------------------------------------------------
// TESTE 5: VIRADA DE COMBUSTÍVEIS MONOFÁSICOS AD REM EM 01/02/2027
// Diesel: 1.17 -> 1.30, variação +11.11%, 10.000 L/mês -> acréscimo R$ 1.300,00
// ----------------------------------------------------------------------------
test('5. Virada de Combustíveis Monofásicos Ad Rem em 01/02/2027 (Convênios 127/2026 e 128/2026)', () => {
  const res = simularImpactoCombustivelAdRem2027('DIESEL_BIODIESEL', 10000);

  assert.equal(res.aliquota2026, 1.17);
  assert.equal(res.aliquotaFev2027, 1.30);
  assert.equal(res.variacaoPercentual, 11.11);
  assert.equal(res.litrosOuKgMensal, 10000);
  assert.equal(res.acrescimoMensalReais, 1300.0);
  assert.equal(res.acrescimoAnualReais, 15600.0);
  assert.equal(res.cstSugerido, '61');
  assert.equal(res.codigoAjusteEfd, 'PR012000');
});
