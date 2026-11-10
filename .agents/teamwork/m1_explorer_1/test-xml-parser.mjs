import { XMLParser } from 'fast-xml-parser';
import assert from 'node:assert/strict';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'det',
  trimValues: true,
  parseTagValue: false,
});

// Case 1: Single item
const xmlSingle = `
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

const res = parser.parse(xmlSingle);
const nfe = res.nfeProc?.NFe?.infNFe || res.NFe?.infNFe;
assert.ok(nfe, 'nfe should be parsed');
assert.ok(Array.isArray(nfe.det), 'det MUST be an array even with 1 item');
assert.equal(nfe.det.length, 1);
assert.equal(nfe.det[0]['@_nItem'], '1');
assert.equal(nfe.det[0].prod.NCM, '84713012');
assert.equal(nfe.det[0].prod.cEAN, '7891234567890');
assert.equal(nfe.det[0].prod.vProd, '7000.00');
assert.equal(nfe.det[0].imposto.ICMS.ICMS00.CST, '00');
assert.equal(nfe.det[0].imposto.IPI.cEnq, '999');

console.log('Case 1 Passed: Single item parsed as Array with all fields preserved.');

// Case 2: Multi-item (30 items)
let itemsXml = '';
for (let i = 1; i <= 30; i++) {
  itemsXml += `
  <det nItem="${i}">
    <prod>
      <cProd>ITEM-${i}</cProd>
      <xProd>PRODUTO TESTE MULTI-ITEM ${i}</xProd>
      <NCM>${i % 2 === 0 ? '84713012' : '01012100'}</NCM>
      <CFOP>5102</CFOP>
      <uCom>UN</uCom>
      <qCom>1.0000</qCom>
      <vUnCom>${i * 10}.00</vUnCom>
      <vProd>${i * 10}.00</vProd>
    </prod>
    <imposto>
      <ICMS>
        <ICMS00>
          <orig>0</orig>
          <CST>00</CST>
          <vBC>${i * 10}.00</vBC>
          <pICMS>18.00</pICMS>
          <vICMS>${(i * 10 * 0.18).toFixed(2)}</vICMS>
        </ICMS00>
      </ICMS>
    </imposto>
  </det>`;
}

const xmlMulti = `
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe35230911222333000181550010000099991000099999" versao="4.00">
    <ide><nNF>9999</nNF></ide>
    <emit><CNPJ>11222333000181</CNPJ><CRT>1</CRT></emit>
    <dest><CNPJ>44555666000199</CNPJ></dest>
    ${itemsXml}
    <total><ICMSTot><vProd>4650.00</vProd><vNF>4650.00</vNF></ICMSTot></total>
  </infNFe>
</NFe>
`;

const resMulti = parser.parse(xmlMulti);
const nfeMulti = resMulti.nfeProc?.NFe?.infNFe || resMulti.NFe?.infNFe;
assert.equal(nfeMulti.det.length, 30, 'All 30 items must be extracted without truncation');
assert.equal(nfeMulti.det[29]['@_nItem'], '30');
assert.equal(nfeMulti.det[0].prod.NCM, '01012100', 'Leading zero on 01012100 must be preserved');

console.log('Case 2 Passed: 30 items extracted with zero truncation and leading zeros intact.');
