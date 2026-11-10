# Handoff Report — M2 Adversarial Challenge & Empirical Stress

**Agent**: `m2_challenger_1` (`teamwork_challenger`)  
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle  
**Verdict**: **REQUEST_CHANGES**  
**Date**: 2026-11-09T17:22:00Z  

---

## 1. Observation

Direct empirical observations from source code inspection, benchmark execution, and automated testing:

1. **Bug Crítico na Busca Textual (`components/TabelaItensExtracao.tsx`, linha 166)**:
   ```typescript
   160:     if (busca.trim()) {
   161:       const termo = busca.trim().toLowerCase();
   162:       res = res.filter((it) => {
   163:         return (
   164:           it.cProd.toLowerCase().includes(termo) ||
   165:           it.xProd.toLowerCase().includes(termo) ||
   166:           it.ncm.replace(/\D/g, '').includes(termo.replace(/\D/g, '')) ||
   167:           it.cfop.includes(termo) ||
   168:           (it.cEAN && it.cEAN.includes(termo))
   169:         );
   170:       });
   171:     }
   ```
   - **Comportamento observado**: Quando o usuário busca por palavras sem números (ex.: `"mouse"`, `"teclado"`, `"parafuso"`, `"notebook"` ou qualquer termo alfabético), `termo.replace(/\D/g, '')` resulta em `""` (string vazia).
   - Em JavaScript / V8: `it.ncm.replace(/\D/g, '').includes("")` é invariavelmente avaliado como `true` para 100% dos itens da tabela.
   - **Resultado empírico**: Ao digitar qualquer palavra sem dígitos no campo de busca, a tabela **não filtra absolutamente nada** e exibe todos os itens da nota (100 de 100 itens), anulando completamente a busca por descrição do produto (`xProd`).

2. **Desincronização de Estado Tri-State do Master Checkbox (`components/TabelaItensExtracao.tsx`, linhas 124, 198-205)**:
   ```typescript
   124:   const selectedCount = selectedSet.size;
   ...
   198:   const todosSelecionados = itens.length > 0 && selectedCount === itens.length;
   199:   const algumSelecionado = selectedCount > 0 && selectedCount < itens.length;
   ...
   178:   const selItens = itens.filter((it) => selectedSet.has(it.index));
   ```
   - **Comportamento observado**: `selectedCount` é calculado diretamente sobre o tamanho bruto de `selectedSet` (`selectedIndices`), em vez de contabilizar os itens reais pertencentes à nota fiscal atual (`itens`).
   - Se `selectedIndices` contiver índices órfãos ou fantasmas (ex.: resíduo de uma nota anterior com mais itens ou chave dessincronizada):
     - Com 15 índices fantasmas em uma nota de 15 itens: o Master Checkbox marca como **marcado** (`checked: true`), mas nenhuma linha da tabela está selecionada e o badge do cabeçalho exibe `"0 de 15 selecionados"`.
     - Com 2 índices fantasmas: o Master Checkbox fica em estado **indeterminado** (`indeterminate: true`), com 0 itens reais selecionados.

3. **Falha de Tipagem em Typecheck (`tests/m2-ssr-stress.tsx`, linhas 77 e 182)**:
   - Execução de `npm run typecheck` (`tsc --noEmit`) falhou com código 1:
   ```
   tests/m2-ssr-stress.tsx(77,7): error TS2769: No overload matches this call.
     Type 'Set<unknown>' is not assignable to type 'number[] | Set<number>'.
   tests/m2-ssr-stress.tsx(182,7): error TS2769: No overload matches this call.
     Type 'Set<unknown>' is not assignable to type 'number[] | Set<number>'.
   ```

4. **Desempenho Sob Alta Volumetria (500 Itens)**:
   - Execução do harness adversarial `tests/m2-challenger-stress.test.mjs` (23 testes) atesta:
     - 500 alternâncias sequenciais de toggle: **0.040 ms** total (< 0.0001 ms/toggle).
     - Ações em lote ("Selecionar Todos", "Desmarcar Todos", "Selecionar Sensíveis") para 500 itens: **0.083 ms**.
     - Montagem e validação do payload `montarAuditRequestPayload` para 500 itens: **0.148 ms**.
     - Renderização estática SSR (`renderToString`) para 500 itens: **217.95 ms** (HTML gerado com 1.336.938 bytes / 1.3 MB).
     - Guard rails de payload: rejeição correta de 0 itens, motor inválido e regime vazio.

---

## 2. Logic Chain

1. **Premissa 1**: O Requisito R2 e a Aceitação do M2 exigem busca e filtragem funcional na tabela de itens extraídos para permitir ao auditor localizar e selecionar itens específicos antes de submeter à IA.
2. **Premissa 2**: A busca foi implementada com uma condição disjuntiva (`||`) onde uma das cláusulas é `it.ncm.replace(/\D/g, '').includes(termo.replace(/\D/g, ''))`.
3. **Observação Factual**: Para qualquer termo textual sem algarismos numéricos (ex: `termo = "açúcar"`), `termo.replace(/\D/g, '')` avalia para `""`. Em especificação ECMAScript, `String.prototype.includes("")` retorna `true` para qualquer string receptora.
4. **Dedução Direta**: A condição de filtragem na linha 166 de `components/TabelaItensExtracao.tsx` é trivialmente satisfeita para todo e qualquer item da nota quando o usuário digita qualquer palavra pura. Como consequência, o usuário é incapaz de filtrar produtos por nome sem incluir dígitos na busca.
5. **Severidade**: Esta falha quebra um fluxo central de auditoria pericial (R2) em produção. O veredito deve ser imperativamente **REQUEST_CHANGES** para que o Worker aplique a correção pontual necessária.

