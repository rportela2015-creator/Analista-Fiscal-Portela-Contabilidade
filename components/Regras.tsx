'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dataset, loadDataset } from '@/lib/data';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import {
  KpiStrip,
  ProgressiveSection,
  LegalCitationBlock,
  type KpiItemData,
  type NormativeCitation,
} from '@/components/ui';

export default function Regras() {
  // 1. TODOS OS HOOKS NO TOPO ABSOLUTO (antes de qualquer return condicional)
  const { nivel, isSenior } = useNivelOperacional();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [abrindo, setAbrindo] = useState('');
  const [saida, setSaida] = useState('');
  const [trabalhando, setTrabalhando] = useState(false);

  useEffect(() => { loadDataset().then(async (d) => { setDs(d); await d.pronto; }).catch(() => setDs(null)); }, []);

  const kpiItems = useMemo<KpiItemData[]>(() => {
    const r = ds?.rules;
    const totalNcms = ds?.records?.length ?? 0;
    const totalRgi = r?.rgi?.length ?? 0;
    const totalNotas = r?.notas_legais?.length ?? 0;
    const totalArmadilhas = r?.armadilhas?.length ?? 0;
    const invalidos = Number(ds?.meta?.validacao?.invalidos ?? 0);

    return [
      {
        id: 'kpi-regras-ncms',
        label: 'Base Oficial NCM (Siscomex)',
        value: totalNcms > 0 ? totalNcms.toLocaleString('pt-BR') : '—',
        subValue: ds?.meta?.ncm_vigente || 'Tabela NCM vigente',
        trafficLight: totalNcms > 0 ? 'info' : 'warning',
        statusLabel: 'Oficial',
      },
      {
        id: 'kpi-regras-rgi-notas',
        label: 'Camadas RGI & Notas Legais',
        value: `${totalRgi} RGI · ${totalNotas} Notas`,
        subValue: 'Regras Gerais de Interpretação SH',
        trafficLight: 'success',
        statusLabel: 'Ativo',
      },
      {
        id: 'kpi-regras-armadilhas',
        label: 'Armadilhas Monitoradas',
        value: `${totalArmadilhas} regras`,
        subValue: 'Travamento preventivo de ambiguidade',
        trafficLight: totalArmadilhas > 0 ? 'warning' : 'info',
        statusLabel: 'Auditoria',
      },
      {
        id: 'kpi-regras-integridade',
        label: 'Integridade das Referências',
        value: `${invalidos} inválidos`,
        subValue: `${Number(ds?.meta?.validacao?.ncs_citados_nas_regras ?? 0).toLocaleString('pt-BR')} NCMs validados`,
        trafficLight: invalidos === 0 ? 'success' : 'danger',
        statusLabel: invalidos === 0 ? '100% Íntegro' : 'Verificar',
      },
    ];
  }, [ds]);

  const citacoesNormativas = useMemo<NormativeCitation[]>(() => [
    {
      id: 'cit-regras-nesh',
      norma: 'IN RFB nº 2.169/2023 & NESH',
      artigo: 'Regras Gerais para Interpretação do Sistema Harmonizado (RGI 1 a 6)',
      ementa: 'Critérios hierárquicos determinísticos para classificação de mercadorias com notas explicativas oficiais.',
      esfera: 'harmonizado-wco',
      statusVigencia: 'vigente',
    },
    {
      id: 'cit-regras-lc214',
      norma: 'Lei Complementar nº 214/2025 & NT 2026.008',
      artigo: 'Catálogo cClassTrib IBS/CBS e Imposto Seletivo',
      ementa: 'Integração das tabelas abertas da Calculadora de Tributos do Consumo (RFB) ao motor de parametrização.',
      esfera: 'federal',
      statusVigencia: 'vigente',
    },
  ], []);

  if (!ds) return <div className="card"><span className="spin" /> carregando…</div>;
  const r = ds.rules;

  const atualizar = async (tipo: 'fontes' | 'completo' | 'reforma') => {
    setTrabalhando(true); setSaida('…');
    try {
      const res = await fetch(`/api/atualizar?tipo=${tipo}`, { method: 'POST' });
      const j = await res.json();
      setSaida([`HTTP ${res.status}`, j.stdout?.slice(-4000) || '', j.error || ''].join('\n'));
    } catch (e) { setSaida(String(e)); } finally { setTrabalhando(false); }
  };

  return (
    <>
      <div className="st-page-header">
        <div>
          <div className="st-page-title-row">
            <h2 className="st-page-title">Regras e Fontes</h2>
            <span className="st-badge-norma">RGI 1–6</span>
            <span className="st-badge-norma">NESH</span>
            <span className="st-badge-norma">Siscomex</span>
            <span className="st-badge-norma">LC 214/2025</span>
          </div>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Motor determinístico auditável, camadas de regras legais e fontes oficiais do Portal Único e RFB.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <KpiStrip items={kpiItems} level={nivel} />
      </div>

      <div className="card">
        <h2>Critérios de Decisão</h2>
        <p className="hint">
          O motor é determinístico e auditável: retrieval lexical sobre a Tabela NCM vigente + camadas das Regras
          Gerais de Interpretação e das Notas Legais. Nada aqui é opinião de modelo de linguagem sobre tributação —
          cada código exibido existe na tabela oficial baixada do Portal Único.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {r.resumo_rotina.map((x, i) => <li key={i} className="small" style={{ marginBottom: 4 }}>{x}</li>)}
        </ol>
      </div>

      <div className="card">
        <h2>Regras RGI e RLI</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
          {r.rgi.map((g) => (
            <div key={g.id} className="note info" style={{ margin: 0 }}>
              <div className="t tabular-nums">{g.id} — {g.titulo}</div>
              <div className="x">{g.texto}</div>
              <div className="src"><b>Quando:</b> {g.quando}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Notas Legais</h2>
        <p className="hint">Restrições que costumam tirar o produto do capítulo óbvio. O agente as anexa ao resultado quando o capítulo é tocado.</p>
        {r.notas_legais.map((n, idx) => (
          <div key={(n as any).id || n.alcance || (n as any).titulo || idx} className="note atencao" style={{ margin: '0 0 10px' }}>
            <div className="t">{n.alcance || (n as any).titulo || (n as any).id || 'Nota Legal'}</div>
            <div className="x">{n.texto}</div>
            <div className="mini-list">{n.ncms.map((c) => <span key={c} className="badge grey mono tabular-nums" title={ds.byD8.get(c.replace(/\D/g, ''))?.desc || 'fora da lista'}>{c}</span>)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Armadilhas Monitoradas</h2>
        <p className="hint">Padrões em que o cadastro de produto quase sempre chega incompleto. Cada um gera nota e, quando aplicável, pedido explícito do dado que falta.</p>
        {r.armadilhas.map((a) => (
          <details key={a.id} className="fold" style={{ border: '1px solid var(--border-medium)', borderRadius: 10, marginBottom: 8 }}
            open={abrindo === a.id} onToggle={(e) => setAbrindo((e.target as HTMLDetailsElement).open ? a.id : '')}>
            <summary>{a.titulo}</summary>
            <div className="foldbody">
              <div className="x small">{a.explicacao}</div>
              <dl className="kv" style={{ marginTop: 10 }}>
                <dt>Dispara por</dt><dd className="small">{a.quando.join(' · ')}</dd>
                <dt>Ação</dt><dd className="small mono">{a.acao}</dd>
                <dt>Códigos guias</dt>
                <dd>{(a.candidatos || []).map((c) => <span key={c} className="badge grey mono tabular-nums" style={{ marginRight: 4 }} title={ds.byD8.get(c.replace(/\D/g, ''))?.desc || ''}>{c}</span>)}</dd>
                <dt>Base</dt><dd className="small muted">{a.fonte}</dd>
              </dl>
            </div>
          </details>
        ))}
        <p className="small muted tabular-nums">
          Vocabulário carregado: {Object.keys(r.sinonimos).length} apelidos comerciais → nomes técnicos,{' '}
          {Object.keys(r.materiais).length} matérias, {Object.keys(r.usos).length} usos,{' '}
          {r.genericas.length} descrições residuais, {r.jargao_sem_valor_fiscal?.length || 0} termos de catálogo sem
          valor fiscal. Todos os NCMs citados nestas regras foram validados contra a tabela oficial na geração do
          dataset.
        </p>
      </div>

      <div className="card">
        <h2>Fontes e Atualização</h2>
        <p className="hint tabular-nums">
          Dataset gerado em <b>{new Date(ds.meta.gerado_em).toLocaleString('pt-BR')}</b> · Tabela NCM{' '}
          <b>{ds.meta.ncm_vigente}</b> · <b>{ds.meta.ncm_ato}</b>
        </p>
        {ds.meta.aviso_fontes && (
          <div className="note critico" style={{ margin: '0 0 10px' }}>
            <div className="t">Dados nem frescos — fonte indisponível na última coleta</div>
            <div className="x">{ds.meta.aviso_fontes}</div>
          </div>
        )}
        <table className="tb">
          <thead><tr><th>base</th><th>origem</th><th>status</th><th className="num">linhas</th></tr></thead>
          <tbody>
            {Object.entries(ds.meta.fontes).map(([k, f]) => (
              <tr key={k}>
                <td className="mono small">{k}</td>
                <td className="small">{f.nome}{f.api ? <> · <a href={f.api} target="_blank" rel="noreferrer" className="mono small">api</a></> : ''}{f.url ? <> · <a href={f.url} target="_blank" rel="noreferrer" className="mono small">portal</a></> : ''}</td>
                <td className="small muted">{f.status}</td>
                <td className="num tabular-nums">{f.linhas?.toLocaleString('pt-BR') ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Contagens e validação</h3>
        <div className="row">
          {Object.entries(ds.meta.contagens).map(([k, v]) => (
            <span key={k} className="badge grey tabular-nums">{k}: {Number(v).toLocaleString('pt-BR')}</span>
          ))}
          <span className="badge alta tabular-nums">NCMs citados nas regras: {Number(ds.meta.validacao.ncs_citados_nas_regras ?? 0).toLocaleString('pt-BR')}</span>
          <span className="badge alta tabular-nums">códigos inexistentes na tabela: {Number(ds.meta.validacao.invalidos ?? 0)}</span>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Validação registrada na geração: NCMs do agregador vs. Siscomex oficial —{' '}
          <span className="mono tabular-nums">{String(ds.meta.validacao.ncm_agregador_vs_siscomex)}</span>.
          PIS/COFINS e CEST são derivados e marcados como <i>confirmar</i>; IPI/II vêm de tabelas secundárias e
          devem ser conferidos no texto legal antes de uso fiscal.
        </p>

        <h3>Tabelas da reforma do consumo (IBS/CBS/IS)</h3>
        <p className="small muted tabular-nums">
          Vêm dos dados abertos da Calculadora de Tributos do Consumo (RFB), sem chave: tabela de
          CST-IBS/CBS, os {Number(ds.meta.validacao.reform_classes ?? 0).toLocaleString('pt-BR')} códigos cClassTrib com a fundamentação
          da LC 214/2025, as alíquotas de referência por UF/ano e a base do Imposto Seletivo por NCM
          (1 requisição por código — o script <code className="mono">scripts/baixar_is.py</code> retoma do
          cache se for interrompido). Se nada disso estiver disponível, o app não inventa código: o bloco
          “Reforma” do resultado avisa que a tabela não foi carregada.
        </p>

        <h3>Rebaixar dados do Portal Único Siscomex</h3>
        <p className="small muted">
          Executa <code className="mono">scripts/baixar_fontes.py</code> e <code className="mono">scripts/pipeline.py</code> no
          servidor, revalida cada NCM citado nas regras e regenera o dataset. Requer acesso de rede ao portal.
        </p>
        <div className="row">
          <button className="btn st-touch-target" style={{ minHeight: '44px' }} type="button" onClick={() => atualizar('completo')} disabled={trabalhando}>
            {trabalhando ? <><span className="spin" /> atualizando…</> : 'baixar fontes + regenerar dataset'}
          </button>
          <button className="btn ghost st-touch-target" style={{ minHeight: '44px' }} type="button" onClick={() => atualizar('fontes')} disabled={trabalhando}>só baixar fontes</button>
          <button className="btn ghost st-touch-target" style={{ minHeight: '44px' }} type="button" onClick={() => atualizar('reforma')} disabled={trabalhando} title="Tabelas oficiais de IBS/CBS/IS + Imposto Seletivo por NCM (lento)">
            baixar tabelas da reforma
          </button>
        </div>
        {saida && (
          <pre
            className="mono small tabular-nums"
            style={{
              background: 'var(--bg-surface-input)',
              color: 'var(--on-surface)',
              border: '1px solid var(--border-medium)',
              padding: 12,
              borderRadius: 10,
              overflow: 'auto',
              maxHeight: 320,
              whiteSpace: 'pre-wrap',
              marginTop: 12,
            }}
          >
            {saida}
          </pre>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <ProgressiveSection
          id="sec-regras-fundamentacao"
          title="Fundamentação Normativa do Motor"
          subtitle="Base jurídica do Sistema Harmonizado, NESH e tabelas da Reforma"
          minLevel="senior"
          currentLevel={nivel}
          defaultExpanded={isSenior}
          onDemandTriggerLabel="Exibir Fundamentação Normativa das Regras"
          badge={<span className="badge amber" style={{ fontSize: '10px' }}>Nível Sênior</span>}
        >
          <LegalCitationBlock
            title="Normas e Fontes Oficiais"
            citations={citacoesNormativas}
            currentLevel={nivel}
            defaultCollapsed={false}
          />
        </ProgressiveSection>
      </div>
    </>
  );
}
