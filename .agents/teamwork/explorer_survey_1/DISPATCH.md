# Task Assignment: Survey - Codebase Architecture & Deterministic Extraction

## Target
Survey the existing NF-e processing codebase in `F:\Workspace\Apps\Aplicativo_MCM-`.
Investigate how XML and PDF files are currently ingested, parsed, and extracted deterministically (without LLMs), how items/products and tax fields are represented, and what the frontend and backend architecture looks like.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1

## Instructions
1. Read `ORIGINAL_REQUEST.md`.
2. Map the repository structure, existing frameworks (Streamlit, FastAPI, Flask, React, etc.), and file locations.
3. Identify existing NF-e XML/PDF deterministic parsers, data models, tables/UI components.
4. Check how products, NCM, CFOP, CST/CSOSN, tax bases and rates (ICMS, IPI, PIS, COFINS, IBS/CBS) are currently extracted and rendered.
5. Report findings, relevant file paths, current gaps regarding R1 & R2, and recommended architecture for deterministic tabular extraction and item selection.
6. Write your comprehensive report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\handoff.md`.
7. Send a completion message back with summary and handoff path.


## 2026-11-09T14:26:11Z
You are explorer_survey_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\DISPATCH.md verbatim before starting.
Survey the existing NF-e processing codebase in F:\Workspace\Apps\Aplicativo_MCM-. Investigate deterministic parsing (XML/PDF), current tables/UI, and data models for R1 and R2.
Write your findings to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_1\handoff.md and notify your parent via send_message with your handoff path and summary.
