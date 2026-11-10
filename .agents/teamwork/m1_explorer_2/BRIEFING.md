# BRIEFING — 2026-11-09T14:45:00Z

## Mission
Investigate API route decoupling and endpoint design (POST /api/auditoria-entrada/extrair vs action-based routing) for instant deterministic extraction (<200ms) with zero LLM invocation and full backward compatibility.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, synthesizer
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: Milestone 1

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Investigate API route decoupling and endpoint design (POST /api/auditoria-entrada/extrair and backward compatibility) for instant deterministic response (<200ms)
- Ensure backward compatibility with existing tests and clients
- Validate payload size handling (up to 10MB) and error response formats (HTTP 400, clear error messages)
- Specify exact contract for ExtractedInvoiceData return payload

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T14:38:16Z

## Investigation State
- **Explored paths**:
  - `app/api/auditoria-entrada/route.ts` (monolithic route with 15-item cap and immediate Ollama/Gemini call)
  - `components/AuditoriaEntrada.tsx` (client form sending multipart/form-data to /api/auditoria-entrada)
  - `components/ParametrizacaoERP.tsx` (consuming data.itens and nfe data)
  - `lib/relatorio-erp.ts` (ERP parameter data model and report generation)
  - `lib/ai/ncm-server.ts` (getMapaD8 in-memory Siscomex cache)
  - `tests/` and `scripts/ui-entry.tsx` (baseline test suite verification)
- **Key findings**:
  1. Extraction benchmark: XMLParser runs in ~1.8ms; getMapaD8 in-memory lookup runs in ~0.03ms per item. Total deterministic extraction time is ~15-45ms (< 200ms target).
  2. Routing strategy: Recommend Dual Architecture — primary dedicated sub-route `POST /api/auditoria-entrada/extrair` + Smart Action Router on `POST /api/auditoria-entrada` (`?action=extrair` or `formData.action = 'extrair'`).
  3. Backward compatibility: Unspecified action defaults to existing legacy flow (or extraction+audit) so existing scripts/tests remain unbroken.
  4. Payload size: 10MB limit enforced via runtime check returning HTTP 413. Memory buffer is minimal (10MB RAM).
  5. Error response: Standardized JSON `{ error, codigo, detalhe? }` with HTTP 400, 413, 422, 500.
  6. Return payload contract: Standardized `ExtractedInvoiceData` capturing 100% of items, full tax breakdown (ICMS, IPI, PIS, COFINS, RTC), and sensitivity flags.
- **Unexplored areas**: None for M1 API route design.

## Key Decisions Made
- Dual route architecture adopted (both dedicated route `/extrair` and action parameter `?action=extrair` supported).
- Explicit 10MB payload size limit with HTTP 413 response.
- Standardized error codes defined.

## Artifact Index
- DISPATCH.md — Task assignment from parent
- BRIEFING.md — Persistent situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Comprehensive 5-component report
