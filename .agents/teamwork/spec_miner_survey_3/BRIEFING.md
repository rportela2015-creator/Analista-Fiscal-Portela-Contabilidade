# BRIEFING — 2026-11-09T14:36:00Z

## Mission
Probe and document comprehensive specifications, tax schemas, sensitive inbound fiscal requirements, and acceptance criteria for NF-e inbound two-stage audit (R1-R4) eliminating GPU RX 580 timeouts.

## 🔒 My Identity
- Archetype: specification_miner
- Roles: domain_specialist, requirement_analyst
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: Inbound Fiscal Audit & Sensitive Tax Data Requirements Specification (R1-R4)

## 🔒 Key Constraints
- Read ORIGINAL_REQUEST.md and DISPATCH.md verbatim.
- Discover and document features by probing authoritative specification; do NOT implement anything (read-only).
- Define precise schemas and acceptance criteria for R1-R4.
- Write findings to handoff.md and notify parent via send_message.
- Sensitive inbound fiscal fields: Product Code (cProd), Description (xProd), NCM (Mercosul 8-digit, RGI 1-6, NESH), CFOP (inbound vs outbound), CST/CSOSN, tax bases & rates (ICMS, IPI, PIS, COFINS, IBS/CBS reform LC 214/2025).
- Exclude non-tax/irrelevant metadata from AI audit to conserve context and prevent timeout/hallucinations.
- Two-stage architecture: Stage 1 (Deterministic Extraction & Tabular Presentation without LLM) -> Stage 2 (Selection of Sensitive Items & Audit via Local Ollama / External Gemini).

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T14:36:00Z

## Loaded Skills
- Source: C:\Users\admin\.gemini\config\skills\ncm-fiscal-auditor\SKILL.md
- Local copy: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\ncm-fiscal-auditor_SKILL.md
- Core methodology: Technical pericial fiscal classification, RGI 1-6, NESH IN RFB 2.169/2023, COSIT/DISIT precedents, and LC 214/2025 / LC 227/2025 consumption tax reform enquadramento

## Task Summary
- **What to build**: Comprehensive specification and schema mining for Inbound NF-e Audit (R1-R4)
- **Success criteria**: Exhaustive feature tables, edge case tables, JSON schemas for Stage 1, Stage 1->2 Selection, and Stage 2 AI Output, with verifiable acceptance criteria eliminating RX 580 timeouts.
- **Interface contracts**: Stage 1 deterministic extraction endpoint/schema, item selection contract, Stage 2 audit endpoint/schema.
- **Code layout**: `app/api/auditoria-entrada`, `components/AuditoriaEntrada.tsx`, `lib/extrator-multifonte.ts`, `lib/xml.ts`, `lib/relatorio-erp.ts`, `lib/fiscal-context.ts`, `lib/ollama-client.ts`.

## Key Decisions Made
- Diagnosed root cause of 180s RX 580 GPU timeout: monolithic POST `/api/auditoria-entrada` bundling full XML parsing, context concatenation, and 15 items in a single prompt.
- Formulated two-stage solution: Stage 1 (deterministic instant extraction into table) and Stage 2 (selective per-item or micro-batch audit via Ollama/Gemini).
- Outlined strict exclusion of non-tax tags (`<transp>`, `<cobr>`, `<pag>`, `<infAdic>`, `<Signature>`) reducing prompt size by >70%.
- Documented full schemas (`ExtractedInvoiceData`, `AuditRequestPayload`, `AuditedInvoiceResponse`) and 10 edge case scenarios.

## Artifact Index
- handoff.md — Comprehensive handoff report with 5 components
- progress.md — Liveness heartbeat and progress tracking
- DISPATCH.md — Initial dispatch instructions and incoming messages log
- ncm-fiscal-auditor_SKILL.md — Local domain skill copy
