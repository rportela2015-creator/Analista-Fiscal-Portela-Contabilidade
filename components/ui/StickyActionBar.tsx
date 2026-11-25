'use client';

import React, { useMemo } from 'react';

export interface ActionSummaryData {
  itemCount?: number;
  totalValueBrl?: number;
  selectedCount?: number;
  riskCount?: number;
  warningCount?: number;
  regularCount?: number;
  customMessage?: string;
}

export interface StickyActionBarProps {
  screenState?: 'empty' | 'staged' | 'audited' | 'nfse' | 'default';
  summary?: ActionSummaryData;
  primaryAction: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    loading?: boolean;
    loadingText?: string;
    disabled?: boolean;
    title?: string;
  };
  secondaryActions?: Array<{
    id: string;
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    title?: string;
    variant?: 'ghost' | 'outline' | 'destructive-ghost';
  }>;
  contextBadge?: React.ReactNode;
  visible?: boolean;
  className?: string;
  statusMessage?: string;
}

export default function StickyActionBar({
  screenState = 'default',
  summary,
  primaryAction,
  secondaryActions = [],
  contextBadge,
  visible = true,
  className = '',
  statusMessage,
}: StickyActionBarProps) {
  const formattedTotal = useMemo(() => {
    if (typeof summary?.totalValueBrl !== 'number') return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(summary.totalValueBrl);
  }, [summary?.totalValueBrl]);

  if (!visible) return null;

  return (
    <aside
      role="toolbar"
      data-testid="sticky-action-bar"
      data-screen-state={screenState}
      aria-label="Ações de auditoria e processamento"
      className={`st-sticky-bar ${className}`}
      style={{ minHeight: '64px' }}
    >
      <div className="st-sticky-inner">
        {/* Slot Esquerdo: Resumo & Contador Contextual */}
        <div className="st-sticky-summary">
          {summary?.customMessage ? (
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{summary.customMessage}</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {typeof summary?.selectedCount === 'number' && (
                <span className="st-sticky-pill">
                  <strong className="tabular-nums">{summary.selectedCount}</strong>
                  {typeof summary?.itemCount === 'number' && (
                    <span className="muted" style={{ fontWeight: 400 }}> de {summary.itemCount}</span>
                  )}{' '}
                  selecionados
                </span>
              )}

              {formattedTotal && (
                <span>
                  Total:{' '}
                  <strong className="tabular-nums mono" style={{ color: 'var(--ink)' }}>
                    {formattedTotal}
                  </strong>
                </span>
              )}

              {typeof summary?.riskCount === 'number' && summary.riskCount > 0 && (
                <span className="badge red">
                  <span className="tabular-nums">{summary.riskCount}</span>{' '}
                  {summary.riskCount === 1 ? 'glosa' : 'glosas'}
                </span>
              )}

              {contextBadge}
            </div>
          )}

          {/* Região aria-live discreta para leitores de tela */}
          <div role="status" aria-live="polite" className="sr-only">
            {statusMessage ??
              (summary?.selectedCount
                ? `${summary.selectedCount} itens selecionados para ação`
                : 'Barra de ações pronta')}
          </div>
        </div>

        {/* Slot Direito: Ações Secundárias + 1 CTA Primário Sólido */}
        <div className="st-sticky-actions">
          {secondaryActions.map((sec) => {
            const isDestructive = sec.variant === 'destructive-ghost';
            return (
              <button
                key={sec.id}
                type="button"
                onClick={sec.onClick}
                disabled={sec.disabled}
                title={sec.title}
                className={`st-btn-secondary ${isDestructive ? 'is-destructive' : ''}`}
                style={{ minHeight: '44px' }}
              >
                {sec.icon && <span aria-hidden="true">{sec.icon}</span>}
                <span>{sec.label}</span>
              </button>
            );
          })}

          {/* EXATAMENTE 1 CTA PRIMÁRIO SÓLIDO */}
          <button
            type="button"
            data-primary-cta="true"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || primaryAction.loading}
            aria-busy={primaryAction.loading}
            title={primaryAction.title}
            className="st-btn-primary"
            style={{
              minHeight: '44px',
              minWidth: '170px',
            }}
          >
            {primaryAction.loading ? (
              <>
                <span className="spin" aria-hidden="true" />
                <span>{primaryAction.loadingText || 'Processando...'}</span>
              </>
            ) : (
              <>
                {primaryAction.icon && <span aria-hidden="true">{primaryAction.icon}</span>}
                <span>{primaryAction.label}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
