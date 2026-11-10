# Task Assignment: M1 Reviewer 2 - Fiscal Domain & Error Resilience Review

## Target
Review Milestone 1 focusing on fiscal domain accuracy, Siscomex validation, sensitivity rules, and edge cases.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Test Readiness: F:\Workspace\Apps\Aplicativo_MCM-\TEST_READY.md
- M1 Worker Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1\handoff.md
- Relevant Skill reference: C:\Users\admin\.gemini\config\skills\ncm-fiscal-auditor\SKILL.md

## Scope & Instructions
1. Independently review the fiscal logic:
   - Siscomex NCM normalization (7-digit leading zeros, scientific notation rejection, O(1) Map lookup).
   - Sensitivity criteria (ST presence, interstate without CEST, Simples Nacional CSOSN 102 credit restriction, IPI, PIS/COFINS).
   - RTC (IBS/CBS) group extraction readiness.
2. Execute the verification commands:
   - `npm test`
   - `npm run typecheck`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
3. Formulate your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Write your review report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2\handoff.md`.
5. Send completion message back with verdict and summary.


## 2026-11-09T15:05:26Z
You are m1_reviewer_2. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2\DISPATCH.md verbatim before starting.
Review Milestone 1 focusing on fiscal domain accuracy, Siscomex validation, sensitivity rules, and edge cases. Run builds and tests (npm test, npm run typecheck, e2e tests). Formulate an explicit verdict: APPROVE or REQUEST_CHANGES.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2\handoff.md and notify your parent via send_message.
