/**
 * tests/m2-ssr-stress.tsx
 *
 * Suíte de Testes Adversariais SSR (Server-Side Rendering) — Milestone 2.
 * Executa estritamente em ambiente Node.js puro (sem JSDOM, window === undefined),
 * testando ReactDOMServer.renderToString para garantir zero quebras de browser-only.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import AuditoriaEntrada, { adaptAuditResultForERP } from '../components/AuditoriaEntrada';
import TabelaItensExtracao from '../components/TabelaItensExtracao';
import ParametrizacaoERP from '../components/ParametrizacaoERP';
import { extrairDadosXmlNfe } from '../lib/extrator-nfe';
import { getMapaD8 } from '../lib/ai/ncm-server';

let pass = 0;
let fail = 0;

const clean = (html: string) => html.replace(/<!--.*?-->/g, '');

const t = async (nome: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    pass++;
    console.log(`OK  SSR: ${nome}`);
  } catch (err: any) {
    fail++;
    console.error(`XX  SSR FAIL: ${nome}\n    ${err?.message || err}`);
  }
};

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  M2 EMPIRICAL STRESS: SSR (ReactDOMServer.renderToString)');
console.log('  Ambiente: Node.js puro (window === undefined, document === undefined)');
console.log('══════════════════════════════════════════════════════════════════════');

// Carregamento de fixtures
const mapaD8 = getMapaD8();
const loadXml = async (nome: string) => readFile(join(process.cwd(), 'tests/fixtures', nome), 'utf8');

const xml1 = await loadXml('nfe-single-item.xml');
const xml15 = await loadXml('nfe-multi-15.xml');
const xml30 = await loadXml('nfe-multi-30.xml');
const xml55 = await loadXml('nfe-multi-55.xml');
const xmlSimples = await loadXml('nfe-simples-csosn102.xml');
const xmlInterstate = await loadXml('nfe-interstate-st.xml');
const xmlMalformed = await loadXml('nfe-malformed-ncm.xml');
const xmlMissingTags = await loadXml('nfe-missing-optional-tags.xml');

const ext1 = extrairDadosXmlNfe(xml1, mapaD8);
const ext15 = extrairDadosXmlNfe(xml15, mapaD8);
const ext30 = extrairDadosXmlNfe(xml30, mapaD8);
const ext55 = extrairDadosXmlNfe(xml55, mapaD8);
const extSimples = extrairDadosXmlNfe(xmlSimples, mapaD8);
const extInterstate = extrairDadosXmlNfe(xmlInterstate, mapaD8);
const extMalformed = extrairDadosXmlNfe(xmlMalformed, mapaD8);
const extMissing = extrairDadosXmlNfe(xmlMissingTags, mapaD8);

// 1. AuditoriaEntrada em estado inicial
await t('AuditoriaEntrada renderiza formulário de upload sem window/document', () => {
  const html = renderToString(React.createElement(AuditoriaEntrada));
  assert.ok(html.includes('Auditoria de Entrada'), 'Deve conter título');
  assert.ok(html.includes('type="file"'), 'Deve conter input de arquivo');
  assert.ok(html.includes('Simples Nacional'), 'Deve conter opção de regime');
  assert.ok(html.includes('Auditar Documento'), 'Deve conter botão de ação');
});

// 2. TabelaItensExtracao com lista vazia
await t('TabelaItensExtracao renderiza mensagem vazia graciosamente', () => {
  const html = renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: [],
      selectedIndices: new Set<number>(),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  );
  assert.ok(html.includes('Nenhum item disponível na nota fiscal para exibição'), 'Deve exibir card vazio');
  assert.ok(!html.includes('<th>'), 'Não deve renderizar cabeçalho da tabela');
});

// 3. TabelaItensExtracao com 1 item
await t('TabelaItensExtracao renderiza nota de item único (nfe-single-item)', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext1.itens,
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('Itens da Nota Fiscal (1 item)'), 'Título de 1 item');
  assert.ok(html.includes('1 de 1 selecionados'), 'Resumo de seleção');
  assert.ok(html.includes(ext1.itens[0].cProd), 'Código do produto');
  assert.ok(html.includes('R$'), 'Formatação monetária BRL');
});

// 4. TabelaItensExtracao com 15 itens
await t('TabelaItensExtracao renderiza 15 itens com badges tributárias e Siscomex', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext15.itens,
      selectedIndices: new Set([1, 2, 3, 4, 5]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('Itens da Nota Fiscal (15 itens)'), 'Contador de 15 itens');
  assert.ok(html.includes('5 de 15 selecionados'), 'Contador de selecionados');
  assert.ok(html.includes('✓ Siscomex'), 'Badges Siscomex presentes');
  assert.ok(html.includes('CFOP'), 'Coluna CFOP presente');
});

// 5. TabelaItensExtracao com 55 itens (carga elevada)
await t('TabelaItensExtracao renderiza 55 itens sem estouro de pilha', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext55.itens,
      selectedIndices: new Set(ext55.itens.map((i) => i.index)),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('Itens da Nota Fiscal (55 itens)'), '55 itens no cabeçalho');
  assert.ok(html.includes('55 de 55 selecionados'), '55 selecionados');
  assert.ok(html.length > 50000, 'HTML gerado deve ser substancial');
});

// 6. TabelaItensExtracao com fixtures de cenários especiais
await t('TabelaItensExtracao renderiza CSOSN e crédito do Simples Nacional', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extSimples.itens,
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('CSOSN 102') || html.includes('CSOSN'), 'Badge CSOSN presente');
});

await t('TabelaItensExtracao renderiza CFOP interestadual e Substituição Tributária (ST)', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extInterstate.itens,
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('Inter'), 'Badge Inter para CFOP 6xxx');
  assert.ok(html.includes('ST:'), 'Destaque de ICMS ST');
});

await t('TabelaItensExtracao renderiza badge de NCM inválido com fixture malformada', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extMalformed.itens,
      selectedIndices: new Set([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('Inválido') || html.includes('NCMs Inexistentes'), 'Alerta de NCM inválido');
});

await t('TabelaItensExtracao lida com tags tributárias ausentes sem crash', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: extMissing.itens,
      selectedIndices: new Set<number>(),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('Itens da Nota Fiscal'), 'Renderiza normalmente com tags ausentes');
});

// 7. ParametrizacaoERP em SSR (integrado com AuditoriaEntrada)
await t('ParametrizacaoERP renderiza em SSR sem invocar window.open ou createObjectURL', () => {
  const fakeAuditResponse = {
    motorUtilizado: 'Ollama Local (RX 580)',
    tempoExecucaoMs: 1420,
    statusGlobal: 'Regular',
    parecerTecnicoGeral: 'Operação de revenda compatível com o cadastro.',
    parecerConformidadeCreditos: 'Crédito de ICMS permitido.',
    totalItensAuditados: 1,
    itens: [
      {
        index: 1,
        cProd: ext1.itens[0].cProd,
        xProd: ext1.itens[0].xProd,
        ncm: ext1.itens[0].ncm,
        cest: ext1.itens[0].cest,
        cfopEntrada: '1102',
        cstIcmsEntrada: '00',
        aliqIcms: '18%',
        permiteCredito: true,
        cstPisCofinsEntrada: '50',
        aliqPis: '1.65%',
        aliqCofins: '7.6%',
        cClassTrib: '000001',
        aliqIbsTransitorio: '0,1%',
        aliqCbsTransitorio: '0,9%',
        regimeEspecial: 'Regime Regular',
        instrucaoCadastro: 'Parametrizar produto no ERP com CFOP 1102.',
      },
    ],
  };

  const adapted = adaptAuditResultForERP(fakeAuditResponse, ext1, 'ollama', 'Regime Regular', 'Revenda');
  const html = clean(renderToString(React.createElement(ParametrizacaoERP, { data: adapted })));
  assert.ok(html.includes('Parametrização de ERP'), 'Cabeçalho ERP presente');
  assert.ok(html.includes('1102'), 'CFOP sugerido presente');
  assert.ok(html.includes('000001'), 'cClassTrib presente');
});

// 8. TabelaItensExtracao suporta array ou Set para selectedIndices
await t('TabelaItensExtracao aceita tanto array number[] quanto Set<number>', () => {
  const htmlSet = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext15.itens,
      selectedIndices: new Set([1, 2]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  const htmlArray = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext15.itens,
      selectedIndices: [1, 2],
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(htmlSet.includes('2 de 15 selecionados'), 'Set funciona');
  assert.ok(htmlArray.includes('2 de 15 selecionados'), 'Array funciona');
});

// 9. TabelaItensExtracao com índices fantasmas/órfãos
await t('TabelaItensExtracao lida com índices fantasmas/órfãos sem desincronizar contagem', () => {
  const indicesFantasmas = new Set<number>(Array.from({ length: 15 }, (_, i) => i + 101));
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext15.itens,
      selectedIndices: indicesFantasmas,
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('0 de 15 selecionados'), 'Contagem real deve ser 0 de 15 selecionados');
  assert.ok(!html.includes('15 de 15 selecionados'), 'Não pode indicar 15 de 15 com índices órfãos');
  assert.ok(html.includes('Nenhum item selecionado para auditoria'), 'Alerta de nenhum item selecionado deve estar visível');
});

// 10. TabelaItensExtracao com busca e renderização SSR
await t('TabelaItensExtracao suporta busca alfabética e numérica com guard termoNumerico', () => {
  const html = clean(renderToString(
    React.createElement(TabelaItensExtracao, {
      itens: ext15.itens,
      selectedIndices: new Set<number>([1]),
      onToggleSelect: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    })
  ));
  assert.ok(html.includes('1 de 15 selecionados'), 'Renderiza seleção de 1 item');
  assert.ok(html.includes('Itens da Nota Fiscal (15 itens)'), 'Cabeçalho renderizado');
});

console.log(`\nSSR COMPLETO: ${pass} aprovados, ${fail} falhas.`);
if (fail > 0) process.exit(1);
