import { NextResponse } from 'next/server';
import {
  consultarStatusServicosRfb,
  getCircuitBreakerStatus,
  getRfbConfig,
  getRtcMode,
} from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rtc/status
 * Retorna o modo explícito (`live | snapshot | hardcoded`) e, quando `RTC_LIVE_PROBE=true`,
 * consulta a saúde e versões dos 3 sidecars oficiais da Receita Federal.
 */
export async function GET() {
  try {
    const rtcStatus = await getRtcMode();
    if (process.env.RTC_LIVE_PROBE === 'true') {
      const status = await consultarStatusServicosRfb();
      return NextResponse.json({ ...status, rtcStatus }, { status: 200 });
    }

    const cfg = getRfbConfig();
    return NextResponse.json(
      {
        modoOperacao: cfg.modoOperacao,
        rtcStatus,
        servicos: {
          regimeRegular: {
            online: rtcStatus.mode === 'live',
            status: rtcStatus.mode === 'live' ? 'HEALTHY' : 'OFFLINE_SNAPSHOT',
            circuitBreaker: getCircuitBreakerStatus('rtc-regime-regular').state,
          },
          simplesNacional: {
            online: rtcStatus.mode === 'live',
            status: rtcStatus.mode === 'live' ? 'HEALTHY' : 'OFFLINE_SNAPSHOT',
            circuitBreaker: getCircuitBreakerStatus('rtc-simples').state,
          },
          danfse: {
            online: rtcStatus.mode === 'live',
            status: rtcStatus.mode === 'live' ? 'HEALTHY' : 'OFFLINE_SNAPSHOT',
            circuitBreaker: getCircuitBreakerStatus('rtc-danfse').state,
          },
        },
        verificadoEm: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Erro ao consultar status dos serviços RFB',
        detalhes: err.message,
      },
      { status: 500 }
    );
  }
}
