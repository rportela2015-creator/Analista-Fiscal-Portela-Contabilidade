# Forensic Audit Report — Milestone 2 (Iteration 2)

**Work Product**: Milestone 2 Interactive Tabular UI, Item Selection, Engine Toggle & Payload Assembly  
**Target Artifacts**:
- `components/TabelaItensExtracao.tsx`
- `components/AuditoriaEntrada.tsx`
- `tests/tabela-itens-extracao.test.mjs`
- `tests/m2-challenger-stress.test.mjs`
- `tests/m2-ssr-stress.tsx`
- `lib/extrator-nfe.ts` (`montarAuditRequestPayload`)

**Auditor**: `m2_auditor_it2_1` (`teamwork_auditor`)  
**Profile**: General Project  
**Integrity Mode**: `development` (per `ORIGINAL_REQUEST.md`, line 8)  
**Date**: 2026-11-09T19:26:00Z  
**Verdict**: **CLEAN**

---

## 1. Observation

Direct empirical observations from independent source code inspection and test execution:

### 1.1 Source Code Forensic Analysis (Zero Hardcoding & Zero Facades)
1. **`components/TabelaItensExtracao.tsx` (937 linhas)**:
   - **Gerenciamento de Estado**: Hooks chamados estritamente no topo (linhas 111-127: `useState`, `useRef`, `useMemo`), cumprindo as regras de renderização do React e validado por `scripts/hookcheck.mjs`.
   - **Sincronização Master Checkbox**: `selectedCount` (linhas 124-126) calcula estritamente itens presentes na nota atual (`itens.filter((it) => selectedSet.has(it.index)).length`). Desconsidera índices órfãos/fantasmas, eliminando desincronização entre o Master Checkbox e as linhas reais.
   - **Busca Textual com Guarda Numérica**: Linhas 164-173 utilizam `const termoNumerico = termo.replace(/\D/g, '')` com a guarda `(termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico))`, impedindo que buscas puramente alfabéticas gerem `ncm.includes("") === true`.
   - **Renderização Dinâmica Autêntica**: Não há dados estáticos ou tabelas mockadas embutidas. Linhas 458-879 iteram sobre `itensExibidos.map()`, renderizando dinamicamente valores monetários (`formatarBrl`), tributos (`tributos.vICMS`, `vIPI`, `vPIS`, `vCOFINS`), alíquotas (`formatarPct`), códigos (`cProd`, `cEAN`, `ncm`, `cfop`, `cest`), badges Siscomex e detalhamento pericial.

2. **`components/AuditoriaEntrada.tsx` (632 linhas)**:
   - **Fluxo em Duas Etapas**: Separação clara entre Etapa 1 (Upload determinístico sem LLM via `/api/auditoria-entrada/extrair`, linhas 115-154) e Etapa 2 (Seleção e envio seletivo via `/api/auditoria-entrada/auditar`, linhas 198-256).
   - **Gerenciamento de Seleção**: Handlers autênticos (`handleToggleSelect`, `handleSelectAll`, `handleDeselectAll`, `handleSelectOnlySensitive`, linhas 157-181) com imutabilidade em `Set<number>`.
   - **Seletor de Motor Duplo**: Alternância de estado genuína entre `'ollama'` (IA Local RX 580) e `'gemini'` (Google Gemini API), linhas 412-520, sem perdas de seleção de itens.
   - **Adaptador ERP (`adaptAuditResultForERP`)**: Linhas 35-83 implementam mapeamento robusto e dinâmico de resultados periciais para `ParametrizacaoERP`, suportando NCMs em formato string ou objeto `{ auditado, declarado }` e fornecendo fallbacks defensivos.

