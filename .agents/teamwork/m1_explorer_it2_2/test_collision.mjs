import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'det',
  trimValues: true,
  parseTagValue: false,
});

const samples = [
  '<ICMS @_custom="1" foo="bar"><ICMS00><CST>00</CST></ICMS00></ICMS>',
  '<ICMS xmlns="http://test"><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS>',
  '<ICMS versao="4.00"><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS>',
  '<ICMS id="1" versao="4.00"><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS>',
  '<ICMS><ICMS00 versao="4.00"><orig>0</orig><CST>00</CST></ICMS00></ICMS>',
];

for (const s of samples) {
  const p = parser.parse(s);
  const keys = Object.keys(p.ICMS);
  console.log('XML:', s);
  console.log('Keys:', keys);
  console.log('Keys[0]:', keys[0]);
  console.log('Filtered:', keys.find(k => !k.startsWith('@_')));
  console.log('---');
}
