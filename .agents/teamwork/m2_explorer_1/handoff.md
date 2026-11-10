# Relatório de Handoff — Milestone 2: Arquitetura de Estado e Fluxo de Upload em AuditoriaEntrada.tsx

**Agente**: `m2_explorer_1` (`teamwork_explorer`)  
**Data**: 2026-11-09T16:52:00Z  
**Status**: Concluído (Hard Handoff)  
**Diretório de Trabalho**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1`  
**Destinatário**: Agente Pai (`5db90b78-2923-4eca-9d94-d6c126a7f3be`) / Agente Implementador (`m2_worker_1`)

---

## 1. Observation

### 1.1 Estado Atual de `components/AuditoriaEntrada.tsx`
O arquivo `components/AuditoriaEntrada.tsx` (201 linhas) opera atualmente como um fluxo monolítico de etapa única:
- **Hooks de Estado Atuais (linhas 7 a 15)**:
  ```typescript
  const [file, setFile] = useState<File | null>(null);
  const [regime, setRegime] = useState('Simples Nacional');
  const [finalidade, setFinalidade] = useState('Revenda/Comercialização');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  ```
- **Disparo de Requisição (linhas 52 a 87)**:
  O formulário faz o upload e aciona diretamente `POST /api/auditoria-entrada` enviando `file`, `regime` e `finalidade`. Esse endpoint legado submete todos os itens da nota fiscal diretamente ao Ollama em um único prompt de contexto gigante (`num_ctx: 16384`), provocando estouros do timeout de 180s na GPU AMD RX 580 quando o documento possui múltiplos itens.
- **Ausência de Componentes e Estados Intermediários**:
  - Não há separação entre a etapa determinística de extração imediata e a etapa de auditoria com IA.
  - Não há armazenamento de dados estruturados da nota (`ExtractedInvoiceData`).
  - Não há tabela de itens extraídos nem seleção por checkboxes (R1, R2).
  - Não há seletor de motor de auditoria (`'ollama'` vs `'gemini'`) (R3).
  - O componente `components/TabelaItensExtracao.tsx` ainda não existe no projeto.
- **Aderência ao Test Harness Existente**:
  - Em `scripts/ui-entry.tsx` (linhas 190 a 194), o teste de fumaça verifica `[AuditoriaEntrada, 'Auditoria de Entrada', /Auditar Documento/i]`. A interface deve manter o texto correspondente a `/Auditar Documento/i` em sua renderização inicial.
  - `scripts/hookcheck.mjs` exige que todos os hooks do React sejam chamados no topo do corpo da função, sem early returns que os antecedam e sem hooks encravados dentro de condicionais ou laços.

### 1.2 Módulos da Etapa 1 Já Prontos e Testados
- **`lib/extrator-nfe.ts` (861 linhas)**:
  - Totalmente determinístico, sem chamadas a LLM (< 50ms para XML, < 150ms para PDF).
  - Exporta os tipos contratuais `ExtractedInvoiceData`, `ExtractedItem` e `ExtractedTributosResumo`.
  - Avalia deterministicamente a sensibilidade tributária de cada item via `avaliarSensibilidadeFiscal`, preenchendo `sensivelParaAuditoria: boolean` e `motivosSensibilidade: string[]` (`NCM_INVALIDO_SISCOMEX`, `SUBSTITUICAO_TRIBUTARIA`, `CFOP_INTERESTADUAL`, `CREDITO_VEDADO_SIMPLES_NACIONAL`, `REDUCAO_BASE_CALCULO`, `IPI_DESTACADO`, `PIS_COFINS_MONOFASICO_OU_ZERO`, `DESCRICAO_INSUFICIENTE`).
  - Valida NCMs em $O(1)$ contra os 10.515 registros da base oficial Siscomex em memória.
- **`app/api/auditoria-entrada/extrair/route.ts` (103 linhas)**:
  - Endpoint dedicado `POST /api/auditoria-entrada/extrair` recebendo `multipart/form-data` (`file`, `regime`, `finalidade`) e retornando `ExtractedInvoiceData` com HTTP 200 e header `X-Extraction-Time-Ms`.
  - Também suportado como alias em `app/api/auditoria-entrada?action=extrair`.

### 1.3 Contratos e Integração Downstream
- **Contrato M2 ↔ M3 (`PROJECT.md` e `tests/e2e-auditoria-entrada.test.mjs`)**:
  - `AuditRequestPayload`:
    ```typescript
    interface AuditRequestPayload {
      motor: 'ollama' | 'gemini';
      modelo?: string;
      contextoAdquirente: { regime: string; finalidade: string; ufDestino: string };
      documentoContexto: { emitenteCnpj?: string; emitenteNome?: string; emitenteUf?: string; emitenteCrt?: string; chaveAcesso?: string };
      itensSelecionados: ExtractedItem[];
    }
    ```
  - `AuditedInvoiceResponse`:
    ```typescript
    interface AuditedInvoiceResponse {
      motorUtilizado: string;
      tempoExecucaoMs: number;
      statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente';
      parecerTecnicoGeral: string;
      parecerConformidadeCreditos: string;
      totalItensAuditados: number;
      itens: AuditedItemFinding[];
    }
    ```
- **`components/ParametrizacaoERP.tsx` e `app/api/auditoria-relatorio/route.ts`**:
  - `ParametrizacaoERP` consome `data.itens` com propriedades achatadas (`cProd`, `xProd`, `ncm`, `cest`, `cfopEntrada`, `cstIcmsEntrada`, `aliqIcms`, `permiteCredito`, `cstPisCofinsEntrada`, `aliqPis`, `aliqCofins`, `cClassTrib`, `aliqIbsTransitorio`, `aliqCbsTransitorio`, `regimeEspecial`, `instrucaoCadastro`).
  - Um adaptador puro em `AuditoriaEntrada.tsx` (`adaptAuditResultForERP`) é necessário para garantir retrocompatibilidade total e evitar quebras de renderização ou nos downloads de relatórios HTML/TXT.

---

## 2. Logic Chain

1. **Premissa de Desempenho e Timeout (R1 e R3)**: O timeout de 180s na GPU RX 580 decorre do processamento conjunto de dezenas de itens em contexto expandido. A solução determinística imediata (Etapa 1) precisa rodar em menos de 200ms no upload, desonerando completamente a GPU.
2. **Separação de Estados do Fluxo (Máquina de Estados em 2 Etapas)**:
   Para atender aos requisitos R1, R2, R3 e R4, o componente `AuditoriaEntrada` deve transitar claramente entre 4 estados principais:
   - `EMPTY` (Inicial): Entrada do documento (XML/PDF), seleção de regime e finalidade da empresa adquirente.
   - `EXTRACTING`: Subestado temporário exibindo indicador visual ágil durante a chamada a `POST /api/auditoria-entrada/extrair`.
   - `EXTRACTED` (Etapa 1 Concluída): Exibição dos metadados da nota, tabela interativa `<TabelaItensExtracao />`, controles de seleção em lote, contador dinâmico e alternador de motor (`motor: 'ollama' | 'gemini'`).
   - `AUDITING`: Subestado temporário durante a auditoria seletiva dos itens marcados via `AuditRequestPayload`.
   - `AUDITED` (Etapa 2 Concluída): Exibição dos pareceres fiscais consolidados, laudo por item, botões de download e `<ParametrizacaoERP />`.
3. **Gerenciamento Imutável de Seleção (R2)**:
   - A seleção dos itens deve ser mantida como um `Set<number>` (`selectedIndices`), indexado pelo campo `item.index` (1..N).
   - Ao concluir a Etapa 1, todos os itens (ou prioritariamente todos os itens sensíveis) devem vir pré-selecionados, permitindo tanto a auditoria completa imediata com 1 clique quanto o refino granular pelo usuário.
   - Três botões de seleção rápida no topo da tabela: "Selecionar Todos", "Desmarcar Todos" e "Selecionar Apenas Sensíveis" (filtrando por `item.sensivelParaAuditoria === true`).
   - Se `selectedIndices.size === 0`, o botão de disparo da auditoria é desabilitado com aviso explicativo ("Selecione ao menos 1 item para auditar").
4. **Prevenção de Falhas de Hooks e Quebras de Testes**:
   - Conforme `scripts/hookcheck.mjs`, nenhum hook (`useState`, `useCallback`, `useMemo`) pode ficar após um `return` condicional ou dentro de blocos `if/else`.
   - Em `scripts/ui-entry.tsx`, a montagem inicial do componente busca a expressão `/Auditar Documento/i`. Manter o texto no cabeçalho ou no botão de submissão da Etapa 1 garante 100% de conformidade com os testes de fumaça de UI.
5. **Adaptação para ERP e Relatórios Downstream**:
   - Para que a resposta de `AuditedInvoiceResponse` (com objetos aninhados `ncm`, `cfop`, `icms`, `pisCofins`, `reforma`) alimente sem atrito o `ParametrizacaoERP` e a rota `api/auditoria-relatorio`, a função `adaptAuditResultForERP` achata os campos preservando ambas as estruturas.

---

## 3. Proposed Changes (Especificação Detalhada e Código Proposto)

Como o perfil é `teamwork_explorer` (read-only), as especificações e o código completo dos componentes propostos para o Milestone 2 são descritos a seguir para implementação pelo `m2_worker_1`.

### 3.1 Novo Componente: `components/TabelaItensExtracao.tsx`
Criação do componente de apresentação tabular interativa:

```tsx
'use client';

