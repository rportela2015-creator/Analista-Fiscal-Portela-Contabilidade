/**
 * Suíte de Testes Numéricos: Motor Pericial de DIFAL, FECOP e Antecipação PR (RICMS/PR)
 * Sub-Etapa 18.2 (Passo 2 de 5)
 */

import assert from 'node:assert/strict';
import {
  apurarDifalEntradaPR,
  calcularDifalNaoContribuintePR,
  consolidarDifalNfeEntrada,
} from '../lib/engine/difal-pr.ts';

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// -----------------------------------------------------------------------------
// TESTE 1: DIFAL BASE DUPLA USO/CONSUMO SP -> PR SEM IPI
// -----------------------------------------------------------------------------
t('1. DIFAL Base Dupla Uso/Consumo SP -> PR sem IPI (R$ 1.000, 12% vs 19,5%)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 1000,
    vIcmsOrigem: 120,
    pIcmsOrigemPct: 12.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'uso_consumo',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
    aliqInternaPrOverridePct: 19.5,
    aliqFecopPrOverridePct: 0,
  });

  assert.equal(diag.modalidadeBase, 'base_dupla');
  assert.equal(diag.modalidade, 'DIFAL_USO_CONSUMO');
  assert.equal(diag.baseCalculoDifal, 1093.17);
  assert.equal(diag.valorDebitoDifal, 93.17);
  assert.equal(diag.valorDebitoFecop, 0);
  assert.equal(diag.valorTotalDebito, 93.17);
  assert.match(diag.guiaRecolhimento || '', /GR-PR/);
  assert.match(diag.codigoAjusteEfd || '', /Reg\. E111/);
  assert.match(diag.vencimento || '', /Dia 12 do mês subsequente/);
});

// -----------------------------------------------------------------------------
// TESTE 2: DIFAL BASE DUPLA ATIVO IMOBILIZADO SP -> PR COM IPI
// -----------------------------------------------------------------------------
t('2. DIFAL Base Dupla Ativo Imobilizado SP -> PR com IPI (R$ 1.000 + R$ 100 IPI, 12% s/ 1.100 vs 19,5%)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 1000,
    vIpi: 100,
    vIcmsOrigem: 132, // 12% de 1100
    pIcmsOrigemPct: 12.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'ativo_imobilizado',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
    aliqInternaPrOverridePct: 19.5,
    aliqFecopPrOverridePct: 0,
  });

  assert.equal(diag.baseCalculoOperacao, 1100.0);
  assert.equal(diag.baseCalculoDifal, 1202.48);
  assert.equal(diag.valorDebitoDifal, 102.48);
  assert.equal(diag.valorTotalDebito, 102.48);
  assert.equal(diag.ciapBlocoG, true);
  assert.match(diag.obrigacaoAcessoria || '', /PR020021/);
  assert.match(diag.obrigacaoAcessoria || '', /CIAP/);
});

// -----------------------------------------------------------------------------
// TESTE 3: DIFAL BASE DUPLA IMPORTADO 4% COM FECOP 2% (PERFUME NCM 3303.00.10)
// -----------------------------------------------------------------------------
t('3. DIFAL Base Dupla Importado 4% com FECOP 2% (Perfume NCM 3303.00.10: 23% + 2%)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 1000,
    origemMercadoria: 1,
    vIcmsOrigem: 40,
    pIcmsOrigemPct: 4.0,
    ncm: '33030010',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'uso_consumo',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  // Base Dupla: (1000 - 40) / (1 - 0.25) = 960 / 0.75 = 1280.00
  // Débito Difal: 1280 * 0.23 - 40 = 294.40 - 40 = 254.40
  // Débito Fecop: 1280 * 0.02 = 25.60
  // Total: 280.00
  assert.equal(diag.baseCalculoDifal, 1280.0);
  assert.equal(diag.valorDebitoDifal, 254.4);
  assert.equal(diag.valorDebitoFecop, 25.6);
  assert.equal(diag.valorTotalDebito, 280.0);
});

