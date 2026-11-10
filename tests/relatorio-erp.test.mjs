/**
 * Testes Unitários do Gerador de Relatórios ERP
 * Cobre Modo Resumido (campo e código) e Modo Detalhado (com citação legal).
 */
import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';

const {
  mapearCamposLegais,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoTxt,
  gerarRelatorioErpDetalhadoHtml,
} = mods.relatorioErp;

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

const payloadExemplo = {
  contexto: {
    emitente: {
      nome: 'Empresa Teste Ltda',
      cnpj: '11.222.333/0001-81',
      ie: '110042490114',
      municipioIbge: '3550308',
      uf: 'SP',
      regime: 'presumido',
      crt: '3',
    },
    destinatario: {
      nome: 'Comprador PR SA',
      cnpjCpf: '99.888.777/0001-66',
      ie: '1234567850',
      uf: 'PR',
    },
    operacao: {
      tipo: 'interestadual',
      finalidade: 'comercializacao',
      modelo: '55',
      anoReforma: 2026,
    },
  },
  itens: [
    {
      cProd: 'CADEIRA-01',
      xProd: 'Cadeira Giratória Executiva de Escritório <test & safe>',
      ncm: '94013100',
      descricaoNcm: 'Assentos giratórios, de altura ajustável',
      cest: '2806100',
      cfop: '6.102',
      cstIcms: '000',
      aliqIcms: '12%',
      cstIpi: '53',
      aliqIpi: '0',
      cstPis: '01',
      aliqPis: '1,65%',
      cstCofins: '01',
      aliqCofins: '7,60%',
      cstIbsCbs: '000',
      cClassTrib: '000001',
      descricaoClassTrib: 'Tributadas integralmente',
      aliqCbs: '0,90%',
      aliqIbsUf: '0,10%',
      isTributa: false,
      instrucao: 'Parametrizar como revenda de mercadoria de terceiros.',
    },
  ],
};

t('mapearCamposLegais: gera campos essenciais e fundamentação legal completa', () => {
  const campos = mapearCamposLegais(payloadExemplo.itens[0], payloadExemplo.contexto);
  assert(campos.length >= 8, `Deveria ter ao menos 8 campos fiscais, obteve ${campos.length}`);

  const ncm = campos.find((c) => c.campo.includes('NCM'));
  assert(ncm, 'Campo NCM ausente');
  assert.equal(ncm.codigo, '94013100');
  assert(ncm.normaLegal.includes('Decreto Federal nº 97.409/1988'));
  assert(ncm.dispositivo.includes('RGI 1'));

  const cest = campos.find((c) => c.campo.includes('CEST'));
  assert(cest, 'Campo CEST ausente');
  assert.equal(cest.codigo, '2806100');
  assert(cest.normaLegal.includes('Convênio ICMS nº 142/2018'));

  const cfop = campos.find((c) => c.campo.includes('CFOP'));
  assert(cfop, 'Campo CFOP ausente');
  assert.equal(cfop.codigo, '6.102');
  assert(cfop.normaLegal.includes('Convênio S/Nº de 15/12/1970'));

  const cClass = campos.find((c) => c.campo.includes('cClassTrib'));
  assert(cClass, 'Campo cClassTrib ausente');
  assert.equal(cClass.codigo, '000001');
  assert(cClass.normaLegal.includes('Lei Complementar nº 214/2025'));

  const ibsCbs = campos.find((c) => c.campo.includes('CST de IBS e CBS'));
  assert(ibsCbs, 'Campo CST IBS/CBS ausente');
  assert.equal(ibsCbs.codigo, '000');
  assert(ibsCbs.normaLegal.includes('Lei Complementar nº 214'));
});

