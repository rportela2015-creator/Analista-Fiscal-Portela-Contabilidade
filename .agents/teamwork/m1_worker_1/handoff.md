# Relatório de Handoff: Implementação do Motor de Extração Determinística de NF-e e Endpoints (Milestone 1)

**Agente**: `m1_worker_1`  
**Milestone**: Milestone 1 — Deterministic Extraction Engine & Endpoint  
**Data**: 2026-11-09T15:05:00Z  
**Diretório de Trabalho**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_worker_1`  
**Arquivos Criados/Modificados**:
- `lib/extrator-nfe.ts` (Implementação de produção do motor determinístico)
- `app/api/auditoria-entrada/extrair/route.ts` (Endpoint dedicado RESTful com limite de 10MB)
- `app/api/auditoria-entrada/route.ts` (Dispatcher de roteamento duplo `action=extrair` com compatibilidade retroativa)
- `tests/extrator-nfe.test.mjs` (Suíte automatizada de testes unitários e de integração do extrator)
- `scripts/test.mjs` (Registro da nova suíte na esteira oficial de testes)

---

## 1. Observation

### 1.1 Estado Inicial da Base de Código
Antes das modificações do Milestone 1, foram observados os seguintes fatos concretos no repositório:
1. **Truncamento Rígido de Itens em `app/api/auditoria-entrada/route.ts:110`**:
   ```typescript
   110: const itensLimitados = itens.slice(0, 15);
   111: const detExtraido = itensLimitados.map((d: any) => ({
   ```
   *Impacto*: Notas fiscais com mais de 15 itens sofriam truncamento arbitrário e silencioso, descartando itens excedentes antes do envio para o modelo de IA.
2. **Incompatibilidade da Dependência `pdf-parse: ^2.4.5` (`package.json:25`)**:
   Em `app/api/auditoria-entrada/route.ts:4, 131`:
   ```typescript
   4: const pdfParse = (pdfParseModule as any).default || pdfParseModule;
   ...
   131: const pdfData = await pdfParse(buffer);
   ```
   No Node.js v24 com `pdf-parse` versão 2.4.5, a exportação default é `undefined` e o módulo exporta a classe instanciável `PDFParse`. A invocação direta gerava `TypeError: pdfParse is not a function`.
3. **Ausência de Extração de Dados Tributários de Entrada**:
   A função `extrairResumoImposto` em `route.ts:61-108` omitia bases de cálculo e valores de PIS/COFINS (`vBCPis`, `vPIS`, `vBCCofins`, `vCOFINS`), bases de IPI (`vBCIpi`), bases e alíquotas de ICMS-ST (`vBCST`, `pICMSST`), crédito de Simples Nacional (`pCredSN`, `vCredICMSSN`), campos de transição da Reforma Tributária (`<IBSCBS>`), além de dados comerciais do produto (`uCom`, `qCom`, `vUnCom`, `vFrete`, `vSeg`, `vDesc`, `vOutro`).
4. **Acoplamento Monolítico Obrigatório com LLM**:
   Qualquer envio de arquivo para `POST /api/auditoria-entrada` disparava imediatamente inferência no Ollama local (`timeoutMs: 180000`, 180 segundos), impedindo visualização prévia tabular ou seleção seletiva de itens conforme exigido pelos requisitos R1 e R2.

---

## 2. Logic Chain

A partir das observações técnicas e dos requisitos de `ORIGINAL_REQUEST.md` e `PROJECT.md`:

1. **Desacoplamento Determinístico Imediato (R1)**:
   - Para garantir extração em < 200ms sem risco de timeout na GPU RX 580, todo o processamento de XML e PDF foi isolado em TypeScript puro no módulo `lib/extrator-nfe.ts`.
   - Utilizou-se o `fast-xml-parser` configurado com `isArray: (name) => name === 'det'`, `trimValues: true` e `parseTagValue: false`.
   - A configuração `parseTagValue: false` impede que valores como NCM `01012100` ou CST `00` sejam convertidos para inteiros e percam zeros à esquerda.
   - O mapeamento sobre a lista `det` completa (`det[0..N]`) removeu integralmente o teto arbitrário de 15 itens, garantindo 100% de extração sem truncamento.

2. **Validação Instantânea no Siscomex em O(1)**:
   - O catálogo oficial de 10.515 registros do Siscomex em `public/data/ncm.json` é carregado de forma síncrona na memória por `getMapaD8()` de `lib/ai/ncm-server.ts`.
   - As funções exportadas `normalizarNcm(raw)` e `validarNcmSiscomex(d8, mapaD8)` tratam 7 dígitos (aplicando `padStart(8, '0')`), rejeitam notação científica do Excel (`/[\d.]+[eE][+-]?\d+/`), e realizam a validação em $O(1)$ (< 0.1ms).

3. **Heurística Objetiva de Sensibilidade Fiscal de Entrada (R2, R4)**:
   - Implementou-se a função `avaliarSensibilidadeFiscal()`, que sinaliza `sensivelParaAuditoria: true` e popula `motivosSensibilidade: string[]` com base em 8 critérios fiscais objetivos:
     - `NCM_INVALIDO_SISCOMEX`: NCM não catalogado ou formatação truncada.
     - `SUBSTITUICAO_TRIBUTARIA`: Presença de CSTs de ST (`10`, `30`, `60`, `70`, `90`, `201`, `202`, `203`, `500`), valores de ST (`vICMSST`, `vBCST`, `pMVAST`) ou código CEST.
     - `CFOP_INTERESTADUAL`: Operações com CFOPs iniciados por `6.xxx` ou `2.xxx`.
     - `CREDITO_VEDADO_SIMPLES_NACIONAL`: Fornecedor Simples Nacional com CSOSN sem crédito (`102`, `103`, `300`, `400`, `500`) ou inconsistência de CST normal `00`.
     - `REDUCAO_BASE_CALCULO`: CST `20`, `70` ou `pRedBC > 0`.
     - `ISENCAO_OU_NAO_TRIBUTADO`: CST `40`, `41`, `50`.
     - `IPI_DESTACADO`: Destaque de imposto industrial (`vIPI > 0` ou CST `50`).
     - `PIS_COFINS_MONOFASICO_OU_ZERO`: CSTs monofásicos/alíquota zero (`04`, `05`, `06`, `07`, `08`, `09`).
     - `DESCRICAO_INSUFICIENTE`: Descrição ou código de produto ausente.

4. **Resolução da Quebra do `pdf-parse: ^2.4.5`**:
   - Desenvolveu-se um adaptador seguro na função `extrairTextoPdf`:
     ```typescript
     if ((pdfModule as any).PDFParse) {
       const PDFParseClass = (pdfModule as any).PDFParse;
       const parser = new PDFParseClass({ data: pdfBuffer });
       const textResult = await parser.getText();
       return typeof textResult === 'string' ? textResult : (textResult?.text || JSON.stringify(textResult));
     }
     ```
   - O adaptador suporta tanto a classe `PDFParse` da versão 2.4.5 quanto funções legadas invocáveis de versões anteriores.

5. **Estratégia de Roteamento Duplo e Limite de 10MB (R1, R2)**:
   - Criou-se o endpoint dedicado `POST /api/auditoria-entrada/extrair` (`app/api/auditoria-entrada/extrair/route.ts`) respondendo com headers `Cache-Control: no-store` e `X-Extraction-Time-Ms`.
   - Atualizou-se o handler principal em `app/api/auditoria-entrada/route.ts` para verificar `action === 'extrair'` (via query string `?action=extrair` ou campo `action: 'extrair'` no `FormData`).
   - Ambas as rotas aplicam a guarda de `MAX_FILE_SIZE = 10 * 1024 * 1024` (10 MB), rejeitando sobrecargas com HTTP 413 (`TAMANHO_EXCEDIDO`), arquivos vazios com HTTP 400 (`ARQUIVO_VAZIO`), e extensões não suportadas com HTTP 400 (`FORMATO_INVALIDO`).
   - A compatibilidade retroativa para requisições legadas de auditoria monolítica sem parâmetro `action` foi 100% preservada.

---

## 3. Caveats

1. **PDFs de DANFE Escaneados (Sem Camada de Texto OCR)**:
   - O extrator processa arquivos PDF vetoriais/digitais nativos. Em caso de envio de imagens digitalizadas ou fotos sem texto digital embutido, o extrator detecta a ausência de texto legível e devolve HTTP 422 (`PDF_SEM_TEXTO`), instruindo o usuário a enviar o XML ou PDF pesquisável.
2. **Tags de IBS/CBS na NF-e 4.00**:
   - A maioria dos documentos fiscais em circulação ainda não contém as tags de transição da Reforma Tributária (NT 2024.001 / NT 2025.001). O extrator extrai os campos de IBS/CBS quando presentes, e mantém os campos como `undefined` quando ausentes, preparando os dados para a auditoria do Milestone 3.
3. **No Caveats adicionais**: A implementação opera 100% em memória, não persiste arquivos temporários em disco e não introduz dependências externas.

---

## 4. Conclusion

O Milestone 1 foi plenamente implementado, testado e verificado:
- `lib/extrator-nfe.ts` exporta todos os contratos canônicos (`ExtractedInvoiceData`, `ExtractedItem`, `ExtractedTributosResumo`) e funções (`extrairDadosNfe`, `extrairDadosXmlNfe`, `extrairDadosPdfDanfe`, `avaliarSensibilidadeFiscal`, `normalizarNcm`, `validarNcmSiscomex`).
- `app/api/auditoria-entrada/extrair/route.ts` disponibiliza o endpoint RESTful dedicado com execução determinística em < 200ms e limite de 10MB.
- `app/api/auditoria-entrada/route.ts` despacha requisições com `action=extrair` para o motor determinístico e mantém suporte intacto para o fluxo anterior.
- A suíte de testes `tests/extrator-nfe.test.mjs` adicionou 11 testes cobrindo todas as regras de normalização, Siscomex, sensibilidade tributária e zero truncamento com 35 itens.

---

## 5. Verification Method

Comandos executados para comprovação independente:

1. **Validação da Suíte Oficial do Projeto (`npm test`)**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   npm test
   ```
   *Resultado*: Execução de 18 suítes (incluindo `hookcheck`, `ui-smoke` e `extrator-nfe.test.mjs`), finalizando com `SUÍTES COMPLETAS ✓` e código de saída 0.

2. **Verificação Estrita de Tipos TypeScript (`npm run typecheck`)**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   npm run typecheck
   ```
   *Resultado*: `tsc --noEmit` executado com zero erros de compilação e código de saída 0.

3. **Validação da Suíte Completa E2E (Tiers 1 a 4)**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   node tests/e2e-auditoria-entrada.test.mjs
   ```
   *Resultado*: 54 testes aprovados (22/22 Tier 1, 21/21 Tier 2, 6/6 Tier 3, 5/5 Tier 4), 0 falhas, confirmando zero truncamento e ausência de timeout.

4. **Condições de Invalidação**:
   - Caso `extrairDadosXmlNfe` trunque uma nota fiscal com mais de 15 itens para 15 itens.
   - Caso `pdf-parse: ^2.4.5` lance `TypeError: pdfParse is not a function`.
   - Caso o endpoint `/api/auditoria-entrada/extrair` exceda 200ms de execução para um documento XML.
   - Caso `npm test` ou `npm run typecheck` falhem.
   Todas as condições de invalidação foram expressamente testadas e comprovadas como inexistentes.
