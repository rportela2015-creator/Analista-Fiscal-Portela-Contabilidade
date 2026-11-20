import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCustoItemCPC16,
  consolidarCustosEntradaCPC16,
  gerarRelatorioCustosHtml,
  ratearFreteItensCPC16,
} from '../lib/custos.ts';
import { PORTELA_HEADER_CSS, renderHeaderPortela } from '../lib/relatorio-header.ts';

test('Motor de Custos CPC 16 (R1) e Cabeçalho Portela', async (t) => {
  await t.test('renderHeaderPortela: gera cabeçalho institucional com SVG inline e metadados sanitizados', () => {
    const html = renderHeaderPortela({
      titulo: 'Laudo de Auditoria <script>alert(1)</script>',
      subtitulo: 'Subtítulo "Teste" & Seguro',
      dataHora: '13/11/2026 11:30:00',
      documentoRef: 'Ref-001',
    });

    assert.ok(html.includes('rel-header'));
    assert.ok(html.includes('CONTABILIDADE PORTELA'));
    assert.ok(html.includes('DESDE 1970'));
    assert.ok(html.includes('Laudo de Auditoria &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Subtítulo &quot;Teste&quot; &amp; Seguro'));
    assert.ok(html.includes('Ref-001'));
    assert.equal(html.includes('<script>'), false);
  });

  const itemSimulado = {
    index: 1,
    cProd: 'PROD-01',
    xProd: 'Cadeira Ergonômica de Escritório',
    ncm: '94013100',
    cest: '2805900',
    cfop: '5102',
    uCom: 'UN',
    qCom: 10,
    vUnCom: 100,
    vProd: 1000,
    vDesc: 100,
    vFrete: 50,
    vSeg: 20,
    vOutro: 10,
    tributos: {
      vIPI: 40,
      vICMSST: 60,
      vII: 0,
      vIS: 0,
      vICMS: 120,
      vPIS: 16.5,
      vCOFINS: 76,
      vCBS: 8.1,
      vIBS: 0.9,
    },
    ncmValidoSiscomex: true,
    sensivelParaAuditoria: false,
  };

  await t.test('calcularCustoItemCPC16: Lucro Real apropria créditos e compõe custo unitário real', () => {
    const res = calcularCustoItemCPC16(itemSimulado, {
      regime: 'real',
      destinacao: 'comercializacao',
    });

    // vProd (1000) - vDesc (100) + frete/seg/outro (80) = 980
    // Trib não recup = IPI (40) + ICMS-ST (60) = 100
    // Impostos recup = ICMS (120) + PIS (16.5) + COFINS (76) + CBS (8.1) + IBS (0.9) = 221.5
    // Custo Total = 980 + 100 - 221.5 = 858.5
    // Custo Unitário = 858.5 / 10 = 85.85
    assert.equal(res.valorBruto, 1000);
    assert.equal(res.descontoIncondicional, 100);
    assert.equal(res.freteSeguroOutros, 80);
    assert.equal(res.tributosNaoRecuperaveis.total, 100);
    assert.equal(res.impostosRecuperaveis.total, 221.5);
    assert.equal(res.custoTotalReal, 858.5);
    assert.equal(res.custoUnitarioReal, 85.85);
    assert.equal(res.glosado, false);
    assert.ok(res.fundamentacaoLegal.some((f) => f.norma.includes('CPC 16')));
  });

  await t.test('calcularCustoItemCPC16: Uso e Consumo glosa créditos tornando-os custo de aquisição', () => {
    const res = calcularCustoItemCPC16(itemSimulado, {
      regime: 'real',
      destinacao: 'uso_consumo',
    });

    assert.equal(res.glosado, true);
    assert.ok(res.motivoGlosa?.includes('Uso e Consumo'));
    assert.equal(res.impostosRecuperaveis.total, 0);
    // Todos os tributos viram custo não recuperável: 100 + 221.5 = 321.5
    // Custo Total = 980 + 321.5 = 1301.5
    assert.equal(res.custoTotalReal, 1301.5);
    assert.equal(res.custoUnitarioReal, 130.15);
  });

  await t.test('consolidarCustosEntradaCPC16 e gerarRelatorioCustosHtml: gera HTML resumido e detalhado', () => {
    const consolidado = consolidarCustosEntradaCPC16([itemSimulado], {
      regime: 'real',
      destinacao: 'comercializacao',
    });

    assert.equal(consolidado.totalItens, 1);
    assert.equal(consolidado.custoTotalRealConsolidado, 858.5);

    const htmlResumido = gerarRelatorioCustosHtml(consolidado, 'resumido');
    assert.ok(htmlResumido.includes('Item 11 do CPC 16 (R1)'));
    assert.ok(htmlResumido.includes('PROD-01'));
    assert.ok(htmlResumido.includes('Visão Resumida'));

    const htmlDetalhado = gerarRelatorioCustosHtml(consolidado, 'detalhado');
    assert.ok(htmlDetalhado.includes('Visão Detalhada com Citação Legal'));
    assert.ok(htmlDetalhado.includes('CPC 16 (R1) / NBC TG 16 (R2)'));
    assert.ok(htmlDetalhado.includes('Item 11'));
  });

  await t.test('Caso Canônico NF-e Mista (Rateio Proporcional de Frete + Normal vs ICMS-ST)', () => {
    // NF-e Mista: Total produtos = R$ 1.000,00 | Frete Total = R$ 100,00 | Empresa no Lucro Real (Comércio / Revenda)
    const freteGlobal = 100.0;

    const itensBrutos = [
      {
        index: 1,
        cProd: 'PROD-A',
        xProd: 'Produto A (Tributação Normal)',
        ncm: '84713012',
        uCom: 'UN',
        qCom: 10,
        vUnCom: 80.0,
        vProd: 800.0, // 80% do total de produtos
        vDesc: 0,
        tributos: {
          vICMS: 144.0,
          vPIS: 13.2,
          vCOFINS: 60.8, // PIS + COFINS = 74,00 recuperável
          vIPI: 0,
          vICMSST: 0,
        },
      },
      {
        index: 2,
        cProd: 'PROD-B',
        xProd: 'Produto B (Com ICMS-ST)',
        ncm: '22021000',
        cest: '0301000',
        uCom: 'UN',
        qCom: 5,
        vUnCom: 40.0,
        vProd: 200.0, // 20% do total de produtos
        vDesc: 0,
        tributos: {
          cstIcms: '60',
          vICMSST: 35.0, // ICMS-ST destacado = R$ 35,00
          vICMS: 0,      // sem direito a crédito de ICMS próprio na revenda
          vPIS: 0,       // monofásico sem crédito
          vCOFINS: 0,
          vIPI: 0,
        },
      },
    ];

    // 1. Rateio proporcional do frete (Item 11 do CPC 16):
    const itensRateados = ratearFreteItensCPC16(itensBrutos, freteGlobal, 'valor');

    // Asserções obrigatórias de rateio de frete
    assert.equal(itensRateados[0].vFrete, 80.0, 'Rateio do Frete Produto A (80% da nota) deve ser R$ 80,00');
    assert.equal(itensRateados[1].vFrete, 20.0, 'Rateio do Frete Produto B (20% da nota) deve ser R$ 20,00');

    // 2. Apuração do Produto A (Normal)
    const custoProdA = calcularCustoItemCPC16(itensRateados[0], {
      regime: 'real',
      destinacao: 'comercializacao',
    });
    // Produto A: 800 + 80 - 144 - 74 = Custo Total R$ 662,00 / Custo Unitário R$ 66,20
    assert.equal(custoProdA.freteSeguroOutros, 80.0);
    assert.equal(custoProdA.impostosRecuperaveis.total, 218.0); // 144 + 74 = 218
    assert.equal(custoProdA.custoTotalReal, 662.0, 'Custo Total Produto A deve ser R$ 662,00');
    assert.equal(custoProdA.custoUnitarioReal, 66.2, 'Custo Unitário Produto A deve ser R$ 66,20');

    // 3. Apuração do Produto B (Com ICMS-ST)
    const custoProdB = calcularCustoItemCPC16(itensRateados[1], {
      regime: 'real',
      destinacao: 'comercializacao',
    });
    // Produto B: 200 + 20 + 35 - 0 = Custo Total R$ 255,00 / Custo Unitário R$ 51,00
    assert.equal(custoProdB.freteSeguroOutros, 20.0);
    assert.equal(custoProdB.tributosNaoRecuperaveis.icmsSt, 35.0);
    assert.equal(custoProdB.impostosRecuperaveis.total, 0.0);
    assert.equal(custoProdB.custoTotalReal, 255.0, 'Custo Total Produto B deve ser R$ 255,00');
    assert.equal(custoProdB.custoUnitarioReal, 51.0, 'Custo Unitário Produto B deve ser R$ 51,00');
  });
});
