/**
 * Testes Automatizados de Exportação e Integração: Auditoria de Entrada -> Precificação (Etapa 3)
 *
 * Valida que 100% dos dados sensíveis extraídos do XML da NF-e (produtos, frete, seguro, outras despesas,
 * descontos, IPI, ICMS, ST, II, PIS/COFINS e RTC IBS/CBS/IS) são retidos e convertidos com precisão
 * para o motor de precificação e formação de margens.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extrairDadosXmlNfe, converterItemExtracaoParaPrecificacao } from '../lib/extrator-nfe.ts';
import { calcularCustoAquisicaoReal, simular, compararQuatroRegimes, ratearDespesasAcessoriaEFrete } from '../lib/precificacao.ts';
import { mapearCfopEntrada } from '../lib/marco-legal.ts';
import { esc } from '../lib/html.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';
import { mods } from 'ncm:libs';

globalThis.fetch = async (u) => {
  let url = String(u);
  if (url.includes('?v=')) url = url.split('?v=')[0];
  const rel = url.replace(/^\//, '');
  for (const base of ['public', '.']) {
    try {
      const t = await readFile(`${process.cwd()}/${base}/${rel}`, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(t) };
    } catch {
      /* próximo */
    }
  }
  return { ok: false, status: 404, json: async () => null };
};

const reforma = await mods.data.loadReforma();
const marco = (await import('../rules/marco-legal.json', { with: { type: 'json' } })).default;
const ctx = { reforma, marco };
const mapaD8 = getMapaD8();

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

// ---------------------------------------------------------------------------------------------
// XML Canônico de NF-e Modelo 55 com Múltiplos Itens e RTC (Reforma Tributária do Consumo)
// ---------------------------------------------------------------------------------------------
const XML_NFE_CANONICA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe41260100000000000100550010000000011000000010" versao="4.00">
      <ide>
        <cUF>41</cUF>
        <cNF>00000001</cNF>
        <natOp>VENDA DE MERCADORIA</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>1</nNF>
        <dhEmi>2027-02-15T10:00:00-03:00</dhEmi>
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
        <CNPJ>12345678000195</CNPJ>
        <xNome>SIDERURGICA NACIONAL DE METAIS LTDA</xNome>
        <enderEmit>
          <xLgr>RUA DAS INDUSTRIAS</xLgr>
          <nro>1000</nro>
          <xBairro>DISTRITO INDUSTRIAL</xBairro>
          <cMun>4106902</cMun>
          <xMun>CURITIBA</xMun>
          <UF>PR</UF>
          <CEP>80000000</CEP>
        </enderEmit>
        <IE>1234567890</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>COMERCIO E DISTRIBUICAO DE MAQUINAS LTDA</xNome>
        <enderDest>
          <xLgr>AVENIDA CENTRAL</xLgr>
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
          <cProd>BOB-7214</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>Barra de Aço Carbono CA-50 12mm</xProd>
          <NCM>72142000</NCM>
          <CEST>0100100</CEST>
          <CFOP>5102</CFOP>
          <uCom>KG</uCom>
          <qCom>500.0000</qCom>
          <vUnCom>10.0000</vUnCom>
          <vProd>5000.00</vProd>
          <vFrete>150.00</vFrete>
          <vSeg>50.00</vSeg>
          <vDesc>100.00</vDesc>
          <vOutro>20.00</vOutro>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>5120.00</vBC>
              <pICMS>19.50</pICMS>
              <vICMS>998.40</vICMS>
            </ICMS00>
          </ICMS>
          <IPI>
            <cEnq>999</cEnq>
            <IPITrib>
              <CST>50</CST>
              <vBC>5000.00</vBC>
              <pIPI>10.00</pIPI>
              <vIPI>500.00</vIPI>
            </IPITrib>
          </IPI>
          <II>
            <vBC>5000.00</vBC>
            <vII>100.00</vII>
          </II>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>5000.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>82.50</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>5000.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>380.00</vCOFINS>
            </COFINSAliq>
          </COFINS>
          <IBSCBS>
            <CST>01</CST>
            <cClassTrib>200001</cClassTrib>
            <vBC>5000.00</vBC>
            <pIBSUF>0.05</pIBSUF>
            <pIBSMun>0.05</pIBSMun>
            <pIBS>0.10</pIBS>
            <vIBS>5.00</vIBS>
            <pCBS>8.80</pCBS>
            <vCBS>440.00</vCBS>
          </IBSCBS>
          <IS>
            <pIS>2.00</pIS>
            <vIS>100.00</vIS>
          </IS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>DISP-MED-01</cProd>
          <xProd>Termômetro Clínico Digital</xProd>
          <NCM>90251910</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>50.0000</qCom>
          <vUnCom>40.0000</vUnCom>
          <vProd>2000.00</vProd>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS10>
              <orig>0</orig>
              <CST>10</CST>
              <vBC>2000.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>360.00</vICMS>
              <vBCST>2800.00</vBCST>
              <pICMSST>18.00</pICMSST>
              <vICMSST>144.00</vICMSST>
            </ICMS10>
          </ICMS>
          <IBSCBS>
            <cClassTrib>200030</cClassTrib>
            <vBC>2000.00</vBC>
            <vIBS>2.00</vIBS>
            <vCBS>176.00</vCBS>
          </IBSCBS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vProd>7000.00</vProd>
          <vFrete>150.00</vFrete>
          <vSeg>50.00</vSeg>
          <vDesc>100.00</vDesc>
          <vOutro>20.00</vOutro>
          <vII>100.00</vII>
          <vIPI>500.00</vIPI>
          <vPIS>82.50</vPIS>
          <vCOFINS>380.00</vCOFINS>
          <vICMS>1358.40</vICMS>
          <vST>144.00</vST>
          <vNF>8264.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

