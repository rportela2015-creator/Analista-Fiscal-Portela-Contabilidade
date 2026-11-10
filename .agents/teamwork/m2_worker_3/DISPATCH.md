# Task Assignment: M2 Remediation Worker (Iteration 3)

**Role**: `teamwork_worker`  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_3`  
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle (Iteration 3 Remediation)  
**Original Request**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md` (You MUST read this before starting work).  
**Exclusive Write Ownership**:
- `components/TabelaItensExtracao.tsx`

---

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

---

## Objective
Apply the exact drop-in fixes identified by `m2_challenger_it2_2`:

1. **Fix Alphanumeric Search False-Positives in `components/TabelaItensExtracao.tsx`**:
   Currently, queries with letters and digits (e.g. "CADERNO-1", "S24", "ITEM-1") make `termoNumerico.length > 0` (e.g. "1"), which triggers `it.ncm.includes("1")` and leaks unrelated items into search results.
   Replace lines ~163-174 with:
   ```typescript
   if (busca.trim()) {
     const termo = busca.trim().toLowerCase();
     const termoNumerico = termo.replace(/\D/g, '');
     const isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2;
     res = res.filter((it) => {
       return (
         (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
         (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
         (isNcmQuery && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)) ||
         (it.cfop && it.cfop.includes(termo)) ||
         (it.cEAN && it.cEAN.includes(termo))
       );
     });
   }
   ```

2. **Fix Missing Null Guard on `cfop.startsWith` in `components/TabelaItensExtracao.tsx`**:
   Around line 569, replace:
   ```typescript
   {(item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
   ```
   with:
   ```typescript
   {item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
   ```

3. **Run Verification Commands**:
   - `npm run typecheck`
   - `node scripts/hookcheck.mjs components`
   - `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`
   - `node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs`
   - `node scripts/test.mjs tests/m2-challenger-stress.test.mjs`
   - `node scripts/test.mjs tests/m2-ssr-stress.tsx`
   - `node scripts/ui-smoke.mjs`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`

## Output Requirements
Write `handoff.md` at `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_3\handoff.md` documenting the exact changes, test execution commands, and output logs.
Then use `send_message` to notify the orchestrator.


## 2026-11-09T19:34:41Z
[Message] timestamp=2026-11-09T19:34:41Z sender=9730c36f-6867-4776-9dd9-88da718cd7da priority=MESSAGE_PRIORITY_HIGH content=You are m2_worker_3 (teamwork_worker).
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_3.
You MUST read:
1. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
2. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_3\DISPATCH.md
3. F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_it2_2\handoff.md

Follow all instructions in DISPATCH.md precisely.
MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You have exclusive write ownership over:
- components/TabelaItensExtracao.tsx

Perform the required fixes:
1. Fix alphanumeric search false-positives with `isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2`.
2. Fix missing null guard on line 569 for `cfop.startsWith`: `{item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (`.
3. Run all verification commands:
   - npm run typecheck
   - node scripts/hookcheck.mjs components
   - node scripts/test.mjs tests/tabela-itens-extracao.test.mjs
   - node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs
   - node scripts/test.mjs tests/m2-challenger-stress.test.mjs
   - node scripts/test.mjs tests/m2-ssr-stress.tsx
   - node scripts/ui-smoke.mjs
   - node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
4. Document all actions, command outputs, and results in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_worker_3\handoff.md.
5. When done, send a message to the orchestrator.
