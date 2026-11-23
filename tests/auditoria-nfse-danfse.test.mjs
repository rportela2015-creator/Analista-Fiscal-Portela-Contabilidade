/**
 * Suíte de Testes Automatizados: Extração e Auditoria de NFS-e / DPS Nacional e DANFSe
 * Analista Fiscal Portela Contabilidade — Ciclo 6 (Sub-Etapa 19.6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarTipoXmlFiscal,
  extrairNfseNacionalXml,
} from '../lib/extrator-nfse.ts';
import {
  auditarNfseNacional,
} from '../lib/fiscal/auditoria-nfse.ts';
import {
  gerarDanfsePdfRfb,
} from '../lib/integracoes/rtc-danfse/client.ts';
import {
  DanfseXmlInputSchema,
} from '../lib/integracoes/rtc-danfse/schema.ts';
import {
  resetCircuitBreakersForTests,
} from '../lib/integracoes/rfb-health.ts';

const originalFetch = globalThis.fetch;

// ============================================================================
// XMLS MOCK DE TESTE
// ============================================================================

const XML_NFE_MERCADORIA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe41261100000000000191550010000012341000001234"></infNFe></NFe>
</nfeProc>`;

const XML_NFSE_LOCACAO_COMPLETA = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFS41069022600000000191550010000000001234567890">
    <nNFSe>12345</nNFSe>
    <ambGer>1</ambGer>
    <dhProc>2026-09-10T14:30:00-03:00</dhProc>
    <verAplic>1.0.0</verAplic>
    <emit>
      <CNPJ>00000000000191</CNPJ>
      <xNome>IMOBILIARIA PORTELA LTDA</xNome>
      <enderNac>
        <xLgr>RUA XV DE NOVEMBRO</xLgr>
        <nro>1000</nro>
        <xBairro>CENTRO</xBairro>
        <cMun>4106902</cMun>
        <xMun>CURITIBA</xMun>
        <UF>PR</UF>
        <CEP>80020000</CEP>
      </enderNac>
    </emit>
    <DPS>
      <infDPS Id="DPS41069022600000000191550010000000001234567890">
        <nDPS>1001</nDPS>
        <serie>1</serie>
        <dhEmi>2026-09-10T14:00:00-03:00</dhEmi>
        <dCompet>2026-09-10</dCompet>
        <tpEmit>1</tpEmit>
        <toma>
          <CNPJ>33000167000101</CNPJ>
          <xNome>CLIENTE LOCATARIO SA</xNome>
          <end>
            <endNac>
              <xLgr>AVENIDA SETE DE SETEMBRO</xLgr>
              <nro>2500</nro>
              <xBairro>BATEL</xBairro>
              <cMun>4106902</cMun>
              <xMun>CURITIBA</xMun>
              <UF>PR</UF>
              <CEP>80230000</CEP>
            </endNac>
          </end>
        </toma>
        <serv>
          <cServ>
            <cTribNac>99.04.01</cTribNac>
            <cNBS>114011000</cNBS>
            <xDescServ>LOCACAO DE IMOVEL COMERCIAL PARA FINS OPERACIONAIS</xDescServ>
          </cServ>
          <locPrest>
            <cLocPrestacao>4106902</cLocPrestacao>
            <UF>PR</UF>
          </locPrest>
        </serv>
        <valores>
          <vServPrest>
            <vServ>10000.00</vServ>
          </vServPrest>
          <vDescCondIncond>
            <vDescIncond>0.00</vDescIncond>
            <vDescCond>0.00</vDescCond>
          </vDescCondIncond>
          <vDedRed>
            <vDR>0.00</vDR>
          </vDedRed>
          <trib>
            <tribFed>
              <piscofins>
                <vPis>0.00</vPis>
                <vCofins>0.00</vCofins>
                <tpRetPisCofins>3</tpRetPisCofins>
              </piscofins>
            </tribFed>
          </trib>
        </valores>
        <IBSCBS>
          <cib>PR12345678</cib>
          <valores>
            <trib>
              <gIBSCBS>
                <CST>200</CST>
                <cClassTrib>200027</cClassTrib>
              </gIBSCBS>
            </trib>
          </valores>
        </IBSCBS>
      </infDPS>
    </DPS>
    <valores>
      <vServ>10000.00</vServ>
      <vBC>10000.00</vBC>
      <vISSQN>0.00</vISSQN>
      <vLiq>10000.00</vLiq>
    </valores>
    <IBSCBS>
      <valores>
        <vBC>10000.00</vBC>
        <uf>
          <pIBSUF>0.10</pIBSUF>
          <pRedAliqUF>70.0</pRedAliqUF>
        </uf>
        <mun>
          <pIBSMun>0.00</pIBSMun>
          <pRedAliqMun>70.0</pRedAliqMun>
        </mun>
        <fed>
          <pCBS>0.90</pCBS>
          <pRedAliqCBS>70.0</pRedAliqCBS>
        </fed>
      </valores>
      <totCIBS>
        <gIBS>
          <vIBSTot>3.00</vIBSTot>
          <gIBSUFTot><vIBSUF>3.00</vIBSUF></gIBSUFTot>
        </gIBS>
        <gCBS>
          <vCBS>27.00</vCBS>
        </gCBS>
      </totCIBS>
    </IBSCBS>
  </infNFSe>
</NFSe>`;

// ============================================================================
// TESTE 1: detecção de tipo de XML fiscal
// ============================================================================
test('1. detectarTipoXmlFiscal: distingue corretamente NFe, NFSe Nacional, DPS e Desconhecido', () => {
  assert.strictEqual(detectarTipoXmlFiscal(XML_NFE_MERCADORIA), 'NFE');
  assert.strictEqual(detectarTipoXmlFiscal(XML_NFSE_LOCACAO_COMPLETA), 'NFSE_NACIONAL');

  const xmlDps = '<DPS versao="1.00"><infDPS Id="DPS12345"></infDPS></DPS>';
  assert.strictEqual(detectarTipoXmlFiscal(xmlDps), 'DPS_NACIONAL');

  assert.strictEqual(detectarTipoXmlFiscal('<html><body>teste</body></html>'), 'DESCONHECIDO');
  assert.strictEqual(detectarTipoXmlFiscal('{"teste": 123}'), 'DESCONHECIDO');
  assert.strictEqual(detectarTipoXmlFiscal(''), 'DESCONHECIDO');
});

// ============================================================================
// TESTE 2: extração e auditoria de locação comercial 200027 com CIB
// ============================================================================
test('2. Extração e Auditoria de NFS-e de Locação Comercial (cClassTrib 200027, CST 200, Redução 70% e CIB)', async () => {
  // Mock do RTC Regime Regular respondendo cálculo determinístico
  globalThis.fetch = async (inputUrl) => {
    const url = String(inputUrl);
    if (url.includes('/regime-geral')) {
      return new Response(
        JSON.stringify({
          totais: {
            valorIbsTotal: '3.00',
            valorCbsTotal: '27.00',
          },
          itens: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(inputUrl);
  };

  const extracao = extrairNfseNacionalXml(XML_NFSE_LOCACAO_COMPLETA);

  assert.strictEqual(extracao.tipoDocumento, 'NFSE_NACIONAL');
  assert.strictEqual(extracao.identificacao.nNFSe, '12345');
  assert.strictEqual(extracao.prestador.xNome, 'IMOBILIARIA PORTELA LTDA');
  assert.strictEqual(extracao.tomador?.xNome, 'CLIENTE LOCATARIO SA');
  assert.strictEqual(extracao.servico.cTribNac, '99.04.01');
  assert.strictEqual(extracao.servico.subitemNovoFatoGeradorNt005, '99.04');
  assert.strictEqual(extracao.valores.vServ, 10000.0);
  assert.strictEqual(extracao.valores.tpRetPisCofins, 3);
  assert.strictEqual(extracao.reformaTributaria?.cClassTrib, '200027');
  assert.strictEqual(extracao.reformaTributaria?.cst, '200');
  assert.strictEqual(extracao.reformaTributaria?.cib, 'PR12345678');
  assert.strictEqual(extracao.reformaTributaria?.pRedAliqCBS, 70.0);

  const auditoria = await auditarNfseNacional(extracao, {
    perfilAdquirente: { regime: 'LUCRO_REAL' },
    statusExtincaoRtc: 'EXTINTO_SPLIT',
    calcularRtcOficial: false, // testa motor sem dependência externa
  });

  assert.strictEqual(auditoria.validoParaEmissao, true);
  const criticos = auditoria.alertas.filter((a) => a.severidade === 'CRITICO');
  assert.strictEqual(criticos.length, 0, 'Não deve haver alertas críticos em nota de locação perfeita');

  // Créditos do Tomador
  assert.strictEqual(auditoria.creditosTomador?.pisCofinsLucroReal.admitido, true);
  assert.strictEqual(auditoria.creditosTomador?.pisCofinsLucroReal.valorPis, 165.0);
  assert.strictEqual(auditoria.creditosTomador?.pisCofinsLucroReal.valorCofins, 760.0);
  assert.strictEqual(auditoria.creditosTomador?.ibsCbsReforma.admitido, true);
  assert.strictEqual(auditoria.creditosTomador?.ibsCbsReforma.valorIbs, 3.0);
  assert.strictEqual(auditoria.creditosTomador?.ibsCbsReforma.valorCbs, 27.0);
});

// ============================================================================
// TESTE 3: auditoria de rejeições preventivas (xLgr vazio, CIB ausente, NT 004)
// ============================================================================
test('3. Auditoria de Rejeições Preventivas: Logradouro Tomador em branco, CIB ausente em locação e NT 004', async () => {
  // Cenário A: Tomador com logradouro em branco (<xLgr></xLgr>)
  const xmlTomadorSemRua = XML_NFSE_LOCACAO_COMPLETA.replace(
    '<xLgr>AVENIDA SETE DE SETEMBRO</xLgr>',
    '<xLgr></xLgr>'
  );
  const extracaoSemRua = extrairNfseNacionalXml(xmlTomadorSemRua);
  const audSemRua = await auditarNfseNacional(extracaoSemRua, { calcularRtcOficial: false });

  assert.strictEqual(audSemRua.validoParaEmissao, false);
  assert.ok(
    audSemRua.alertas.some((a) => a.codigo === 'REJEICAO_SCHEMA_LOGRADOURO_TOMADOR_EM_BRANCO'),
    'Deve acusar rejeição de schema para logradouro vazio'
  );

  // Cenário B: Locação comercial (200027) sem o CIB
  const xmlSemCib = XML_NFSE_LOCACAO_COMPLETA.replace(
    '<cib>PR12345678</cib>',
    ''
  );
  const extracaoSemCib = extrairNfseNacionalXml(xmlSemCib);
  const audSemCib = await auditarNfseNacional(extracaoSemCib, { calcularRtcOficial: false });

  assert.strictEqual(audSemCib.validoParaEmissao, false);
  assert.ok(
    audSemCib.alertas.some((a) => a.codigo === 'CIB_OBRIGATORIO_LOCACAO_IMOVEL'),
    'Deve acusar alerta crítico de obrigatoriedade do CIB'
  );

  // Cenário C: Competência 2027 em Regime Regular sem o grupo IBSCBS
  const xmlSemIbsCbs = XML_NFSE_LOCACAO_COMPLETA
    .replace(/<IBSCBS>[\s\S]*?<\/IBSCBS>/g, '')
    .replace('<dCompet>2026-09-10</dCompet>', '<dCompet>2027-01-15</dCompet>');

  const extracaoSemIbs = extrairNfseNacionalXml(xmlSemIbsCbs);
  const audSemIbs = await auditarNfseNacional(extracaoSemIbs, { calcularRtcOficial: false });

  assert.ok(
    audSemIbs.alertas.some((a) => a.codigo === 'NT004_GRUPO_IBSCBS_OBRIGATORIO'),
    'Deve acusar obrigatoriedade de IBS/CBS pós-03/08/2026'
  );
});

// ============================================================================
// TESTE 4: gerarDanfsePdfRfb com parâmetros stc e canhoto, e tolerância a 503
// ============================================================================
test('4. rtc-danfse: Envio de stc=1&canhoto=true, assinatura %PDF- e tratamento de 503 offline', async () => {
  resetCircuitBreakersForTests();

  let urlChamada = '';
  const pdfBytes = Buffer.from('%PDF-1.4 mock pdf content');

  // 1. Chamada com sucesso
  globalThis.fetch = async (inputUrl) => {
    urlChamada = String(inputUrl);
    return new Response(pdfBytes, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  };

  const resPdf = await gerarDanfsePdfRfb(XML_NFSE_LOCACAO_COMPLETA, {
    stc: '1',
    canhoto: true,
  });

  assert.ok(urlChamada.includes('stc=1'));
  assert.ok(urlChamada.includes('canhoto=true'));
  assert.ok(resPdf.pdfBuffer.length > 5);
  assert.strictEqual(resPdf.pdfBuffer.toString('utf-8', 0, 5), '%PDF-');

  // 2. Chamada quando sidecar está offline (HTTP 503)
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ mensagem: 'Service Unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await assert.rejects(
    async () => {
      await gerarDanfsePdfRfb(XML_NFSE_LOCACAO_COMPLETA, { stc: '0' });
    },
    (err) => {
      assert.strictEqual(err.status, 503);
      assert.strictEqual(err.servico, 'rtc-danfse');
      return true;
    }
  );
});

// ============================================================================
// TESTE 5: Proteção anti-XXE e Limite de 5 MB
// ============================================================================
test('5. Segurança: DanfseXmlInputSchema rejeita DOCTYPE/ENTITY anti-XXE e payloads > 5 MB', () => {
  // Rejeição de DOCTYPE (XXE)
  const xmlComDocType = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><NFSe><infNFSe Id="NFS1"></infNFSe></NFSe>`;
  assert.throws(
    () => {
      DanfseXmlInputSchema.parse(xmlComDocType);
    },
    /DOCTYPE ou ENTITY potencialmente vulnerável a XXE/
  );

  // Rejeição de tamanho > 5 MB
  const payloadGigante = '<NFSe>' + 'x'.repeat(6 * 1024 * 1024) + '</NFSe>';
  assert.throws(
    () => {
      DanfseXmlInputSchema.parse(payloadGigante);
    },
    /limite máximo permitido de 5 MB/
  );

  // Restaura fetch
  globalThis.fetch = originalFetch;
});