// -----------------------------------------------------------------------------
// TESTE 4: REVENDA NACIONAL 12% SP -> PR (SEM ST)
// -----------------------------------------------------------------------------
t('4. Revenda Nacional 12% SP -> PR fora da ST (Dispensado)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 1000,
    origemMercadoria: 0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'revenda',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  assert.equal(diag.modalidade, 'DISPENSADO');
  assert.equal(diag.exigeRecolhimento, false);
  assert.equal(diag.valorTotalDebito, 0);
});

// -----------------------------------------------------------------------------
// TESTE 5: ANTECIPAÇÃO ART. 16 (IMPORTADO 4% PARA REVENDA)
// -----------------------------------------------------------------------------
t('5.1 Antecipação Art. 16 (Importado 4% para Revenda) - Regime Normal (Carga 12%, Efeito Caixa 0)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 1000,
    origemMercadoria: 1,
    pIcmsOrigemPct: 4.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'revenda',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  // Alíquota alvo 12% (diferimento parcial Art. 28 Anexo VIII)
  // Débito: 1000 * (12% - 4%) = 80.00
  // Crédito simultâneo EFD -> Efeito caixa líquido 0
  assert.equal(diag.modalidade, 'ANTECIPACAO_4_PCT_ART16');
  assert.equal(diag.valorDebitoDifal, 80.0);
  assert.equal(diag.efeitoCaixaLiquido, 0);
  assert.equal(diag.guiaRecolhimento, 'CONTA_GRAFICA_EFD');
  assert.match(diag.codigoAjusteEfd || '', /Reg\. E111/);
});

t('5.2 Antecipação Art. 16 (Importado 4% para Revenda) - Simples Nacional (Custo Definitivo)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 1000,
    origemMercadoria: 1,
    pIcmsOrigemPct: 4.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'revenda',
    crtEmitente: 3,
    crtDestinatario: 1,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  // Débito: 1000 * (19.5% - 4%) = 155.00
  assert.equal(diag.modalidade, 'ANTECIPACAO_4_PCT_ART16');
  assert.equal(diag.valorDebitoDifal, 155.0);
  assert.equal(diag.efeitoCaixaLiquido, 155.0);
  assert.equal(diag.guiaRecolhimento, 'GR-PR');
  assert.match(diag.vencimento || '', /Dia 3 do 2º mês subsequente/);
  assert.match(diag.obrigacaoAcessoria || '', /DeSTDA/);
});

// -----------------------------------------------------------------------------
// TESTE 6: DIFAL NÃO CONTRIBUINTE B2C (BASE ÚNICA - ART. 541 RICMS/PR)
// -----------------------------------------------------------------------------
t('6.1 DIFAL Não Contribuinte B2C - Remetente Normal (Base Única: R$ 1.000, 12% vs 19,5%)', () => {
  const diag = calcularDifalNaoContribuintePR({
    vOper: 1000,
    pIcmsOrigemPct: 12.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    crtEmitente: 3,
    ufEmitente: 'SP',
    aliqInternaPrOverridePct: 19.5,
    aliqFecopPrOverridePct: 0,
  });

  // Base Única: 1000 / (1 - 0.195) = 1000 / 0.805 = 1242.24
  // Débito: 1242.24 * (19.5% - 12%) = 1242.24 * 7.5% = 93.17 (equivalência algébrica)
  assert.equal(diag.baseCalculoUnica, 1242.24);
  assert.equal(diag.valorDebitoDifal, 93.17);
  assert.equal(diag.valorTotalDebito, 93.17);
});

t('6.2 DIFAL Não Contribuinte B2C - Remetente Simples Nacional (Dispensado ADIs 5464/5469)', () => {
  const diag = calcularDifalNaoContribuintePR({
    vOper: 1000,
    pIcmsOrigemPct: 12.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    crtEmitente: 1,
    ufEmitente: 'SP',
  });

  assert.equal(diag.exigeRecolhimento, false);
  assert.equal(diag.valorTotalDebito, 0);
  assert.match(diag.fundamentacaoLegal, /ADIs 5464 e 5469/);
});

