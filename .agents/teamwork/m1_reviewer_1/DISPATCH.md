# Task Assignment: M1 Reviewer 1 - Code Review & Conformance Verification

## Target
Review the implementation of Milestone 1:
- `lib/extrator-nfe.ts`
- `app/api/auditoria-entrada/extrair/route.ts`
- `app/api/auditoria-entrada/route.ts`
- `tests/extrator-nfe.test.mjs`

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Test Readiness: F:\Workspace\Apps\Aplicativo_MCM-\TEST_READY.md
- M1 Worker Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1\handoff.md

## Scope & Instructions
1. Independently review code for:
   - Correctness and adherence to `ORIGINAL_REQUEST.md` (R1 deterministic extraction, zero truncation, sensitive tax codes).
   - Robustness and error handling (10MB payload limit, invalid files, empty buffers, PDF parsing resilience).
   - Interface conformance with `PROJECT.md` (`ExtractedInvoiceData` schema, HTTP response headers, dual-routing support).
2. Execute the verification commands:
   - `npm test`
   - `npm run typecheck`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
3. Formulate your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Write your review report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1\handoff.md`.
5. Send completion message back with verdict and summary.


## 2026-11-09T15:05:19Z
You are m1_reviewer_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1\DISPATCH.md verbatim before starting.
Review Milestone 1 implementation (lib/extrator-nfe.ts, app/api/auditoria-entrada/extrair/route.ts, app/api/auditoria-entrada/route.ts). Run builds and tests (npm test, npm run typecheck, e2e tests). Formulate an explicit verdict: APPROVE or REQUEST_CHANGES.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_1\handoff.md and notify your parent via send_message.
