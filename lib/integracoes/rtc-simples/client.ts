import {
  executarChamadaRfb,
  getRfbConfig,
} from '../rfb-health';
import {
  OperacaoSimplesNaoAssistidaInputSchema,
  type OperacaoSimplesNaoAssistidaInputRfb,
  type AtividadeSimplesDomainRfb,
} from './schema';
import {
  normalizarRespostaSimples,
  type ResultadoSimplesNormalizado,
} from './normalizer';
import {
  arredondarMoedaRfb,
  arredondarMoedaRfbNum,
} from '../../math/decimal-fiscal';

// Cache em memória para catálogo de atividades do Simples Nacional com TTL de 30 minutos
interface CacheEntryAtividades {
  timestamp: number;
  data: AtividadeSimplesDomainRfb[];
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const atividadesCache = new Map<string, CacheEntryAtividades>();

/**
 * Limpa o cache de atividades para testes determinísticos.
 */
export function limparCacheAtividadesForTests(): void {
  atividadesCache.clear();
}

/**
 * Invoca o cálculo do Simples Nacional não assistido no microsserviço oficial da Receita Federal.
 * Endpoint confirmado: POST /api/calculadora/observabilidade/simples-nacional/nao-assistido
 */
export async function calcularSimplesNacionalRfb(
  payload: OperacaoSimplesNaoAssistidaInputRfb
): Promise<ResultadoSimplesNormalizado> {
  const parsedPayload = OperacaoSimplesNaoAssistidaInputSchema.parse(payload);
  const cfg = getRfbConfig();

  const url = `${cfg.simplesUrl}/api/calculadora/observabilidade/simples-nacional/nao-assistido`;

  const { data, duracaoMs, headers } = await executarChamadaRfb<any>(
    'rtc-simples',
    (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(parsedPayload),
        signal,
      })
  );

  return normalizarRespostaSimples(data, duracaoMs, headers);
}

/**
 * Consulta o catálogo oficial de atividades do Simples Nacional com cache em memória de 30 minutos.
 * Endpoint confirmado: GET /api/calculadora/simples-nacional/atividades
 */
export async function listarAtividadesSimplesRfb(opcoes?: {
  data?: string;
  anexos?: string[];
  tpDoc?: string;
  cClassTrib?: string;
  forcarAtualizacao?: boolean;
}): Promise<{ atividades: AtividadeSimplesDomainRfb[]; cached: boolean; duracaoMs: number }> {
  const dataReferencia = opcoes?.data || new Date().toISOString().slice(0, 10);
  const cacheKey = `${dataReferencia}|${(opcoes?.anexos || []).join(',')}|${opcoes?.tpDoc || ''}|${opcoes?.cClassTrib || ''}`;

  const agora = Date.now();
  const cached = atividadesCache.get(cacheKey);

  if (!opcoes?.forcarAtualizacao && cached && agora - cached.timestamp < CACHE_TTL_MS) {
    return {
      atividades: cached.data,
      cached: true,
      duracaoMs: 0,
    };
  }

  const cfg = getRfbConfig();
  const params = new URLSearchParams({ data: dataReferencia });
  if (opcoes?.anexos && opcoes.anexos.length > 0) {
    params.set('anexos', opcoes.anexos.join(','));
  }
  if (opcoes?.tpDoc) params.set('tpDoc', opcoes.tpDoc);
  if (opcoes?.cClassTrib) params.set('cClassTrib', opcoes.cClassTrib);

  const url = `${cfg.simplesUrl}/api/calculadora/simples-nacional/atividades?${params.toString()}`;

  const { data, duracaoMs } = await executarChamadaRfb<AtividadeSimplesDomainRfb[]>(
    'rtc-simples',
    (signal) =>
      fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal,
      })
  );

  // Armazena no cache somente respostas de sucesso (sem cachear erros)
  atividadesCache.set(cacheKey, {
    timestamp: agora,
    data,
  });

  return {
    atividades: data,
    cached: false,
    duracaoMs,
  };
}

/**
 * Executa o cálculo com tolerância a falhas (fallback local estimado em hybrid_fallback).
 */
export async function calcularSimplesNacionalComFallback(
  payload: OperacaoSimplesNaoAssistidaInputRfb
): Promise<ResultadoSimplesNormalizado> {
  const cfg = getRfbConfig();

  try {
    return await calcularSimplesNacionalRfb(payload);
  } catch (err: any) {
    if (cfg.modoOperacao === 'strict_rfb') {
      throw err;
    }

    const inicio = performance.now();
    const pCbs = 1.1612; // Anexo I alíquota padrão estimada
    const pIbs = 0.0129;

    let totalBc = 0;
    let totalCbs = 0;
    let totalIbs = 0;

    const itens = payload.itens.map((it) => {
      const bc = parseFloat(it.baseCalculo) || 0;
      const vCbs = arredondarMoedaRfbNum((bc * pCbs) / 100);
      const vIbs = arredondarMoedaRfbNum((bc * pIbs) / 100);

      totalBc += bc;
      totalCbs += vCbs;
      totalIbs += vIbs;

      return {
        numero: it.numero,
        estadoItem: 'CALCULADO',
        cAtivSN: it.cAtivSN || '01',
        cClassTrib: it.cClassTrib,
        baseCalculo: arredondarMoedaRfb(bc),
        aliquotaCbsSn: pCbs.toFixed(4),
        valorCbsSn: arredondarMoedaRfb(vCbs),
        aliquotaIbsSn: pIbs.toFixed(4),
        valorIbsSn: arredondarMoedaRfb(vIbs),
        valorTributosSn: arredondarMoedaRfb(vCbs + vIbs),
      };
    });

    const duracaoMs = Math.round(performance.now() - inicio);

    return {
      origemCalculo: 'FALLBACK_LOCAL_ESTIMADO',
      versaoMotor: 'motor-local-simples-v1',
      aviso: `Sidecar rtc-simples indisponível (${err.message || 'offline'}). Cálculo executado via fallback local estimado.`,
      duracaoMs,
      totais: {
        baseCalculoTotal: arredondarMoedaRfb(totalBc),
        valorCbsSnTotal: arredondarMoedaRfb(totalCbs),
        valorIbsSnTotal: arredondarMoedaRfb(totalIbs),
        valorTributosSnTotal: arredondarMoedaRfb(totalCbs + totalIbs),
      },
      itens,
    };
  }
}
