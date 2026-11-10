# Handoff Report — M2 Challenger (Iteration 2 Verification)

**Agent**: `m2_challenger_it2_2` (`teamwork_challenger`)  
**Milestone**: Milestone 2 — Interactive Tabular UI, Item Selection & Engine Toggle (Iteration 2 Empirical Challenge)  
**Date**: 2026-11-09T19:35:00Z  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

Direct empirical observations from source code inspection and verification command executions:

### 1.1 Execuções de Linha de Base (Comandos Exigidos pelo Dispatch)
- `node scripts/ui-smoke.mjs`:
  ```
  OK  Classificar: formulário renderiza
  ...
  OK  Auditoria de Entrada: renderiza com dados
  OK  React: nenhum aviso de hook/key/estado entre renders
  UI SMOKE OK ✓ (componentes montados, atualizados e desmontados em DOM real)
  (Exit code 0)
  ```
- `node scripts/test.mjs tests/m2-ssr-stress.tsx`:
  ```
  SSR COMPLETO: 13 aprovados, 0 falhas.
  (Exit code 0)
  ```
- `npm run typecheck`:
  ```
  > tsc --noEmit
  (Exit code 0)
  ```
- `node scripts/hookcheck.mjs components`:
  ```
  hookcheck OK ✓ (9 arquivos, ordem de hooks fixa em todo render)
  (Exit code 0)
  ```
- `node scripts/test.mjs tests/m2-challenger-stress.test.mjs`:
  ```
  SUÍTE ADVERSARIAL M2: 23 aprovados, 0 falhas
  (Exit code 0)
  ```
- `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`:
  ```
  TOTAL: 54 aprovados, 0 falhas
  (Exit code 0)
  ```

---

### 1.2 Vulnerabilidade 1 (ALTA): Falso-Positivo na Busca Textual Alfanumérica
- **Localização**: `components/TabelaItensExtracao.tsx`, linhas 163-174:
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
- **Evidência Empírica Direta**:
  Execução do comando em Node.js com itens típicos de nota fiscal:
  ```powershell
  node -e "
  const itens = [
    { cProd: 'CANETA-AZUL', xProd: 'Caneta esferográfica azul', ncm: '96081000' },
    { cProd: 'BORRACHA', xProd: 'Borracha escolar', ncm: '40169200' },
    { cProd: 'CADERNO-1', xProd: 'Caderno 1 matéria', ncm: '48201000' }
  ];
  const busca = 'CADERNO-1';
  const termo = busca.trim().toLowerCase();
  const termoNumerico = termo.replace(/\D/g, '');
  const res = itens.filter(it => {
    return (
      (it.cProd && it.cProd.toLowerCase().includes(termo)) ||
      (it.xProd && it.xProd.toLowerCase().includes(termo)) ||
      (termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico))
    );
  });
  console.log('Busca:', busca, '-> Resultados:', res.map(i => i.cProd));
  "
  ```
  **Saída Obtida**:
  ```
  Busca: CADERNO-1 -> Resultados: [ 'CANETA-AZUL', 'BORRACHA', 'CADERNO-1' ]
  ```
  Ao buscar `"CADERNO-1"`, `termoNumerico` torna-se `"1"`. Como o NCM de `CANETA-AZUL` (`96081000`) contém `"1"` e o de `BORRACHA` (`40169200`) contém `"1"`, 100% dos itens vazam no filtro, derrotando a busca e a seleção de itens pelo usuário.

---

### 1.3 Vulnerabilidade 2 (MÉDIA): Quebra de Renderização por Falta de Guarda em `cfop.startsWith`
- **Localização**: `components/TabelaItensExtracao.tsx`, linhas 565-579:
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
- **Evidência Empírica Direta**:
  Enquanto a linha 567 prevê que `item.cfop` pode ser nulo/indefinido (`{item.cfop || '----'}`), a linha 569 chama imediatamente `item.cfop.startsWith('6')` sem guarda de existência.
  Execução do comando em Node.js:
  ```powershell
  node -e "
  const item = { cfop: undefined };
  try {
    const isInter = (item.cfop.startsWith('6') || item.cfop.startsWith('2'));
  } catch (err) {
    console.log('CRASH on line 569:', err.message);
  }
  "
  ```
  **Saída Obtida**:
  ```
  CRASH on line 569: Cannot read properties of undefined (reading 'startsWith')
  ```
  Se a nota contiver um item malformado com `cfop` ausente (`undefined` ou `null`), o renderizador da tabela explode em tela branca com exceção não tratada.

