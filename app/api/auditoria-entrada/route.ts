import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getFiscalContext } from '@/lib/fiscal-context';
import { GoogleGenAI, Type } from '@google/genai';
import {
  isOllamaOnline,
  getOllamaModels,
  generateOllama,
  getSovereigntyMode,
  getBestTriagemModel,
  extrairJsonOllama,
} from '@/lib/ollama-client';
import { getMapaD8 } from '@/lib/ai/ncm-server';
import { validarNcmIA } from '@/lib/ai/validar';
import { extrairDadosNfe, FiscalExtractionError } from '@/lib/extrator-nfe';
import {
  executarAuditoriaParticionada,
  validarAuditPayload,
} from '@/lib/auditoria-particionada';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getApiKey, getModels } from '@/lib/ai/config';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (Hardening de Segurança)
const MAX_PDF_TEXT_LENGTH = 60_000; // Truncamento defensivo de contexto

function validarMagicBytes(buffer: Buffer, ext: string): { valido: boolean; motivo?: string } {
  if (ext.endsWith('.xml')) {
    // Remove possíveis marcas de ordem de byte (BOM UTF-8) e espaços
    const inicio = buffer.subarray(0, 512).toString('utf-8').replace(/^\uFEFF/, '').trimStart();
    if (!inicio.startsWith('<?xml') && !inicio.startsWith('<')) {
      return { valido: false, motivo: 'Arquivo XML não possui declaração <?xml ou tag de abertura válida.' };
    }
    return { valido: true };
  }
  if (ext.endsWith('.pdf')) {
    const magic = buffer.subarray(0, 4).toString('ascii');
    if (magic !== '%PDF') {
      return { valido: false, motivo: 'Arquivo PDF não possui a assinatura mágica esperada (%PDF).' };
    }
    return { valido: true };
  }
  return { valido: false, motivo: 'Extensão de arquivo não reconhecida.' };
}

