# Task Assignment: Survey - Local IA (Ollama) & External IA (Gemini API) Integration

## Target
Survey the existing AI audit pipelines, Ollama integration, GPU RX 580 performance / timeout issues, and external LLM (Gemini API) integration in `F:\Workspace\Apps\Aplicativo_MCM-`.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2
- Relevant Skill references:
  - Ollama local engine: C:\Users\admin\.gemini\config\skills\ollama-local-engine\SKILL.md
  - Gemini API dev: C:\Users\admin\.gemini\config\plugins\gemini-api\skills\gemini-api-dev\SKILL.md

## Instructions
1. Read `ORIGINAL_REQUEST.md`.
2. Inspect the current AI auditing code, prompt templates, and execution logic.
3. Investigate why/where timeouts (180s) occur on the AMD Radeon RX 580 GPU (e.g. sending entire invoices with all items in a single giant prompt to Ollama qwen2.5:7b or qwen3.5:4b).
4. Analyze how to partition selected items (item-by-item or small micro-batches) for local Ollama execution with fallback/alternative execution via Google Gemini API (using google-genai SDK or current REST/API config).
5. Identify configuration mechanisms (model selection, batch size, timeout settings, API keys).
6. Document exact files, current code logic, failure modes, and technical recommendations for R3 & R4.
7. Write your report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\handoff.md`.
8. Send a completion message back with summary and handoff path.

## 2026-11-09T14:26:16Z
[Message from parent 5db90b78-2923-4eca-9d94-d6c126a7f3be]
You are explorer_survey_2. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\DISPATCH.md verbatim before starting.
Survey the existing AI audit pipelines, Ollama integration, GPU RX 580 performance / timeout issues, and external LLM (Gemini API) integration in F:\Workspace\Apps\Aplicativo_MCM-.
Write your findings to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\handoff.md and notify your parent via send_message with your handoff path and summary.

## 2026-11-09T14:34:31Z
[Message from parent 5db90b78-2923-4eca-9d94-d6c126a7f3be]
**Context**: Survey de IA Local (Ollama/RX 580) e IA Externa (Gemini API)
**Content**: Os agentes `explorer_survey_1` e `spec_miner_survey_3` já concluíram suas análises e entregaram seus relatórios. Gostaria de verificar seu status e se você já está finalizando seu `handoff.md`.
**Action**: Enviar status atualizado ou finalizar e entregar o `handoff.md` com suas recomendações técnicas.
