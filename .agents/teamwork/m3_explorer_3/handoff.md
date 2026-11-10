# Handoff Report: API Routes, UI Integration & Result Aggregation (M3 Explorer 3)

**Author**: `m3_explorer_3` (teamwork_explorer)  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_3`  
**Milestone**: Milestone 3 — Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API)  
**Target Delivery**: `handoff.md`  

---

## 1. Observation

### 1.1 Existing API Routes Architecture (`app/api/auditoria-entrada/`)
1. **`app/api/auditoria-entrada/route.ts`** (Lines 26-36):
   ```typescript
   const contentType = request.headers.get('content-type') || '';
   if (!contentType.includes('multipart/form-data')) {
     return NextResponse.json(
       {
         error: "Tipo de conteúdo inválido. A requisição deve ser enviada como 'multipart/form-data'.",
         codigo: 'CONTENT_TYPE_INVALIDO',
       },
       { status: 400 }
     );
   }
   ```
   - Currently, `app/api/auditoria-entrada/route.ts` unconditionally rejects any `application/json` payload with HTTP 400 `CONTENT_TYPE_INVALIDO`.
   - Lines 46-104 handle `action === 'extrair'` via `multipart/form-data`.
   - Lines 106-423 execute the legacy monolithic audit (reading entire XML/PDF, constructing a single monolithic prompt, and calling Ollama with a 180s timeout and `num_ctx: 16384` or Gemini).
2. **Dedicated Extraction Route**: `app/api/auditoria-entrada/extrair/route.ts` exists (103 lines) and handles `POST multipart/form-data` returning `ExtractedInvoiceData`.
3. **Dedicated Audit Route**: `app/api/auditoria-entrada/auditar/route.ts` does **NOT** exist yet (`find_by_name` returned only `extrair/route.ts` and `route.ts`).
4. **`app/api/auditoria-relatorio/route.ts`** (Lines 11-143):
   - Generates executive HTML or TXT reports.
   - Expects flat item properties: `item.cfopEntrada`, `item.cstIcmsEntrada`, `item.aliqIcms`, `item.permiteCredito`, `item.cstPisCofinsEntrada`, `item.aliqPis`, `item.aliqCofins`, `item.cClassTrib`, `item.aliqIbsTransitorio`, `item.aliqCbsTransitorio`, `item.regimeEspecial`, `item.instrucaoCadastro`.

### 1.2 Frontend Trigger & UI State Flow (`components/AuditoriaEntrada.tsx`)
1. **Lines 226-242**:
   ```typescript
   let res = await fetch('/api/auditoria-entrada/auditar', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload),
   });

   if (res.status === 404) {
     res = await fetch('/api/auditoria-entrada?action=auditar', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload),
     });
   }
   ```
   - `AuditoriaEntrada.tsx` is already coded to call `POST /api/auditoria-entrada/auditar` with `application/json`, falling back to `POST /api/auditoria-entrada?action=auditar`. Because neither route accepts `application/json` today, both currently fail (404 and 400 respectively).
2. **Adapter `adaptAuditResultForERP`** (Lines 35-83):
   - Maps raw `AuditedInvoiceResponse` to the flat structure expected by `ParametrizacaoERP` and report generators:
     - `ncm`: `typeof it.ncm === 'object' ? (it.ncm.auditado || it.ncm.declarado) : it.ncm`
     - `cfopEntrada`: `it.cfop?.entradaSugerido || it.cfopEntrada || '1102'`
     - `cstIcmsEntrada`: `it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00'`
     - `aliqIcms`: `it.icms?.aliqIcmsCredito || it.aliqIcms || '18%'`
     - `permiteCredito`: `it.icms?.permiteCredito ?? it.permiteCredito ?? true`
     - `cstPisCofinsEntrada`: `it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50'`
     - `cClassTrib`: `it.reforma?.cClassTrib || it.cClassTrib || '000001'`
     - `aliqIbsTransitorio`: `it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%'`
     - `aliqCbsTransitorio`: `it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%'`
     - `instrucaoCadastro`: `it.instrucaoCadastroERP || it.instrucaoCadastro || 'Instrução de parametrização fiscal'`
   - Retains original properties via spread `...it`.
