/**
 * Adversarial Stress & Extraction Verification Suite (Milestone 1)
 *
 * Grounded in:
 * - ORIGINAL_REQUEST.md (R1: Instant deterministic extraction, zero truncation, latency < 200ms)
 * - PROJECT.md (Stage 1 Deterministic Contract, Siscomex 10.515 O(1), Sensitivity Rules)
 * - DISPATCH.md (100 items XML, malformed XML, empty buffers, >10MB payload limit, corrupted NCMs)
 */

import assert from 'node:assert/strict';
import {
  extrairDadosNfe,
  extrairDadosXmlNfe,
  normalizarNcm,
  validarNcmSiscomex,
  avaliarSensibilidadeFiscal,
  FiscalExtractionError,
} from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

const t = async (name, fn) => {
  try {
    const t0 = performance.now();
    await fn();
    const dur = (performance.now() - t0).toFixed(2);
    console.log(`OK  ${name} (${dur}ms)`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(`      Erro: ${err.message}`);
    throw err;
  }
};

const mapaD8 = getMapaD8();

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  ADVERSARIAL STRESS TEST SUITE — MILESTONE 1 (CHALLENGER 1)');
console.log('══════════════════════════════════════════════════════════════════════');

// Helper to generate synthetic SEFAZ XML with N items
function generateSyntheticXml(itemCount, customizer) {
  const dets = Array.from({ length: itemCount }, (_, i) => {
    const itemNum = i + 1;
    const base = {
      nItem: itemNum,
      cProd: `PROD-${String(itemNum).padStart(4, '0')}`,
      cEAN: '7891234567890',
      xProd: `PRODUTO INDUSTRIALIZADO LINHA ${itemNum}`,
      ncm: '84713012',
      cfop: '5102',
      uCom: 'UN',
      qCom: '2.0000',
      vUnCom: '50.00',
      vProd: '100.00',
      cstIcms: '00',
      orig: '0',
      pIcms: '18.00',
      vIcms: '18.00',
      cstIpi: '50',
      pIpi: '5.00',
      vIpi: '5.00',
      cstPis: '01',
      pPis: '1.65',
      vPis: '1.65',
      cstCofins: '01',
      pCofins: '7.60',
      vCofins: '7.60',
    };

    const item = customizer ? customizer(base, itemNum) : base;

    return `
      <det nItem="${item.nItem}">
        <prod>
          <cProd>${item.cProd}</cProd>
          ${item.cEAN ? `<cEAN>${item.cEAN}</cEAN>` : ''}
          <xProd>${item.xProd}</xProd>
          <NCM>${item.ncm}</NCM>
          ${item.cest ? `<CEST>${item.cest}</CEST>` : ''}
          <CFOP>${item.cfop}</CFOP>
          <uCom>${item.uCom}</uCom>
          <qCom>${item.qCom}</qCom>
          <vUnCom>${item.vUnCom}</vUnCom>
          <vProd>${item.vProd}</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>${item.orig}</orig>
              <CST>${item.cstIcms}</CST>
              <vBC>${item.vProd}</vBC>
              <pICMS>${item.pIcms}</pICMS>
              <vICMS>${item.vIcms}</vICMS>
            </ICMS00>
          </ICMS>
          ${item.cstIpi ? `
            <IPI>
              <cEnq>999</cEnq>
              <IPITrib>
                <CST>${item.cstIpi}</CST>
                <vBC>${item.vProd}</vBC>
                <pIPI>${item.pIpi}</pIPI>
                <vIPI>${item.vIpi}</vIPI>
              </IPITrib>
            </IPI>
          ` : ''}
          ${item.cstPis ? `
            <PIS>
              <PISAliq>
                <CST>${item.cstPis}</CST>
                <vBC>${item.vProd}</vBC>
                <pPIS>${item.pPis}</pPIS>
                <vPIS>${item.vPis}</vPIS>
              </PISAliq>
            </PIS>
          ` : ''}
          ${item.cstCofins ? `
            <COFINS>
              <COFINSAliq>
                <CST>${item.cstCofins}</CST>
                <vBC>${item.vProd}</vBC>
                <pCOFINS>${item.pCofins}</pCOFINS>
                <vCOFINS>${item.vCofins}</vCOFINS>
              </COFINSAliq>
            </COFINS>
          ` : ''}
        </imposto>
      </det>
    `;
  }).join('\n');

  const vProdTotal = (itemCount * 100).toFixed(2);
  const vNFTotal = (itemCount * 105).toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35260100000000000199550010000001001000000100" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cNF>00000100</cNF>
        <natOp>Venda de producao do estabelecimento</natOp>
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
        <xNome>DISTRIBUIDORA DE HARDWARE E COMPONENTES S/A</xNome>
        <enderEmit>
          <UF>SP</UF>
          <xMun>São Paulo</xMun>
        </enderEmit>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>SUPERMERCADOS E ATACADOS PAULISTA LTDA</xNome>
        <enderDest>
          <UF>SP</UF>
          <xMun>Campinas</xMun>
        </enderDest>
      </dest>
      ${dets}
      <total>
        <ICMSTot>
          <vBC>${vProdTotal}</vBC>
          <vICMS>${(itemCount * 18).toFixed(2)}</vICMS>
          <vProd>${vProdTotal}</vProd>
          <vIPI>${(itemCount * 5).toFixed(2)}</vIPI>
          <vPIS>${(itemCount * 1.65).toFixed(2)}</vPIS>
          <vCOFINS>${(itemCount * 7.60).toFixed(2)}</vCOFINS>
          <vNF>${vNFTotal}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

// ─── SUITE 1: HIGH ITEM VOLUME STRESS BENCHMARK ──────────────────────────────
console.log('\n─── [SUITE 1] HIGH ITEM VOLUME STRESS BENCHMARK ───');

await t('STRESS 1.1: 100 items XML — zero truncation, extracts 100 items with latency < 200ms', async () => {
  const xml100 = generateSyntheticXml(100);
  const buffer = Buffer.from(xml100, 'utf-8');

  const t0 = performance.now();
  const res = await extrairDadosNfe(buffer, 'nota-100-itens.xml', mapaD8);
  const elapsed = performance.now() - t0;

  assert.equal(res.totalItens, 100, 'totalItens deve ser exatamente 100');
  assert.equal(res.itens.length, 100, 'array itens deve conter exatamente 100 itens');
  assert.equal(res.itens[0].index, 1, 'primeiro item deve ter index 1');
  assert.equal(res.itens[99].index, 100, 'último item deve ter index 100');
  assert.equal(res.itens[99].cProd, 'PROD-0100');
  assert.equal(res.resumoFinanceiro.vProdTotal, 10000);
  assert.equal(res.resumoFinanceiro.vNF, 10500);

  // Latency requirement: < 200ms
  assert.ok(
    elapsed < 200,
    `Tempo de extração de 100 itens deve ser estritamente < 200ms, mas levou ${elapsed.toFixed(2)}ms`
  );
  console.log(`      ⚡ Latência observada para 100 itens: ${elapsed.toFixed(2)}ms (meta < 200ms)`);
});

await t('STRESS 1.2: 250 items XML — zero truncation and sub-second parsing', async () => {
  const xml250 = generateSyntheticXml(250);
  const buffer = Buffer.from(xml250, 'utf-8');

  const t0 = performance.now();
  const res = await extrairDadosNfe(buffer, 'nota-250-itens.xml', mapaD8);
  const elapsed = performance.now() - t0;

  assert.equal(res.totalItens, 250);
  assert.equal(res.itens.length, 250);
  assert.equal(res.itens[249].index, 250);
  assert.ok(elapsed < 400, `250 itens deve levar < 400ms, levou ${elapsed.toFixed(2)}ms`);
  console.log(`      ⚡ Latência observada para 250 itens: ${elapsed.toFixed(2)}ms`);
});

await t('STRESS 1.3: 500 items XML — stress limit without VRAM/CPU exhaustion', async () => {
  const xml500 = generateSyntheticXml(500);
  const buffer = Buffer.from(xml500, 'utf-8');

  const t0 = performance.now();
  const res = await extrairDadosNfe(buffer, 'nota-500-itens.xml', mapaD8);
  const elapsed = performance.now() - t0;

  assert.equal(res.totalItens, 500);
  assert.equal(res.itens.length, 500);
  assert.equal(res.itens[499].index, 500);
  assert.ok(elapsed < 800, `500 itens deve levar < 800ms, levou ${elapsed.toFixed(2)}ms`);
  console.log(`      ⚡ Latência observada para 500 itens: ${elapsed.toFixed(2)}ms`);
});

// ─── SUITE 2: CORRUPTED & ADVERSARIAL NCMs ────────────────────────────────────
console.log('\n─── [SUITE 2] CORRUPTED & ADVERSARIAL NCM CODES ───');

await t('NCM 2.1: Scientific notation (Excel corruption) is strictly rejected', () => {
  const inputs = [
    '8.4713E+07',
    '8.4713e+07',
    '8.471E+07',
    '1.23E4',
    '8.4713012E+07',
    '1e7',
    '8.4713012e-02',
  ];

  for (const sci of inputs) {
    const res = normalizarNcm(sci);
    assert.equal(res.validoFormato, false, `Notação científica "${sci}" deve ser rejeitada como formato inválido`);
    assert.equal(res.d8, '', `d8 para "${sci}" deve ser vazio`);

    const sis = validarNcmSiscomex(res.d8, mapaD8);
    assert.equal(sis.valido, false, `Siscomex deve rejeitar notação científica "${sci}"`);
  }
});

await t('NCM 2.2: Strings with spaces, punctuation and padding', () => {
  // Leading and trailing spaces
  const r1 = normalizarNcm('  84713012  ');
  assert.equal(r1.d8, '84713012');
  assert.equal(r1.validoFormato, true);

  // Punctuated
  const r2 = normalizarNcm('8471.30.12');
  assert.equal(r2.d8, '84713012');
  assert.equal(r2.validoFormato, true);

  // Internal spaces
  const r3 = normalizarNcm('8471 3012');
  assert.equal(r3.d8, '84713012');
  assert.equal(r3.validoFormato, true);

  // Hyphenated
  const r4 = normalizarNcm('8471-30-12');
  assert.equal(r4.d8, '84713012');
  assert.equal(r4.validoFormato, true);
});

await t('NCM 2.3: Digit length boundary cases (0 to 10 digits)', () => {
  // 6 digits: invalid
  const r6 = normalizarNcm('847130');
  assert.equal(r6.validoFormato, false, '6 dígitos deve ser inválido');

  // 7 digits: normalized with padStart 0 -> 8 digits
  const r7 = normalizarNcm('1012100');
  assert.equal(r7.validoFormato, true, '7 dígitos deve ser completado com 0 à esquerda');
  assert.equal(r7.d8, '01012100');
  const sis7 = validarNcmSiscomex(r7.d8, mapaD8);
  assert.equal(sis7.valido, true, '01012100 é NCM oficial válido no Siscomex');

  // 8 digits: valid format
  const r8 = normalizarNcm('84713012');
  assert.equal(r8.validoFormato, true);
  assert.equal(r8.d8, '84713012');

  // 9 digits: invalid
  const r9 = normalizarNcm('847130129');
  assert.equal(r9.validoFormato, false, '9 dígitos deve ser inválido');

  // 10 digits: invalid
  const r10 = normalizarNcm('8471301200');
  assert.equal(r10.validoFormato, false, '10 dígitos deve ser inválido');

  // Empty string / null / undefined
  assert.equal(normalizarNcm('').validoFormato, false);
  assert.equal(normalizarNcm(null).validoFormato, false);
  assert.equal(normalizarNcm(undefined).validoFormato, false);
});

await t('NCM 2.4: All zeros NCM (00000000) rejected by Siscomex catalog', () => {
  const norm = normalizarNcm('00000000');
  assert.equal(norm.validoFormato, true); // formato tem 8 dígitos
  const sis = validarNcmSiscomex(norm.d8, mapaD8);
  assert.equal(sis.valido, false, 'NCM 00000000 não existe no catálogo oficial do Siscomex');
});

await t('NCM 2.5: Alphanumeric and corrupted text rejected by Siscomex', () => {
  const norm1 = normalizarNcm('INDEFINIDO');
  assert.equal(norm1.validoFormato, false);
  assert.equal(norm1.d8, '');
  assert.equal(validarNcmSiscomex(norm1.d8, mapaD8).valido, false);

  const norm2 = normalizarNcm('NCM-INVALIDO');
  assert.equal(norm2.validoFormato, false);
  assert.equal(norm2.d8, '');
  assert.equal(validarNcmSiscomex(norm2.d8, mapaD8).valido, false);

  // Even if 7 digits with trailing letter pads to 8 digits, Siscomex catalog strictly rejects it
  const norm3 = normalizarNcm('8471301A');
  const sis3 = validarNcmSiscomex(norm3.d8, mapaD8);
  assert.equal(sis3.valido, false, 'NCM resultante não pode ser validado no Siscomex');
});

await t('NCM 2.6: Evaluating sensitivity for corrupted NCM in extracted item', () => {
  const itemCorrompido = {
    index: 1,
    cProd: 'TEST-CORRUPT',
    xProd: 'Item com NCM corrompido',
    ncm: '8.4713E+07',
    ncmValidoSiscomex: false,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 10,
    vProd: 10,
    tributos: {},
  };

  const sens = avaliarSensibilidadeFiscal(itemCorrompido);
  assert.equal(sens.sensivelParaAuditoria, true, 'Item com NCM corrompido DEVE ser sensível');
  assert.ok(
    sens.motivosSensibilidade.includes('NCM_INVALIDO_SISCOMEX'),
    'Motivo deve incluir NCM_INVALIDO_SISCOMEX'
  );
});

// ─── SUITE 3: MALFORMED XML & SYNTACTIC BOUNDARIES ───────────────────────────
console.log('\n─── [SUITE 3] MALFORMED XML & SYNTACTIC BOUNDARIES ───');

await t('MALF 3.1: Completely empty buffer (0 bytes) throws ARQUIVO_VAZIO (400)', async () => {
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.alloc(0), 'nota.xml'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'ARQUIVO_VAZIO' && err.statusCode === 400
  );
});

await t('MALF 3.2: Whitespace-only buffer throws ARQUIVO_VAZIO (400)', async () => {
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from('   \n\t  \r\n   '), 'nota.xml'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'ARQUIVO_VAZIO' && err.statusCode === 400
  );
});

