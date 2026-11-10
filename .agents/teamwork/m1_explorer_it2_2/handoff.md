# Relatório de Investigação Técnica — M1 Explorer IT2-2

**Agente**: `m1_explorer_it2_2`  
**Data**: 2026-11-09T15:26:00Z  
**Milestone**: Milestone 1 (Remediation Iteration 2)  
**Escopo**: 
1. Colisão de Atributos XML em `extrairTributosXml` (`lib/extrator-nfe.ts:321, 354, 366-367`).
2. Fatiamento residual de 15 itens em `app/api/auditoria-entrada/route.ts:191`.
3. Formulação de solução exata a nível de linha para o agente Worker.

---

## Síntese Executiva
Identificou-se que o uso de `Object.keys(...)[0]` em nós fiscais de ICMS, PIS e COFINS seleciona chaves de atributos XML prefixadas com `@_` quando presentes no XML parseado, descartando silenciosamente todos os dados desses tributos. Adicionalmente, confirmou-se que a rota `app/api/auditoria-entrada/route.ts:191` retém o fatiamento rígido `itens.slice(0, 15)` no modo legado de auditoria, e seu extrator interno `extrairResumoImposto` padece da mesma vulnerabilidade de atributos (`Object.values(...)[0]`). Foram elaboradas as correções exatas a nível de linha e o arquivo de patch unificado `.agents/teamwork/m1_explorer_it2_2/m1_it2_2_fixes.patch`.

---

## 1. Observation

### 1.1 Colisão de Atributos XML em `lib/extrator-nfe.ts`
No arquivo `lib/extrator-nfe.ts`:
- O `fast-xml-parser` é configurado nas linhas 433–439 com:
  ```typescript
  433: const parser = new XMLParser({
  434:   ignoreAttributes: false,
  435:   attributeNamePrefix: '@_',
  436:   isArray: (name) => name === 'det',
  437:   trimValues: true,
  438:   parseTagValue: false,
  439: });
  ```
  Com `ignoreAttributes: false`, qualquer atributo XML presente em tags como `<ICMS xmlns="..." versao="4.00">` é injetado como propriedade no objeto parseado (ex.: `'@_xmlns'`, `'@_versao'`).
- Na função `extrairTributosXml` (linhas 320–374):
  - **ICMS** (linhas 320–323):
    ```typescript
    320: if (imp.ICMS && typeof imp.ICMS === 'object') {
    321:   const subKey = Object.keys(imp.ICMS)[0];
    322:   const icmsGroup = imp.ICMS[subKey];
    323:   if (icmsGroup && typeof icmsGroup === 'object') {
    ```
  - **PIS** (linhas 353–356):
    ```typescript
    353: if (imp.PIS && typeof imp.PIS === 'object') {
    354:   const subKey = Object.keys(imp.PIS)[0];
    355:   const pisGroup = imp.PIS[subKey];
    356:   if (pisGroup && typeof pisGroup === 'object') {
    ```
  - **COFINS** (linhas 365–368):
    ```typescript
    365: if (imp.COFINS && typeof imp.COFINS === 'object') {
    366:   const subKey = Object.keys(imp.COFINS)[0];
    367:   const cofinsGroup = imp.COFINS[subKey];
    368:   if (cofinsGroup && typeof cofinsGroup === 'object') {
    ```
- **Reprodução Experimental**:
  Executou-se um teste direto no script `.agents/teamwork/m1_explorer_it2_2/test_collision.mjs` com o payload:
  `{ ICMS: { '@_xmlns': 'http://www.portalfiscal.inf.br/nfe', ICMS00: { CST: '00', vICMS: 18 } } }`.
  - `Object.keys(imp.ICMS)[0]` retornou `'@_xmlns'`.
  - `icmsGroup` avaliou para a string `'http://www.portalfiscal.inf.br/nfe'`.
  - `typeof icmsGroup === 'object'` avaliou para `false`.
  - Resultado: `tributos.cstIcms`, `tributos.vICMS`, `tributos.vBC` e todos os campos de ST permaneceram `undefined`, sendo 100% descartados.

