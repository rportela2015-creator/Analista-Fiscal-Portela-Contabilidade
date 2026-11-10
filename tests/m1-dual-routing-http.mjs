import assert from 'node:assert/strict';

function buildPdfWithText(textLines) {
  let streamContent = 'BT /F1 10 Tf 20 750 Td ';
  for (let i = 0; i < textLines.length; i++) {
    if (i > 0) streamContent += '0 -20 Td ';
    streamContent += '(' + textLines[i].replace(/[()\\\\]/g, '\\$&') + ') Tj ';
  }
  streamContent += 'ET';

  const streamLen = Buffer.byteLength(streamContent, 'utf-8');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    '4 0 obj\n<< /Length ' + streamLen + ' >>\nstream\n' + streamContent + '\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf-8'));
    body += obj;
  }
  const xrefOffset = Buffer.byteLength(body, 'utf-8');
  body += 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) {
    body += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  body += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
  return Buffer.from(body, 'utf-8');
}

async function testDualRouting() {
  const xmlContent = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe>
      <infNFe Id="NFe35240112345678000199550010000001231000001234" versao="4.00">
        <ide><nNF>123</nNF></ide>
        <emit><CNPJ>12345678000199</CNPJ><CRT>3</CRT></emit>
        <dest><CNPJ>98765432000188</CNPJ></dest>
        <det nItem="1">
          <prod>
            <cProd>NOTE-01</cProd>
            <xProd>NOTEBOOK DELL 14 POL</xProd>
            <NCM>84713012</NCM>
            <CFOP>5102</CFOP>
            <uCom>UN</uCom>
            <qCom>1</qCom>
            <vUnCom>4500.00</vUnCom>
            <vProd>4500.00</vProd>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <vBC>4500.00</vBC>
                <pICMS>18.00</pICMS>
                <vICMS>810.00</vICMS>
              </ICMS00>
            </ICMS>
          </imposto>
        </det>
        <total><ICMSTot><vProd>4500.00</vProd><vNF>4500.00</vNF></ICMSTot></total>
      </infNFe>
    </NFe>
  </nfeProc>`;

  console.log('\n─── TESTING DUAL ROUTING OVER HTTP ───');

  // 1. Dedicated endpoint: /api/auditoria-entrada/extrair
  const fd1 = new FormData();
  fd1.append('file', new Blob([xmlContent], { type: 'text/xml' }), 'nota.xml');
  fd1.append('regime', 'Normal');
  fd1.append('finalidade', 'Comercialização');

  const r1 = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
    method: 'POST',
    body: fd1,
  });
  assert.equal(r1.status, 200, `Expected 200 on /extrair, got ${r1.status}`);
  const data1 = await r1.json();
  assert.equal(data1.tipoDocumento, 'XML');
  assert.equal(data1.totalItens, 1);
  assert.equal(data1.itens[0].cProd, 'NOTE-01');
  console.log('✓ Route B (/api/auditoria-entrada/extrair): HTTP 200 OK, items:', data1.totalItens);

  // 2. Unified router with query param: /api/auditoria-entrada?action=extrair
  const fd2 = new FormData();
  fd2.append('file', new Blob([xmlContent], { type: 'text/xml' }), 'nota.xml');
  fd2.append('regime', 'Normal');
  fd2.append('finalidade', 'Comercialização');

  const r2 = await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', {
    method: 'POST',
    body: fd2,
  });
  assert.equal(r2.status, 200, `Expected 200 on ?action=extrair, got ${r2.status}`);
  const data2 = await r2.json();
  assert.equal(data2.tipoDocumento, 'XML');
  assert.equal(data2.totalItens, 1);
  assert.equal(data2.itens[0].cProd, 'NOTE-01');
  console.log('✓ Route A (/api/auditoria-entrada?action=extrair): HTTP 200 OK, items:', data2.totalItens);

  // 3. Unified router with form field: /api/auditoria-entrada with action=extrair
  const fd3 = new FormData();
  fd3.append('file', new Blob([xmlContent], { type: 'text/xml' }), 'nota.xml');
  fd3.append('action', 'extrair');

  const r3 = await fetch('http://localhost:3000/api/auditoria-entrada', {
    method: 'POST',
    body: fd3,
  });
  assert.equal(r3.status, 200, `Expected 200 on form action=extrair, got ${r3.status}`);
  const data3 = await r3.json();
  assert.equal(data3.tipoDocumento, 'XML');
  assert.equal(data3.totalItens, 1);
  assert.equal(data3.itens[0].cProd, 'NOTE-01');
  console.log('✓ Route A (/api/auditoria-entrada with form action=extrair): HTTP 200 OK, items:', data3.totalItens);

  // 4. Parity and schema symmetry comparison between Route A and Route B
  assert.equal(data1.tipoDocumento, data2.tipoDocumento);
  assert.equal(data1.totalItens, data2.totalItens);
  assert.equal(data1.itens[0].cProd, data2.itens[0].cProd);
  assert.equal(data1.itens[0].ncm, data2.itens[0].ncm);
  assert.equal(data1.itens[0].ncmValidoSiscomex, data2.itens[0].ncmValidoSiscomex);
  assert.equal(data1.resumoFinanceiro.vNF, data2.resumoFinanceiro.vNF);
  console.log('✓ Parity verification: Route A and Route B XML outputs are 100% symmetric');

  // 5. PDF DANFE extraction via HTTP on both routes
  const danfePdfBuf = buildPdfWithText([
    'CHAVE DE ACESSO: 3524 0112 3456 7800 0199 5500 1000 0001 2310 0000 1234',
    'No. 000123 Serie 1 DATA DA EMISSAO 01/03/2026',
    'NATUREZA DA OPERACAO Venda de Mercadoria',
    'EMITENTE CNPJ: 12.345.678/0001-99 UF: SP',
    'DESTINATARIO CNPJ/CPF: 98.765.432/0001-88 UF: SP',
    'VALOR TOTAL DOS PRODUTOS: 9000.00 VALOR TOTAL DA NOTA: 9450.00',
    'ITEM-01 NOTEBOOK DELL 14 POL 8471.30.12 00 5102 UN 2.00 4500.00 9000.00',
  ]);

  const fdPdf1 = new FormData();
  fdPdf1.append('file', new Blob([danfePdfBuf], { type: 'application/pdf' }), 'danfe.pdf');
  const rPdf1 = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', { method: 'POST', body: fdPdf1 });
  assert.equal(rPdf1.status, 200);
  const dataPdf1 = await rPdf1.json();
  assert.equal(dataPdf1.tipoDocumento, 'PDF');
  assert.equal(dataPdf1.totalItens, 1);
  assert.equal(dataPdf1.itens[0].cProd, 'ITEM-01');
  console.log('✓ Route B (/api/auditoria-entrada/extrair): PDF DANFE uploaded and parsed, items:', dataPdf1.totalItens);

  const fdPdf2 = new FormData();
  fdPdf2.append('file', new Blob([danfePdfBuf], { type: 'application/pdf' }), 'danfe.pdf');
  const rPdf2 = await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', { method: 'POST', body: fdPdf2 });
  assert.equal(rPdf2.status, 200);
  const dataPdf2 = await rPdf2.json();
  assert.equal(dataPdf2.tipoDocumento, 'PDF');
  assert.equal(dataPdf2.totalItens, 1);
  assert.equal(dataPdf2.itens[0].cProd, 'ITEM-01');
  console.log('✓ Route A (/api/auditoria-entrada?action=extrair): PDF DANFE uploaded and parsed, items:', dataPdf2.totalItens);

  // 6. Error handling symmetry: Empty file (0 bytes)
  const fdEmpty1 = new FormData();
  fdEmpty1.append('file', new Blob([''], { type: 'text/xml' }), 'empty.xml');
  const rEmpty1 = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', { method: 'POST', body: fdEmpty1 });
  assert.equal(rEmpty1.status, 400);
  const errData1 = await rEmpty1.json();
  assert.equal(errData1.codigo, 'ARQUIVO_VAZIO');

  const fdEmpty2 = new FormData();
  fdEmpty2.append('file', new Blob([''], { type: 'text/xml' }), 'empty.xml');
  const rEmpty2 = await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', { method: 'POST', body: fdEmpty2 });
  assert.equal(rEmpty2.status, 400);
  const errData2 = await rEmpty2.json();
  assert.equal(errData2.codigo, 'ARQUIVO_VAZIO');
  console.log('✓ Error handling parity: Both return 400 ARQUIVO_VAZIO for 0-byte file');

  // 7. Error handling symmetry: Missing file
  const fdMissing1 = new FormData();
  const rMissing1 = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', { method: 'POST', body: fdMissing1 });
  assert.equal(rMissing1.status, 400);
  const errMissing1 = await rMissing1.json();
  assert.equal(errMissing1.codigo, 'ARQUIVO_AUSENTE');

  const fdMissing2 = new FormData();
  const rMissing2 = await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', { method: 'POST', body: fdMissing2 });
  assert.equal(rMissing2.status, 400);
  const errMissing2 = await rMissing2.json();
  assert.equal(errMissing2.codigo, 'ARQUIVO_AUSENTE');
  console.log('✓ Error handling parity: Both return 400 ARQUIVO_AUSENTE when file field is omitted');

  // 8. Error handling symmetry: Invalid extension (.txt)
  const fdTxt1 = new FormData();
  fdTxt1.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'documento.txt');
  const rTxt1 = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', { method: 'POST', body: fdTxt1 });
  assert.equal(rTxt1.status, 400);
  const errTxt1 = await rTxt1.json();
  assert.equal(errTxt1.codigo, 'FORMATO_INVALIDO');

  const fdTxt2 = new FormData();
  fdTxt2.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'documento.txt');
  const rTxt2 = await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', { method: 'POST', body: fdTxt2 });
  assert.equal(rTxt2.status, 400);
  const errTxt2 = await rTxt2.json();
  assert.equal(errTxt2.codigo, 'FORMATO_INVALIDO');
  console.log('✓ Error handling parity: Both return 400 FORMATO_INVALIDO for non-xml/pdf extensions');

  console.log('\nALL DUAL-ROUTING HTTP TESTS PASSED ✓');
}

testDualRouting().catch((err) => {
  console.error('FAIL in testDualRouting:', err);
  process.exit(1);
});
