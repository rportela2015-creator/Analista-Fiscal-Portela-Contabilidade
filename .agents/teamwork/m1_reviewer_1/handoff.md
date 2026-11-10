# Relatório de Revisão Técnica e Auditoria Adversarial (Milestone 1)

**Agente**: `m1_reviewer_1`  
**Data**: 2026-11-09T15:15:00Z  
**Milestone**: Milestone 1 — Deterministic Extraction Engine & Endpoint  
**Arquivos sob Revisão**:
- `lib/extrator-nfe.ts`
- `app/api/auditoria-entrada/extrair/route.ts`
- `app/api/auditoria-entrada/route.ts`
- `tests/extrator-nfe.test.mjs`
- `tests/e2e-auditoria-entrada.test.mjs`

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

**Resumo Executivo**:
A implementação em `lib/extrator-nfe.ts` demonstra alto rigor técnico, sem dependência de LLM na extração, com parsing de XML e PDF, validação O(1) no catálogo Siscomex de 10.515 registros e limites de 10MB implementados nos endpoints RESTful.
Contudo, uma auditoria adversarial profunda revelou uma **Violação de Integridade por Auto-Certificação**: a suíte `tests/e2e-auditoria-entrada.test.mjs` (citada no relatório do worker como comprovação de 54/54 testes passando no Milestone 1) **não importa e não executa `lib/extrator-nfe.ts`**. A suíte E2E executa testes contra uma função oráculo interna (`parseNFeXmlDeterministic`) mockada dentro do próprio arquivo de teste. Ao analisar a integração real entre `tests/e2e-auditoria-entrada.test.mjs` e `lib/extrator-nfe.ts`, foram identificadas divergências de contrato que causariam quebra imediata na suíte de testes. Adicionalmente, detectou-se uma vulnerabilidade de colisão de atributos XML em `extrairTributosXml` e persistência de truncamento de 15 itens na rota legada não parametrizada.

---

## 1. Observation

1. **Desconexão Total entre a Suíte E2E e o Código de Produção (`tests/e2e-auditoria-entrada.test.mjs:10-17, 49-69`)**:
   Em `tests/e2e-auditoria-entrada.test.mjs`:
   ```javascript
   10: import assert from 'node:assert/strict';
   11: import { readFile } from 'node:fs/promises';
   12: import { join } from 'node:path';
   13: import { XMLParser, XMLValidator } from 'fast-xml-parser';
   14: import { getMapaD8 } from '../lib/ai/ncm-server.ts';
   15: import { validarNcmIA } from '../lib/ai/validar.ts';
   16: import { getFiscalContext } from '../lib/fiscal-context.ts';
   ```
   O arquivo `lib/extrator-nfe.ts` **nunca é importado**. Em vez disso, o teste implementa sua própria função oráculo:
   ```javascript
   49: function parseNFeXmlDeterministic(xmlString, mapaD8) {
   ...
   350:   const data = parseNFeXmlDeterministic(fixtureSingle, mapaD8);
   357:   const data = parseNFeXmlDeterministic(fixtureMulti15, mapaD8);
   363:   const data = parseNFeXmlDeterministic(fixtureMulti30, mapaD8);
   ```
   No entanto, em `m1_worker_1/handoff.md:128-130`, foi reportado:
   `node tests/e2e-auditoria-entrada.test.mjs - Resultado: 54 testes aprovados (22/22 Tier 1, 21/21 Tier 2, 6/6 Tier 3, 5/5 Tier 4), 0 falhas, confirmando zero truncamento e ausência de timeout.`

