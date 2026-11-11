/**
 * Auditoria de entrada / classificação por IA / relatório.
 * Estes testes chamam o CÓDIGO REAL (lib/ai/*, lib/relatorio.ts) com o ncm.json real.
 * Nada de "simular a lógica" dentro do teste: se a lógica quebrar, o teste quebra.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getMapaD8 } from '../lib/ai/ncm-server.js';
import { validarNcmIA } from '../lib/ai/validar.js';
import { sanearClassificacao } from '../lib/ai/sanear-classificacao.js';
import { reconciliarItens } from '../lib/ai/reconciliar.js';
import { esc, renderRelatorioHtml, renderRelatorioTxt } from '../lib/relatorio.js';

import { validarNcmIA } from '../lib/ai/validar.ts';
import { sanearClassificacao } from '../lib/ai/sanear-classificacao.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

async function runTests() {
  console.log('──────── tests/auditoria.test.mjs ────────');

test('getMapaD8: 10515 NCMs reais, por d8', () => {
  assert.equal(mapa.size, 10515);
  assert.ok(mapa.has(NCM_OK));
  assert.ok(!mapa.has('99999999'));
});

  // Test validarNcmIA & sanearClassificacao contra a base real de 10.515 NCMs
  const mapaD8 = getMapaD8();

  { // 1. NCM de 8 dígitos válido
    const res = validarNcmIA({ ncm: '84713012', confianca: 'ALTA' }, mapaD8);
    assert.equal(res.valido, true);
    assert.equal(res.ncm, '8471.30.12');
    assert.equal(res.confianca, 'ALTA');
    assert.ok(res.descricaoNcm && res.descricaoNcm.length > 5);
    console.log('OK  validarNcmIA: NCM válido aceito com descrição oficial');
  }

  { // 2. NCM de 7 dígitos com zero à esquerda suprimido (Capítulo 01)
    const res = validarNcmIA({ ncm: '1012100', confianca: 'MEDIA' }, mapaD8);
    assert.equal(res.valido, true, 'Zero à esquerda suprimido deve ser normalizado com padStart');
    assert.equal(res.ncm, '0101.21.00');
    console.log('OK  validarNcmIA: 7 dígitos normalizados com zero à esquerda (1012100 -> 0101.21.00)');
  }

  { // 3. Notação científica do Excel rejeitada
    const resExp = validarNcmIA({ ncm: '8.4713E+07', confianca: 'ALTA' }, mapaD8);
    assert.equal(resExp.valido, false);
    assert.equal(resExp.confianca, 'BAIXA');
    console.log('OK  validarNcmIA: notação científica rejeitada');
  }

  { // 4. NCM inexistente na tabela oficial Siscomex
    const resInexistente = validarNcmIA({ ncm: '99999999', confianca: 'ALTA' }, mapaD8);
    assert.equal(resInexistente.valido, false);
    assert.equal(resInexistente.confianca, 'BAIXA');
    console.log('OK  validarNcmIA: NCM inexistente marcado como inválido com baixa confiança');
  }

  { // 5. sanearClassificacao substitui descrição e zera alucinação
    const saneadoValido = sanearClassificacao({
      ncm: '84713012',
      confianca: 'ALTA',
      descricaoNcm: 'Texto inventado pela IA',
    }, mapaD8);
    assert.equal(saneadoValido.valido, true);
    assert.notEqual(saneadoValido.descricaoNcm, 'Texto inventado pela IA');
    assert.ok(saneadoValido.descricaoNcm && saneadoValido.descricaoNcm.includes('peso'));

    const saneadoInvalido = sanearClassificacao({
      ncm: '99999999',
      confianca: 'ALTA',
      descricaoNcm: 'Produto alucinado',
    }, mapaD8);
    assert.equal(saneadoInvalido.valido, false);
    assert.equal(saneadoInvalido.ncm, '', 'NCM alucinado deve ser zerado');
    assert.equal(saneadoInvalido.confianca, 'BAIXA');
    assert.equal(saneadoInvalido.descricaoNcm, '');
    console.log('OK  sanearClassificacao: zera NCMs inventados e substitui texto por descrição oficial Siscomex');
  }

  console.log('\nAUDITORIA OK ✓\n');
}

// ---------------------------------------------------------------- sanearClassificacao
test('sanearClassificacao: NCM inventado => ncm "" e BAIXA, nunca chega ao front', () => {
  const r = sanearClassificacao({ ncm: '99999999', descricaoNcm: 'Inventado', confianca: 'ALTA' }, mapa);
  assert.equal(r.ncm, '');
  assert.equal(r.confianca, 'BAIXA');
  assert.equal(r.valido, false);
  assert.equal(r.descricaoNcm, '');
  assert.ok(r.aviso && r.aviso.length > 0);
});

test('sanearClassificacao: válido => descrição OFICIAL e confiança do modelo preservada', () => {
  const oficial = mapa.get(NCM_OK);
  const r = sanearClassificacao({ ncm: NCM_OK, descricaoNcm: 'texto inventado pelo modelo', confianca: 'ALTA' }, mapa);
  assert.equal(r.valido, true);
  assert.equal(r.descricaoNcm, oficial.desc);
  assert.notEqual(r.descricaoNcm, 'texto inventado pelo modelo');
  assert.equal(r.confianca, 'ALTA');
  assert.equal(sanearClassificacao({ ncm: NCM_OK, confianca: 'BAIXA' }, mapa).confianca, 'BAIXA');
});

test('sanearClassificacao: entrada nula ou sem ncm não derruba', () => {
  assert.equal(sanearClassificacao(null, mapa).ncm, '');
  assert.equal(sanearClassificacao(undefined, mapa).valido, false);
  assert.equal(sanearClassificacao({}, mapa).confianca, 'BAIXA');
});

// ---------------------------------------------------------------- reconciliarItens
test('reconciliarItens: NCM do XML vence o do modelo (por cProd)', () => {
  const itens = [{ cProd: 'P1', ncm: '11111111', confianca: 'ALTA' }];
  const [r] = reconciliarItens(itens, { P1: { NCM: NCM_OK } }, mapa, true);
  assert.equal(r.ncm, NCM_OK);
  assert.equal(r.ncmValidado, true);
});

test('reconciliarItens: NCM do XML inexistente => mantido, ncmValidado false e BAIXA', () => {
  const itens = [{ cProd: 'P1', ncm: NCM_OK, confianca: 'ALTA' }];
  const [r] = reconciliarItens(itens, { P1: { NCM: '99999999' } }, mapa, true);
  assert.equal(r.ncm, '99999999');
  assert.equal(r.ncmValidado, false);
  assert.equal(r.confianca, 'BAIXA');
});

test('reconciliarItens: repassa a confiança do modelo (ALTA fica ALTA, BAIXA fica BAIXA)', () => {
  const orig = { P1: { NCM: NCM_OK } };
  assert.equal(reconciliarItens([{ cProd: 'P1', confianca: 'ALTA' }], orig, mapa, true)[0].confianca, 'ALTA');
  assert.equal(reconciliarItens([{ cProd: 'P1', confianca: 'BAIXA' }], orig, mapa, true)[0].confianca, 'BAIXA');
  assert.equal(reconciliarItens([{ cProd: 'P1' }], orig, mapa, true)[0].confianca, 'MEDIA');
  assert.equal(reconciliarItens([{ cProd: 'P1', confianca: 'xyz' }], orig, mapa, true)[0].confianca, 'MEDIA');
});

test('reconciliarItens: sem XML não sobrescreve; não muta a entrada; entrada inválida vira []', () => {
  const itens = [{ cProd: 'P1', ncm: NCM_OK, confianca: 'ALTA' }];
  const copia = JSON.parse(JSON.stringify(itens));
  const [r] = reconciliarItens(itens, { P1: { NCM: '99999999' } }, mapa, false);
  assert.equal(r.ncm, NCM_OK);
  assert.deepEqual(itens, copia);
  assert.deepEqual(reconciliarItens(undefined, {}, mapa, true), []);
  assert.deepEqual(reconciliarItens(null, null, mapa, true), []);
});

test('reconciliarItens: cProd ausente do XML ou sem NCM no XML mantém o NCM do item', () => {
  const [a] = reconciliarItens([{ cProd: 'X', ncm: NCM_OK }], { P1: { NCM: '99999999' } }, mapa, true);
  assert.equal(a.ncm, NCM_OK);
  const [b] = reconciliarItens([{ cProd: 'P1', ncm: NCM_OK }], { P1: { NCM: '' } }, mapa, true);
  assert.equal(b.ncm, NCM_OK);
});

// ---------------------------------------------------------------- relatório
const XSS = '<img src=x onerror=alert(1)>';
const AGORA = new Date('2026-11-01T12:00:00Z');

test('esc: escapa & < > \" \'', () => {
  assert.equal(esc(XSS), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('"a" \'b\' & c'), '&quot;a&quot; &#039;b&#039; &amp; c');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('renderRelatorioHtml: nenhum campo de texto externo sai cru (XSS)', () => {
  const campos = ['cProd', 'xProd', 'ncm', 'cest', 'cfopEntrada', 'cstIcmsEntrada', 'aliqIcms',
    'cstPisCofinsEntrada', 'aliqPis', 'aliqCofins', 'cClassTrib', 'aliqIbsTransitorio',
    'aliqCbsTransitorio', 'regimeEspecial', 'instrucaoCadastro'];
  for (const campo of campos) {
    const html = renderRelatorioHtml({ itens: [{ [campo]: XSS + '"\'' }] }, AGORA);
    assert.ok(!html.includes('<img src=x'), `campo ${campo} saiu sem escape`);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#039;'), `campo ${campo} não aparece escapado`);
  }
  const html = renderRelatorioHtml({ parecerTecnicoXml: XSS, parecerConformidade: XSS, itens: [] }, AGORA);
  assert.ok(!html.includes('<img src=x'));
});

test('renderRelatorioHtml: mantém TODAS as seções e campos', () => {
  const html = renderRelatorioHtml({ parecerTecnicoXml: 'T', parecerConformidade: 'C', itens: [{ cProd: '1', permiteCredito: true }] }, AGORA);
  for (const trecho of ['Laudo de Auditoria Fiscal', 'Parecer Técnico do Documento',
    'Parecer Breve de Conformidade e Créditos', 'Parametrização de ERP', 'Bloco ICMS/ST',
    'Bloco PIS/COFINS', 'Bloco Reforma Tributária', 'cClassTrib:', 'Alíquota IBS:', 'Alíquota CBS:',
    'Regime:', 'Instrução:', 'Crédito:</span> <span class="tax-value">Sim']) {
    assert.ok(html.includes(trecho), `faltou: ${trecho}`);
  }
  assert.ok(renderRelatorioHtml({ itens: [] }, AGORA).includes('Nenhum item processado nesta auditoria.'));
});

test('renderRelatorioTxt: mantém seções e valores padrão', () => {
  const txt = renderRelatorioTxt({ itens: [{ cProd: '9', xProd: 'p', permiteCredito: false }] }, AGORA);
  for (const trecho of ['# Portela Contabilidade', '## Parecer Técnico do Documento', '#### [ICMS/ST]',
    '#### [PIS/COFINS]', '#### [REFORMA TRIBUTÁRIA]', '- Crédito: Não', '**Instrução de Cadastro:** N/A']) {
    assert.ok(txt.includes(trecho), `faltou: ${trecho}`);
  }
});