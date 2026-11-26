'use client';

/**
 * TabelaItensExtracao.tsx
 *
 * Componente de visualização e seleção de itens fiscais de NF-e (Sub-etapa 20.4 - Ciclo 7).
 * Tabela enxuta de até 7 colunas com tabular-nums, ItemDetailDrawer lateral (500px)
 * e alinhamento total aos 3 Níveis Operacionais do Design System Portela.
 *
 * Cumpre 100% da ordem estrita de React Hooks (scripts/hookcheck.mjs) e acessibilidade WCAG AA.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type {
  ExtractedItem,
  MotivoSensibilidadeInfo,
} from '@/lib/extrator-nfe-types';
import { MOTIVOS_SENSIBILIDADE_MAP } from '@/lib/extrator-nfe-types';
import type { ItemFiscalAuditado } from '@/lib/types/item-fiscal-auditado';
import { normalizeNcm, fmtCode, type Dataset } from '@/lib/data';
import type { MarcoLegal } from '@/lib/marco-legal';
import {
  ORIENTACAO_OPERACIONAL_CCE_NCM,
  avaliarAderenciaNcm,
} from '@/lib/fiscal/aderencia-ncm';
import { simularImpactoSaneamentoNcm } from '@/lib/fiscal/saneamento-ncm';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import ItemDetailDrawer from '@/components/ui/ItemDetailDrawer';
import LegalCitationBlock, { type NormativeCitation } from '@/components/ui/LegalCitationBlock';

export type { MotivoSensibilidadeInfo };
export { MOTIVOS_SENSIBILIDADE_MAP };

/* =========================================================================
 * 1. TIPOS E CONTRATOS DO COMPONENTE
 * ========================================================================= */

export type FiltroVisualizacao = 'todos' | 'sensiveis' | 'selecionados' | 'inconsistentes';

