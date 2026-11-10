# BRIEFING — 2026-11-09T15:25:00Z

## Mission
Investigate harmonization of regimeDescricao (CRT 3 -> 'Regime Normal') in lib/extrator-nfe.ts:190, IPI sensitivity in avaliarSensibilidadeFiscal (lib/extrator-nfe.ts:288-290) vs E2E test T1.20, and 3 critical PDF/parsing fixes from m1_challenger_2 to provide exact line-level recommendations.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: M1 Iteration 2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify any production or test code
- Propose exact, line-level recommendations
- Follow Handoff Protocol (5-Component Handoff Report in handoff.md)
- Communicate with parent via send_message

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T15:21:54Z

## Investigation State
- **Explored paths**:
  - `lib/extrator-nfe.ts` (lines 129, 168-182, 184-191, 243-309, 315-375, 415-580, 648-660)
  - `tests/e2e-auditoria-entrada.test.mjs` (lines 10-70, 77, 100-208, 440-495, 550-650, 750-775)
  - `tests/extrator-nfe.test.mjs` (lines 80-165, 250-275)
  - `tests/fixtures/nfe-single-item.xml`
  - `tests/fixtures/nfe-malformed-ncm.xml`
  - `tests/m1-challenger-stress.test.mjs` (lines 87-210, 310-332)
  - Reviewer handoffs: `m1_reviewer_1/handoff.md`, `m1_reviewer_2/handoff.md`, `m1_challenger_2/handoff.md`
- **Key findings**:
  1. `getRegimeDescricao` in `lib/extrator-nfe.ts:188` returns `'Regime Normal (Lucro Presumido / Real)'`; must return `'Regime Normal'` to match T1.12 (`tests/e2e-auditoria-entrada.test.mjs:445`) and SEFAZ MOC. Synchronize `tests/extrator-nfe.test.mjs:260`.
  2. `avaliarSensibilidadeFiscal` in `lib/extrator-nfe.ts:288-290` unconditionally flags standard IPI (`vIPI > 0` or `cstIpi === '50'`), breaking T1.20 (`sensivelParaAuditoria: false`). Must refine IPI sensitivity to actual fiscal risk (prohibited credit for buyer Simples/Consumo, supplier Simples violation, CST mismatch).
  3. `parseNumber` / `parseOptionalNumber` in `lib/extrator-nfe.ts:168-182` corrupts Brazilian currency strings with thousands dots (`"9.000,00"` -> `9`). Must strip dots when comma is present.
  4. Line 651 executes `.replace()` on `chaveMatch[1]`, which is `undefined` on fallback regexes without capture groups, causing `TypeError`. Must add capture groups and guard `(chaveMatch[1] || chaveMatch[0])`.
  5. Line 656 regex omits `"DE"` preposition in `"DATA DE EMISSÃO"`. Must include `(?:DA|DE)`.
  6. Line 321, 354, 366 in `extrairTributosXml` vulnerably picks `Object.keys()[0]` which can be `@_xmlns`. Must filter `!k.startsWith('@_')`.
  7. `tests/e2e-auditoria-entrada.test.mjs` must connect `parseNFeXmlDeterministic` to `extrairDadosXmlNfe`.
- **Unexplored areas**: None. Complete investigation conducted across all required targets.

## Key Decisions Made
- Formulate exact, production-ready replacement code chunks with line references for all 7 issues.
- Document full evidence chain from reviewer findings, test fixtures, and production code.

## Artifact Index
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\BRIEFING.md` — Situational awareness
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\DISPATCH.md` — Task assignment and message log
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\progress.md` — Heartbeat and progress tracking
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\handoff.md` — 5-Component Handoff Report
