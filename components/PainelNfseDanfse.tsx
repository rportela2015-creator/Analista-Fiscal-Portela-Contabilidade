'use client';

/**
 * Painel Interativo de Auditoria de NFS-e / DPS Padrão Nacional e Gerador de DANFSe
 * Analista Fiscal Portela Contabilidade — Ciclo 7 (Sub-Etapa 20.4)
 *
 * Cumpre 100% das diretrizes de WCAG AA e a Ordem Estrita de React Hooks (hookcheck OK).
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { ResultadoAuditoriaNfse } from '@/lib/extrator-nfse-types';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import ProgressiveSection from '@/components/ui/ProgressiveSection';
import LegalCitationBlock from '@/components/ui/LegalCitationBlock';

interface PainelNfseDanfseProps {
  resultado: ResultadoAuditoriaNfse;
  onVoltarParaUpload?: () => void;
  empresaAtivaNome?: string;
}

export function PainelNfseDanfse({
  resultado,
  onVoltarParaUpload,
  empresaAtivaNome,
}: PainelNfseDanfseProps) {
  // --------------------------------------------------------------------------
  // HOOKS NO TOPO ABSOLUTO (OBRIGATÓRIO PARA @scripts/hookcheck.mjs)
  // --------------------------------------------------------------------------
  const { nivel, isGerencial, isOperacional, isSenior } = useNivelOperacional();

  const [stc, setStc] = useState<'0' | '1' | '2'>('0');
  const [canhoto, setCanhoto] = useState<boolean>(true);
  const [gerandoPdf, setGerandoPdf] = useState<boolean>(false);
  const [erroDanfse, setErroDanfse] = useState<string | null>(null);
  const [orientacaoDanfse, setOrientacaoDanfse] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filtroAlertas, setFiltroAlertas] = useState<'TODOS' | 'CRITICO' | 'ATENCAO' | 'INFO'>('TODOS');
  const [baixandoRelatorio, setBaixandoRelatorio] = useState<boolean>(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);

  // Limpeza de Blob URL para evitar vazamento de memória (Memory Leak Guard)
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Handler de geração do DANFSe PDF (Ação Primária Sólida do Painel)
  const handleGerarDanfse = useCallback(async () => {
    setGerandoPdf(true);
    setErroDanfse(null);
    setOrientacaoDanfse(null);

    try {
      const resp = await fetch(`/api/rtc/danfse?stc=${stc}&canhoto=${canhoto}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/pdf, application/json',
        },
        body: resultado.extracao.rawXml,
      });

      if (!resp.ok) {
        let errJson: any;
        try {
          errJson = await resp.json();
        } catch {
          errJson = { mensagem: `Falha na requisição (Status HTTP ${resp.status})` };
        }

        setErroDanfse(errJson.mensagem || errJson.error || 'Não foi possível gerar o DANFSe em PDF.');
        if (errJson.orientacao) {
          setOrientacaoDanfse(errJson.orientacao);
        } else if (resp.status === 503) {
          setOrientacaoDanfse('Suba o container rtc-danfse via docker compose up -d rtc-danfse');
        }
        return;
      }

      const blob = await resp.blob();
      const novoBlobUrl = URL.createObjectURL(blob);

      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(novoBlobUrl);
    } catch (err: any) {
      setErroDanfse(err.message || 'Erro de rede ao conectar ao gerador de DANFSe.');
      setOrientacaoDanfse('Verifique se o container docker "rtc-danfse" está ativo na porta 8084.');
    } finally {
      setGerandoPdf(false);
    }
  }, [stc, canhoto, resultado.extracao.rawXml, pdfUrl]);

  // Handler de emissão de Laudo Pericial de NFS-e (HTML / TXT)
  const handleBaixarLaudoNfse = useCallback(async (formato: 'html' | 'txt') => {
    setBaixandoRelatorio(true);
    setErroRelatorio(null);
    try {
      const resp = await fetch('/api/auditoria-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: formato,
          auditoriaNfse: resultado,
          sha256: resultado.extracao.sha256,
          tituloDocumento: `Laudo Pericial — NFS-e ${resultado.extracao.identificacao?.nNFSe || resultado.extracao.identificacao?.nDPS || 'Nacional'}`,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Falha HTTP ${resp.status} ao gerar laudo da NFS-e.`);
      }

      const blob = await resp.blob();
      if (typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laudo_nfse_${resultado.extracao.identificacao?.nNFSe || resultado.extracao.identificacao?.nDPS || 'nacional'}.${formato}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setErroRelatorio(err.message || 'Erro ao exportar laudo pericial.');
    } finally {
      setBaixandoRelatorio(false);
    }
  }, [resultado]);

  // --------------------------------------------------------------------------
  // DERIVAÇÕES E RENDERIZAÇÃO
  // --------------------------------------------------------------------------
  const extracao = resultado.extracao;
  const ident = extracao.identificacao;
  const prest = extracao.prestador;
  const toma = extracao.tomador;
  const serv = extracao.servico;
  const val = extracao.valores;
  const ref = extracao.reformaTributaria;

  const alertasFiltrados = (resultado.alertas || []).filter((a) => {
    if (filtroAlertas === 'TODOS') return true;
    return a.severidade === filtroAlertas;
  });

  const totalCriticos = (resultado.alertas || []).filter((a) => a.severidade === 'CRITICO').length;
  const totalAtencao = (resultado.alertas || []).filter((a) => a.severidade === 'ATENCAO').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Banner de Identificação do Documento */}
      <div className="st-nfse-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="badge blue mono">
              {extracao.tipoDocumento === 'NFSE_NACIONAL' ? 'NFS-e Padrão Nacional' : 'DPS Nacional'}
            </span>
            {ident.temNt004 && (
              <span className="badge green mono">NT 004 (IBS/CBS)</span>
            )}
            {ident.temNt007 && (
              <span className="badge blue mono">NT 007 (tpRetPisCofins)</span>
            )}
            {ident.temNt009 && (
              <span className="badge amber mono">NT 009 (Imobiliário/CIB)</span>
            )}
          </div>
          <h2 style={{ margin: '8px 0 4px', fontSize: '19px', fontWeight: 700, color: '#f9fafb' }}>
            NFS-e Nº {ident.nNFSe || ident.nDPS || 'S/N'} • Série {ident.serie || '1'}
          </h2>
          <p className="mono" style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Chave / ID: {ident.chNFSe || ident.idDps || extracao.sha256.slice(0, 32)}
          </p>
          {empresaAtivaNome && (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6ee7b7' }}>
              Tomador Ativo no Sistema: <b>{empresaAtivaNome}</b>
            </p>
          )}
        </div>

        {/* Ações Rápidas de Laudo Pericial */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleBaixarLaudoNfse('html')}
            disabled={baixandoRelatorio}
            className="btn"
            style={{ minHeight: '44px' }}
            title="Exportar Laudo Pericial completo em HTML com governança e visual corporativo"
          >
            {baixandoRelatorio ? 'Gerando...' : '📄 Laudo HTML'}
          </button>
          <button
            type="button"
            onClick={() => handleBaixarLaudoNfse('txt')}
            disabled={baixandoRelatorio}
            className="st-btn-secondary"
            style={{ minHeight: '44px' }}
            title="Exportar Laudo Pericial em TXT estruturado para arquivamento contábil"
          >
            {baixandoRelatorio ? 'Gerando...' : '📝 Laudo TXT'}
          </button>

          {onVoltarParaUpload && (
            <button
              type="button"
              onClick={onVoltarParaUpload}
              className="st-btn-secondary"
              style={{ minHeight: '44px' }}
            >
              ← Voltar / Novo Arquivo
            </button>
          )}
        </div>
      </div>

      {erroRelatorio && (
        <div className="err" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} role="alert">
          <span>⚠️ {erroRelatorio}</span>
          <button
            type="button"
            onClick={() => setErroRelatorio(null)}
            className="mini"
            aria-label="Fechar erro"
          >
            ×
          </button>
        </div>
      )}

      {/* Grid de Partes: Prestador e Tomador */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-2)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
            Prestador do Serviço (Emitente)
          </span>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{prest.xNome || 'Nome não informado'}</p>
          <p className="mono" style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink-2)' }}>CNPJ/CPF: {prest.cnpj || prest.cpf || '-'}</p>
          {prest.im && <p className="mono" style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--ink-2)' }}>Inscrição Municipal: {prest.im}</p>}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-muted)', fontSize: '12px', color: 'var(--ink-2)' }}>
            <div>{prest.endereco?.xLgr || 'Logradouro não informado'}, {prest.endereco?.nro || 'S/N'}</div>
            <div>
              {prest.endereco?.xBairro ? `${prest.endereco.xBairro} • ` : ''}
              {prest.endereco?.xMun || prest.endereco?.cMun || 'Município'} - {prest.endereco?.uf || 'UF'}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-2)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
            Tomador do Serviço (Adquirente)
          </span>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{toma?.xNome || 'Nome não informado'}</p>
          <p className="mono" style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink-2)' }}>CNPJ/CPF: {toma?.cnpj || toma?.cpf || '-'}</p>
          {toma?.im && <p className="mono" style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--ink-2)' }}>Inscrição Municipal: {toma.im}</p>}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-muted)', fontSize: '12px', color: 'var(--ink-2)' }}>
            <div>{toma?.endereco?.xLgr || 'Logradouro não informado'}, {toma?.endereco?.nro || 'S/N'}</div>
            <div>
              {toma?.endereco?.xBairro ? `${toma.endereco.xBairro} • ` : ''}
              {toma?.endereco?.xMun || toma?.endereco?.cMun || 'Município'} - {toma?.endereco?.uf || 'UF'}
            </div>
          </div>
        </div>
      </div>

      {/* Card Principal: Discriminação do Serviço e Valores */}
      <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-2)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
            Discriminação dos Serviços Prestados
          </span>
          <p className="st-subcard" style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {serv.xDescServ || 'Descrição não detalhada no XML.'}
          </p>
        </div>

        <div className="st-nfse-grid-4" style={{ fontSize: '12px' }}>
          <div className="st-subcard">
            <span className="muted" style={{ display: 'block' }}>Código Trib. Nacional:</span>
            <strong className="mono" style={{ color: 'var(--accent-blue)' }}>{serv.cTribNac || 'Não inf.'}</strong>
          </div>
          <div className="st-subcard">
            <span className="muted" style={{ display: 'block' }}>Código NBS:</span>
            <strong className="mono" style={{ color: 'var(--accent-blue)' }}>{serv.cNBS || 'Não inf.'}</strong>
          </div>
          <div className="st-subcard">
            <span className="muted" style={{ display: 'block' }}>Valor dos Serviços:</span>
            <strong className="mono tabular-nums" style={{ color: 'var(--ok)', fontSize: '14px' }}>
              R$ {(val.vServ || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="st-subcard">
            <span className="muted" style={{ display: 'block' }}>Valor Líquido:</span>
            <strong className="mono tabular-nums" style={{ color: 'var(--ink)', fontSize: '14px' }}>
              R$ {(val.vLiq || val.vServ || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
      </div>

      {/* Alertas Fiscais & Conformidade */}
      <ProgressiveSection
        id="alertas-nfse"
        currentLevel={nivel}
        minLevel="operacional"
        title={`Alertas de Auditoria (${(resultado.alertas || []).length})`}
        subtitle="Inconformidades de preenchimento, schema e cruzamento tributário"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFiltroAlertas('TODOS')}
              className={`mini ${filtroAlertas === 'TODOS' ? 'is-active' : ''}`}
              style={{ minHeight: '44px', borderColor: filtroAlertas === 'TODOS' ? 'var(--accent-emerald)' : undefined }}
            >
              Todos ({(resultado.alertas || []).length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAlertas('CRITICO')}
              className="mini"
              style={{ minHeight: '44px', borderColor: filtroAlertas === 'CRITICO' ? 'var(--accent-crimson)' : undefined }}
            >
              Críticos ({totalCriticos})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAlertas('ATENCAO')}
              className="mini"
              style={{ minHeight: '44px', borderColor: filtroAlertas === 'ATENCAO' ? 'var(--accent-amber)' : undefined }}
            >
              Atenção ({totalAtencao})
            </button>
          </div>

          {alertasFiltrados.length === 0 ? (
            <p className="muted small">Nenhum alerta apontado com o filtro selecionado.</p>
          ) : (
            alertasFiltrados.map((alerta, idx) => (
              <div
                key={idx}
                className={`note ${
                  alerta.severidade === 'CRITICO'
                    ? 'critico'
                    : alerta.severidade === 'ATENCAO'
                    ? 'atencao'
                    : 'info'
                }`}
              >
                <div className="t" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge grey">{alerta.severidade}</span>
                  <span className="mono">{alerta.codigo}</span>
                  <span>{alerta.titulo}</span>
                </div>
                <div className="x">{alerta.detalhe}</div>
                {alerta.baseLegal && <div className="src mono">⚖ Base: {alerta.baseLegal}</div>}
              </div>
            ))
          )}
        </div>
      </ProgressiveSection>

      {/* Card de Geração e Pré-Visualização do DANFSe Oficial (RFB em Go) */}
      <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-muted)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--ink)' }}>
              Gerador Oficial DANFSe em PDF (RFB Go)
            </h3>
            <p className="hint" style={{ margin: '3px 0 0', fontSize: '12px' }}>
              Renderizado diretamente pelo microsserviço oficial da Receita Federal (rtc-danfse:8084).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <label htmlFor="select-stc" style={{ fontWeight: 600 }}>Situação:</label>
              <select
                id="select-stc"
                value={stc}
                onChange={(e) => setStc(e.target.value as '0' | '1' | '2')}
                style={{ width: 'auto', minHeight: '44px' }}
              >
                <option value="0">0 - Válida (Normal)</option>
                <option value="1">1 - Substituída</option>
                <option value="2">2 - Cancelada</option>
              </select>
            </div>

            <label className="check" style={{ cursor: 'pointer', minHeight: '44px' }}>
              <input
                type="checkbox"
                checked={canhoto}
                onChange={(e) => setCanhoto(e.target.checked)}
              />
              <span>Exibir Canhoto</span>
            </label>

            <button
              type="button"
              disabled={gerandoPdf}
              onClick={handleGerarDanfse}
              aria-busy={gerandoPdf}
              className="st-btn-primary"
              style={{ minHeight: '44px', minWidth: '220px' }}
            >
              {gerandoPdf ? (
                <>
                  <span className="spin" aria-hidden="true" />
                  <span>Renderizando DANFSe...</span>
                </>
              ) : (
                <span>📄 Gerar DANFSe Oficial (PDF)</span>
              )}
            </button>
          </div>
        </div>

        {erroDanfse && (
          <div className="note critico" role="alert">
            <div className="t">Falha ao emitir DANFSe:</div>
            <div className="x">{erroDanfse}</div>
            {orientacaoDanfse && (
              <div className="src mono">💡 Orientação: {orientacaoDanfse}</div>
            )}
          </div>
        )}

        {pdfUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="st-subcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--ok)', fontWeight: 700 }}>
                ✓ DANFSe gerado com sucesso via rtc-danfse
              </span>
              <a
                href={pdfUrl}
                download={`DANFSe_${ident.nNFSe || ident.nDPS || 'nacional'}.pdf`}
                className="btn"
                style={{ minHeight: '44px', textDecoration: 'none' }}
              >
                💾 Baixar Arquivo PDF
              </a>
            </div>

            <iframe
              src={pdfUrl}
              title="Pré-visualização do DANFSe Oficial em PDF"
              style={{ width: '100%', height: '650px', borderRadius: '10px', border: '1px solid var(--border-muted)', background: '#ffffff' }}
            />
          </div>
        )}
      </div>

      {/* Seção Sênior: Custódia Digital & Hash SHA-256 */}
      <ProgressiveSection
        id="custodia-nfse"
        currentLevel={nivel}
        minLevel="senior"
        title="Cadeia de Custódia Digital & Hash Criptográfico"
        subtitle="Rastreabilidade pericial imutável do XML recebido"
      >
        <div className="st-legal-memory">
          <div>SHA-256: <strong style={{ color: 'var(--accent-blue)' }}>{extracao.sha256}</strong></div>
          <div>Versão Schema: <span className="muted">{extracao.versaoSchema || 'Padrão Nacional'}</span></div>
          <div>Tipo: <span style={{ color: 'var(--ok)' }}>{extracao.tipoDocumento}</span></div>
        </div>
      </ProgressiveSection>
    </div>
  );
}
