'use client';

import React from 'react';
import type { RegimeTributario } from '@/lib/marco-legal';
import type { ComparativoRegimesResultado, ResultadoDetalhado } from '@/lib/precificacao';

export interface PrecificarSplitPaymentCardProps {
  section: 'blocoB' | 'blocoC_e_Regimes';
  regime: RegimeTributario;
  tipoEstabelecimento: 'comercio' | 'industria';
  resultado: ResultadoDetalhado | null;
  erroCalculo: string | null;
  decompPreco: any;
  compCusto: any;
  comparativo: ComparativoRegimesResultado | null;
  custosFixosTotais: number;
  setCustosFixosTotais: (v: number) => void;
}

export default function PrecificarSplitPaymentCard({
  section,
  regime,
  tipoEstabelecimento,
  resultado,
  erroCalculo,
  decompPreco,
  compCusto,
  comparativo,
  custosFixosTotais,
  setCustosFixosTotais,
}: PrecificarSplitPaymentCardProps) {
  if (section === 'blocoB') {
    if (erroCalculo) {
      return (
        <div className="card note critico">
          <b>Falha no Cálculo:</b> {erroCalculo}
        </div>
      );
    }
    if (!resultado) return null;

    return (
      <div className="card" style={{ background: 'var(--accent-emerald-glow)', border: '1.5px solid #bbf7d0', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--ok)' }}>
          Bloco B — Formação de Preço e Demonstração de Resultados
        </h3>

        <div className="tabular-nums" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>Preço Venda Líquido (vProdLiq):</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ink)' }}>
              R$ {resultado.preco.vProdLiq.toFixed(2)}
            </div>
          </div>

          <div style={{ background: 'var(--accent-emerald-glow)', border: '2px solid #16a34a', padding: 12, borderRadius: 6 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ok)' }}>Preço de Venda Final na Nota (vNF):</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--ok)' }}>
              R$ {resultado.preco.precoFinal.toFixed(2)}
            </div>
          </div>
        </div>

        {decompPreco && (
          <div style={{ marginBottom: 18, background: 'var(--bg-card)', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                Decomposição Visual do Preço de Venda (100% vNF)
              </span>
              <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
                Total Nota: R$ {resultado.preco.precoFinal.toFixed(2)}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                height: 32,
                width: '100%',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                background: 'var(--bg-card-subtle)',
              }}
              role="img"
              aria-label="Gráfico de barras da composição do preço de venda"
            >
              {[decompPreco.custo, decompPreco.dv, decompPreco.tribDentro, decompPreco.irpj, decompPreco.ivaDual, decompPreco.margemLiq].map((fatia, i) =>
                fatia.pct > 0 ? (
                  <div
                    key={i}
                    style={{ width: `${fatia.pct}%`, background: fatia.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                    title={`${fatia.label}: R$ ${fatia.valor.toFixed(2)} (${fatia.pct}%)`}
                  >
                    {fatia.pct >= (i === 0 ? 10 : 7) ? `${fatia.pct}%` : ''}
                  </div>
                ) : null
              )}
            </div>

            <div className="tabular-nums" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, fontSize: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: decompPreco.custo.cor, borderRadius: 2 }} />
                <span>Custo Real: <b>R$ {decompPreco.custo.valor.toFixed(2)}</b> ({decompPreco.custo.pct}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: decompPreco.dv.cor, borderRadius: 2 }} />
                <span>Desp. Var.: <b>R$ {decompPreco.dv.valor.toFixed(2)}</b> ({decompPreco.dv.pct}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: decompPreco.tribDentro.cor, borderRadius: 2 }} />
                <span>Tributos Dentro: <b>R$ {decompPreco.tribDentro.valor.toFixed(2)}</b> ({decompPreco.tribDentro.pct}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: decompPreco.irpj.cor, borderRadius: 2 }} />
                <span>IRPJ/CSLL: <b>R$ {decompPreco.irpj.valor.toFixed(2)}</b> ({decompPreco.irpj.pct}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: decompPreco.ivaDual.cor, borderRadius: 2 }} />
                <span>IVA Dual (Split): <b>R$ {decompPreco.ivaDual.valor.toFixed(2)}</b> ({decompPreco.ivaDual.pct}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: decompPreco.margemLiq.cor, borderRadius: 2 }} />
                <span style={{ color: '#16a34a', fontWeight: 700 }}>Margem Líq.: <b>R$ {decompPreco.margemLiq.valor.toFixed(2)}</b> ({decompPreco.margemLiq.pct}%)</span>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 6,
            border: '1px solid rgba(16, 185, 129, 0.4)',
            background: 'var(--bg-surface-subtle)',
            fontSize: '0.82rem',
          }}
          className="tabular-nums"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ color: '#10b981' }}>🏦 Split Payment Bancário (LC 214/2025)</strong>
            <span className="badge alta" style={{ fontSize: 10.5 }}>
              Retenção Fisco: R$ {resultado.apuracaoCaixa.retencaoSplitIva.toFixed(2)}
            </span>
          </div>
          <div style={{ marginTop: 4, color: 'var(--ink-2)' }}>
            Liquidação líquida em conta da empresa: <b>R$ {(resultado.preco.precoFinal - resultado.apuracaoCaixa.retencaoSplitIva).toFixed(2)}</b> · Crédito B2B transferível: <b>R$ {(resultado.relatorioMargens?.creditoTransferidoClienteB2B ?? 0).toFixed(2)}</b>
          </div>
        </div>

        <table className="tabular-nums" style={{ width: '100%', fontSize: '0.85rem' }}>
          <tbody>
            <tr>
              <td>Tributos de Saída por Dentro (ICMS / DAS):</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                R$ {(resultado.relatorioMargens?.tributosVendaPorDentro ?? resultado.preco.vICMS).toFixed(2)}
              </td>
            </tr>
            <tr>
              <td>IVA Dual por Fora (CBS: R$ {resultado.preco.vCBS.toFixed(2)} + IBS: R$ {resultado.preco.vIBS.toFixed(2)}):</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                R$ {(resultado.preco.vCBS + resultado.preco.vIBS).toFixed(2)}
              </td>
            </tr>
            <tr>
              <td>Split Payment Retido (Bancos):</td>
              <td style={{ textAlign: 'right', color: 'var(--bad)', fontWeight: 600 }}>
                R$ {resultado.apuracaoCaixa.retencaoSplitIva.toFixed(2)}
              </td>
            </tr>
            <tr style={{ background: 'var(--accent-emerald-glow)' }}>
              <td>Crédito Transferido para Cliente B2B:</td>
              <td style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: 700 }}>
                R$ {(resultado.relatorioMargens?.creditoTransferidoClienteB2B ?? 0).toFixed(2)}
              </td>
            </tr>
            <tr>
              <td>Margem de Contribuição Unitária:</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                R$ {(resultado.relatorioMargens?.margemContribuicaoUnitaria ?? resultado.resultado.margemContribuicaoUnit).toFixed(2)} ({resultado.resultado.indiceMcPct.toFixed(1)}%)
              </td>
            </tr>
            <tr>
              <td>Provisão de IRPJ e CSLL ({regime}):</td>
              <td style={{ textAlign: 'right', color: 'var(--bad)' }}>
                R$ {resultado.resultado.irpjCsll.toFixed(2)}
              </td>
            </tr>
            <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 700, background: 'var(--accent-emerald-glow)' }}>
              <td>Margem Líquida Real Realizada:</td>
              <td style={{ textAlign: 'right', color: '#16a34a', fontSize: '1rem' }}>
                R$ {resultado.resultado.lucroLiquido.toFixed(2)} ({resultado.resultado.margemRealizadaPct.toFixed(1)}%)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {resultado && (
        <div className="card tabular-nums" style={{ marginTop: 20, marginBottom: 24, padding: 16, background: 'var(--bg-card-subtle)', border: '1.5px solid #cbd5e1' }}>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: '1.1rem' }}>
              📌 Bloco C — Resumo Executivo Gerencial
            </h3>
            <p className="hint" style={{ margin: '3px 0 0' }}>
              Tríade decisória contábil-comercial: Custo Efetivo de Entrada, Retorno Líquido Real e Preço Final ao Consumidor / Destinatário.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--accent-crimson-subtle)', border: '2px solid #f43f5e', borderRadius: 8, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--bad)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Custo Efetivo de Entrada Unitário
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--bad)', lineHeight: 1.2 }}>
                R$ {compCusto.custoUnitarioReal.toFixed(2)}
              </div>
              <div style={{ fontSize: '11px', color: '#e11d48', marginTop: 4, fontWeight: 600 }}>
                Líquido de Tributos Recuperáveis (CPC 16)
              </div>
            </div>

            <div style={{ background: 'var(--accent-emerald-glow)', border: '2px solid #22c55e', borderRadius: 8, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ok)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Margem Líquida Realizada (%)
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--ok)', lineHeight: 1.2 }}>
                {resultado.resultado.margemRealizadaPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: '11px', color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
                R$ {resultado.resultado.lucroLiquido.toFixed(2)} por unidade vendida
              </div>
            </div>

            <div style={{ background: 'var(--accent-blue-subtle)', border: '2px solid #3b82f6', borderRadius: 8, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Preço de Venda Sugerido (vNF)
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent-blue)', lineHeight: 1.2 }}>
                R$ {resultado.preco.precoFinal.toFixed(2)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent-blue)', marginTop: 4, fontWeight: 600 }}>
                vProd Líquido: R$ {resultado.preco.vProdLiq.toFixed(2)} + Tributos
              </div>
            </div>
          </div>
        </div>
      )}

      {resultado?.relatorioMargens && (
        <div className="card tabular-nums" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>📊 Governança Contábil, Ponto de Equilíbrio &amp; Arbitramento (CPC 16 / RIR 2018)</h3>
              <p className="hint" style={{ margin: '3px 0 0' }}>
                Auditoria de integridade patrimonial, teste de impairment de estoques e limites fiscais de custeio.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="custos-fixos-input" style={{ fontSize: '12px', fontWeight: 600 }}>Custos Fixos do Período (R$):</label>
              <input
                id="custos-fixos-input"
                type="number"
                step="500"
                value={custosFixosTotais}
                onChange={(e) => setCustosFixosTotais(Number(e.target.value))}
                style={{ width: 120, padding: '4px 8px' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ background: 'var(--bg-card-subtle)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 6 }}>
                1. Teste de Valor Realizável Líquido (CPC 16)
              </div>
              <div style={{ fontSize: '13px', marginBottom: 4 }}>
                Custo Real Unitário: <b>R$ {compCusto.custoUnitarioReal.toFixed(2)}</b>
              </div>
              <div style={{ fontSize: '13px', marginBottom: 8 }}>
                VRL (Preço - Desp. Venda): <b>R$ {(resultado.relatorioMargens.analiseVrlEArbitramento?.valorRealizavelLiquido ?? 0).toFixed(2)}</b>
              </div>
              {resultado.relatorioMargens.analiseVrlEArbitramento?.requerProvisaoImpairment ? (
                <div style={{ background: 'var(--accent-crimson-subtle)', border: '1px solid #fecaca', padding: '6px 8px', borderRadius: 4, color: 'var(--bad)', fontSize: '12px', fontWeight: 700 }}>
                  ⚠️ ALERTA IMPAIRMENT: Provisão de R$ {(resultado.relatorioMargens.analiseVrlEArbitramento?.valorProvisaoUnitaria ?? 0).toFixed(2)}/un exigida por lei (Art. 183 Lei 6.404/76)!
                </div>
              ) : (
                <div style={{ background: 'var(--accent-emerald-glow)', border: '1px solid #bbf7d0', padding: '6px 8px', borderRadius: 4, color: 'var(--ok)', fontSize: '12px', fontWeight: 700 }}>
                  ✅ Em Conformidade: VRL supera o custo contábil. Dispensa provisão para perdas.
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bg-card-subtle)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 6 }}>
                2. Ponto de Equilíbrio Contábil (PEC)
              </div>
              <div style={{ fontSize: '13px', marginBottom: 4 }}>
                Margem Contribuição Unitária: <b>R$ {(resultado.relatorioMargens.margemContribuicaoUnitaria ?? 0).toFixed(2)}</b> ({resultado.resultado.indiceMcPct.toFixed(1)}%)
              </div>
              <div style={{ fontSize: '13px', marginBottom: 4 }}>
                PEC em Volume: <b>{(resultado.relatorioMargens.pontoEquilibrioContabil?.pecVolume ?? 0).toFixed(0)} un</b>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--accent-blue)', fontWeight: 700 }}>
                PEC em Faturamento: R$ {(resultado.relatorioMargens.pontoEquilibrioContabil?.pecValor ?? 0).toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-card-subtle)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 6 }}>
                3. Limite Arbitramento Fiscal (Art. 309 RIR)
              </div>
              <div style={{ fontSize: '13px', marginBottom: 4 }}>
                Custo Arbitrado Fiscal: <b>R$ {(resultado.relatorioMargens.analiseVrlEArbitramento?.custoArbitradoRir2018 ?? 0).toFixed(2)}</b>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginBottom: 6 }}>
                Referência: {tipoEstabelecimento === 'industria' ? '80% (Indústria)' : '70% (Comércio)'} sobre o preço de venda.
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
                Parâmetro de glosa fiscal da RFB caso os registros de inventário sejam desclassificados.
              </div>
            </div>
          </div>
        </div>
      )}

      {comparativo && (
        <div className="card tabular-nums" style={{ marginTop: 24 }}>
          <h3>Bloco C — Comparativo Estratégico nos 4 Regimes Tributários</h3>
          <p className="hint">
            Demonstração de custo real, preço final, margem líquida e atratividade competitiva para vendas B2B.
          </p>

          <table className="tabela-comparativa" style={{ width: '100%', marginTop: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
                <th>Regime Tributário</th>
                <th>Custo Aquisição Real</th>
                <th>Preço Final (vNF)</th>
                <th>Crédito Gerado p/ Cliente B2B</th>
                <th>Custo Efetivo p/ Cliente B2B</th>
                <th>Margem Líquida (R$)</th>
                <th>Margem Líquida (%)</th>
              </tr>
            </thead>
            <tbody>
              {(['simples', 'simples_hibrido', 'presumido', 'real'] as RegimeTributario[]).map((reg) => {
                const info = comparativo.regimes[reg];
                const isSelected = reg === regime;
                const isMelhorMargem = comparativo.melhorMargemLiquida.regime === reg;
                const isMelhorB2B = comparativo.melhorCompetitividadeB2B.regime === reg;
                const custoEfetivoB2B = info.precoVendaFinalNota - info.creditoTransferidoClienteB2B;

                return (
                  <tr
                    key={reg}
                    style={{
                      background: isSelected ? 'var(--accent-blue-subtle)' : 'transparent',
                      fontWeight: isSelected ? 600 : 'normal',
                    }}
                  >
                    <td>
                      {reg === 'simples' && 'Simples Nacional'}
                      {reg === 'simples_hibrido' && 'Simples Híbrido'}
                      {reg === 'presumido' && 'Lucro Presumido'}
                      {reg === 'real' && 'Lucro Real'}
                      {isMelhorMargem && <span className="badge green" style={{ marginLeft: 6 }}>🏆 Maior Margem</span>}
                      {isMelhorB2B && <span className="badge blue" style={{ marginLeft: 6 }}>💼 Melhor B2B</span>}
                    </td>
                    <td>R$ {info.custoAquisicaoReal.toFixed(2)}</td>
                    <td>R$ {info.precoVendaFinalNota.toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>R$ {info.creditoTransferidoClienteB2B.toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>R$ {custoEfetivoB2B.toFixed(2)}</td>
                    <td>R$ {info.margemLiquidaValor.toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{info.margemLiquidaPct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
