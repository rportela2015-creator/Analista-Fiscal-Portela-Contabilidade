import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  orquestrarAnaliseNfeCompleta,
  OrquestracaoNfeInput,
} from '@/lib/engine/orquestrador-fiscal';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const OrquestracaoJsonSchema = z.object({
  xml: z.string().optional(),
  empresaId: z.string().uuid().optional(),
  escritorioId: z.string().uuid().optional(),
  perfilAdquirente: z
    .object({
      regime: z.enum([
        'SIMPLES_NACIONAL',
        'SIMPLES_EXCESSO_SUBLIMITE',
        'LUCRO_PRESUMIDO',
        'LUCRO_REAL',
        'MEI',
      ]),
      aliquotasEfetivas: z.record(z.string(), z.unknown()).optional(),
      simplesOptanteHibrido2027: z.boolean().optional(),
      beneficiosParana: z.record(z.string(), z.unknown()).optional(),
      reformaTributaria: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  destinacaoPadrao: z
    .enum(['comercializacao', 'revenda', 'industrializacao', 'insumo', 'ativo_imobilizado', 'uso_consumo'])
    .optional(),
  destinacaoPorItem: z.record(z.string(), z.string()).optional(),
  statusExtincaoRtc: z
    .enum(['EXTINTO_SPLIT', 'EXTINTO_PAGAMENTO', 'AGUARDANDO_EXTINCAO', 'SIMULACAO_PROJETADA'])
    .optional(),
  margemAlvoPct: z.number().optional(),
  despesasVariaveisPct: z.number().optional(),
  validarGruposXmlRtc: z.boolean().optional(),
  persistir: z.boolean().optional(),
});

/**
 * POST /api/fiscal/orquestrar-nfe
 * Endpoint unificado da auditoria fiscal DAG:
 * Extração -> Motor RTC RFB -> ICMS/PR v5.0.0 -> Créditos 3 Camadas -> 4 Regimes -> Persistência
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`orquestrar-nfe:${clientIp}`, {
    maxRequests: 30,
    windowMs: 60_000,
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Limite de requisições excedido. Tente novamente mais tarde.',
        retryAfterSec: rateLimit.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
      }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let payloadInput: OrquestracaoNfeInput = {};
    let xmlContent = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');

      if (file && typeof file === 'object' && 'text' in file) {
        const fileObj = file as File;
        if (fileObj.size > 5 * 1024 * 1024) {
          return NextResponse.json(
            { sucesso: false, mensagem: 'Arquivo excede o limite máximo permitido de 5 MB.' },
            { status: 413 }
          );
        }
        xmlContent = await fileObj.text();
      } else {
        const xmlForm = formData.get('xml');
        if (typeof xmlForm === 'string') {
          xmlContent = xmlForm;
        }
      }

      const empresaId = formData.get('empresaId');
      const statusExtincao = formData.get('statusExtincaoRtc');
      const destinacaoPadrao = formData.get('destinacaoPadrao');
      const persistir = formData.get('persistir');
      const margemAlvo = formData.get('margemAlvoPct');
      const despesasVar = formData.get('despesasVariaveisPct');
      const validarXml = formData.get('validarGruposXmlRtc');

      payloadInput = {
        xml: xmlContent,
        empresaId: typeof empresaId === 'string' && empresaId ? empresaId : undefined,
        statusExtincaoRtc: (typeof statusExtincao === 'string' ? statusExtincao : undefined) as any,
        destinacaoPadrao: (typeof destinacaoPadrao === 'string' ? destinacaoPadrao : undefined) as any,
        persistir: persistir === 'true' || persistir === '1',
        margemAlvoPct: typeof margemAlvo === 'string' ? parseFloat(margemAlvo) : undefined,
        despesasVariaveisPct: typeof despesasVar === 'string' ? parseFloat(despesasVar) : undefined,
        validarGruposXmlRtc: validarXml === 'true' || validarXml === '1',
      };
    } else {
      const rawBody = await req.json();
      const parseResult = OrquestracaoJsonSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: 'Payload JSON inválido para orquestração fiscal',
            erros: parseResult.error.flatten(),
          },
          { status: 400 }
        );
      }

      payloadInput = parseResult.data as OrquestracaoNfeInput;
      xmlContent = payloadInput.xml || '';
    }

    if (!xmlContent && !payloadInput.extracao) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Nenhum arquivo XML ou extração foi fornecido.' },
        { status: 400 }
      );
    }

    // Trava de tamanho e segurança anti-XXE
    if (xmlContent) {
      if (xmlContent.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { sucesso: false, mensagem: 'XML excede o tamanho máximo de 5 MB.' },
          { status: 413 }
        );
      }

      if (xmlContent.includes('<!DOCTYPE') || xmlContent.includes('<!ENTITY')) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: 'XML rejeitado por conter declarações DTD/XXE potencialmente inseguras.',
          },
          { status: 400 }
        );
      }
    }

    const resultado = await orquestrarAnaliseNfeCompleta(payloadInput);

    return NextResponse.json(
      {
        sucesso: true,
        resultado,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('excede o limite') || msg.includes('5 MB')) {
      return NextResponse.json({ sucesso: false, mensagem: msg }, { status: 413 });
    }
    if (msg.includes('XXE') || msg.includes('DTD') || msg.includes('rejeitado')) {
      return NextResponse.json({ sucesso: false, mensagem: msg }, { status: 400 });
    }

    return NextResponse.json(
      {
        sucesso: false,
        mensagem: 'Erro interno ao executar a orquestração fiscal da NF-e',
        detalhes: msg,
      },
      { status: 500 }
    );
  }
}
