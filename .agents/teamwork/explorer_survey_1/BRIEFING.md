# BRIEFING — 2026-11-09T14:32:00Z

## Mission
Survey the existing NF-e processing codebase in F:\Workspace\Apps\Aplicativo_MCM- for deterministic parsing (XML/PDF), current tables/UI, and data models for R1 and R2.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, survey
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: survey_codebase

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Restrict investigation to F:\Workspace\Apps\Aplicativo_MCM-
- Investigate deterministic parsing (XML/PDF), UI tables, data models for R1 and R2
- Produce 5-component handoff report at handoff.md

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `package.json`, `AGENTS.md`, `README.md`
  - `app/api/auditoria-entrada/route.ts`, `app/api/auditoria-pdf/route.ts`, `app/api/auditoria-relatorio/route.ts`, `app/api/classificar-ia/route.ts`
  - `components/AuditoriaEntrada.tsx`, `components/ParametrizacaoERP.tsx`
  - `lib/extrator-multifonte.ts`, `lib/xml.ts`, `lib/data.ts`, `lib/fiscal-context.ts`, `lib/ollama-client.ts`, `lib/relatorio-erp.ts`, `lib/ai/`
  - `docs/analise_e_proposta_aprimoramento.md`
  - `tests/auditoria.test.mjs`, `tests/xml.test.mjs`, `tests/extrator-multifonte.test.mjs`, `tests/ollama-client.test.mjs`, `scripts/test.mjs`, `scripts/ui-entry.tsx`
- **Key findings**:
  - Next.js 16.3.4 (App Router) + React 19 + TypeScript 5.7 with custom test runners (`scripts/test.mjs`, `scripts/ui-smoke.mjs`).
  - No 2-step architecture: upload in `AuditoriaEntrada.tsx` immediately invokes monolithic LLM in `app/api/auditoria-entrada/route.ts`.
  - XML parsing in `route.ts` has a hardcoded cap `itens.slice(0, 15)`.
  - PDF parsing in `route.ts` has no tabular item parsing; dumps raw text into LLM prompt.
  - Zero UI item selectors (no checkboxes, select all, deselect all).
  - No engine switch (Ollama vs Gemini) in UI.
  - Monolithic prompt to Ollama on RX 580 hits 180s timeout; needs chunking / item-by-item partitioning.
- **Unexplored areas**: None, codebase fully surveyed for R1 & R2 scope.

## Key Decisions Made
- Mapped entire repository architecture, libraries, UI components, tests, and data models.
- Synthesized complete gap analysis for R1 (deterministic extraction) and R2 (selective audit).
- Formulated recommended 2-step architecture for implementation agents.

## Artifact Index
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md — Original user request & acceptance criteria
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\DISPATCH.md — Task assignment
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\BRIEFING.md — Situational awareness
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\progress.md — Progress log / liveness heartbeat
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\handoff.md — Final investigation handoff report
