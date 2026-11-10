# BRIEFING — 2026-11-09T14:36:00Z

## Mission
Survey existing AI audit pipelines, Ollama integration, GPU RX 580 performance/timeout issues, and external LLM (Gemini API) integration in F:\Workspace\Apps\Aplicativo_MCM-.

## 🔒 My Identity
- Archetype: explorer
- Roles: Read-only investigation: analyze problems, synthesize findings, produce structured reports
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: Survey Phase

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Restrict file modifications strictly to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2
- Survey Ollama local engine (RX 580 GPU) and Gemini API integration
- Provide precise technical analysis for R3 (Selective audit with local Ollama & Gemini API) and R4 (Strict focus on sensitive input tax data)

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T14:34:31Z

## Investigation State
- **Explored paths**:
  - `package.json`, `next.config.mjs`, `scripts/test.mjs`
  - `lib/ollama-client.ts`, `lib/ai/ollama-client.ts`
  - `app/api/auditoria-entrada/route.ts`, `app/api/classificar-ia/route.ts`, `app/api/auditoria-relatorio/route.ts`
  - `components/AuditoriaEntrada.tsx`, `components/ParametrizacaoERP.tsx`, `app/page.tsx`
  - `lib/fiscal-context.ts`, `lib/parametrizacao.ts`, `lib/reforma.ts`, `lib/extrator-multifonte.ts`, `lib/ai/validar.ts`, `lib/ai/sanear-classificacao.ts`
  - `tests/ollama-client.test.mjs`, `tests/auditoria.test.mjs`
  - `docs/analise_e_proposta_aprimoramento.md`
  - Peer reports: `explorer_survey_1/handoff.md` and `spec_miner_survey_3/handoff.md`
- **Key findings**:
  - Live empirical hardware benchmarking on AMD Radeon RX 580 2048SP (DirectML/Vulkan, 8GB VRAM):
    - `qwen3.5:4b`: ~13.5 tokens/sec eval speed, ~3.3 GB VRAM footprint.
    - `qwen2.5:7b`: ~16.3 tokens/sec eval speed, ~4.7 GB VRAM footprint.
    - Single-item warm audit test on `qwen2.5:7b` executed in **6.45 seconds total** (103 tokens generated in 6.32 seconds).
  - Root cause of 180s timeout: `app/api/auditoria-entrada/route.ts` currently sends up to 15 items in a monolithic prompt requesting a complex 16-field schema + 2 executive opinions (`statusGlobal`, `parecerTecnicoXml`, `parecerConformidade`). The resulting 2,500-3,500 output tokens require > 185s at 13-16 t/s, and combined with `num_ctx: 16384` causes severe VRAM pressure and Windows DWM memory paging to system RAM over PCIe.
  - Slicing at 15 items (`itens.slice(0, 15)`) discards invoice items beyond 15 without warning.
  - Deterministic extraction can be decoupled completely into Stage 1 (<50ms, zero LLM invocation).
  - Stage 2 selective audit partitioned item-by-item (or micro-batches of 1-2 items) runs in 6-12s per item on RX 580, eliminating timeouts and memory thrashing.
  - Google Gemini API (`gemini-3.8-flash` via `@google/genai`) is already present in `package.json` and partially configured as cloud fallback; it can serve as a fast alternative engine capable of batch processing in 2-3s.
- **Unexplored areas**: None for survey scope; all required survey targets have been thoroughly analyzed.

## Key Decisions Made
- Formulate detailed 5-component handoff report with exact reproduction data, code locations, failure mechanics, and concrete technical recommendations for R3 and R4.

## Artifact Index
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\DISPATCH.md` — Task assignment & parent communications
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\BRIEFING.md` — Situational awareness
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\progress.md` — Heartbeat and progress tracker
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\explorer_survey_2\handoff.md` — Final handoff report