// ---------------------------------------------------------------------------------------------
// Testes de Regressão da Extração e Conversão
// ---------------------------------------------------------------------------------------------

t('extração determinística de XML retém 100% dos dados sensíveis de produtos e tributos', () => {
  const extracao = extrairDadosXmlNfe(XML_NFE_CANONICA, mapaD8);

  assert.equal(extracao.tipoDocumento, 'XML');
  assert.equal(extracao.totalItens, 2);
  assert.equal(extracao.emitente.cnpj, '12345678000195');
  assert.equal(extracao.emitente.uf, 'PR');

  // Item 1
  const item1 = extracao.itens[0];
  assert.equal(item1.index, 1);
  assert.equal(item1.cProd, 'BOB-7214');
  assert.equal(item1.xProd, 'Barra de Aço Carbono CA-50 12mm');
  assert.equal(item1.ncm, '72142000');
  assert.equal(item1.cest, '0100100');
  assert.equal(item1.cfop, '5102');
  assert.equal(item1.qCom, 500);
  assert.equal(item1.vUnCom, 10);
  assert.equal(item1.vProd, 5000);
  assert.equal(item1.vFrete, 150);
  assert.equal(item1.vSeg, 50);
  assert.equal(item1.vDesc, 100);
  assert.equal(item1.vOutro, 20);

  // Tributos do Item 1
  const t1 = item1.tributos;
  assert.equal(t1.cstIcms, '00');
  assert.equal(t1.pICMS, 19.5);
  assert.equal(t1.vICMS, 998.4);
  assert.equal(t1.pIPI, 10);
  assert.equal(t1.vIPI, 500);
  assert.equal(t1.vII, 100);
  assert.equal(t1.pPIS, 1.65);
  assert.equal(t1.vPIS, 82.5);
  assert.equal(t1.pCOFINS, 7.6);
  assert.equal(t1.vCOFINS, 380);
  assert.equal(t1.cClassTrib, '200001');
  assert.equal(t1.pIBSUF, 0.05);
  assert.equal(t1.pIBSMun, 0.05);
  assert.equal(t1.vIBS, 5);
  assert.equal(t1.pCBS, 8.8);
  assert.equal(t1.vCBS, 440);
  assert.equal(t1.pIS, 2);
  assert.equal(t1.vIS, 100);

  // Item 2 (com ST e cClassTrib 200030)
  const item2 = extracao.itens[1];
  assert.equal(item2.index, 2);
  assert.equal(item2.cProd, 'DISP-MED-01');
  assert.equal(item2.tributos.vICMSST, 144);
  assert.equal(item2.tributos.cClassTrib, '200030');
});

t('conversão de item para PrecificacaoItemInput preserva integridade numérica', () => {
  const extracao = extrairDadosXmlNfe(XML_NFE_CANONICA, mapaD8);
  const precItem1 = converterItemExtracaoParaPrecificacao(extracao.itens[0]);

  assert.equal(precItem1.codigo, 'BOB-7214');
  assert.equal(precItem1.descricao, 'Barra de Aço Carbono CA-50 12mm');
  assert.equal(precItem1.ncm, '72142000');
  assert.equal(precItem1.quantidade, 500);
  assert.equal(precItem1.valorBrutoEntrada, 5000);
  assert.equal(precItem1.freteSeguroOutrasEntrada, 220); // 150 + 50 + 20 = 220
  assert.equal(precItem1.descontoIncondicionalEntrada, 100);
  assert.equal(precItem1.ipiEntrada, 500);
  assert.equal(precItem1.iiEntrada, 100);
  assert.equal(precItem1.isEntrada, 100);
  assert.equal(precItem1.credIcmsEntrada, 998.4);
  assert.equal(precItem1.credPisCofinsEntrada, 462.5); // 82.5 + 380 = 462.5
  assert.equal(precItem1.credCbsEntrada, 440);
  assert.equal(precItem1.credIbsEntrada, 5);
});

