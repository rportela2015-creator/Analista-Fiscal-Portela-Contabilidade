# Handoff Report — M2 Worker 3 (Remediation Iteration 3)

**Agent**: `m2_worker_3` (`teamwork_worker`)  
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle (Iteration 3 Remediation)  
**Date**: 2026-11-09T19:39:00Z  
**Verdict**: **COMPLETE / READY FOR AUDIT & RE-CHALLENGE**  

---

## 1. Observation

### 1.1 Direct Defect Observations from m2_challenger_it2_2
Inspection of `components/TabelaItensExtracao.tsx` confirmed two defects identified by `m2_challenger_it2_2`:

1. **Alphanumeric Search False-Positives** (lines 163-174):
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
   When searching for alphanumeric SKU terms like `"CADERNO-1"` or `"S24"`, `termoNumerico` became `"1"` (`termoNumerico.length > 0 === true`), causing `it.ncm.includes("1")` to match nearly all products in the invoice whose 8-digit NCM contained digit `1`.

2. **Missing Null Guard on `cfop.startsWith`** (lines 566-579):
   ```typescript
   <td>
     <span className="mono" style={{ fontWeight: 600 }}>
       {item.cfop || '----'}
     </span>
     {(item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
       <div style={{ marginTop: 2 }}>
         <span
           className="badge media"
           style={{ fontSize: 9.5, padding: '1px 4px' }}
           title="CFOP Interestadual (sujeito a DIFAL)"
         >
           Inter
         </span>
       </div>
     )}
   </td>
   ```
   While line 567 safely used `{item.cfop || '----'}`, line 569 called `(item.cfop.startsWith('6') || item.cfop.startsWith('2'))` directly without checking if `item.cfop` was non-null/non-undefined, resulting in unhandled `TypeError: Cannot read properties of undefined (reading 'startsWith')`.

### 1.2 Modifications Applied
In `components/TabelaItensExtracao.tsx`:

- **Fix 1 (lines 163-175)**:
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

- **Fix 2 (line 570)**:
  ```typescript
  {item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
  ```

### 1.3 Verbatim Execution of All Required Verification Commands

1. `npm run typecheck`:
   ```
   > classificador-ncm@1.0.0 typecheck
   > tsc --noEmit
   (Exit code 0)
   ```

2. `node scripts/hookcheck.mjs components`:
   ```
   hookcheck OK ✓ (9 arquivos, ordem de hooks fixa em todo render)
   (Exit code 0)
   ```

