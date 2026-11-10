# Task Assignment: M1 Challenger 1 - Adversarial Stress & Extraction Verification

## Target
Empirically challenge the correctness and performance of Milestone 1 deterministic extraction:
- `lib/extrator-nfe.ts`
- `app/api/auditoria-entrada/extrair/route.ts`
- `app/api/auditoria-entrada/route.ts`

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Test Readiness: F:\Workspace\Apps\Aplicativo_MCM-\TEST_READY.md

## Scope & Instructions
1. Write adversarial test cases and benchmarks:
   - High item volume stress test (e.g. 100 items XML) to prove zero truncation and latency < 200ms.
   - Malformed XML / empty buffers / oversized payloads (>10MB) to verify HTTP 400 and 413 responses.
   - Corrupted NCMs (scientific notation, strings with spaces, 6-digit or 9-digit codes).
2. Execute the verification commands:
   - `npm test`
   - `npm run typecheck`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
3. Formulate your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Write your challenger report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_1\handoff.md`.
5. Send completion message back with verdict and evidence.


## 2026-11-09T15:05:33Z
You are m1_challenger_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_1\DISPATCH.md verbatim before starting.
Empirically stress-test Milestone 1 (volume stress, 100 items XML, malformed payloads, 10MB limit). Run builds and tests. Formulate an explicit verdict: APPROVE or REQUEST_CHANGES.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_1\handoff.md and notify your parent via send_message.
