import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { mapearPerfilParaContextoAuditoria } from '@/lib/fiscal/perfil-tributario';
import { getEmpresasRepository } from '@/lib/db/empresas-repository';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/empresas/[id]/perfil-vigente?data=YYYY-MM-DD
 * Retorna o perfil tributário em vigor na data de fato gerador informada (ou na data de hoje).
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresa-perfil-vigente:${clientIp}`, { maxRequests: 60, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const url = new URL(req.url);
    const dataRef = url.searchParams.get('data') || new Date().toISOString().slice(0, 10);

    const repo = getEmpresasRepository();
    const perfil = await repo.buscarPerfilVigente(id, dataRef);

    if (!perfil) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: `Nenhum perfil tributário vigente encontrado para a data ${dataRef}.`,
          dataReferencia: dataRef,
        },
        { status: 404 }
      );
    }

    const contextoAuditoria = mapearPerfilParaContextoAuditoria(perfil);

    return NextResponse.json({
      sucesso: true,
      dataReferencia: dataRef,
      perfil,
      contextoAuditoria,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro ao resolver perfil tributário vigente', detalhes: msg },
      { status: 500 }
    );
  }
}
