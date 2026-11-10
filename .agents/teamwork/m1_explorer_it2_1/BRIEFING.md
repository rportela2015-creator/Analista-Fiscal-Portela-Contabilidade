# BRIEFING — 2026-11-09T15:30:00Z

## Mission
Investigate how to directly connect `tests/e2e-auditoria-entrada.test.mjs` to production `lib/extrator-nfe.ts` replacing `parseNFeXmlDeterministic` with `extrairDadosXmlNfe`, analyzing impacts across Tiers 1-4 and preparing concrete line-level recommendations for the worker.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: M1

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify any production or test code. You are read-only.
- Connect `tests/e2e-auditoria-entrada.test.mjs` to `lib/extrator-nfe.ts`, replacing internal mock oracle `parseNFeXmlDeterministic` with `extrairDadosXmlNfe`.
- Analyze impact on Tiers 1-4 and produce concrete line-level recommendations.

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T15:19:58Z

## Investigation State
- **Explored paths**:
  - `tests/e2e-auditoria-entrada.test.mjs`
  - `lib/extrator-nfe.ts`
  - `tests/extrator-nfe.test.mjs`
  - `app/api/auditoria-entrada/route.ts`
  - `app/api/auditoria-entrada/extrair/route.ts`
  - `scripts/test.mjs`
  - All 11 fixtures in `tests/fixtures/`
  - Reviewer 1 handoff (`m1_reviewer_1/handoff.md`)
  - Reviewer 2 handoff (`m1_reviewer_2/handoff.md`)
- **Key findings**:
  1. Complete breakdown of all 54 tests across Tiers 1-4 when connecting `extrairDadosXmlNfe`.
  2. Identified 4 concrete test/contract breaking points:
     - T1.12: `regimeDescricao` mismatch (`'Regime Normal'` vs `'Regime Normal (Lucro Presumido / Real)'`).
     - T1.20: `sensivelParaAuditoria` false positive due to `IPI_DESTACADO` trigger on `fixtureSingle` (Dell standard internal sale).
     - T2.04: `ncm` representation difference (`ncm` is `'01012100'` while declared is `'1012100'` in `ncmOriginal`).
     - T2.13: Error message regex mismatch (`/vazio ou inválido/` vs `'Conteúdo XML vazio ou não fornecido.'`).
  3. Identified 3 production code improvements needed for full robustness:
     - XML attribute prefix collision (`@_`) in `extrairTributosXml` (ICMS, PIS, COFINS).
     - Expanded Simples Nacional CST inconsistency check (`['00', '10', '20', '40', '50', '60', '70', '90']`).
     - Removal of legacy `itens.slice(0, 15)` in `app/api/auditoria-entrada/route.ts:191`.
- **Unexplored areas**: None. Full scope of M1 connection has been mapped and verified.

## Key Decisions Made
- Recommend removing the 160-line private oracle `parseNFeXmlDeterministic` from `tests/e2e-auditoria-entrada.test.mjs` and directly invoking `extrairDadosXmlNfe`.
- Provide exact line-by-line patch specifications for both `tests/e2e-auditoria-entrada.test.mjs`, `lib/extrator-nfe.ts`, `tests/extrator-nfe.test.mjs`, and `app/api/auditoria-entrada/route.ts`.

## Artifact Index
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\BRIEFING.md` — Situational awareness
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\progress.md` — Liveness heartbeat
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\handoff.md` — Final handoff report
