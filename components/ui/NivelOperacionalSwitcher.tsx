'use client';

import React, { useCallback, useRef } from 'react';
import { useNivelOperacional, type NivelOperacional, NIVEIS_OPERACIONAIS } from '@/lib/hooks/useNivelOperacional';

export interface NivelOperacionalOptionConfig {
  id: NivelOperacional;
  label: string;
  badge?: string;
  hint: string;
}

export const OPCOES_NIVEL: readonly NivelOperacionalOptionConfig[] = [
  {
    id: 'gerencial',
    label: 'Gerencial',
    hint: 'Diretoria e Sócios: 4 KPIs macro, semáforo de risco e 1 CTA decisório',
  },
  {
    id: 'operacional',
    label: 'Operacional',
    badge: 'Padrão',
    hint: 'Rotina Fiscal: tabela enxuta de 7 colunas, inspeção lateral e sticky action bar',
  },
  {
    id: 'senior',
    label: 'Sênior',
    hint: 'Perícia & Auditoria: memória decimal half-even, base dupla e fundamentação legal',
  },
] as const;

export interface NivelOperacionalSwitcherProps {
  currentLevel?: NivelOperacional;
  onLevelChange?: (level: NivelOperacional) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function NivelOperacionalSwitcher({
  currentLevel,
  onLevelChange,
  disabled = false,
  className = '',
  size = 'md',
}: NivelOperacionalSwitcherProps) {
  const hook = useNivelOperacional();
  const groupRef = useRef<HTMLDivElement>(null);

  const nivelAtivo = currentLevel ?? hook.nivel;
  const mudarNivel = useCallback(
    (novo: NivelOperacional) => {
      if (disabled) return;
      if (onLevelChange) {
        onLevelChange(novo);
      } else {
        hook.setNivel(novo);
      }
    },
    [disabled, onLevelChange, hook]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const indexAtual = NIVEIS_OPERACIONAIS.indexOf(nivelAtivo);
      if (indexAtual === -1) return;

      let novoIndex: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        novoIndex = (indexAtual + 1) % NIVEIS_OPERACIONAIS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        novoIndex = (indexAtual - 1 + NIVEIS_OPERACIONAIS.length) % NIVEIS_OPERACIONAIS.length;
      } else if (e.key === 'Home') {
        novoIndex = 0;
      } else if (e.key === 'End') {
        novoIndex = NIVEIS_OPERACIONAIS.length - 1;
      }

      if (novoIndex !== null) {
        e.preventDefault();
        const proxNivel = NIVEIS_OPERACIONAIS[novoIndex];
        mudarNivel(proxNivel);
        const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        buttons?.[novoIndex]?.focus();
      }
    },
    [disabled, nivelAtivo, mudarNivel]
  );

  const paddingClasse = size === 'sm' ? 'py-1 px-2.5 text-xs' : 'py-2 px-3.5 text-xs';

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Nível operacional de detalhamento"
      onKeyDown={handleKeyDown}
      className={`inline-flex items-center gap-1 p-1 bg-slate-100 rounded-full border border-slate-300 shadow-inner ${className}`}
      style={{
        backgroundColor: 'var(--surface-subtle, #f1f5f9)',
        borderColor: 'var(--border-subtle, #e2e8f0)',
        minHeight: '44px',
      }}
    >
      {OPCOES_NIVEL.map((op) => {
        const isAtivo = op.id === nivelAtivo;
        return (
          <button
            key={op.id}
            type="button"
            role="radio"
            aria-checked={isAtivo}
            tabIndex={isAtivo ? 0 : -1}
            disabled={disabled}
            title={op.hint}
            onClick={() => mudarNivel(op.id)}
            className={`flex items-center justify-center gap-1.5 font-semibold rounded-full transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${paddingClasse}`}
            style={{
              minHeight: '40px',
              minWidth: '92px',
              backgroundColor: isAtivo ? 'var(--surface-card, #ffffff)' : 'transparent',
              color: isAtivo ? 'var(--portela-brand-blue, #0b3d91)' : 'var(--text-secondary, #475569)',
              boxShadow: isAtivo ? '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
              border: isAtivo ? '1px solid var(--border-subtle, #e2e8f0)' : '1px solid transparent',
            }}
          >
            <span>{op.label}</span>
            {op.badge && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                style={{
                  backgroundColor: isAtivo ? '#eff6ff' : '#e2e8f0',
                  color: isAtivo ? '#1d4ed8' : '#64748b',
                }}
              >
                {op.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
