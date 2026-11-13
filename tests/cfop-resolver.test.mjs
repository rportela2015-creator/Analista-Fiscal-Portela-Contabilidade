/**
 * Testes Unitários: Resolução Dinâmica de CFOP (lib/cfop-resolver.ts)
 * Etapa 15 (Ciclo 4)
 *
 * Valida a derivação correta de CFOP cruzando a Natureza da Operação,
 * Localização Geográfica (Interna vs Interestadual vs Exterior) e Tratamento Tributário
 * expresso pelo CST do ICMS (ST, Diferimento, Isenção, Uso/Consumo, Ativo).
 */
import assert from 'node:assert/strict';
import { determinarCfop, determinarPrefixoCfop, determinarCfopDaOperacao } from '../lib/cfop-resolver.ts';

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

// -----------------------------------------------------------------------------
// 1. PREFIXOS GEOGRÁFICOS DE OPERAÇÃO
// -----------------------------------------------------------------------------
t('CFOP Resolver: Prefixo 5 para saída interna e 6 para saída interestadual', () => {
  assert.equal(determinarPrefixoCfop('interna', 'saida'), '5');
  assert.equal(determinarPrefixoCfop('interestadual', 'saida'), '6');
  assert.equal(determinarPrefixoCfop('exportacao', 'saida'), '7');

  assert.equal(determinarPrefixoCfop('interna', 'entrada'), '1');
  assert.equal(determinarPrefixoCfop('interestadual', 'entrada'), '2');
  assert.equal(determinarPrefixoCfop('importacao', 'entrada'), '3');
});

// -----------------------------------------------------------------------------
// 2. REGRAS DE SAÍDA: ST (CST 60 vs CST 10) vs NORMAL (CST 00/20/51)
// -----------------------------------------------------------------------------
t('CFOP Resolver Saída: CST 60 (ST Retida Anteriormente) deriva 5405 interna e 6405 interestadual', () => {
  const cfopInterno = determinarCfop('interna', '60');
  assert.equal(cfopInterno, '5405', 'CST 60 interna para revenda deve derivar CFOP 5405');

  const cfopInterestadual = determinarCfop('interestadual', '60');
  assert.equal(cfopInterestadual, '6405', 'CST 60 interestadual deve derivar CFOP 6405');

  const cfopCsosn500 = determinarCfop('interna', '500');
  assert.equal(cfopCsosn500, '5405', 'CSOSN 500 interna deve derivar CFOP 5405');
});

t('CFOP Resolver Saída: CST 10 (Substituto Tributário) deriva 5403 interna e 6403 interestadual', () => {
  const cfopInterno = determinarCfop('interna', '10');
  assert.equal(cfopInterno, '5403', 'CST 10 interna com retenção ST deve derivar CFOP 5403');

  const cfopInterestadual = determinarCfop('interestadual', '10');
  assert.equal(cfopInterestadual, '6403', 'CST 10 interestadual com retenção ST deve derivar CFOP 6403');
});

t('CFOP Resolver Saída: CST 51 (Diferimento) e CST 00/20/40 derivam 5102 interna e 6102 interestadual', () => {
  // Diferimento
  assert.equal(determinarCfop('interna', '51'), '5102', 'CST 51 interna para revenda deve derivar CFOP 5102');
  assert.equal(determinarCfop('interestadual', '51'), '6102', 'CST 51 interestadual deve derivar CFOP 6102');

  // Tributação normal e reduções
  assert.equal(determinarCfop('interna', '00'), '5102');
  assert.equal(determinarCfop('interna', '20'), '5102');
  assert.equal(determinarCfop('interna', '40'), '5102');
});

// -----------------------------------------------------------------------------
// 3. REGRAS DE ENTRADA: USO/CONSUMO, ATIVO IMOBILIZADO E INDUSTRIALIZAÇÃO
// -----------------------------------------------------------------------------
t('CFOP Resolver Entrada: Uso e Consumo deriva 1556 (interna) e 2556 (interestadual)', () => {
  const cfopInterno = determinarCfop({
    natureza: 'entrada',
    operacao: 'interna',
    finalidade: 'consumo',
    cst: '00',
  });
  assert.equal(cfopInterno, '1556');

  const cfopInter = determinarCfop({
    natureza: 'entrada',
    operacao: 'interestadual',
    finalidade: 'consumo',
    cst: '00',
  });
  assert.equal(cfopInter, '2556');

  // Com ST
  const cfopInterSt = determinarCfop({
    natureza: 'entrada',
    operacao: 'interestadual',
    finalidade: 'consumo',
    cst: '60',
  });
  assert.equal(cfopInterSt, '2407', 'Uso e consumo com ST interestadual deriva 2407');
});

t('CFOP Resolver Entrada: Ativo Imobilizado deriva 1551 (interna) e 2551 (interestadual)', () => {
  const cfopInterno = determinarCfop({
    natureza: 'entrada',
    operacao: 'interna',
    finalidade: 'ativo',
    cst: '00',
  });
  assert.equal(cfopInterno, '1551');

  const cfopInterSt = determinarCfop({
    natureza: 'entrada',
    operacao: 'interestadual',
    finalidade: 'ativo',
    cst: '10',
  });
  assert.equal(cfopInterSt, '2406', 'Ativo imobilizado com ST interestadual deriva 2406');
});

t('CFOP Resolver Importação e Exportação (Prefixos 3 e 7)', () => {
  assert.equal(determinarCfop('exportacao', '00'), '7102', 'Exportação de mercadoria deriva 7102');

  const cfopImportacao = determinarCfop({
    natureza: 'entrada',
    operacao: 'importacao',
    finalidade: 'comercializacao',
    cst: '00',
  });
  assert.equal(cfopImportacao, '3102', 'Importação para revenda deriva 3102');
});

t('CFOP Resolver: determinarCfopDaOperacao com objeto de dados e flag temSubstituicao', () => {
  // Operação saída com ST explícita
  const cfopSt = determinarCfopDaOperacao('interna', '60', true);
  assert.equal(cfopSt, '5405');

  const cfopInterSt = determinarCfopDaOperacao('interestadual', '10', true);
  assert.equal(cfopInterSt, '6403');

  // Operação com objeto DadosOperacao
  const cfopConsumo = determinarCfopDaOperacao({
    natureza: 'entrada',
    operacao: 'interestadual',
    finalidade: 'consumo',
  }, '00', false);
  assert.equal(cfopConsumo, '2556');

  const cfopConsumoSt = determinarCfopDaOperacao({
    natureza: 'entrada',
    operacao: 'interestadual',
    finalidade: 'consumo',
  }, '60', true);
  assert.equal(cfopConsumoSt, '2407');
});

console.log('\nSUÍTE CFOP RESOLVER OK ✓');
