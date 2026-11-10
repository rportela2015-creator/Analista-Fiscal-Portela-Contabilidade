import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { getMapaD8, getServerDataset } from '@/lib/ai/ncm-server';
import { sanearClassificacao, validarCandidatosSiscomex } from '@/lib/ai/sanear-classificacao';
import { classify } from '@/lib/engine';
import {
  isOllamaOnline,
  getOllamaModels,
  generateOllama,
  getSovereigntyMode,
  getBestPericiaModel,
  extrairJsonOllama,
} from '@/lib/ollama-client';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getApiKey, getModels } from '@/lib/ai/config';

function encontrarCandidatosSiscomex(descricao: string, limite = 6) {
  try {
    const ds = getServerDataset();
    const res = classify(descricao, ds, { top: limite });
    return res.candidates.map((c) => ({
      ncm: c.rec.ncm,
      desc: c.rec.desc,
      score: Number(c.score.toFixed(2)),
    }));
  } catch (err) {
    console.warn('Falha no recuperador BM25 server-side:', err);
    return [];
  }
}

export async function POST(req: Request) {
  // 1. Rate Limiting em memória (20 req/min por IP)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, { maxRequests: 20, windowMs: 60_000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: 'Limite de requisições excedido (máximo 20 req/min). Aguarde antes de enviar nova consulta.',
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
    const { descricao, contextoOperacao, candidatos: candidatosRecebidos } = await req.json();

    if (!descricao || !descricao.trim()) {
      return NextResponse.json(
        { error: 'Descrição do item não informada.' },
        { status: 400 }
      );
    }

    const mapaD8 = getMapaD8();
    const candidatosValidados = Array.isArray(candidatosRecebidos) && candidatosRecebidos.length > 0
      ? validarCandidatosSiscomex(candidatosRecebidos, mapaD8, 6)
      : [];

    const candidatos = candidatosValidados.length > 0
      ? candidatosValidados
      : encontrarCandidatosSiscomex(descricao, 6);

    const candidatosTexto = candidatos.length > 0
      ? candidatos.map((c: any) => `- NCM: ${c.ncm} | Descrição oficial: ${c.desc}`).join('\n')
      : 'Nenhum candidato direto encontrado por termos.';

    const prompt = `Você é um auditor fiscal perito na Tabela NCM/SH, NESH e na Reforma Tributária Brasileira (LC 214/2025 e LC 227/2025).
Classifique a mercadoria abaixo determinando o código NCM (8 dígitos) e a parametrização para o período de transição (IBS/CBS/IS).

Produto: "${descricao}"
Contexto: "${contextoOperacao || 'Operação comercial interna padrão'}"

CANDIDATOS OFICIAIS DO SISCOMEX ENCONTRADOS PARA APOIO:
${candidatosTexto}

INSTRUÇÕES FISCAIS:
1. Determine o código NCM oficial com 8 dígitos sem pontos (ex: "84713012"). Priorize os candidatos oficiais acima caso se apliquem.
2. Forneça a descrição oficial do subitem.
3. Classifique o nível de confiança como "ALTA", "MEDIA" ou "BAIXA".
4. Sugira o CST de IBS/CBS (ex: "000" para tributação integral, "200" para alíquota reduzida, "400" para isenção, "410" para não incidência).
5. Sugira o código cClassTrib (ex: "000001" padrão, ou código específico de 6 dígitos).
6. Indique se o item está sujeito ao Imposto Seletivo (true ou false).
7. Escreva uma fundamentação sucinta citando as Regras Gerais de Interpretação (RGI 1 a 6).

Responda ESTRITAMENTE em formato JSON puro seguindo este schema:
{
  "ncm": "84713012",
  "descricaoNcm": "Descrição oficial do NCM",
  "confianca": "ALTA",
  "cstIbsCbs": "000",
  "cClassTrib": "000001",
  "sujeitoImpostoSeletivo": false,
  "fundamentacao": "Justificativa legal e RGI aplicadas"
}`;

    // 1. TENTATIVA LOCAL-FIRST: Ollama (GPU RX 580 / Zero Custo / Privado)
    const ollamaOnline = await isOllamaOnline(1200);
    if (ollamaOnline) {
      try {
        const models = await getOllamaModels();
        const preferredModel = getBestPericiaModel(models);

        const respostaOllama = await generateOllama({
          model: preferredModel,
          prompt,
          format: 'json',
          timeoutMs: 70000,
          num_ctx: 16384,
        });

        if (respostaOllama) {
          const parsed = extrairJsonOllama(respostaOllama);
          const saneado = sanearClassificacao(parsed, mapaD8);
          return NextResponse.json({
            ...saneado,
            motor: `Ollama Local (${preferredModel}) · GPU RX 580`,
          });
        }
      } catch (ollamaErr: any) {
        console.warn('Ollama falhou, avaliando modo de soberania...', ollamaErr?.message || ollamaErr);
      }
    }

    // Modo de soberania estrita: bloqueia qualquer envio para nuvem externa
    const sovereigntyMode = getSovereigntyMode();
    if (sovereigntyMode === 'local_strict') {
      return NextResponse.json(
        {
          error: 'Modo de Soberania Estrita ativo (AI_SOVEREIGNTY_MODE=local_strict). O serviço de inferência local Ollama na GPU RX 580 (http://127.0.0.1:11434) está indisponível ou falhou. O envio de dados confidenciais para provedores externos em nuvem foi bloqueado.',
        },
        { status: 503 }
      );
    }

    // 2. FALLBACK NUVEM: Gemini API (se chave presente e créditos disponíveis)
    const apiKey = getApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const config = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ncm: { type: Type.STRING, description: 'Código NCM com 8 dígitos sem pontos' },
              descricaoNcm: { type: Type.STRING, description: 'Descrição oficial sucinta do subitem' },
              confianca: { type: Type.STRING, enum: ['ALTA', 'MEDIA', 'BAIXA'] },
              cstIbsCbs: { type: Type.STRING, description: 'CST de IBS/CBS sugerido (ex.: 000, 200, 400)' },
              cClassTrib: { type: Type.STRING, description: 'Código cClassTrib ou vazio' },
              sujeitoImpostoSeletivo: { type: Type.BOOLEAN, description: 'Se incide Imposto Seletivo' },
              fundamentacao: { type: Type.STRING, description: 'Justificativa legal sucinta (máximo 2 frases)' },
            },
            required: ['ncm', 'descricaoNcm', 'confianca', 'cstIbsCbs', 'sujeitoImpostoSeletivo', 'fundamentacao'],
          },
        };

        const modelos = getModels();
        let responseText = '';
        let geminiErr: any = null;

        for (const model of modelos) {
          try {
            const res = await ai.models.generateContent({
              model,
              contents: prompt,
              config,
            });
            if (res.text) {
              responseText = res.text;
              break;
            }
          } catch (err: any) {
            geminiErr = err;
            console.warn(`Tentativa com ${model} falhou:`, err?.message || err);
          }
        }

        if (responseText) {
          const resultado = sanearClassificacao(JSON.parse(responseText), mapaD8);
          return NextResponse.json({
            ...resultado,
            motor: 'Gemini Cloud (Google AI)',
          });
        }

        // Se o erro foi de créditos esgotados (402 RESOURCE_EXHAUSTED)
        if (geminiErr?.status === 402 || geminiErr?.message?.includes('credits are depleted') || geminiErr?.message?.includes('RESOURCE_EXHAUSTED')) {
          return NextResponse.json(
            {
              error: 'Créditos pré-pagos do Google AI Studio esgotados (402). Por favor, inicie o Ollama local (ollama serve) para classificação 100% gratuita na GPU.',
            },
            { status: 503 }
          );
        }
      } catch (errCloud: any) {
        console.error('Erro na chamada Gemini:', errCloud);
      }
    }

    // Se nenhum motor respondeu
    return NextResponse.json(
      {
        error: 'Nenhum motor de IA disponível. Certifique-se de que o Ollama local está ativo (http://127.0.0.1:11434) ou configure a chave GEMINI_API_KEY.',
      },
      { status: 503 }
    );
  } catch (error: any) {
    console.error('Erro na rota classificar-ia:', error);
    return NextResponse.json(
      { error: error.message || 'Falha ao processar classificação fiscal.' },
      { status: 500 }
    );
  }
}
