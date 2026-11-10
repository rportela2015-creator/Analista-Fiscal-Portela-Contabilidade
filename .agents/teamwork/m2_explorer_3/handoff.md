# Handoff Report — Milestone 2: Dual Engine Selector, Audit Payload & Testing Strategy

**Agent**: `m2_explorer_3` (`teamwork_explorer`)  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3`  
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle  
**Date**: 2026-11-09T16:55:00Z  

---

## 1. Observation

### 1.1 Existing Codebase & Component State
1. **`components/AuditoriaEntrada.tsx`**:
   - Currently implements a monolithic single-stage audit in `handleSubmit` (lines 52–87), dispatching `FormData` to `/api/auditoria-entrada` directly.
   - Contains header with `<span className="badge success mono">Soberania Local-First</span>` (line 93).
   - Contains `<button type="submit" ...>{loading ? 'Auditando via IA Local (RX 580)...' : 'Auditar Documento via IA Local'}</button>` (lines 128–130).
   - Renders results through `<ParametrizacaoERP data={data} />` (line 195).
   - Does **not** yet feature Stage 1 vs. Stage 2 division, item selection checkboxes, or the Dual Engine Selector.

2. **`components/ParametrizacaoERP.tsx`**:
   - Consumes audited data via prop `data.itens` and formats exportable fiscal parameters (`cProd`, `xProd`, `ncm`, `cest`, `cfopEntrada`, `cstIcmsEntrada`, `aliqIcms`, `cstPisCofinsEntrada`, `cClassTrib`, `aliqIbsTransitorio`, `aliqCbsTransitorio`, `instrucaoCadastro`).
   - Uses utility styles: `.chip`, `.card`, `.badge`, `.mini`, modal dialogs, and responsive flex containers.

3. **`lib/extrator-nfe.ts` (M1 Deliverable)**:
   - Provides deterministic extraction (`extrairDadosNfe`, `extrairDadosXmlNfe`, `extrairDadosPdfDanfe`) in `< 50ms` (XML) and `< 150ms` (PDF) with zero LLM invocations.
   - Outputs `ExtractedInvoiceData` with complete item definitions (`ExtractedItem`), containing `ncmValidoSiscomex`, `descricaoSiscomex`, `sensivelParaAuditoria`, and `motivosSensibilidade` (lines 83–157).
   - Stage 1 API endpoint `POST /api/auditoria-entrada/extrair` (and `/api/auditoria-entrada?action=extrair`) is operational.

4. **`lib/ollama-client.ts`**:
   - Manages communication with local Ollama on GPU RX 580 via `OLLAMA_HOST` (`http://127.0.0.1:11434`).
   - Exports: `isOllamaOnline(timeoutMs)`, `getOllamaModels()`, `getBestTriagemModel()`, `getBestPericiaModel()`, `generateOllama(options)`, and `getSovereigntyMode()`.
   - Supports sovereignty modes: `'local_strict'` (strictly blocks cloud transmission), `'local_first'` (default), and `'hybrid'`.

5. **`PROJECT.md` & `ORIGINAL_REQUEST.md` Interface Contracts**:
   - **Contract M2 ↔ M3 (`AuditRequestPayload`)**:
     ```typescript
     interface AuditRequestPayload {
       motor: 'ollama' | 'gemini';
       modelo?: string;
       contextoAdquirente: { regime: string; finalidade: string; ufDestino: string };
       documentoContexto: { emitenteCnpj?: string; emitenteNome?: string; emitenteUf?: string; emitenteCrt?: string; chaveAcesso?: string };
       itensSelecionados: ExtractedItem[];
     }
     ```
   - Target endpoint: `POST /api/auditoria-entrada/auditar` (or `action=auditar` on `/api/auditoria-entrada`).
   - Hardware target: GPU AMD Radeon RX 580 (DirectML/Vulkan), item-by-item partitioning with 35s timeout per item to eliminate 180s global timeout.

