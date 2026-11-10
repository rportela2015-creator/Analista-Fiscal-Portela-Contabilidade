import { NextResponse } from 'next/server';
import {
  executarAuditoriaParticionada,
  validarAuditPayload,
  type AuditedInvoiceResponse,
} from '@/lib/auditoria-particionada';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const t0 = performance.now();
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          error: "Tipo de conteúdo inválido. A requisição deve ser enviada como 'application/json'.",
          codigo: 'CONTENT_TYPE_INVALIDO',
        },
        { status: 415 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo da requisição JSON inválido ou malformado.', codigo: 'JSON_MALFORMADO' },
        { status: 400 }
      );
    }

    try {
      validarAuditPayload(body);
    } catch (valErr: any) {
      return NextResponse.json(
        { error: valErr.message || 'Payload de auditoria inválido.', codigo: 'PAYLOAD_INVALIDO' },
        { status: 400 }
      );
    }

    const resultado: AuditedInvoiceResponse = await executarAuditoriaParticionada(body);
    resultado.tempoExecucaoMs = Math.round(performance.now() - t0);

    return NextResponse.json(resultado, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Audit-Engine': resultado.motorUtilizado,
        'X-Execution-Time-Ms': String(resultado.tempoExecucaoMs),
      },
    });
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - t0);
    console.error('Erro na rota de auditoria particionada:', err);

    const isTimeout =
      err.message?.includes('timeout') ||
      err.message?.includes('Tempo limite excedido') ||
      err.codigo === 'TIMEOUT_AUDITORIA';
    const isOffline =
      err.message?.includes('ECONNREFUSED') ||
      err.message?.includes('offline') ||
      err.message?.includes('indisponível') ||
      err.codigo === 'OLLAMA_OFFLINE';
    const isKeyMissing = err.codigo === 'GEMINI_KEY_MISSING';
    const isSovereignty = err.codigo === 'SOBERANIA_LOCAL_ESTRITA';

    const statusCode = isTimeout ? 504 : isOffline || isKeyMissing || isSovereignty ? 503 : 500;

    return NextResponse.json(
      {
        error: err.message || 'Falha ao executar auditoria pericial.',
        codigo: err.codigo || (isTimeout ? 'TIMEOUT_AUDITORIA' : 'ERRO_AUDITORIA'),
        tempoExecucaoMs: elapsed,
      },
      { status: statusCode }
    );
  }
}
