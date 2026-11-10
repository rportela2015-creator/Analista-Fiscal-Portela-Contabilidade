# BRIEFING — 2026-11-09T16:51:00Z

## Mission
Investigar o ecossistema do app MCM e desenhar a arquitetura e especificações do novo componente `components/TabelaItensExtracao.tsx` para o Milestone 2.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: explorer, synthesizer
- Working directory: F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2
- Original parent: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Milestone: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do not modify source code files in F:\Workspace\Apps\Aplicativo_MCM-
- Write reports and analysis only in F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m2_explorer_2
- Produce comprehensive handoff.md following 5-component protocol

## Current Parent
- Conversation ID: 5db90b78-2923-4eca-9d94-d6c126a7f3be
- Updated: 2026-11-09T16:44:26Z

## Investigation State
- **Explored paths**: DISPATCH.md, ORIGINAL_REQUEST.md, PROJECT.md, lib/extrator-nfe.ts, components/AuditoriaEntrada.tsx, components/ParametrizacaoERP.tsx, app/globals.css, package.json, scripts/test.mjs, scripts/hookcheck.mjs, scripts/ui-smoke.mjs, scripts/ui-entry.tsx
- **Key findings**:
  1. Design system is pure CSS in `app/globals.css` (variables `--brand`, `--ok`, `--warn`, `--bad`, `--ink-2`; classes `.card`, `.badge`, `.table.tb`, `.scroll`, `.mono`, `.mini`, `.chip`). Neither `tailwindcss` nor `lucide-react` are installed in `package.json`.
  2. Strict React 19 rules enforced by `scripts/hookcheck.mjs`: zero hooks after returns or inside conditionals.
  3. Extractor contract (`ExtractedInvoiceData` and `ExtractedItem`) in `lib/extrator-nfe.ts` provides complete item metadata: `ncmValidoSiscomex`, `descricaoSiscomex`, `cest`, `tributos` (ICMS, IPI, PIS, COFINS, RTC), `sensivelParaAuditoria`, and `motivosSensibilidade`.
  4. Fully implemented reference component in `proposed_TabelaItensExtracao.tsx` validated with `hookcheck.mjs` (0 violations) and `esbuild` (0 errors).
- **Unexplored areas**: None. Component design, TypeScript interfaces, bulk operations, sensitivity mappings, and edge cases fully verified.

## Key Decisions Made
- Designed `TabelaItensExtracao` using native CSS classes and inline CSS variable styling to maintain 100% aesthetic consistency with `AuditoriaEntrada` and `ParametrizacaoERP`.
- Engineered tri-state master checkbox with `ref.current.indeterminate` inside top-level `useEffect` adhering to `hookcheck.mjs`.
- Implemented `useMemo` Set lookup for $O(1)$ selection checks across 100+ items.
- Built-in live search and quick filters ('todos', 'sensiveis', 'selecionados', 'inconsistentes').
- Included expandable rows for deep pericial breakdown of all tax components and official Siscomex descriptions.

## Artifact Index
- DISPATCH.md — Task assignment from parent
- BRIEFING.md — Persistent situational awareness
- progress.md — Liveness heartbeat
- proposed_TabelaItensExtracao.tsx — Production-ready reference code
- handoff.md — Final structured 5-component handoff report
