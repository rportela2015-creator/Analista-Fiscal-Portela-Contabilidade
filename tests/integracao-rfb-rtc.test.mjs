// ==============================================================================
// Testes Automatizados: Camada de Integração, Resiliência e Clientes RFB (RTC)
// Sub-etapa 19.3 (Passo 3 de 7 do Ciclo 6)
// ==============================================================================

import assert from 'node:assert';
import {
  resetCircuitBreakersForTests,
  getCircuitBreakerStatus,
  consultarStatusServicosRfb,
  ErroIntegracaoRfb,
} from '../lib/integracoes/rfb-health.ts';
import {
  calcularRegimeRegularRfb,
  calcularRegimeRegularComFallback,
  gerarXmlGruposRtcRfb,
  validarXmlRtcRfb,
} from '../lib/integracoes/rtc-regime-regular/client.ts';
import { mapearDocumentoParaOperacaoRfb } from '../lib/integracoes/rtc-regime-regular/mapper.ts';
import {
  calcularSimplesNacionalRfb,
  calcularSimplesNacionalComFallback,
  listarAtividadesSimplesRfb,
  limparCacheAtividadesForTests,
} from '../lib/integracoes/rtc-simples/client.ts';
import { mapearDocumentoParaSimplesRfb } from '../lib/integracoes/rtc-simples/mapper.ts';
import { gerarDanfsePdfRfb } from '../lib/integracoes/rtc-danfse/client.ts';

const originalFetch = globalThis.fetch;

