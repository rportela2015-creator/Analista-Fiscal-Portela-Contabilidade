'use client';

import React from 'react';
import type {
  ItemDemonstrativoDifalPR,
  DemonstrativoConsolidadoDifalPR,
} from '@/lib/fiscal/difal-pr';
import { ItemDetailDrawer } from '@/components/ui';

function formatarBrl(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface AuditoriaDifalResumoCardProps {
  apuracaoDifalNota: {
    resumoDifalNota: any;
    itensDiagnostico: Record<string, any>;
  } | null;
  demonstrativoDifalPR: DemonstrativoConsolidadoDifalPR | null;
  expandirDemonstrativoDifal: boolean;
  setExpandirDemonstrativoDifal: React.Dispatch<React.SetStateAction<boolean>>;
  notasDifalSessao: DemonstrativoConsolidadoDifalPR[];
  somatorioConsolidadoNotas: {
    qtdNotas: number;
    totalBaseDifal: number;
    totalDifalPrincipal: number;
    totalFecop: number;
    totalDifalGeral: number;
    qtdItensTributados: number;
  };
  itemDifalSelecionado: ItemDemonstrativoDifalPR | null;
  setItemDifalSelecionado: (v: ItemDemonstrativoDifalPR | null) => void;
}

export default function AuditoriaDifalResumoCard({
  apuracaoDifalNota,
  demonstrativoDifalPR,
  expandirDemonstrativoDifal,
  setExpandirDemonstrativoDifal,
  notasDifalSessao,
  somatorioConsolidadoNotas,
  itemDifalSelecionado,
  setItemDifalSelecionado,
}: AuditoriaDifalResumoCardProps) {
  return (
    <div role="region" aria-live="polite" aria-label="Apuração de DIFAL, FECOP e Antecipação Tributária PR">
      {apuracaoDifalNota && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            padding: 14,
            borderRadius: 8,
            background: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
              ? 'var(--accent-amber-subtle)'
              : 'var(--accent-emerald-glow)',
            border: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
              ? '2px solid #ea580c'
              : '1px solid #86efac',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '18px' }}>
                {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '⚠️' : '✅'}
              </span>
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#9a3412' : '#166534',
                  }}
                >
                  {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                    ? 'APURAÇÃO DE DIFAL, FECOP & ANTECIPAÇÃO TRIBUTÁRIA (RICMS/PR)'
                    : 'DISPENSA DE DIFAL / ANTECIPAÇÃO NA ENTRADA (PR)'}
                </h4>
                <p
                  className="hint"
                  style={{
                    margin: '2px 0 0',
                    fontSize: '11.5px',
                    color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#c2410c' : '#15803d',
                  }}
                >
                  {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                    ? 'Foram identificadas obrigações estaduais e impacto no fluxo de caixa na entrada das mercadorias no Paraná.'
                    : 'Nenhuma mercadoria desta nota exige recolhimento de DIFAL ou Antecipação tributária estadual na entrada.'}
                </p>
              </div>
            </div>

            {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota && (
              <span
                className="badge mono"
                style={{ background: '#ea580c', color: '#ffffff', fontWeight: 700, fontSize: '12px' }}
              >
                Guia: {(apuracaoDifalNota.resumoDifalNota.guiasNecessarias || []).join(', ') || 'GR-PR'}
              </span>
            )}
          </div>

          <div
            className="tabular-nums"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              marginTop: 12,
            }}
          >
            <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7aa' }}>
              <span style={{ color: 'var(--warn)', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                1. DIFAL Base Dupla (Consumo/Ativo):
              </span>
              <strong style={{ fontSize: '14px', color: 'var(--warn)' }}>
                {(apuracaoDifalNota.resumoDifalNota.totalDebitoDifal || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7aa' }}>
              <span style={{ color: 'var(--warn)', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                2. FECOP 2% (Art. 14-A da Lei nº 11.580/1996 e Anexo XII do RICMS/PR):
              </span>
              <strong style={{ fontSize: '14px', color: 'var(--warn)' }}>
                {(apuracaoDifalNota.resumoDifalNota.totalDebitoFecop || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7aa' }}>
              <span style={{ color: 'var(--warn)', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                3. Antecipação Tributária (Simples):
              </span>
              <strong style={{ fontSize: '14px', color: 'var(--warn)' }}>
                {(apuracaoDifalNota.resumoDifalNota.totalAntecipacaoArt16 || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </strong>
            </div>

            <div
              style={{
                background: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                  ? 'var(--accent-amber-subtle)'
                  : 'var(--accent-emerald-glow)',
                padding: '8px 12px',
                borderRadius: 6,
                border: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                  ? '1.5px solid #f97316'
                  : '1px solid #86efac',
              }}
            >
              <span
                style={{
                  color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#7c2d12' : '#14532d',
                  fontSize: '11px',
                  display: 'block',
                  fontWeight: 700,
                }}
              >
                4. Total Débito Estadual / Caixa:
              </span>
              <strong
                style={{
                  fontSize: '15px',
                  color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#c2410c' : '#166534',
                }}
              >
                {(
                  apuracaoDifalNota.resumoDifalNota.totalGeralRecolher ??
                  apuracaoDifalNota.resumoDifalNota.totalDebitoDifal ??
                  0
                ).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </strong>
            </div>
          </div>

          {demonstrativoDifalPR && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 6,
                background: 'var(--bg-card)',
                border: demonstrativoDifalPR.exigeRecolhimento ? '1px solid #fed7aa' : '1px solid #bbf7d0',
                fontSize: '11.5px',
                color: demonstrativoDifalPR.exigeRecolhimento ? '#7c2d12' : '#166534',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                <div>
                  <strong>Prazo Legal / Vencimento:</strong>{' '}
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {demonstrativoDifalPR.prazoRecolhimento.dataVencimentoFormatada}
                  </span>{' '}
                  ({demonstrativoDifalPR.prazoRecolhimento.regraPrazo})
                </div>
                <div>
                  <strong>Guia / Código:</strong>{' '}
                  <span className="badge blue mono">{demonstrativoDifalPR.prazoRecolhimento.guia}</span>
                </div>
                {demonstrativoDifalPR.prazoRecolhimento.codigosEfd.length > 0 && (
                  <div>
                    <strong>Códigos EFD:</strong>{' '}
                    <span className="mono">{demonstrativoDifalPR.prazoRecolhimento.codigosEfd.join(' / ')}</span>
                  </div>
                )}
                <div>
                  <strong>Itens Tributados DIFAL:</strong>{' '}
                  <span className="mono tabular-nums">
                    {demonstrativoDifalPR.somatorio.qtdItensTributados} / {demonstrativoDifalPR.somatorio.qtdItensAnalisados}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandirDemonstrativoDifal((v) => !v)}
                aria-expanded={expandirDemonstrativoDifal}
                className="mini min-h-[44px]"
                style={{ minHeight: '44px', padding: '6px 12px', fontWeight: 600 }}
              >
                {expandirDemonstrativoDifal ? '▲ Ocultar Demonstrativo Produto a Produto' : '▼ Exibir Demonstrativo Produto a Produto'}
              </button>
            </div>
          )}

          {notasDifalSessao.length > 1 && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 6,
                background: 'var(--accent-blue-subtle)',
                border: '1px solid #bfdbfe',
                fontSize: '12px',
                color: 'var(--accent-blue)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <strong>📚 Somatório Consolidado da Sessão ({somatorioConsolidadoNotas.qtdNotas} notas):</strong>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} className="tabular-nums">
                <span>Base Dupla Total: <b>{formatarBrl(somatorioConsolidadoNotas.totalBaseDifal)}</b></span>
                <span>DIFAL Principal: <b>{formatarBrl(somatorioConsolidadoNotas.totalDifalPrincipal)}</b></span>
                <span>FECOP: <b>{formatarBrl(somatorioConsolidadoNotas.totalFecop)}</b></span>
                <span>DIFAL Geral: <b>{formatarBrl(somatorioConsolidadoNotas.totalDifalGeral)}</b></span>
                <span>Itens Tributados: <b>{somatorioConsolidadoNotas.qtdItensTributados}</b></span>
              </div>
            </div>
          )}

          {demonstrativoDifalPR && expandirDemonstrativoDifal && (
            <div style={{ marginTop: 12, overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card-subtle)', borderBottom: '1px solid #cbd5e1', color: 'var(--ink)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Cód.</th>
                    <th style={{ padding: '8px' }}>Produto</th>
                    <th style={{ padding: '8px' }}>NCM</th>
                    <th style={{ padding: '8px' }}>CFOP</th>
                    <th style={{ padding: '8px' }}>Destinação</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Vlr. Oper.</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Alíq. Inter</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Intra PR / FECOP</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Base Dupla</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>DIFAL Princ.</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>FECOP</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Total DIFAL</th>
                    <th style={{ padding: '8px' }}>Status</th>
                    <th style={{ padding: '8px' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {demonstrativoDifalPR.itens.map((it) => (
                    <tr key={`${it.nItem}-${it.cProd}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="mono" style={{ padding: '6px 8px' }}>{it.cProd}</td>
                      <td style={{ padding: '6px 8px', maxWidth: 200 }}>{it.xProd}</td>
                      <td className="mono" style={{ padding: '6px 8px' }}>{it.NCM}</td>
                      <td className="mono" style={{ padding: '6px 8px' }}>{it.CFOP || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{it.destinacao}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }} className="tabular-nums">{formatarBrl(it.vOperacao)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }} className="tabular-nums">{it.aliqInter.toFixed(1)}%</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }} className="tabular-nums">
                        {it.aliqIntraPR.toFixed(1)}% / {it.fecop.toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }} className="tabular-nums">{formatarBrl(it.baseDupla)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }} className="tabular-nums">{formatarBrl(it.valorDifalPrincipal)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }} className="tabular-nums">{formatarBrl(it.valorFecop)}</td>
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: it.exigeRecolhimento ? '#c2410c' : '#475569',
                        }}
                        className="tabular-nums"
                      >
                        {formatarBrl(it.valorDifalTotal)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span className={`badge ${it.exigeRecolhimento ? 'amber' : 'green'}`} style={{ fontSize: '10px' }}>
                          {it.exigeRecolhimento ? 'Tributado' : 'Dispensado'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <button
                          type="button"
                          onClick={() => setItemDifalSelecionado(it)}
                          className="mini min-h-[44px]"
                          style={{ minHeight: '44px', padding: '4px 10px', fontSize: '11px' }}
                        >
                          Inspecionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--accent-amber-subtle)', borderTop: '2px solid #fdba74', fontWeight: 700, color: 'var(--warn)' }}>
                    <td colSpan={8} style={{ padding: '8px' }}>
                      SOMATÓRIO CONSOLIDADO ({demonstrativoDifalPR.somatorio.qtdItensTributados} de {demonstrativoDifalPR.somatorio.qtdItensAnalisados} itens tributados)
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }} className="tabular-nums">
                      {formatarBrl(demonstrativoDifalPR.somatorio.totalBaseDifal)}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }} className="tabular-nums">
                      {formatarBrl(demonstrativoDifalPR.somatorio.totalDifalPrincipal)}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }} className="tabular-nums">
                      {formatarBrl(demonstrativoDifalPR.somatorio.totalFecop)}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }} className="tabular-nums">
                      {formatarBrl(demonstrativoDifalPR.somatorio.totalDifalGeral)}
                    </td>
                    <td colSpan={2} style={{ padding: '8px' }}>
                      {demonstrativoDifalPR.prazoRecolhimento.guia}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {apuracaoDifalNota.resumoDifalNota.alertasConsolidados && apuracaoDifalNota.resumoDifalNota.alertasConsolidados.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {apuracaoDifalNota.resumoDifalNota.alertasConsolidados.map((alerta: string, idx: number) => (
                <div
                  key={idx}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: '11.5px',
                    background: alerta.includes('revogação') || alerta.includes('indevido') ? 'var(--accent-crimson-subtle)' : 'var(--accent-amber-subtle)',
                    border: alerta.includes('revogação') || alerta.includes('indevido') ? '1px solid #fca5a5' : '1px solid #fde68a',
                    color: alerta.includes('revogação') || alerta.includes('indevido') ? '#991b1b' : '#92400e',
                  }}
                >
                  {alerta}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ItemDetailDrawer
        isOpen={Boolean(itemDifalSelecionado)}
        onClose={() => setItemDifalSelecionado(null)}
        title={itemDifalSelecionado ? `DIFAL Item #${itemDifalSelecionado.nItem} — ${itemDifalSelecionado.cProd}` : 'Detalhes DIFAL'}
        subtitle={itemDifalSelecionado ? `${itemDifalSelecionado.xProd} · NCM ${itemDifalSelecionado.NCM}` : undefined}
      >
        {itemDifalSelecionado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--bg-card-subtle)', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div><b>CFOP:</b> <span className="mono">{itemDifalSelecionado.CFOP || '—'}</span></div>
                <div><b>Destinação:</b> {itemDifalSelecionado.destinacao}</div>
                <div><b>Valor Operação:</b> <span className="tabular-nums">{formatarBrl(itemDifalSelecionado.vOperacao)}</span></div>
                <div><b>Base Dupla PR:</b> <span className="tabular-nums">{formatarBrl(itemDifalSelecionado.baseDupla)}</span></div>
                <div><b>DIFAL Principal:</b> <span className="tabular-nums">{formatarBrl(itemDifalSelecionado.valorDifalPrincipal)}</span></div>
                <div><b>FECOP ({itemDifalSelecionado.fecop}%):</b> <span className="tabular-nums">{formatarBrl(itemDifalSelecionado.valorFecop)}</span></div>
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
                <b>Total DIFAL a Recolher:</b>{' '}
                <span className="tabular-nums" style={{ fontWeight: 800, color: itemDifalSelecionado.exigeRecolhimento ? '#c2410c' : '#15803d' }}>
                  {formatarBrl(itemDifalSelecionado.valorDifalTotal)}
                </span>
              </div>
            </div>

            <div>
              <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Fundamentação Legal:</strong>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>{itemDifalSelecionado.fundamento}</p>
              {itemDifalSelecionado.motivoDispensa && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>
                  Motivo da Dispensa: {itemDifalSelecionado.motivoDispensa}
                </p>
              )}
            </div>

            {itemDifalSelecionado.codigosEfd.length > 0 && (
              <div>
                <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Códigos EFD ICMS/IPI (NPF 052/2018):</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {itemDifalSelecionado.codigosEfd.map((cod) => (
                    <span key={cod} className="badge blue mono" style={{ fontSize: 11 }}>{cod}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Memória de Cálculo:</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                {itemDifalSelecionado.memoriaCalculo.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </ItemDetailDrawer>
    </div>
  );
}
