# Task Assignment: M2 Selection & UI State Challenger

**Role**: `teamwork_challenger`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Empirically stress-test the selection state, table controls, and payload assembly implemented in Milestone 2:
1. Write and execute stress harness(es) testing:
   - High-volume items (100, 250, 500 items): Measure toggle latency, bulk selection time, and payload construction time.
   - Tri-state master checkbox behavior under extreme combinations (all selected, none, first only, last only, alternating odd/even).
   - "Selecionar Apenas Sensíveis" on notes with: 0 sensitive items, 100% sensitive items, and mixed items.
   - Textual search and filter chips with special characters, regex meta-characters (`.*`, `[a-z]`, `\d`), empty searches, and accents.
   - Payload assembly edge cases: 0 items selected (assert exception), missing mandatory fields, extreme item sizes.

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs`

## Output Requirements
Write handoff report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1\handoff.md` with:
Observation, Logic Chain, Caveats, Conclusion (Verdict: **APPROVE** or **REQUEST_CHANGES**), Verification Method.


## 2026-11-09T17:12:51Z
Você é o Agente m2_challenger_1 (teamwork_challenger).
Seu objetivo é testar adversarialmente e estressar a lógica de seleção de itens, ações em lote, filtros e montagem de payload do Milestone 2.

Diretório de trabalho: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1
Leia atentamente:
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1\DISPATCH.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts
- F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs

Escreva harnesses de estresse empírico (ex: 500 itens, regex em buscas, casos de borda de tri-state, payload com 0 itens), execute-os e reporte o resultado com veredito (APPROVE ou REQUEST_CHANGES) em:
F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1\handoff.md
Ao finalizar, envie uma mensagem concisa ao parent reportando o veredito e o caminho do handoff.
