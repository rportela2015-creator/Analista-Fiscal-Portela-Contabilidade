# Task Assignment: M2 Code Reviewer

**Role**: `teamwork_reviewer`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_1`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Conduct an independent, objective code review of Milestone 2 deliverables:
1. `components/TabelaItensExtracao.tsx`:
   - React 19 hook order compliance (`scripts/hookcheck.mjs`).
   - Pure CSS tokens from `app/globals.css` (verify zero usage of Tailwind and zero imports of `lucide-react`).
   - TypeScript typing, prop interfaces, and performance with 100+ items (O(1) Set lookup).
2. `components/AuditoriaEntrada.tsx`:
   - Two-stage flow architecture (Stage 1 extraction -> Stage 2 selection & engine toggle -> Stage 3 audit & ERP adaptation).
   - Compatibility with `scripts/ui-smoke.mjs` and regex `/Auditar Documento/i`.
   - Error boundaries, loading states, and safe browser API checks (`typeof window !== 'undefined'`).
3. `tests/tabela-itens-extracao.test.mjs`:
   - Test validity, coverage of selection logic, engine switching, and payload building.

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_1\handoff.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests\tabela-itens-extracao.test.mjs`

## Commands to Execute
Run and document exact output:
1. `npm run typecheck`
2. `node scripts/hookcheck.mjs components`
3. `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`
4. `node scripts/ui-smoke.mjs`

## Output Requirements
Write handoff report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_reviewer_1\handoff.md` with structured sections:
Observation, Logic Chain, Caveats, Conclusion (Verdict: **APPROVE** or **REQUEST_CHANGES**), Verification Method.