import React from 'react';
import type { ExtractedItem } from '@/lib/extrator-nfe';

export interface TabelaItensExtracaoProps {
  itens: ExtractedItem[];
  selectedIndices: Set<number>;
  onToggleSelect: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectOnlySensitive: () => void;
}

export default function TabelaItensExtracao({
  itens,
  selectedIndices,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onSelectOnlySensitive,
}: TabelaItensExtracaoProps) {
  const totalItens = itens.length;
  const selecionadosCount = selectedIndices.size;
  const sensiveisCount = itens.filter((it) => it.sensivelParaAuditoria).length;
  const todosSelecionados = totalItens > 0 && selecionadosCount === totalItens;

  const formatarMoeda = (val?: number) => {
    if (val === undefined || val === null) return '-';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="card" style={{ marginTop: 16, padding: 16 }}>
      {/* Barra de Ações em Lote e Contadores */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '13.5px' }}>Seleção de Itens para Auditoria:</span>
          <button type="button" onClick={onSelectAll} className="mini" style={{ fontWeight: 600 }}>
            Selecionar Todos ({totalItens})
          </button>
          <button type="button" onClick={onDeselectAll} className="mini">
            Desmarcar Todos
          </button>
          <button
            type="button"
            onClick={onSelectOnlySensitive}
            className="mini"
            style={{ background: '#fff8e8', borderColor: '#e0a32b', color: '#8a5b06', fontWeight: 600 }}
            title="Selecionar apenas itens com NCM inválido, ST, Simples Nacional ou divergências"
          >
            ⚡ Selecionar Apenas Sensíveis ({sensiveisCount})
          </button>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
          <strong style={{ color: selecionadosCount > 0 ? 'var(--brand)' : 'var(--bad)' }}>
            {selecionadosCount}
          </strong> de {totalItens} selecionado(s)
          {sensiveisCount > 0 && ` (${sensiveisCount} com particularidade fiscal)`}
        </div>
      </div>

      {/* Tabela de Produtos e Tributos com Rolagem Suave */}
      <div className="scroll" style={{ maxHeight: '52vh' }}>
        <table className="tb">
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={todosSelecionados}
                  aria-label="Selecionar todos os itens da tabela"
                  onChange={() => (todosSelecionados ? onDeselectAll() : onSelectAll())}
                />
              </th>
              <th style={{ width: 44 }}>#</th>
              <th>Código / Descrição</th>
              <th>NCM / Siscomex</th>
              <th>CFOP</th>
              <th>CST/CSOSN</th>
              <th style={{ textAlign: 'right' }}>Qtd / Un</th>
              <th style={{ textAlign: 'right' }}>V. Unit</th>
              <th style={{ textAlign: 'right' }}>V. Total</th>
              <th>Tributos Destacados</th>
              <th>Sensibilidade Fiscal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const isSelected = selectedIndices.has(item.index);
              const { tributos } = item;

              return (
                <tr
                  key={item.index}
                  style={{
                    backgroundColor: isSelected ? 'rgba(52, 152, 219, 0.07)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => onToggleSelect(item.index)}
                >
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={`Selecionar item ${item.index}: ${item.cProd}`}
                      onChange={() => onToggleSelect(item.index)}
                    />
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>{item.index}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.cProd}</div>
                    <div className="small" style={{ color: 'var(--ink-2)' }}>{item.xProd}</div>
                    {item.cEAN && <div className="mono small muted">EAN: {item.cEAN}</div>}
                  </td>
                  <td>
                    <div className="mono" style={{ fontWeight: 600 }}>{item.ncm}</div>
                    {item.ncmValidoSiscomex ? (
                      <span className="badge alta" title={item.descricaoSiscomex || 'NCM verificado no Siscomex'}>
                        ✓ Siscomex O(1)
                      </span>
                    ) : (
                      <span className="badge baixa" title="NCM inexistente ou irregular na tabela oficial Siscomex">
                        ✗ Inexistente
                      </span>
                    )}
                  </td>
                  <td className="mono">{item.cfop}</td>
                  <td className="mono">{tributos.csosn ? `CSOSN ${tributos.csosn}` : `CST ${tributos.cstIcms || '-'}`}</td>
                  <td className="num">{item.qCom.toLocaleString('pt-BR')} {item.uCom}</td>
                  <td className="num">{formatarMoeda(item.vUnCom)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatarMoeda(item.vProd)}</td>
                  <td className="small">
                    <div>ICMS: {tributos.pICMS ? `${tributos.pICMS}% (${formatarMoeda(tributos.vICMS)})` : 'Isento/Zero'}</div>
                    {(tributos.vICMSST ?? 0) > 0 && <div style={{ color: '#8a5b06' }}>ST: {formatarMoeda(tributos.vICMSST)} (MVA: {tributos.pMVAST || 0}%)</div>}
                    {(tributos.vIPI ?? 0) > 0 && <div>IPI: {formatarMoeda(tributos.vIPI)}</div>}
                    {(tributos.vPIS ?? 0) > 0 && <div>PIS/COF: {formatarMoeda((tributos.vPIS || 0) + (tributos.vCOFINS || 0))}</div>}
                  </td>
                  <td>
                    {item.sensivelParaAuditoria ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="badge media">Sensível</span>
                        {item.motivosSensibilidade?.map((mot, i) => (
                          <span key={i} className="small muted" style={{ fontSize: '10.5px' }}>
                            • {mot}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="badge grey">Padrão</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 3.2 Refatoração do Componente `components/AuditoriaEntrada.tsx`
Arquitetura atualizada integrando o ciclo de 2 etapas, hooks completos e layout responsivo:

```tsx
'use client';

import React, { useState, useMemo } from 'react';
import type { ExtractedInvoiceData, ExtractedItem } from '@/lib/extrator-nfe';
import TabelaItensExtracao from './TabelaItensExtracao';
import ParametrizacaoERP from './ParametrizacaoERP';

export default function AuditoriaEntrada() {
  // 1. Configuração e Arquivo de Entrada
  const [file, setFile] = useState<File | null>(null);
  const [regime, setRegime] = useState('Simples Nacional');
  const [finalidade, setFinalidade] = useState('Revenda/Comercialização');

  // 2. Estados da Etapa 1 (Extração Determinística)
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractedInvoice, setExtractedInvoice] = useState<ExtractedInvoiceData | null>(null);

  // 3. Estados da Etapa 2 (Seleção e Motor de Auditoria)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [motor, setMotor] = useState<'ollama' | 'gemini'>('ollama');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<any | null>(null);

  // 4. Estados de Exportação de Relatório
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ─── Handlers da Etapa 1 (Extração Determinística) ──────────────────────────
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setExtractionError('Selecione um arquivo XML ou PDF da NF-e.');
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);
    setExtractedInvoice(null);
    setAuditResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('regime', regime);
    formData.append('finalidade', finalidade);

    try {
      const res = await fetch('/api/auditoria-entrada/extrair', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status} ao extrair dados.`);
      }

      const result: ExtractedInvoiceData = await res.json();
      setExtractedInvoice(result);

      // Pré-seleciona todos os itens para permitir fluxo ágil, ou sensíveis se houver
      const todosIndices = new Set(result.itens.map((it) => it.index));
      setSelectedIndices(todosIndices);
    } catch (err: any) {
      setExtractionError(err.message || 'Falha ao processar a extração determinística.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ─── Handlers de Seleção de Itens (Etapa 2) ─────────────────────────────────
  const handleToggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!extractedInvoice) return;
    setSelectedIndices(new Set(extractedInvoice.itens.map((it) => it.index)));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleSelectOnlySensitive = () => {
    if (!extractedInvoice) return;
    const sensiveis = extractedInvoice.itens
      .filter((it) => it.sensivelParaAuditoria)
      .map((it) => it.index);
    setSelectedIndices(new Set(sensiveis));
  };

  const handleResetToUpload = () => {
    setExtractedInvoice(null);
    setAuditResult(null);
    setSelectedIndices(new Set());
    setExtractionError(null);
    setAuditError(null);
  };

  const handleReturnToSelection = () => {
    setAuditResult(null);
    setAuditError(null);
  };

  // ─── Adaptador para Compatibilidade com ParametrizacaoERP e Relatórios ─────
  const adaptAuditResultForERP = (result: any, invoice: ExtractedInvoiceData) => {
    return {
      statusGlobal: result.statusGlobal,
      motor: result.motorUtilizado || (motor === 'ollama' ? 'Ollama Local (RX 580)' : 'Gemini Cloud (Google AI)'),
      parecerTecnicoXml: result.parecerTecnicoGeral || result.parecerTecnicoXml || 'Parecer técnico disponível.',
      parecerConformidade: result.parecerConformidadeCreditos || result.parecerConformidade || 'Parecer de conformidade disponível.',
      regime,
      finalidade,
      nfe: {
        emitente: {
          xNome: invoice.emitente?.nome,
          CNPJ: invoice.emitente?.cnpj,
          IE: invoice.emitente?.ie || 'ISENTO',
          enderEmit: { UF: invoice.emitente?.uf },
        },
        destinatario: {
          xNome: invoice.destinatario?.nome,
          CNPJ: invoice.destinatario?.cnpj,
          CPF: invoice.destinatario?.cpf,
          enderDest: { UF: invoice.destinatario?.uf },
        },
      },
      itens: (result.itens || []).map((it: any) => ({
        ...it,
        cProd: it.cProd,
        xProd: it.xProd,
        ncm: typeof it.ncm === 'object' ? (it.ncm.auditado || it.ncm.declarado) : it.ncm,
        cest: it.cest || (typeof it.ncm === 'object' ? it.ncm.cest : undefined),
        cfopEntrada: it.cfop?.entradaSugerido || it.cfopEntrada || '1102',
        cstIcmsEntrada: it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00',
        aliqIcms: it.icms?.aliqIcmsCredito || it.aliqIcms || '18%',
        permiteCredito: it.icms?.permiteCredito ?? it.permiteCredito ?? true,
        cstPisCofinsEntrada: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
        aliqPis: it.aliqPis || '1.65%',
        aliqCofins: it.aliqCofins || '7.6%',
        cClassTrib: it.reforma?.cClassTrib || it.cClassTrib || '000001',
        aliqIbsTransitorio: it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%',
        aliqCbsTransitorio: it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%',
        regimeEspecial: it.reforma?.regimeEspecial || it.regimeEspecial || 'Regime Regular (Padrão)',
        instrucaoCadastro: it.instrucaoCadastroERP || it.instrucaoCadastro || 'Instrução de parametrização fiscal',
      })),
    };
  };

  // ─── Handler de Submissão de Auditoria Seletiva (Etapa 2) ───────────────────
  const handleAuditSubmit = async () => {
    if (!extractedInvoice) return;
    if (selectedIndices.size === 0) {
      setAuditError('Selecione pelo menos um item para submeter à auditoria pericial.');
      return;
    }

    setIsAuditing(true);
    setAuditError(null);
    setAuditResult(null);

    const itensParaAuditar = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));

    const auditPayload = {
      motor,
      contextoAdquirente: {
        regime,
        finalidade,
        ufDestino: extractedInvoice.destinatario?.uf || 'SP',
      },
      documentoContexto: {
        emitenteCnpj: extractedInvoice.emitente?.cnpj,
        emitenteNome: extractedInvoice.emitente?.nome,
        emitenteUf: extractedInvoice.emitente?.uf,
        emitenteCrt: extractedInvoice.emitente?.crt,
        chaveAcesso: extractedInvoice.identificacao?.chaveAcesso,
      },
      itensSelecionados: itensParaAuditar,
    };

    try {
      // Dispara para o endpoint de auditoria
      const res = await fetch('/api/auditoria-entrada/auditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auditPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status} na auditoria pericial.`);
      }

      const rawResult = await res.json();
      const adapted = adaptAuditResultForERP(rawResult, extractedInvoice);
      setAuditResult(adapted);
    } catch (err: any) {
      setAuditError(err.message || 'Falha ao executar auditoria pericial dos itens.');
    } finally {
      setIsAuditing(false);
    }
  };

  // ─── Handler de Download de Relatório ──────────────────────────────────────
  const handleDownloadReport = async (format: 'html' | 'txt' = 'html') => {
    if (!auditResult) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/auditoria-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auditResult, format }),
      });

      if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao gerar relatório.`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_executivo.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setPdfError(err.message || 'Falha ao baixar o relatório.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2>Auditoria de Entrada (IA Local · RX 580)</h2>
        <span className="badge success mono">Soberania Local-First</span>
      </div>
      <p className="hint">
        Faça o upload da nota fiscal (.xml da NF-e ou .pdf do DANFE) para auditar documento fiscal com extração determinística imediata e análise pericial por IA.
      </p>

      {/* ETAPA 1: Upload e Extração Determinística Imediata */}
      {!extractedInvoice && (
        <form onSubmit={handleFileUpload}>
          <label className="field">
            <span>Arquivo da Nota Fiscal (.xml, .pdf)</span>
            <input
              type="file"
              accept=".xml,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <label className="field">
            <span>Regime da Empresa Adquirente</span>
            <select value={regime} onChange={(e) => setRegime(e.target.value)}>
              <option value="Simples Nacional">Simples Nacional</option>
              <option value="Regime Regular">Regime Regular</option>
            </select>
          </label>

          <label className="field">
            <span>Finalidade da Aquisição</span>
            <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
              <option value="Revenda/Comercialização">Revenda/Comercialização</option>
              <option value="Industrialização">Industrialização</option>
              <option value="Uso/Consumo">Uso/Consumo</option>
              <option value="Ativo Imobilizado">Ativo Imobilizado</option>
            </select>
          </label>

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={isExtracting || !file} className="btn primary">
              {isExtracting ? 'Extraindo Itens da NF-e (< 200ms)...' : 'Auditar Documento (Extrair Itens)'}
            </button>
          </div>
        </form>
      )}

      {isExtracting && (
        <div className="note info" style={{ marginTop: 20 }}>
          <div className="t">Extração Determinística em Andamento...</div>
          <div className="x">
            Processamento determinístico imediato (<span className="spin" /> &lt;200ms) sem invocação de LLMs. Validando 100% dos NCMs contra o catálogo oficial do Siscomex.
          </div>
        </div>
      )}

      {extractionError && (
        <div className="note error" style={{ marginTop: 20 }}>
          <div className="t">Erro na extração do documento fiscal</div>
          <div className="x">{extractionError}</div>
        </div>
      )}

      {/* ETAPA 2: Apresentação Tabular, Seleção e Disparo da Auditoria */}
      {extractedInvoice && !auditResult && (
        <div style={{ marginTop: 20 }}>
          {/* Cabeçalho Resumo da NF-e */}
          <div className="card" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>NF-e: {extractedInvoice.identificacao?.numero || 'S/N'} (Série {extractedInvoice.identificacao?.serie || '1'})</strong>
                <span className="badge blue mono" style={{ marginLeft: 8 }}>{extractedInvoice.tipoDocumento}</span>
                {extractedInvoice.tempoExtracaoMs !== undefined && (
                  <span className="badge success mono" style={{ marginLeft: 6 }}>{extractedInvoice.tempoExtracaoMs}ms</span>
                )}
              </div>
              <button type="button" onClick={handleResetToUpload} className="mini" title="Carregar outro arquivo de nota fiscal">
                ↺ Carregar Outro Arquivo
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10, fontSize: '13px' }}>
              <div><strong>Emitente:</strong> {extractedInvoice.emitente?.nome || 'N/A'} (CNPJ: {extractedInvoice.emitente?.cnpj || 'N/A'}) - {extractedInvoice.emitente?.uf}</div>
              <div><strong>Regime Emitente:</strong> {extractedInvoice.emitente?.regimeDescricao || 'N/A'}</div>
              <div><strong>Destinatário:</strong> {extractedInvoice.destinatario?.nome || 'N/A'} ({extractedInvoice.destinatario?.uf})</div>
              <div><strong>Valor Total NF:</strong> {extractedInvoice.resumoFinanceiro?.vNF?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>

          {/* Tabela Interativa de Itens */}
          <TabelaItensExtracao
            itens={extractedInvoice.itens}
            selectedIndices={selectedIndices}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onSelectOnlySensitive={handleSelectOnlySensitive}
          />

          {/* Painel de Escolha do Motor de Auditoria */}
          <div className="card" style={{ marginTop: 16, padding: 16, background: '#fafbfc', border: '1px solid #dfe5f0' }}>
            <h4 style={{ margin: '0 0 10px' }}>Configuração do Motor de Auditoria Pericial</h4>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="motor-auditoria"
                  value="ollama"
                  checked={motor === 'ollama'}
                  onChange={() => setMotor('ollama')}
                />
                <div>
                  <strong>IA Local (Ollama · GPU AMD RX 580)</strong>
                  <div className="small muted">Privacidade absoluta, zero envio de dados tributários para nuvem externa. Particionado item a item.</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="motor-auditoria"
                  value="gemini"
                  checked={motor === 'gemini'}
                  onChange={() => setMotor('gemini')}
                />
                <div>
                  <strong>IA Externa (Google Gemini 3.8 Flash API)</strong>
                  <div className="small muted">Processamento veloz em nuvem via API oficial Google Gemini com schema estruturado.</div>
                </div>
              </label>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={handleAuditSubmit}
                disabled={isAuditing || selectedIndices.size === 0}
                className="btn primary"
              >
                {isAuditing
                  ? `Auditando ${selectedIndices.size} item(ns) via ${motor === 'ollama' ? 'IA Local (RX 580)' : 'Gemini Cloud'}...`
                  : `Auditar ${selectedIndices.size} Item(ns) Selecionado(s)`}
              </button>

              {selectedIndices.size === 0 && (
                <span className="small" style={{ color: 'var(--bad)' }}>
                  Selecione ao menos 1 item na tabela acima para iniciar a auditoria.
                </span>
              )}
            </div>
          </div>

          {isAuditing && (
            <div className="note info" style={{ marginTop: 20 }}>
              <div className="t">
                Executando Auditoria Pericial via {motor === 'ollama' ? 'IA Local Ollama (GPU RX 580)' : 'Gemini Cloud API'}...
              </div>
              <div className="x">
                {motor === 'ollama'
                  ? 'Os itens selecionados estão sendo particionados item a item com num_ctx otimizado (4096) para eliminar sobrecargas de VRAM e timeouts de 180s na GPU RX 580.'
                  : 'Os itens selecionados estão sendo transmitidos com segurança para a Google Gemini API para análise pericial acelerada.'}
              </div>
            </div>
          )}

          {auditError && (
            <div className="note error" style={{ marginTop: 20 }}>
              <div className="t">Erro na auditoria pericial</div>
              <div className="x">{auditError}</div>
            </div>
          )}
        </div>
      )}

      {/* ETAPA FINAL: Apresentação dos Resultados Auditados e ERP */}
      {auditResult && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Resultados da Auditoria</h3>
              {auditResult.statusGlobal === 'Inconsistente' ? (
                <span className="badge error">{auditResult.statusGlobal}</span>
              ) : auditResult.statusGlobal === 'Atenção' ? (
                <span className="badge media">{auditResult.statusGlobal}</span>
              ) : (
                <span className="badge blue">{auditResult.statusGlobal || 'Regular'}</span>
              )}
              <span className="badge grey mono">{auditResult.motor}</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleReturnToSelection} className="mini" title="Modificar seleção de itens ou motor">
                ← Voltar para Seleção de Itens
              </button>
              <button type="button" onClick={handleResetToUpload} className="mini">
                ↺ Nova Auditoria
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14, marginBottom: 16, background: '#f9f9f9', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Técnico do Documento</h4>
            <p className="small">{auditResult.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}</p>
          </div>

          <div className="card" style={{ marginBottom: 16, background: '#f0f4f8', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Breve de Conformidade e Créditos</h4>
            <p className="small">{auditResult.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}</p>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleDownloadReport('html')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: 'var(--brand)', color: 'white' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório HTML'}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadReport('txt')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: '#34495e', color: 'white' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório TXT'}
            </button>
            {pdfError && <div className="note error" style={{ marginTop: 8 }}>{pdfError}</div>}
          </div>

          <ParametrizacaoERP data={auditResult} />
        </div>
      )}
    </div>
  );
}
```

