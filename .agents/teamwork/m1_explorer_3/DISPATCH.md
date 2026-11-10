# Task Assignment: M1 Explorer 3 - Siscomex NCM Validation, Sensitivity Rules & Edge Cases

## Target
Investigate Siscomex validation, sensitivity indicators, and edge cases for Milestone 1 extraction.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Spec Miner Report: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\handoff.md
- Relevant Skill reference: C:\Users\admin\.gemini\config\skills\ncm-fiscal-auditor\SKILL.md

## Scope & Instructions
1. Inspect `lib/ai/ncm-server.ts` (`getMapaD8`), `lib/ai/validar.ts`, and `lib/ai/sanear-classificacao.ts`.
2. Determine how each extracted item should be flagged for `ncmValidoSiscomex` and `sensivelParaAuditoria`:
   - An item is sensitive if: NCM not found in 10.515 Siscomex records; OR CST has ST (e.g. 10, 30, 60, 70, 201, 202, 500); OR interstate operation without CEST; OR credit discrepancy suspected (e.g. CSOSN 102 from Simples supplier).
3. Test edge cases: 7-digit NCMs (need `padStart(8, '0')`), single item vs 50+ items in XML, missing optional tags, scientific notation.
4. Recommend helper functions for `lib/extrator-nfe.ts`.
5. Write report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3\handoff.md`.
6. Send completion message back.


## 2026-11-09T14:38:22Z
You are m1_explorer_3. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3\DISPATCH.md verbatim before starting.
Investigate Siscomex NCM validation (getMapaD8), sensitivity rules (CST ST, interstate, missing CEST), and edge cases for M1.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3\handoff.md and notify your parent via send_message.
