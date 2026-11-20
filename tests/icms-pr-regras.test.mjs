/**
 * Suíte de Testes Numéricos Rigorosos: Regras e Engrenagens Periciais do ICMS/PR
 * Decreto Estadual nº 7.871/2017 (RICMS/PR), Lei nº 11.580/1996, Lei nº 15.562/2007,
 * Decreto nº 8.660/2018, Decreto nº 5.143/2024, Convênios ICMS 142/2018 e 35/2011,
 * e Consultas Tributárias SEFA/PR nº 43/2023, 51/2021 e 018/2026.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularDiferimentoParcialPR,
  calcularReducaoBcEEstornoPR,
  calcularIcmsStPR,
  calcularSimplesNacionalPR,
} from '../lib/engine/icms-pr-regras.ts';

// ----------------------------------------------------------------------------
// TESTE 1: DIFERIMENTO PARCIAL ART. 28 ANEXO VIII (B2B NORMAL PR)
// ----------------------------------------------------------------------------
test('1. Diferimento Parcial Art. 28 Anexo VIII (B2B Normal PR: R$ 1.000 a 19,5%)', () => {
  const res = calcularDiferimentoParcialPR({
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    ufOrigem: 'PR',
    ufDestino: 'PR',
    crtEmitente: 3,
    crtDestinatario: 3,
    destinatarioConsumidorFinal: false,
  });

  assert.equal(res.aplicavel, true);
  assert.equal(res.cargaEfetiva, 12.0);
  assert.equal(res.bcTributada, 615.38);
  assert.equal(res.icmsDestacado, 120.0);
  assert.equal(res.icmsDiferido, 75.0);
  assert.equal(res.cst, '51');
  assert.equal(res.exigeEstornoCredito, false);
  assert.ok(res.cBenefReferencia.includes('PR830001'));
});

// ----------------------------------------------------------------------------
// TESTE 2: TRAVAS DE BLOQUEIO DO DIFERIMENTO PARCIAL (SIMPLES E CONSUMIDOR FINAL)
// ----------------------------------------------------------------------------
test('2. Travas de Bloqueio Diferimento Parcial para Simples Nacional e Consumidor Final', () => {
  // Caso A: Destinatário Simples Nacional (CRT 1)
  const resSimples = calcularDiferimentoParcialPR({
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    ufOrigem: 'PR',
    ufDestino: 'PR',
    crtDestinatario: 1,
  });
  assert.equal(resSimples.aplicavel, false);
  assert.equal(resSimples.cargaEfetiva, 19.5);
  assert.equal(resSimples.cst, '00');
  assert.ok(resSimples.motivoBloqueio?.includes('Simples Nacional'));

  // Caso B: Destinatário Consumidor Final
  const resConsumidor = calcularDiferimentoParcialPR({
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    ufOrigem: 'PR',
    ufDestino: 'PR',
    crtDestinatario: 3,
    destinatarioConsumidorFinal: true,
  });
  assert.equal(resConsumidor.aplicavel, false);
  assert.equal(resConsumidor.cargaEfetiva, 19.5);
  assert.ok(resConsumidor.motivoBloqueio?.includes('consumidor final'));

  // Caso C: Operação interestadual
  const resInter = calcularDiferimentoParcialPR({
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    ufOrigem: 'PR',
    ufDestino: 'SP',
  });
  assert.equal(resInter.aplicavel, false);
  assert.ok(resInter.motivoBloqueio?.includes('exclusivamente a operações internas'));
});

// ----------------------------------------------------------------------------
// TESTE 3: REDUÇÃO BC CESTA BÁSICA VS CONSUMIDOR FINAL + ESTORNO ART. 45 IV
// ----------------------------------------------------------------------------
test('3. Redução BC Cesta Básica (Anexo VI item 9) vs Consumidor Final (Anexo V item 21) + Estorno Art. 45 IV', () => {
  // Caso A: Saída B2B Contribuinte (19,5% -> 7% efetivo c/ estorno de crédito da entrada)
  const resB2B = calcularReducaoBcEEstornoPR({
    perfil: 'CESTA_BASICA_ANEXO_VI_ITEM_9',
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    destinatarioConsumidorFinal: false,
    manutencaoCredito: false,
    creditoIcmsEntrada: 120.0,
  });

  assert.equal(resB2B.beneficioAplicavel, true);
  assert.equal(resB2B.cst, '20');
  assert.equal(resB2B.cargaEfetivaPct, 7.0);
  // Base tributável: 7 / 19.5 = 35.8974%
  assert.ok(Math.abs(resB2B.baseTributavelPct - 35.8974) < 0.001);
  // Estorno: 120 * (1 - 7/19.5) = 120 * 0.6410256... = 76.92
  assert.equal(resB2B.valorEstornoCredito, 76.92);
  assert.equal(resB2B.creditoLiquidoMantido, 43.08);

  // Caso B: Saída Consumidor Final (Item 21 Anexo V - Isenção Integral CST 40 + Estorno 100%)
  const resConsumidor = calcularReducaoBcEEstornoPR({
    perfil: 'CESTA_BASICA_ANEXO_VI_ITEM_9',
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    destinatarioConsumidorFinal: true,
    creditoIcmsEntrada: 120.0,
  });

  assert.equal(resConsumidor.cst, '40');
  assert.equal(resConsumidor.cargaEfetivaPct, 0);
  assert.equal(resConsumidor.isentoConsumidorFinal, true);
  assert.equal(resConsumidor.percentualEstornoCredito, 100.0);
  assert.equal(resConsumidor.valorEstornoCredito, 120.0);
  assert.equal(resConsumidor.creditoLiquidoMantido, 0);

  // Caso C: Máquinas Industriais (Item 21 Anexo VI) com trava de partes e peças (Consulta 51/2021)
  const resMaqPeca = calcularReducaoBcEEstornoPR({
    perfil: 'MAQUINAS_INDUSTRIAIS_ANEXO_VI_ITEM_21',
    valorOperacao: 1000.0,
    aliqInternaPct: 19.5,
    ehParteOuPeca: true,
  });
  assert.equal(resMaqPeca.beneficioAplicavel, false);
  assert.equal(resMaqPeca.cst, '00');
  assert.equal(resMaqPeca.cargaEfetivaPct, 19.5);
  assert.ok(resMaqPeca.alerta?.includes('Consulta SEFA/PR nº 51/2021'));
});

// ----------------------------------------------------------------------------
// TESTE 4: HIERARQUIA ST (CONSULTA SEFA/PR Nº 018/2026: PMPF > MVA)
// ----------------------------------------------------------------------------
test('4. Hierarquia ST (Consulta SEFA/PR nº 018/2026: PMPF prevalece sobre Redutor de Atacadista)', () => {
  const res = calcularIcmsStPR({
    ncm: '22021000',
    dataFatoGerador: '2026-11-15',
    vProd: 1000.0,
    aliqInternaPrPct: 19.5,
    mvaOriginalPct: 40.0,
    ehAtacadistaRegimeEspecial: true, // Teria redutor de 50% na MVA
    pmpf: 1500.0,                    // PMPF informado
    quantidade: 1,
    ufOrigem: 'PR',
    ufDestino: 'PR',
  });

  assert.equal(res.sujeitoSt, true);
  assert.equal(res.criterioBase, 'PMPF');
  assert.equal(res.bcSt, 1500.0);
  assert.ok(res.memoriaCalculo.some((m) => m.includes('Consulta SEFA/PR nº 018/2026')));
});

// ----------------------------------------------------------------------------
// TESTE 5: ORDEM MATEMÁTICA DA MVA REDUZIDA ANTES DO AJUSTE (CONSULTA SEFA/PR Nº 43/2023)
// ----------------------------------------------------------------------------
test('5. Ordem Matemática da MVA Reduzida antes da MVA Ajustada (Consulta SEFA/PR nº 43/2023)', () => {
  // Caso A: MVA original 40%, redutor 50%, aliqInter 12%, aliqInternaTotal 19.5%
  const resReduzida = calcularIcmsStPR({
    ncm: '39241000',
    dataFatoGerador: '2024-05-10', // Antes da exclusão do Dec. 6048/2024
    vProd: 1000.0,
    aliqInternaPrPct: 19.5,
    aliqInterestadualPct: 12.0,
    mvaOriginalPct: 40.0,
    ehAtacadistaRegimeEspecial: true, // Redutor 50% -> MVA prévia 20%
    crtEmitente: 3,
    ufOrigem: 'SP',
    ufDestino: 'PR',
  });

  assert.equal(resReduzida.mvaAposRedutorPct, 20.0);
  // MVA Ajustada sobre 20%: ((1 + 0.20) * 0.88 / 0.805) - 1 = 31.18%
  assert.equal(resReduzida.mvaEfetivaPct, 31.18);

  // Caso B: Mesma operação sem redutor (MVA 40% integral)
  const resSemRedutor = calcularIcmsStPR({
    ncm: '39241000',
    dataFatoGerador: '2024-05-10',
    vProd: 1000.0,
    aliqInternaPrPct: 19.5,
    aliqInterestadualPct: 12.0,
    mvaOriginalPct: 40.0,
    ehAtacadistaRegimeEspecial: false,
    crtEmitente: 3,
    ufOrigem: 'SP',
    ufDestino: 'PR',
  });
  // ((1 + 0.40) * 0.88 / 0.805) - 1 = 53.04%
  assert.equal(resSemRedutor.mvaEfetivaPct, 53.04);

  // Caso C: Importado 4% sem redutor (aliqInter 4%)
  const resImportado = calcularIcmsStPR({
    ncm: '39241000',
    dataFatoGerador: '2024-05-10',
    vProd: 1000.0,
    aliqInternaPrPct: 19.5,
    aliqInterestadualPct: 4.0,
    mvaOriginalPct: 40.0,
    crtEmitente: 3,
    ufOrigem: 'SP',
    ufDestino: 'PR',
  });
  // ((1 + 0.40) * 0.96 / 0.805) - 1 = 66.96%
  assert.equal(resImportado.mvaEfetivaPct, 66.96);
});

// ----------------------------------------------------------------------------
// TESTE 6: COMPRA SC -> PR SEM ST (EMITENTE NORMAL VS EMITENTE SIMPLES NACIONAL)
// ----------------------------------------------------------------------------
test('6. Compra SC -> PR: Emitente Normal vs Emitente Simples Nacional (Conv. 35/2011)', () => {
  // vProd = 1000, vIpi = 100, vFrete = 50, MVA = 40%, aliqPR = 19.5%
  // Caso A: Emitente Normal (CRT 3, 12%)
  const resNormal = calcularIcmsStPR({
    ncm: '87082999',
    dataFatoGerador: '2026-11-15',
    vProd: 1000.0,
    vIpi: 100.0,
    vFrete: 50.0,
    aliqInternaPrPct: 19.5,
    aliqInterestadualPct: 12.0,
    mvaOriginalPct: 40.0,
    crtEmitente: 3,
    ufOrigem: 'SC',
    ufDestino: 'PR',
  });

  // Base Partida = 1150; MVA Ajustada = 53.04% -> bcSt = 1759.96
  // Débito ST = 1759.96 * 0.195 = 343.19 (ou 343.20 com fator puro)
  // Crédito dedutível = (1000 + 50) * 0.12 = 126.00
  // valorIcmsSt = 343.19 - 126.00 = 217.19 (tolerância <= 0.05 de 217.20)
  assert.ok(Math.abs(resNormal.valorIcmsSt - 217.20) <= 0.05);

  // Caso B: Emitente Simples Nacional (CRT 1, Convênio 35/2011 -> Não Ajusta MVA)
  const resSimples = calcularIcmsStPR({
    ncm: '87082999',
    dataFatoGerador: '2026-11-15',
    vProd: 1000.0,
    vIpi: 100.0,
    vFrete: 50.0,
    aliqInternaPrPct: 19.5,
    aliqInterestadualPct: 12.0,
    mvaOriginalPct: 40.0,
    crtEmitente: 1,
    ufOrigem: 'SC',
    ufDestino: 'PR',
  });

  assert.equal(resSimples.mvaAjustada, false);
  assert.equal(resSimples.mvaEfetivaPct, 40.0);
  assert.equal(resSimples.bcSt, 1610.0);
  assert.equal(resSimples.valorIcmsSt, 187.95);

  // Economia tributária gerada pela não aplicação de MVA ajustada (Convênio 35/2011)
  const diferenca = resNormal.valorIcmsSt - resSimples.valorIcmsSt;
  assert.ok(Math.abs(diferenca - 29.25) <= 0.05);
});

// ----------------------------------------------------------------------------
// TESTE 7: BLOQUEIO ST EM ITEM REVOGADO (DECRETO 12.828/2026)
// ----------------------------------------------------------------------------
test('7. Bloqueio ST em Item Revogado (Decreto 12.828/2026: Celular 85171300 em 15/03/2026)', () => {
  const res = calcularIcmsStPR({
    ncm: '85171300',
    dataFatoGerador: '2026-03-15',
    vProd: 2000.0,
    aliqInternaPrPct: 19.5,
    mvaOriginalPct: 40.0,
    ufOrigem: 'SP',
    ufDestino: 'PR',
  });

  assert.equal(res.sujeitoSt, false);
  assert.equal(res.valorIcmsSt, 0);
  assert.equal(res.bcSt, 0);
  assert.ok(res.decretoExclusao?.includes('12.828/2026'));
  assert.ok(res.alerta?.includes('Art. 21 do Anexo IX'));
});

// ----------------------------------------------------------------------------
// TESTE 8: SIMPLES NACIONAL PR (DECRETO 8.660/2018 + TRAVA 2017)
// ----------------------------------------------------------------------------
test('8. Simples Nacional PR (Decreto 8.660/2018 + Trava 2017 e Controle de Sublimite)', () => {
  // Caso A: RBT12 = R$ 300.000,00 (Faixa 2 -> Isenção Integral no DAS)
  const resIsento = calcularSimplesNacionalPR({
    rbt12: 300000.0,
    anexo: 'I_COMERCIO',
  });
  assert.equal(resIsento.isentoIcmsDas, true);
  assert.equal(resIsento.aliquotaIcmsPrFinalPct, 0);
  assert.equal(resIsento.percentualReducaoPgdasPct, 100.0);
  assert.ok(resIsento.alerta?.includes('Art. 5º do Anexo XI'));

  // Caso B: RBT12 = R$ 1.500.000,00 (Anexo I Comércio)
  const resFaixa4 = calcularSimplesNacionalPR({
    rbt12: 1500000.0,
    anexo: 'I_COMERCIO',
  });
  assert.equal(resFaixa4.aliquotaEfetivaNacionalPct, 9.2);
  assert.equal(resFaixa4.parcelaIcmsNacionalPct, 3.082);
  assert.equal(resFaixa4.aliquotaIcmsTabelaPrPct, 2.6277);
  assert.equal(resFaixa4.aliquotaTrava2017Pct, 2.724);
  assert.equal(resFaixa4.aliquotaIcmsPrFinalPct, 2.6277);
  assert.equal(resFaixa4.percentualReducaoPgdasPct, 14.74);

  // Caso C: Controle de Sublimite (R$ 3.600.000,00)
  // Excesso <= 20% (RBA = 4.000.000,00)
  const resExcessoAte20 = calcularSimplesNacionalPR({
    rbt12: 2500000.0,
    rbaAnoCalendario: 4000000.0,
    anexo: 'I_COMERCIO',
  });
  assert.equal(resExcessoAte20.statusSublimite, 'EXCESSO_ATE_20_PCT');
  assert.equal(resExcessoAte20.inicioRegimeNormalIcms, '01/01 do ano-calendário seguinte');

  // Excesso > 20% (RBA = 4.500.000,00)
  const resExcessoSuperior20 = calcularSimplesNacionalPR({
    rbt12: 2500000.0,
    rbaAnoCalendario: 4500000.0,
    anexo: 'I_COMERCIO',
  });
  assert.equal(resExcessoSuperior20.statusSublimite, 'EXCESSO_SUPERIOR_20_PCT');
  assert.equal(resExcessoSuperior20.inicioRegimeNormalIcms, 'Mês subsequente ao excesso (imediato)');
});