t('mapearCamposLegais: adapta-se dinamicamente ao Simples Nacional', () => {
  const ctxSimples = {
    ...payloadExemplo.contexto,
    emitente: {
      ...payloadExemplo.contexto.emitente,
      regime: 'simples',
      crt: '1',
      regApIBSCBSSN: '1',
    },
  };
  const campos = mapearCamposLegais(
    { ...payloadExemplo.itens[0], csosn: '102' },
    ctxSimples
  );

  const csosn = campos.find((c) => c.campo.includes('CSOSN'));
  assert(csosn, 'Deveria conter CSOSN para optante do Simples Nacional');
  assert.equal(csosn.codigo, '102');
  assert(csosn.normaLegal.includes('Lei Complementar nº 123/2006'));

  const regAp = campos.find((c) => c.campo.includes('Apuração IBS/CBS no Simples'));
  assert(regAp, 'Deveria conter campo de regime de apuração do IBS/CBS para o Simples');
  assert(regAp.codigo.includes('Simplificada'));
  assert(regAp.normaLegal.includes('Lei Complementar nº 214/2025, arts. 257 a 265'));
});

t('gerarRelatorioErpResumidoTxt: formata apenas campo e código em texto limpo', () => {
  const txt = gerarRelatorioErpResumidoTxt(payloadExemplo);
  assert(txt.includes('PARAMETRIZAÇÃO FISCAL DE ERP — MODO RESUMIDO'));
  assert(txt.includes('CADEIRA-01'));
  assert(txt.includes('94013100'));
  assert(txt.includes('2806100'));
  assert(txt.includes('6.102'));
  assert(txt.includes('000001'));
  // Modo resumido NÃO deve trazer citações longas de decretos
  assert(!txt.includes('Decreto Federal nº 97.409/1988'));
});

t('gerarRelatorioErpResumidoHtml: estrutura tabular com sanitização XSS', () => {
  const html = gerarRelatorioErpResumidoHtml(payloadExemplo);
  assert(html.includes('<!DOCTYPE html>'));
  assert(html.includes('Parametrização de ERP - Modo Resumido'));
  assert(html.includes('CADEIRA-01'));
  assert(html.includes('94013100'));
  // Verifica sanitização de caracteres perigosos
  assert(html.includes('&lt;test &amp; safe&gt;'));
  assert(!html.includes('<test & safe>'));
});

t('gerarRelatorioErpDetalhadoTxt: fundamentação jurídica detalhada com leis e artigos', () => {
  const txt = gerarRelatorioErpDetalhadoTxt(payloadExemplo);
  assert(txt.includes('LAUDO TÉCNICO DE PARAMETRIZAÇÃO FISCAL DE ERP — MODO DETALHADO'));
  assert(txt.includes('Decreto Federal nº 97.409/1988'));
  assert(txt.includes('Convênio ICMS nº 142/2018'));
  assert(txt.includes('Lei Complementar nº 214/2025'));
  assert(txt.includes('RGI 1 (texto da posição 4D) e RGI 6'));
  assert(txt.includes('DECLARAÇÃO DE RESPONSABILIDADE TÉCNICA'));
});

t('gerarRelatorioErpDetalhadoHtml: laudo formal estilizado e seguro contra XSS', () => {
  const html = gerarRelatorioErpDetalhadoHtml(payloadExemplo);
  assert(html.includes('<!DOCTYPE html>'));
  assert(html.includes('Laudo Pericial de Parametrização Fiscal de ERP (Modo Detalhado)'));
  assert(html.includes('Contabilidade Portela (Desde 1970)'));
  assert(html.includes('Lei Complementar nº 214/2025'));
  assert(html.includes('Fundamentação Legal e Citação do Dispositivo'));
  assert(html.includes('&lt;test &amp; safe&gt;'));
  assert(!html.includes('<test & safe>'));
});

t('gerador aceita payloads vazios ou itens parciais sem estourar exceções', () => {
  const payloadVazio = {
    contexto: {},
    itens: [{}],
  };
  const txtR = gerarRelatorioErpResumidoTxt(payloadVazio);
  assert(typeof txtR === 'string' && txtR.length > 50);

  const htmlR = gerarRelatorioErpResumidoHtml(payloadVazio);
  assert(typeof htmlR === 'string' && htmlR.includes('<!DOCTYPE html>'));

  const txtD = gerarRelatorioErpDetalhadoTxt(payloadVazio);
  assert(typeof txtD === 'string' && txtD.length > 50);

  const htmlD = gerarRelatorioErpDetalhadoHtml(payloadVazio);
  assert(typeof htmlD === 'string' && htmlD.includes('<!DOCTYPE html>'));
});
