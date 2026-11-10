# BRIEFING — 2026-11-09T20:05:00Z

## Mission
Investigate Local Ollama engine on AMD Radeon RX 580 (VRAM constraints, timeouts, batching, context stripping, Siscomex enrichment) and design the architecture for `lib/auditoria-particionada.ts`.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: explorer, analyst
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_1
- Original parent: 9730c36f-6867-4776-9dd9-88da718cd7da
- Milestone: Milestone 3 — Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Zero timeout on RX 580 for multi-item invoices (item-by-item / micro-batching)
- Context stripping (strip non-tax tags, keep only sensitive fiscal fields)
- Timeout per item (35s), num_ctx: 4096, Siscomex official description injection
- Recommended architecture for lib/auditoria-particionada.ts

## Current Parent
- Conversation ID: 9730c36f-6867-4776-9dd9-88da718cd7da
- Updated: 2026-11-09T20:00:26Z

## Investigation State
- **Explored paths**: `lib/ollama-client.ts`, `lib/ai/ollama-client.ts`, `tests/ollama-client.test.mjs`, `lib/extrator-nfe.ts`, `lib/ai/ncm-server.ts`, `lib/ai/validar.ts`, `lib/ai/sanear-classificacao.ts`, `app/api/auditoria-entrada/route.ts`, `components/AuditoriaEntrada.tsx`, `components/ParametrizacaoERP.tsx`, `tests/e2e-auditoria-entrada.test.mjs`, `m3_explorer_2/handoff.md`, `m3_explorer_3/handoff.md`.
- **Key findings**:
  1. AMD Radeon RX 580 (8GB VRAM) running Ollama via Vulkan generates ~16 tokens/s for `qwen2.5:7b` (Q4_K_M).
  2. A warm pericial prompt takes ~20s for 1 item (226 prompt tokens, 284 eval tokens).
  3. A monolithic multi-item prompt (10-15 items) requires 2,500-3,500 tokens, which takes 180-280s, mathematically guaranteeing a 180s HTTP timeout.
  4. Item-by-item partitioning (`batchSize = 1`) guarantees completion in ~18-22s per item, safely within the 35s per-item timeout.
  5. Setting `num_ctx: 4096` drops KV cache memory footprint to ~230MB (vs ~1GB+ for 16k), preventing VRAM paging.
  6. Context stripping reduces input tokens from 2,000+ down to ~220 tokens, evaluating in ~1.5s.
  7. `qwen3.5:4b` has thinking capability enabled in llama.cpp runner; if called without stop sequences or max tokens, it enters deep chain-of-thought (generating 3,800+ tokens taking 290s). Therefore, `qwen2.5:7b` is the primary model, and fallback to `qwen3.5:4b` requires strict token limits.
  8. Injecting official Siscomex descriptions from `getMapaD8()` anchors classifications with zero hallucination.
- **Unexplored areas**: None. All core technical objectives have been empirically investigated and verified.

## Key Decisions Made
- Select item-by-item partitioning (`batchSize = 1`) as the definitive strategy for Ollama on RX 580.
- Prescribe `num_ctx: 4096`, `timeoutMs: 35000`, `temperature: 0.1` for local inference.
- Define a complete, robust design for `lib/auditoria-particionada.ts`.

## Artifact Index
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_1\handoff.md — Final investigation & design report (ready to write)