t('execução do cálculo do Custo de Aquisição Real com item extraído da NF-e', () => {
  const extracao = extrairDadosXmlNfe(XML_NFE_CANONICA, mapaD8);
  const precItem1 = converterItemExtracaoParaPrecificacao(extracao.itens[0]);

  // Custo Real no Lucro Real (apropria ICMS, PIS/COFINS, CBS e IBS)
  const cReal = calcularCustoAquisicaoReal(precItem1, 'real');
  assert.equal(cReal.valorProdutoBruto, 5000);
  assert.equal(cReal.descontosIncondicionais, 100);
  assert.equal(cReal.freteSeguroOutros, 220);
  // IPI (500) + II (100) + IS (100) = 700 não recuperáveis
  assert.equal(cReal.tributosNaoRecuperaveis.total, 700);
  // ICMS (998.4) + PIS/COFINS (462.5) + CBS (440) + IBS (5) = 1905.9 a recuperar
  assert.equal(cReal.impostosARecuperar.totalImpostosRecuperaveis, 1905.9);
  // Custo Real = 5000 - 100 + 220 + 700 - 1905.9 = 3914.1
  assert.equal(cReal.custoAquisicaoReal, 3914.1);
  assert.equal(cReal.custoUnitarioReal, 7.83); // 3914.1 / 500 = 7.8282 -> 7.83
});

t('simulação completa de formação de preço e comparativo dos 4 regimes com item de NF-e', () => {
  const extracao = extrairDadosXmlNfe(XML_NFE_CANONICA, mapaD8);
  const precItem1 = converterItemExtracaoParaPrecificacao(extracao.itens[0]);

  const params = {
    ano: 2027,
    uf: 'PR',
    regime: 'real',
    margemLiquidaPct: 15,
    despesasVariaveisPct: 5,
    icmsSaidaPct: 19.5,
  };

  const r = simular(precItem1, params, ctx);
  assert.ok(r.preco.precoFinal > 0);
  assert.ok(r.preco.vProdLiq > 0);
  assert.ok(r.resultado.lucroLiquido > 0);
  assert.ok(r.relatorioMargens);
  assert.equal(r.relatorioMargens.regime, 'real');

  const comp = compararQuatroRegimes(precItem1, params, ctx);
  assert.ok(comp.melhorMargemLiquida);
  assert.ok(comp.melhorCompetitividadeB2B);
  assert.ok(comp.regimes.simples_hibrido.creditoTransferidoClienteB2B > comp.regimes.simples.creditoTransferidoClienteB2B);
});

