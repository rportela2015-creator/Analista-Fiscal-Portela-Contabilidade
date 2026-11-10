# Task Assignment: M2 UI State Architecture & Upload Flow Explorer

**Role**: `teamwork_explorer`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Investigate `components/AuditoriaEntrada.tsx` and determine how to integrate the two-stage flow:
1. Stage 1: File upload (XML or PDF) calls `POST /api/auditoria-entrada/extrair` (or action=extrair), receiving `ExtractedInvoiceData`.
2. State Management: Manage extracted invoice state, selected item IDs/indices, audit engine choice ('ollama' vs 'gemini'), loading states (extracting vs auditing), and transition to Stage 2.
3. Recommend exact component architecture, props, callbacks, and integration points with `components/TabelaItensExtracao.tsx` and `components/ParametrizacaoERP.tsx`.

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
- `F:\Workspace\Apps\Aplicativo_MCM-\app\api\auditoria-entrada\extrair\route.ts`

## Output Requirements
Produce a comprehensive report at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1\handoff.md` with:
1. Observation: Detailed inspection of current `AuditoriaEntrada.tsx` state and render tree.
2. Logic Chain: Architecture of the 2-stage state machine (EMPTY -> EXTRACTED -> AUDITING -> AUDITED).
3. Proposed Changes: Exact state hooks, handlers (`handleFileUpload`, `handleToggleSelect`, `handleSelectAll`, `handleAuditSubmit`), and component layout.
4. Verification: How to verify the component via TypeScript typecheck and component/rendering tests.


## 2026-11-09T16:44:21Z
Você é o Agente m2_explorer_1 (teamwork_explorer).
Seu objetivo é investigar a arquitetura de estado e fluxo de upload no componente components/AuditoriaEntrada.tsx para o Milestone 2.

Diretório de trabalho: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1
Leia atentamente:
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1\DISPATCH.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts
- F:\Workspace\Apps\Aplicativo_MCM-\app\api\auditoria-entrada\extrair\route.ts

Conforme as regras do projeto, NÃO MODIFIQUE ARQUIVOS DE CÓDIGO FONTE. Você é um explorador analítico read-only.
Escreva seu relatório completo e estruturado em:
F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_1\handoff.md
Ao finalizar, envie uma mensagem concisa ao parent reportando a conclusão e o caminho do handoff.