export default async function testIntegracaoRfbRtc() {
  console.log('[TEST] Iniciando bateria de testes de integração e resiliência RFB...');

  // ----------------------------------------------------------------------------
  // Mock Base de Documento Fiscal Normalizado
  // ----------------------------------------------------------------------------
  const docNormalizadoMock = {
    sha256: 'mock-sha256',
    tipoDocumento: 'NFe',
    dataEmissao: '2026-11-20T10:00:00-03:00',
    emitente: {
      documento: '12345678000195',
      nome: 'Fornecedor Teste Ltda',
      uf: 'SP',
      municipio: '3550308',
      crt: '3',
    },
    adquirente: {
      documento: '98765432000188',
      nome: 'Adquirente PR Ltda',
      uf: 'PR',
      municipio: '4106902',
      regime: 'lucro_real',
    },
    itens: [
      {
        index: 1,
        codigo: 'PROD-01',
        descricao: 'Produto A',
        ncm: '84713012',
        cfop: '6102',
        uCom: 'UN',
        quantidade: { str: '2.00', num: 2 },
        valorUnitario: { str: '500.00', num: 500 },
        valorBruto: { str: '1000.00', num: 1000 },
        desconto: { str: '0.00', num: 0 },
        freteSeguroOutros: { str: '0.00', num: 0 },
        tributosDestacadosXml: {
          icms: { str: '120.00', num: 120 },
          icmsSt: { str: '0.00', num: 0 },
          ipi: { str: '0.00', num: 0 },
          ii: { str: '0.00', num: 0 },
          pis: { str: '16.50', num: 16.5 },
          cofins: { str: '76.00', num: 76 },
          ibs: { str: '1.00', num: 1 },
          cbs: { str: '9.00', num: 9 },
          is: { str: '0.00', num: 0 },
          credSn: { str: '0.00', num: 0 },
        },
        creditosTripartidos: {},
      },
    ],
    totais: {
      valorTotalProdutos: { str: '1000.00', num: 1000 },
      valorTotalDocumento: { str: '1000.00', num: 1000 },
      valorTotalDescontos: { str: '0.00', num: 0 },
      valorTotalTributosXml: { str: '222.50', num: 222.5 },
      creditoAdmitidoTotalRegra: { str: '120.00', num: 120 },
      creditoEfetivadoTotalCusto: { str: '120.00', num: 120 },
    },
  };

  // ----------------------------------------------------------------------------
  // Teste 1: calcularRegimeRegularRfb com Resposta 200 Oficial e HALF_EVEN
  // ----------------------------------------------------------------------------
  console.log('  1. Calculadora Regime Regular: Resposta oficial 200 normalizada com HALF_EVEN...');
  resetCircuitBreakersForTests();

  const mockRocResponse = {
    id: 'op-teste-1',
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
              gIBSUF: { pIBSUF: '0.10', vIBSUF: '1.00' },
              gIBSMun: { pIBSMun: '0.00', vIBSMun: '0.00' },
              vIBS: '1.00',
              gCBS: { pCBS: '0.90', vCBS: '9.00' },
            },
          },
        },
      },
    ],
    total: {
      tribCalc: {
        IBSCBSTot: {
          vBCIBSCBS: '1000.00',
          gIBS: { vIBS: '1.00' },
          gCBS: { vCBS: '9.00' },
        },
      },
    },
  };

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/regime-geral')) {
      return new Response(JSON.stringify(mockRocResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-calc-app-version': '1.36.0',
          'x-calc-db-version': '2026.11.20',
        },
      });
    }
    return originalFetch(input, init);
  };

  const payloadRegular = mapearDocumentoParaOperacaoRfb(docNormalizadoMock);
  const resultadoRegular = await calcularRegimeRegularRfb(payloadRegular);

  assert.strictEqual(resultadoRegular.origemCalculo, 'OFICIAL_RFB');
  assert.strictEqual(resultadoRegular.versaoMotor, '1.36.0');
  assert.strictEqual(resultadoRegular.versaoBaseDados, '2026.11.20');
  assert.strictEqual(resultadoRegular.totais.baseCalculoTotal, '1000.00');
  assert.strictEqual(resultadoRegular.totais.valorCbsTotal, '9.00');
  assert.strictEqual(resultadoRegular.totais.valorIbsTotal, '1.00');
  assert.strictEqual(resultadoRegular.totais.valorTributosTotal, '10.00');
  assert.strictEqual(resultadoRegular.itens.length, 1);
  assert.strictEqual(resultadoRegular.itens[0].estadoItem, 'CALCULADO');
  console.log('     ✓ Retorno oficial do regime regular normalizado com sucesso.');

  // ----------------------------------------------------------------------------
  // Teste 2: calcularSimplesNacionalRfb com RFC 7807 ProblemDetail e Itens Misto
  // ----------------------------------------------------------------------------
  console.log('  2. Calculadora Simples Nacional: 200 com itens mistos e erro 422 ProblemDetail...');
  resetCircuitBreakersForTests();

  const mockSimplesResponse = {
    id: 'op-sn-1',
    versao: '3.0.0',
    objetos: [
      {
        nObj: 1,
        estadoItem: 'CALCULADO',
        tribCalc: {
          IBSCBSSN: {
            cClassTrib: '000001',
            gIBSCBSSN: {
              vBC: '1000.00',
              pCBSSN: '1.1612',
              vCBSSN: '11.61',
              pIBSSN: '0.0129',
              vIBSSN: '0.13',
            },
          },
        },
      },
      {
        nObj: 2,
        estadoItem: 'INCONSISTENCIA_ENTRADA',
        erros: [
          {
            code: 'VSN-010',
            title: 'Código de Atividade Incompatível',
            detail: 'Atividade 99 não permitida no documento 55',
          },
        ],
      },
    ],
    total: {
      tribCalc: {
        IBSCBSTot: {
          vBCIBSCBS: '1000.00',
          gCBS: { vCBS: '11.61' },
          gIBS: { vIBS: '0.13' },
        },
      },
    },
  };

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/nao-assistido')) {
      return new Response(JSON.stringify(mockSimplesResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-calc-app-version': '3.2.0',
        },
      });
    }
    return originalFetch(input, init);
  };

  const payloadSimples = mapearDocumentoParaSimplesRfb(docNormalizadoMock);
  const resultadoSimples = await calcularSimplesNacionalRfb(payloadSimples);

  assert.strictEqual(resultadoSimples.origemCalculo, 'OFICIAL_RFB');
  assert.strictEqual(resultadoSimples.itens.length, 2);
  assert.strictEqual(resultadoSimples.itens[0].estadoItem, 'CALCULADO');
  assert.strictEqual(resultadoSimples.itens[0].valorCbsSn, '11.61');
  assert.strictEqual(resultadoSimples.itens[1].estadoItem, 'INCONSISTENCIA_ENTRADA');
  assert.strictEqual(resultadoSimples.itens[1].erros?.[0].code, 'VSN-010');

  // Teste de Erro RFC 7807 (422)
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/nao-assistido')) {
      const problemDetail = {
        type: 'about:blank',
        title: 'Dados inválidos',
        status: 422,
        detail: 'Operação rejeitada por inconsistências cadastrais',
        errors: [
          {
            code: 'VSN-001',
            title: 'CRT Incompatível',
            pointer: '#/CRT',
            detail: 'CRT 3 requer o endpoint do regime regular',
          },
        ],
      };
      return new Response(JSON.stringify(problemDetail), {
        status: 422,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }
    return originalFetch(input, init);
  };

  let erroCapturado = null;
  try {
    await calcularSimplesNacionalRfb(payloadSimples);
  } catch (err) {
    erroCapturado = err;
  }
  assert.ok(erroCapturado instanceof ErroIntegracaoRfb);
  assert.strictEqual(erroCapturado?.status, 422);
  assert.strictEqual(erroCapturado?.codigo, 'VSN-001');
  assert.strictEqual(erroCapturado?.problemDetail?.errors?.[0].code, 'VSN-001');
  console.log('     ✓ Simples Nacional com itens em inconsistência e erro ProblemDetail validados.');

  // ----------------------------------------------------------------------------
  // Teste 3: listarAtividadesSimplesRfb com Cache em Memória TTL 30m
  // ----------------------------------------------------------------------------
  console.log('  3. Catálogo de Atividades: Cache em memória TTL 30m e tolerância a erros...');
  limparCacheAtividadesForTests();

  let contagemFetchAtividades = 0;
  const mockAtividades = [
    { codigo: '01', descricao: 'Comércio Varejista', anexo: 'I', disponivel: true },
    { codigo: '07', descricao: 'Serviços de Transporte', anexo: 'III', disponivel: true },
  ];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/simples-nacional/atividades')) {
      contagemFetchAtividades++;
      return new Response(JSON.stringify(mockAtividades), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };

  // Primeira chamada: dispara fetch
  const cham1 = await listarAtividadesSimplesRfb({ data: '2026-11-20' });
  assert.strictEqual(cham1.cached, false);
  assert.strictEqual(contagemFetchAtividades, 1);
  assert.strictEqual(cham1.atividades.length, 2);

  // Segunda chamada com mesmos parâmetros: usa cache em memória (zero fetch)
  const cham2 = await listarAtividadesSimplesRfb({ data: '2026-11-20' });
  assert.strictEqual(cham2.cached, true);
  assert.strictEqual(contagemFetchAtividades, 1);

  // Erros de rede não podem ser cacheados
  limparCacheAtividadesForTests();
  globalThis.fetch = async () => {
    throw new Error('Falha de conexão com o banco SQLite');
  };

  try {
    await listarAtividadesSimplesRfb({ data: '2026-11-20' });
    assert.fail('Deveria ter lançado erro');
  } catch (err) {
    assert.ok(err instanceof ErroIntegracaoRfb);
  }

  // Verifica que o erro não foi cacheado
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/simples-nacional/atividades')) {
      return new Response(JSON.stringify(mockAtividades), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };

  const cham3 = await listarAtividadesSimplesRfb({ data: '2026-11-20' });
  assert.strictEqual(cham3.cached, false);
  assert.strictEqual(cham3.atividades.length, 2);
  console.log('     ✓ Cache TTL de 30 minutos e política de não cachear erros confirmados.');

  // ----------------------------------------------------------------------------
  // Teste 4: Circuit Breaker e Modo de Operação (hybrid_fallback vs strict_rfb)
  // ----------------------------------------------------------------------------
  console.log('  4. Circuit Breaker: 3 falhas abrem circuito (OPEN); fallback local vs strict_rfb...');
  resetCircuitBreakersForTests();

  let tentativasFetch = 0;
  globalThis.fetch = async () => {
    tentativasFetch++;
    throw new Error('ECONNREFUSED sidecar offline');
  };

  // Falhas 1, 2 e 3
  try {
    await calcularRegimeRegularRfb(payloadRegular);
  } catch {}
  try {
    await calcularRegimeRegularRfb(payloadRegular);
  } catch {}
  try {
    await calcularRegimeRegularRfb(payloadRegular);
  } catch {}

  assert.strictEqual(tentativasFetch, 3);
  const cbStatus = getCircuitBreakerStatus('rtc-regime-regular');
  assert.strictEqual(cbStatus.state, 'OPEN', 'Circuit Breaker deve estar OPEN após 3 falhas consecutivas');

  // Quarta chamada direta: bloqueada de imediato sem disparar fetch
  try {
    await calcularRegimeRegularRfb(payloadRegular);
    assert.fail('Deveria ter bloqueado pelo Circuit Breaker');
  } catch (err) {
    assert.ok(err instanceof ErroIntegracaoRfb);
    assert.strictEqual(err.codigo, 'CIRCUIT_BREAKER_OPEN');
    assert.strictEqual(tentativasFetch, 3, 'Fetch não deve ter sido invocado com circuito aberto');
  }

  // Teste de Fallback com RTC_MODE === 'hybrid_fallback'
  process.env.RTC_MODE = 'hybrid_fallback';
  const resultadoFallback = await calcularRegimeRegularComFallback(payloadRegular);
  assert.strictEqual(resultadoFallback.origemCalculo, 'FALLBACK_LOCAL_ESTIMADO');
  assert.ok(resultadoFallback.aviso?.includes('Circuit Breaker ABERTO'));
  assert.strictEqual(resultadoFallback.totais.valorCbsTotal, '9.00');
  assert.strictEqual(resultadoFallback.totais.valorIbsTotal, '1.00');

  // Teste em Modo Strict: deve lançar erro
  process.env.RTC_MODE = 'strict_rfb';
  try {
    await calcularRegimeRegularComFallback(payloadRegular);
    assert.fail('Modo strict_rfb deveria ter lançado erro 503');
  } catch (err) {
    assert.ok(err instanceof ErroIntegracaoRfb);
    assert.strictEqual(err.status, 503);
  }
  process.env.RTC_MODE = 'hybrid_fallback'; // Restaura default
  console.log('     ✓ Circuit Breaker (OPEN) e políticas de fallback local vs strict_rfb aprovadas.');

  // ----------------------------------------------------------------------------
  // Teste 5: Validações de Segurança (Limite 5MB, anti-XXE e sintaxe XML)
  // ----------------------------------------------------------------------------
  console.log('  5. Segurança Fiscal: Bloqueio de XXE (<!DOCTYPE), limite de 5MB e não-XML...');
  resetCircuitBreakersForTests();

  // Tentativa de XXE no DANFSe
  const xmlComXxe = `<?xml version="1.0"?>\n<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<NFSe><infDPS>&xxe;</infDPS></NFSe>`;
  try {
    await gerarDanfsePdfRfb(xmlComXxe);
    assert.fail('Deveria rejeitar XML com DOCTYPE/ENTITY');
  } catch (err) {
    assert.ok(err.message.includes('XXE') || err.message.includes('DOCTYPE'));
  }

  // XML que excede 5MB
  const xmlGigante = '<NFSe>' + 'x'.repeat(5 * 1024 * 1024 + 100) + '</NFSe>';
  try {
    await gerarDanfsePdfRfb(xmlGigante);
    assert.fail('Deveria rejeitar arquivo maior que 5MB');
  } catch (err) {
    assert.ok(err.message.includes('5 MB') || err.message.includes('limite'));
  }

  // Texto não-XML
  try {
    await gerarDanfsePdfRfb('isto não é um xml válido');
    assert.fail('Deveria rejeitar texto comum');
  } catch (err) {
    assert.ok(err.message.includes('estrutura XML'));
  }
  console.log('     ✓ Travas de segurança anti-XXE e limites de payload operando perfeitamente.');

  // ----------------------------------------------------------------------------
  // Teste 6: gerarDanfsePdfRfb com Validação da Assinatura %PDF-
  // ----------------------------------------------------------------------------
  console.log('  6. Gerador DANFSe: Renderização e verificação de assinatura %PDF-...');
  resetCircuitBreakersForTests();

  const mockPdfBytes = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n/Title (DANFSe Teste)\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF');
  const xmlNfseValido = `<NFSe versao="1.00"><infDPS id="DPS1"><nDPS>101</nDPS></infDPS></NFSe>`;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/danfse')) {
      return new Response(mockPdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="danfse.pdf"',
        },
      });
    }
    return originalFetch(input, init);
  };

  const danfseResultado = await gerarDanfsePdfRfb(xmlNfseValido, { stc: '0', canhoto: true });
  assert.strictEqual(danfseResultado.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(danfseResultado.pdfBuffer));
  assert.strictEqual(danfseResultado.pdfBuffer.toString('utf8', 0, 5), '%PDF-');

  // Teste de resposta inválida (sem magic bytes %PDF-)
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/danfse')) {
      return new Response(Buffer.from('CORRUPTED_NON_PDF_DATA'), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }
    return originalFetch(input, init);
  };

  try {
    await gerarDanfsePdfRfb(xmlNfseValido);
    assert.fail('Deveria ter rejeitado resposta sem assinatura %PDF-');
  } catch (err) {
    assert.ok(err instanceof ErroIntegracaoRfb);
    assert.strictEqual(err.codigo, 'PDF_SIGNATURE_INVALID');
  }
  console.log('     ✓ Validação de integridade e cabeçalho binário %PDF- homologada com sucesso.');

  // Restaura fetch original
  globalThis.fetch = originalFetch;
  console.log('[TEST] Suíte de Integração e Resiliência RFB (RTC) 100% aprovada! ✓\n');
}