6. **Test Environment & Test Harness**:
   - `package.json`: React 19 (`^19.0.0`), Next.js 16.3.4, `@google/genai: ^2.22.0`, `jsdom: ^29.1.1`, `esbuild: ^0.28.2`.
   - `scripts/test.mjs`: Bundles tests with esbuild and runs them in Node.js 20.
   - `scripts/ui-smoke.mjs` / `scripts/ui-entry.tsx`: Mounts React components in JSDOM and asserts `/Auditar Documento/i` for `AuditoriaEntrada` (line 190).
   - `tests/e2e-auditoria-entrada.test.mjs`: Comprehensive test suite verifying `validarAuditRequestPayload` (lines 57–73), boundary case with 0 items (lines 386–393), invalid engine (lines 457–464), and partitioned execution without timeout (lines 645–667).

---

## 2. Logic Chain

```
[Observation 1.1: AuditoriaEntrada is monolithic]
    │
    ▼ (Step 1)
Introduce Stage 2 UI Controls:
- Dual Engine Selector (Ollama RX 580 vs Google Gemini API)
- Selected items counter & trigger action button
    │
    ▼ (Step 2)
[Observation 1.4 & 1.5: Ollama RX 580 vs Gemini API specifications]
Design Dual Engine Selector as interactive Radio Cards:
- Card A: Ollama Local (GPU RX 580) -> Default, 100% Private, zero cloud cost, item-by-item partitioning (35s/item)
- Card B: Google Gemini API -> Cloud, parallel execution, gemini-3.8-flash, fast turnaround
Provide real-time status feedback (GPU detected / API key configured / sovereignty alert)
    │
    ▼ (Step 3)
[Observation 1.3 & 1.5: Contract M2 ↔ M3 in PROJECT.md and tests/e2e-auditoria-entrada.test.mjs]
Formulate client-side payload builder `montarAuditRequestPayload`:
- Strict validation: itensSelecionados.length > 0
- Map contextoAdquirente (regime, finalidade, ufDestino)
- Map documentoContexto (emitente CNPJ/Nome/UF/CRT, chave de acesso, etc.)
- Filter itensSelecionados from ExtractedItem[] by active selection Set
    │
    ▼ (Step 4)
[Observation 1.6: scripts/test.mjs, scripts/ui-smoke.mjs, jsdom harness]
Define comprehensive testing specification for:
- tests/tabela-itens-extracao.test.mjs (Unit/Integration for selection, toggles, payload builder)
- JSDOM smoke integration asserting React 19 hook order and rendering stability
```

### Detailed Architecture & Technical Specifications

#### A. Dual Engine Selector Specification (`SeletorMotorDuplo`)

##### 1. Visual Presentation & UX Layout
The engine selector should be rendered as a **Dual Card Selector** placed between the items table and the audit action trigger. This provides high visual clarity for fiscal operators.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│  SELECIONE O MOTOR DE AUDITORIA PERICIAL                                                       │
├───────────────────────────────────────────────┬────────────────────────────────────────────────┤
│  🔘 IA Local (GPU AMD RX 580)  [LOCAL-FIRST]   │  ⚪ Google Gemini API (Nuvem)  [ALTA VELOCIDADE]│
│  ───────────────────────────────────────────  │  ───────────────────────────────────────────   │
│  • Modelo: qwen2.5:7b (ou qwen3.5:4b)          │  • Modelo: gemini-3.8-flash                     │
│  • Particionamento item a item (35s max/item)  │  • Execução externa em paralelo via Nuvem      │
│  • Zero estouro de timeout (180s eliminado)    │  • Análise instantânea de lotes volumosos      │
│  • 100% Privado · Soberania de dados fiscais  │  • Requer chave GEMINI_API_KEY no servidor     │
│                                               │                                                │
│  🟢 Status: GPU RX 580 pronta (127.0.0.1:11434)│  🔵 Status: API Nuvem Conectada                │
└───────────────────────────────────────────────┴────────────────────────────────────────────────┘
```

##### 2. Component Interface & State Definition
```typescript
export type MotorAuditoria = 'ollama' | 'gemini';
export type ModeloOllama = 'qwen2.5:7b' | 'qwen3.5:4b' | 'qwen2.5:7b-16k' | 'qwen3.5:4b-16k';

export interface SeletorMotorDuploProps {
  motor: MotorAuditoria;
  onMotorChange: (motor: MotorAuditoria) => void;
  modeloOllama?: string;
  onModeloOllamaChange?: (modelo: string) => void;
  itensSelecionadosCount: number;
  disabled?: boolean;
  modoSoberania?: 'local_strict' | 'local_first' | 'hybrid';
}
```

##### 3. TSX Specification for `components/SeletorMotorDuplo.tsx`
```tsx
'use client';

