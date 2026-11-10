# Task Assignment: M2 Engine Toggle, Payload Construction & Testing Explorer

**Role**: `teamwork_explorer`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Investigate and design:
1. Dual Engine Selector:
   - Radio / Segmented control / Card selector to choose between:
     a) `Ollama Local (GPU RX 580)`: Shows details (Modelo: qwen2.5:7b / qwen3.5:4b, particionamento item a item sem timeout).
     b) `Google Gemini API (Nuvem)`: Shows details (Modelo: gemini-3.8-flash, execução paralela via API externa).
   - Visual feedback: Selected engine, status indicator (e.g. GPU local detectada / API Key configurada), warning if no items selected.
2. Trigger Audit Action:
   - Button "Executar Auditoria Pericial ([N] itens selecionados)".
   - Payload construction conforming to Interface Contract M2 ↔ M3 in `PROJECT.md` (`AuditRequestPayload`).
   - Disabled state when 0 items selected.
3. Component Testing Strategy:
   - Design automated tests for selection logic, engine toggling, and table rendering in `tests/tabela-itens-extracao.test.mjs` or similar test runner.

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md` (Interface Contract M2 ↔ M3)
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests/` (existing test harnesses)

## Output Requirements
Produce a comprehensive report at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_3\handoff.md` with:
1. Engine selector UI specification and state variables.
2. Exact structure of `AuditRequestPayload` constructed from selected items.
3. Component testing specification (unit tests for selection state, filtering, toggle behavior).
4. Error and edge case handling (0 items selected, engine switching during/after extraction).


## 2026-11-09T16:44:37Z
Você é o Agente m2_explorer_3 (teamwork_explorer).
Seu objetivo é investigar e desenhar o Seletor de Motor Duplo (Ollama RX 580 vs Gemini API), o payload de auditoria e a estratégia de testes do Milestone 2.
