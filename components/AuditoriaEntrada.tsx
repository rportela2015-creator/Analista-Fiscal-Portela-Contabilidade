'use client';

import React, { useState } from 'react';
import type {
  ExtractedInvoiceData,
  ExtractedItem,
  MotorAuditoria,
  ContextoAdquirente,
  DocumentoContexto,
  AuditRequestPayload,
} from '@/lib/extrator-nfe-types';
import { montarAuditRequestPayload, converterItemExtracaoParaPrecificacao } from '@/lib/extrator-nfe-types';
import { converterItemExtracaoParaParametrizacao } from '@/lib/extrator-nfe';
import TabelaItensExtracao from './TabelaItensExtracao';
import ParametrizacaoERP from './ParametrizacaoERP';

/* =========================================================================
 * CONTRATOS DE TIPOS PARA A ETAPA 2 (M2 ↔ M3)
 * ========================================================================= */

export type {
  MotorAuditoria,
  ContextoAdquirente,
  DocumentoContexto,
  AuditRequestPayload,
};

export { montarAuditRequestPayload };



/**
 * Adaptador puro para compatibilidade entre a resposta pericial e o componente ParametrizacaoERP
 */
export function adaptAuditResultForERP(
  result: any,
  invoice: ExtractedInvoiceData,
  motor: string,
  regime: string,
  finalidade: string
) {
  return {
    statusGlobal: result.statusGlobal || 'Regular',
    motor: result.motorUtilizado || (motor === 'ollama' ? 'Ollama Local (RX 580)' : 'Gemini Cloud (Google AI)'),
    parecerTecnicoXml: result.parecerTecnicoGeral || result.parecerTecnicoXml || 'Parecer técnico disponível.',
    parecerConformidade: result.parecerConformidadeCreditos || result.parecerConformidade || 'Parecer de conformidade disponível.',
    regime,
    finalidade,
    nfe: {
      emitente: {
        xNome: invoice.emitente?.nome,
        CNPJ: invoice.emitente?.cnpj,
        IE: invoice.emitente?.ie || 'ISENTO',
        enderEmit: { UF: invoice.emitente?.uf },
      },
      destinatario: {
        xNome: invoice.destinatario?.nome,
        CNPJ: invoice.destinatario?.cnpj,
        CPF: invoice.destinatario?.cpf,
        enderDest: { UF: invoice.destinatario?.uf },
      },
    },
    itens: (result.itens || []).map((it: any) => ({
      ...it,
      cProd: it.cProd,
      xProd: it.xProd,
      ncm: typeof it.ncm === 'object' ? (it.ncm.auditado || it.ncm.declarado) : it.ncm,
      cest: it.cest || (typeof it.ncm === 'object' ? it.ncm.cest : undefined),
      cfopEntrada: it.cfop?.entradaSugerido || it.cfopEntrada || '1102',
      cstIcmsEntrada: it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00',
      aliqIcms: it.icms?.aliqIcmsCredito || it.aliqIcms || '18%',
      permiteCredito: it.icms?.permiteCredito ?? it.permiteCredito ?? true,
      cstPisCofinsEntrada: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
      aliqPis: it.aliqPis || '1.65%',
      aliqCofins: it.aliqCofins || '7.6%',
      cClassTrib: it.reforma?.cClassTrib || it.cClassTrib || '000001',
      aliqIbsTransitorio: it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%',
      aliqCbsTransitorio: it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%',
      regimeEspecial: it.reforma?.regimeEspecial || it.regimeEspecial || 'Regime Regular (Padrão)',
      instrucaoCadastro: it.instrucaoCadastroERP || it.instrucaoCadastro || 'Instrução de parametrização fiscal',
    })),
  };
}

/* =========================================================================
 * COMPONENTE AUDITORIA DE ENTRADA (FLUXO EM DUAS ETAPAS)
 * ========================================================================= */