// -----------------------------------------------------------------------------
// TESTE 7: ALERTA DE ST INDEVIDA PÓS-DECRETO 12.828/2026
// -----------------------------------------------------------------------------
t('7. Alerta de ST Indevida pós-Decreto 12.828/2026 (Celulares NCM 8517.13.00)', () => {
  const diag = apurarDifalEntradaPR({
    vProd: 2000,
    vIcmsStDestacado: 150.0,
    ncm: '85171300',
    cest: '2100100',
    dataFatoGerador: '2026-04-10',
    finalidadeEntrada: 'revenda',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  assert.ok(diag.alertasAuditoria && diag.alertasAuditoria.length > 0);
  const temAlerta = diag.alertasAuditoria.some((a) => a.includes('12.828/2026') || a.includes('DECRETO'));
  assert.equal(temAlerta, true);
});

// -----------------------------------------------------------------------------
// TESTE 8: CONSULTA SEFA/PR Nº 48/2026 EM 2027
// -----------------------------------------------------------------------------
t('8. Consulta SEFA/PR nº 48/2026 em 2027 (IBS/CBS na Base de Cálculo do ICMS)', () => {
  const diagComIva = apurarDifalEntradaPR({
    vProd: 1000,
    vIcmsOrigem: 120,
    pIcmsOrigemPct: 12.0,
    vCbs: 88,
    vIbs: 1,
    incluirIbsCbsBcIcms: true,
    ncm: '84713012',
    dataFatoGerador: '2027-03-10',
    finalidadeEntrada: 'uso_consumo',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
    aliqInternaPrOverridePct: 19.5,
    aliqFecopPrOverridePct: 0,
  });

  const diagSemIva = apurarDifalEntradaPR({
    vProd: 1000,
    vIcmsOrigem: 120,
    pIcmsOrigemPct: 12.0,
    vCbs: 88,
    vIbs: 1,
    incluirIbsCbsBcIcms: false,
    ncm: '84713012',
    dataFatoGerador: '2027-03-10',
    finalidadeEntrada: 'uso_consumo',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
    aliqInternaPrOverridePct: 19.5,
    aliqFecopPrOverridePct: 0,
  });

  assert.ok((diagComIva.baseCalculoDifal || 0) > (diagSemIva.baseCalculoDifal || 0));
  assert.ok((diagComIva.valorDebitoDifal || 0) > (diagSemIva.valorDebitoDifal || 0));
  assert.ok(diagComIva.memoriaCalculo.some((m) => m.includes('48/2026')));
});

// -----------------------------------------------------------------------------
// TESTE 9: CONSOLIDAÇÃO DA NF-E (consolidarDifalNfeEntrada)
// -----------------------------------------------------------------------------
t('9. Consolidação de NF-e Mista (Uso/Consumo + Revenda + Perfume com FECOP)', () => {
  const item1 = apurarDifalEntradaPR({
    vProd: 1000,
    vIcmsOrigem: 120,
    pIcmsOrigemPct: 12.0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'uso_consumo',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
    aliqInternaPrOverridePct: 19.5,
    aliqFecopPrOverridePct: 0,
  });

  const item2 = apurarDifalEntradaPR({
    vProd: 500,
    origemMercadoria: 0,
    ncm: '84713012',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'revenda',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  const item3 = apurarDifalEntradaPR({
    vProd: 1000,
    origemMercadoria: 1,
    vIcmsOrigem: 40,
    pIcmsOrigemPct: 4.0,
    ncm: '33030010',
    dataFatoGerador: '2026-04-15',
    finalidadeEntrada: 'uso_consumo',
    crtEmitente: 3,
    crtDestinatario: 3,
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
  });

  const resumo = consolidarDifalNfeEntrada([
    { nItem: 1, xProd: 'Computador', ncm: '84713012', diagnostico: item1 },
    { nItem: 2, xProd: 'Teclado', ncm: '84713012', diagnostico: item2 },
    { nItem: 3, xProd: 'Perfume', ncm: '33030010', diagnostico: item3 },
  ]);

  assert.equal(resumo.totalItensAnalisados, 3);
  assert.equal(resumo.qtdItensComDebito, 2);
  assert.equal(resumo.totalDebitoDifal, r2(93.17 + 254.4)); // 347.57
  assert.equal(resumo.totalDebitoFecop, 25.6);
  assert.equal(resumo.totalGeralRecolher, r2(347.57 + 25.6)); // 373.17
  assert.ok(resumo.guiasNecessarias.some((g) => g.includes('GR-PR DIFAL')));
  assert.ok(resumo.guiasNecessarias.some((g) => g.includes('GR-PR FECOP')));
});
