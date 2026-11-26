'use client';

import React from 'react';
import type { ExtractedInvoiceData } from '@/lib/extrator-nfe-types';
import type { StatusExtincaoDebitoFornecedor } from '@/lib/fiscal/credito-tributario';
import type { ExtractedCteData } from '@/lib/fiscal/extrator-cte';
import type { NotaFiscalAuditadaSessao } from '@/lib/types/item-fiscal-auditado';
import type { ResultadoAuditoriaNfse } from '@/lib/extrator-nfse-types';
import type { Empresa } from '@/lib/fiscal/perfil-tributario';
import { formatarCnpj } from '@/lib/fiscal/perfil-tributario';
import { PainelNfseDanfse } from '../PainelNfseDanfse';

function formatarBrl(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface AuditoriaUploadPanelProps {
  section: 'upload' | 'contexto_pr';
  empresaAtiva?: Empresa | null;
  perfilAtivo?: any;
  notaAuditadaSessao?: NotaFiscalAuditadaSessao | null;
  resultadoNfse?: ResultadoAuditoriaNfse | null;
  setResultadoNfse?: (v: ResultadoAuditoriaNfse | null) => void;
  extractedInvoice?: ExtractedInvoiceData | null;
  file?: File | null;
  setFile?: (f: File | null) => void;
  cteFobData?: ExtractedCteData | null;
  cteFobError?: string | null;
  cteFobNomeArquivo?: string;
  handleUploadCteFob?: (file: File | null) => void | Promise<void>;
  regime?: string;
  setRegime?: (v: string) => void;
  finalidade?: string;
  setFinalidade?: (v: string) => void;
  statusExtincaoRtc?: StatusExtincaoDebitoFornecedor;
  setStatusExtincaoRtc?: (v: StatusExtincaoDebitoFornecedor) => void;
  autoSync?: boolean;
  setAutoSync?: (v: boolean) => void;
  isExtracting?: boolean;
  isOrquestrando?: boolean;
  orquestracaoErro?: string | null;
  extractionError?: string | null;
  handleFileUpload?: (e: React.FormEvent) => void;
  handleExecutarOrquestracaoCompleta?: () => void;
  // Contexto PR
  crtDestinatario?: '1' | '2' | '3' | '4';
  setCrtDestinatario?: (v: '1' | '2' | '3' | '4') => void;
  destinacaoPadrao?: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado';
  setDestinacaoPadrao?: (v: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado') => void;
  incluirIbsCbsBcIcms?: boolean;
  setIncluirIbsCbsBcIcms?: (v: boolean) => void;
  contribuinteInscritoPR?: boolean;
  setContribuinteInscritoPR?: (v: boolean) => void;
}

export default function AuditoriaUploadPanel(props: AuditoriaUploadPanelProps) {
  if (props.section === 'contexto_pr') {
    const {
      extractedInvoice,
      crtDestinatario = '3',
      setCrtDestinatario,
      destinacaoPadrao = 'comercializacao',
      setDestinacaoPadrao,
      incluirIbsCbsBcIcms = true,
      setIncluirIbsCbsBcIcms,
      contribuinteInscritoPR = true,
      setContribuinteInscritoPR,
    } = props;

    return (
      <div
        className="card"
        style={{
          marginTop: 14,
          marginBottom: 14,
          background: 'var(--bg-card-subtle)',
          border: '1.5px solid #cbd5e1',
          padding: 14,
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '16px' }}>⚖️</span>
            <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
              Parâmetros de Entrada no Paraná (RICMS/PR · Decreto nº 7.871/2017)
            </strong>
          </div>
          <span className="badge blue mono" style={{ fontSize: '11px' }}>
            UF Origem: {extractedInvoice?.emitente?.uf || 'ND'} ➔ Destino: {extractedInvoice?.destinatario?.uf || 'PR'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', color: 'var(--ink)' }}>
            <strong>Regime do Destinatário (CRT):</strong>
            <select
              value={crtDestinatario}
              onChange={(e) => setCrtDestinatario?.(e.target.value as '1' | '2' | '3' | '4')}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                background: 'var(--bg-card)',
                minHeight: '44px',
              }}
            >
              <option value="3">CRT 3 - Regime Normal (Lucro Real / Presumido)</option>
              <option value="1">CRT 1 - Simples Nacional (ME / EPP)</option>
              <option value="2">CRT 2 - Simples Nacional (Excesso Sublimite)</option>
              <option value="4">CRT 4 - MEI (Microempreendedor Individual)</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', color: 'var(--ink)' }}>
            <strong>Destinação Predominante:</strong>
            <select
              value={destinacaoPadrao}
              onChange={(e) =>
                setDestinacaoPadrao?.(
                  e.target.value as 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'
                )
              }
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                background: 'var(--bg-card)',
                minHeight: '44px',
              }}
            >
              <option value="comercializacao">Revenda / Comercialização</option>
              <option value="industrializacao">Industrialização / Insumo</option>
              <option value="uso_consumo">Uso e Consumo (DIFAL Base Dupla)</option>
              <option value="ativo_imobilizado">Ativo Imobilizado (DIFAL Base Dupla / CIAP)</option>
            </select>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '11.5px',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'var(--bg-card-subtle)',
              border: '1px solid #e2e8f0',
              minHeight: '44px',
            }}
            title="Conforme Consulta Tributária SEFA/PR nº 48/2026, opta-se por incluir ou não os novos tributos (IBS/CBS/IS) na Base de Cálculo do ICMS durante a transição 2026."
          >
            <input
              type="checkbox"
              checked={incluirIbsCbsBcIcms}
              onChange={(e) => setIncluirIbsCbsBcIcms?.(e.target.checked)}
            />
            <span>
              <strong>Consulta SEFA/PR nº 48/2026:</strong> Incluir IBS/CBS/IS na BC do ICMS
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '11.5px',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'var(--bg-card-subtle)',
              border: '1px solid #e2e8f0',
              minHeight: '44px',
            }}
            title="Contribuinte com Inscrição Estadual ativa no PR recolhe via GR-PR 1015 (dia 12) ou DeSTDA; não inscrito recolhe via GNRE antes da saída."
          >
            <input
              type="checkbox"
              checked={contribuinteInscritoPR}
              onChange={(e) => setContribuinteInscritoPR?.(e.target.checked)}
            />
            <span>
              <strong>Contribuinte Inscrito no CAD/ICMS-PR:</strong> {contribuinteInscritoPR ? 'Sim (GR-PR 1015 / DeSTDA)' : 'Não Inscrito (GNRE antecipada)'}
            </span>
          </label>
        </div>
      </div>
    );
  }

  const {
    empresaAtiva,
    perfilAtivo,
    notaAuditadaSessao,
    resultadoNfse,
    setResultadoNfse,
    extractedInvoice,
    file,
    setFile,
    cteFobData,
    cteFobError,
    cteFobNomeArquivo,
    handleUploadCteFob,
    regime = 'Simples Nacional',
    setRegime,
    finalidade = 'Revenda/Comercialização',
    setFinalidade,
    statusExtincaoRtc = 'EXTINTO_SPLIT',
    setStatusExtincaoRtc,
    autoSync = true,
    setAutoSync,
    isExtracting = false,
    isOrquestrando = false,
    orquestracaoErro,
    extractionError,
    handleFileUpload,
    handleExecutarOrquestracaoCompleta,
  } = props;

  return (
    <>
      {empresaAtiva ? (
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid #3b82f6',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            🏢 <b>Empresa Ativa:</b> {empresaAtiva.razaoSocial} &middot; CNPJ:{' '}
            <span className="mono">{formatarCnpj(empresaAtiva.cnpj)}</span> &middot; UF: <b>{empresaAtiva.uf}</b> &middot; Regime:{' '}
            <b>{notaAuditadaSessao?.contextoEmpresa.regimeTributario || perfilAtivo?.regimeTributario || 'Não configurado'}</b>
            {notaAuditadaSessao?.contextoEmpresa.cnaePrincipal && (
              <> &middot; CNAE <span className="mono">{notaAuditadaSessao.contextoEmpresa.cnaePrincipal}</span> ({notaAuditadaSessao.contextoEmpresa.perfilAtividade})</>
            )}
          </div>
          <span style={{ fontSize: 11, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
            Perfil Bitemporal Sincronizado ({notaAuditadaSessao?.contextoEmpresa.dataFatoGerador || 'hoje'})
          </span>
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'var(--accent-amber-subtle)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: 'var(--warn)',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          ⚠️ Nenhuma empresa ativa selecionada no cadastro: auditoria operando com parâmetros fallback (selecione uma empresa na aba Empresas para vigência bitemporal exata na data dhEmi e confronto do CT-e FOB).
        </div>
      )}

      {resultadoNfse && (
        <PainelNfseDanfse
          resultado={resultadoNfse}
          onVoltarParaUpload={() => {
            setResultadoNfse?.(null);
            setFile?.(null);
          }}
          empresaAtivaNome={empresaAtiva?.razaoSocial}
        />
      )}

      {!extractedInvoice && !resultadoNfse && (
        <form onSubmit={handleFileUpload}>
          <label className="field">
            <span>Arquivo da Nota Fiscal (.xml, .pdf)</span>
            <input
              type="file"
              accept=".xml,.pdf"
              onChange={(e) => setFile?.(e.target.files?.[0] || null)}
            />
          </label>

          <label className="field">
            <span>CT-e FOB Complementar Opcional (.xml Modelo 57)</span>
            <input
              type="file"
              accept=".xml"
              onChange={(e) => void handleUploadCteFob?.(e.target.files?.[0] || null)}
            />
            {cteFobData && (
              <span className="small tabular-nums" style={{ color: 'var(--ok)', marginTop: 4 }}>
                ✓ CT-e nº {cteFobData.numero || 's/n'} ({cteFobNomeArquivo}) · vTPrest {formatarBrl(cteFobData.valores.vTPrest)} · Tomador: {cteFobData.tomador.tipo}
              </span>
            )}
            {cteFobError && (
              <span className="small" style={{ color: 'var(--bad)', marginTop: 4 }}>
                ⛔ {cteFobError}
              </span>
            )}
          </label>

          <label className="field">
            <span>Regime da Empresa Adquirente</span>
            <select value={regime} onChange={(e) => setRegime?.(e.target.value)}>
              <option value="Simples Nacional">Simples Nacional</option>
              <option value="Regime Regular">Regime Regular</option>
            </select>
          </label>

          <label className="field">
            <span>Finalidade da Aquisição</span>
            <select value={finalidade} onChange={(e) => setFinalidade?.(e.target.value)}>
              <option value="Revenda/Comercialização">Revenda/Comercialização</option>
              <option value="Industrialização">Industrialização</option>
              <option value="Uso/Consumo">Uso/Consumo</option>
              <option value="Ativo Imobilizado">Ativo Imobilizado</option>
            </select>
          </label>

          <label className="field">
            <span>Status de Extinção no Fornecedor (LC 214/2025 Art. 47)</span>
            <select
              value={statusExtincaoRtc}
              onChange={(e) => setStatusExtincaoRtc?.(e.target.value as StatusExtincaoDebitoFornecedor)}
            >
              <option value="EXTINTO_SPLIT">Split Payment Extinto (Apropriação Imediata de Crédito)</option>
              <option value="EXTINTO_PAGAMENTO">Extinto por Pagamento Regular (Débito Liquidado)</option>
              <option value="AGUARDANDO_EXTINCAO">Aguardando Extinção (Crédito Retido pelo Art. 47)</option>
              <option value="SIMULACAO_PROJETADA">Simulação Projetada (Projeção Ampla de Cenário)</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer', minHeight: '44px' }}>
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync?.(e.target.checked)}
            />
            <span>⚡ Sincronizar Automaticamente com Precificação e ERP ao Auditar XML</span>
          </label>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={isExtracting || isOrquestrando || !file} className="btn primary" style={{ minHeight: '44px' }}>
              {isExtracting ? 'Extraindo Itens (< 200ms)...' : 'Auditar Documento (Extrair Itens)'}
            </button>
            <button
              type="button"
              onClick={handleExecutarOrquestracaoCompleta}
              disabled={isExtracting || isOrquestrando || !file}
              className="btn primary"
              style={{ background: '#1d4ed8', borderColor: '#3b82f6', color: '#ffffff', fontWeight: 600, minHeight: '44px' }}
              title="Executa em DAG: Extração + Motor Oficial RFB RTC + ICMS/PR v5.0.0 + Créditos 3 Camadas + 4 Regimes + Persistência"
            >
              {isOrquestrando ? '⚡ Executando Orquestrador DAG...' : '⚡ Executar Orquestração Completa (RFB RTC + ICMS/PR + Créditos + 4 Regimes)'}
            </button>
          </div>
        </form>
      )}

      {orquestracaoErro && (
        <div className="note error" role="alert" style={{ marginTop: 20 }}>
          <div className="t">Erro na orquestração fiscal da NF-e</div>
          <div className="x">{orquestracaoErro}</div>
        </div>
      )}

      {isExtracting && (
        <div className="note info" role="status" aria-live="polite" style={{ marginTop: 20 }}>
          <div className="t">Extração Determinística em Andamento...</div>
          <div className="x">
            Processamento determinístico imediato (&lt;200ms) sem invocação de LLMs. Validando 100% dos NCMs contra o catálogo oficial do Siscomex.
          </div>
        </div>
      )}

      {extractionError && (
        <div className="note error" role="alert" style={{ marginTop: 20 }}>
          <div className="t">Erro na extração do documento fiscal</div>
          <div className="x">{extractionError}</div>
        </div>
      )}
    </>
  );
}
