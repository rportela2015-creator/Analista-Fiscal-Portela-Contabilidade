# Progress — m1_explorer_it2_1

Last visited: 2026-11-09T15:30:00Z

## Status
- [x] Initialized DISPATCH.md and BRIEFING.md
- [x] Read mandatory reviewer handoffs and PROJECT.md
- [x] Inspected tests/e2e-auditoria-entrada.test.mjs in detail (lines 1-879)
- [x] Inspected lib/extrator-nfe.ts in detail (lines 1-843)
- [x] Inspected TypeScript execution / ESM runtime for running tests via esbuild / scripts/test.mjs
- [x] Traced schema / interface discrepancies between parseNFeXmlDeterministic output and extrairDadosXmlNfe output across Tiers 1-4:
  - T1.12: regimeDescricao divergence ('Regime Normal' vs 'Regime Normal (Lucro Presumido / Real)')
  - T1.20: IPI_DESTACADO sensitivity false positive on fixtureSingle
  - T2.04: NCM normalization representation (item.ncm '01012100' vs item.ncmOriginal '1012100')
  - T2.13: Error message regex match on empty input (/vazio ou inválido/ vs 'Conteúdo XML vazio ou não fornecido.')
  - Production robustness: XML attribute prefix collision (@_) in extrairTributosXml (ICMS, PIS, COFINS)
  - Production domain rule: Simples Nacional with CST 10, 20, etc.
  - Production route: app/api/auditoria-entrada/route.ts:191 slice(0, 15)
- [ ] Document concrete line-level recommendations and write handoff.md
- [ ] Notify parent agent