export default function AuditoriaEntrada() {
  // ---- Hooks chamados estritamente no topo para cumprir scripts/hookcheck.mjs ----

  // 1. Configuração e Arquivo de Entrada
  const [file, setFile] = useState<File | null>(null);
  const [regime, setRegime] = useState('Simples Nacional');
  const [finalidade, setFinalidade] = useState('Revenda/Comercialização');
  const [autoSync, setAutoSync] = useState(true);

  // 2. Estados da Etapa 1 (Extração Determinística Imediata)
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractedInvoice, setExtractedInvoice] = useState<ExtractedInvoiceData | null>(null);

  // 3. Estados da Etapa 2 (Seleção de Itens e Motor Duplo de IA)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [motor, setMotor] = useState<MotorAuditoria>('ollama');
  const [modeloOllama, setModeloOllama] = useState<string>('qwen2.5:7b');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditElapsedTime, setAuditElapsedTime] = useState(0);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<any | null>(null);

  // 4. Estados de Exportação de Relatórios
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ─── Handlers da Etapa 1 (Extração Determinística) ──────────────────────────
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setExtractionError('Selecione um arquivo XML ou PDF da NF-e.');
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);
    setExtractedInvoice(null);
    setAuditResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('regime', regime);
    formData.append('finalidade', finalidade);

    try {
      const res = await fetch('/api/auditoria-entrada/extrair', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status} ao extrair dados.`);
      }

      const result: ExtractedInvoiceData = await res.json();
      setExtractedInvoice(result);

      // Pré-seleciona todos os itens da nota para permitir fluxo com 1 clique
      const todosIndices = new Set(result.itens.map((it) => it.index));
      setSelectedIndices(todosIndices);

      // Sincronização automática silenciosa pós-extração (se habilitada)
      if (autoSync && result.itens && result.itens.length > 0) {
        const itensPrec = result.itens.map((it) => converterItemExtracaoParaPrecificacao(it));
        const regimeDest = regime.toLowerCase().includes('simples')
          ? 'simples'
          : regime.toLowerCase().includes('real')
          ? 'real'
          : 'presumido';
        const dest = finalidade.toLowerCase().includes('ind')
          ? 'industrializacao'
          : finalidade.toLowerCase().includes('ativo')
          ? 'ativo_imobilizado'
          : finalidade.toLowerCase().includes('consumo')
          ? 'uso_consumo'
          : 'comercializacao';

        const itensErp = result.itens.map((it) =>
          converterItemExtracaoParaParametrizacao(it, {
            ufOrigem: result.emitente?.uf,
            ufDestino: result.destinatario?.uf || 'PR',
            regimeDestinatario: regimeDest as any,
            destinacao: dest as any,
          })
        );

        try {
          sessionStorage.setItem('ncm-precificar-itens', JSON.stringify(itensPrec));
          sessionStorage.setItem('ncm-parametrizar-itens', JSON.stringify(itensErp));
        } catch {
          /* fallback */
        }

        window.dispatchEvent(
          new CustomEvent('navegar-aba', {
            detail: {
              tab: 'parametrizar',
              itens: itensPrec,
              itensErp,
              manterNaAbaAtual: true,
            },
          })
        );
      }
    } catch (err: any) {
      setExtractionError(err.message || 'Falha ao processar a extração determinística.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ─── Handlers de Seleção de Itens (Etapa 2) ─────────────────────────────────
  const handleToggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!extractedInvoice) return;
    setSelectedIndices(new Set(extractedInvoice.itens.map((it) => it.index)));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleSelectOnlySensitive = () => {
    if (!extractedInvoice) return;
    const sensiveis = extractedInvoice.itens
      .filter((it) => it.sensivelParaAuditoria)
      .map((it) => it.index);
    setSelectedIndices(new Set(sensiveis));
  };

  const handleResetToUpload = () => {
    setExtractedInvoice(null);
    setAuditResult(null);
    setSelectedIndices(new Set());
    setExtractionError(null);
    setAuditError(null);
    setFile(null);
  };

  const handleReturnToSelection = () => {
    setAuditResult(null);
    setAuditError(null);
  };

  // ─── Handler de Submissão de Auditoria Seletiva (Etapa 2) ───────────────────
  const handleAuditSubmit = async () => {
    if (!extractedInvoice) return;
    if (selectedIndices.size === 0) {
      setAuditError('Selecione pelo menos um item para submeter à auditoria pericial.');
      return;
    }

    setIsAuditing(true);
    setAuditElapsedTime(0);
    setAuditError(null);
    setAuditResult(null);

    const timer = setInterval(() => {
      setAuditElapsedTime((prev) => prev + 1);
    }, 1000);

    let payload: AuditRequestPayload;
    try {
      payload = montarAuditRequestPayload({
        motor,
        modelo: modeloOllama,
        regime,
        finalidade,
        ufDestino: extractedInvoice.destinatario?.uf || 'SP',
        extracao: extractedInvoice,
        selectedIndices,
      });
    } catch (err: any) {
      clearInterval(timer);
      setAuditError(err.message || 'Falha ao montar payload de auditoria.');
      setIsAuditing(false);
      return;
    }

    try {
      // Dispara para o endpoint de auditoria M2 ↔ M3
      let res = await fetch('/api/auditoria-entrada/auditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Suporte a fallback de rota se /auditar ainda for roteado via query param action=auditar
      if (res.status === 404) {
        res = await fetch('/api/auditoria-entrada?action=auditar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.detalhe || `Erro HTTP ${res.status} na auditoria pericial.`);
      }

      const rawResult = await res.json();
      const adapted = adaptAuditResultForERP(rawResult, extractedInvoice, motor, regime, finalidade);
      setAuditResult(adapted);
    } catch (err: any) {
      setAuditError(err.message || 'Falha ao executar auditoria pericial dos itens.');
    } finally {
      clearInterval(timer);
      setIsAuditing(false);
    }
  };

  // ─── Handler de Download de Relatório ──────────────────────────────────────
  const handleDownloadReport = async (format: 'html' | 'txt' = 'html') => {
    if (!auditResult) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/auditoria-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auditResult, format }),
      });

      if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao gerar relatório.`);

      const blob = await res.blob();
      if (typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_executivo.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setPdfError(err.message || 'Falha ao baixar o relatório.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ─── Resumo Analítico dos Tributos de Entrada e Custo Real (NBC TG 16) ────
  const resumoEntrada = React.useMemo(() => {
    if (!extractedInvoice) return null;
    const itens = extractedInvoice.itens || [];
    let vProd = 0;
    let vFreteSegOutros = 0;
    let vDesc = 0;
    let tribNaoRecup = 0;
    let credRecup = 0;

    for (const it of itens) {
      vProd += it.vProd || 0;
      vFreteSegOutros += (it.vFrete || 0) + (it.vSeg || 0) + (it.vOutro || 0);
      vDesc += it.vDesc || 0;
      const t = it.tributos || {};
      tribNaoRecup += (t.vIPI || 0) + (t.vICMSST || 0) + (t.vII || 0) + (t.vIS || 0);
      credRecup += (t.vICMS || 0) + (t.vPIS || 0) + (t.vCOFINS || 0) + (t.vCBS || 0) + (t.vIBS || 0);
    }

    const custoRealEstimado = vProd - vDesc + vFreteSegOutros + tribNaoRecup - credRecup;

    return {
      vProd,
      vFreteSegOutros,
      vDesc,
      tribNaoRecup,
      credRecup,
      custoRealEstimado,
    };
  }, [extractedInvoice]);

  // ─── Transferência Direta para a Aba de Precificação (Etapa 3) ────────────
  const handleEnviarParaPrecificacao = (itensParaEnviar: ExtractedItem[]) => {
    if (!itensParaEnviar || itensParaEnviar.length === 0) return;
    const convertidos = itensParaEnviar.map((it) => converterItemExtracaoParaPrecificacao(it));
    try {
      sessionStorage.setItem('ncm-precificar-itens', JSON.stringify(convertidos));
    } catch {
      /* fallback */
    }

    window.dispatchEvent(
      new CustomEvent('navegar-aba', {
        detail: {
          tab: 'precificar',
          itens: convertidos,
        },
      })
    );
  };

  // ─── Transferência Direta para a Aba de Parametrização ERP ────────────────
  const handleEnviarParaErp = (itensParaEnviar: ExtractedItem[], manterNaAbaAtual = false) => {
    if (!itensParaEnviar || itensParaEnviar.length === 0) return;
    const regimeDestinatario = regime.toLowerCase().includes('simples')
      ? 'simples'
      : regime.toLowerCase().includes('real')
      ? 'real'
      : 'presumido';
    const destinacao = finalidade.toLowerCase().includes('ind')
      ? 'industrializacao'
      : finalidade.toLowerCase().includes('ativo')
      ? 'ativo_imobilizado'
      : finalidade.toLowerCase().includes('consumo')
      ? 'uso_consumo'
      : 'comercializacao';

    const convertidos = itensParaEnviar.map((it) =>
      converterItemExtracaoParaParametrizacao(it, {
        ufOrigem: extractedInvoice?.emitente?.uf,
        ufDestino: extractedInvoice?.destinatario?.uf || 'PR',
        regimeDestinatario,
        destinacao,
      })
    );

    try {
      sessionStorage.setItem('ncm-parametrizar-itens', JSON.stringify(convertidos));
    } catch {
      /* fallback */
    }

    window.dispatchEvent(
      new CustomEvent('navegar-aba', {
        detail: {
          tab: 'parametrizar',
          itensErp: convertidos,
          manterNaAbaAtual,
        },
      })
    );
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2>Auditoria de Entrada (IA Local · RX 580)</h2>
        <span className="badge success mono">Soberania Local-First</span>
      </div>
      <p className="hint">
        Faça o upload da nota fiscal (.xml da NF-e ou .pdf do DANFE) para auditar documento fiscal com extração determinística imediata e análise pericial por IA.
      </p>

      {/* =========================================================================
       * ETAPA 1: Formulário de Upload e Extração Determinística Imediata
       * ========================================================================= */}
      {!extractedInvoice && (
        <form onSubmit={handleFileUpload}>
          <label className="field">
            <span>Arquivo da Nota Fiscal (.xml, .pdf)</span>
            <input
              type="file"
              accept=".xml,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <label className="field">
            <span>Regime da Empresa Adquirente</span>
            <select value={regime} onChange={(e) => setRegime(e.target.value)}>
              <option value="Simples Nacional">Simples Nacional</option>
              <option value="Regime Regular">Regime Regular</option>
            </select>
          </label>

          <label className="field">
            <span>Finalidade da Aquisição</span>
            <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
              <option value="Revenda/Comercialização">Revenda/Comercialização</option>
              <option value="Industrialização">Industrialização</option>
              <option value="Uso/Consumo">Uso/Consumo</option>
              <option value="Ativo Imobilizado">Ativo Imobilizado</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            <span>⚡ Sincronizar Automaticamente com Precificação e ERP ao Auditar XML</span>
          </label>

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={isExtracting || !file} className="btn primary">
              {isExtracting ? 'Extraindo Itens da NF-e (< 200ms)...' : 'Auditar Documento (Extrair Itens)'}
            </button>
          </div>
        </form>
      )}

      {isExtracting && (
        <div className="note info" style={{ marginTop: 20 }}>
          <div className="t">Extração Determinística em Andamento...</div>
          <div className="x">
            Processamento determinístico imediato (&lt;200ms) sem invocação de LLMs. Validando 100% dos NCMs contra o catálogo oficial do Siscomex.
          </div>
        </div>
      )}

      {extractionError && (
        <div className="note error" style={{ marginTop: 20 }}>
          <div className="t">Erro na extração do documento fiscal</div>
          <div className="x">{extractionError}</div>
        </div>
      )}

      {/* =========================================================================
       * ETAPA 2: Apresentação Tabular, Seleção e Disparo da Auditoria
       * ========================================================================= */}
      {extractedInvoice && !auditResult && (
        <div style={{ marginTop: 20 }}>
          {/* Cabeçalho Resumo da NF-e */}
          <div className="card" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>NF-e: {extractedInvoice.identificacao?.numero || 'S/N'} (Série {extractedInvoice.identificacao?.serie || '1'})</strong>
                <span className="badge blue mono" style={{ marginLeft: 8 }}>{extractedInvoice.tipoDocumento}</span>
                {extractedInvoice.tempoExtracaoMs !== undefined && (
                  <span className="badge success mono" style={{ marginLeft: 6 }}>{extractedInvoice.tempoExtracaoMs}ms</span>
                )}
              </div>
              <button type="button" onClick={handleResetToUpload} className="mini" title="Carregar outro arquivo de nota fiscal">
                ↺ Carregar Outro Arquivo
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10, fontSize: '13px' }}>
              <div><strong>Emitente:</strong> {extractedInvoice.emitente?.nome || 'N/A'} (CNPJ: {extractedInvoice.emitente?.cnpj || 'N/A'}) - {extractedInvoice.emitente?.uf}</div>
              <div><strong>Regime Emitente:</strong> {extractedInvoice.emitente?.regimeDescricao || 'N/A'}</div>
              <div><strong>Destinatário:</strong> {extractedInvoice.destinatario?.nome || 'N/A'} ({extractedInvoice.destinatario?.uf})</div>
              <div><strong>Valor Total NF:</strong> {extractedInvoice.resumoFinanceiro?.vNF?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>

          {/* Resumo Analítico de Custo e Tributos da NF-e (Etapa 3) */}
          {resumoEntrada && (
            <div
              className="card"
              style={{
                marginTop: 14,
                marginBottom: 14,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: 14,
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ margin: 0, color: '#166534', fontSize: '14px' }}>
                    📊 Resumo Analítico de Custo de Entrada & Tributos (NBC TG 16)
                  </h4>
                  <p className="hint" style={{ margin: '3px 0 0', color: '#15803d', fontSize: '12px' }}>
                    Dados consolidados para formação de preço e aproveitamento de créditos fiscais.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ background: '#107c41', borderColor: '#107c41', fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => handleEnviarParaPrecificacao(extractedInvoice.itens)}
                    title="Transferir todos os itens da nota fiscal diretamente para a aba de Precificação"
                  >
                    💰 Enviar Todos para Precificação
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ background: '#0b3d91', borderColor: '#0b3d91', fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => handleEnviarParaErp(extractedInvoice.itens, false)}
                    title="Transferir todos os itens da nota fiscal diretamente para a aba de Parametrização ERP"
                  >
                    ⚙️ Enviar Todos para Parametrização ERP
                  </button>
                  {selectedIndices.size > 0 && selectedIndices.size < extractedInvoice.itens.length && (
                    <>
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ fontSize: '12.5px', padding: '6px 12px' }}
                        onClick={() => {
                          const selecionados = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));
                          handleEnviarParaPrecificacao(selecionados);
                        }}
                        title="Transferir apenas os itens selecionados para a Precificação"
                      >
                        💰 Enviar {selectedIndices.size} Itens Selecionados
                      </button>
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ fontSize: '12.5px', padding: '6px 12px' }}
                        onClick={() => {
                          const selecionados = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));
                          handleEnviarParaErp(selecionados, false);
                        }}
                        title="Transferir apenas os itens selecionados para a Parametrização ERP"
                      >
                        ⚙️ Enviar {selectedIndices.size} Selecionados p/ ERP
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: 10,
                  marginTop: 12,
                  fontSize: '12.5px',
                }}
              >
                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Produtos (vProd):</span>
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                    {resumoEntrada.vProd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Frete/Seg/Outros:</span>
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                    + {resumoEntrada.vFreteSegOutros.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #fee2e2' }}>
                  <span style={{ color: '#991b1b', fontSize: '11px', display: 'block' }}>Tributos s/ Crédito (IPI/ST):</span>
                  <strong style={{ fontSize: '13px', color: '#b91c1c' }}>
                    + {resumoEntrada.tribNaoRecup.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #dbeafe' }}>
                  <span style={{ color: '#1e40af', fontSize: '11px', display: 'block' }}>Impostos a Recuperar:</span>
                  <strong style={{ fontSize: '13px', color: '#2563eb' }}>
                    - {resumoEntrada.credRecup.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: 6, border: '1px solid #86efac' }}>
                  <span style={{ color: '#14532d', fontSize: '11px', display: 'block', fontWeight: 600 }}>Custo Real Líquido:</span>
                  <strong style={{ fontSize: '14px', color: '#166534' }}>
                    {resumoEntrada.custoRealEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Tabela Interativa de Itens */}
          <TabelaItensExtracao
            itens={extractedInvoice.itens}
            selectedIndices={selectedIndices}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onSelectSensitivesOnly={handleSelectOnlySensitive}
            onSelectOnlySensitive={handleSelectOnlySensitive}
            disabled={isAuditing}
            onPrecificarItem={(item) => handleEnviarParaPrecificacao([item])}
            onParametrizarItem={(item) => handleEnviarParaErp([item], false)}
            onParametrizarSelecionados={(itens) => handleEnviarParaErp(itens, false)}
          />

          {/* Painel Dual Engine Selector (Seletor de Motor Duplo) */}
          <div className="card" style={{ marginTop: 20, marginBottom: 20, background: '#fcfdfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--ink)' }}>
                  Motor de Inteligência Fiscal para Auditoria
                </h3>
                <p className="hint" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
                  Escolha o ambiente de processamento dos {selectedIndices.size} itens selecionados:
                </p>
              </div>
              <span className="badge blue mono" style={{ fontSize: '11px' }}>
                {motor === 'ollama' ? 'Soberania Local Ativa' : 'Modo Nuvem Selecionado'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              {/* Card 1: Ollama Local (GPU RX 580) */}
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 16,
                  borderRadius: 12,
                  cursor: isAuditing ? 'not-allowed' : 'pointer',
                  border: motor === 'ollama' ? '2px solid var(--brand)' : '1px solid var(--line)',
                  background: motor === 'ollama' ? '#f4f8fe' : '#ffffff',
                  boxShadow: motor === 'ollama' ? '0 2px 8px rgba(11,61,145,0.08)' : 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="radio"
                      name="motor_auditoria"
                      value="ollama"
                      checked={motor === 'ollama'}
                      onChange={() => setMotor('ollama')}
                      disabled={isAuditing}
                      style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                      IA Local (GPU AMD RX 580)
                    </strong>
                  </div>
                  <span className="badge alta mono" style={{ fontSize: '10.5px' }}>100% Privado</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.45, paddingLeft: 28 }}>
                  <div>• <strong>Processamento Particionado:</strong> Item a item (ou micro-lotes de 1-2 itens).</div>
                  <div>• <strong>Zero Timeout:</strong> Limite de 35s por item, eliminando estouros de 180s na RX 580.</div>
                  <div>• <strong>Soberania Tributária:</strong> Zero tráfego externo; dados fiscais confidenciais não saem do servidor.</div>
                </div>

                {motor === 'ollama' && (
                  <div style={{ marginTop: 12, paddingLeft: 28 }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                      Modelo Local:
                    </label>
                    <select
                      value={modeloOllama}
                      onChange={(e) => setModeloOllama(e.target.value)}
                      disabled={isAuditing}
                      style={{ fontSize: '12px', padding: '6px 8px', borderRadius: 6, width: '100%', maxWidth: 280 }}
                    >
                      <option value="qwen2.5:7b">qwen2.5:7b (Perícia Tributária Profunda & Arbitragem NCM)</option>
                      <option value="qwen3.5:4b">qwen3.5:4b (Triagem Rápida & Alto Rendimento 16k)</option>
                      <option value="qwen2.5:7b-16k">qwen2.5:7b-16k (Contexto Estendido 16k)</option>
                    </select>
                  </div>
                )}

                <div style={{ marginTop: 12, paddingLeft: 28, fontSize: '11px', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
                  <span>Endpoint local 127.0.0.1:11434 pronto · Vulkan/DirectML ativo</span>
                </div>
              </label>

              {/* Card 2: Google Gemini API (Nuvem) */}
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 16,
                  borderRadius: 12,
                  cursor: isAuditing ? 'not-allowed' : 'pointer',
                  border: motor === 'gemini' ? '2px solid var(--brand)' : '1px solid var(--line)',
                  background: motor === 'gemini' ? '#f4f8fe' : '#ffffff',
                  boxShadow: motor === 'gemini' ? '0 2px 8px rgba(11,61,145,0.08)' : 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="radio"
                      name="motor_auditoria"
                      value="gemini"
                      checked={motor === 'gemini'}
                      onChange={() => setMotor('gemini')}
                      disabled={isAuditing}
                      style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                      Google Gemini API (Nuvem)
                    </strong>
                  </div>
                  <span className="badge blue mono" style={{ fontSize: '10.5px' }}>Alta Velocidade</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.45, paddingLeft: 28 }}>
                  <div>• <strong>Modelo Cloud:</strong> gemini-3.8-flash via SDK oficial (@google/genai).</div>
                  <div>• <strong>Execução Paralela:</strong> Auditoria em nuvem com resposta estruturada em JSON Schema.</div>
                  <div>• <strong>Ideal para Lotes:</strong> Elevada vazão para notas fiscais com dezenas de itens.</div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: 12, paddingLeft: 28 }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0e5cc4', display: 'inline-block' }} />
                    <span>Utiliza chave de API configurada no ambiente (GEMINI_API_KEY)</span>
                  </div>
                </div>
              </label>
            </div>

            {/* Ação de Disparo da Auditoria */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAuditSubmit}
                disabled={isAuditing || selectedIndices.size === 0}
                className="btn primary"
                style={{ fontWeight: 650, padding: '10px 20px' }}
              >
                {isAuditing
                  ? `Auditando ${selectedIndices.size} item(ns) via ${motor === 'ollama' ? 'IA Local (RX 580)' : 'Google Gemini'}...`
                  : `Auditar ${selectedIndices.size} Item(ns) Selecionado(s)`}
              </button>

              {selectedIndices.size === 0 && (
                <span className="small" style={{ color: 'var(--bad)', fontWeight: 600 }}>
                  Selecione ao menos 1 item na tabela acima para iniciar a auditoria.
                </span>
              )}
            </div>
          </div>

          {isAuditing && (
            <div className="note info" style={{ marginTop: 20 }}>
              <div className="t">
                Executando Auditoria Pericial via {motor === 'ollama' ? 'IA Local Ollama (GPU RX 580)' : 'Google Gemini Cloud API'}...
              </div>
              <div className="x" style={{ marginTop: 6 }}>
                Auditando <strong>{selectedIndices.size}</strong> item(ns) de {extractedInvoice.itens.length} · Tempo decorrido: <strong>{auditElapsedTime}s</strong>
              </div>
              <div className="x" style={{ marginTop: 4, fontSize: '0.88rem', opacity: 0.85 }}>
                {motor === 'ollama'
                  ? 'Os itens selecionados estão sendo particionados item a item com timeout de 35s e num_ctx: 4096 para eliminar sobrecargas de VRAM e timeouts de 180s na GPU RX 580.'
                  : 'Os itens selecionados estão sendo processados via Google Gemini API (gemini-3.8-flash) com schema estruturado e saneamento determinístico Siscomex.'}
              </div>
            </div>
          )}

          {auditError && (
            <div className="note error" style={{ marginTop: 20 }}>
              <div className="t">Erro na auditoria pericial</div>
              <div className="x">{auditError}</div>
              {motor === 'ollama' && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMotor('gemini');
                      setAuditError(null);
                    }}
                    className="chip"
                    style={{ cursor: 'pointer' }}
                  >
                    Alternar para Google Gemini Cloud API
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
       * ETAPA FINAL: Apresentação dos Resultados Auditados e ERP
       * ========================================================================= */}
      {auditResult && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Resultados da Auditoria</h3>
              {auditResult.statusGlobal === 'Inconsistente' ? (
                <span className="badge error">{auditResult.statusGlobal}</span>
              ) : auditResult.statusGlobal === 'Atenção' ? (
                <span className="badge media">{auditResult.statusGlobal}</span>
              ) : (
                <span className="badge blue">{auditResult.statusGlobal || 'Regular'}</span>
              )}
              <span className="badge grey mono">{auditResult.motor}</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleReturnToSelection} className="mini" title="Modificar seleção de itens ou motor">
                ← Voltar para Seleção de Itens
              </button>
              <button type="button" onClick={handleResetToUpload} className="mini">
                ↺ Nova Auditoria
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14, marginBottom: 16, background: '#f9f9f9', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Técnico do Documento</h4>
            <p className="small">{auditResult.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}</p>
          </div>

          <div className="card" style={{ marginBottom: 16, background: '#f0f4f8', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Breve de Conformidade e Créditos</h4>
            <p className="small">{auditResult.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}</p>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleDownloadReport('html')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: 'var(--brand)', color: 'white' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório HTML'}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadReport('txt')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: '#34495e', color: 'white' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório TXT'}
            </button>
            {pdfError && <div className="note error" style={{ marginTop: 8 }}>{pdfError}</div>}
          </div>

          <ParametrizacaoERP data={auditResult} />
        </div>
      )}
    </div>
  );
}
