/**
 * tests/m2-challenger-it3-empirical.test.mjs
 *
 * Suíte de Auditoria Empírica Adversarial — Iteração 3 (M2 Challenger)
 * Foco: Prova factual e empírica definitiva sobre a resolução de ambos os defeitos:
 * 1. Resolução do vazamento em buscas alfanuméricas ("CADERNO-1", "NOTE-10", "S24", etc.)
 *    garantindo que não correspondam acidentalmente a dígitos isolados em NCMs de 8 dígitos.
 * 2. Resolução do TypeError em item com cfop: undefined / null / vazio / tipos anômalos.
 * 3. Testes interativos em JSDOM simulando digitação real do usuário no campo de busca.
 * 4. Testes de estresse com fixtures reais e injeção de defeitos de contorno.
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

const loadJsdom = async () => {
  const mod = await (new Function('return import("jsdom")'))();
  return mod.JSDOM;
};

const clean = (html) => html.replace(/<!--.*?-->/g, '').replace(/\u00a0/g, ' ');

let passCount = 0;
let failCount = 0;

const t = async (name, fn) => {
  try {
    const t0 = performance.now();
    await fn();
    const elapsed = performance.now() - t0;
    passCount++;
    console.log(`OK (${elapsed.toFixed(2)}ms)  ${name}`);
  } catch (err) {
    failCount++;
    console.error(`FAIL  ${name}`, err);
    throw err;
  }
};

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  M2 CHALLENGER IT3 — EMPIRICAL ADVERSARIAL VERIFICATION SUITE       ');
console.log('══════════════════════════════════════════════════════════════════════');

// =========================================================================
// 1. FORENSIC AUDIT OF SOURCE CODE GUARDS
// =========================================================================

await t('Forensic Source Audit: TabelaItensExtracao.tsx possui guarda alfanumérica isNcmQuery', async () => {
  const code = await readFile(join(process.cwd(), 'components/TabelaItensExtracao.tsx'), 'utf8');

  // Verifica que busca de NCM só ocorre se NÃO houver letras e tiver >= 2 dígitos numéricos
  assert.ok(
    code.includes('const isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2;'),
    'Deve definir isNcmQuery com verificação de ausência de letras e ao menos 2 dígitos'
  );
  assert.ok(
    code.includes('isNcmQuery && it.ncm && it.ncm.replace(/\\D/g, \'\').includes(termoNumerico)'),
    'Deve condicionar a busca por NCM a isNcmQuery'
  );

  // Verifica guarda defensiva no CFOP Interestadual
  assert.ok(
    code.includes('item.cfop && (item.cfop.startsWith(\'6\') || item.cfop.startsWith(\'2\'))'),
    'Deve conter guarda item.cfop antes de invocar startsWith'
  );
});

// =========================================================================
// 2. EMPIRICAL VERIFICATION: ALPHANUMERIC SEARCH LEAKAGE RESISTANCE
// =========================================================================

const itensDataset = [
  { index: 1, cProd: 'CANETA-AZUL', xProd: 'Caneta esferográfica azul', ncm: '96081000', cfop: '5405' },
  { index: 2, cProd: 'BORRACHA', xProd: 'Borracha escolar branca', ncm: '40169200', cfop: '5405' },
  { index: 3, cProd: 'CADERNO-1', xProd: 'Caderno espiral 1 matéria', ncm: '48201000', cfop: '6102' },
  { index: 4, cProd: 'CADERNO-10', xProd: 'Caderno espiral 10 matérias', ncm: '48201000', cfop: '6102' },
  { index: 5, cProd: 'NOTE-10', xProd: 'Notebook 10 polegadas ultra', ncm: '84713012', cfop: '2102' },
  { index: 6, cProd: 'S24', xProd: 'Smartphone Galaxy S24 Ultra', ncm: '85171300', cfop: '6102' },
  { index: 7, cProd: 'PAPEL-A4', xProd: 'Papel Sulfite A4 75g', ncm: '48025610', cfop: '5405' },
];

function executarFiltro(itens, busca) {
  let res = itens;
  if (busca && busca.trim()) {
    const termo = busca.trim().toLowerCase();
    const termoNumerico = termo.replace(/\D/g, '');
    const isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2;
    res = res.filter((it) => {
      return (
        (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
        (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
        (isNcmQuery && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)) ||
        (it.cfop && it.cfop.includes(termo)) ||
        (it.cEAN && it.cEAN.includes(termo))
      );
    });
  }
  return res;
}

await t('Alphanumeric Search: CADERNO-1 retorna estritamente itens relacionados a CADERNO-1', async () => {
  const res = executarFiltro(itensDataset, 'CADERNO-1');
  const codigos = res.map((i) => i.cProd);

  // Deve retornar CADERNO-1 e CADERNO-10 (pois CADERNO-10 contém o prefixo "caderno-1")
  // Mas NUNCA CANETA-AZUL (96081000), BORRACHA (40169200) ou NOTE-10 (84713012)
  assert.ok(codigos.includes('CADERNO-1'), 'CADERNO-1 deve ser encontrado');
  assert.ok(!codigos.includes('CANETA-AZUL'), 'CANETA-AZUL não pode vazar');
  assert.ok(!codigos.includes('BORRACHA'), 'BORRACHA não pode vazar');
  assert.ok(!codigos.includes('NOTE-10'), 'NOTE-10 não pode vazar');
  assert.ok(!codigos.includes('S24'), 'S24 não pode vazar');
  assert.ok(!codigos.includes('PAPEL-A4'), 'PAPEL-A4 não pode vazar');
});

await t('Alphanumeric Search: S24 isola exclusivamente o smartphone sem vazar NCMs com 2 ou 4', async () => {
  const res = executarFiltro(itensDataset, 'S24');
  const codigos = res.map((i) => i.cProd);

  assert.equal(codigos.length, 1, 'Apenas 1 item deve ser retornado para busca S24');
  assert.equal(codigos[0], 'S24', 'Item retornado deve ser S24');
});

await t('Alphanumeric Search: NOTE-10 isola exclusivamente o notebook', async () => {
  const res = executarFiltro(itensDataset, 'NOTE-10');
  const codigos = res.map((i) => i.cProd);

  assert.equal(codigos.length, 1, 'Apenas 1 item deve ser retornado para busca NOTE-10');
  assert.equal(codigos[0], 'NOTE-10', 'Item retornado deve ser NOTE-10');
});

await t('Numeric NCM Search: busca por 8471 retorna NOTE-10 pelo NCM', async () => {
  const res = executarFiltro(itensDataset, '8471');
  const codigos = res.map((i) => i.cProd);

  assert.equal(codigos.length, 1, 'Busca por 8471 deve encontrar o notebook');
  assert.equal(codigos[0], 'NOTE-10');
});

await t('Formatted NCM Search: busca por 8471.30.12 funciona com pontuação', async () => {
  const res = executarFiltro(itensDataset, '8471.30.12');
  const codigos = res.map((i) => i.cProd);

  assert.equal(codigos.length, 1, 'Busca por NCM pontuado 8471.30.12 deve encontrar o notebook');
  assert.equal(codigos[0], 'NOTE-10');
});

await t('Single Digit Search: busca por "1" NÃO ativa correspondência por NCM em todos os itens', async () => {
  const res = executarFiltro(itensDataset, '1');
  const codigos = res.map((i) => i.cProd);

  // Não pode retornar 100% dos itens só porque quase todo NCM tem dígito 1!
  assert.ok(!codigos.includes('BORRACHA'), 'Borracha (NCM 40169200) não deve casar na busca "1"');
});

// =========================================================================
// 3. EMPIRICAL VERIFICATION: MALFORMED CFOP & SSR STABILITY
// =========================================================================

await t('CFOP Resilience: Itens com cfop undefined, null, "", "6102", "2102", "5102" renderizam perfeitamente em SSR', async () => {
  const itensComCfopVariados = [
    { index: 1, cProd: 'P1', xProd: 'Produto CFOP Undefined', ncm: '84713012', cfop: undefined },
    { index: 2, cProd: 'P2', xProd: 'Produto CFOP Null', ncm: '84713012', cfop: null },
    { index: 3, cProd: 'P3', xProd: 'Produto CFOP Vazio', ncm: '84713012', cfop: '' },
    { index: 4, cProd: 'P4', xProd: 'Produto CFOP Interno', ncm: '84713012', cfop: '5102' },
    { index: 5, cProd: 'P5', xProd: 'Produto CFOP Inter Saída', ncm: '84713012', cfop: '6102' },
    { index: 6, cProd: 'P6', xProd: 'Produto CFOP Inter Entrada', ncm: '84713012', cfop: '2102' },
  ];

  const html = clean(
    renderToString(
      React.createElement(TabelaItensExtracao, {
        itens: itensComCfopVariados,
        selectedIndices: new Set([1, 2, 3, 4, 5, 6]),
        onToggleSelect: () => {},
        onSelectAll: () => {},
        onDeselectAll: () => {},
      })
    )
  );

  // Verifica presença de fallbacks e badges
  assert.ok(html.includes('----'), 'CFOP undefined/null/vazio deve exibir "----"');
  assert.ok(html.includes('5102'), 'CFOP 5102 deve ser exibido');
  assert.ok(html.includes('6102'), 'CFOP 6102 deve ser exibido');
  assert.ok(html.includes('2102'), 'CFOP 2102 deve ser exibido');

  // Conta quantas badges "Inter" foram renderizadas (devem ser exatamente 2: para 6102 e 2102)
  const matchesInter = html.match(/title="CFOP Interestadual \(sujeito a DIFAL\)"/g) || [];
  assert.equal(matchesInter.length, 2, 'Devem existir exatamente 2 badges "Inter" (para CFOPs 6102 e 2102)');
});

// =========================================================================
// 4. JSDOM INTERACTIVE DOM: DIGITAÇÃO REAL DE BUSCA E FILTRAGEM
// =========================================================================

await t('JSDOM Interactive: Usuário digita "CADERNO-1" no campo de busca e tabela filtra visualmente no DOM', async () => {
  const JSDOM = await loadJsdom();
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const g = globalThis;
  const origWindow = g.window;
  const origDocument = g.document;
  g.window = window;
  g.document = window.document;
  for (const k of [
    'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'InputEvent', 'Event', 'MouseEvent', 'FocusEvent', 'KeyboardEvent', 'CustomEvent',
    'Node', 'Text', 'DocumentFragment'
  ]) {
    g[k] = window[k] ?? g[k];
  }
  g.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const clientMod = await (new Function('return import("react-dom/client")'))();
  const { createRoot } = clientMod;
  const { act } = React;

  const container = window.document.getElementById('root');
  const root = createRoot(container);

  try {
    // Monta a tabela com dataset contendo itens com NCMs com "1"
    await act(async () => {
      root.render(
        React.createElement(TabelaItensExtracao, {
          itens: itensDataset,
          selectedIndices: new Set([1, 2, 3]),
          onToggleSelect: () => {},
          onSelectAll: () => {},
          onDeselectAll: () => {},
        })
      );
    });

    // Localiza campo de busca
    const searchInput = container.querySelector('input[placeholder*="Buscar por código"]');
    assert.ok(searchInput, 'Campo de busca textual deve existir no DOM');

    const digitar = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    };

    // Inicialmente, todas as 7 linhas devem estar presentes
    let rows = container.querySelectorAll('tbody tr');
    assert.equal(rows.length, 7, 'Inicialmente todas as 7 linhas de itens estão no DOM');

    // Digita "CADERNO-1" no input
    await act(async () => {
      digitar(searchInput, 'CADERNO-1');
    });

    // Inspeciona linhas restantes
    rows = container.querySelectorAll('tbody tr');
    // Deve haver 2 linhas: CADERNO-1 e CADERNO-10
    const textContent = Array.from(rows).map((r) => r.textContent).join(' ');
    assert.ok(textContent.includes('CADERNO-1'), 'CADERNO-1 deve estar visível');
    assert.ok(!textContent.includes('CANETA-AZUL'), 'CANETA-AZUL NÃO pode estar visível');
    assert.ok(!textContent.includes('BORRACHA'), 'BORRACHA NÃO pode estar visível');

    // Limpa a busca
    await act(async () => {
      digitar(searchInput, '');
    });

    rows = container.querySelectorAll('tbody tr');
    assert.equal(rows.length, 7, 'Ao limpar a busca, todas as 7 linhas retornam');

  } finally {
    await act(async () => {
      root.unmount();
    });
    g.window = origWindow;
    g.document = origDocument;
  }
});

// =========================================================================
// 5. XML FIXTURES + INJEÇÃO DE CFOP UNDEFINED
// =========================================================================

await t('XML Fixtures Stress: Injeção de itens com cfop undefined em todas as 8 fixtures reais renderiza sem erro', async () => {
  const mapaD8 = getMapaD8();
  const fixtures = [
    'nfe-single-item.xml',
    'nfe-multi-15.xml',
    'nfe-multi-30.xml',
    'nfe-multi-55.xml',
    'nfe-simples-csosn102.xml',
    'nfe-interstate-st.xml',
    'nfe-malformed-ncm.xml',
    'nfe-missing-optional-tags.xml',
  ];

  for (const f of fixtures) {
    const xml = await readFile(join(process.cwd(), 'tests/fixtures', f), 'utf8');
    const extracao = extrairDadosXmlNfe(xml, mapaD8);

    // Injeta um item com cfop undefined na extração
    const itensComInjecao = [
      ...extracao.itens,
      {
        index: 9999,
        cProd: 'INJECTED-ANOMALOUS',
        xProd: 'Item Injetado Sem CFOP',
        ncm: '84713012',
        ncmValidoSiscomex: true,
        cfop: undefined,
        uCom: 'UN',
        qCom: 1,
        vUnCom: 50,
        vProd: 50,
        tributos: {},
      },
    ];

    const html = clean(
      renderToString(
        React.createElement(TabelaItensExtracao, {
          itens: itensComInjecao,
          selectedIndices: new Set([1, 9999]),
          onToggleSelect: () => {},
          onSelectAll: () => {},
          onDeselectAll: () => {},
        })
      )
    );

    assert.ok(html.includes('INJECTED-ANOMALOUS'), `Fixture ${f} renderizou item injetado`);
    assert.ok(html.includes('----'), `Fixture ${f} renderizou fallback ---- para cfop undefined`);
  }
});

// =========================================================================
// SUMÁRIO DO RELATÓRIO DO CHALLENGER
// =========================================================================

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(`  M2 CHALLENGER IT3 HARNESS: ${passCount} aprovados, ${failCount} falhas`);
console.log('══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) process.exit(1);
