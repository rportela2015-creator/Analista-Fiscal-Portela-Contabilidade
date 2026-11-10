# Task Assignment: M2 Interactive Table Component Explorer

**Role**: `teamwork_explorer`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Investigate and design the new component `components/TabelaItensExtracao.tsx`:
1. Tabular layout displaying extracted items from `ExtractedInvoiceData`:
   - Columns: Selection checkbox, Item #, Product Code (`cProd`), Description (`xProd`), NCM (with Siscomex validation status badge), CFOP, CST/CSOSN, Unit/Quantity, Unit Price, Total Price, Tax Badges (ICMS, IPI, PIS, COFINS with rates/values, and RTC IBS/CBS indicator), and Sensitivity Badge (with tooltip/reasons for `sensivelParaAuditoria`).
2. Selection Controls:
   - Header master checkbox (all selected / indeterminate / none selected).
   - Action buttons: "Selecionar Todos", "Desmarcar Todos", "Selecionar Apenas Sensíveis" (auto-selects items with `item.sensivelParaAuditoria === true`).
   - Dynamic counter: e.g. "5 de 20 itens selecionados para auditoria (3 sensíveis detectados)".
3. UX & Styling: Tailwind CSS classes matching existing theme (dark/light, badges, borders, typography in `Aplicativo_MCM-`).

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts` (interfaces `ExtractedItem`, `ExtractedInvoiceData`, `TributosItem`)
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\ParametrizacaoERP.tsx` (for design/theme consistency)

## Output Requirements
Produce a comprehensive report at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2\handoff.md` with:
1. TypeScript interface specification for `TabelaItensExtracaoProps`.
2. Detailed layout, column definitions, formatting functions (BRL currency, percentages).
3. Selection state management and bulk actions implementation details.
4. Edge cases (large invoices with 100+ items, long descriptions, missing tax tags).


## 2026-11-09T16:44:26Z
[From: 5db90b78-2923-4eca-9d94-d6c126a7f3be]
Você é o Agente m2_explorer_2 (teamwork_explorer).
Seu objetivo é investigar e desenhar o novo componente components/TabelaItensExtracao.tsx para o Milestone 2.

Diretório de trabalho: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2
Leia atentamente:
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2\DISPATCH.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts
- F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\components\ParametrizacaoERP.tsx

Conforme as regras do projeto, NÃO MODIFIQUE ARQUIVOS DE CÓDIGO FONTE. Você é um explorador analítico read-only.
Escreva seu relatório completo e estruturado em:
F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2\handoff.md
Ao finalizar, envie uma mensagem concisa ao parent reportando a conclusão e o caminho do handoff.
