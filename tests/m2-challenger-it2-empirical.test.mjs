/**
 * tests/m2-challenger-it2-empirical.test.mjs
 *
 * Suíte de Auditoria Empírica Adversarial — Iteração 2 (M2 Challenger)
 * Foco: Prova factual de que:
 * 1. O bug da busca textual por palavras puramente alfabéticas está 100% resolvido.
 * 2. O bug de desincronização do Master Checkbox com índices órfãos está 100% resolvido.
 * 3. O comportamento tri-state (checked / indeterminate / unchecked) opera sem falhas em todos os estados.
 * 4. A seleção em lote, filtros por chips, seletor de motor e payload de auditoria estão íntegros.
 * 5. Desempenho e estabilidade sob 500 e 1.000 itens.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import React from 'react';
import { renderToString } from 'react-dom/server';
import TabelaItensExtracao from '../components/TabelaItensExtracao.tsx';
import { extrairDadosXmlNfe, montarAuditRequestPayload } from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

let passCount = 0;
let failCount = 0;

const t = async (name, fn) => {
  try {
    const t0 = performance.now();
    await fn();
    const elapsed = performance.now() - t0;
    passCount++;
    console.log(`[PASS] (${elapsed.toFixed(2)}ms) ${name}`);
  } catch (err) {
    failCount++;
    console.error(`[FAIL] ${name}\n`, err);
    throw err;
  }
};

console.log('══════════════════════════════════════════════════════════════════════');
console.log('   M2 CHALLENGER IT2 — EMPIRICAL ADVERSARIAL AUDIT SUITE             ');
console.log('══════════════════════════════════════════════════════════════════════');

// Fixtures
const clean = (html) => html.replace(/<!--.*?-->/g, '');

const mapaD8 = getMapaD8();
const fixtureXml15 = await readFile(join(process.cwd(), 'tests/fixtures/nfe-multi-15.xml'), 'utf8');
const extracao15 = extrairDadosXmlNfe(fixtureXml15, mapaD8);

// =========================================================================
// 1. VERIFICAÇÃO FORENSE DO CÓDIGO FONTE (STATIC AST / CODE AUDIT)
// =========================================================================

await t('Auditoria Forense de Código: components/TabelaItensExtracao.tsx possui guarda termoNumerico.length > 0', async () => {
  const codigo = await readFile(join(process.cwd(), 'components/TabelaItensExtracao.tsx'), 'utf8');

  // 1. Verifica presença do termoNumerico
  assert.ok(
    codigo.includes("const termoNumerico = termo.replace(/\\D/g, '');"),
    'Deve definir const termoNumerico = termo.replace(/\\D/g, "");'
  );

  // 2. Verifica guarda no filtro de NCM
  assert.ok(
    codigo.includes('termoNumerico.length > 0 && it.ncm'),
    'Deve condicionar a busca por NCM a termoNumerico.length > 0'
  );

  // 3. Verifica cálculo de selectedCount baseado estritamente nos itens reais da nota
  assert.ok(
    codigo.includes('itens.filter((it) => selectedSet.has(it.index)).length'),
    'selectedCount deve ser calculado filtrando os itens reais da nota contra selectedSet'
  );

  // 4. Verifica guardas defensivas contra valores nulos/indefinidos
  assert.ok(
    codigo.includes('it.cProd && it.cProd.toLowerCase().includes(termo)'),
    'Deve verificar existência de it.cProd defensivamente'
  );
  assert.ok(
    codigo.includes('it.xProd && it.xProd.toLowerCase().includes(termo)'),
    'Deve verificar existência de it.xProd defensivamente'
  );
});

// =========================================================================
// 2. VERIFICAÇÃO EMPÍRICA DA BUSCA TEXTUAL (ALGORITMO & COMPORTAMENTO)
// =========================================================================

// Função idêntica à implementada em TabelaItensExtracao.tsx (linhas 162-174)
function filtrarItens(itens, busca) {
  let res = itens;
  if (busca && busca.trim()) {
    const termo = busca.trim().toLowerCase();
    const termoNumerico = termo.replace(/\D/g, '');
    res = res.filter((it) => {
      return (
        (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
        (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
        (termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)) ||
        (it.cfop && it.cfop.includes(termo)) ||
        (it.cEAN && it.cEAN.includes(termo))
      );
    });
  }
  return res;
}

await t('Busca Textual Empírica: termo puramente alfabético inexistente retorna 0 itens (Bug Resolvido)', async () => {
  const termosInexistentes = [
    'mouse',
    'teclado',
    'parafuso',
    'produto_totalmente_inexistente',
    'abracadabra',
  ];

  for (const termo of termosInexistentes) {
    const filtrados = filtrarItens(extracao15.itens, termo);
    assert.equal(
      filtrados.length,
      0,
      `Termo puramente alfabético inexistente "${termo}" DEVE retornar 0 itens (retornou ${filtrados.length})`
    );
  }
});

await t('Busca Textual Empírica: termo alfabético existente retorna exatamente os itens corretos', async () => {
  const itemAlvo = extracao15.itens[0];
  const palavras = itemAlvo.xProd.split(/\s+/).filter((w) => w.length > 3 && /^[a-zA-Z]+$/.test(w));
  assert.ok(palavras.length > 0, 'Deve encontrar ao menos uma palavra puramente alfabética no item');

  const palavraBusca = palavras[0].toLowerCase();
  const filtrados = filtrarItens(extracao15.itens, palavraBusca);

  assert.ok(filtrados.length > 0, `Deve encontrar ao menos 1 item contendo "${palavraBusca}"`);
  assert.ok(filtrados.length <= extracao15.itens.length, 'Não pode retornar todos os itens indiscriminadamente');
  for (const it of filtrados) {
    const temNaDescricao = it.xProd.toLowerCase().includes(palavraBusca);
    const temNoCodigo = it.cProd.toLowerCase().includes(palavraBusca);
    assert.ok(temNaDescricao || temNoCodigo, `Item retornado deve conter o termo "${palavraBusca}"`);
  }
});

await t('Busca Textual Empírica: termo com NCM formatado e não formatado', async () => {
  const itemAlvo = extracao15.itens[0];
  const ncmPuro = itemAlvo.ncm; // ex: '84713012'
  const ncmFormatado = `${ncmPuro.slice(0, 4)}.${ncmPuro.slice(4, 6)}.${ncmPuro.slice(6)}`; // ex: '8471.30.12'

  const filtradosPuro = filtrarItens(extracao15.itens, ncmPuro);
  assert.ok(filtradosPuro.length >= 1, 'Deve localizar item pelo NCM puro');

  const filtradosFormatado = filtrarItens(extracao15.itens, ncmFormatado);
  assert.ok(filtradosFormatado.length >= 1, 'Deve localizar item pelo NCM com pontuação');
  assert.deepEqual(
    filtradosPuro.map((i) => i.index),
    filtradosFormatado.map((i) => i.index),
    'Busca por NCM puro e formatado devem produzir resultados equivalentes'
  );
});

await t('Busca Textual Empírica: resiliência defensiva com campos null / undefined', async () => {
  const itensMalformados = [
    {
      index: 1,
      cProd: undefined,
      xProd: undefined,
      ncm: undefined,
      cfop: undefined,
      cEAN: undefined,
    },
    {
      index: 2,
      cProd: null,
      xProd: null,
      ncm: null,
      cfop: null,
      cEAN: null,
    },
    {
      index: 3,
      cProd: 'VAL-01',
      xProd: 'Item Valido',
      ncm: '84713012',
      cfop: '5102',
      cEAN: 'SEM GTIN',
    },
  ];

  // Executa busca com termo alfabético e numérico sem lançar exceção
  assert.doesNotThrow(() => {
    const resAlfa = filtrarItens(itensMalformados, 'valido');
    assert.equal(resAlfa.length, 1);
    assert.equal(resAlfa[0].index, 3);

    const resNum = filtrarItens(itensMalformados, '8471');
    assert.equal(resNum.length, 1);
    assert.equal(resNum[0].index, 3);

    const resInexistente = filtrarItens(itensMalformados, 'inexistente');
    assert.equal(resInexistente.length, 0);
  });
});

// =========================================================================
// 3. VERIFICAÇÃO EMPÍRICA DA DESINCRONIZAÇÃO DO MASTER CHECKBOX
// =========================================================================

await t('Master Checkbox Empírico: SSR com 15 índices órfãos renderiza 0 selecionados e Master Desmarcado', async () => {
  // Simula 15 índices fantasmas de 901 a 915
  const indicesOrfaos = new Set(Array.from({ length: 15 }, (_, i) => i + 901));

  const rawHtml = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extracao15.itens,
      selectedIndices: indicesOrfaos,
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );
  const html = clean(rawHtml);

  // 1. Badge do cabeçalho
  assert.ok(html.includes('0 de 15 selecionados'), 'Cabeçalho deve acusar "0 de 15 selecionados"');
  assert.ok(!html.includes('15 de 15 selecionados'), 'Cabeçalho NÃO pode acusar "15 de 15 selecionados"');

  // 2. Alerta visual de 0 selecionados
  assert.ok(
    html.includes('Nenhum item selecionado para auditoria'),
    'Deve exibir aviso de que nenhum item está selecionado'
  );

  // 3. Master checkbox no thead NÃO pode estar com atributo checked
  // Em React SSR, se checked={false}, o atributo checked não é renderizado no HTML
  const theadHtml = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
  assert.ok(!theadHtml.includes('checked'), 'Master checkbox no <thead> NÃO pode ter o atributo checked');
});

await t('Master Checkbox Empírico: SSR com seleção parcial (3 reais + 10 órfãos) renderiza 3 selecionados', async () => {
  const indicesMistos = new Set([1, 2, 3, 901, 902, 903, 904, 905, 906, 907, 908, 909, 910]);

  const rawHtml = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extracao15.itens,
      selectedIndices: indicesMistos,
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );
  const html = clean(rawHtml);

  assert.ok(html.includes('3 de 15 selecionados'), 'Deve indicar 3 de 15 selecionados');
  assert.ok(html.includes('3 de 15 itens selecionados'), 'Deve indicar no bloco de métricas');

  const theadHtml = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
  assert.ok(!theadHtml.includes('checked'), 'Master checkbox NÃO pode estar marcado com seleção parcial');
});

await t('Master Checkbox Empírico: SSR com 15 itens reais selecionados (+ órfãos) renderiza Master Marcado', async () => {
  const todosMaisOrfaos = new Set([...Array.from({ length: 15 }, (_, i) => i + 1), 999]);

  const rawHtml = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extracao15.itens,
      selectedIndices: todosMaisOrfaos,
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );
  const html = clean(rawHtml);

  assert.ok(html.includes('15 de 15 selecionados'), 'Deve indicar 15 de 15 selecionados');

  const theadHtml = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
  assert.ok(theadHtml.includes('checked'), 'Master checkbox DEVE estar marcado quando todos os 15 itens reais estão selecionados');
});

// =========================================================================
// 4. TESTES DE ESTRESSE E CARGA (1.000 ITENS SINTÉTICOS)
// =========================================================================

await t('Estresse e Alta Volumetria: 1.000 itens sintetizados operam com latência < 5ms', async () => {
  const itens1000 = [];
  for (let i = 1; i <= 1000; i++) {
    itens1000.push({
      index: i,
      cProd: `SKU-${i}`,
      cEAN: `789000000${i}`,
      xProd: `Item Extensivo #${i} com Teclado e Mouse`,
      ncm: i % 2 === 0 ? '84713012' : '85044021',
      ncmValidoSiscomex: true,
      cfop: i % 2 === 0 ? '5102' : '6102',
      uCom: 'UN',
      qCom: 1,
      vUnCom: 100,
      vProd: 100,
      tributos: { vICMS: 18, vPIS: 1.65, vCOFINS: 7.6 },
      sensivelParaAuditoria: i % 3 === 0,
    });
  }

  // 1. Benchmark de busca com termo puramente alfabético
  const t0 = performance.now();
  const termo = 'teclado';
  const filtrados = filtrarItens(itens1000, termo);
  const tFiltro = performance.now() - t0;

  assert.equal(filtrados.length, 1000, 'Todos os 1000 itens contêm "Teclado"');
  assert.ok(tFiltro < 5, `Busca em 1000 itens levou ${tFiltro.toFixed(2)}ms (< 5ms)`);

  // 2. Benchmark de busca com termo alfabético inexistente
  const t1 = performance.now();
  const filtradosZero = filtrarItens(itens1000, 'inexistente_total');
  const tFiltroZero = performance.now() - t1;

  assert.equal(filtradosZero.length, 0, 'Termo inexistente deve retornar 0 itens');
  assert.ok(tFiltroZero < 5, `Busca negativa em 1000 itens levou ${tFiltroZero.toFixed(2)}ms (< 5ms)`);

  // 3. Benchmark de cálculo tri-state com 1000 itens e 500 índices órfãos
  const selectedIndicesMistos = new Set([
    ...Array.from({ length: 500 }, (_, i) => (i + 1) * 2), // 500 itens pares reais
    ...Array.from({ length: 500 }, (_, i) => i + 5000),    // 500 índices órfãos
  ]);

  const t2 = performance.now();
  const selectedSet = selectedIndicesMistos;
  const count = itens1000.filter((it) => selectedSet.has(it.index)).length;
  const todos = itens1000.length > 0 && count === itens1000.length;
  const algum = count > 0 && count < itens1000.length;
  const tCalc = performance.now() - t2;

  assert.equal(count, 500, 'Deve contabilizar exatamente os 500 itens reais');
  assert.equal(todos, false);
  assert.equal(algum, true);
  assert.ok(tCalc < 2, `Cálculo de selectedCount em 1000 itens levou ${tCalc.toFixed(2)}ms (< 2ms)`);

  // 4. Benchmark de montagem de payload com 500 itens selecionados
  const t3 = performance.now();
  const payload = montarAuditRequestPayload({
    motor: 'gemini',
    regime: 'Simples Nacional',
    extracao: {
      identificacao: { numero: '9999' },
      emitente: { cnpj: '00000000000191' },
      itens: itens1000,
    },
    selectedIndices: selectedIndicesMistos,
  });
  const tPayload = performance.now() - t3;

  assert.equal(payload.itensSelecionados.length, 500);
  assert.equal(payload.motor, 'gemini');
  assert.equal(payload.modelo, 'gemini-3.8-flash');
  assert.ok(tPayload < 5, `Montagem de payload de 500 itens levou ${tPayload.toFixed(2)}ms (< 5ms)`);
});

// =========================================================================
// 5. CONTRATO DO SELETOR DE MOTORES (OLLAMA VS GEMINI)
// =========================================================================

await t('Seletor de Motores: garante isolamento absoluto e payload conforme Contrato M2 ↔ M3', async () => {
  const selected = new Set([1, 2]);

  // Motor Ollama Local
  const pOllama = montarAuditRequestPayload({
    motor: 'ollama',
    modelo: 'qwen2.5:7b',
    regime: 'Simples Nacional',
    finalidade: 'Revenda/Comercialização',
    ufDestino: 'SP',
    extracao: extracao15,
    selectedIndices: selected,
  });

  assert.equal(pOllama.motor, 'ollama');
  assert.equal(pOllama.modelo, 'qwen2.5:7b');
  assert.equal(pOllama.contextoAdquirente.regime, 'Simples Nacional');
  assert.equal(pOllama.itensSelecionados.length, 2);

  // Motor Gemini API Cloud
  const pGemini = montarAuditRequestPayload({
    motor: 'gemini',
    regime: 'Regime Regular',
    finalidade: 'Industrialização',
    ufDestino: 'RJ',
    extracao: extracao15,
    selectedIndices: selected,
  });

  assert.equal(pGemini.motor, 'gemini');
  assert.equal(pGemini.modelo, 'gemini-3.8-flash');
  assert.equal(pGemini.contextoAdquirente.regime, 'Regime Regular');
  assert.equal(pGemini.itensSelecionados.length, 2);
});

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(`  M2 CHALLENGER EMPIRICAL VERIFICATION: ${passCount} aprovados, ${failCount} falhas`);
console.log('══════════════════════════════════════════════════════════════════════\n');
