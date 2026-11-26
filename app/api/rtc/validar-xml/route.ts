import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { validarXmlRtcRfb } from '@/lib/integracoes/rtc-regime-regular/client';
import { ErroIntegracaoRfb, getRtcMode } from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/rtc/validar-xml
 * Valida o XML contra os esquemas XSD oficiais da Receita Federal.
 * Aceita Content-Type: application/xml ou application/json { xml, tipo, subtipo }.
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`rtc-xml-validate:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
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
    const contentType = req.headers.get('content-type') || '';
    let xmlContent = '';
    let tipo = 'nfe';
    let subtipo = 'grupo';

    if (contentType.includes('application/json')) {
      const json = await req.json();
      xmlContent = json.xml || '';
      if (json.tipo) tipo = json.tipo;
      if (json.subtipo) subtipo = json.subtipo;
    } else {
      xmlContent = await req.text();
      const { searchParams } = new URL(req.url);
      if (searchParams.get('tipo')) tipo = searchParams.get('tipo')!;
      if (searchParams.get('subtipo')) subtipo = searchParams.get('subtipo')!;
    }

    if (!xmlContent || !xmlContent.trim()) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Conteúdo XML não informado' },
        { status: 400 }
      );
    }

    // Trava de tamanho 5MB (413 Payload Too Large)
    const byteLength = Buffer.byteLength(xmlContent, 'utf8');
    if (byteLength > MAX_SIZE_BYTES) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: `O arquivo XML excede o limite máximo permitido de 5 MB (${(byteLength / 1024 / 1024).toFixed(2)} MB)`,
        },
        { status: 413 }
      );
    }

    // Trava anti-XXE
    if (/<!DOCTYPE/i.test(xmlContent) || /<!ENTITY/i.test(xmlContent)) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Segurança Fiscal: XML contém declaração DOCTYPE ou ENTITY potencialmente vulnerável a XXE',
        },
        { status: 400 }
      );
    }

    // Validação estrutural básica de XML
    const trimmed = xmlContent.trim();
    if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Conteúdo informado não possui sintaxe XML válida' },
        { status: 400 }
      );
    }

    const { valido, duracaoMs } = await validarXmlRtcRfb(xmlContent, tipo, subtipo);

    return NextResponse.json(
      {
        sucesso: true,
        valido,
        tipo,
        subtipo,
        duracaoMs,
        rtcStatus,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof ErroIntegracaoRfb) {
      return NextResponse.json(
        {
          sucesso: false,
          servico: err.servico,
          mensagem: err.mensagem,
          status: err.status,
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
        mensagem: 'Erro interno ao validar XML fiscal',
        detalhes: err.message,
        rtcStatus,
      },
      { status: 500 }
    );
  }
}
