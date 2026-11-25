'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AliquotasSugeridas } from '@/lib/precificacao';

export const CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO = 'portela_precificacao_aliquotas_v1';
export const EVENTO_ALIQUOTAS_PRECIFICACAO = 'portela_precificacao_aliquotas_changed';

export type AliquotasManuaisPrecificacao = Partial<AliquotasSugeridas>;

const CAMPOS_ALIQUOTAS_VALIDOS = new Set<keyof AliquotasSugeridas>([
  'ipiPct',
  'iiPct',
  'icmsCompraPct',
  'icmsVendaPct',
  'pisCofinsCompraPct',
  'pisCofinsVendaPct',
  'cbsPct',
  'ibsPct',
  'reducaoIbsCbsPct',
  'isPct',
  'dasEfetivoPct',
  'dasReduzidoHibridoPct',
  'irpjCsllEfetivoPct',
]);

type MapaPorEmpresa = Record<string, AliquotasManuaisPrecificacao>;

function resolverStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function normalizarChaveEmpresa(empresaId?: string | null): string {
  const trimmed = typeof empresaId === 'string' ? empresaId.trim() : '';
  return trimmed.length > 0 ? trimmed : 'default';
}

function sanitizarAliquotas(raw: unknown): AliquotasManuaisPrecificacao {
  if (!raw || typeof raw !== 'object') return {};
  const result: AliquotasManuaisPrecificacao = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const campo = k as keyof AliquotasSugeridas;
    if (!CAMPOS_ALIQUOTAS_VALIDOS.has(campo)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    const limiteSuperior = campo === 'reducaoIbsCbsPct' ? 100 : 99.99;
    if (v > limiteSuperior) continue;
    result[campo] = v;
  }
  return result;
}

function lerMapaCompleto(storage: Storage | null): MapaPorEmpresa {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    // Suporte defensivo caso haja objeto direto no formato legado sem segmentação
    const mapa: MapaPorEmpresa = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const limpo = sanitizarAliquotas(val);
        if (Object.keys(limpo).length > 0) {
          mapa[key] = limpo;
        }
      }
    }
    return mapa;
  } catch {
    return {};
  }
}

function gravarMapaCompleto(storage: Storage | null, mapa: MapaPorEmpresa): void {
  if (!storage) return;
  try {
    if (Object.keys(mapa).length === 0) {
      storage.removeItem(CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO);
    } else {
      storage.setItem(CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO, JSON.stringify(mapa));
    }
  } catch {
    // Storage cheio ou indisponível
  }
}

export function carregarAliquotasManuais(
  empresaId?: string | null,
  storage?: Storage | null
): AliquotasManuaisPrecificacao {
  const store = resolverStorage(storage);
  const chave = normalizarChaveEmpresa(empresaId);
  const mapa = lerMapaCompleto(store);
  return mapa[chave] ? { ...mapa[chave] } : {};
}

export function salvarAliquotasManuais(
  empresaId: string | null | undefined,
  overrides: AliquotasManuaisPrecificacao,
  storage?: Storage | null
): AliquotasManuaisPrecificacao {
  const store = resolverStorage(storage);
  const chave = normalizarChaveEmpresa(empresaId);
  const mapa = lerMapaCompleto(store);
  const limpo = sanitizarAliquotas(overrides);

  if (Object.keys(limpo).length === 0) {
    delete mapa[chave];
  } else {
    mapa[chave] = limpo;
  }
  gravarMapaCompleto(store, mapa);
  return limpo;
}

export function limparAliquotasManuais(
  empresaId?: string | null,
  storage?: Storage | null
): void {
  const store = resolverStorage(storage);
  const chave = normalizarChaveEmpresa(empresaId);
  const mapa = lerMapaCompleto(store);
  if (chave in mapa) {
    delete mapa[chave];
    gravarMapaCompleto(store, mapa);
  }
}

export interface UseParametrosPrecificacaoReturn {
  overrides: AliquotasManuaisPrecificacao;
  setAliquota: (campo: keyof AliquotasSugeridas, valor: number) => void;
  setOverrides: (novos: AliquotasManuaisPrecificacao) => void;
  restaurarPadrao: () => void;
  temCustomizacao: boolean;
  camposCustomizados: (keyof AliquotasSugeridas)[];
  isHydrated: boolean;
}

/**
 * Hook persistente de parâmetros manuais da Precificação (CBS, IBS, IS, ICMS, PIS/COFINS, IPI, DAS, IRPJ/CSLL).
 * Mantém valores editados em localStorage segmentados por `empresaId`.
 */
export function useParametrosPrecificacao(
  empresaId?: string | null
): UseParametrosPrecificacaoReturn {
  // Todos os hooks estritamente no topo absoluto
  const chaveEmpresa = useMemo(() => normalizarChaveEmpresa(empresaId), [empresaId]);
  const [overrides, setOverridesState] = useState<AliquotasManuaisPrecificacao>({});
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  useEffect(() => {
    const iniciais = carregarAliquotasManuais(chaveEmpresa);
    setOverridesState(iniciais);
    setIsHydrated(true);

    const onCustomChange = (e: Event) => {
      const ce = e as CustomEvent<{ empresaKey: string; overrides: AliquotasManuaisPrecificacao }>;
      if (ce?.detail?.empresaKey === chaveEmpresa) {
        setOverridesState(ce.detail.overrides);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO) {
        setOverridesState(carregarAliquotasManuais(chaveEmpresa));
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENTO_ALIQUOTAS_PRECIFICACAO, onCustomChange);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(EVENTO_ALIQUOTAS_PRECIFICACAO, onCustomChange);
        window.removeEventListener('storage', onStorage);
      };
    }
    return undefined;
  }, [chaveEmpresa]);

  const setOverrides = useCallback(
    (novos: AliquotasManuaisPrecificacao) => {
      const persistido = salvarAliquotasManuais(chaveEmpresa, novos);
      setOverridesState(persistido);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(EVENTO_ALIQUOTAS_PRECIFICACAO, {
            detail: { empresaKey: chaveEmpresa, overrides: persistido },
          })
        );
      }
    },
    [chaveEmpresa]
  );

  const setAliquota = useCallback(
    (campo: keyof AliquotasSugeridas, valor: number) => {
      if (!Number.isFinite(valor) || valor < 0) return;
      setOverridesState((prev) => {
        const proximo = { ...prev, [campo]: valor };
        const persistido = salvarAliquotasManuais(chaveEmpresa, proximo);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(EVENTO_ALIQUOTAS_PRECIFICACAO, {
              detail: { empresaKey: chaveEmpresa, overrides: persistido },
            })
          );
        }
        return persistido;
      });
    },
    [chaveEmpresa]
  );

  const restaurarPadrao = useCallback(() => {
    limparAliquotasManuais(chaveEmpresa);
    setOverridesState({});
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(EVENTO_ALIQUOTAS_PRECIFICACAO, {
          detail: { empresaKey: chaveEmpresa, overrides: {} },
        })
      );
    }
  }, [chaveEmpresa]);

  const camposCustomizados = useMemo(
    () => Object.keys(overrides) as (keyof AliquotasSugeridas)[],
    [overrides]
  );

  const temCustomizacao = useMemo(
    () => camposCustomizados.length > 0,
    [camposCustomizados]
  );

  return {
    overrides,
    setAliquota,
    setOverrides,
    restaurarPadrao,
    temCustomizacao,
    camposCustomizados,
    isHydrated,
  };
}
