'use client';

import React, { useState, useId, useCallback, useMemo, useEffect, useRef } from 'react';
import type { NivelOperacional } from '@/lib/hooks/useNivelOperacional';

export interface NormativeCitation {
  id: string;
  norma: string;         // Ex: 'RICMS/PR - Decreto Estadual nº 7.871/2017'
  artigo: string;        // Ex: 'Art. 28, Inciso I, Alínea a'
  ementa: string;        // Ex: 'Diferimento parcial de ICMS nas operações internas...'
  linkOficial?: string;  // Link oficial (SEFA/PR ou Planalto)
  esfera?: 'estadual-pr' | 'federal' | 'municipal' | 'harmonizado-wco';
  statusVigencia?: 'vigente' | 'transicao' | 'revogado';
}

export interface CalculationStep {
  step: string;
  formula: string;
  result: string;
}

export interface LegalCitationBlockProps {
  citations: NormativeCitation[];
  currentLevel?: NivelOperacional;
  title?: string;
  defaultCollapsed?: boolean;
  calculationMemory?: string;
  calculationSteps?: CalculationStep[];
  auditHashSha256?: string;
  verifiedAtUtc?: string;
  enableCopyMarkdown?: boolean;
  className?: string;
}

export default function LegalCitationBlock({
  citations,
  currentLevel = 'operacional',
  title = 'Fundamentação Normativa & Memória Pericial',
  defaultCollapsed,
  calculationMemory,
  calculationSteps,
  auditHashSha256,
  verifiedAtUtc,
  enableCopyMarkdown = true,
  className = '',
}: LegalCitationBlockProps) {
  const generatedId = useId();
  const contentId = `legal-block-content-${generatedId}`;

  const initialOpen = useMemo(() => {
    if (typeof defaultCollapsed === 'boolean') return !defaultCollapsed;
    return currentLevel === 'senior';
  }, [defaultCollapsed, currentLevel]);

  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);
  const [copied, setCopied] = useState<boolean>(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof defaultCollapsed === 'boolean') {
      setIsOpen(!defaultCollapsed);
    } else {
      setIsOpen(currentLevel === 'senior');
    }
  }, [currentLevel, defaultCollapsed]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;

    let texto = `### ${title}\n\n`;
    citations.forEach((c) => {
      texto += `- **${c.norma}** (${c.artigo}): ${c.ementa}\n`;
      if (c.linkOficial) texto += `  Link: ${c.linkOficial}\n`;
    });

    if (calculationSteps && calculationSteps.length > 0) {
      texto += `\n#### Memória de Cálculo:\n`;
      calculationSteps.forEach((s) => {
        texto += `- ${s.step}: \`${s.formula}\` = **${s.result}**\n`;
      });
    } else if (calculationMemory) {
      texto += `\n#### Memória de Cálculo:\n\`\`\`\n${calculationMemory}\n\`\`\`\n`;
    }

    if (auditHashSha256) {
      texto += `\n*Hash SHA-256 de Custódia:* \`${auditHashSha256}\`\n`;
    }

    navigator.clipboard.writeText(texto).then(() => {
      setCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    }).catch(() => {});
  }, [title, citations, calculationSteps, calculationMemory, auditHashSha256]);

  return (
    <div role="region" aria-label={title} className={`st-legal-block ${className}`}>
      <div className="st-legal-header">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="st-legal-toggle st-touch-target"
          style={{ minHeight: '44px' }}
        >
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
            style={{
              color: 'var(--warn)',
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.18s ease',
              flexShrink: 0,
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span aria-hidden="true">⚖️</span>
            <span>{title}</span>
            <span className="badge amber">
              {citations.length} {citations.length === 1 ? 'norma' : 'normas'}
            </span>
          </span>
        </button>

        {enableCopyMarkdown && (
          <button
            type="button"
            onClick={handleCopy}
            className="st-legal-copy-btn st-touch-target"
            title="Copiar fundamentação pericial formatada para laudo"
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            {copied ? '✓ Citação Copiada' : 'Copiar Citação para Laudo'}
          </button>
        )}
      </div>

      {isOpen && (
        <div id={contentId} className="st-legal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {citations.map((c) => (
              <div key={c.id} className="st-legal-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <strong style={{ color: 'var(--warn)', fontSize: '12.5px' }}>{c.norma}</strong>
                  <span className="badge grey mono">{c.artigo}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '12px', lineHeight: 1.5 }}>{c.ementa}</p>
                {c.linkOficial && (
                  <div style={{ marginTop: '6px' }}>
                    <a
                      href={c.linkOficial}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-blue)', fontSize: '11px', textDecoration: 'underline' }}
                    >
                      Ver texto oficial ↗
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {calculationSteps && calculationSteps.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--warn)', marginBottom: '6px' }}>
                Memória de Cálculo (Decimal Half-Even)
              </span>
              <div className="st-legal-memory">
                {calculationSteps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{step.step}:</span>
                    <span className="tabular-nums" style={{ color: 'var(--accent-blue)' }}>{step.formula}</span>
                    <span className="tabular-nums" style={{ color: 'var(--accent-emerald-bright)', fontWeight: 700 }}>{step.result}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!calculationSteps && calculationMemory && (
            <div style={{ marginTop: '6px' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--warn)', marginBottom: '6px' }}>
                Memória de Cálculo
              </span>
              <pre className="st-legal-memory" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {calculationMemory}
              </pre>
            </div>
          )}

          {(auditHashSha256 || verifiedAtUtc) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--ink-2)', borderTop: '1px solid var(--border-muted)', paddingTop: '8px' }}>
              {auditHashSha256 && (
                <span>
                  Digest SHA-256: <code className="mono tabular-nums">{auditHashSha256}</code>
                </span>
              )}
              {verifiedAtUtc && <span>Conferido em: {verifiedAtUtc}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