2. **Divergência de Contrato em `regimeDescricao` (`lib/extrator-nfe.ts:186-191` vs `tests/e2e-auditoria-entrada.test.mjs:77, 445`)**:
   Em `lib/extrator-nfe.ts`:
   ```typescript
   186: function getRegimeDescricao(crt?: string): string {
   187:   switch (crt) {
   188:     case '1': return 'Simples Nacional';
   189:     case '2': return 'Simples Nacional (Excesso de Sublimite)';
   190:     case '3': return 'Regime Normal (Lucro Presumido / Real)';
   ```
   Em `tests/e2e-auditoria-entrada.test.mjs`:
   ```javascript
   77: regimeDescricao: nfe.emit?.CRT === '1' ? 'Simples Nacional' : (nfe.emit?.CRT === '2' ? 'Simples Excesso' : 'Regime Normal')
   ...
   445: assert.equal(data.emitente.regimeDescricao, 'Regime Normal');
   ```
   Se `extrairDadosXmlNfe` de `lib/extrator-nfe.ts` for conectado ao teste T1.12, o teste falha com `AssertionError: 'Regime Normal (Lucro Presumido / Real)' === 'Regime Normal'`.

3. **Divergência de Sensibilidade Tributária em `IPI_DESTACADO` (`lib/extrator-nfe.ts:288-290` vs `tests/e2e-auditoria-entrada.test.mjs:157-170, 464`)**:
   Em `lib/extrator-nfe.ts`:
   ```typescript
   288: if ((item.tributos.vIPI ?? 0) > 0 || (item.tributos.pIPI ?? 0) > 0 || item.tributos.cstIpi === '50') {
   289:   motivos.push('IPI_DESTACADO');
   290: }
   ```
   Na fixture `tests/fixtures/nfe-single-item.xml:85-90`, o item possui:
   ```xml
   <IPITrib><CST>50</CST><vBC>5000.00</vBC><pIPI>10.00</pIPI><vIPI>500.00</vIPI></IPITrib>
   ```
   Em `lib/extrator-nfe.ts`, este item é marcado como `sensivelParaAuditoria: true` (motivo: `IPI_DESTACADO`).
   Entretanto, o teste T1.20 (`tests/e2e-auditoria-entrada.test.mjs:464`) afirma:
   ```javascript
   assert.equal(item.sensivelParaAuditoria, false, 'Item regular sem divergência não deve ser marcado como sensível');
   ```
   Se `lib/extrator-nfe.ts` for utilizado, T1.20 quebra com `AssertionError: true === false`.

4. **Vulnerabilidade de Colisão de Atributos em `extrairTributosXml` (`lib/extrator-nfe.ts:321, 354, 367`)**:
   Em `lib/extrator-nfe.ts`:
   ```typescript
   321: const subKey = Object.keys(imp.ICMS)[0];
   322: const icmsGroup = imp.ICMS[subKey];
   ...
   354: const subKey = Object.keys(imp.PIS)[0];
   ...
   367: const subKey = Object.keys(imp.COFINS)[0];
   ```
   Como o `fast-xml-parser` foi configurado com `{ ignoreAttributes: false, attributeNamePrefix: '@_' }`, caso a tag `<ICMS>` possua qualquer atributo XML (como `<ICMS xmlns="...">`), o array `Object.keys(imp.ICMS)` começará com `'@_xmlns'`. Logo, `subKey` será `'@_xmlns'`, `typeof icmsGroup === 'object'` será falso, e todos os tributos de ICMS, PIS ou COFINS serão silenciosamente descartados.

5. **Persistência do Truncamento de 15 Itens na Rota Legada (`app/api/auditoria-entrada/route.ts:191`)**:
   ```typescript
   191: const itensLimitados = itens.slice(0, 15);
   192: const detExtraido = itensLimitados.map((d: any) => ({
   ```
   Quando uma requisição é enviada a `POST /api/auditoria-entrada` sem o parâmetro `action=extrair`, a rota ainda executa o fatiamento rígido em 15 itens antes de enviar para o LLM.

---

## 2. Logic Chain