export async function POST(request: Request) {
  // 1. Rate Limiting em memória (20 req/min por IP)
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp, { maxRequests: 20, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: 'Limite de requisições excedido (máximo 20 req/min). Aguarde antes de enviar nova requisição.',
        codigo: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSec),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  }

  try {
    const url = new URL(request.url);
    const queryAction = url.searchParams.get('action');

    const contentType = request.headers.get('content-type') || '';

    // Suporte a requisições JSON (action=auditar)
    if (contentType.includes('application/json')) {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Corpo da requisição JSON inválido ou malformado.', codigo: 'JSON_MALFORMADO' },
          { status: 400 }
        );
      }

      const action = queryAction || body.action || (body.itensSelecionados ? 'auditar' : null);
      if (action === 'auditar') {
        const t0 = performance.now();
        try {
          validarAuditPayload(body);
        } catch (valErr: any) {
          return NextResponse.json(
            { error: valErr.message || 'Payload de auditoria inválido.', codigo: 'PAYLOAD_INVALIDO' },
            { status: 400 }
          );
        }

        try {
          const resultado = await executarAuditoriaParticionada(body);
          resultado.tempoExecucaoMs = Math.round(performance.now() - t0);
          return NextResponse.json(resultado, {
            status: 200,
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'X-Audit-Engine': resultado.motorUtilizado,
              'X-Execution-Time-Ms': String(resultado.tempoExecucaoMs),
            },
          });
        } catch (err: any) {
          const elapsed = Math.round(performance.now() - t0);
          const isTimeout =
            err.message?.includes('timeout') ||
            err.message?.includes('Tempo limite excedido') ||
            err.codigo === 'TIMEOUT_AUDITORIA';
          const isOffline =
            err.message?.includes('ECONNREFUSED') ||
            err.message?.includes('offline') ||
            err.message?.includes('indisponível') ||
            err.codigo === 'OLLAMA_OFFLINE';
          const isKeyMissing = err.codigo === 'GEMINI_KEY_MISSING';
          const isSovereignty = err.codigo === 'SOBERANIA_LOCAL_ESTRITA';
          const statusCode = isTimeout ? 504 : isOffline || isKeyMissing || isSovereignty ? 503 : 500;

          return NextResponse.json(
            {
              error: err.message || 'Falha ao executar auditoria pericial.',
              codigo: err.codigo || (isTimeout ? 'TIMEOUT_AUDITORIA' : 'ERRO_AUDITORIA'),
              tempoExecucaoMs: elapsed,
            },
            { status: statusCode }
          );
        }
      }

      return NextResponse.json(
        { error: "Ação não suportada para JSON. Utilize action=auditar.", codigo: 'ACAO_INVALIDA' },
        { status: 400 }
      );
    }

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          error: "Tipo de conteúdo inválido. A requisição deve ser enviada como 'multipart/form-data' ou 'application/json'.",
          codigo: 'CONTENT_TYPE_INVALIDO',
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const formAction = formData.get('action') as string | null;
    const action = queryAction || formAction;

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

    // Validação estrita de tamanho (5 MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `O arquivo enviado excede o limite máximo permitido de 5MB (${(file.size / (1024 * 1024)).toFixed(2)}MB recebido).`,
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

    // Validação estrita de magic bytes
    const checkMagic = validarMagicBytes(buffer, ext);
    if (!checkMagic.valido) {
      return NextResponse.json(
        {
          error: checkMagic.motivo || 'Assinatura mágica de arquivo inválida.',
          codigo: 'MAGIC_BYTES_INVALIDO',
        },
        { status: 400 }
      );
    }

    // Despacho determinístico imediato para action=extrair (< 200ms, zero LLM)
    if (action === 'extrair') {
      const t0 = performance.now();
      const dadosExtraidos = await extrairDadosNfe(buffer, filename, { regime, finalidade });
      dadosExtraidos.tempoExtracaoMs = Math.round(performance.now() - t0);

      return NextResponse.json(dadosExtraidos, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Extraction-Time-Ms': String(dadosExtraidos.tempoExtracaoMs),
        },
      });
    }

    // Modo Legado de Auditoria Monolítica
    let parsedContent = '';
    let isXml = false;
    let originalItens: Record<string, any> = {};

    if (ext.endsWith('.xml')) {
      const xmlString = buffer.toString('utf-8');
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsedXml = parser.parse(xmlString);

      const nfe = parsedXml.nfeProc?.NFe?.infNFe || parsedXml.NFe?.infNFe;

      if (!nfe) {
        return NextResponse.json({ error: 'XML de NF-e inválido.' }, { status: 400 });
      }

      // Extração determinística do XML
      const emit = {
        cnpj: nfe.emit?.CNPJ,
        nome: nfe.emit?.xNome,
        crt: nfe.emit?.CRT,
      };

      const dest = {
        cnpj: nfe.dest?.CNPJ,
        cpf: nfe.dest?.CPF,
        nome: nfe.dest?.xNome,
      };

      const itens = Array.isArray(nfe.det) ? nfe.det : (nfe.det ? [nfe.det] : []);

      function extrairResumoImposto(imp: any) {
        if (!imp) return undefined;
        const res: Record<string, any> = {};

        // ICMS
        if (imp.ICMS && typeof imp.ICMS === 'object') {
          const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
          const icmsGroup = subKey ? (imp.ICMS[subKey] as any) : undefined;
          if (icmsGroup && typeof icmsGroup === 'object') {
            if (icmsGroup.CST || icmsGroup.CSOSN) res.cstIcms = icmsGroup.CST || icmsGroup.CSOSN;
            if (icmsGroup.orig !== undefined) res.orig = icmsGroup.orig;
            if (icmsGroup.pICMS) res.pICMS = icmsGroup.pICMS;
            if (icmsGroup.vICMS) res.vICMS = icmsGroup.vICMS;
            if (icmsGroup.vBC) res.vBC = icmsGroup.vBC;
            if (icmsGroup.pMVAST) res.pMVAST = icmsGroup.pMVAST;
            if (icmsGroup.vICMSST) res.vICMSST = icmsGroup.vICMSST;
          }
        }

        // IPI
        if (imp.IPI) {
          const ipiGroup = imp.IPI.IPITrib || imp.IPI.IPINT;
          if (ipiGroup) {
            if (ipiGroup.CST) res.cstIpi = ipiGroup.CST;
            if (ipiGroup.pIPI) res.pIPI = ipiGroup.pIPI;
            if (ipiGroup.vIPI) res.vIPI = ipiGroup.vIPI;
          }
        }

        // PIS
        if (imp.PIS && typeof imp.PIS === 'object') {
          const subKey = Object.keys(imp.PIS).find((k) => !k.startsWith('@_'));
          const pisGroup = subKey ? (imp.PIS[subKey] as any) : undefined;
          if (pisGroup && typeof pisGroup === 'object') {
            if (pisGroup.CST) res.cstPis = pisGroup.CST;
            if (pisGroup.pPIS) res.pPIS = pisGroup.pPIS;
          }
        }

        // COFINS
        if (imp.COFINS && typeof imp.COFINS === 'object') {
          const subKey = Object.keys(imp.COFINS).find((k) => !k.startsWith('@_'));
          const cofinsGroup = subKey ? (imp.COFINS[subKey] as any) : undefined;
          if (cofinsGroup && typeof cofinsGroup === 'object') {
            if (cofinsGroup.CST) res.cstCofins = cofinsGroup.CST;
            if (cofinsGroup.pCOFINS) res.pCOFINS = cofinsGroup.pCOFINS;
          }
        }

        return Object.keys(res).length > 0 ? res : undefined;
      }

      const detExtraido = itens.map((d: any) => ({
        cProd: d.prod?.cProd,
        xProd: d.prod?.xProd,
        NCM: d.prod?.NCM,
        CEST: d.prod?.CEST,
        CFOP: d.prod?.CFOP,
        vProd: d.prod?.vProd,
        tributosFornecedor: extrairResumoImposto(d.imposto),
      }));

      const resumo = {
        emit,
        dest,
        totalItensNaNota: itens.length,
        itensAuditados: itens.length,
        itens: detExtraido,
      };

      parsedContent = JSON.stringify(resumo, null, 2);
    } else if (ext.endsWith('.pdf')) {
      let text = '';
      try {
        if ((pdfParseModule as any).PDFParse) {
          const PDFParseClass = (pdfParseModule as any).PDFParse;
          const parser = new PDFParseClass({ data: buffer });
          const textResult = await parser.getText();
          text = typeof textResult === 'string' ? textResult : (textResult?.text || JSON.stringify(textResult));
        } else if (typeof pdfParse === 'function') {
          const pdfData = await pdfParse(buffer);
          text = pdfData?.text || '';
        }
      } catch (pdfErr: any) {
        console.warn('Falha na extração de texto do PDF:', pdfErr);
      }

      // Truncamento em 60.000 caracteres para proteção de contexto
      const textoTruncado = text.length > MAX_PDF_TEXT_LENGTH;
      if (textoTruncado) {
        text = text.slice(0, MAX_PDF_TEXT_LENGTH);
      }

      // Basic deterministic extraction for PDF to help the AI (DANFE structure)
      const emitMatch = text.match(/CNPJ:\s*([\d\.\-\/]+)/);
      const destMatch = text.match(/DESTINATÁRIO[\s\S]*?CNPJ\/CPF:\s*([\d\.\-\/]+)/);

      const cfops = [...text.matchAll(/CFOP:\s*(\d{4})/g)].map((m) => m[1]);
      const ncms = [...text.matchAll(/NCM[\/\s]*SH[:\s]*([\d\.]+)/g)].map((m) => m[1]);

      const resumoPdf = {
        textoIntegral: text,
        textoTruncado,
        extracaoAuxiliar: {
          emitenteCnpj: emitMatch ? emitMatch[1] : null,
          destinatarioCnpjCpf: destMatch ? destMatch[1] : null,
          cfopsEncontrados: [...new Set(cfops)],
          ncmsEncontrados: [...new Set(ncms)],
        },
      };

      parsedContent = JSON.stringify(resumoPdf, null, 2);
    } else {
      return NextResponse.json({ error: 'Formato de arquivo não suportado. Apenas XML ou PDF.' }, { status: 400 });
    }

    const fiscalContext = await getFiscalContext();

    const userPrompt = `
Por favor, analise a seguinte nota fiscal de entrada considerando o contexto fiscal.
Regime do Destinatário: ${regime || 'Não informado'}
Finalidade da Aquisição: ${finalidade || 'Não informado'}

Conteúdo da Nota Fiscal (XML parseado ou texto de PDF):
${parsedContent}

Responda usando o seguinte JSON Schema, exatamente:
{
  "statusGlobal": "Regular | Atenção | Inconsistente",
  "parecerTecnicoXml": "Avaliação minuciosa da NF-e emitida pelo fornecedor (alíquotas interestaduais, retenções, consistência).",
  "parecerConformidade": "Resumo executivo sobre direito a créditos, riscos, DIFAL e estornos.",
  "itens": [
    {
      "cProd": "string",
      "xProd": "string",
      "ncm": "string",
      "cest": "string",
      "cfopEntrada": "string",
      "cstIcmsEntrada": "string",
      "aliqIcms": "string",
      "cstPisCofinsEntrada": "string",
      "aliqPis": "string",
      "aliqCofins": "string",
      "permiteCredito": true,
      "cClassTrib": "string",
      "aliqIbsTransitorio": "string",
      "aliqCbsTransitorio": "string",
      "regimeEspecial": "string",
      "instrucaoCadastro": "Instrução cirúrgica com a regra aplicada"
    }
  ]
}
`;

    const mapaD8 = getMapaD8();
    let erroOllama: string | null = null;

    // 1. TENTATIVA LOCAL-FIRST: Ollama (GPU RX 580 / Zero Custo / Privacidade Absoluta)
    const ollamaOnline = await isOllamaOnline(2000);
    if (ollamaOnline) {
      try {
        const models = await getOllamaModels();
        const preferredModel = getBestTriagemModel(models);

        const respostaOllama = await generateOllama({
          model: preferredModel,
          prompt: fiscalContext + '\n\n' + userPrompt,
          format: 'json',
          timeoutMs: 180000,
          num_ctx: 16384,
        });

        if (respostaOllama) {
          const parsed = extrairJsonOllama(respostaOllama);
          if (parsed && Array.isArray(parsed.itens)) {
            // Saneamento e validação de NCMs contra Siscomex
            parsed.itens = parsed.itens.map((it: any) => {
              const val = validarNcmIA(it, mapaD8);
              return {
                ...it,
                ncm: val.valido ? val.ncm : (it.ncm || ''),
                ncmValido: val.valido,
              };
            });

            return NextResponse.json({
              ...parsed,
              motor: `Ollama Local (${preferredModel}) · GPU RX 580`,
            });
          }
        }
      } catch (ollamaErr: any) {
        erroOllama = ollamaErr?.message || String(ollamaErr);
        console.warn('Ollama falhou na auditoria de entrada, avaliando soberania...', erroOllama);
      }
    }

    // Modo de soberania estrita: bloqueia qualquer envio de dados confidenciais para nuvem externa
    const sovereigntyMode = getSovereigntyMode();
    if (sovereigntyMode === 'local_strict') {
      return NextResponse.json(
        {
          error: 'Modo de Soberania Estrita ativo (AI_SOVEREIGNTY_MODE=local_strict). O serviço de inferência local Ollama na GPU RX 580 (http://127.0.0.1:11434) está indisponível ou falhou. O envio de documentos fiscais confidenciais para provedores em nuvem foi bloqueado.',
        },
        { status: 503 }
      );
    }

    // 2. FALLBACK NUVEM: Gemini API (se chave presente e soberania permitir)
    const apiKey = getApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const geminiModels = getModels();

        for (const model of geminiModels) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: [
                { role: 'user', parts: [{ text: fiscalContext + '\n\n' + userPrompt }] },
              ],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    statusGlobal: { type: Type.STRING },
                    parecerTecnicoXml: { type: Type.STRING },
                    parecerConformidade: { type: Type.STRING },
                    itens: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          cProd: { type: Type.STRING },
                          xProd: { type: Type.STRING },
                          ncm: { type: Type.STRING },
                          cest: { type: Type.STRING },
                          cfopEntrada: { type: Type.STRING },
                          cstIcmsEntrada: { type: Type.STRING },
                          aliqIcms: { type: Type.STRING },
                          cstPisCofinsEntrada: { type: Type.STRING },
                          aliqPis: { type: Type.STRING },
                          aliqCofins: { type: Type.STRING },
                          permiteCredito: { type: Type.BOOLEAN },
                          cClassTrib: { type: Type.STRING },
                          aliqIbsTransitorio: { type: Type.STRING },
                          aliqCbsTransitorio: { type: Type.STRING },
                          regimeEspecial: { type: Type.STRING },
                          instrucaoCadastro: { type: Type.STRING },
                        },
                        required: ['cProd', 'xProd', 'ncm', 'cClassTrib'],
                      },
                    },
                  },
                  required: ['statusGlobal', 'parecerTecnicoXml', 'parecerConformidade', 'itens'],
                },
              },
            });

            const textResponse = typeof response.text === 'function' ? (response as any).text() : response.text;
            if (textResponse) {
              const result = JSON.parse(textResponse);
              return NextResponse.json({
                ...result,
                motor: `Gemini Cloud (${model})`,
              });
            }
          } catch (modelErr: any) {
            console.warn(`Tentativa com ${model} na auditoria falhou:`, modelErr?.message || modelErr);
          }
        }
      } catch (geminiErr: any) {
        console.error('Erro na chamada Gemini:', geminiErr);
      }
    }

    if (erroOllama) {
      const isTimeout = erroOllama.includes('Tempo limite excedido') || erroOllama.includes('timeout') || erroOllama.includes('aborted');
      return NextResponse.json(
        {
          error: isTimeout
            ? 'O serviço de IA Local Ollama (GPU RX 580) está ativo, mas o processamento pericial excedeu o tempo limite (180s). O documento possui muitos itens ou a GPU está ocupada. Tente novamente em instantes.'
            : `Falha no motor local Ollama (GPU RX 580): ${erroOllama}. Certifique-se de que o modelo está carregado no endpoint http://127.0.0.1:11434.`,
          detalhe: erroOllama,
          motorTentado: 'Ollama Local (GPU RX 580)',
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'Nenhum motor de IA disponível para auditoria. Inicie o Ollama local (http://127.0.0.1:11434) ou configure a chave GEMINI_API_KEY.',
      },
      { status: 503 }
    );
  } catch (error: any) {
    console.error('Erro na auditoria de entrada:', error);
    const statusCode = error instanceof FiscalExtractionError ? error.statusCode : (error.statusCode || 500);
    const codigo = error instanceof FiscalExtractionError ? error.codigo : (error.codigo || 'ERRO_INTERNO');
    return NextResponse.json(
      {
        error: error.message || 'Erro interno ao processar documento fiscal.',
        codigo,
      },
      { status: statusCode }
    );
  }
}