---

### 1.4 Suíte de Estresse Adversarial Desenvolvida
Criado o arquivo de testes adversariais `tests/m2-challenger-boundary-stress.test.mjs` cobrindo 16 cenários extremos:
1. `Boundary 0 Itens`: Card vazio, zero tabelas, zero checkboxes.
2. `Boundary 1 Item`: Singularidade ("1 item", "1 item selecionado"), cálculo tri-state exato (`checked: true`, `indeterminate: false`).
3. `Missing Optionals`: Itens sem EAN, CEST, Siscomex, Frete, Seguro ou Tributos renderizam com fallbacks sem lançar exceções.
4. `Malformed Items`: Valores `""` caem em `S/ CÓD`, `Descrição ausente`, `--------`, `----`.
5. `Numerical Malformed`: `NaN`, `null`, `undefined` tratados sem vazar "NaN".
6. `Interactive JSDOM`: Montagem em DOM real, digitação em busca, tri-state nativo no input ref, toggle de linhas, expansão de detalhes fiscais e isolamento de `readOnly`.
7. `XML Fixtures`: Todas as 8 fixtures do projeto renderizam sem erro.
8. `Testes de Vulnerabilidade`: Prova empírica de falha nas vulnerabilidades 1 e 2.
Execução:
```powershell
node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs
```
Resultado: **16 aprovados, 0 falhas** (comprovando as condições de contorno e isolando as duas falhas).

---

## 2. Logic Chain

1. **Correção Parcial do Worker 2 na Busca Textual**:
   - O `m2_worker_2` corrigiu a busca para termos puramente alfabéticos adicionando a guarda `termoNumerico.length > 0`.
   - Essa guarda impediu que `"mouse"` virasse `""` e fizesse `ncm.includes("") === true`.
   - Porém, a solução introduziu uma falha lógica de segunda ordem: qualquer busca alfanumérica que contenha letras e ao menos um dígito (ex: `"CADERNO-1"`, `"ITEM-1"`, `"NOTE-10"`, `"SKU-2"`, `"S24"`) produz `termoNumerico.length > 0` (ex: `"1"`).
   - Como a condição de NCM está em disjunção lógica (`||`) com a descrição e o código:
     `(it.cProd.includes("caderno-1") || it.xProd.includes("caderno-1") || it.ncm.includes("1"))`
   - O teste `it.ncm.includes("1")` avalia para `true` para a esmagadora maioria dos NCMs oficiais (8471, 9608, 4016, 4820, etc.).
   - Consequentemente, itens que não têm nenhuma relação com `"CADERNO-1"` são retornados no filtro da tabela.

2. **Critério para Consulta de NCM**:
   - Um código NCM no Sistema Harmonizado do Siscomex é estritamente numérico de 8 dígitos (`XXXX.XX.XX`). NCMs nunca contêm letras.
   - Quando um usuário digita letras (ex: `"CADERNO-1"` ou `"ITEM-1"`), ele está realizando uma busca por código comercial (`cProd`) ou descrição (`xProd`), nunca por código NCM.
   - A busca em `it.ncm` só deve ser ativada se o termo de busca não contiver caracteres alfabéticos (ex: `!/[a-zA-Z]/.test(termo)`) e tiver comprimento numérico suficiente (`termoNumerico.length >= 2`).

3. **Defesa Incompleta em `cfop`**:
   - A linha 567 usa `{item.cfop || '----'}`, comprovando que o código antecipou `item.cfop` indefinido.
   - Porém, a linha 569 realiza `item.cfop.startsWith('6')` diretamente. Se `item.cfop` for `undefined` ou `null`, a chamada lança `TypeError` imediato.
   - A linha 569 deve conter a guarda `item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2'))`.

---

## 3. Caveats

- As correções aplicadas pelo Worker 2 na sincronização do Master Checkbox com índices órfãos (`selectedCount` via `itens.filter`) foram testadas extensivamente e estão **100% corretas e robustas**.
- A suíte de 500 itens, os tempos de latência SSR (<230ms para 500 itens) e o cumprimento estrito das regras de hooks do React (`hookcheck OK ✓`) continuam exemplares.
- No other caveats.

---

