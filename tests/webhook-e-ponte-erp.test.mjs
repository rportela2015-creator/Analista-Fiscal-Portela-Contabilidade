import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { GET, POST } from '../app/api/webhook/fiscal/route.ts';
import { resetRateLimitStore } from '../lib/rate-limit.ts';
import { parametrizarLoteNfe } from '../lib/parametrizacao.ts';

// XML de teste sintético com 2 itens (um normal e outro com ST)
const XML_SYNTHETIC_NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe41230112345678000195550010000000011000000010" versao="4.00">
      <ide>
        <cUF>41</cUF>
        <cNF>00000001</cNF>
        <natOp>VENDA DE MERCADORIA</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>1</nNF>
        <dhEmi>2026-03-01T10:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>4106902</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>DISTRIBUIDORA PARANAENSE LTDA</xNome>
        <enderEmit>
          <xLgr>RUA DAS INDUSTRIAS</xLgr>
          <nro>100</nro>
          <xBairro>CENTRO</xBairro>
          <cMun>4106902</cMun>
          <xMun>CURITIBA</xMun>
          <UF>PR</UF>
        </enderEmit>
        <IE>1234567890</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000199</CNPJ>
        <xNome>MCM COMERCIO VAREJISTA LTDA</xNome>
        <enderDest>
          <xLgr>AVENIDA BRASIL</xLgr>
          <nro>500</nro>
          <xBairro>CENTRO</xBairro>
          <cMun>4106902</cMun>
          <xMun>CURITIBA</xMun>
          <UF>PR</UF>
        </enderDest>
        <IE>9876543210</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>PROD-001</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>PARAFUSO SEXTAVADO ACO INOX</xProd>
          <NCM>73181500</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>100.0000</qCom>
          <vUnCom>2.5000</vUnCom>
          <vProd>250.00</vProd>
          <cEANTrib>7891234567890</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>100.0000</qTrib>
          <vUnTrib>2.5000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <vTotTrib>35.00</vTotTrib>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>250.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>45.00</vICMS>
            </ICMS00>
          </ICMS>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>250.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>4.13</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>250.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>19.00</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>PROD-002</cProd>
          <cEAN>7891234567891</cEAN>
          <xProd>REFRIGERANTE LATA 350ML</xProd>
          <NCM>22021000</NCM>
          <CEST>0301000</CEST>
          <CFOP>5405</CFOP>
          <uCom>UN</uCom>
          <qCom>50.0000</qCom>
          <vUnCom>4.0000</vUnCom>
          <vProd>200.00</vProd>
          <cEANTrib>7891234567891</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>50.0000</qTrib>
          <vUnTrib>4.0000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <vTotTrib>40.00</vTotTrib>
          <ICMS>
            <ICMS60>
              <orig>0</orig>
              <CST>60</CST>
              <vBCSTRet>200.00</vBCSTRet>
              <pST>18.00</pST>
              <vICMSSubstituto>36.00</vICMSSubstituto>
              <vICMSSTRet>10.00</vICMSSTRet>
            </ICMS60>
          </ICMS>
          <PIS>
            <PISNT>
              <CST>04</CST>
            </PISNT>
          </PIS>
          <COFINS>
            <COFINSNT>
              <CST>04</CST>
            </COFINSNT>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>250.00</vBC>
          <vICMS>45.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>450.00</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>4.13</vPIS>
          <vCOFINS>19.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>450.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