3. **`lib/extrator-nfe.ts` — `montarAuditRequestPayload` (linhas 968-1018)**:
   - Valida obrigatoriedade de `motor` (`'ollama' | 'gemini'`), rejeitando motores espúrios.
   - Valida obrigatoriedade de `regime` do adquirente (rejeita strings vazias ou em branco).
   - Filtra estritamente `itensSelecionados` usando `selectedSet.has(item.index)`.
   - Lança `Error` impeditivo quando `itensSelecionados.length === 0`.
   - Normaliza `ufDestino` para maiúsculas com fallback padrão para a UF da nota ou `'SP'`.
   - Não contém mocks, constantes fixas ou dados fabricados.

### 1.2 Detecção de Artefatos Pré-populados
- Execução de varredura no workspace (`components/`, `tests/`, `lib/`, `app/`):
  ```powershell
  Get-ChildItem -Path 'components', 'tests', 'lib', 'app' -Recurse -File -Include *.log,*result*,*output*
  ```
  **Resultado**: 0 arquivos encontrados. Zero logs pré-populados ou atestações fabricadas.

### 1.3 Execução Empírica Independente de Testes
Todos os comandos executados diretamente pelo auditor na raiz `F:\Workspace\Apps\Aplicativo_MCM-`:

1. **Validação Estrita de Tipos TypeScript (`npm run typecheck`)**:
   ```
   > classificador-ncm@1.0.0 typecheck
   > tsc --noEmit
   (Exit code 0)
   ```

2. **Verificação Estática de Regras de Hooks (`node scripts/hookcheck.mjs components`)**:
   ```
   hookcheck OK ✓ (9 arquivos, ordem de hooks fixa em todo render)
   (Exit code 0)
   ```

3. **Suíte da Tabela de Itens (`node scripts/test.mjs tests/tabela-itens-extracao.test.mjs`)**:
   ```
   ══════════════════════════════════════════════════════════════════════
     SUÍTE TABELA ITENS EXTRAÇÃO: 20 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

4. **Suíte Adversarial de Estresse M2 (`node scripts/test.mjs tests/m2-challenger-stress.test.mjs`)**:
   ```
   ══════════════════════════════════════════════════════════════════════
     SUÍTE ADVERSARIAL M2: 23 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
     RELATÓRIO EMPÍRICO DE PERFORMANCE E BENCHMARK:
     - [500_toggles_sequential]: 0.037 ms 
     - [bulk_actions_500_items]: 0.078 ms 
     - [ssr_render_100_items]: 100.542 ms (HTML: 267842 bytes)
     - [ssr_render_250_items]: 182.984 ms (HTML: 667710 bytes)
     - [ssr_render_500_items]: 227.319 ms (HTML: 1329324 bytes)
     - [payload_assembly_500_items]: 0.124 ms 
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

