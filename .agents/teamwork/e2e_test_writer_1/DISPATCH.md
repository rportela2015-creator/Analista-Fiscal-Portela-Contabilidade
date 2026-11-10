# Task Assignment: E2E Test Suite Authoring (Tiers 1-4) & Test Infrastructure

## Target
Design and implement the complete opaque-box E2E test suite and test harness for the two-stage inbound NF-e audit architecture in `F:\Workspace\Apps\Aplicativo_MCM-`.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\e2e_test_writer_1
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Spec Miner Report: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\spec_miner_survey_3\handoff.md

## Scope & Instructions
1. Review existing test runner in `scripts/test.mjs` and existing tests in `tests/*.test.mjs`.
2. Create test fixtures (synthetic XML files) representing:
   - Single-item NF-e XML
   - Multi-item NF-e XML (e.g. 5 items, 15 items, 30 items)
   - Malformed / invalid NCM XML
   - Simples Nacional supplier with CSOSN 102 vs Regime Regular
   - ST / CEST combinations
3. Author comprehensive E2E test suite in `tests/e2e-auditoria-entrada.test.mjs` structured across 4 tiers:
   - **Tier 1 (Feature Coverage, >=20 tests)**:
     - Deterministic extraction: parses XML immediately, returns complete item list without LLM.
     - Zero truncation: verifies all items extracted (not capped at 15).
     - Field extraction: verifies all products, units, quantities, values, and tax codes (NCM, CFOP, CST, taxes).
     - Siscomex validation: instant O(1) NCM check.
     - Sensitivity tagging: correct `sensivelParaAuditoria` flags.
     - Ollama partitioned audit: processes items in micro-batches / individually.
     - Gemini API audit: processes selected items with Gemini config.
   - **Tier 2 (Boundary & Corner Cases, >=20 tests)**:
     - 1 item, 0 items selected, 50+ items.
     - 7-digit NCMs (normalized with leading zero).
     - Invalid / non-existent NCMs (flagged appropriately).
     - Missing optional tags (e.g. absent CEST, absent IPI, absent PIS/COFINS).
     - Empty file / corrupted XML / invalid buffer -> returns HTTP 400.
     - Zero items selected for audit -> validation error.
   - **Tier 3 (Cross-Feature Combinations, >=6 tests)**:
     - Simples Nacional supplier + Regime Regular buyer -> verifies credit prohibition.
     - Interstate purchase + ST NCM -> verifies ST/DIFAL alerts.
     - Multi-item invoice with selective item audit -> verifies only selected items are audited.
   - **Tier 4 (Real-World Application Scenarios, >=5 tests)**:
     - Full simulation of multi-item invoice entry: upload -> Stage 1 extraction (<200ms) -> selection of 3 sensitive items -> Stage 2 audit (Ollama / Gemini) -> verification of ERP parameterization output and ABSENCE OF 180s TIMEOUT.
4. Verify that running `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs` executes cleanly.
5. Create `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\orchestrator\TEST_INFRA.md` and `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\orchestrator\TEST_READY.md` documenting the runner, tier counts, and feature checklist.
6. Write your report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\e2e_test_writer_1\handoff.md` and send completion message.


## 2026-11-09T14:38:28Z
You are e2e_test_writer_1. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\e2e_test_writer_1.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\e2e_test_writer_1\DISPATCH.md verbatim before starting.
Design and implement the complete opaque-box E2E test suite in tests/e2e-auditoria-entrada.test.mjs covering Tiers 1-4 (feature coverage, boundary/corner cases, cross-feature combinations, real-world multi-item workloads testing zero timeout).
Create TEST_INFRA.md and TEST_READY.md in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\orchestrator\ when complete.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\e2e_test_writer_1\handoff.md and notify your parent via send_message.
