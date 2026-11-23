import {
  executarChamadaRfb,
  getRfbConfig,
  ErroIntegracaoRfb,
} from '../rfb-health';
import {
  OperacaoInputSchema,
  type OperacaoInputRfb,
  type ROCDomainRfb,
} from './schema';
import {
  normalizarRespostaRoc,
  type ResultadoCalculoRegimeRegularNormalizado,
} from './normalizer';
import {
  arredondarMoedaRfb,
  arredondarMoedaRfbNum,
} from '../../math/decimal-fiscal';

/**
 * Invoca o endpoint oficial de cálculo do Regime Geral na Calculadora RTC.
 * Endpoint confirmado: POST /api/calculadora/regime-geral
 */
export async function calcularRegimeRegularRfb(
  payload: OperacaoInputRfb
): Promise<ResultadoCalculoRegimeRegularNormalizado> {
  const parsedPayload = OperacaoInputSchema.parse(payload);
  const cfg = getRfbConfig();

  const url = `${cfg.regimeRegularUrl}/api/calculadora/regime-geral`;

  const { data, duracaoMs, headers } = await executarChamadaRfb<ROCDomainRfb>(
    'rtc-regime-regular',
    (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(parsedPayload),
        signal,
      })
  );

  return normalizarRespostaRoc(data, duracaoMs, headers);
}

/**
 * Invoca o gerador oficial de XML de grupos tributários do RTC.
 * Endpoint confirmado: POST /api/calculadora/xml/generate?tipo={tipo}
 */
export async function gerarXmlGruposRtcRfb(
  resultadoCalculo: any,
  tipo: string = 'nfe'
): Promise<{ xml: string; duracaoMs: number }> {
  const cfg = getRfbConfig();
  const tipoParam = tipo.toLowerCase();
  const url = `${cfg.regimeRegularUrl}/api/calculadora/xml/generate?tipo=${encodeURIComponent(tipoParam)}`;

  const { data, duracaoMs } = await executarChamadaRfb<string>(
    'rtc-regime-regular',
    (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/xml',
        },
        body: JSON.stringify(resultadoCalculo),
        signal,
      }),
    (res) => res.text()
  );

  return { xml: data, duracaoMs };
}

/**
 * Invoca o validador oficial de XML contra os schemas XSD da Receita Federal.
 * Endpoint confirmado: POST /api/calculadora/xml/validate?tipo={tipo}&subtipo={subtipo}
 */
export async function validarXmlRtcRfb(
  xmlContent: string,
  tipo: string = 'nfe',
  subtipo: string = 'grupo'
): Promise<{ valido: boolean; duracaoMs: number }> {
  const cfg = getRfbConfig();
  const tipoParam = tipo.toLowerCase();
  const subtipoParam = subtipo.toLowerCase();
  const url = `${cfg.regimeRegularUrl}/api/calculadora/xml/validate?tipo=${encodeURIComponent(tipoParam)}&subtipo=${encodeURIComponent(subtipoParam)}`;

  const { data, duracaoMs } = await executarChamadaRfb<boolean>(
    'rtc-regime-regular',
    (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/json',
        },
        body: xmlContent,
        signal,
      })
  );

  return { valido: Boolean(data), duracaoMs };
}

/**
 * Executa o cálculo com tolerância a falhas baseada em RTC_MODE ('hybrid_fallback' vs 'strict_rfb').
 * Se o sidecar falhar ou circuit breaker estiver aberto:
 * - Em strict_rfb: repassa erro HTTP 503/504
 * - Em hybrid_fallback: executa estimativa local determinística via decimal.js (HALF_EVEN)
 */
export async function calcularRegimeRegularComFallback(
  payload: OperacaoInputRfb
): Promise<ResultadoCalculoRegimeRegularNormalizado> {
  const cfg = getRfbConfig();

  try {
    return await calcularRegimeRegularRfb(payload);
  } catch (err: any) {
    if (cfg.modoOperacao === 'strict_rfb') {
      throw err;
    }

    // Modo hybrid_fallback: produz estimativa transparente em conformidade com as alíquotas de teste
    const inicio = performance.now();
    const ano = parseInt(payload.dhFatoGerador.slice(0, 4), 10);
    const pCbs = ano >= 2027 ? 8.8 : 0.9;
    const pIbsEst = ano >= 2027 ? 0.05 : 0.1;
    const pIbsMun = ano >= 2027 ? 0.05 : 0.0;

    let totalBc = 0;
    let totalCbs = 0;
    let totalIbsEst = 0;
    let totalIbsMun = 0;

    const itens = payload.itens.map((it) => {
      const bc = it.baseCalculo;
      const vCbs = arredondarMoedaRfbNum((bc * pCbs) / 100);
      const vIbsEst = arredondarMoedaRfbNum((bc * pIbsEst) / 100);
      const vIbsMun = arredondarMoedaRfbNum((bc * pIbsMun) / 100);
      const vIbsTot = vIbsEst + vIbsMun;

      totalBc += bc;
      totalCbs += vCbs;
      totalIbsEst += vIbsEst;
      totalIbsMun += vIbsMun;

      return {
        numero: it.numero,
        estadoItem: 'CALCULADO',
        cst: it.cst,
        cClassTrib: it.cClassTrib,
        baseCalculo: arredondarMoedaRfb(bc),
        aliquotaIbsEstadual: pIbsEst.toFixed(2),
        valorIbsEstadual: arredondarMoedaRfb(vIbsEst),
        aliquotaIbsMunicipal: pIbsMun.toFixed(2),
        valorIbsMunicipal: arredondarMoedaRfb(vIbsMun),
        valorIbsTotal: arredondarMoedaRfb(vIbsTot),
        aliquotaCbs: pCbs.toFixed(2),
        valorCbs: arredondarMoedaRfb(vCbs),
        valorImpostoSeletivo: '0.00',
      };
    });

    const duracaoMs = Math.round(performance.now() - inicio);

    return {
      origemCalculo: 'FALLBACK_LOCAL_ESTIMADO',
      versaoMotor: 'motor-local-estimado-v1',
      aviso: `Sidecar rtc-regime-regular indisponível (${err.message || 'offline'}). Cálculo executado via fallback local estimado.`,
      duracaoMs,
      totais: {
        baseCalculoTotal: arredondarMoedaRfb(totalBc),
        valorIbsEstadualTotal: arredondarMoedaRfb(totalIbsEst),
        valorIbsMunicipalTotal: arredondarMoedaRfb(totalIbsMun),
        valorIbsTotal: arredondarMoedaRfb(totalIbsEst + totalIbsMun),
        valorCbsTotal: arredondarMoedaRfb(totalCbs),
        valorImpostoSeletivoTotal: '0.00',
        valorTributosTotal: arredondarMoedaRfb(totalCbs + totalIbsEst + totalIbsMun),
      },
      itens,
    };
  }
}
