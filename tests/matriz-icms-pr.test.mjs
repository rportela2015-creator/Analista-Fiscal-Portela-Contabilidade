/**
 * Suíte de Testes: Matriz Normativa Bitemporal do ICMS/PR e Parser NT 2026.008 / NT 2025.002
 * Sub-Etapa 18.1 (Passo 1 de 5)
 */

import assert from 'node:assert/strict';
import {
  resolverAliquotaPrBitemporal,
  verificarExclusaoStPr,
  obterParametrosSimplesPr,
} from '../lib/engine/matriz-icms-pr.ts';
import { extrairDadosXmlNfe } from '../lib/extrator-nfe.ts';

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

// -----------------------------------------------------------------------------
// 1. ALÍQUOTA MODAL BITEMPORAL PR
// -----------------------------------------------------------------------------
t('1.1 Alíquota Modal PR antes da Lei 21.850/2023 (19% até 17/03/2024)', () => {
  const res = resolverAliquotaPrBitemporal('84713012', '2024-03-17');
  assert.equal(res.aliquotaIcmsPct, 19.0);
  assert.equal(res.aliquotaFecopPct, 0);
  assert.equal(res.aliquotaTotalPct, 19.0);
  assert.equal(res.sujeitoFecop, false);
  assert.equal(res.tipoAliquota, 'modal');
});

t('1.2 Alíquota Modal PR a partir da Lei 21.850/2023 (19,5% a partir de 18/03/2024)', () => {
  const res = resolverAliquotaPrBitemporal('84713012', '2024-03-18');
  assert.equal(res.aliquotaIcmsPct, 19.5);
  assert.equal(res.aliquotaFecopPct, 0);
  assert.equal(res.aliquotaTotalPct, 19.5);
  assert.equal(res.tipoAliquota, 'modal');
});

t('1.3 Alíquota Modal PR histórica antiga (18% em 2022)', () => {
  const res = resolverAliquotaPrBitemporal('84713012', '2022-05-10');
  assert.equal(res.aliquotaIcmsPct, 18.0);
  assert.equal(res.aliquotaTotalPct, 18.0);
  assert.equal(res.tipoAliquota, 'modal');
});

// -----------------------------------------------------------------------------
// 2. ALÍQUOTAS SELETIVAS E FECOP (ANEXO XII RICMS/PR)
// -----------------------------------------------------------------------------
t('2.1 Perfumes (NCM 3303.00.10): Carga 25% (23% ICMS + 2% FECOP)', () => {
  const res = resolverAliquotaPrBitemporal('33030010', '2026-06-01');
  assert.equal(res.aliquotaIcmsPct, 23.0);
  assert.equal(res.aliquotaFecopPct, 2.0);
  assert.equal(res.aliquotaTotalPct, 25.0);
  assert.equal(res.sujeitoFecop, true);
  assert.match(res.dispositivoLegal, /Art\. 14-A/);
});

t('2.2 Xampu (NCM 3305.10.00): Exceção expressa ao FECOP e aos 25% (Aplica Modal 19,5%)', () => {
  const res = resolverAliquotaPrBitemporal('33051000', '2026-06-01');
  assert.equal(res.aliquotaIcmsPct, 19.5);
  assert.equal(res.aliquotaFecopPct, 0);
  assert.equal(res.aliquotaTotalPct, 19.5);
  assert.equal(res.sujeitoFecop, false);
});

t('2.3 Desodorantes corporais (NCM 3307.20.10): Exceção expressa ao FECOP (Aplica Modal 19,5%)', () => {
  const res = resolverAliquotaPrBitemporal('33072010', '2026-06-01');
  assert.equal(res.aliquotaIcmsPct, 19.5);
  assert.equal(res.aliquotaFecopPct, 0);
  assert.equal(res.aliquotaTotalPct, 19.5);
  assert.equal(res.sujeitoFecop, false);
});

