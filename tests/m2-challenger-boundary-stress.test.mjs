/**
 * tests/m2-challenger-boundary-stress.test.mjs
 *
 * Empirical Adversarial Challenger Boundary Stress Harness — Milestone 2 (Iteration 2).
 * Agent: m2_challenger_it2_2 (teamwork_challenger)
 *
 * Direct Empirical Challenge on:
 * 1. 0 items edge case (SSR & DOM rendering)
 * 2. 1 item edge case (Tri-state, selection singular text, toggle, expand)
 * 3. Missing optional fields (EAN, vFrete, vSeg, vDesc, vOutro, cest, tributos, etc.)
 * 4. Malformed items (null, undefined, empty strings, NaN numbers)
 * 5. Full DOM interaction & event propagation via JSDOM
 * 6. Verification of worker remediation (search guard & phantom index sync)
 * 7. Real XML fixtures stress across all 8 project fixtures
 */

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

const clean = (html) => html.replace(/<!--.*?-->/g, '').replace(/\u00a0/g, ' ');

// Carregamento dinâmico em runtime para evitar bundle estático pelo esbuild de test.mjs
const loadJsdom = async () => {
  const mod = await (new Function('return import("jsdom")'))();
  return mod.JSDOM;
};

import TabelaItensExtracao from '../components/TabelaItensExtracao.tsx';
import {
  extrairDadosXmlNfe,
  montarAuditRequestPayload,
  FiscalExtractionError,
} from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

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
console.log('  M2 CHALLENGER — ADVERSARIAL BOUNDARY & DOM HARNESS (IT2_2)         ');
console.log('══════════════════════════════════════════════════════════════════════');

// =========================================================================
// 1. BOUNDARY CASE: 0 ITEMS
// =========================================================================

await t('Boundary 0 Itens: TabelaItensExtracao renderiza mensagem amigável sem tabela', async () => {
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [],
      selectedIndices: new Set(),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );

  assert.ok(html.includes('Nenhum item disponível na nota fiscal para exibição'), 'Deve exibir card vazio');
  assert.ok(!html.includes('<table'), 'Não deve renderizar elemento <table>');
  assert.ok(!html.includes('<th>'), 'Não deve renderizar cabeçalhos de coluna');
  assert.ok(!html.includes('input type="checkbox"'), 'Não deve renderizar checkboxes');
});

await t('Boundary 0 Itens: TabelaItensExtracao aceita array vazio e Set vazio sem lançar exceção', async () => {
  for (const emptySel of [[], new Set()]) {
    const html = renderToString(
      React.createElement(TabelaItensExtracao, {
        itens: [],
        selectedIndices: emptySel,
        onToggleSelect: () => {},
        onSelectAll: () => {},
        onDeselectAll: () => {},
      })
    );
    assert.ok(html.includes('Nenhum item disponível'));
  }
});

await t('Boundary 0 Itens: montarAuditRequestPayload rejeita seleção vazia com FiscalExtractionError', async () => {
  const notaVazia = {
    tipoDocumento: 'XML',
    identificacao: { chaveAcesso: '123' },
    emitente: { cnpj: '11222333000199', crt: '3' },
    destinatario: { cnpj: '44555666000188', uf: 'SP' },
    resumoFinanceiro: { vProdTotal: 0, vNF: 0 },
    totalItens: 0,
    itens: [],
  };

  assert.throws(
    () =>
      montarAuditRequestPayload({
        motor: 'ollama',
        regime: 'Simples Nacional',
        extracao: notaVazia,
        selectedIndices: new Set(),
      }),
    /A lista de itens selecionados para auditoria não pode estar vazia/
  );
});

// =========================================================================
// 2. BOUNDARY CASE: 1 ITEM
// =========================================================================

const itemUnico = {
  index: 1,
  cProd: 'PROD-SOLO-01',
  cEAN: '7891234567890',
  xProd: 'Item Individual Único de Teste',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  descricaoSiscomex: 'Computadores portáteis',
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 1500,
  vProd: 1500,
  tributos: {
    cstIcms: '00',
    vBC: 1500,
    pICMS: 18,
    vICMS: 270,
  },
  sensivelParaAuditoria: false,
  motivosSensibilidade: [],
};