export interface TabelaItensExtracaoProps {
  /** Lista completa de itens extraídos deterministicamente pelo extrator */
  itens: ExtractedItem[];
  /** Índices dos itens selecionados (1-indexed baseados em item.index) - suporta array ou Set */
  selectedIndices: number[] | Set<number>;
  /** Alterna seleção de um único item */
  onToggleSelect: (index: number) => void;
  /** Seleciona todos os itens da nota */
  onSelectAll: () => void;
  /** Desmarca todos os itens */
  onDeselectAll: () => void;
  /** Seleciona apenas os itens marcados como sensíveis (alias 1) */
  onSelectSensitivesOnly?: () => void;
  /** Seleciona apenas os itens marcados como sensíveis (alias 2) */
  onSelectOnlySensitive?: () => void;
  /** Se a tabela está em modo somente-leitura (ex.: pós-auditoria) */
  readOnly?: boolean;
  /** Se as ações de seleção estão desabilitadas (ex.: durante execução de auditoria) */
  disabled?: boolean;
  /** Callback opcional ao clicar em um item para abrir painel detalhado */
  onItemClick?: (item: ExtractedItem) => void;
  /** Callback para precificar um item individual */
  onPrecificarItem?: (item: ExtractedItem) => void;
  /** Callback para parametrizar um item individual no ERP */
  onParametrizarItem?: (item: ExtractedItem) => void;
  /** Callback para parametrizar itens selecionados no ERP */
  onParametrizarSelecionados?: (itens: ExtractedItem[]) => void;
  /** Total de itens sensíveis pré-computado (opcional) */
  totalItensSensiveis?: number;
  /** Destinação por item para apuração de DIFAL/ST */
  destinacaoPorItem?: Record<string | number, 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'>;
  /** Callback para alterar a destinação de um item */
  onAlterarDestinacaoItem?: (index: number, destinacao: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado') => void;
  /** Destinação padrão da nota */
  destinacaoPadrao?: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado';
  /** Mapa de diagnósticos periciais de DIFAL por item */
  diagnosticosDifal?: Record<string | number, any>;
  /** Contrato canônico por índice do item (CT-e FOB, CMV líquido CPC 16, pendências Anexo IX) */
  itensAuditadosMap?: Record<number, ItemFiscalAuditado>;
  /** Dataset Siscomex para aderência xProd x NCM e validação RGI de candidatos */
  dataset?: Dataset | null;
  /** Marco legal para simulação Antes x Depois */
  marco?: MarcoLegal | null;
  /** Callback Dual-Track ao aplicar NCM saneado para Saída/ERP/Precificação */
  onAplicarSaneamentoNcm?: (nItem: number, ncmSaneado: string, justificativa: string) => void;
  /** Callback ao reverter NCM saneado para o NCM original do XML */
  onReverterSaneamentoNcm?: (nItem: number) => void;
}

/* =========================================================================
 * 2. FORMATADORES AUXILIARES
 * ========================================================================= */

function formatarBrl(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarNcm(ncm: string): string {
  if (!ncm) return '--------';
  const limpo = ncm.replace(/\D/g, '');
  if (limpo.length === 8) {
    return `${limpo.slice(0, 4)}.${limpo.slice(4, 6)}.${limpo.slice(6)}`;
  }
  return ncm;
}

function formatarPct(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatarQtd(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/* =========================================================================
 * 3. COMPONENTE PRINCIPAL
 * ========================================================================= */

export default function TabelaItensExtracao({
  itens,
  selectedIndices,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onSelectSensitivesOnly,
  onSelectOnlySensitive,
  readOnly = false,
  disabled = false,
  onItemClick,
  onPrecificarItem,
  onParametrizarItem,
  onParametrizarSelecionados,
  totalItensSensiveis,
  destinacaoPorItem,
  onAlterarDestinacaoItem,
  destinacaoPadrao = 'comercializacao',
  diagnosticosDifal,
  itensAuditadosMap,
  dataset,
  marco,
  onAplicarSaneamentoNcm,
  onReverterSaneamentoNcm,
}: TabelaItensExtracaoProps) {
  // ---- Hooks chamados estritamente no topo para cumprir scripts/hookcheck.mjs ----
  const { nivel, isGerencial, isSenior } = useNivelOperacional();

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroVisualizacao>('todos');
  const [itemInspecionado, setItemInspecionado] = useState<ExtractedItem | null>(null);
  const [drawerAberto, setDrawerAberto] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<string>('tributos');
  const [itemExpandido, setItemExpandido] = useState<number | null>(null);
  const [ncmCandidatoInput, setNcmCandidatoInput] = useState<string>('');
  const [justificativaInput, setJustificativaInput] = useState<string>('');
  const [statusSaneamentoMsg, setStatusSaneamentoMsg] = useState<string>('');
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Set para lookup O(1) em render de alta performance (100+ itens)
  const selectedSet = useMemo(() => {
    if (selectedIndices instanceof Set) {
      return selectedIndices;
    }
    return new Set(selectedIndices || []);
  }, [selectedIndices]);

  const selectedCount = useMemo(() => {
    return itens.filter((it) => selectedSet.has(it.index)).length;
  }, [itens, selectedSet]);

  // Ação unificada para seleção de sensíveis
  const handleSelectSensitives = useCallback(() => {
    if (onSelectSensitivesOnly) {
      onSelectSensitivesOnly();
    } else if (onSelectOnlySensitive) {
      onSelectOnlySensitive();
    }
  }, [onSelectSensitivesOnly, onSelectOnlySensitive]);

  // Contagem de sensíveis detectados
  const contagemSensiveis = useMemo(() => {
    if (typeof totalItensSensiveis === 'number') return totalItensSensiveis;
    return itens.filter((it) => it.sensivelParaAuditoria).length;
  }, [itens, totalItensSensiveis]);

  // Contagem de itens com NCM inválido no Siscomex
  const contagemInconsistentes = useMemo(() => {
    return itens.filter((it) => !it.ncmValidoSiscomex || it.ncm.length !== 8).length;
  }, [itens]);

  // Filtragem e busca de itens
  const itensExibidos = useMemo(() => {
    let res = itens;

    // Filtro por categoria
    if (filtro === 'sensiveis') {
      res = res.filter((it) => it.sensivelParaAuditoria);
    } else if (filtro === 'selecionados') {
      res = res.filter((it) => selectedSet.has(it.index));
    } else if (filtro === 'inconsistentes') {
      res = res.filter((it) => !it.ncmValidoSiscomex || it.ncm.length !== 8);
    }

    // Busca textual (cProd, xProd, ncm, cfop, cEAN)
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      const termoNumerico = termo.replace(/\D/g, '');
      const isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2;
      res = res.filter((it) => {
        return (
          (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
          (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
          (isNcmQuery && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)) ||
          (it.cfop && it.cfop.includes(termo)) ||
          (it.cEAN && it.cEAN.includes(termo))
        );
      });
    }

    return res;
  }, [itens, filtro, busca, selectedSet]);

  // Métricas financeiras e tributárias dos itens selecionados
  const resumoSelecionados = useMemo(() => {
    const selItens = itens.filter((it) => selectedSet.has(it.index));
    const totalValorProd = selItens.reduce((acc, it) => acc + (it.vProd || 0), 0);
    const totalIcms = selItens.reduce((acc, it) => acc + (it.tributos?.vICMS || 0), 0);
    const totalIpi = selItens.reduce((acc, it) => acc + (it.tributos?.vIPI || 0), 0);
    const totalPis = selItens.reduce((acc, it) => acc + (it.tributos?.vPIS || 0), 0);
    const totalCofins = selItens.reduce((acc, it) => acc + (it.tributos?.vCOFINS || 0), 0);
    const totalSensiveisSel = selItens.filter((it) => it.sensivelParaAuditoria).length;

    return {
      quantidade: selItens.length,
      totalValorProd,
      totalIcms,
      totalIpi,
      totalPis,
      totalCofins,
      totalSensiveisSel,
    };
  }, [itens, selectedSet]);

  // Controle de estado tri-state do checkbox mestre
  const todosSelecionados = itens.length > 0 && selectedCount === itens.length;
  const algumSelecionado = selectedCount > 0 && selectedCount < itens.length;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = algumSelecionado;
    }
  }, [algumSelecionado]);

  const handleMasterCheckboxChange = useCallback(() => {
    if (readOnly || disabled) return;
    if (todosSelecionados) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  }, [readOnly, disabled, todosSelecionados, onDeselectAll, onSelectAll]);

  // Abrir inspeção no Drawer de 500px
  const handleAbrirInspecao = useCallback(
    (item: ExtractedItem, e?: React.MouseEvent, abaInicial: string = 'tributos') => {
      if (e) e.stopPropagation();
      setItemInspecionado(item);
      setDrawerTab(abaInicial);
      setDrawerAberto(true);
      const aud = itensAuditadosMap?.[item.index];
      const ader = aud?.saneamentoNcm?.aderencia || (dataset ? avaliarAderenciaNcm(item.xProd, item.ncm, dataset) : null);
      const sugInicial =
        aud?.saneamentoNcm?.ncmSaneadoSaida ||
        ader?.candidatosRgi?.[0]?.ncm ||
        item.ncm;
      setNcmCandidatoInput(normalizeNcm(sugInicial));
      setJustificativaInput(
        aud?.saneamentoNcm?.justificativaPericial ||
          (ader?.candidatosRgi?.[0]?.motivoSugestao ?? '')
      );
      setStatusSaneamentoMsg('');
      if (onItemClick) {
        onItemClick(item);
      }
    },
    [onItemClick, itensAuditadosMap, dataset]
  );

  const auditadoInspecionado = useMemo(() => {
    if (!itemInspecionado) return null;
    return itensAuditadosMap?.[itemInspecionado.index] || null;
  }, [itemInspecionado, itensAuditadosMap]);

  const aderenciaInspecionada = useMemo(() => {
    if (!itemInspecionado) return null;
    if (auditadoInspecionado?.saneamentoNcm?.aderencia) {
      return auditadoInspecionado.saneamentoNcm.aderencia;
    }
    return dataset ? avaliarAderenciaNcm(itemInspecionado.xProd, itemInspecionado.ncm, dataset) : null;
  }, [itemInspecionado, auditadoInspecionado, dataset]);

  const ncmCandidatoNorm = useMemo(() => normalizeNcm(ncmCandidatoInput), [ncmCandidatoInput]);

  const ncmCandidatoRecord = useMemo(() => {
    if (ncmCandidatoNorm.length !== 8 || !dataset) return null;
    return dataset.byD8.get(ncmCandidatoNorm) || null;
  }, [ncmCandidatoNorm, dataset]);

  const ncmCandidatoValidoSiscomex = useMemo(() => {
    if (ncmCandidatoNorm.length !== 8) return false;
    return dataset ? dataset.byD8.has(ncmCandidatoNorm) : true;
  }, [ncmCandidatoNorm, dataset]);

  const impactoSimulado = useMemo(() => {
    if (!auditadoInspecionado || !ncmCandidatoValidoSiscomex) return null;
    return simularImpactoSaneamentoNcm(auditadoInspecionado, ncmCandidatoNorm, {
      ds: dataset,
      marco,
    });
  }, [auditadoInspecionado, ncmCandidatoValidoSiscomex, ncmCandidatoNorm, dataset, marco]);

  const handleAplicarSaneamentoClick = useCallback(() => {
    if (!itemInspecionado || !onAplicarSaneamentoNcm || !ncmCandidatoValidoSiscomex) return;
    onAplicarSaneamentoNcm(
      itemInspecionado.index,
      ncmCandidatoNorm,
      justificativaInput.trim() || `Saneamento RGI aplicado para ${fmtCode(ncmCandidatoNorm)}`
    );
    setStatusSaneamentoMsg(
      `NCM saneado ${fmtCode(ncmCandidatoNorm)} aplicado na saída (ERP e Precificação); NCM ${formatarNcm(itemInspecionado.ncm)} preservado na entrada XML.`
    );
  }, [itemInspecionado, onAplicarSaneamentoNcm, ncmCandidatoValidoSiscomex, ncmCandidatoNorm, justificativaInput]);

  const handleReverterSaneamentoClick = useCallback(() => {
    if (!itemInspecionado || !onReverterSaneamentoNcm) return;
    onReverterSaneamentoNcm(itemInspecionado.index);
    setStatusSaneamentoMsg(
      `Saneamento revertido para o NCM original do XML (${formatarNcm(itemInspecionado.ncm)}).`
    );
  }, [itemInspecionado, onReverterSaneamentoNcm]);

  const handleFecharDrawer = useCallback(() => {
    setDrawerAberto(false);
  }, []);

  // Citações normativas do item sob inspeção
  const citacoesItem = useMemo<NormativeCitation[]>(() => {
    if (!itemInspecionado) return [];
    const list: NormativeCitation[] = [];

    list.push({
      id: 'ricms-pr-art3',
      norma: 'RICMS/PR - Decreto Estadual nº 7.871/2017',
      artigo: 'Art. 3º, Inciso XIV c/c Art. 11',
      ementa: 'Diferencial de alíquota interestadual (DIFAL) com cálculo de Base Dupla e dedução do imposto de origem.',
      esfera: 'estadual-pr',
      statusVigencia: 'vigente',
      linkOficial: 'http://www.fazenda.pr.gov.br',
    });

    if (itemInspecionado.cfop?.startsWith('6') || itemInspecionado.cfop?.startsWith('2')) {
      list.push({
        id: 'lc-190',
        norma: 'Lei Complementar nº 190/2022',
        artigo: 'Art. 2º e 3º',
        ementa: 'Disciplina a cobrança do DIFAL do ICMS nas operações interestaduais destinadas a consumidor final ou adquirente paranaense.',
        esfera: 'federal',
        statusVigencia: 'vigente',
      });
    }

    list.push({
      id: 'lc-214-split',
      norma: 'Lei Complementar nº 214/2025 (Reforma Tributária)',
      artigo: 'Art. 47 e 48',
      ementa: 'Apropriação de créditos de IBS e CBS condicionada à comprovação da extinção do débito do fornecedor via Split Payment.',
      esfera: 'federal',
      statusVigencia: 'transicao',
    });

    return list;
  }, [itemInspecionado]);

  // Se a lista estiver vazia
  if (!itens || itens.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 16px', marginTop: 16 }}>
        <p className="hint">Nenhum item disponível na nota fiscal para exibição.</p>
      </div>
    );
  }