3. `node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`:
   ```
   ──────── tests/tabela-itens-extracao.test.mjs ────────
   OK  Seleção Individual: alternar estado de um único item por índice (toggle)
   OK  Selecionar Todos: marca 100% dos itens da nota fiscal sem truncamento
   OK  Desmarcar Todos: limpa completamente o conjunto de itens selecionados
   OK  Selecionar Apenas Sensíveis: filtra exclusivamente itens com sensivelParaAuditoria === true
   OK  Estado Tri-State do Master Checkbox: cálculo exato de checked e indeterminate
   OK  Seletor de Motor: comuta entre ollama e gemini preservando rigorosamente a seleção de itens
   OK  Seleção de Modelo Ollama: seleciona qwen2.5:7b como padrão e aceita qwen3.5:4b e variantes
   OK  Payload Builder: monta AuditRequestPayload conforme Contrato M2 ↔ M3 para Ollama Local
   OK  Payload Builder: monta AuditRequestPayload para Google Gemini API Cloud com modelo fixado
   OK  Payload Builder: aceita tanto Set<number> quanto number[] para selectedIndices
   OK  Guard Rail: Seleção vazia (0 itens) é rejeitada com erro impeditivo
   OK  Guard Rail: Motor desconhecido/inválido é bloqueado
   OK  Guard Rail: Regime do adquirente ausente ou em branco é bloqueado
   OK  Métricas Financeiras: acumula com precisão valor de produtos e tributos dos itens selecionados
   OK  Desempenho: Lookup O(1) em Set<number> para 200 itens executa em <2ms
   OK  Renderização de UI: TabelaItensExtracao renderiza cabeçalho, colunas e badges
   OK  Renderização de UI: TabelaItensExtracao exibe aviso explicativo quando 0 itens selecionados
   OK  Renderização de UI: TabelaItensExtracao trata lista vazia graciosamente
   OK  Filtragem e Busca: filtra itens por termo textual (cProd, xProd, NCM e CFOP)
   OK  Adaptador ERP: achata resultado da auditoria mantendo compatibilidade com ParametrizacaoERP

   ══════════════════════════════════════════════════════════════════════
     SUÍTE TABELA ITENS EXTRAÇÃO: 20 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

4. `node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs`:
   ```
   ──────── tests/m2-challenger-boundary-stress.test.mjs ────────
   ══════════════════════════════════════════════════════════════════════
     M2 CHALLENGER — ADVERSARIAL BOUNDARY & DOM HARNESS (IT2_2)         
   ══════════════════════════════════════════════════════════════════════
   OK (5.58ms)  Boundary 0 Itens: TabelaItensExtracao renderiza mensagem amigável sem tabela
   OK (0.44ms)  Boundary 0 Itens: TabelaItensExtracao aceita array vazio e Set vazio sem lançar exceção
   OK (0.33ms)  Boundary 0 Itens: montarAuditRequestPayload rejeita seleção vazia com FiscalExtractionError
   OK (16.11ms)  Boundary 1 Item: Estado Desmarcado (0/1) exibe singularidade gramatical e alerta
   OK (2.06ms)  Boundary 1 Item: Estado Selecionado (1/1) calcula checked=true e indeterminate=false
   OK (0.11ms)  Boundary 1 Item: montarAuditRequestPayload produz payload perfeitamente tipado com 1 item
   OK (2.43ms)  Missing Optionals: Item sem EAN, CEST, Siscomex, Frete ou Tributos renderiza sem crash
   OK (1.95ms)  Missing Optionals: Item com EAN="SEM GTIN" não exibe label de EAN
   OK (1.89ms)  Malformed Items: valores vazios ("") em cProd, xProd, ncm e cfop exibem fallbacks seguros
   OK (1.70ms)  Malformed Items: valores numéricos anômalos (NaN, undefined, null) em formatadores
   OK (0.14ms)  Remediation Check: Busca alfabética sem algarismos NÃO retorna todos os itens
   OK (4.09ms)  Remediation Check: Sincronização estrita de selectedCount com itens reais (sem índices fantasmas)
   OK (739.80ms)  JSDOM DOM: Montagem, eventos de clique, tri-state checkbox e desmontagem limpa
   OK (194.30ms)  XML Fixtures: Todas as 8 fixtures do projeto renderizam em TabelaItensExtracao sem exceções
   OK (0.12ms)  Vulnerabilidade Empírica: Busca alfanumérica com dígitos isolados vaza itens de NCMs coincidentes
   OK (0.07ms)  Vulnerabilidade Empírica: Falta de guarda defensiva em item.cfop.startsWith causa TypeError com cfop undefined

   ══════════════════════════════════════════════════════════════════════
     M2 CHALLENGER ADVERSARIAL HARNESS: 16 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

