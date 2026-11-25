'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ParametrosErpPayload,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoTxt,
  gerarRelatorioErpDetalhadoHtml,
} from '@/lib/relatorio-erp';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import { ProgressiveSection, LegalCitationBlock, type NormativeCitation } from '@/components/ui';

function baixarArquivo(conteudo: string, nomeArquivo: string, mime: string) {
  if (typeof window === 'undefined' || !window.URL?.createObjectURL) return;
  const blob = new Blob([conteudo], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function abrirEmNovaAba(conteudoHtml: string) {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(conteudoHtml);
    win.document.close();
  }
}

export default function ParametrizacaoERP({ data }: { data: any }) {
  // 1. TODOS OS HOOKS NO TOPO ABSOLUTO (antes de qualquer return condicional)
  const { nivel, isSenior } = useNivelOperacional();
  const [modalAberto, setModalAberto] = useState(false);
  const [modoModal, setModoModal] = useState<'resumido' | 'detalhado'>('resumido');
  const [formatoModal, setFormatoModal] = useState<'html' | 'txt'>('html');
  const [copiado, setCopiado] = useState('');

  useEffect(() => {
    if (!modalAberto || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalAberto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalAberto]);

  const citacoesNormativas = useMemo<NormativeCitation[]>(() => [
    {
      id: 'cit-erp-efd',
      norma: 'Ajuste SINIEF nº 07/2005 & Guia Prático EFD ICMS/IPI',
      artigo: 'Registros 0200, C100 e C170 — Codificação de Cadastro ERP',
      ementa: 'Padronização de NCM, CEST, CFOP de entrada, CST/CSOSN e alíquotas para escrituração fiscal digital sem glosas.',
      esfera: 'federal',
      statusVigencia: 'vigente',
    },
    {
      id: 'cit-erp-nt2026',
      norma: 'Nota Técnica NF-e 2026.008 & LC nº 214/2025',
      artigo: 'Grupos IBSCBS, cClassTrib e Imposto Seletivo',
      ementa: 'Campos obrigatórios da Reforma Tributária do Consumo integrados à parametrização de entrada e saída.',
      esfera: 'federal',
      statusVigencia: 'vigente',
    },
  ], []);

  if (!data || !data.itens || data.itens.length === 0) return null;

  const extrairPayload = (): ParametrosErpPayload => {
    return {
      contexto: {
        emitente: {
          nome: data.nfe?.emitente?.xNome || 'Empresa Emitente',
          cnpj: data.nfe?.emitente?.CNPJ || '',
          ie: data.nfe?.emitente?.IE || 'ISENTO',
          uf: data.nfe?.emitente?.enderEmit?.UF || '',
          regime: data.regime || 'Regime Regular',
          crt: String(data.regime || '').includes('Simples') ? '1' : '3',
        },
        destinatario: {
          nome: data.nfe?.destinatario?.xNome || 'Destinatário',
          cnpjCpf: data.nfe?.destinatario?.CNPJ || data.nfe?.destinatario?.CPF || '',
          uf: data.nfe?.destinatario?.enderDest?.UF || '',
        },
        operacao: {
          tipo: 'entrada',
          finalidade: data.finalidade || 'comercializacao',
          modelo: '55',
          anoReforma: 2026,
        },
      },
      itens: data.itens.map((it: any) => ({
        cProd: it.cProd,
        xProd: it.xProd,
        ncm: typeof it.ncm === 'object' ? (it.ncm?.auditado || it.ncm?.declarado) : it.ncm,
        cest: it.cest || (typeof it.ncm === 'object' ? it.ncm?.cest : undefined),
        cfop: it.cfop?.entradaSugerido || it.cfopEntrada || '1102',
        cstIcms: it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00',
        aliqIcms: it.icms?.aliqIcmsCredito || it.aliqIcms || '18%',
        cstPis: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
        cstCofins: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
        aliqPis: it.aliqPis || '1.65%',
        aliqCofins: it.aliqCofins || '7.6%',
        permiteCredito: it.icms?.permiteCredito ?? it.permiteCredito ?? true,
        cClassTrib: it.reforma?.cClassTrib || it.cClassTrib || '000001',
        aliqIbsUf: it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%',
        aliqCbs: it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%',
        regimeEspecial: it.reforma?.regimeEspecial || it.regimeEspecial || 'Regime Regular (Padrão)',
        instrucao: it.instrucaoCadastroERP || it.instrucaoCadastro || 'Parametrização fiscal',
      })),
    };
  };

  const handleExportCSV = () => {
    if (!data.itens) return;

    // Create CSV content
    const headers = [
      'cProd', 'xProd', 'ncm', 'cest', 'cfopEntrada', 'cstIcmsEntrada', 'aliqIcms',
      'cstPisCofinsEntrada', 'aliqPis', 'aliqCofins', 'permiteCredito',
      'cClassTrib', 'aliqIbsTransitorio', 'aliqCbsTransitorio', 'regimeEspecial'
    ];

    const rows = data.itens.map((item: any) => {
      const flatItem = {
        cProd: item.cProd,
        xProd: item.xProd,
        ncm: typeof item.ncm === 'object' ? (item.ncm?.auditado || item.ncm?.declarado) : item.ncm,
        cest: item.cest || (typeof item.ncm === 'object' ? item.ncm?.cest : ''),
        cfopEntrada: item.cfop?.entradaSugerido || item.cfopEntrada || '1102',
        cstIcmsEntrada: item.icms?.cstIcmsEntradaSugerido || item.cstIcmsEntrada || '00',
        aliqIcms: item.icms?.aliqIcmsCredito || item.aliqIcms || '18%',
        cstPisCofinsEntrada: item.pisCofins?.cstPisCofinsEntradaSugerido || item.cstPisCofinsEntrada || '50',
        aliqPis: item.aliqPis || '1.65%',
        aliqCofins: item.aliqCofins || '7.6%',
        permiteCredito: (item.icms?.permiteCredito ?? item.permiteCredito ?? true) ? 'Sim' : 'Não',
        cClassTrib: item.reforma?.cClassTrib || item.cClassTrib || '000001',
        aliqIbsTransitorio: item.reforma?.aliqIbsTeste2026 || item.aliqIbsTransitorio || '0,1%',
        aliqCbsTransitorio: item.reforma?.aliqCbsTeste2026 || item.aliqCbsTransitorio || '0,9%',
        regimeEspecial: item.reforma?.regimeEspecial || item.regimeEspecial || 'Regime Regular (Padrão)',
      };
      return headers.map(header => {
        const value = (flatItem as any)[header] !== undefined && (flatItem as any)[header] !== null ? String((flatItem as any)[header]) : '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    baixarArquivo(csv, 'parametrizacao_erp.csv', 'text/csv');
  };

  const handleCopy = (item: any) => {
    const text = JSON.stringify(item, null, 2);
    navigator.clipboard.writeText(text);
    alert('Parâmetros copiados!');
  };

  const handleGerarRelatorio = (modo: 'resumido' | 'detalhado') => {
    setModoModal(modo);
    setFormatoModal('html');
    setModalAberto(true);
  };

  const payload = extrairPayload();
  const relatorioHtml = modoModal === 'resumido'
    ? gerarRelatorioErpResumidoHtml(payload)
    : gerarRelatorioErpDetalhadoHtml(payload);
  const relatorioTxt = modoModal === 'resumido'
    ? gerarRelatorioErpResumidoTxt(payload)
    : gerarRelatorioErpDetalhadoTxt(payload);

  const copiarConteudo = async (conteudo: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(conteudo);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(''), 2000);
    } catch {
      setCopiado('use Ctrl+C');
      setTimeout(() => setCopiado(''), 2000);
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, color: 'var(--ink)' }}>Parametrização de ERP</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleExportCSV} className="st-btn-secondary st-touch-target">
            Exportar CSV para ERP
          </button>
          <button
            type="button"
            onClick={() => handleGerarRelatorio('resumido')}
            className="st-btn-secondary st-touch-target"
            style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)', background: 'var(--accent-blue-subtle)' }}
            title="Relatório com campo e código correspondente"
          >
            📋 Gerar Relatório ERP (Modo Resumido)
          </button>
          <button
            type="button"
            onClick={() => handleGerarRelatorio('detalhado')}
            className="btn st-touch-target"
            title="Laudo com citação de lei, artigo e dispositivo legal"
          >
            ⚖️ Gerar Relatório ERP (Modo Detalhado com Citação Legal)
          </button>
        </div>
      </div>

      {modalAberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Relatório de Parametrização ERP"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(14, 21, 17, 0.78)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16
          }}
        >
          <div style={{
            background: 'var(--bg-surface-card)', border: '1px solid var(--border-medium)', color: 'var(--ink)',
            borderRadius: 12, width: '100%', maxWidth: 960, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 20px 48px rgba(0,0,0,0.45)', overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)'
            }}>
              <div>
                <strong style={{ fontSize: '1.05rem', color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
                  {modoModal === 'resumido'
                    ? 'Relatório ERP — Modo Resumido (Campo e Código)'
                    : 'Laudo Pericial ERP — Modo Detalhado com Citação Legal'}
                </strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>
                  Contabilidade Portela (Desde 1970) · Parâmetros Fiscais &amp; Reforma Tributária
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="mini st-touch-target"
                aria-label="Fechar relatório ERP"
                style={{ minHeight: '44px', minWidth: '44px', fontSize: '1.1rem', fontWeight: 700 }}
              >
                ×
              </button>
            </div>

            <div style={{
              display: 'flex', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)',
              alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-surface-card)'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-2)' }}>Visualização:</span>
              <button
                type="button"
                className={`mini st-touch-target ${formatoModal === 'html' ? 'on' : ''}`}
                style={{
                  background: formatoModal === 'html' ? 'var(--portela-brand-cta)' : 'var(--bg-surface-subtle)',
                  color: formatoModal === 'html' ? 'var(--portela-cta-ink)' : 'var(--ink)',
                  borderColor: formatoModal === 'html' ? 'var(--portela-brand-cta)' : 'var(--border-medium)',
                }}
                onClick={() => setFormatoModal('html')}
              >
                Formatada (HTML)
              </button>
              <button
                type="button"
                className={`mini st-touch-target ${formatoModal === 'txt' ? 'on' : ''}`}
                style={{
                  background: formatoModal === 'txt' ? 'var(--portela-brand-cta)' : 'var(--bg-surface-subtle)',
                  color: formatoModal === 'txt' ? 'var(--portela-cta-ink)' : 'var(--ink)',
                  borderColor: formatoModal === 'txt' ? 'var(--portela-brand-cta)' : 'var(--border-medium)',
                }}
                onClick={() => setFormatoModal('txt')}
              >
                Texto Puro (TXT)
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="mini st-touch-target"
                  onClick={() => abrirEmNovaAba(relatorioHtml)}
                >
                  ↗ Abrir em Nova Aba / Imprimir
                </button>
                <button
                  type="button"
                  className="mini st-touch-target"
                  onClick={() => baixarArquivo(
                    relatorioHtml,
                    `relatorio_erp_${modoModal}.html`,
                    'text/html; charset=utf-8'
                  )}
                  style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.35)' }}
                >
                  ⬇ Baixar HTML
                </button>
                <button
                  type="button"
                  className="mini st-touch-target"
                  onClick={() => baixarArquivo(
                    relatorioTxt,
                    `relatorio_erp_${modoModal}.txt`,
                    'text/plain; charset=utf-8'
                  )}
                  style={{ background: 'var(--accent-emerald-glow)', color: 'var(--ok)', borderColor: 'var(--border-emerald-glow)' }}
                >
                  ⬇ Baixar TXT
                </button>
                <button
                  type="button"
                  className="mini st-touch-target"
                  onClick={() => copiarConteudo(
                    formatoModal === 'html' ? relatorioHtml : relatorioTxt,
                    'copiado'
                  )}
                >
                  Copiar {copiado ? '✓' : ''}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 20, background: 'var(--bg-app)' }}>
              {formatoModal === 'html' ? (
                <iframe
                  title="Pré-visualização do Relatório"
                  srcDoc={relatorioHtml}
                  style={{ width: '100%', height: '550px', border: '1px solid var(--border-medium)', background: '#ffffff', borderRadius: 6 }}
                />
              ) : (
                <pre
                  className="tabular-nums"
                  style={{
                    background: 'var(--bg-surface-input)',
                    color: 'var(--on-surface)',
                    padding: 16,
                    borderRadius: 6,
                    border: '1px solid var(--border-medium)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '550px',
                    overflow: 'auto',
                  }}
                >
                  {relatorioTxt}
                </pre>
              )}
            </div>

            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)', textAlign: 'right' }}>
              <button type="button" onClick={() => setModalAberto(false)} className="mini st-touch-target">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {data.itens.map((item: any, idx: number) => (
          <div
            key={idx}
            className="card"
            style={{
              background: 'var(--bg-surface-card)',
              border: '1px solid var(--border-medium)',
              padding: 16,
              borderRadius: 12,
              marginBottom: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <strong className="tabular-nums">{item.cProd || 'N/A'} - {item.xProd || 'Produto não informado'}</strong>
                <div className="small muted tabular-nums">NCM: {item.ncm} | CEST: {item.cest || '—'}</div>
              </div>
              <button type="button" onClick={() => handleCopy(item)} className="chip st-touch-target">Copiar Parâmetros</button>
            </div>

            <div className="taxgrid" style={{ marginBottom: 14, padding: 0 }}>
              {/* Bloco ICMS/ST */}
              <div className="tax" style={{ borderLeft: '4px solid var(--accent-blue)', paddingLeft: 10 }}>
                <div className="k">Bloco ICMS/ST</div>
                <div className="v tabular-nums">CFOP: {item.cfop?.entradaSugerido || item.cfopEntrada}</div>
                <div className="v tabular-nums">CST: {item.icms?.cstIcmsEntradaSugerido || item.cstIcmsEntrada}</div>
                <div className="v tabular-nums">Alíquota: {item.icms?.aliqIcmsCredito || item.aliqIcms}</div>
                <div className="v">Crédito: {(item.icms?.permiteCredito ?? item.permiteCredito) ? 'Sim' : 'Não'}</div>
              </div>

              {/* Bloco PIS/COFINS */}
              <div className="tax" style={{ borderLeft: '4px solid var(--accent-amber)', paddingLeft: 10 }}>
                <div className="k">Bloco PIS/COFINS</div>
                <div className="v tabular-nums">CST: {item.pisCofins?.cstPisCofinsEntradaSugerido || item.cstPisCofinsEntrada}</div>
                <div className="v tabular-nums">Alíquota PIS: {item.aliqPis || '1.65%'}</div>
                <div className="v tabular-nums">Alíquota COFINS: {item.aliqCofins || '7.6%'}</div>
              </div>

              {/* Bloco Reforma Tributária */}
              <div className="tax" style={{ borderLeft: '4px solid var(--accent-emerald)', paddingLeft: 10 }}>
                <div className="k">Bloco Reforma Tributária</div>
                <div className="v tabular-nums">cClassTrib: {item.reforma?.cClassTrib || item.cClassTrib}</div>
                <div className="v tabular-nums">Alíquota IBS: {item.reforma?.aliqIbsTeste2026 || item.aliqIbsTransitorio}</div>
                <div className="v tabular-nums">Alíquota CBS: {item.reforma?.aliqCbsTeste2026 || item.aliqCbsTransitorio}</div>
                <div className="v">Regime: {item.reforma?.regimeEspecial || item.regimeEspecial || 'Regime Regular (Padrão)'}</div>
              </div>
            </div>

            <div className="note info" style={{ marginTop: 8, marginBottom: 0 }}>
              <strong>Instrução:</strong> {item.instrucaoCadastroERP || item.instrucaoCadastro}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <ProgressiveSection
          id="sec-erp-custodia"
          title="Rastreabilidade Normativa ERP"
          subtitle="Base legal dos parâmetros de entrada e Reforma Tributária"
          minLevel="senior"
          currentLevel={nivel}
          defaultExpanded={isSenior}
          onDemandTriggerLabel="Exibir Rastreabilidade Normativa do ERP"
          badge={<span className="badge amber" style={{ fontSize: '10px' }}>Nível Sênior</span>}
        >
          <LegalCitationBlock
            title="Normas da Parametrização ERP"
            citations={citacoesNormativas}
            currentLevel={nivel}
            defaultCollapsed={false}
          />
        </ProgressiveSection>
      </div>
    </div>
  );
}
