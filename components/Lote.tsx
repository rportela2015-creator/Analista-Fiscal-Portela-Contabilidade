'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Dataset, Reforma, loadDataset, loadReforma } from '@/lib/data';
import {
  RegimeSaidaLote,
  ContextoSaidaLote,
  LinhaLoteErp,
  avaliarConfiancaDescricaoNcm,
  gerarParametrizacaoErpResumida,
  exportarLoteErpCSV,
} from '@/lib/lote-erp';
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

interface ItemEntradaBruto {
  id: number;
  codigo: string;
  descricao: string;
  ncmInformado?: string;
}

const REGIMES_OPCOES: { valor: RegimeSaidaLote; rotulo: string; descricao: string }[] = [
  { valor: 'simples', rotulo: 'Simples Nacional (DAS - CSOSN)', descricao: 'ICMS e IBS/CBS integrados no DAS. CSOSN 102/500.' },
  { valor: 'simples_hibrido', rotulo: 'Simples Híbrido (ICMS Simples + IBS/CBS Por Fora)', descricao: 'ICMS no Simples com apropriação e destaque de IBS/CBS regular.' },
  { valor: 'presumido', rotulo: 'Lucro Presumido (Regime Normal - Cumulativo)', descricao: 'PIS 0.65%, COFINS 3.00% em 2026. CST ICMS 00/20/60.' },
  { valor: 'real', rotulo: 'Lucro Real (Regime Normal - Não Cumulativo)', descricao: 'PIS 1.65%, COFINS 7.60% em 2026. CST ICMS 00/20/60.' },
];

const ANOS_OPCOES: (2026 | 2027 | 2029 | 2033)[] = [2026, 2027, 2029, 2033];

const UFS_BRASIL = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