5. **Suíte SSR em Ambiente Node.js Puro (`node scripts/test.mjs tests/m2-ssr-stress.tsx`)**:
   ```
   SSR COMPLETO: 13 aprovados, 0 falhas.
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

6. **UI Smoke Test em DOM Real (`node scripts/ui-smoke.mjs`)**:
   ```
   UI SMOKE OK ✓ (componentes montados, atualizados e desmontados em DOM real)
   (Exit code 0)
   ```

7. **Suíte E2E Completa de Auditoria de Entrada (`node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`)**:
   ```
   ══════════════════════════════════════════════════════════════════════
     TOTAL: 54 aprovados, 0 falhas
   ══════════════════════════════════════════════════════════════════════
   SUÍTES COMPLETAS ✓
   (Exit code 0)
   ```

---

## 2. Logic Chain

1. **Premissa de Integridade**: A integridade de um produto de software requer que ele implemente computação autêntica, sem atalhos embutidos, saídas hardcodadas, fachadas que simulam sucesso ou artefatos de teste pré-fabricados.
2. **Evidência no Código-Fonte**:
   - `components/TabelaItensExtracao.tsx` recebe `itens` dinâmicos e constrói a tabela iterativamente em JSX, calculando métricas reais via `useMemo` (`vProd`, `vICMS`, `vIPI`, `vPIS`, `vCOFINS`).
   - A guarda `termoNumerico.length > 0` resolveu de forma genuína a vulnerabilidade de busca alfabética vazia.
   - A contagem `itens.filter((it) => selectedSet.has(it.index)).length` sincronizou o estado tri-state com as linhas reais da nota fiscal.
   - `montarAuditRequestPayload` aplica verificações defensivas em tempo de execução, assegurando que requisições inválidas ou vazias sejam rejeitadas antes do tráfego de rede.
3. **Evidência nas Suítes de Testes**:
   - As suítes de testes (`tabela-itens-extracao.test.mjs`, `m2-challenger-stress.test.mjs`, `m2-ssr-stress.tsx`, `e2e-auditoria-entrada.test.mjs`) utilizam fixtures reais extraídas pelo `extrairDadosXmlNfe` e confrontadas contra o catálogo de 10.515 registros Siscomex.
   - Os testes de estresse comprovam latência ultrabaixa (< 0.1ms para toggles e ações em lote, < 0.2ms para montagem de payload com 500 itens) e suporte a renderização SSR de até 500 itens sem vazamento de memória ou estouro de stack.
4. **Verificação de Regras por Modo**:
   - No modo `development` (especificado no `ORIGINAL_REQUEST.md`), todas as proibições (hardcoded outputs, dummy/facade implementations, fabricated verification logs) foram verificadas e nenhuma ocorrência foi detectada.
5. **Inferência Final**: Os componentes do Milestone 2 cumprem integralmente todos os requisitos funcionais e não-funcionais com lógica genuína e verificada.

---

## 3. Caveats

- A virtualização DOM (ex.: `@tanstack/react-virtual`) não foi implementada; contudo, medições empíricas demonstram que lotes de até 500 itens renderizam em ~227ms SSR e operam com menos de 0.1ms em manipuladores de eventos em memória, atendendo com folga a volumetria de NF-e corporativas.
- Nenhum outro caveat identificado.

---

## 4. Conclusion

Os artefatos de código do Milestone 2 apresentam conformidade integral com os padrões de arquitetura e integridade do projeto:
- **Zero hardcoding** de resultados ou fixtures nos componentes de UI.
- **Zero implementações dummy ou fachadas** no fluxo de seleção e disparo de auditoria.
- **Estado React autêntico**, com tipagem TypeScript estrita (0 erros em `tsc --noEmit`) e ordem invariante de hooks (100% aprovado no `hookcheck.mjs`).
- **Construção e validação autêntica de payload** em `montarAuditRequestPayload` conforme o Contrato M2 ↔ M3.
- **Total de 110 testes automatizados** aprovados com 100% de sucesso nas suítes unitárias, adversariais de estresse, SSR, UI smoke e E2E.

**Veredito Oficial**: **CLEAN**.

---

## 5. Verification Method

Para reproduzir a verificação forense completa de forma independente:

```powershell
Set-Location 'F:\Workspace\Apps\Aplicativo_MCM-'

# 1. Checagem estrita de tipos TypeScript (0 erros)
npm run typecheck

# 2. Verificação estática de regras e ordem de hooks do React (0 violações)
node scripts/hookcheck.mjs components

# 3. Testes unitários do componente TabelaItensExtracao e payload (20/20 PASS)
node scripts/test.mjs tests/tabela-itens-extracao.test.mjs

# 4. Testes adversariais de estresse e alta volumetria (23/23 PASS)
node scripts/test.mjs tests/m2-challenger-stress.test.mjs

# 5. Testes de estresse SSR em Node.js puro (13/13 PASS)
node scripts/test.mjs tests/m2-ssr-stress.tsx

# 6. Testes UI Smoke em DOM real (OK)
node scripts/ui-smoke.mjs

# 7. Suíte E2E completa de auditoria de entrada (54/54 PASS)
node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
```