3. **Progress UX State** (Lines 545-555):
   - A single static banner is displayed during `isAuditing`. There is currently no active elapsed timer, step counter, or visual queue indication.

### 1.3 Downstream Consumption in `components/ParametrizacaoERP.tsx`
1. **Lines 61-80 (`extrairPayload`)**:
   - Explicitly accesses flat fields: `it.cfopEntrada`, `it.cstIcmsEntrada`, `it.aliqIcms`, `it.cstPisCofinsEntrada`, `it.aliqPis`, `it.aliqCofins`, `it.permiteCredito`, `it.cClassTrib`, `it.aliqIbsTransitorio`, `it.aliqCbsTransitorio`, `it.regimeEspecial`, `it.instrucaoCadastro`.
2. **Lines 87-99 (`handleExportCSV`)**:
   - Iterates over headers: `['cProd', 'xProd', 'ncm', 'cest', 'cfopEntrada', 'cstIcmsEntrada', 'aliqIcms', 'cstPisCofinsEntrada', 'aliqPis', 'aliqCofins', 'permiteCredito', 'cClassTrib', 'aliqIbsTransitorio', 'aliqCbsTransitorio', 'regimeEspecial']`.
3. **Lines 304-334 (Card View)**:
   - Displays `item.cfopEntrada`, `item.cstIcmsEntrada`, `item.cClassTrib`, `item.instrucaoCadastro`.