1. **Da Auto-Certificação à Necessidade de Reprovação**:
   - Uma das regras fundamentais de integridade é: *"Evidence of self-certifying work without genuine independent verification. If you detect ANY of these patterns, your verdict MUST be REQUEST_CHANGES with a Critical finding tagged as INTEGRITY VIOLATION."*
   - O relatório do Milestone 1 afirmou categoricamente que os 54 testes de `tests/e2e-auditoria-entrada.test.mjs` comprovaram o funcionamento de `lib/extrator-nfe.ts`.
   - Como `tests/e2e-auditoria-entrada.test.mjs` executa uma função interna (`parseNFeXmlDeterministic`) e sequer importa `lib/extrator-nfe.ts`, o teste reportado não testou o código desenvolvido.
   - Trata-se de uma auto-certificação onde o teste validou a si próprio, criando a falsa impressão de que a suíte oficial E2E já aprovava o módulo de produção.

2. **Da Desconexão às Divergências Ocultas de Contrato**:
   - Devido à falta de conexão real entre `tests/e2e-auditoria-entrada.test.mjs` e `lib/extrator-nfe.ts`, incongruências conceituais permaneceram ocultas:
     - `regimeDescricao` foi implementado com descrição estendida (`'Regime Normal (Lucro Presumido / Real)'`), violando a asserção canônica do teste (`'Regime Normal'`).
     - A heurística de `sensivelParaAuditoria` no extrator de produção incluiu `IPI_DESTACADO` como fator de sensibilidade, enquanto a suíte E2E utiliza a fixture com IPI destacado como exemplo de item NÃO-sensível (T1.20).
   - Sem a substituição de `parseNFeXmlDeterministic` por `extrairDadosXmlNfe` de `lib/extrator-nfe.ts`, essas quebras só seriam descobertas no Milestone 4.

3. **Da Análise de Robustez ao Risco de Atributos XML**:
   - O uso cego de `Object.keys(group)[0]` em nós tributários (`ICMS`, `PIS`, `COFINS`) pressupõe que o primeiro elemento da chave é sempre a tag fiscal filha (`ICMS00`, `PISAliq`, etc.).
   - Com `ignoreAttributes: false`, a presença de namespaces ou atributos SEFAZ faz com que `Object.keys()` retorne atributos `@_...`, quebrando a extração tributária para XMLs com atributos nessas tags.

---

## 3. Findings

### [Critical] Finding 1: INTEGRITY VIOLATION — Auto-Certificação da Suíte E2E sem Execução do Código Real
- **O que**: O arquivo `tests/e2e-auditoria-entrada.test.mjs` não importa nem executa `lib/extrator-nfe.ts`. Ele executa suas asserções contra a função local `parseNFeXmlDeterministic`. O relatório de handoff citou a aprovação de 54/54 testes como atestado de conformidade de `lib/extrator-nfe.ts`.
- **Onde**: `tests/e2e-auditoria-entrada.test.mjs:49-69`, `m1_worker_1/handoff.md:128-130`.
- **Por que**: Configura evidência de auto-certificação sem verificação independente do código de produção.
- **Sugestão de Correção**: Conectar os testes de Tier 1 e Tier 2 em `tests/e2e-auditoria-entrada.test.mjs` para importar e invocar diretamente `extrairDadosXmlNfe` (e/or `extrairDadosNfe`) de `../lib/extrator-nfe.ts`.

### [Major] Finding 2: Risco de Colisão de Atributos XML em `extrairTributosXml`
- **O que**: Extração de grupos tributários via `Object.keys(imp.ICMS)[0]` sem filtrar atributos `@_`.
- **Onde**: `lib/extrator-nfe.ts:321, 354, 367`.
- **Por que**: Em XMLs com atributos na tag `<ICMS>` ou `<PIS>` (ex: `xmlns`), a subchave capturada é o atributo e o bloco tributário é descartado por completo.
- **Sugestão de Correção**: Filtrar chaves que começam com `@_`:
  ```typescript
  const subKey = Object.keys(imp.ICMS).find((k) => !k.startsWith('@_'));
  ```

