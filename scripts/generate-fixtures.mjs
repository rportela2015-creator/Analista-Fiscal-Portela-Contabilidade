import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('tests/fixtures', { recursive: true });

function createNFeXml({ emitente, destinatario, itens, natOp = 'VENDA DE MERCADORIA' }) {
  let vProdTotal = 0;
  let vICMSTotal = 0;
  let vIPITotal = 0;
  let vPISTotal = 0;
  let vCOFINSTotal = 0;

  const detXml = itens.map((it, idx) => {
    const nItem = idx + 1;
    const vProd = it.vProd ?? (it.qCom * it.vUnCom);
    vProdTotal += vProd;

    let impostoXml = '<imposto>';

    // ICMS
    if (it.icms) {
      if (it.icms.csosn) {
        impostoXml += `
          <ICMS>
            <ICMSSN${it.icms.csosn}>
              <orig>${it.icms.orig ?? 0}</orig>
              <CSOSN>${it.icms.csosn}</CSOSN>
            </ICMSSN${it.icms.csosn}>
          </ICMS>`;
      } else if (it.icms.cst === '00') {
        const vICMS = (vProd * (it.icms.pICMS ?? 18)) / 100;
        vICMSTotal += vICMS;
        impostoXml += `
          <ICMS>
            <ICMS00>
              <orig>${it.icms.orig ?? 0}</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>${vProd.toFixed(2)}</vBC>
              <pICMS>${it.icms.pICMS ?? 18}.00</pICMS>
              <vICMS>${vICMS.toFixed(2)}</vICMS>
            </ICMS00>
          </ICMS>`;
      } else if (it.icms.cst === '10' || it.icms.cst === '70') {
        const vICMS = (vProd * (it.icms.pICMS ?? 18)) / 100;
        const vBCST = it.icms.vBCST ?? (vProd * 1.4);
        const vICMSST = it.icms.vICMSST ?? (vBCST * 0.18 - vICMS);
        vICMSTotal += vICMS;
        impostoXml += `
          <ICMS>
            <ICMS${it.icms.cst}>
              <orig>${it.icms.orig ?? 0}</orig>
              <CST>${it.icms.cst}</CST>
              <modBC>3</modBC>
              <vBC>${vProd.toFixed(2)}</vBC>
              <pICMS>${it.icms.pICMS ?? 18}.00</pICMS>
              <vICMS>${vICMS.toFixed(2)}</vICMS>
              <modBCST>4</modBCST>
              <pMVAST>${it.icms.pMVAST ?? '40.00'}</pMVAST>
              <vBCST>${vBCST.toFixed(2)}</vBCST>
              <pICMSST>${it.icms.pICMSST ?? '18.00'}</pICMSST>
              <vICMSST>${vICMSST.toFixed(2)}</vICMSST>
            </ICMS${it.icms.cst}>
          </ICMS>`;
      } else if (it.icms.cst === '60') {
        impostoXml += `
          <ICMS>
            <ICMS60>
              <orig>${it.icms.orig ?? 0}</orig>
              <CST>60</CST>
              <vBCSTRet>${vProd.toFixed(2)}</vBCSTRet>
              <vICMSSTRet>${(vProd * 0.18).toFixed(2)}</vICMSSTRet>
            </ICMS60>
          </ICMS>`;
      }
    }

    // IPI
    if (it.ipi) {
      const vIPI = (vProd * (it.ipi.pIPI ?? 10)) / 100;
      vIPITotal += vIPI;
      impostoXml += `
        <IPI>
          <cEnq>999</cEnq>
          <IPITrib>
            <CST>${it.ipi.cst ?? '50'}</CST>
            <vBC>${vProd.toFixed(2)}</vBC>
            <pIPI>${it.ipi.pIPI ?? 10}.00</pIPI>
            <vIPI>${vIPI.toFixed(2)}</vIPI>
          </IPITrib>
        </IPI>`;
    }

    // PIS
    if (it.pis) {
      const vPIS = (vProd * (it.pis.pPIS ?? 1.65)) / 100;
      vPISTotal += vPIS;
      impostoXml += `
        <PIS>
          <PISAliq>
            <CST>${it.pis.cst ?? '01'}</CST>
            <vBC>${vProd.toFixed(2)}</vBC>
            <pPIS>${it.pis.pPIS ?? 1.65}</pPIS>
            <vPIS>${vPIS.toFixed(2)}</vPIS>
          </PISAliq>
        </PIS>`;
    }

    // COFINS
    if (it.cofins) {
      const vCOFINS = (vProd * (it.cofins.pCOFINS ?? 7.6)) / 100;
      vCOFINSTotal += vCOFINS;
      impostoXml += `
        <COFINS>
          <COFINSAliq>
            <CST>${it.cofins.cst ?? '01'}</CST>
            <vBC>${vProd.toFixed(2)}</vBC>
            <pCOFINS>${it.cofins.pCOFINS ?? 7.60}</pCOFINS>
            <vCOFINS>${vCOFINS.toFixed(2)}</vCOFINS>
          </COFINSAliq>
        </COFINS>`;
    }

    impostoXml += '</imposto>';

    return `
      <det nItem="${nItem}">
        <prod>
          <cProd>${it.cProd ?? `PRD-${nItem}`}</cProd>
          <cEAN>${it.cEAN ?? 'SEM GTIN'}</cEAN>
          <xProd>${it.xProd}</xProd>
          <NCM>${it.ncm}</NCM>
          ${it.cest ? `<CEST>${it.cest}</CEST>` : ''}
          <CFOP>${it.cfop ?? '5102'}</CFOP>
          <uCom>${it.uCom ?? 'UN'}</uCom>
          <qCom>${it.qCom.toFixed(4)}</qCom>
          <vUnCom>${it.vUnCom.toFixed(4)}</vUnCom>
          <vProd>${vProd.toFixed(2)}</vProd>
          <cEANTrib>${it.cEAN ?? 'SEM GTIN'}</cEANTrib>
          <uTrib>${it.uCom ?? 'UN'}</uTrib>
          <qTrib>${it.qCom.toFixed(4)}</qTrib>
          <vUnTrib>${it.vUnCom.toFixed(4)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
        ${impostoXml}
      </det>`;
  }).join('\n');

  const vNF = vProdTotal + vIPITotal;

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35261111222333000181550010000012341234567890" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cNF>12345678</cNF>
        <natOp>${natOp}</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>1234</nNF>
        <dhEmi>2026-11-09T10:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>${emitente.uf === destinatario.uf ? 1 : 2}</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>0</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>1.0</verProc>
      </ide>
      <emit>
        <CNPJ>${emitente.cnpj}</CNPJ>
        <xNome>${emitente.nome}</xNome>
        <enderEmit>
          <xLgr>AV EXEMPLO</xLgr>
          <nro>100</nro>
          <xBairro>BAIRRO</xBairro>
          <cMun>3550308</cMun>
          <xMun>MUNICIPIO</xMun>
          <UF>${emitente.uf}</UF>
          <CEP>01000000</CEP>
        </enderEmit>
        <IE>${emitente.ie ?? '110042490114'}</IE>
        <CRT>${emitente.crt ?? '3'}</CRT>
      </emit>
      <dest>
        <CNPJ>${destinatario.cnpj}</CNPJ>
        <xNome>${destinatario.nome}</xNome>
        <enderDest>
          <xLgr>RUA DESTINO</xLgr>
          <nro>200</nro>
          <xBairro>BAIRRO</xBairro>
          <cMun>3550308</cMun>
          <xMun>SAO PAULO</xMun>
          <UF>${destinatario.uf}</UF>
          <CEP>04538133</CEP>
        </enderDest>
        <IE>${destinatario.ie ?? '111222333444'}</IE>
      </dest>
      ${detXml}
      <total>
        <ICMSTot>
          <vBC>${vProdTotal.toFixed(2)}</vBC>
          <vICMS>${vICMSTotal.toFixed(2)}</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${vProdTotal.toFixed(2)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>${vIPITotal.toFixed(2)}</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>${vPISTotal.toFixed(2)}</vPIS>
          <vCOFINS>${vCOFINSTotal.toFixed(2)}</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${vNF.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

const emitentePadrao = { cnpj: '11222333000181', nome: 'FORNECEDOR MATRIZ SP LTDA', uf: 'SP', crt: '3' };
const destinatarioPadrao = { cnpj: '06990590000123', nome: 'ADQUIRENTE PAULISTA S.A.', uf: 'SP' };

// 1. multi-5.xml (5 itens)
const catalogo5 = [
  { cProd: 'NT-14', xProd: 'NOTEBOOK DELL 14 POL I7', ncm: '84713012', cfop: '5102', qCom: 2, vUnCom: 4000, icms: { cst: '00', pICMS: 18 }, ipi: { cst: '50', pIPI: 10 }, pis: { cst: '01', pPIS: 1.65 }, cofins: { cst: '01', pCOFINS: 7.6 } },
  { cProd: 'CAD-01', xProd: 'CADEIRA GIRATORIA ERGONOMICA', ncm: '94013000', cfop: '5102', qCom: 5, vUnCom: 800, icms: { cst: '00', pICMS: 18 }, pis: { cst: '01', pPIS: 1.65 }, cofins: { cst: '01', pCOFINS: 7.6 } },
  { cProd: 'MOU-02', xProd: 'MOUSE OPTICO SEM FIO USB', ncm: '84716053', cfop: '5102', qCom: 10, vUnCom: 90, icms: { cst: '00', pICMS: 18 }, pis: { cst: '01', pPIS: 1.65 }, cofins: { cst: '01', pCOFINS: 7.6 } },
  { cProd: 'MON-27', xProd: 'MONITOR GAMER LED 27 POL', ncm: '85285200', cfop: '5102', qCom: 3, vUnCom: 1500, icms: { cst: '00', pICMS: 18 }, pis: { cst: '01', pPIS: 1.65 }, cofins: { cst: '01', pCOFINS: 7.6 } },
  { cProd: 'TEC-03', xProd: 'TECLADO MECANICO SWITCH BLUE', ncm: '84716052', cfop: '5102', qCom: 5, vUnCom: 250, icms: { cst: '00', pICMS: 18 }, pis: { cst: '01', pPIS: 1.65 }, cofins: { cst: '01', pCOFINS: 7.6 } },
];
writeFileSync('tests/fixtures/nfe-multi-5.xml', createNFeXml({ emitente: emitentePadrao, destinatario: destinatarioPadrao, itens: catalogo5 }));

// 2. multi-15.xml (exatamente 15 itens)
const catalogo15 = Array.from({ length: 15 }, (_, i) => ({
  cProd: `ITEM-${i + 1}`,
  xProd: `PRODUTO DE TI E HARDWARE CODIGO ${i + 1}`,
  ncm: i % 2 === 0 ? '84713012' : '84716053',
  cfop: '5102',
  qCom: i + 1,
  vUnCom: 100 * (i + 1),
  icms: { cst: '00', pICMS: 18 },
  pis: { cst: '01', pPIS: 1.65 },
  cofins: { cst: '01', pCOFINS: 7.6 }
}));
writeFileSync('tests/fixtures/nfe-multi-15.xml', createNFeXml({ emitente: emitentePadrao, destinatario: destinatarioPadrao, itens: catalogo15 }));

// 3. multi-30.xml (30 itens - prova eliminação do corte de 15)
const catalogo30 = Array.from({ length: 30 }, (_, i) => ({
  cProd: `PROD-30-${i + 1}`,
  xProd: `EQUIPAMENTO ELETRONICO MODULO ${i + 1}`,
  ncm: i % 3 === 0 ? '84713012' : (i % 3 === 1 ? '94013000' : '85285200'),
  cfop: '5102',
  qCom: 1,
  vUnCom: 50 + i * 10,
  icms: { cst: '00', pICMS: 18 },
  pis: { cst: '01', pPIS: 1.65 },
  cofins: { cst: '01', pCOFINS: 7.6 }
}));
writeFileSync('tests/fixtures/nfe-multi-30.xml', createNFeXml({ emitente: emitentePadrao, destinatario: destinatarioPadrao, itens: catalogo30 }));

// 4. multi-55.xml (55 itens - boundary 50+)
const catalogo55 = Array.from({ length: 55 }, (_, i) => ({
  cProd: `SKU-${i + 1}`,
  xProd: `PECA INDUSTRIAL COMPONENTE ${i + 1}`,
  ncm: '84713012',
  cfop: '5102',
  qCom: 2,
  vUnCom: 200,
  icms: { cst: '00', pICMS: 18 },
  pis: { cst: '01', pPIS: 1.65 },
  cofins: { cst: '01', pCOFINS: 7.6 }
}));
writeFileSync('tests/fixtures/nfe-multi-55.xml', createNFeXml({ emitente: emitentePadrao, destinatario: destinatarioPadrao, itens: catalogo55 }));

// 5. malformed-ncm.xml (7 dígitos, inexistente, notação científica, válido)
const catalogoMalformed = [
  { cProd: 'MALF-01', xProd: 'ANIMAL VIVO REPRODUTOR PURA RACA', ncm: '1012100', cfop: '5102', qCom: 1, vUnCom: 10000, icms: { cst: '00', pICMS: 18 } },
  { cProd: 'MALF-02', xProd: 'MERCADORIA COM CODIGO INEXISTENTE', ncm: '99999999', cfop: '5102', qCom: 1, vUnCom: 500, icms: { cst: '00', pICMS: 18 } },
  { cProd: 'MALF-03', xProd: 'COMPUTADOR IMPORTADO NOTACAO CIENTIFICA', ncm: '8.4713E+07', cfop: '5102', qCom: 1, vUnCom: 3000, icms: { cst: '00', pICMS: 18 } },
  { cProd: 'MALF-04', xProd: 'NOTEBOOK PESSOAL PORTATIL', ncm: '84713012', cfop: '5102', qCom: 1, vUnCom: 4000, icms: { cst: '00', pICMS: 18 } },
];
writeFileSync('tests/fixtures/nfe-malformed-ncm.xml', createNFeXml({ emitente: emitentePadrao, destinatario: destinatarioPadrao, itens: catalogoMalformed }));

// 6. simples-csosn102.xml (Simples Nacional, CSOSN 102 sem permissão de crédito)
const emitenteSimples = { cnpj: '22333444000199', nome: 'MICROEMPRESA ME SIMPLES NACIONAL', uf: 'SP', crt: '1' };
const catalogoSimples = [
  { cProd: 'SIMP-01', xProd: 'SUPRIMENTO DE ESCRITORIO DIVERSO', ncm: '84713012', cfop: '5102', qCom: 10, vUnCom: 150, icms: { csosn: '102', orig: 0 } },
];
writeFileSync('tests/fixtures/nfe-simples-csosn102.xml', createNFeXml({ emitente: emitenteSimples, destinatario: destinatarioPadrao, itens: catalogoSimples }));

// 7. interstate-st.xml (Interestadual PR -> SP com CEST e ST)
const emitentePR = { cnpj: '33444555000111', nome: 'CERVEJARIA DO PARANA S.A.', uf: 'PR', crt: '3' };
const catalogoInterstateST = [
  { cProd: 'CERV-01', xProd: 'CERVEJA PURO MALTE LAGER 600ML', ncm: '22030000', cest: '0300100', cfop: '6102', qCom: 100, vUnCom: 8.50, icms: { cst: '10', orig: 0, pICMS: 12, pMVAST: '50.00', vBCST: 1275.00, pICMSST: '18.00', vICMSST: 127.50 }, pis: { cst: '04' }, cofins: { cst: '04' } },
];
writeFileSync('tests/fixtures/nfe-interstate-st.xml', createNFeXml({ emitente: emitentePR, destinatario: destinatarioPadrao, itens: catalogoInterstateST, natOp: 'VENDA INTERESTADUAL COM ST' }));

// 8. interstate-st-nocest.xml (Interestadual PR -> SP com ST mas SEM CEST)
const catalogoInterstateNoCest = [
  { cProd: 'PNEU-01', xProd: 'PNEU RADIAL AUTOMOTIVO ARO 15', ncm: '40111000', cfop: '6102', qCom: 4, vUnCom: 350.00, icms: { cst: '10', orig: 0, pICMS: 12, pMVAST: '45.00', vBCST: 2030.00, pICMSST: '18.00', vICMSST: 197.40 } },
];
writeFileSync('tests/fixtures/nfe-interstate-st-nocest.xml', createNFeXml({ emitente: emitentePR, destinatario: destinatarioPadrao, itens: catalogoInterstateNoCest, natOp: 'VENDA INTERESTADUAL SUJEITA A ST' }));

// 9. missing-optional-tags.xml (Sem CEST, sem IPI, sem PIS/COFINS)
const catalogoMinimo = [
  { cProd: 'LIV-01', xProd: 'LIVRO DIDATICO IMUNE TRIBUTACAO', ncm: '49019900', cfop: '5102', qCom: 1, vUnCom: 80.00, icms: { cst: '00', pICMS: 0 } },
];
writeFileSync('tests/fixtures/nfe-missing-optional-tags.xml', createNFeXml({ emitente: emitentePadrao, destinatario: destinatarioPadrao, itens: catalogoMinimo }));

// 10. corrupted.xml (XML truncado / corrompido)
writeFileSync('tests/fixtures/nfe-corrupted.xml', '<?xml version="1.0"?><nfeProc><NFe><infNFe><invalido>');

console.log('Todos os 10 arquivos de fixtures gerados em tests/fixtures/ ✓');