### 1.4 E2E Test Suite Contract (`tests/e2e-auditoria-entrada.test.mjs`)
1. **Harness Execution**:
   - Command: `cd "F:\Workspace\Apps\Aplicativo_MCM-"; node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
   - Result: **54 aprovados, 0 falhas** (Tier 1: 22/22, Tier 2: 21/21, Tier 3: 6/6, Tier 4: 5/5).
2. **Strict Test Invariants Observed**:
   - `validarAuditRequestPayload`:
     - Empty selection (`itensSelecionados: []`): throws exact regex `/não pode ser vazio/` (Test T2.03).
     - Unknown motor (`motor: 'deepseek-v3'`): throws exact regex `/Motor inválido/` (Test T2.14).
     - Missing `contextoAdquirente.regime`: throws error.
   - Response structure (`AuditedInvoiceResponse`):
     - `motorUtilizado`: string
     - `tempoExecucaoMs`: number
     - `statusGlobal`: `'Regular' | 'Atenção' | 'Inconsistente'` (derived: if any item is `Inconsistente` -> `Inconsistente`; else if any is `Atenção` -> `Atenção`; else `Regular`).
     - `parecerTecnicoGeral`: string
     - `parecerConformidadeCreditos`: string
     - `totalItensAuditados`: number
     - `itens`: `AuditedItemFinding[]`
   - Item structure (`AuditedItemFinding`):
     - `index`: strictly preserves original line number from invoice (Test T3.04 asserts `res.itens[0].index === 1`, `res.itens[1].index === 15`, `res.itens[2].index === 30`).
     - `cProd`, `xProd`: string
     - `ncm`: `{ declarado, auditado, validoSiscomex, divergente, descricaoOficialSiscomex?, confianca, rgiAplicada?, fundamentacaoNcm? }`
     - `cfop`: `{ saidaFornecedor, entradaSugerido, descricaoCfop?, justificativa? }`
     - `icms`: `{ cstCsosnDeclarado, cstIcmsEntradaSugerido, permiteCredito, aliqIcmsCredito?, alertaStDifal?, fundamentoIcms? }`
     - `pisCofins`: `{ cstPisDeclarado?, cstPisCofinsEntradaSugerido, permiteCredito, enquadramento? }`
     - `reforma`: `{ cClassTrib, descricaoClassTrib?, cstIbsCbs?, aliqIbsTeste2026?, aliqCbsTeste2026?, sujeitoImpostoSeletivo?, alertaTransicao? }`
     - `instrucaoCadastroERP`: string (>10 chars, Test T4.05)
     - `statusItem`: `'Regular' | 'Atenção' | 'Inconsistente'`
   - Rule checks in tests:
     - Simples CSOSN 102 (Test T3.01): `permiteCredito === false`, `cstIcmsEntradaSugerido === '090'`, `fundamentoIcms` matches `/LC 123\/2006/`, `statusItem === 'Atenção'`.
     - Interstate ST without CEST (Test T3.02): `alertaStDifal` contains `'Convênio 142/2018'`, `statusItem === 'Inconsistente'`.
     - Interstate ST with CEST (Test T3.03): `cfop.entradaSugerido === '2102'`.
     - Supplier 5102 internal (Test T3.05): converts to `1102`.

---

## 2. Logic Chain

1. **Dual-Route API Requirement**:
   - `AuditoriaEntrada.tsx` calls `POST /api/auditoria-entrada/auditar`, with fallback to `POST /api/auditoria-entrada?action=auditar`.
   - Therefore, the application requires two working ingress routes:
     - Route A: `app/api/auditoria-entrada/auditar/route.ts` (Dedicated JSON endpoint).
     - Route B: `app/api/auditoria-entrada/route.ts` (Unified router handling both `action=extrair` and `action=auditar` plus legacy fallback).
   - In `app/api/auditoria-entrada/route.ts`, checking `contentType` must allow `application/json` when `action === 'auditar'` or when the body represents an `AuditRequestPayload`.

2. **Payload Validation Symmetry**:
   - `validarAuditRequestPayload` in `tests/e2e-auditoria-entrada.test.mjs` enforces:
     - `motor` must be `'ollama' | 'gemini'` (throws error matching `/Motor inválido/`).
     - `contextoAdquirente.regime` is required.
     - `itensSelecionados` must be an Array with `length > 0` (throws error matching `/não pode ser vazio/`).
   - The API endpoint must execute this exact validation, returning HTTP 400 with `{ error, codigo: 'PAYLOAD_INVALIDO' }`.

3. **Index Preservation and Aggregation**:
   - In selective audit (e.g. user selects item 1, 15, 30 from a 30-item invoice), each audited item must keep its original `index` (1, 15, 30), not be renumbered 1, 2, 3.
   - When aggregated into `AuditedInvoiceResponse`, `itens` must be sorted by `index` ascending.
   - `statusGlobal` must be computed deterministically:
     - If any item has `statusItem === 'Inconsistente'` -> `'Inconsistente'`.
     - Else if any item has `statusItem === 'Atenção'` -> `'Atenção'`.
     - Else -> `'Regular'`.

4. **Dual-Bridge Interoperability with `ParametrizacaoERP`**:
   - `ParametrizacaoERP.tsx` and `app/api/auditoria-relatorio/route.ts` expect flat properties (`cfopEntrada`, `cstIcmsEntrada`, `cClassTrib`, `instrucaoCadastro`).
   - The M3 E2E test suite asserts nested objects (`item.cfop.entradaSugerido`, `item.reforma.cClassTrib`, `item.instrucaoCadastroERP`).
   - Therefore, the safest architecture is a **dual-bridge**:
     a) `AuditedItemFinding` returned by the backend includes both the rich nested objects AND flat aliases (`cfopEntrada`, `cstIcmsEntrada`, `cClassTrib`, etc.).
     b) `adaptAuditResultForERP` in `AuditoriaEntrada.tsx` maps and normalizes both.
     c) `ParametrizacaoERP.tsx` uses fallback coalescing (`it.cfop?.entradaSugerido || it.cfopEntrada || '1102'`).
   - This ensures 100% compatibility: zero runtime crashes, zero lost data, and seamless export to CSV, TXT, and HTML.

5. **Enhanced Progress UX in `AuditoriaEntrada.tsx`**:
   - When processing local Ollama on the RX 580, items are partitioned item-by-item (or micro-batches of 1-2 items) with up to 35s per item. For a 5-item audit, the user waits ~50-80s.
   - Providing an active elapsed time counter (`tempoDecorridoSegundos`), dynamic status text, and clear partitioning explanations eliminates user uncertainty and prevents premature cancellations.
   - If an error occurs (such as Ollama offline), providing a 1-click fallback switch to Gemini Cloud API drastically improves user resilience.

---

## 3. Caveats

1. **Hardware / Network Independence**:
   - In environments without Ollama running locally, the route returns 503 (`OLLAMA_OFFLINE`), allowing the user to select Gemini Cloud API or start Ollama.
   - If `GEMINI_API_KEY` is not set and Gemini is selected, the route returns 503 (`GEMINI_KEY_MISSING`).
2. **React Hooks Discipline**:
   - Any updates to `components/AuditoriaEntrada.tsx` must strictly preserve hook ordering at the top of the function to satisfy `scripts/hookcheck.mjs`.
3. **No Code Modification During Explorer Turn**:
   - Per explorer rules, no production files were modified during this turn. All code proposals, type signatures, and patch strategies are detailed below in Section 4.

---

## 4. Conclusion & Implementation Strategy

### 4.1 Specification for `app/api/auditoria-entrada/auditar/route.ts`
Create a dedicated Next.js App Router route:

```typescript
// app/api/auditoria-entrada/auditar/route.ts
import { NextResponse } from 'next/server';
import type { AuditRequestPayload, AuditedInvoiceResponse } from '@/lib/extrator-nfe';
import { executarAuditoriaParticionada } from '@/lib/auditoria-particionada';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function validarAuditPayload(payload: any): payload is AuditRequestPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload nulo ou indefinido');
  }
  if (payload.motor !== 'ollama' && payload.motor !== 'gemini') {
    throw new Error(`Motor inválido: ${payload.motor}. Aceito: 'ollama' | 'gemini'`);
  }
  if (!payload.contextoAdquirente || !payload.contextoAdquirente.regime || !payload.contextoAdquirente.regime.trim()) {
    throw new Error('contextoAdquirente.regime é obrigatório');
  }
  if (!Array.isArray(payload.itensSelecionados)) {
    throw new Error('itensSelecionados deve ser um array');
  }
  if (payload.itensSelecionados.length === 0) {
    throw new Error('Validação de Auditoria: Nenhum item selecionado (itensSelecionados não pode ser vazio)');
  }
  return true;
}

