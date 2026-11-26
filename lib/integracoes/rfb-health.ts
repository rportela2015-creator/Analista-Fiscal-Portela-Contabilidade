/**
 * Camada de Resiliência, Configuração e Monitoramento de Saúde dos Sidecars RFB (RTC)
 *
 * Implementa:
 * - Leitura centralizada de variáveis de ambiente com defaults seguros
 * - Circuit Breaker em memória por serviço (CLOSED | OPEN | HALF_OPEN) com cooldown de 30s
 * - Executor resiliente com timeout via AbortController e medição de duração
 * - Normalização de erros no padrão RFC 7807 (ProblemDetail) e Echo JSON
 * - Probes paralelos para verificação do status dos motores oficiais
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export type ServicoRfb = 'rtc-regime-regular' | 'rtc-simples' | 'rtc-danfse';
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type RtcOperationMode = 'hybrid_fallback' | 'strict_rfb';
export type RtcMode = 'live' | 'snapshot' | 'hardcoded';

export interface NormasVigentesSnapshot {
  ntNfe: string;
  ricmsPr: string;
  lcReforma: string;
}

export interface RtcModeStatus {
  mode: RtcMode;
  stale: boolean;
  ageDays: number | null;
  updatedAt: string | null;
  snapshotSha256: string | null;
  normasVigentes: NormasVigentesSnapshot;
  bloqueioOperacional: boolean;
  motivoBloqueio?: string;
}

export const DEFAULT_NORMAS_VIGENTES_RTC: NormasVigentesSnapshot = {
  ntNfe: 'NT 2025.002 v1.52 / NT 2026.008 v1.01',
  ricmsPr: 'Dec. 7.871/2017 + Dec. 6.048/2024 + Dec. 12.828/2026',
  lcReforma: 'LC 214/2025 + LC 227/2026 + Res. CGSN 186/2026 e 194/2026',
};

export const MENSAGEM_BLOQUEIO_HARDCODED =
  'Snapshot oficial RFB/Reforma ausente ou corrompido (modo hardcoded). Execute npm run rfb:refresh antes de gerar laudos oficiais.';

const LIVE_PROBE_TIMEOUT_MS = 1200;
const LIVE_PROBE_CACHE_TTL_MS = 60_000;

let liveProbeCache: { checkedAt: number; ok: boolean; url: string } | null = null;

export function resetRtcModeCacheForTests(): void {
  liveProbeCache = null;
}

async function probeLiveSidecar(liveUrl: string, skipCache: boolean): Promise<boolean> {
  const now = Date.now();
  if (
    !skipCache &&
    liveProbeCache &&
    liveProbeCache.url === liveUrl &&
    now - liveProbeCache.checkedAt < LIVE_PROBE_CACHE_TTL_MS
  ) {
    return liveProbeCache.ok;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${liveUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    const ok = res.ok;
    liveProbeCache = { checkedAt: now, ok, url: liveUrl };
    return ok;
  } catch {
    liveProbeCache = { checkedAt: now, ok: false, url: liveUrl };
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function lerSnapshotLocal(dataDir: string, nowMs: number, maxAgeDays: number): Promise<{
  valido: boolean;
  stale: boolean;
  ageDays: number | null;
  updatedAt: string | null;
  snapshotSha256: string | null;
  normasVigentes: NormasVigentesSnapshot;
}> {
  const statusPath = path.join(dataDir, 'rfb-status.json');
  const reformaPath = path.join(dataDir, 'reforma.json');

  try {
    const [statusRaw, reformaRaw, reformaStat] = await Promise.all([
      readFile(statusPath, 'utf8'),
      readFile(reformaPath, 'utf8'),
      stat(reformaPath),
    ]);

    if (!reformaStat.isFile() || reformaStat.size < 100) {
      throw new Error('reforma.json ausente ou abaixo do tamanho mínimo');
    }

    const statusJson = JSON.parse(statusRaw);
    const reformaJson = JSON.parse(reformaRaw);

    const reformaValida =
      reformaJson &&
      typeof reformaJson === 'object' &&
      reformaJson.disponivel !== false &&
      Array.isArray(reformaJson.classificacoes) &&
      reformaJson.classificacoes.length > 0;

    const updatedAt = typeof statusJson?.updatedAt === 'string' ? statusJson.updatedAt : null;
    const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
    const sha = typeof statusJson?.snapshotSha256 === 'string' ? statusJson.snapshotSha256.trim() : '';
    const filesValidos = Array.isArray(statusJson?.files) && statusJson.files.length > 0;

    if (!reformaValida || !Number.isFinite(updatedMs) || !sha || !filesValidos) {
      throw new Error('Metadados de snapshot inválidos');
    }

    const diffDays = (nowMs - updatedMs) / 86_400_000;
    const ageDays = Math.max(0, Math.floor(diffDays));
    const stale = diffDays > maxAgeDays;

    const nv = statusJson?.normasVigentes || {};
    const normasVigentes: NormasVigentesSnapshot = {
      ntNfe: typeof nv.ntNfe === 'string' && nv.ntNfe.trim() ? nv.ntNfe.trim() : DEFAULT_NORMAS_VIGENTES_RTC.ntNfe,
      ricmsPr: typeof nv.ricmsPr === 'string' && nv.ricmsPr.trim() ? nv.ricmsPr.trim() : DEFAULT_NORMAS_VIGENTES_RTC.ricmsPr,
      lcReforma: typeof nv.lcReforma === 'string' && nv.lcReforma.trim() ? nv.lcReforma.trim() : DEFAULT_NORMAS_VIGENTES_RTC.lcReforma,
    };

    return {
      valido: true,
      stale,
      ageDays,
      updatedAt,
      snapshotSha256: sha,
      normasVigentes,
    };
  } catch {
    return {
      valido: false,
      stale: true,
      ageDays: null,
      updatedAt: null,
      snapshotSha256: null,
      normasVigentes: { ...DEFAULT_NORMAS_VIGENTES_RTC },
    };
  }
}

/**
 * Resolve o modo explícito de operação do motor RTC na ordem `live -> snapshot -> hardcoded`.
 * - `live`: somente com `RTC_LIVE_PROBE=true` e resposta saudável em <= 1200ms (cache 60s).
 * - `snapshot`: lê `public/data/rfb-status.json` + `public/data/reforma.json`.
 * - `hardcoded`: fallback emergencial quando snapshot ausente/corrompido (bloqueia fechamento oficial).
 */
