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
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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

  const paddingStyle = density === 'compact' ? '10px 12px' : density === 'spacious' ? '18px 20px' : '14px 16px';

  return (
    <section
      role="region"
      aria-label="Indicadores fiscais"
      className={`st-kpi-region ${className}`}
    >
      <div className="st-kpi-grid">
        {items.map((item) => {
          const isClickable = Boolean(item.onClick);
          const statusClass = item.trafficLight ? `status-${item.trafficLight}` : 'status-info';

          return (
            <div
              key={item.id}
              role={isClickable ? 'button' : 'article'}
              tabIndex={isClickable ? 0 : undefined}
              aria-label={`${item.label}: ${item.formattedValue ?? item.value}${item.statusLabel ? `, status: ${item.statusLabel}` : ''}`}
              title={item.tooltipText}
              onClick={item.onClick}
              onKeyDown={(e) => handleItemKeyDown(e, item.onClick)}
              className={`st-kpi-card ${statusClass} ${isClickable ? 'is-clickable' : ''}`}
              style={{ padding: paddingStyle, minHeight: '90px' }}
            >
              <div className="st-kpi-top">
                <span className="st-kpi-label">{item.label}</span>
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
              </div>

              <div className="st-kpi-value-row">
                <span
                  className="st-kpi-value tabular-nums"
                  style={{
                    fontVariantNumeric: 'tabular-nums lining-nums',
                    fontSize: level === 'gerencial' ? '23px' : '19px',
                  }}
                >
                  {item.formattedValue ?? item.value}
                </span>
                {item.unit && <span className="st-kpi-unit">{item.unit}</span>}
              </div>

              {(item.subValue || item.statusLabel) && (
                <div className="st-kpi-bottom">
                  {item.subValue && <span className="st-kpi-sub">{item.subValue}</span>}
                  {item.statusLabel && (
                    <div className={`st-kpi-status-pill ${statusClass}`}>
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
          className="st-kpi-riskbar"
        >
          <div className="st-kpi-riskbar-head">
            <span>Diagnóstico Consolidado de Risco</span>
            <span className="tabular-nums mono" style={{ fontSize: '11px', color: 'var(--ok)' }}>
              {proportions.regularPct}% Conforme
            </span>
          </div>
          <div className="st-kpi-riskbar-track">
            <div
              style={{ width: `${proportions.regularPct}%`, background: 'var(--accent-emerald)', height: '100%' }}
              title={`Regular: ${proportions.regularPct}%`}
            />
            <div
              style={{ width: `${proportions.warningPct}%`, background: 'var(--accent-amber)', height: '100%' }}
              title={`Alerta: ${proportions.warningPct}%`}
            />
            <div
              style={{ width: `${proportions.riskPct}%`, background: 'var(--accent-crimson)', height: '100%' }}
              title={`Risco: ${proportions.riskPct}%`}
            />
          </div>
        </div>
      )}
    </section>
  );
}