await t('MALF 3.3: Syntactically broken XML tags throw XML_MALFORMADO (400)', async () => {
  const broken = '<nfeProc><NFe><infNFe><ide><nNF>1</ide></infNFe></NFe>';
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from(broken), 'nota.xml'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'XML_MALFORMADO' && err.statusCode === 400
  );
});

await t('MALF 3.4: Truncated XML buffer throws XML_MALFORMADO (400)', async () => {
  const truncated = '<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe123"><ide>';
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from(truncated), 'nota.xml'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'XML_MALFORMADO' && err.statusCode === 400
  );
});

await t('MALF 3.5: Non-NF-e XML document throws NFE_TAGS_AUSENTES (400)', async () => {
  const nonNfe = '<?xml version="1.0"?><catalogo><produto><id>1</id><nome>Teclado</nome></produto></catalogo>';
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from(nonNfe), 'documento.xml'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'NFE_TAGS_AUSENTES' && err.statusCode === 400
  );
});

await t('MALF 3.6: XML with Byte Order Mark (BOM) UTF-8 is stripped cleanly', async () => {
  const xmlWithBom = '\uFEFF' + generateSyntheticXml(1);
  const res = await extrairDadosNfe(Buffer.from(xmlWithBom, 'utf-8'), 'nota-bom.xml', mapaD8);
  assert.equal(res.totalItens, 1);
  assert.equal(res.itens[0].cProd, 'PROD-0001');
});

