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
}: TabelaItensExtracaoProps) {
  // ---- Hooks chamados estritamente no topo para cumprir scripts/hookcheck.mjs ----
  const { nivel, isGerencial, isSenior } = useNivelOperacional();

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroVisualizacao>('todos');
  const [itemInspecionado, setItemInspecionado] = useState<ExtractedItem | null>(null);
  const [drawerAberto, setDrawerAberto] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<string>('tributos');
  const [itemExpandido, setItemExpandido] = useState<number | null>(null);
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
    (item: ExtractedItem, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setItemInspecionado(item);
      setDrawerAberto(true);
      if (onItemClick) {
        onItemClick(item);
      }
    },
    [onItemClick]
  );

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
    <div className="card" style={{ marginTop: 16 }}>
      {/* ---------------- CABEÇALHO DA TABELA E ESTATÍSTICAS ---------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
          <span
            className="badge"
            style={{
              background: resumoSelecionados.quantidade > 0 ? '#e8f0fd' : '#f1f5f9',
              color: resumoSelecionados.quantidade > 0 ? 'var(--brand)' : 'var(--ink-2)',
              border: '1px solid #c9d3e6',
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {resumoSelecionados.quantidade} de {itens.length} selecionados
          </span>

          {contagemSensiveis > 0 && (
            <span
              className="badge media"
              style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600 }}
              title="Itens com risco tributário detectado deterministicamente"
            >
              ⚠️ {contagemSensiveis} {contagemSensiveis === 1 ? 'sensível' : 'sensíveis'}
            </span>
          )}

          {contagemInconsistentes > 0 && (
            <span
              className="badge baixa"
              style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600 }}
              title="Itens com NCM não localizado no Siscomex oficial"
            >
              ⛔ {contagemInconsistentes} NCM {contagemInconsistentes === 1 ? 'inválido' : 'inválidos'}
            </span>
          )}
        </div>
      </div>

      {/* ---------------- BARRA DE FERRAMENTAS E FILTROS RÁPIDOS ---------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          margin: '14px 0',
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid var(--line)',
        }}
      >
        {/* Ações em Lote de Seleção */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="mini"
            onClick={onSelectAll}
            disabled={readOnly || disabled}
            title="Selecionar Todos"
            style={{ minHeight: '36px' }}
          >
            Selecionar Todos ({itens.length})
          </button>
          <button
            type="button"
            className="mini"
            onClick={onDeselectAll}
            disabled={readOnly || disabled}
            title="Desmarcar Todos"
            style={{ minHeight: '36px' }}
          >
            Desmarcar Todos
          </button>
          <button
            type="button"
            className="mini"
            onClick={handleSelectSensitives}
            disabled={readOnly || disabled || contagemSensiveis === 0}
            style={{
              borderColor: contagemSensiveis > 0 ? '#e0a32b' : undefined,
              background: contagemSensiveis > 0 ? '#fffdf5' : undefined,
              color: contagemSensiveis > 0 ? '#92400e' : undefined,
              fontWeight: contagemSensiveis > 0 ? 600 : undefined,
              minHeight: '36px',
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
                borderColor: '#0284c7',
                background: '#f0f9ff',
                color: '#0369a1',
                fontWeight: 600,
                minHeight: '36px',
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
              className={`mini ${filtro === 'todos' ? 'active' : ''}`}
              style={{
                background: filtro === 'todos' ? 'var(--brand)' : '#fff',
                color: filtro === 'todos' ? '#fff' : 'var(--ink-2)',
                fontWeight: filtro === 'todos' ? 650 : 400,
                minHeight: '36px',
              }}
              onClick={() => setFiltro('todos')}
            >
              Todos ({itens.length})
            </button>
            <button
              type="button"
              className={`mini ${filtro === 'sensiveis' ? 'active' : ''}`}
              style={{
                background: filtro === 'sensiveis' ? 'var(--warn)' : '#fff',
                color: filtro === 'sensiveis' ? '#fff' : 'var(--ink-2)',
                fontWeight: filtro === 'sensiveis' ? 650 : 400,
                minHeight: '36px',
              }}
              onClick={() => setFiltro('sensiveis')}
            >
              Sensíveis ({contagemSensiveis})
            </button>
            <button
              type="button"
              className={`mini ${filtro === 'selecionados' ? 'active' : ''}`}
              style={{
                background: filtro === 'selecionados' ? 'var(--ok)' : '#fff',
                color: filtro === 'selecionados' ? '#fff' : 'var(--ink-2)',
                fontWeight: filtro === 'selecionados' ? 650 : 400,
                minHeight: '36px',
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
            style={{
              width: 210,
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #c9d3e6',
              minHeight: '36px',
            }}
          />
        </div>
      </div>

      {/* Alerta de nenhum item selecionado */}
      {selectedCount === 0 && (
        <div
          role="status"
          style={{
            margin: '0 0 12px',
            padding: '8px 14px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 6,
            color: '#92400e',
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          ⚠️ Nenhum item selecionado para auditoria. Marque ao menos um item para prosseguir com a análise fiscal.
        </div>
      )}

      {/* ---------------- TABELA ENXUTA DE 7 COLUNAS COM TABULAR-NUMS ---------------- */}
      <div className="scroll" style={{ maxHeight: '60vh' }}>
        <table className="tb" aria-label="Tabela enxuta de itens da nota fiscal">
          <thead>
            <tr>
              {/* Coluna 1: Item / Cód. */}
              <th style={{ width: 110, textAlign: 'left' }}>
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

              {/* Coluna 2: Descrição / NCM */}
              <th>Descrição / NCM (Siscomex) <span className="sr-only">Descrição do Produto</span></th>

              {/* Coluna 3: CFOP / Destinação */}
              <th style={{ width: 150 }}>CFOP / Destinação <span className="sr-only">CST / CSOSN</span></th>

              {/* Coluna 4: Vlr. Operação */}
              <th style={{ width: 115, textAlign: 'right' }}>Vlr. Operação <span className="sr-only">V. Total</span></th>

              {/* Coluna 5: ICMS / ST / DIFAL */}
              <th style={{ width: 160 }}>ICMS / ST / DIFAL <span className="sr-only">Tributos Destacados</span></th>

              {/* Coluna 6: Crédito Efetivo */}
              <th style={{ width: 130 }}>Crédito Efetivo <span className="sr-only">Sensibilidade</span></th>

              {/* Coluna 7: Ações */}
              <th style={{ width: 100, textAlign: 'center' }}>Ações</th>
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
                const destinacaoItem =
                  destinacaoPorItem?.[item.index] ||
                  destinacaoPorItem?.[item.cProd] ||
                  destinacaoPadrao;

                return (
                  <tr
                    key={item.index}
                    onClick={() => !readOnly && !disabled && onToggleSelect(item.index)}
                    style={{
                      backgroundColor: isSelected ? '#f0f7ff' : undefined,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* 1. Item / Cód. */}
                    <td style={{ verticalAlign: 'middle' }}>
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
                          <div className="mono text-slate-500" style={{ fontSize: 11 }}>
                            {item.cProd || 'S/ CÓD'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Descrição / NCM */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                        {item.xProd || 'Descrição ausente'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        <span className="mono tabular-nums text-slate-700" style={{ fontSize: 11.5, fontWeight: 650 }}>
                          {formatarNcm(item.ncm)}
                        </span>
                        {item.ncmValidoSiscomex ? (
                          <span className="badge alta" style={{ fontSize: 9.5, padding: '1px 5px' }}>
                            ✓ Siscomex
                          </span>
                        ) : (
                          <span className="badge baixa" style={{ fontSize: 9.5, padding: '1px 5px' }} title="NCM não encontrado no catálogo oficial Siscomex">
                            ⚠️ Inválido
                          </span>
                        )}
                        {item.sensivelParaAuditoria && (
                          <span className="badge media" style={{ fontSize: 9.5, padding: '1px 5px' }}>
                            ⚠️ Sensível
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. CFOP / Destinação */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span className="mono font-bold text-slate-800" style={{ fontSize: 11.5 }}>
                          {item.cfop || '----'}
                        </span>
                        {item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
                          <span className="badge media" style={{ fontSize: 9, padding: '1px 4px' }} title="Operação Interestadual">
                            Inter
                          </span>
                        )}
                        {item.tributos?.csosn ? (
                          <span className="badge grey" style={{ fontSize: 9.5, padding: '1px 4px' }}>
                            CSOSN {item.tributos.csosn}
                          </span>
                        ) : item.tributos?.cstIcms ? (
                          <span className="badge blue" style={{ fontSize: 9.5, padding: '1px 4px' }}>
                            CST {item.tributos.cstIcms}
                          </span>
                        ) : null}
                      </div>

                      {/* Seletor Rápido de Destinação */}
                      <select
                        value={destinacaoItem}
                        onChange={(e) =>
                          onAlterarDestinacaoItem &&
                          onAlterarDestinacaoItem(item.index, e.target.value as any)
                        }
                        disabled={readOnly || disabled}
                        style={{
                          fontSize: 10.5,
                          padding: '2px 4px',
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          marginTop: 3,
                          width: '100%',
                          maxWidth: 120,
                        }}
                        title="Destinação para apuração de DIFAL / ST"
                      >
                        <option value="comercializacao">Revenda</option>
                        <option value="industrializacao">Industrialização</option>
                        <option value="uso_consumo">Uso / Consumo</option>
                        <option value="ativo_imobilizado">Ativo Imobilizado</option>
                      </select>
                    </td>

                    {/* 4. Vlr. Operação (tabular-nums alinhado à direita) */}
                    <td className="num tabular-nums" style={{ verticalAlign: 'middle' }}>
                      <strong style={{ fontSize: 13 }}>{formatarBrl(item.vProd)}</strong>
                      <div className="text-slate-500" style={{ fontSize: 10.5 }}>
                        {formatarQtd(item.qCom)} {item.uCom || 'UN'}
                      </div>
                    </td>

                    {/* 5. ICMS / ST / DIFAL */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {item.tributos?.vICMS !== undefined && item.tributos.vICMS > 0 ? (
                          <span className="text-[11px] text-blue-700 font-mono font-semibold">
                            ICMS: {formatarBrl(item.tributos.vICMS)} ({formatarPct(item.tributos.pICMS)})
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">ICMS: R$ 0,00</span>
                        )}

                        {item.tributos?.vICMSST !== undefined && item.tributos.vICMSST > 0 && (
                          <span className="text-[10.5px] text-amber-700 font-mono font-semibold">
                            ST: {formatarBrl(item.tributos.vICMSST)}
                          </span>
                        )}

                        {diag?.exigeRecolhimento && (
                          <span className="text-[10.5px] text-red-700 font-mono font-bold">
                            DIFAL PR: {formatarBrl(diag.valorDebitoDifal)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 6. Crédito Efetivo */}
                    <td>
                      {item.sensivelParaAuditoria ? (
                        <div className="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <span>⚠️</span>
                          <span>Requer Perícia</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <span>✓</span>
                          <span>Crédito Válido</span>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500 mt-1">
                        PIS/COF: {formatarBrl((item.tributos?.vPIS || 0) + (item.tributos?.vCOFINS || 0))}
                      </div>
                    </td>

                    {/* 7. Ações / Inspeção */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleAbrirInspecao(item, e)}
                        aria-expanded={drawerAberto && itemInspecionado?.index === item.index}
                        aria-controls="drawer-item-detalhes"
                        title={`Inspecionar detalhes periciais do item #${item.index}`}
                        className="btn-inspect inline-flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-slate-300 hover:border-blue-600 hover:text-blue-700 bg-white transition-colors"
                        style={{ minHeight: '44px', minWidth: '78px' }}
                      >
                        <span>Inspecionar</span>
                      </button>
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
          { id: 'difal-st', label: 'DIFAL & Base Dupla PR' },
          { id: 'creditos', label: 'Créditos LC 214' },
          { id: 'base-legal', label: 'Fundamentação Legal' },
        ]}
        activeTabId={drawerTab}
        onTabChange={setDrawerTab}
        width="500px"
        footerActions={
          <div className="flex items-center gap-2">
            {onPrecificarItem && itemInspecionado && (
              <button
                type="button"
                onClick={() => {
                  onPrecificarItem(itemInspecionado);
                  handleFecharDrawer();
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"
                style={{ minHeight: '40px' }}
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
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
                style={{ minHeight: '40px' }}
              >
                Parametrizar no ERP
              </button>
            )}
            <button
              type="button"
              onClick={handleFecharDrawer}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800"
              style={{ minHeight: '40px' }}
            >
              Fechar
            </button>
          </div>
        }
      >
        {itemInspecionado && (
          <div className="space-y-4">
            {/* Aba 1: Tributos XML */}
            {drawerTab === 'tributos' && (
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                    Tributos Destacados na NF-e
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">Valor Mercadoria:</span>
                      <strong className="mono tabular-nums">{formatarBrl(itemInspecionado.vProd)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Qtd / UN:</span>
                      <strong className="mono">{formatarQtd(itemInspecionado.qCom)} {itemInspecionado.uCom || 'UN'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Base de Cálculo ICMS:</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vBC)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ICMS Próprio ({formatarPct(itemInspecionado.tributos?.pICMS)}):</span>
                      <span className="mono tabular-nums font-bold text-blue-700">{formatarBrl(itemInspecionado.tributos?.vICMS)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">PIS ({formatarPct(itemInspecionado.tributos?.pPIS)}):</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vPIS)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">COFINS ({formatarPct(itemInspecionado.tributos?.pCOFINS)}):</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vCOFINS)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">IPI ({formatarPct(itemInspecionado.tributos?.pIPI)}):</span>
                      <span className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vIPI)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ICMS ST:</span>
                      <span className="mono tabular-nums text-amber-700 font-bold">{formatarBrl(itemInspecionado.tributos?.vICMSST)}</span>
                    </div>
                  </div>
                </div>

                {/* Motivos de Sensibilidade */}
                {itemInspecionado.motivosSensibilidade && itemInspecionado.motivosSensibilidade.length > 0 && (
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <strong className="text-xs text-amber-900 block mb-1">
                      ⚠️ Alertas e Sensibilidades Identificadas:
                    </strong>
                    <ul className="list-disc pl-4 text-xs text-amber-800 space-y-1">
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

            {/* Aba 2: DIFAL & Base Dupla PR */}
            {drawerTab === 'difal-st' && (
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                    Apuração de DIFAL Paraná (RICMS/PR Dec. 7.871/17)
                  </h4>
                  {diagnosticosDifal?.[itemInspecionado.index] ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">Alíquota de Origem:</span>
                        <strong className="mono">{diagnosticosDifal[itemInspecionado.index].aliquotaOrigem}%</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">Alíquota Interna PR:</span>
                        <strong className="mono">{diagnosticosDifal[itemInspecionado.index].aliquotaDestino}%</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">Base Dupla Calculada:</span>
                        <strong className="mono tabular-nums">
                          {formatarBrl(diagnosticosDifal[itemInspecionado.index].baseCalculoDifal)}
                        </strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">DIFAL a Recolher:</span>
                        <strong className="mono tabular-nums text-red-700">
                          {formatarBrl(diagnosticosDifal[itemInspecionado.index].valorDebitoDifal)}
                        </strong>
                      </div>
                      {diagnosticosDifal[itemInspecionado.index].valorDebitoFecop > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-200">
                          <span className="text-slate-600">FECOP Paraná:</span>
                          <strong className="mono tabular-nums text-red-700">
                            {formatarBrl(diagnosticosDifal[itemInspecionado.index].valorDebitoFecop)}
                          </strong>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Operação interna ou adquirente sem débito de DIFAL apurado para este item.
                    </p>
                  )}
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                  <strong>Trava Decreto 6.048/2024 e 12.828/2026:</strong><br />
                  Vedada a apropriação cumulativa sem retenção de ICMS-ST para mercadorias sujeitas à substituição tributária interna no Paraná.
                </div>
              </div>
            )}

            {/* Aba 3: Créditos LC 214 */}
            {drawerTab === 'creditos' && (
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                    Classificação em 3 Camadas de Crédito
                  </h4>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">1. Destacado no XML:</span>
                    <strong className="mono tabular-nums">{formatarBrl(itemInspecionado.tributos?.vICMS)}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">2. Admitido pela Regra PR:</span>
                    <strong className="mono tabular-nums text-blue-700">
                      {formatarBrl(itemInspecionado.sensivelParaAuditoria ? 0 : itemInspecionado.tributos?.vICMS)}
                    </strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">3. Efetivado no Custo (CPC 16):</span>
                    <strong className="mono tabular-nums text-emerald-700">
                      {formatarBrl(itemInspecionado.sensivelParaAuditoria ? 0 : itemInspecionado.tributos?.vICMS)}
                    </strong>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-2">
                    Regra Art. 47 da LC nº 214/2025: Apropriação financeira de créditos de IBS/CBS condicionada à liquidação do fornecedor.
                  </p>
                </div>
              </div>
            )}

            {/* Aba 4: Fundamentação Legal */}
            {drawerTab === 'base-legal' && (
              <LegalCitationBlock
                citations={citacoesItem}
                currentLevel={nivel}
                title="Fundamentação Legal do Item"
                defaultCollapsed={false}
                calculationMemory={`Base_1 = Valor_Item (${formatarBrl(itemInspecionado.vProd)}) - ICMS_Origem (${formatarBrl(itemInspecionado.tributos?.vICMS)})\nBase_2 = Base_1 / (1 - 0.195)\nDIFAL = (Base_2 * 0.195) - ICMS_Origem`}
              />
            )}
          </div>
        )}
      </ItemDetailDrawer>
    </div>
  );
}
