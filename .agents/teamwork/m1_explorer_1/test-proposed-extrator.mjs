import assert from 'node:assert/strict';
import { getMapaD8 } from '@/lib/ai/ncm-server';
import {
  extrairDadosNfe,
  extrairDadosXmlNfe,
  avaliarSensibilidadeFiscal,
} from './proposed_extrator-nfe.ts';

async function runTests() {
  console.log('──────── test-proposed-extrator.mjs ────────');

  const mapaD8 = getMapaD8();
  assert.ok(mapaD8.size >= 10000, 'Siscomex database must be loaded with >= 10,000 records');
  console.log(`OK  Siscomex map loaded with ${mapaD8.size} records.`);

  // 1. Single Item XML with full taxes (ICMS 00, IPI 50, PIS 01, COFINS 01)
  {
    const xml = `
    <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe35230911222333000181550010000012341000012345" versao="4.00">
          <ide>
            <cUF>35</cUF>
            <natOp>VENDA DE MERCADORIA</natOp>
            <mod>55</mod>
            <serie>1</serie>
            <nNF>1234</nNF>
            <dhEmi>2026-04-15T10:30:00-03:00</dhEmi>
            <tpNF>1</tpNF>
          </ide>
          <emit>
            <CNPJ>11222333000181</CNPJ>
            <xNome>FORNECEDOR TECNOLOGIA LTDA</xNome>
            <CRT>3</CRT>
            <enderEmit><UF>SP</UF></enderEmit>
          </emit>
          <dest>
            <CNPJ>44555666000199</CNPJ>
            <xNome>CLIENTE ADQUIRENTE S.A.</xNome>
            <enderDest><UF>MG</UF></enderDest>
          </dest>
          <det nItem="1">
            <prod>
              <cProd>PROD-001</cProd>
              <cEAN>7891234567890</cEAN>
              <xProd>NOTEBOOK CORPORATIVO 14 POL</xProd>
              <NCM>84713012</NCM>
              <CFOP>6102</CFOP>
              <uCom>UN</uCom>
              <qCom>2.0000</qCom>
              <vUnCom>3500.00</vUnCom>
              <vProd>7000.00</vProd>
              <vFrete>50.00</vFrete>
            </prod>
            <imposto>
              <ICMS>
                <ICMS00>
                  <orig>0</orig>
                  <CST>00</CST>
                  <modBC>3</modBC>
                  <vBC>7050.00</vBC>
                  <pICMS>12.00</pICMS>
                  <vICMS>846.00</vICMS>
                </ICMS00>
              </ICMS>
              <IPI>
                <cEnq>999</cEnq>
                <IPITrib>
                  <CST>50</CST>
                  <vBC>7000.00</vBC>
                  <pIPI>15.00</pIPI>
                  <vIPI>1050.00</vIPI>
                </IPITrib>
              </IPI>
              <PIS>
                <PISAliq>
                  <CST>01</CST>
                  <vBC>7050.00</vBC>
                  <pPIS>1.65</pPIS>
                  <vPIS>116.33</vPIS>
                </PISAliq>
              </PIS>
              <COFINS>
                <COFINSAliq>
                  <CST>01</CST>
                  <vBC>7050.00</vBC>
                  <pCOFINS>7.60</pCOFINS>
                  <vCOFINS>535.80</vCOFINS>
                </COFINSAliq>
              </COFINS>
            </imposto>
          </det>
          <total>
            <ICMSTot>
              <vProd>7000.00</vProd>
              <vFrete>50.00</vFrete>
              <vSeg>0.00</vSeg>
              <vDesc>0.00</vDesc>
              <vBC>7050.00</vBC>
              <vICMS>846.00</vICMS>
              <vIPI>1050.00</vIPI>
              <vPIS>116.33</vPIS>
              <vCOFINS>535.80</vCOFINS>
              <vNF>8100.00</vNF>
            </ICMSTot>
          </total>
        </infNFe>
      </NFe>
      <protNFe versao="4.00">
        <infProt>
          <chNFe>35230911222333000181550010000012341000012345</chNFe>
        </infProt>
      </protNFe>
    </nfeProc>
    `;

    const t0 = performance.now();
    const doc = await extrairDadosNfe(Buffer.from(xml, 'utf-8'), 'nfe_teste_1.xml', mapaD8);
    const ms = performance.now() - t0;

    assert.equal(doc.tipoDocumento, 'XML');
    assert.equal(doc.identificacao.chaveAcesso, '35230911222333000181550010000012341000012345');
    assert.equal(doc.identificacao.numero, '1234');
    assert.equal(doc.identificacao.serie, '1');
    assert.equal(doc.emitente.cnpj, '11222333000181');
    assert.equal(doc.emitente.uf, 'SP');
    assert.equal(doc.emitente.crt, '3');
    assert.equal(doc.destinatario.cnpj, '44555666000199');
    assert.equal(doc.destinatario.uf, 'MG');
    assert.equal(doc.resumoFinanceiro.vProdTotal, 7000.00);
    assert.equal(doc.resumoFinanceiro.vNF, 8100.00);
    assert.equal(doc.totalItens, 1);

    const it = doc.itens[0];
    assert.equal(it.index, 1);
    assert.equal(it.cProd, 'PROD-001');
    assert.equal(it.cEAN, '7891234567890');
    assert.equal(it.ncm, '84713012');
    assert.equal(it.ncmValidoSiscomex, true);
    assert.ok(it.descricaoSiscomex && it.descricaoSiscomex.includes('peso'));
    assert.equal(it.cfop, '6102');
    assert.equal(it.qCom, 2);
    assert.equal(it.vUnCom, 3500);
    assert.equal(it.vProd, 7000);
    assert.equal(it.vFrete, 50);

    // Tributos
    assert.equal(it.tributos.cstIcms, '00');
    assert.equal(it.tributos.vBC, 7050.00);
    assert.equal(it.tributos.pICMS, 12.00);
    assert.equal(it.tributos.vICMS, 846.00);
    assert.equal(it.tributos.cstIpi, '50');
    assert.equal(it.tributos.cEnq, '999');
    assert.equal(it.tributos.vIPI, 1050.00);
    assert.equal(it.tributos.cstPis, '01');
    assert.equal(it.tributos.vBCPis, 7050.00);
    assert.equal(it.tributos.vPIS, 116.33);
    assert.equal(it.tributos.cstCofins, '01');
    assert.equal(it.tributos.vBCCofins, 7050.00);
    assert.equal(it.tributos.vCOFINS, 535.80);

    // Sensibilidade: CFOP 6102 (interestadual) e IPI 50 (destacado)
    assert.equal(it.sensivelParaAuditoria, true);
    assert.ok(it.motivosSensibilidade.includes('CFOP_INTERESTADUAL'));
    assert.ok(it.motivosSensibilidade.includes('IPI_DESTACADO'));

    console.log(`OK  Test 1: Single item full tax extraction executed in ${ms.toFixed(2)} ms`);
  }

  // 2. Multi-Item XML with 35 items (Zero Truncation Guarantee)
  {
    let detXml = '';
    for (let i = 1; i <= 35; i++) {
      detXml += `
      <det nItem="${i}">
        <prod>
          <cProd>ITEM-${i}</cProd>
          <xProd>MERCADORIA DE TESTE NUMERO ${i}</xProd>
          <NCM>${i === 1 ? '01012100' : (i === 15 ? '99999999' : '84713012')}</NCM>
          <CFOP>${i > 20 ? '6102' : '5102'}</CFOP>
          <uCom>UN</uCom>
          <qCom>${i}</qCom>
          <vUnCom>100.00</vUnCom>
          <vProd>${i * 100}.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <vBC>${i * 100}.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>${(i * 100 * 0.18).toFixed(2)}</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
      </det>`;
    }

    const xml35 = `
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35230911222333000181550010000055551000055555" versao="4.00">
        <ide><nNF>5555</nNF><serie>1</serie></ide>
        <emit><CNPJ>11222333000181</CNPJ><CRT>3</CRT></emit>
        <dest><CNPJ>44555666000199</CNPJ></dest>
        ${detXml}
        <total><ICMSTot><vProd>63000.00</vProd><vNF>63000.00</vNF></ICMSTot></total>
      </infNFe>
    </NFe>`;

    const t0 = performance.now();
    const doc = extrairDadosXmlNfe(xml35, mapaD8);
    const ms = performance.now() - t0;

    assert.equal(doc.totalItens, 35, 'Must extract all 35 items without the 15-item cutoff');
    assert.equal(doc.itens.length, 35);
    assert.equal(doc.itens[34].index, 35);
    assert.equal(doc.itens[34].cProd, 'ITEM-35');

    // Leading zero preservation in NCM 01012100 (item 1)
    assert.equal(doc.itens[0].ncm, '01012100');
    assert.equal(doc.itens[0].ncmValidoSiscomex, true);

    // Invalid NCM 99999999 (item 15)
    assert.equal(doc.itens[14].ncm, '99999999');
    assert.equal(doc.itens[14].ncmValidoSiscomex, false);
    assert.equal(doc.itens[14].sensivelParaAuditoria, true);
    assert.ok(doc.itens[14].motivosSensibilidade.includes('NCM_INVALIDO_SISCOMEX'));

    console.log(`OK  Test 2: 35 items zero-truncation extraction executed in ${ms.toFixed(2)} ms`);
  }

  // 3. Simples Nacional with ST (CSOSN 201)
  {
    const xmlSnSt = `
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35230911222333000181550010000077771000077777" versao="4.00">
        <ide><nNF>7777</nNF></ide>
        <emit><CNPJ>11222333000181</CNPJ><CRT>1</CRT></emit>
        <dest><CNPJ>44555666000199</CNPJ></dest>
        <det nItem="1">
          <prod>
            <cProd>BEBIDA-01</cProd>
            <xProd>CERVEJA PURO MALTE 350ML</xProd>
            <NCM>22030000</NCM>
            <CEST>0300100</CEST>
            <CFOP>5405</CFOP>
            <uCom>UN</uCom>
            <qCom>100</qCom>
            <vUnCom>4.50</vUnCom>
            <vProd>450.00</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMSSN201>
                <orig>0</orig>
                <CSOSN>201</CSOSN>
                <modBCST>4</modBCST>
                <pMVAST>40.00</pMVAST>
                <vBCST>630.00</vBCST>
                <pICMSST>18.00</pICMSST>
                <vICMSST>32.40</vICMSST>
                <pCredSN>2.50</pCredSN>
                <vCredICMSSN>11.25</vCredICMSSN>
              </ICMSSN201>
            </ICMS>
          </imposto>
        </det>
        <total><ICMSTot><vProd>450.00</vProd><vNF>482.40</vNF></ICMSTot></total>
      </infNFe>
    </NFe>`;

    const doc = extrairDadosXmlNfe(xmlSnSt, mapaD8);
    const it = doc.itens[0];
    assert.equal(doc.emitente.crt, '1');
    assert.equal(doc.emitente.regimeDescricao, 'Simples Nacional');
    assert.equal(it.tributos.csosn, '201');
    assert.equal(it.tributos.pMVAST, 40.00);
    assert.equal(it.tributos.vBCST, 630.00);
    assert.equal(it.tributos.pICMSST, 18.00);
    assert.equal(it.tributos.vICMSST, 32.40);
    assert.equal(it.tributos.pCredSN, 2.50);
    assert.equal(it.tributos.vCredICMSSN, 11.25);
    assert.equal(it.cest, '0300100');
    assert.equal(it.sensivelParaAuditoria, true);
    assert.ok(it.motivosSensibilidade.includes('SUBSTITUICAO_TRIBUTARIA'));

    console.log('OK  Test 3: Simples Nacional with ST and MVA extracted accurately');
  }

  // 4. Reforma Tributária do Consumo (IBS/CBS) Group
  {
    const xmlRtc = `
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35260111222333000181550010000088881000088888" versao="4.00">
        <ide><nNF>8888</nNF></ide>
        <emit><CNPJ>11222333000181</CNPJ><CRT>3</CRT></emit>
        <dest><CNPJ>44555666000199</CNPJ></dest>
        <det nItem="1">
          <prod>
            <cProd>SRV-01</cProd>
            <xProd>PRODUTO TRANSICAO 2026</xProd>
            <NCM>84713012</NCM>
            <CFOP>5102</CFOP>
            <uCom>UN</uCom>
            <qCom>1</qCom>
            <vUnCom>1000.00</vUnCom>
            <vProd>1000.00</vProd>
          </prod>
          <imposto>
            <IBSCBS>
              <cClassTrib>000001</cClassTrib>
              <CST>000</CST>
              <pIBS>0.10</pIBS>
              <vIBS>1.00</vIBS>
              <pCBS>0.90</pCBS>
              <vCBS>9.00</vCBS>
            </IBSCBS>
          </imposto>
        </det>
        <total><ICMSTot><vProd>1000.00</vProd><vNF>1000.00</vNF></ICMSTot></total>
      </infNFe>
    </NFe>`;

    const doc = extrairDadosXmlNfe(xmlRtc, mapaD8);
    const it = doc.itens[0];
    assert.equal(it.tributos.cClassTrib, '000001');
    assert.equal(it.tributos.cstIbsCbs, '000');
    assert.equal(it.tributos.pIBS, 0.10);
    assert.equal(it.tributos.vIBS, 1.00);
    assert.equal(it.tributos.pCBS, 0.90);
    assert.equal(it.tributos.vCBS, 9.00);

    console.log('OK  Test 4: Reforma Tributária (IBS/CBS) extracted accurately');
  }

  console.log('\nPROPOSED EXTRATOR NFE OK ✓\n');
}

runTests().catch((err) => {
  console.error('FAIL in proposed extrator test:', err);
  process.exit(1);
});
