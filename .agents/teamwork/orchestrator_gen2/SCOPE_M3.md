# Scope: Milestone 3 — Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API)

## Architecture & Goals
- **Objective**: Implement the selective partitioned AI audit engine for inbound NF-e items, supporting both Local AI (Ollama on GPU RX 580 with item-by-item partitioning and micro-batching to eliminate 180s timeouts) and External AI via Google Gemini API (`gemini-3.8-flash` via `@google/genai`).
- **Core Components**:
  1. `lib/auditoria-particionada.ts`: Partitioned audit execution engine, context stripping (retaining only sensitive tax fields: NCM, CFOP, CST/CSOSN, ICMS, IPI, PIS, COFINS, IBS/CBS), Ollama batching/item-by-item queue with per-item timeout (35s) and `num_ctx: 4096`, and Google Gemini API integration.
  2. `app/api/auditoria-entrada/auditar/route.ts`: Dedicated HTTP endpoint accepting `AuditRequestPayload` and returning `AuditedInvoiceResponse`.
  3. `app/api/auditoria-entrada/route.ts`: Unified router support for `action=auditar` preserving backward compatibility.
  4. Integration with `components/AuditoriaEntrada.tsx` and `components/ParametrizacaoERP.tsx`.

## Feature Coverage in Milestone 3
- Feature 6: Partitioned Local Ollama Auditor (GPU RX 580)
- Feature 7: Google Gemini API Audit Integration
- Feature 8: Sensitive Tax Context Stripping & Pericial Focus
- Feature 9: Audit Result Aggregation & ERP Integration

## Interface Contracts (M2 ↔ M3)
- Input: `AuditRequestPayload` (`motor: 'ollama' | 'gemini'`, `modelo?: string`, `contextoAdquirente`, `documentoContexto`, `itensSelecionados`)
- Output: `AuditedInvoiceResponse` (`motorUtilizado`, `tempoExecucaoMs`, `statusGlobal`, `parecerTecnicoGeral`, `parecerConformidadeCreditos`, `totalItensAuditados`, `itens: AuditedItemFinding[]`)

## Verification Targets
- Zero timeout on RX 580 for multi-item invoices (item-by-item / micro-batching).
- Gemini API processing with `@google/genai` and `gemini-3.8-flash`.
- Conformance with all E2E audit tests in `tests/e2e-auditoria-entrada.test.mjs`.
- Typecheck (`tsc --noEmit`) 0 errors.