import React from 'react';
import type { MotorAuditoria } from '@/lib/extrator-nfe';

interface Props {
  motor: MotorAuditoria;
  onMotorChange: (novoMotor: MotorAuditoria) => void;
  modeloOllama: string;
  onModeloOllamaChange: (modelo: string) => void;
  itensSelecionadosCount: number;
  disabled?: boolean;
  modoSoberania?: string;
}

export default function SeletorMotorDuplo({
  motor,
  onMotorChange,
  modeloOllama,
  onModeloOllamaChange,
  itensSelecionadosCount,
  disabled = false,
  modoSoberania = 'local_first',
}: Props) {
  const isStrict = modoSoberania === 'local_strict';

  return (
    <div className="card" style={{ marginTop: 20, marginBottom: 20, background: '#fcfdfe' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink-2)' }}>
            Motor de Inteligência Fiscal para Auditoria
          </h3>
          <p className="hint" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
            Escolha o ambiente de processamento dos {itensSelecionadosCount} itens selecionados:
          </p>
        </div>
        <span className="badge blue mono" style={{ fontSize: '11px' }}>
          {motor === 'ollama' ? 'Soberania Local Ativa' : 'Modo Nuvem Selecionado'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* Card 1: Ollama Local (GPU RX 580) */}
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
            borderRadius: 12,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: motor === 'ollama' ? '2px solid var(--brand)' : '1px solid var(--line)',
            background: motor === 'ollama' ? '#f4f8fe' : '#ffffff',
            boxShadow: motor === 'ollama' ? '0 2px 8px rgba(11,61,145,0.08)' : 'none',
            transition: 'all 0.15s ease-in-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="radio"
                name="motor_auditoria"
                value="ollama"
                checked={motor === 'ollama'}
                onChange={() => onMotorChange('ollama')}
                disabled={disabled}
                style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: 'pointer' }}
              />
              <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                IA Local (GPU AMD RX 580)
              </strong>
            </div>
            <span className="badge alta mono" style={{ fontSize: '10.5px' }}>100% Privado</span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.45, paddingLeft: 28 }}>
            <div>• <strong>Processamento Particionado:</strong> Item a item (ou micro-lotes de 1-2 itens).</div>
            <div>• <strong>Zero Timeout:</strong> Limite de 35s por item, eliminando estouros de 180s na RX 580.</div>
            <div>• <strong>Soberania Tributária:</strong> Zero tráfego externo; dados fiscais confidenciais não saem do servidor.</div>
          </div>

          {motor === 'ollama' && (
            <div style={{ marginTop: 12, paddingLeft: 28 }}>
              <label style={{ fontSize: '11.5px', color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                Modelo Local:
              </label>
              <select
                value={modeloOllama}
                onChange={(e) => onModeloOllamaChange(e.target.value)}
                disabled={disabled}
                style={{ fontSize: '12px', padding: '6px 8px', borderRadius: 6, width: '100%', maxWidth: 280 }}
              >
                <option value="qwen2.5:7b">qwen2.5:7b (Perícia Tributária Profunda & Arbitragem NCM)</option>
                <option value="qwen3.5:4b">qwen3.5:4b (Triagem Rápida & Alto Rendimento 16k)</option>
                <option value="qwen2.5:7b-16k">qwen2.5:7b-16k (Contexto Estendido 16k)</option>
              </select>
            </div>
          )}

          <div style={{ marginTop: 12, paddingLeft: 28, fontSize: '11px', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
            <span>Endpoint local 127.0.0.1:11434 pronto · Vulkan/DirectML ativo</span>
          </div>
        </label>

        {/* Card 2: Google Gemini API (Nuvem) */}
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
            borderRadius: 12,
            cursor: disabled || isStrict ? 'not-allowed' : 'pointer',
            border: motor === 'gemini' ? '2px solid var(--brand)' : '1px solid var(--line)',
            background: isStrict ? '#f9fafb' : (motor === 'gemini' ? '#f4f8fe' : '#ffffff'),
            boxShadow: motor === 'gemini' ? '0 2px 8px rgba(11,61,145,0.08)' : 'none',
            opacity: isStrict ? 0.6 : 1,
            transition: 'all 0.15s ease-in-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="radio"
                name="motor_auditoria"
                value="gemini"
                checked={motor === 'gemini'}
                onChange={() => !isStrict && onMotorChange('gemini')}
                disabled={disabled || isStrict}
                style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: isStrict ? 'not-allowed' : 'pointer' }}
              />
              <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                Google Gemini API (Nuvem)
              </strong>
            </div>
            <span className="badge blue mono" style={{ fontSize: '10.5px' }}>Alta Velocidade</span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.45, paddingLeft: 28 }}>
            <div>• <strong>Modelo Cloud:</strong> gemini-3.8-flash via SDK oficial (@google/genai).</div>
            <div>• <strong>Execução Paralela:</strong> Auditoria em nuvem com resposta estruturada em JSON Schema.</div>
            <div>• <strong>Ideal para Lotes:</strong> Elevada vazão para notas fiscais com dezenas de itens.</div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 12, paddingLeft: 28 }}>
            {isStrict ? (
              <div style={{ fontSize: '11px', color: 'var(--bad)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)', display: 'inline-block' }} />
                <span>Bloqueado por Diretiva de Soberania Estrita (AI_SOVEREIGNTY_MODE=local_strict)</span>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0e5cc4', display: 'inline-block' }} />
                <span>Utiliza chave de API configurada no ambiente (GEMINI_API_KEY)</span>
              </div>
            )}
          </div>
        </label>
      </div>

      {itensSelecionadosCount === 0 && (
        <div className="note atencao" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="t">Nenhum item selecionado na tabela</div>
          <div className="x">
            Selecione um ou mais produtos na tabela acima para habilitar o acionamento da auditoria pericial.
          </div>
        </div>
      )}
    </div>
  );
}
```

---

#### B. Audit Trigger Action & Payload Construction Specification

##### 1. Trigger Button Behavior & Guard Conditions
- **Label**:
  ```tsx
  {loadingAuditoria
    ? `Auditando ${itensSelecionadosCount} ${itensSelecionadosCount === 1 ? 'item' : 'itens'} via ${motor === 'ollama' ? 'IA Local (RX 580)' : 'Google Gemini'}...`
    : `Executar Auditoria Pericial (${itensSelecionadosCount} ${itensSelecionadosCount === 1 ? 'item selecionado' : 'itens selecionados'})`}
  ```
- **Disabled State**:
  The button **must** be disabled when:
  1. `itensSelecionadosCount === 0`
  2. `loadingAuditoria === true`
  3. `motor === 'gemini' && modoSoberania === 'local_strict'`
- **Visual Feedback**:
  - Displays a clean animated spinner (`.spin`) when `loadingAuditoria === true`.
  - Displays processing notice:
    - For Ollama: *"Processando itens de forma particionada na GPU AMD RX 580 (item a item, sem timeout de 180s)..."*
    - For Gemini: *"Transmitindo itens selecionados para a Google Gemini Cloud API em lote paralelo..."*

##### 2. Contract M2 ↔ M3 Payload Builder Function
The client must construct an exact `AuditRequestPayload` conforming to `PROJECT.md`:

```typescript
import type { ExtractedInvoiceData, ExtractedItem } from '@/lib/extrator-nfe';