---

## 3. Caveats

- A renderização no cliente (Client-Side Rendering) de 500 itens simultâneos não utiliza virtualização de lista (ex.: `react-window` ou `@tanstack/react-virtual`), baseando-se em contêiner de rolagem nativo com CSS `maxHeight: '62vh'`. O tempo de SSR (218ms) é seguro e não causa vazamento de memória, mas notas industriais atípicas com mais de 1.000 itens se beneficiariam de paginação ou virtualização no futuro.
- A ausência de normalização de acentos na busca textual (ex.: "acucar" não localiza "açúcar") é classificada como melhoria de UX de severidade baixa.
- Não foram alterados arquivos de implementação de produto, cumprindo rigorosamente a restrição de "Review-only".

---

## 4. Conclusion & Verdict

**VEREDITO: REQUEST_CHANGES**

Para aprovação do Milestone 2, as seguintes correções são necessárias:

### Itens de Ação Obrigatórios para o Worker:

1. **Corrigir Cláusula de NCM na Busca Textual (`components/TabelaItensExtracao.tsx:166`)**:
   - Exigir que a busca por NCM só execute se houver dígitos no termo pesquisado:
   ```typescript
   // Linhas 160-171:
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

2. **Corrigir Cálculo de Tri-State do Master Checkbox (`components/TabelaItensExtracao.tsx:124, 198-199`)**:
   - Basear `selectedCount` nos itens efetivamente pertencentes à nota para evitar desincronização com índices órfãos:
   ```typescript
   // Linha 124 ou após o cálculo de resumo:
   const selectedCount = useMemo(() => {
     return itens.filter((it) => selectedSet.has(it.index)).length;
   }, [itens, selectedSet]);
   ```

3. **Tipar `new Set<number>()` em `tests/m2-ssr-stress.tsx:77,182`**:
   - Substituir `selectedIndices: new Set()` por `selectedIndices: new Set<number>()` para sanar o erro de typecheck do TypeScript.

---

## 5. Verification Method

Para reproduzir e verificar de forma independente:

1. **Executar a Suíte de Estresse Adversarial M2**:
   ```powershell
   Set-Location 'F:\Workspace\Apps\Aplicativo_MCM-'
   node scripts/test.mjs tests/m2-challenger-stress.test.mjs
   ```
   - O teste `'Vulnerabilidade Empírica: Busca com string puramente alfabética não filtra devido a ncm.includes("")'` demonstra empiricamente a falha no código atual vs o comportamento correto.

2. **Executar Typecheck do Projeto**:
   ```powershell
   npm run typecheck
   ```
   - Observar o erro em `tests/m2-ssr-stress.tsx`.

3. **Invalidação**:
   - As correções serão validadas quando `npm run typecheck` finalizar com código 0 e a busca textual em `TabelaItensExtracao` filtrar adequadamente palavras puramente alfabéticas.

---

## Challenge Report

```markdown
## Challenge Summary
**Overall risk assessment**: CRITICAL

## Challenges

### [Critical] Challenge 1: Quebra da Busca Textual por Descrição de Produto
- Assumption challenged: O filtro de busca por texto em TabelaItensExtracao reduz a lista aos itens que contêm o termo pesquisado.
- Attack scenario: Usuário digita palavras alfabéticas comuns ("parafuso", "mouse", "serviço").
- Blast radius: A busca não filtra nenhum item, retornando 100% da nota fiscal e impedindo o usuário de localizar produtos em notas com muitos itens.
- Mitigation: Adicionar guarda `termoNumerico.length > 0` antes de invocar `it.ncm.includes(termoNumerico)`.

### [Medium] Challenge 2: Desincronização Tri-State do Master Checkbox
- Assumption challenged: O estado do Master Checkbox reflete com fidelidade a proporção de linhas selecionadas na tabela.
- Attack scenario: Estado de seleção recebe índices de itens que não existem na nota carregada.
- Blast radius: O cabeçalho da tabela indica que todos ou alguns itens estão selecionados, enquanto a tabela exibe 0 itens marcados e o contador acusa 0.
- Mitigation: Derivar `selectedCount` a partir da interseção de `selectedSet` com `itens`.

### [Medium] Challenge 3: Falta de Guardas para Propriedades Nulas em Itens Malformados
- Assumption challenged: Todos os itens extraídos possuem propriedades string definidas (`ncm`, `cProd`, `cfop`).
- Attack scenario: XML incompleto ou PDF corrompido sem tag NCM ou CFOP.
- Blast radius: `TypeError: Cannot read properties of undefined (reading 'replace')` no render da tabela.
- Mitigation: Adicionar verificações defensivas `it.ncm && ...`, `it.cProd && ...`.

## Stress Test Results
- 500 toggles sequenciais → Latência total < 1ms → 0.040ms → PASS
- Ações em lote para 500 itens → Latência < 5ms → 0.083ms → PASS
- Render SSR 500 itens → Estabilidade de memória e conclusão em < 600ms → 217.95ms → PASS
- Montagem de payload 500 itens → Serialização JSON íntegra → 0.148ms → PASS
- Busca com caracteres especiais Regex → Sem crash de compilação → PASS
- Busca com termo alfabético inexistente → Deveria filtrar para 0 itens → Retornou 100 itens (Bug confirmado) → FAIL no código original / CATCH confirmado
- Validação TypeScript (`npm run typecheck`) → Código 0 → Código 1 (Erro em m2-ssr-stress.tsx) → FAIL

## Unchallenged Areas
- Virtualização dinâmica DOM com 10.000+ itens (fora do escopo de NF-e convencionais e limitado a 500 itens neste Milestone).
```
