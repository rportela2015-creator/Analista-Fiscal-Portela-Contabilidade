# Task Assignment: M1 Explorer 2 - API Route & Decoupling Strategy

## Target
Investigate the decoupling of the API endpoints for Milestone 1:
Creating the instant deterministic extraction endpoint (`POST /api/auditoria-entrada/extrair` or action handler) that responds in < 200ms with zero LLM invocation.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Spec Miner Report: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\handoff.md
- Explorer 1 Survey: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\handoff.md

## Scope & Instructions
1. Inspect `app/api/auditoria-entrada/route.ts`. Determine how to support either:
   - Dedicated route `app/api/auditoria-entrada/extrair/route.ts` AND/OR
   - Action-based routing on `app/api/auditoria-entrada/route.ts` (e.g. `?action=extrair` or JSON `{ action: 'extrair' }`)
   Ensure backward compatibility with existing tests and clients!
2. Validate payload size handling (e.g. large XML/PDF up to 10MB).
3. Validate error response formats (e.g. HTTP 400 for invalid XML/PDF, clear error messages).
4. Specify the exact contract for `ExtractedInvoiceData` return payload.
5. Write report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2\handoff.md`.
6. Send completion message back.


## 2026-11-09T14:38:16Z
Parent invocation:
You are m1_explorer_2. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2\DISPATCH.md verbatim before starting.
Investigate the API route decoupling and endpoint design (POST /api/auditoria-entrada/extrair and backward compatibility) for instant deterministic response (<200ms).
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2\handoff.md and notify your parent via send_message.
