'use client';

/**
 * TabelaItensExtracao.tsx
 *
 * Componente interativo de visualização e seleção de itens fiscais de NF-e (Stage 1 -> Stage 2).
 * Exibe 100% dos itens extraídos de forma determinística imediata (sem LLM).
 *
 * Recursos:
 * - Checkbox mestre no cabeçalho com tri-state (selecionado / indeterminado / desmarcado).
 * - Ações em lote: "Selecionar Todos", "Desmarcar Todos", "Selecionar Apenas Sensíveis".
 * - Contador dinâmico com valor acumulado e alerta de itens sensíveis.
 * - Badges tributárias completas (ICMS, IPI, PIS, COFINS, RTC IBS/CBS).
 * - Selos de validação de NCM em O(1) contra os 10.515 registros oficiais do Siscomex.
 * - Indicadores visuais de sensibilidade tributária de entrada com explicações periciais.
 * - Filtros rápidos (Todos, Apenas Sensíveis, Apenas Selecionados, Inconsistentes) e busca por texto.
 * - Linhas expansíveis com detalhamento tributário pericial profundo.
 * - Conformidade total com scripts/hookcheck.mjs (todos os hooks no topo, zero quebras).
 * - Estilização pura baseada em app/globals.css, sem dependência de Tailwind ou Lucide.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ExtractedItem } from '@/lib/extrator-nfe';

/* =========================================================================
 * 1. TIPOS E CONTRATOS DO COMPONENTE
 * ========================================================================= */

export type FiltroVisualizacao = 'todos' | 'sensiveis' | 'selecionados' | 'inconsistentes';

export interface TabelaItensExtracaoProps {
  /** Lista completa de itens extraídos deterministicamente pelo extrator */
  itens: ExtractedItem[];
  /** Índices dos itens selecionados (1-indexed baseados em item.index) */
  selectedIndices: number[];
  /** Alterna seleção de um único item */
  onToggleSelect: (index: number) => void;
  /** Seleciona todos os itens da nota */
  onSelectAll: () => void;
  /** Desmarca todos os itens */
  onDeselectAll: () => void;
  /** Seleciona apenas os itens marcados como sensíveis */
  onSelectSensitivesOnly: () => void;
  /** Se a tabela está em modo somente-leitura (ex.: pós-auditoria) */
  readOnly?: boolean;
  /** Se as ações de seleção estão desabilitadas (ex.: durante execução de auditoria) */
  disabled?: boolean;
  /** Callback opcional ao clicar em um item para abrir painel detalhado */
  onItemClick?: (item: ExtractedItem) => void;
  /** Total de itens sensíveis pré-computado (opcional) */
  totalItensSensiveis?: number;
}

/* =========================================================================
 * 2. MAPA DE MOTIVOS DE SENSIBILIDADE FISCAL (Perícia Tributária de Entrada)
 * ========================================================================= */

export interface MotivoSensibilidadeInfo {
  rotulo: string;
  descricao: string;
  severidade: 'critico' | 'atencao' | 'info';
}