### 1.2 Fatiamento de 15 Itens em `app/api/auditoria-entrada/route.ts`
No arquivo `app/api/auditoria-entrada/route.ts`, linhas 191 a 208:
```typescript
191: const itensLimitados = itens.slice(0, 15);
192: const detExtraido = itensLimitados.map((d: any) => ({
193:   cProd: d.prod?.cProd,
194:   xProd: d.prod?.xProd,
195:   NCM: d.prod?.NCM,
196:   CEST: d.prod?.CEST,
197:   CFOP: d.prod?.CFOP,
198:   vProd: d.prod?.vProd,
199:   tributosFornecedor: extrairResumoImposto(d.imposto)
200: }));
201: 
202: const resumo = {
203:   emit,
204:   dest,
205:   totalItensNaNota: itens.length,
206:   itensAuditados: itensLimitados.length,
207:   itens: detExtraido
208: };
```
- Quando a rota é chamada sem `action=extrair` (modo legado de auditoria direta), apenas os primeiros 15 itens são extraídos e enviados ao prompt da IA. Qualquer nota fiscal com mais de 15 itens sofre perda de itens além do 15º, violando os critérios de ausência de truncamento.
- Adicionalmente, na função local `extrairResumoImposto` (linhas 148, 172, 181):
  ```typescript
  148: const icmsGroup = Object.values(imp.ICMS)[0] as any;
  ...
  172: const pisGroup = Object.values(imp.PIS)[0] as any;
  ...
  181: const cofinsGroup = Object.values(imp.COFINS)[0] as any;
  ```
  `Object.values(imp.ICMS)[0]` sofre da mesma suscetibilidade a atributos XML que `Object.keys(...)[0]`.

---

## 2. Logic Chain

1. **Da Configuração do Parser ao Risco de Chaves Inesperadas**:
   - `fast-xml-parser` cria pares de chave-valor com prefixo `'@_'` para atributos XML da tag corrente quando `ignoreAttributes: false` (linhas 434–435).
   - O uso de `Object.keys(imp.ICMS)[0]` assume como premissa implícita que o primeiro elemento iterado em `Object.keys()` é sempre a tag filha do grupo de imposto (`ICMS00`, `ICMS10`, `ICMS20`, etc.).
   - Em XMLs onde atributos precedem elementos filhos ou são inseridos na ordem de chaves do objeto pelo parser, o primeiro elemento é o atributo (ex: `'@_xmlns'`).
2. **Da Falha de Indexação ao Descarte Silencioso de Tributos**:
   - Quando `subKey === '@_xmlns'`, `imp.ICMS[subKey]` é o valor textual do atributo (string).
   - Como o código exige `if (icmsGroup && typeof icmsGroup === 'object')`, o bloco de extração de ICMS é inteiramente ignorado.
   - O mesmo mecanismo opera de forma idêntica para `imp.PIS` e `imp.COFINS`.
   - A substituição por `Object.keys(imp.ICMS).find(k => !k.startsWith('@_'))` garante que qualquer chave de atributo seja ignorada, localizando precisamente o grupo tributário fiscal (`ICMS00`..`ICMS90`, `ICMSSN101`..`ICMSSN900`).
3. **Do Fatiamento Residual à Inconsistência Contratual**:
   - O fatiamento `itens.slice(0, 15)` em `route.ts:191` é um resquício da implementação anterior pré-Milestone 1, antes do particionamento em lotes/itens individuais.
   - Sua remoção garante que `detExtraido` contenha todos os itens da nota (`itens.map(...)`), alinhando `itensAuditados: itens.length` com `totalItensNaNota: itens.length`.

---

## 3. Caveats

- **IPI, IBS/CBS e IS**: `imp.IPI` (linhas 341–350) e `imp.IBSCBS`/`imp.IS` (linhas 377–390) acessam propriedades explicitamente por nome (`imp.IPI.IPITrib || imp.IPI.IPINT`, `imp.IBSCBS || imp.IBS`). Portanto, não utilizam `Object.keys` e não sofrem colisão de atributos.
- **Harmonização de `regimeDescricao` e Sensibilidade de IPI**: As divergências contratuais de `regimeDescricao` (linha 190) e `IPI_DESTACADO` (linhas 288–290) estão sob responsabilidade investigativa do agente par `m1_explorer_it2_3`. O presente relatório foca estritamente nos problemas de colisão de atributos XML e remoção do fatiamento de 15 itens.

---

## 4. Conclusion & Proposed Line-Level Solutions

### 4.1 Modificações em `lib/extrator-nfe.ts`

#### Localização 1: ICMS (linhas 321–322)
```typescript
<<<< ANTES (linhas 321-322):
    const subKey = Object.keys(imp.ICMS)[0];
    const icmsGroup = imp.ICMS[subKey];
==== DEPOIS:
    const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
    const icmsGroup = subKey ? imp.ICMS[subKey] : undefined;
>>>>
```

#### Localização 2: PIS (linhas 354–355)
```typescript
<<<< ANTES (linhas 354-355):
    const subKey = Object.keys(imp.PIS)[0];
    const pisGroup = imp.PIS[subKey];
==== DEPOIS:
    const subKey = Object.keys(imp.PIS).find((k) => !k.startsWith('@_'));
    const pisGroup = subKey ? imp.PIS[subKey] : undefined;
>>>>
```

#### Localização 3: COFINS (linhas 366–367)
```typescript
<<<< ANTES (linhas 366-367):
    const subKey = Object.keys(imp.COFINS)[0];
    const cofinsGroup = imp.COFINS[subKey];
==== DEPOIS:
    const subKey = Object.keys(imp.COFINS).find((k) => !k.startsWith('@_'));
    const cofinsGroup = subKey ? imp.COFINS[subKey] : undefined;
>>>>
```

