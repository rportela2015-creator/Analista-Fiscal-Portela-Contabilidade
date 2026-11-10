/**
 * Configuração centralizada e governança dos modelos de IA (Gemini Cloud e Ollama Local).
 * Garante que chaves de API e modelos suportados não fiquem hardcoded em rotas.
 */

const DEFAULT_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash'];

/**
 * Retorna a chave de API do Gemini/Google GenAI a partir das variáveis de ambiente.
 */
export function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

/**
 * Retorna a lista de modelos Gemini em ordem de prioridade.
 * Pode ser sobrescrita pela variável de ambiente GEMINI_MODELS (separada por vírgula).
 */
export function getModels(): string[] {
  const envModels = process.env.GEMINI_MODELS;
  if (envModels && typeof envModels === 'string') {
    const parsed = envModels
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return [...DEFAULT_GEMINI_MODELS];
}
