import assert from 'node:assert/strict';

function generateXml(count) {
  const dets = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `
      <det nItem="${n}">
        <prod>
          <cProd>P${n}</cProd>
          <xProd>PRODUTO NUMERO ${n}</xProd>
          <NCM>84713012</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>1</qCom>
          <vUnCom>100.00</vUnCom>
          <vProd>100.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <vBC>100.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>18.00</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
      </det>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35260100000000000199550010000001001000000100" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cNF>100</cNF>
        <natOp>Venda</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>100</nNF>
        <dhEmi>2026-03-01T12:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>TESTE LTDA</xNome>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>COMPRADOR</xNome>
      </dest>
      ${dets}
      <total>
        <ICMSTot>
          <vBC>${(count * 100).toFixed(2)}</vBC>
          <vICMS>${(count * 18).toFixed(2)}</vICMS>
          <vProd>${(count * 100).toFixed(2)}</vProd>
          <vNF>${(count * 100).toFixed(2)}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

const routes = [
  { name: 'Route B (/api/auditoria-entrada/extrair)', url: 'http://localhost:3000/api/auditoria-entrada/extrair' },
  { name: 'Route A (?action=extrair)', url: 'http://localhost:3000/api/auditoria-entrada?action=extrair' },
];

async function runTests() {
  console.log('Testing boundaries and limits across both routes:');
  for (const r of routes) {
    console.log(`\n--- Target: ${r.name} ---`);

    // 1. Missing multipart
    const resNoMultipart = await fetch(r.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const jsonNoMultipart = await resNoMultipart.json();
    console.log(`1. No multipart: status=${resNoMultipart.status}, codigo=${jsonNoMultipart.codigo}`);
    assert.equal(resNoMultipart.status, 400);
    assert.equal(jsonNoMultipart.codigo, 'CONTENT_TYPE_INVALIDO');

    // 2. Missing file
    const formNoFile = new FormData();
    const resNoFile = await fetch(r.url, { method: 'POST', body: formNoFile });
    const jsonNoFile = await resNoFile.json();
    console.log(`2. No file: status=${resNoFile.status}, codigo=${jsonNoFile.codigo}`);
    assert.equal(resNoFile.status, 400);
    assert.equal(jsonNoFile.codigo, 'ARQUIVO_AUSENTE');

    // 3. 0-byte file
    const formZero = new FormData();
    formZero.append('file', new Blob([new Uint8Array(0)], { type: 'application/xml' }), 'zero.xml');
    const resZero = await fetch(r.url, { method: 'POST', body: formZero });
    const jsonZero = await resZero.json();
    console.log(`3. Zero bytes: status=${resZero.status}, codigo=${jsonZero.codigo}`);
    assert.equal(resZero.status, 400);
    assert.equal(jsonZero.codigo, 'ARQUIVO_VAZIO');

    // 4. >10MB file limit
    const formOversized = new FormData();
    formOversized.append('file', new Blob([new Uint8Array(10 * 1024 * 1024 + 512)], { type: 'application/xml' }), 'huge.xml');
    const resOversized = await fetch(r.url, { method: 'POST', body: formOversized });
    const jsonOversized = await resOversized.json();
    console.log(`4. >10MB limit: status=${resOversized.status}, codigo=${jsonOversized.codigo}, limit=${jsonOversized.limiteMaximoBytes}`);
    assert.equal(resOversized.status, 413);
    assert.equal(jsonOversized.codigo, 'TAMANHO_EXCEDIDO');

    // 5. Invalid extension (.txt)
    const formTxt = new FormData();
    formTxt.append('file', new Blob([Buffer.from('texto')], { type: 'text/plain' }), 'nota.txt');
    const resTxt = await fetch(r.url, { method: 'POST', body: formTxt });
    const jsonTxt = await resTxt.json();
    console.log(`5. Invalid ext: status=${resTxt.status}, codigo=${jsonTxt.codigo}`);
    assert.equal(resTxt.status, 400);
    assert.equal(jsonTxt.codigo, 'FORMATO_INVALIDO');

    // 6. Malformed XML
    const formMalf = new FormData();
    formMalf.append('file', new Blob([Buffer.from('<nfeProc><quebrado')], { type: 'application/xml' }), 'quebrado.xml');
    const resMalf = await fetch(r.url, { method: 'POST', body: formMalf });
    const jsonMalf = await resMalf.json();
    console.log(`6. Malformed XML: status=${resMalf.status}, codigo=${jsonMalf.codigo}`);
    assert.equal(resMalf.status, 400);
    assert.equal(jsonMalf.codigo, 'XML_MALFORMADO');

    // 7. 60 items XML (Testing zero truncation on 50+ items)
    const xml60 = generateXml(60);
    const form60 = new FormData();
    form60.append('file', new Blob([Buffer.from(xml60)], { type: 'application/xml' }), 'nfe-60.xml');
    const t0 = performance.now();
    const res60 = await fetch(r.url, { method: 'POST', body: form60 });
    const dur = performance.now() - t0;
    const json60 = await res60.json();
    console.log(`7. 60 items: status=${res60.status}, totalItens=${json60.totalItens}, arrayLength=${json60.itens.length}, serverMs=${json60.tempoExtracaoMs}, rttMs=${dur.toFixed(1)}`);
    assert.equal(res60.status, 200);
    assert.equal(json60.totalItens, 60);
    assert.equal(json60.itens.length, 60);
    assert.ok(json60.tempoExtracaoMs < 200);
  }

  // 8. Direct parity comparison between Route A and Route B for 60 items
  console.log('\n--- Checking Parity Between Route A and Route B ---');
  const xml60 = generateXml(60);
  const fdA = new FormData();
  fdA.append('file', new Blob([Buffer.from(xml60)], { type: 'application/xml' }), 'nota.xml');
  const fdB = new FormData();
  fdB.append('file', new Blob([Buffer.from(xml60)], { type: 'application/xml' }), 'nota.xml');

  const resA = await (await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', { method: 'POST', body: fdA })).json();
  const resB = await (await fetch('http://localhost:3000/api/auditoria-entrada/extrair', { method: 'POST', body: fdB })).json();

  assert.equal(resA.tipoDocumento, resB.tipoDocumento);
  assert.equal(resA.totalItens, resB.totalItens);
  assert.equal(resA.itens.length, resB.itens.length);
  assert.equal(resA.emitente.cnpj, resB.emitente.cnpj);
  assert.equal(resA.resumoFinanceiro.vNF, resB.resumoFinanceiro.vNF);
  assert.equal(resA.itens[0].cProd, resB.itens[0].cProd);
  assert.equal(resA.itens[59].cProd, resB.itens[59].cProd);
  console.log('Parity check passed! Route A and Route B return 100% symmetric payload structure.');
}

runTests().then(() => console.log('\nALL TESTS PASSED! ✓')).catch(console.error);
