# Project: Inbound NF-e Two-Stage Fiscal Audit Architecture (Aplicativo_MCM-)

## Architecture
- **Stage 1 (Deterministic Extraction & Tabular Presentation)**:
  - Modules: `lib/extrator-nfe.ts`, `app/api/auditoria-entrada/extrair/route.ts` (or action), `components/TabelaItensExtracao.tsx`, `components/AuditoriaEntrada.tsx`.
  - Flow: User uploads XML or PDF -> deterministic extraction runs instantly (< 200ms) with zero LLM invocation -> extracts 100% of items without truncation -> validates NCMs in O(1) against 10.515 Siscomex records -> renders interactive table with sensitive tax fields (NCM, CFOP, CST/CSOSN, ICMS, IPI, PIS, COFINS, RTC).
- **Stage 2 (Selective Pericial Audit via Local Ollama / Gemini API)**:
  - Modules: `lib/auditoria-particionada.ts`, `app/api/auditoria-entrada/auditar/route.ts` (or unified router), `lib/ollama-client.ts`, `components/AuditoriaEntrada.tsx`, `components/ParametrizacaoERP.tsx`.
  - Flow: User selects specific items (individual checkboxes or bulk actions) -> selects engine (`motor: 'ollama' | 'gemini'`) -> triggers audit.
  - Local Ollama (RX 580): Partitions selected items item-by-item (or micro-batches of 1-2 items) -> strips non-tax tags (<transp>, <cobr>, etc.) -> runs `qwen2.5:7b` (or `qwen3.5:4b`) with `num_ctx: 4096` and per-item timeout (35s) -> aggregates results -> eliminates 180s timeout.
  - External Gemini API: Dispatches selected items to `gemini-3.8-flash` via `@google/genai` with structured JSON schema.

## Code Layout
- Existing conventions:
  - `lib/`: Pure TypeScript business logic, parsers, and AI clients (`extrator-nfe.ts`, `auditoria-particionada.ts`, `ollama-client.ts`, `ai/ncm-server.ts`).
  - `app/api/`: Next.js App Router API endpoints (`app/api/auditoria-entrada/`).
  - `components/`: React 19 UI components (`AuditoriaEntrada.tsx`, `TabelaItensExtracao.tsx`, `ParametrizacaoERP.tsx`).
  - `tests/`: Automated unit and integration tests (`*.test.mjs`) executed via `node scripts/test.mjs`.

## Feature Inventory
Every feature from the Survey phase appears here with its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Deterministic NF-e Extraction Engine (`lib/extrator-nfe.ts`) | Zero-LLM deterministic extraction of XML and digital DANFE PDF, extracting 100% of items with complete tax fields and Siscomex NCM validation | M1 | Survey (F1) |
| 2 | Instant Extraction API Endpoint (`POST /api/auditoria-entrada/extrair`) | Decoupled HTTP endpoint returning `ExtractedInvoiceData` in < 200ms | M1 | Survey (F2) |
| 3 | Interactive Fiscal Items Table (`TabelaItensExtracao`) | Interactive React table displaying products, tax codes, sensitivity badges, and tax values | M2 | Survey (F3) |
| 4 | Item Checkboxes & Bulk Selection Controls | Row-level selection with "Select All", "Deselect All", "Select Sensitive", and dynamic counter | M2 | Survey (F3, R2) |
| 5 | Dual Engine Selector (Local Ollama vs Gemini API) | UI control allowing pre-audit engine choice with status feedback | M2 | Survey (F4, R3) |
| 6 | Partitioned Local Ollama Auditor (GPU RX 580) | Item-by-item / micro-batch executor on RX 580 with `num_ctx: 4096`, 35s per-item timeout, context-stripping, eliminating 180s timeout | M3 | Survey (F4, R3) |
| 7 | Google Gemini API Audit Integration | Cloud engine using `gemini-3.8-flash` via `@google/genai` for selected items | M3 | Survey (F4, R3) |
| 8 | Sensitive Tax Context Stripping & Pericial Focus | Stripping non-tax tags (<transp>, <cobr>, etc.), focusing strictly on NCM, CFOP, CST/CSOSN, ICMS, IPI, PIS, COFINS, IBS/CBS | M3 | Survey (F4, R4) |
| 9 | Audit Result Aggregation & ERP Integration | Deterministic aggregation of audited items into `AuditedInvoiceResponse` and handoff to `ParametrizacaoERP` | M3 | Survey (F5) |
| 10 | E2E Opaque-Box Test Suite (Tiers 1-4) | Comprehensive test suite verifying deterministic extraction, item selection, Ollama batching, Gemini execution, and zero timeout | M4 | Survey (F6) |
| 11 | Adversarial Coverage Hardening (Tier 5) | White-box adversarial testing probing edge cases, malformed NCMs, and high-load invoices | M4 | Survey (Phase 2) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Deterministic Extraction Engine & Endpoint | `lib/extrator-nfe.ts`, `app/api/auditoria-entrada/extrair/route.ts` | none | DONE |
| M2 | Interactive Tabular UI, Item Selection & Engine Toggle | `components/TabelaItensExtracao.tsx`, `components/AuditoriaEntrada.tsx` | M1 contracts | DONE |
| M3 | Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API) | `lib/auditoria-particionada.ts`, `app/api/auditoria-entrada/auditar/route.ts` (or router update) | M1, M2 | IN_PROGRESS |
| M4 | Final Milestone: 100% E2E Test Suite Pass & Adversarial Hardening | E2E Tiers 1-4 pass + Tier 5 adversarial testing | M1, M2, M3, E2E Test Track | PLANNED |