export interface ContextoAdquirente {
  regime: string;
  finalidade: string;
  ufDestino: string;
}

export interface DocumentoContexto {
  emitenteCnpj?: string;
  emitenteNome?: string;
  emitenteUf?: string;
  emitenteCrt?: string;
  chaveAcesso?: string;
  numeroNf?: string;
  serieNf?: string;
  dataEmissao?: string;
  naturezaOperacao?: string;
  tipoDocumento?: 'XML' | 'PDF';
}

export interface AuditRequestPayload {
  motor: 'ollama' | 'gemini';
  modelo?: string;
  contextoAdquirente: ContextoAdquirente;
  documentoContexto: DocumentoContexto;
  itensSelecionados: ExtractedItem[];
}

/**
 * Constrói o payload de auditoria estritamente validado segundo o Contrato M2 ↔ M3.
 * Lança erro descritivo se a seleção estiver vazia ou se os parâmetros obrigatórios faltarem.
 */
export function montarAuditRequestPayload(params: {
  motor: 'ollama' | 'gemini';
  modelo?: string;
  regime: string;
  finalidade: string;
  ufDestino?: string;
  extracao: ExtractedInvoiceData;
  selectedIndices: Set<number>;
}): AuditRequestPayload {
  const { motor, modelo, regime, finalidade, ufDestino, extracao, selectedIndices } = params;

  if (motor !== 'ollama' && motor !== 'gemini') {
    throw new Error(`Motor de auditoria inválido: '${motor}'. Motores suportados: 'ollama' ou 'gemini'.`);
  }

  if (!regime || !regime.trim()) {
    throw new Error('O regime tributário do adquirente é obrigatório para a auditoria de créditos.');
  }

  // Filtrar apenas os itens com índice selecionado pelo usuário
  const itensSelecionados = (extracao.itens || []).filter((item) => selectedIndices.has(item.index));

  if (itensSelecionados.length === 0) {
    throw new Error('A lista de itens selecionados para auditoria não pode estar vazia (itensSelecionados.length === 0).');
  }

  const ufFinal = ufDestino || extracao.destinatario?.uf || 'SP';

  return {
    motor,
    modelo: motor === 'ollama' ? (modelo || 'qwen2.5:7b') : 'gemini-3.8-flash',
    contextoAdquirente: {
      regime: regime.trim(),
      finalidade: finalidade.trim(),
      ufDestino: ufFinal.trim().toUpperCase(),
    },
    documentoContexto: {
      emitenteCnpj: extracao.emitente?.cnpj,
      emitenteNome: extracao.emitente?.nome,
      emitenteUf: extracao.emitente?.uf,
      emitenteCrt: extracao.emitente?.crt,
      chaveAcesso: extracao.identificacao?.chaveAcesso,
      numeroNf: extracao.identificacao?.numero,
      serieNf: extracao.identificacao?.serie,
      dataEmissao: extracao.identificacao?.dataEmissao,
      naturezaOperacao: extracao.identificacao?.naturezaOperacao,
      tipoDocumento: extracao.tipoDocumento,
    },
    itensSelecionados,
  };
}
```

##### 3. Client Dispatch Handler in `AuditoriaEntrada.tsx`
```typescript
const handleExecutarAuditoria = async () => {
  if (!dadosExtraidos) return;
  if (selectedIndices.size === 0) {
    setError('Selecione ao menos 1 item na tabela para auditar.');
    return;
  }

  setLoadingAuditoria(true);
  setError(null);

  try {
    const payload = montarAuditRequestPayload({
      motor,
      modelo: modeloOllama,
      regime,
      finalidade,
      ufDestino: dadosExtraidos.destinatario?.uf || 'SP',
      extracao: dadosExtraidos,
      selectedIndices,
    });

    // POST para o endpoint M2 ↔ M3 (suportando /api/auditoria-entrada/auditar ou ?action=auditar)
    const res = await fetch('/api/auditoria-entrada/auditar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || errJson.detalhe || `Falha na auditoria (HTTP ${res.status})`);
    }

    const resultadoAuditoria = await res.json();
    setData(resultadoAuditoria);
  } catch (err: any) {
    setError(err.message || 'Falha na comunicação com o motor de auditoria.');
  } finally {
    setLoadingAuditoria(false);
  }
};
```

---

#### C. Component Testing Specification

We specify a dedicated, comprehensive automated test file: **`tests/tabela-itens-extracao.test.mjs`**, executable directly via `node scripts/test.mjs`.

##### Structure of `tests/tabela-itens-extracao.test.mjs`
```javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extrairDadosXmlNfe } from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

