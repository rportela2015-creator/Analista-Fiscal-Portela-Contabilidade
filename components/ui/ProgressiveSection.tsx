'use client';

import React, { useState, useId, useMemo, useCallback, useEffect } from 'react';
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

  const initialExpanded = useMemo(() => {
    if (typeof defaultExpanded === 'boolean') return defaultExpanded;
    return currentLevel === 'senior';
  }, [defaultExpanded, currentLevel]);

  // Estado local para expansão sob demanda pontual (todos os hooks no topo!)
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const [isForcedVisible, setIsForcedVisible] = useState<boolean>(false);

  // Sincroniza expansão automática ao alternar para nível Sênior
  useEffect(() => {
    if (currentLevel === 'senior') {
      setIsExpanded(true);
    } else if (typeof defaultExpanded === 'boolean') {
      setIsExpanded(defaultExpanded);
    }
  }, [currentLevel, defaultExpanded]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleForceVisible = useCallback(() => {
    setIsForcedVisible(true);
    setIsExpanded(true);
  }, []);

  // Se não estiver visível nativamente e nem foi forçada sob demanda:
  // Renderiza botão de 1 clique para expansão sob demanda
  if (!isVisivelPorNivel && !isForcedVisible) {
    const triggerLabel = onDemandTriggerLabel || `Ver detalhes periciais (${title})`;
    return (
      <div className={`st-progressive-trigger-wrap ${className}`}>
        <button
          type="button"
          onClick={handleForceVisible}
          aria-expanded={false}
          aria-controls={contentId}
          className="st-progressive-trigger st-touch-target"
          style={{ minHeight: '44px' }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
      className={`st-progressive ${className}`}
    >
      <header className="st-progressive-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {collapsible && (
            <button
              type="button"
              id={`trigger-${sectionId}`}
              aria-expanded={isExpanded}
              aria-controls={contentId}
              onClick={toggleExpand}
              className="st-progressive-toggle st-touch-target"
              style={{ minHeight: '44px', minWidth: '44px' }}
              title={isExpanded ? 'Recolher seção' : 'Expandir seção'}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div style={{ minWidth: 0 }}>
            <h3 id={`heading-${sectionId}`} className="st-progressive-title">
              {title}
            </h3>
            {subtitle && <p className="st-progressive-sub">{subtitle}</p>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {badge}
          {!isVisivelPorNivel && isForcedVisible && (
            <span className="badge amber">Expandido sob demanda</span>
          )}
        </div>
      </header>

      {(!collapsible || isExpanded) && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={`heading-${sectionId}`}
          className="st-progressive-body"
        >
          {children}
        </div>
      )}
    </section>
  );
}
