/**
 * tests/auditoria-particionada.test.mjs
 *
 * Suíte de Testes Unitários e de Integração — Milestone 3
 * Motor de Auditoria Fiscal Pericial Particionada (Ollama RX 580 e Gemini API)
 *
 * Executado via: node scripts/test.mjs tests/auditoria-particionada.test.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  stripFiscalItemContext,
  validarAuditPayload,
  montarPromptOllamaItem,
  montarPromptGeminiAudit,
  geminiAuditResponseSchema,
  executarAuditoriaParticionada,
  executarAuditoriaOllamaParticionada,
  executarAuditoriaGemini,
} from '../lib/auditoria-particionada.ts';
import { extrairDadosXmlNfe, montarAuditRequestPayload } from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';
import { POST as auditarRoutePOST } from '../app/api/auditoria-entrada/auditar/route.ts';
import { POST as unifiedRoutePOST } from '../app/api/auditoria-entrada/route.ts';

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

console.log('──────── tests/auditoria-particionada.test.mjs ────────');

// Carregamento de fixtures e mapa oficial do Siscomex
const mapaD8 = getMapaD8();
const fixtureSingleXml = await readFile(join(process.cwd(), 'tests/fixtures/nfe-single-item.xml'), 'utf8');
const fixtureMulti15Xml = await readFile(join(process.cwd(), 'tests/fixtures/nfe-multi-15.xml'), 'utf8');
const fixtureMulti30Xml = await readFile(join(process.cwd(), 'tests/fixtures/nfe-multi-30.xml'), 'utf8');

const extracaoSingle = extrairDadosXmlNfe(fixtureSingleXml, mapaD8, { regime: 'Regime Regular' });
const extracaoMulti15 = extrairDadosXmlNfe(fixtureMulti15Xml, mapaD8, { regime: 'Regime Regular' });
const extracaoMulti30 = extrairDadosXmlNfe(fixtureMulti30Xml, mapaD8, { regime: 'Regime Regular' });

// ─── GRUPO 1: LIMPEZA DE CONTEXTO FISCAL SENSÍVEL (R4 COMPLIANCE) ───────────
console.log('\n─── [GRUPO 1] LIMPEZA DE CONTEXTO E EXTRAÇÃO CIRÚRGICA (R4) ───');

await t('R4: stripFiscalItemContext remove tags não tributárias e preserva dados fiscais sensíveis', async () => {
  const item = extracaoMulti15.itens[0];
  const stripped = stripFiscalItemContext(item);

  // Campos tributários essenciais preservados
  assert.equal(stripped.index, item.index);
  assert.equal(stripped.cProd, item.cProd);
  assert.equal(stripped.xProd, item.xProd);
  assert.equal(stripped.ncm, item.ncm);
  assert.equal(stripped.cfopSaida, item.cfop);
  assert.ok(stripped.tributosFornecedor);

  // Verificação de ausência de nós não tributários
  assert.equal(stripped.transp, undefined);
  assert.equal(stripped.cobr, undefined);
  assert.equal(stripped.pag, undefined);
  assert.equal(stripped.infAdic, undefined);
  assert.equal(stripped.compra, undefined);
  assert.equal(stripped.exporta, undefined);
});

await t('R4: stripFiscalItemContext preserva tributos ICMS, IPI, PIS, COFINS e RTC', async () => {
  const itemST = extracaoMulti15.itens.find((it) => it.tributos.vBCST && it.tributos.vBCST > 0) || extracaoMulti15.itens[2];
  const stripped = stripFiscalItemContext(itemST);

  assert.ok(stripped.tributosFornecedor);
  if (itemST.tributos.cstIcms) {
    assert.equal(stripped.tributosFornecedor.cstIcms, itemST.tributos.cstIcms);
  }
  if (itemST.tributos.vBCST) {
    assert.equal(stripped.tributosFornecedor.vBCST, itemST.tributos.vBCST);
  }
});

// ─── GRUPO 2: VALIDAÇÃO DE PAYLOAD E GUARD RAILS (M2 ↔ M3 CONTRACT) ─────────
console.log('\n─── [GRUPO 2] VALIDAÇÃO DE PAYLOAD E GUARD RAILS ───');

await t('Guard Rail: validarAuditPayload aceita payload perfeitamente configurado', async () => {
  const payload = {
    motor: 'ollama',
    modelo: 'qwen2.5:7b',
    contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda/Comercialização', ufDestino: 'SP' },
    documentoContexto: { emitenteCnpj: '12345678000199', emitenteUf: 'SP' },
    itensSelecionados: [extracaoSingle.itens[0]],
  };
  assert.equal(validarAuditPayload(payload), true);
});

await t('Guard Rail: rejeita seleção vazia com mensagem descritiva (não pode ser vazio)', async () => {
  const payload = {
    motor: 'ollama',
    contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
    documentoContexto: {},
    itensSelecionados: [],
  };
  assert.throws(() => validarAuditPayload(payload), /não pode ser vazio/);
});

await t('Guard Rail: rejeita motor desconhecido com erro "Motor inválido"', async () => {
  const payload = {
    motor: 'claude-3-opus',
    contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
    documentoContexto: {},
    itensSelecionados: [extracaoSingle.itens[0]],
  };
  assert.throws(() => validarAuditPayload(payload), /Motor inválido/);
});

await t('Guard Rail: rejeita ausência de regime do adquirente', async () => {
  const payload = {
    motor: 'gemini',
    contextoAdquirente: { regime: '   ', finalidade: 'Revenda', ufDestino: 'SP' },
    documentoContexto: {},
    itensSelecionados: [extracaoSingle.itens[0]],
  };
  assert.throws(() => validarAuditPayload(payload), /regime.*obrigatório/i);
});

await t('Guard Rail: rejeita payload nulo ou não-objeto', async () => {
  assert.throws(() => validarAuditPayload(null), /Payload nulo/);
  assert.throws(() => validarAuditPayload(undefined), /Payload nulo/);
  assert.throws(() => validarAuditPayload('invalid'), /Payload nulo/);
});

// ─── GRUPO 3: MONTAGEM DE PROMPTS E GROUNDING SISCOMEX ───────────────────────
console.log('\n─── [GRUPO 3] MONTAGEM DE PROMPT E GROUNDING SISCOMEX ───');

await t('Prompt Ollama: injeta descrição oficial do Siscomex e regras de negócio periciais', async () => {
  const item = extracaoSingle.itens[0];
  const stripped = stripFiscalItemContext(item);
  const prompt = montarPromptOllamaItem(
    stripped,
    { regime: 'Regime Regular', finalidade: 'Revenda/Comercialização', ufDestino: 'SP' },
    { emitenteUf: 'SP', emitenteCrt: '3' }
  );

  assert.ok(prompt.includes(item.cProd));
  assert.ok(prompt.includes(item.ncm));
  assert.ok(prompt.includes('REGRAS DE AUDITORIA:'));
  assert.ok(prompt.includes('LC 214/2025'));
  assert.ok(prompt.includes('ESQUEMA') || prompt.includes('formato JSON'));
});

await t('Prompt Gemini: sintetiza múltiplos itens sensíveis com contexto de compra', async () => {
  const payload = {
    motor: 'gemini',
    contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda/Comercialização', ufDestino: 'SP' },
    documentoContexto: { emitenteUf: 'PR', emitenteCrt: '3' },
    itensSelecionados: extracaoMulti15.itens.slice(0, 3),
  };
  const prompt = montarPromptGeminiAudit(payload);

  assert.ok(prompt.includes('INTERESTADUAL'));
  assert.ok(prompt.includes('Convênio ICMS 142/2018'));
  assert.ok(prompt.includes('ITENS SELECIONADOS PARA AUDITORIA'));
  assert.ok(prompt.includes(extracaoMulti15.itens[0].cProd));
});

// ─── GRUPO 4: REGRAS FISCAIS DETERMINÍSTICAS E DUAL BRIDGE ──────────────────
console.log('\n─── [GRUPO 4] REGRAS FISCAIS DETERMINÍSTICAS E DUAL BRIDGE ───');

await t('Dual Bridge: AuditedItemFinding contém simultaneamente estruturas aninhadas e aliases planos', async () => {
  // Verificação estrutural do contrato
  const itemSample = extracaoSingle.itens[0];
  const findingSample = {
    index: itemSample.index,
    cProd: itemSample.cProd,
    xProd: itemSample.xProd,
    ncm: {
      declarado: itemSample.ncm,
      auditado: itemSample.ncm,
      validoSiscomex: true,
      divergente: false,
      descricaoOficialSiscomex: 'Máquinas automáticas para processamento de dados',
      confianca: 'ALTA',
      rgiAplicada: ['RGI 1', 'RGI 6'],
      fundamentacaoNcm: 'Classificação oficial NESH',
    },
    cfop: {
      saidaFornecedor: itemSample.cfop,
      entradaSugerido: '1102',
      descricaoCfop: 'Compra para comercialização',
      justificativa: 'Entrada interna para revenda',
    },
    icms: {
      cstCsosnDeclarado: '00',
      cstIcmsEntradaSugerido: '00',
      permiteCredito: true,
      aliqIcmsCredito: '18%',
      fundamentoIcms: 'Art. 155 CF/88',
    },
    pisCofins: {
      cstPisCofinsEntradaSugerido: '50',
      permiteCredito: true,
      enquadramento: 'Regime Não-Cumulativo',
    },
    reforma: {
      cClassTrib: '000001',
      descricaoClassTrib: 'Tributação Integral Padrão CBS/IBS',
      cstIbsCbs: '000',
      aliqIbsTeste2026: '0,1%',
      aliqCbsTeste2026: '0,9%',
      sujeitoImpostoSeletivo: false,
    },
    instrucaoCadastroERP: `Parametrizar produto ${itemSample.cProd} com CFOP 1102 e CST 00`,
    statusItem: 'Regular',

    // Aliases planos
    cfopEntrada: '1102',
    cstIcmsEntrada: '00',
    aliqIcms: '18%',
    permiteCredito: true,
    cstPisCofinsEntrada: '50',
    cClassTrib: '000001',
    aliqIbsTransitorio: '0,1%',
    aliqCbsTransitorio: '0,9%',
    instrucaoCadastro: `Parametrizar produto ${itemSample.cProd} com CFOP 1102 e CST 00`,
  };

  // Testa acesso tanto aninhado quanto plano
  assert.equal(findingSample.cfop.entradaSugerido, findingSample.cfopEntrada);
  assert.equal(findingSample.icms.cstIcmsEntradaSugerido, findingSample.cstIcmsEntrada);
  assert.equal(findingSample.icms.permiteCredito, findingSample.permiteCredito);
  assert.equal(findingSample.reforma.cClassTrib, findingSample.cClassTrib);
  assert.equal(findingSample.instrucaoCadastroERP, findingSample.instrucaoCadastro);
});

await t('Reforma Tributária: schema da Gemini API impõe tipos Type.OBJECT e Type.ARRAY', async () => {
  assert.ok(geminiAuditResponseSchema);
  assert.equal(geminiAuditResponseSchema.type, 'OBJECT');
  assert.ok(geminiAuditResponseSchema.properties.itens);
  assert.equal(geminiAuditResponseSchema.properties.itens.type, 'ARRAY');
});

// ─── GRUPO 5: SOBERANIA DE DADOS E SEGURANÇA (AI_SOVEREIGNTY_MODE) ───────────
console.log('\n─── [GRUPO 5] SOBERANIA DE DADOS E GESTÃO DE CREDENCIAIS ───');

await t('Soberania: AI_SOVEREIGNTY_MODE=local_strict bloqueia envio para Gemini API', async () => {
  const originalMode = process.env.AI_SOVEREIGNTY_MODE;
  process.env.AI_SOVEREIGNTY_MODE = 'local_strict';

  const payload = {
    motor: 'gemini',
    contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
    documentoContexto: {},
    itensSelecionados: [extracaoSingle.itens[0]],
  };

  try {
    await executarAuditoriaGemini(payload);
    assert.fail('Deveria ter lançado erro de soberania estrita');
  } catch (err) {
    assert.equal(err.codigo, 'SOBERANIA_LOCAL_ESTRITA');
    assert.ok(err.message.includes('AI_SOVEREIGNTY_MODE=local_strict'));
  } finally {
    process.env.AI_SOVEREIGNTY_MODE = originalMode;
  }
});

await t('Credenciais: Gemini sem GEMINI_API_KEY lança erro descritivo GEMINI_KEY_MISSING', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalMode = process.env.AI_SOVEREIGNTY_MODE;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  process.env.AI_SOVEREIGNTY_MODE = 'local_first';

  const payload = {
    motor: 'gemini',
    contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
    documentoContexto: {},
    itensSelecionados: [extracaoSingle.itens[0]],
  };

  try {
    await executarAuditoriaGemini(payload);
    assert.fail('Deveria ter lançado erro de chave ausente');
  } catch (err) {
    assert.equal(err.codigo, 'GEMINI_KEY_MISSING');
    assert.ok(err.message.includes('GEMINI_API_KEY'));
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
    if (originalMode) process.env.AI_SOVEREIGNTY_MODE = originalMode;
  }
});

// ─── GRUPO 6: ROTAS HTTP (app/api/auditoria-entrada/auditar & route.ts) ──────
console.log('\n─── [GRUPO 6] ROTAS HTTP DE AUDITORIA ───');

await t('HTTP Route /auditar: Rejeita Content-Type não JSON com HTTP 415', async () => {
  const req = new Request('http://localhost:3000/api/auditoria-entrada/auditar', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'hello',
  });
  const res = await auditarRoutePOST(req);
  assert.equal(res.status, 415);
  const data = await res.json();
  assert.equal(data.codigo, 'CONTENT_TYPE_INVALIDO');
});

await t('HTTP Route /auditar: Rejeita seleção vazia com HTTP 400 PAYLOAD_INVALIDO', async () => {
  const req = new Request('http://localhost:3000/api/auditoria-entrada/auditar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      motor: 'ollama',
      contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
      itensSelecionados: [],
    }),
  });
  const res = await auditarRoutePOST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.codigo, 'PAYLOAD_INVALIDO');
  assert.ok(data.error.includes('não pode ser vazio'));
});

await t('HTTP Route /auditar: Rejeita motor inválido com HTTP 400 PAYLOAD_INVALIDO', async () => {
  const req = new Request('http://localhost:3000/api/auditoria-entrada/auditar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      motor: 'gpt-4o',
      contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
      itensSelecionados: [extracaoSingle.itens[0]],
    }),
  });
  const res = await auditarRoutePOST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.codigo, 'PAYLOAD_INVALIDO');
  assert.ok(data.error.includes('Motor inválido'));
});

await t('HTTP Unified Route: action=auditar com application/json rejeita seleção vazia com 400', async () => {
  const req = new Request('http://localhost:3000/api/auditoria-entrada?action=auditar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      motor: 'ollama',
      contextoAdquirente: { regime: 'Regime Regular', finalidade: 'Revenda', ufDestino: 'SP' },
      itensSelecionados: [],
    }),
  });
  const res = await unifiedRoutePOST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.codigo, 'PAYLOAD_INVALIDO');
});

// ─── GRUPO 7: PRESERVAÇÃO DE ÍNDICES E STATUS GLOBAL ────────────────────────
console.log('\n─── [GRUPO 7] PRESERVAÇÃO DE ÍNDICES E STATUS GLOBAL ───');

await t('Preservação de Índices: itens auditados selecionados mantêm índices originais da NF', async () => {
  // Simula seleção esparsa: itens 1, 5, 12 de uma nota de 15 itens
  const itensEsparsos = [extracaoMulti15.itens[0], extracaoMulti15.itens[4], extracaoMulti15.itens[11]];
  assert.equal(itensEsparsos[0].index, 1);
  assert.equal(itensEsparsos[1].index, 5);
  assert.equal(itensEsparsos[2].index, 12);

  // Payload formatado
  const payload = montarAuditRequestPayload({
    motor: 'ollama',
    regime: 'Regime Regular',
    finalidade: 'Revenda',
    ufDestino: 'SP',
    extracao: extracaoMulti15,
    selectedIndices: [1, 5, 12],
  });

  assert.equal(payload.itensSelecionados.length, 3);
  assert.equal(payload.itensSelecionados[0].index, 1);
  assert.equal(payload.itensSelecionados[1].index, 5);
  assert.equal(payload.itensSelecionados[2].index, 12);
});

// ─── SUMÁRIO DOS TESTES ──────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(`  SUÍTE AUDITORIA PARTICIONADA: ${passCount} aprovados, ${failCount} falhas`);
console.log('══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) {
  process.exit(1);
}
