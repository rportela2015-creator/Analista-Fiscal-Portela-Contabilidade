# Task Assignment: M1 Worker 2 — Remediation & Direct E2E Integration

## Mission
Apply the verified line-level fixes across `lib/extrator-nfe.ts`, `app/api/auditoria-entrada/route.ts`, `tests/e2e-auditoria-entrada.test.mjs`, and `tests/extrator-nfe.test.mjs`. Connect `tests/e2e-auditoria-entrada.test.mjs` directly to production code `lib/extrator-nfe.ts` to eliminate self-certification and pass all 54 E2E tests, unit tests, and challenger stress tests.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Mandatory Inputs (Read these first)
- Original Request path: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md` (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_2`
- Handoff from Explorer IT2-1: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_1\handoff.md`
- Handoff from Explorer IT2-2: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\handoff.md`
- Patch from Explorer IT2-2: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\m1_it2_2_fixes.patch`
- Handoff from Explorer IT2-3: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_3\handoff.md`

## Exact Line-Level Fixes to Apply

### 1. `tests/e2e-auditoria-entrada.test.mjs`
- **Imports (top of file)**:
  Import `extrairDadosXmlNfe`, `extrairDadosNfe`, `FiscalExtractionError` from `../lib/extrator-nfe.ts`.
- **Eliminate Mock Oracle (lines 49-208)**:
  Update `parseNFeXmlDeterministic`:
  ```javascript
  function parseNFeXmlDeterministic(xmlString, mapaD8) {
    return extrairDadosXmlNfe(xmlString, mapaD8);
  }
  ```
- **Test T2.04 (lines 551-559)**:
  Update assertion to check both declared and normalized NCM:
  ```javascript
  assert.ok(item7Digitos.ncm === '1012100' || item7Digitos.ncmOriginal === '1012100', 'NCM declarado deve ser preservado');
  assert.equal(item7Digitos.ncmValidoSiscomex, true, 'Deve ser validado positivamente no Siscomex');
  ```
- **Test T2.13 (lines 607-610)**:
  Update error assertion regex:
  ```javascript
  assert.throws(() => parseNFeXmlDeterministic('', mapaD8), /(vazio|ARQUIVO_VAZIO|não fornecido)/);
  assert.throws(() => parseNFeXmlDeterministic('   ', mapaD8), /(vazio|ARQUIVO_VAZIO|não fornecido)/);
  ```

### 2. `lib/extrator-nfe.ts`
- **Line 188 (`getRegimeDescricao`)**:
  Change CRT 3 return value from `'Regime Normal (Lucro Presumido / Real)'` to `'Regime Normal'`.
- **Lines 168-182 (`parseNumber` and `parseOptionalNumber`)**:
  Handle Brazilian currency thousands dots:
  ```typescript
  function parseNumber(val: any): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let s = String(val).trim();
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function parseOptionalNumber(val: any): number | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    if (typeof val === 'number') return isNaN(val) ? undefined : val;
    let s = String(val).trim();
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  }
  ```
- **Lines 276-290 (`avaliarSensibilidadeFiscal`)**:
  - Expand Simples Nacional inconsistencies:
    ```typescript
    } else if (isFornecedorSimples && (cstIcms === '00' || (!csosn && ['10', '20', '30', '40', '41', '50', '51', '60', '70', '90'].includes(cstIcms)))) {
      motivos.push('INCONSISTENCIA_SIMPLES_COM_CST_NORMAL');
    }
    ```
  - Refine IPI sensitivity so standard industrial clean items (CST 50, 10% IPI) don't trigger false positives in T1.20, while preserving audit triggers for credit restrictions:
    ```typescript
    // 6. IPI: Sensibilidade pericial (vedação de crédito para Simples/Consumo, fornecedor Simples indevido ou CST inconsistente)
    const cstIpi = item.tributos.cstIpi || '';
    const hasIpi = (item.tributos.vIPI ?? 0) > 0 || (item.tributos.pIPI ?? 0) > 0;
    const isAdquirenteSimples = Boolean(contexto?.regime?.toLowerCase().includes('simples'));
    const isAdquirenteConsumo = Boolean(
      contexto?.finalidade?.toLowerCase().includes('consumo') ||
      contexto?.finalidade?.toLowerCase().includes('imobilizado')
    );
    const ipiComVedacaoCredito = hasIpi && (isAdquirenteSimples || isAdquirenteConsumo);
    const ipiFornecedorSimplesIndevido = isFornecedorSimples && (hasIpi || cstIpi === '50');
    const ipiIsentoComValor = ['51', '52', '53', '54', '55'].includes(cstIpi) && (item.tributos.vIPI ?? 0) > 0;
    const ipiAtipico = cstIpi === '99' || (/^[0-4]/.test(cstIpi) && cstIpi.length === 2);

    if (ipiComVedacaoCredito || ipiFornecedorSimplesIndevido || ipiIsentoComValor || ipiAtipico) {
      motivos.push('IPI_DESTACADO');
    }
    ```
