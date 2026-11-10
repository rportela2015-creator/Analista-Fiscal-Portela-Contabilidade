# Task Assignment: M1 Explorer IT2-1 - Connect E2E Test Suite to Production Code

## Target
Investigate how to directly connect `tests/e2e-auditoria-entrada.test.mjs` to `lib/extrator-nfe.ts`.

## Context of Previous Iteration Failure
In Iteration 1, Reviewer 1 and Reviewer 2 rejected with REQUEST_CHANGES because `tests/e2e-auditoria-entrada.test.mjs` was testing a private oracle function `parseNFeXmlDeterministic` inside the test file instead of importing and invoking `extrairDadosXmlNfe` from `lib/extrator-nfe.ts`.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Reviewer 1 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1\handoff.md
- Reviewer 2 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2\handoff.md

## Scope & Instructions
1. Inspect `tests/e2e-auditoria-entrada.test.mjs` and `lib/extrator-nfe.ts`.
2. Propose exact line edits to import `extrairDadosXmlNfe` from `../lib/extrator-nfe.ts`.
3. Verify that `data = extrairDadosXmlNfe(xml, mapaD8)` or `extrairDadosNfe(Buffer.from(xml), 'nota.xml')` matches all assertions in Tiers 1-4.
4. Recommend the exact fix plan for the worker.
5. Write your report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\handoff.md`.
6. Send completion message back.


## 2026-11-09T15:19:58Z
You are m1_explorer_it2_1, a teamwork_explorer.
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1.
Your task is defined in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\DISPATCH.md.
MANDATORY: Read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md first before doing anything else.
Do NOT modify any production or test code. You are read-only.
Investigate how to directly connect tests/e2e-auditoria-entrada.test.mjs to lib/extrator-nfe.ts, replacing the internal mock oracle parseNFeXmlDeterministic with extrairDadosXmlNfe.
Analyze the impact on Tiers 1-4 and produce concrete line-level recommendations.
Write your findings to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\handoff.md and notify me via send_message.
