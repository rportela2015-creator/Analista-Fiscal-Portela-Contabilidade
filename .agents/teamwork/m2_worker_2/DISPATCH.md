# Task Assignment: M2 Remediation Worker (Iteration 2)

**Role**: `teamwork_worker`  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_2`  
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle (Iteration 2 Remediation)  
**Original Request**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md` (You MUST read this before starting work).  
**Exclusive Write Ownership**:
- `components/TabelaItensExtracao.tsx`
- `tests/m2-ssr-stress.tsx`

---

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

---

## Objective
Apply the exact fixes identified during the Milestone 2 Adversarial Challenge:

1. **Fix Critical Search Filter Bug in `components/TabelaItensExtracao.tsx:160-171`**:
   Currently, when searching alphabetical terms (e.g., "mouse", "parafuso"), `termo.replace(/\D/g, '')` evaluates to `""`, and `it.ncm.replace(/\D/g, '').includes("")` evaluates to `true`, matching all items and breaking the search.
   Replace with:
   ```typescript
   if (busca.trim()) {
     const termo = busca.trim().toLowerCase();
     const termoNumerico = termo.replace(/\D/g, '');
     res = res.filter((it) => {
       return (
         (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
         (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
         (termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)) ||
         (it.cfop && it.cfop.includes(termo)) ||
         (it.cEAN && it.cEAN.includes(termo))
       );
     });
   }
   ```

2. **Fix Tri-State Master Checkbox Synchronization with Orphan Indices in `components/TabelaItensExtracao.tsx`**:
   Compute `selectedCount` based on items actually present in the current invoice (`itens`), not the raw `selectedSet.size`:
   ```typescript
   const selectedCount = useMemo(() => {
     return itens.filter((it) => selectedSet.has(it.index)).length;
   }, [itens, selectedSet]);
   ```

3. **Fix TypeScript Typecheck Error in `tests/m2-ssr-stress.tsx:77,182`**:
   Replace `selectedIndices: new Set()` with `selectedIndices: new Set<number>()`.

4. **Run Verification Commands**:
   - `npm run typecheck` (MUST BE 0 ERRORS)
   - `node scripts/hookcheck.mjs components` (MUST BE 0 VIOLATIONS)
   - `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs` (20/20 PASS)
   - `node scripts/test.mjs tests/m2-challenger-stress.test.mjs` (23/23 PASS)
   - `node scripts/ui-smoke.mjs` (MUST BE OK)
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs` (54/54 PASS)

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1\handoff.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests\m2-ssr-stress.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\tests\m2-challenger-stress.test.mjs`

## Output Requirements
Write `handoff.md` at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_2\handoff.md` documenting the exact changes, test execution commands, and output logs.
Then use `send_message` to notify the orchestrator.


## 2026-11-09T19:12:54Z
You are m2_worker_2 (teamwork_worker).
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_2.
You MUST read:
1. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
2. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_2\DISPATCH.md
3. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_1\handoff.md

Follow all instructions in DISPATCH.md precisely.
MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You have exclusive write ownership over:
- components/TabelaItensExtracao.tsx
- tests/m2-ssr-stress.tsx

Perform the required fixes:
1. Fix search filter in components/TabelaItensExtracao.tsx (termoNumerico.length > 0 guard)
2. Fix tri-state master checkbox count in components/TabelaItensExtracao.tsx (derive selectedCount from itens.filter(it => selectedSet.has(it.index)).length)
3. Fix TypeScript type in tests/m2-ssr-stress.tsx (new Set<number>())
4. Run all verification commands:
   - npm run typecheck
   - node scripts/hookcheck.mjs components
   - node scripts/test.mjs tests/tabela-itens-extracao.test.mjs
   - node scripts/test.mjs tests/m2-challenger-stress.test.mjs
   - node scripts/ui-smoke.mjs
   - node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
5. Document all actions, command outputs, and results in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_2\handoff.md.
6. When done, send a message to the orchestrator.