t('2.4 Máquinas industriais (NCM 8419): 12% sem partes e peças vs 19,5% com partes e peças', () => {
  const maquina = resolverAliquotaPrBitemporal('84198999', '2026-06-01', false);
  assert.equal(maquina.aliquotaIcmsPct, 12.0);
  assert.equal(maquina.aliquotaTotalPct, 12.0);

  const partePeca = resolverAliquotaPrBitemporal('84198999', '2026-06-01', true);
  assert.equal(partePeca.aliquotaIcmsPct, 19.5);
  assert.equal(partePeca.aliquotaTotalPct, 19.5);
});

t('2.5 Cerveja (NCM 2203.00.00): 27% ICMS + 2% FECOP = 29% Total', () => {
  const res = resolverAliquotaPrBitemporal('22030000', '2026-06-01');
  assert.equal(res.aliquotaIcmsPct, 27.0);
  assert.equal(res.aliquotaFecopPct, 2.0);
  assert.equal(res.aliquotaTotalPct, 29.0);
  assert.equal(res.sujeitoFecop, true);
});

// -----------------------------------------------------------------------------
// 3. EXCLUSÕES DE SUBSTITUIÇÃO TRIBUTÁRIA NO PR (DECRETOS 6.048/2024 E 12.828/2026)
// -----------------------------------------------------------------------------
t('3.1 Aparelhos Celulares (NCM 85171300): Não excluído em 28/02/2026 vs Excluído em 01/03/2026 (Dec. 12.828/2026)', () => {
  const antes = verificarExclusaoStPr('85171300', '2100100', '2026-02-28');
  assert.equal(antes.excluidoDaSt, false);

  const depois = verificarExclusaoStPr('85171300', '2100100', '2026-03-01');
  assert.equal(depois.excluidoDaSt, true);
  assert.match(depois.decreto || '', /12\.828\/2026/);
});

t('3.2 Artefatos domésticos (NCM 3924.10.00): Não excluído em 31/07/2024 vs Excluído em 01/08/2024 (Dec. 6.048/2024)', () => {
  const antes = verificarExclusaoStPr('39241000', '1400100', '2024-07-31');
  assert.equal(antes.excluidoDaSt, false);

  const depois = verificarExclusaoStPr('39241000', '1400100', '2024-08-01');
  assert.equal(depois.excluidoDaSt, true);
  assert.match(depois.decreto || '', /6\.048\/2024/);
});

t('3.3 Autopeças (NCM 87082999 CEST 0100100): Não sofre exclusão', () => {
  const res = verificarExclusaoStPr('87082999', '0100100', '2026-06-01');
  assert.equal(res.excluidoDaSt, false);
});

// -----------------------------------------------------------------------------
// 4. COMBUSTÍVEIS MONOFÁSICOS AD REM
// -----------------------------------------------------------------------------
t('4.1 Diesel (NCM 27101921): R$ 1,17/litro em 2026 vs R$ 1,30/litro a partir de 01/02/2027', () => {
  const d2026 = resolverAliquotaPrBitemporal('27101921', '2026-06-15');
  assert.equal(d2026.ehCombustivelMonofasico, true);
  assert.equal(d2026.aliquotaAdRem, 1.17);
  assert.equal(d2026.unidadeAdRem, 'R$/litro');

  const d2027 = resolverAliquotaPrBitemporal('27101921', '2027-02-01');
  assert.equal(d2027.ehCombustivelMonofasico, true);
  assert.equal(d2027.aliquotaAdRem, 1.30);
  assert.equal(d2027.unidadeAdRem, 'R$/litro');
});

t('4.2 Gasolina (NCM 27101259): R$ 1,57/litro em 2026 vs R$ 1,64/litro a partir de 01/02/2027', () => {
  const g2026 = resolverAliquotaPrBitemporal('27101259', '2026-06-15');
  assert.equal(g2026.ehCombustivelMonofasico, true);
  assert.equal(g2026.aliquotaAdRem, 1.57);

  const g2027 = resolverAliquotaPrBitemporal('27101259', '2027-02-01');
  assert.equal(g2027.ehCombustivelMonofasico, true);
  assert.equal(g2027.aliquotaAdRem, 1.64);
});

