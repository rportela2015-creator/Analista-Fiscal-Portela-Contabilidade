'use client';

import React from 'react';
import type { RegimeTributario } from '@/lib/marco-legal';
import type { AliquotasSugeridas } from '@/lib/precificacao';

export interface PrecificarParametrosFormProps {
  mode: 'cenario' | 'aliquotas';
  regime?: RegimeTributario;
  setRegime?: (v: RegimeTributario) => void;
  ano?: number;
  setAno?: (v: number) => void;
  ufOrigem?: string;
  setUfOrigem?: (v: string) => void;
  ufDestino?: string;
  setUfDestino?: (v: string) => void;
  margemAlvo?: number;
  setMargemAlvo?: (v: number) => void;
  despesasVar?: number;
  setDespesasVar?: (v: number) => void;
  rbt12?: number;
  setRbt12?: (v: number) => void;
  documentoInidoneo?: boolean;
  setDocumentoInidoneo?: (v: boolean) => void;
  // Modo alíquotas
  temCustomizacao?: boolean;
  camposCustomizados?: string[];
  limparOverrides?: () => void;
  resetLabel?: string;
  modoEdicao?: boolean;
  setModoEdicao?: (v: boolean) => void;
  sugestao?: { aliquotasAplicadas: AliquotasSugeridas; camposEditados: string[] } | null;
  overrides?: Partial<AliquotasSugeridas>;
  aplicarCampoOverride?: (campo: keyof AliquotasSugeridas, valor: number) => void;
  empresaNome?: string;
}

