import assert from 'node:assert/strict';

// Direct simulation of how JavaScript enumerates keys when an attribute is first:
const impSimulated = {
  ICMS: {
    '@_xmlns': 'http://www.portalfiscal.inf.br/nfe',
    'ICMS00': {
      orig: '0',
      CST: '00',
      vBC: '100.00',
      pICMS: '18.00',
      vICMS: '18.00'
    }
  },
  PIS: {
    '@_versao': '4.00',
    'PISAliq': {
      CST: '01',
      vBC: '100.00',
      pPIS: '1.65',
      vPIS: '1.65'
    }
  },
  COFINS: {
    '@_versao': '4.00',
    'COFINSAliq': {
      CST: '01',
      vBC: '100.00',
      pCOFINS: '7.60',
      vCOFINS: '7.60'
    }
  }
};

console.log('--- Current vulnerable implementation ---');
{
  const tributos = {};
  // ICMS
  if (impSimulated.ICMS && typeof impSimulated.ICMS === 'object') {
    const subKey = Object.keys(impSimulated.ICMS)[0];
    const icmsGroup = impSimulated.ICMS[subKey];
    console.log('ICMS subKey grabbed:', subKey);
    console.log('icmsGroup type:', typeof icmsGroup);
    if (icmsGroup && typeof icmsGroup === 'object') {
      if (icmsGroup.CST !== undefined) tributos.cstIcms = String(icmsGroup.CST);
    }
  }
  console.log('Resulting tributos.cstIcms:', tributos.cstIcms); // Will be undefined!
}

console.log('\n--- Proposed robust implementation ---');
{
  const tributos = {};
  // ICMS
  if (impSimulated.ICMS && typeof impSimulated.ICMS === 'object') {
    const subKey = Object.keys(impSimulated.ICMS).find((k) => !k.startsWith('@_'));
    const icmsGroup = subKey ? impSimulated.ICMS[subKey] : undefined;
    console.log('ICMS subKey grabbed:', subKey);
    console.log('icmsGroup type:', typeof icmsGroup);
    if (icmsGroup && typeof icmsGroup === 'object') {
      if (icmsGroup.CST !== undefined) tributos.cstIcms = String(icmsGroup.CST);
    }
  }
  console.log('Resulting tributos.cstIcms:', tributos.cstIcms); // '00'!
}
