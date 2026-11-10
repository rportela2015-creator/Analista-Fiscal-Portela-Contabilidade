# Task Assignment: Specification Mining - Fiscal Inbound Audit & Sensitive Tax Data Requirements

## Target
Extract and document the exact requirements, schema, tax rules, and pericial constraints for inbound NF-e audit (R1-R4) in `F:\Workspace\Apps\Aplicativo_MCM-`.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3
- Relevant Skill reference:
  - NCM Fiscal Auditor: C:\Users\admin\.gemini\config\skills\ncm-fiscal-auditor\SKILL.md

## Instructions
1. Read `ORIGINAL_REQUEST.md`.
2. Probe project specifications, domain documentation, and the fiscal audit rules:
   - Sensitive inbound fiscal data fields: Product Code, Description, NCM (Mercosul Common Nomenclature, RGI 1-6, NESH), CFOP (inbound vs outbound operation codes), CST/CSOSN, tax bases & rates (ICMS, IPI, PIS, COFINS, IBS/CBS reform LC 214/2025).
   - Exclusion of non-tax / irrelevant metadata from AI audit to conserve context and prevent hallucinations.
3. Define the precise JSON schema and tabular contract for:
   - Extracted item data (Stage 1 - deterministic output)
   - Selection payload (Stage 1 to Stage 2 transition)
   - Audit report / findings schema (Stage 2 - AI output per item)
4. Formulate the exact acceptance criteria and edge cases for the E2E test plan (single item, multi-item, invalid NCM, CST discrepancy, timeout stress tests).
5. Write your findings to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\handoff.md`.
6. Send a completion message back with summary and handoff path.


## 2026-11-09T14:26:22Z
[Message] timestamp=2026-11-09T14:26:22Z sender=5db90b78-2923-4eca-9d94-d6c126a7f3be priority=MESSAGE_PRIORITY_HIGH content=You are spec_miner_survey_3. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\DISPATCH.md verbatim before starting.
Probe project specifications, fiscal domain requirements (NCM, CFOP, CST/CSOSN, ICMS, IPI, PIS, COFINS, IBS/CBS), and define precise schemas and acceptance criteria for R1-R4.
Write your findings to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\handoff.md and notify your parent via send_message with your handoff path and summary.
