import assert from 'node:assert/strict';
import { extrairDeTabela, consolidarRegistros, padronizarNcm } from '../lib/extrator-multifonte.ts';

const t = (name, fn) => {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`, err);
    throw err;
  }
};

const NCM_TESTE = new Set(['84713012', '94013000', '01012100', '40111000', '22030000']);

t('padronizarNcm: preserva zeros à esquerda e completa 7 dígitos', () => {
  assert.equal(padronizarNcm('01012100'), '01012100');
  assert.equal(padronizarNcm('1012100'), '01012100'); // Excel tirou zero
  assert.equal(padronizarNcm('8471.30.12'), '84713012');
});

t('extrairDeTabela: identifica cabeçalho semântico e valida NCMs', () => {
  const tabela = [
    ['Código NCM', 'Descrição do Produto', 'Alíquota'],
    ['8471.30.12', 'Notebook Dell 14 pol', '12%'],
    ['9401.30.00', 'Cadeira giratória', '18%'],
  ];

  const registros = extrairDeTabela(tabela, NCM_TESTE, { arquivo: 'teste.csv' });
  const { validos, quarentena, stats } = consolidarRegistros(registros);

  assert.equal(validos.length, 2);
  assert.equal(quarentena.length, 0);
  assert.equal(stats.taxaAprovacaoPercentual, 100);
  assert.equal(validos[0].origem.metodo, 'cabecalho');
  assert.equal(validos[0].origem.confianca, 98.0);
  assert.equal(validos[0].campos.ncm, '84713012');
});

t('extrairDeTabela: envia NCM inválido diretamente para quarentena com proveniência', () => {
  const tabela = [
    ['NCM', 'Mercadoria'],
    ['8471.30.12', 'Notebook Dell'],
    ['9999.99.99', 'Produto com NCM Inexistente'], // Inexistente
  ];

  const registros = extrairDeTabela(tabela, NCM_TESTE, { arquivo: 'teste_quarentena.csv' });
  const { validos, quarentena } = consolidarRegistros(registros);

  assert.equal(validos.length, 1);
  assert.equal(quarentena.length, 1);
  assert.equal(quarentena[0].origem.confianca, 0.0);
  assert.match(quarentena[0].erros[0], /não localizado na Tabela Oficial/);
});

t('extrairDeTabela: perfil de conteúdo estatístico sem cabeçalho', () => {
  const tabelaSemCabecalho = [
    ['Ref-A', '84713012', 'Notebook'],
    ['Ref-B', '94013000', 'Cadeira'],
    ['Ref-C', '01012100', 'Cavalo Reprodutor'],
  ];

  const registros = extrairDeTabela(tabelaSemCabecalho, NCM_TESTE, { arquivo: 'sem_cabecalho.csv' });
  const { validos } = consolidarRegistros(registros);

  assert.equal(validos.length, 3);
  assert.equal(validos[0].origem.metodo, 'perfil');
  assert.ok(validos[0].origem.confianca >= 80.0);
});

t('extrairDeTabela: catálogo para classificar (sem NCM)', () => {
  const catalogo = [
    ['cProd', 'descricao', 'unidade'],
    ['101', 'Smartwatch Bluetooth', 'UN'],
    ['102', 'Cabo HDMI 2.0 2m', 'UN'],
  ];

  const registros = extrairDeTabela(catalogo, NCM_TESTE, { arquivo: 'catalogo.csv' });
  const { validos } = consolidarRegistros(registros);

  assert.equal(validos.length, 2);
  assert.equal(validos[0].origem.metodo, 'catalogo_para_classificar');
  assert.equal(validos[0].origem.confianca, 95.0);
});