---

### 4.2 Modificações em `app/api/auditoria-entrada/route.ts`

#### Localização 1: Eliminação do Fatiamento de 15 Itens (linhas 191–208)
```typescript
<<<< ANTES (linhas 191-208):
      const itensLimitados = itens.slice(0, 15);
      const detExtraido = itensLimitados.map((d: any) => ({
        cProd: d.prod?.cProd,
        xProd: d.prod?.xProd,
        NCM: d.prod?.NCM,
        CEST: d.prod?.CEST,
        CFOP: d.prod?.CFOP,
        vProd: d.prod?.vProd,
        tributosFornecedor: extrairResumoImposto(d.imposto)
      }));

      const resumo = {
        emit,
        dest,
        totalItensNaNota: itens.length,
        itensAuditados: itensLimitados.length,
        itens: detExtraido
      };
==== DEPOIS:
      const detExtraido = itens.map((d: any) => ({
        cProd: d.prod?.cProd,
        xProd: d.prod?.xProd,
        NCM: d.prod?.NCM,
        CEST: d.prod?.CEST,
        CFOP: d.prod?.CFOP,
        vProd: d.prod?.vProd,
        tributosFornecedor: extrairResumoImposto(d.imposto)
      }));

      const resumo = {
        emit,
        dest,
        totalItensNaNota: itens.length,
        itensAuditados: itens.length,
        itens: detExtraido
      };
>>>>
```

#### Localização 2: Blindagem contra Atributos em `extrairResumoImposto` (linhas 147–187)
```typescript
<<<< ANTES (linhas 147-158):
        // ICMS
        if (imp.ICMS) {
          const icmsGroup = Object.values(imp.ICMS)[0] as any;
          if (icmsGroup) {
==== DEPOIS:
        // ICMS
        if (imp.ICMS && typeof imp.ICMS === 'object') {
          const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
          const icmsGroup = subKey ? (imp.ICMS[subKey] as any) : undefined;
          if (icmsGroup && typeof icmsGroup === 'object') {
>>>>

<<<< ANTES (linhas 171-177):
        // PIS
        if (imp.PIS) {
          const pisGroup = Object.values(imp.PIS)[0] as any;
          if (pisGroup) {
==== DEPOIS:
        // PIS
        if (imp.PIS && typeof imp.PIS === 'object') {
          const subKey = Object.keys(imp.PIS).find((k) => !k.startsWith('@_'));
          const pisGroup = subKey ? (imp.PIS[subKey] as any) : undefined;
          if (pisGroup && typeof pisGroup === 'object') {
>>>>

<<<< ANTES (linhas 180-186):
        // COFINS
        if (imp.COFINS) {
          const cofinsGroup = Object.values(imp.COFINS)[0] as any;
          if (cofinsGroup) {
==== DEPOIS:
        // COFINS
        if (imp.COFINS && typeof imp.COFINS === 'object') {
          const subKey = Object.keys(imp.COFINS).find((k) => !k.startsWith('@_'));
          const cofinsGroup = subKey ? (imp.COFINS[subKey] as any) : undefined;
          if (cofinsGroup && typeof cofinsGroup === 'object') {
>>>>
```

---

### 4.3 Arquivo de Patch Unificado

O patch pronto para aplicação pelo trabalhador foi gravado em:  
`F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\m1_it2_2_fixes.patch`

---

## 5. Verification Method

Para verificar de forma independente a eficácia das soluções propostas:

1. **Inspeção de Código**:
   Verificar que `lib/extrator-nfe.ts` não possui chamadas a `Object.keys()[0]` e que `app/api/auditoria-entrada/route.ts` não possui `.slice(0, 15)`.

2. **Execução do Teste de Validação Unificado**:
   ```powershell
   node F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_it2_2\test_solution.mjs
   ```
   **Resultado esperado**:
   - `Test 1 Passed: Attribute collision correctly resolved in extrator-nfe.ts logic`
   - `Test 2 Passed: Standard clean structure preserved`
   - `Test 3 Passed: Empty imp safely handled`
   - `Test 4 Passed: 35 items parsed with zero truncation in route.ts logic`
   - `ALL UNIT CHECKS PASSED SUCCESSFULLY!`

3. **Validação da Suíte do Projeto**:
   ```powershell
   npm run typecheck
   npm test
   ```
   Confirmar 0 erros de diagnóstico e 100% de testes passando.

4. **Condição de Invalidação**:
   Este parecer seria invalidado caso um XML SEFAZ com atributos nas tags `<ICMS>`, `<PIS>` ou `<COFINS>` resultasse em descarte dos valores tributários sob a implementação proposta.
