import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { PerfilTributarioInputSchema } from '@/lib/fiscal/perfil-tributario';
import { getEmpresasRepository } from '@/lib/db/empresas-repository';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/empresas/[id]/perfis
 * Lista o histórico cronológico de perfis tributários da empresa.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresa-perfis-get:${clientIp}`, { maxRequests: 60, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const repo = getEmpresasRepository();
    const perfis = await repo.listarPerfis(id);

    return NextResponse.json({
      sucesso: true,
      total: perfis.length,
      perfis,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro ao listar perfis da empresa', detalhes: msg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/empresas/[id]/perfis
 * Adiciona um novo perfil tributário com gestão bitemporal de vigência.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresa-perfis-post:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.json();
    const parseResult = PerfilTributarioInputSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Dados inválidos para o perfil tributário',
          erros: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const repo = getEmpresasRepository();
    const perfilCriado = await repo.adicionarPerfil(id, parseResult.data);

    return NextResponse.json(
      {
        sucesso: true,
        mensagem: 'Perfil tributário adicionado com sucesso',
        perfil: perfilCriado,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Conflito de sobreposição') || msg.includes('não pode ser superior')) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Conflito de vigência temporal',
          detalhes: msg,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro ao adicionar perfil tributário', detalhes: msg },
      { status: 500 }
    );
  }
}