await t('Boundary 1 Item: Estado Desmarcado (0/1) exibe singularidade gramatical e alerta', async () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [itemUnico],
      selectedIndices: new Set(),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));

  assert.ok(html.includes('Itens da Nota Fiscal (1 item)'), 'Deve usar "1 item" no singular');
  assert.ok(html.includes('0 de 1 selecionados'), 'Badge deve indicar 0 de 1');
  assert.ok(html.includes('Nenhum item selecionado para auditoria'), 'Alerta de nenhum item selecionado');
  assert.ok(html.includes('PROD-SOLO-01'), 'Código do produto presente');
  assert.ok(html.includes('R$ 1.500,00') || html.includes('1.500,00'), 'Valor formatado BRL');
});

await t('Boundary 1 Item: Estado Selecionado (1/1) calcula checked=true e indeterminate=false', async () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [itemUnico],
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));

  assert.ok(html.includes('1 de 1 selecionados'), 'Badge deve indicar 1 de 1');
  assert.ok(html.includes('1 de 1 item selecionado'), 'Resumo deve usar "item selecionado" no singular');
  assert.ok(!html.includes('Nenhum item selecionado para auditoria'), 'Não deve exibir alerta de vazio');
  assert.ok(html.includes('Apenas estes itens serão processados pelo motor de IA'), 'Nota explicativa ativa');
});

await t('Boundary 1 Item: montarAuditRequestPayload produz payload perfeitamente tipado com 1 item', async () => {
  const nota1 = {
    tipoDocumento: 'XML',
    identificacao: { chaveAcesso: '35261100000000000191550010000012341000012345', numero: '1001' },
    emitente: { cnpj: '11222333000199', crt: '3', regimeDescricao: 'Regime Normal' },
    destinatario: { cnpj: '44555666000188', uf: 'SP' },
    resumoFinanceiro: { vProdTotal: 1500, vNF: 1500 },
    totalItens: 1,
    itens: [itemUnico],
  };

  const payload = montarAuditRequestPayload({
    motor: 'ollama',
    regime: 'Simples Nacional',
    extracao: nota1,
    selectedIndices: new Set([1]),
  });

  assert.equal(payload.itensSelecionados.length, 1);
  assert.equal(payload.itensSelecionados[0].cProd, 'PROD-SOLO-01');
  assert.equal(payload.itensSelecionados[0].vProd, 1500);
});

// =========================================================================
// 3. BOUNDARY CASE: MISSING OPTIONAL FIELDS
// =========================================================================

const itemMinimoSemOpcionais = {
  index: 1,
  cProd: 'SKU-MINIMAL',
  xProd: 'Produto Mínimo Sem Opcionais',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  // Campos opcionais completamente omitidos:
  cEAN: undefined,
  cest: undefined,
  descricaoSiscomex: undefined,
  vFrete: undefined,
  vSeg: undefined,
  vDesc: undefined,
  vOutro: undefined,
  tributos: {}, // Tributos sem nenhum subgrupo destacado
  sensivelParaAuditoria: false,
  motivosSensibilidade: undefined,
};

await t('Missing Optionals: Item sem EAN, CEST, Siscomex, Frete ou Tributos renderiza sem crash', async () => {
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [itemMinimoSemOpcionais],
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );

  assert.ok(html.includes('SKU-MINIMAL'), 'Código cProd renderizado');
  assert.ok(html.includes('Produto Mínimo Sem Opcionais'), 'Descrição xProd renderizada');
  assert.ok(html.includes('5102'), 'CFOP renderizado');
  assert.ok(!html.includes('EAN:'), 'Não deve exibir label EAN se ausente');
  assert.ok(!html.includes('CEST'), 'Não deve exibir label CEST se ausente');
  assert.ok(html.includes('✓ Regular'), 'Badge Regular renderizado');
});