- **Lines 321, 354, 366 (`extrairTributosXml`)**:
  Filter `@_` attribute collision:
  ```typescript
  const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
  const icmsGroup = subKey ? imp.ICMS[subKey] : undefined;
  ...
  const subKey = Object.keys(imp.PIS).find((k) => !k.startsWith('@_'));
  const pisGroup = subKey ? imp.PIS[subKey] : undefined;
  ...
  const subKey = Object.keys(imp.COFINS).find((k) => !k.startsWith('@_'));
  const cofinsGroup = subKey ? imp.COFINS[subKey] : undefined;
  ```
- **Line 424**:
  Update empty XML error message to `'Conteúdo XML vazio ou inválido.'`.
- **Lines 648-651 (Chave de Acesso fallback regex)**:
  Add capture groups and safe fallback:
  ```typescript
  const chaveMatch = text.match(/(?:CHAVE DE ACESSO|Chave de Acesso)[\s:]*([0-9\s]{44,60})/i) ||
                     text.match(/\b((?:\d{4}\s+){10}\d{4})\b/) ||
                     text.match(/\b(\d{44})\b/);
  const chaveAcesso = chaveMatch ? (chaveMatch[1] || chaveMatch[0]).replace(/\s+/g, '') : undefined;
  ```
- **Line 656 (Data de Emissão regex)**:
  Include preposition "DE":
  ```typescript
  const dataMatch = text.match(/DATA\s+(?:(?:DA|DE)\s+)?EMISS[AÃ]O[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
  ```

### 3. `tests/extrator-nfe.test.mjs`
- **Line 260**:
  Update expectation from `'Regime Normal (Lucro Presumido / Real)'` to `'Regime Normal'`.

### 4. `app/api/auditoria-entrada/route.ts`
- **Lines 147-187 (`extrairResumoImposto`)**:
  Filter `@_` for ICMS, PIS, COFINS:
  ```typescript
  const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
  const icmsGroup = subKey ? (imp.ICMS[subKey] as any) : undefined;
  ```
- **Lines 191-208**:
  Eliminate `itens.slice(0, 15)`. Map over all `itens`:
  ```typescript
  const detExtraido = itens.map((d: any) => ({ ... }));
  ...
  itensAuditados: itens.length,
  ```

## Mandatory Verification Commands
Run each of the following commands and report results in `handoff.md`:
1. `npm run typecheck`
2. `npm test`
3. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
4. `node scripts/test.mjs tests/m1-challenger-stress.test.mjs`
5. `node scripts/test.mjs tests/adversarial-m1.test.mjs`

## Completion Criteria
- All 5 verification commands pass with exit code 0.
- `tests/e2e-auditoria-entrada.test.mjs` calls `extrairDadosXmlNfe` directly with zero internal mock oracle.
- Write handoff report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_2\handoff.md` and send message to parent.


## 2026-11-09T16:15:29Z
You are m1_worker_2, a teamwork_worker.
Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_2.
Your task is defined in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_2\DISPATCH.md.
MANDATORY: Read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md first before doing anything else.
Apply the verified line-level fixes across tests/e2e-auditoria-entrada.test.mjs, lib/extrator-nfe.ts, tests/extrator-nfe.test.mjs, and app/api/auditoria-entrada/route.ts.
Run all 5 mandatory verification commands:
1. npm run typecheck
2. npm test
3. node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
4. node scripts/test.mjs tests/m1-challenger-stress.test.mjs
5. node scripts/test.mjs tests/adversarial-m1.test.mjs
Write your handoff to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_2\handoff.md and notify me via send_message.
