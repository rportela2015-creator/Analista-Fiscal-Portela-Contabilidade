'use client';

/**
 * PARAMETRIZAÇÃO DE ERP — a tela onde se informa o cadastro da empresa e o cenário da
 * operação; o app devolve os códigos (NCM, CEST/CEF, CFOP, CST/CSOSN, IPI, cClassTrib,
 * CST-IBS/CBS, IS) e a maqueta de XML do item, com as conferências de schema.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dataset, ErpTabela, Reforma, Record8, loadDataset, loadErpTabela, loadReforma, normalizeNcm } from '@/lib/data';
import { classify } from '@/lib/engine';
import { XmlCtx, cUF, montarXml, MODELOS, XmlParam } from '@/lib/xml';
import { Finalidade, Operacao, Regime, parametrizarLoteNfe } from '@/lib/parametrizacao';
import type { ParametrizacaoItemInput } from '@/lib/extrator-nfe-types';
import { buscarClassificacoes } from '@/lib/reforma';
import {
  ParametrosErpPayload,
  ParametrosErpItem,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoTxt,
  gerarRelatorioErpDetalhadoHtml,
} from '@/lib/relatorio-erp';

function baixarArquivo(conteudo: string, nomeArquivo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function abrirEmNovaAba(conteudoHtml: string) {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(conteudoHtml);
    win.document.close();
  }
}

function extrairPayloadErp(
  ctx: XmlCtx,
  rec: Record8 | null,
  p: XmlParam | null,
  texto: string,
): ParametrosErpPayload {
  const camposProd = p?.campos.find((b) => b.tag === 'prod')?.campos || [];
  const camposIcms = p?.campos.find((b) => b.grupo.startsWith('ICMS'))?.campos || [];
  const camposIpi = p?.campos.find((b) => b.grupo === 'IPI' || b.tag === 'gIPI')?.campos || [];
  const camposPis = p?.campos.find((b) => b.grupo === 'PIS/COFINS' || b.tag === 'tributosPisCofins')?.campos || [];
  const camposIbs = p?.campos.find((b) => b.tag === 'IBSCBS')?.campos || [];
  const camposIs = p?.campos.find((b) => b.tag === 'IS')?.campos || [];

  const cfopTag = camposProd.find((c) => c.tag === 'CFOP')?.valor || (ctx.operacao === 'interna' ? '5.102' : '6.102');
  const cestTag = camposProd.find((c) => c.tag === 'CEST')?.valor || (rec?.cest || [])[0] || '';
  const cstIcms = camposIcms.find((c) => c.tag === 'CST')?.valor || '';
  const csosn = camposIcms.find((c) => c.tag === 'CSOSN')?.valor || '';
  const cstIpi = camposIpi.find((c) => c.tag === 'CST')?.valor || '';
  const aliqIpi = camposIpi.find((c) => c.tag === 'pIPI')?.valor || (rec?.ipi != null ? String(rec.ipi) : '');
  const cstPis = camposPis.find((c) => c.tag === 'PIS/CST')?.valor || '';
  const cstCofins = camposPis.find((c) => c.tag === 'COFINS/CST')?.valor || '';
  const cstIbsCbs = camposIbs.find((c) => c.tag === 'CST')?.valor || '';
  const cClassTrib = camposIbs.find((c) => c.tag === 'cClassTrib')?.valor || ctx.cClassTribForcado || '';
  const aliqCbs = camposIbs.find((c) => c.tag === 'pCBS')?.valor || '';
  const aliqIbsUf = camposIbs.find((c) => c.tag === 'pIBSUF')?.valor || '';
  const aliqIbsMun = camposIbs.find((c) => c.tag === 'pIBSMun')?.valor || '';
  const isTributa = camposIs.length > 0;
  const cstIs = camposIs.find((c) => c.tag === 'CSTIS')?.valor || '';
  const aliqIsAdv = camposIs.find((c) => c.tag === 'pIS')?.valor || '';

  const item: ParametrosErpItem = {
    cProd: 'PROD-001',
    xProd: texto.trim() || rec?.desc?.replace(/^[-–\s]+/, '') || 'Produto parametrizado',
    ncm: rec?.d8 || '',
    descricaoNcm: rec?.desc?.replace(/^[-–\s]+/, '') || '',
    cest: cestTag,
    cfop: cfopTag,
    cstIcms: cstIcms,
    csosn: csosn,
    cstIpi: cstIpi,
    aliqIpi: aliqIpi,
    cstPis: cstPis,
    cstCofins: cstCofins,
    cstIbsCbs: cstIbsCbs,
    cClassTrib: cClassTrib,
    aliqCbs: aliqCbs,
    aliqIbsUf: aliqIbsUf,
    aliqIbsMun: aliqIbsMun,
    isTributa: isTributa,
    cstIs: cstIs,
    aliqIsAdv: aliqIsAdv,
    instrucao: p?.resumo || 'Parametrização gerada conforme regras oficiais.',
  };

  return {
    contexto: {
      emitente: {
        cnpj: ctx.cnpj,
        ie: ctx.ie,
        municipioIbge: ctx.municipioIbge,
        uf: ctx.ufEmi,
        regime: ctx.regime,
        crt: ctx.regime === 'simples' ? '1' : '3',
        regApIBSCBSSN: ctx.regApIBSCBSSN,
      },
      destinatario: {
        cnpjCpf: ctx.cnpjDest,
        ie: ctx.ieDest,
        uf: ctx.ufDest,
      },
      operacao: {
        tipo: ctx.operacao,
        finalidade: ctx.finalidade,
        modelo: ctx.modelo,
        anoReforma: ctx.anoReforma,
      },
    },
    itens: [item],
  };
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const SELO_CLASSE: Record<string, string> = { oficial: 'oficial', duvidoso: 'duvidoso', inferido: 'inferido', derivada: 'derivada' };

const FONTES: Record<string, string> = { 'tabela oficial': 'selo-oficial', 'regra do app': 'selo-derivada', 'a preencher': 'selo-inferido' };

export interface ParametrizarProps {
  itensImportados?: ParametrizacaoItemInput[];
}

export default function Parametrizar({ itensImportados }: ParametrizarProps = {}) {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [reforma, setReforma] = useState<Reforma | null>(null);
  const [erp, setErp] = useState<ErpTabela | null>(null);
  const [ctx, setCtx] = useState<XmlCtx>({
    cnpj: '', ie: '', municipioIbge: '4120308', ufEmi: 'PR', regime: 'presumido', modelo: '55',
    operacao: 'interna', finalidade: 'comercializacao', ufDest: 'SP', cnpjDest: '', ieDest: '',
    tpAmb: '1', finNFe: '1', indFinal: 1, indPres: '2', modFrete: '9', st: false, beneficiado: false,
    industrial: false, nbs: '', cClassTribForcado: '', cClassTribRegForcado: '', regApIBSCBSSN: '',
    cClassReferenciada: '', tpNFCredito: '', tpNFDebito: '', anoReforma: 2026,
  });
  const [texto, setTexto] = useState('Cadeira de escritório giratória estofada em polipropileno');
  const [ncmManual, setNcmManual] = useState('');
  const [aba, setAba] = useState<'xml' | 'tabela'>('xml');
  const [copiado, setCopiado] = useState('');
  const [buscaTabela, setBuscaTabela] = useState('');
  const [soOficial, setSoOficial] = useState(false);
  const [modalRelatorio, setModalRelatorio] = useState<{ aberto: boolean; modo: 'resumido' | 'detalhado' }>({ aberto: false, modo: 'resumido' });
  const [formatoModal, setFormatoModal] = useState<'html' | 'txt'>('html');
  const [relatorioCopiado, setRelatorioCopiado] = useState('');
  const [loteItens, setLoteItens] = useState<ParametrizacaoItemInput[]>(itensImportados || []);
  const [itemLoteAtivo, setItemLoteAtivo] = useState<number | null>(null);

  useEffect(() => {
    loadDataset().then(async (d) => { setDs(d); await d.pronto; }).catch(() => setDs(null));
    loadReforma().then(setReforma).catch(() => setReforma(null));
    loadErpTabela().then(setErp).catch(() => setErp(null));
  }, []);

  useEffect(() => {
    if (itensImportados && itensImportados.length > 0) {
      setLoteItens(itensImportados);
    }
  }, [itensImportados]);

  useEffect(() => {
    const aplicarParametrizacao = (dados: any) => {
      if (!dados) return;
      if (dados.ncm) setNcmManual(dados.ncm);
      if (dados.descricao) setTexto(dados.descricao);
      if (dados.itensErp && Array.isArray(dados.itensErp)) {
        setLoteItens(dados.itensErp);
      }
      setCtx((c) => ({
        ...c,
        operacao: dados.operacao || c.operacao,
        regime: dados.regime || c.regime,
        finalidade: dados.finalidade || c.finalidade,
        ufEmi: dados.ufOrigem || c.ufEmi,
        ufDest: dados.ufDestino || c.ufDest,
        cClassTribForcado: dados.cClassTrib || c.cClassTribForcado,
      }));
    };

    try {
      const salvo = sessionStorage.getItem('ncm-para-parametrizar');
      if (salvo) {
        aplicarParametrizacao(JSON.parse(salvo));
        sessionStorage.removeItem('ncm-para-parametrizar');
      }
      const salvoLote = sessionStorage.getItem('ncm-parametrizar-itens');
      if (salvoLote) {
        const parsed = JSON.parse(salvoLote);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLoteItens(parsed);
        }
      }
    } catch { /* sem storage */ }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        aplicarParametrizacao(detail);
      }
    };
    window.addEventListener('navegar-aba', handler);
    return () => window.removeEventListener('navegar-aba', handler);
  }, []);

  // Todos os hooks abaixo têm de rodar em qualquer render — um `return` antecipado antes
  // deles mudaria a ordem dos hooks e o React estoura ("rendered more hooks than before").
  const cls = useMemo(() => (ds && texto.trim() ? classify(texto, ds, { top: 6 }) : null), [texto, ds]);
  const rec = useMemo(() => {
    if (!ds) return null;
    const manual = normalizeNcm(ncmManual).replace(/\D/g, '');
    if (manual.length === 8) return ds.byD8.get(manual) || null;
    return cls?.candidates[0]?.rec || null;
  }, [ncmManual, cls, ds]);
  const p = useMemo(() => (ds ? montarXml(ctx, ds, reforma, rec) : null), [ctx, ds, reforma, rec]);

  const linhasTabela = useMemo(() => {
    if (!erp) return [];
    const t = buscaTabela.trim().toLowerCase();
    return erp.itens.filter((i) => {
      if (soOficial && i.selo !== 'oficial') return false;
      if (!t) return true;
      return i.tag.toLowerCase().includes(t) || i.desc.toLowerCase().includes(t) || i.ex.toLowerCase().includes(t);
    });
  }, [erp, buscaTabela, soOficial]);

  const resultadoDiagnosticoLote = useMemo(() => {
    if (!loteItens || loteItens.length === 0) return null;
    return parametrizarLoteNfe(loteItens, {
      ufOrigem: ctx.ufEmi,
      ufDestino: ctx.ufDest,
    });
  }, [loteItens, ctx.ufEmi, ctx.ufDest]);

  if (!ds || !p) return <div className="card"><span className="spin" /> carregando dataset…</div>;
  const set = <K extends keyof XmlCtx>(k: K, val: XmlCtx[K]) => setCtx((c) => ({ ...c, [k]: val }));

  const exportarLoteCsv = () => {
    if (!loteItens || loteItens.length === 0) return;
    const diag = resultadoDiagnosticoLote?.diagnosticos || [];
    const header = 'Codigo;Descricao;NCM;CEST;CFOP_Origem;CFOP_Entrada;CFOP_Saida;CST_ICMS;CSOSN;cClassTrib;CST_IBS_CBS;Reducao_IBS_CBS_Pct;Beneficio_PR;FCP_Pct;Status;Alertas\r\n';
    const rows = diag.map((d) => {
      const it = d.item;
      const status = d.conferido ? 'CONFERIDO' : 'BLOQUEANTE';
      const alertas = [...d.bloqueantes, ...d.alertas].join(' | ');
      return `"${it.codigoProduto}";"${(it.descricao || '').replace(/"/g, '""')}";"${it.ncm}";"${it.cest || ''}";"${it.cfopOrigem}";"${it.cfopEntradaSugerido}";"${it.cfopSaidaSugerido}";"${it.cstIcmsOrigem || ''}";"${it.csosnOrigem || ''}";"${it.cClassTribSugerido || ''}";"${it.cstIbsCbsSugerido || ''}";"${it.reducaoIbsCbsPct}%";"${it.beneficioIcmsPr || ''}";"${it.fcpPct || 0}%";"${status}";"${alertas.replace(/"/g, '""')}"`;
    }).join('\r\n');
    baixarArquivo('\uFEFF' + header + rows, 'lote_parametrizado_erp.csv', 'text/csv;charset=utf-8');
  };

  const exportarLoteJson = () => {
    if (!loteItens || loteItens.length === 0) return;
    const dados = resultadoDiagnosticoLote || { itensParametrizados: loteItens };
    baixarArquivo(JSON.stringify(dados, null, 2), 'lote_parametrizado_erp.json', 'application/json');
  };

  const carregarItemDoLote = (item: ParametrizacaoItemInput, idx: number) => {
    setTexto(item.descricao);
    setNcmManual(item.ncm);
    setItemLoteAtivo(idx);
    setCtx((c) => ({
      ...c,
      cClassTribForcado: item.cClassTribSugerido || c.cClassTribForcado,
      st: (item.cfopEntradaSugerido && ['1403', '2403'].includes(item.cfopEntradaSugerido)) || c.st,
    }));
  };

  const limparLote = () => {
    setLoteItens([]);
    setItemLoteAtivo(null);
    try {
      sessionStorage.removeItem('ncm-parametrizar-itens');
    } catch { /* sem storage */ }
  };

  const copiar = async (rotulo: string, conteudo: string) => {
    try {
      await navigator.clipboard.writeText(conteudo);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(''), 2200);
    } catch { setCopiado('use Ctrl+C (clipboard bloqueado)'); setTimeout(() => setCopiado(''), 2600); }
  };

  const erros = p!.verificacoes.filter((x) => x.nivel === 'erro').length;

  return (
    <>
      {/* ---------------- PAINEL EXECUTIVO: LOTE DE ENTRADA (NF-E) ---------------- */}
      {loteItens && loteItens.length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: '#f8fafc', border: '1px solid #cbd5e1', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--ink)' }}>
                📦 Itens Recebidos da Auditoria de Entrada (NF-e) — {loteItens.length} {loteItens.length === 1 ? 'item' : 'itens'}
              </h3>
              <p className="hint" style={{ margin: '3px 0 0', fontSize: 12.5 }}>
                Parametrização cadastral em lote com de-para de CFOP, detecção O(1) de benefícios fiscais, cClassTrib da Reforma e FCP.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {resultadoDiagnosticoLote && (
                <>
                  <span
                    className="badge"
                    style={{
                      background: resultadoDiagnosticoLote.totalBloqueantes === 0 ? '#ecfdf5' : '#fee2e2',
                      color: resultadoDiagnosticoLote.totalBloqueantes === 0 ? '#065f46' : '#991b1b',
                      border: '1px solid #cbd5e1',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    {resultadoDiagnosticoLote.totalBloqueantes === 0
                      ? '✓ 100% dos Itens Aptos'
                      : `⛔ ${resultadoDiagnosticoLote.totalBloqueantes} bloqueio(s)`}
                  </span>
                  {resultadoDiagnosticoLote.totalAlertas > 0 && (
                    <span
                      className="badge media"
                      style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600 }}
                    >
                      ⚠️ {resultadoDiagnosticoLote.totalAlertas} alerta(s)
                    </span>
                  )}
                </>
              )}
              <button
                type="button"
                className="mini"
                onClick={exportarLoteCsv}
                style={{ background: '#107c41', color: '#fff', borderColor: '#107c41', fontWeight: 600, padding: '5px 10px' }}
                title="Exportar parâmetros cadastrais dos itens em formato CSV"
              >
                📥 Exportar CSV
              </button>
              <button
                type="button"
                className="mini"
                onClick={exportarLoteJson}
                style={{ background: '#0b3d91', color: '#fff', borderColor: '#0b3d91', fontWeight: 600, padding: '5px 10px' }}
                title="Exportar parâmetros em formato JSON para integração com ERP"
              >
                📥 Exportar JSON
              </button>
              <button
                type="button"
                className="mini"
                onClick={limparLote}
                style={{ color: 'var(--bad)', fontWeight: 600, padding: '5px 8px' }}
                title="Remover itens importados da NF-e"
              >
                ✕ Limpar Lote
              </button>
            </div>
          </div>

          {/* Tabela do Lote */}
          <div className="scroll" style={{ marginTop: 12, maxHeight: '280px' }}>
            <table className="tb" style={{ minWidth: 960, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>#</th>
                  <th style={{ width: 100 }}>Cód. Prod</th>
                  <th style={{ minWidth: 220 }}>Descrição Comercial</th>
                  <th style={{ width: 95 }}>NCM</th>
                  <th style={{ width: 130 }}>CFOP Entrada / Saída</th>
                  <th style={{ width: 140 }}>cClassTrib / IBS-CBS</th>
                  <th style={{ minWidth: 160 }}>Benefício Fiscal / Status</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {(resultadoDiagnosticoLote?.diagnosticos || loteItens.map(it => ({ item: it, bloqueantes: [], alertas: [], conferido: true }))).map((diag, idx) => {
                  const it = diag.item;
                  const isAtivo = itemLoteAtivo === idx;
                  return (
                    <tr
                      key={idx}
                      style={{
                        background: isAtivo ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fcfcfc',
                        cursor: 'pointer',
                      }}
                      onClick={() => carregarItemDoLote(it, idx)}
                    >
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{it.codigoProduto}</td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.descricao}>
                        {it.descricao}
                      </td>
                      <td className="mono">{it.ncm}</td>
                      <td>
                        <span className="badge" style={{ background: '#f1f5f9', color: '#1e293b', fontSize: 10.5 }}>
                          {it.cfopEntradaSugerido} ➔ {it.cfopSaidaSugerido}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', fontSize: 10.5 }}>
                          {it.cClassTribSugerido || '000001'} {it.reducaoIbsCbsPct > 0 ? `(-${it.reducaoIbsCbsPct}%)` : ''}
                        </span>
                      </td>
                      <td>
                        {diag.bloqueantes.length > 0 ? (
                          <span className="badge baixa" style={{ fontSize: 10.5 }}>
                            ⛔ {diag.bloqueantes[0]}
                          </span>
                        ) : it.beneficioIcmsPr ? (
                          <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontSize: 10.5 }} title={it.beneficioIcmsPr}>
                            🏷️ {it.beneficioIcmsPr}
                          </span>
                        ) : (
                          <span className="badge alta" style={{ fontSize: 10.5 }}>
                            ✓ Apto
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="mini"
                          onClick={(e) => {
                            e.stopPropagation();
                            carregarItemDoLote(it, idx);
                          }}
                          style={{
                            padding: '2px 8px',
                            fontSize: 11,
                            background: isAtivo ? 'var(--brand)' : '#fff',
                            color: isAtivo ? '#fff' : 'var(--brand)',
                            borderColor: 'var(--brand)',
                            fontWeight: 600,
                          }}
                          title="Carregar parâmetros deste item no formulário e gerar XML"
                        >
                          {isAtivo ? '✓ Selecionado' : 'Carregar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Parametrização de ERP</h2>
        <p className="hint">
          Informe o cadastro da empresa e o cenário da operação. O app devolve os <b>códigos</b> que o emissor
          precisa (NCM, CEST/CEF, CFOP, CST/CSOSN, CST do IPI, PIS/COFINS, CST-IBS/CBS, <b>cClassTrib</b>, IS) e a
          <b> maqueta de XML</b> do documento. Códigos vêm das tabelas oficiais carregadas; campos de
          <i> valor e alíquota estadual</i> saem marcados “a preencher”, porque dependem da UF e do regime.
        </p>

        <h3>Empresa / emitente</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
          <label className="field"><span>CNPJ (14 dígitos)</span>
            <input value={ctx.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="ex.: 12.345.678/0001-90" /></label>
          <label className="field"><span>Inscrição Estadual</span>
            <input value={ctx.ie} onChange={(e) => set('ie', e.target.value)} placeholder="número ou ISENTO" /></label>
          <label className="field"><span>Município (código IBGE)</span>
            <input value={ctx.municipioIbge} onChange={(e) => set('municipioIbge', e.target.value)} placeholder="7 dígitos" /></label>
          <label className="field"><span>UF do emitente</span>
            <select value={ctx.ufEmi} onChange={(e) => set('ufEmi', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field"><span>Regime tributário</span>
            <select value={ctx.regime} onChange={(e) => set('regime', e.target.value as Regime)}>
              <option value="simples">Simples Nacional (CRT 1)</option>
              <option value="presumido">Lucro Presumido (CRT 3)</option>
              <option value="real">Lucro Real (CRT 3)</option>
            </select></label>
          {ctx.regime === 'simples' && (
            <label className="field"><span>Apuração IBS/CBS no Simples</span>
              <select value={ctx.regApIBSCBSSN} onChange={(e) => set('regApIBSCBSSN', e.target.value as XmlCtx['regApIBSCBSSN'])}>
                <option value="">— não informado —</option>
                <option value="0">0 — apuração normal</option>
                <option value="1">1 — apuração simplificada</option>
              </select></label>
          )}
        </div>

        <h3>Documento e operação</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
          <label className="field"><span>Modelo</span>
            <select value={ctx.modelo} onChange={(e) => set('modelo', e.target.value as XmlCtx['modelo'])}>
              {MODELOS.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
            </select></label>
          <label className="field"><span>Operação</span>
            <select value={ctx.operacao} onChange={(e) => set('operacao', e.target.value as Operacao)}>
              <option value="interna">interna (mesma UF)</option>
              <option value="interestadual">interestadual</option>
              <option value="importacao">importação</option>
              <option value="exportacao">exportação</option>
            </select></label>
          <label className="field"><span>Finalidade</span>
            <select value={ctx.finalidade} onChange={(e) => set('finalidade', e.target.value as Finalidade)}>
              <option value="comercializacao">revenda / comercialização</option>
              <option value="industrializacao">industrialização</option>
              <option value="consumo">uso e consumo</option>
              <option value="ativo">ativo imobilizado</option>
            </select></label>
          <label className="field"><span>UF do destinatário</span>
            <select value={ctx.ufDest} onChange={(e) => set('ufDest', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field"><span>CNPJ do destinatário</span>
            <input value={ctx.cnpjDest} onChange={(e) => set('cnpjDest', e.target.value)} placeholder="opcional" /></label>
          <label className="field"><span>IE do destinatário</span>
            <input value={ctx.ieDest} onChange={(e) => set('ieDest', e.target.value)} placeholder="se contribuinte" /></label>
          <label className="field"><span>Ambiente</span>
            <select value={ctx.tpAmb} onChange={(e) => set('tpAmb', e.target.value as '1' | '2')}>
              <option value="1">1 — produção</option><option value="2">2 — homologação</option>
            </select></label>
          <label className="field"><span>finNFe</span>
            <select value={ctx.finNFe} onChange={(e) => set('finNFe', e.target.value as XmlCtx['finNFe'])}>
              <option value="1">1 — normal</option><option value="2">2 — complementar valores</option>
              <option value="3">3 — ajuste de nota</option><option value="4">4 — devolução</option>
            </select></label>
          {(ctx.finNFe === '2' || ctx.finNFe === '3') && (
            <label className="field"><span>tpNFCredito / tpNFDebito</span>
              <input value={ctx.tpNFCredito} onChange={(e) => set('tpNFCredito', e.target.value)} placeholder="ex.: 04 (redução de valores)" /></label>
          )}
          <label className="field"><span>indFinal (consumidor final)</span>
            <select value={String(ctx.indFinal)} onChange={(e) => set('indFinal', +e.target.value as 0 | 1)}>
              <option value="1">1 — sim</option><option value="0">0 — não</option>
            </select></label>
          <label className="field"><span>indPres (presença)</span>
            <select value={ctx.indPres} onChange={(e) => set('indPres', e.target.value as XmlCtx['indPres'])}>
              <option value="0">0 — ausente</option><option value="1">1 — presencial</option>
              <option value="2">2 — internet</option><option value="3">3 — teleatendimento</option><option value="9">9 — outros</option>
            </select></label>
          <label className="field"><span>modFrete</span>
            <select value={ctx.modFrete} onChange={(e) => set('modFrete', e.target.value as XmlCtx['modFrete'])}>
              {['0', '1', '2', '3', '4', '9'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select></label>
          {ctx.modelo === 'nfs-e' && (
            <label className="field"><span>NBS do serviço</span>
              <input value={ctx.nbs} onChange={(e) => set('nbs', e.target.value)} placeholder="1.0301.31.00" /></label>
          )}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <label className="check"><input type="checkbox" checked={ctx.st} onChange={(e) => set('st', e.target.checked)} /> sujeito a ICMS-ST</label>
          <label className="check"><input type="checkbox" checked={ctx.beneficiado} onChange={(e) => set('beneficiado', e.target.checked)} /> benefício fiscal / isenção</label>
          <label className="check"><input type="checkbox" checked={ctx.industrial} onChange={(e) => set('industrial', e.target.checked)} /> emitente industrial ou equiparado</label>
          <label className="check"><input type="checkbox" checked={ctx.anoReforma >= 2027} onChange={(e) => set('anoReforma', (e.target.checked ? 2027 : 2026) as 2026 | 2027)} /> parametrizar para 2027 (CBS/IBS plenos + IS)</label>
        </div>

        <h3>Item</h3>
        <label className="field" style={{ marginBottom: 8 }}><span>Descrição do produto (para achar o NCM)</span>
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
          <label className="field"><span>NCM (8 dígitos, vazio = usar a descrição)</span>
            <input value={ncmManual} onChange={(e) => setNcmManual(e.target.value)} placeholder={rec?.ncm || '8471.30.12'} /></label>
          <label className="field"><span>cClassTrib (vazio = sugestão do cenário)</span>
            <input value={ctx.cClassTribForcado} onChange={(e) => set('cClassTribForcado', e.target.value)} placeholder="000001" /></label>
          <label className="field"><span>cClass da nota referenciada (crédito presumido)</span>
            <input value={ctx.cClassReferenciada} onChange={(e) => set('cClassReferenciada', e.target.value)} placeholder="410014" /></label>
        </div>
        <div className="row" style={{ marginTop: 6, gap: 8 }}>
          {rec ? (
            <span className="badge blue">{rec.ncm} — {rec.desc.replace(/^[-–\s]+/, '').slice(0, 62)}</span>
          ) : <span className="badge red">sem NCM válido — o item de mercadoria seria rejeitado</span>}
          {ncmManual && (
            <button className="mini" type="button" onClick={() => setNcmManual('')} title="reverter para NCM automático via descrição">
              limpar NCM manual (×)
            </button>
          )}
          {cls && cls.candidates[0] && cls.candidates[0].rec.ncm === rec?.ncm && (
            <span className="small muted">aderência {Math.round(cls.candidates[0].coverage * 100)}%</span>
          )}
          {cls && cls.candidates.length > 1 && !ncmManual && (
            <div className="chips">
              {cls.candidates.slice(0, 5).map((c) => (
                <button key={c.rec.d8} className="chip" type="button" onClick={() => setNcmManual(c.rec.ncm)}>{c.rec.ncm}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={`tab ${aba === 'xml' ? 'on' : ''}`} type="button" onClick={() => setAba('xml')}>
            Códigos e XML do documento
          </button>
          <button className={`tab ${aba === 'tabela' ? 'on' : ''}`} type="button" onClick={() => setAba('tabela')}>
            Tabela de campos (sua planilha) {erp ? `· ${erp.linhas}` : ''}
          </button>
          <span style={{ marginLeft: 'auto', alignSelf: 'center' }} className={erros ? 'badge red' : 'badge alta'}>
            {erros ? `${erros} bloqueante(s)` : 'sem bloqueantes'}
          </span>
          <button className="mini" style={{ alignSelf: 'center' }} type="button" onClick={() => copiar('xml', p!.maqueta)}>
            copiar XML {copiado === 'xml' && <span className="copia">copiado ✓</span>}
          </button>
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          marginBottom: 14, padding: '10px 14px', background: '#f8fafc',
          borderRadius: 6, border: '1px solid #e2e8f0'
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#2d3748' }}>Relatório para ERP:</span>
          <button
            type="button"
            className="chip"
            style={{ background: '#2b6cb0', color: 'white', fontWeight: 600, padding: '6px 14px', cursor: 'pointer' }}
            onClick={() => { setModalRelatorio({ aberto: true, modo: 'resumido' }); setFormatoModal('html'); }}
            title="Gerar relatório de parametrização no modo resumido (somente campo e código correspondente)"
          >
            📋 Gerar Relatório ERP (Modo Resumido)
          </button>
          <button
            type="button"
            className="chip"
            style={{ background: '#276749', color: 'white', fontWeight: 600, padding: '6px 14px', cursor: 'pointer' }}
            onClick={() => { setModalRelatorio({ aberto: true, modo: 'detalhado' }); setFormatoModal('html'); }}
            title="Gerar laudo pericial no modo detalhado com citação legal completa (lei, dispositivo, artigo)"
          >
            ⚖️ Gerar Relatório ERP (Modo Detalhado com Citação Legal)
          </button>
        </div>
        <p className="small muted">{p.resumo}</p>

        {aba === 'xml' && (
          <>
            <h3>Conferências de schema e coerência fiscal</h3>
            {p.verificacoes.map((x, i) => (
              <div key={i} className={`verif ${x.nivel}`}>
                <span className="c mono">{x.campo}</span><span>{x.texto}</span>
              </div>
            ))}

            <h3>Códigos por grupo do XML</h3>
            {p.campos.map((b) => (
              <div key={b.grupo} style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <b className="mono">{b.grupo}</b><span className="small muted">{b.quando}</span>
                </div>
                <div className="scroll" style={{ maxHeight: 'none', border: 'none' }}>
                  <table className="tb">
                    <thead><tr><th style={{ width: 172 }}>tag</th><th style={{ width: 170 }}>valor</th><th>por quê</th><th style={{ width: 112 }}>origem</th></tr></thead>
                    <tbody>
                      {b.campos.map((c, ci) => (
                        <tr key={`${b.tag}/${c.tag}/${ci}`}>
                          <td className="mono">{c.tag}{c.grupo !== b.tag && c.grupo !== b.grupo.split(' ')[0] ? <div className="small muted">em {c.grupo}</div> : null}</td>
                          <td className={`mono ${c.valor ? '' : 'muted'}`}>{c.valor || '— a preencher —'}</td>
                          <td className="small">{c.motivo}</td>
                          <td><span className={`selo ${FONTES[c.fonte] || 'selo-derivada'}`}>{c.fonte}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <h3>Maqueta de XML</h3>
            <pre className="xmlpre">{p.maqueta}</pre>
            <p className="small muted">
              Maqueta de <b>estrutura</b> (tags e códigos), não um arquivo válido para transmissão: faltam
              assinatura, totalizadores e os valores que só o seu ERP tem. Use para configurar o mapeamento de
              campos no emissor e conferir contra o XSD da sua Autorizada.
            </p>
          </>
        )}

        {aba === 'tabela' && (
          erp ? (
            <>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label className="field" style={{ minWidth: 260 }}>
                  <span>buscar na planilha “{erp.arquivo}”</span>
                  <input value={buscaTabela} onChange={(e) => setBuscaTabela(e.target.value)} placeholder="tag, descrição ou exemplo" />
                </label>
                <label className="check"><input type="checkbox" checked={soOficial} onChange={(e) => setSoOficial(e.target.checked)} /> só linhas conferidas com tabela oficial</label>
                <span className="small muted">{linhasTabela.length} de {erp.linhas} linhas · sha256 {erp.sha256}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {Object.entries(erp.contagens).map(([k, n]) => (
                  <span key={k} className={`selo selo-${SELO_CLASSE[k] || 'derivada'}`}>{k}: {Number(n).toLocaleString('pt-BR')}</span>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>{erp.aviso}</p>
              <div className="scroll">
                <table className="tb">
                  <thead><tr><th>campo / tag</th><th>descrição</th><th>tipo</th><th>tam.</th><th>exemplo</th><th>fonte</th><th>selo</th></tr></thead>
                  <tbody>
                    {linhasTabela.slice(0, 250).map((i, k) => (
                      <tr key={k}>
                        <td className="mono">{i.tag}</td>
                        <td className="small">{i.desc}</td>
                        <td className="small muted">{i.tipo}</td>
                        <td className="small mono">{i.tam}</td>
                        <td className="mono small">{i.ex}</td>
                        <td className="small muted mono">{i.fonte}</td>
                        <td><span className={`selo selo-${i.selo === 'oficial' ? 'oficial' : i.selo === 'duvidoso' ? 'duvidoso' : i.selo === 'inferido' ? 'inferido' : 'derivada'}`} title={i.nota}>{i.selo}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {linhasTabela.length > 250 && <p className="small muted">mostrando 250 de {linhasTabela.length} — refine a busca.</p>}
            </>
          ) : (
            <p className="hint">Tabela de campos não publicada. Rode <code className="mono">python3 scripts/baixar_erp.py</code> (lê o CSV em data/raw/erp) e <code className="mono">npm run dados</code>.</p>
          )
        )}
      </div>

      {ctx.cClassTribForcado && reforma?.disponivel && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>O que a tabela oficial diz sobre o código digitado</h3>
          {buscarClassificacoes(reforma, ctx.cClassTribForcado).map((c) => (
            <div key={c.c} className="note info" style={{ margin: 0 }}>
              <div className="t">{c.c} — CST {c.cst} · {c.cn}</div>
              <div className="x">{c.d}</div>
              <div className="src">tratamento: {c.tt || '—'} · alíquota: {c.ta || '—'} · documentos: {(c.df || []).join(' ') || '—'}</div>
            </div>
          ))}
          {buscarClassificacoes(reforma, ctx.cClassTribForcado).length === 0 && (
            <div className="note critico" style={{ margin: 0 }}>
              <div className="t">{ctx.cClassTribForcado} não consta na tabela oficial vigente</div>
              <div className="x">Emitir com código fora da base leva a rejeição. Consulte a aba “Reforma (IBS/CBS/IS)”.</div>
            </div>
          )}
        </div>
      )}

      {modalRelatorio.aberto && (() => {
        const payloadRelatorio = extrairPayloadErp(ctx, rec, p, texto);
        const relatorioHtml = modalRelatorio.modo === 'resumido'
          ? gerarRelatorioErpResumidoHtml(payloadRelatorio)
          : gerarRelatorioErpDetalhadoHtml(payloadRelatorio);
        const relatorioTxt = modalRelatorio.modo === 'resumido'
          ? gerarRelatorioErpResumidoTxt(payloadRelatorio)
          : gerarRelatorioErpDetalhadoTxt(payloadRelatorio);

        const copiarModal = async (conteudo: string) => {
          try {
            await navigator.clipboard.writeText(conteudo);
            setRelatorioCopiado('copiado ✓');
            setTimeout(() => setRelatorioCopiado(''), 2000);
          } catch {
            setRelatorioCopiado('use Ctrl+C');
            setTimeout(() => setRelatorioCopiado(''), 2000);
          }
        };

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16
          }}>
            <div style={{
              background: 'white', borderRadius: 8, width: '100%', maxWidth: 960, maxHeight: '90vh',
              display: 'flex', flexDirection: 'column', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden'
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
              }}>
                <div>
                  <strong style={{ fontSize: '1.1rem', color: '#1a365d' }}>
                    {modalRelatorio.modo === 'resumido'
                      ? 'Relatório ERP — Modo Resumido (Somente Campo e Código)'
                      : 'Laudo Pericial ERP — Modo Detalhado com Citação Legal'}
                  </strong>
                  <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                    Contabilidade Portela (Desde 1970) · Codificação Parametrizada & Reforma Tributária
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalRelatorio({ aberto: false, modo: 'resumido' })}
                  className="mini"
                  style={{ fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>

              <div style={{
                display: 'flex', gap: 10, padding: '10px 20px', borderBottom: '1px solid #edf2f7',
                alignItems: 'center', flexWrap: 'wrap', background: '#ffffff'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Visualização:</span>
                <button
                  type="button"
                  className={`mini ${formatoModal === 'html' ? 'on' : ''}`}
                  style={{ background: formatoModal === 'html' ? '#2b6cb0' : '#edf2f7', color: formatoModal === 'html' ? 'white' : '#2d3748' }}
                  onClick={() => setFormatoModal('html')}
                >
                  Formatada (HTML)
                </button>
                <button
                  type="button"
                  className={`mini ${formatoModal === 'txt' ? 'on' : ''}`}
                  style={{ background: formatoModal === 'txt' ? '#2b6cb0' : '#edf2f7', color: formatoModal === 'txt' ? 'white' : '#2d3748' }}
                  onClick={() => setFormatoModal('txt')}
                >
                  Texto Puro (TXT)
                </button>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => abrirEmNovaAba(relatorioHtml)}
                    style={{ background: '#4a5568', color: 'white' }}
                  >
                    ↗ Abrir em Nova Aba / Imprimir
                  </button>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => baixarArquivo(
                      relatorioHtml,
                      `relatorio_erp_${modalRelatorio.modo}.html`,
                      'text/html; charset=utf-8'
                    )}
                    style={{ background: '#2b6cb0', color: 'white' }}
                  >
                    ⬇ Baixar HTML
                  </button>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => baixarArquivo(
                      relatorioTxt,
                      `relatorio_erp_${modalRelatorio.modo}.txt`,
                      'text/plain; charset=utf-8'
                    )}
                    style={{ background: '#2d3748', color: 'white' }}
                  >
                    ⬇ Baixar TXT
                  </button>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => copiarModal(formatoModal === 'html' ? relatorioHtml : relatorioTxt)}
                  >
                    Copiar {relatorioCopiado ? '✓' : ''}
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#f7fafc' }}>
                {formatoModal === 'html' ? (
                  <iframe
                    title="Pré-visualização do Relatório"
                    srcDoc={relatorioHtml}
                    style={{ width: '100%', height: '550px', border: 'none', background: 'white', borderRadius: 4 }}
                  />
                ) : (
                  <pre style={{
                    background: 'white', padding: 16, borderRadius: 4, border: '1px solid #cbd5e0',
                    fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', maxHeight: '550px', overflow: 'auto'
                  }}>
                    {relatorioTxt}
                  </pre>
                )}
              </div>

              <div style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setModalRelatorio({ aberto: false, modo: 'resumido' })}
                  className="mini"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
