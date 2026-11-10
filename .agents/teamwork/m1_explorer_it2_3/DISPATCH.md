# Task Assignment: M1 Explorer IT2-3 - Harmonize Contracts (regimeDescricao & IPI Sensitivity)

## Target
Investigate contract reconciliation for:
1. `regimeDescricao` in `lib/extrator-nfe.ts`.
2. IPI sensitivity evaluation in `avaliarSensibilidadeFiscal` and E2E test T1.20.

## Context of Previous Iteration Failure
Reviewers noted:
- `lib/extrator-nfe.ts:190` returns `'Regime Normal (Lucro Presumido / Real)'` while E2E test T1.12 expects `'Regime Normal'`.
- `lib/extrator-nfe.ts:288` flags all items with IPI as sensitive (`IPI_DESTACADO`), causing E2E test T1.20 (which tests a standard clean item with 10% IPI) to fail when connected to `lib/extrator-nfe.ts`.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3
- Reviewer 1 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1\handoff.md
- Reviewer 2 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2\handoff.md

## Scope & Instructions
1. Inspect `lib/extrator-nfe.ts` line 190 and lines 288-290.
2. Determine how `getRegimeDescricao` should return `'Regime Normal'` for CRT 3.
3. Determine the correct heuristic for `IPI_DESTACADO`: standard regular items with standard IPI shouldn't trigger sensitivity unless there is a specific risk (e.g. buyer is Simples Nacional or non-industrial where IPI credit is prohibited, or refine so T1.20 passes as clean regular item).
4. Propose exact line edits for the worker.
5. Write your report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\handoff.md`.
6. Send completion message back.


## 2026-11-09T15:20:23Z
You are m1_explorer_it2_3, a teamwork_explorer.
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3.
Your task is defined in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\DISPATCH.md.
MANDATORY: Read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md first before doing anything else.
Do NOT modify any production or test code. You are read-only.
Investigate:
1. Harmonization of regimeDescricao in lib/extrator-nfe.ts:190 to return 'Regime Normal' for CRT 3.
2. Harmonization of IPI sensitivity in avaliarSensibilidadeFiscal (lib/extrator-nfe.ts:288-290) and E2E test T1.20 so that clean, regular items do not get marked sensitive falsely.
Propose exact, line-level recommendations.
Write your findings to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\handoff.md and notify me via send_message.


## 2026-11-09T15:21:54Z
[Message] timestamp=2026-11-09T15:21:54Z sender=5db90b78-2923-4eca-9d94-d6c126a7f3be priority=MESSAGE_PRIORITY_HIGH content=**Context**: Milestone 1 Remediation (Iteration 2)
**Content**: m1_challenger_2 has just delivered its handoff report at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2\handoff.md`. In addition to the contracts harmonization (regimeDescricao and IPI sensitivity), m1_challenger_2 identified 3 critical PDF/parsing fixes needed in `lib/extrator-nfe.ts`:
1. `parseNumber` / `parseOptionalNumber` Brazilian currency thousands-dot truncation.
2. Unhandled `TypeError` in `chaveAcesso` fallback regex (use `(chaveMatch[1] || chaveMatch[0])`).
3. Emission date regex missing preposition "DE" (`DATA (?:DA|DE\s+)?EMISSÃO`).
**Action**: Please inspect `m1_challenger_2/handoff.md` and include concrete line recommendations for these 3 fixes in your report as well.
