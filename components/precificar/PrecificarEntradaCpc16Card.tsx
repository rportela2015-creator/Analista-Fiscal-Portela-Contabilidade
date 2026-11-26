'use client';

import React from 'react';
import type { DestinacaoMercadoria } from '@/lib/marco-legal';
import { determinarCfopVendaDestinatario, type CrtEmitente, type ResultadoDetalhado } from '@/lib/precificacao';
import type { PrecificacaoItemInput } from '@/lib/extrator-nfe-types';
import type { ItemFiscalAuditado } from '@/lib/types/item-fiscal-auditado';
import { ProgressiveSection } from '@/components/ui';
import type { NivelOperacional } from '@/lib/hooks/useNivelOperacional';

export interface PrecificarEntradaCpc16CardProps {
  nivel: NivelOperacional;
  isGerencial: boolean;
  isSenior: boolean;
  itemAtual: PrecificacaoItemInput;
  audItem?: ItemFiscalAuditado;
  deParaCfop: any;
  resultado: ResultadoDetalhado | null;
  ufDestino: string;
  destinacao: DestinacaoMercadoria;
  setDestinacao: (v: DestinacaoMercadoria) => void;
  crtEmitente: CrtEmitente;
  setCrtEmitente: (v: CrtEmitente) => void;
  origemMercadoria: string;
  setOrigemMercadoria: (v: string) => void;
  tipoEstabelecimento: 'comercio' | 'industria';
  setTipoEstabelecimento: (v: 'comercio' | 'industria') => void;
  baseReduzidaSaidaPct: number;
  setBaseReduzidaSaidaPct: (v: number) => void;
  pisCofinsMonofasico: boolean;
  setPisCofinsMonofasico: (v: boolean) => void;
  modFrete: '0' | '1';
  setModFrete: (v: '0' | '1') => void;
  freteCteTotal: number;
  setFreteCteTotal: (v: number) => void;
  icmsFreteCteTotal: number;
  setIcmsFreteCteTotal: (v: number) => void;
  criterioRateio: 'valor' | 'peso';
  setCriterioRateio: (v: 'valor' | 'peso') => void;
  beneficiosFiscais: any;
  convenioIcmsSelecionado: string;
  setConvenioIcmsSelecionado: (v: string) => void;
  compCusto: any;
  premissasSectionId?: string;
}

