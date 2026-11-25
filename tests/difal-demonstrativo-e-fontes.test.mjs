import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOGO_FONTES_NORMATIVAS,
  obterFontesNormativasPorAba,
  obterFontesDifalPR,
  obterFonteNormativaPorId,
} from '../lib/fiscal/fontes-normativas.ts';

import {
  calcularPrazoRecolhimentoDifalPR,
  calcularDifalItemEntradaPR,
  apurarDemonstrativoDifalEntradaPR,
  consolidarMultiplasNotasDifalPR,
} from '../lib/fiscal/difal-pr.ts';

test('Marco 1 — Catálogo consolidado de fontes normativas e filtros por aba', () => {
  assert.ok(CATALOGO_FONTES_NORMATIVAS.length >= 15);

  const tudoTexto = CATALOGO_FONTES_NORMATIVAS.map(
    (f) => `${f.norma} ${f.artigo} ${f.ementa} ${f.diploma}`
  ).join('\n');

  const obrigatorios = [
    '7.871/2017',
    'Art. 3º',
    'Art. 28',
    'Art. 74',
    'Art. 542',
    'Art. 545',
    'NPF nº 052/2018',
    'PR239999',
    'PR259999',
    'E310',
    'E316',
    '6.048/2024',
    '12.828/2026',
    'SEFA/PR nº 48/2026',
    '214/2025',
    '227/2026',
    '2026.008',
    'CGSN nº 186/2026',
    'CGSN nº 194/2026',
    '127/2026',
    '128/2026',
  ];

  for (const termo of obrigatorios) {
    assert.ok(
      tudoTexto.includes(termo),
      `Catálogo normativo deve conter referência obrigatória: ${termo}`
    );
  }

  const abaAuditoria = obterFontesNormativasPorAba('auditoria');
  const abaPrecificacao = obterFontesNormativasPorAba('precificacao');
  const abaReforma = obterFontesNormativasPorAba('reforma');
  const fontesDifal = obterFontesDifalPR();

  assert.ok(abaAuditoria.some((c) => c.id === 'npf-052-2018-efd'));
  assert.ok(abaAuditoria.some((c) => c.id === 'ricms-pr-art74-prazos'));
  assert.ok(abaPrecificacao.some((c) => c.id === 'convenios-icms-127-128-2026'));
  assert.ok(abaPrecificacao.some((c) => c.id === 'cgsn-186-2026'));
  assert.ok(abaReforma.some((c) => c.id === 'lc-227-2026'));
  assert.ok(abaReforma.some((c) => c.id === 'nt-2026-008-v101'));
  assert.ok(fontesDifal.some((c) => c.id === 'ricms-pr-art542-gnre'));
  assert.ok(obterFonteNormativaPorId('sefa-pr-consulta-48-2026'));
});

test('Marco 2 — Prazos legais e códigos de guia/EFD para DIFAL PR', () => {
  // 1. Contribuinte inscrito (Regime Normal): dia 12 do mês subsequente (virada de ano)
  const prazoNormal = calcularPrazoRecolhimentoDifalPR('2026-12-18', 'inscrito_normal', true);
  assert.equal(prazoNormal.guia, 'GR-PR 1015');
  assert.equal(prazoNormal.codigoReceita, '1015');
  assert.equal(prazoNormal.dataVencimento, '2027-01-12');
  assert.equal(prazoNormal.dataVencimentoFormatada, '12/01/2027');
  assert.deepEqual(prazoNormal.codigosEfd, ['E310', 'E316', 'PR239999', 'PR259999']);

  // 2. Simples Nacional: dia 20 do 2º mês subsequente (nov/2026 -> jan/2027)
  const prazoSimples = calcularPrazoRecolhimentoDifalPR('2026-11-25', 'simples_nacional', true);
  assert.equal(prazoSimples.guia, 'DeSTDA/GR-PR');
  assert.equal(prazoSimples.dataVencimento, '2027-01-20');
  assert.equal(prazoSimples.dataVencimentoFormatada, '20/01/2027');

  // 3. Não inscrito no CAD/ICMS-PR: GNRE antes da saída
  const prazoNaoInscrito = calcularPrazoRecolhimentoDifalPR('2026-11-25', 'nao_inscrito', true);
  assert.equal(prazoNaoInscrito.guia, 'GNRE');
  assert.equal(prazoNaoInscrito.dataVencimento, 'ANTES_DA_SAIDA');
  assert.match(prazoNaoInscrito.dataVencimentoFormatada, /Antes da saída/i);

  // 4. Dispensado
  const prazoDisp = calcularPrazoRecolhimentoDifalPR('2026-11-25', 'inscrito_normal', false);
  assert.equal(prazoDisp.guia, 'DISPENSADO');
});

