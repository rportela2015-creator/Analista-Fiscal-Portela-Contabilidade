'use client';

import React from 'react';
import type { RegimeTributario } from '@/lib/marco-legal';

export interface PrecificarDualStack2027CardProps {
  ano: number;
  regime: RegimeTributario;
  isSenior: boolean;
  hibridoComprasCreditoPct: number;
  setHibridoComprasCreditoPct: (v: number) => void;
  hibridoMixB2bPct: number;
  setHibridoMixB2bPct: (v: number) => void;
  analiseSimplesHibrido: any;
  incluirIbsCbsBcIcms: boolean;
  setIncluirIbsCbsBcIcms: (v: boolean) => void;
  simulacaoDualStack: any;
  expandirMesaCompras: boolean;
  setExpandirMesaCompras: (v: boolean) => void;
  taxaCapGiroMesa: number;
  setTaxaCapGiroMesa: (v: number) => void;
  prazoEstoqueMesa: number;
  setPrazoEstoqueMesa: (v: number) => void;
  resultadoMesaCompras: any;
}

export default function PrecificarDualStack2027Card({
  ano,
  regime,
  isSenior,
  hibridoComprasCreditoPct,
  setHibridoComprasCreditoPct,
  hibridoMixB2bPct,
  setHibridoMixB2bPct,
  analiseSimplesHibrido,
  incluirIbsCbsBcIcms,
  setIncluirIbsCbsBcIcms,
  simulacaoDualStack,
  expandirMesaCompras,
  setExpandirMesaCompras,
  taxaCapGiroMesa,
  setTaxaCapGiroMesa,
  prazoEstoqueMesa,
  setPrazoEstoqueMesa,
  resultadoMesaCompras,
}: PrecificarDualStack2027CardProps) {
  return (
    <>
      <div className="card tabular-nums" style={{ marginTop: 8, background: 'var(--bg-card-subtle)', border: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>
              ⚖️ Análise Estratégica: Simples Tradicional (DAS) vs. Simples Híbrido (IBS/CBS Por Fora — LC 214/25 &amp; Res. CGSN 186/26)
            </h3>
            <p className="hint" style={{ margin: '3px 0 0' }}>
              Simulador do Ponto de Inflexão (Break-Even) e competitividade de créditos B2B na transição tributária.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="hibrido-compras-cred" style={{ fontSize: '12px', fontWeight: 600 }}>% Compras c/ Crédito:</label>
              <input id="hibrido-compras-cred" type="number" min="0" max="100" step="5" value={hibridoComprasCreditoPct} onChange={(e) => setHibridoComprasCreditoPct(Number(e.target.value))} style={{ width: 68, padding: '3px 6px', fontSize: '12px' }} />
              <span style={{ fontSize: '12px' }}>%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="hibrido-mix-b2b" style={{ fontSize: '12px', fontWeight: 600 }}>% Mix Vendas B2B:</label>
              <input id="hibrido-mix-b2b" type="number" min="0" max="100" step="5" value={hibridoMixB2bPct} onChange={(e) => setHibridoMixB2bPct(Number(e.target.value))} style={{ width: 68, padding: '3px 6px', fontSize: '12px' }} />
              <span style={{ fontSize: '12px' }}>%</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
          <div style={{ background: 'var(--bg-card)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 6 }}>
              1. Decomposição do DAS ({ano})
            </div>
            <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>DAS Tradicional Efetivo:</span>
                <strong>{analiseSimplesHibrido.aliquotaDasOriginalPct.toFixed(2)}% (R$ {analiseSimplesHibrido.valorDasSemExpurgo.toFixed(2)})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--bad)' }}>
                <span>Expurgo PIS/COFINS e ICMS:</span>
                <strong>-{analiseSimplesHibrido.fatorExpurgoDasPct}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ok)' }}>
                <span>DAS Híbrido Reduzido:</span>
                <strong>{analiseSimplesHibrido.aliquotaDasAjustadaPct.toFixed(2)}% (R$ {analiseSimplesHibrido.valorDasComExpurgo.toFixed(2)})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--accent-emerald-glow)', padding: '4px 6px', borderRadius: 4 }}>
                <span style={{ fontWeight: 600 }}>Economia Bruta no DAS:</span>
                <strong style={{ color: 'var(--ok)' }}>R$ {analiseSimplesHibrido.economiaDas.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>Saldo IBS/CBS a Pagar (Déb - Créd):</span>
                <strong>R$ {analiseSimplesHibrido.saldoIbsCbsAPagar.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 4, fontWeight: 700 }}>
                <span>Carga Tributária Total Híbrido:</span>
                <span style={{ color: 'var(--accent-blue)' }}>R$ {analiseSimplesHibrido.cargaTributariaTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 6 }}>
              2. Vantagem Comercial B2B (Créditos Transferidos)
            </div>
            <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Crédito no Simples Tradicional:</span>
                <div style={{ fontWeight: 700, color: 'var(--warn)' }}>
                  {analiseSimplesHibrido.creditoB2bTradicionalPct.toFixed(2)}% (Restrito - Art. 58 §4º Res. CGSN 186)
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Crédito no Simples Híbrido:</span>
                <div style={{ fontWeight: 700, color: 'var(--ok)' }}>
                  {analiseSimplesHibrido.creditoB2bHibridoPct.toFixed(2)}% (Crédito Integral B2B na Nota)
                </div>
              </div>
              <div style={{ background: 'var(--accent-blue-subtle)', padding: '6px 8px', borderRadius: 4, marginTop: 4 }}>
                <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Ganho Efetivo de Competitividade:</span>
                <div style={{ fontWeight: 800, color: 'var(--accent-blue)', fontSize: '14px' }}>
                  +{analiseSimplesHibrido.ganhoCompetitividadeB2bPct.toFixed(2)}% (R$ {analiseSimplesHibrido.ganhoCompetitividadeB2bValor.toFixed(2)}/mês)
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 6 }}>
              3. Ponto de Inflexão &amp; Veredito Executivo
            </div>
            <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Compras c/ Crédito p/ Empate (Break-Even):</span>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#7c3aed' }}>
                  {analiseSimplesHibrido.pontoInflexao.creditoMinimoEntradaParaEmpatePct.toFixed(1)}% da Receita Bruta
                </div>
              </div>
              <div>
                {analiseSimplesHibrido.pontoInflexao.regimeVencedor === 'simples_hibrido' ? (
                  <span className="badge green" style={{ fontSize: '12px', padding: '4px 10px', fontWeight: 700 }}>
                    🏆 Recomendado: Simples Híbrido
                  </span>
                ) : (
                  <span className="badge blue" style={{ fontSize: '12px', padding: '4px 10px', fontWeight: 700 }}>
                    🛡️ Recomendado: Simples Tradicional
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-2)', lineHeight: 1.4, background: 'var(--bg-card-subtle)', padding: '6px 8px', borderRadius: 4, border: '1px solid #f1f5f9' }}>
                {analiseSimplesHibrido.pontoInflexao.justificativa}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--ink-2)', marginTop: 2 }}>
                ⚖️ <b>Aviso Normativo:</b> A opção pelo recolhimento de IBS/CBS fora do Simples é irretratável para todo o ano-calendário e deve ser manifestada entre setembro e novembro do ano anterior (LC 214/2025).
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card tabular-nums" style={{ marginTop: 24, background: 'var(--bg-card)', border: '1.5px solid #0284c7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>
                ⚡ Simulador Dual-Stack 2027: Consulta SEFA/PR nº 48/2026 vs. Tese Judicial
              </h3>
              <span className="badge blue" style={{ fontSize: '11px' }}>Transição 2026–2027</span>
            </div>
            <p className="hint" style={{ margin: '3px 0 0' }}>
              Projeção de impacto no preço final da inclusão do IBS/CBS na Base de Cálculo do ICMS (Grossing-up por dentro).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-blue-subtle)', padding: '6px 12px', borderRadius: 6, border: '1px solid #bae6fd' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-blue)' }}>Posicionamento Jurídico:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
              <input type="checkbox" checked={incluirIbsCbsBcIcms} onChange={(e) => setIncluirIbsCbsBcIcms(e.target.checked)} />
              {incluirIbsCbsBcIcms ? '📜 Aplicar Consulta SEFA/PR nº 48/2026' : '⚖️ Tese Judicial (Excluir da BC)'}
            </label>
          </div>
        </div>

        {regime === 'simples' && (
          <div style={{ background: 'var(--accent-amber-subtle)', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: '12px', color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span>
            <div>
              <strong>Janela Normativa do Simples Nacional Híbrido 2027 (Resoluções CGSN nº 186/2026 e 194/2026):</strong>{' '}
              A opção pelo regime híbrido (IBS/CBS no regime regular e DAS sem esses tributos) tem prazo irretratável de manifestação até 20/12/2026 no portal do Simples Nacional.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
          <div style={{
            background: incluirIbsCbsBcIcms ? 'var(--accent-emerald-glow)' : 'var(--bg-card-subtle)',
            border: incluirIbsCbsBcIcms ? '2px solid #22c55e' : '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ok)' }}>
                Modo 1: Administrativo SEFA/PR
              </span>
              {incluirIbsCbsBcIcms && <span className="badge green">Ativo</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginBottom: 8 }}>
              Consulta SEFA/PR nº 48/2026 (IBS e CBS compõem a BC do ICMS)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Base de Cálculo ICMS:</span>
                <strong>R$ {simulacaoDualStack.baseIcmsModo1.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ICMS Efetivo:</span>
                <strong style={{ color: 'var(--bad)' }}>R$ {simulacaoDualStack.valorIcmsModo1.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>IBS + CBS (por fora):</span>
                <strong>R$ {(simulacaoDualStack.modoSefa.valorIbs + simulacaoDualStack.modoSefa.valorCbs).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #bbf7d0', paddingTop: 6, marginTop: 4, fontWeight: 800 }}>
                <span>Preço Final Consumidor:</span>
                <strong style={{ fontSize: '15px', color: 'var(--ok)' }}>R$ {simulacaoDualStack.precoFinalModo1.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div style={{
            background: !incluirIbsCbsBcIcms ? 'var(--accent-emerald-glow)' : 'var(--bg-card-subtle)',
            border: !incluirIbsCbsBcIcms ? '2px solid #22c55e' : '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
                Modo 2: Tese Judicial (Tema 69 STF)
              </span>
              {!incluirIbsCbsBcIcms && <span className="badge green">Ativo</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginBottom: 8 }}>
              Exclusão do IBS e CBS da Base de Cálculo do ICMS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Base de Cálculo ICMS:</span>
                <strong>R$ {simulacaoDualStack.baseIcmsModo2.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ICMS Efetivo:</span>
                <strong style={{ color: 'var(--accent-blue)' }}>R$ {simulacaoDualStack.valorIcmsModo2.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>IBS + CBS (por fora):</span>
                <strong>R$ {(simulacaoDualStack.modoTese.valorIbs + simulacaoDualStack.modoTese.valorCbs).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #bfdbfe', paddingTop: 6, marginTop: 4, fontWeight: 800 }}>
                <span>Preço Final Consumidor:</span>
                <strong style={{ fontSize: '15px', color: 'var(--accent-blue)' }}>R$ {simulacaoDualStack.precoFinalModo2.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--accent-crimson-subtle)', border: '1.5px solid #fecdd3', borderRadius: 8, padding: 14 }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--bad)' }}>
              📊 Choque Comercial &amp; Efeito Cascata
            </span>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Efeito Cascata (ICMS s/ IBS-CBS):</span>
                <strong style={{ color: 'var(--bad)' }}>+ R$ {simulacaoDualStack.efeitoCascataReais.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Aumento Efetivo no ICMS:</span>
                <strong style={{ color: '#dc2626' }}>+{simulacaoDualStack.aumentoPercentualIcms.toFixed(2)}%</strong>
              </div>
              <div style={{ background: 'var(--accent-crimson-subtle)', padding: '6px 8px', borderRadius: 4, marginTop: 4 }}>
                <span style={{ color: 'var(--bad)', fontWeight: 700, display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                  Risco de Erosão de Margem
                </span>
                <div style={{ color: 'var(--bad)', fontWeight: 800, fontSize: '14px' }}>
                  -{simulacaoDualStack.erosaoMargemPpSePrecoTravado.toFixed(2)} p.p. de margem
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--bad)', marginTop: 2 }}>
                  Caso o preço de venda seja mantido inalterado frente ao mercado em 2027.
                </div>
              </div>
            </div>
          </div>
        </div>

        {isSenior && (
          <pre className="mono" style={{ marginTop: 12, marginBottom: 0, padding: 10, background: 'var(--bg-surface-subtle)', borderRadius: 6, fontSize: 11, whiteSpace: 'pre-wrap', border: '1px solid var(--border-medium)' }}>
            {`Memória Dual-Stack 2027 (Sênior):
- Modo 1 SEFA/PR 48/2026: BC ICMS = R$ ${simulacaoDualStack.baseIcmsModo1.toFixed(2)} | ICMS = R$ ${simulacaoDualStack.valorIcmsModo1.toFixed(2)} | PV Final = R$ ${simulacaoDualStack.precoFinalModo1.toFixed(2)}
- Modo 2 Tese Judicial:  BC ICMS = R$ ${simulacaoDualStack.baseIcmsModo2.toFixed(2)} | ICMS = R$ ${simulacaoDualStack.valorIcmsModo2.toFixed(2)} | PV Final = R$ ${simulacaoDualStack.precoFinalModo2.toFixed(2)}
- Diferença Cascata: +R$ ${simulacaoDualStack.efeitoCascataReais.toFixed(2)} (+${simulacaoDualStack.aumentoPercentualIcms.toFixed(2)}% no ICMS)`}
          </pre>
        )}
      </div>

      <div className="card tabular-nums" style={{ marginTop: 24, background: 'var(--bg-card-subtle)', border: '1.5px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--ink)' }}>
              🛒 Mesa de Compras PR: Comparador de Custo Efetivo Aterrissado
            </h3>
            <p className="hint" style={{ margin: '3px 0 0' }}>
              Simulação de sourcing interestadual vs. interno com ICMS-ST, Antecipação Art. 16 e custo financeiro de estoque.
            </p>
          </div>
          <button
            type="button"
            className="btn-secundario"
            style={{ fontSize: '0.85rem', padding: '6px 14px', fontWeight: 600, minHeight: '44px' }}
            onClick={() => setExpandirMesaCompras(!expandirMesaCompras)}
          >
            {expandirMesaCompras ? '▲ Ocultar Mesa de Compras' : '▼ Expandir Mesa de Compras (3 Cotações)'}
          </button>
        </div>

        {expandirMesaCompras && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label htmlFor="taxa-cap-giro" style={{ fontSize: '12px', fontWeight: 600 }}>Taxa Capital Giro Mensal:</label>
                <input id="taxa-cap-giro" type="number" step="0.1" min="0" value={taxaCapGiroMesa} onChange={(e) => setTaxaCapGiroMesa(Number(e.target.value))} style={{ width: 64, padding: '3px 6px', fontSize: '12px' }} />
                <span style={{ fontSize: '12px' }}>% a.m.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label htmlFor="prazo-estoque" style={{ fontSize: '12px', fontWeight: 600 }}>Prazo Médio de Estoque:</label>
                <input id="prazo-estoque" type="number" step="5" min="1" value={prazoEstoqueMesa} onChange={(e) => setPrazoEstoqueMesa(Number(e.target.value))} style={{ width: 64, padding: '3px 6px', fontSize: '12px' }} />
                <span style={{ fontSize: '12px' }}>dias</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>
                💡 Considera o custo de oportunidade financeiro sobre o desembolso antecipado de ICMS-ST / Art. 16.
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid #cbd5e1', borderRadius: 6 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card-subtle)', borderBottom: '2px solid #cbd5e1', color: 'var(--ink)' }}>
                    <th style={{ padding: '8px' }}>Fornecedor</th>
                    <th style={{ padding: '8px' }}>UF</th>
                    <th style={{ padding: '8px' }}>Regime</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Preço Unit.</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Frete</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>IPI</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>ICMS-ST / Ant.</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Custo Fin.</th>
                    <th style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>Custo Aterrissado</th>
                    <th style={{ padding: '8px' }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadoMesaCompras.cotacoesRanqueadas.map((cot: any, idx: number) => {
                    const ehVencedor = idx === 0;
                    return (
                      <tr key={cot.id} style={{ borderBottom: '1px solid #e2e8f0', background: ehVencedor ? 'var(--accent-emerald-glow)' : 'var(--bg-card)' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>
                          {cot.nome}
                          <div style={{ fontSize: '10.5px', color: 'var(--ink-2)', fontWeight: 400 }}>{cot.justificativaTributaria}</div>
                        </td>
                        <td style={{ padding: '8px' }}><span className="badge blue">{cot.ufEmitente}</span></td>
                        <td style={{ padding: '8px' }}>{cot.crtEmitente === '1' ? 'Simples' : 'Normal'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>R$ {cot.precoUnitario.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>R$ {cot.freteUnitario.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>R$ {cot.vIpiUnitario.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'var(--bad)' }}>R$ {(cot.icmsStEntrada + cot.antecipacaoArt16).toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-2)' }}>R$ {cot.custoCapitalGiro.toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: ehVencedor ? '#15803d' : 'var(--ink)' }}>
                          R$ {cot.custoEfetivoAterrissado.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {ehVencedor ? (
                            <span className="badge green" style={{ fontWeight: 700 }}>🏆 Menor Custo</span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--bad)' }}>
                              +R$ {(cot.custoEfetivoAterrissado - resultadoMesaCompras.melhorOpcao.custoEfetivoAterrissado).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, background: 'var(--accent-emerald-glow)', border: '1.5px solid #86efac', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: 'var(--ok)', fontSize: '13px' }}>
                  🏆 Vencedor da Mesa de Compras: {resultadoMesaCompras.melhorOpcao.nome}
                </strong>
                <div style={{ fontSize: '11.5px', color: 'var(--ok)', marginTop: 2 }}>
                  Economia real de <strong>R$ {resultadoMesaCompras.economiaVsPiorReais.toFixed(2)} ({resultadoMesaCompras.economiaVsPiorPct}%)</strong> por unidade vs. a pior opção analisada.
                </div>
              </div>
              <span className="badge green" style={{ fontSize: '12px', padding: '6px 12px' }}>
                Economia: R$ {resultadoMesaCompras.economiaVsPiorReais.toFixed(2)}/un
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card tabular-nums" style={{ marginTop: 24, background: 'var(--bg-card-subtle)', border: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 style={{ margin: 0, color: 'var(--ink)' }}>
              ⛽ Radar Logístico: Virada de Combustíveis Monofásicos Ad Rem em 01/02/2027
            </h4>
            <span className="badge amber" style={{ fontSize: '10.5px' }}>Convênios ICMS 127/2026 e 128/2026</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--ink-2)' }}>CST 61 / EFD PR012000</span>
        </div>
        <div style={{ marginTop: 8, fontSize: '12px', color: 'var(--ink-2)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div><strong>Diesel / Biodiesel (NCM 2710.19.21):</strong> R$ 1,17 ➔ <strong>R$ 1,30/L</strong> (+11,11%) — Acréscimo de R$ 1.300,00/mês para 10.000 L.</div>
          <div><strong>Gasolina / EAC (NCM 2710.12.59):</strong> R$ 1,57 ➔ <strong>R$ 1,64/L</strong> (+4,46%).</div>
          <div><strong>GLP / GLGN (NCM 2711.19.10):</strong> R$ 1,47 ➔ <strong>R$ 1,54/kg</strong> (+4,76%).</div>
        </div>
      </div>
    </>
  );
}
