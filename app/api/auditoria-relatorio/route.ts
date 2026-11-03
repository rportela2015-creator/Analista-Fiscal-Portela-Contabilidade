import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderRelatorioHtml, renderRelatorioTxt } from '@/lib/relatorio';



const itemSchema = z.object({
  cProd: z.any().optional(),
  xProd: z.any().optional(),
  ncm: z.any().optional(),
  cest: z.any().optional(),
  cfopEntrada: z.any().optional(),
  cstIcmsEntrada: z.any().optional(),
  aliqIcms: z.any().optional(),
  permiteCredito: z.boolean().optional(),
  cstPisCofinsEntrada: z.any().optional(),
  aliqPis: z.any().optional(),
  aliqCofins: z.any().optional(),
  cClassTrib: z.any().optional(),
  aliqIbsTransitorio: z.any().optional(),
  aliqCbsTransitorio: z.any().optional(),
  regimeEspecial: z.any().optional(),
  instrucaoCadastro: z.any().optional(),
});

const payloadSchema = z.object({
  format: z.enum(['html', 'txt']).optional().default('html'),
  parecerTecnicoXml: z.any().optional(),
  parecerConformidade: z.any().optional(),
  itens: z.array(itemSchema).optional(),
});

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data) {
      return NextResponse.json({ error: 'Nenhum dado fornecido para o relatório.' }, { status: 400 });
    }

    const parseResult = payloadSchema.safeParse(data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { format, ...payload } = parseResult.data;

    if (format === 'html') {
      return new NextResponse(renderRelatorioHtml(payload), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="relatorio_executivo.html"',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    }

    return new NextResponse(renderRelatorioTxt(payload), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="relatorio_executivo.txt"',
      },
    });
  } catch (error: any) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json(
      { error: 'Falha ao gerar o relatório executivo.' },
      { status: 500 }
    );
  }
}