/** CSV mínimo: aspas duplas RFC-4180, separador ; ou , ou tab */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const sep = text.slice(0, 4000).split('\n').slice(0, 3).join('\n');
  const delim = (sep.match(/\t/g) || []).length > (sep.match(/;/g) || []).length ? '\t'
    : (sep.match(/;/g) || []).length >= (sep.match(/,/g) || []).length ? ';' : ',';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { q = false; }
      } else { cell += c; }
      continue;
    }
    if (c === '"') { q = true; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (c === '\r') continue;
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;

export default function Lote() {
  // 1. TODOS OS HOOKS NO TOPO ABSOLUTO (Sem retornos condicionais antes)
  const { nivel, isGerencial, isOperacional, isSenior } = useNivelOperacional();
  const { empresaAtiva, perfilAtivo } = useEmpresaAtiva();

  const [ds, setDs] = useState<Dataset | null>(null);
  const [reforma, setReforma] = useState<Reforma | null>(null);
  const [itensEntrada, setItensEntrada] = useState<ItemEntradaBruto[]>([]);
  const [linhasProcessadas, setLinhasProcessadas] = useState<LinhaLoteErp[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [pasteTexto, setPasteTexto] = useState('');

  // Parâmetros de Saída para o ERP
  const [regimeSaida, setRegimeSaida] = useState<RegimeSaidaLote>('simples');
  const [ufOrigem, setUfOrigem] = useState('PR');
  const [ufDestino, setUfDestino] = useState('PR');
  const [finalidadeSaida, setFinalidadeSaida] = useState<'revenda' | 'consumidor_final' | 'industrializacao'>('revenda');
  const [anoCalendario, setAnoCalendario] = useState<2026 | 2027 | 2029 | 2033>(2026);

  // Estados de Processamento e Carregamento
  const [processando, setProcessando] = useState(false);
  const [processandoIaNcm, setProcessandoIaNcm] = useState(false);
  const [processandoIaErp, setProcessandoIaErp] = useState(false);
  const [progressoPct, setProgressoPct] = useState(0);
  const [mensagemStatus, setMensagemStatus] = useState<string | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronização inicial com Empresa Ativa
  useEffect(() => {
    if (empresaAtiva) {
      if (empresaAtiva.uf) setUfOrigem(empresaAtiva.uf);
      if (perfilAtivo?.regimeTributario) {
        if (perfilAtivo.regimeTributario === 'SIMPLES_NACIONAL' || perfilAtivo.regimeTributario === 'MEI') {
          setRegimeSaida('simples');
        } else if (perfilAtivo.regimeTributario === 'LUCRO_PRESUMIDO') {
          setRegimeSaida('presumido');
        } else if (perfilAtivo.regimeTributario === 'LUCRO_REAL') {
          setRegimeSaida('real');
        }
      }
    }
  }, [empresaAtiva, perfilAtivo]);

  // Efeito 1: Carrega Dataset NCM Siscomex
  useEffect(() => {
    loadDataset()
      .then(async (d) => {
        setDs(d);
        await d.pronto;
      })
      .catch((err) => console.error('Falha ao carregar dataset NCM:', err));
  }, []);

  // Efeito 2: Carrega Tabelas Oficiais da Reforma
  useEffect(() => {
    loadReforma()
      .then(setReforma)
      .catch((err) => console.error('Falha ao carregar tabelas da reforma:', err));
  }, []);

  // Contexto Atual de Saída para o Lote
  const contextoAtual: ContextoSaidaLote = useMemo(() => ({
    regimeSaida,
    ufOrigem,
    ufDestino,
    finalidadeSaida,
    anoCalendario,
  }), [regimeSaida, ufOrigem, ufDestino, finalidadeSaida, anoCalendario]);

  // Função interna para re-parametrizar uma lista de linhas mantendo eventuais NCMs já ajustados
  const recalcularLinhas = useCallback(
    (linhasBase: LinhaLoteErp[], ctx: ContextoSaidaLote, dataset: Dataset, ref?: Reforma | null) => {
      return linhasBase.map((l) => {
        const itemParaParam = {
          codigo: l.codigo,
          descricao: l.descricao,
          ncm: l.ncm,
          confiancaNcmPct: l.confiancaNcmPct,
          origemNcm: l.origemNcm,
        };
        const recalculada = gerarParametrizacaoErpResumida(itemParaParam, ctx, dataset, ref);
        return {
          ...recalculada,
          id: l.id,
          descricaoNcm: l.descricaoNcm || recalculada.descricaoNcm,
          origemParam: l.origemParam === 'IA_ASSISTIDA' ? 'IA_ASSISTIDA' : recalculada.origemParam,
          aderenciaErpPct: l.origemParam === 'IA_ASSISTIDA' ? Math.max(95, recalculada.aderenciaErpPct) : recalculada.aderenciaErpPct,
        };
      });
    },
    []
  );

  // Efeito 3: Recalcula parâmetros instantaneamente ao mudar qualquer seletor da Barra de Configuração
  useEffect(() => {
    if (!ds || linhasProcessadas.length === 0) return;
    setLinhasProcessadas((atuais) => recalcularLinhas(atuais, contextoAtual, ds, reforma));
  }, [contextoAtual, ds, reforma, recalcularLinhas]);

  // Interpretação de texto ou arquivo CSV
  const processarTextoEntrada = useCallback((txt: string, nome = '') => {
    const rows = parseCsv(txt);
    if (!rows.length) return;

    const head = rows[0].map((h) => h.trim().toLowerCase());
    const idxDesc = head.findIndex((h) => ['descricao', 'descrição', 'produto', 'desc', 'nome', 'item'].some((c) => h.includes(c)));
    const idxCod = head.findIndex((h) => ['codigo', 'código', 'cod', 'sku', 'ref', 'id'].some((c) => h.includes(c)));
    const idxNcm = head.findIndex((h) => ['ncm', 'sh', 'classificacao', 'classificação'].some((c) => h.includes(c)));

    let corpo = rows;
    const temCabecalho = idxDesc >= 0 || idxCod >= 0 || idxNcm >= 0;
    if (temCabecalho) {
      corpo = rows.slice(1);
    }

    const colDescEfetiva = idxDesc >= 0 ? idxDesc : 1 < rows[0].length ? 1 : 0;
    const colCodEfetiva = idxCod >= 0 ? idxCod : 0;
    const colNcmEfetiva = idxNcm >= 0 ? idxNcm : -1;

    const novosItens: ItemEntradaBruto[] = corpo
      .map((r, i) => {
        const desc = (r[colDescEfetiva] || r.find((x) => x.trim().length > 3) || '').trim();
        const cod = (idxCod >= 0 ? r[colCodEfetiva] : r[0] !== desc ? r[0] : `ITEM-${i + 1}`).trim();
        const ncmInf = colNcmEfetiva >= 0 && r[colNcmEfetiva] ? r[colNcmEfetiva].trim() : undefined;
        return {
          id: i + 1,
          codigo: cod || `ITEM-${i + 1}`,
          descricao: desc,
          ncmInformado: ncmInf,
        };
      })
      .filter((it) => it.descricao.length > 0);

    setItensEntrada(novosItens);
    setNomeArquivo(nome);
    setLinhasProcessadas([]);
    setMensagemStatus(`Carregados ${novosItens.length} produto(s). Pronto para parametrização.`);
  }, []);

  // Processamento Determinístico Inicial em Lote
  const executarParametrizacaoLote = useCallback(async () => {
    if (!ds || !itensEntrada.length) return;
    setProcessando(true);
    setProgressoPct(0);
    setMensagemStatus('Classificando e gerando parâmetros de saída para ERP...');

    const resultado: LinhaLoteErp[] = [];
    const total = itensEntrada.length;
    const passo = Math.max(1, Math.floor(total / 50));

    for (let i = 0; i < total; i++) {
      const it = itensEntrada[i];
      const avaliacaoNcm = avaliarConfiancaDescricaoNcm(it.descricao, it.ncmInformado, ds);

      const linhaGerada = gerarParametrizacaoErpResumida(
        {
          codigo: it.codigo,
          descricao: it.descricao,
          ncm: avaliacaoNcm.ncm,
          confiancaNcmPct: avaliacaoNcm.confiancaNcmPct,
          origemNcm: 'MOTOR',
        },
        contextoAtual,
        ds,
        reforma
      );

      linhaGerada.id = it.id;
      linhaGerada.descricaoNcm = avaliacaoNcm.descricaoNcm;
      resultado.push(linhaGerada);

      if (i % passo === 0 || i === total - 1) {
        setProgressoPct(Math.round(((i + 1) / total) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    setLinhasProcessadas(resultado);
    setProcessando(false);
    setMensagemStatus(`Concluído: ${resultado.length} item(ns) parametrizados.`);
  }, [ds, itensEntrada, contextoAtual, reforma]);

  // Ação 1: Classificar NCMs com baixa confiança (<= 85%) via Gemini IA
  const classificarNcmsComIa = useCallback(async (itensAlvo?: LinhaLoteErp[]) => {
    if (!ds) return;
    const alvos = itensAlvo || linhasProcessadas.filter((l) => l.confiancaNcmPct <= 85);
    if (!alvos.length) {
      setMensagemStatus('Todos os itens já possuem confiança NCM > 85%.');
      return;
    }

    setProcessandoIaNcm(true);
    setMensagemStatus(`Enviando ${alvos.length} item(ns) para classificação pericial via Gemini IA...`);

    const mapaAtualizados = new Map<number, { ncm: string; descNcm: string; conf: number }>();

    for (const item of alvos) {
      try {
        const resp = await fetch('/api/classificar-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descricao: item.descricao,
            contextoOperacao: `Saída / ${contextoAtual.regimeSaida} / Destino ${contextoAtual.ufDestino}`,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data?.ncm && data.ncm.length === 8) {
            const recOficial = ds.byD8?.get(data.ncm);
            mapaAtualizados.set(item.id, {
              ncm: recOficial ? recOficial.ncm : data.ncm,
              descNcm: recOficial ? recOficial.desc.replace(/^[-–\s]+/, '') : (data.descricaoNcm || ''),
              conf: 95,
            });
          }
        }
      } catch (err) {
        console.warn(`Falha na IA NCM para item ${item.codigo}:`, err);
      }
    }

    // Atualiza as linhas processadas e recalcula os códigos fiscais do ERP
    setLinhasProcessadas((atuais) => {
      return atuais.map((linha) => {
        const atualizacao = mapaAtualizados.get(linha.id);
        if (!atualizacao) return linha;

        const novaLinha = gerarParametrizacaoErpResumida(
          {
            codigo: linha.codigo,
            descricao: linha.descricao,
            ncm: atualizacao.ncm,
            confiancaNcmPct: atualizacao.conf,
            origemNcm: 'GEMINI_IA',
          },
          contextoAtual,
          ds,
          reforma
        );
        novaLinha.id = linha.id;
        novaLinha.descricaoNcm = atualizacao.descNcm;
        return novaLinha;
      });
    });

    setProcessandoIaNcm(false);
    setMensagemStatus(`IA concluiu a resolução de ${mapaAtualizados.size} NCM(s).`);
  }, [ds, linhasProcessadas, contextoAtual, reforma]);

  // Ação 2: Codificação Assistida por IA para itens com aderência ERP <= 85%
  const codificarErpComIa = useCallback(async (itensAlvo?: LinhaLoteErp[]) => {
    const alvos = itensAlvo || linhasProcessadas.filter((l) => l.aderenciaErpPct <= 85);
    if (!alvos.length) {
      setMensagemStatus('Todos os itens já possuem aderência de ERP > 85%.');
      return;
    }

    setProcessandoIaErp(true);
    setMensagemStatus(`Codificando ${alvos.length} item(ns) com especialista fiscal Gemini...`);

    const chunkSize = 20;
    const mapaErpIa = new Map<number, any>();

    for (let i = 0; i < alvos.length; i += chunkSize) {
      const loteSlice = alvos.slice(i, i + chunkSize);
      try {
        const resp = await fetch('/api/codificar-erp-ia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itens: loteSlice.map((l) => ({
              codigo: l.codigo,
              descricao: l.descricao,
              ncm: l.ncm,
              regimeSaida: l.regimeSaida,
              ufOrigem: l.ufOrigem,
              ufDestino: l.ufDestino,
              finalidadeSaida: l.finalidadeSaida,
              anoCalendario: contextoAtual.anoCalendario,
              parametrosAtuais: {
                cest: l.cest,
                cfopSaida: l.cfopSaida,
                cstOuCsosnIcms: l.cstOuCsosnIcms,
                cBenefPr: l.cBenefPr,
                aliqIcmsNominalPct: l.aliqIcmsNominalPct,
                redBcIcmsPct: l.redBcIcmsPct,
                cstPisCofins: l.cstPisCofins,
                aliqPisPct: l.aliqPisPct,
                aliqCofinsPct: l.aliqCofinsPct,
                cstIbsCbs: l.cstIbsCbs,
                cClassTrib: l.cClassTrib,
                redIbsCbsPct: l.redIbsCbsPct,
              },
            })),
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data?.itens)) {
            data.itens.forEach((retornoItem: any) => {
              const linhaOriginal = loteSlice.find((l) => l.codigo === retornoItem.codigo);
              if (linhaOriginal) {
                mapaErpIa.set(linhaOriginal.id, retornoItem);
              }
            });
          }
        }
      } catch (err) {
        console.warn('Falha na chamada /api/codificar-erp-ia:', err);
      }
    }

    setLinhasProcessadas((atuais) => {
      return atuais.map((linha) => {
        const ia = mapaErpIa.get(linha.id);
        if (!ia) return linha;
        return {
          ...linha,
          cest: ia.cest ?? linha.cest,
          cfopSaida: ia.cfopSaida ?? linha.cfopSaida,
          cstOuCsosnIcms: ia.cstOuCsosnIcms ?? linha.cstOuCsosnIcms,
          cBenefPr: ia.cBenefPr ?? linha.cBenefPr,
          aliqIcmsNominalPct: ia.aliqIcmsNominalPct ?? linha.aliqIcmsNominalPct,
          redBcIcmsPct: ia.redBcIcmsPct ?? linha.redBcIcmsPct,
          mvaOriginalPct: ia.mvaOriginalPct ?? linha.mvaOriginalPct,
          cstPisCofins: ia.cstPisCofins ?? linha.cstPisCofins,
          aliqPisPct: ia.aliqPisPct ?? linha.aliqPisPct,
          aliqCofinsPct: ia.aliqCofinsPct ?? linha.aliqCofinsPct,
          cstIbsCbs: ia.cstIbsCbs ?? linha.cstIbsCbs,
          cClassTrib: ia.cClassTrib ?? linha.cClassTrib,
          redIbsCbsPct: ia.redIbsCbsPct ?? linha.redIbsCbsPct,
          aderenciaErpPct: ia.aderenciaErpPct ?? 95,
          requerCodificacaoIaErp: false,
          origemParam: 'IA_ASSISTIDA',
          statusErp: 'PRONTO_PARAMETRIZAR (Reconciliado por IA)',
        };
      });
    });

    setProcessandoIaErp(false);
    setMensagemStatus(`Codificação ERP assistida por IA aplicada em ${mapaErpIa.size} item(ns).`);
  }, [linhasProcessadas, contextoAtual]);

  // Contadores e Resumo Executivo
  const resumo = useMemo(() => {
    if (!linhasProcessadas.length) return null;
    const total = linhasProcessadas.length;
    const prontosNcm = linhasProcessadas.filter((l) => l.confiancaNcmPct > 85).length;
    const requerIaNcm = linhasProcessadas.filter((l) => l.confiancaNcmPct <= 85).length;
    const requerIaErp = linhasProcessadas.filter((l) => l.aderenciaErpPct <= 85).length;
    const iaAssistidos = linhasProcessadas.filter((l) => l.origemParam === 'IA_ASSISTIDA').length;

    return { total, prontosNcm, requerIaNcm, requerIaErp, iaAssistidos };
  }, [linhasProcessadas]);

  // Filtragem na Tabela
  const linhasFiltradas = useMemo(() => {
    if (!filtroTexto.trim()) return linhasProcessadas;
    const t = filtroTexto.toLowerCase();
    return linhasProcessadas.filter(
      (l) =>
        l.codigo.toLowerCase().includes(t) ||
        l.descricao.toLowerCase().includes(t) ||
        l.ncm.includes(t) ||
        l.cfopSaida.includes(t) ||
        l.cstOuCsosnIcms.includes(t)
    );
  }, [linhasProcessadas, filtroTexto]);

  // Faixa de KPIs Executivos e Operacionais (tabular-nums)
  const kpiItems = useMemo<KpiItemData[]>(() => {
    const totalItens = linhasProcessadas.length || itensEntrada.length || 0;
    const prontosNcm = resumo?.prontosNcm ?? 0;
    const requerAtencao = (resumo?.requerIaNcm ?? 0) + (resumo?.requerIaErp ?? 0);
    const taxaProntidao = totalItens > 0 ? Math.round(((totalItens - requerAtencao) / totalItens) * 100) : 0;

    return [
      {
        id: 'kpi-lote-total',
        label: 'Total de Itens do Lote',
        value: totalItens > 0 ? `${totalItens} itens` : '0 itens',
        subValue: nomeArquivo ? `Arquivo: ${nomeArquivo}` : 'Aguardando importação',
        trafficLight: totalItens > 0 ? 'info' : 'info',
        statusLabel: 'Volume',
        tooltipText: 'Quantidade total de mercadorias no arquivo ou lote colado',
      },
      {
        id: 'kpi-lote-classificados',
        label: 'Classificados / NCM Validado',
        value: totalItens > 0 ? `${prontosNcm} itens` : '0 itens',
        subValue: totalItens > 0 ? `${Math.round((prontosNcm / totalItens) * 100)}% aderência > 85%` : 'Aguardando processamento',
        trafficLight: prontosNcm === totalItens && totalItens > 0 ? 'success' : prontosNcm > 0 ? 'warning' : 'info',
        statusLabel: prontosNcm === totalItens && totalItens > 0 ? '100% Validado' : 'Parcial',
        trend: prontosNcm > 0 ? 'up' : 'down',
        trendValue: `${Math.round((prontosNcm / Math.max(1, totalItens)) * 100)}%`,
      },
      {
        id: 'kpi-lote-divergencias',
        label: 'Divergências / Requer IA',
        value: requerAtencao > 0 ? `${requerAtencao} pendente(s)` : '0 pendências',
        subValue: requerAtencao > 0
          ? `${resumo?.requerIaNcm || 0} NCM fraco · ${resumo?.requerIaErp || 0} ERP pendente`
          : 'Nenhum conflito detectado',
        trafficLight: requerAtencao === 0 && totalItens > 0 ? 'success' : requerAtencao > 0 ? 'warning' : 'info',
        statusLabel: requerAtencao === 0 && totalItens > 0 ? 'Regular' : 'Ação Necessária',
      },
      {
        id: 'kpi-lote-prontidao',
        label: 'Taxa de Prontidão ERP',
        value: totalItens > 0 ? `${taxaProntidao}%` : '0%',
        subValue: `Regime: ${regimeSaida.toUpperCase()} · Ano: ${anoCalendario}`,
        trafficLight: taxaProntidao >= 90 ? 'success' : taxaProntidao >= 60 ? 'warning' : 'danger',
        statusLabel: taxaProntidao >= 90 ? 'Pronto para Faturamento' : 'Incompleto',
        trend: taxaProntidao >= 90 ? 'up' : 'down',
        tooltipText: 'Percentual de itens prontos com CST, CFOP, alíquotas e códigos fiscais consolidados',
      },
    ];
  }, [linhasProcessadas, itensEntrada, resumo, nomeArquivo, regimeSaida, anoCalendario]);

  // Citações Normativas para o Lote
  const citacoesNormativas = useMemo<NormativeCitation[]>(() => {
    return [
      {
        id: 'cit-lote-confaz',
        norma: 'Ajuste SINIEF 07/2005 & Guia Prático EFD ICMS/IPI',
        artigo: 'Registro 0200 — Tabela de Identificação do Item',
        ementa: 'Obrigatoriedade de NCM de 8 dígitos, CEST e codificação uniforme para a escrituração fiscal digital.',
        esfera: 'federal',
        statusVigencia: 'vigente',
      },
      {
        id: 'cit-lote-reforma',
        norma: 'Lei Complementar nº 214/2025',
        artigo: 'Art. 11 e Anexo I — Classificação Tributária cClassTrib',
        ementa: 'Definição da situação tributária da operação para apuração do IBS e CBS na saída.',
        esfera: 'federal',
        statusVigencia: 'vigente',
      },
    ];
  }, []);

  return (
    <>
      <div className="st-page-header">
        <div>
          <div className="st-page-title-row">
            <h2 className="st-page-title">Auditoria em Lote</h2>
            <span className="st-badge-norma">CSV / ERP</span>
            <span className="st-badge-norma">Corte 85%</span>
          </div>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Processamento massivo de SKUs com triagem de confiança NCM e parametrização de saída.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <KpiStrip
          items={kpiItems}
          level={nivel}
          showConsolidatedTrafficLightBar
          proportions={{
            regularPct: resumo ? Math.round((resumo.prontosNcm / Math.max(1, resumo.total)) * 70) : 40,
            warningPct: 20,
            riskPct: 15,
          }}
        />
      </div>

      <div className="card">
        {/* Cabeçalho do Módulo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, textTransform: 'none', fontSize: 16, color: 'var(--ink)' }}>Parametrização em Lote de ERP (CSV Inteligente)</h3>
            <p className="hint" style={{ margin: '4px 0 0 0' }}>
              Classificação automatizada com validação Descrição x NCM (corte de 85%), parametrização determinística de saída e <b>Codificação Assistida por IA</b> para o ERP.
            </p>
          </div>
          {linhasProcessadas.length > 0 && (
            <a
              className="btn"
              style={{ textDecoration: 'none', background: '#16a34a', borderColor: 'var(--ok)', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(exportarLoteErpCSV(linhasProcessadas))}`}
              download={`lote-parametrizacao-erp-${contextoAtual.regimeSaida}-${contextoAtual.anoCalendario}.csv`}
            >
              ⬇️ Baixar CSV Resumido para ERP ({linhasProcessadas.length} itens)
            </a>
          )}
        </div>

        {/* BARRA DE CONFIGURAÇÃO DE SAÍDA (RECALCULA TUDO INSTANTANEAMENTE) */}
        <div style={{ marginTop: 16 }}>
          <ProgressiveSection
            id="sec-lote-contexto-saida"
            title="Contexto Tributário de Saída para o Lote"
            subtitle="Regime de apuração, UFs de origem/destino e ano-calendário da transição"
            minLevel="operacional"
            currentLevel={nivel}
            defaultExpanded={isOperacional || isSenior}
            onDemandTriggerLabel="Configurar Contexto Tributário de Saída (Regime / UFs / Ano)"
          >
            <div
              style={{
                marginTop: 8,
                padding: '14px 16px',
                background: 'var(--bg-elevated, #f8fafc)',
                borderRadius: 8,
                border: '1px solid var(--border-color, #e2e8f0)',
              }}
            >
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ⚙️ Contexto de Saída da Mercadoria (Regime Tributário & Fisco)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {/* Regime Tributário */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              Regime Tributário de Saída:
            </label>
            <select
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}
              value={regimeSaida}
              onChange={(e) => setRegimeSaida(e.target.value as RegimeSaidaLote)}
            >
              {REGIMES_OPCOES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.rotulo}
                </option>
              ))}
            </select>
          </div>

          {/* UF Origem */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              UF Origem (Emitente):
            </label>
            <select
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
              value={ufOrigem}
              onChange={(e) => setUfOrigem(e.target.value)}
            >
              {UFS_BRASIL.map((uf) => (
                <option key={uf} value={uf}>
                  {uf} {uf === 'PR' ? '(Paraná)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* UF Destino */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              UF Destino (Operação):
            </label>
            <select
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
              value={ufDestino}
              onChange={(e) => setUfDestino(e.target.value)}
            >
              {UFS_BRASIL.map((uf) => (
                <option key={uf} value={uf}>
                  {uf} {uf === 'PR' ? '(Operação Interna)' : '(Interestadual)'}
                </option>
              ))}
            </select>
          </div>

          {/* Finalidade */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              Finalidade da Saída:
            </label>
            <select
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
              value={finalidadeSaida}
              onChange={(e) => setFinalidadeSaida(e.target.value as any)}
            >
              <option value="revenda">Revenda / Comercialização</option>
              <option value="consumidor_final">Venda a Consumidor Final</option>
              <option value="industrializacao">Saída para Industrialização</option>
            </select>
          </div>

          {/* Ano Calendário */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
              Ano Calendário (Reforma):
            </label>
            <select
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}
              value={anoCalendario}
              onChange={(e) => setAnoCalendario(Number(e.target.value) as any)}
            >
              {ANOS_OPCOES.map((ano) => (
                <option key={ano} value={ano}>
                  {ano} {ano === 2026 ? '(Transição Teste IBS 0,1% / CBS 0,9%)' : ano === 2027 ? '(CBS Plena + Extinção PIS/COFINS)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </ProgressiveSection>
  </div>

      {/* ÁREA DE CARGA DE DADOS (ARQUIVO OU TEXTO COLADO) */}
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            processarTextoEntrada(await f.text(), f.name);
          }}
        />
        <button
          className="btn ghost"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{ border: '1px dashed #3b82f6', color: 'var(--accent-blue)', minHeight: '44px' }}
        >
          📂 Selecionar Planilha CSV / TSV
        </button>

        <button
          className="btn"
          type="button"
          onClick={executarParametrizacaoLote}
          disabled={!itensEntrada.length || processando || !ds}
          style={{ minHeight: '44px' }}
        >
          {processando ? (
            <>
              <span className="spin" /> Parametrizando {progressoPct}%
            </>
          ) : (
            `⚡ Parametrizar ${itensEntrada.length || 0} Produto(s)`
          )}
        </button>

        {itensEntrada.length > 0 && (
          <button
            className="mini"
            type="button"
            style={{ minHeight: '44px', padding: '8px 14px' }}
            onClick={() => {
              setItensEntrada([]);
              setLinhasProcessadas([]);
              setPasteTexto('');
              setMensagemStatus(null);
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* Caixa de Texto Colado */}
      <textarea
        style={{ marginTop: 10, minHeight: 64, fontSize: '0.82rem' }}
        placeholder={'Ou cole os produtos aqui (uma linha por produto):\nExemplo 1 (sem NCM): PROD-01; Café torrado em grãos\nExemplo 2 (com NCM): PROD-02; Notebook i7 16GB; 8471.30.12'}
        value={pasteTexto}
        onChange={(e) => setPasteTexto(e.target.value)}
      />
      {pasteTexto.trim().length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button
            className="mini"
            type="button"
            style={{ minHeight: '44px', padding: '8px 14px' }}
            onClick={() => processarTextoEntrada(pasteTexto, 'colado')}
          >
            Usar texto colado ({pasteTexto.split(/\n/).filter(Boolean).length} linhas)
          </button>
        </div>
      )}

      {/* Mensagem de Status */}
      {mensagemStatus && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 10,
            padding: '8px 12px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            background: 'var(--accent-blue-subtle)',
            color: 'var(--accent-blue)',
            borderRadius: 6,
            fontSize: '0.82rem',
            border: '1px solid #bae6fd',
          }}
        >
          ℹ️ {mensagemStatus}
        </div>
      )}

      {/* PAINEL DE CONTADORES E BOTÕES DE AÇÃO DE IA */}
      {resumo && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            background: 'var(--bg-card)',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge" style={{ background: '#0f172a', color: '#fff' }}>
                Total: {resumo.total}
              </span>
              <span className="badge" style={{ background: 'var(--accent-emerald-glow)', color: 'var(--ok)', border: '1px solid #86efac' }}>
                ✅ NCM Seguro (&gt;85%): {resumo.prontosNcm}
              </span>
              {resumo.requerIaNcm > 0 && (
                <span className="badge" style={{ background: 'var(--accent-amber-subtle)', color: 'var(--warn)', border: '1px solid #fcd34d' }}>
                  🤖 NCM a Revisar (≤85%): {resumo.requerIaNcm}
                </span>
              )}
              {resumo.requerIaErp > 0 && (
                <span className="badge" style={{ background: 'var(--accent-crimson-subtle)', color: 'var(--bad)', border: '1px solid #fca5a5' }}>
                  ⚠️ Aderência ERP &le;85%: {resumo.requerIaErp}
                </span>
              )}
              {resumo.iaAssistidos > 0 && (
                <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                  ✨ IA Assistidos: {resumo.iaAssistidos}
                </span>
              )}
            </div>

            {/* BOTÕES DE DISPARO DE IA */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {resumo.requerIaNcm > 0 && (
                <button
                  className="btn"
                  type="button"
                  style={{ background: '#d97706', borderColor: 'var(--warn)', fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => classificarNcmsComIa()}
                  disabled={processandoIaNcm}
                >
                  {processandoIaNcm ? <span className="spin" /> : '🤖 Classificar NCMs (≤85%) com Gemini IA'}
                </button>
              )}

              {resumo.requerIaErp > 0 && (
                <button
                  className="btn"
                  type="button"
                  style={{ background: '#7c3aed', borderColor: '#6d28d9', fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => codificarErpComIa()}
                  disabled={processandoIaErp}
                >
                  {processandoIaErp ? <span className="spin" /> : '✨ Codificação Assistida por IA (ERP)'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TABELA DE PARAMETRIZAÇÃO GERENCIAL RESUMIDA DO ERP */}
      {linhasProcessadas.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>
              📋 Parâmetros Gerenciais Calculados para o ERP ({linhasFiltradas.length} de {linhasProcessadas.length})
            </span>
            <input
              type="text"
              placeholder="🔍 Filtrar por código, descrição, NCM ou CFOP..."
              style={{ padding: '4px 8px', fontSize: '0.8rem', width: 260, borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>

          <div className="scroll" style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table className="tb" style={{ fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-subtle)' }}>
                  <th>Código</th>
                  <th style={{ minWidth: 180 }}>Descrição</th>
                  <th>NCM</th>
                  <th>Conf. NCM</th>
                  <th>CFOP Saída</th>
                  <th>CST / CSOSN</th>
                  <th>cBenef (PR)</th>
                  <th>ICMS Nom. / Red. / Efet.</th>
                  <th>CEST / MVA</th>
                  <th>PIS/COFINS</th>
                  <th>IBS/CBS (cClassTrib)</th>
                  <th>Aderência ERP</th>
                  <th>Ações Rápidas</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.map((l) => {
                  const ncmBaixo = l.confiancaNcmPct <= 85;
                  const erpBaixo = l.aderenciaErpPct <= 85;

                  return (
                    <tr key={l.id} style={{ background: erpBaixo ? 'var(--accent-amber-subtle)' : undefined }}>
                      <td className="mono" style={{ fontWeight: 600 }}>{l.codigo}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{l.descricao}</div>
                        {l.descricaoNcm && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--ink-2)' }} title={l.descricaoNcm}>
                            {l.descricaoNcm.slice(0, 48)}...
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ fontWeight: 700 }}>{l.ncm || '—'}</td>
                      <td>
                        <span
                          className={`badge ${l.confiancaNcmPct >= 86 ? 'alta' : l.confiancaNcmPct >= 60 ? 'media' : 'baixa'}`}
                          title={`Origem: ${l.origemNcm}`}
                        >
                          {l.confiancaNcmPct}% {l.origemNcm === 'GEMINI_IA' ? '✨' : ''}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{l.cfopSaida}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{l.cstOuCsosnIcms}</td>
                      <td className="mono" style={{ fontSize: '0.72rem' }}>{l.cBenefPr}</td>
                      <td>
                        {l.aliqIcmsNominalPct}% / {l.redBcIcmsPct}% / <b>{l.cargaIcmsEfetivaPct}%</b>
                      </td>
                      <td className="mono">
                        {l.cest || '—'} {l.mvaOriginalPct > 0 ? `(${l.mvaOriginalPct}%)` : ''}
                      </td>
                      <td>
                        CST {l.cstPisCofins} ({l.aliqPisPct}% / {l.aliqCofinsPct}%)
                      </td>
                      <td>
                        CST {l.cstIbsCbs} <span className="mono" style={{ fontSize: '0.72rem' }}>({l.cClassTrib})</span> {l.aliqCbsEfetivaPct + l.aliqIbsEfetivaPct}%
                      </td>
                      <td>
                        <span className={`badge ${l.aderenciaErpPct >= 86 ? 'alta' : 'baixa'}`}>
                          {l.aderenciaErpPct}%
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ncmBaixo && (
                            <button
                              className="mini"
                              type="button"
                              style={{ background: '#d97706', color: '#fff', border: 'none' }}
                              onClick={() => classificarNcmsComIa([l])}
                              disabled={processandoIaNcm}
                              title="Classificar NCM com Gemini IA"
                            >
                              🤖 NCM
                            </button>
                          )}
                          {erpBaixo && (
                            <button
                              className="mini"
                              type="button"
                              style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
                              onClick={() => codificarErpComIa([l])}
                              disabled={processandoIaErp}
                              title="Codificar ERP com IA"
                            >
                              ✨ ERP
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FUNDAMENTAÇÃO NORMATIVA DO LOTE */}
      <div style={{ marginTop: 14 }}>
        <ProgressiveSection
          id="sec-lote-fundamentacao"
          title="Embasamento Legal do Lote & Obrigações Acessórias (SPED / LC 214)"
          subtitle="Critérios de escrituração do Registro 0200 e matriz de tributação de saída"
          minLevel="senior"
          currentLevel={nivel}
          defaultExpanded={isSenior}
          onDemandTriggerLabel="Visualizar Fundamentação Legal do Lote (SPED / LC 214)"
          badge={<span className="badge amber" style={{ fontSize: '10px' }}>Nível Sênior</span>}
        >
          <div style={{ marginTop: 8 }}>
            <LegalCitationBlock
              title="Dispositivos Normativos para Parametrização em Lote"
              citations={citacoesNormativas}
              defaultCollapsed={false}
            />
          </div>
        </ProgressiveSection>
      </div>
    </div>

    <StickyActionBar
      primaryAction={{
        label: linhasProcessadas.length > 0
          ? `⬇️ Baixar CSV para ERP (${linhasProcessadas.length} itens)`
          : itensEntrada.length > 0
          ? (processando ? 'Processando Lote...' : '⚙️ Processar Lote no Motor Fiscal')
          : 'Importar Arquivo CSV / Colar Itens',
        onClick: () => {
          if (linhasProcessadas.length > 0) {
            const csvContent = exportarLoteErpCSV(linhasProcessadas);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `lote-parametrizacao-erp-${contextoAtual.regimeSaida}-${contextoAtual.anoCalendario}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } else if (itensEntrada.length > 0) {
            executarParametrizacaoLote();
          } else {
            fileInputRef.current?.click();
          }
        },
        loading: processando || processandoIaNcm || processandoIaErp,
        disabled: processando || processandoIaNcm || processandoIaErp,
        title: 'Ação primária de processamento em lote',
      }}
      secondaryActions={[
        ...(linhasProcessadas.length > 0
          ? [
              ...(resumo?.requerIaNcm
                ? [
                    {
                      id: 'sec-ia-ncm',
                      label: `✦ Resolver ${resumo.requerIaNcm} NCMs (IA)`,
                      onClick: () => classificarNcmsComIa(),
                      disabled: processandoIaNcm,
                    },
                  ]
                : []),
              ...(resumo?.requerIaErp
                ? [
                    {
                      id: 'sec-ia-erp',
                      label: `✦ Codificar ${resumo.requerIaErp} ERP (IA)`,
                      onClick: () => codificarErpComIa(),
                      disabled: processandoIaErp,
                    },
                  ]
                : []),
              {
                id: 'sec-reprocessar',
                label: 'Reprocessar Lote',
                onClick: () => executarParametrizacaoLote(),
                disabled: processando,
              },
            ]
          : itensEntrada.length > 0
          ? [
              {
                id: 'sec-limpar-itens',
                label: 'Limpar Itens',
                onClick: () => {
                  setItensEntrada([]);
                  setNomeArquivo('');
                  setPasteTexto('');
                  setLinhasProcessadas([]);
                },
              },
            ]
          : []),
      ]}
      contextBadge={
        <span>
          {empresaAtiva ? <b>{empresaAtiva.razaoSocial} · </b> : null}
          Regime: <b>{regimeSaida.toUpperCase()}</b> · Ano: <b>{anoCalendario}</b> · Origem: <b>{ufOrigem}</b> → Destino: <b>{ufDestino}</b>
        </span>
      }
      statusMessage={mensagemStatus || undefined}
    />
  </>
);
}