export const MOTIVOS_SENSIBILIDADE_MAP: Record<string, MotivoSensibilidadeInfo> = {
  NCM_INVALIDO_SISCOMEX: {
    rotulo: 'NCM Inválido',
    descricao: 'Código NCM não consta nos 10.515 registros oficiais da tabela Siscomex vigente ou formatação inconsistente.',
    severidade: 'critico',
  },
  SUBSTITUICAO_TRIBUTARIA: {
    rotulo: 'Substituição Tributária (ST)',
    descricao: 'CST de ST (10/30/60/70/90), CSOSN (201/202/203/500/900), MVA destacada ou presença de código CEST.',
    severidade: 'atencao',
  },
  CFOP_INTERESTADUAL: {
    rotulo: 'CFOP Interestadual',
    descricao: 'Operação interestadual (iniciada em 6.xxx ou 2.xxx) sujeita a alíquotas interestaduais, cálculo de DIFAL e conversão para entrada.',
    severidade: 'atencao',
  },
  CREDITO_VEDADO_SIMPLES_NACIONAL: {
    rotulo: 'Crédito Vedado (Simples)',
    descricao: 'Fornecedor optante pelo Simples Nacional com CSOSN de vedação de crédito (102, 103, 300, 400, 500).',
    severidade: 'critico',
  },
  INCONSISTENCIA_SIMPLES_COM_CST_NORMAL: {
    rotulo: 'Simples com CST Normal',
    descricao: 'Fornecedor cadastrado no Simples Nacional destacando indevidamente CST de Regime Normal (00, 10, 20...).',
    severidade: 'critico',
  },
  REDUCAO_BASE_CALCULO: {
    rotulo: 'Redução de Base de Cálculo',
    descricao: 'Operação com benefício fiscal de redução de base de cálculo de ICMS (CST 20/70 ou pRedBC > 0).',
    severidade: 'atencao',
  },
  ISENCAO_OU_NAO_TRIBUTADO: {
    rotulo: 'Isenção / Não Tributado',
    descricao: 'Operação isenta ou não tributada (CST 40/41/50) — requer atenção quanto ao estorno de créditos.',
    severidade: 'info',
  },
  IPI_DESTACADO: {
    rotulo: 'IPI Destacado',
    descricao: 'IPI destacado no documento — verificar direito a crédito para revenda/industrialização ou vedação para consumo/Simples.',
    severidade: 'atencao',
  },
  PIS_COFINS_MONOFASICO_OU_ZERO: {
    rotulo: 'PIS/COFINS Monofásico / Alíquota Zero',
    descricao: 'CST de PIS/COFINS 04 a 09 — incidência monofásica, alíquota zero ou não incidência na revenda.',
    severidade: 'info',
  },
  DESCRICAO_INSUFICIENTE: {
    rotulo: 'Descrição Genérica',
    descricao: 'Descrição do produto excessivamente curta ou genérica (< 3 caracteres), impossibilitando correlação pericial com NCM.',
    severidade: 'critico',
  },
  ORIGEM_PDF_DANFE: {
    rotulo: 'Origem PDF DANFE',
    descricao: 'Dados extraídos de camada de texto de PDF DANFE. Recomenda-se conferência pericial contra o XML oficial.',
    severidade: 'info',
  },
  ORIGEM_PDF_DANFE_LAYOUT_REDUZIDO: {
    rotulo: 'PDF Layout Reduzido',
    descricao: 'Linha de item reconstituída a partir de layout reduzido no PDF.',
    severidade: 'atencao',
  },
};

/* =========================================================================
 * 3. FORMATADORES AUXILIARES
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
 * 4. COMPONENTE PRINCIPAL
 * ========================================================================= */