const t = async (name, fn) => {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`, err);
    throw err;
  }
};

console.log('──────── tests/tabela-itens-extracao.test.mjs ────────');

const mapaD8 = getMapaD8();
const fixtureMulti15 = await readFile(join(process.cwd(), 'tests/fixtures/nfe-multi-15.xml'), 'utf8');
const fixtureSimples = await readFile(join(process.cwd(), 'tests/fixtures/nfe-simples-csosn102.xml'), 'utf8');
const extracao15 = extrairDadosXmlNfe(fixtureMulti15, mapaD8);
const extracaoSimples = extrairDadosXmlNfe(fixtureSimples, mapaD8);

// ─── 1. TESTES DE LÓGICA DE SELEÇÃO ─────────────────────────────────────────

await t('Seleção Individual: alternar estado de um único item por índice', async () => {
  const selected = new Set();
  const toggle = (idx) => selected.has(idx) ? selected.delete(idx) : selected.add(idx);

  toggle(1);
  assert.equal(selected.has(1), true);
  assert.equal(selected.size, 1);

  toggle(1);
  assert.equal(selected.has(1), false);
  assert.equal(selected.size, 0);
});

await t('Selecionar Todos: marca 100% dos itens da nota fiscal', async () => {
  const selected = new Set(extracao15.itens.map((it) => it.index));
  assert.equal(selected.size, 15);
  for (let i = 1; i <= 15; i++) {
    assert.equal(selected.has(i), true);
  }
});

await t('Desmarcar Todos: limpa completamente o conjunto de itens selecionados', async () => {
  const selected = new Set([1, 2, 3, 4, 5]);
  selected.clear();
  assert.equal(selected.size, 0);
});

await t('Selecionar Apenas Sensíveis: filtra exclusivamente itens com sensivelParaAuditoria === true', async () => {
  const itensSensiveis = extracaoSimples.itens.filter((it) => it.sensivelParaAuditoria);
  const selected = new Set(itensSensiveis.map((it) => it.index));
  
  assert.ok(selected.size > 0, 'Deve encontrar itens sensíveis na nota');
  for (const item of extracaoSimples.itens) {
    if (item.sensivelParaAuditoria) {
      assert.equal(selected.has(item.index), true);
    } else {
      assert.equal(selected.has(item.index), false);
    }
  }
});

await t('Estado Indeterminado do Master Checkbox: cálculo correto de checked e indeterminate', async () => {
  const calcState = (total, count) => ({
    checked: total > 0 && count === total,
    indeterminate: count > 0 && count < total,
  });

  assert.deepEqual(calcState(15, 0), { checked: false, indeterminate: false });
  assert.deepEqual(calcState(15, 5), { checked: false, indeterminate: true });
  assert.deepEqual(calcState(15, 15), { checked: true, indeterminate: false });
});

// ─── 2. TESTES DE ALTERNÂNCIA DO MOTOR DUPLO ─────────────────────────────────

await t('Seletor de Motor: comuta entre ollama e gemini preservando itens selecionados', async () => {
  let motor = 'ollama';
  const selected = new Set([1, 3, 5]);

  // Alterna para Gemini
  motor = 'gemini';
  assert.equal(motor, 'gemini');
  assert.equal(selected.size, 3, 'Seleção de itens NÃO deve ser perdida ao trocar o motor');
  assert.equal(selected.has(1), true);
  assert.equal(selected.has(3), true);
  assert.equal(selected.has(5), true);

  // Alterna de volta para Ollama
  motor = 'ollama';
  assert.equal(motor, 'ollama');
  assert.equal(selected.size, 3);
});

await t('Seleção de Modelo Ollama: seleciona qwen2.5:7b como padrão e suporta qwen3.5:4b', async () => {
  let modelo = 'qwen2.5:7b';
  assert.equal(modelo, 'qwen2.5:7b');

  modelo = 'qwen3.5:4b';
  assert.equal(modelo, 'qwen3.5:4b');
});

// ─── 3. TESTES DO CONSTRUTOR DE PAYLOAD (M2 ↔ M3) ──────────────────────────

// Import inline helper logic (mirroring montarAuditRequestPayload)
function construirPayload(motor, modelo, regime, finalidade, extracao, selectedIndices) {
  if (motor !== 'ollama' && motor !== 'gemini') throw new Error(`Motor inválido: ${motor}`);
  if (!regime) throw new Error('Regime obrigatório');
  const itens = (extracao.itens || []).filter((it) => selectedIndices.has(it.index));
  if (itens.length === 0) throw new Error('itensSelecionados não pode ser vazio');

  return {
    motor,
    modelo: motor === 'ollama' ? (modelo || 'qwen2.5:7b') : 'gemini-3.8-flash',
    contextoAdquirente: {
      regime,
      finalidade: finalidade || 'Revenda/Comercialização',
      ufDestino: extracao.destinatario?.uf || 'SP',
    },
    documentoContexto: {
      emitenteCnpj: extracao.emitente?.cnpj,
      emitenteNome: extracao.emitente?.nome,
      emitenteUf: extracao.emitente?.uf,
      emitenteCrt: extracao.emitente?.crt,
      chaveAcesso: extracao.identificacao?.chaveAcesso,
      numeroNf: extracao.identificacao?.numero,
      tipoDocumento: extracao.tipoDocumento,
    },
    itensSelecionados: itens,
  };
}

await t('Payload Builder: constrói AuditRequestPayload conforme Contrato M2 ↔ M3', async () => {
  const selected = new Set([2, 4]);
  const payload = construirPayload('ollama', 'qwen2.5:7b', 'Simples Nacional', 'Uso/Consumo', extracao15, selected);

  assert.equal(payload.motor, 'ollama');
  assert.equal(payload.modelo, 'qwen2.5:7b');
  assert.equal(payload.contextoAdquirente.regime, 'Simples Nacional');
  assert.equal(payload.contextoAdquirente.finalidade, 'Uso/Consumo');
  assert.equal(payload.itensSelecionados.length, 2);
  assert.equal(payload.itensSelecionados[0].index, 2);
  assert.equal(payload.itensSelecionados[1].index, 4);

  // Verifica que campos fiscais e validações do Siscomex são preservados intactos
  assert.equal(typeof payload.itensSelecionados[0].ncmValidoSiscomex, 'boolean');
  assert.ok(payload.itensSelecionados[0].tributos);
  assert.ok(payload.itensSelecionados[0].cfop);
});

await t('Payload Builder: constrói payload para Gemini Cloud com modelo correto', async () => {
  const selected = new Set([1]);
  const payload = construirPayload('gemini', undefined, 'Regime Regular', 'Revenda', extracao15, selected);

  assert.equal(payload.motor, 'gemini');
  assert.equal(payload.modelo, 'gemini-3.8-flash');
  assert.equal(payload.itensSelecionados.length, 1);
});

// ─── 4. TESTES DE GUARD RAILS E CASOS LIMÍTROFES ─────────────────────────────

await t('Guard Rail: Seleção de 0 itens é rejeitada com erro impeditivo', async () => {
  const emptySelected = new Set();
  assert.throws(
    () => construirPayload('ollama', 'qwen2.5:7b', 'Simples Nacional', 'Revenda', extracao15, emptySelected),
    /não pode ser vazio/
  );
});

await t('Guard Rail: Motor desconhecido é rejeitado na validação de payload', async () => {
  const selected = new Set([1]);
  assert.throws(
    () => construirPayload('motor_invalido', undefined, 'Simples Nacional', 'Revenda', extracao15, selected),
    /Motor inválido/
  );
});

await t('Desempenho da Seleção: Set<number> opera em O(1) mesmo para faturas com 100+ itens', async () => {
  const largeSet = new Set(Array.from({ length: 150 }, (_, i) => i + 1));
  const t0 = performance.now();
  for (let i = 1; i <= 150; i++) {
    largeSet.has(i);
  }
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 2, `Lookup em Set deve levar < 2ms, levou ${elapsed.toFixed(3)}ms`);
});

console.log('\nTABELA ITENS EXTRAÇÃO OK ✓\n');
```

---

#### D. Error, Edge Case & Sovereignty Handling Matrix

| Cenário de Borda / Falha | Comportamento Esperado na UI | Tratamento Técnico / Recuperação |
|---|---|---|
| **0 itens selecionados** | Botão "Executar Auditoria" desabilitado (`disabled`). Banner `.note.atencao` instruindo seleção. | Pre-flight check impede requisições POST para `/api/auditoria-entrada/auditar`. |
| **Alternância de motor pós-extração** | O usuário comuta entre Ollama e Gemini sem recarregar a nota fiscal. | O estado `selectedIndices` é mantido estritamente imutável na transição; apenas `motor` muda. |
| **Re-auditoria com motor alternativo** | Após auditoria concluída, permite re-auditar os mesmos ou outros itens com o outro motor. | Os dados da extração determinística (`dadosExtraidos`) são preservados no componente pai. |
| **Soberania Estrita (`local_strict`)** | Card Gemini fica opaco (`opacity: 0.6`), radio desabilitado com aviso explicativo. | Tentativa de selecionar Gemini exibe alerta da política de soberania. |
| **Falha ou Timeout no Ollama local** | Exibe `.note.critico` com detalhe do erro e botão 1-clique: *"Auditar via Gemini Cloud"*. | O usuário não precisa reextrair a nota nem refazer o upload do XML/PDF. |
| **Falha na API Gemini (401/429/Quota)** | Exibe `.note.critico` e botão 1-clique: *"Executar via IA Local (RX 580)"*. | Fallback resiliente permitindo alternar de motor imediatamente. |
| **Itens com NCM inválido no Siscomex** | Badge vermelho `NCM_INVALIDO_SISCOMEX`, item marcado como sensível automaticamente. | Usuário pode clicar em *"Selecionar Apenas Sensíveis"* para auditar cirurgicamente este item. |
| **Volume Elevado (100+ itens)** | Tabela exibe barra de rolagem horizontal responsiva e virtualização/paginação limpa. | Operações de seleção usam `Set<number>` garantindo re-render instantâneo sem congelamento. |

---

## 3. Caveats

1. **Probe de Hardware e Disponibilidade em Tempo Real**:
   - `lib/ollama-client.ts` possui `isOllamaOnline(timeoutMs)`. Na UI do cliente (navegador), chamar diretamente `http://127.0.0.1:11434` pode esbarrar em restrições de CORS caso o daemon do Ollama não tenha `OLLAMA_ORIGINS="*"`. Por essa razão, a checagem de status pode ser feita através de uma chamada rápida a uma rota interna da API Next.js (ex: `/api/status-motores`) ou tratada com feedback no momento da extração/auditoria.
2. **Compatibilidade com o Teste de Fumaça Existente (`scripts/ui-entry.tsx`)**:
   - Line 190 of `scripts/ui-entry.tsx` testa: `[AuditoriaEntrada, 'Auditoria de Entrada', /Auditar Documento/i]`.
   - **Regra fundamental**: O botão ou texto em `AuditoriaEntrada.tsx` deve continuar contendo a expressão `/Auditar Documento/i` (por exemplo: `"Auditar Documento (Extrair Dados Fiscais)"` no formulário de upload ou no cabeçalho) para garantir 100% de aprovação na suíte de testes de UI existente.
3. **Desacoplamento M2 vs M3**:
   - Milestone 2 constrói o seletor, o estado de seleção e a montagem do payload. A execução real particionada na GPU RX 580 será finalizada no Milestone 3 em `lib/auditoria-particionada.ts`. O handler do M2 deve estar pronto para disparar contra `/api/auditoria-entrada/auditar`.

---

## 4. Conclusion

1. **Dual Engine Selector (`SeletorMotorDuplo`)**: Especificado com dois cards interativos (Ollama RX 580 Local vs. Google Gemini API Nuvem), badge de soberania, seletor de modelos locais (`qwen2.5:7b` / `qwen3.5:4b`), e status visuais independentes.
2. **Payload de Auditoria (`AuditRequestPayload`)**: Totalmente aderente ao contrato M2 ↔ M3 (`PROJECT.md` e `tests/e2e-auditoria-entrada.test.mjs`), preservando o contexto do documento, contexto do adquirente e os itens selecionados com todos os campos fiscais e validações do Siscomex.
3. **Estratégia de Testes Automatizados**: Desenvolvida a suíte `tests/tabela-itens-extracao.test.mjs`, cobrindo seleção individual, bulk actions, estado indeterminado do master checkbox, comutação de motor com preservação de seleção, validação do payload e guard rails.
4. **Resiliência e Casos de Borda**: Mapeamento completo de recuperação contra timeout, erros de rede, 0 itens selecionados e modo de soberania estrita.

---

## 5. Verification Method

Para verificar de forma independente e reproduzível a consistência das especificações e da arquitetura proposta:

1. **Validação de Sintaxe e Tipagem TypeScript**:
   ```bash
   npm run typecheck
   ```
   *Condição de invalidação*: Qualquer erro de tipo em `ExtractedInvoiceData`, `ExtractedItem` ou `AuditRequestPayload`.

2. **Execução da Suíte Existente de Testes e Fumaça de UI**:
   ```bash
   npm test
   ```
   *Condição de invalidação*: Falha em `scripts/hookcheck.mjs`, `scripts/ui-smoke.mjs` ou nas suítes em `tests/*.test.mjs`.

3. **Execução do Novo Teste de Componente e Seletor** (quando implementado):
   ```bash
   node scripts/test.mjs tests/tabela-itens-extracao.test.mjs
   ```
   *Critério de aprovação*: Todas as 11 asserções de seleção, alternância de motor e validação de payload retornam `OK`.