await t('MALF 3.7: XML with prefixed namespace (nfe:nfeProc, nfe:NFe, nfe:infNFe)', async () => {
  const rawXml = generateSyntheticXml(1);
  const prefixed = rawXml
    .replace('<nfeProc', '<nfe:nfeProc xmlns:nfe="http://www.portalfiscal.inf.br/nfe"')
    .replace('</nfeProc>', '</nfe:nfeProc>')
    .replace('<NFe>', '<nfe:NFe>')
    .replace('</NFe>', '</nfe:NFe>')
    .replace('<infNFe', '<nfe:infNFe')
    .replace('</infNFe>', '</nfe:infNFe>');

  const res = await extrairDadosNfe(Buffer.from(prefixed, 'utf-8'), 'nota-prefix.xml', mapaD8);
  assert.equal(res.totalItens, 1);
  assert.equal(res.itens[0].cProd, 'PROD-0001');
});

// ─── SUITE 4: UNSUPPORTED FORMATS & PDF CORNERS ──────────────────────────────
console.log('\n─── [SUITE 4] UNSUPPORTED FORMATS & BOUNDARIES ───');

await t('BOUND 4.1: Unsupported extension (.csv, .txt, .zip) throws FORMATO_INVALIDO (400)', async () => {
  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from('col1,col2\nval1,val2'), 'planilha.csv'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'FORMATO_INVALIDO' && err.statusCode === 400
  );

  await assert.rejects(
    async () => extrairDadosNfe(Buffer.from('texto qualquer'), 'arquivo.txt'),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'FORMATO_INVALIDO' && err.statusCode === 400
  );
});