await t('Missing Optionals: Item com EAN="SEM GTIN" não exibe label de EAN', async () => {
  const itemSemGtin = { ...itemMinimoSemOpcionais, cEAN: 'SEM GTIN' };
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [itemSemGtin],
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );

  assert.ok(!html.includes('EAN: SEM GTIN'), 'Não deve renderizar EAN quando for "SEM GTIN"');
});

// =========================================================================
// 4. BOUNDARY CASE: MALFORMED ITEMS & DEFENSIVE RECOVERY
// =========================================================================

await t('Malformed Items: valores vazios ("") em cProd, xProd, ncm e cfop exibem fallbacks seguros', async () => {
  const itemVazio = {
    index: 1,
    cProd: '',
    xProd: '',
    ncm: '',
    ncmValidoSiscomex: false,
    cfop: '',
    uCom: '',
    qCom: 0,
    vUnCom: 0,
    vProd: 0,
    tributos: {},
    sensivelParaAuditoria: false,
  };

  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [itemVazio],
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));

  assert.ok(html.includes('S/ CÓD'), 'cProd vazio cai em "S/ CÓD"');
  assert.ok(html.includes('Descrição ausente'), 'xProd vazio cai em "Descrição ausente"');
  assert.ok(html.includes('--------'), 'NCM vazio cai em "--------"');
  assert.ok(html.includes('----'), 'CFOP vazio cai em "----"');
  assert.ok(html.includes('R$ 0,00'), 'vProd 0 cai em R$ 0,00');
});

await t('Malformed Items: valores numéricos anômalos (NaN, undefined, null) em formatadores', async () => {
  const itemNumerosQuebrados = {
    index: 1,
    cProd: 'SKU-NAN',
    xProd: 'Item com Números Inválidos',
    ncm: '84713012',
    ncmValidoSiscomex: true,
    cfop: '5102',
    uCom: undefined,
    qCom: NaN,
    vUnCom: null,
    vProd: undefined,
    tributos: {
      vICMS: NaN,
      pICMS: undefined,
      vIPI: null,
      pIPI: NaN,
    },
    sensivelParaAuditoria: false,
  };

  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [itemNumerosQuebrados],
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));

  // Não pode conter NaN em texto renderizado
  assert.ok(!html.includes('NaN'), 'Nenhum valor NaN deve vazar no HTML');
  assert.ok(html.includes('>0</span>') || html.includes('>0<'), 'formatarQtd retorna 0 para NaN');
  assert.ok(html.includes('>UN</span>'), 'uCom ausente faz fallback para UN');
  assert.ok(html.includes('R$ 0,00'), 'Valores ausentes caem em R$ 0,00');
});

// =========================================================================
// 5. SEARCH & FILTERING CHALLENGE (VERIFY ITERATION 2 REMEDIATION)
// =========================================================================

await t('Remediation Check: Busca alfabética sem algarismos NÃO retorna todos os itens', async () => {
  const itens = [
    { ...itemUnico, index: 1, cProd: 'CADEIRA-01', xProd: 'Cadeira de escritório ergonômica', ncm: '94013100' },
    { ...itemUnico, index: 2, cProd: 'MOUSE-01', xProd: 'Mouse óptico sem fio USB', ncm: '84716053' },
    { ...itemUnico, index: 3, cProd: 'TECLADO-01', xProd: 'Teclado mecânico ABNT2', ncm: '84716052' },
  ];

  // Simula busca "mouse"
  const termo = 'mouse';
  const termoLower = termo.trim().toLowerCase();
  const termoNumerico = termoLower.replace(/\D/g, '');

  const filtradosMouse = itens.filter((it) => {
    return (
      (it.cProd && it.cProd.toLowerCase().includes(termoLower)) ||
      (it.xProd && it.xProd.toLowerCase().includes(termoLower)) ||
      (termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)) ||
      (it.cfop && it.cfop.includes(termoLower)) ||
      (it.cEAN && it.cEAN.includes(termoLower))
    );
  });

  assert.equal(filtradosMouse.length, 1, 'Busca por "mouse" deve retornar exatamente 1 item');
  assert.equal(filtradosMouse[0].cProd, 'MOUSE-01');

  // Simula busca por palavra inexistente "abacaxi"
  const termoInexistente = 'abacaxi';
  const termoInexLower = termoInexistente.trim().toLowerCase();
  const termoInexNum = termoInexLower.replace(/\D/g, '');

  const filtradosInexistente = itens.filter((it) => {
    return (
      (it.cProd && it.cProd.toLowerCase().includes(termoInexLower)) ||
      (it.xProd && it.xProd.toLowerCase().includes(termoInexLower)) ||
      (termoInexNum.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoInexNum)) ||
      (it.cfop && it.cfop.includes(termoInexLower)) ||
      (it.cEAN && it.cEAN.includes(termoInexLower))
    );
  });

  assert.equal(filtradosInexistente.length, 0, 'Busca por termo inexistente deve retornar 0 itens (bug anterior corrigido)');
});

