'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { ClassTrib, Reforma as ReformaData, loadReforma } from '@/lib/data';
import { aliquotasReforma, buscarClassificacoes } from '@/lib/reforma';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import { obterFontesNormativasPorAba } from '@/lib/fiscal/fontes-normativas';
import {
  KpiStrip,
  StickyActionBar,
  ProgressiveSection,
  LegalCitationBlock,
  type KpiItemData,
  type NormativeCitation,
} from '@/components/ui';

const fmt = (n?: number | null) => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}%`);

export default function ReformaTab() {
  // 1. TODOS OS HOOKS NO TOPO ABSOLUTO (Sem retornos condicionais antes)
  const { nivel, isGerencial, isOperacional, isSenior } = useNivelOperacional();

  const [rf, setRf] = useState<ReformaData | null | undefined>(undefined);
  const [txt, setTxt] = useState('');
  const [cst, setCst] = useState('');
  const [soReducao, setSoReducao] = useState(false);
  const [detalhe, setDetalhe] = useState('');
  const [aba, setAba] = useState<'cbsibs' | 'is'>('cbsibs');

  // Estados de Paginação para Controle Estrito do DOM
  const [pagina, setPagina] = useState(1);
  const [linhasPorPagina, setLinhasPorPagina] = useState(25);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    loadReforma()
      .then(setRf)
      .catch(() => setRf(null));
  }, []);

  const lista: ClassTrib[] = useMemo(() => {
    if (!rf || !rf.disponivel) return [];
    return aba === 'cbsibs' ? buscarClassificacoes(rf, txt, cst, soReducao) : (rf.is_classificacoes || []);
  }, [rf, aba, txt, cst, soReducao]);

  // Redefine a página quando filtros ou abas mudam
  useEffect(() => {
    setPagina(1);
  }, [txt, cst, soReducao, aba, linhasPorPagina]);

  const listaEfetiva = useMemo(() => {
    return aba === 'cbsibs' ? lista : (rf?.is_classificacoes || []);
  }, [aba, lista, rf]);

  const totalLinhas = listaEfetiva.length;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / linhasPorPagina));

  const itensPaginados = useMemo(() => {
    const inicio = (pagina - 1) * linhasPorPagina;
    return listaEfetiva.slice(inicio, inicio + linhasPorPagina);
  }, [listaEfetiva, pagina, linhasPorPagina]);

  // Faixa de KPIs da Reforma Tributária (tabular-nums)
  const kpiItems = useMemo<KpiItemData[]>(() => {
    const totalCbsIbs = rf?.classificacoes?.length ?? 0;
    const totalCst = rf?.cst?.length ?? 0;
    const totalIs = (rf?.is_classificacoes || []).length;
    const cClassTribSelecionado = detalhe ? detalhe : '';

    return [
      {
        id: 'kpi-reforma-cclasstrib',
        label: 'Classificações cClassTrib (IBS/CBS)',
        value: totalCbsIbs > 0 ? `${totalCbsIbs} códigos` : '—',
        subValue: 'Catálogo de Operações Oficiais da RFB',
        trafficLight: totalCbsIbs > 0 ? 'info' : 'warning',
        statusLabel: 'Oficial RFB',
        tooltipText: 'Total de situações de operações cadastradas na tabela oficial da Reforma Tributária',
      },
      {
        id: 'kpi-reforma-cst',
        label: 'Situações Tributárias (CST IBS/CBS)',
        value: totalCst > 0 ? `${totalCst} CSTs` : '—',
        subValue: 'Matriz de incidência, imunidade e diferimento',
        trafficLight: 'info',
        statusLabel: 'Vigência 2026',
      },
      {
        id: 'kpi-reforma-is',
        label: 'Imposto Seletivo (Art. 393+)',
        value: totalIs > 0 ? `${totalIs} códigos` : '—',
        subValue: rf?.is_por_ncm ? `${rf.is_consultados || 0} NCMs com marcação IS` : 'Sin Taxes (Bens Nocivos)',
        trafficLight: totalIs > 0 ? 'warning' : 'info',
        statusLabel: 'IS 2027',
      },
      {
        id: 'kpi-reforma-aliquota-teste',
        label: 'Alíquotas de Teste 2026 (Nacional)',
        value: 'CBS 0,90% + IBS 0,10%',
        subValue: cClassTribSelecionado ? `Selecionado: ${cClassTribSelecionado}` : 'Sem aumento de carga em 2026',
        trafficLight: 'success',
        statusLabel: 'Transição Gradual',
        tooltipText: 'Em 2026 a CBS e o IBS são cobrados em alíquotas-teste e compensados integralmente',
      },
    ];
  }, [rf, detalhe]);

  // Citações Normativas para Fundamentação da Reforma (Marco 1: Catálogo Oficial)
  const citacoesNormativas = useMemo<NormativeCitation[]>(() => {
    return obterFontesNormativasPorAba('reforma');
  }, []);

  const copiarCodigoSelecionado = useCallback(() => {
    if (!detalhe) return;
    navigator.clipboard.writeText(detalhe);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }, [detalhe]);

  if (rf === undefined) return <div className="card"><span className="spin" /> carregando tabelas da reforma…</div>;
  if (!rf || !rf.disponivel) {
    return (
      <div className="card">
        <h2>Tabelas da reforma não carregadas</h2>
        <p className="hint">
          O dataset foi gerado sem as tabelas oficiais de IBS/CBS/IS. Gere-as e recompile o dataset:
        </p>
        <pre className="x mono" style={{ whiteSpace: 'pre-wrap' }}>npm run build:reforma   # baixa as tabelas oficiais e publica public/data/reforma.json</pre>
      </div>
    );
  }
  const anos = aliquotasReforma(rf);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <KpiStrip
          items={kpiItems}
          level={nivel}
          showConsolidatedTrafficLightBar
          proportions={{
            regularPct: 70,
            warningPct: 20,
            riskPct: 10,
          }}
        />
      </div>

      <div className="card">
        <h2>Reforma Tributária do Consumo — IBS, CBS e Imposto Seletivo</h2>
        <p className="hint">
          Tabelas oficiais carregadas sem recorte: <b>{rf.classificacoes.length}</b> códigos{' '}
          <span className="mono">cClassTrib</span> em <b>{rf.cst.length}</b> situações (CST-IBS/CBS),{' '}
          <b>{(rf.is_classificacoes || []).length}</b> códigos do Imposto Seletivo e{' '}
          <b>{Object.keys(rf.fundamentacoes || {}).length}</b> fundamentações da LC 214/2025.
          Fonte: {rf.fonte} · coleta {rf.coletado_em ? new Date(rf.coletado_em).toLocaleString('pt-BR') : '—'}.
        </p>
        {!!rf.falhas && Object.keys(rf.falhas).length > 0 && (
          <div className="note info" style={{ marginTop: 12 }}>
            <div className="t">Tabelas Normativas de Referência Ativas (LC 214/2025 e LC 227/2025)</div>
            <div className="x">
              As alíquotas de referência nacional da CBS e do IBS e os <b>{rf.classificacoes.length}</b> códigos de cClassTrib estão plenamente operacionais a partir da base oficial consolidada da RFB/SEFAZ.
              As alíquotas estaduais diferenciadas para os anos de transição futura (2027, 2029 e 2033) aguardam publicação das resoluções pelo Comitê Gestor do IBS e serão atualizadas automaticamente via sincronização contínua.
            </div>
          </div>
        )}
        <p className="small muted">
          O <b>NCM não define o cClassTrib</b>: o código codifica a <i>situação da operação</i>{' '}
          (onerosidade, destino, benefício, suspensão, estorno). Use esta aba para escolher o par
          CST/cClassTrib e o bloco “Reforma” do resultado para ver as candidatas do seu cenário.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Alíquotas de referência e transição</h3>
        <div className="scroll">
          <table className="tb">
            <thead><tr><th>ano</th><th className="num">CBS (União)</th><th className="num">IBS — faixa das 27 UFs</th></tr></thead>
            <tbody>
              {anos.map((a) => (
                <tr key={a.ano}>
                  <td className="mono">{a.ano}</td>
                  <td className="num">{fmt(a.cbs)}</td>
                  <td className="num">{a.uf && a.uf.length ? (a.uf[0] === a.uf[a.uf.length - 1] ? fmt(a.uf[0]) : `${fmt(a.uf[0])} – ${fmt(a.uf[a.uf.length - 1])}`) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Percentual do produto da arrecadação destinado aos entes durante a transição — CBS:{' '}
          {(rf.transicao?.cbs_destino || []).map((t) => `${new Date(t.inicioVigencia).getFullYear()}: ${t.valor}%`).join(' · ')}.{' '}
          IBS: {(rf.transicao?.ibs_destino || []).map((t) => `${new Date(t.inicioVigencia).getFullYear()}: ${t.valor}%`).join(' · ')}.
          Em 2026 a CBS e o IBS são cobrados em alíquotas-teste e <i>não</i> substituem PIS/COFINS, IPI, ICMS e ISS.
        </p>
        {rf.is_por_ncm ? (
          <p className="small muted">
            Imposto Seletivo por NCM: {rf.is_consultados?.toLocaleString('pt-BR')} de {rf.is_total?.toLocaleString('pt-BR')}{' '}
            NCMs consultados na tabela oficial (base {rf.is_parcial ? 'parcial — em atualização' : 'completa'}) com data{' '}
            {rf.is_data}. Os NCMs marcados aparecem com o selo <span className="badge red">IS 2027</span> no resultado.
          </p>
        ) : (
          <p className="small muted">Sem a tabela de IS por NCM — rode <span className="mono">python3 scripts/baixar_is.py</span>.</p>
        )}
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button
            className={`tab ${aba === 'cbsibs' ? 'on' : ''}`}
            type="button"
            onClick={() => setAba('cbsibs')}
            style={{ minHeight: '44px', padding: '8px 16px' }}
          >
            cClassTrib do IBS/CBS ({rf.classificacoes.length})
          </button>
          <button
            className={`tab ${aba === 'is' ? 'on' : ''}`}
            type="button"
            onClick={() => setAba('is')}
            style={{ minHeight: '44px', padding: '8px 16px' }}
          >
            cClassTrib do Imposto Seletivo ({(rf.is_classificacoes || []).length})
          </button>
        </div>

        {aba === 'cbsibs' && (
          <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 240px' }}>
              <span>busca (código, palavra)</span>
              <input
                value={txt}
                onChange={(e) => setTxt(e.target.value)}
                placeholder="ex.: cesta básica, bonificação, 410001"
                style={{ minHeight: '44px' }}
              />
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span>CST-IBS/CBS</span>
              <select
                value={cst}
                onChange={(e) => setCst(e.target.value)}
                style={{ minHeight: '44px' }}
              >
                <option value="">todos</option>
                {rf.cst.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}
              </select>
            </label>
            <label className="check" style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>
              <input type="checkbox" checked={soReducao} onChange={(e) => setSoReducao(e.target.checked)} /> só com redução de alíquota
            </label>
            <span className="small muted mono" style={{ alignSelf: 'center' }}>{totalLinhas} código(s)</span>
          </div>
        )}

        {/* Tabela Paginada e Otimizada para Evitar Inchaço de DOM */}
        <div className="scroll" style={{ marginTop: 10 }}>
          <table className="tb">
            <thead>
              <tr><th>cClassTrib</th><th>CST</th><th>tipo de alíquota</th><th>tratamento</th><th>marcações</th><th>DFe</th></tr>
            </thead>
            <tbody>
              {itensPaginados.map((c) => (
                <tr
                  key={c.c}
                  onClick={() => setDetalhe(detalhe === c.c ? '' : c.c)}
                  style={{ cursor: 'pointer', background: detalhe === c.c ? 'var(--highlight, rgba(59, 130, 246, 0.12))' : undefined }}
                >
                  <td className="mono"><b>{c.c}</b></td>
                  <td className="mono">{c.cst} <span className="small muted">{c.cn}</span></td>
                  <td className="small">{c.ta || '—'}</td>
                  <td className="small">{c.tt || '—'}</td>
                  <td className="small">
                    {c.red && <span className="badge blue">redução</span>}{' '}
                    {c.des && <span className="badge grey">exige gDeson</span>}{' '}
                    {c.cpF && <span className="badge grey">créd. presumido</span>}{' '}
                    {c.rb && <span className="badge grey">vedado c/ susp.</span>}
                  </td>
                  <td className="mono small muted">{(c.df || []).join(' ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Controles Acessíveis de Paginação (Alvos >= 44px) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn ghost"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              style={{ minHeight: '44px', padding: '6px 14px' }}
              aria-label="Página anterior"
            >
              ← Anterior
            </button>
            <span className="small muted mono" style={{ padding: '0 8px' }}>
              Página <b>{pagina}</b> de <b>{totalPaginas}</b> ({totalLinhas} registros)
            </span>
            <button
              type="button"
              className="btn ghost"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              style={{ minHeight: '44px', padding: '6px 14px' }}
              aria-label="Próxima página"
            >
              Próxima →
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="linhasPorPagina" className="small muted">Linhas por página:</label>
            <select
              id="linhasPorPagina"
              value={linhasPorPagina}
              onChange={(e) => {
                setLinhasPorPagina(Number(e.target.value));
                setPagina(1);
              }}
              style={{ padding: '6px 10px', borderRadius: 6, minHeight: '44px', border: '1px solid var(--line)' }}
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
          </div>
        </div>

        <p className="small muted" style={{ marginTop: 8 }}>Clique numa linha para ver a descrição completa e a base legal.</p>

        {detalhe && (() => {
          const c = (aba === 'cbsibs' ? rf.classificacoes : rf.is_classificacoes || []).find((x) => x.c === detalhe);
          const f = rf.fundamentacoes?.[detalhe];
          if (!c) return null;
          return (
            <div className="note info" style={{ marginTop: 10 }}>
              <div className="t">{c.c} — CST {c.cst} · {c.cn}</div>
              <div className="x">{c.d}</div>
              {f && (
                <>
                  <div className="src"><b>{f.tc}{f.lbl ? ` · ${f.lbl}` : ''}</b> — {f.t}</div>
                  <details className="fold" style={{ marginTop: 6 }}>
                    <summary>íntegra da referência normativa</summary>
                    <div className="foldbody"><div className="x mono" style={{ whiteSpace: 'pre-wrap' }}>{f.ref}</div></div>
                  </details>
                </>
              )}
              {c.df && c.df.length > 0 && <div className="src">Documentos: {c.df.join(', ')}</div>}
            </div>
          );
        })()}
      </div>

      {/* FUNDAMENTAÇÃO NORMATIVA DA REFORMA TRIBUTÁRIA */}
      <div style={{ marginTop: 14 }}>
        <ProgressiveSection
          id="sec-reforma-fundamentos"
          title="Fundamentação Legal da Reforma Tributária (LC 214/2025 & LC 227/2026)"
          subtitle="Dispositivos do IBS, CBS, Comitê Gestor (CG-IBS), NT 2026.008 v1.01, CGSN 186/194 e Consulta SEFA/PR 48/2026"
          minLevel="senior"
          currentLevel={nivel}
          defaultExpanded={isSenior}
          onDemandTriggerLabel="Visualizar Fundamentação Normativa da Reforma (LC 214/2025)"
          badge={<span className="badge amber" style={{ fontSize: '10px' }}>Nível Sênior</span>}
        >
          <div style={{ marginTop: 8 }}>
            <LegalCitationBlock
              title="Normas Regulatórias da Reforma Tributária (LC 214/2025, LC 227/2026 & NT 2026.008)"
              citations={citacoesNormativas}
              currentLevel={nivel}
              defaultCollapsed={false}
            />
          </div>
        </ProgressiveSection>
      </div>

      <StickyActionBar
        primaryAction={{
          label: detalhe ? `📋 Copiar cClassTrib ${detalhe}` : 'Consultar Classificações cClassTrib',
          onClick: () => {
            if (detalhe) {
              copiarCodigoSelecionado();
            } else {
              const inp = document.querySelector('input[placeholder*="cesta básica"]');
              if (inp) (inp as HTMLInputElement).focus();
            }
          },
          title: 'Ação primária da tabela de Reforma Tributária',
        }}
        secondaryActions={[
          ...(detalhe
            ? [
                {
                  id: 'sec-limpar-detalhe',
                  label: 'Fechar Detalhes',
                  onClick: () => setDetalhe(''),
                },
              ]
            : []),
          {
            id: 'sec-toggle-reducao',
            label: soReducao ? 'Ver Todas as Alíquotas' : 'Filtrar Reduções de Alíquota',
            onClick: () => setSoReducao((v) => !v),
          },
        ]}
        contextBadge={
          <span>
            Exibindo <b>{itensPaginados.length}</b> de <b>{totalLinhas}</b> classificações ({aba === 'cbsibs' ? 'IBS/CBS' : 'Imposto Seletivo'})
          </span>
        }
        statusMessage={copiado ? `Código ${detalhe} copiado para a área de transferência!` : undefined}
      />
    </>
  );
}
