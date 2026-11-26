import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { OperacaoSimplesNaoAssistidaInputSchema } from '@/lib/integracoes/rtc-simples/schema';
import { calcularSimplesNacionalComFallback } from '@/lib/integracoes/rtc-simples/client';
import { ErroIntegracaoRfb, getRtcMode } from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rtc/calcular-simples
 * Executa o cálculo Não Assistido do Simples Nacional na Calculadora RTC.
 */
export async function POST(req: NextRequest) {
  // Rate Limit: 30 requisições por minuto por IP
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`rtc-simples:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
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
    const parseResult = OperacaoSimplesNaoAssistidaInputSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Payload de operação inválido para o Simples Nacional',
          erros: parseResult.error.flatten(),
          rtcStatus,
        },
        { status: 400 }
      );
    }

    const resultado = await calcularSimplesNacionalComFallback(parseResult.data);
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
        mensagem: 'Erro interno ao processar cálculo do Simples Nacional',
        detalhes: err.message,
        rtcStatus,
      },
      { status: 500 }
    );
  }
}
