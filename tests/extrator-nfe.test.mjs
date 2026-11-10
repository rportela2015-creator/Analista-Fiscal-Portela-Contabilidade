import assert from 'node:assert/strict';
import {
  normalizarNcm,
  validarNcmSiscomex,
  avaliarSensibilidadeFiscal,
  extrairDadosXmlNfe,
  extrairDadosNfe,
  FiscalExtractionError,
} from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

const t = async (name, fn) => {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`, err);
    throw err;
  }
};

const mapaD8 = getMapaD8();

// ─── 1. normalizarNcm ────────────────────────────────────────────────────────
await t('normalizarNcm: normaliza código de 8 dígitos pontuado e não pontuado', () => {
  const r1 = normalizarNcm('8471.30.12');
  assert.equal(r1.d8, '84713012');
  assert.equal(r1.formatado, '8471.30.12');
  assert.equal(r1.validoFormato, true);

  const r2 = normalizarNcm('84713012');
  assert.equal(r2.d8, '84713012');
  assert.equal(r2.validoFormato, true);
});

await t('normalizarNcm: completa 7 dígitos suprimidos pelo Excel com padStart 0', () => {
  const r = normalizarNcm('1012100');
  assert.equal(r.d8, '01012100');
  assert.equal(r.formatado, '0101.21.00');
  assert.equal(r.validoFormato, true);
});

await t('normalizarNcm: rejeita notação científica corrompida de planilhas', () => {
  const r1 = normalizarNcm('8.4713E+07');
  assert.equal(r1.validoFormato, false);
  assert.equal(r1.d8, '');

  const r2 = normalizarNcm('8.4713e+07');
  assert.equal(r2.validoFormato, false);
  assert.equal(r2.d8, '');
});

await t('normalizarNcm: rejeita códigos de tamanho inválido ou vazios', () => {
  assert.equal(normalizarNcm('').validoFormato, false);
  assert.equal(normalizarNcm('8471').validoFormato, false);
  assert.equal(normalizarNcm(null).validoFormato, false);
});

// ─── 2. validarNcmSiscomex ───────────────────────────────────────────────────
await t('validarNcmSiscomex: valida NCMs oficiais em O(1)', () => {
  const rValido = validarNcmSiscomex('84713012', mapaD8);
  assert.equal(rValido.valido, true);
  assert.ok(rValido.record);
  assert.ok(rValido.record.desc);

  const rInvalido = validarNcmSiscomex('99999999', mapaD8);
  assert.equal(rInvalido.valido, false);
  assert.equal(rInvalido.record, undefined);

  const rZeros = validarNcmSiscomex('00000000', mapaD8);
  assert.equal(rZeros.valido, false);
});

// ─── 3. avaliarSensibilidadeFiscal ───────────────────────────────────────────
await t('avaliarSensibilidadeFiscal: sinaliza NCM inválido', () => {
  const item = {
    index: 1,
    cProd: 'PROD-01',
    xProd: 'Produto de teste',
    ncm: '99999999',
    ncmValidoSiscomex: false,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 100,
    vProd: 100,
    tributos: {},
  };
  const sens = avaliarSensibilidadeFiscal(item);
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(sens.motivosSensibilidade.includes('NCM_INVALIDO_SISCOMEX'));
});

await t('avaliarSensibilidadeFiscal: sinaliza Substituição Tributária (CST 10 e ST)', () => {
  const item = {
    index: 1,
    cProd: 'PROD-02',
    xProd: 'Refrigerante 2L',
    ncm: '22021000',
    ncmValidoSiscomex: true,
    cfop: '5405',
    uCom: 'UN',
    qCom: 10,
    vUnCom: 5,
    vProd: 50,
    tributos: {
      cstIcms: '10',
      vBCST: 60,
      vICMSST: 10.8,
      pMVAST: 40,
    },
  };
  const sens = avaliarSensibilidadeFiscal(item);
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(sens.motivosSensibilidade.includes('SUBSTITUICAO_TRIBUTARIA'));
});

await t('avaliarSensibilidadeFiscal: sinaliza CFOP Interestadual (6.102)', () => {
  const item = {
    index: 1,
    cProd: 'PROD-03',
    xProd: 'Material de escritório',
    ncm: '48025610',
    ncmValidoSiscomex: true,
    cfop: '6102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 20,
    vProd: 20,
    tributos: { cstIcms: '00' },
  };
  const sens = avaliarSensibilidadeFiscal(item);
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(sens.motivosSensibilidade.includes('CFOP_INTERESTADUAL'));
});

await t('avaliarSensibilidadeFiscal: sinaliza Simples Nacional com CSOSN 102 vedado', () => {
  const item = {
    index: 1,
    cProd: 'PROD-04',
    xProd: 'Peça usinada',
    ncm: '84834090',
    ncmValidoSiscomex: true,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 50,
    vProd: 50,
    tributos: { csosn: '102' },
  };
  const sens = avaliarSensibilidadeFiscal(item, '1');
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(sens.motivosSensibilidade.includes('CREDITO_VEDADO_SIMPLES_NACIONAL'));
});

// ─── 4. extrairDadosXmlNfe (Zero Truncamento & Parsing Integral) ──────────────
await t('extrairDadosXmlNfe: extrai 100% dos dados cadastrais e tributários sem truncar', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35240112345678000199550010000001231000001234" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <nNF>123</nNF>
        <serie>1</serie>
        <dhEmi>2026-03-01T10:00:00-03:00</dhEmi>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>DISTRIBUIDORA DE HARDWARE LTDA</xNome>
        <enderEmit>
          <UF>SP</UF>
          <xMun>São Paulo</xMun>
        </enderEmit>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>EMPRESA ADQUIRENTE S/A</xNome>
        <enderDest>
          <UF>SP</UF>
          <xMun>Campinas</xMun>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>NOTE-01</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>NOTEBOOK DELL 14 POL</xProd>
          <NCM>84713012</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>4500.00</vUnCom>
          <vProd>9000.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <vBC>9000.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>1620.00</vICMS>
            </ICMS00>
          </ICMS>
          <IPI>
            <cEnq>999</cEnq>
            <IPITrib>
              <CST>50</CST>
              <vBC>9000.00</vBC>
              <pIPI>5.00</pIPI>
              <vIPI>450.00</vIPI>
            </IPITrib>
          </IPI>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>9000.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>148.50</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>9000.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>684.00</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>9000.00</vBC>
          <vICMS>1620.00</vICMS>
          <vProd>9000.00</vProd>
          <vIPI>450.00</vIPI>
          <vPIS>148.50</vPIS>
          <vCOFINS>684.00</vCOFINS>
          <vNF>9450.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

  const data = extrairDadosXmlNfe(sampleXml, mapaD8);

  assert.equal(data.tipoDocumento, 'XML');
  assert.equal(data.identificacao.chaveAcesso, '35240112345678000199550010000001231000001234');
  assert.equal(data.identificacao.numero, '123');
  assert.equal(data.identificacao.modelo, '55');
  assert.equal(data.emitente.cnpj, '12345678000199');
  assert.equal(data.emitente.crt, '3');
  assert.equal(data.emitente.regimeDescricao, 'Regime Normal');
  assert.equal(data.destinatario.cnpj, '98765432000188');
  assert.equal(data.resumoFinanceiro.vProdTotal, 9000);
  assert.equal(data.resumoFinanceiro.vNF, 9450);
  assert.equal(data.totalItens, 1);

  const it = data.itens[0];
  assert.equal(it.index, 1);
  assert.equal(it.cProd, 'NOTE-01');
  assert.equal(it.xProd, 'NOTEBOOK DELL 14 POL');
  assert.equal(it.ncm, '84713012');
  assert.equal(it.ncmValidoSiscomex, true);
  assert.ok(it.descricaoSiscomex);
  assert.equal(it.tributos.cstIcms, '00');
  assert.equal(it.tributos.pICMS, 18);
  assert.equal(it.tributos.vICMS, 1620);
  assert.equal(it.tributos.cstIpi, '50');
  assert.equal(it.tributos.vIPI, 450);
  assert.equal(it.tributos.cstPis, '01');
  assert.equal(it.tributos.vPIS, 148.5);
  assert.equal(it.tributos.cstCofins, '01');
  assert.equal(it.tributos.vCOFINS, 684);
});

await t('extrairDadosXmlNfe: zero truncamento com 35 itens', () => {
  const dets = Array.from({ length: 35 }, (_, i) => `
    <det nItem="${i + 1}">
      <prod>
        <cProd>ITEM-${i + 1}</cProd>
        <xProd>Produto número ${i + 1}</xProd>
        <NCM>84713012</NCM>
        <CFOP>5102</CFOP>
        <uCom>UN</uCom>
        <qCom>1.00</qCom>
        <vUnCom>100.00</vUnCom>
        <vProd>100.00</vProd>
      </prod>
      <imposto>
        <ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>100.00</vBC><pICMS>18.00</pICMS><vICMS>18.00</vICMS></ICMS00></ICMS>
      </imposto>
    </det>
  `).join('\n');

  const xml35 = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe123" versao="4.00"><ide><nNF>1</nNF></ide><emit><CNPJ>123</CNPJ></emit><dest><CNPJ>456</CNPJ></dest>${dets}<total><ICMSTot><vProd>3500.00</vProd><vNF>3500.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;

  const data = extrairDadosXmlNfe(xml35, mapaD8);
  assert.equal(data.totalItens, 35);
  assert.equal(data.itens.length, 35);
  assert.equal(data.itens[34].index, 35);
  assert.equal(data.itens[34].cProd, 'ITEM-35');
});

// ─── 5. extrairDadosNfe (Dispatcher & Validações de Erro) ─────────────────────
await t('extrairDadosNfe: rejeita buffer vazio com ARQUIVO_VAZIO', async () => {
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.alloc(0), 'teste.xml'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'ARQUIVO_VAZIO'
  );
});

await t('extrairDadosNfe: rejeita formato não suportado com FORMATO_INVALIDO', async () => {
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from('arquivo de texto plano'), 'planilha.csv'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'FORMATO_INVALIDO'
  );
});

await t('extrairDadosNfe: processa XML em <200ms com tempoExtracaoMs calculado', async () => {
  const xml = `<nfeProc><NFe><infNFe Id="NFe123"><ide><nNF>1</nNF></ide><emit><CNPJ>123</CNPJ></emit><dest><CNPJ>456</CNPJ></dest><det><prod><cProd>1</cProd><xProd>X</xProd><NCM>84713012</NCM><CFOP>5102</CFOP></prod></det></infNFe></NFe></nfeProc>`;
  const res = await extrairDadosNfe(Buffer.from(xml), 'nota.xml');
  assert.ok(typeof res.tempoExtracaoMs === 'number');
  assert.ok(res.tempoExtracaoMs < 200, `Tempo de extração deve ser <200ms, foi ${res.tempoExtracaoMs}ms`);
  assert.equal(res.totalItens, 1);
});
