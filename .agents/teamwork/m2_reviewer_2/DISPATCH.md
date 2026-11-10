# Task Assignment: M2 Fiscal Domain & UX Reviewer

**Role**: `teamwork_reviewer`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_2`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Conduct an independent review of Milestone 2 deliverables from a fiscal domain and UX perspective:
1. Fiscal Data Presentation:
   - Verify presentation of products, sensitive fiscal codes (NCM, CFOP, CST/CSOSN, tax rates, bases, values for ICMS, ST, IPI, PIS, COFINS, RTC IBS/CBS).
   - Check Siscomex $O(1)$ badge and official description display.
   - Verify that all 11 fiscal sensitivity reasons (`MOTIVOS_SENSIBILIDADE_MAP`) are clearly communicated to the fiscal auditor.
2. Selection Controls & Workflow (R2):
   - Check row-level checkboxes, "Selecionar Todos", "Desmarcar Todos", and "Selecionar Apenas Sensíveis".
   - Verify dynamic counter behavior and disabled state when 0 items are selected.
3. Dual Engine Selector (R3):
   - Check UX between IA Local (Ollama - RX 580) and IA Externa (Google Gemini API).
   - Verify that engine switching strictly preserves item selection.
4. Contract Conformance M2 ↔ M3:
   - Verify `montarAuditRequestPayload` conforming to `AuditRequestPayload` in `PROJECT.md`.

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_1\handoff.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs`

## Commands to Execute
1. `npm run typecheck`
2. `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`
3. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`

## Output Requirements
Write handoff report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_2\handoff.md` with:
Observation, Logic Chain, Caveats, Conclusion (Verdict: **APPROVE** or **REQUEST_CHANGES**), Verification Method.


## 2026-11-09T17:12:44Z
Você é o Agente m2_reviewer_2 (teamwork_reviewer).
Seu objetivo é conduzir uma revisão de domínio fiscal e UX dos entregáveis do Milestone 2:
- `components/TabelaItensExtracao.tsx`
- `components/AuditoriaEntrada.tsx`
- `tests/tabela-itens-extracao.test.mjs`

Diretório de trabalho: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_2
Leia atentamente:
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_2\DISPATCH.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_1\handoff.md
- F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts
- F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs

Execute as verificações prescritas no DISPATCH.md e escreva seu relatório de handoff com veredito (APPROVE ou REQUEST_CHANGES) em:
F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_2\handoff.md
Ao finalizar, envie uma mensagem concisa ao parent reportando o veredito e o caminho do handoff.
