# BRIEFING — 2026-11-09T16:55:00Z

## Mission
Investigate and design the Dual Engine Selector (Ollama RX 580 vs Gemini API), the audit request payload (M2 ↔ M3 interface contract), and the component test strategy for Milestone 2.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: investigator, analyzer, test strategist
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source code files
- Only write within F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\
- Communicate results via send_message to parent (5db90b78-2923-4eca-9d94-d6c126a7f3be)
- Ground all designs on existing codebase, PROJECT.md and ORIGINAL_REQUEST.md contracts

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T16:55:00Z

## Investigation State
- **Explored paths**:
  - `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
  - `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
  - `F:\Workspace\Apps\Aplicativo_MCM-\components\ParametrizacaoERP.tsx`
  - `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
  - `F:\Workspace\Apps\Aplicativo_MCM-\lib\ollama-client.ts`
  - `F:\Workspace\Apps\Aplicativo_MCM-\app\api\auditoria-entrada\route.ts`
  - `F:\Workspace\Apps\Aplicativo_MCM-\app\api\auditoria-entrada\extrair\route.ts`
  - `F:\Workspace\Apps\Aplicativo_MCM-\app\globals.css`
  - `F:\Workspace\Apps\Aplicativo_MCM-\scripts\test.mjs`, `scripts\ui-smoke.mjs`, `scripts\ui-entry.tsx`
  - `F:\Workspace\Apps\Aplicativo_MCM-\tests\e2e-auditoria-entrada.test.mjs`, `tests\ollama-client.test.mjs`
- **Key findings**:
  - Seletor de Motor Duplo especificado como Dual Card Selector (`ollama` com GPU RX 580, `qwen2.5:7b`/`qwen3.5:4b` e zero timeout via particionamento vs `gemini` com `gemini-3.8-flash` e execução em nuvem paralela).
  - Contrato M2 ↔ M3 estritamente modelado na função `montarAuditRequestPayload`, validando seleção > 0, regime obrigatório e preservando 100% dos dados fiscais do Siscomex de cada item.
  - Suíte de testes `tests/tabela-itens-extracao.test.mjs` totalmente desenhada para rodar em `node scripts/test.mjs`, validando seleção individual, bulk actions, indeterminate master checkbox, engine toggle e payload builder.
  - Alerta crítico: Em `scripts/ui-entry.tsx` (linha 190), a checagem regex `/Auditar Documento/i` deve ser preservada no texto de `AuditoriaEntrada.tsx` para não quebrar a suíte de fumaça.
- **Unexplored areas**: Nenhuma pendência na alçada do M2. Próximas etapas dependem da implementação no M2 e construção da auditoria particionada no M3.

## Key Decisions Made
- Adotado o modelo Dual Card Selector com feedback visual de soberania estrita (`local_strict`) e status de GPU/API.
- Mapeada matriz completa de resiliência e casos de borda (0 itens, 100+ itens, falha de rede/timeout, reconexão 1-clique).
- Especificada a suíte `tests/tabela-itens-extracao.test.mjs` com 11 testes automatizados independentes.

## Artifact Index
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\DISPATCH.md — Atribuição da tarefa
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\BRIEFING.md — Memória situacional
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\progress.md — Liveness e heartbeat
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\handoff.md — Relatório completo de handoff
