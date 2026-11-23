import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { compararParidadeRtc } from '../lib/fiscal/paridade-rfb.ts';
import { POST as postAuditoriaRelatorio } from '../app/api/auditoria-relatorio/route.ts';

const rootDir = process.cwd();

test('Suíte 42 - Motor de Paridade RFB vs. Local e Laudo Pericial Unificado (v6.0.0)', async (t) => {

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Paridade Total Exata (Zero Divergência - HALF_EVEN)
  // --------------------------------------------------------------------------
  await t.test('1. Paridade Total: Resultado Oficial RFB idêntico ao Motor Local', () => {
    const dadosOficial = {
      totais: {
        baseCalculoTotal: 1000.00,
        valorIbsEstadualTotal: 1.00,
        valorIbsMunicipalTotal: 0.00,
        valorIbsTotal: 1.00,
        valorCbsTotal: 9.00,
        valorImpostoSeletivoTotal: 0.00,
        valorTributosTotal: 10.00,
      },
      itens: [
        {
          numero: 1,
          baseCalculo: 1000.00,
          valorIbsEstadual: 1.00,
          valorIbsMunicipal: 0.00,
          valorIbsTotal: 1.00,
          valorCbs: 9.00,
          valorImpostoSeletivo: 0.00,
          valorTributosTotal: 10.00,
        },
      ],
      versaoMotor: '1.0.0-rtc',
      versaoBaseDados: '2026.1',
    };

    const dadosLocal = {
      totais: {
        baseCalculoTotal: '1000.00',
        valorIbsEstadualTotal: '1.00',
        valorIbsMunicipalTotal: '0.00',
        valorIbsTotal: '1.00',
        valorCbsTotal: '9.00',
        valorImpostoSeletivoTotal: '0.00',
        valorTributosTotal: '10.00',
      },
      itens: [
        {
          numero: 1,
          baseCalculo: '1000.00',
          valorIbsEstadual: '1.00',
          valorIbsMunicipal: '0.00',
          valorIbsTotal: '1.00',
          valorCbs: '9.00',
          valorImpostoSeletivo: '0.00',
          valorTributosTotal: '10.00',
        },
      ],
    };

    const resultado = compararParidadeRtc(dadosOficial, dadosLocal, { toleranciaCentavos: 0.00 });

    assert.equal(resultado.paridadeTotal, true);
    assert.equal(resultado.qtdDivergencias, 0);
    assert.equal(resultado.maiorDesvioAbsoluto, '0.00');
    assert.equal(resultado.divergencias.length, 0);
    assert.equal(resultado.metadadosVersao.versaoAplicacaoRfb, '1.0.0-rtc');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Detecção de Divergências e Classificação de Causa Provável
  // --------------------------------------------------------------------------
  await t.test('2. Detecção e Classificação de Divergência: Arredondamento e Base de Cálculo', () => {
    const dadosOficial = {
      totais: {
        baseCalculoTotal: 1000.00,
        valorIbsTotal: 1.00,
        valorCbsTotal: 9.00,
        valorTributosTotal: 10.00,
      },
      itens: [
        {
          numero: 1,
          baseCalculo: 1000.00,
          valorIbsTotal: 1.00,
          valorCbs: 9.00,
          valorTributosTotal: 10.00,
        },
      ],
    };

    const dadosLocalDivergente = {
      totais: {
        baseCalculoTotal: 950.00, // Divergência de base
        valorIbsTotal: 1.01,      // Divergência de centavo (0.01)
        valorCbsTotal: 9.00,
        valorTributosTotal: 10.01,
      },
      itens: [
        {
          numero: 1,
          baseCalculo: 950.00,
          valorIbsTotal: 1.01,
          valorCbs: 9.00,
          valorTributosTotal: 10.01,
        },
      ],
    };

    const resultado = compararParidadeRtc(dadosOficial, dadosLocalDivergente, { toleranciaCentavos: 0.00 });

    assert.equal(resultado.paridadeTotal, false);
    assert.ok(resultado.qtdDivergencias > 0);

    const divCentavo = resultado.divergencias.find(d => d.campo === 'vIBS' && d.numeroItem === 1);
    assert.ok(divCentavo, 'Divergência de IBS no item 1 deve existir');
    assert.equal(divCentavo.causaProvavel, 'ARREDONDAMENTO_HALF_EVEN');
    assert.equal(divCentavo.diferencaAbsoluta, '0.01');

    const divBase = resultado.divergencias.find(d => d.campo === 'vBC' && d.numeroItem === 1);
    assert.ok(divBase, 'Divergência de base de cálculo deve existir');
    assert.equal(divBase.causaProvavel, 'DIVERGENCIA_BASE_CALCULO');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Laudo Pericial Unificado NF-e DAG (HTML & TXT) com Proteção XSS
  // --------------------------------------------------------------------------
  await t.test('3. Emissão de Laudo Pericial NF-e DAG com Paridade e Sanitização XSS', async () => {
    const XSS_PAYLOAD = '<script>alert("hacked")</script>';

    const payloadDag = {
      format: 'html',
      sha256: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      orquestracaoDag: {
        chaveAcesso: '41261100000000000191550010000123451000000010',
        sha256Xml: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        dataEmissao: '2026-11-22',
        etapas: {
          extracao: { totalItens: 2 },
          rtc: {
            motorRtcUtilizado: 'REGIME_REGULAR',
            origemCalculoRtc: 'OFICIAL_RFB',
            duracaoRtcMs: 42,
            validacaoXml: { status: 'VALIDO' },
            totaisRtc: {
              vIbsUf: 2.00,
              vIbsMun: 0.00,
              vCbs: 18.00,
              vIs: 0.00,
              vIvaTotal: 20.00,
            },
          },
          creditos: {
            statusExtincaoFornecedor: 'EXTINTO_SPLIT',
            camadas: {
              totalDestacadoXml: { icms: 36.00, pis: 16.50, cofins: 76.00, ipi: 0.00, ibs: 2.00, cbs: 18.00, total: 148.50 },
              totalCreditoAdmitidoRegra: { icms: 36.00, pis: 16.50, cofins: 76.00, ipi: 0.00, ibs: 2.00, cbs: 18.00, total: 148.50 },
              totalCreditoEfetivadoCusto: { icms: 36.00, pis: 16.50, cofins: 76.00, ipi: 0.00, ibs: 2.00, cbs: 18.00, total: 148.50 },
            },
            retidoAguardandoExtincaoIbsCbs: { total: 0.00 },
          },
          custosEPrecificacao: {
            comparativoRegimes: {
              SIMPLES_TRADICIONAL: {
                regime: 'SIMPLES_TRADICIONAL',
                nomeExibicao: 'Simples Nacional Tradicional',
                cmvLiquidoTotal: 2000.00,
                creditosAproveitados: 0.00,
                precoVendaSugerido: 2600.00,
                margemLiquidaPct: 15.00,
                cargaTributariaEfetivaPct: 8.50,
                melhorCenario: false,
                justificativa: 'Sem aproveitamento pleno de créditos de IBS/CBS.',
              },
              SIMPLES_HIBRIDO_2027: {
                regime: 'SIMPLES_HIBRIDO_2027',
                nomeExibicao: 'Simples Nacional Híbrido (2027)',
                cmvLiquidoTotal: 1851.50,
                creditosAproveitados: 148.50,
                precoVendaSugerido: 2500.00,
                margemLiquidaPct: 18.20,
                cargaTributariaEfetivaPct: 6.80,
                melhorCenario: true,
                justificativa: `Enquadramento ótimo com transferência e crédito pleno ${XSS_PAYLOAD}`,
              },
              LUCRO_PRESUMIDO: {
                regime: 'LUCRO_PRESUMIDO',
                nomeExibicao: 'Lucro Presumido',
                cmvLiquidoTotal: 1950.00,
                creditosAproveitados: 36.00,
                precoVendaSugerido: 2750.00,
                margemLiquidaPct: 14.10,
                cargaTributariaEfetivaPct: 11.20,
                melhorCenario: false,
                justificativa: 'Carga cumulativa de PIS/COFINS.',
              },
              LUCRO_REAL: {
                regime: 'LUCRO_REAL',
                nomeExibicao: 'Lucro Real',
                cmvLiquidoTotal: 1851.50,
                creditosAproveitados: 148.50,
                precoVendaSugerido: 2520.00,
                margemLiquidaPct: 17.50,
                cargaTributariaEfetivaPct: 7.40,
                melhorCenario: false,
                justificativa: 'Equilíbrio pleno mas custos administrativos superiores.',
              },
            },
          },
        },
      },
      paridadeRfb: {
        paridadeTotal: true,
        qtdItensComparados: 2,
        qtdDivergencias: 0,
        maiorDesvioAbsoluto: '0.00',
        metadadosVersao: {
          versaoAplicacaoRfb: 'v1.0',
          motorLocalVersao: 'v6.0.0',
        },
      },
    };

    const reqHtml = new Request('http://localhost:3000/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadDag),
    });

    const resHtml = await postAuditoriaRelatorio(reqHtml);
    assert.equal(resHtml.status, 200);
    assert.equal(resHtml.headers.get('content-type'), 'text/html; charset=utf-8');

    const htmlBody = await resHtml.text();
    // 1. Garantir que o XSS foi neutralizado
    assert.equal(htmlBody.includes('<script>alert("hacked")</script>'), false, 'Não deve conter tags de script brutas');
    assert.ok(htmlBody.includes('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;'), 'Deve conter script escapado');

    // 2. Garantir presença de seções do DAG e Paridade
    assert.ok(htmlBody.includes('Orquestrador Fiscal DAG'), 'Deve renderizar título do DAG');
    assert.ok(htmlBody.includes('Classificação Tripartida de Créditos Tributários na Entrada'), 'Deve renderizar tabela tripartida');
    assert.ok(htmlBody.includes('Comparativo e Simulação dos 4 Regimes Tributários'), 'Deve renderizar comparativo 4 regimes');
    assert.ok(htmlBody.includes('Paridade Total (Zero Divergência)'), 'Deve renderizar selo de paridade');
    assert.ok(htmlBody.includes('v6.0.0'), 'Deve referenciar v6.0.0');

    // Teste correspondente em TXT
    const payloadTxt = { ...payloadDag, format: 'txt' };
    const reqTxt = new Request('http://localhost:3000/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadTxt),
    });

    const resTxt = await postAuditoriaRelatorio(reqTxt);
    assert.equal(resTxt.status, 200);
    assert.equal(resTxt.headers.get('content-type'), 'text/plain; charset=utf-8');

    const txtBody = await resTxt.text();
    assert.ok(txtBody.includes('Orquestrador Fiscal DAG'), 'TXT deve conter DAG');
    assert.ok(txtBody.includes('CLASSIFICAÇÃO TRIPARTIDA DE CRÉDITOS'), 'TXT deve conter seção de créditos');
    assert.ok(txtBody.includes('COMPARATIVO DOS 4 REGIMES TRIBUTÁRIOS'), 'TXT deve conter comparativo de regimes');
    assert.ok(txtBody.includes('PARIDADE TOTAL (Zero Divergência)'), 'TXT deve conter status de paridade');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Laudo Pericial NFS-e / DPS Nacional (HTML & TXT)
  // --------------------------------------------------------------------------
  await t.test('4. Emissão de Laudo Pericial NFS-e com CIB e Retenções', async () => {
    const payloadNfse = {
      format: 'html',
      auditoriaNfse: {
        sucesso: true,
        validoParaEmissao: true,
        extracao: {
          tipoDocumento: 'NFSE_NACIONAL',
          sha256: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          identificacao: {
            nNFSe: '998877',
            serie: '1',
            dhEmi: '2026-11-20T10:00:00Z',
            dCompet: '2026-11-20',
            chNFSe: '412611000000000001915500100009988771000000010',
            temNt004: true,
            temNt007: true,
            temNt008: true,
            temNt009: true,
          },
          prestador: {
            cnpj: '11.222.333/0001-44',
            xNome: 'Engenharia & Locações Corporativas Ltda',
            optanteSimplesNacional: false,
          },
          tomador: {
            cnpj: '99.888.777/0001-66',
            xNome: 'Indústria Metalúrgica Paranaense S/A',
            endereco: { xLgr: 'Av. das Indústrias, 1000', cMun: '4106902', xMun: 'Curitiba' },
          },
          servico: {
            cTribNac: '07.02.01',
            cNBS: '1.0203.04.05',
            xDescServ: 'Locação e manutenção de andaimes de alta sustentação em canteiro de obras',
          },
          valores: {
            vServ: 50000.00,
            vLiq: 45325.00,
            vRetIRRF: 750.00,
            vRetCSLL: 500.00,
            vPIS: 325.00,
            vCOFINS: 1500.00,
            vISSQN: 1600.00,
            vTotalRet: 4675.00,
          },
          reformaTributaria: {
            presente: true,
            cib: 'PR87654321',
            inscImobFisc: '98765-4',
            vIBSUF: 50.00,
            pIBSUF: 0.10,
            vIBSMun: 0.00,
            pIBSMun: 0.00,
            vCBS: 450.00,
            pCBS: 0.90,
            vIBS: 50.00,
            gLocacao: { nContrato: 'LOC-2026-99' },
          },
        },
        creditosTomador: {
          pisCofinsLucroReal: {
            admitido: true,
            valorPis: 825.00,
            valorCofins: 3800.00,
            justificativa: 'Insumo essencial com direito a crédito sob o regime não cumulativo.',
          },
          ibsCbsReforma: {
            admitido: true,
            valorIbs: 50.00,
            valorCbs: 450.00,
            statusExtincao: 'EXTINTO_SPLIT',
            retidoAguardandoExtincao: false,
            justificativa: 'Crédito admitido após liquidação via Split Payment.',
          },
        },
        alertas: [
          {
            severidade: 'INFO',
            codigo: 'CIB_VINCULADO_COM_SUCESSO',
            titulo: 'CIB Vinculado ao Serviço Imobiliário',
            detalhe: 'Identificador CIB PR87654321 registrado conforme NT 009.',
            baseLegal: 'Art. 265 da LC nº 214/2025',
          },
        ],
      },
    };

    const reqHtml = new Request('http://localhost:3000/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadNfse),
    });

    const resHtml = await postAuditoriaRelatorio(reqHtml);
    assert.equal(resHtml.status, 200);

    const htmlBody = await resHtml.text();
    assert.ok(htmlBody.includes('Auditoria Pericial de NFS-e / DPS Nacional'), 'HTML deve conter seção de NFS-e');
    assert.ok(htmlBody.includes('PR87654321'), 'HTML deve conter número do CIB');
    assert.ok(htmlBody.includes('Art. 265 da LC nº 214/2025'), 'HTML deve citar base legal');
    assert.ok(htmlBody.includes('Engenharia &amp; Locações Corporativas Ltda'), 'HTML deve ter razão do prestador escapada');
    assert.ok(htmlBody.includes('Quadro de Retenções Tributárias na Fonte'), 'HTML deve ter quadro de retenções');

    // Teste correspondente em TXT
    const payloadTxt = { ...payloadNfse, format: 'txt' };
    const reqTxt = new Request('http://localhost:3000/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadTxt),
    });

    const resTxt = await postAuditoriaRelatorio(reqTxt);
    assert.equal(resTxt.status, 200);

    const txtBody = await resTxt.text();
    assert.ok(txtBody.includes('Auditoria Pericial de NFS-e / DPS Padrão Nacional'), 'TXT deve conter seção de NFS-e');
    assert.ok(txtBody.includes('CIB: PR87654321'), 'TXT deve conter CIB');
    assert.ok(txtBody.includes('RETENÇÕES NA FONTE'), 'TXT deve conter retenções na fonte');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Integridade do Script validar-stack-rfb.ps1 e .gitattributes
  // --------------------------------------------------------------------------
  await t.test('5. Integridade do Script de Validação e .gitattributes', () => {
    const gitattrPath = path.join(rootDir, '.gitattributes');
    assert.ok(fs.existsSync(gitattrPath), 'Arquivo .gitattributes deve existir na raiz');
    const gitattrContent = fs.readFileSync(gitattrPath, 'utf8');
    assert.ok(gitattrContent.includes('* text=auto eol=lf'), '.gitattributes deve definir text=auto eol=lf');
    assert.ok(gitattrContent.includes('*.ps1 text eol=crlf'), '.gitattributes deve definir *.ps1 text eol=crlf');

    const scriptStackPath = path.join(rootDir, 'scripts', 'validar-stack-rfb.ps1');
    assert.ok(fs.existsSync(scriptStackPath), 'Script validar-stack-rfb.ps1 deve existir');
    const scriptContent = fs.readFileSync(scriptStackPath, 'utf8');
    assert.equal(scriptContent.includes('&&'), false, 'NUNCA deve utilizar && em scripts PowerShell');
    assert.ok(scriptContent.includes('OnlyConfigCheck'), 'Script deve aceitar parâmetro OnlyConfigCheck');
    assert.ok(scriptContent.includes('SkipDockerUp'), 'Script deve aceitar parâmetro SkipDockerUp');
  });
});
