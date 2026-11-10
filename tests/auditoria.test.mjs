
import assert from 'node:assert';
import { getFiscalContext } from '../lib/fiscal-context.ts';

import { validarNcmIA } from '../lib/ai/validar.ts';
import { sanearClassificacao } from '../lib/ai/sanear-classificacao.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

async function runTests() {
  console.log('──────── tests/auditoria.test.mjs ────────');

  // Test Fiscal Context
  const context = await getFiscalContext();
  assert.ok(context.includes('Contexto Fiscal e Reforma Tributária'), 'Context should contain the header');
  assert.ok(context.includes('Diretrizes:'), 'Context should contain guidelines');
  assert.ok(context.includes('Retorne um JSON estrito'), 'Context should ask for JSON');
  console.log('OK  getFiscalContext: reads and compiles context successfully');

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

await runTests();