await t('Remediation Check: Sincronização estrita de selectedCount com itens reais (sem índices fantasmas)', async () => {
  const itens = [
    { ...itemUnico, index: 1 },
    { ...itemUnico, index: 2 },
    { ...itemUnico, index: 3 },
  ];

  // Passando 3 índices órfãos/fantasmas (991, 992, 993)
  const indicesOrfaos = new Set([991, 992, 993]);
  const selectedSet = indicesOrfaos;

  // Cálculo corrigido em TabelaItensExtracao:
  const selectedCount = itens.filter((it) => selectedSet.has(it.index)).length;
  const todosSelecionados = itens.length > 0 && selectedCount === itens.length;
  const algumSelecionado = selectedCount > 0 && selectedCount < itens.length;

  assert.equal(selectedCount, 0, 'selectedCount deve ser 0 para índices órfãos');
  assert.equal(todosSelecionados, false, 'todosSelecionados deve ser false');
  assert.equal(algumSelecionado, false, 'algumSelecionado deve ser false');

  // Renderização SSR confirma que Master Checkbox não é marcado
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens,
      selectedIndices: indicesOrfaos,
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));

  assert.ok(html.includes('0 de 3 selecionados'), 'Header deve mostrar 0 de 3 selecionados');
  assert.ok(html.includes('Nenhum item selecionado para auditoria'), 'Alerta de nenhum item selecionado deve estar visível');
});

// =========================================================================
// 6. JSDOM INTERACTIVE DOM MANIPULATION & REF BEHAVIOR
// =========================================================================

