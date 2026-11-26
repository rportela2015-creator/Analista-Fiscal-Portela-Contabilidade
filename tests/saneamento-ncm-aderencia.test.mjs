/**
 * Suíte Estrita de Saneamento Assistido xProd × NCM, Simulação Antes × Depois,
 * Dual-Track Imutável (Entrada XML vs. Saída/ERP/Precificação) e Escape XSS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { mods } from 'ncm:libs';

import { avaliarAderenciaNcm } from '../lib/fiscal/aderencia-ncm.ts';
import {
  simularImpactoSaneamentoNcm,
  aplicarSaneamentoNcmNoItem,
  reverterSaneamentoNcmNoItem,
} from '../lib/fiscal/saneamento-ncm.ts';
import {
  resolverContextoEmpresaNaData,
  construirItemFiscalAuditado,
  converterAuditadoParaParametrizacao,
  converterAuditadoParaPrecificacao,
} from '../lib/types/item-fiscal-auditado.ts';
import {
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoHtml,
  gerarRelatorioErpResumidoTxt,
} from '../lib/relatorio-erp.ts';
import { POST as gerarRelatorioAuditoriaPost } from '../app/api/auditoria-relatorio/route.ts';

globalThis.fetch = async (u) => {
  const url = String(u).split('?v=')[0];
  const rel = url.replace(/^\//, '');
  try {
    const t = await readFile(process.cwd() + '/public/' + rel, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(t) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

const ds = await mods.data.loadDataset();
await ds.pronto;
const marco = await mods.marco.loadMarcoLegal();

const EMPRESA_LP = {
  id: 'emp-lp-pr',
  escritorioId: 'esc-1',
  cnpj: '12345678000195',
  razaoSocial: 'Comercial Paranaense Ltda',
  uf: 'PR',
  inscricaoEstadual: '9012345678',
  ativo: true,
  cnaePrincipal: '4711302',
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: '2026-01-01T00:00:00Z',
  perfis: [
    {
      id: 'perf-lp',
      empresaId: 'emp-lp-pr',
      escritorioId: 'esc-1',
      regimeTributario: 'LUCRO_PRESUMIDO',
      vigenciaInicio: '2026-01-01',
      vigenciaFim: null,
      aliquotasEfetivas: {},
      simplesOptanteHibrido2027: false,
      beneficiosParana: { diferimentoParcialArt28: false, optanteRotSt: false, reducoesBcAtivas: [] },
      reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z',
    },
  ],
};

function criarItemNfe(overrides = {}) {
  return {
    index: 1,
    cProd: 'PROD-01',
    xProd: 'Camisa de algodão de malha',
    ncm: '61091000',
    ncmValidoSiscomex: true,
    cfop: '6101',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 1000,
    vProd: 1000,
    vFrete: 0,
    vSeg: 0,
    vDesc: 0,
    vOutro: 0,
    origemMercadoria: '0',
    origemTabelaA: 0,
    crtEmitente: '3',
    sensivelParaAuditoria: false,
    tributos: {
      cstIcms: '00',
      orig: 0,
      vBC: 1000,
      pICMS: 12,
      vICMS: 120,
      pIPI: 0,
      vIPI: 0,
      ...(overrides.tributos || {}),
    },
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TESTE 1: DETECÇÃO DE DIVERGÊNCIA REAL xProd × NCM
// ════════════════════════════════════════════════════════════════════════════
test('SAN-1 Detecta divergência real xProd × NCM (confeitaria sob pão / eletrônico sob plástico)', () => {
  const boloSobPao = avaliarAderenciaNcm('Bolo de Chocolate Recheado 500g', '19059010', ds);
  assert.notEqual(boloSobPao.statusAderencia, 'ADERENTE');
  assert.equal(boloSobPao.statusAderencia, 'DIVERGENTE');
  assert.ok(boloSobPao.scoreAderencia < 45);
  assert.ok(boloSobPao.candidatosRgi.length > 0);
  for (const c of boloSobPao.candidatosRgi) {
    assert.ok(ds.byD8.has(c.ncm), `Candidato ${c.ncm} deve existir no Siscomex`);
    assert.ok(!c.ncm.startsWith('84') && !c.ncm.startsWith('85'), `Bolo não deve sugerir máquina (${c.ncm})`);
  }

  const notebookSobPlastico = avaliarAderenciaNcm('Notebook 15 polegadas 16GB SSD', '39269090', ds);
  assert.equal(notebookSobPlastico.statusAderencia, 'DIVERGENTE');
  assert.ok(notebookSobPlastico.scoreAderencia < 45);
  assert.ok(notebookSobPlastico.candidatosRgi.length > 0);
  assert.ok(
    notebookSobPlastico.candidatosRgi.some((c) => c.ncm.startsWith('8471')),
    `Esperado candidato 8471, obtido: ${notebookSobPlastico.candidatosRgi.map((c) => c.ncm).join(', ')}`
  );

  const ncmInexistente = avaliarAderenciaNcm('Notebook 15 polegadas 16GB SSD', '99999999', ds);
  assert.equal(ncmInexistente.ncmValidoSiscomex, false);
  assert.equal(ncmInexistente.statusAderencia, 'DIVERGENTE');
  assert.equal(ncmInexistente.scoreAderencia, 0);

  console.log(
    '[SANEAMENTO_EXEMPLOS_DETECCAO]',
    JSON.stringify({
      boloSobPao: {
        ncmXml: boloSobPao.ncmFormatado,
        status: boloSobPao.statusAderencia,
        score: boloSobPao.scoreAderencia,
        topCandidato: boloSobPao.candidatosRgi[0]?.ncmFormatado,
      },
      notebookSobPlastico: {
        ncmXml: notebookSobPlastico.ncmFormatado,
        status: notebookSobPlastico.statusAderencia,
        score: notebookSobPlastico.scoreAderencia,
        topCandidato: notebookSobPlastico.candidatosRgi[0]?.ncmFormatado,
      },
    })
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TESTE 2: CASO ADERENTE SEM FALSO POSITIVO
// ════════════════════════════════════════════════════════════════════════════
test('SAN-2 Caso aderente retorna ADERENTE sem falso positivo', () => {
  const camiseta = avaliarAderenciaNcm('Camiseta de algodão de malha', '61091000', ds);
  assert.equal(camiseta.ncmValidoSiscomex, true);
  assert.equal(camiseta.statusAderencia, 'ADERENTE');
  assert.ok(camiseta.scoreAderencia >= 72, `Score esperado >= 72, obtido ${camiseta.scoreAderencia}`);

  const pao = avaliarAderenciaNcm('Pão de forma tradicional 500g', '19059010', ds);
  assert.equal(pao.statusAderencia, 'ADERENTE');
  assert.ok(pao.scoreAderencia >= 72, `Score esperado >= 72, obtido ${pao.scoreAderencia}`);
});

// ════════════════════════════════════════════════════════════════════════════
// TESTE 3: SIMULAÇÃO ANTES × DEPOIS COM PRECISÃO DECIMAL
// ════════════════════════════════════════════════════════════════════════════
test('SAN-3 Simulação Antes × Depois recalcula ICMS PR, ST/Exclusão, cClassTrib e CMV com precisão decimal', () => {
  const ctxLp = resolverContextoEmpresaNaData({ empresaAtiva: EMPRESA_LP, dataEmissao: '2026-06-15' });
  const doc = { dhEmi: '2026-06-15', ufOrigem: 'SP', ufDestino: 'PR', emitCrt: '3' };

  // Exemplo A: Item de uso e consumo declarado indevidamente como Arroz/Cesta Básica (10063021: 7% PR / 200003) -> saneado p/ 84713012 (19,5% PR / excluído ST Dec. 12.828/2026)
  const audUsoConsumo = construirItemFiscalAuditado({
    item: criarItemNfe({ xProd: 'Notebook corporativo 16GB SSD', ncm: '10063021' }),
    documento: doc,
    contextoEmpresa: ctxLp,
    destinacao: 'uso_consumo',
    opcoes: { marco, ds },
  });
  const impDifal = simularImpactoSaneamentoNcm(audUsoConsumo, '84713012', { ds, marco });

  assert.equal(impDifal.antes.aliqIcmsPrPct, 7);
  assert.equal(impDifal.antes.cClassTrib, '200003');
  assert.equal(impDifal.antes.reducaoIbsCbsPct, 100);
  assert.equal(impDifal.depois.aliqIcmsPrPct, 19.5);
  assert.equal(impDifal.depois.excluidoStPr, true);
  assert.equal(impDifal.depois.enquadramentoPendente, true);
  assert.equal(impDifal.deltaAliqIcmsPrPct, 12.5);
  assert.ok(impDifal.deltaDifalTotal > 0);
  assert.equal(impDifal.deltaCmvUnitario, impDifal.deltaDifalTotal);
  assert.equal(impDifal.haImpactoTributario, true);

  // Exemplo B: Troca de NCM com ST PR (33030010, MVA 58%) para excluído ST (84713012, MVA 0%)
  const audSt = construirItemFiscalAuditado({
    item: criarItemNfe({ xProd: 'Notebook portátil 15 polegadas', ncm: '33030010', cest: '2000100' }),
    documento: doc,
    contextoEmpresa: ctxLp,
    destinacao: 'revenda',
    opcoes: { marco, ds },
  });
  const impSt = simularImpactoSaneamentoNcm(audSt, '84713012', { ds, marco });
  assert.equal(impSt.antes.sujeitoStPr, true);
  assert.equal(impSt.antes.mvaOriginalPrPct, 58);
  assert.equal(impSt.depois.excluidoStPr, true);
  assert.equal(impSt.depois.mvaOriginalPrPct, 0);

  console.log(
    '[SANEAMENTO_EXEMPLOS_DELTA]',
    JSON.stringify({
      difalAntesDepois: {
        antesNcm: impDifal.antes.ncmFormatado,
        depoisNcm: impDifal.depois.ncmFormatado,
        deltaAliqIcmsPrPct: impDifal.deltaAliqIcmsPrPct,
        difalAntes: impDifal.antes.totalDifalRecolher,
        difalDepois: impDifal.depois.totalDifalRecolher,
        deltaDifal: impDifal.deltaDifalTotal,
        cmvAntes: impDifal.antes.cmvLiquidoUnitario,
        cmvDepois: impDifal.depois.cmvLiquidoUnitario,
      },
      stAntesDepois: {
        antesStMva: impSt.antes.mvaOriginalPrPct,
        depoisExcluidoSt: impSt.depois.excluidoStPr,
        depoisMva: impSt.depois.mvaOriginalPrPct,
      },
    })
  );
});

// ════════════════════════════════════════════════════════════════════════════
// TESTE 4: DUAL-TRACK IMUTÁVEL + PROPAGAÇÃO + REVERSÃO
// ════════════════════════════════════════════════════════════════════════════
test('SAN-4 Preserva ncmEscrituradoEntrada imutável, propaga ncmSaneadoSaida para ERP/Precificação e reverte', () => {
  const ctxLp = resolverContextoEmpresaNaData({ empresaAtiva: EMPRESA_LP, dataEmissao: '2026-06-15' });
  const baseAuditado = construirItemFiscalAuditado({
    item: criarItemNfe({ cProd: 'BOL-500', xProd: 'Bolo de Chocolate Recheado 500g', ncm: '19059010' }),
    documento: { dhEmi: '2026-06-15', ufOrigem: 'SP', ufDestino: 'PR', emitCrt: '3' },
    contextoEmpresa: ctxLp,
    destinacao: 'revenda',
    opcoes: { marco, ds },
  });

  const saneado = aplicarSaneamentoNcmNoItem(baseAuditado, {
    ncmSaneado: '19059090',
    justificativaPericial: 'RGI 1 e RGI 6: bolo recheado com chocolate diverge de pão de forma (1905.90.10).',
    ds,
    marco,
    agoraIso: '2026-11-26T12:00:00Z',
  });

  assert.equal(saneado.ncmEscrituradoEntrada, '19059010');
  assert.equal(saneado.saneamentoNcm?.overrideAtivo, true);
  assert.equal(saneado.saneamentoNcm?.ncmSaneadoSaida, '19059090');
  assert.match(saneado.saneamentoNcm?.orientacaoOperacional || '', /Ajuste SINIEF.*CC-e/i);

  const paraErp = converterAuditadoParaParametrizacao(saneado, marco);
  const paraPrec = converterAuditadoParaPrecificacao(saneado);
  assert.equal(paraErp.ncm, '19059090');
  assert.equal(paraPrec.ncm, '19059090');
  assert.equal(paraErp.itemAuditado?.ncmEscrituradoEntrada, '19059010');
  assert.equal(paraPrec.itemAuditado?.ncmEscrituradoEntrada, '19059010');

  const revertido = reverterSaneamentoNcmNoItem(saneado, ds);
  assert.equal(revertido.ncmEscrituradoEntrada, '19059010');
  assert.equal(revertido.saneamentoNcm?.overrideAtivo, false);
  assert.equal(revertido.saneamentoNcm?.ncmSaneadoSaida, null);
  assert.equal(converterAuditadoParaParametrizacao(revertido, marco).ncm, '19059010');
  assert.equal(converterAuditadoParaPrecificacao(revertido).ncm, '19059010');
});

// ════════════════════════════════════════════════════════════════════════════
// TESTE 5: ESCAPE XSS EM LAUDOS HTML (ERP + AUDITORIA API)
// ════════════════════════════════════════════════════════════════════════════
test('SAN-5 Escapa XSS (<script>, aspas) no bloco de saneamento dos relatórios ERP e Auditoria HTML', async () => {
  const ctxLp = resolverContextoEmpresaNaData({ empresaAtiva: EMPRESA_LP, dataEmissao: '2026-06-15' });
  const baseAuditado = construirItemFiscalAuditado({
    item: criarItemNfe({
      cProd: 'XSS-01',
      xProd: 'Bolo "Especial" <script>alert("xss")</script>',
      ncm: '19059010',
    }),
    documento: { dhEmi: '2026-06-15', ufOrigem: 'SP', ufDestino: 'PR', emitCrt: '3' },
    contextoEmpresa: ctxLp,
    destinacao: 'revenda',
    opcoes: { marco, ds },
  });

  const saneado = aplicarSaneamentoNcmNoItem(baseAuditado, {
    ncmSaneado: '19059090',
    justificativaPericial: `RGI 1 <script>alert("xss")</script> & 'aspas'`,
    ds,
    marco,
  });

  const payloadErp = {
    contexto: { emitente: { nome: 'Empresa Teste', cnpj: '12345678000195', uf: 'PR', regime: 'presumido', crt: '3' } },
    itens: [
      {
        cProd: saneado.cProd,
        xProd: saneado.xProd,
        ncm: saneado.saneamentoNcm?.ncmSaneadoSaida || saneado.ncm,
        cfop: '5102',
        custoCpc16: saneado.custoCpc16,
        saneamentoNcm: saneado.saneamentoNcm,
      },
    ],
  };

  const htmlRes = gerarRelatorioErpResumidoHtml(payloadErp);
  const htmlDet = gerarRelatorioErpDetalhadoHtml(payloadErp);
  const txtRes = gerarRelatorioErpResumidoTxt(payloadErp);

  assert.match(htmlRes, /Divergências de Classificação &amp; Saneamento NCM/);
  assert.match(htmlDet, /Divergências de Classificação &amp; Saneamento NCM/);
  assert.match(txtRes, /DIVERGÊNCIAS DE CLASSIFICAÇÃO & SANEAMENTO NCM/);
  assert.ok(!htmlRes.includes('<script>alert("xss")</script>'));
  assert.ok(!htmlDet.includes('<script>alert("xss")</script>'));

  const req = new NextRequest('http://localhost/api/auditoria-relatorio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'html',
      itensAuditados: [saneado],
      totaisCpc16: {
        valorProdutosBruto: 1000,
        freteNfeTotal: 0,
        freteCteFobTotal: 0,
        tributosNaoRecuperaveisTotal: 0,
        creditosRecuperaveisTotal: 120,
        cmvLiquidoTotal: 880,
      },
    }),
  });
  const resp = await gerarRelatorioAuditoriaPost(req);
  assert.equal(resp.status, 200);
  const apiHtml = await resp.text();
  assert.match(apiHtml, /Divergências de Classificação &amp; Saneamento NCM/);
  assert.ok(!apiHtml.includes('<script>alert("xss")</script>'));
  assert.ok(apiHtml.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
});