## 4. Conclusion

O Milestone 2 apresenta alto nível de engenharia e conformidade arquitetural, porém **não pode ser aprovado em produção** no estado atual devido a duas falhas empíricas reprodutíveis:
1. Vazamento generalizado de itens não relacionados em buscas alfanuméricas com algarismos (`termoNumerico.length > 0` ativando `it.ncm.includes` em consultas de SKU/descrição).
2. Risco de `TypeError: Cannot read properties of undefined (reading 'startsWith')` na renderização de itens com CFOP ausente.

**Veredito Oficial**: **REQUEST_CHANGES**

### Ações Solicitadas para o Worker (Remediação Pontual)

No arquivo `components/TabelaItensExtracao.tsx`:

1. **Correção da Busca Textual (linhas 164-173)**:
   Substituir a verificação de NCM para exigir que a busca de NCM ocorra apenas quando o usuário não estiver buscando texto alfabético:
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

2. **Correção da Guarda em `cfop.startsWith` (linha 569)**:
   Substituir:
   ```typescript
   {(item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
   ```
   Por:
   ```typescript
   {item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2')) && (
   ```

---

## 5. Verification Method

Para verificar independentemente e reproduzir as falhas antes e depois da remediação:

```powershell
Set-Location 'F:\Workspace\Apps\Aplicativo_MCM-'

# 1. Reprodução da falha da busca alfanumérica
node -e "
const itens = [
  { cProd: 'CANETA-AZUL', xProd: 'Caneta esferográfica azul', ncm: '96081000' },
  { cProd: 'BORRACHA', xProd: 'Borracha escolar', ncm: '40169200' },
  { cProd: 'CADERNO-1', xProd: 'Caderno 1 matéria', ncm: '48201000' }
];
const busca = 'CADERNO-1';
const termo = busca.trim().toLowerCase();
const termoNumerico = termo.replace(/\D/g, '');
const res = itens.filter(it => (it.cProd && it.cProd.toLowerCase().includes(termo)) || (it.xProd && it.xProd.toLowerCase().includes(termo)) || (termoNumerico.length > 0 && it.ncm && it.ncm.replace(/\D/g, '').includes(termoNumerico)));
console.log('Itens retornados (falha se > 1):', res.length, res.map(i => i.cProd));
"

# 2. Reprodução da falha em cfop.startsWith
node -e "
const item = { cfop: undefined };
try {
  const isInter = (item.cfop.startsWith('6') || item.cfop.startsWith('2'));
} catch (e) {
  console.log('CRASH reproduzido com sucesso:', e.message);
}
"

# 3. Execução da suíte completa de boundary stress
node scripts/test.mjs tests/m2-challenger-boundary-stress.test.mjs

# 4. Execução dos testes exigidos
node scripts/ui-smoke.mjs
node scripts/test.mjs tests/m2-ssr-stress.tsx
```

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

## Challenges

### [High] Challenge 1: Textual Search Filter Leaks False Positives on Alphanumeric Queries

- **Assumption challenged**: Que `termoNumerico.length > 0` basta para validar busca por NCM.
- **Attack scenario**: Usuário busca um SKU ou item comum com dígito (ex: `"CADERNO-1"`, `"S24"`, `"ITEM-1"`). `termoNumerico` vira `"1"`, e o filtro retorna todos os itens da nota cujo NCM contém o dígito `"1"`.
- **Blast radius**: Degradação funcional severa da tabela interativa; incapacidade de isolar produtos por código ou descrição quando há algarismos no termo pesquisado.
- **Mitigation**: Exigir `!/[a-z]/i.test(termo) && termoNumerico.length >= 2` para ativar a correspondência por NCM.

### [Medium] Challenge 2: Unhandled TypeError in Interestadual CFOP Tag on Undefined item.cfop

- **Assumption challenged**: Que `item.cfop` é garantido como string não-nula em tempo de execução.
- **Attack scenario**: Nota fiscal importada ou gerada de forma malformada contendo item sem a tag `<CFOP>` (`item.cfop` avalia como `undefined`).
- **Blast radius**: `TypeError: Cannot read properties of undefined (reading 'startsWith')` quebrando a montagem da tabela no navegador ou em SSR.
- **Mitigation**: Incluir verificação de existência `item.cfop && (item.cfop.startsWith('6') || item.cfop.startsWith('2'))`.