---

## 4. Caveats

1. **Endpoint de Auditoria na Etapa 2 (`/api/auditoria-entrada/auditar`)**:
   O endpoint `POST /api/auditoria-entrada/auditar` é o escopo do Milestone 3 (`M3: Selective Partitioned AI Audit Engine`). No Milestone 2, o componente pode despachar o `AuditRequestPayload` para `/api/auditoria-entrada/auditar` ou para `/api/auditoria-entrada?action=auditar`. Caso M3 ainda não esteja implementado no momento do teste visual interativo, um mock de resposta imediata ou o fallback simulado validado no `tests/e2e-auditoria-entrada.test.mjs` pode ser retornado.
2. **Ambiente Headless e JSDOM**:
   Em `scripts/ui-smoke.mjs`, o DOM é simulado via `jsdom`. Funções de manipulação direta de DOM como `window.URL.createObjectURL` e `window.open` em `handleDownloadReport` e `ParametrizacaoERP` devem ser protegidas por verificação de ambiente ou tratadas com mocks nos testes em Node.js.
3. **Escopo de Arquivos Modificados**:
   Este relatório é estritamente de investigação e recomendação analítica (read-only). Nenhum arquivo do código fonte em `components/` ou `app/` foi alterado por este agente.

---

## 5. Conclusion

