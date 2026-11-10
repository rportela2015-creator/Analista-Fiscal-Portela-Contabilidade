import { NextResponse } from 'next/server';
import { extrairDadosNfe, FiscalExtractionError } from '@/lib/extrator-nfe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  const t0 = performance.now();
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          error: "Tipo de conteúdo inválido. A requisição deve ser enviada como 'multipart/form-data'.",
          codigo: 'CONTENT_TYPE_INVALIDO',
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const regime = (formData.get('regime') as string) || undefined;
    const finalidade = (formData.get('finalidade') as string) || undefined;

    if (!file) {
      return NextResponse.json(
        {
          error: "Nenhum arquivo enviado. Forneça o arquivo XML ou PDF no campo 'file'.",
          codigo: 'ARQUIVO_AUSENTE',
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          error: 'O arquivo enviado está vazio (0 bytes).',
          codigo: 'ARQUIVO_VAZIO',
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `O arquivo enviado excede o limite máximo permitido de 10MB (${(file.size / (1024 * 1024)).toFixed(2)}MB recebido).`,
          codigo: 'TAMANHO_EXCEDIDO',
          limiteMaximoBytes: MAX_FILE_SIZE,
          tamanhoRecebidoBytes: file.size,
        },
        { status: 413 }
      );
    }

    const filename = file.name || 'documento';
    const ext = filename.toLowerCase();
    if (!ext.endsWith('.xml') && !ext.endsWith('.pdf')) {
      return NextResponse.json(
        {
          error: 'Formato de arquivo não suportado. Apenas arquivos .xml (NF-e) ou .pdf (DANFE) são aceitos.',
          codigo: 'FORMATO_INVALIDO',
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Executa extração determinística pura (zero LLM, < 200ms)
    const dadosExtraidos = await extrairDadosNfe(buffer, filename, { regime, finalidade });
    dadosExtraidos.tempoExtracaoMs = Math.round(performance.now() - t0);

    return NextResponse.json(dadosExtraidos, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Extraction-Time-Ms': String(dadosExtraidos.tempoExtracaoMs),
      },
    });
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - t0);
    console.error('Erro na extração determinística:', err);

    const statusCode = err instanceof FiscalExtractionError ? err.statusCode : (err.statusCode || 400);
    const codigo = err instanceof FiscalExtractionError ? err.codigo : (err.codigo || 'ERRO_EXTRACAO');

    return NextResponse.json(
      {
        error: err.message || 'Falha ao processar o documento fiscal.',
        codigo,
        tempoExecucaoMs: elapsed,
      },
      { status: statusCode }
    );
  }
}
