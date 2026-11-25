'use client';

import React, { useState, useId, useCallback, useMemo } from 'react';
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

  // Se nível sênior, inicia aberto por padrão, a menos que especificado explicitamente
  const initialOpen = useMemo(() => {
    if (typeof defaultCollapsed === 'boolean') return !defaultCollapsed;
    return currentLevel === 'senior';
  }, [defaultCollapsed, currentLevel]);

  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);
  const [copied, setCopied] = useState<boolean>(false);

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
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [title, citations, calculationSteps, calculationMemory, auditHashSha256]);

  return (
    <div
      role="region"
      aria-label={title}
      className={`bg-amber-50/60 border border-amber-200/80 rounded-xl overflow-hidden my-3 shadow-sm ${className}`}
    >
      {/* Botão de Toggle / Cabeçalho do Bloco */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-100/50 border-b border-amber-200/60">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex items-center gap-2 text-left font-bold text-amber-950 text-xs sm:text-sm hover:text-amber-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-600 outline-none rounded-md p-1 -m-1"
          style={{ minHeight: '44px' }}
        >
          <svg
            className={`w-4 h-4 text-amber-700 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="flex items-center gap-1.5">
            <span>⚖️</span>
            <span>{title}</span>
            <span className="text-[10px] font-semibold bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full">
              {citations.length} {citations.length === 1 ? 'norma' : 'normas'}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          {enableCopyMarkdown && isOpen && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-200/60 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-md transition-colors"
              title="Copiar fundamentação pericial formatada"
              style={{ minHeight: '36px' }}
            >
              {copied ? '✓ Copiado' : 'Copiar Citação'}
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo Expandido */}
      {isOpen && (
        <div id={contentId} className="p-4 text-xs text-amber-950 space-y-3">
          {/* Lista de Normas */}
          <div className="space-y-2">
            {citations.map((c) => (
              <div
                key={c.id}
                className="bg-white/80 border border-amber-200/60 rounded-lg p-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <strong className="text-amber-900 font-bold">{c.norma}</strong>
                  <span className="text-[10px] font-mono font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                    {c.artigo}
                  </span>
                </div>
                <p className="text-slate-700 text-[11px] leading-relaxed">{c.ementa}</p>
                {c.linkOficial && (
                  <div className="mt-1">
                    <a
                      href={c.linkOficial}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Ver texto oficial</span>
                      <span>↗</span>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Memória de Cálculo Passo a Passo */}
          {(calculationSteps && calculationSteps.length > 0) && (
            <div className="mt-3 pt-3 border-t border-amber-200/60">
              <span className="font-bold text-[11px] uppercase tracking-wider text-amber-900 block mb-2">
                Memória de Cálculo (Decimal Half-Even)
              </span>
              <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px] space-y-1 overflow-x-auto">
                {calculationSteps.map((step, idx) => (
                  <div key={idx} className="flex justify-between gap-4">
                    <span className="text-slate-400">{step.step}:</span>
                    <span className="text-blue-300">{step.formula}</span>
                    <span className="text-emerald-400 font-bold tabular-nums">{step.result}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!calculationSteps && calculationMemory) && (
            <div className="mt-3 pt-3 border-t border-amber-200/60">
              <span className="font-bold text-[11px] uppercase tracking-wider text-amber-900 block mb-1">
                Memória de Cálculo
              </span>
              <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                {calculationMemory}
              </pre>
            </div>
          )}

          {/* Custódia Digital & Hash SHA-256 */}
          {(auditHashSha256 || verifiedAtUtc) && (
            <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between text-[10px] text-amber-800 flex-wrap gap-2">
              {auditHashSha256 && (
                <span>
                  Digest SHA-256: <code className="font-mono font-bold">{auditHashSha256}</code>
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
