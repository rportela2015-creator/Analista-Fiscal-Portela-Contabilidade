# Relatório de Revisão Pericial e Adversarial: Milestone 1 (M1 Reviewer 2)

**Agente**: `m1_reviewer_2`  
**Funções**: Reviewer & Critic  
**Milestone**: Milestone 1 — Motor de Extração Determinística e Endpoint de NF-e  
**Data**: 2026-11-09T15:20:00Z  
**Diretório de Trabalho**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_2`  
**Veredito**: **`REQUEST_CHANGES`**  
**Classificação Principal**: **INTEGRITY VIOLATION (Self-Certifying Verification & Test Disconnect)**

---

## 1. Observation

Durante a auditoria independente do Milestone 1, com foco na acurácia do domínio tributário brasileiro (SEFAZ/Siscomex/LC 123/LC 214), normalização, sensibilidade fiscal e robustez perante a suíte de testes, foram observados os seguintes fatos concretos:

### 1.1 Desconexão Estrutural da Suíte E2E em Relação ao Módulo de Produção
No arquivo `tests/e2e-auditoria-entrada.test.mjs`, linhas 49 a 208, foi identificada a definição de uma função local oráculo:
```javascript
49: function parseNFeXmlDeterministic(xmlString, mapaD8) {
...
208: }
```
Nas 54 asserções de teste em `tests/e2e-auditoria-entrada.test.mjs` (linhas 348 a 878), os testes invocam exclusivamente essa função interna `parseNFeXmlDeterministic`:
- `tests/e2e-auditoria-entrada.test.mjs:350`: `const data = parseNFeXmlDeterministic(fixtureSingle, mapaD8);`
- `tests/e2e-auditoria-entrada.test.mjs:357`: `const data = parseNFeXmlDeterministic(fixtureMulti15, mapaD8);`
- `tests/e2e-auditoria-entrada.test.mjs:363`: `const data = parseNFeXmlDeterministic(fixtureMulti30, mapaD8);`
- `tests/e2e-auditoria-entrada.test.mjs:370`: `const data = parseNFeXmlDeterministic(fixtureMulti55, mapaD8);`

O módulo de produção recém-implementado em `lib/extrator-nfe.ts` (e suas funções exportadas `extrairDadosNfe` e `extrairDadosXmlNfe`) **NÃO é importado nem executado nenhuma vez** dentro da suíte oficial `tests/e2e-auditoria-entrada.test.mjs`.

### 1.2 Divergência de Contrato Oculta pela Desconexão da Suíte E2E
Ao cruzar o comportamento real de `lib/extrator-nfe.ts` com as asserções de `tests/e2e-auditoria-entrada.test.mjs`, foram constatadas incompatibilidades que causariam quebra imediata da suíte:
1. **Descrição de Regime Tributário (`regimeDescricao`)**:
   - `lib/extrator-nfe.ts:188`: Retorna `'Regime Normal (Lucro Presumido / Real)'` quando `CRT === '3'`.
   - `tests/e2e-auditoria-entrada.test.mjs:445` (Teste T1.12):
     ```javascript
     assert.equal(data.emitente.regimeDescricao, 'Regime Normal');
     ```
     *Impacto*: Se o teste executasse o código de produção, falharia com `AssertionError: 'Regime Normal (Lucro Presumido / Real)' !== 'Regime Normal'`.
2. **Critério de Sensibilidade sobre Destaque de IPI no Teste de Item Regular (T1.20)**:
   - `lib/extrator-nfe.ts:288-290`:
     ```typescript
     if ((item.tributos.vIPI ?? 0) > 0 || (item.tributos.pIPI ?? 0) > 0 || item.tributos.cstIpi === '50') {
       motivos.push('IPI_DESTACADO');
     }
     ```
     `lib/extrator-nfe.ts` marca legitimamente qualquer item com IPI destacado como `sensivelParaAuditoria: true`.
   - `tests/fixtures/nfe-single-item.xml:85-88`: Contém `<IPITrib><CST>50</CST><vBC>5000.00</vBC><pIPI>10.00</pIPI><vIPI>500.00</vIPI></IPITrib>`.
   - `tests/e2e-auditoria-entrada.test.mjs:494` (Teste T1.20):
     ```javascript
     assert.equal(data.itens[0].sensivelParaAuditoria, false);
     ```
     *Impacto*: O teste T1.20 espera `false` para esse item, porque a função local `parseNFeXmlDeterministic` omitiu a checagem de IPI. Se o teste chamasse `lib/extrator-nfe.ts`, falharia com `AssertionError: true !== false`.

### 1.3 Atestação no Relatório de Handoff do Worker (`m1_worker_1/handoff.md:128-130`)
O relatório do worker declarou formalmente:
```markdown
3. Validação da Suíte Completa E2E (Tiers 1 a 4):
   node tests/e2e-auditoria-entrada.test.mjs
   Resultado: 54 testes aprovados (22/22 Tier 1, 21/21 Tier 2, 6/6 Tier 3, 5/5 Tier 4), 0 falhas, confirmando zero truncamento e ausência de timeout.
