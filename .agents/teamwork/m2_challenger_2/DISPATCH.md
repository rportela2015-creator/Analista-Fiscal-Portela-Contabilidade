# Task Assignment: M2 Component Smoke & DOM Stress Challenger

**Role**: `teamwork_challenger`
**Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_2`
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## Objective
Empirically stress-test React 19 rendering, JSDOM mounting, and UI smoke stability:
1. Run `node scripts/ui-smoke.mjs` and examine DOM rendering.
2. Author and run an empirical test harness:
   - Rapid mount/update/unmount cycles of `<AuditoriaEntrada />` and `<TabelaItensExtracao />` to verify zero memory leaks or unhandled promise rejections.
   - Verify SSR string rendering (`ReactDOMServer.renderToString`) to ensure zero browser-only crashes during server rendering.
   - Verify download handlers in headless environments (check that `typeof window` guards protect against crashes).
   - Verify that hook count and order remain strictly fixed across all possible UI states (empty, extracting, extracted, auditing, audited).

## Mandatory Files to Read
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\scripts\ui-smoke.mjs`
- `F:\Workspace\Apps\Aplicativo_MCM-\scripts\ui-entry.tsx`
- `F:\Workspace\Apps\Aplicativo_MCM-\scripts\hookcheck.mjs`

## Output Requirements
Write handoff report to `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_2\handoff.md` with:
Observation, Logic Chain, Caveats, Conclusion (Verdict: **APPROVE** or **REQUEST_CHANGES**), Verification Method.

## 2026-11-09T17:12:57Z
Você é o Agente m2_challenger_2 (teamwork_challenger).
Seu objetivo é testar empiricamente a estabilidade do DOM, montagem/desmontagem JSDOM, renderização SSR e conformidade de hooks do React 19 no Milestone 2.

Diretório de trabalho: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_2
Leia atentamente:
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_2\DISPATCH.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\ORIGINAL_REQUEST.md
- F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\PROJECT.md
- F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\components\TabelaItensExtracao.tsx
- F:\Workspace\Apps\Aplicativo_MCM-\scripts\ui-smoke.mjs
- F:\Workspace\Apps\Aplicativo_MCM-\scripts\hookcheck.mjs

Escreva harnesses de estresse empírico (ex: múltiplos ciclos de montagem/atualização/desmontagem em JSDOM, renderToString SSR, checagens de headless downloads), execute-os e reporte o resultado com veredito (APPROVE ou REQUEST_CHANGES) em:
F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_challenger_2\handoff.md
Ao finalizar, envie uma mensagem concisa ao parent reportando o veredito e o caminho do handoff.
