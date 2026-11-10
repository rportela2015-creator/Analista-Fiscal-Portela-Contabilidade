# Relatório Pericial de Review — M1 Reviewer IT2-2: Fiscal Domain & Sensitivity Review

**Agente**: `m1_reviewer_it2_2` (teamwork_reviewer — reviewer, critic)  
**Milestone**: Milestone 1 — Deterministic Extraction Engine & Dual-Routing Endpoint  
**Data**: 2026-11-09T16:38:00Z  
**Diretório de Trabalho**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_reviewer_it2_2`  
**Destinatário**: `parent` (`5db90b78-2923-4eca-9d94-d6c126a7f3be`)  
**Tipo de Handoff**: **Hard Handoff** (Revisão Concluída, Testada e Aprovada)  
**Veredito**: **APPROVE**

---

## 1. Observation

Durante a auditoria independente e estresse adversarial da remediação implementada por `m1_worker_2`, foram diretamente observados e verificados os seguintes fatos:

### 1.1 Eliminação Absoluta de Mocks e Facades em `tests/e2e-auditoria-entrada.test.mjs`
- Linhas 14 e 50-52:
  ```javascript
  import { extrairDadosXmlNfe, extrairDadosNfe, FiscalExtractionError } from '../lib/extrator-nfe.ts';
  ...
  function parseNFeXmlDeterministic(xmlString, mapaD8) {
    return extrairDadosXmlNfe(xmlString, mapaD8);
  }
  ```
  A função `parseNFeXmlDeterministic` repassa a chamada de forma estrita e direta para `extrairDadosXmlNfe` de `lib/extrator-nfe.ts`. O antigo oráculo redundante de 160 linhas foi completamente removido, eliminando qualquer padrão de auto-certificação.

### 1.2 Heurística Pericial em `avaliarSensibilidadeFiscal` (`lib/extrator-nfe.ts:249-327`)
- **Item Industrial Limpo (CST 50, 10% IPI, CRT 3)**:
  Em `lib/extrator-nfe.ts:293-308`, a lógica de detecção de sensibilidade para IPI foi refinada:
  ```typescript
  const cstIpi = item.tributos.cstIpi || '';
  const hasIpi = (item.tributos.vIPI ?? 0) > 0 || (item.tributos.pIPI ?? 0) > 0;
  const isAdquirenteSimples = Boolean(contexto?.regime?.toLowerCase().includes('simples'));
  const isAdquirenteConsumo = Boolean(
    contexto?.finalidade?.toLowerCase().includes('consumo') ||
    contexto?.finalidade?.toLowerCase().includes('imobilizado')
  );
  const ipiComVedacaoCredito = hasIpi && (isAdquirenteSimples || isAdquirenteConsumo);
  const ipiFornecedorSimplesIndevido = isFornecedorSimples && (hasIpi || cstIpi === '50');
  const ipiIsentoComValor = ['51', '52', '53', '54', '55'].includes(cstIpi) && (item.tributos.vIPI ?? 0) > 0;
  const ipiAtipico = cstIpi === '99' || (/^[0-4]/.test(cstIpi) && cstIpi.length === 2);

  if (ipiComVedacaoCredito || ipiFornecedorSimplesIndevido || ipiIsentoComValor || ipiAtipico) {
    motivos.push('IPI_DESTACADO');
  }
  ```
  Para itens regulares com venda industrial padrão entre contribuintes de Regime Normal, sem destinação a consumo/imobilizado e sem CSTs atípicos, `sensivelParaAuditoria` resulta em `false`, aprovando o teste T1.20 (`assert.equal(data.itens[0].sensivelParaAuditoria, false)`).
- **Ativação Sensível sob Restrições Reais de Crédito**:
  Quando informado contexto de `finalidade: 'Uso e Consumo'`, `finalidade: 'Ativo Imobilizado'` ou `regime: 'Simples Nacional'`, o mesmo item industrial limpo transiciona deterministamente para `sensivelParaAuditoria: true` com motivo `IPI_DESTACADO`, fundamentado nas vedações legais do Art. 23 da LC 123/2006 e normas de crédito do IPI (RIPI/2010).

### 1.3 Inconsistências de Simples Nacional (CRT 1) em Todos os CSTs Normais (`lib/extrator-nfe.ts:279-284`)
- Linhas 279-284:
  ```typescript
  const isFornecedorSimples = emitenteCrt === '1' || Boolean(csosn);
  if (isFornecedorSimples && ['102', '103', '300', '400', '500'].includes(csosn)) {
    motivos.push('CREDITO_VEDADO_SIMPLES_NACIONAL');
  } else if (isFornecedorSimples && (cstIcms === '00' || (!csosn && ['10', '20', '30', '40', '41', '50', '51', '60', '70', '90'].includes(cstIcms)))) {
    motivos.push('INCONSISTENCIA_SIMPLES_COM_CST_NORMAL');
  }
  ```
  Testado individualmente contra a totalidade dos 11 CSTs normais (`'00'`, `'10'`, `'20'`, `'30'`, `'40'`, `'41'`, `'50'`, `'51'`, `'60'`, `'70'`, `'90'`). Todos os 11 casos sem exceção resultam em `sensivelParaAuditoria: true` e contêm `INCONSISTENCIA_SIMPLES_COM_CST_NORMAL`.
- Todos os CSOSNs de vedação de crédito (`'102'`, `'103'`, `'300'`, `'400'`, `'500'`) disparam com precisão `CREDITO_VEDADO_SIMPLES_NACIONAL`.

### 1.4 Siscomex O(1) em Memória (`lib/ai/ncm-server.ts:8-19`) e Validador (`lib/extrator-nfe.ts:226-230`)
- `getMapaD8()` carrega `public/data/ncm.json` em um singleton `Map<string, Record8>`.
- O tamanho verificado do mapa é exatamente `10.515` registros oficiais da Nomenclatura Comum do Mercosul.
- Benchmark empírico executado em `scripts/verify-fiscal-domain.mjs`: 100.000 lookups foram executados em 4.46ms, com média de `0.0446 µs` (~45 nanossegundos) por lookup, atestando complexidade O(1) real.

### 1.5 Execução e Atestação de Comandos Obrigatórios
Todos os comandos executados no workspace apresentaram código de saída 0:
1. `npm run typecheck`: Exit code 0 (zero erros de TypeScript).
2. `npm test`: Exit code 0 (todas as 18 suítes do projeto aprovadas, incluindo UI smoke, auditoria, rules-integrity, fiscal, reforma, xml).
3. `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`: Exit code 0 (54 testes aprovados: Tier 1 22/22, Tier 2 21/21, Tier 3 6/6, Tier 4 5/5).
4. `node scripts/test.mjs tests/m1-challenger-stress.test.mjs`: Exit code 0 (14/14 aprovados, confirmando correções de milhar, PDF e regex).
5. `node scripts/test.mjs tests/adversarial-m1.test.mjs`: Exit code 0 (todas as 6 suítes adversariais aprovadas, latência < 25ms para 100 itens).
6. `node scripts/test.mjs scripts/verify-fiscal-domain.mjs`: Exit code 0 (verificações periciais de domínio fiscal 100% OK).

---

## 2. Logic Chain

1. **Da Integridade Arquitetural**:
   - A substituição do oráculo interno em `tests/e2e-auditoria-entrada.test.mjs` garante que a suíte de testes ponta a ponta avalie o código de produção `lib/extrator-nfe.ts`. A inspeção do código comprovou que `parseNFeXmlDeterministic` é uma delegação direta a `extrairDadosXmlNfe`, sem nenhuma interceptação ou atalho.
2. **Da Correção Tributária da Sensibilidade de IPI**:
   - Uma nota fiscal com venda mercantil industrial padrão (CST 50, alíquota de 10% de IPI) emitida por empresa em Regime Normal (CRT 3) para adquirente em Regime Normal destinada à revenda não constitui divergência pericial de entrada; é a operação típica prevista no RIPI/2010.
   - O teste T1.20 demandava que itens limpos não sofressem falsos positivos (`sensivelParaAuditoria: false`).
   - Simultaneamente, quando a entrada ocorre para consumo próprio ou ativo permanente, o crédito do IPI torna-se vedado e compõe custo. A lógica implementada em `avaliarSensibilidadeFiscal` identifica o contexto (`isAdquirenteConsumo` ou `isAdquirenteSimples`) e marca o item como sensível (`IPI_DESTACADO`), preservando 100% a proteção pericial do adquirente.
3. **Da Exaustividade das Inconsistências de Simples Nacional**:
   - Empresas do Simples Nacional (CRT 1) estão vinculadas à Tabela B do CSOSN (Ajuste SINIEF 07/2005) e não podem emitir documentos com CST normal (00 a 90), sob pena de infração à obrigação acessória e recolhimento indevido.
   - A inclusão de todos os 11 CSTs normais na condição de inconformidade garante que nenhum item emitido em desconformidade pelo fornecedor escape à auditoria seletiva.
4. **Da Performance Determinística O(1)**:
   - A validação contra o `mapaD8` em memória via `Map.prototype.get` assegura resposta em nanossegundos, viabilizando o processamento de notas com 500+ itens em < 70ms e atendendo plenamente à meta de latência de extração determinística imediata (< 200ms) sem intervenção de LLM.

---

## 3. Caveats

- **No caveats.** Todos os aspectos exigidos no dispatch foram verificados, testados empiricamente e validados com código de saída zero. Não foram identificadas violações de integridade, hardcoding ou facades.

---

## 4. Conclusion

A remediação do Milestone 1 executada por `m1_worker_2` atingiu conformidade técnica, regulatória e pericial irrepreensível:
1. `avaliarSensibilidadeFiscal` opera sem falsos positivos em operações normais (T1.20) e com cobertura completa de gatilhos fiscais reais.
2. Inconsistências de Simples Nacional com CSTs normais são detectadas em 100% dos 11 CSTs normais.
3. O catálogo oficial Siscomex (10.515 NCMs) opera em O(1) nativo com latência média inferior a 0.05 µs por consulta.
4. A suíte E2E executa diretamente contra o código de produção `lib/extrator-nfe.ts`.
5. Todas as suítes de testes estão 100% verdes.

**Veredito**: **APPROVE**

---

## 5. Verification Method

Para reprodução independente do veredito:

```powershell
Set-Location F:\Workspace\Apps\Aplicativo_MCM-

# 1. Typecheck estrito
npm run typecheck

# 2. Suíte completa de testes do projeto
npm test

# 3. Suíte E2E acoplada à produção (Tiers 1 a 4)
node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs

# 4. Suíte Challenger Stress
node scripts/test.mjs tests/m1-challenger-stress.test.mjs

# 5. Suíte Adversarial M1
node scripts/test.mjs tests/adversarial-m1.test.mjs

# 6. Suíte de Verificação Pericial do Domínio Fiscal
node scripts/test.mjs scripts/verify-fiscal-domain.mjs
```

### Condição de Invalidação
Este relatório será invalidado caso qualquer um dos 6 comandos acima retorne código de saída diferente de 0, ou caso `lib/extrator-nfe.ts` deixe de marcar como sensível fornecedor Simples Nacional com qualquer um dos 11 CSTs normais.
