# Task Assignment: M3 Implementation Worker

**Role**: `teamwork_worker`  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_worker_1`  
**Milestone**: Milestone 3 — Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API)  
**Original Request**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md` (You MUST read this before starting work).  
**Exclusive Write Ownership**:
- `lib/auditoria-particionada.ts`
- `app/api/auditoria-entrada/auditar/route.ts`
- `app/api/auditoria-entrada/route.ts`
- `components/AuditoriaEntrada.tsx`
- `components/ParametrizacaoERP.tsx`
- `tests/auditoria-particionada.test.mjs`

---

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

---

## Architecture & Implementation Blueprint
Based on the synthesized research of Explorers 1, 2, and 3:

### 1. `lib/auditoria-particionada.ts`
Implement the complete partitioned audit engine:
- Types & interfaces: `AuditedItemFinding`, `AuditedInvoiceResponse`, `AuditRequestPayload`.
- Dual bridge: each `AuditedItemFinding` MUST include nested structures (`ncm`, `cfop`, `icms`, `pisCofins`, `reforma`, `instrucaoCadastroERP`) AND flat aliases (`cfopEntrada`, `cstIcmsEntrada`, `aliqIcms`, `permiteCredito`, `cstPisCofinsEntrada`, `cClassTrib`, `aliqIbsTransitorio`, `aliqCbsTransitorio`, `instrucaoCadastro`).
- Context stripping: function `stripFiscalItemContext` stripping all non-tax tags (`<transp>`, `<cobr>`, `<pag>`, `<infAdic>`), keeping only sensitive tax fields (R4).
- Local Ollama Engine (GPU RX 580):
  - Item-by-item partitioning (`batchSize = 1`) processed sequentially.
  - Per-item timeout: 35,000 ms (35s).
  - Context size: `num_ctx: 4096`.
  - Primary model: `qwen2.5:7b` (fallback to `qwen3.5:4b` with prompt constraint).
  - Siscomex grounding: inject official description into prompt and validate post-inference with `getMapaD8()`.
- Google Gemini Cloud Engine:
  - SDK: `@google/genai` (^2.22.0) with `GoogleGenAI` and model `gemini-3.8-flash`.
  - JSON Schema: `responseSchema` with `Type.OBJECT` and `Type.ARRAY`.
  - Siscomex post-validation with `getMapaD8()`.
  - Handle `GEMINI_API_KEY` detection, actionable error message, and check `AI_SOVEREIGNTY_MODE !== 'local_strict'`.
- Master Dispatcher: `executarAuditoriaParticionada(payload: AuditRequestPayload): Promise<AuditedInvoiceResponse>` routing to Ollama or Gemini.

### 2. `app/api/auditoria-entrada/auditar/route.ts`
Create the dedicated endpoint:
- Validates payload: `motor` must be `'ollama' | 'gemini'`, `contextoAdquirente.regime` required, `itensSelecionados` non-empty array (throws 400 with `codigo: 'PAYLOAD_INVALIDO'`).
- Calls `executarAuditoriaParticionada`.
- Measures execution time and returns `AuditedInvoiceResponse` (HTTP 200).

### 3. `app/api/auditoria-entrada/route.ts`
Update unified router:
- Allow `application/json` when `action === 'auditar'` or when payload contains `itensSelecionados` (calling `executarAuditoriaParticionada`).
- Preserve existing `multipart/form-data` handling for extraction and legacy calls.

### 4. `components/AuditoriaEntrada.tsx` & `ParametrizacaoERP.tsx`
- Ensure `AuditoriaEntrada.tsx` calls `POST /api/auditoria-entrada/auditar` with fallback to `POST /api/auditoria-entrada?action=auditar`.
- Add active elapsed timer (`auditElapsedTime`) during audit.
- In `ParametrizacaoERP.tsx`, ensure safe fallback access for both flat and nested item fields.

### 5. `tests/auditoria-particionada.test.mjs`
Author comprehensive unit and integration tests covering:
- Context stripping (verifying non-tax tags removed).
- Payload validation guards (empty items, invalid motor, empty regime).
- Sequential partitioning and aggregation.
- Dual-bridge structure (nested + flat aliases).
- Siscomex grounding and Simples Nacional / ST rules.

### 6. Verification Commands to Execute
- `npm run typecheck` (MUST BE 0 ERRORS)
- `node scripts/hookcheck.mjs components` (MUST BE 0 VIOLATIONS)
- `node scripts/test.mjs tests/auditoria-particionada.test.mjs` (ALL PASS)
- `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs` (20/20 PASS)
- `node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs` (16/16 PASS)
- `node scripts/test.mjs tests/m2-challenger-stress.test.mjs` (23/23 PASS)
- `node scripts/test.mjs tests/m2-ssr-stress.tsx` (13/13 PASS)
- `node scripts/ui-smoke.mjs` (PASS)
- `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs` (54/54 PASS)

## Output Requirements
Document all actions, command outputs, and results in `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_worker_1\handoff.md`.
Then notify orchestrator via `send_message`.

## 2026-11-09T20:04:27Z
You are m3_worker_1 (teamwork_worker).
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_worker_1.
You MUST read:
1. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
2. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\orchestrator_gen2\SCOPE_M3.md
3. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_worker_1\DISPATCH.md
4. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_1\handoff.md
5. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_2\handoff.md
6. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_3\handoff.md

Follow all instructions in DISPATCH.md precisely.
MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You have exclusive write ownership over:
- lib/auditoria-particionada.ts
- app/api/auditoria-entrada/auditar/route.ts
- app/api/auditoria-entrada/route.ts
- components/AuditoriaEntrada.tsx
- components/ParametrizacaoERP.tsx
- tests/auditoria-particionada.test.mjs

Execute the full implementation and verification:
1. Implement lib/auditoria-particionada.ts (Ollama RX 580 item-by-item partitioning + Gemini gemini-3.8-flash + context stripping + Siscomex grounding).
2. Implement app/api/auditoria-entrada/auditar/route.ts.
3. Update app/api/auditoria-entrada/route.ts for application/json action=auditar.
4. Update components/AuditoriaEntrada.tsx & ParametrizacaoERP.tsx for seamless dual-bridge data consumption and active progress timer.
5. Create tests/auditoria-particionada.test.mjs.
6. Run all verification commands:
   - npm run typecheck
   - node scripts/hookcheck.mjs components
   - node scripts/test.mjs tests/auditoria-particionada.test.mjs
   - node scripts/test.mjs tests/tabela-itens-extracao.test.mjs
   - node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs
   - node scripts/test.mjs tests/m2-challenger-stress.test.mjs
   - node scripts/test.mjs tests/m2-ssr-stress.tsx
   - node scripts/ui-smoke.mjs
   - node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
7. Document all actions, command outputs, and results in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_worker_1\handoff.md.
8. When done, send a message to the orchestrator.