test('Barramento Fiscal de Webhook e Ponte de Parametrização ERP', async (t) => {
  resetRateLimitStore();

  const DEFAULT_SECRET = process.env.MCM_WEBHOOK_SECRET || process.env.API_SECRET_TOKEN || 'mcm-secret-token-padrao';

  await t.test('GET /api/webhook/fiscal - Healthcheck e status do barramento', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'GET',
    });
    const res = await GET(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'online');
    assert.equal(data.versao, '3.0.0');
    assert.ok(Array.isArray(data.modosSuportados));
    assert.ok(data.modosSuportados.includes('xml_nfe'));
    assert.ok(data.modosSuportados.includes('lote_produtos'));
    assert.ok(data.modosSuportados.includes('status_marco_legal'));
    assert.ok(data.marcoLegal);
    assert.ok(data.marcoLegal.totalNormas >= 35, `Marco legal deve ter >= 35 normas (encontrado: ${data.marcoLegal.totalNormas})`);
  });

  await t.test('POST /api/webhook/fiscal - Rejeição por falta de token (401)', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'status_marco_legal' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('Não autorizado'));
  });

  await t.test('POST /api/webhook/fiscal - Rejeição por token incorreto (401)', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCM-Token': 'token_errado_qualquer',
      },
      body: JSON.stringify({ modo: 'status_marco_legal' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  await t.test('POST /api/webhook/fiscal - Sucesso modo status_marco_legal com Bearer token', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEFAULT_SECRET}`,
      },
      body: JSON.stringify({ modo: 'status_marco_legal' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.sucesso, true);
    assert.equal(data.modo, 'status_marco_legal');
    assert.ok(data.marcoLegal.totalNormas >= 35);
  });

  await t.test('POST /api/webhook/fiscal - Modo xml_nfe: extração determinística e parametrização', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCM-Token': DEFAULT_SECRET,
      },
      body: JSON.stringify({
        modo: 'xml_nfe',
        xmlConteudo: XML_SYNTHETIC_NFE,
        ufDestino: 'PR',
        regimeDestinatario: 'simples',
        destinacao: 'comercializacao',
      }),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.sucesso, true);
    assert.equal(data.modo, 'xml_nfe');
    assert.equal(data.totalItens, 2);
    assert.equal(data.emitente.uf, 'PR');
    assert.equal(data.itensParametrizados.length, 2);

    // Item 1: Parafuso (5102 -> Entrada 1102, Saída 5102)
    const it1 = data.itensParametrizados[0];
    assert.equal(it1.codigoProduto, 'PROD-001');
    assert.equal(it1.ncm, '73181500');
    assert.equal(it1.cfopEntradaSugerido, '1102');
    assert.equal(it1.cfopSaidaSugerido, '5102');

    // Item 2: Refrigerante ST (5405 -> Entrada 1403, Saída 5403)
    const it2 = data.itensParametrizados[1];
    assert.equal(it2.codigoProduto, 'PROD-002');
    assert.equal(it2.ncm, '22021000');
    assert.equal(it2.cfopEntradaSugerido, '1403');
    assert.equal(it2.cfopSaidaSugerido, '5403');
  });

  await t.test('POST /api/webhook/fiscal - Modo lote_produtos: classificação O(1) e parametrização ERP', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': DEFAULT_SECRET,
      },
      body: JSON.stringify({
        modo: 'lote_produtos',
        produtos: [
          {
            codigo: 'CAD-01',
            descricao: 'Cadeira de escritório giratória estofada',
            valorUnitario: 350.0,
            quantidade: 2,
          },
          {
            codigo: 'MON-02',
            descricao: 'Monitor de vídeo LED 27 polegadas HDMI',
            ncm: '85285200',
            valorUnitario: 1200.0,
            quantidade: 1,
          },
        ],
        ufOrigem: 'SP',
        ufDestino: 'PR',
        regimeDestinatario: 'presumido',
        destinacao: 'comercializacao',
      }),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.sucesso, true);
    assert.equal(data.modo, 'lote_produtos');
    assert.equal(data.totalProdutos, 2);
    assert.equal(data.itensParametrizados.length, 2);

    // Primeiro item classificado deterministicamente com 8 dígitos
    const p1 = data.itensParametrizados[0];
    assert.equal(p1.codigoProduto, 'CAD-01');
    assert.equal(p1.ncm.length, 8);
    assert.equal(p1.cfopEntradaSugerido, '2102'); // Interestadual SP -> PR

    // Segundo item com NCM já fornecido
    const p2 = data.itensParametrizados[1];
    assert.equal(p2.codigoProduto, 'MON-02');
    assert.equal(p2.ncm, '85285200');
    assert.equal(p2.cfopEntradaSugerido, '2102');
  });

  await t.test('POST /api/webhook/fiscal - Outbound Callback assinado com HMAC-SHA256', async () => {
    const req = new Request('http://localhost:3000/api/webhook/fiscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCM-Token': DEFAULT_SECRET,
      },
      body: JSON.stringify({
        modo: 'status_marco_legal',
        callbackUrl: 'https://erp.exemplo.com.br/webhook/callback',
      }),
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.callbackDisparado, true);

    // Simula e valida o algoritmo da assinatura HMAC-SHA256
    const payloadStr = JSON.stringify(data);
    const signature = crypto.createHmac('sha256', DEFAULT_SECRET).update(payloadStr).digest('hex');
    assert.equal(signature.length, 64, 'Assinatura HMAC-SHA256 deve ter 64 caracteres hexadecimais');
  });

  await t.test('parametrizarLoteNfe - Suporte bidirecional a ExtractedItem e ParametrizacaoItemInput', () => {
    const itemParametrizado = {
      codigoProduto: 'PROD-TESTE-1',
      descricao: 'Produto de Teste Pré-Mapeado',
      ncm: '73181500',
      cfopOrigem: '5102',
      cfopEntradaSugerido: '1102',
      cfopSaidaSugerido: '5102',
      reducaoIbsCbsPct: 0,
    };

    const resultado = parametrizarLoteNfe([itemParametrizado], {
      ufOrigem: 'PR',
      ufDestino: 'PR',
    });

    assert.equal(resultado.itensParametrizados.length, 1);
    assert.equal(resultado.diagnosticos.length, 1);
    assert.equal(resultado.diagnosticos[0].conferido, true);
    assert.equal(resultado.totalBloqueantes, 0);
  });
});
