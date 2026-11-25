'use client';

import React, { useState, useId, useMemo, useCallback } from 'react';
import type { NivelOperacional } from '@/lib/hooks/useNivelOperacional';

export interface ProgressiveSectionProps {
  id?: string;
  minLevel?: NivelOperacional;
  niveisVisiveis?: readonly NivelOperacional[];
  currentLevel: NivelOperacional;
  title: string;
  subtitle?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  onDemandTriggerLabel?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

const ORDEM_NIVEIS: Record<NivelOperacional, number> = {
  gerencial: 1,
  operacional: 2,
  senior: 3,
};

export default function ProgressiveSection({
  id: customId,
  minLevel = 'operacional',
  niveisVisiveis,
  currentLevel,
  title,
  subtitle,
  collapsible = true,
  defaultExpanded,
  onDemandTriggerLabel,
  children,
  badge,
  className = '',
}: ProgressiveSectionProps) {
  const generatedId = useId();
  const sectionId = customId || `prog-sec-${generatedId}`;
  const contentId = `prog-content-${sectionId}`;

  // Determina se a seção é nativamente visível pelo nível global
  const isVisivelPorNivel = useMemo(() => {
    if (niveisVisiveis && niveisVisiveis.length > 0) {
      return niveisVisiveis.includes(currentLevel);
    }
    return ORDEM_NIVEIS[currentLevel] >= ORDEM_NIVEIS[minLevel];
  }, [niveisVisiveis, currentLevel, minLevel]);

  // Se começou expandido por padrão, ou no nível sênior
  const initialExpanded = useMemo(() => {
    if (typeof defaultExpanded === 'boolean') return defaultExpanded;
    return currentLevel === 'senior';
  }, [defaultExpanded, currentLevel]);

  // Estado local para expansão sob demanda pontual
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const [isForcedVisible, setIsForcedVisible] = useState<boolean>(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleForceVisible = useCallback(() => {
    setIsForcedVisible(true);
    setIsExpanded(true);
  }, []);

  // Se não estiver visível nativamente e nem foi forçada sob demanda:
  // Renderiza botão/link discreto de 1 clique para expansão sob demanda
  if (!isVisivelPorNivel && !isForcedVisible) {
    const triggerLabel = onDemandTriggerLabel || `Ver detalhes periciais (${title})`;
    return (
      <div className={`my-2 ${className}`}>
        <button
          type="button"
          onClick={handleForceVisible}
          aria-expanded={false}
          aria-controls={contentId}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors select-none"
          style={{ minHeight: '44px' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span>{triggerLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      id={sectionId}
      aria-labelledby={`heading-${sectionId}`}
      className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden my-3 ${className}`}
      style={{
        backgroundColor: 'var(--surface-card, #ffffff)',
        borderColor: 'var(--border-subtle, #e2e8f0)',
      }}
    >
      <header className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          {collapsible && (
            <button
              type="button"
              id={`trigger-${sectionId}`}
              aria-expanded={isExpanded}
              aria-controls={contentId}
              onClick={toggleExpand}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-blue-600 outline-none"
              style={{ minHeight: '44px', minWidth: '44px' }}
              title={isExpanded ? 'Recolher seção' : 'Expandir seção'}
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div>
            <h3
              id={`heading-${sectionId}`}
              className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight"
            >
              {title}
            </h3>
            {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {badge}
          {!isVisivelPorNivel && isForcedVisible && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Expandido sob demanda
            </span>
          )}
        </div>
      </header>

      {(!collapsible || isExpanded) && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={`heading-${sectionId}`}
          className="p-4 text-xs sm:text-sm text-slate-800"
        >
          {children}
        </div>
      )}
    </section>
  );
}
