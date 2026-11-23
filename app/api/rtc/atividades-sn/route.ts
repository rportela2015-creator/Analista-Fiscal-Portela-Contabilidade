import { NextRequest, NextResponse } from 'next/server';
import { listarAtividadesSimplesRfb } from '@/lib/integracoes/rtc-simples/client';
import { ErroIntegracaoRfb } from '@/lib/integracoes/rfb-health';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rtc/atividades-sn
 * Retorna o catálogo oficial de atividades do Simples Nacional com suporte a filtros e cache em memória.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const data = searchParams.get('data') || undefined;
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const anexosParam = searchParams.get('anexos');
    const anexos = anexosParam ? anexosParam.split(',').map((a) => a.trim()) : undefined;
    const tpDoc = searchParams.get('tpDoc') || undefined;
    const cClassTrib = searchParams.get('cClassTrib') || undefined;
    const forcarAtualizacao = searchParams.get('refresh') === 'true';

    const { atividades, cached, duracaoMs } = await listarAtividadesSimplesRfb({
      data,
      anexos,
      tpDoc,
      cClassTrib,
      forcarAtualizacao,
    });

    let filtradas = atividades;
    if (q) {
      filtradas = atividades.filter(
        (a) =>
          a.codigo.toLowerCase().includes(q) ||
          (a.descricao && a.descricao.toLowerCase().includes(q))
      );
    }

    return NextResponse.json(
      {
        sucesso: true,
        total: filtradas.length,
        cached,
        duracaoMs,
        atividades: filtradas,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof ErroIntegracaoRfb) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: err.mensagem,
          servico: err.servico,
          status: err.status,
          circuitBreakerState: err.circuitBreakerState,
        },
        { status: err.status || 503 }
      );
    }

    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Erro ao listar atividades do Simples Nacional',
        detalhes: err.message,
      },
      { status: 500 }
    );
  }
}
