import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { EmpresaInputSchema } from '@/lib/fiscal/perfil-tributario';
import { getEmpresasRepository } from '@/lib/db/empresas-repository';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/empresas/[id]
 * Detalhes da empresa com todos os perfis tributários cadastrados.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresa-get-one:${clientIp}`, { maxRequests: 60, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const repo = getEmpresasRepository();
    const empresa = await repo.buscarPorId(id);

    if (!empresa) {
      return NextResponse.json(
        { sucesso: false, mensagem: `Empresa ${id} não encontrada.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      empresa,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro ao buscar empresa', detalhes: msg },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/empresas/[id]
 * Atualiza campos cadastrais da empresa.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresa-patch:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.json();
    const partialSchema = EmpresaInputSchema.partial();
    const parseResult = partialSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Dados inválidos para atualização',
          erros: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const repo = getEmpresasRepository();
    const empresaAtualizada = await repo.atualizar(id, parseResult.data);

    if (!empresaAtualizada) {
      return NextResponse.json(
        { sucesso: false, mensagem: `Empresa ${id} não encontrada.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Empresa atualizada com sucesso',
      empresa: empresaAtualizada,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro ao atualizar empresa', detalhes: msg },
      { status: 500 }
    );
  }
}
