# Task Assignment: M1 Explorer IT2-2 - XML Attribute Collision & Legacy Route Slice Fix

## Target
Investigate fixes for:
1. XML attribute collision in `extrairTributosXml` in `lib/extrator-nfe.ts`.
2. Residual 15-item slice in `app/api/auditoria-entrada/route.ts:191`.

## Context of Previous Iteration Failure
Reviewers reported:
- In `lib/extrator-nfe.ts:321, 354, 367`, `Object.keys(imp.ICMS)[0]` grabs `@_` attribute keys if attributes exist on `<ICMS>`, silently dropping ICMS/PIS/COFINS data.
- In `app/api/auditoria-entrada/route.ts:191`, `itens.slice(0, 15)` remains in the legacy un-actioned branch.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2
- Reviewer 1 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1\handoff.md
- Reviewer 2 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2\handoff.md

## Scope & Instructions
1. Inspect `lib/extrator-nfe.ts` lines 315-394 and `app/api/auditoria-entrada/route.ts` line 191.
2. Propose exact line edits to filter out `@_` keys: `const subKey = Object.keys(imp.ICMS).find(k => !k.startsWith('@_'))`.
3. Propose exact line edits to remove `.slice(0, 15)` from `route.ts`.
4. Recommend the exact fix plan for the worker.
5. Write your report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\handoff.md`.
6. Send completion message back.


## 2026-11-09T15:20:06Z
Received dispatch message:
You are m1_explorer_it2_2, a teamwork_explorer.
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2.
Your task is defined in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\DISPATCH.md.
MANDATORY: Read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md first before doing anything else.
Do NOT modify any production or test code. You are read-only.
Investigate:
1. XML attribute collision in lib/extrator-nfe.ts (lines 321, 354, 367) where Object.keys grabs @_ attribute keys.
2. Legacy 15-item slice in app/api/auditoria-entrada/route.ts:191.
Propose exact, line-level solutions for the worker.
Write your findings to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\handoff.md and notify me via send_message.