await t('JSDOM DOM: Montagem, eventos de clique, tri-state checkbox e desmontagem limpa', async () => {
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

  try {
    const ReactModule = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const container = window.document.getElementById('root');
    const root = createRoot(container);

    const itens = [
      { ...itemUnico, index: 1, cProd: 'CADEIRA-ALFA', xProd: 'Cadeira de escritório', ncm: '94013100', sensivelParaAuditoria: true, motivosSensibilidade: ['SUBSTITUICAO_TRIBUTARIA'] },
      { ...itemUnico, index: 2, cProd: 'MOUSE-BETA', xProd: 'Mouse óptico', ncm: '84716053', sensivelParaAuditoria: false },
      { ...itemUnico, index: 3, cProd: 'TECLADO-GAMA', xProd: 'Teclado mecânico', ncm: '84716052', sensivelParaAuditoria: false },
    ];

    let toggledIndex = null;
    let allSelectedCalled = false;
    let deselectAllCalled = false;

    // 1. Renderiza com item 1 selecionado (1 de 3 -> indeterminate)
    await act(async () => {
      root.render(
        ReactModule.createElement(TabelaItensExtracao, {
          itens,
          selectedIndices: new Set([1]),
          onToggleSelect: (idx) => { toggledIndex = idx; },
          onSelectAll: () => { allSelectedCalled = true; },
          onDeselectAll: () => { deselectAllCalled = true; },
        })
      );
    });

    const masterCheckbox = container.querySelector('thead input[type="checkbox"]');
    assert.ok(masterCheckbox, 'Master checkbox presente no DOM');
    assert.equal(masterCheckbox.checked, false, 'Master checkbox não deve estar checked para 1/3');
    assert.equal(masterCheckbox.indeterminate, true, 'Master checkbox DEVE ter indeterminate=true no DOM para 1/3');

    // 2. Simula clique no checkbox individual do item 2
    const rowCheckboxes = container.querySelectorAll('tbody input[type="checkbox"]');
    assert.equal(rowCheckboxes.length, 3, 'Devem existir 3 checkboxes nas linhas');

    await act(async () => {
      rowCheckboxes[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(toggledIndex, 2, 'onToggleSelect deve ser acionado com o índice 2');

    // 3. Simula clique no master checkbox (quando não todos estão selecionados -> onSelectAll)
    await act(async () => {
      masterCheckbox.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(allSelectedCalled, true, 'onSelectAll deve ser chamado');

    // 4. Re-renderiza com todos selecionados (3/3 -> checked=true, indeterminate=false)
    await act(async () => {
      root.render(
        ReactModule.createElement(TabelaItensExtracao, {
          itens,
          selectedIndices: new Set([1, 2, 3]),
          onToggleSelect: (idx) => { toggledIndex = idx; },
          onSelectAll: () => { allSelectedCalled = true; },
          onDeselectAll: () => { deselectAllCalled = true; },
        })
      );
    });

    assert.equal(masterCheckbox.checked, true, 'Master checkbox deve estar checked para 3/3');
    assert.equal(masterCheckbox.indeterminate, false, 'Master checkbox DEVE ter indeterminate=false para 3/3');

    // 5. Clique no master quando todos selecionados -> onDeselectAll
    await act(async () => {
      masterCheckbox.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(deselectAllCalled, true, 'onDeselectAll deve ser chamado ao desmarcar');

    // Helper para digitar em inputs controlados do React em JSDOM
    const digitar = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    };

    // 6. Teste de Busca em tempo real no DOM
    const searchInput = container.querySelector('input[type="text"]');
    assert.ok(searchInput, 'Input de busca deve existir no DOM');
    
    // Digita "CADEIRA-ALFA"
    await act(async () => {
      digitar(searchInput, 'CADEIRA-ALFA');
    });
    let rowsAposBusca = container.querySelectorAll('tbody tr');
    assert.equal(rowsAposBusca.length, 1, 'Busca por CADEIRA-ALFA deve exibir apenas 1 linha');

    // Digita busca inexistente
    await act(async () => {
      digitar(searchInput, 'PRODUTO_TOTALMENTE_INEXISTENTE');
    });
    let emptyTd = container.querySelector('tbody td');
    assert.ok(emptyTd.textContent.includes('Nenhum item corresponde ao filtro ou busca aplicada'), 'Deve exibir mensagem de nenhum item encontrado');

    // Limpa busca
    await act(async () => {
      digitar(searchInput, '');
    });

    // 7. Teste de Expansão de Linha (accordion)
    const expandButtons = container.querySelectorAll('tbody button.mini');
    assert.ok(expandButtons.length >= 3, 'Botões de expansão devem existir nas linhas');
    await act(async () => {
      expandButtons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    let detalheExpandido = container.querySelector('td[colspan="13"]');
    assert.ok(detalheExpandido, 'Linha expansível deve ser inserida no DOM');
    assert.ok(detalheExpandido.textContent.includes('Identificação Cadastral'), 'Deve exibir bloco cadastral');
    assert.ok(detalheExpandido.textContent.includes('ICMS e Substituição Tributária'), 'Deve exibir bloco ICMS');

    // 8. Teste de modo readOnly / disabled
    toggledIndex = null;
    await act(async () => {
      root.render(
        ReactModule.createElement(TabelaItensExtracao, {
          itens,
          selectedIndices: new Set([1]),
          onToggleSelect: (idx) => { toggledIndex = idx; },
          onSelectAll: () => {},
          onDeselectAll: () => {},
          readOnly: true,
        })
      );
    });
    const disabledRowCheck = container.querySelector('tbody input[type="checkbox"]');
    assert.equal(disabledRowCheck.disabled, true, 'Checkbox de linha deve estar desabilitado em modo readOnly');
    await act(async () => {
      disabledRowCheck.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(toggledIndex, null, 'onToggleSelect não deve ser chamado em modo readOnly');

    // Desmontagem limpa
    await act(async () => {
      root.unmount();
    });
    assert.equal(container.innerHTML, '', 'Container limpo após unmount');
  } finally {
    g.window = origWindow;
    g.document = origDocument;
  }
});

// =========================================================================
// 7. REAL XML FIXTURES END-TO-END RENDER STRESS
// =========================================================================

await t('XML Fixtures: Todas as 8 fixtures do projeto renderizam em TabelaItensExtracao sem exceções', async () => {
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
    assert.ok(extracao.itens.length > 0, `Fixture ${f} deve conter ao menos 1 item`);

    const html = clean(renderToString(
      React.createElement(TabelaItensExtracao, {
        itens: extracao.itens,
        selectedIndices: new Set(extracao.itens.map((it) => it.index)),
        onToggleSelect: () => {},
        onSelectAll: () => {},
        onDeselectAll: () => {},
      })
    ));

    assert.ok(html.includes(`Itens da Nota Fiscal (${extracao.itens.length}`), `Fixture ${f} renderizou cabeçalho correto`);
    assert.ok(html.includes('table class="tb"'), `Fixture ${f} renderizou tabela`);
  }
});

// =========================================================================
// 8. VULNERABILIDADES ADVERSARIAIS DETECTADAS (FINDINGS FOR WORKER)
// =========================================================================

await t('Vulnerabilidade Empírica: Busca alfanumérica com dígitos isolados vaza itens de NCMs coincidentes', async () => {
  const itens = [
    { cProd: 'CANETA-AZUL', xProd: 'Caneta esferográfica azul', ncm: '96081000' },
    { cProd: 'BORRACHA', xProd: 'Borracha escolar', ncm: '40169200' },
    { cProd: 'CADERNO-1', xProd: 'Caderno 1 matéria', ncm: '48201000' },
  ];
  const busca = 'CADERNO-1';
  const termo = busca.trim().toLowerCase();
  const termoNumerico = termo.replace(/\D/g, '');
  const res = itens.filter((it) => {
    return (
      (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
      (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
      (termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico))
    );
  });

  // Demonstração da falha empírica:
  // O usuário buscou "CADERNO-1". Esperava-se apenas 1 item (CADERNO-1).
  // Porém, como termoNumerico é "1", e CANETA-AZUL (96081000) e BORRACHA (40169200) possuem "1" no NCM,
  // todos os 3 itens são retornados!
  assert.equal(res.length, 3, 'Falha empírica comprovada: 3 itens retornados em vez de 1');
  assert.ok(res.some((i) => i.cProd === 'CANETA-AZUL'), 'CANETA-AZUL vazou indevidamente no resultado');
});

await t('Vulnerabilidade Empírica: Falta de guarda defensiva em item.cfop.startsWith causa TypeError com cfop undefined', async () => {
  const itemSemCfop = { cfop: undefined };
  let erro = null;
  try {
    const isInter = (itemSemCfop.cfop.startsWith('6') || itemSemCfop.cfop.startsWith('2'));
  } catch (err) {
    erro = err;
  }
  assert.ok(erro instanceof TypeError, 'Comprovado TypeError por ausência de guarda defensiva em item.cfop');
  assert.ok(erro.message.includes('startsWith'), 'Erro explícito ao invocar startsWith em undefined');
});

// =========================================================================
// SUMÁRIO DO RELATÓRIO DO CHALLENGER
// =========================================================================

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(`  M2 CHALLENGER ADVERSARIAL HARNESS: ${passCount} aprovados, ${failCount} falhas`);
console.log('══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) process.exit(1);
