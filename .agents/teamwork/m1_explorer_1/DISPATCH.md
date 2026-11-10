# Task Assignment: M1 Explorer 1 - Fast XML/PDF Parser & Data Structures

## Target
Investigate the exact implementation details for Milestone 1:
Creating `lib/extrator-nfe.ts` to deterministically parse NF-e XML (and digital PDF DANFE) into `ExtractedInvoiceData` and `ExtractedItem` without any LLM invocation.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Spec Miner Report: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\handoff.md
- Explorer 1 Survey: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\handoff.md

## Scope & Instructions
1. Inspect how `fast-xml-parser` and `pdf-parse` are used in `app/api/auditoria-entrada/route.ts` and `lib/extrator-multifonte.ts`.
2. Design the function signatures and exact extraction logic for `extrairDadosNfe(buffer: Buffer, filename: string)`:
   - Zero item truncation (`det[0..N]`).
   - Extract product fields: `cProd`, `xProd`, `ncm`, `cest`, `cfop`, `uCom`, `qCom`, `vUnCom`, `vProd`, `vFrete`, `vSeg`, `vDesc`.
   - Extract tax fields: ICMS (`cstIcms`, `orig`, `vBC`, `pICMS`, `vICMS`, `vBCST`, `pICMSST`, `vICMSST`, `pMVAST`), IPI, PIS, COFINS, and RTC (IBS/CBS).
   - In-memory Siscomex validation using `getMapaD8()` from `lib/ai/ncm-server.ts`.
   - Sensitivity flag calculation (`sensivelParaAuditoria`).
3. Detail how to decouple this into `lib/extrator-nfe.ts`.
4. Write report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_1\handoff.md`.
5. Send completion message back.


## 2026-11-09T14:38:11Z
You are m1_explorer_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_1\DISPATCH.md verbatim before starting.
Investigate the implementation details of lib/extrator-nfe.ts for deterministic XML/PDF extraction, complete item and tax field capture without truncation.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_1\handoff.md and notify your parent via send_message.


## 2026-11-09T14:46:40Z
**Context**: M1 Exploration - XML/PDF Parser & Data Structures
**Content**: Seus colegas `m1_explorer_2` e `m1_explorer_3` já concluíram suas análises e entregaram seus relatórios. Gostaria de verificar seu status em relação ao `handoff.md`.
**Action**: Enviar status atualizado ou finalizar e entregar o `handoff.md`.
