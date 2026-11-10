# Task Assignment: M1 Forensic Auditor - Forensic Integrity Audit

## Target
Execute an independent forensic integrity audit of Milestone 1:
- `lib/extrator-nfe.ts`
- `app/api/auditoria-entrada/extrair/route.ts`
- `app/api/auditoria-entrada/route.ts`
- `tests/extrator-nfe.test.mjs`

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_auditor_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Test Readiness: F:\Workspace\Apps\Aplicativo_MCM-\TEST_READY.md

## Scope & Instructions
1. Run forensic integrity checks:
   - Check for hardcoded test results, expected outputs, or bypass flags.
   - Check for dummy / facade implementations.
   - Check for fabricated logs or circumvention of actual XML/PDF parsing.
   - Verify authentic Siscomex validation against `getMapaD8()` (10.515 records) and authentic sensitivity calculation.
2. Execute the verification commands:
   - `npm test`
   - `npm run typecheck`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
3. Formulate your explicit verdict: `CLEAN` or `INTEGRITY VIOLATION`.
4. Write your forensic audit report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_auditor_1\handoff.md`.
5. Send completion message back with verdict and evidence.


## 2026-11-09T15:05:47Z
You are m1_auditor_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_auditor_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_auditor_1\DISPATCH.md verbatim before starting.
Perform an independent forensic integrity audit of Milestone 1. Check for hardcoding, facades, dummy logic, bypasses, or integrity violations.
Run verification commands: npm test, npm run typecheck, and E2E test.
Formulate an explicit verdict: CLEAN or INTEGRITY VIOLATION.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_auditor_1\handoff.md and notify your parent via send_message.