export default function PrecificarEntradaCpc16Card({
  nivel,
  isGerencial,
  isSenior,
  itemAtual,
  audItem,
  deParaCfop,
  resultado,
  ufDestino,
  destinacao,
  setDestinacao,
  crtEmitente,
  setCrtEmitente,
  origemMercadoria,
  setOrigemMercadoria,
  tipoEstabelecimento,
  setTipoEstabelecimento,
  baseReduzidaSaidaPct,
  setBaseReduzidaSaidaPct,
  pisCofinsMonofasico,
  setPisCofinsMonofasico,
  modFrete,
  setModFrete,
  freteCteTotal,
  setFreteCteTotal,
  icmsFreteCteTotal,
  setIcmsFreteCteTotal,
  criterioRateio,
  setCriterioRateio,
  beneficiosFiscais,
  convenioIcmsSelecionado,
  setConvenioIcmsSelecionado,
  compCusto,
  premissasSectionId = 'sec-premissas-rastreabilidade',
}: PrecificarEntradaCpc16CardProps) {
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <ProgressiveSection
          id={premissasSectionId}
          title="2. Rastreabilidade de Entrada, De-Para CFOP e Frete"
          subtitle="Mapeamento de CFOP, destinação da mercadoria, CRT emitente e frete CT-e"
          minLevel="operacional"
          currentLevel={nivel}
          defaultExpanded={!isGerencial}
          onDemandTriggerLabel="Ajustar Rastreabilidade Fiscal e Frete"
          badge={<span className="badge blue" style={{ fontSize: '11px' }}>Operacional / Sênior</span>}
        >
          <div className="card" style={{ marginTop: 8 }}>
            <div style={{ background: 'var(--bg-card-subtle)', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 700 }}>
                    Rastreabilidade e Mapeamento de CFOP (Origem ➔ Entrada ➔ Venda)
                  </span>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-blue)', marginTop: 2 }}>
                    CFOP Origem: {itemAtual.cfop || '5102'} ➔ Entrada: {deParaCfop?.cfopEntrada || '1102'} ➔ Venda (Destinatário):{' '}
                    {resultado?.cfopVendaDestinatario || determinarCfopVendaDestinatario(itemAtual, ufDestino)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {deParaCfop?.geraCreditoIcms ? (
                    <span className="badge green" title="Crédito regular de ICMS na entrada">
                      ✅ Crédito ICMS Permitido
                    </span>
                  ) : (
                    <span className="badge red" title="Vedação legal de crédito de ICMS na entrada">
                      ⛔ Crédito ICMS Vedado
                    </span>
                  )}
                  {deParaCfop?.temSt ? (
                    <span className="badge yellow" style={{ background: 'var(--accent-amber-subtle)', color: 'var(--warn)', border: '1px solid #fde68a' }} title="Operação com ICMS Substituição Tributária">
                      🛡️ Sujeito a ST (Retido)
                    </span>
                  ) : (
                    <span className="badge grey">Sem ST</span>
                  )}
                  {deParaCfop?.exigeDifal ? (
                    <span className="badge blue" style={{ background: 'var(--accent-blue-subtle)', color: '#7e22ce', border: '1px solid #e9d5ff' }} title="Exigência de Diferencial de Alíquotas">
                      📦 DIFAL Exigido (EC 87/15)
                    </span>
                  ) : (
                    <span className="badge grey">DIFAL Disp.</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Destinação da Mercadoria:
                </label>
                <select value={destinacao} onChange={(e) => setDestinacao(e.target.value as DestinacaoMercadoria)}>
                  <option value="comercializacao">Revenda (Comercialização)</option>
                  <option value="industrializacao">Matéria-Prima (Industrialização)</option>
                  <option value="uso_consumo">Uso e Consumo</option>
                  <option value="ativo_imobilizado">Ativo Imobilizado</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  CRT do Fornecedor / Emitente:
                </label>
                <select value={String(crtEmitente)} onChange={(e) => setCrtEmitente(e.target.value as CrtEmitente)}>
                  <option value="3">3 - Regime Normal (Lucro Real / Presumido)</option>
                  <option value="simples_hibrido">Simples Híbrido (IBS/CBS Regular por Fora)</option>
                  <option value="1">1 - Simples Nacional (Microempresa / EPP)</option>
                  <option value="2">2 - Simples Nacional (Sublimite Excedido)</option>
                  <option value="4">4 - MEI (Microempreendedor Individual)</option>
                </select>
                {String(crtEmitente) === 'simples_hibrido' && (
                  <div style={{ fontSize: '11px', color: 'var(--ok)', fontWeight: 600, marginTop: 4 }}>
                    🏢 <b>Simples Híbrido:</b> Gera 100% dos créditos de IBS e CBS destacados ao adquirente.
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Origem da Mercadoria:
                </label>
                <select value={origemMercadoria} onChange={(e) => setOrigemMercadoria(e.target.value)}>
                  <option value="0">0 - Nacional</option>
                  <option value="1">1 - Estrangeira (Importação Direta 4%)</option>
                  <option value="2">2 - Estrangeira (Adquirida Mercado Interno 4%)</option>
                  <option value="3">3 - Nacional c/ Conteúdo Importação &gt; 40%</option>
                  <option value="8">8 - Nacional c/ Conteúdo Importação &gt; 70%</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Tipo de Estabelecimento:
                </label>
                <select value={tipoEstabelecimento} onChange={(e) => setTipoEstabelecimento(e.target.value as any)}>
                  <option value="comercio">Comércio (Arbitramento 70%)</option>
                  <option value="industria">Indústria (Arbitramento 80%)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Base de Cálculo Reduzida Saída (%):
                </label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={baseReduzidaSaidaPct}
                  onChange={(e) => setBaseReduzidaSaidaPct(Number(e.target.value))}
                  title="100% = Sem redução; se menor que 100%, estorna crédito proporcionalmente conforme Anexo II RICMS/PR"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={pisCofinsMonofasico}
                    onChange={(e) => setPisCofinsMonofasico(e.target.checked)}
                  />
                  <span>PIS/COFINS Monofásico (Segrega DAS)</span>
                </label>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card-subtle)', padding: 12, borderRadius: 6, border: '1px solid #dfe5f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>
                  🚚 Modalidade de Frete e Despesas de Transporte:
                </label>
                <select
                  value={modFrete}
                  onChange={(e) => setModFrete(e.target.value as '0' | '1')}
                  style={{ fontSize: '12px', padding: '3px 8px' }}
                >
                  <option value="0">0 - Frete CIF (Por conta do Remetente / Embutido)</option>
                  <option value="1">1 - Frete FOB (Por conta do Destinatário / CT-e Externo)</option>
                </select>
              </div>

              {modFrete === '1' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10, background: 'var(--bg-card)', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                      Frete CT-e Total (R$):
                    </label>
                    <input type="number" step="10" value={freteCteTotal} onChange={(e) => setFreteCteTotal(Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                      ICMS no CT-e (R$):
                    </label>
                    <input type="number" step="5" value={icmsFreteCteTotal} onChange={(e) => setIcmsFreteCteTotal(Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                      Critério de Rateio:
                    </label>
                    <select value={criterioRateio} onChange={(e) => setCriterioRateio(e.target.value as any)}>
                      <option value="valor">Por Valor (vProd)</option>
                      <option value="peso">Por Peso Bruto (kg)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              {(crtEmitente === '1' || crtEmitente === '2') && (
                <div className="note atencao" style={{ marginBottom: 8, fontSize: '12px' }}>
                  <b>⚠️ Bloqueio Legal de PIS/COFINS (Leis 10.637/02 e 10.833/03 Art. 3º §2º II):</b> Aquisição de fornecedor do Simples Nacional não gera créditos de PIS/COFINS ao adquirente, mesmo sob o Lucro Real. Crédito de ICMS permitido exclusivamente se destacado no documento fiscal (Art. 23 LC 123/06).
                </div>
              )}
              {(deParaCfop?.temSt || itemAtual.cstIcms === '60' || itemAtual.csosn === '500' || (itemAtual.icmsStEntrada ?? 0) > 0) && (
                <div className="note info" style={{ marginBottom: 8, fontSize: '12px' }}>
                  <b>🛡️ Substituição Tributária / Retenção Anterior (CST 60 / CSOSN 500 / Anexo IX RICMS/PR):</b> ICMS-ST integra o custo de estoque não recuperável. Na revenda interna subsequente, o ICMS de saída é automaticamente zerado (0%) e, no Simples Nacional, a parcela de ICMS é segregada do DAS.
                </div>
              )}
              {deParaCfop?.exigeDifal && (
                <div className="note atencao" style={{ marginBottom: 8, fontSize: '12px' }}>
                  <b>📦 DIFAL Interestadual Exigido (EC 87/2015 e LC 190/2021):</b> Mercadoria interestadual destinada a consumo final ou ativo imobilizado exige o recolhimento do diferencial de alíquotas pelo adquirente.
                </div>
              )}
              {baseReduzidaSaidaPct < 100 && (
                <div className="note atencao" style={{ marginBottom: 8, fontSize: '12px' }}>
                  <b>📉 Estorno Proporcional de ICMS (RICMS/PR Anexo II):</b> Saída beneficiada com redução de base de cálculo em {100 - baseReduzidaSaidaPct}% exige o estorno proporcional do crédito de ICMS apropriado na entrada, transferindo-o para o custo contábil.
                </div>
              )}
            </div>
          </div>
        </ProgressiveSection>
      </div>

      <div className="card" style={{ marginBottom: 20, background: 'var(--bg-card)', border: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14.5px', color: 'var(--accent-blue)' }}>
              🔍 Detecção Automática de Benefícios Fiscais (Reforma Tributária &amp; RICMS/PR - CONFAZ)
            </h3>
            <p className="hint" style={{ margin: '3px 0 0', fontSize: '12px' }}>
              Enquadramento em O(1) de alíquotas reduzidas, diferimentos estaduais, FCP e apuração de DIFAL.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: '13px', color: 'var(--accent-blue)' }}>Reforma Tributária (IBS/CBS)</strong>
              <span className="badge blue" style={{ fontSize: '10.5px' }}>LC 214/2025</span>
            </div>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>cClassTrib Sugerido:</span>{' '}
                <strong className="mono" style={{ color: 'var(--ink)' }}>{beneficiosFiscais.reforma.cClassTrib || 'cClassTrib a confirmar'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>CST IBS/CBS:</span>{' '}
                <span className="badge grey" style={{ fontSize: '11px' }}>CST {beneficiosFiscais.reforma.cstIbsCbs || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Redução de Alíquota (IBS/CBS):</span>{' '}
                <strong style={{ color: beneficiosFiscais.reforma.reducaoIbsCbsPct > 0 ? '#15803d' : '#475569' }}>
                  {beneficiosFiscais.reforma.reducaoIbsCbsPct}%
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Tema / Fundamentação:</span>{' '}
                <span style={{ fontWeight: 600 }}>{beneficiosFiscais.reforma.tema}</span>
              </div>
              <div style={{ marginTop: 4 }}>
                {beneficiosFiscais.reforma.exigeTribRegular ? (
                  <span
                    className="badge green"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                    title="Nota Técnica 2025.002: Exige preenchimento do grupo de tributação regular para validação do benefício fiscal na SEFAZ"
                  >
                    🏷️ Exige &lt;gTribRegular&gt; (NT 2025.002)
                  </span>
                ) : (
                  <span className="badge grey" style={{ fontSize: '11px', padding: '3px 8px' }}>
                    🏷️ Tributação Normal (Sem &lt;gTribRegular&gt;)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: '13px', color: 'var(--accent-blue)' }}>ICMS Paraná &amp; Convênios CONFAZ</strong>
              <span className="badge" style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)', fontSize: '10.5px' }}>RICMS/PR</span>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label htmlFor="select-convenio-icms" style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                Regime / Convênio de ICMS:
              </label>
              <select
                id="select-convenio-icms"
                value={convenioIcmsSelecionado}
                onChange={(e) => setConvenioIcmsSelecionado(e.target.value)}
                style={{ width: '100%', fontSize: '12px', padding: '4px 6px' }}
              >
                <option value="auto">⚡ Automático pelo NCM</option>
                <option value="nenhum">Nenhum / Tributação Integral</option>
                <option value="diferimento_parcial_pr_12">Diferimento Parcial B2B 12% (Art. 28 Anexo VIII)</option>
                <option value="conv_52_91_agricola">Convênio ICMS 52/1991 - Máq. Agrícolas (5,6% PR)</option>
                <option value="conv_52_91_industrial">Convênio ICMS 52/1991 - Máq. Industriais (8,8% PR)</option>
                <option value="conv_100_97_60">Convênio ICMS 100/1997 - Insumos Agro (Red. 60%)</option>
                <option value="conv_100_97_30">Convênio ICMS 100/1997 - Insumos Agro (Red. 30%)</option>
                <option value="cesta_basica_pr">Cesta Básica PR - Carga 7% (Anexo II)</option>
                <option value="diferimento_total_pr">Diferimento Total 100% CST 51 (Art. 31 Anexo VIII)</option>
              </select>
            </div>

            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Alíq. Nominal vs Efetiva:</span>{' '}
                <span>{beneficiosFiscais.icms.aliqNominalPct}%</span> ➔{' '}
                <strong style={{ color: 'var(--ok)' }}>{beneficiosFiscais.icms.aliqEfetivaPct}%</strong>
                {beneficiosFiscais.icms.diferimentoPct > 0 && (
                  <span className="badge blue" style={{ marginLeft: 6, fontSize: '10px' }}>
                    Dif: {beneficiosFiscais.icms.diferimentoPct.toFixed(1)}%
                  </span>
                )}
                {beneficiosFiscais.icms.pRedBC > 0 && (
                  <span className="badge yellow" style={{ marginLeft: 6, fontSize: '10px' }}>
                    Red BC: {beneficiosFiscais.icms.pRedBC.toFixed(1)}%
                  </span>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)' }}>CST ICMS Sugerido:</span>{' '}
                <strong className="mono">CST {beneficiosFiscais.icms.cstIcmsSugerido}</strong>{' '}
                | FCP Destino: <strong>+{beneficiosFiscais.icms.fcpDestinoPct}%</strong>
              </div>
              <div style={{ marginTop: 2 }}>
                {beneficiosFiscais.icms.dispensaEstornoEntrada ? (
                  <span
                    className="badge green"
                    style={{ fontSize: '10.5px', padding: '2px 6px' }}
                    title="Cláusula Quarta Convênio ICMS 52/1991: Não se exigirá a anulação do crédito relativo às entradas."
                  >
                    ✅ Dispensa Legal de Estorno (Crédito Integral Mantido)
                  </span>
                ) : (
                  <span
                    className="badge yellow"
                    style={{ background: 'var(--accent-amber-subtle)', color: 'var(--warn)', border: '1px solid #fde68a', fontSize: '10.5px', padding: '2px 6px' }}
                    title="Item 6 Anexo II RICMS/PR: Redução com exigência de estorno proporcional de créditos."
                  >
                    ⚠️ Exige Estorno Proporcional (Anexo II RICMS/PR)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {beneficiosFiscais.difal && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--accent-blue-subtle)', border: '1px solid #e9d5ff', borderRadius: 6, fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ color: '#7e22ce' }}>
                📦 Apuração do DIFAL Interestadual ({beneficiosFiscais.difal.metodologia === 'base_dupla' ? 'Base Dupla - Lucro Real/Presumido' : 'Base Única - Simples Nacional'})
              </strong>
              <span className="badge" style={{ background: 'var(--accent-blue-subtle)', color: '#6b21a8', fontSize: '10.5px' }}>
                EC 87/2015 &amp; LC 190/2022
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }} className="tabular-nums">
              <div>
                <span style={{ color: 'var(--ink-2)', fontSize: '11px', display: 'block' }}>Base de Cálculo:</span>
                <strong>R$ {beneficiosFiscais.difal.baseCalculo.toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)', fontSize: '11px', display: 'block' }}>DIFAL Líquido:</span>
                <strong>R$ {beneficiosFiscais.difal.valorDifalLiquido.toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)', fontSize: '11px', display: 'block' }}>Parcela FCP Destino:</span>
                <strong>R$ {beneficiosFiscais.difal.valorFcpDestino.toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-2)', fontSize: '11px', display: 'block' }}>Total Devido Destino:</span>
                <strong style={{ color: 'var(--bad)' }}>R$ {beneficiosFiscais.difal.valorTotalDevidoDestino.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ background: 'var(--accent-crimson-subtle)', border: '1.5px solid #fecdd3', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 4px', color: 'var(--bad)' }}>Bloco A — Custo de Aquisição Real (NBC TG 16 / CPC 16)</h3>
        <p className="hint" style={{ margin: '0 0 10px', color: 'var(--bad)' }}>
          Critério contábil estrito: impostos recuperáveis são deduzidos e tributos sem crédito integram o custo.
        </p>

        <table className="tabela-custo tabular-nums" style={{ width: '100%', fontSize: '0.9rem' }}>
          <tbody>
            <tr>
              <td>Valor dos Produtos (vProd):</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>R$ {compCusto.valorProdutoBruto.toFixed(2)}</td>
            </tr>
            <tr>
              <td>(-) Descontos Incondicionais:</td>
              <td style={{ textAlign: 'right', color: 'var(--ok)' }}>- R$ {compCusto.descontosIncondicionais.toFixed(2)}</td>
            </tr>
            <tr>
              <td>(+) Frete, Seguro e Despesas Acessórias:</td>
              <td style={{ textAlign: 'right' }}>+ R$ {compCusto.freteSeguroOutros.toFixed(2)}</td>
            </tr>
            <tr style={{ background: 'var(--accent-crimson-subtle)' }}>
              <td>
                (+) Tributos Não Recuperáveis:
                <div style={{ fontSize: '11px', color: 'var(--ink-2)' }}>
                  IPI: R$ {compCusto.tributosNaoRecuperaveis.ipi.toFixed(2)} | ST: R$ {compCusto.tributosNaoRecuperaveis.icmsSt.toFixed(2)} | Outros sem crédito: R$ {compCusto.tributosNaoRecuperaveis.tributosEntradaNaoAproveitados.toFixed(2)}
                </div>
              </td>
              <td style={{ textAlign: 'right', color: 'var(--bad)', fontWeight: 600 }}>
                + R$ {compCusto.tributosNaoRecuperaveis.total.toFixed(2)}
              </td>
            </tr>
            <tr style={{ background: 'var(--accent-emerald-glow)' }}>
              <td>
                (-) Impostos a Recuperar:
                <div style={{ fontSize: '11px', color: 'var(--ok)' }}>
                  ICMS: R$ {compCusto.impostosARecuperar.creditoIcms.toFixed(2)} | PIS/COF: R$ {compCusto.impostosARecuperar.creditoPisCofins.toFixed(2)} | CBS: R$ {compCusto.impostosARecuperar.creditoCbs.toFixed(2)} | IBS: R$ {compCusto.impostosARecuperar.creditoIbs.toFixed(2)}
                </div>
              </td>
              <td style={{ textAlign: 'right', color: 'var(--ok)', fontWeight: 700 }}>
                - R$ {compCusto.impostosARecuperar.totalImpostosRecuperaveis.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="tabular-nums" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: 'var(--accent-crimson-subtle)', border: '2px solid #e11d48', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--bad)' }}>Custo de Aquisição Real Total:</span>
            <span style={{ fontWeight: 900, fontSize: '1.25rem', color: 'var(--bad)' }}>R$ {compCusto.custoAquisicaoReal.toFixed(2)}</span>
          </div>

          <div style={{ background: 'var(--accent-crimson-subtle)', border: '2px solid #f43f5e', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--bad)' }}>Custo Unitário Efetivo:</span>
            <span style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--bad)' }}>R$ {compCusto.custoUnitarioReal.toFixed(2)} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>/ un</span></span>
          </div>
        </div>

        {compCusto.glosado && (
          <div className="note critico" style={{ marginTop: 12 }}>
            <b>GLOSA DE CRÉDITO APLICADA:</b> {compCusto.motivoGlosa}
          </div>
        )}

        {audItem && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-medium)',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              <strong style={{ color: 'var(--ok)' }}>
                🔗 Contrato Canônico CPC 16 R1 (Entrada → Precificação)
              </strong>
              <span className="badge blue mono tabular-nums" style={{ fontSize: 10.5 }}>
                ICMS PR Bitemporal: {audItem.tributacaoEstadual.aliqIcmsPrBitemporalPct}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 6 }} className="tabular-nums">
              <div>Frete NF-e: <b>R$ {audItem.custoCpc16.freteNfe.toFixed(2)}</b></div>
              <div>Frete CT-e FOB: <b>R$ {audItem.custoCpc16.freteCteFob.toFixed(2)}</b></div>
              <div>DIFAL / Antec.: <b>R$ {audItem.custoCpc16.tributosNaoRecuperaveis.difalOuAntecipacao.toFixed(2)}</b></div>
              <div>PIS/COFINS Lei 14.592: <b>-R$ {audItem.custoCpc16.creditosRecuperaveis.pisCofinsTotal.toFixed(2)}</b></div>
              <div>IPI Recup.: <b>-R$ {audItem.custoCpc16.creditosRecuperaveis.ipi.toFixed(2)}</b></div>
              <div>CMV Unit. Auditado: <b style={{ color: 'var(--ok)' }}>R$ {audItem.custoCpc16.cmvLiquidoUnitario.toFixed(2)}</b></div>
            </div>
            {audItem.saneamentoNcm?.overrideAtivo && audItem.saneamentoNcm.ncmSaneadoSaida && (
              <div style={{ marginTop: 6 }}>
                <span className="badge alta tabular-nums" style={{ fontSize: 10.5 }}>
                  ✓ NCM Saneado (XML: {audItem.ncmEscrituradoEntrada.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')})
                </span>
              </div>
            )}
            {audItem.destinacaoPendenteConfirmacao && audItem.alertaDestinacao && (
              <div style={{ marginTop: 6, color: 'var(--warn)', fontWeight: 600 }}>
                ⚠️ {audItem.alertaDestinacao}
              </div>
            )}
            {isSenior && audItem.custoCpc16.memoriaCalculo.length > 0 && (
              <pre className="mono" style={{ margin: '8px 0 0', padding: 8, background: 'var(--bg-card)', borderRadius: 4, fontSize: 10.5, whiteSpace: 'pre-wrap' }}>
                {audItem.custoCpc16.memoriaCalculo.join('\n')}
              </pre>
            )}
          </div>
        )}
      </div>
    </>
  );
}
