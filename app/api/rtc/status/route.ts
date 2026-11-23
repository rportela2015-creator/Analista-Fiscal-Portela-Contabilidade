import { NextResponse } from 'next/server';
import { consultarStatusServicosRfb } from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rtc/status
 * Consulta e retorna a saúde e versões dos 3 sidecars oficiais da Receita Federal.
 */
export async function GET() {
  try {
    const status = await consultarStatusServicosRfb();
    return NextResponse.json(status, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Erro ao consultar status dos serviços RFB',
        detalhes: err.message,
      },
      { status: 500 }
    );
  }
}