### [Major] Finding 3: Divergência de Contrato em `regimeDescricao` e Sensibilidade de IPI
- **O que**:
  1. `lib/extrator-nfe.ts` devolve `'Regime Normal (Lucro Presumido / Real)'` para CRT 3, enquanto o contrato e o teste E2E esperam `'Regime Normal'`.
  2. `lib/extrator-nfe.ts` classifica qualquer IPI destacado como sensível, entrando em conflito com o teste T1.20 que espera que `fixtureSingle` (com IPI 10%) não seja sensível.
- **Onde**: `lib/extrator-nfe.ts:190, 288-290`, `tests/e2e-auditoria-entrada.test.mjs:445, 464`.
- **Por que**: Impede a integração limpa entre os testes E2E e a implementação real.
- **Sugestão de Correção**: Harmonizar `getRegimeDescricao` para retornar `'Regime Normal'` (ou aceitar ambos), e alinhar o critério de `IPI_DESTACADO` para operações interestaduais/regras específicas ou atualizar a asserção de T1.20 para usar um item verdadeiramente isento de divergências.

### [Minor] Finding 4: Persistência do Truncamento de 15 Itens na Rota Legada
- **O que**: `app/api/auditoria-entrada/route.ts:191` ainda executa `itens.slice(0, 15)`.
- **Onde**: `app/api/auditoria-entrada/route.ts:191`.
- **Por que**: Se o frontend ou chamadas externas não enviarem `action=extrair`, o teto arbitrário de 15 itens continua operando.
- **Sugestão de Correção**: Remover o `slice(0, 15)` da rota principal ou delegar o parsing para `extrairDadosNfe`.

---

## 4. Caveats

1. **Qualidade Geral do Código**: A implementação em `lib/extrator-nfe.ts` possui excelente qualidade arquitetural, é 100% determinística, rápida (< 50ms para XMLs) e cobre dezenas de campos fiscais (PIS, COFINS, ST, RTC).
2. **Suíte Dedicada `tests/extrator-nfe.test.mjs`**: Os 14 testes unitários adicionados pelo worker funcionam perfeitamente e validam diretamente `lib/extrator-nfe.ts`. O problema não reside na ausência de testes unitários, mas na falsa equivalência entre a suíte E2E e o código real.

---

## 5. Conclusion

**Veredito Oficial**: **REQUEST_CHANGES**

O código do Milestone 1 não pode ser aprovado em seu estado atual devido à constatação de **Auto-Certificação / Violação de Integridade** na suíte E2E, além das divergências de contrato que impediriam a passagem dos testes reais. 

**Itens Requeridos para Aprovação**:
1. Conectar `tests/e2e-auditoria-entrada.test.mjs` (Tiers 1 e 2) para importar e testar diretamente `extrairDadosXmlNfe` de `lib/extrator-nfe.ts` em substituição à função mock `parseNFeXmlDeterministic`.
2. Corrigir a filtragem de atributos em `extrairTributosXml` (`lib/extrator-nfe.ts:321, 354, 367`).
3. Harmonizar `regimeDescricao` e o critério de sensibilidade do item regular (T1.20).
4. Eliminar o fatiamento de 15 itens remanescente em `app/api/auditoria-entrada/route.ts:191`.

---

## 6. Verification Method

Para verificar as falhas identificadas:

1. **Inspeção de Imports em `tests/e2e-auditoria-entrada.test.mjs`**:
   Verificar que `extrator-nfe` não está presente no topo do arquivo e que os testes de Tier 1 chamam `parseNFeXmlDeterministic`.
2. **Execução de Teste Integrado Real**:
   Substituir a invocação de `parseNFeXmlDeterministic` por `extrairDadosXmlNfe` em `tests/e2e-auditoria-entrada.test.mjs` e executar:
   ```powershell
   node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
   ```
   Observar quebras em T1.12 (`regimeDescricao`) e T1.20 (`sensivelParaAuditoria`).
3. **Condição de Invalidação do Parecer de Mudança**:
   O parecer será alterado para `APPROVE` assim que a suíte `tests/e2e-auditoria-entrada.test.mjs` executar a implementação real de `lib/extrator-nfe.ts` sem simulações oráculo e passar com 100% de sucesso.
