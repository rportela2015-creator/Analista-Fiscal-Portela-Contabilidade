'use client';

import React from 'react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado ao renderizar módulo fiscal.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary] Falha capturada no módulo:', error, info?.componentStack);
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          style={{
            background: 'var(--bg-surface-card, #161d19)',
            border: '1px solid var(--border-crimson-glow, rgba(239, 68, 68, 0.35))',
            borderRadius: '12px',
            padding: '20px',
            color: 'var(--ink, #f9fafb)',
            margin: '12px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--color-fiscal-glosa, #ef4444)' }}>
                {this.props.fallbackTitle || 'Falha ao carregar módulo fiscal'}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #9ca3af)' }}>
                {this.state.errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="st-btn-secondary st-touch-target"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              Tentar novamente
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
