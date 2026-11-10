# Task Assignment: M1 Challenger 2 - PDF & Fiscal Edge Case Stress Testing

## Target
Empirically challenge the robustness of PDF DANFE parsing, UTF-8 BOM, zero-value items, and tax group edge cases in Milestone 1.

## Mandatory Inputs
- Original Request path: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md (YOU MUST READ THIS FILE VERBATIM FIRST)
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2
- Project Scope: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- Test Readiness: F:\Workspace\Apps\Aplicativo_MCM-\TEST_READY.md

## Scope & Instructions
1. Write adversarial test cases for:
   - PDF DANFE extraction with `pdf-parse: ^2.4.5` (verify class adapter `new PDFParse({ data: buffer })` works without throwing TypeError).
   - Non-standard XML structures: missing `<total>`, missing `<dest>`, UTF-8 BOM `\uFEFF`.
   - Dual-routing verification: calling `/api/auditoria-entrada?action=extrair` vs `/api/auditoria-entrada/extrair`.
2. Execute the verification commands:
   - `npm test`
   - `npm run typecheck`
   - `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
3. Formulate your explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Write your challenger report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2\handoff.md`.
5. Send completion message back with verdict and evidence.


## 2026-11-09T15:05:40Z
[Message] timestamp=2026-11-09T15:05:40Z sender=5db90b78-2923-4eca-9d94-d6c126a7f3be priority=MESSAGE_PRIORITY_HIGH content=You are m1_challenger_2. Your working directory is F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2.
You MUST read F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md and F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2\DISPATCH.md verbatim before starting.
Empirically stress-test Milestone 1 on PDF parsing resilience with pdf-parse v2, UTF-8 BOM, and dual routing. Run builds and tests. Formulate an explicit verdict: APPROVE or REQUEST_CHANGES.
Write your handoff report to F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2\handoff.md and notify your parent via send_message.


## 2026-11-09T15:16:01Z
[Message] timestamp=2026-11-09T15:16:01Z sender=5db90b78-2923-4eca-9d94-d6c126a7f3be priority=MESSAGE_PRIORITY_HIGH content=**Context**: Stress-testing de PDF DANFE e Casos de Borda do Milestone 1
**Content**: Gostaria de checar seu progresso e se seus testes empíricos de estresse em PDF/rotas estão sendo finalizados.
**Action**: Enviar status atualizado ou finalizar e entregar o `handoff.md`.
