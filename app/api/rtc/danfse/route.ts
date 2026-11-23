import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { gerarDanfsePdfRfb } from '@/lib/integracoes/rtc-danfse/client';
import { ErroIntegracaoRfb } from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/rtc/danfse
 * Renderiza o DANFSe oficial em PDF a partir do XML da NFS-e.
 * Retorna binário application/pdf com Content-Disposition: inline.
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`rtc-danfse:${clientIp}`, { maxRequests: 20, windowMs: 60_000 });
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

  try {
    const contentType = req.headers.get('content-type') || '';
    let xmlContent = '';
    let stc: '0' | '1' | '2' = '0';
    let canhoto = true;

    if (contentType.includes('application/json')) {
      const json = await req.json();
      xmlContent = json.xml || '';
      if (json.stc) stc = json.stc;
      if (typeof json.canhoto === 'boolean') canhoto = json.canhoto;
    } else {
      xmlContent = await req.text();
      const { searchParams } = new URL(req.url);
      if (searchParams.get('stc')) {
        const val = searchParams.get('stc');
        if (val === '0' || val === '1' || val === '2') stc = val;
      }
      if (searchParams.get('canhoto')) {
        canhoto = searchParams.get('canhoto') !== 'false';
      }
    }

    if (!xmlContent || !xmlContent.trim()) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'XML da NFS-e não informado' },
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

    const { pdfBuffer } = await gerarDanfsePdfRfb(xmlContent, { stc, canhoto });

    const uint8Array = new Uint8Array(pdfBuffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="danfse.pdf"',
        'Content-Length': String(uint8Array.byteLength),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    if (err instanceof ErroIntegracaoRfb) {
      const isOfflineOrUnavailable = err.status === 503 || err.status === 504 || err.codigo === 'CIRCUIT_BREAKER_OPEN';
      return NextResponse.json(
        {
          sucesso: false,
          error: err.mensagem,
          mensagem: err.mensagem,
          servico: err.servico,
          codigo: isOfflineOrUnavailable ? 'DANFSE_SIDECAR_OFFLINE' : (err.codigo || 'ERRO_RTC_DANFSE'),
          orientacao: isOfflineOrUnavailable
            ? 'Suba o container rtc-danfse via docker compose up -d rtc-danfse'
            : undefined,
          status: err.status,
          circuitBreakerState: err.circuitBreakerState,
        },
        { status: err.status || 503 }
      );
    }

    const isConnRefused = err?.message?.includes('fetch failed') || err?.code === 'ECONNREFUSED';
    if (isConnRefused) {
      return NextResponse.json(
        {
          sucesso: false,
          error: 'Sidecar rtc-danfse indisponível ou offline',
          mensagem: 'Não foi possível conectar ao gerador oficial DANFSe em Go.',
          codigo: 'DANFSE_SIDECAR_OFFLINE',
          orientacao: 'Suba o container rtc-danfse via docker compose up -d rtc-danfse',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Erro ao gerar DANFSe em PDF',
        detalhes: err.message,
      },
      { status: 400 }
    );
  }
}
