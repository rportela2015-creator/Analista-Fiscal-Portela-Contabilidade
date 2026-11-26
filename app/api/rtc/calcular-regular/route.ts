import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { OperacaoInputSchema } from '@/lib/integracoes/rtc-regime-regular/schema';
import { calcularRegimeRegularComFallback } from '@/lib/integracoes/rtc-regime-regular/client';
import { ErroIntegracaoRfb, getRtcMode } from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rtc/calcular-regular
 * Executa o cálculo do Regime Geral na Calculadora RTC com validação e fallback configurável.
 */
export async function POST(req: NextRequest) {
  // Rate Limit: 30 requisições por minuto por IP
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`rtc-regular:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Limite de requisições excedido. Tente novamente mais tarde.',
        retryAfterSec: rateLimit.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
      }
    );
  }

  const rtcStatus = await getRtcMode();
  try {
    const rawBody = await req.json();
    const parseResult = OperacaoInputSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Payload de operação inválido para o Regime Geral',
          erros: parseResult.error.flatten(),
          rtcStatus,
        },
        { status: 400 }
      );
    }

    const resultado = await calcularRegimeRegularComFallback(parseResult.data);
    return NextResponse.json({ ...resultado, rtcStatus }, { status: 200 });
  } catch (err: any) {
    if (err instanceof ErroIntegracaoRfb) {
      return NextResponse.json(
        {
          sucesso: false,
          servico: err.servico,
          mensagem: err.mensagem,
          codigo: err.codigo,
          problemDetail: err.problemDetail,
          circuitBreakerState: err.circuitBreakerState,
          rtcStatus,
        },
        { status: err.status || 503 }
      );
    }

    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Erro interno ao processar cálculo do Regime Geral',
        detalhes: err.message,
        rtcStatus,
      },
      { status: 500 }
    );
  }
}
