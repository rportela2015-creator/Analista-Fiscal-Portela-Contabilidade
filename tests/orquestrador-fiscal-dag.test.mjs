/**
 * Suíte de Testes Automatizados: Orquestrador Fiscal DAG
 * Analista Fiscal Portela Contabilidade — Ciclo 6 (Sub-etapa 19.5)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { orquestrarAnaliseNfeCompleta } from '../lib/engine/orquestrador-fiscal.ts';
import { getInMemoryEmpresasRepositoryForTests } from '../lib/db/empresas-repository.ts';
import { getInMemoryDocumentosRepositoryForTests } from '../lib/db/documentos-repository.ts';

const originalFetch = globalThis.fetch;

// ============================================================================
// XML BASE PARA OS TESTES DA NF-E
// ============================================================================
function gerarXmlNfeMock(params = {}) {
  const data = params.data || '2026-11-20T10:00:00-03:00';
  const tagIbsCbs = params.comTagIbsCbs
    ? '<IBSCBS><vIBS>1.00</vIBS><vCBS>88.00</vCBS></IBSCBS>'
    : '';
  const num = params.numero || '1234';

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe412611000000000001915500100000${num}1000001234">
      <ide>
        <nNF>${num}</nNF>
        <serie>1</serie>
        <dhEmi>${data}</dhEmi>
        <tpNF>0</tpNF>
      </ide>
      <emit>
        <CNPJ>00000000000191</CNPJ>
        <xNome>FORNECEDOR PAULISTA S.A.</xNome>
        <UF>SP</UF>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>33000167000101</CNPJ>
        <xNome>PORTELA CLIENTE LTDA</xNome>
        <UF>PR</UF>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>PROD-001</cProd>
          <xProd>EQUIPAMENTO USO E CONSUMO</xProd>
          <NCM>84713012</NCM>
          <CFOP>6102</CFOP>
          <uCom>UN</uCom>
          <qCom>1.0000</qCom>
          <vUnCom>1000.0000</vUnCom>
          <vProd>1000.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <vBC>1000.00</vBC>
              <pICMS>12.00</pICMS>
              <vICMS>120.00</vICMS>
            </ICMS00>
          </ICMS>
          ${tagIbsCbs}
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vProd>1000.00</vProd>
          <vNF>1000.00</vNF>
          <vICMS>120.00</vICMS>
          <vST>0.00</vST>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

// Helpers para gerar payloads de resposta oficiais dos microsserviços RFB
function gerarRespostaRocOficial(vCbs = '88.00', vIbsEst = '0.90', vIbsMun = '0.10') {
  const vIbs = (Number(vIbsEst) + Number(vIbsMun)).toFixed(2);
  return {
    id: 'op-mock-1',
    versao: '1.0.0',
    objetos: [
      {
        nObj: 1,
        estadoItem: 'CALCULADO',
        tribCalc: {
          IBSCBS: {
            CST: '000',
            cClassTrib: '000001',
            gIBSCBS: {
              vBC: '1000.00',
              gIBSUF: { pIBSUF: '0.09', vIBSUF: vIbsEst },
              gIBSMun: { pIBSMun: '0.01', vIBSMun: vIbsMun },
              vIBS: vIbs,
              gCBS: { pCBS: '8.80', vCBS: vCbs },
            },
          },
        },
      },
    ],
    total: {
      tribCalc: {
        IBSCBSTot: {
          vBCIBSCBS: '1000.00',
          gIBS: { vIBS: vIbs },
          gCBS: { vCBS: vCbs },
        },
      },
    },
  };
}

function gerarRespostaSimplesOficial(vCbs = '0.00', vIbs = '0.00') {
  return {
    id: 'sn-mock-1',
    versao: '1.0.0',
    objetos: [
      {
        nObj: 1,
        estadoItem: 'CALCULADO',
        tribCalc: {
          IBSCBSSN: {
            cAtivSN: '1',
            cClassTrib: '000001',
            gIBSCBSSN: {
              vBC: '1000.00',
              pCBSSN: '0.00',
              vCBSSN: vCbs,
              pIBSSN: '0.00',
              vIBSSN: vIbs,
            },
          },
        },
      },
    ],
    total: {
      tribCalc: {
        IBSCBSTot: {
          vBCIBSCBS: '1000.00',
          gCBS: { vCBS: vCbs },
          gIBS: { vIBS: vIbs },
        },
      },
    },
  };
}

// ============================================================================
// TESTE 1: Ordem Causal 2027 (DAG): Enriquecimento de IBS/CBS na Base do ICMS
// ============================================================================
test('1. Ordem Causal 2027 (DAG): RTC alimenta DIFAL PR (Consulta 48/2026 vs Tese Judicial)', async () => {
  // Mock dos sidecars RFB: rtc-regime-regular responde vCBS = 88.00 e vIBS = 1.00 (estadual 0.90 + municipal 0.10)
  globalThis.fetch = async (inputUrl) => {
    const url = String(inputUrl);
    if (url.includes('/regime-geral')) {
      return new Response(JSON.stringify(gerarRespostaRocOficial('88.00', '0.90', '0.10')), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-calc-app-version': '1.36.0',
          'x-calc-db-version': '2027.01.01',
        },
      });
    }
    return new Response(JSON.stringify({ valido: true }), { status: 200 });
  };

  const xml2027 = gerarXmlNfeMock({ data: '2027-03-15T10:00:00-03:00', numero: '202701' });

  // Cenário A: Consulta SEFA/PR nº 48/2026 (incluirIbsCbsBcIcms = true)
  const res1 = await orquestrarAnaliseNfeCompleta({
    xml: xml2027,
    destinacaoPadrao: 'uso_consumo',
    perfilAdquirente: {
      regime: 'LUCRO_REAL',
      beneficiosParana: {
        diferimentoParcialArt28: true,
        optanteRotSt: false,
        regimeEspecialSefaPr: 'Consulta 48/2026 SEFA/PR',
        reducoesBcAtivas: [],
      },
    },
  });

  assert.strictEqual(res1.etapas.rtc.totaisRtc.vCbs, 88.0);
  assert.strictEqual(res1.etapas.rtc.totaisRtc.vIbsTotal, 1.0);
  // Base Dupla com IBS/CBS: bcExterna = 1000 - 120 + 89 = 969.00 -> bcInterna = 969 / 0.805 = 1203.73 -> difal = 114.73
  assert.strictEqual(res1.etapas.icmsPr.resumoDifal.totalDifalGeral, 114.73);

  // Cenário B: Tese Judicial (incluirIbsCbsBcIcms = false)
  const res2 = await orquestrarAnaliseNfeCompleta({
    xml: xml2027,
    destinacaoPadrao: 'uso_consumo',
    perfilAdquirente: {
      regime: 'LUCRO_REAL',
      beneficiosParana: {
        diferimentoParcialArt28: false,
        optanteRotSt: false,
        reducoesBcAtivas: [],
      },
    },
  });

  // Base Dupla sem IBS/CBS: bcExterna = 1000 - 120 = 880.00 -> bcInterna = 880 / 0.805 = 1093.17 -> difal = 93.17
  assert.strictEqual(res2.etapas.icmsPr.resumoDifal.totalDifalGeral, 93.17);
});

// ============================================================================
// TESTE 2: Roteamento Determinístico por Perfil Bitemporal
// ============================================================================
test('2. Roteamento por Perfil Bitemporal: Simples Tradicional (2026) vs Simples Híbrido (2027)', async () => {
  const empresasRepo = getInMemoryEmpresasRepositoryForTests();
  empresasRepo.limparParaTestes();

  // Cria empresa com perfil 2026 Simples Tradicional
  const emp = await empresasRepo.criar({
    cnpj: '00.000.000/0001-91',
    razaoSocial: 'Auto Peças Portela LTDA',
    uf: 'PR',
    perfilInicial: {
      regimeTributario: 'SIMPLES_NACIONAL',
      vigenciaInicio: '2026-01-01',
      vigenciaFim: '2026-12-31',
      simplesOptanteHibrido2027: false,
    },
  });

  // Adiciona perfil 2027 Simples Híbrido
  await empresasRepo.adicionarPerfil(emp.id, {
    regimeTributario: 'SIMPLES_NACIONAL',
    vigenciaInicio: '2027-01-01',
    vigenciaFim: null,
    simplesOptanteHibrido2027: true,
  });

  let endpointChamado = '';
  globalThis.fetch = async (inputUrl) => {
    const url = String(inputUrl);
    endpointChamado = url;
    if (url.includes('/nao-assistido')) {
      return new Response(JSON.stringify(gerarRespostaSimplesOficial('0.00', '0.00')), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-calc-app-version': '3.2.0' },
      });
    }
    if (url.includes('/regime-geral')) {
      return new Response(JSON.stringify(gerarRespostaRocOficial('88.00', '0.90', '0.10')), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-calc-app-version': '1.36.0' },
      });
    }
    return new Response(JSON.stringify({ valido: true }), { status: 200 });
  };

  // 1. NF-e em 2026-11-20 -> Simples Tradicional
  const xml2026 = gerarXmlNfeMock({ data: '2026-11-20T10:00:00-03:00', numero: '202601' });
  const res2026 = await orquestrarAnaliseNfeCompleta({
    xml: xml2026,
    empresaId: emp.id,
    empresasRepo,
  });
  assert.strictEqual(res2026.etapas.rtc.motorRtcUtilizado, 'SIMPLES_NACIONAL');
  assert.ok(endpointChamado.includes('/nao-assistido'));

  // 2. NF-e em 2027-02-10 -> Simples Híbrido (chama Regime Regular)
  const xml2027 = gerarXmlNfeMock({ data: '2027-02-10T10:00:00-03:00', numero: '202702' });
  const res2027 = await orquestrarAnaliseNfeCompleta({
    xml: xml2027,
    empresaId: emp.id,
    empresasRepo,
  });
  assert.strictEqual(res2027.etapas.rtc.motorRtcUtilizado, 'REGIME_REGULAR');
  assert.ok(endpointChamado.includes('/regime-geral'));
});

// ============================================================================
// TESTE 3: Validação XML /xml/validate da Reforma Tributária
// ============================================================================
test('3. Validação XML /xml/validate: Inconsistência estrutural detectada pelo sidecar oficial', async () => {
  globalThis.fetch = async (inputUrl) => {
    const url = String(inputUrl);
    if (url.includes('/xml/validate')) {
      // Mock do sidecar rejeitando os grupos XML da Reforma
      return new Response(JSON.stringify(false), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/regime-geral')) {
      return new Response(JSON.stringify(gerarRespostaRocOficial('88.00', '0.90', '0.10')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ valido: true }), { status: 200 });
  };

  // XML contendo tags de IBS/CBS estruturalmente inválidas
  const xmlComIbsInvalido = gerarXmlNfeMock({
    data: '2027-01-15T10:00:00-03:00',
    comTagIbsCbs: true,
  });

  const res = await orquestrarAnaliseNfeCompleta({
    xml: xmlComIbsInvalido,
    validarGruposXmlRtc: true,
    perfilAdquirente: { regime: 'LUCRO_REAL' },
  });

  assert.ok(res.etapas.rtc.validacaoXml);
  assert.strictEqual(res.etapas.rtc.validacaoXml.executada, true);
  assert.strictEqual(res.etapas.rtc.validacaoXml.valido, false);
  assert.strictEqual(res.etapas.rtc.validacaoXml.status, 'INVALIDO');
  assert.ok(res.etapas.rtc.validacaoXml.erros && res.etapas.rtc.validacaoXml.erros.length > 0);
  assert.ok(
    res.etapas.rtc.validacaoXml.erros.some((e) =>
      e.includes('rejeitou os grupos XML da Reforma Tributária')
    )
  );
});

// ============================================================================
// TESTE 4: Créditos 3 Camadas: Retenção Art. 47 em AGUARDANDO_EXTINCAO
// ============================================================================
test('4. Créditos 3 Camadas: Retenção Art. 47 em AGUARDANDO_EXTINCAO vs Apropriação em EXTINTO_SPLIT', async () => {
  globalThis.fetch = async (inputUrl) => {
    const url = String(inputUrl);
    if (url.includes('/regime-geral')) {
      return new Response(JSON.stringify(gerarRespostaRocOficial('88.00', '0.90', '0.10')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ valido: true }), { status: 200 });
  };

  const xml2027 = gerarXmlNfeMock({ data: '2027-04-10T10:00:00-03:00', numero: '4444' });

  // 1. Cenário AGUARDANDO_EXTINCAO: Crédito retido
  const resAguardando = await orquestrarAnaliseNfeCompleta({
    xml: xml2027,
    statusExtincaoRtc: 'AGUARDANDO_EXTINCAO',
    perfilAdquirente: { regime: 'LUCRO_REAL' },
    destinacaoPadrao: 'comercializacao',
  });

  assert.strictEqual(resAguardando.etapas.creditos.retidoAguardandoExtincaoIbsCbs.total, 89.0);
  assert.strictEqual(resAguardando.etapas.creditos.camadas.totalCreditoEfetivadoCusto.ibs, 0);
  assert.strictEqual(resAguardando.etapas.creditos.camadas.totalCreditoEfetivadoCusto.cbs, 0);

  // 2. Cenário EXTINTO_SPLIT: Crédito efetivado no CMV
  const resExtinto = await orquestrarAnaliseNfeCompleta({
    xml: xml2027,
    statusExtincaoRtc: 'EXTINTO_SPLIT',
    perfilAdquirente: { regime: 'LUCRO_REAL' },
    destinacaoPadrao: 'comercializacao',
  });

  assert.strictEqual(resExtinto.etapas.creditos.retidoAguardandoExtincaoIbsCbs.total, 0);
  assert.strictEqual(resExtinto.etapas.creditos.camadas.totalCreditoEfetivadoCusto.ibs, 1.0);
  assert.strictEqual(resExtinto.etapas.creditos.camadas.totalCreditoEfetivadoCusto.cbs, 88.0);

  // Comparativo de 4 regimes deve estar preenchido
  const comp = resExtinto.etapas.custosEPrecificacao.comparativoRegimes;
  assert.ok(comp.SIMPLES_TRADICIONAL);
  assert.ok(comp.SIMPLES_HIBRIDO_2027);
  assert.ok(comp.LUCRO_PRESUMIDO);
  assert.ok(comp.LUCRO_REAL);

  const melhor = [comp.SIMPLES_TRADICIONAL, comp.SIMPLES_HIBRIDO_2027, comp.LUCRO_PRESUMIDO, comp.LUCRO_REAL].find((c) => c.melhorCenario);
  assert.ok(melhor, 'Deve haver um regime eleito como o melhor cenário');
});

// ============================================================================
// TESTE 5: Persistência Auditável e Idempotente
// ============================================================================
test('5. Persistência Auditável e Idempotente: Execução 2x sem duplicação de documento', async () => {
  const docsRepo = getInMemoryDocumentosRepositoryForTests();
  docsRepo.limparParaTestes();

  globalThis.fetch = async () => {
    return new Response(JSON.stringify(gerarRespostaRocOficial('0.00', '0.00', '0.00')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const xmlDoc = gerarXmlNfeMock({ numero: '5555' });
  const empresaId = '00000000-0000-4000-8000-000000000099';

  // 1ª Execução
  const res1 = await orquestrarAnaliseNfeCompleta({
    xml: xmlDoc,
    empresaId,
    persistir: true,
    documentosRepo: docsRepo,
  });

  assert.ok(res1.etapas.persistencia);
  assert.strictEqual(res1.etapas.persistencia?.salvo, true);
  assert.strictEqual(res1.etapas.persistencia?.documentoJaExistia, false);
  const docId1 = res1.etapas.persistencia?.documentoId;
  assert.ok(docId1);

  // 2ª Execução com a mesma chave e mesma empresa
  const res2 = await orquestrarAnaliseNfeCompleta({
    xml: xmlDoc,
    empresaId,
    persistir: true,
    documentosRepo: docsRepo,
  });

  assert.ok(res2.etapas.persistencia);
  assert.strictEqual(res2.etapas.persistencia?.salvo, true);
  assert.strictEqual(res2.etapas.persistencia?.documentoJaExistia, true);
  assert.strictEqual(res2.etapas.persistencia?.documentoId, docId1);

  // Repositório de documentos deve ter apenas 1 documento gravado
  const docsNaEmpresa = await docsRepo.listarPorEmpresa(empresaId);
  assert.strictEqual(docsNaEmpresa.length, 1);

  // Repositório de execuções deve conter 2 registros distintos
  const execucoes = await docsRepo.listarExecucoes(empresaId);
  assert.strictEqual(execucoes.length, 2);

  // Restaura fetch
  globalThis.fetch = originalFetch;
});
