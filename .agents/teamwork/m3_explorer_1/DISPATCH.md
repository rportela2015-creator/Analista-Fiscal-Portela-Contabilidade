# Dispatch: M3 Explorer 1 (Local Ollama Engine & RX 580 Partitioning)

**Role**: `teamwork_explorer`  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_1`  
**Milestone**: Milestone 3 — Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API)  
**Original Request**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md` (MUST read before starting work).  
**Scope Document**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\orchestrator_gen2\SCOPE_M3.md`

## Objectives
1. Investigate existing Ollama integrations (`lib/ollama-client.ts`, `lib/ai/ollama-client.ts`, `tests/ollama-client.test.mjs`, `app/api/auditoria-entrada/route.ts`).
2. Design the architecture of `lib/auditoria-particionada.ts` for Local Ollama on AMD Radeon RX 580:
   - Item-by-item partitioning or micro-batching (1-2 items) to completely eliminate 180s timeout.
   - Context stripping: strip non-tax tags (<transp>, <cobr>, etc.), retaining only sensitive tax fields (NCM, CFOP, CST/CSOSN, ICMS, IPI, PIS, COFINS, RTC).
   - Per-item timeout (e.g. 35s), `num_ctx: 4096`, model fallback (`qwen2.5:7b` -> `qwen3.5:4b`).
   - Injection of Siscomex official description for each item's NCM using `lib/ai/ncm-server.ts` or `lib/extrator-nfe.ts`.
3. Provide concrete function signatures, prompt designs, error handling, and test specifications.
4. Deliver `handoff.md` at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_1\handoff.md`.


## 2026-11-09T19:50:41Z
Investigate Local Ollama engine on AMD Radeon RX 580:
- lib/ollama-client.ts, lib/ai/ollama-client.ts, tests/ollama-client.test.mjs
- Item-by-item partitioning or micro-batching to eliminate 180s timeout
- Context stripping (strip non-tax tags, keep only sensitive fiscal fields)
- Timeout per item (35s), num_ctx: 4096, Siscomex official description injection
- Recommended architecture for lib/auditoria-particionada.ts

Write your comprehensive findings and implementation strategy to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_1\handoff.md.
Send a message back when complete.


## 2026-11-09T20:00:26Z
[Message from orchestrator 9730c36f-6867-4776-9dd9-88da718cd7da]
Status inquiry: m3_explorer_2 and m3_explorer_3 have delivered their handoff reports. How is the RX 580 benchmark/investigation progressing?
Action: Report current findings or finalize handoff.md.
