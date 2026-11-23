import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { extrairNfseNacionalXml } from '@/lib/extrator-nfse';
import { auditarNfseNacional } from '@/lib/fiscal/auditoria-nfse';
import { getDocumentosRepository } from '@/lib/db/documentos-repository';
import { ESCRITORIO_PADRAO_ID } from '@/lib/db/empresas-repository';

export const dynamic = 'force-dynamic';

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

const AuditarNfseJsonSchema = z.object({
  xml: z.string().min(1, 'Conteúdo XML é obrigatório'),
  empresaId: z.string().uuid().optional(),
  escritorioId: z.string().uuid().optional(),
  perfilAdquirente: z
    .object({
      regime: z.enum(['SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI']),
      simplesOptanteHibrido2027: z.boolean().optional(),
    })
    .optional(),
  statusExtincaoRtc: z.enum(['EXTINTO_SPLIT', 'EXTINTO_PAGAMENTO', 'AGUARDANDO_EXTINCAO', 'SIMULACAO_PROJETADA']).optional(),
  calcularRtcOficial: z.boolean().optional().default(true),
  persistir: z.boolean().optional().default(false),
});

/**
 * POST /api/fiscal/auditar-nfse
 * Recebe XML de NFS-e ou DPS Padrão Nacional, executa extração determinística,
 * auditoria fiscal da Reforma e conciliação com sidecars oficiais da RFB.
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`auditar-nfse:${clientIp}`, { maxRequests: 30, windowMs: 60_000 });
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

  const contentType = req.headers.get('content-type') || '';
  let xmlString = '';
  let empresaId: string | undefined;
  let escritorioId: string | undefined;
  let perfilAdquirente: any;
  let statusExtincaoRtc: any;
  let calcularRtcOficial = true;
  let persistir = false;

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file || typeof file === 'string') {
        return NextResponse.json(
          { sucesso: false, mensagem: 'Arquivo XML da NFS-e não enviado no campo "file".' },
          { status: 400 }
        );
      }

      const fileObj = file as File;
      if (fileObj.size > MAX_PAYLOAD_SIZE) {
        return NextResponse.json(
          { sucesso: false, mensagem: `Arquivo excede o limite máximo de 5 MB (${(fileObj.size / 1024 / 1024).toFixed(2)} MB).` },
          { status: 413 }
        );
      }

      xmlString = await fileObj.text();
      empresaId = formData.get('empresaId')?.toString();
      escritorioId = formData.get('escritorioId')?.toString();
      statusExtincaoRtc = formData.get('statusExtincaoRtc')?.toString() as any;
      persistir = formData.get('persistir') === 'true';
    } else {
      const rawText = await req.text();
      const byteLen = Buffer.byteLength(rawText, 'utf-8');

      if (byteLen > MAX_PAYLOAD_SIZE) {
        return NextResponse.json(
          { sucesso: false, mensagem: `Payload excede o limite máximo de 5 MB (${(byteLen / 1024 / 1024).toFixed(2)} MB).` },
          { status: 413 }
        );
      }

      if (contentType.includes('application/json')) {
        let jsonBody: any;
        try {
          jsonBody = JSON.parse(rawText);
        } catch {
          return NextResponse.json(
            { sucesso: false, mensagem: 'Corpo da requisição JSON inválido.' },
            { status: 400 }
          );
        }

        const parsed = AuditarNfseJsonSchema.safeParse(jsonBody);
        if (!parsed.success) {
          return NextResponse.json(
            { sucesso: false, mensagem: 'Parâmetros inválidos.', erros: parsed.error.format() },
            { status: 400 }
          );
        }

        xmlString = parsed.data.xml;
        empresaId = parsed.data.empresaId;
        escritorioId = parsed.data.escritorioId;
        perfilAdquirente = parsed.data.perfilAdquirente;
        statusExtincaoRtc = parsed.data.statusExtincaoRtc;
        calcularRtcOficial = parsed.data.calcularRtcOficial;
        persistir = parsed.data.persistir;
      } else {
        xmlString = rawText;
      }
    }

    // Validação de presença
    if (!xmlString || !xmlString.trim()) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'XML da NFS-e / DPS não informado.' },
        { status: 400 }
      );
    }

    // Trava de segurança anti-XXE
    if (/<!DOCTYPE/i.test(xmlString) || /<!ENTITY/i.test(xmlString)) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Segurança Fiscal: XML contém declaração DOCTYPE ou ENTITY potencialmente vulnerável a XXE.' },
        { status: 400 }
      );
    }

    // 1. Extração
    const extracao = extrairNfseNacionalXml(xmlString);

    // 2. Auditoria
    const resultadoAuditoria = await auditarNfseNacional(extracao, {
      empresaId,
      perfilAdquirente,
      statusExtincaoRtc,
      calcularRtcOficial,
    });

    // 3. Persistência Opcional
    let persistenciaResult: any = undefined;
    if (persistir && empresaId) {
      try {
        const docRepo = getDocumentosRepository();
        const escId = escritorioId || ESCRITORIO_PADRAO_ID;
        const chaveAcesso = extracao.identificacao.chNFSe || extracao.identificacao.idDps || `NFSE${extracao.prestador.cnpj || '00'}${extracao.identificacao.nNFSe || '0'}`;
        const numNota = parseInt(extracao.identificacao.nNFSe || extracao.identificacao.nDPS || '0', 10) || 0;

        let docId: string | undefined;
        let jaExistia = false;

        try {
          const gravado = await docRepo.salvarDocumento({
            escritorioId: escId,
            empresaId,
            chaveAcesso,
            numero: numNota,
            serie: extracao.identificacao.serie || '1',
            modelo: 'NFSE',
            tipoOperacao: '0', // Entrada / Tomado
            dataEmissao: extracao.identificacao.dhEmi,
            emitenteCnpj: extracao.prestador.cnpj || '00000000000000',
            emitenteRazaoSocial: extracao.prestador.xNome || 'PRESTADOR',
            emitenteUf: extracao.prestador.endereco?.uf || 'PR',
            destinatarioCnpj: extracao.tomador?.cnpj,
            destinatarioRazaoSocial: extracao.tomador?.xNome,
            destinatarioUf: extracao.tomador?.endereco?.uf,
            valorTotalProdutos: extracao.valores.vServ,
            valorTotalNota: extracao.valores.vLiq || extracao.valores.vServ,
            valorTotalIcms: 0,
            valorTotalIcmsSt: 0,
            valorTotalIbs: extracao.reformaTributaria?.vIBS || 0,
            valorTotalCbs: extracao.reformaTributaria?.vCBS || 0,
            xmlOriginal: xmlString,
            metadata: {
              cTribNac: extracao.servico.cTribNac,
              cNBS: extracao.servico.cNBS,
              vISSQN: extracao.valores.vISSQN,
              alertasCriticos: resultadoAuditoria.alertas.filter((a) => a.severidade === 'CRITICO').length,
            },
          });
          docId = gravado.id;
        } catch (errDuplicado: any) {
          if (errDuplicado?.name === 'ErroDocumentoDuplicado' || errDuplicado?.code === '23505') {
            jaExistia = true;
            const existente = await docRepo.buscarPorChave(empresaId, chaveAcesso);
            docId = existente?.id;
          } else {
            throw errDuplicado;
          }
        }

        const execReg = await docRepo.registrarExecucaoMotor({
          escritorioId: escId,
          empresaId,
          documentoId: docId,
          motorTipo: 'AUDITOR_NFSE_NACIONAL',
          versaoMotor: 'v6.0.0-nfse',
          inputPayload: {
            chaveAcesso,
            validoParaEmissao: resultadoAuditoria.validoParaEmissao,
            totalAlertas: resultadoAuditoria.alertas.length,
          },
          outputPayload: {
            alertas: resultadoAuditoria.alertas,
            conciliacaoRtc: resultadoAuditoria.conciliacaoRtc,
          },
          sucesso: true,
          duracaoMs: 10,
        });

        persistenciaResult = {
          salvo: true,
          documentoJaExistia: jaExistia,
          documentoId: docId,
          execucaoMotorId: execReg.id,
        };
      } catch (errPersist: any) {
        persistenciaResult = {
          salvo: false,
          erro: errPersist.message,
        };
      }
    }

    return NextResponse.json({
      ...resultadoAuditoria,
      persistencia: persistenciaResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        sucesso: false,
        mensagem: err.message || 'Erro ao processar e auditar NFS-e / DPS Nacional.',
      },
      { status: 400 }
    );
  }
}
