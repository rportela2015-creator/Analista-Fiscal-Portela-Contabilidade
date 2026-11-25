'use client';

import React, { useCallback } from 'react';
import type { NivelOperacional } from '@/lib/hooks/useNivelOperacional';

export type FiscalTrafficLightStatus = 'danger' | 'warning' | 'success' | 'info';

export interface KpiItemData {
  id: string;
  label: string;
  value: string | number;
  formattedValue?: string;
  unit?: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trafficLight?: FiscalTrafficLightStatus;
  statusLabel?: string;
  icon?: React.ReactNode;
  tooltipText?: string;
  onClick?: () => void;
}

export interface KpiStripProps {
  items: KpiItemData[];
  density?: 'compact' | 'standard' | 'spacious';
  level?: NivelOperacional;
  showConsolidatedTrafficLightBar?: boolean;
  proportions?: {
    regularPct: number;
    warningPct: number;
    riskPct: number;
  };
  className?: string;
}

function StatusIcon({ status }: { status?: FiscalTrafficLightStatus }) {
  if (status === 'danger') {
    return (
      <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function KpiStrip({
  items,
  density = 'standard',
  level = 'operacional',
  showConsolidatedTrafficLightBar = false,
  proportions,
  className = '',
}: KpiStripProps) {
  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent, onClick?: () => void) => {
      if (!onClick) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    []
  );

  const getBorderColor = (status?: FiscalTrafficLightStatus) => {
    switch (status) {
      case 'danger':
        return '#dc2626';
      case 'warning':
        return '#d97706';
      case 'success':
        return '#16a34a';
      case 'info':
        return '#0284c7';
      default:
        return 'var(--border-subtle, #e2e8f0)';
    }
  };

  const getBadgeStyles = (status?: FiscalTrafficLightStatus) => {
    switch (status) {
      case 'danger':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
      case 'warning':
        return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      case 'success':
        return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
      case 'info':
      default:
        return { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' };
    }
  };

  const paddingCard = density === 'compact' ? 'p-3' : density === 'spacious' ? 'p-5' : 'p-4';

  return (
    <section
      role="region"
      aria-label="Indicadores fiscais"
      className={`flex flex-col gap-3 w-full ${className}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        {items.map((item) => {
          const isClickable = Boolean(item.onClick);
          const badgeStyles = getBadgeStyles(item.trafficLight);
          const borderColor = getBorderColor(item.trafficLight);

          return (
            <div
              key={item.id}
              role={isClickable ? 'button' : 'article'}
              tabIndex={isClickable ? 0 : undefined}
              aria-label={`${item.label}: ${item.formattedValue ?? item.value}${item.statusLabel ? `, status: ${item.statusLabel}` : ''}`}
              title={item.tooltipText}
              onClick={item.onClick}
              onKeyDown={(e) => handleItemKeyDown(e, item.onClick)}
              className={`bg-white rounded-xl border shadow-sm transition-all duration-150 flex flex-col justify-between ${paddingCard} ${
                isClickable
                  ? 'cursor-pointer hover:shadow-md hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none'
                  : ''
              }`}
              style={{
                backgroundColor: 'var(--surface-card, #ffffff)',
                borderLeftWidth: item.trafficLight ? '4px' : '1px',
                borderLeftColor: borderColor,
                minHeight: '88px',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {item.label}
                </span>
                {item.icon && <span className="text-slate-400">{item.icon}</span>}
              </div>

              <div className="flex items-baseline gap-2 my-0.5">
                <span
                  className="tabular-nums font-bold text-slate-900 tracking-tight"
                  style={{
                    fontVariantNumeric: 'tabular-nums lining-nums',
                    fontSize: level === 'gerencial' ? '24px' : '20px',
                    lineHeight: '1.2',
                  }}
                >
                  {item.formattedValue ?? item.value}
                </span>
                {item.unit && (
                  <span className="text-xs text-slate-500 font-medium">{item.unit}</span>
                )}
              </div>

              {(item.subValue || item.statusLabel) && (
                <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-slate-100 text-xs">
                  {item.subValue && (
                    <span className="text-slate-500 truncate text-[11px]">{item.subValue}</span>
                  )}
                  {item.statusLabel && (
                    <div
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ml-auto"
                      style={{
                        backgroundColor: badgeStyles.bg,
                        color: badgeStyles.text,
                        borderColor: badgeStyles.border,
                      }}
                    >
                      <StatusIcon status={item.trafficLight} />
                      <span>{item.statusLabel}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showConsolidatedTrafficLightBar && proportions && (
        <div
          role="img"
          aria-label={`Distribuição de risco: ${proportions.regularPct}% regular, ${proportions.warningPct}% alerta, ${proportions.riskPct}% risco`}
          className="w-full bg-white rounded-lg p-3 border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
            <span>Diagnóstico Consolidado de Risco</span>
            <span className="tabular-nums font-mono text-[11px]">
              {proportions.regularPct}% Conforme
            </span>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full flex overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-300"
              style={{ width: `${proportions.regularPct}%` }}
              title={`Regular: ${proportions.regularPct}%`}
            />
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${proportions.warningPct}%` }}
              title={`Alerta: ${proportions.warningPct}%`}
            />
            <div
              className="bg-red-600 h-full transition-all duration-300"
              style={{ width: `${proportions.riskPct}%` }}
              title={`Risco: ${proportions.riskPct}%`}
            />
          </div>
        </div>
      )}
    </section>
  );
}
