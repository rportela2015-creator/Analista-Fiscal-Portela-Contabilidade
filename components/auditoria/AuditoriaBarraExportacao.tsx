'use client';

import React from 'react';
import type { ExtractedInvoiceData, ExtractedItem, MotorAuditoria } from '@/lib/extrator-nfe-types';
import type { ResultadoOrquestracaoNfe } from '@/lib/engine/orquestrador-fiscal';
import type { RelatorioCustoEntradaConsolidado } from '@/lib/custos';
import { gerarRelatorioCustosHtml } from '@/lib/custos';
import type { NotaFiscalAuditadaSessao } from '@/lib/types/item-fiscal-auditado';
import type { ExtractedCteData } from '@/lib/fiscal/extrator-cte';
import ParametrizacaoERP from '../ParametrizacaoERP';

function formatarBrl(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface AuditoriaBarraExportacaoProps {
  section: 'dag_body' | 'cpc16_card' | 'motor_ia' | 'resultado_e_modal';
  extractedInvoice?: ExtractedInvoiceData | null;
  resultadoOrquestracao?: ResultadoOrquestracaoNfe | null;
  consolidadoCPC16?: RelatorioCustoEntradaConsolidado | null;
  notaAuditadaSessao?: NotaFiscalAuditadaSessao | null;
  cteFobData?: ExtractedCteData | null;
  handleUploadCteFob?: (file: File | null) => void | Promise<void>;
  regime?: string;
  finalidade?: string;
  selectedIndices?: Set<number>;
  motor?: MotorAuditoria;
  setMotor?: (m: MotorAuditoria) => void;
  modeloOllama?: string;
  setModeloOllama?: (v: string) => void;
  isAuditing?: boolean;
  auditElapsedTime?: number;
  auditError?: string | null;
  setAuditError?: (v: string | null) => void;
  auditResult?: any | null;
  pdfLoading?: boolean;
  pdfError?: string | null;
  relatorioBloqueadoHardcoded?: { mensagem: string; format: 'html' | 'txt' } | null;
  modalCusto?: { aberto: boolean; modo: 'resumido' | 'detalhado' };
  setModalCusto?: React.Dispatch<React.SetStateAction<{ aberto: boolean; modo: 'resumido' | 'detalhado' }>>;
  handleEnviarCustoEfetivoParaPrecificacao?: () => void;
  handleEnviarParaPrecificacao?: (itens: ExtractedItem[]) => void;
  handleEnviarParaErp?: (itens: ExtractedItem[], manterNaAbaAtual?: boolean) => void;
  handleAuditSubmit?: () => void;
  handleReturnToSelection?: () => void;
  handleResetToUpload?: () => void;
  handleDownloadReport?: (format: 'html' | 'txt', opts?: { permitirSimulacaoHardcoded?: boolean }) => void;
}

export default function AuditoriaBarraExportacao(props: AuditoriaBarraExportacaoProps) {
  if (props.section === 'dag_body' && props.resultadoOrquestracao) {
    const { resultadoOrquestracao, handleEnviarCustoEfetivoParaPrecificacao } = props;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          className="card"
          style={{
            background: 'var(--panel)',
            border: '1px solid #3b82f6',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏛️</span>
              <strong style={{ fontSize: 14 }}>Motor Oficial RFB RTC &amp; Reforma Tributária</strong>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background:
                    resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                      ? 'var(--accent-emerald-glow)'
                      : 'var(--accent-amber-subtle)',
                  color:
                    resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                      ? '#6ee7b7'
                      : '#fcd34d',
                  border: `1px solid ${
                    resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                      ? '#059669'
                      : '#d97706'
                  }`,
                }}
              >
                {resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                  ? 'OFICIAL RFB'
                  : 'FALLBACK LOCAL ESTIMADO'}
              </span>
              {resultadoOrquestracao.etapas.rtc.validacaoXml?.executada && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background:
                      resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'VALIDO'
                        ? 'var(--accent-emerald-glow)'
                        : resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'INVALIDO'
                        ? 'var(--accent-crimson-subtle)'
                        : 'var(--accent-amber-subtle)',
                    color:
                      resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'VALIDO'
                        ? '#6ee7b7'
                        : resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'INVALIDO'
                        ? '#fca5a5'
                        : '#fcd34d',
                  }}
                >
                  XML: {resultadoOrquestracao.etapas.rtc.validacaoXml.status}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
              Motor: <b>{resultadoOrquestracao.etapas.rtc.motorRtcUtilizado}</b> · Latência:{' '}
              <b>{resultadoOrquestracao.etapas.rtc.duracaoRtcMs}ms</b>
            </div>
          </div>

          <div
            className="tabular-nums"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              marginTop: 10,
              fontSize: 12,
            }}
          >
            <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
              <div style={{ color: 'var(--ink-2)' }}>IBS Estadual (UF)</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIbsUf.toFixed(2)}
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
              <div style={{ color: 'var(--ink-2)' }}>IBS Municipal</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIbsMun.toFixed(2)}
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
              <div style={{ color: 'var(--ink-2)' }}>CBS Federal</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vCbs.toFixed(2)}
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
              <div style={{ color: 'var(--ink-2)' }}>Imposto Seletivo (IS)</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIs.toFixed(2)}
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
              <div style={{ color: 'var(--ink-2)' }}>Total IVA Dual</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#3b82f6' }}>
                R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIvaTotal.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>⚖️ Auditoria Tripartida de Créditos de Entrada</strong>
            <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>
              Status Extinção: <b>{resultadoOrquestracao.etapas.creditos.statusExtincaoFornecedor}</b>
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="tabular-nums" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-2)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Tributo</th>
                  <th style={{ padding: '6px 8px' }}>Camada 1: Destacado no XML</th>
                  <th style={{ padding: '6px 8px' }}>Camada 2: Admitido pela Regra</th>
                  <th style={{ padding: '6px 8px' }}>Camada 3: Efetivado no CMV (CPC 16)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px' }}>ICMS Próprio</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.icms.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.icms.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.icms.toFixed(2)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px' }}>PIS / PASEP</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.pis.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.pis.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.pis.toFixed(2)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px' }}>COFINS</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.cofins.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.cofins.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.cofins.toFixed(2)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px' }}>IPI</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.ipi.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.ipi.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.ipi.toFixed(2)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px' }}>IBS</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.ibs.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.ibs.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.ibs.toFixed(2)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '6px 8px' }}>CBS</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.cbs.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.cbs.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.cbs.toFixed(2)}</td>
                </tr>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                  <td style={{ textAlign: 'left', padding: '8px' }}>TOTAL DE CRÉDITOS</td>
                  <td style={{ padding: '8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.total.toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.total.toFixed(2)}</td>
                  <td style={{ padding: '8px', color: '#10b981' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {resultadoOrquestracao.etapas.creditos.retidoAguardandoExtincaoIbsCbs.total > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 12px',
                borderRadius: 4,
                background: '#451a03',
                color: '#fcd34d',
                fontSize: 12,
                border: '1px solid #b45309',
              }}
            >
              ⚠️ <b>Atenção (Art. 47 LC 214/2025):</b> R${' '}
              {resultadoOrquestracao.etapas.creditos.retidoAguardandoExtincaoIbsCbs.total.toFixed(2)} em créditos de IBS/CBS foram retidos
              e NÃO abatem o CMV de imediato por estarem com status <b>AGUARDANDO_EXTINCAO</b> do débito pelo fornecedor.
            </div>
          )}
        </div>

        <div
          className="card"
          style={{
            background: 'var(--panel)',
            border: '1px solid #10b981',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <strong style={{ fontSize: 14 }}>📊 Comparativo Tributário dos 4 Regimes (Custo Aterrissado &amp; Preço)</strong>
              <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>
                Calculado com precisão numérica ADR003 HALF_EVEN e mark-up divisor considerando desembolsos e créditos efetivos.
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnviarCustoEfetivoParaPrecificacao}
              className="btn primary"
              style={{ background: '#059669', borderColor: '#059669', fontSize: 12, fontWeight: 700, minHeight: '44px' }}
            >
              💰 Enviar Custo Efetivo para Precificação (Camada 3 CPC 16)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {(['SIMPLES_TRADICIONAL', 'SIMPLES_HIBRIDO_2027', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const).map((key) => {
              const c = resultadoOrquestracao.etapas.custosEPrecificacao.comparativoRegimes[key];
              if (!c) return null;
              return (
                <div
                  key={key}
                  style={{
                    background: 'var(--bg)',
                    border: `1px solid ${c.melhorCenario ? '#10b981' : 'var(--line)'}`,
                    borderRadius: 6,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: c.melhorCenario ? '#6ee7b7' : 'var(--ink)' }}>
                      {c.nomeExibicao}
                    </span>
                    {c.melhorCenario && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          background: '#064e3b',
                          color: '#a7f3d0',
                          border: '1px solid #059669',
                          padding: '1px 6px',
                          borderRadius: 3,
                        }}
                      >
                        MAIS ECONÔMICO
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{c.justificativa}</div>

                  <div className="tabular-nums" style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>CMV Líquido:</span>
                      <b>R$ {c.cmvLiquidoTotal.toFixed(2)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Créditos Entrada:</span>
                      <span style={{ color: '#10b981' }}>R$ {c.creditosAproveitados.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Tributos Saída:</span>
                      <span>R$ {c.tributosSaidaEstimados.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 4, marginTop: 2 }}>
                      <span>Preço Sugerido:</span>
                      <b style={{ color: c.melhorCenario ? '#6ee7b7' : '#3b82f6', fontSize: 13 }}>
                        R$ {c.precoVendaSugerido.toFixed(2)}
                      </b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-2)' }}>
                      <span>Carga Efetiva:</span>
                      <span>{c.cargaTributariaEfetivaPct.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (props.section === 'cpc16_card' && props.consolidadoCPC16 && props.extractedInvoice) {
    const {
      consolidadoCPC16,
      extractedInvoice,
      regime,
      setModalCusto,
      handleEnviarParaPrecificacao,
      handleEnviarParaErp,
      selectedIndices = new Set<number>(),
      notaAuditadaSessao,
      cteFobData,
      handleUploadCteFob,
    } = props;

    return (
      <div
        className="card"
        style={{
          marginTop: 14,
          marginBottom: 14,
          background: 'var(--accent-emerald-glow)',
          border: '1px solid #bbf7d0',
          padding: 14,
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h4 style={{ margin: 0, color: 'var(--ok)', fontSize: '14px' }}>
              📊 Resumo Analítico de Custo de Entrada &amp; Tributos (NBC TG 16 / CPC 16 R1)
            </h4>
            <p className="hint" style={{ margin: '3px 0 0', color: 'var(--ok)', fontSize: '12px' }}>
              Custo de aquisição apurado segundo o Item 11 do CPC 16 (R1) e créditos admitidos no regime <b>{regime}</b>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn primary"
              style={{ background: '#15803d', borderColor: '#22c55e', color: '#ffffff', fontSize: '12.5px', padding: '6px 12px', fontWeight: 600, minHeight: '44px' }}
              onClick={() => setModalCusto?.({ aberto: true, modo: 'resumido' })}
              title="Visualizar a tabela de composição de custo de aquisição individualizado por produto"
            >
              📊 Custo Individualizado por Produto
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ background: '#166534', borderColor: 'var(--ok)', color: '#ffffff', fontSize: '12.5px', padding: '6px 12px', minHeight: '44px' }}
              onClick={() => handleEnviarParaPrecificacao?.(extractedInvoice.itens)}
              title="Transferir todos os itens da nota fiscal diretamente para a aba de Precificação"
            >
              💰 Enviar Todos para Precificação
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ background: '#1d4ed8', borderColor: 'var(--accent-blue)', color: '#ffffff', fontSize: '12.5px', padding: '6px 12px', minHeight: '44px' }}
              onClick={() => handleEnviarParaErp?.(extractedInvoice.itens, false)}
              title="Transferir todos os itens da nota fiscal diretamente para a aba de Parametrização ERP"
            >
              ⚙️ Enviar Todos para Parametrização ERP
            </button>
            {selectedIndices.size > 0 && selectedIndices.size < extractedInvoice.itens.length && (
              <>
                <button
                  type="button"
                  className="btn-secundario"
                  style={{ fontSize: '12.5px', padding: '6px 12px', minHeight: '44px' }}
                  onClick={() => {
                    const selecionados = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));
                    handleEnviarParaPrecificacao?.(selecionados);
                  }}
                  title="Transferir apenas os itens selecionados para a Precificação"
                >
                  💰 Enviar {selectedIndices.size} Itens Selecionados
                </button>
                <button
                  type="button"
                  className="btn-secundario"
                  style={{ fontSize: '12.5px', padding: '6px 12px', minHeight: '44px' }}
                  onClick={() => {
                    const selecionados = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));
                    handleEnviarParaErp?.(selecionados, false);
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
          className="tabular-nums"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 10,
            marginTop: 12,
            fontSize: '12.5px',
          }}
        >
          <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #dcfce7' }}>
            <span style={{ color: 'var(--ink-2)', fontSize: '11px', display: 'block' }}>Produtos (vProd):</span>
            <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
              {consolidadoCPC16.valorTotalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #dcfce7' }}>
            <span style={{ color: 'var(--ink-2)', fontSize: '11px', display: 'block' }}>Frete NF-e + Despesas:</span>
            <strong className="tabular-nums" style={{ fontSize: '13px', color: 'var(--ink)' }}>
              + {consolidadoCPC16.freteSeguroTotais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
            {notaAuditadaSessao && notaAuditadaSessao.totaisCpc16.freteCteFobTotal > 0 && (
              <span className="mono tabular-nums" style={{ display: 'block', fontSize: '10.5px', color: 'var(--accent-blue)', marginTop: 2 }}>
                + CT-e FOB: {notaAuditadaSessao.totaisCpc16.freteCteFobTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            )}
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #fee2e2' }}>
            <span style={{ color: 'var(--bad)', fontSize: '11px', display: 'block' }}>Tributos s/ Crédito (IPI/ST):</span>
            <strong style={{ fontSize: '13px', color: 'var(--bad)' }}>
              + {consolidadoCPC16.tributosNaoRecuperaveisTotais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #dbeafe' }}>
            <span style={{ color: 'var(--accent-blue)', fontSize: '11px', display: 'block' }}>Impostos a Recuperar:</span>
            <strong style={{ fontSize: '13px', color: 'var(--accent-blue)' }}>
              - {consolidadoCPC16.impostosRecuperaveisTotais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
          </div>

          <div style={{ background: 'var(--accent-emerald-glow)', padding: '8px 12px', borderRadius: 6, border: '1px solid #86efac' }}>
            <span style={{ color: 'var(--ok)', fontSize: '11px', display: 'block', fontWeight: 600 }}>Custo Real Líquido (CPC 16):</span>
            <strong className="tabular-nums" style={{ fontSize: '14px', color: 'var(--ok)' }}>
              {(notaAuditadaSessao?.totaisCpc16.cmvLiquidoTotal ?? consolidadoCPC16.custoTotalRealConsolidado).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </strong>
          </div>
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
            <strong>CT-e FOB (Modelo 57):</strong>{' '}
            {cteFobData ? (
              notaAuditadaSessao?.rateioCte?.aplicado ? (
                <span className="tabular-nums" style={{ color: 'var(--ok)', fontWeight: 600 }}>
                  ✓ CT-e nº {cteFobData.numero || 's/n'} aplicado ({formatarBrl(notaAuditadaSessao.rateioCte.somaRateadaFrete)} rateado · ICMS CT-e {formatarBrl(notaAuditadaSessao.rateioCte.somaRateadaIcms)})
                </span>
              ) : (
                <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
                  ⚠️ {notaAuditadaSessao?.rateioCte?.motivoBloqueio || 'CT-e bloqueado para rateio FOB'}
                </span>
              )
            ) : (
              <span>Nenhum CT-e FOB vinculado (anexe XML mod. 57 para incorporar frete FOB e crédito ICMS/PIS/COFINS do transporte).</span>
            )}
          </div>
          <label className="mini st-touch-target" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
            📎 {cteFobData ? 'Trocar CT-e FOB (.xml)' : '+ Anexar CT-e FOB (.xml)'}
            <input
              type="file"
              accept=".xml"
              style={{ display: 'none' }}
              onChange={(e) => void handleUploadCteFob?.(e.target.files?.[0] || null)}
            />
          </label>
        </div>
      </div>
    );
  }

  if (props.section === 'motor_ia' && props.extractedInvoice) {
    const {
      extractedInvoice,
      selectedIndices = new Set<number>(),
      motor = 'ollama',
      setMotor,
      modeloOllama = 'qwen2.5:7b',
      setModeloOllama,
      isAuditing = false,
      auditElapsedTime = 0,
      auditError,
      setAuditError,
      handleAuditSubmit,
    } = props;

    return (
      <>
        <div className="card" style={{ marginTop: 20, marginBottom: 20, background: 'var(--bg-card)' }}>
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
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 16,
                borderRadius: 12,
                cursor: isAuditing ? 'not-allowed' : 'pointer',
                border: motor === 'ollama' ? '2px solid var(--brand)' : '1px solid var(--line)',
                background: motor === 'ollama' ? 'var(--accent-blue-subtle)' : '#ffffff',
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
                    onChange={() => setMotor?.('ollama')}
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
                    onChange={(e) => setModeloOllama?.(e.target.value)}
                    disabled={isAuditing}
                    style={{ fontSize: '12px', padding: '6px 8px', borderRadius: 6, width: '100%', maxWidth: 280 }}
                  >
                    <option value="qwen2.5:7b">qwen2.5:7b (Perícia Tributária Profunda &amp; Arbitragem NCM)</option>
                    <option value="qwen3.5:4b">qwen3.5:4b (Triagem Rápida &amp; Alto Rendimento 16k)</option>
                    <option value="qwen2.5:7b-16k">qwen2.5:7b-16k (Contexto Estendido 16k)</option>
                  </select>
                </div>
              )}

              <div style={{ marginTop: 12, paddingLeft: 28, fontSize: '11px', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
                <span>Endpoint local 127.0.0.1:11434 pronto · Vulkan/DirectML ativo</span>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 16,
                borderRadius: 12,
                cursor: isAuditing ? 'not-allowed' : 'pointer',
                border: motor === 'gemini' ? '2px solid var(--brand)' : '1px solid var(--line)',
                background: motor === 'gemini' ? 'var(--accent-blue-subtle)' : '#ffffff',
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
                    onChange={() => setMotor?.('gemini')}
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

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleAuditSubmit}
              disabled={isAuditing || selectedIndices.size === 0}
              className="btn primary"
              style={{ fontWeight: 650, padding: '10px 20px', minHeight: '44px' }}
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
          <div className="note info" role="status" aria-live="polite" style={{ marginTop: 20 }}>
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
          <div className="note error" role="alert" style={{ marginTop: 20 }}>
            <div className="t">Erro na auditoria pericial</div>
            <div className="x">{auditError}</div>
            {motor === 'ollama' && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setMotor?.('gemini');
                    setAuditError?.(null);
                  }}
                  className="chip"
                  style={{ cursor: 'pointer', minHeight: '44px' }}
                >
                  Alternar para Google Gemini Cloud API
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // section === 'resultado_e_modal'
  const {
    auditResult,
    handleReturnToSelection,
    handleResetToUpload,
    handleDownloadReport,
    pdfLoading = false,
    pdfError,
    relatorioBloqueadoHardcoded,
    modalCusto,
    setModalCusto,
    consolidadoCPC16,
    regime,
    finalidade,
  } = props;

  return (
    <>
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
              <button type="button" onClick={handleReturnToSelection} className="mini" style={{ minHeight: '44px' }} title="Modificar seleção de itens ou motor">
                ← Voltar para Seleção de Itens
              </button>
              <button type="button" onClick={handleResetToUpload} className="mini" style={{ minHeight: '44px' }}>
                ↺ Nova Auditoria
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14, marginBottom: 16, background: 'var(--bg-card-subtle)', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Técnico do Documento</h4>
            <p className="small">{auditResult.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}</p>
          </div>

          <div className="card" style={{ marginBottom: 16, background: 'var(--bg-card-subtle)', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Breve de Conformidade e Créditos</h4>
            <p className="small">{auditResult.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}</p>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleDownloadReport?.('html')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: 'var(--brand)', color: 'white', minHeight: '44px' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório HTML'}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadReport?.('txt')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: '#34495e', color: 'white', minHeight: '44px' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório TXT'}
            </button>
          </div>

          {relatorioBloqueadoHardcoded && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1.5px solid #ef4444',
                color: '#fca5a5',
                fontSize: 12.5,
              }}
            >
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                ⛔ Laudo Oficial Bloqueado (HTTP 503 — RTC_HARDCODED_BLOQUEADO)
              </div>
              <div style={{ marginBottom: 10 }}>
                {relatorioBloqueadoHardcoded.mensagem}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 11, color: '#cbd5e1' }}>
                  Sincronize via <b>npm run rfb:refresh</b> ou gere um rascunho explícito abaixo:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadReport?.(relatorioBloqueadoHardcoded.format, {
                      permitirSimulacaoHardcoded: true,
                    })
                  }
                  disabled={pdfLoading}
                  className="btn-secundario"
                  style={{
                    minHeight: '44px',
                    padding: '6px 14px',
                    borderColor: '#f59e0b',
                    color: '#fcd34d',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ Gerar Rascunho Não Oficial (Hardcoded)
                </button>
              </div>
            </div>
          )}

          {pdfError && !relatorioBloqueadoHardcoded && (
            <div className="note error" role="alert" style={{ marginTop: 8 }}>
              {pdfError}
            </div>
          )}

          <ParametrizacaoERP data={auditResult} />
        </div>
      )}

      {modalCusto?.aberto && consolidadoCPC16 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Custo de Aquisição Individualizado por Produto — CPC 16 (R1)"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: 10,
              width: '100%',
              maxWidth: 1100,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-card-subtle)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#3A4A1E', fontSize: '1.15rem' }}>
                  📊 Custo de Aquisição Individualizado por Produto — CPC 16 (R1)
                </h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--ink-2)' }}>
                  Regime tributário: <b>{regime}</b> · Finalidade: <b>{finalidade}</b>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalCusto?.({ aberto: false, modo: 'resumido' })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: 'var(--ink-2)',
                  lineHeight: 1,
                  padding: '4px 8px',
                  minHeight: '44px',
                  minWidth: '44px',
                }}
                title="Fechar modal"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--bg-card)',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setModalCusto?.((prev) => ({ ...prev, modo: 'resumido' }))}
                  style={{
                    backgroundColor: modalCusto.modo === 'resumido' ? '#3A4A1E' : 'var(--bg-card-subtle)',
                    color: modalCusto.modo === 'resumido' ? '#ffffff' : '#334155',
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  📋 Visão Resumida (Somente Tabela de Custos)
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setModalCusto?.((prev) => ({ ...prev, modo: 'detalhado' }))}
                  style={{
                    backgroundColor: modalCusto.modo === 'detalhado' ? '#3A4A1E' : 'var(--bg-card-subtle)',
                    color: modalCusto.modo === 'detalhado' ? '#ffffff' : '#334155',
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  ⚖️ Visão Detalhada (com Citação Legal)
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="mini"
                  onClick={() => {
                    const html = gerarRelatorioCustosHtml(consolidadoCPC16, modalCusto.modo);
                    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `relatorio_custo_cpc16_${modalCusto.modo}.html`;
                    a.click();
                    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                  }}
                  style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', fontWeight: 600, padding: '6px 12px', minHeight: '44px' }}
                >
                  📥 Baixar HTML
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setModalCusto?.({ aberto: false, modo: 'resumido' })}
                  style={{ padding: '6px 12px', minHeight: '44px' }}
                >
                  Fechar
                </button>
              </div>
            </div>

            <div
              style={{
                padding: '16px 20px',
                overflowY: 'auto',
                flex: 1,
                backgroundColor: 'var(--bg-card-subtle)',
              }}
              dangerouslySetInnerHTML={{
                __html: gerarRelatorioCustosHtml(consolidadoCPC16, modalCusto.modo),
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
