/**
 * Utilitário de Rate Limit em memória para rotas de API sensíveis.
 * Implementa janela deslizante simples por IP com expiração automática.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Limpeza a cada 5 minutos para evitar crescimento indefinido da memória
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeExpiredRecords(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const threshold = now - windowMs;
  for (const [key, record] of rateLimitStore.entries()) {
    record.timestamps = record.timestamps.filter((t) => t > threshold);
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSec: number;
}

/**
 * Verifica e consome cota de requisições para uma chave identificadora (ex.: IP).
 * Padrão: 20 requisições por minuto (60.000 ms).
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const maxRequests = options.maxRequests ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();

  purgeExpiredRecords(windowMs);

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Descarta requisições fora da janela atual
  const threshold = now - windowMs;
  record.timestamps = record.timestamps.filter((t) => t > threshold);

  if (record.timestamps.length >= maxRequests) {
    const oldestTimestamp = record.timestamps[0];
    const resetMs = Math.max(0, oldestTimestamp + windowMs - now);
    const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));
    return {
      success: false,
      limit: maxRequests,
      remaining: 0,
      resetMs,
      retryAfterSec,
    };
  }

  record.timestamps.push(now);
  const remaining = Math.max(0, maxRequests - record.timestamps.length);

  return {
    success: true,
    limit: maxRequests,
    remaining,
    resetMs: windowMs,
    retryAfterSec: 0,
  };
}

/**
 * Extrai o endereço IP do cliente a partir dos cabeçalhos da requisição.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  return '127.0.0.1';
}

/**
 * Reseta o store em memória (útil para testes unitários).
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
