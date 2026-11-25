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
      aria-label="Ações de auditoria e processamento"
      className={`fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg px-4 sm:px-6 py-2.5 transition-all duration-200 ${className}`}
      style={{
        backgroundColor: 'var(--surface-card, #ffffff)',
        borderColor: 'var(--border-subtle, #e2e8f0)',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.08)',
        minHeight: '64px',
      }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Slot Esquerdo: Resumo & Contador Contextual */}
        <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-700 w-full sm:w-auto overflow-x-auto">
          {summary?.customMessage ? (
            <span className="font-medium text-slate-800">{summary.customMessage}</span>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {typeof summary?.selectedCount === 'number' && (
                <span className="font-semibold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                  <strong className="tabular-nums">{summary.selectedCount}</strong>
                  {typeof summary?.itemCount === 'number' && (
                    <span className="text-slate-500 font-normal"> de {summary.itemCount}</span>
                  )}{' '}
                  selecionados
                </span>
              )}

              {formattedTotal && (
                <span className="text-slate-600 hidden md:inline">
                  Total:{' '}
                  <strong className="tabular-nums font-semibold text-slate-900">
                    {formattedTotal}
                  </strong>
                </span>
              )}

              {typeof summary?.riskCount === 'number' && summary.riskCount > 0 && (
                <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
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
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {secondaryActions.map((sec) => {
            const isDestructive = sec.variant === 'destructive-ghost';
            const isOutline = sec.variant === 'outline';
            return (
              <button
                key={sec.id}
                type="button"
                onClick={sec.onClick}
                disabled={sec.disabled}
                title={sec.title}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors border select-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDestructive
                    ? 'border-transparent text-red-600 hover:bg-red-50'
                    : isOutline
                    ? 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
                    : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
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
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || primaryAction.loading}
            aria-busy={primaryAction.loading}
            title={primaryAction.title}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white rounded-lg shadow-sm transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: primaryAction.disabled ? '#94a3b8' : 'var(--portela-brand-cta, #0369a1)',
              minHeight: '44px',
              minWidth: '160px',
            }}
          >
            {primaryAction.loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
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