await t('BOUND 4.2: Digital PDF without text layer (scanned DANFE) throws PDF_SEM_TEXTO (422)', async () => {
  // Creates a minimal PDF header with no text stream
  const minimalPdfWithoutText = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF'
  );

  await assert.rejects(
    async () => extrairDadosNfe(minimalPdfWithoutText, 'danfe-escaneado.pdf', mapaD8),
    (err) => err instanceof FiscalExtractionError && err.codigo === 'PDF_SEM_TEXTO' && err.statusCode === 422
  );
});

// ─── SUITE 5: LIVE HTTP ENDPOINT STRESS & 10MB LIMIT VERIFICATION ────────────
console.log('\n─── [SUITE 5] LIVE HTTP ENDPOINT OPAQUE-BOX VERIFICATION ───');

let serverOnline = false;
try {
  const ping = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', { method: 'POST' });
  serverOnline = true;
} catch {
  console.log('      [INFO] Servidor Next.js não está acessível no localhost:3000. Pulando testes live HTTP.');
}

if (serverOnline) {
  await t('HTTP 5.1: Missing multipart/form-data content-type returns 400 CONTENT_TYPE_INVALIDO', async () => {
    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'none' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.codigo, 'CONTENT_TYPE_INVALIDO');
  });

  await t('HTTP 5.2: Missing file field in formData returns 400 ARQUIVO_AUSENTE', async () => {
    const form = new FormData();
    form.append('regime', 'Regime Regular');
    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.codigo, 'ARQUIVO_AUSENTE');
  });

  await t('HTTP 5.3: Empty 0-byte file in formData returns 400 ARQUIVO_VAZIO', async () => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(0)], { type: 'application/xml' }), 'vazio.xml');
    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.codigo, 'ARQUIVO_VAZIO');
  });

  await t('HTTP 5.4: Oversized file (>10MB) returns 413 TAMANHO_EXCEDIDO', async () => {
    const form = new FormData();
    // 10MB + 1024 bytes
    const oversizedBytes = new Uint8Array(10 * 1024 * 1024 + 1024);
    form.append('file', new Blob([oversizedBytes], { type: 'application/xml' }), 'nota-gigante.xml');

    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 413, 'Oversized file (>10MB) deve retornar status HTTP 413');
    const body = await res.json();
    assert.equal(body.codigo, 'TAMANHO_EXCEDIDO');
    assert.equal(body.limiteMaximoBytes, 10485760);
    assert.ok(body.tamanhoRecebidoBytes > 10485760);
  });

  await t('HTTP 5.5: Unsupported file extension (.exe) returns 400 FORMATO_INVALIDO', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('payload executavel')], { type: 'application/octet-stream' }), 'malware.exe');
    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.codigo, 'FORMATO_INVALIDO');
  });

  await t('HTTP 5.6: Malformed XML buffer returns 400 XML_MALFORMADO', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('<nfeProc><invalido')], { type: 'application/xml' }), 'quebrado.xml');
    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.codigo, 'XML_MALFORMADO');
  });

  await t('HTTP 5.7: Live 100 items XML over HTTP returns 200, 100 items and < 200ms extraction header', async () => {
    const xml100 = generateSyntheticXml(100);
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(xml100, 'utf-8')], { type: 'application/xml' }), 'nfe-100.xml');

    const t0 = performance.now();
    const res = await fetch('http://localhost:3000/api/auditoria-entrada/extrair', {
      method: 'POST',
      body: form,
    });
    const networkElapsed = performance.now() - t0;

    assert.equal(res.status, 200);
    const extractionHeader = res.headers.get('x-extraction-time-ms');
    assert.ok(extractionHeader, 'Header X-Extraction-Time-Ms deve estar presente');
    const extractionMs = parseInt(extractionHeader, 10);
    assert.ok(extractionMs < 200, `Extração determinística no servidor deve ser < 200ms, foi ${extractionMs}ms`);

    const data = await res.json();
    assert.equal(data.totalItens, 100);
    assert.equal(data.itens.length, 100);
    assert.equal(data.tipoDocumento, 'XML');
    console.log(`      ⚡ HTTP Round-Trip: ${networkElapsed.toFixed(2)}ms (Server extraction: ${extractionMs}ms)`);
  });

  await t('HTTP 5.8: Live endpoint /api/auditoria-entrada?action=extrair equivalence', async () => {
    const xml10 = generateSyntheticXml(10);
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(xml10, 'utf-8')], { type: 'application/xml' }), 'nfe-10.xml');

    const res = await fetch('http://localhost:3000/api/auditoria-entrada?action=extrair', {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalItens, 10);
  });
}

// ─── SUITE 6: REPETITIVE LOAD & STABILITY ────────────────────────────────────
console.log('\n─── [SUITE 6] REPETITIVE LOAD & STABILITY ───');

await t('STABILITY 6.1: 50 sequential extractions of 20-item invoice — no memory leak or slowdown', async () => {
  const xml20 = generateSyntheticXml(20);
  const buf20 = Buffer.from(xml20, 'utf-8');

  const times = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    const res = await extrairDadosNfe(buf20, 'loop.xml', mapaD8);
    times.push(performance.now() - t0);
    assert.equal(res.totalItens, 20);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  assert.ok(avgTime < 15, `Tempo médio (${avgTime.toFixed(2)}ms) deve ser ultra-rápido (<15ms)`);
  console.log(`      ⚡ 50 iterações: Média = ${avgTime.toFixed(2)}ms, Máx = ${maxTime.toFixed(2)}ms`);
});

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('  TODOS OS TESTES ADVERSARIAIS APROVADOS COM SUCESSO ✓');
console.log('══════════════════════════════════════════════════════════════════════\n');