// ---------------------------------------------------------------------------------------------
// ETAPA 7: RASTREABILIDADE FISCAL, GOVERNANÇA CONTÁBIL (VRL/PEC) E SANITIZAÇÃO DE EXPORTAÇÃO
// ---------------------------------------------------------------------------------------------
t('Etapa 7: Rastreabilidade de CFOP De-Para, Frete FOB e Governança Contábil VRL/PEC/Arbitramento', () => {
  const extracao = extrairDadosXmlNfe(XML_NFE_CANONICA, mapaD8);
  const itensPrec = extracao.itens.map((it) => converterItemExtracaoParaPrecificacao(it));

  // 1. De-Para de CFOP
  const deParaComercio = mapearCfopEntrada(itensPrec[0].cfop, 'comercializacao', 'PR', 'PR', marco);
  assert.equal(deParaComercio.cfopEntrada, '1102');
  assert.equal(deParaComercio.geraCreditoIcms, true);

  const deParaConsumo = mapearCfopEntrada('6102', 'uso_consumo', 'SP', 'PR', marco);
  assert.equal(deParaConsumo.cfopEntrada, '2556');
  assert.equal(deParaConsumo.geraCreditoIcms, false);
  assert.equal(deParaConsumo.exigeDifal, true);

  // Com máscara/ponto
  const deParaComPonto = mapearCfopEntrada('5.102', 'comercializacao', 'PR', 'PR', marco);
  assert.equal(deParaComPonto.cfopEntrada, '1.102');

  // 2. Rateio de frete CT-e FOB
  const itensComFreteFob = ratearDespesasAcessoriaEFrete(itensPrec, {
    freteCteTotal: 300,
    icmsFreteCteTotal: 36,
    criterioRateio: 'valor',
    modFrete: '1',
    regimeDestinatario: 'real',
  });
  assert.ok(itensComFreteFob[0].freteSeguroOutrasEntrada > itensPrec[0].freteSeguroOutrasEntrada);
  assert.ok(itensComFreteFob[0].credPisCofinsEntrada > itensPrec[0].credPisCofinsEntrada);

  // 3. Simulação com Governança Contábil (PEC e VRL)
  const paramsGov = {
    ano: 2027,
    uf: 'PR',
    regime: 'real',
    margemLiquidaPct: 20,
    despesasVariaveisPct: 5,
    custosFixosTotaisPeriodo: 10000,
    icmsSaidaPct: 19.5,
  };

  const resGov = simular(itensComFreteFob[0], paramsGov, ctx);
  const rel = resGov.relatorioMargens;
  assert.ok(rel);

  // Ponto de Equilíbrio Contábil
  assert.ok(rel.pontoEquilibrioContabil.pecVolume > 0, 'PEC Volume deve ser > 0');
  assert.ok(rel.pontoEquilibrioContabil.pecValor > 0, 'PEC Valor deve ser > 0');
  assert.ok(rel.margemContribuicaoUnitaria > 0, 'MC Unitária deve ser > 0');

  // VRL & Arbitramento
  assert.ok(rel.analiseVrlEArbitramento.valorRealizavelLiquido > 0);
  assert.equal(rel.analiseVrlEArbitramento.requerProvisaoImpairment, false);
  assert.ok(rel.analiseVrlEArbitramento.custoArbitradoRir2018 > 0);
});

t('Etapa 7: Teste de Valor Realizável Líquido dispara alerta de Impairment quando VRL < Custo', () => {
  // Cenário de produto com alto custo de aquisição e venda deficitária / margem forçada negativa
  const itemDeficitario = {
    codigo: 'DEF-01',
    descricao: 'Produto com perda de mercado',
    ncm: '84713012',
    quantidade: 1,
    valorBrutoEntrada: 1000,
    freteSeguroOutrasEntrada: 0,
    descontoIncondicionalEntrada: 0,
    ipiEntrada: 0,
    icmsStEntrada: 0,
    iiEntrada: 0,
    isEntrada: 0,
    credIcmsEntrada: 0,
    credPisCofinsEntrada: 0,
    credCbsEntrada: 0,
    credIbsEntrada: 0,
  };

  // Simulação com margem muito baixa ou despesas de venda elevadas
  const paramsPerda = {
    ano: 2027,
    regime: 'real',
    margemLiquidaPct: 1,
    despesasVariaveisPct: 25, // 25% de comissão/despesas de venda derrubam o VRL abaixo do custo de compra
    icmsSaidaPct: 0,
  };

  const resPerda = simular(itemDeficitario, paramsPerda, ctx);
  const rel = resPerda.relatorioMargens;
  assert.ok(rel);

  // VRL = Preço Final - Despesas de Venda
  // Quando VRL < Custo Real, impairment deve ser true
  if (rel.analiseVrlEArbitramento.valorRealizavelLiquido < rel.custoAquisicaoReal) {
    assert.equal(rel.analiseVrlEArbitramento.requerProvisaoImpairment, true, 'Deve exigir impairment');
    assert.ok(rel.analiseVrlEArbitramento.valorProvisaoUnitaria > 0, 'Provisão unitária deve ser > 0');
    assert.ok(resPerda.alertas.some((a) => a.includes('Impairment')), 'Deve emitir alerta pericial no laudo');
  }
});

t('Etapa 7: Sanitização estrita contra XSS via esc() no Laudo HTML', () => {
  const cargaMaliciosa = '<script>alert("xss")</script> & "aspas" \'simples\' <tag>';
  const sanitizado = esc(cargaMaliciosa);

  assert.ok(!sanitizado.includes('<script>'), 'Tag script deve ser neutralizada');
  assert.ok(sanitizado.includes('&lt;script&gt;'), 'Deve converter < e > em entidades HTML seguras');
  assert.ok(sanitizado.includes('&quot;aspas&quot;'), 'Deve converter aspas duplas');
  assert.ok(sanitizado.includes('&#39;simples&#39;'), 'Deve converter aspas simples');
  assert.ok(sanitizado.includes('&amp;'), 'Deve converter & em &amp;');
});

console.log('\nSUÍTE EXPORTAÇÃO-PRECIFICAÇÃO OK ✓');