export async function getRtcMode(options?: {
  dataDir?: string;
  nowMs?: number;
  maxAgeDays?: number;
  skipCache?: boolean;
  liveProbeUrl?: string;
}): Promise<RtcModeStatus> {
  const dataDir = options?.dataDir || process.env.RFB_DATA_DIR || path.join(process.cwd(), 'public', 'data');
  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeEnv = Number(process.env.RFB_MAX_AGE_DAYS ?? 30);
  const maxAgeDays = options?.maxAgeDays ?? (Number.isFinite(maxAgeEnv) && maxAgeEnv >= 0 ? maxAgeEnv : 30);

  const snap = await lerSnapshotLocal(dataDir, nowMs, maxAgeDays);

  if (process.env.RTC_LIVE_PROBE === 'true') {
    const baseUrl = (options?.liveProbeUrl || process.env.RTC_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    const liveOk = await probeLiveSidecar(baseUrl, Boolean(options?.skipCache));
    if (liveOk) {
      return {
        mode: 'live',
        stale: false,
        ageDays: snap.ageDays ?? 0,
        updatedAt: snap.updatedAt ?? new Date(nowMs).toISOString(),
        snapshotSha256: snap.snapshotSha256,
        normasVigentes: snap.normasVigentes,
        bloqueioOperacional: false,
      };
    }
  }

  if (snap.valido) {
    return {
      mode: 'snapshot',
      stale: snap.stale,
      ageDays: snap.ageDays,
      updatedAt: snap.updatedAt,
      snapshotSha256: snap.snapshotSha256,
      normasVigentes: snap.normasVigentes,
      bloqueioOperacional: false,
    };
  }

  return {
    mode: 'hardcoded',
    stale: true,
    ageDays: null,
    updatedAt: null,
    snapshotSha256: null,
    normasVigentes: { ...DEFAULT_NORMAS_VIGENTES_RTC },
    bloqueioOperacional: true,
    motivoBloqueio: MENSAGEM_BLOQUEIO_HARDCODED,
  };
}

export interface CircuitBreakerRecord {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

export interface ProblemDetailError {
  code?: string;
  title?: string;
  pointer?: string;
  detail?: string;
  type?: string;
}

export interface ProblemDetailRfb {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  timestamp?: string;
  errors?: ProblemDetailError[];
}

export class ErroIntegracaoRfb extends Error {
  public readonly servico: ServicoRfb;
  public readonly status: number;
  public readonly mensagem: string;
  public readonly codigo?: string;
  public readonly detalhes?: any;
  public readonly problemDetail?: ProblemDetailRfb;
  public readonly circuitBreakerState: CircuitBreakerState;
  public readonly duracaoMs: number;

  constructor(params: {
    servico: ServicoRfb;
    status: number;
    mensagem: string;
    codigo?: string;
    detalhes?: any;
    problemDetail?: ProblemDetailRfb;
    circuitBreakerState: CircuitBreakerState;
    duracaoMs?: number;
  }) {
    super(`[${params.servico}] ${params.mensagem} (Status: ${params.status})`);
    this.name = 'ErroIntegracaoRfb';
    this.servico = params.servico;
    this.status = params.status;
    this.mensagem = params.mensagem;
    this.codigo = params.codigo;
    this.detalhes = params.detalhes;
    this.problemDetail = params.problemDetail;
    this.circuitBreakerState = params.circuitBreakerState;
    this.duracaoMs = params.duracaoMs ?? 0;
  }
}

// Configurações do Circuit Breaker
const CB_FAILURE_THRESHOLD = 3;
const CB_COOLDOWN_MS = 30_000; // 30 segundos

const circuitBreakers: Record<ServicoRfb, CircuitBreakerRecord> = {
  'rtc-regime-regular': { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: null, lastSuccessTime: null },
  'rtc-simples': { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: null, lastSuccessTime: null },
  'rtc-danfse': { state: 'CLOSED', consecutiveFailures: 0, lastFailureTime: null, lastSuccessTime: null },
};

/**
 * Reseta os circuit breakers para uso em testes determinísticos.
 */
export function resetCircuitBreakersForTests(): void {
  for (const s of Object.keys(circuitBreakers) as ServicoRfb[]) {
    circuitBreakers[s] = {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
    };
  }
}

/**
 * Retorna o estado atual do circuit breaker de um serviço.
 */
export function getCircuitBreakerStatus(servico: ServicoRfb): CircuitBreakerRecord {
  const cb = circuitBreakers[servico];
  const now = Date.now();

  // Transição automática para HALF_OPEN se o tempo de cooldown passou
  if (cb.state === 'OPEN' && cb.lastFailureTime && now - cb.lastFailureTime > CB_COOLDOWN_MS) {
    cb.state = 'HALF_OPEN';
  }

  return { ...cb };
}

/**
 * Detecta se o erro decorre de falha de DNS ou recusa de conexão.
 */
export function isDnsOrConnectionRefused(err: any): boolean {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') return true;
  const msg = `${err.message || ''} ${err.cause?.message || ''}`;
  return msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED');
}

/**
 * Atualiza o circuit breaker após falha.
 */
export function registrarFalhaCircuitBreaker(servico: ServicoRfb, imediato = false): CircuitBreakerState {
  const cb = circuitBreakers[servico];
  const now = Date.now();

  cb.lastFailureTime = now;
  cb.consecutiveFailures += 1;

  if (imediato || cb.state === 'HALF_OPEN' || cb.consecutiveFailures >= CB_FAILURE_THRESHOLD) {
    cb.state = 'OPEN';
  }

  return cb.state;
}

/**
 * Atualiza o circuit breaker após sucesso.
 */
function registrarSucessoCircuitBreaker(servico: ServicoRfb): void {
  const cb = circuitBreakers[servico];
  cb.consecutiveFailures = 0;
  cb.lastSuccessTime = Date.now();
  cb.state = 'CLOSED';
}

/**
 * Retorna as configurações de ambiente dos motores RFB.
 */
export function getRfbConfig() {
  const regimeRegularUrl = (process.env.RTC_REGIME_REGULAR_URL || 'http://rtc-regime-regular:8080').replace(/\/+$/, '');
  const simplesUrl = (process.env.RTC_SIMPLES_URL || 'http://rtc-simples:8082').replace(/\/+$/, '');
  const danfseUrl = (process.env.RTC_DANFSE_URL || 'http://rtc-danfse:8084').replace(/\/+$/, '');
  const modoOperacao: RtcOperationMode = process.env.RTC_MODE === 'strict_rfb' ? 'strict_rfb' : 'hybrid_fallback';
  const timeoutMs = parseInt(process.env.RTC_TIMEOUT_MS || '8000', 10);

  return {
    regimeRegularUrl,
    simplesUrl,
    danfseUrl,
    modoOperacao,
    timeoutMs: isNaN(timeoutMs) || timeoutMs <= 0 ? 8000 : timeoutMs,
  };
}

/**
 * Executa uma chamada HTTP protegida por timeout e circuit breaker contra um sidecar RFB.
 */
export async function executarChamadaRfb<T>(
  servico: ServicoRfb,
  fn: (signal: AbortSignal) => Promise<Response>,
  extractor?: (res: Response) => Promise<T>,
  options?: { timeoutMs?: number }
): Promise<{ data: T; duracaoMs: number; headers: Headers }> {
  const cfg = getRfbConfig();
  const effectiveTimeoutMs = options?.timeoutMs ?? cfg.timeoutMs;
  const cb = getCircuitBreakerStatus(servico);

  if (cb.state === 'OPEN') {
    throw new ErroIntegracaoRfb({
      servico,
      status: 503,
      mensagem: `Circuit Breaker ABERTO para ${servico}. Chamadas bloqueadas por cooldown (${CB_COOLDOWN_MS / 1000}s).`,
      codigo: 'CIRCUIT_BREAKER_OPEN',
      circuitBreakerState: 'OPEN',
      duracaoMs: 0,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const inicio = performance.now();

  try {
    const response = await fn(controller.signal);
    const duracaoMs = Math.round(performance.now() - inicio);

    if (!response.ok) {
      // 5xx ou falha de serviço abre o circuit breaker; 4xx de validação de negócio não
      if (response.status >= 500) {
        registrarFalhaCircuitBreaker(servico);
      }

      let parsedProblem: ProblemDetailRfb | undefined;
      let mensagem = `Falha na requisição HTTP (Status ${response.status})`;
      let codigo: string | undefined;

      try {
        const text = await response.text();
        if (text) {
          const json = JSON.parse(text);
          // RFC 7807 ProblemDetail (Spring Boot)
          if (json.detail || json.title || json.errors) {
            parsedProblem = json as ProblemDetailRfb;
            mensagem = json.detail || json.title || mensagem;
            if (json.errors && json.errors.length > 0) {
              codigo = json.errors[0].code;
            }
          } else if (json.mensagem !== undefined) {
            // Echo Go ErroResponse
            mensagem = json.mensagem;
          }
        }
      } catch {
        // Resposta não é JSON, mantém texto padrão
      }

      throw new ErroIntegracaoRfb({
        servico,
        status: response.status,
        mensagem,
        codigo,
        problemDetail: parsedProblem,
        circuitBreakerState: circuitBreakers[servico].state,
        duracaoMs,
      });
    }

    registrarSucessoCircuitBreaker(servico);

    let data: T;
    if (extractor) {
      data = await extractor(response);
    } else {
      data = (await response.json()) as T;
    }

    return { data, duracaoMs, headers: response.headers };
  } catch (err: any) {
    const duracaoMs = Math.round(performance.now() - inicio);

    if (err instanceof ErroIntegracaoRfb) {
      throw err;
    }

    // Erros de rede (fetch failed, timeout, conexão recusada)
    // Se for ENOTFOUND ou ECONNREFUSED, trip imediato para OPEN
    const isFastFail = isDnsOrConnectionRefused(err);
    registrarFalhaCircuitBreaker(servico, isFastFail);

    const isTimeout = err.name === 'AbortError' || controller.signal.aborted;
    const mensagem = isTimeout
      ? `Timeout de integração (${effectiveTimeoutMs}ms) excedido ao comunicar com ${servico}`
      : `Erro de comunicação de rede com ${servico}: ${err.message || 'Desconhecido'}`;

    throw new ErroIntegracaoRfb({
      servico,
      status: isTimeout ? 504 : 503,
      mensagem,
      codigo: isTimeout ? 'TIMEOUT_RFB' : 'NETWORK_ERROR_RFB',
      detalhes: err.cause || err.stack,
      circuitBreakerState: circuitBreakers[servico].state,
      duracaoMs,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Consulta a disponibilidade e versão de todos os 3 sidecars em paralelo.
 */
export async function consultarStatusServicosRfb() {
  const cfg = getRfbConfig();
  const PROBE_TIMEOUT_MS = parseInt(process.env.RTC_PROBE_TIMEOUT_MS || '1500', 10);

  const [regularRes, simplesRes, danfseRes] = await Promise.allSettled([
    executarChamadaRfb(
      'rtc-regime-regular',
      (signal) => fetch(`${cfg.regimeRegularUrl}/api/calculadora/dados-abertos/versao`, { signal, method: 'GET' }),
      undefined,
      { timeoutMs: PROBE_TIMEOUT_MS }
    ),
    executarChamadaRfb(
      'rtc-simples',
      (signal) => fetch(`${cfg.simplesUrl}/api/versao`, { signal, method: 'GET' }),
      undefined,
      { timeoutMs: PROBE_TIMEOUT_MS }
    ),
    executarChamadaRfb(
      'rtc-danfse',
      (signal) => fetch(`${cfg.danfseUrl}/health/live`, { signal, method: 'GET' }),
      undefined,
      { timeoutMs: PROBE_TIMEOUT_MS }
    ),
  ]);

  const regularOk = regularRes.status === 'fulfilled';
  const simplesOk = simplesRes.status === 'fulfilled';
  const danfseOk = danfseRes.status === 'fulfilled';

  return {
    modoOperacao: cfg.modoOperacao,
    servicos: {
      regimeRegular: {
        online: regularOk,
        status: regularOk ? 'HEALTHY' : 'UNAVAILABLE',
        versao: regularOk ? (regularRes.value.data as any)?.versaoAplicacao : undefined,
        versaoBaseDados: regularOk ? (regularRes.value.data as any)?.versaoBaseDados : undefined,
        duracaoMs: regularOk ? regularRes.value.duracaoMs : (regularRes.reason as ErroIntegracaoRfb)?.duracaoMs,
        erro: !regularOk ? (regularRes.reason as Error)?.message : undefined,
        circuitBreaker: getCircuitBreakerStatus('rtc-regime-regular').state,
      },
      simplesNacional: {
        online: simplesOk,
        status: simplesOk ? 'HEALTHY' : 'UNAVAILABLE',
        versao: simplesOk ? (simplesRes.value.data as any)?.versaoAplicacao : undefined,
        versaoBaseDados: simplesOk ? (simplesRes.value.data as any)?.versaoBaseDados : undefined,
        duracaoMs: simplesOk ? simplesRes.value.duracaoMs : (simplesRes.reason as ErroIntegracaoRfb)?.duracaoMs,
        erro: !simplesOk ? (simplesRes.reason as Error)?.message : undefined,
        circuitBreaker: getCircuitBreakerStatus('rtc-simples').state,
      },
      danfse: {
        online: danfseOk,
        status: danfseOk ? 'HEALTHY' : 'UNAVAILABLE',
        duracaoMs: danfseOk ? danfseRes.value.duracaoMs : (danfseRes.reason as ErroIntegracaoRfb)?.duracaoMs,
        erro: !danfseOk ? (danfseRes.reason as Error)?.message : undefined,
        circuitBreaker: getCircuitBreakerStatus('rtc-danfse').state,
      },
    },
    verificadoEm: new Date().toISOString(),
  };
}