5. `node scripts/test.mjs tests/m2-challenger-stress.test.mjs`:
   ```
   ──────── tests/m2-challenger-stress.test.mjs ────────
   ══════════════════════════════════════════════════════════════════════
      M2 CHALLENGER — EMPIRICAL ADVERSARIAL STRESS SUITE (500 ITENS)    
   ══════════════════════════════════════════════════════════════════════
   OK (1.00ms)  Estresse Volumetria: 500 itens gerados com 100% de integridade estrutural
   OK (0.09ms)  Benchmark Latência: 500 toggles sequenciais executam em < 1.0ms total (< 0.002ms/toggle)
   OK (0.56ms)  Benchmark Lote: Selecionar Todos, Desmarcar Todos e Selecionar Sensíveis em 500 itens em < 2.0ms
         -> Render SSR 100 itens: 102.77ms (267 KB)
         -> Render SSR 250 itens: 184.95ms (649 KB)
         -> Render SSR 500 itens: 230.57ms (1303 KB)
   OK (527.85ms)  Benchmark Renderização SSR: Tabela com 100, 250 e 500 itens renderiza sem estouro de memória
   OK (2.91ms)  Benchmark Payload M2 ↔ M3: montagem de payload com 500 itens selecionados em < 3.0ms
   OK (0.57ms)  Tri-state Master Checkbox: comportamento analítico em nota com 1 item (sem indeterminate)
   OK (0.08ms)  Tri-state Master Checkbox: matriz completa de combinações em 500 itens
   OK (0.18ms)  Tri-state Master Checkbox: simulação de inversão e alternância contínua
   OK (205.32ms)  Sensíveis Extremo: nota com 0% de itens sensíveis (500 itens todos regulares)
   OK (305.21ms)  Sensíveis Extremo: nota com 100% de itens sensíveis (500 itens todos sensíveis)
   OK (3.20ms)  Sensíveis Robustez: item com sensivelParaAuditoria=true mas motivosSensibilidade ausente ou vazio
   OK (0.40ms)  Busca Textual: caracteres de controle Regex não causam crash ou exceção de compilação
   OK (0.22ms)  Vulnerabilidade Empírica: Busca com string puramente alfabética não filtra devido a ncm.includes("")
   OK (0.09ms)  Vulnerabilidade Empírica: Desincronização do Master Checkbox com índices fantasmas/órfãos
   OK (0.14ms)  Filtros de Categoria: isolamento estrito entre chips (sensiveis, selecionados, inconsistentes)
   OK (0.32ms)  Guard Rail: montarAuditRequestPayload rejeita seleção vazia com Set vazio e array vazio
   OK (0.11ms)  Guard Rail: índices selecionados fantasmas/inexistentes (ex: [9999]) são filtrados e rejeitados
   OK (0.06ms)  Guard Rail: mescla de índices válidos e fantasmas filtra estritamente os válidos
   OK (0.13ms)  Guard Rail: validação de motor rejeita valores arbitrários e garante gemini-3.8-flash
   OK (0.09ms)  Guard Rail: regime vazio ou somente espaços é bloqueado
   OK (0.07ms)  Contrato M2 ↔ M3: normalização de UF destino para maiúsculas e fallback automático
   OK (0.12ms)  Adaptador ERP: lida com objeto de resultado completamente vazio sem lançar exceção
   OK (0.13ms)  Adaptador ERP: aceita tanto formato de NCM string quanto NCM objeto ({ auditado, declarado })

   ══════════════════════════════════════════════════════════════════════
     SUÍTE ADVERSARIAL M2: 23 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
     RELATÓRIO EMPÍRICO DE PERFORMANCE E BENCHMARK:
     - [500_toggles_sequential]: 0.037 ms 
     - [bulk_actions_500_items]: 0.081 ms 
     - [ssr_render_100_items]: 102.771 ms (HTML: 272905 bytes)
     - [ssr_render_250_items]: 184.951 ms (HTML: 664921 bytes)
     - [ssr_render_500_items]: 230.574 ms (HTML: 1334120 bytes)
     - [payload_assembly_500_items]: 0.140 ms 
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

6. `node scripts/test.mjs tests/m2-ssr-stress.tsx`:
   ```
   ──────── tests/m2-ssr-stress.tsx ────────
   ══════════════════════════════════════════════════════════════════════
     M2 EMPIRICAL STRESS: SSR (ReactDOMServer.renderToString)
     Ambiente: Node.js puro (window === undefined, document === undefined)
   ══════════════════════════════════════════════════════════════════════
   OK  SSR: AuditoriaEntrada renderiza formulário de upload sem window/document
   OK  SSR: TabelaItensExtracao renderiza mensagem vazia graciosamente
   OK  SSR: TabelaItensExtracao renderiza nota de item único (nfe-single-item)
   OK  SSR: TabelaItensExtracao renderiza 15 itens com badges tributárias e Siscomex
   OK  SSR: TabelaItensExtracao renderiza 55 itens sem estouro de pilha
   OK  SSR: TabelaItensExtracao renderiza CSOSN e crédito do Simples Nacional
   OK  SSR: TabelaItensExtracao renderiza CFOP interestadual e Substituição Tributária (ST)
   OK  SSR: TabelaItensExtracao renderiza badge de NCM inválido com fixture malformada
   OK  SSR: TabelaItensExtracao lida com tags tributárias ausentes sem crash
   OK  SSR: ParametrizacaoERP renderiza em SSR sem invocar window.open ou createObjectURL
   OK  SSR: TabelaItensExtracao aceita tanto array number[] quanto Set<number>
   OK  SSR: TabelaItensExtracao lida com índices fantasmas/órfãos sem desincronizar contagem
   OK  SSR: TabelaItensExtracao suporta busca alfabética e numérica com guard termoNumerico

   SSR COMPLETO: 13 aprovados, 0 falhas.
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

7. `node scripts/ui-smoke.mjs`:
   ```
   OK  Classificar: formulário renderiza
   ...
   OK  Auditoria de Entrada: renderiza com dados
   OK  React: nenhum aviso de hook/key/estado entre renders
   UI SMOKE OK ✓ (componentes montados, atualizados e desmontados em DOM real)
   (Exit code 0)
   ```

8. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`:
   ```
   ──────── tests/e2e-auditoria-entrada.test.mjs ────────
   ══════════════════════════════════════════════════════════════════════
     RELATÓRIO DE EXECUÇÃO DA SUÍTE E2E
   ══════════════════════════════════════════════════════════════════════
     Tier 1 (Feature Coverage):        22/22 OK
     Tier 2 (Boundary & Corner Cases): 21/21 OK
     Tier 3 (Cross-Feature):           6/6 OK
     Tier 4 (Real-World & 0 Timeout):  5/5 OK
   ──────────────────────────────────────────────────────────────────────
     TOTAL: 54 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

