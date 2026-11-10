# Test Infrastructure & E2E Test Harness (Aplicativo_MCM-)

**Date**: 2026-11-09T14:50:00Z  
**Author**: `e2e_test_writer_1`  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-`  

---

## 1. Overview & Architecture

The test infrastructure has been upgraded to support both targeted single-suite execution and full project verification across the two-stage inbound NF-e fiscal audit architecture.

- **Primary Test Runner**: `scripts/test.mjs`
  - Uses `esbuild` for on-the-fly TypeScript compilation (`target: 'node20'`, `format: 'esm'`).
  - Implements `inlineTs` plugin resolving pure TypeScript business logic in `lib/` and `@/` path aliases.
  - Supports target suite execution from CLI (e.g. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`).
  - Executes full project suite on no-argument invocation (`npm test`).
- **E2E Test Suite**: `tests/e2e-auditoria-entrada.test.mjs`
  - 54 comprehensive opaque-box tests structured across Tiers 1 to 4.
  - Strictly grounded in SEFAZ NF-e 4.0 XML schemas, official Siscomex NCM tables (10.515 records), LC 123/2006, LC 214/2025, and Convênio ICMS 142/2018.

---

## 2. Test Execution Commands

### Run Only the Inbound Audit E2E Suite
```bash
node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
```

### Run the Full Project Test Suite (17 Suites + Smoke + Hookcheck)
```bash
npm test
```

### Typecheck TypeScript
```bash
npm run typecheck
```

---

## 3. Synthetic Fixtures Inventory (`tests/fixtures/`)

| Fixture File | Scope / Purpose | Key Tax Conditions |
|---|---|---|
| `nfe-single-item.xml` | Single item baseline | Item 1: Notebook Dell (NCM 84713012, CFOP 5102, ICMS 00, IPI 50, PIS 01, COFINS 01) |
| `nfe-multi-5.xml` | Multi-item standard | 5 distinct products with mixed IPI, standard ICMS 18% |
| `nfe-multi-15.xml` | Legacy threshold | Exactly 15 items testing boundary of legacy route truncation |
| `nfe-multi-30.xml` | Zero-truncation proof | 30 items proving complete extraction without arbitrary 15-item cap |
| `nfe-multi-55.xml` | Extreme volume stress | 55 items testing parser performance and memory safety (< 350ms) |
| `nfe-malformed-ncm.xml` | NCM boundary tests | 7-digit NCM (`1012100`), non-existent NCM (`99999999`), Excel scientific notation (`8.4713E+07`), valid NCM |
| `nfe-simples-csosn102.xml` | Simples Nacional supplier | CRT 1, CSOSN 102 (no credit permission per LC 123/2006 art. 23) |
| `nfe-interstate-st.xml` | Interstate ST compliant | PR -> SP, CFOP 6102, NCM 22030000, CEST 0300100, CST 10 with MVA and ST |
| `nfe-interstate-st-nocest.xml` | Interstate ST non-compliant | PR -> SP, CFOP 6102, ST present but CEST absent (Convênio 142/2018 risk) |
| `nfe-missing-optional-tags.xml` | Optional tags omission | Book (NCM 49019900) without CEST, without IPI, without PIS/COFINS |
| `nfe-corrupted.xml` | Syntax corruption | Malformed, truncated XML tags triggering clean error handling |

Fixtures can be deterministically regenerated at any time via:
```bash
node scripts/generate-fixtures.mjs
```

---

## 4. Tier Structure & Metric Summary

```
Total Test Count: 54 / 54 PASS (100%)
──────────────────────────────────────────────────────────────────────
Tier 1: Feature Coverage            22 / 22 PASS (Target: >= 20)
Tier 2: Boundary & Corner Cases     21 / 21 PASS (Target: >= 20)
Tier 3: Cross-Feature Combinations   6 /  6 PASS (Target: >=  6)
Tier 4: Real-World & Zero Timeout    5 /  5 PASS (Target: >=  5)
──────────────────────────────────────────────────────────────────────
Execution Duration: ~1.2s
Zero 180s Timeouts Confirmed
```