test('Marco 2 — Apuração DIFAL item a item, somatório da nota e consolidação multi-nota', () => {
  const nota1 = {
    identificacao: {
      chaveAcesso: '41261100000000000191550010000001001000001001',
      numero: '100',
      dataEmissao: '2026-11-10',
    },
    emitente: { uf: 'SP', crt: '3' },
    destinatario: { uf: 'PR' },
    itens: [
      {
        index: 1,
        cProd: 'IT-001',
        xProd: 'Notebook Uso Interno',
        ncm: '84713012',
        cfop: '6556',
        vProd: 1000,
        tributos: { pICMS: 12, vICMS: 120, orig: 0, cstIcms: '00' },
      },
      {
        index: 2,
        cProd: 'IT-002',
        xProd: 'Perfume Uso Pessoal/Brinde',
        ncm: '33030010',
        cfop: '6556',
        vProd: 1000,
        tributos: { pICMS: 4, vICMS: 40, orig: 1, cstIcms: '00' },
      },
      {
        index: 3,
        cProd: 'IT-003',
        xProd: 'Mercadoria p/ Revenda Nacional',
        ncm: '84713012',
        cfop: '6102',
        vProd: 500,
        tributos: { pICMS: 12, vICMS: 60, orig: 0, cstIcms: '00' },
      },
      {
        index: 4,
        cProd: 'IT-004',
        xProd: 'Material Uso Consumo com ST Anterior Válida',
        ncm: '73181500',
        cfop: '6407',
        vProd: 400,
        tributos: { pICMS: 12, vICMS: 48, vICMSST: 55, cstIcms: '60', orig: 0 },
      },
    ],
  };

  const demo1 = apurarDemonstrativoDifalEntradaPR(nota1, {
    crtDestinatario: 3,
    inscritoEstadualPR: true,
  });

  assert.equal(demo1.exigeRecolhimento, true);
  assert.equal(demo1.somatorio.qtdItensAnalisados, 4);
  assert.equal(demo1.somatorio.qtdItensTributados, 2);

  // Item 1 (19.5% PR modal, sem FECOP): (1000 - 120) / 0.805 = 1093.17 -> DIFAL 93.17
  const it1 = demo1.itens[0];
  assert.equal(it1.cProd, 'IT-001');
  assert.equal(it1.exigeRecolhimento, true);
  assert.equal(it1.baseDupla, 1093.17);
  assert.equal(it1.valorDifalPrincipal, 93.17);
  assert.equal(it1.valorFecop, 0);
  assert.equal(it1.valorDifalTotal, 93.17);
  assert.ok(it1.fundamento.includes('RICMS/PR'));

  // Item 2 (Perfume 33030010 -> 23% + 2% FECOP): (1000 - 40) / 0.75 = 1280.00 -> DIFAL 254.40, FECOP 25.60
  const it2 = demo1.itens[1];
  assert.equal(it2.exigeRecolhimento, true);
  assert.equal(it2.baseDupla, 1280.0);
  assert.equal(it2.valorDifalPrincipal, 254.4);
  assert.equal(it2.valorFecop, 25.6);
  assert.equal(it2.valorDifalTotal, 280.0);

  // Item 3 (Revenda 6102) e Item 4 (ST 60) devem estar dispensados
  assert.equal(demo1.itens[2].exigeRecolhimento, false);
  assert.equal(demo1.itens[3].exigeRecolhimento, false);

  assert.equal(demo1.somatorio.totalBaseDifal, 2373.17);
  assert.equal(demo1.somatorio.totalDifalPrincipal, 347.57);
  assert.equal(demo1.somatorio.totalFecop, 25.6);
  assert.equal(demo1.somatorio.totalDifalGeral, 373.17);
  assert.equal(demo1.prazoRecolhimento.guia, 'GR-PR 1015');
  assert.equal(demo1.prazoRecolhimento.dataVencimento, '2026-12-12');

  // Segunda nota (operação interna PR -> PR: dispensada)
  const demo2 = apurarDemonstrativoDifalEntradaPR({
    identificacao: { numero: '200', dataEmissao: '2026-11-15' },
    emitente: { uf: 'PR' },
    destinatario: { uf: 'PR' },
    itens: [{ index: 1, cProd: 'INT-1', xProd: 'Item Interno', ncm: '84713012', cfop: '5556', vProd: 500 }],
  });
  assert.equal(demo2.exigeRecolhimento, false);

  // Consolidação multi-nota
  const acumulado = consolidarMultiplasNotasDifalPR([demo1, demo2]);
  assert.equal(acumulado.qtdNotas, 2);
  assert.equal(acumulado.qtdNotasComDifal, 1);
  assert.equal(acumulado.totalDifalGeral, 373.17);
  assert.equal(acumulado.qtdItensTributados, 2);

  // Item com NCM excluída da ST pelo Decreto 12.828/2026 não deve ser blindado por ST indevida
  const itemExcluidoSt = calcularDifalItemEntradaPR({
    cProd: 'CEL-01',
    xProd: 'Celular Uso Corporativo',
    ncm: '85171300',
    cfop: '6551',
    destinacao: 'ativo_imobilizado',
    ufEmitente: 'SP',
    ufDestinatario: 'PR',
    dataFatoGerador: '2026-04-15',
    vProd: 1000,
    pIcmsOrigemPct: 12,
    vIcmsOrigem: 120,
    vIcmsStDestacado: 100,
    aliqIntraPrOverridePct: 19.5,
    fecopOverridePct: 0,
  });
  assert.equal(itemExcluidoSt.exigeRecolhimento, true);
  assert.ok(itemExcluidoSt.alertas.some((a) => a.includes('12.828/2026')));
});
