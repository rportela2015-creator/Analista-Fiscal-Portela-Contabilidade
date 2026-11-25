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

  const sizeClass = size === 'sm' ? 'is-sm' : size === 'lg' ? 'is-lg' : 'is-md';

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Nível operacional de detalhamento"
      onKeyDown={handleKeyDown}
      className={`st-switcher ${sizeClass} ${className}`}
      style={{ minHeight: '44px' }}
    >
      {OPCOES_NIVEL.map((op) => {
        const isAtivo = op.id === nivelAtivo;
        return (
          <button
            key={op.id}
            type="button"
            role="radio"
            data-nivel={op.id}
            aria-checked={isAtivo}
            tabIndex={isAtivo ? 0 : -1}
            disabled={disabled}
            title={op.hint}
            onClick={() => mudarNivel(op.id)}
            className={`st-switcher-btn st-touch-target ${sizeClass} ${isAtivo ? 'is-active' : ''}`}
            style={{
              minHeight: size === 'lg' ? '48px' : '44px',
            }}
          >
            <span>{op.label}</span>
            {op.badge && (
              <span className="st-switcher-badge">{op.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