export async function POST(request: Request) {
  const t0 = performance.now();
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          error: "Tipo de conteúdo inválido. A requisição deve ser enviada como 'application/json'.",
          codigo: 'CONTENT_TYPE_INVALIDO',
        },
        { status: 415 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo da requisição JSON inválido ou malformado.', codigo: 'JSON_MALFORMADO' },
        { status: 400 }
      );
    }

    try {
      validarAuditPayload(body);
    } catch (valErr: any) {
      return NextResponse.json(
        { error: valErr.message || 'Payload de auditoria inválido.', codigo: 'PAYLOAD_INVALIDO' },
        { status: 400 }
      );
    }

    const resultado: AuditedInvoiceResponse = await executarAuditoriaParticionada(body);
    resultado.tempoExecucaoMs = Math.round(performance.now() - t0);

    return NextResponse.json(resultado, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Audit-Engine': resultado.motorUtilizado,
        'X-Execution-Time-Ms': String(resultado.tempoExecucaoMs),
      },
    });
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - t0);
    console.error('Erro na rota de auditoria particionada:', err);

    const isTimeout = err.message?.includes('timeout') || err.message?.includes('Tempo limite excedido');
    const isOffline = err.message?.includes('ECONNREFUSED') || err.message?.includes('offline') || err.codigo === 'OLLAMA_OFFLINE';
    const isKeyMissing = err.codigo === 'GEMINI_KEY_MISSING';

    const statusCode = isTimeout ? 504 : (isOffline || isKeyMissing ? 503 : 500);

    return NextResponse.json(
      {
        error: err.message || 'Falha ao executar auditoria pericial.',
        codigo: err.codigo || (isTimeout ? 'TIMEOUT_AUDITORIA' : 'ERRO_AUDITORIA'),
        tempoExecucaoMs: elapsed,
      },
      { status: statusCode }
    );
  }
}
```

### 4.2 Specification for Unified Router `app/api/auditoria-entrada/route.ts`
Update `app/api/auditoria-entrada/route.ts` to cleanly handle both `application/json` (dual-routing for `action=auditar`) and `multipart/form-data`:

```typescript
// Proposed structure for app/api/auditoria-entrada/route.ts
export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryAction = url.searchParams.get('action');
  const contentType = request.headers.get('content-type') || '';

  // 1. Dual-Routing para JSON: se Content-Type for application/json
  if (contentType.includes('application/json')) {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON malformado.', codigo: 'JSON_MALFORMADO' }, { status: 400 });
    }

    const action = queryAction || body.action || (body.itensSelecionados ? 'auditar' : null);
    if (action === 'auditar') {
      try {
        validarAuditPayload(body);
        const resultado = await executarAuditoriaParticionada(body);
        return NextResponse.json(resultado, { status: 200 });
      } catch (err: any) {
        return NextResponse.json({ error: err.message, codigo: 'ERRO_AUDITORIA' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Ação não suportada para JSON. Utilize action=auditar.", codigo: 'ACAO_INVALIDA' }, { status: 400 });
  }

  // 2. Se Content-Type for multipart/form-data
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const formAction = formData.get('action') as string | null;
    const action = queryAction || formAction;

    // Despacho para extração determinística
    if (action === 'extrair') {
      // ... extrairDadosNfe logic ...
    }

    // Despacho legado monolítico ou action=auditar via FormData
    // ...
  }

  return NextResponse.json(
    { error: "Tipo de conteúdo inválido. Aceito: 'application/json' ou 'multipart/form-data'.", codigo: 'CONTENT_TYPE_INVALIDO' },
    { status: 400 }
  );
}
```

### 4.3 Specification for Result Aggregation in `lib/auditoria-particionada.ts`
Each `AuditedItemFinding` and the aggregated `AuditedInvoiceResponse` should follow this schema:

```typescript
export interface AuditedItemFinding {
  index: number;
  cProd: string;
  xProd: string;
  ncm: {
    declarado: string;
    auditado: string;
    validoSiscomex: boolean;
    divergente: boolean;
    descricaoOficialSiscomex?: string;
    confianca: 'ALTA' | 'MÉDIA' | 'BAIXA';
    rgiAplicada?: string[];
    fundamentacaoNcm?: string;
  };
  cfop: {
    saidaFornecedor: string;
    entradaSugerido: string;
    descricaoCfop?: string;
    justificativa?: string;
  };
  icms: {
    cstCsosnDeclarado: string;
    cstIcmsEntradaSugerido: string;
    permiteCredito: boolean;
    aliqIcmsCredito?: string;
    alertaStDifal?: string;
    fundamentoIcms?: string;
  };
  pisCofins: {
    cstPisDeclarado?: string;
    cstPisCofinsEntradaSugerido: string;
    permiteCredito: boolean;
    enquadramento?: string;
  };
  reforma: {
    cClassTrib: string;
    descricaoClassTrib?: string;
    cstIbsCbs?: string;
    aliqIbsTeste2026?: string;
    aliqCbsTeste2026?: string;
    sujeitoImpostoSeletivo?: boolean;
    alertaTransicao?: string;
  };
  instrucaoCadastroERP: string;
  statusItem: 'Regular' | 'Atenção' | 'Inconsistente';

  // Flat aliases for direct ERP compatibility
  cfopEntrada?: string;
  cstIcmsEntrada?: string;
  aliqIcms?: string;
  permiteCredito?: boolean;
  cstPisCofinsEntrada?: string;
  cClassTrib?: string;
  aliqIbsTransitorio?: string;
  aliqCbsTransitorio?: string;
  instrucaoCadastro?: string;
}
```

Aggregation logic function:
```typescript
export function agregarResultadosAuditoria(
  itensAuditados: AuditedItemFinding[],
  motorUtilizado: string,
  t0: number,
  parecerGeral?: string,
  parecerCreditos?: string
): AuditedInvoiceResponse {
  // Sort strictly by original item index
  itensAuditados.sort((a, b) => a.index - b.index);

  const hasInconsistente = itensAuditados.some((i) => i.statusItem === 'Inconsistente');
  const hasAtencao = itensAuditados.some((i) => i.statusItem === 'Atenção');
  const statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente' = hasInconsistente
    ? 'Inconsistente'
    : hasAtencao
    ? 'Atenção'
    : 'Regular';

  return {
    motorUtilizado,
    tempoExecucaoMs: Math.round(performance.now() - t0),
    statusGlobal,
    parecerTecnicoGeral: parecerGeral || 'Auditoria pericial de entrada concluída com sucesso.',
    parecerConformidadeCreditos: parecerCreditos || 'Avaliação de créditos efetuada conforme regime tributário do adquirente.',
    totalItensAuditados: itensAuditados.length,
    itens: itensAuditados,
  };
}
```

### 4.4 Specification for `components/AuditoriaEntrada.tsx` Enhancements
1. **Timer & Real-Time Feedback**:
   - Add state `const [auditElapsedTime, setAuditElapsedTime] = useState(0);`
   - In `handleAuditSubmit`, start an `interval` ticking every 1 second while `isAuditing` is active, and clear it in `finally`.
   - In the audit progress banner, render:
     - Count of items: `Auditando ${selectedIndices.size} item(ns) de ${extractedInvoice.itens.length}...`
     - Engine badge: `Ollama RX 580 (Particionado item a item)` ou `Google Gemini API (gemini-3.8-flash)`
     - Timer: `Tempo decorrido: ${auditElapsedTime}s`
     - Subtitle explaining: `Limite seguro de 35s por item sem sobrecarga de VRAM ou timeout de 180s.`
2. **Error Recovery**:
   - If audit fails with Ollama error, offer a 1-click button: `"Tentar via Google Gemini API"` that switches `setMotor('gemini')` and re-triggers `handleAuditSubmit()`.
3. **Index Correlation in UI**:
   - When displaying audit results cards, show `Item ${item.index}: ${item.cProd} - ${item.xProd}`, ensuring the user clearly sees which line in the invoice was audited.

### 4.5 Specification for `components/ParametrizacaoERP.tsx` Enhancements
Add fallback getters in `extrairPayload()` and in the card renderer:
- `cfop: it.cfop?.entradaSugerido || it.cfopEntrada || '1102'`
- `cstIcms: it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00'`
- `cstPis: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50'`
- `cClassTrib: it.reforma?.cClassTrib || it.cClassTrib || '000001'`
- `aliqIbsUf: it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%'`
- `aliqCbs: it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%'`
- `instrucao: it.instrucaoCadastroERP || it.instrucaoCadastro || 'Parametrização de entrada'`
This guarantees total resilience regardless of input format.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **E2E Test Suite (54 Tests)**:
   ```powershell
   cd "F:\Workspace\Apps\Aplicativo_MCM-"
   node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
   ```
   *Expected result*: 54 passed, 0 failed across Tiers 1-4.
2. **Typecheck Verification**:
   ```powershell
   cd "F:\Workspace\Apps\Aplicativo_MCM-"
   npm run typecheck
   ```
   *Expected result*: `tsc --noEmit` exits with 0 errors.
3. **Hook Order & UI Smoke**:
   ```powershell
   cd "F:\Workspace\Apps\Aplicativo_MCM-"
   node scripts/hookcheck.mjs components
   node scripts/ui-smoke.mjs
   ```
   *Expected result*: `hookcheck OK ✓` and `UI SMOKE OK ✓`.
4. **Full Test Suite**:
   ```powershell
   cd "F:\Workspace\Apps\Aplicativo_MCM-"
   npm test
   ```
   *Expected result*: All 18 test suites pass.

### 5.2 HTTP Invalidation Conditions
- An HTTP request `POST /api/auditoria-entrada/auditar` with `{ itensSelecionados: [] }` MUST return HTTP 400 with message containing `/não pode ser vazio/`.
- An HTTP request `POST /api/auditoria-entrada/auditar` with `{ motor: 'unsupported' }` MUST return HTTP 400 with message containing `/Motor inválido/`.
- An HTTP request `POST /api/auditoria-entrada?action=auditar` with a valid JSON payload MUST return HTTP 200 with `AuditedInvoiceResponse`.
- An HTTP request `POST /api/auditoria-entrada?action=extrair` with a valid XML file MUST return HTTP 200 with `ExtractedInvoiceData`.
- Audited items MUST retain the original item `index` without re-indexing.
- `ParametrizacaoERP` must export CSV and render HTML/TXT reports without `undefined` fields.
