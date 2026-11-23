'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Empresa, PerfilTributario } from '@/lib/fiscal/perfil-tributario';
import { resolverPerfilVigenteNaData } from '@/lib/fiscal/perfil-tributario';
import { CHAVE_STORAGE_EMPRESA_ATIVA } from '@/components/CadastroEmpresas';

function aplicarEmpresaSeMudou(prev: Empresa | null, nova: Empresa | null): Empresa | null {
  if (prev === nova) return prev;
  if (!prev && !nova) return null;
  if (prev?.id === nova?.id && prev?.atualizadoEm === nova?.atualizadoEm) {
    return prev;
  }
  return nova;
}

export function useEmpresaAtiva() {
  const [empresaAtiva, setEmpresaAtivaState] = useState<Empresa | null>(null);
  const [carregado, setCarregado] = useState<boolean>(false);

  const carregarEmpresaLocal = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const salvo = localStorage.getItem(CHAVE_STORAGE_EMPRESA_ATIVA);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        setEmpresaAtivaState((prev) => aplicarEmpresaSeMudou(prev, parsed));
      } else {
        setEmpresaAtivaState((prev) => (prev === null ? prev : null));
      }
    } catch {
      setEmpresaAtivaState((prev) => (prev === null ? prev : null));
    }
  }, []);

  useEffect(() => {
    carregarEmpresaLocal();
    setCarregado(true);

    const onEmpresaChanged = (e: Event) => {
      const customEvent = e as CustomEvent<Empresa | null>;
      if (customEvent && customEvent.detail !== undefined) {
        const nova = customEvent.detail;
        setEmpresaAtivaState((prev) => aplicarEmpresaSeMudou(prev, nova));
      } else {
        // Disparado sem detail: fallback seguro recarregando do localStorage
        carregarEmpresaLocal();
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAVE_STORAGE_EMPRESA_ATIVA) {
        carregarEmpresaLocal();
      }
    };

    window.addEventListener('empresa_ativa_changed', onEmpresaChanged);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('empresa_ativa_changed', onEmpresaChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, [carregarEmpresaLocal]);

  const setEmpresaAtiva = useCallback((empresa: Empresa | null) => {
    setEmpresaAtivaState((prev) => aplicarEmpresaSeMudou(prev, empresa));
    if (typeof window !== 'undefined') {
      let salvoId: string | null = null;
      let salvoAtualizadoEm: string | null = null;
      try {
        const salvo = localStorage.getItem(CHAVE_STORAGE_EMPRESA_ATIVA);
        if (salvo) {
          const parsed = JSON.parse(salvo);
          salvoId = parsed.id;
          salvoAtualizadoEm = parsed.atualizadoEm;
        }
      } catch {}

      if (salvoId !== empresa?.id || salvoAtualizadoEm !== empresa?.atualizadoEm) {
        if (empresa) {
          localStorage.setItem(CHAVE_STORAGE_EMPRESA_ATIVA, JSON.stringify(empresa));
        } else {
          localStorage.removeItem(CHAVE_STORAGE_EMPRESA_ATIVA);
        }
        window.dispatchEvent(new CustomEvent('empresa_ativa_changed', { detail: empresa }));
      }
    }
  }, []);

  const limparEmpresaAtiva = useCallback(() => {
    setEmpresaAtiva(null);
  }, [setEmpresaAtiva]);

  const perfilAtivo = useMemo<PerfilTributario | null>(() => {
    if (!empresaAtiva || !empresaAtiva.perfis || empresaAtiva.perfis.length === 0) {
      return null;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    return resolverPerfilVigenteNaData(empresaAtiva.perfis, hoje);
  }, [empresaAtiva]);

  return {
    empresaAtiva,
    perfilAtivo,
    carregado,
    setEmpresaAtiva,
    limparEmpresaAtiva,
  };
}
