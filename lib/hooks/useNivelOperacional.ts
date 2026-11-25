'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export type NivelOperacional = 'gerencial' | 'operacional' | 'senior';

export const CHAVE_STORAGE_NIVEL_OPERACIONAL = 'portela_nivel_operacional_v1';
export const EVENTO_NIVEL_OPERACIONAL = 'nivel_operacional_changed';

export const NIVEIS_OPERACIONAIS: readonly NivelOperacional[] = ['gerencial', 'operacional', 'senior'] as const;

export function isNivelOperacionalValido(val: unknown): val is NivelOperacional {
  return typeof val === 'string' && (val === 'gerencial' || val === 'operacional' || val === 'senior');
}

export interface UseNivelOperacionalReturn {
  nivel: NivelOperacional;
  setNivel: (novo: NivelOperacional) => void;
  isGerencial: boolean;
  isOperacional: boolean;
  isSenior: boolean;
  isHydrated: boolean;
}

export function useNivelOperacional(): UseNivelOperacionalReturn {
  const [nivel, setNivelState] = useState<NivelOperacional>('operacional');
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const carregarNivelLocal = useCallback((): NivelOperacional => {
    if (typeof window === 'undefined') return 'operacional';
    try {
      const salvo = localStorage.getItem(CHAVE_STORAGE_NIVEL_OPERACIONAL);
      if (isNivelOperacionalValido(salvo)) {
        return salvo;
      }
    } catch {
      // Storage inacessível / desabilitado
    }
    return 'operacional';
  }, []);

  useEffect(() => {
    const inicial = carregarNivelLocal();
    setNivelState(inicial);
    setIsHydrated(true);

    const onNivelChanged = (e: Event) => {
      const customEvent = e as CustomEvent<NivelOperacional>;
      if (customEvent && isNivelOperacionalValido(customEvent.detail)) {
        setNivelState(customEvent.detail);
      } else {
        const atual = carregarNivelLocal();
        setNivelState(atual);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAVE_STORAGE_NIVEL_OPERACIONAL) {
        if (isNivelOperacionalValido(e.newValue)) {
          setNivelState(e.newValue);
        } else {
          setNivelState('operacional');
        }
      }
    };

    window.addEventListener(EVENTO_NIVEL_OPERACIONAL, onNivelChanged);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(EVENTO_NIVEL_OPERACIONAL, onNivelChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, [carregarNivelLocal]);

  const setNivel = useCallback((novo: NivelOperacional) => {
    if (!isNivelOperacionalValido(novo)) return;
    setNivelState(novo);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CHAVE_STORAGE_NIVEL_OPERACIONAL, novo);
      } catch {
        // Ignora erro de escrita de storage
      }
      window.dispatchEvent(new CustomEvent(EVENTO_NIVEL_OPERACIONAL, { detail: novo }));
    }
  }, []);

  const isGerencial = useMemo(() => nivel === 'gerencial', [nivel]);
  const isOperacional = useMemo(() => nivel === 'operacional', [nivel]);
  const isSenior = useMemo(() => nivel === 'senior', [nivel]);

  return {
    nivel,
    setNivel,
    isGerencial,
    isOperacional,
    isSenior,
    isHydrated,
  };
}