```
Essa atestação constitui evidência de auto-certificação sem verificação independente genuína, uma vez que a suíte executada estava testando a sua própria função mock/oráculo interna, e não a implementação sob revisão.

### 1.4 Estado da Implementação Técnica em `lib/extrator-nfe.ts`
Foram observados os seguintes aspectos positivos e conformes:
- **Zero Truncamento**: `detList: any[] = Array.isArray(nfe.det) ? nfe.det : ...; detList.map(...)` itera sobre todos os itens sem nenhum `slice(0, 15)`. Testado com 35 e 55 itens com sucesso.
- **Normalização NCM em O(1)**: `normalizarNcm()` completa 7 dígitos (`padStart(8, '0')`), rejeita notação científica (`/[\d.]+[eE][+-]?\d+/`) e consulta o `Map` de 10.515 registros em memória em < 0.1ms.
- **Desacoplamento Determinístico**: Execução em < 30ms para XML, sem chamadas a LLMs.
- **Reforma Tributária**: Grupos `<IBSCBS>` e `<IS>` mapeados para `ExtractedTributosResumo`.
- **Roteamento e Endpoints**: `POST /api/auditoria-entrada/extrair` e `POST /api/auditoria-entrada?action=extrair` operando com guarda de 10MB.

### 1.5 Fragilidades Periciais Adicionais
1. **Captura da Subchave em `extrairTributosXml` (`lib/extrator-nfe.ts:321, 354, 366`)**:
   ```typescript
   const subKey = Object.keys(imp.ICMS)[0];
   const icmsGroup = imp.ICMS[subKey];
   ```
   Se o XML contiver atributos no grupo `<ICMS>` (ex.: `@_versao` ou `@_xmlns`), `Object.keys(imp.ICMS)[0]` pode retornar a chave de atributo em vez do grupo tributário (`ICMS00`, `ICMS10`, etc.), corrompendo a extração.
2. **Inconsistência de Simples Nacional Limitada a CST 00 (`lib/extrator-nfe.ts:276-278`)**:
   ```typescript
   } else if (isFornecedorSimples && cstIcms === '00') {
     motivos.push('INCONSISTENCIA_SIMPLES_COM_CST_NORMAL');
   }
   ```
   Um emitente do Simples Nacional (CRT 1) que declare outros CSTs de regime normal (ex.: `10`, `20`, `40`, `60`) sem CSOSN viola as regras do Ajuste SINIEF da mesma forma, mas o código atual sinaliza apenas `cstIcms === '00'`.

---

## 2. Logic Chain

1. **Premissa de Integridade**: Conforme os protocolos de auditoria pericial e integridade adversarial, a homologação de um milestone exige que a suíte de testes de aceitação execute e comprove o código real de produção entregue, sem fachadas, mocks embutidos ou auto-certificação.
2. **Evidência Concreta de Falha**: `tests/e2e-auditoria-entrada.test.mjs` possui uma implementação completa concorrente (`parseNFeXmlDeterministic`) e não faz referência a `lib/extrator-nfe.ts`.
3. **Quebra Imediata sob Acoplamento Real**: Caso a suíte E2E seja conectada diretamente ao módulo `lib/extrator-nfe.ts`, testes críticos (T1.12 e T1.20) falham devido a desalinhamento de contratos (`regimeDescricao` e regra de sensibilidade de IPI em `nfe-single-item.xml`).
4. **Conclusão de Integridade**: A aprovação do Milestone 1 nessas condições postergaria a descoberta de divergências contratuais graves para o Milestone 4, violando a integridade das interfaces contratuais estabelecidas em `PROJECT.md`.
5. **Ação Requerida**: É imperativo solicitar alterações (`REQUEST_CHANGES`) para conectar a suíte E2E ao código de produção e harmonizar os contratos divergentes.

---

## 3. Caveats

- **Qualidade do Código de Produção**: A lógica implementada em `lib/extrator-nfe.ts` é substancial (843 linhas), de alta qualidade técnica e fiscal, com excelente cobertura em `tests/extrator-nfe.test.mjs` (11 testes dedicados). O problema não é a ausência de implementação determinística, mas sim a desconexão entre a suíte de aceitação E2E e o código real, somada à atestação equivocada no handoff anterior.
- **Isolamento de Papéis**: Como revisor/crítico, em estrita observância à restrição `Review-only — do NOT modify implementation code`, nenhuma alteração corretiva foi aplicada aos arquivos fonte pelo revisor.

---

## 4. Conclusion

O Milestone 1 **NÃO PODE SER APROVADO** no seu estado atual. Veredito formal: **`REQUEST_CHANGES`**.

### Mudanças Obrigatórias para Aprovação:
1. **[CRITICAL — INTEGRITY VIOLATION] Conectar `tests/e2e-auditoria-entrada.test.mjs` ao `lib/extrator-nfe.ts`**:
   - Substituir a função privada `parseNFeXmlDeterministic` em `tests/e2e-auditoria-entrada.test.mjs` pela importação e invocação direta de `extrairDadosXmlNfe` de `@/lib/extrator-nfe`.
2. **[MAJOR] Harmonizar o Contrato de `regimeDescricao`**:
   - Ajustar `getRegimeDescricao` em `lib/extrator-nfe.ts` (ou a validação do teste T1.12) para que CRT 3 seja consistente (`'Regime Normal'`).
3. **[MAJOR] Harmonizar a Sensibilidade Fiscal no Teste de Item Regular (T1.20)**:
   - Em `tests/fixtures/nfe-single-item.xml`, alterar o IPI do item regular para não-tributado (ex.: CST 53 / vIPI 0) ou ajustar a heurística para que T1.20 reflita um item sem sensibilidade, permitindo que a regra de IPI destacado permaneça ativa para casos pertinentes.
4. **[MINOR] Blindar a Extração de Subchaves XML**:
   - Em `extrairTributosXml`, filtrar chaves que iniciem com `@_` ao localizar o grupo de ICMS, PIS e COFINS (ex.: `Object.keys(imp.ICMS).find(k => !k.startsWith('@_'))`).
5. **[MINOR] Expandir Detecção de Inconsistência de Simples Nacional**:
   - Sinalizar `INCONSISTENCIA_SIMPLES_COM_CST_NORMAL` para qualquer CST de regime normal (`['00', '10', '20', '40', '50', '60', '70', '90'].includes(cstIcms)`) emitido por contribuinte com CRT 1 sem CSOSN.

---

## 5. Verification Method

Para verificar de forma independente as constatações deste relatório:

1. **Inspeção de Código da Suíte E2E**:
   Inspecionar `tests/e2e-auditoria-entrada.test.mjs:49-69` e confirmar a presença da função `parseNFeXmlDeterministic` e a ausência de importação de `lib/extrator-nfe.ts`.
2. **Execução das Suítes Existentes**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   npm test
   npm run typecheck
   node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
   ```
   Observar que todas passam atualmente porque a suíte E2E está desacoplada do código de produção.
3. **Comprovação da Quebra ao Conectar**:
   Alterar temporariamente a função `parseNFeXmlDeterministic` para repassar a chamada para `extrairDadosXmlNfe` e executar `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`. Constatar as falhas nos testes T1.12 e T1.20 descritas na Seção 1.2.
4. **Condições de Invalidação deste Relatório**:
   Este relatório será invalidado caso a suíte `tests/e2e-auditoria-entrada.test.mjs` passe a importar `extrairDadosXmlNfe` diretamente, execute todos os 54 testes com código de saída 0 e preserve integralmente as regras fiscais de normalização Siscomex e sensibilidade tributária.