1. A arquitetura de 2 etapas é a solução definitiva para o problema de timeout da GPU RX 580, desacoplando a extração determinística de alta velocidade (<200ms) da auditoria seletiva por IA.
2. O componente `components/TabelaItensExtracao.tsx` deve ser criado como componente puro e tipado, recebendo `itens: ExtractedItem[]`, `selectedIndices: Set<number>`, `onToggleSelect`, `onSelectAll`, `onDeselectAll` e `onSelectOnlySensitive`.
3. O componente `components/AuditoriaEntrada.tsx` orquestra a máquina de estados `EMPTY -> EXTRACTED -> AUDITING -> AUDITED`, garantindo aderência estrita à ordem de hooks do React, retrocompatibilidade com `ParametrizacaoERP` e compatibilidade total com os testes de fumaça de UI.

---

## 6. Verification Method

Para verificar de forma independente e automatizada a implementação do Milestone 2:

1. **Checagem de Regras de Hooks (React Rules of Hooks)**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node scripts/hookcheck.mjs components
   ```
   *Condição de invalidação*: Qualquer hook chamado após um `return` ou dentro de bloco condicional/laço resulta em código de saída 1.

2. **Teste de Fumaça de UI em DOM Real (jsdom)**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node scripts/ui-smoke.mjs
   ```
   *Condição de invalidação*: Se `AuditoriaEntrada` não renderizar com texto compatível com `/Auditar Documento/i` ou se quebrar na montagem/desmontagem.

3. **Validação de Tipagem Estrita do TypeScript**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   npx tsc --noEmit
   ```
   *Condição de invalidação*: Qualquer inconsistência de props entre `AuditoriaEntrada`, `TabelaItensExtracao`, `ParametrizacaoERP` ou tipos de `extrator-nfe.ts`.

4. **Execução da Suíte E2E de Auditoria de Entrada**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
   ```
   *Condição de invalidação*: Falha em qualquer um dos 54 testes dos Tiers 1 a 4.
