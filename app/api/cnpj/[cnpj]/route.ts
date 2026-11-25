import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sanitizarCnpj, validarCnpj } from '@/lib/fiscal/perfil-tributario';
import { consultarCnpjOficial } from '@/lib/fiscal/cnpj-consulta';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cnpj/[cnpj]
 * Consulta dados cadastrais oficiais na Receita Federal via BrasilAPI
 * com fallback automático para CNPJ.ws e ReceitaWS.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ cnpj: string }> }
) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`cnpj-lookup:${clientIp}`, {
    maxRequests: 30,
    windowMs: 60_000,
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      { sucesso: false, mensagem: 'Limite de requisições excedido para consulta de CNPJ.' },
      { status: 429 }
    );
  }

  const { cnpj } = await context.params;
  const limpo = sanitizarCnpj(cnpj || '');

  if (!validarCnpj(limpo)) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'CNPJ inválido. Verifique os 14 dígitos e os dígitos verificadores.',
      },
      { status: 400 }
    );
  }

  const resultado = await consultarCnpjOficial(limpo);
  if (!resultado.sucesso || !resultado.dados) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: resultado.erro || 'CNPJ não encontrado nos serviços públicos consultados.',
        tentativas: resultado.tentativas,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    sucesso: true,
    dados: resultado.dados,
    tentativas: resultado.tentativas,
  });
}
