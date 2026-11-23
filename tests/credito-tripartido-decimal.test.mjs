/**
 * Suíte de Testes Numéricos: Precisão Numérica ADR003 e Classificação Tripartida de Créditos
 *
 * Fundamentos:
 *  - ADR003 da Receita Federal do Brasil (Calculadora RTC — Rounding HALF_EVEN e fechamento de totais)
 *  - NBC TG 16 / CPC 16 (R1) — Itens 11 e 12 (Créditos recuperáveis que reduzem o CMV)
 *  - Lei Federal nº 14.592/2023 c/c RE 574.706/PR (Tema 69 STF na base de créditos de PIS/COFINS)
 *  - LC nº 214/2025, Art. 47 (Condicionamento do crédito à extinção do débito) e Art. 57 (Uso pessoal)
 *  - Art. 26, § 15, III, "a" do RICMS/PR (Vedação de crédito de ICMS em Simples Nacional isento no PR)
 *  - Art. 33, I da LC 87/1996 e Art. 24, § 1º, I da Lei PR nº 11.580/1996 (Uso e Consumo)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DecimalHalfEven,
  DecimalHalfUp,
  arredondarMoedaRfb,
  arredondarMoedaRfbNum,
  arredondarAliquotaRfb,
  somarDecimaisRfb,
} from '../lib/math/decimal-fiscal.ts';

import {
  classificarCreditosItemEntrada,
} from '../lib/fiscal/credito-tributario.ts';

import {
  converterItemExtracaoParaPrecificacao,
} from '../lib/extrator-nfe-types.ts';

import {
  normalizarExtracaoNfe,
} from '../lib/fiscal/documento-normalizado.ts';

// ----------------------------------------------------------------------------
// TESTE 1: ARREDONDAMENTO HALF_EVEN (BANQUEIRO) VS HALF_UP E FECHAMENTO ADR003
// ----------------------------------------------------------------------------
test('1. Precisão Numérica ADR003 RFB: HALF_EVEN vs HALF_UP e Fechamento de Totais', () => {
  // Edge cases de desempate bancário (arredonda para o número par mais próximo)
  assert.equal(new DecimalHalfEven('2.225').toFixed(2), '2.22'); // 2 é par -> desce
  assert.equal(new DecimalHalfEven('2.235').toFixed(2), '2.24'); // 4 é par -> sobe
  assert.equal(new DecimalHalfEven('2.245').toFixed(2), '2.24'); // 4 é par -> desce
  assert.equal(new DecimalHalfEven('2.255').toFixed(2), '2.26'); // 6 é par -> sobe

  // Comparativo com HALF_UP convencional
  assert.equal(new DecimalHalfUp('2.225').toFixed(2), '2.23'); // sempre sobe no 5
  assert.equal(new DecimalHalfUp('2.235').toFixed(2), '2.24');

  // Helper arredondarMoedaRfb
  assert.equal(arredondarMoedaRfb('93.165'), '93.16');
  assert.equal(arredondarMoedaRfb('93.175'), '93.18');
  assert.equal(arredondarMoedaRfbNum('93.175'), 93.18);

  // Alíquotas com precisão estendida (HALF_EVEN no 5 arredonda para o par 2)
  assert.equal(arredondarAliquotaRfb('19.5000', 4), '19.5000');
  assert.equal(arredondarAliquotaRfb('7.44625', 4), '7.4462');
  assert.equal(arredondarAliquotaRfb('7.44635', 4), '7.4464');

  // Fechamento de Totais item a item já arredondados
  const itens = ['10.225', '20.235', '30.245']; // 10.22 + 20.24 + 30.24 = 60.70
  assert.equal(somarDecimaisRfb(itens), '60.70');
});

// ----------------------------------------------------------------------------
// TESTE 2: COMPRA PARA USO E CONSUMO (GLOSA TOTAL DE ICMS E PIS/COFINS)
// vICMS = 120.00, vPIS = 16.50, vCOFINS = 76.00
// ----------------------------------------------------------------------------
test('2. Compra para Uso e Consumo: Destacado no XML preservado mas Crédito Zerado', () => {
  const res = classificarCreditosItemEntrada({
    vProd: 1000.0,
    vICMS: 120.0,
    vPIS: 16.5,
    vCOFINS: 76.0,
    regimeAdquirente: 'LUCRO_REAL',
    destinacao: 'uso_consumo',
  });

  // Camada 1: destacadoXml preserva fielmente os valores do documento
  assert.equal(res.destacadoXml.icmsProprio, 120.0);
  assert.equal(res.destacadoXml.pis, 16.5);
  assert.equal(res.destacadoXml.cofins, 76.0);
  assert.equal(res.destacadoXml.total, 212.5);

  // Camada 2: creditoAdmitidoRegra zera ICMS e PIS/COFINS para consumo
  assert.equal(res.creditoAdmitidoRegra.icmsProprio, 0.0);
  assert.equal(res.creditoAdmitidoRegra.pis, 0.0);
  assert.equal(res.creditoAdmitidoRegra.cofins, 0.0);
  assert.equal(res.creditoAdmitidoRegra.total, 0.0);
  assert.equal(res.modalidadeApropriacaoIcms, 'VEDADO');

  // Camada 3: creditoEfetivadoCusto também zera (não reduz CMV)
  assert.equal(res.creditoEfetivadoCusto.icmsProprio, 0.0);
  assert.equal(res.creditoEfetivadoCusto.pis, 0.0);
  assert.equal(res.creditoEfetivadoCusto.cofins, 0.0);
  assert.equal(res.creditoEfetivadoCusto.total, 0.0);

  // Alertas de glosa auditáveis
  assert.ok(res.alertasGlosa.some((a) => a.includes('Uso e Consumo') && a.includes('ICMS')));
  assert.ok(res.alertasGlosa.some((a) => a.includes('Uso e Consumo') && a.includes('PIS/COFINS')));
});

// ----------------------------------------------------------------------------
// TESTE 3: FORNECEDOR SIMPLES NACIONAL PR ISENTO (RBT12 <= R$ 360K)
// Destaque indevido de vCredICMSSN bloqueado pelo Art. 26 § 15 III "a" RICMS/PR
// ----------------------------------------------------------------------------
test('3. Fornecedor Simples Nacional PR Isento: Bloqueio do Crédito Indevido', () => {
  const res = classificarCreditosItemEntrada({
    vProd: 1000.0,
    vCredICMSSN: 35.0,
    crtEmitente: 1,
    emitenteSnIsentoPr: true,
    regimeAdquirente: 'LUCRO_REAL',
    destinacao: 'comercializacao',
  });

  // XML tem o valor informado pelo fornecedor
  assert.equal(res.destacadoXml.credSnInformado, 35.0);

  // Regra bloqueia aproveitamento
  assert.equal(res.creditoAdmitidoRegra.icmsProprio, 0.0);
  assert.equal(res.creditoAdmitidoRegra.credSnInformado, 0.0);
  assert.equal(res.creditoEfetivadoCusto.icmsProprio, 0.0);

  // Alerta normativo fundamentado
  assert.ok(
    res.alertasGlosa.some(
      (a) => a.includes('Art. 26, § 15, III, "a"') && a.includes('360.000,00')
    )
  );
});

// ----------------------------------------------------------------------------
// TESTE 4: COMPRA NO LUCRO PRESUMIDO PARA REVENDA VIA CONVERTERITEMEXTRACAOPARAPRECIFICACAO
// Aproveita ICMS mas zera PIS/COFINS (regime cumulativo)
// ----------------------------------------------------------------------------
test('4. Lucro Presumido para Revenda: Aproveita ICMS e zera PIS/COFINS no CMV', () => {
  const itemMock = {
    index: 1,
    cProd: 'PROD-LP',
    xProd: 'Item Comercial Lucro Presumido',
    ncm: '84713012',
    cfop: '5102',
    uCom: 'UN',
    qCom: 10,
    vUnCom: 100,
    vProd: 1000,
    ncmValidoSiscomex: true,
    sensivelParaAuditoria: false,
    tributos: {
      vICMS: 120.0,
      pICMS: 12.0,
      vPIS: 16.5,
      pPIS: 1.65,
      vCOFINS: 76.0,
      pCOFINS: 7.6,
      orig: 0,
      cstIcms: '00',
    },
  };

  const precItem = converterItemExtracaoParaPrecificacao(itemMock, {
    regimeAdquirente: 'LUCRO_PRESUMIDO',
    destinacao: 'revenda',
  });

  // ICMS de R$ 120 é aproveitado no Lucro Presumido
  assert.equal(precItem.credIcmsEntrada, 120.0);

  // PIS/COFINS é zerado no Lucro Presumido (regime cumulativo sem crédito de entrada)
  assert.equal(precItem.credPisCofinsEntrada, 0.0);

  // A auditoria tripartida está anexada com os detalhes
  assert.ok(precItem.auditoriaCreditos);
  assert.equal(precItem.auditoriaCreditos.destacadoXml.pis, 16.5);
  assert.equal(precItem.auditoriaCreditos.destacadoXml.cofins, 76.0);
  assert.equal(precItem.auditoriaCreditos.creditoEfetivadoCusto.pis, 0.0);
  assert.equal(precItem.auditoriaCreditos.creditoEfetivadoCusto.cofins, 0.0);
});

// ----------------------------------------------------------------------------
// TESTE 5: COMPRA NO LUCRO REAL COM IBS/CBS EM AGUARDANDO_EXTINCAO (ART. 47 LC 214/2025)
// Reconhece crédito admitido mas retém efetivação no CMV até extinção pelo fornecedor
// ----------------------------------------------------------------------------
test('5. IBS/CBS em Aguardando Extinção: Crédito admitido pela regra mas retido no CMV', () => {
  const res = classificarCreditosItemEntrada({
    vProd: 1000.0,
    vIBS: 10.0,
    vCBS: 88.0,
    regimeAdquirente: 'LUCRO_REAL',
    destinacao: 'comercializacao',
    statusExtincaoFornecedor: 'AGUARDANDO_EXTINCAO',
  });

  // XML destaca
  assert.equal(res.destacadoXml.ibs, 10.0);
  assert.equal(res.destacadoXml.cbs, 88.0);
  assert.equal(res.destacadoXml.total, 98.0);

  // Camada 2: Admitido pela regra tributária plena (não cumulatividade ampla)
  assert.equal(res.creditoAdmitidoRegra.ibs, 10.0);
  assert.equal(res.creditoAdmitidoRegra.cbs, 88.0);
  assert.equal(res.creditoAdmitidoRegra.total, 98.0);

  // Camada 3: Efetivado no CMV retido (R$ 0,00) conforme Art. 47 da LC 214/2025
  assert.equal(res.creditoEfetivadoCusto.ibs, 0.0);
  assert.equal(res.creditoEfetivadoCusto.cbs, 0.0);
  assert.equal(res.creditoEfetivadoCusto.total, 0.0);

  // Alerta explícito da LC 214/2025
  assert.ok(
    res.alertasGlosa.some(
      (a) => a.includes('aguardando extinção do débito pelo fornecedor') && a.includes('Art. 47 LC 214/2025')
    )
  );

  // Quando extinto via split payment, efetiva no CMV imediatamente
  const resSplit = classificarCreditosItemEntrada({
    vProd: 1000.0,
    vIBS: 10.0,
    vCBS: 88.0,
    regimeAdquirente: 'LUCRO_REAL',
    destinacao: 'comercializacao',
    statusExtincaoFornecedor: 'EXTINTO_SPLIT',
  });
  assert.equal(resSplit.creditoEfetivadoCusto.ibs, 10.0);
  assert.equal(resSplit.creditoEfetivadoCusto.cbs, 88.0);
  assert.equal(resSplit.creditoEfetivadoCusto.total, 98.0);
});

// ----------------------------------------------------------------------------
// TESTE 6: NORMALIZAÇÃO CANÔNICA DE DOCUMENTO FISCAL (SHA-256 E MODELO DUAL)
// ----------------------------------------------------------------------------
test('6. Normalização Canônica: DocumentoFiscalNormalizado com SHA-256 e Dupla Representação', () => {
  const extracaoMock = {
    tipoDocumento: 'XML',
    identificacao: {
      chaveAcesso: '41261100000000000199550010000000011000000010',
      numero: '1',
      serie: '1',
      dataEmissao: '2026-11-20',
      naturezaOperacao: 'Venda de Mercadoria',
    },
    emitente: {
      cnpj: '11222333000144',
      nome: 'Fornecedor Aço PR S.A.',
      uf: 'PR',
      crt: '3',
    },
    destinatario: {
      cnpj: '99888777000166',
      nome: 'Comprador Indústria Ltda',
      uf: 'PR',
    },
    itens: [
      {
        index: 1,
        cProd: 'ACO-1020',
        xProd: 'Barra Aço Carbono',
        ncm: '72142000',
        cfop: '5101',
        uCom: 'KG',
        qCom: 100,
        vUnCom: 10,
        vProd: 1000,
        ncmValidoSiscomex: true,
        sensivelParaAuditoria: false,
        tributos: {
          vICMS: 120.0,
          vIPI: 50.0,
          vPIS: 16.5,
          vCOFINS: 76.0,
        },
      },
    ],
  };

  const docNorm = normalizarExtracaoNfe(extracaoMock, {
    regime: 'LUCRO_REAL',
    tipoEstabelecimento: 'industria',
    destinacaoPadrao: 'industrializacao',
  });

  assert.ok(docNorm.sha256 && docNorm.sha256.length === 64);
  assert.equal(docNorm.itens[0].valorBruto.str, '1000.00');
  assert.equal(docNorm.itens[0].valorBruto.num, 1000.0);
  assert.equal(docNorm.totais.valorProdutos.str, '1000.00');
  assert.equal(docNorm.totais.totalIpi.str, '50.00');
  // IPI é admitido para indústria
  assert.equal(docNorm.itens[0].creditosTripartidos.creditoEfetivadoCusto.ipi, 50.0);
  assert.equal(docNorm.itens[0].creditosTripartidos.creditoEfetivadoCusto.icmsProprio, 120.0);
});
