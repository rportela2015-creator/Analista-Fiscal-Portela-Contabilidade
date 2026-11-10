import assert from 'node:assert/strict';

// Test of proposed logic for lib/extrator-nfe.ts:
function proposedExtrairTributosXml(imp) {
  const tributos = {};
  if (!imp || typeof imp !== 'object') return tributos;

  // 1. ICMS
  if (imp.ICMS && typeof imp.ICMS === 'object') {
    const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
    const icmsGroup = subKey ? imp.ICMS[subKey] : undefined;
    if (icmsGroup && typeof icmsGroup === 'object') {
      if (icmsGroup.CST !== undefined) tributos.cstIcms = String(icmsGroup.CST).padStart(2, '0');
      if (icmsGroup.CSOSN !== undefined) tributos.csosn = String(icmsGroup.CSOSN).padStart(3, '0');
      if (icmsGroup.orig !== undefined) tributos.orig = Number(icmsGroup.orig);
      tributos.vBC = icmsGroup.vBC !== undefined ? Number(icmsGroup.vBC) : undefined;
      tributos.pICMS = icmsGroup.pICMS !== undefined ? Number(icmsGroup.pICMS) : undefined;
      tributos.vICMS = icmsGroup.vICMS !== undefined ? Number(icmsGroup.vICMS) : undefined;
    }
  }

  // 3. PIS
  if (imp.PIS && typeof imp.PIS === 'object') {
    const subKey = Object.keys(imp.PIS).find((k) => !k.startsWith('@_'));
    const pisGroup = subKey ? imp.PIS[subKey] : undefined;
    if (pisGroup && typeof pisGroup === 'object') {
      if (pisGroup.CST !== undefined) tributos.cstPis = String(pisGroup.CST).padStart(2, '0');
      tributos.vBCPis = pisGroup.vBC !== undefined ? Number(pisGroup.vBC) : undefined;
      tributos.pPIS = pisGroup.pPIS !== undefined ? Number(pisGroup.pPIS) : undefined;
      tributos.vPIS = pisGroup.vPIS !== undefined ? Number(pisGroup.vPIS) : undefined;
    }
  }

  // 4. COFINS
  if (imp.COFINS && typeof imp.COFINS === 'object') {
    const subKey = Object.keys(imp.COFINS).find((k) => !k.startsWith('@_'));
    const cofinsGroup = subKey ? imp.COFINS[subKey] : undefined;
    if (cofinsGroup && typeof cofinsGroup === 'object') {
      if (cofinsGroup.CST !== undefined) tributos.cstCofins = String(cofinsGroup.CST).padStart(2, '0');
      tributos.vBCCofins = cofinsGroup.vBC !== undefined ? Number(cofinsGroup.vBC) : undefined;
      tributos.pCOFINS = cofinsGroup.pCOFINS !== undefined ? Number(cofinsGroup.pCOFINS) : undefined;
      tributos.vCOFINS = cofinsGroup.vCOFINS !== undefined ? Number(cofinsGroup.vCOFINS) : undefined;
    }
  }

  return tributos;
}

// Test case 1: imp with attribute appearing first in keys
const impWithAttrFirst = {
  ICMS: {
    '@_xmlns': 'http://www.portalfiscal.inf.br/nfe',
    ICMS00: { CST: '00', orig: '0', vBC: 1000, pICMS: 18, vICMS: 180 }
  },
  PIS: {
    '@_versao': '4.00',
    PISAliq: { CST: '01', vBC: 1000, pPIS: 1.65, vPIS: 16.5 }
  },
  COFINS: {
    '@_versao': '4.00',
    COFINSAliq: { CST: '01', vBC: 1000, pCOFINS: 7.6, vCOFINS: 76 }
  }
};

const res1 = proposedExtrairTributosXml(impWithAttrFirst);
assert.equal(res1.cstIcms, '00');
assert.equal(res1.vICMS, 180);
assert.equal(res1.cstPis, '01');
assert.equal(res1.vPIS, 16.5);
assert.equal(res1.cstCofins, '01');
assert.equal(res1.vCOFINS, 76);
console.log('Test 1 Passed: Attribute collision correctly resolved in extrator-nfe.ts logic');

// Test case 2: imp without attributes (clean)
const impClean = {
  ICMS: {
    ICMSSN101: { CSOSN: '101', orig: '0' }
  }
};
const res2 = proposedExtrairTributosXml(impClean);
assert.equal(res2.csosn, '101');
console.log('Test 2 Passed: Standard clean structure preserved');

// Test case 3: empty imp
const res3 = proposedExtrairTributosXml({});
assert.deepEqual(res3, {});
console.log('Test 3 Passed: Empty imp safely handled');

// Test case 4: Proposed route.ts logic with >15 items (e.g. 35 items)
const mock35Items = Array.from({ length: 35 }, (_, i) => ({
  prod: { cProd: `P${i+1}`, xProd: `Item ${i+1}`, NCM: '84713012', CFOP: '5102', vProd: 100 },
  imposto: {}
}));

// Route logic without .slice(0, 15)
const detExtraido = mock35Items.map((d) => ({
  cProd: d.prod?.cProd,
  xProd: d.prod?.xProd,
  NCM: d.prod?.NCM,
  CEST: d.prod?.CEST,
  CFOP: d.prod?.CFOP,
  vProd: d.prod?.vProd,
  tributosFornecedor: proposedExtrairTributosXml(d.imposto)
}));

const resumo = {
  emit: { cnpj: '123' },
  dest: { cnpj: '456' },
  totalItensNaNota: mock35Items.length,
  itensAuditados: mock35Items.length,
  itens: detExtraido
};

assert.equal(resumo.totalItensNaNota, 35);
assert.equal(resumo.itensAuditados, 35);
assert.equal(resumo.itens.length, 35);
console.log('Test 4 Passed: 35 items parsed with zero truncation in route.ts logic');

console.log('\nALL UNIT CHECKS PASSED SUCCESSFULLY!');
