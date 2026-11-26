import { NextResponse } from 'next/server';
import { getRtcMode, MENSAGEM_BLOQUEIO_HARDCODED } from '@/lib/integracoes/rfb-health';
import {
  ParametrosErpPayload,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoTxt,
  gerarRelatorioErpDetalhadoHtml,
} from '@/lib/relatorio-erp';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || !body.payload) {
      return NextResponse.json(
        { error: 'Payload de parametrização de ERP não fornecido.' },
        { status: 400 }
      );
    }

    const rtcStatus = await getRtcMode();
    const permitirSimulacaoHardcoded = Boolean(body.permitirSimulacaoHardcoded);
    if (rtcStatus.mode === 'hardcoded' && !permitirSimulacaoHardcoded) {
      return NextResponse.json(
        {
          error: MENSAGEM_BLOQUEIO_HARDCODED,
          codigo: 'RTC_HARDCODED_BLOQUEADO',
          rtcStatus,
        },
        { status: 503 }
      );
    }

    const normasList = [
      rtcStatus.normasVigentes.ntNfe,
      rtcStatus.normasVigentes.ricmsPr,
      rtcStatus.normasVigentes.lcReforma,
    ];
    const callerTrace = body.payload.rastreabilidadeSnapshot;
    const payload: ParametrosErpPayload = {
      ...body.payload,
      rastreabilidadeSnapshot: {
        mode: callerTrace?.mode || rtcStatus.mode,
        updatedAt: callerTrace?.updatedAt || rtcStatus.updatedAt || new Date().toISOString(),
        snapshotSha256: callerTrace?.snapshotSha256 || rtcStatus.snapshotSha256 || 'N/A',
        normasVigentes: Array.isArray(callerTrace?.normasVigentes) && callerTrace.normasVigentes.length > 0
          ? callerTrace.normasVigentes
          : normasList,
        rascunhoNaoOficial: rtcStatus.mode === 'hardcoded' && permitirSimulacaoHardcoded,
      },
    };
    const mode: 'resumido' | 'detalhado' = body.mode === 'detalhado' ? 'detalhado' : 'resumido';
    const format: 'html' | 'txt' = body.format === 'txt' ? 'txt' : 'html';
    const asAttachment: boolean = Boolean(body.asAttachment);

    let content = '';
    let filename = '';
    const dateStr = new Date().toISOString().slice(0, 10);

    if (mode === 'resumido') {
      if (format === 'txt') {
        content = gerarRelatorioErpResumidoTxt(payload);
        filename = `parametrizacao_erp_resumido_${dateStr}.txt`;
      } else {
        content = gerarRelatorioErpResumidoHtml(payload);
        filename = `parametrizacao_erp_resumido_${dateStr}.html`;
      }
    } else {
      if (format === 'txt') {
        content = gerarRelatorioErpDetalhadoTxt(payload);
        filename = `laudo_parametrizacao_erp_detalhado_${dateStr}.txt`;
      } else {
        content = gerarRelatorioErpDetalhadoHtml(payload);
        filename = `laudo_parametrizacao_erp_detalhado_${dateStr}.html`;
      }
    }

    if (asAttachment) {
      const contentType = format === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      mode,
      format,
      filename,
      content,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao processar relatório de parametrização ERP.' },
      { status: 500 }
    );
  }
}
