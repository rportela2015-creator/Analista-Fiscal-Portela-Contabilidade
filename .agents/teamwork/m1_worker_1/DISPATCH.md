# Task Assignment: M1 Worker - Deterministic Extraction Engine & Endpoints

## Target
Implement Milestone 1:
1. `lib/extrator-nfe.ts`: Complete deterministic NF-e extraction engine (XML & PDF) with zero truncation, complete tax fields, Siscomex validation, and sensitivity scoring.
2. `app/api/auditoria-entrada/extrair/route.ts`: Dedicated RESTful extraction endpoint responding in < 200ms with 10MB limit and error handling.
3. `app/api/auditoria-entrada/route.ts`: Dual-routing action dispatcher for backward compatibility.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- M1 Explorer 1 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_1\handoff.md (Contains validated `proposed_extrator-nfe.ts`)
- M1 Explorer 2 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2\handoff.md (Contains endpoint design and error matrix)
- M1 Explorer 3 Handoff: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3\handoff.md (Contains Siscomex O(1) map and sensitivity rules)

## Write Ownership
You exclusively own:
- `lib/extrator-nfe.ts`
- `app/api/auditoria-entrada/extrair/route.ts`
- `app/api/auditoria-entrada/route.ts`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Instructions
1. Read `ORIGINAL_REQUEST.md` and all Explorer handoffs.
2. Implement `lib/extrator-nfe.ts` with all types (`ExtractedInvoiceData`, `ExtractedItem`, `ExtractedTributosResumo`) and functions (`extrairDadosNfe`, `extrairDadosXmlNfe`, `extrairDadosPdfDanfe`, `avaliarSensibilidadeFiscal`, `normalizarNcm`, `validarNcmSiscomex`).
   Ensure `pdf-parse: ^2.4.5` is handled with the class adapter `new PDFParse({ data: buffer })` as documented by m1_explorer_1.
3. Implement `app/api/auditoria-entrada/extrair/route.ts` with `POST` handler, 10MB limit, error codes, and <200ms deterministic execution.
4. Update `app/api/auditoria-entrada/route.ts` to support `action=extrair` while preserving existing fallback logic.
5. Run verification commands:
   - `npm test`
   - `npm run typecheck`
6. Write your comprehensive report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1\handoff.md`.
7. Send completion message back with summary and handoff path.


## 2026-11-09T14:50:20Z
You are m1_worker_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1\DISPATCH.md verbatim before starting.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement lib/extrator-nfe.ts, app/api/auditoria-entrada/extrair/route.ts, and app/api/auditoria-entrada/route.ts based on the detailed handoffs of m1_explorer_1, m1_explorer_2, and m1_explorer_3.
Run build/test verification (npm test and npm run typecheck).
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1\handoff.md and notify your parent via send_message.


## 2026-11-09T15:01:59Z
**Context**: Implementação do Milestone 1 (lib/extrator-nfe.ts e rotas)
**Content**: Notei que os arquivos `lib/extrator-nfe.ts`, `app/api/auditoria-entrada/extrair/route.ts`, `app/api/auditoria-entrada/route.ts` e `tests/extrator-nfe.test.mjs` foram implementados com grande precisão. Gostaria de checar se você já está concluindo os testes e gerando seu `handoff.md`.
**Action**: Enviar status atualizado ou entregar o `handoff.md` com os comandos de verificação executados.
