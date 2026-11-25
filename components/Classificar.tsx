'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Dataset, Record8, Reforma, describePath, labelForLevel, loadDataset, loadReforma } from '@/lib/data';
import { ReformaSugestao, sugerirReforma } from '@/lib/reforma';
import { Candidate, ParsedQuery, RuleNote, buildNotes, classify, taxes } from '@/lib/engine';
import { Operacao, Param, ParamInput, Regime, Finalidade, catalogChecklist, parameterize } from '@/lib/parametrizacao';
import {
  ParametrosErpPayload,
  ParametrosErpItem,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoTxt,
  gerarRelatorioErpDetalhadoHtml,
} from '@/lib/relatorio-erp';
import type { Empresa } from '@/lib/fiscal/perfil-tributario';
import { useEmpresaAtiva } from '@/lib/hooks/useEmpresaAtiva';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import {
  KpiStrip,
  StickyActionBar,
  ProgressiveSection,
  LegalCitationBlock,
  type KpiItemData,
  type NormativeCitation,
} from '@/components/ui';

function baixarArquivo(conteudo: string, nomeArquivo: string, mime: string) {
  if (typeof window === 'undefined' || !window.URL?.createObjectURL) return;
  const blob = new Blob([conteudo], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

const EXEMPLOS = [
  'Notebook Dell Latitude 1,4 kg com tela 14 polegadas',
  'Smartphone 128 GB com tela AMOLED',
  'Camiseta masculina de malha 100% algodão',
  'Copo descartável de plástico para bebida, 200 ml',
  'Cadeira de escritório giratória estofada com braços',
  'Ar-condicionado split hi-wall 12.000 BTUs',
  'Cerveja pilsen em lata 350 ml',
  'Pneu radial novo para automóvel de passageiros 175/70 R14',
  'Suplemento alimentar whey protein em pó baunilha 900 g',
  'Luva de borracha nitrílica para proteção hospitalar',
  'Kit presente com caneca de cerâmica e colher de aço inox',
  'Peça plástica de reposição para bomba d’água',
];

const BAND_TXT: Record<string, string> = {
  alta: 'consistente — texto da posição cobre o produto',
  media: 'parcial — falta dado técnico para fechar o 8 dígito',
  baixa: 'não feche o código — descrição insuficiente ou ambígua',
};

const fmt = (v: number | null | undefined, suf = '%') => (v === null || v === undefined ? '—' : `${v}${suf}`);

interface AiResponse {
  ncm: string;
  descricaoNcm: string;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  cstIbsCbs: string;
  cClassTrib?: string;
  sujeitoImpostoSeletivo: boolean;
  fundamentacao: string;
  motor?: string;
  valido?: boolean;
  aviso?: string;
}

export default function Classificar() {
  // 1. TODOS OS HOOKS NO TOPO ABSOLUTO (Sem retornos condicionais antes)
  const { nivel, isGerencial, isOperacional, isSenior } = useNivelOperacional();
  const { empresaAtiva, perfilAtivo } = useEmpresaAtiva();

  const [ds, setDs] = useState<Dataset | null>(null);
  const [frio, setFrio] = useState(false);
  const [reforma, setReforma] = useState<Reforma | null>(null);
  const [err, setErr] = useState('');
  const [texto, setTexto] = useState('');
  const [operacao, setOperacao] = useState<Operacao>('interna');
  const [regime, setRegime] = useState<Regime>('presumido');
  const [finalidade, setFinalidade] = useState<Finalidade>('comercializacao');
  const [ufO, setUfO] = useState('PR');
  const [ufD, setUfD] = useState('SP');
  const [aberto, setAberto] = useState(-1);
  const [mostrarTudo, setMostrarTudo] = useState(false);

  // Estados da IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [aiError, setAiError] = useState('');

  // Estados do Modal de Relatório ERP
  const [modalRelatorio, setModalRelatorio] = useState<{
    aberto: boolean;
    modo: 'resumido' | 'detalhado';
    payload: ParametrosErpPayload | null;
  }>({ aberto: false, modo: 'resumido', payload: null });
  const [formatoModal, setFormatoModal] = useState<'html' | 'txt'>('html');
  const [relatorioCopiado, setRelatorioCopiado] = useState(false);

  // Sincronização inicial com Empresa Ativa
  useEffect(() => {
    if (empresaAtiva) {
      if (empresaAtiva.uf) setUfO(empresaAtiva.uf);
      if (perfilAtivo?.regimeTributario) {
        if (perfilAtivo.regimeTributario === 'SIMPLES_NACIONAL' || perfilAtivo.regimeTributario === 'MEI') {
          setRegime('simples');
        } else if (perfilAtivo.regimeTributario === 'LUCRO_PRESUMIDO') {
          setRegime('presumido');
        } else if (perfilAtivo.regimeTributario === 'LUCRO_REAL') {
          setRegime('real');
        }
      }
    }
  }, [empresaAtiva, perfilAtivo]);

  useEffect(() => {
    loadDataset().then(async (d) => { setDs(d); await d.pronto; setFrio(true); })
      .catch((e) => setErr(String(e.message || e)));
    loadReforma().then(setReforma).catch(() => setReforma(null));
  }, []);

  useEffect(() => {
    const aplicarBuscaRapida = (termo: string) => {
      const limpo = termo.trim();
      if (!limpo) return;
      setTexto(limpo);
      setAiResult(null);
    };

    try {
      const salvo = sessionStorage.getItem('portela_quick_search_classificar');
      if (salvo) {
        aplicarBuscaRapida(salvo);
        sessionStorage.removeItem('portela_quick_search_classificar');
      }
    } catch { /* sem storage */ }

    const handleNavegarAba = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tab?: string; query?: string }>).detail;
      if (detail?.tab === 'classificar' && detail?.query) {
        aplicarBuscaRapida(detail.query);
        try {
          sessionStorage.removeItem('portela_quick_search_classificar');
        } catch { /* sem storage */ }
      }
    };

    window.addEventListener('navegar-aba', handleNavegarAba);
    return () => window.removeEventListener('navegar-aba', handleNavegarAba);
  }, []);

  useEffect(() => {
    if (!modalRelatorio.aberto || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalRelatorio({ aberto: false, modo: 'resumido', payload: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalRelatorio.aberto]);

  const res = useMemo(() => {
    if (!ds || !texto.trim()) return null;
    const r = classify(texto, ds, { top: 14 });
    const list = mostrarTudo ? r.candidates : r.candidates.filter((c) => c.score > 0);
    return { ...r, list: list.length ? list : r.candidates };
  }, [ds, texto, mostrarTudo]);

  const pinput: ParamInput = useMemo(() => ({
    operacao,
    regime,
    finalidade,
    ufOrigem: ufO,
    ufDestino: ufD,
  }), [operacao, regime, finalidade, ufO, ufD]);

  // Faixa de KPIs Executivos e Operacionais (tabular-nums)
  const kpiItems = useMemo<KpiItemData[]>(() => {
    const candidatoTopo = res?.candidates?.[0];
    const topNotes = candidatoTopo && res && ds ? buildNotes(candidatoTopo, res.query, ds, res.candidates) : null;
    const ncmAtual = aiResult?.ncm || candidatoTopo?.rec.ncm || '';
    const confiancaPct = aiResult
      ? (aiResult.confianca === 'ALTA' ? 95 : aiResult.confianca === 'MEDIA' ? 70 : 40)
      : topNotes
      ? Math.round(topNotes.confidence * 100)
      : 0;
    const confiancaTxt = aiResult
      ? `IA ${aiResult.confianca} (${confiancaPct}%)`
      : topNotes
      ? `${confiancaPct}% (${topNotes.band})`
      : '0%';

    return [
      {
        id: 'kpi-ncm-sugerido',
        label: 'NCM Sugerido / Validado',
        value: ncmAtual ? fmtCode(ncmAtual) : '—',
        subValue: aiResult
          ? (aiResult.descricaoNcm || 'Classificado por IA Especialista')
          : candidatoTopo
          ? candidatoTopo.rec.desc.replace(/^[-–\s]+/, '').slice(0, 36)
          : 'Aguardando mercadoria',
        trafficLight: ncmAtual ? 'success' : 'info',
        statusLabel: ncmAtual ? 'Identificado' : 'Pendente',
        tooltipText: 'Código NCM de 8 dígitos derivado da Nomenclatura Comum do Mercosul',
      },
      {
        id: 'kpi-confianca-classificacao',
        label: 'Confiança da Classificação',
        value: confiancaTxt,
        subValue: aiResult
          ? `Motor: ${aiResult.motor || 'Especialista'}`
          : topNotes
          ? BAND_TXT[topNotes.band] || 'Candidato aderente'
          : 'Digite a descrição',
        trafficLight: confiancaPct >= 80 ? 'success' : confiancaPct >= 50 ? 'warning' : 'danger',
        statusLabel: confiancaPct >= 80 ? 'Alta Confiança' : confiancaPct >= 50 ? 'Atenção' : 'Aguardando',
        trend: confiancaPct >= 80 ? 'up' : 'down',
        trendValue: `${confiancaPct}%`,
      },
      {
        id: 'kpi-regras-aliquotas',
        label: 'Alíquotas & Regras (RTC / PR)',
        value: candidatoTopo?.rec.ipi != null ? `IPI ${candidatoTopo.rec.ipi}%` : 'IPI Alíquota Zero',
        subValue: `CBS 0,90% · IBS 0,10% · ${regime.toUpperCase()}`,
        trafficLight: 'info',
        statusLabel: 'Vigência 2026',
        tooltipText: 'Alíquotas vigentes para a operação e regime selecionados',
      },
      {
        id: 'kpi-status-consistencia',
        label: 'Status de Consistência Fiscal',
        value: aiResult
          ? 'Parecer Concluído'
          : topNotes
          ? (topNotes.band === 'alta' ? 'Consistente' : topNotes.band === 'media' ? 'Parcial' : 'Requer Análise')
          : 'Aguardando Entrada',
        subValue: aiResult?.sujeitoImpostoSeletivo ? 'Sujeito a Imposto Seletivo' : 'Sem incidência de IS',
        trafficLight: aiResult ? 'success' : topNotes?.band === 'alta' ? 'success' : topNotes ? 'warning' : 'info',
        statusLabel: 'Conformidade',
        tooltipText: 'Validação de aderência pericial e ausência de bloqueios fiscais',
      },
    ];
  }, [res, aiResult, regime, ds]);

  // Citações Normativas para Fundamentação Legal
  const citacoesNormativas = useMemo<NormativeCitation[]>(() => {
    return [
      {
        id: 'cit-rgi-nesh',
        norma: 'Regras Gerais de Interpretação (RGI 1 a 6) & NESH',
        artigo: 'IN RFB nº 2.169/2023 / Convenção Internacional do SH',
        ementa: 'Classificação determinada pelas posições e notas de seção/capítulo (RGI 1) e subposições correlatas (RGI 6).',
        esfera: 'harmonizado-wco',
        statusVigencia: 'vigente',
      },
      {
        id: 'cit-lc-214',
        norma: 'Lei Complementar nº 214/2025',
        artigo: 'Arts. 4º, 5º e 11 — CBS, IBS e Regimes Diferenciados',
        ementa: 'Vigência do IVA Dual com alíquotas de teste em 2026 e tributação no destino da operação.',
        esfera: 'federal',
        statusVigencia: 'vigente',
      },
      {
        id: 'cit-ricms-pr',
        norma: 'RICMS/PR — Decreto Estadual nº 7.871/2017',
        artigo: 'Art. 28 Anexo VIII / ROT-ST',
        ementa: 'Diferimento parcial de ICMS e desoneração nas saídas e entradas internas.',
        esfera: 'estadual-pr',
        statusVigencia: 'vigente',
      },
    ];
  }, []);

  const consultarIA = useCallback(async () => {
    if (!texto.trim()) return;
    setAiLoading(true);
    setAiError('');
    try {
      const contexto = `Operação: ${operacao}, Regime: ${regime}, Finalidade: ${finalidade}, Origem: ${ufO}, Destino: ${ufD}`;
      const candidatosEngine = res?.candidates?.slice(0, 6).map((c) => ({
        ncm: c.rec.ncm,
        desc: c.rec.desc,
      }));
      const r = await fetch('/api/classificar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: texto,
          contextoOperacao: contexto,
          candidatos: candidatosEngine,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.error || 'Erro na resposta do servidor.');
      }
      setAiResult(data);
    } catch (e: any) {
      setAiError(e.message || 'Falha ao consultar IA.');
    } finally {
      setAiLoading(false);
    }
  }, [texto, operacao, regime, finalidade, ufO, ufD, res]);

  const abrirModalRelatorioPadrao = useCallback(() => {
    if (!aiResult && !res?.candidates?.[0]) return;
    const ncmVal = aiResult?.ncm || res?.candidates?.[0]?.rec.ncm || '';
    const descNcmVal = aiResult?.descricaoNcm || res?.candidates?.[0]?.rec.desc.replace(/^[-–\s]+/, '') || '';
    const payload: ParametrosErpPayload = {
      contexto: {
        emitente: {
          nome: empresaAtiva?.razaoSocial || 'Empresa Emitente',
          cnpj: empresaAtiva?.cnpj || undefined,
          ie: empresaAtiva?.inscricaoEstadual || undefined,
          municipioIbge: empresaAtiva?.municipioIbge || undefined,
          regime: regime === 'simples' ? 'Simples Nacional' : regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
          crt: regime === 'simples' ? '1' : '3',
          uf: ufO,
        },
        destinatario: { uf: ufD },
        operacao: {
          tipo: operacao,
          finalidade,
          modelo: '55',
          anoReforma: 2026,
        },
      },
      itens: [{
        cProd: 'PROD-001',
        xProd: texto.trim() || descNcmVal,
        ncm: ncmVal.replace(/\D/g, ''),
        descricaoNcm: descNcmVal,
        cest: '',
        cfop: operacao === 'interna' ? '5.102' : '6.102',
        cstIcms: regime === 'simples' ? '' : '00',
        csosn: regime === 'simples' ? '102' : '',
        cstIpi: '50',
        cstPis: '01',
        cstCofins: '01',
        cstIbsCbs: aiResult?.cstIbsCbs || '000',
        cClassTrib: aiResult?.cClassTrib || '000001',
        aliqCbs: '0.90',
        aliqIbsUf: '0.10',
        isTributa: !!aiResult?.sujeitoImpostoSeletivo,
        cstIs: aiResult?.sujeitoImpostoSeletivo ? '01' : '',
        instrucao: aiResult?.fundamentacao || 'Parametrização sugerida com base na NCM oficial.',
      }],
    };
    setModalRelatorio({ aberto: true, modo: 'resumido', payload });
    setFormatoModal('html');
    setRelatorioCopiado(false);
  }, [aiResult, res, empresaAtiva, regime, ufO, ufD, operacao, finalidade, texto]);

  const abrirModalRelatorioDetalhado = useCallback(() => {
    if (!aiResult && !res?.candidates?.[0]) return;
    const ncmVal = aiResult?.ncm || res?.candidates?.[0]?.rec.ncm || '';
    const descNcmVal = aiResult?.descricaoNcm || res?.candidates?.[0]?.rec.desc.replace(/^[-–\s]+/, '') || '';
    const payload: ParametrosErpPayload = {
      contexto: {
        emitente: {
          nome: empresaAtiva?.razaoSocial || 'Empresa Emitente',
          cnpj: empresaAtiva?.cnpj || undefined,
          ie: empresaAtiva?.inscricaoEstadual || undefined,
          municipioIbge: empresaAtiva?.municipioIbge || undefined,
          regime: regime === 'simples' ? 'Simples Nacional' : regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
          crt: regime === 'simples' ? '1' : '3',
          uf: ufO,
        },
        destinatario: { uf: ufD },
        operacao: {
          tipo: operacao,
          finalidade,
          modelo: '55',
          anoReforma: 2026,
        },
      },
      itens: [{
        cProd: 'PROD-001',
        xProd: texto.trim() || descNcmVal,
        ncm: ncmVal.replace(/\D/g, ''),
        descricaoNcm: descNcmVal,
        cest: '',
        cfop: operacao === 'interna' ? '5.102' : '6.102',
        cstIcms: regime === 'simples' ? '' : '00',
        csosn: regime === 'simples' ? '102' : '',
        cstIpi: '50',
        cstPis: '01',
        cstCofins: '01',
        cstIbsCbs: aiResult?.cstIbsCbs || '000',
        cClassTrib: aiResult?.cClassTrib || '000001',
        aliqCbs: '0.90',
        aliqIbsUf: '0.10',
        isTributa: !!aiResult?.sujeitoImpostoSeletivo,
        cstIs: aiResult?.sujeitoImpostoSeletivo ? '01' : '',
        instrucao: aiResult?.fundamentacao || 'Laudo pericial com fundamentação técnica e legal.',
      }],
    };
    setModalRelatorio({ aberto: true, modo: 'detalhado', payload });
    setFormatoModal('html');
    setRelatorioCopiado(false);
  }, [aiResult, res, empresaAtiva, regime, ufO, ufD, operacao, finalidade, texto]);

  if (err) return <div className="err">Não consegui carregar o dataset. Rode <code>npm run build:dados</code> e recarregue. <span className="mono">{err}</span></div>;
  if (!ds) return <div className="card"><span className="spin" /> carregando Tabela NCM vigente (10.515 códigos de 8 dígitos)…</div>;

  const semResultado = res && res.candidates.length === 0;

  return (
    <>
      <div className="st-page-header">
        <div>
          <div className="st-page-title-row">
            <h2 className="st-page-title">Classificação Fiscal</h2>
            <span className="st-badge-norma">RGI 1–6</span>
            <span className="st-badge-norma">NESH</span>
            <span className="st-badge-norma">Siscomex</span>
          </div>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Enquadramento NCM determinístico e assistido por IA com parametrização de IPI, CEST e Reforma Tributária.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <KpiStrip
          items={kpiItems}
          level={nivel}
          showConsolidatedTrafficLightBar
          proportions={{
            regularPct: res?.candidates?.[0]?.coverage ? Math.round(res.candidates[0].coverage * 70) : 40,
            warningPct: 20,
            riskPct: 15,
          }}
        />
      </div>

      <div className="card">
        <h2>Descrição da mercadoria</h2>
        <p className="hint">
          Escreva como no cadastro do produto ou na nota do fornecedor. Quanto mais <b>matéria</b>, <b>função</b> e{' '}
          <b>atributos técnicos</b> (peso, potência, composição, apresentação) você declarar, mais o agente consegue
          descer do capítulo para o subitem. Ele nunca inventa código: se o dado não basta, ele diz.
        </p>
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (aiResult) setAiResult(null);
          }}
          placeholder="ex.: Cadeira estofada giratória em polipropileno, base de aço cromado, para escritório"
        />
        <div className="chips">
          {EXEMPLOS.map((x) => (
            <button key={x} className="chip" onClick={() => { setTexto(x); setAiResult(null); }} type="button">{x}</button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="btn st-touch-target"
            style={{
              background: 'var(--portela-brand-cta)',
              color: 'var(--portela-cta-ink)',
              borderColor: 'var(--portela-brand-cta)',
              padding: '8px 14px',
              minHeight: '44px',
              fontWeight: 700,
              cursor: aiLoading || !texto.trim() ? 'not-allowed' : 'pointer',
              opacity: aiLoading || !texto.trim() ? 0.6 : 1,
            }}
            onClick={consultarIA}
            disabled={aiLoading || !texto.trim()}
          >
            {aiLoading ? <><span className="spin" /> Processando com IA…</> : '✦ Classificar com IA Especialista'}
          </button>
        </div>

        <h3>Contexto da operação (para a parametrização fiscal)</h3>
        <div className="grid g4">
          <div>
            <label className="f" htmlFor="op">Operação</label>
            <select id="op" value={operacao} onChange={(e) => setOperacao(e.target.value as Operacao)}>
              <option value="interna">Venda interna (mesma UF)</option>
              <option value="interestadual">Venda interestadual</option>
              <option value="importacao">Entrada/importação</option>
              <option value="exportacao">Exportação</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="rg">Regime do emitente</label>
            <select id="rg" value={regime} onChange={(e) => setRegime(e.target.value as Regime)}>
              <option value="simples">Simples Nacional</option>
              <option value="presumido">Lucro Presumido</option>
              <option value="real">Lucro Real</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="fi">Finalidade do produto</label>
            <select id="fi" value={finalidade} onChange={(e) => setFinalidade(e.target.value as Finalidade)}>
              <option value="comercializacao">Revenda (mercadoria de terceiros)</option>
              <option value="industrializacao">Industrialização / insumo</option>
              <option value="consumo">Consumo próprio</option>
              <option value="ativo">Ativo imobilizado</option>
            </select>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label className="f" htmlFor="ufo">UF origem</label>
              <input id="ufo" type="text" maxLength={2} value={ufO} onChange={(e) => setUfO(e.target.value.toUpperCase())} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="f" htmlFor="ufd">UF destino</label>
              <input id="ufd" type="text" maxLength={2} value={ufD} onChange={(e) => setUfD(e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <ProgressiveSection
          id="sec-classificacao-legal"
          title="Embasamento Jurídico"
          subtitle="Memória jurídica e normas aplicáveis à classificação e tributação"
          minLevel="senior"
          currentLevel={nivel}
          defaultExpanded={isSenior}
          onDemandTriggerLabel="Exibir Embasamento Jurídico e Diretrizes (NESH / RGI / LC 214)"
          badge={<span className="badge amber" style={{ fontSize: '10px' }}>Nível Sênior</span>}
        >
          <div style={{ marginTop: 8 }}>
            <LegalCitationBlock
              title="Embasamento Jurídico da Classificação Fiscal"
              citations={citacoesNormativas}
              defaultCollapsed={false}
            />
          </div>
        </ProgressiveSection>
      </div>

      {aiError && (
        <div className="err" style={{ marginTop: 10 }}>
          Falha na classificação por IA: {aiError}
        </div>
      )}

      {aiResult && (
        <div className="card" style={{ border: '2px solid rgba(59, 130, 246, 0.45)', background: 'var(--bg-surface-subtle)', margin: '14px 0' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--accent-blue)' }}>Parecer Técnico Tributário (IA Especialista)</h3>
              {aiResult.motor && (
                <span className="small muted" style={{ display: 'block', marginTop: 2 }}>
                  Motor: <b style={{ color: 'var(--accent-blue)' }}>{aiResult.motor}</b>
                </span>
              )}
            </div>
            <span className={`badge ${aiResult.confianca === 'ALTA' ? 'alta' : aiResult.confianca === 'MEDIA' ? 'media' : 'baixa'}`}>
              Confiabilidade {aiResult.confianca}
            </span>
          </div>

          <div className="taxgrid" style={{ marginTop: 12 }}>
            <Tax k="NCM Sugerido" v={fmtCode(aiResult.ncm)} />
            <Tax k="CST IBS/CBS" v={aiResult.cstIbsCbs} />
            <Tax k="cClassTrib" v={aiResult.cClassTrib || '—'} />
            <Tax k="Imposto Seletivo" v={aiResult.sujeitoImpostoSeletivo ? 'SIM' : 'NÃO'} />
            <Tax k="Descrição Oficial" v={aiResult.descricaoNcm} wide />
          </div>

          <div className="note info" style={{ marginTop: 12 }}>
            <div className="t">Fundamentação Normativa (NESH / LC 214 e 227)</div>
            <div className="x">{aiResult.fundamentacao}</div>
          </div>

          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="st-btn-secondary st-touch-target"
              style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.35)', fontWeight: 600, padding: '6px 12px', minHeight: '44px' }}
              onClick={() => {
                const payload: ParametrosErpPayload = {
                  contexto: {
                    emitente: {
                      nome: empresaAtiva?.razaoSocial || 'Empresa Emitente',
                      cnpj: empresaAtiva?.cnpj || undefined,
                      ie: empresaAtiva?.inscricaoEstadual || undefined,
                      municipioIbge: empresaAtiva?.municipioIbge || undefined,
                      regime: regime === 'simples' ? 'Simples Nacional' : regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
                      crt: regime === 'simples' ? '1' : '3',
                      uf: ufO,
                    },
                    destinatario: { uf: ufD },
                    operacao: {
                      tipo: operacao,
                      finalidade,
                      modelo: '55',
                      anoReforma: 2026,
                    },
                  },
                  itens: [{
                    cProd: 'PROD-001',
                    xProd: texto.trim() || aiResult.descricaoNcm,
                    ncm: aiResult.ncm.replace(/\D/g, ''),
                    descricaoNcm: aiResult.descricaoNcm,
                    cest: '',
                    cfop: operacao === 'interna' ? '5.102' : '6.102',
                    cstIcms: regime === 'simples' ? '' : '00',
                    csosn: regime === 'simples' ? '102' : '',
                    cstIpi: '50',
                    cstPis: '01',
                    cstCofins: '01',
                    cstIbsCbs: aiResult.cstIbsCbs || '000',
                    cClassTrib: aiResult.cClassTrib || '000001',
                    aliqCbs: '0.90',
                    aliqIbsUf: '0.10',
                    isTributa: aiResult.sujeitoImpostoSeletivo,
                    cstIs: aiResult.sujeitoImpostoSeletivo ? '01' : '',
                    instrucao: aiResult.fundamentacao,
                  }],
                };
                setModalRelatorio({ aberto: true, modo: 'resumido', payload });
                setFormatoModal('html');
                setRelatorioCopiado(false);
              }}
              title="Gerar relatório de parametrização no modo resumido (somente campo e código correspondente)"
            >
              📋 Relatório ERP (Modo Resumido)
            </button>
            <button
              type="button"
              className="btn st-touch-target"
              style={{ fontWeight: 700, padding: '6px 12px', minHeight: '44px' }}
              onClick={() => {
                const payload: ParametrosErpPayload = {
                  contexto: {
                    emitente: {
                      nome: empresaAtiva?.razaoSocial || 'Empresa Emitente',
                      cnpj: empresaAtiva?.cnpj || undefined,
                      ie: empresaAtiva?.inscricaoEstadual || undefined,
                      municipioIbge: empresaAtiva?.municipioIbge || undefined,
                      regime: regime === 'simples' ? 'Simples Nacional' : regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
                      crt: regime === 'simples' ? '1' : '3',
                      uf: ufO,
                    },
                    destinatario: { uf: ufD },
                    operacao: {
                      tipo: operacao,
                      finalidade,
                      modelo: '55',
                      anoReforma: 2026,
                    },
                  },
                  itens: [{
                    cProd: 'PROD-001',
                    xProd: texto.trim() || aiResult.descricaoNcm,
                    ncm: aiResult.ncm.replace(/\D/g, ''),
                    descricaoNcm: aiResult.descricaoNcm,
                    cest: '',
                    cfop: operacao === 'interna' ? '5.102' : '6.102',
                    cstIcms: regime === 'simples' ? '' : '00',
                    csosn: regime === 'simples' ? '102' : '',
                    cstIpi: '50',
                    cstPis: '01',
                    cstCofins: '01',
                    cstIbsCbs: aiResult.cstIbsCbs || '000',
                    cClassTrib: aiResult.cClassTrib || '000001',
                    aliqCbs: '0.90',
                    aliqIbsUf: '0.10',
                    isTributa: aiResult.sujeitoImpostoSeletivo,
                    cstIs: aiResult.sujeitoImpostoSeletivo ? '01' : '',
                    instrucao: aiResult.fundamentacao,
                  }],
                };
                setModalRelatorio({ aberto: true, modo: 'detalhado', payload });
                setFormatoModal('html');
                setRelatorioCopiado(false);
              }}
              title="Gerar laudo pericial no modo detalhado com citação legal completa (lei, dispositivo, artigo)"
            >
              ⚖️ Relatório ERP (Modo Detalhado com Citação Legal)
            </button>
            <a
              className="mini st-touch-target"
              href="#parametrizar"
              style={{
                background: 'var(--accent-blue-subtle)',
                color: 'var(--accent-blue)',
                borderColor: 'rgba(59, 130, 246, 0.35)',
                fontWeight: 600,
                padding: '8px 14px',
                minHeight: '44px',
                borderRadius: 6,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
              title="abrir a aba de parametrização de ERP com este NCM sugerido"
              onClick={() => {
                const dados = {
                  ncm: aiResult.ncm,
                  descricao: texto || aiResult.descricaoNcm,
                  operacao,
                  regime,
                  finalidade,
                  ufOrigem: ufO,
                  ufDestino: ufD,
                  cClassTrib: aiResult.cClassTrib,
                };
                try {
                  sessionStorage.setItem('ncm-para-parametrizar', JSON.stringify(dados));
                  sessionStorage.setItem('ncm-abas', 'parametrizar');
                } catch { /* ignora */ }
                window.dispatchEvent(new CustomEvent('navegar-aba', { detail: { tab: 'parametrizar', ...dados } }));
              }}
            >
              parametrizar no ERP →
            </a>
          </div>
        </div>
      )}

      {semResultado && !aiResult && (
        <div className="err">
          Nenhum código da Tabela NCM vigente descreve essa mercadoria. Reescreva em termos de <b>matéria</b> e{' '}
          <b>função</b> (ex.: “utensílio de mesa de plástico” em vez de “linha casa”) — ou clique em <b>Classificar com IA Especialista</b> acima.
        </div>
      )}

      {res?.list.map((c, i) => (
        <Resultado
          key={c.rec.d8} ds={ds} idx={i} cand={c} aberto={aberto === i}
          onOpen={() => setAberto(aberto === i ? -1 : i)}
          q={res.query} pin={pinput} forcar={mostrarTudo} frio={frio} reforma={reforma}
          empresaAtiva={empresaAtiva}
          onGerarRelatorio={(modo, payload) => {
            setModalRelatorio({ aberto: true, modo, payload });
            setFormatoModal('html');
            setRelatorioCopiado(false);
          }}
        />
      ))}

      {res && res.list.length > 0 && res.list.length < res.candidates.length && (
        <div className="row" style={{ marginTop: -4 }}>
          <button className="mini" type="button" onClick={() => setMostrarTudo(true)}>
            ver {res.candidates.length - res.list.length} candidato(s) de baixa aderência
          </button>
        </div>
      )}

      {modalRelatorio.aberto && modalRelatorio.payload && (() => {
        const payload = modalRelatorio.payload;
        const relatorioHtml = modalRelatorio.modo === 'resumido'
          ? gerarRelatorioErpResumidoHtml(payload)
          : gerarRelatorioErpDetalhadoHtml(payload);
        const relatorioTxt = modalRelatorio.modo === 'resumido'
          ? gerarRelatorioErpResumidoTxt(payload)
          : gerarRelatorioErpDetalhadoTxt(payload);

        const copiarTexto = async (conteudo: string) => {
          try {
            await navigator.clipboard.writeText(conteudo);
            setRelatorioCopiado(true);
            setTimeout(() => setRelatorioCopiado(false), 2000);
          } catch {
            /* ignora */
          }
        };

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Relatório de Parametrização Fiscal para ERP"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(14, 21, 17, 0.78)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                background: 'var(--bg-surface-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 12,
                maxWidth: 950,
                width: '100%',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-subtle)',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: '1.1rem', fontFamily: 'var(--font-display)' }}>
                    Relatório de Parametrização Fiscal para ERP — Modo {modalRelatorio.modo === 'resumido' ? 'Resumido' : 'Detalhado'}
                  </h3>
                  <span className="small muted">
                    {modalRelatorio.modo === 'resumido'
                      ? 'Exibição técnica enxuta (campo e código correspondente)'
                      : 'Laudo pericial com fundamentação jurídica (lei, dispositivo, artigo)'}
                  </span>
                </div>
                <button
                  type="button"
                  className="mini st-touch-target"
                  aria-label="Fechar relatório"
                  onClick={() => setModalRelatorio({ aberto: false, modo: 'resumido', payload: null })}
                  style={{ minHeight: '44px', minWidth: '44px', fontSize: '1.15rem', cursor: 'pointer', color: 'var(--ink)' }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  padding: '10px 20px',
                  background: 'var(--bg-surface-card)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="mini st-touch-target"
                    onClick={() => setFormatoModal('html')}
                    style={{
                      background: formatoModal === 'html' ? 'var(--portela-brand-cta)' : 'var(--bg-surface-subtle)',
                      color: formatoModal === 'html' ? 'var(--portela-cta-ink)' : 'var(--ink)',
                      borderColor: formatoModal === 'html' ? 'var(--portela-brand-cta)' : 'var(--border-medium)',
                      fontWeight: formatoModal === 'html' ? 700 : 600,
                    }}
                  >
                    HTML
                  </button>
                  <button
                    type="button"
                    className="mini st-touch-target"
                    onClick={() => setFormatoModal('txt')}
                    style={{
                      background: formatoModal === 'txt' ? 'var(--portela-brand-cta)' : 'var(--bg-surface-subtle)',
                      color: formatoModal === 'txt' ? 'var(--portela-cta-ink)' : 'var(--ink)',
                      borderColor: formatoModal === 'txt' ? 'var(--portela-brand-cta)' : 'var(--border-medium)',
                      fontWeight: formatoModal === 'txt' ? 700 : 600,
                    }}
                  >
                    TXT
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="mini st-touch-target"
                    onClick={() => baixarArquivo(
                      relatorioHtml,
                      `relatorio_erp_${modalRelatorio.modo}.html`,
                      'text/html; charset=utf-8'
                    )}
                    style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.35)' }}
                  >
                    ⬇ Baixar HTML
                  </button>
                  <button
                    type="button"
                    className="mini st-touch-target"
                    onClick={() => baixarArquivo(
                      relatorioTxt,
                      `relatorio_erp_${modalRelatorio.modo}.txt`,
                      'text/plain; charset=utf-8'
                    )}
                    style={{ background: 'var(--accent-emerald-glow)', color: 'var(--ok)', borderColor: 'var(--border-emerald-glow)' }}
                  >
                    ⬇ Baixar TXT
                  </button>
                  <button
                    type="button"
                    className="mini st-touch-target"
                    onClick={() => copiarTexto(formatoModal === 'html' ? relatorioHtml : relatorioTxt)}
                  >
                    Copiar {relatorioCopiado ? '✓' : ''}
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 20, background: 'var(--bg-app)' }}>
                {formatoModal === 'html' ? (
                  <iframe
                    title="Pré-visualização do Relatório ERP"
                    srcDoc={relatorioHtml}
                    style={{ width: '100%', height: '550px', border: '1px solid var(--border-medium)', background: '#ffffff', borderRadius: 6 }}
                  />
                ) : (
                  <pre
                    className="tabular-nums"
                    style={{
                      background: 'var(--bg-surface-input)',
                      color: 'var(--on-surface)',
                      padding: 16,
                      borderRadius: 6,
                      border: '1px solid var(--border-medium)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '550px',
                      overflow: 'auto',
                    }}
                  >
                    {relatorioTxt}
                  </pre>
                )}
              </div>

              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setModalRelatorio({ aberto: false, modo: 'resumido', payload: null })}
                  className="mini st-touch-target"
                  style={{ minHeight: '44px', padding: '8px 16px', cursor: 'pointer' }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <StickyActionBar
        primaryAction={{
          label: aiResult
            ? '📋 Relatório ERP Resumido'
            : texto.trim()
            ? (aiLoading ? 'Processando com IA...' : '✦ Classificar com IA Especialista')
            : 'Digitar Mercadoria para Classificar',
          onClick: () => {
            if (aiResult) {
              abrirModalRelatorioPadrao();
            } else if (texto.trim()) {
              consultarIA();
            } else {
              const ta = document.querySelector('textarea');
              if (ta) ta.focus();
            }
          },
          loading: aiLoading,
          disabled: aiLoading || (!texto.trim() && !aiResult),
          title: 'Ação primária de classificação fiscal',
        }}
        secondaryActions={[
          ...(aiResult
            ? [
                {
                  id: 'sec-laudo-detalhado',
                  label: '⚖️ Relatório Detalhado',
                  onClick: () => abrirModalRelatorioDetalhado(),
                },
                {
                  id: 'sec-limpar-analise',
                  label: 'Nova Análise',
                  onClick: () => {
                    setTexto('');
                    setAiResult(null);
                  },
                },
              ]
            : texto.trim()
            ? [
                {
                  id: 'sec-limpar-texto',
                  label: 'Limpar Texto',
                  onClick: () => {
                    setTexto('');
                    setAiResult(null);
                  },
                },
              ]
            : []),
        ]}
        contextBadge={
          <span>
            {empresaAtiva ? <b>{empresaAtiva.razaoSocial} · </b> : null}
            Op: <b>{operacao.toUpperCase()}</b> · Origem: <b>{ufO}</b> → Destino: <b>{ufD}</b> · Regime: <b>{regime.toUpperCase()}</b>
          </span>
        }
      />
    </>
  );
}

function Resultado({ ds, idx, cand, q, aberto, onOpen, pin, forcar, frio, reforma, empresaAtiva, onGerarRelatorio }: {
  ds: Dataset; idx: number; cand: Candidate; q: ParsedQuery; aberto: boolean;
  onOpen: () => void; pin: ParamInput; forcar: boolean; frio: boolean; reforma: Reforma | null;
  empresaAtiva?: Empresa | null;
  onGerarRelatorio?: (modo: 'resumido' | 'detalhado', payload: ParametrosErpPayload) => void;
}) {
  const { notes, confidence, band } = buildNotes(cand, q, ds, [cand]);
  const rec: Record8 = cand.rec;
  const tx = taxes(rec, ds);
  const path = describePath(ds, rec);
  const param: Param = useMemo(() => parameterize(rec, ds, pin), [rec, ds, pin]);
  const checklist = useMemo(() => catalogChecklist(rec, ds), [rec, ds]);
  const anoReforma = (rec.ini || '').endsWith('/2027') || (rec.ini || '') > '31/12/2026' ? 2027 : 2026;
  const ref: ReformaSugestao = useMemo(
    () => sugerirReforma(reforma, rec, pin, anoReforma, q.raw,
      { cst: (/CST (\d\d)/.exec(param.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '') || [])[1] }),
    [reforma, rec, pin, anoReforma, q.raw, param.blocks]);
  const criticas = notes.filter((n) => n.severidade === 'critico').length;

  return (
    <section className={`res ${band}`}>
      <div className="res-main">
        <span className={`res rank tabular-nums ${idx === 0 ? 'first' : ''}`}>#{idx + 1}</span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="ncm-code tabular-nums">{rec.ncm}</span>
            <span className={`badge tabular-nums ${band}`}>{Math.round(confidence * 100)}%</span>
            {rec.gen === 1 && <span className="badge grey">residual “Outros”</span>}
            {tx.st && <span className="badge blue">CEST</span>}
            {tx.extarif && <span className="badge blue">NCM-Ex</span>}
            {rec.is === 1 && <span className="badge red">IS 2027</span>}
            {criticas > 0 && <span className="badge red tabular-nums">{criticas} alerta(s) legal(is)</span>}
            {idx > 0 && !forcar && <span className="badge grey">alternativa</span>}
          </div>
          <div className="ncm-desc">{rec.desc.replace(/^[-–\s]+/, '')}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{BAND_TXT[band]}</div>
        </div>
        <div className={`conf ${band}`}>
          <div className="small muted tabular-nums">aderência {Math.round(cand.coverage * 100)}% · frase legal {cand.phrase ? 'sim' : 'não'}</div>
          <div className="bar"><div className="fill" style={{ width: `${Math.round(confidence * 100)}%` }} /></div>
        </div>
      </div>

      <div className="taxgrid">
        <Tax k="IPI (TIPI)" v={rec.ipi_nt ? 'NT' : fmt(tx.ipi)} />
        <Tax k="II (TEC)" v={fmt(tx.ii)} />
        <Tax k="TEC Mercosul" v={fmt(tx.tec)} />
        <Tax k="CEST" v={tx.cest.length ? tx.cest.map((c) => c.code).join(', ') : '—'} wide />
        <Tax k="Ato legal" v={rec.ato || '—'} wide />
        <Tax k="Vigência" v={`${rec.ini || '—'}${rec.fim && rec.fim !== '31/12/9999' ? ` → ${rec.fim}` : ''}`} wide />
      </div>

      <div className="row" style={{ margin: '0 16px 12px', gap: 8 }}>
        <button
          className="mini st-touch-target"
          type="button"
          onClick={onOpen}
          style={{
            background: 'var(--accent-amber-subtle)',
            color: 'var(--warn)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            fontWeight: 700,
            cursor: 'pointer',
            padding: '8px 14px',
            minHeight: '44px',
            borderRadius: 6,
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          title={aberto ? 'Ocultar fundamentação e atributos' : 'Ver fundamentação, parametrização e atributos'}
        >
          {aberto ? '▲ ocultar fundamentação' : '▼ ver fundamentação, parametrização e atributos'}
        </button>
        <a
          className="mini"
          href="#parametrizar"
          style={{
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 14px',
          }}
          title="abrir a aba de parametrização de ERP com este NCM"
          onClick={() => {
            const dados = {
              ncm: rec.ncm,
              descricao: q.raw || rec.desc,
              operacao: pin.operacao,
              regime: pin.regime,
              finalidade: pin.finalidade,
              ufOrigem: pin.ufOrigem,
              ufDestino: pin.ufDestino,
            };
            try {
              sessionStorage.setItem('ncm-para-parametrizar', JSON.stringify(dados));
              sessionStorage.setItem('ncm-abas', 'parametrizar');
            } catch { /* ignora */ }
            window.dispatchEvent(new CustomEvent('navegar-aba', { detail: { tab: 'parametrizar', ...dados } }));
          }}
        >
          parametrizar no ERP →
        </a>
      </div>

      {aberto && (
        <div className="foldbody" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Hierarquia legal (RGI 1 → RGI 6)</h3>
          <ul className="path">
            {path.map((p, i) => (
              <li key={p.code}>
                <code>{fmtCode(p.code)}</code>{' '}
                <span className={i === path.length - 1 ? '' : 'muted'}>{labelForLevel(p.code.length)}: {p.desc}</span>
              </li>
            ))}
          </ul>

          <h3>Fundamentação e checagens</h3>
          {notes.map((n) => <Nota key={n.id + n.titulo} n={n} ds={ds} />)}

          <h3>Parametrização sugerida do item</h3>
          <div className="grid g3">
            {param.blocks.map((b) => (
              <div key={b.titulo} className="note" style={{ margin: 0 }}>
                <div className="t">{b.titulo} {b.codigo ? <span className="badge blue">{b.codigo}</span> : null}</div>
                <div className="x">{b.detalhe}</div>
                {b.notas.length > 0 && (
                  <ul className="x" style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                    {b.notas.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                )}
                {b.confirmar && <div className="src">⚠ sugestão — confirmar com o regulamento do estado e o texto legal antes de emitir.</div>}
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            CFOPs compatíveis: {param.cfops.slice(0, 6).map((c) => `${c.c} (${c.a})`).join(' · ')}
          </p>

          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="st-btn-secondary st-touch-target"
              style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.35)', fontWeight: 600, padding: '6px 12px', minHeight: '44px' }}
              onClick={() => {
                if (!onGerarRelatorio) return;
                const payload: ParametrosErpPayload = {
                  contexto: {
                    emitente: {
                      nome: empresaAtiva?.razaoSocial || 'Empresa Emitente',
                      cnpj: empresaAtiva?.cnpj || undefined,
                      ie: empresaAtiva?.inscricaoEstadual || undefined,
                      municipioIbge: empresaAtiva?.municipioIbge || undefined,
                      regime: pin.regime === 'simples' ? 'Simples Nacional' : pin.regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
                      crt: pin.regime === 'simples' ? '1' : '3',
                      uf: pin.ufOrigem,
                    },
                    destinatario: { uf: pin.ufDestino },
                    operacao: {
                      tipo: pin.operacao,
                      finalidade: pin.finalidade,
                      modelo: '55',
                      anoReforma: anoReforma,
                    },
                  },
                  itens: [{
                    cProd: 'PROD-001',
                    xProd: q.raw || rec.desc.replace(/^[-–\s]+/, ''),
                    ncm: rec.d8,
                    descricaoNcm: rec.desc.replace(/^[-–\s]+/, ''),
                    cest: tx.cest[0]?.code || '',
                    cfop: param.cfops[0]?.c || (pin.operacao === 'interna' ? '5.102' : '6.102'),
                    cstIcms: param.blocks.find((b) => /ICMS/.test(b.titulo))?.codigo || '',
                    csosn: param.blocks.find((b) => /CSOSN/.test(b.titulo))?.codigo || '',
                    cstIpi: param.blocks.find((b) => /IPI/.test(b.titulo))?.codigo || '',
                    aliqIpi: rec.ipi != null ? String(rec.ipi) : '',
                    cstPis: param.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '',
                    cstCofins: param.blocks.find((b) => /COFINS/.test(b.titulo))?.codigo || '',
                    cstIbsCbs: ref?.cbsibs?.[0]?.cst || '000',
                    cClassTrib: ref?.cbsibs?.[0]?.codigo || '000001',
                    aliqCbs: '0.90',
                    aliqIbsUf: '0.10',
                    aliqIbsMun: '0.00',
                    isTributa: rec.is === 1,
                    cstIs: rec.is === 1 ? '01' : '',
                    instrucao: `Classificação NCM ${rec.ncm} com confiança ${Math.round(confidence * 100)}%. ${ref?.cbsibs?.[0]?.descricao || ''}`,
                  }],
                };
                onGerarRelatorio('resumido', payload);
              }}
              title="Gerar relatório de parametrização no modo resumido (somente campo e código correspondente)"
            >
              📋 Gerar Relatório ERP (Modo Resumido)
            </button>
            <button
              type="button"
              className="btn st-touch-target"
              style={{ fontWeight: 700, padding: '6px 12px', minHeight: '44px' }}
              onClick={() => {
                if (!onGerarRelatorio) return;
                const payload: ParametrosErpPayload = {
                  contexto: {
                    emitente: {
                      nome: empresaAtiva?.razaoSocial || 'Empresa Emitente',
                      cnpj: empresaAtiva?.cnpj || undefined,
                      ie: empresaAtiva?.inscricaoEstadual || undefined,
                      municipioIbge: empresaAtiva?.municipioIbge || undefined,
                      regime: pin.regime === 'simples' ? 'Simples Nacional' : pin.regime === 'presumido' ? 'Lucro Presumido' : 'Lucro Real',
                      crt: pin.regime === 'simples' ? '1' : '3',
                      uf: pin.ufOrigem,
                    },
                    destinatario: { uf: pin.ufDestino },
                    operacao: {
                      tipo: pin.operacao,
                      finalidade: pin.finalidade,
                      modelo: '55',
                      anoReforma: anoReforma,
                    },
                  },
                  itens: [{
                    cProd: 'PROD-001',
                    xProd: q.raw || rec.desc.replace(/^[-–\s]+/, ''),
                    ncm: rec.d8,
                    descricaoNcm: rec.desc.replace(/^[-–\s]+/, ''),
                    cest: tx.cest[0]?.code || '',
                    cfop: param.cfops[0]?.c || (pin.operacao === 'interna' ? '5.102' : '6.102'),
                    cstIcms: param.blocks.find((b) => /ICMS/.test(b.titulo))?.codigo || '',
                    csosn: param.blocks.find((b) => /CSOSN/.test(b.titulo))?.codigo || '',
                    cstIpi: param.blocks.find((b) => /IPI/.test(b.titulo))?.codigo || '',
                    aliqIpi: rec.ipi != null ? String(rec.ipi) : '',
                    cstPis: param.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '',
                    cstCofins: param.blocks.find((b) => /COFINS/.test(b.titulo))?.codigo || '',
                    cstIbsCbs: ref?.cbsibs?.[0]?.cst || '000',
                    cClassTrib: ref?.cbsibs?.[0]?.codigo || '000001',
                    aliqCbs: '0.90',
                    aliqIbsUf: '0.10',
                    aliqIbsMun: '0.00',
                    isTributa: rec.is === 1,
                    cstIs: rec.is === 1 ? '01' : '',
                    instrucao: `Classificação NCM ${rec.ncm} com confiança ${Math.round(confidence * 100)}%. ${ref?.cbsibs?.[0]?.descricao || ''}`,
                  }],
                };
                onGerarRelatorio('detalhado', payload);
              }}
              title="Gerar laudo pericial no modo detalhado com citação legal completa (lei, dispositivo, artigo)"
            >
              ⚖️ Gerar Relatório ERP (Modo Detalhado com Citação Legal)
            </button>
          </div>

          <h3>Reforma tributária do consumo — IBS / CBS / IS (LC 214/2025)</h3>
          <ReformaCard r={ref} ano={anoReforma} />

          <h3>Atributos exigidos no Catálogo de Produtos / DUIMP</h3>
          {!frio && <p className="small muted"><span className="spin" /> carregando CEST, atributos e base legal…</p>}
          {checklist.length === 0 ? (
            <p className="small muted">Sem atributos cadastrados para este NCM.</p>
          ) : (
            <>
              <p className="small muted">
                Se o produto for objeto de importação/exportação, estes campos são exigidos pelo CADA.{' '}
                {checklist.filter((c) => c.obrig).length} obrigatório(s).
              </p>
              <div className="grid g3">
                {checklist.slice(0, 9).map((a) => (
                  <div key={a.code} className="note" style={{ margin: 0 }}>
                    <div className="t">{a.nome} {a.obrig ? <span className="badge red">obrigatório</span> : <span className="badge grey">opcional</span>}</div>
                    <div className="x">{a.modalidade} · {a.forma || 'livre'}</div>
                    {a.orientacao && <div className="src">{a.orientacao}</div>}
                    {a.orgaos && <div className="src">Órgão: {a.orgaos}</div>}
                    {a.dominios.length > 0 && (
                      <div className="mini-list">
                        {a.dominios.slice(0, 8).map((d) => <span key={d[0]} className="badge grey mono">{d[0]} {d[1].slice(0, 34)}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>Transparência do cálculo</h3>
          <div className="kv">
            <dt>Termos casados</dt>
            <dd>{cand.matched.length ? cand.matched.map((m) => <span key={m.term} className="badge grey" style={{ marginRight: 4 }}>{m.term} <b className="muted">{m.where}</b></span>) : 'código digitado diretamente'}</dd>
            <dt>Não reconhecidos</dt><dd className="muted">{q.unmatched.length ? q.unmatched.join(', ') : '— todos reconhecidos na tabela'}</dd>
            <dt>Matéria detectada</dt><dd>{q.material || 'não informada'}</dd>
            <dt>Uso detectado</dt><dd>{q.uso || 'não informado'}</dd>
            <dt>Medidas/atributos</dt><dd>{q.medidas.length ? q.medidas.join(', ') : 'nenhum número com unidade'}</dd>
            <dt>Score bruto</dt><dd className="mono tabular-nums">{cand.score.toFixed(2)} · cobertura {(cand.coverage * 100).toFixed(0)}%</dd>
          </div>
        </div>
      )}
    </section>
  );
}

function Tax({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return <div className="tax" style={wide ? { minWidth: 160 } : undefined}><div className="k">{k}</div><div className="v mono tabular-nums">{v}</div></div>;
}

function ReformaCard({ r, ano }: { r: ReformaSugestao; ano: number }) {
  if (!r.temTabela) {
    return (
      <div className="note atencao">
        <div className="t">Tabela cClassTrib não carregada</div>
        <div className="x">{r.falta[0] || 'Rode `npm run build:reforma` (ou o botão da aba Regras) para baixar as tabelas oficiais da reforma e gere o dataset.'}</div>
      </div>
    );
  }
  return (
    <>
      <div className="taxgrid">
        <Tax k={`CBS (União) ${ano}`} v={r.aliquotas?.cbs !== undefined ? `${String(r.aliquotas.cbs).replace('.', ',')}%` : '—'} />
        <Tax k={`IBS UF+Mun ${ano}`} v={r.aliquotas?.ufFaixa ? `${r.aliquotas.ufFaixa} (faixa oficial)` : '—'} />
        <Tax k="Imposto Seletivo (2027)" v={r.is.tributa ? 'SIM — na tabela oficial' : (r.is.adv === null && r.is.are === null ? 'não indicado' : 'não indicado')} />
        {r.is.tributa && <Tax k="Alíquotas do IS" v={[r.is.adv != null ? `${String(r.is.adv).replace('.', ',')}%` : null, r.is.are != null ? `${String(r.is.are).replace('.', ',')} ${r.is.un || 'un'}` : null].filter(Boolean).join(' + ') || 'ver base legal'} />}
      </div>
      <table className="tb" style={{ marginTop: 10 }}>
        <thead><tr><th>CST-IBS/CBS</th><th>cClassTrib</th><th>tratamento</th><th>classificação oficial</th></tr></thead>
        <tbody>
          {r.cbsibs.map((c) => (
            <tr key={c.codigo}>
              <td className="mono tabular-nums">{c.cst} <span className="muted small">{c.cstNome}</span></td>
              <td className="mono tabular-nums"><b>{c.codigo}</b>{c.reducao && <span className="badge blue" style={{ marginLeft: 4 }}>redução</span>}</td>
              <td className="small">{c.tratamento || '—'}</td>
              <td className="small">{c.descricao}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.fundamentos.length > 0 && (
        <details className="fold" style={{ marginTop: 8 }}>
          <summary>Base legal das candidatas ({r.fundamentos.length}) — texto da LC 214/2025</summary>
          <div className="foldbody">
            {r.fundamentos.map((f) => (
              <div key={f.codigo} className="note info" style={{ margin: '0 0 8px' }}>
                <div className="t tabular-nums">{f.codigo} · {f.curto}{f.lbl && f.lbl !== f.curto ? ` — ${f.lbl}` : ''}</div>
                <div className="x">{f.texto}</div>
                <div className="src mono">{f.referencia.slice(0, 260)}</div>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="note atencao" style={{ marginTop: 8 }}>
        <div className="t">O que falta para fechar o código</div>
        <ul className="x" style={{ margin: 0, paddingLeft: 16 }}>
          {r.falta.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
        <div className="src">
          Candidatas derivadas das tabelas oficiais (dados abertos da Calculadora de Tributos do
          Consumo — RFB). O cClassTrib é do <i>contribuinte na operação</i>: confirme antes de emitir.
        </div>
      </div>
    </>
  );
}

function Nota({ n, ds }: { n: RuleNote; ds: Dataset }) {
  return (
    <div className={`note ${n.severidade || 'info'}`}>
      <div className="t">
        <span className={`badge ${n.kind === 'Nota Legal' ? 'red' : n.kind === 'Armadilha' ? 'media' : 'grey'}`} style={{ marginRight: 6 }}>{n.kind}</span>
        {n.id} — {n.titulo}
      </div>
      <div className="x">{n.texto}</div>
      {n.ncms && n.ncms.length > 0 && (
        <div className="mini-list">
          {n.ncms.map((c) => <span key={c} className="badge grey mono" title={ds.byD8.get(c.replace(/\D/g, ''))?.desc || ''}>{c}</span>)}
        </div>
      )}
      {n.fonte && <div className="src">Origem: {n.fonte}</div>}
    </div>
  );
}

function fmtCode(c: string) {
  if (c.length === 4) return `${c.slice(0, 4)}`;
  if (c.length === 6) return `${c.slice(0, 4)}.${c.slice(4)}`;
  if (c.length === 8) return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;
  return c;
}