  return (
    <div className="st-table-card" style={{ marginTop: 16 }}>
      {/* ---------------- CABEÇALHO DA TABELA E ESTATÍSTICAS ---------------- */}
      <div style={{ padding: '16px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, textTransform: 'none', fontSize: 16, color: 'var(--ink)' }}>
            Itens da Nota Fiscal ({itens.length} {itens.length === 1 ? 'item' : 'itens'})
          </h3>
          <p className="hint" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
            Extração determinística completa (zero LLM). Tabela enxuta de 7 colunas com inspeção pericial sob demanda.
          </p>
        </div>

        {/* Resumo de Badges no Cabeçalho */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${resumoSelecionados.quantidade > 0 ? 'blue' : 'grey'}`} style={{ padding: '4px 10px', fontSize: 12 }}>
            {resumoSelecionados.quantidade} de {itens.length} selecionados
          </span>

          {contagemSensiveis > 0 && (
            <span
              className="badge media"
              style={{ padding: '4px 10px', fontSize: 12 }}
              title="Itens com risco tributário detectado deterministicamente"
            >
              ⚠️ {contagemSensiveis} {contagemSensiveis === 1 ? 'sensível' : 'sensíveis'}
            </span>
          )}

          {contagemInconsistentes > 0 && (
            <span
              className="badge baixa"
              style={{ padding: '4px 10px', fontSize: 12 }}
              title="Itens com NCM não localizado no Siscomex oficial"
            >
              ⛔ {contagemInconsistentes} NCM {contagemInconsistentes === 1 ? 'inválido' : 'inválidos'}
            </span>
          )}
        </div>
      </div>

      {/* ---------------- BARRA DE FERRAMENTAS E FILTROS RÁPIDOS ---------------- */}
      <div className="st-table-toolbar" style={{ margin: '14px 16px', borderRadius: 10, border: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="mini"
            onClick={onSelectAll}
            disabled={readOnly || disabled}
            title="Selecionar Todos"
            style={{ minHeight: '44px' }}
          >
            Selecionar Todos ({itens.length})
          </button>
          <button
            type="button"
            className="mini"
            onClick={onDeselectAll}
            disabled={readOnly || disabled}
            title="Desmarcar Todos"
            style={{ minHeight: '44px' }}
          >
            Desmarcar Todos
          </button>
          <button
            type="button"
            className="mini"
            onClick={handleSelectSensitives}
            disabled={readOnly || disabled || contagemSensiveis === 0}
            style={{
              borderColor: contagemSensiveis > 0 ? 'var(--accent-amber)' : undefined,
              background: contagemSensiveis > 0 ? 'var(--accent-amber-subtle)' : undefined,
              color: contagemSensiveis > 0 ? 'var(--warn)' : undefined,
              fontWeight: contagemSensiveis > 0 ? 700 : undefined,
              minHeight: '44px',
            }}
            title="Selecionar Apenas Sensíveis"
          >
            ⚠️ Selecionar Apenas Sensíveis {contagemSensiveis > 0 ? `(${contagemSensiveis})` : ''}
          </button>
          {onParametrizarSelecionados && (
            <button
              type="button"
              className="mini"
              onClick={() => {
                const selecionados = itens.filter((it) => selectedSet.has(it.index));
                if (selecionados.length > 0) {
                  onParametrizarSelecionados(selecionados);
                }
              }}
              disabled={readOnly || disabled || selectedCount === 0}
              style={{
                borderColor: 'var(--accent-blue)',
                background: 'var(--accent-blue-subtle)',
                color: 'var(--accent-blue)',
                fontWeight: 700,
                minHeight: '44px',
              }}
              title="Enviar itens selecionados para a tela de parametrização de ERP"
            >
              ⚙️ Parametrizar Selecionados ({selectedCount})
            </button>
          )}
        </div>

        {/* Busca e Filtros por Categoria */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="mini"
              style={{
                background: filtro === 'todos' ? 'var(--accent-forest-deep)' : 'var(--bg-card)',
                color: filtro === 'todos' ? '#34d399' : 'var(--ink-2)',
                borderColor: filtro === 'todos' ? 'var(--accent-emerald)' : undefined,
                fontWeight: filtro === 'todos' ? 700 : 500,
                minHeight: '44px',
              }}
              onClick={() => setFiltro('todos')}
            >
              Todos ({itens.length})
            </button>
            <button
              type="button"
              className="mini"
              style={{
                background: filtro === 'sensiveis' ? 'var(--accent-amber-subtle)' : 'var(--bg-card)',
                color: filtro === 'sensiveis' ? 'var(--warn)' : 'var(--ink-2)',
                borderColor: filtro === 'sensiveis' ? 'var(--accent-amber)' : undefined,
                fontWeight: filtro === 'sensiveis' ? 700 : 500,
                minHeight: '44px',
              }}
              onClick={() => setFiltro('sensiveis')}
            >
              Sensíveis ({contagemSensiveis})
            </button>
            <button
              type="button"
              className="mini"
              style={{
                background: filtro === 'selecionados' ? 'var(--accent-emerald-glow)' : 'var(--bg-card)',
                color: filtro === 'selecionados' ? 'var(--ok)' : 'var(--ink-2)',
                borderColor: filtro === 'selecionados' ? 'var(--accent-emerald)' : undefined,
                fontWeight: filtro === 'selecionados' ? 700 : 500,
                minHeight: '44px',
              }}
              onClick={() => setFiltro('selecionados')}
            >
              Marcados ({selectedCount})
            </button>
          </div>

          <input
            type="text"
            placeholder="Buscar por código, produto ou NCM..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ width: 220, fontSize: 12, minHeight: '44px' }}
          />
        </div>
      </div>

      {/* Alerta de nenhum item selecionado */}
      {selectedCount === 0 && (
        <div role="status" className="note atencao" style={{ margin: '0 16px 12px' }}>
          ⚠️ Nenhum item selecionado para auditoria. Marque ao menos um item para prosseguir com a análise fiscal.
        </div>
      )}

      {/* ---------------- TABELA ENXUTA DE 7 COLUNAS COM TABULAR-NUMS ---------------- */}
      <div className="st-table-scroll" style={{ maxHeight: '60vh' }}>
        <table className="st-data-table" aria-label="Tabela enxuta de itens da nota fiscal">
          <thead>
            <tr>
              <th style={{ width: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={handleMasterCheckboxChange}
                    disabled={readOnly || disabled}
                    aria-label="Selecionar ou desmarcar todos os itens da nota"
                    title={todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                    style={{ cursor: readOnly || disabled ? 'not-allowed' : 'pointer' }}
                  />
                  <span>Item / Cód. / EAN</span>
                </div>
              </th>
              <th>Descrição / NCM (Siscomex) <span className="sr-only">Descrição do Produto</span></th>
              <th style={{ width: 155 }}>CFOP / Destinação <span className="sr-only">CST / CSOSN</span></th>
              <th className="is-right" style={{ width: 125 }}>Vlr. Operação <span className="sr-only">V. Total</span></th>
              <th style={{ width: 165 }}>ICMS / ST / DIFAL <span className="sr-only">Tributos Destacados</span></th>
              <th style={{ width: 135 }}>Crédito Efetivo <span className="sr-only">Sensibilidade</span></th>
              <th className="is-center" style={{ width: 110 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {itensExibidos.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--ink-2)' }}>
                  Nenhum item corresponde ao filtro ou busca aplicada.
                </td>
              </tr>
            ) : (
              itensExibidos.map((item) => {
                const isSelected = selectedSet.has(item.index);
                const diag = diagnosticosDifal?.[item.index] || diagnosticosDifal?.[item.cProd];
                const auditado = itensAuditadosMap?.[item.index];
                const destinacaoItem =
                  destinacaoPorItem?.[item.index] ||
                  destinacaoPorItem?.[item.cProd] ||
                  destinacaoPadrao;

                return (
                  <tr
                    key={item.index}
                    onClick={() => !readOnly && !disabled && onToggleSelect(item.index)}
                    className={isSelected ? 'is-selected' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => !readOnly && !disabled && onToggleSelect(item.index)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={readOnly || disabled}
                          aria-label={`Selecionar item ${item.index}`}
                          style={{ cursor: readOnly || disabled ? 'not-allowed' : 'pointer' }}
                        />
                        <div>
                          <strong className="mono" style={{ fontSize: 12 }}>#{item.index}</strong>
                          <div className="mono muted" style={{ fontSize: 11 }}>
                            {item.cProd || 'S/ CÓD'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                        {item.xProd || 'Descrição ausente'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span className="mono tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ok)' }}>
                          {formatarNcm(item.ncm)}
                        </span>
                        {item.ncmValidoSiscomex ? (
                          <span className="badge alta" style={{ fontSize: 10 }}>✓ Siscomex</span>
                        ) : (
                          <span className="badge baixa" style={{ fontSize: 10 }} title="NCM não encontrado no catálogo oficial Siscomex">
                            ⚠️ Inválido
                          </span>
                        )}
                        {item.sensivelParaAuditoria && (
                          <span className="badge media" style={{ fontSize: 10 }}>⚠️ Sensível</span>
                        )}
                        {auditado?.tributacaoReforma?.requerConferenciaAnexoIX && (
                          <span
                            className="badge media"
                            style={{ fontSize: 10 }}
                            title={auditado.tributacaoReforma.observacaoNormativa}
                          >
                            Anexo IX pendente
                          </span>
                        )}
                        {auditado?.cteFobVinculado && auditado.custoCpc16.freteCteFob > 0 && (
                          <span className="badge blue tabular-nums" style={{ fontSize: 10 }}>
                            CT-e FOB: +{formatarBrl(auditado.custoCpc16.freteCteFob)}
                          </span>
                        )}
                        {auditado?.saneamentoNcm?.overrideAtivo && auditado.saneamentoNcm.ncmSaneadoSaida ? (
                          <span className="badge alta tabular-nums" style={{ fontSize: 10 }}>
                            ✓ Saneado → {formatarNcm(auditado.saneamentoNcm.ncmSaneadoSaida)} (XML: {formatarNcm(auditado.ncmEscrituradoEntrada)})
                          </span>
                        ) : auditado?.saneamentoNcm?.aderencia ? (
                          auditado.saneamentoNcm.aderencia.statusAderencia === 'ADERENTE' ? (
                            <span className="badge alta tabular-nums" style={{ fontSize: 10 }} title={`Aderência xProd × NCM: ${auditado.saneamentoNcm.aderencia.scoreAderencia}/100`}>
                              ✓ Aderente ({auditado.saneamentoNcm.aderencia.scoreAderencia}%)
                            </span>
                          ) : auditado.saneamentoNcm.aderencia.statusAderencia === 'DIVERGENTE' ? (
                            <span className="badge baixa tabular-nums" style={{ fontSize: 10 }} title={auditado.saneamentoNcm.aderencia.motivos[0]}>
                              ⛔ Divergente ({auditado.saneamentoNcm.aderencia.scoreAderencia}%)
                            </span>
                          ) : (
                            <span className="badge media tabular-nums" style={{ fontSize: 10 }} title={auditado.saneamentoNcm.aderencia.motivos[0]}>
                              ⚠️ Perícia NCM ({auditado.saneamentoNcm.aderencia.scoreAderencia}%)
                            </span>
                          )
                        ) : null}
                      </div>
                    </td>

                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                          {item.cfop || '----'}
                        </span>
                        {item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
                          <span className="badge media" style={{ fontSize: 9.5 }} title="Operação Interestadual">Inter</span>
                        )}
                        {item.tributos?.csosn ? (
                          <span className="badge grey" style={{ fontSize: 9.5 }}>CSOSN {item.tributos.csosn}</span>
                        ) : item.tributos?.cstIcms ? (
                          <span className="badge blue" style={{ fontSize: 9.5 }}>CST {item.tributos.cstIcms}</span>
                        ) : null}
                      </div>

                      <select
                        value={destinacaoItem}
                        onChange={(e) =>
                          onAlterarDestinacaoItem &&
                          onAlterarDestinacaoItem(item.index, e.target.value as any)
                        }
                        disabled={readOnly || disabled}
                        style={{
                          fontSize: 11,
                          padding: '4px 6px',
                          minHeight: '32px',
                          marginTop: 4,
                          width: '100%',
                          maxWidth: 132,
                        }}
                        title="Destinação para apuração de DIFAL / ST"
                      >
                        <option value="comercializacao">Revenda</option>
                        <option value="industrializacao">Industrialização</option>
                        <option value="uso_consumo">Uso / Consumo</option>
                        <option value="ativo_imobilizado">Ativo Imobilizado</option>
                      </select>
                    </td>

                    <td className="is-right tabular-nums">
                      <strong style={{ fontSize: 13 }}>{formatarBrl(item.vProd)}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {formatarQtd(item.qCom)} {item.uCom || 'UN'}
                      </div>
                      {auditado && (
                        <div className="mono tabular-nums" style={{ fontSize: 10.5, color: 'var(--ok)', fontWeight: 600 }}>
                          CMV: {formatarBrl(auditado.custoCpc16.cmvLiquidoUnitario)}/un
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {item.tributos?.vICMS !== undefined && item.tributos.vICMS > 0 ? (
                          <span className="mono tabular-nums" style={{ fontSize: 11, color: 'var(--accent-blue)', fontWeight: 600 }}>
                            ICMS: {formatarBrl(item.tributos.vICMS)} ({formatarPct(item.tributos.pICMS)})
                          </span>
                        ) : (
                          <span className="mono muted" style={{ fontSize: 11 }}>ICMS: R$ 0,00</span>
                        )}

                        {item.tributos?.vICMSST !== undefined && item.tributos.vICMSST > 0 && (
                          <span className="mono tabular-nums" style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 600 }}>
                            ST: {formatarBrl(item.tributos.vICMSST)}
                          </span>
                        )}

                        {diag?.exigeRecolhimento && (
                          <span className="mono tabular-nums" style={{ fontSize: 11, color: 'var(--bad)', fontWeight: 700 }}>
                            DIFAL PR: {formatarBrl(diag.valorDebitoDifal)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {item.sensivelParaAuditoria ? (
                        <span className="badge amber">⚠️ Requer Perícia</span>
                      ) : (
                        <span className="badge green">✓ Crédito Válido</span>
                      )}
                      <div className="mono muted tabular-nums" style={{ fontSize: 10.5, marginTop: 4 }}>
                        PIS/COF: {formatarBrl((item.tributos?.vPIS || 0) + (item.tributos?.vCOFINS || 0))}
                      </div>
                    </td>

                    <td className="is-center" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={(e) => handleAbrirInspecao(item, e, 'tributos')}
                          aria-expanded={drawerAberto && itemInspecionado?.index === item.index}
                          aria-controls="drawer-item-detalhes"
                          title={`Inspecionar detalhes periciais do item #${item.index}`}
                          className="btn-inspect"
                          style={{ minHeight: '44px', minWidth: '88px' }}
                        >
                          <span>Inspecionar</span>
                        </button>
                        {auditado?.saneamentoNcm && auditado.saneamentoNcm.aderencia.statusAderencia !== 'ADERENTE' && (
                          <button
                            type="button"
                            onClick={(e) => handleAbrirInspecao(item, e, 'saneamento')}
                            className="mini st-touch-target"
                            style={{
                              minHeight: '44px',
                              minWidth: '88px',
                              background: 'var(--accent-amber-subtle)',
                              borderColor: 'rgba(245, 158, 11, 0.5)',
                              color: 'var(--warn)',
                              fontWeight: 700,
                            }}
                            title="Abrir assistente de saneamento xProd × NCM com simulação Antes × Depois"
                          >
                            Sanear NCM
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- ITEM DETAIL DRAWER LATERAL (500px) ---------------- */}
      <ItemDetailDrawer
        isOpen={drawerAberto}
        onClose={handleFecharDrawer}
        title={itemInspecionado ? `Item #${itemInspecionado.index} · ${itemInspecionado.cProd || 'S/ CÓD'}` : ''}
        subtitle={itemInspecionado?.xProd || ''}
        tabs={[
          { id: 'tributos', label: 'Tributos XML' },
          { id: 'saneamento', label: 'Saneamento NCM' },
          { id: 'difal-st', label: 'DIFAL & Base Dupla PR' },
          { id: 'creditos', label: 'Créditos LC 214' },
          { id: 'base-legal', label: 'Fundamentação Legal' },
        ]}
        activeTabId={drawerTab}
        onTabChange={setDrawerTab}
        width="500px"
        footerActions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {onPrecificarItem && itemInspecionado && (
              <button
                type="button"
                onClick={() => {
                  onPrecificarItem(itemInspecionado);
                  handleFecharDrawer();
                }}
                className="st-btn-secondary"
                style={{ minHeight: '44px' }}
              >
                Precificar Item
              </button>
            )}
            {onParametrizarItem && itemInspecionado && (
              <button
                type="button"
                onClick={() => {
                  onParametrizarItem(itemInspecionado);
                  handleFecharDrawer();
                }}
                className="st-btn-primary"
                style={{ minHeight: '44px' }}
              >
                Parametrizar no ERP
              </button>
            )}
            <button
              type="button"
              onClick={handleFecharDrawer}
              className="st-btn-secondary"
              style={{ minHeight: '44px' }}
            >
              Fechar
            </button>
          </div>
        }
      >
        {itemInspecionado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {drawerTab === 'tributos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="st-subcard">
                  <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                    Tributos Destacados na NF-e
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>Valor Mercadoria:</span>
                      <strong className="mono tabular-nums">{formatarBrl(itemInspecionado.vProd)}</strong>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>Qtd / UN:</span>
                      <strong className="mono">{formatarQtd(itemInspecionado.qCom)} {itemInspecionado.uCom || 'UN'}</strong>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>Base de Cálculo ICMS:</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vBC)}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>ICMS Próprio ({formatarPct(itemInspecionado.tributos?.pICMS)}):</span>
                      <span className="mono tabular-nums" style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{formatarBrl(itemInspecionado.tributos?.vICMS)}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>PIS ({formatarPct(itemInspecionado.tributos?.pPIS)}):</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vPIS)}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>COFINS ({formatarPct(itemInspecionado.tributos?.pCOFINS)}):</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vCOFINS)}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>IPI ({formatarPct(itemInspecionado.tributos?.pIPI)}):</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vIPI)}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ display: 'block' }}>ICMS ST:</span>
                      <span className="mono tabular-nums" style={{ color: 'var(--warn)', fontWeight: 700 }}>{formatarBrl(itemInspecionado.tributos?.vICMSST)}</span>
                    </div>
                  </div>
                </div>

                {itemInspecionado.motivosSensibilidade && itemInspecionado.motivosSensibilidade.length > 0 && (
                  <div className="note atencao">
                    <div className="t">⚠️ Alertas e Sensibilidades Identificadas:</div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                      {itemInspecionado.motivosSensibilidade.map((motivo, i) => (
                        <li key={i}>
                          <strong>{MOTIVOS_SENSIBILIDADE_MAP[motivo]?.rotulo || motivo}:</strong>{' '}
                          {MOTIVOS_SENSIBILIDADE_MAP[motivo]?.descricao || ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {drawerTab === 'difal-st' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="st-subcard">
                  <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                    Apuração de DIFAL Paraná (RICMS/PR Dec. 7.871/17)
                  </h4>
                  {diagnosticosDifal?.[itemInspecionado.index] ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                        <span className="muted">Alíquota de Origem:</span>
                        <strong className="mono">{diagnosticosDifal[itemInspecionado.index].aliquotaOrigem}%</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                        <span className="muted">Alíquota Interna PR:</span>
                        <strong className="mono">{diagnosticosDifal[itemInspecionado.index].aliquotaDestino}%</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                        <span className="muted">Base Dupla Calculada:</span>
                        <strong className="mono tabular-nums">{formatarBrl(diagnosticosDifal[itemInspecionado.index].baseCalculoDifal)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                        <span className="muted">DIFAL a Recolher:</span>
                        <strong className="mono tabular-nums" style={{ color: 'var(--bad)' }}>{formatarBrl(diagnosticosDifal[itemInspecionado.index].valorDebitoDifal)}</strong>
                      </div>
                      {diagnosticosDifal[itemInspecionado.index].valorDebitoFecop > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span className="muted">FECOP Paraná:</span>
                          <strong className="mono tabular-nums" style={{ color: 'var(--bad)' }}>{formatarBrl(diagnosticosDifal[itemInspecionado.index].valorDebitoFecop)}</strong>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      Operação interna ou adquirente sem débito de DIFAL apurado para este item.
                    </p>
                  )}
                </div>

                <div className="note info">
                  <div className="t">Trava Decreto 6.048/2024 e 12.828/2026:</div>
                  <div className="x">
                    Vedada a apropriação cumulativa sem retenção de ICMS-ST para mercadorias sujeitas à substituição tributária interna no Paraná.
                  </div>
                </div>
              </div>
            )}

            {drawerTab === 'creditos' && (
              <div className="st-subcard" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                  Classificação em 3 Camadas de Crédito
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                  <span className="muted">1. Destacado no XML:</span>
                  <strong className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vICMS)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                  <span className="muted">2. Admitido pela Regra PR:</span>
                  <strong className="mono tabular-nums" style={{ color: 'var(--accent-blue)' }}>
                    {formatarBrl(itemInspecionado.sensivelParaAuditoria ? 0 : itemInspecionado.tributos?.vICMS)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-muted)' }}>
                  <span className="muted">3. Efetivado no Custo (CPC 16):</span>
                  <strong className="mono tabular-nums" style={{ color: 'var(--ok)' }}>
                    {formatarBrl(itemInspecionado.sensivelParaAuditoria ? 0 : itemInspecionado.tributos?.vICMS)}
                  </strong>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                  Regra Art. 47 da LC nº 214/2025: Apropriação financeira de créditos de IBS/CBS condicionada à liquidação do fornecedor.
                </p>

                {itensAuditadosMap?.[itemInspecionado.index] && (() => {
                  const aud = itensAuditadosMap[itemInspecionado.index];
                  const cp = aud.custoCpc16;
                  return (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <h5 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                        Segregação CPC 16 R1 &amp; CT-e FOB
                      </h5>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Frete NF-e:</span>
                        <span className="mono tabular-nums">{formatarBrl(cp.freteNfe)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Frete CT-e FOB Rateado:</span>
                        <span className="mono tabular-nums" style={{ color: cp.freteCteFob > 0 ? 'var(--accent-blue)' : 'var(--ink-2)' }}>
                          {formatarBrl(cp.freteCteFob)}
                        </span>
                      </div>
                      {cp.freteCteFob > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="muted">Crédito ICMS + PIS/COFINS do Frete:</span>
                          <span className="mono tabular-nums" style={{ color: 'var(--ok)' }}>
                            -{formatarBrl(cp.creditosRecuperaveis.icmsCteFob + cp.creditosRecuperaveis.pisCofinsCteFob)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Tributos Não Recuperáveis:</span>
                        <span className="mono tabular-nums" style={{ color: 'var(--bad)' }}>
                          +{formatarBrl(cp.tributosNaoRecuperaveis.total)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Total Créditos Recuperáveis:</span>
                        <span className="mono tabular-nums" style={{ color: 'var(--ok)', fontWeight: 700 }}>
                          -{formatarBrl(cp.creditosRecuperaveis.total)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px dashed var(--border-muted)' }}>
                        <strong>CMV Líquido Unitário:</strong>
                        <strong className="mono tabular-nums" style={{ color: 'var(--ok)' }}>
                          {formatarBrl(cp.cmvLiquidoUnitario)} / {aud.uCom}
                        </strong>
                      </div>
                      {nivel === 'senior' && cp.memoriaCalculo.length > 0 && (
                        <pre className="mono" style={{ margin: '6px 0 0', padding: 8, background: 'var(--bg-surface-card)', borderRadius: 6, fontSize: 10.5, whiteSpace: 'pre-wrap' }}>
                          {cp.memoriaCalculo.join('\n')}
                        </pre>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {drawerTab === 'base-legal' && (
              <LegalCitationBlock
                citations={citacoesItem}
                currentLevel={nivel}
                title="Fundamentação Legal do Item"
                defaultCollapsed={false}
                calculationMemory={`Base_1 = Valor_Item (${formatarBrl(itemInspecionado.vProd)}) - ICMS_Origem (${formatarBrl(itemInspecionado.tributos?.vICMS)})\nBase_2 = Base_1 / (1 - 0.195)\nDIFAL = (Base_2 * 0.195) - ICMS_Origem`}
              />
            )}

            {drawerTab === 'saneamento' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="st-subcard">
                  <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                    Confronto Entrada XML × Classificação Fiscal
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, fontSize: 12 }}>
                    <div>
                      <span className="muted">Descrição XML (xProd): </span>
                      <strong>{itemInspecionado.xProd}</strong>
                    </div>
                    <div>
                      <span className="muted">NCM Escriturado (XML Entrada): </span>
                      <span className="mono tabular-nums" style={{ fontWeight: 700 }}>
                        {formatarNcm(auditadoInspecionado?.ncmEscrituradoEntrada || itemInspecionado.ncm)}
                      </span>
                      {aderenciaInspecionada?.descricaoOficialNcm && (
                        <span className="muted"> — {aderenciaInspecionada.descricaoOficialNcm}</span>
                      )}
                    </div>
                    {aderenciaInspecionada && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        <span
                          className={`badge tabular-nums ${
                            aderenciaInspecionada.statusAderencia === 'ADERENTE'
                              ? 'alta'
                              : aderenciaInspecionada.statusAderencia === 'DIVERGENTE'
                              ? 'baixa'
                              : 'media'
                          }`}
                        >
                          {aderenciaInspecionada.statusAderencia === 'ADERENTE'
                            ? `✓ Aderente (${aderenciaInspecionada.scoreAderencia}%)`
                            : aderenciaInspecionada.statusAderencia === 'DIVERGENTE'
                            ? `⛔ Divergente (${aderenciaInspecionada.scoreAderencia}%)`
                            : `⚠️ Perícia NCM (${aderenciaInspecionada.scoreAderencia}%)`}
                        </span>
                        {auditadoInspecionado?.saneamentoNcm?.overrideAtivo && auditadoInspecionado.saneamentoNcm.ncmSaneadoSaida && (
                          <span className="badge blue tabular-nums">
                            Ativo p/ Saída: {formatarNcm(auditadoInspecionado.saneamentoNcm.ncmSaneadoSaida)}
                          </span>
                        )}
                      </div>
                    )}
                    {aderenciaInspecionada && aderenciaInspecionada.motivos.length > 0 && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11.5, color: 'var(--ink-2)' }}>
                        {aderenciaInspecionada.motivos.map((m, idx) => (
                          <li key={idx}>{m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="st-subcard">
                  <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                    Top 3 Candidatos RGI &amp; NCM Alternativo
                  </h4>
                  {aderenciaInspecionada && aderenciaInspecionada.candidatosRgi.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {aderenciaInspecionada.candidatosRgi.map((cand) => {
                        const selecionado = ncmCandidatoNorm === cand.ncm;
                        return (
                          <button
                            key={cand.ncm}
                            type="button"
                            onClick={() => {
                              setNcmCandidatoInput(cand.ncm);
                              setJustificativaInput((prev) => prev || cand.motivoSugestao);
                            }}
                            className="mini st-touch-target"
                            style={{
                              minHeight: '44px',
                              textAlign: 'left',
                              justifyContent: 'space-between',
                              padding: '8px 10px',
                              background: selecionado ? 'var(--accent-blue-subtle)' : 'var(--bg-card)',
                              borderColor: selecionado ? 'var(--accent-blue)' : 'var(--border-muted)',
                            }}
                          >
                            <div>
                              <strong className="mono tabular-nums">{cand.ncmFormatado}</strong>{' '}
                              <span style={{ fontSize: 11.5 }}>{cand.descricaoOficial}</span>
                              <div className="muted" style={{ fontSize: 10.5 }}>
                                {cand.regraRgiAplicada} · Score {cand.score}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <label className="field" style={{ marginBottom: 8 }}>
                    <span>Digitar NCM de 8 dígitos (validado no Siscomex)</span>
                    <input
                      className="mono tabular-nums"
                      value={ncmCandidatoInput}
                      onChange={(e) => setNcmCandidatoInput(e.target.value)}
                      placeholder="Ex.: 19059090"
                      style={{ minHeight: '44px' }}
                    />
                  </label>
                  {ncmCandidatoNorm.length === 8 && (
                    <div style={{ fontSize: 11.5, marginBottom: 8 }}>
                      {ncmCandidatoValidoSiscomex ? (
                        <span style={{ color: 'var(--ok)' }}>
                          ✓ Válido no Siscomex: {ncmCandidatoRecord?.desc || 'Confirmado'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--bad)' }}>
                          ⛔ NCM {formatarNcm(ncmCandidatoNorm)} não localizado na tabela oficial Siscomex.
                        </span>
                      )}
                    </div>
                  )}

                  <label className="field">
                    <span>Justificativa Pericial (registrada no laudo)</span>
                    <textarea
                      rows={2}
                      value={justificativaInput}
                      onChange={(e) => setJustificativaInput(e.target.value)}
                      placeholder="Fundamente pela RGI 1 / RGI 3(a) / Nota Legal o motivo do saneamento de saída."
                    />
                  </label>
                </div>

                {impactoSimulado && (
                  <div className="st-subcard">
                    <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink)' }}>
                      Simulação Antes × Depois (ICMS PR, ST, DIFAL, LC 214, CMV)
                    </h4>
                    <table className="tb tabular-nums" style={{ width: '100%', fontSize: 11.5 }}>
                      <thead>
                        <tr>
                          <th>Indicador</th>
                          <th className="is-right">XML Entrada</th>
                          <th className="is-right">Saneado Saída</th>
                          <th className="is-right">Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>ICMS PR + FECOP</td>
                          <td className="is-right">{impactoSimulado.antes.aliqIcmsPrPct}%+{impactoSimulado.antes.fecopPrPct}%</td>
                          <td className="is-right">{impactoSimulado.depois.aliqIcmsPrPct}%+{impactoSimulado.depois.fecopPrPct}%</td>
                          <td className="is-right">{impactoSimulado.deltaAliqIcmsPrPct >= 0 ? '+' : ''}{impactoSimulado.deltaAliqIcmsPrPct}%</td>
                        </tr>
                        <tr>
                          <td>ST PR / MVA Orig.</td>
                          <td className="is-right">{impactoSimulado.antes.sujeitoStPr ? `ST (${impactoSimulado.antes.mvaOriginalPrPct}%)` : impactoSimulado.antes.excluidoStPr ? 'Excluído ST' : 'Sem ST'}</td>
                          <td className="is-right">{impactoSimulado.depois.sujeitoStPr ? `ST (${impactoSimulado.depois.mvaOriginalPrPct}%)` : impactoSimulado.depois.excluidoStPr ? 'Excluído ST' : 'Sem ST'}</td>
                          <td className="is-right">—</td>
                        </tr>
                        <tr>
                          <td>DIFAL PR + FECOP</td>
                          <td className="is-right">{formatarBrl(impactoSimulado.antes.totalDifalRecolher)}</td>
                          <td className="is-right">{formatarBrl(impactoSimulado.depois.totalDifalRecolher)}</td>
                          <td className="is-right">{formatarBrl(impactoSimulado.deltaDifalTotal)}</td>
                        </tr>
                        <tr>
                          <td>cClassTrib / Red.</td>
                          <td className="is-right">{impactoSimulado.antes.cClassTrib || 'Pendente'} ({impactoSimulado.antes.reducaoIbsCbsPct}%)</td>
                          <td className="is-right">{impactoSimulado.depois.cClassTrib || 'Pendente'} ({impactoSimulado.depois.reducaoIbsCbsPct}%)</td>
                          <td className="is-right">—</td>
                        </tr>
                        <tr>
                          <td><strong>CMV Líquido Unit.</strong></td>
                          <td className="is-right">{formatarBrl(impactoSimulado.antes.cmvLiquidoUnitario)}</td>
                          <td className="is-right">{formatarBrl(impactoSimulado.depois.cmvLiquidoUnitario)}</td>
                          <td className="is-right" style={{ fontWeight: 700, color: impactoSimulado.deltaCmvUnitario > 0 ? 'var(--bad)' : impactoSimulado.deltaCmvUnitario < 0 ? 'var(--ok)' : 'var(--ink)' }}>
                            {impactoSimulado.deltaCmvUnitario >= 0 ? '+' : ''}{formatarBrl(impactoSimulado.deltaCmvUnitario)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div
                  className="note atencao"
                  style={{ fontSize: 11.5, margin: 0 }}
                >
                  <div className="t">Orientação Legal (CC-e vs. Entrada XML × Saída ERP)</div>
                  <div className="x">
                    {auditadoInspecionado?.saneamentoNcm?.orientacaoOperacional || ORIENTACAO_OPERACIONAL_CCE_NCM}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn primary st-touch-target"
                    disabled={!onAplicarSaneamentoNcm || !ncmCandidatoValidoSiscomex || !auditadoInspecionado}
                    onClick={handleAplicarSaneamentoClick}
                    style={{ minHeight: '44px', flex: '1 1 auto' }}
                  >
                    Aplicar NCM Saneado (Saída/ERP/Precificação)
                  </button>
                  <button
                    type="button"
                    className="st-btn-secondary st-touch-target"
                    disabled={!onReverterSaneamentoNcm || !auditadoInspecionado?.saneamentoNcm?.overrideAtivo}
                    onClick={handleReverterSaneamentoClick}
                    style={{ minHeight: '44px' }}
                  >
                    Reverter para NCM do XML
                  </button>
                </div>

                <div role="status" aria-live="polite" style={{ minHeight: 20, fontSize: 12, color: 'var(--ok)', fontWeight: 600 }}>
                  {statusSaneamentoMsg}
                </div>
              </div>
            )}
          </div>
        )}
      </ItemDetailDrawer>
    </div>
  );
}