export default function TabelaItensExtracao({
  itens,
  selectedIndices,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onSelectSensitivesOnly,
  readOnly = false,
  disabled = false,
  onItemClick,
  totalItensSensiveis,
}: TabelaItensExtracaoProps) {
  // ---- Hooks chamados estritamente no topo para cumprir scripts/hookcheck.mjs ----
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroVisualizacao>('todos');
  const [itemExpandido, setItemExpandido] = useState<number | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  // Set para lookup O(1) em render de alta performance (100+ itens)
  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);

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

    // Busca textual (cProd, xProd, ncm, cfop)
    if (busca.trim()) {
      const termo = busca.trim().toLowerCase();
      res = res.filter((it) => {
        return (
          it.cProd.toLowerCase().includes(termo) ||
          it.xProd.toLowerCase().includes(termo) ||
          it.ncm.replace(/\D/g, '').includes(termo.replace(/\D/g, '')) ||
          it.cfop.includes(termo) ||
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
    const totalIcms = selItens.reduce((acc, it) => acc + (it.tributos.vICMS || 0), 0);
    const totalIpi = selItens.reduce((acc, it) => acc + (it.tributos.vIPI || 0), 0);
    const totalPis = selItens.reduce((acc, it) => acc + (it.tributos.vPIS || 0), 0);
    const totalCofins = selItens.reduce((acc, it) => acc + (it.tributos.vCOFINS || 0), 0);
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
  const todosSelecionados = itens.length > 0 && selectedIndices.length === itens.length;
  const algumSelecionado = selectedIndices.length > 0 && selectedIndices.length < itens.length;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = algumSelecionado;
    }
  }, [algumSelecionado]);

  const handleMasterCheckboxChange = () => {
    if (readOnly || disabled) return;
    if (todosSelecionados) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  const toggleExpandir = (idx: number) => {
    setItemExpandido((prev) => (prev === idx ? null : idx));
  };

  // Se a lista estiver vazia
  if (!itens || itens.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
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
            Extração determinística completa (zero LLM). Selecione os itens que deseja enviar para a auditoria pericial.
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

      {/* ---------------- BARRA DE CONTROLE: AÇÕES EM LOTE E FILTROS ---------------- */}
      <div
        style={{
          marginTop: 14,
          padding: '12px 14px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Ações em Lote */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="mini"
            onClick={onSelectAll}
            disabled={disabled || readOnly || todosSelecionados}
            style={{ fontWeight: 600 }}
          >
            ✓ Selecionar Todos ({itens.length})
          </button>
          <button
            type="button"
            className="mini"
            onClick={onDeselectAll}
            disabled={disabled || readOnly || selectedIndices.length === 0}
            style={{ color: 'var(--bad)', fontWeight: 600 }}
          >
            ✗ Desmarcar Todos
          </button>
          <button
            type="button"
            className="mini"
            onClick={onSelectSensitivesOnly}
            disabled={disabled || readOnly || contagemSensiveis === 0}
            style={{
              background: '#fffbeb',
              borderColor: '#f59e0b',
              color: '#b45309',
              fontWeight: 700,
            }}
            title="Seleciona automaticamente apenas os itens com Substituição Tributária, CFOP interestadual, NCMs divergentes ou vedações"
          >
            ⚡ Selecionar Apenas Sensíveis ({contagemSensiveis})
          </button>
        </div>

        {/* Campo de Busca Rápida */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 260 }}>
          <input
            type="text"
            placeholder="Buscar por código, descrição ou NCM..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12.5 }}
          />
          {busca && (
            <button
              type="button"
              className="mini"
              onClick={() => setBusca('')}
              style={{ padding: '4px 8px' }}
              title="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ---------------- FILTROS DE CATEGORIA (CHIPS) ---------------- */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>Filtrar exibição:</span>
        <button
          type="button"
          className={`chip ${filtro === 'todos' ? 'selo-oficial' : ''}`}
          onClick={() => setFiltro('todos')}
          style={{ fontWeight: filtro === 'todos' ? 700 : 400 }}
        >
          Todos ({itens.length})
        </button>
        <button
          type="button"
          className={`chip ${filtro === 'sensiveis' ? 'selo-inferido' : ''}`}
          onClick={() => setFiltro('sensiveis')}
          style={{ fontWeight: filtro === 'sensiveis' ? 700 : 400 }}
        >
          ⚠️ Apenas Sensíveis ({contagemSensiveis})
        </button>
        <button
          type="button"
          className={`chip ${filtro === 'selecionados' ? 'selo-oficial' : ''}`}
          onClick={() => setFiltro('selecionados')}
          style={{ fontWeight: filtro === 'selecionados' ? 700 : 400 }}
        >
          ✓ Apenas Selecionados ({selectedIndices.length})
        </button>
        {contagemInconsistentes > 0 && (
          <button
            type="button"
            className={`chip ${filtro === 'inconsistentes' ? 'selo-duvidoso' : ''}`}
            onClick={() => setFiltro('inconsistentes')}
            style={{ fontWeight: filtro === 'inconsistentes' ? 700 : 400 }}
          >
            ⛔ NCMs Inexistentes ({contagemInconsistentes})
          </button>
        )}
      </div>

      {/* ---------------- ALERTA / MENSAGEM DINÂMICA ---------------- */}
      {selectedIndices.length === 0 ? (
        <div className="note atencao" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="t">Nenhum item selecionado para auditoria</div>
          <div className="x">
            Selecione manualmente os itens na tabela abaixo ou clique em{' '}
            <strong>&quot;Selecionar Apenas Sensíveis&quot;</strong> para auditar automaticamente os itens com impacto fiscal.
          </div>
        </div>
      ) : (
        <div className="note info" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="t">
            {resumoSelecionados.quantidade} de {itens.length} {itens.length === 1 ? 'item selecionado' : 'itens selecionados'} ({resumoSelecionados.totalSensiveisSel} sensíveis)
          </div>
          <div className="x">
            Valor acumulado dos produtos selecionados:{' '}
            <strong>{formatarBrl(resumoSelecionados.totalValorProd)}</strong>. Apenas estes itens serão processados pelo motor de IA.
          </div>
        </div>
      )}

      {/* ---------------- TABELA DE ITENS COM ROLAGEM HORIZONTAL E CABEÇALHO FIXO ---------------- */}
      <div className="scroll" style={{ marginTop: 12, maxHeight: '62vh' }}>
        <table className="tb" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              {/* Checkbox Mestre */}
              <th style={{ width: 44, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  ref={masterCheckboxRef}
                  checked={todosSelecionados}
                  onChange={handleMasterCheckboxChange}
                  disabled={readOnly || disabled}
                  title="Selecionar / Desmarcar todos os itens da nota"
                  style={{ cursor: readOnly || disabled ? 'not-allowed' : 'pointer' }}
                />
              </th>
              <th style={{ width: 40, textAlign: 'center' }}>#</th>
              <th style={{ width: 110 }}>Cód. / EAN</th>
              <th style={{ minWidth: 220 }}>Descrição do Produto</th>
              <th style={{ width: 140 }}>NCM (Siscomex)</th>
              <th style={{ width: 70 }}>CFOP</th>
              <th style={{ width: 85 }}>CST / CSOSN</th>
              <th style={{ width: 80, textAlign: 'right' }}>Qtd / UN</th>
              <th style={{ width: 95, textAlign: 'right' }}>V. Unit</th>
              <th style={{ width: 105, textAlign: 'right' }}>V. Total</th>
              <th style={{ minWidth: 230 }}>Tributos Destacados</th>
              <th style={{ width: 130, textAlign: 'center' }}>Sensibilidade</th>
              <th style={{ width: 50, textAlign: 'center' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {itensExibidos.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--ink-2)' }}>
                  Nenhum item corresponde ao filtro ou busca aplicada.
                </td>
              </tr>
            ) : (
              itensExibidos.map((item) => {
                const isSelected = selectedSet.has(item.index);
                const isExpanded = itemExpandido === item.index;

                // Destaca linha selecionada
                const rowStyle: React.CSSProperties = {
                  background: isSelected ? '#f0f7ff' : isExpanded ? '#fbfcfe' : undefined,
                  transition: 'background 0.15s ease',
                };

                return (
                  <React.Fragment key={item.index}>
                    <tr style={rowStyle}>
                      {/* Checkbox da Linha */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => !readOnly && !disabled && onToggleSelect(item.index)}
                          disabled={readOnly || disabled}
                          style={{ cursor: readOnly || disabled ? 'not-allowed' : 'pointer' }}
                          title={`Selecionar item #${item.index}`}
                        />
                      </td>

                      {/* Índice do Item */}
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--ink-2)' }}>
                        #{item.index}
                      </td>

                      {/* Código do Fornecedor e EAN */}
                      <td>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 12 }}>
                          {item.cProd || 'S/ CÓD'}
                        </div>
                        {item.cEAN && item.cEAN !== 'SEM GTIN' && (
                          <div style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>
                            EAN: {item.cEAN}
                          </div>
                        )}
                      </td>

                      {/* Descrição do Produto & Siscomex */}
                      <td>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--ink)',
                            lineHeight: 1.35,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.xProd || 'Descrição ausente'}
                        </div>
                        {item.descricaoSiscomex && (
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--ink-2)',
                              marginTop: 2,
                              fontStyle: 'italic',
                              display: '-webkit-box',
                              WebkitLineClamp: isExpanded ? 'unset' : 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                            title={`Descrição Siscomex: ${item.descricaoSiscomex}`}
                          >
                            Catálogo: {item.descricaoSiscomex}
                          </div>
                        )}
                      </td>

                      {/* NCM e Validação Siscomex O(1) */}
                      <td>
                        <div className="mono" style={{ fontWeight: 650, fontSize: 12.5 }}>
                          {formatarNcm(item.ncm)}
                        </div>
                        <div style={{ marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {item.ncmValidoSiscomex ? (
                            <span className="badge alta" style={{ fontSize: 10, padding: '1px 6px' }}>
                              ✓ Siscomex
                            </span>
                          ) : (
                            <span
                              className="badge baixa"
                              style={{ fontSize: 10, padding: '1px 6px' }}
                              title="NCM não encontrado no catálogo oficial de 10.515 registros Siscomex"
                            >
                              ⚠️ Inválido
                            </span>
                          )}
                          {item.cest && (
                            <span
                              className="selo"
                              style={{ background: '#eef2ff', color: '#3730a3', fontSize: 10 }}
                              title={`CEST: ${item.cest}`}
                            >
                              CEST {item.cest}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CFOP com indicador de Interestadual */}
                      <td>
                        <span className="mono" style={{ fontWeight: 600 }}>
                          {item.cfop || '----'}
                        </span>
                        {(item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
                          <div style={{ marginTop: 2 }}>
                            <span
                              className="badge media"
                              style={{ fontSize: 9.5, padding: '1px 4px' }}
                              title="CFOP Interestadual (sujeito a DIFAL)"
                            >
                              Inter
                            </span>
                          </div>
                        )}
                      </td>

                      {/* CST ou CSOSN */}
                      <td>
                        {item.tributos.csosn ? (
                          <span
                            className="badge grey"
                            style={{ fontSize: 11, padding: '2px 6px' }}
                            title="Código de Situação da Operação no Simples Nacional"
                          >
                            CSOSN {item.tributos.csosn}
                          </span>
                        ) : item.tributos.cstIcms ? (
                          <span
                            className="badge blue"
                            style={{ fontSize: 11, padding: '2px 6px' }}
                            title="Código de Situação Tributária (ICMS Regime Normal)"
                          >
                            CST {item.tributos.cstIcms}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>----</span>
                        )}
                      </td>

                      {/* Quantidade e Unidade Comercial */}
                      <td className="num">
                        <span style={{ fontWeight: 600 }}>{formatarQtd(item.qCom)}</span>{' '}
                        <span style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{item.uCom || 'UN'}</span>
                      </td>

                      {/* Valor Unitário */}
                      <td className="num" style={{ fontSize: 12 }}>
                        {formatarBrl(item.vUnCom)}
                      </td>

                      {/* Valor Total do Produto */}
                      <td className="num" style={{ fontWeight: 650, fontSize: 12.5 }}>
                        {formatarBrl(item.vProd)}
                      </td>

                      {/* Tributos Destacados (ICMS, IPI, PIS, COFINS, RTC) */}
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {/* ICMS */}
                          {item.tributos.vICMS !== undefined && item.tributos.vICMS > 0 && (
                            <span
                              className="badge"
                              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: 10.5 }}
                              title={`ICMS: Base ${formatarBrl(item.tributos.vBC)} | Alíq ${formatarPct(item.tributos.pICMS)}`}
                            >
                              ICMS {formatarPct(item.tributos.pICMS)}: {formatarBrl(item.tributos.vICMS)}
                            </span>
                          )}

                          {/* ICMS ST */}
                          {item.tributos.vICMSST !== undefined && item.tributos.vICMSST > 0 && (
                            <span
                              className="badge"
                              style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: 10.5 }}
                              title={`ICMS ST: Base ${formatarBrl(item.tributos.vBCST)} | MVA ${formatarPct(item.tributos.pMVAST)}`}
                            >
                              ST: {formatarBrl(item.tributos.vICMSST)}
                            </span>
                          )}

                          {/* IPI */}
                          {item.tributos.vIPI !== undefined && item.tributos.vIPI > 0 && (
                            <span
                              className="badge"
                              style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: 10.5 }}
                              title={`IPI: CST ${item.tributos.cstIpi || '--'} | Alíq ${formatarPct(item.tributos.pIPI)}`}
                            >
                              IPI {formatarPct(item.tributos.pIPI)}: {formatarBrl(item.tributos.vIPI)}
                            </span>
                          )}

                          {/* PIS */}
                          {item.tributos.vPIS !== undefined && item.tributos.vPIS > 0 && (
                            <span
                              className="badge grey"
                              style={{ fontSize: 10 }}
                              title={`PIS: CST ${item.tributos.cstPis || '--'} | Alíq ${formatarPct(item.tributos.pPIS)}`}
                            >
                              PIS: {formatarBrl(item.tributos.vPIS)}
                            </span>
                          )}

                          {/* COFINS */}
                          {item.tributos.vCOFINS !== undefined && item.tributos.vCOFINS > 0 && (
                            <span
                              className="badge grey"
                              style={{ fontSize: 10 }}
                              title={`COFINS: CST ${item.tributos.cstCofins || '--'} | Alíq ${formatarPct(item.tributos.pCOFINS)}`}
                            >
                              COF: {formatarBrl(item.tributos.vCOFINS)}
                            </span>
                          )}

                          {/* RTC (Reforma Tributária IBS/CBS) */}
                          {(item.tributos.cClassTrib || item.tributos.vIBS || item.tributos.vCBS) && (
                            <span
                              className="badge"
                              style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 10 }}
                              title={`Reforma Tributária: cClassTrib ${item.tributos.cClassTrib || '--'} | IBS ${formatarBrl(item.tributos.vIBS)} | CBS ${formatarBrl(item.tributos.vCBS)}`}
                            >
                              RTC IBS/CBS
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Selo de Sensibilidade Fiscal */}
                      <td style={{ textAlign: 'center' }}>
                        {item.sensivelParaAuditoria ? (
                          <div>
                            <span
                              className="badge media"
                              style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fcd34d',
                                padding: '3px 8px',
                                fontSize: 11,
                                cursor: 'help',
                              }}
                              title={
                                item.motivosSensibilidade
                                  ?.map((m) => MOTIVOS_SENSIBILIDADE_MAP[m]?.rotulo || m)
                                  .join(' | ') || 'Item com particularidade tributária'
                              }
                            >
                              ⚠️ Sensível
                            </span>
                            {/* Badges secundárias dos principais gatilhos */}
                            {item.motivosSensibilidade && item.motivosSensibilidade.length > 0 && (
                              <div style={{ marginTop: 2, display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                                {item.motivosSensibilidade.slice(0, 2).map((m, mIdx) => (
                                  <span
                                    key={mIdx}
                                    style={{
                                      fontSize: 9.5,
                                      background: '#fffbeb',
                                      color: '#b45309',
                                      padding: '1px 4px',
                                      borderRadius: 4,
                                      border: '1px solid #fde68a',
                                    }}
                                  >
                                    {MOTIVOS_SENSIBILIDADE_MAP[m]?.rotulo || m}
                                  </span>
                                ))}
                                {item.motivosSensibilidade.length > 2 && (
                                  <span style={{ fontSize: 9, color: 'var(--ink-2)' }}>
                                    +{item.motivosSensibilidade.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span
                            className="badge alta"
                            style={{
                              background: '#ecfdf5',
                              color: '#065f46',
                              border: '1px solid #a7f3d0',
                              padding: '3px 8px',
                              fontSize: 11,
                            }}
                          >
                            ✓ Regular
                          </span>
                        )}
                      </td>

                      {/* Botão de Expansão / Detalhes */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="mini"
                          onClick={() => {
                            toggleExpandir(item.index);
                            if (onItemClick) onItemClick(item);
                          }}
                          style={{
                            padding: '3px 6px',
                            fontSize: 11,
                            background: isExpanded ? '#0b3d91' : '#fff',
                            color: isExpanded ? '#fff' : 'var(--brand)',
                            borderColor: 'var(--brand)',
                          }}
                          title={isExpanded ? 'Recolher detalhes' : 'Ver detalhamento fiscal do item'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>

                    {/* Linha Expansível com Detalhes Periciais Profundos */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={13} style={{ padding: '12px 16px', borderBottom: '2px solid var(--line)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                            {/* Bloco 1: Cadastro & Classificação */}
                            <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                              <strong style={{ fontSize: 12, color: 'var(--brand)' }}>Identificação Cadastral</strong>
                              <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div><strong>Código Fornecedor:</strong> {item.cProd || 'N/A'}</div>
                                <div><strong>GTIN / EAN:</strong> {item.cEAN || 'Sem GTIN'}</div>
                                <div><strong>Descrição Comercial:</strong> {item.xProd}</div>
                                <div><strong>NCM Declarado:</strong> {item.ncmOriginal || item.ncm}</div>
                                <div><strong>NCM Normalizado:</strong> {formatarNcm(item.ncm)}</div>
                                <div><strong>Status Siscomex:</strong> {item.ncmValidoSiscomex ? 'Localizado no catálogo oficial' : 'Não encontrado no Siscomex'}</div>
                                {item.descricaoSiscomex && (
                                  <div><strong>Descrição Oficial Siscomex:</strong> {item.descricaoSiscomex}</div>
                                )}
                                {item.cest && <div><strong>CEST:</strong> {item.cest}</div>}
                              </div>
                            </div>

                            {/* Bloco 2: Detalhamento de ICMS / ST */}
                            <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                              <strong style={{ fontSize: 12, color: '#1d4ed8' }}>ICMS e Substituição Tributária</strong>
                              <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div><strong>CFOP de Saída:</strong> {item.cfop}</div>
                                <div><strong>CST ICMS:</strong> {item.tributos.cstIcms || 'N/A'}</div>
                                <div><strong>CSOSN:</strong> {item.tributos.csosn || 'N/A'}</div>
                                <div><strong>Base de Cálculo ICMS:</strong> {formatarBrl(item.tributos.vBC)}</div>
                                <div><strong>Alíquota ICMS:</strong> {formatarPct(item.tributos.pICMS)}</div>
                                <div><strong>Valor do ICMS:</strong> {formatarBrl(item.tributos.vICMS)}</div>
                                {item.tributos.vBCST !== undefined && (
                                  <div><strong>Base de Cálculo ST:</strong> {formatarBrl(item.tributos.vBCST)}</div>
                                )}
                                {item.tributos.pMVAST !== undefined && (
                                  <div><strong>MVA ST:</strong> {formatarPct(item.tributos.pMVAST)}</div>
                                )}
                                {item.tributos.vICMSST !== undefined && (
                                  <div><strong>Valor do ICMS ST:</strong> {formatarBrl(item.tributos.vICMSST)}</div>
                                )}
                                {item.tributos.pRedBC !== undefined && (
                                  <div><strong>Redução de Base:</strong> {formatarPct(item.tributos.pRedBC)}</div>
                                )}
                                {item.tributos.vCredICMSSN !== undefined && (
                                  <div><strong>Crédito Simples Nacional:</strong> {formatarBrl(item.tributos.vCredICMSSN)} ({formatarPct(item.tributos.pCredSN)})</div>
                                )}
                              </div>
                            </div>

                            {/* Bloco 3: IPI, PIS, COFINS & RTC */}
                            <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                              <strong style={{ fontSize: 12, color: '#6d28d9' }}>Federais & Reforma Tributária</strong>
                              <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div><strong>CST IPI:</strong> {item.tributos.cstIpi || 'N/A'} (Enq: {item.tributos.cEnq || 'N/A'})</div>
                                <div><strong>IPI Alíquota / Valor:</strong> {formatarPct(item.tributos.pIPI)} / {formatarBrl(item.tributos.vIPI)}</div>
                                <div><strong>CST PIS:</strong> {item.tributos.cstPis || 'N/A'} | Alíq: {formatarPct(item.tributos.pPIS)} | {formatarBrl(item.tributos.vPIS)}</div>
                                <div><strong>CST COFINS:</strong> {item.tributos.cstCofins || 'N/A'} | Alíq: {formatarPct(item.tributos.pCOFINS)} | {formatarBrl(item.tributos.vCOFINS)}</div>
                                {item.tributos.cClassTrib && (
                                  <div><strong>cClassTrib (Reforma):</strong> {item.tributos.cClassTrib}</div>
                                )}
                                {item.tributos.vIBS !== undefined && (
                                  <div><strong>IBS Transição:</strong> {formatarBrl(item.tributos.vIBS)} ({formatarPct(item.tributos.pIBS)})</div>
                                )}
                                {item.tributos.vCBS !== undefined && (
                                  <div><strong>CBS Transição:</strong> {formatarBrl(item.tributos.vCBS)} ({formatarPct(item.tributos.pCBS)})</div>
                                )}
                              </div>
                            </div>

                            {/* Bloco 4: Parecer Pericial de Sensibilidade */}
                            <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, border: '1px solid #fde68a' }}>
                              <strong style={{ fontSize: 12, color: '#92400e' }}>Motivos de Sensibilidade Fiscal</strong>
                              <div style={{ fontSize: 11.5, marginTop: 4 }}>
                                {item.motivosSensibilidade && item.motivosSensibilidade.length > 0 ? (
                                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                                    {item.motivosSensibilidade.map((motivo, mIdx) => {
                                      const info = MOTIVOS_SENSIBILIDADE_MAP[motivo];
                                      return (
                                        <li key={mIdx} style={{ marginBottom: 4 }}>
                                          <strong>{info?.rotulo || motivo}:</strong>{' '}
                                          <span style={{ color: '#78350f' }}>{info?.descricao || 'Verificação pericial recomendada.'}</span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <div style={{ color: '#065f46' }}>
                                    Nenhum gatilho de risco crítico ou particularidade fiscal detectado para este item.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- RODAPÉ DE RESUMO FINANCEIRO DOS ITENS SELECIONADOS ---------------- */}
      <div
        style={{
          marginTop: 14,
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          Total selecionado:{' '}
          <strong style={{ color: 'var(--ink)', fontSize: 13.5 }}>
            {resumoSelecionados.quantidade} de {itens.length} itens
          </strong>{' '}
          ({resumoSelecionados.totalSensiveisSel} sensíveis)
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
          <div>
            <span style={{ color: 'var(--ink-2)' }}>Total Produtos:</span>{' '}
            <strong style={{ color: 'var(--brand)', fontSize: 13.5 }}>
              {formatarBrl(resumoSelecionados.totalValorProd)}
            </strong>
          </div>
          {resumoSelecionados.totalIcms > 0 && (
            <div>
              <span style={{ color: 'var(--ink-2)' }}>ICMS:</span>{' '}
              <strong style={{ color: '#1d4ed8' }}>{formatarBrl(resumoSelecionados.totalIcms)}</strong>
            </div>
          )}
          {resumoSelecionados.totalIpi > 0 && (
            <div>
              <span style={{ color: 'var(--ink-2)' }}>IPI:</span>{' '}
              <strong style={{ color: '#6d28d9' }}>{formatarBrl(resumoSelecionados.totalIpi)}</strong>
            </div>
          )}
          {(resumoSelecionados.totalPis > 0 || resumoSelecionados.totalCofins > 0) && (
            <div>
              <span style={{ color: 'var(--ink-2)' }}>PIS/COFINS:</span>{' '}
              <strong>{formatarBrl(resumoSelecionados.totalPis + resumoSelecionados.totalCofins)}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