// -----------------------------------------------------------------------------
// 5. PARSER XML NF-E: NT 2026.008 v1.01 E NT 2025.002 v1.52
// -----------------------------------------------------------------------------
t('5.1 Extração determinística de XML com campos NT 2026.008 e NT 2025.002', () => {
  const xmlTeste = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe41260312345678000190550010000000011000000010" versao="4.00">
      <ide>
        <cUF>41</cUF>
        <cNF>00000001</cNF>
        <natOp>VENDA DE MERCADORIA</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>1</nNF>
        <dhEmi>2026-03-15T10:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>4106902</cMunFG>
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
        <CNPJ>12345678000190</CNPJ>
        <xNome>DISTRIBUIDORA PARANA LTDA</xNome>
        <enderEmit>
          <xLgr>RUA XV DE NOVEMBRO</xLgr>
          <nro>100</nro>
          <xBairro>CENTRO</xBairro>
          <cMun>4106902</cMun>
          <xMun>CURITIBA</xMun>
          <UF>PR</UF>
          <CEP>80000000</CEP>
        </enderEmit>
        <IE>1234567890</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000110</CNPJ>
        <xNome>SUPERMERCADO MODELO LTDA</xNome>
        <enderDest>
          <xLgr>AV BRASIL</xLgr>
          <nro>500</nro>
          <xBairro>CENTRO</xBairro>
          <cMun>4106902</cMun>
          <xMun>CURITIBA</xMun>
          <UF>PR</UF>
          <CEP>80000001</CEP>
        </enderDest>
        <IE>9876543210</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>PROD-001</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>NOTEBOOK PROCESSADOR I7 16GB</xProd>
          <NCM>84713012</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>1.0000</qCom>
          <vUnCom>4500.00</vUnCom>
          <vProd>4500.00</vProd>
          <vProdLiq>4450.00</vProdLiq>
          <vUnComLiq>4450.00</vUnComLiq>
          <nFCI>A1B2C3D4-E5F6-7890-1234-567890123456</nFCI>
        </prod>
        <imposto>
          <ICMS>
            <ICMS60>
              <orig>1</orig>
              <CST>60</CST>
              <vBCSTRet>4800.00</vBCSTRet>
              <pST>19.50</pST>
              <vICMSSTRet>936.00</vICMSSTRet>
            </ICMS60>
          </ICMS>
          <gIBSCBS>
            <cClassTrib>010101</cClassTrib>
            <CST>01</CST>
            <vBC>4450.00</vBC>
            <pIBS>0.10</pIBS>
            <vIBS>4.45</vIBS>
            <pCBS>0.90</pCBS>
            <vCBS>40.05</vCBS>
          </gIBSCBS>
          <gIS>
            <pIS>0.00</pIS>
            <vIS>0.00</vIS>
          </gIS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vProd>4500.00</vProd>
          <vNF>4500.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

  const extraido = extrairDadosXmlNfe(xmlTeste);
  assert.equal(extraido.itens.length, 1);
  const item = extraido.itens[0];

  assert.equal(item.vProdLiq, 4450.0);
  assert.equal(item.vUnComLiq, 4450.0);
  assert.equal(item.nFCI, 'A1B2C3D4-E5F6-7890-1234-567890123456');
  assert.equal(item.leiauteNt2026008, true);

  assert.equal(item.origemTabelaA, 1);
  assert.equal(item.origemMercadoria, '1');
  assert.equal(item.vBCSTRet, 4800.0);
  assert.equal(item.pST, 19.5);
  assert.equal(item.vICMSSTRet, 936.0);

  assert.equal(item.tributos.cClassTrib, '010101');
  assert.equal(item.tributos.vIBS, 4.45);
  assert.equal(item.tributos.vIbs, 4.45);
  assert.equal(item.tributos.vCBS, 40.05);
  assert.equal(item.tributos.vCbs, 40.05);
});

t('5.2 Parâmetros do Simples Nacional PR são extraídos com sucesso', () => {
  const sn = obterParametrosSimplesPr();
  assert.equal(sn.faixaIsentaRbt12Ate, 360000.0);
  assert.equal(sn.sublimiteEstadualRbt12, 3600000.0);
  assert.equal(sn.limiteExcesso20Pct, 4320000.0);
  assert.equal(sn.tetoFederalRbt12, 4800000.0);
});
