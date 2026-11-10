/**
 * Cliente nativo para Ollama Local (GPU RX 580 / DirectML / Vulkan)
 * Suporta formatos JSON estritos, gestão de timeout e fallback resiliente.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

export interface OllamaGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  format?: 'json';
  temperature?: number;
  timeoutMs?: number;
  num_ctx?: number;
}

export type SovereigntyMode = 'local_strict' | 'local_first' | 'hybrid';

/** Retorna a flag de soberania configurada no ambiente (default: local_first) */
export function getSovereigntyMode(): SovereigntyMode {
  const mode = (process.env.AI_SOVEREIGNTY_MODE || 'local_first').toLowerCase().trim();
  if (mode === 'local_strict') return 'local_strict';
  if (mode === 'hybrid') return 'hybrid';
  return 'local_first';
}

/** Escolhe o melhor modelo para triagem rápida e extração de entidades */
export function getBestTriagemModel(models: string[]): string {
  const m4b16k = models.find((m) => m === 'qwen3.5:4b-16k' || m.startsWith('qwen3.5:4b-16k'));
  if (m4b16k) return m4b16k;
  const m4b = models.find((m) => m === 'qwen3.5:4b' || m.startsWith('qwen3.5:4b'));
  if (m4b) return m4b;
  const m7b16k = models.find((m) => m === 'qwen2.5:7b-16k' || m.startsWith('qwen2.5:7b-16k'));
  if (m7b16k) return m7b16k;
  const m7b = models.find((m) => m === 'qwen2.5:7b' || m.startsWith('qwen2.5:7b'));
  if (m7b) return m7b;
  return models[0] || 'qwen3.5:4b-16k';
}

/** Escolhe o melhor modelo para arbitragem pericial profunda e laudos */
export function getBestPericiaModel(models: string[]): string {
  const m7b16k = models.find((m) => m === 'qwen2.5:7b-16k' || m.startsWith('qwen2.5:7b-16k'));
  if (m7b16k) return m7b16k;
  const m7b = models.find((m) => m === 'qwen2.5:7b' || m.startsWith('qwen2.5:7b'));
  if (m7b) return m7b;
  const m4b16k = models.find((m) => m === 'qwen3.5:4b-16k' || m.startsWith('qwen3.5:4b-16k'));
  if (m4b16k) return m4b16k;
  const m4b = models.find((m) => m === 'qwen3.5:4b' || m.startsWith('qwen3.5:4b'));
  if (m4b) return m4b;
  return models[0] || 'qwen2.5:7b-16k';
}

/** Extrai JSON de resposta de texto (inclusive blocos com markdown ```json ou texto conversacional envolvente) */
export function extrairJsonOllama(texto: string): any {
  let limpo = (texto || '').trim();
  const match = limpo.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    limpo = match[1].trim();
  } else {
    const firstBrace = limpo.indexOf('{');
    const lastBrace = limpo.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      limpo = limpo.slice(firstBrace, lastBrace + 1);
    }
  }
  return JSON.parse(limpo);
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

/** Verifica se o serviço do Ollama local está ativo e respondendo */
export async function isOllamaOnline(timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

/** Retorna lista de modelos disponíveis no Ollama local */
export async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: any) => m.name || m.model);
  } catch {
    return [];
  }
}

/** Executa inferência local no Ollama */
export async function generateOllama(options: OllamaGenerateOptions): Promise<string> {
  const model = options.model || 'qwen2.5:7b';
  const temperature = options.temperature ?? 0.1;
  const timeoutMs = options.timeoutMs ?? 45000;
  const num_ctx = options.num_ctx ?? 16384;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload: any = {
    model,
    prompt: options.prompt,
    stream: false,
    options: {
      temperature,
      num_ctx,
    },
  };

  if (options.system) payload.system = options.system;
  if (options.format === 'json') payload.format = 'json';

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data.response || '';
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Tempo limite excedido (${timeoutMs}ms) na resposta do Ollama local.`);
    }
    throw err;
  }
}