export default function PrecificarParametrosForm(props: PrecificarParametrosFormProps) {
  if (props.mode === 'cenario') {
    const {
      regime = 'presumido',
      setRegime,
      ano = 2027,
      setAno,
      ufOrigem = 'PR',
      setUfOrigem,
      ufDestino = 'PR',
      setUfDestino,
      margemAlvo = 20,
      setMargemAlvo,
      despesasVar = 5,
      setDespesasVar,
      rbt12 = 360000,
      setRbt12,
      documentoInidoneo = false,
      setDocumentoInidoneo,
    } = props;

    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>1. Cenário Fiscal da Empresa</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Regime Tributário Adquirente:
            </label>
            <select value={regime} onChange={(e) => setRegime?.(e.target.value as RegimeTributario)}>
              <option value="simples">Simples Nacional (Tradicional)</option>
              <option value="simples_hibrido">Simples Híbrido (IBS/CBS por fora)</option>
              <option value="presumido">Lucro Presumido</option>
              <option value="real">Lucro Real</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Ano de Vigência / Calendário:
            </label>
            <select value={ano} onChange={(e) => setAno?.(Number(e.target.value))}>
              <option value={2026}>2026 (CBS 0,9% / IBS 0,1% Teste)</option>
              <option value={2027}>2027 (CBS 8,8% / IBS 0,1% Transição)</option>
              <option value={2028}>2028 (CBS 8,8% / IBS 0,1%)</option>
              <option value={2029}>2029 (IBS 10% / ICMS 90%)</option>
              <option value={2031}>2031 (IBS 30% / ICMS 70%)</option>
              <option value={2033}>2033 (Vigência Plena 26,5%)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              UF Origem (Compra):
            </label>
            <input type="text" maxLength={2} value={ufOrigem} onChange={(e) => setUfOrigem?.(e.target.value.toUpperCase())} />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              UF Destino (Venda):
            </label>
            <input type="text" maxLength={2} value={ufDestino} onChange={(e) => setUfDestino?.(e.target.value.toUpperCase())} />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Margem Líquida Pretendida (%):
            </label>
            <input type="number" step="0.5" value={margemAlvo} onChange={(e) => setMargemAlvo?.(Number(e.target.value))} />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Despesas Comerciais / Variáveis (%):
            </label>
            <input type="number" step="0.5" value={despesasVar} onChange={(e) => setDespesasVar?.(Number(e.target.value))} />
          </div>
        </div>

        {(regime === 'simples' || regime === 'simples_hibrido') && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Receita Bruta Acumulada 12 Meses (RBT12 Simples Nacional - R$):
            </label>
            <input type="number" step="10000" value={rbt12} onChange={(e) => setRbt12?.(Number(e.target.value))} />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={documentoInidoneo}
              onChange={(e) => setDocumentoInidoneo?.(e.target.checked)}
            />
            <span style={{ color: documentoInidoneo ? 'var(--bad)' : 'inherit', fontWeight: 600, fontSize: '12.5px' }}>
              ⚠️ Simular documento fiscal inidôneo (glosar 100% dos créditos fiscais - art. 41 LC 214)
            </span>
          </label>
        </div>
      </div>
    );
  }

  const {
    temCustomizacao = false,
    camposCustomizados = [],
    limparOverrides,
    resetLabel = 'Restaurar Alíquotas Padrão',
    modoEdicao = false,
    setModoEdicao,
    sugestao,
    overrides = {},
    aplicarCampoOverride,
    empresaNome,
  } = props;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Alíquotas Aplicadas &amp; Edição</h3>
          {temCustomizacao && (
            <span
              className="badge"
              style={{
                background: 'var(--accent-amber-subtle)',
                color: 'var(--warn)',
                border: '1px solid #f59e0b',
                fontSize: '11px',
                fontWeight: 700,
              }}
              title="Existem alíquotas editadas manualmente salvas para esta empresa"
            >
              ● Customizada ({camposCustomizados.length})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {temCustomizacao && (
            <button
              type="button"
              onClick={limparOverrides}
              className="btn-secundario min-h-[44px]"
              style={{
                minHeight: '44px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--bad)',
                borderColor: '#fca5a5',
                background: 'var(--accent-crimson-subtle)',
              }}
              title="Remover todas as alíquotas customizadas e restaurar os valores oficiais"
            >
              ↺ {resetLabel}
            </button>
          )}
          <button
            type="button"
            className="btn-secundario min-h-[44px]"
            style={{ fontSize: '0.8rem', padding: '6px 12px', minHeight: '44px' }}
            onClick={() => setModoEdicao?.(!modoEdicao)}
          >
            {modoEdicao ? 'Fechar Edição' : '✏️ Editar Alíquotas (Override)'}
          </button>
        </div>
      </div>

      {sugestao && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
            <div className="badge-stat">
              <span className="lbl">
                CBS Saída {overrides.cbsPct !== undefined && <span title="Alíquota customizada" style={{ color: 'var(--warn)' }}>● Custom</span>}
              </span>
              <span className="val tabular-nums">{sugestao.aliquotasAplicadas.cbsPct}%</span>
            </div>
            <div className="badge-stat">
              <span className="lbl">
                IBS Saída {overrides.ibsPct !== undefined && <span title="Alíquota customizada" style={{ color: 'var(--warn)' }}>● Custom</span>}
              </span>
              <span className="val tabular-nums">{sugestao.aliquotasAplicadas.ibsPct}%</span>
            </div>
            <div className="badge-stat">
              <span className="lbl">
                ICMS Saída {overrides.icmsVendaPct !== undefined && <span title="Alíquota customizada" style={{ color: 'var(--warn)' }}>● Custom</span>}
              </span>
              <span className="val tabular-nums">{sugestao.aliquotasAplicadas.icmsVendaPct}%</span>
            </div>
            <div className="badge-stat">
              <span className="lbl">
                Redução IVA {overrides.reducaoIbsCbsPct !== undefined && <span title="Alíquota customizada" style={{ color: 'var(--warn)' }}>● Custom</span>}
              </span>
              <span className="val tabular-nums">{sugestao.aliquotasAplicadas.reducaoIbsCbsPct}%</span>
            </div>
          </div>

          {(sugestao.camposEditados.length > 0 || temCustomizacao) && (
            <div role="status" aria-live="polite" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="badge yellow" style={{ background: 'var(--accent-amber-subtle)', color: 'var(--warn)', border: '1px solid #fde68a' }}>
                ⚠️ Alíquotas customizadas persistidas ({empresaNome || 'Padrão'}):{' '}
                {(sugestao.camposEditados.length > 0 ? sugestao.camposEditados : camposCustomizados).join(', ')}
              </span>
            </div>
          )}

          {modoEdicao && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-subtle)', borderRadius: 6 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>
                Editar Alíquotas Manualmente (Persistência Automática por Empresa):
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div>
                  <label htmlFor="override-cbs" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    CBS (%) {overrides.cbsPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-cbs" type="number" step="0.1" min="0" value={sugestao.aliquotasAplicadas.cbsPct} onChange={(e) => aplicarCampoOverride?.('cbsPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-ibs" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    IBS (%) {overrides.ibsPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-ibs" type="number" step="0.1" min="0" value={sugestao.aliquotasAplicadas.ibsPct} onChange={(e) => aplicarCampoOverride?.('ibsPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-is" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    IS (%) {overrides.isPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-is" type="number" step="0.1" min="0" value={sugestao.aliquotasAplicadas.isPct} onChange={(e) => aplicarCampoOverride?.('isPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-icms" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    ICMS Venda (%) {overrides.icmsVendaPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-icms" type="number" step="0.5" min="0" value={sugestao.aliquotasAplicadas.icmsVendaPct} onChange={(e) => aplicarCampoOverride?.('icmsVendaPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-piscofins" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    PIS/COFINS Venda (%) {overrides.pisCofinsVendaPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-piscofins" type="number" step="0.05" min="0" value={sugestao.aliquotasAplicadas.pisCofinsVendaPct} onChange={(e) => aplicarCampoOverride?.('pisCofinsVendaPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-ipi" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    IPI (%) {overrides.ipiPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-ipi" type="number" step="0.5" min="0" value={sugestao.aliquotasAplicadas.ipiPct} onChange={(e) => aplicarCampoOverride?.('ipiPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-das" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    DAS Efetivo Simples (%) {overrides.dasEfetivoPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-das" type="number" step="0.1" min="0" value={sugestao.aliquotasAplicadas.dasEfetivoPct} onChange={(e) => aplicarCampoOverride?.('dasEfetivoPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-irpj" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    IRPJ/CSLL Efetivo (%) {overrides.irpjCsllEfetivoPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-irpj" type="number" step="0.1" min="0" value={sugestao.aliquotasAplicadas.irpjCsllEfetivoPct} onChange={(e) => aplicarCampoOverride?.('irpjCsllEfetivoPct', Number(e.target.value))} />
                </div>
                <div>
                  <label htmlFor="override-reducao" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>
                    Redução IVA (%) {overrides.reducaoIbsCbsPct !== undefined && <strong style={{ color: 'var(--warn)' }}>[custom]</strong>}
                  </label>
                  <input id="override-reducao" type="number" step="5" min="0" max="100" value={sugestao.aliquotasAplicadas.reducaoIbsCbsPct} onChange={(e) => aplicarCampoOverride?.('reducaoIbsCbsPct', Number(e.target.value))} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
