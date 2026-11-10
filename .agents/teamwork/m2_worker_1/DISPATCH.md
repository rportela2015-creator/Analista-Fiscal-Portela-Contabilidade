# Task Assignment: M2 Implementation Worker

**Role**: `teamwork_worker`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_1`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Implement the Milestone 2 deliverables:
1. `components/TabelaItensExtracao.tsx`:
   - Interactive table presenting all extracted items from `ExtractedInvoiceData`.
   - Columns: Checkbox, Item #, Product code & EAN, Description, NCM (with Siscomex validation badge), CFOP, CST/CSOSN, Qty & Unit, Unit Price, Total Price, Tax Badges (ICMS, ST, IPI, PIS, COFINS, RTC), Sensitivity Badge, and Expand Details toggle.
   - Master checkbox with tri-state indeterminate support.
   - Bulk action buttons: "Selecionar Todos", "Desmarcar Todos", "Selecionar Apenas Sensíveis" (`sensivelParaAuditoria === true`).
   - Dynamic counter: e.g. "X de Y itens selecionados para auditoria (Z sensíveis)".
   - Pure CSS conforming to `app/globals.css` (NO Tailwind, NO Lucide icons).
   - Strict hook compliance (`scripts/hookcheck.mjs`).
2. `components/AuditoriaEntrada.tsx`:
   - Two-stage flow:
     - Stage 1 (Deterministic extraction): Upload XML/PDF calls `POST /api/auditoria-entrada/extrair` (or `action=extrair`).
     - State transition to `EXTRACTED`: Displays invoice metadata, `<TabelaItensExtracao />`, and the Dual Engine Selector.
     - Dual Engine Selector: Radio/Card selection between `Ollama Local (GPU RX 580)` and `Google Gemini API`.
     - Stage 2 trigger: Button "Auditar Itens Selecionados" (with disabled state if 0 items selected). Calls `POST /api/auditoria-entrada/auditar` (or `action=auditar`) with `AuditRequestPayload`.
     - Displays audit results seamlessly with `<ParametrizacaoERP />`.
     - Retains `/Auditar Documento/i` text to satisfy `scripts/ui-entry.tsx` and `scripts/ui-smoke.mjs`.
3. `tests/tabela-itens-extracao.test.mjs`:
   - Automated unit and integration test suite verifying table rendering, item selection, bulk actions ("Todos", "Nenhum", "Apenas Sensíveis"), engine toggling, and `AuditRequestPayload` assembly.

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1\handoff.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2\handoff.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2\proposed_TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\handoff.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
- `F:\Workspace\Apps\Aplicativo_MCM-\scripts\hookcheck.mjs`
- `F:\Workspace\Apps\Aplicativo_MCM-\scripts\ui-smoke.mjs`

## Verification Requirements
Worker must run and document passing results for:
1. `npm run typecheck` (tsc --noEmit -> 0 errors)
2. `node scripts/hookcheck.mjs components` (0 violations)
3. `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs` (All tests passing)
4. `node scripts/ui-smoke.mjs` (UI smoke test passing)
5. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs` (E2E suite remains passing)

## 2026-11-09T16:53:45Z
Você é o Agente m2_worker_1 (teamwork_worker).
Seu objetivo é implementar os entregáveis do Milestone 2:
1. `components/TabelaItensExtracao.tsx`
2. `components/AuditoriaEntrada.tsx`
3. `tests/tabela-itens-extracao.test.mjs`

## 2026-11-09T17:04:31Z
Olá m2_worker_1, verificando o andamento da implementação de `components/TabelaItensExtracao.tsx`, `components/AuditoriaEntrada.tsx`, `tests/tabela-itens-extracao.test.mjs` e execução dos testes de verificação. Como está o status atual e quanto falta para concluir?
