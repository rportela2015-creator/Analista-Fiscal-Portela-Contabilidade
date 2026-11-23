import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { EmpresaInputSchema } from '@/lib/fiscal/perfil-tributario';
import { getEmpresasRepository, ESCRITORIO_PADRAO_ID } from '@/lib/db/empresas-repository';

export const dynamic = 'force-dynamic';

/**
 * GET /api/empresas
 * Lista as empresas ativas do escritório.
 */
export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresas-get:${clientIp}`, { maxRequests: 60, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const url = new URL(req.url);
    const escritorioId = url.searchParams.get('escritorioId') || ESCRITORIO_PADRAO_ID;
    const repo = getEmpresasRepository();
    const empresas = await repo.listar(escritorioId);

    return NextResponse.json({
      sucesso: true,
      total: empresas.length,
      empresas,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro ao listar empresas', detalhes: msg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/empresas
 * Cadastra uma nova empresa e opcionalmente seu perfil tributário inicial.
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`empresas-post:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido.' },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.json();
    const parseResult = EmpresaInputSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: 'Dados inválidos para cadastro de empresa',
          erros: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const repo = getEmpresasRepository();

    // Checar duplicidade cadastral
    const existente = await repo.buscarPorCnpj(parseResult.data.cnpj);
    if (existente) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: `Empresa com CNPJ ${parseResult.data.cnpj} já está cadastrada (${existente.razaoSocial}).`,
          empresaId: existente.id,
        },
        { status: 409 }
      );
    }

    const novaEmpresa = await repo.criar(parseResult.data);
    return NextResponse.json(
      {
        sucesso: true,
        mensagem: 'Empresa cadastrada com sucesso',
        empresa: novaEmpresa,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('já cadastrado') || msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'CNPJ já cadastrado no sistema.', detalhes: msg },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { sucesso: false, mensagem: 'Erro interno ao cadastrar empresa', detalhes: msg },
      { status: 500 }
    );
  }
}