---

## 2. Logic Chain

1. **Root Cause Analysis of Alphanumeric Search Issue**:
   - Observation 1.1 showed that searching for `"CADERNO-1"` generated `termoNumerico = "1"`.
   - The expression `(termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico))` evaluated to `true` for all items whose NCM contained `"1"`.
   - An NCM code is strictly numerical (e.g. `8471.30.12`). If the search string contains alphabetic characters (like SKU or product description), the user is looking for item names or codes, not an NCM code.
   - By defining `isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2`, NCM search only activates when the query contains no alphabet letters and at least 2 digits (e.g. `"84"`, `"8471"`).
   - Direct verification proved:
     - `"CADERNO-1"` matches only `[ 'CADERNO-1' ]` (length 1 instead of 3).
     - `"9608"` matches `[ 'CANETA-AZUL' ]` (length 1).
     - Both textual queries and NCM queries now function with precision and zero false-positive leakage.

2. **Root Cause Analysis of CFOP startsWith Crash**:
   - Observation 1.1 showed that if `item.cfop` was `undefined`, evaluating `(item.cfop.startsWith('6') || item.cfop.startsWith('2'))` triggered a fatal `TypeError`.
   - Guarding the expression with `item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2'))` ensures that whenever `item.cfop` is null or undefined, the expression safely short-circuits to `undefined`/falsy without throwing an exception.
   - All tests render cleanly and resiliently.

---

## 3. Caveats

- **Scope boundaries**: Changes were strictly limited to `components/TabelaItensExtracao.tsx` under exclusive write ownership. No auxiliary or facade files were modified or created.
- **No caveats**: All 8 suites passed cleanly with 0 failures, 0 regressions, and full compatibility across SSR, DOM, and typechecking.

---

## 4. Conclusion

Both empirical defects identified by `m2_challenger_it2_2` have been cleanly and permanently resolved in `components/TabelaItensExtracao.tsx`.
All 8 project verification suites pass with 100% success rate:
- TypeScript compilation: 0 errors
- React Hooks rules: 0 violations across all 9 components
- TabelaItensExtracao unit tests: 20/20 PASS
- Boundary stress test harness: 16/16 PASS
- Empirical stress suite (500 items): 23/23 PASS
- SSR render stress: 13/13 PASS
- UI smoke suite: PASS
- End-to-end auditoria entrada (Tiers 1-4): 54/54 PASS

The component is ready for audit and re-challenge.

---

## 5. Verification Method

To independently verify this remediation, run the following commands from the project root:

```powershell
Set-Location 'F:\Workspace\Apps\Aplicativo_MCM-'

# 1. Typecheck
npm run typecheck

# 2. React Hook Check
node scripts/hookcheck.mjs components

# 3. Component Test Suite
node scripts/test.mjs tests/tabela-itens-extracao.test.mjs

# 4. Challenger Boundary Stress Suite
node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs

# 5. Challenger Empirical Adversarial Stress Suite (500 items)
node scripts/test.mjs tests/m2-challenger-stress.test.mjs

# 6. SSR Stress Test
node scripts/test.mjs tests/m2-ssr-stress.tsx

# 7. UI Smoke Test
node scripts/ui-smoke.mjs

# 8. Full E2E Test Suite
node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs

# 9. Empirical Verification of Fixes (Search precision + CFOP null guard)
node -e "
const itens = [
  { cProd: 'CANETA-AZUL', xProd: 'Caneta esferográfica azul', ncm: '96081000' },
  { cProd: 'BORRACHA', xProd: 'Borracha escolar', ncm: '40169200' },
  { cProd: 'CADERNO-1', xProd: 'Caderno 1 matéria', ncm: '48201000' }
];
const busca = 'CADERNO-1';
const termo = busca.trim().toLowerCase();
const termoNumerico = termo.replace(/\D/g, '');
const isNcmQuery = !/[a-z]/i.test(termo) && termoNumerico.length >= 2;
const res = itens.filter(it => (it.cProd && it.cProd.toLowerCase().includes(termo)) || (it.xProd && it.xProd.toLowerCase().includes(termo)) || (isNcmQuery && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)));
console.log('Busca CADERNO-1 retorna 1 item apenas:', res.length === 1 && res[0].cProd === 'CADERNO-1');

const itemSemCfop = { cfop: undefined };
const isInter = itemSemCfop.cfop && (itemSemCfop.cfop.startsWith('6') || itemSemCfop.cfop.startsWith('2'));
console.log('Guarda item.cfop não quebra com undefined:', isInter === undefined);
"
```
