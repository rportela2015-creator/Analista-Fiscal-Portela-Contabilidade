# Task Assignment: M2 Forensic Integrity Auditor

**Role**: `teamwork_auditor`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_auditor_1`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Perform forensic integrity verification on Milestone 2 deliverables:
1. Integrity Forensics Checks:
   - Check `components/TabelaItensExtracao.tsx`, `components/AuditoriaEntrada.tsx`, and `tests/tabela-itens-extracao.test.mjs` for:
     a) Hardcoding: Are test results, counts, or selection sets hardcoded?
     b) Facades: Are any components dummy shells that simulate selection without actual state mutations?
     c) Cheating / Shortcuts: Does the test suite assert on synthetic fixtures that bypass the real component?
     d) Completeness: Are all 100% of extracted items genuinely selectable without truncation?
2. Run independent verification commands:
   - `npm run typecheck`
   - `node scripts/hookcheck.mjs components`
   - `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`
   - `node scripts/ui-smoke.mjs`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs`

## Output Requirements
Write handoff report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_auditor_1\handoff.md` with:
Observation, Logic Chain, Caveats, Conclusion (Verdict: **CLEAN** or **INTEGRITY VIOLATION**), Verification Method.


## 2026-11-09T17:13:05Z
Você é o Agente m2_auditor_1 (teamwork_auditor).
Seu objetivo é conduzir uma auditoria forense de integridade rigorosa sobre os entregáveis do Milestone 2:
- `components/TabelaItensExtracao.tsx`
- `components/AuditoriaEntrada.tsx`
- `lib/extrator-nfe.ts`
- `tests/tabela-itens-extracao.test.mjs`

Diretório de trabalho: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_auditor_1
Leia atentamente:
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_auditor_1\DISPATCH.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts
- F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs

Execute as verificações periciais contra hardcoding, fachadas dummy, skips artificiais e testes vazios.
Execute os comandos de verificação:
1. `npm run typecheck`
2. `node scripts/hookcheck.mjs components`
3. `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`
4. `node scripts/ui-smoke.mjs`
5. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`

Escreva seu relatório de auditoria forense com veredito (CLEAN ou INTEGRITY VIOLATION) em:
F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_auditor_1\handoff.md
Ao finalizar, envie uma mensagem concisa ao parent reportando o veredito e o caminho do handoff.
