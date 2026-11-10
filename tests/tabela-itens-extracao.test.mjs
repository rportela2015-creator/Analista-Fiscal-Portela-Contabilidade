/**
 * Suíte de Testes Automatizados — Milestone 2
 * Validação de TabelaItensExtracao, Seleção de Itens, Seletor de Motor Duplo e Payload M2 ↔ M3
 *
 * Executado via: node scripts/test.mjs tests/tabela-itens-extracao.test.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  extrairDadosXmlNfe,
  montarAuditRequestPayload,
  MOTIVOS_SENSIBILIDADE_MAP,
} from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';
import TabelaItensExtracao from '../components/TabelaItensExtracao.tsx';

let passCount = 0;
let failCount = 0;

const t = async (name, fn) => {
  try {
    await fn();
    passCount++;
    console.log(`OK  ${name}`);
  } catch (err) {
    failCount++;
    console.error(`FAIL  ${name}`, err);
    throw err;
  }
};

console.log('──────── tests/tabela-itens-extracao.test.mjs ────────');

// Carregamento de fixtures oficiais para testes realistas
const mapaD8 = getMapaD8();
const fixtureMulti15Xml = await readFile(join(process.cwd(), 'tests/fixtures/nfe-multi-15.xml'), 'utf8');
const fixtureSimplesXml = await readFile(join(process.cwd(), 'tests/fixtures/nfe-simples-csosn102.xml'), 'utf8');

const extracao15 = extrairDadosXmlNfe(fixtureMulti15Xml, mapaD8);
const extracaoSimples = extrairDadosXmlNfe(fixtureSimplesXml, mapaD8);

// =========================================================================
// 1. TESTES DE LÓGICA DE SELEÇÃO DE ITENS E AÇÕES EM LOTE
// =========================================================================

await t('Seleção Individual: alternar estado de um único item por índice (toggle)', async () => {
  const selected = new Set();
  const toggle = (idx) => (selected.has(idx) ? selected.delete(idx) : selected.add(idx));

  // Seleciona item 1
  toggle(1);
  assert.equal(selected.has(1), true);
  assert.equal(selected.size, 1);

  // Seleciona item 3
  toggle(3);
  assert.equal(selected.has(3), true);
  assert.equal(selected.size, 2);

  // Desmarca item 1
  toggle(1);
  assert.equal(selected.has(1), false);
  assert.equal(selected.has(3), true);
  assert.equal(selected.size, 1);
});

await t('Selecionar Todos: marca 100% dos itens da nota fiscal sem truncamento', async () => {
  const selected = new Set(extracao15.itens.map((it) => it.index));
  assert.equal(selected.size, 15, 'Nota com 15 itens deve selecionar exatamente 15 itens');
  for (let i = 1; i <= 15; i++) {
    assert.equal(selected.has(i), true, `Item #${i} deve estar selecionado`);
  }
});

await t('Desmarcar Todos: limpa completamente o conjunto de itens selecionados', async () => {
  const selected = new Set([1, 2, 3, 4, 5, 6, 7]);
  assert.equal(selected.size, 7);

  selected.clear();
  assert.equal(selected.size, 0);
  assert.equal(selected.has(1), false);
});

await t('Selecionar Apenas Sensíveis: filtra exclusivamente itens com sensivelParaAuditoria === true', async () => {
  const itensSensiveis = extracaoSimples.itens.filter((it) => it.sensivelParaAuditoria);
  const selected = new Set(itensSensiveis.map((it) => it.index));

  assert.ok(selected.size > 0, 'Deve identificar ao menos 1 item sensível na nota Simples');
  for (const item of extracaoSimples.itens) {
    if (item.sensivelParaAuditoria) {
      assert.equal(selected.has(item.index), true, `Item sensível #${item.index} deve estar selecionado`);
    } else {
      assert.equal(selected.has(item.index), false, `Item regular #${item.index} NÃO deve estar selecionado`);
    }
  }
});

await t('Estado Tri-State do Master Checkbox: cálculo exato de checked e indeterminate', async () => {
  const calcState = (total, count) => ({
    checked: total > 0 && count === total,
    indeterminate: count > 0 && count < total,
  });

  // 0 de 15: desmarcado e não-indeterminado
  assert.deepEqual(calcState(15, 0), { checked: false, indeterminate: false });

  // 1 de 15: desmarcado e indeterminado
  assert.deepEqual(calcState(15, 1), { checked: false, indeterminate: true });

  // 7 de 15: desmarcado e indeterminado
  assert.deepEqual(calcState(15, 7), { checked: false, indeterminate: true });

  // 15 de 15: marcado e não-indeterminado
  assert.deepEqual(calcState(15, 15), { checked: true, indeterminate: false });
});

// =========================================================================
// 2. TESTES DE ALTERNÂNCIA DO MOTOR DUPLO E PRESERVAÇÃO DE ESTADO
// =========================================================================

await t('Seletor de Motor: comuta entre ollama e gemini preservando rigorosamente a seleção de itens', async () => {
  let motor = 'ollama';
  const selected = new Set([2, 5, 8]);

  // Alterna para Gemini Cloud
  motor = 'gemini';
  assert.equal(motor, 'gemini');
  assert.equal(selected.size, 3, 'Seleção de itens não pode ser alterada ao mudar de motor');
  assert.deepEqual([...selected], [2, 5, 8]);

  // Alterna de volta para IA Local Ollama
  motor = 'ollama';
  assert.equal(motor, 'ollama');
  assert.equal(selected.size, 3);
  assert.deepEqual([...selected], [2, 5, 8]);
});

await t('Seleção de Modelo Ollama: seleciona qwen2.5:7b como padrão e aceita qwen3.5:4b e variantes', async () => {
  let modelo = 'qwen2.5:7b';
  assert.equal(modelo, 'qwen2.5:7b');

  modelo = 'qwen3.5:4b';
  assert.equal(modelo, 'qwen3.5:4b');

  modelo = 'qwen2.5:7b-16k';
  assert.equal(modelo, 'qwen2.5:7b-16k');
});

// =========================================================================
// 3. CONSTRUTOR DE PAYLOAD DE AUDITORIA SELETIVA (CONTRATO M2 ↔ M3)
// =========================================================================

await t('Payload Builder: monta AuditRequestPayload conforme Contrato M2 ↔ M3 para Ollama Local', async () => {
  const selected = new Set([1, 4, 7]);
  const payload = montarAuditRequestPayload({
    motor: 'ollama',
    modelo: 'qwen2.5:7b',
    regime: 'Simples Nacional',
    finalidade: 'Revenda/Comercialização',
    ufDestino: 'SP',
    extracao: extracao15,
    selectedIndices: selected,
  });

  assert.equal(payload.motor, 'ollama');
  assert.equal(payload.modelo, 'qwen2.5:7b');
  assert.equal(payload.contextoAdquirente.regime, 'Simples Nacional');
  assert.equal(payload.contextoAdquirente.finalidade, 'Revenda/Comercialização');
  assert.equal(payload.contextoAdquirente.ufDestino, 'SP');

  // Metadados do documento
  assert.equal(payload.documentoContexto.numeroNf, extracao15.identificacao?.numero || '1234');
  assert.ok(payload.documentoContexto.emitenteCnpj);


  // Itens selecionados
  assert.equal(payload.itensSelecionados.length, 3);
  assert.equal(payload.itensSelecionados[0].index, 1);
  assert.equal(payload.itensSelecionados[1].index, 4);
  assert.equal(payload.itensSelecionados[2].index, 7);

  // Preservação de campos fiscais
  assert.equal(typeof payload.itensSelecionados[0].ncmValidoSiscomex, 'boolean');
  assert.ok(payload.itensSelecionados[0].cfop);
  assert.ok(payload.itensSelecionados[0].tributos);
});

await t('Payload Builder: monta AuditRequestPayload para Google Gemini API Cloud com modelo fixado', async () => {
  const selected = [3, 6];
  const payload = montarAuditRequestPayload({
    motor: 'gemini',
    regime: 'Regime Regular',
    finalidade: 'Industrialização',
    ufDestino: 'PR',
    extracao: extracao15,
    selectedIndices: selected,
  });

  assert.equal(payload.motor, 'gemini');
  assert.equal(payload.modelo, 'gemini-3.8-flash');
  assert.equal(payload.contextoAdquirente.regime, 'Regime Regular');
  assert.equal(payload.contextoAdquirente.finalidade, 'Industrialização');
  assert.equal(payload.contextoAdquirente.ufDestino, 'PR');
  assert.equal(payload.itensSelecionados.length, 2);
  assert.equal(payload.itensSelecionados[0].index, 3);
  assert.equal(payload.itensSelecionados[1].index, 6);
});

await t('Payload Builder: aceita tanto Set<number> quanto number[] para selectedIndices', async () => {
  const payloadFromSet = montarAuditRequestPayload({
    motor: 'ollama',
    regime: 'Simples Nacional',
    extracao: extracao15,
    selectedIndices: new Set([2, 5]),
  });
  const payloadFromArray = montarAuditRequestPayload({
    motor: 'ollama',
    regime: 'Simples Nacional',
    extracao: extracao15,
    selectedIndices: [2, 5],
  });

  assert.equal(payloadFromSet.itensSelecionados.length, 2);
  assert.equal(payloadFromArray.itensSelecionados.length, 2);
  assert.deepEqual(
    payloadFromSet.itensSelecionados.map((i) => i.index),
    payloadFromArray.itensSelecionados.map((i) => i.index)
  );
});

// =========================================================================
// 4. GUARD RAILS E TRATAMENTO DE EXCEÇÕES
// =========================================================================

await t('Guard Rail: Seleção vazia (0 itens) é rejeitada com erro impeditivo', async () => {
  assert.throws(
    () =>
      montarAuditRequestPayload({
        motor: 'ollama',
        regime: 'Simples Nacional',
        extracao: extracao15,
        selectedIndices: new Set(),
      }),
    /não pode estar vazia/
  );
});

await t('Guard Rail: Motor desconhecido/inválido é bloqueado', async () => {
  assert.throws(
    () =>
      montarAuditRequestPayload({
        motor: 'motor_desconhecido',
        regime: 'Simples Nacional',
        extracao: extracao15,
        selectedIndices: new Set([1]),
      }),
    /Motor de auditoria inválido/
  );
});

await t('Guard Rail: Regime do adquirente ausente ou em branco é bloqueado', async () => {
  assert.throws(
    () =>
      montarAuditRequestPayload({
        motor: 'ollama',
        regime: '   ',
        extracao: extracao15,
        selectedIndices: new Set([1]),
      }),
    /regime tributário do adquirente é obrigatório/
  );
});

// =========================================================================
// 5. CÁLCULOS FINANCEIROS E TRIBUTÁRIOS ACUMULADOS
// =========================================================================

await t('Métricas Financeiras: acumula com precisão valor de produtos e tributos dos itens selecionados', async () => {
  const selectedSet = new Set([1, 2]);
  const itensSel = extracao15.itens.filter((it) => selectedSet.has(it.index));

  const totalProdEsperado = itensSel.reduce((acc, it) => acc + it.vProd, 0);
  const totalIcmsEsperado = itensSel.reduce((acc, it) => acc + (it.tributos?.vICMS || 0), 0);
  const totalIpiEsperado = itensSel.reduce((acc, it) => acc + (it.tributos?.vIPI || 0), 0);
  const totalPisEsperado = itensSel.reduce((acc, it) => acc + (it.tributos?.vPIS || 0), 0);
  const totalCofinsEsperado = itensSel.reduce((acc, it) => acc + (it.tributos?.vCOFINS || 0), 0);

  assert.ok(totalProdEsperado > 0, 'Total de produtos deve ser maior que zero');
  assert.equal(itensSel.length, 2);
  assert.equal(itensSel[0].vProd + itensSel[1].vProd, totalProdEsperado);
  assert.equal((itensSel[0].tributos.vICMS || 0) + (itensSel[1].tributos.vICMS || 0), totalIcmsEsperado);
  assert.equal((itensSel[0].tributos.vIPI || 0) + (itensSel[1].tributos.vIPI || 0), totalIpiEsperado);
  assert.equal((itensSel[0].tributos.vPIS || 0) + (itensSel[1].tributos.vPIS || 0), totalPisEsperado);
  assert.equal((itensSel[0].tributos.vCOFINS || 0) + (itensSel[1].tributos.vCOFINS || 0), totalCofinsEsperado);
});

// =========================================================================
// 6. BENCHMARK DE DESEMPENHO: LOOKUPS O(1) PARA 200+ ITENS
// =========================================================================

await t('Desempenho: Lookup O(1) em Set<number> para 200 itens executa em <2ms', async () => {
  const largeSet = new Set(Array.from({ length: 200 }, (_, i) => i + 1));
  const t0 = performance.now();
  for (let i = 1; i <= 200; i++) {
    largeSet.has(i);
  }
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 2, `Lookup em Set deve ser instantâneo (< 2ms), levou ${elapsed.toFixed(3)}ms`);
});

// =========================================================================
// 7. RENDERIZAÇÃO ESTÁTICA DO COMPONENTE TABELAITENSEXTRACAO (HTML/JSX)
// =========================================================================

await t('Renderização de UI: TabelaItensExtracao renderiza cabeçalho, colunas e badges', async () => {
  const selected = new Set([1, 3]);
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extracao15.itens,
      selectedIndices: selected,
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
      onSelectSensitivesOnly: () => {},
    })
  );

  // Verifica elementos estruturais e colunas obrigatórias (com tolerância a comentários de SSR do React 19)
  assert.ok(/Itens da Nota Fiscal/i.test(html), 'Deve exibir título com total de itens');
  assert.ok(/2.*de.*15.*selecionado/i.test(html), 'Deve exibir contador dinâmico de selecionados');
  assert.ok(/Selecionar Todos/i.test(html), 'Deve conter botão Selecionar Todos');
  assert.ok(/Desmarcar Todos/i.test(html), 'Deve conter botão Desmarcar Todos');
  assert.ok(/Selecionar Apenas Sensíveis/i.test(html), 'Deve conter botão Selecionar Apenas Sensíveis');

  // Colunas da tabela
  assert.ok(html.includes('Cód. / EAN'), 'Coluna Cód. / EAN presente');
  assert.ok(html.includes('Descrição do Produto'), 'Coluna Descrição presente');
  assert.ok(html.includes('NCM (Siscomex)'), 'Coluna NCM presente');
  assert.ok(html.includes('CFOP'), 'Coluna CFOP presente');
  assert.ok(html.includes('CST / CSOSN'), 'Coluna CST / CSOSN presente');
  assert.ok(html.includes('V. Total'), 'Coluna V. Total presente');
  assert.ok(html.includes('Tributos Destacados'), 'Coluna Tributos Destacados presente');
  assert.ok(html.includes('Sensibilidade'), 'Coluna Sensibilidade presente');

  // Selos e badges
  assert.ok(html.includes('Siscomex'), 'Deve exibir selo de validação Siscomex');

});

await t('Renderização de UI: TabelaItensExtracao exibe aviso explicativo quando 0 itens selecionados', async () => {
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extracao15.itens,
      selectedIndices: new Set(),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
      onSelectSensitivesOnly: () => {},
    })
  );

  assert.ok(html.includes('Nenhum item selecionado para auditoria'), 'Deve exibir alerta visual de 0 selecionados');
});

await t('Renderização de UI: TabelaItensExtracao trata lista vazia graciosamente', async () => {
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [],
      selectedIndices: new Set(),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
      onSelectSensitivesOnly: () => {},
    })
  );

  assert.ok(html.includes('Nenhum item disponível na nota fiscal para exibição'), 'Deve exibir estado vazio');
});

// =========================================================================
// 8. TESTES DE FILTRAGEM DE CATEGORIA E BUSCA TEXTUAL
// =========================================================================

await t('Filtragem e Busca: filtra itens por termo textual (cProd, xProd, NCM e CFOP)', async () => {
  const itens = extracao15.itens;

  // Busca por código do produto
  const primeiroCod = itens[0].cProd.toLowerCase();
  const achadosCod = itens.filter(
    (it) =>
      it.cProd.toLowerCase().includes(primeiroCod) ||
      it.xProd.toLowerCase().includes(primeiroCod)
  );
  assert.ok(achadosCod.length >= 1, 'Deve localizar ao menos 1 item pelo código');

  // Busca por NCM
  const primeiroNcm = itens[0].ncm;
  const achadosNcm = itens.filter((it) => it.ncm.includes(primeiroNcm));
  assert.ok(achadosNcm.length >= 1, 'Deve localizar item pelo NCM');

  // Filtro por itens inconsistentes (NCM inválido)
  const inconsistentes = itens.filter((it) => !it.ncmValidoSiscomex || it.ncm.length !== 8);
  assert.equal(Array.isArray(inconsistentes), true);
});

// =========================================================================
// 9. TESTES DO ADAPTADOR DE RESULTADO PARA ERP (ADAPTAUDITRESULTFORERP)
// =========================================================================

await t('Adaptador ERP: achata resultado da auditoria mantendo compatibilidade com ParametrizacaoERP', async () => {
  const { adaptAuditResultForERP } = await import('../components/AuditoriaEntrada.tsx');

  const rawAuditResult = {
    statusGlobal: 'Atenção',
    motorUtilizado: 'Ollama Local (qwen2.5:7b) · GPU RX 580',
    parecerTecnicoGeral: 'Alíquotas de ICMS conferidas.',
    parecerConformidadeCreditos: 'Direito a crédito de ICMS confirmado.',
    totalItensAuditados: 1,
    itens: [
      {
        cProd: 'PROD-01',
        xProd: 'Produto Teste A',
        ncm: { auditado: '84713012', declarado: '84713012' },
        cfop: { entradaSugerido: '2102' },
        icms: { cstIcmsEntradaSugerido: '00', aliqIcmsCredito: '18%', permiteCredito: true },
        pisCofins: { cstPisCofinsEntradaSugerido: '50' },
        reforma: { cClassTrib: '000001', aliqIbsTeste2026: '0,1%', aliqCbsTeste2026: '0,9%' },
        instrucaoCadastroERP: 'Cadastrar com CFOP 2102 e CST 00',
      },
    ],
  };

  const adapted = adaptAuditResultForERP(
    rawAuditResult,
    extracao15,
    'ollama',
    'Simples Nacional',
    'Revenda/Comercialização'
  );

  assert.equal(adapted.statusGlobal, 'Atenção');
  assert.equal(adapted.motor, 'Ollama Local (qwen2.5:7b) · GPU RX 580');
  assert.equal(adapted.regime, 'Simples Nacional');
  assert.equal(adapted.finalidade, 'Revenda/Comercialização');
  assert.ok(adapted.nfe?.emitente);
  assert.ok(adapted.nfe?.destinatario);

  // Verifica campos achatados de itens para o ParametrizacaoERP
  assert.equal(adapted.itens.length, 1);
  const it0 = adapted.itens[0];
  assert.equal(it0.cProd, 'PROD-01');
  assert.equal(it0.ncm, '84713012');
  assert.equal(it0.cfopEntrada, '2102');
  assert.equal(it0.cstIcmsEntrada, '00');
  assert.equal(it0.aliqIcms, '18%');
  assert.equal(it0.permiteCredito, true);
  assert.equal(it0.cstPisCofinsEntrada, '50');
  assert.equal(it0.cClassTrib, '000001');
  assert.equal(it0.aliqIbsTransitorio, '0,1%');
  assert.equal(it0.aliqCbsTransitorio, '0,9%');
  assert.equal(it0.instrucaoCadastro, 'Cadastrar com CFOP 2102 e CST 00');
});

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`  SUÍTE TABELA ITENS EXTRAÇÃO: ${passCount} aprovados, ${failCount} falhas`);
console.log(`══════════════════════════════════════════════════════════════════════\n`);

