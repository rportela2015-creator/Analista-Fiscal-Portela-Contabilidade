# Relatório de Diagnóstico Arquitetural: Extração Determinística de NF-e e Seleção de Itens (R1 & R2)

## 1. Observation

Durante a investigação exaustiva do repositório `F:\Workspace\Apps\Aplicativo_MCM-`, foram inspecionados os arquivos de configuração, rotas de API, bibliotecas de processamento fiscal e componentes de interface. Seguem as observações diretas e literais:

### 1.1. Stack Tecnológico e Configuração
- **Framework & Runtime**: Next.js 16.3.4 (App Router), React 19 (`^19.0.0`), TypeScript 5.7 (`^5.7.0`) (`package.json:20-38`).
- **Dependências de Ingestão e IA**:
  - `fast-xml-parser`: `^5.11.1` (`package.json:23`)
  - `pdf-parse`: `^2.4.5` (`package.json:25`)
  - `@google/genai`: `^2.22.0` (`package.json:21`)
  - `zod`: `^4.6.7` (`package.json:28`)
- **Infraestrutura de Testes e Qualidade**:
  - Validador estático de hooks React: `scripts/hookcheck.mjs`
  - Smoke test em DOM real com jsdom: `scripts/ui-smoke.mjs` e `scripts/ui-entry.tsx`
  - Test runner customizado com compilação sob demanda via esbuild: `scripts/test.mjs`
  - Execução validada: `npm test` executa 16 suítes com código de saída 0 (`SUÍTES COMPLETAS ✓`).
  - Verificação de tipos TypeScript: `npm run typecheck` (`tsc --noEmit`) passa sem erros.

### 1.2. Fluxo Atual de Auditoria de Entrada (`AuditoriaEntrada.tsx` e `route.ts`)
- **Componente `components/AuditoriaEntrada.tsx`**:
  - Linhas 6-16: Mantém estado local apenas de `file`, `regime`, `finalidade`, `loading`, `error`, `data`, `pdfLoading`, `pdfError`.
  - Linhas 52-87 (`handleSubmit`): Ao submeter o formulário com o arquivo XML ou PDF, dispara imediatamente `fetch('/api/auditoria-entrada', { method: 'POST', body: formData })`.
  - Linha 128: Botão único de submissão `"Auditar Documento via IA Local"`.
  - Linhas 134-141: Exibe aviso estático de espera de 30 a 90 segundos na GPU local RX 580.
  - Linha 195: Quando a API responde, passa o resultado diretamente para `<ParametrizacaoERP data={data} />`.
  - **Constatação**: Não existe etapa prévia de exibição tabular dos dados extraídos do documento; não há seletores/checkboxes de itens; não há seletor entre IA Local e IA Externa.

- **API Route `app/api/auditoria-entrada/route.ts`**:
  - Linhas 35-45: Lê XML com `new XMLParser({ ignoreAttributes: false })` navegando para `parsedXml.nfeProc?.NFe?.infNFe || parsedXml.NFe?.infNFe`.
  - Linhas 61-108 (`extrairResumoImposto`): Extrai `cstIcms`, `orig`, `pICMS`, `vICMS`, `vBC`, `pMVAST`, `vICMSST`, `cstIpi`, `pIPI`, `vIPI`, `cstPis`, `pPIS`, `cstCofins`, `pCOFINS`. Não extrai `vBC` de PIS/COFINS, `vPIS`, `vCOFINS`, `qCom`, `uCom`, `vUnCom`, `vFrete`, `vSeg`, `vDesc`.
  - **Truncamento Arbitrário (Linha 110)**:
    ```typescript
    const itensLimitados = itens.slice(0, 15);
    ```
    O código impõe um teto forçado de 15 itens em qualquer nota fiscal.
  - Linhas 130-151 (PDF):
    ```typescript
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;
    const emitMatch = text.match(/CNPJ:\s*([\d\.\-\/]+)/);
    const destMatch = text.match(/DESTINATÁRIO[\s\S]*?CNPJ\/CPF:\s*([\d\.\-\/]+)/);
    const cfops = [...text.matchAll(/CFOP:\s*(\d{4})/g)].map(m => m[1]);
    const ncms = [...text.matchAll(/NCM[\/\s]*SH[:\s]*([\d\.]+)/g)].map(m => m[1]);
    const resumoPdf = {
      textoIntegral: text,
      extracaoAuxiliar: { ... }
    };
    parsedContent = JSON.stringify(resumoPdf, null, 2);
    ```
    Não há extração tabular item a item de PDF DANFE. O texto integral é inserido no payload JSON.
  - Linhas 156-235: Monta um único prompt unindo `fiscalContext` + `userPrompt` + todo o `parsedContent` e envia para `generateOllama({ model: preferredModel, prompt, format: 'json', timeoutMs: 180000, num_ctx: 16384 })`.
  - Linhas 309-321: Se o processamento local exceder 180s, estoura erro HTTP 504 com mensagem:
    `"O serviço de IA Local Ollama (GPU RX 580) está ativo, mas o processamento pericial excedeu o tempo limite (180s). O documento possui muitos itens ou a GPU está ocupada."`

### 1.3. Módulo `lib/extrator-multifonte.ts`
- Implementa extração canônica para matrizes tabulares 2D (`linhas: string[][]`), voltada para arquivos CSV e colagem de texto.
- Tipagem `RegistroCanonico`:
  ```typescript
  export interface RegistroCanonico {
    campos: {
      ncm?: string; cest?: string; descricao?: string; aliquota?: string;
      cprod?: string; cfop?: string; quantidade?: string; valor?: string;
      [key: string]: string | undefined;
    };
    origem: OrigemRegistro;
    erros: string[];
    isValido: boolean;
  }
  ```
- Não possui funções dedicadas para parsing de arquivos XML e PDF nativos em TypeScript (essas rotinas estavam apenas no protótipo Python `scripts/extrator_multifonte.py`).

### 1.4. Módulo `lib/ollama-client.ts` e GPU AMD RX 580
- Conecta-se a `http://127.0.0.1:11434` (Ollama local na GPU AMD Radeon RX 580 8GB Vulkan).
- Suporta seleção entre `qwen3.5:4b-16k` / `qwen3.5:4b` (triagem rápida) e `qwen2.5:7b-16k` / `qwen2.5:7b` (perícia profunda).
- `generateOllama` aceita `timeoutMs` (default 45s, configurado para 180s na rota atual).
- Testado e aprovado em `tests/ollama-client.test.mjs`.

---

## 2. Logic Chain

A partir das observações, constata-se a seguinte cadeia de causalidade e diagnóstico:

1. **Premissa de R1 (Extração Imediata sem LLM)**:
   - A especificação exige que o upload da nota fiscal (XML/PDF) renderize instantaneamente na interface uma tabela interativa com todos os produtos, tributos e códigos fiscais sensíveis, sem qualquer acionamento prévio de modelos de linguagem (Ollama ou Gemini).
   - *Fato Observado*: No código atual, `AuditoriaEntrada.tsx` invoca `/api/auditoria-entrada`, que executa a extração e a inferência de IA no mesmo ciclo síncrono. O usuário é forçado a esperar até 180s sem ver nenhum dado do documento.
   - *Conclusão*: O fluxo atual viola R1. É necessária a criação de um endpoint ou ação de extração pura (e.g. `POST /api/auditoria-extrair` ou modo desacoplado) que retorne os dados estruturados em milissegundos para renderização da tabela no frontend antes de qualquer chamada a LLM.

2. **Premissa de R2 (Inspeção e Seleção de Itens Sensíveis)**:
   - A especificação exige que o usuário inspecione a tabela extraída e selecione (individualmente por checkboxes, ou em lote via "Selecionar Todos" / "Desmarcar Todos") quais itens serão submetidos à auditoria.
   - *Fato Observado*: Atualmente, `AuditoriaEntrada.tsx` não renderiza tabela antes da IA e não possui seletores de itens. Além disso, a rota `route.ts:110` trunca arbitrariamente a nota em 15 itens (`itens.slice(0, 15)`), impedindo a auditoria de notas com mais de 15 produtos.
   - *Conclusão*: O componente de UI precisa de uma tabela interativa (`TabelaItensExtracao`) com checkboxes de seleção por item, botões de ação em lote ("Selecionar Todos", "Desmarcar Todos", "Selecionar Apenas Sensíveis") e contador reativo (`X de Y itens selecionados`). A rota deve remover a limitação de 15 itens na extração e processar estritamente os itens marcados pelo usuário.

3. **Causa Raiz do Timeout de 180s na GPU RX 580 (R3)**:
   - Em `app/api/auditoria-entrada/route.ts:158-210`, todos os itens (até 15) são convertidos em texto e concatenados em um único prompt massivo enviado ao Ollama com formato JSON forçado.
   - Na GPU AMD RX 580 (8 GB VRAM, Vulkan/DirectML), a taxa de geração do modelo 7B ou 4B com context window de 16k tokens para gerar um JSON volumoso contendo 15 itens com 16 campos cada excede os 180 segundos, resultando em aborto por timeout (`AbortError`).
   - *Solução Arquitetural*: O processamento local deve receber **somente os itens selecionados** pelo usuário e ser particionado em lotes pequenos (1 a 3 itens por chamada, ou item a item) com agregação determinística dos resultados parciais, eliminando por completo o risco de timeout.

4. **Alternância entre Motores (Local Ollama vs Externo Gemini)**:
   - Atualmente, a rota tenta primeiro Ollama e, caso falhe, tenta Gemini como fallback invisível. O usuário não tem controle sobre qual motor utilizar.
   - *Solução Arquitetural*: A UI de auditoria deve disponibilizar um controle explícito (radio button ou toggle) antes de iniciar a auditoria, permitindo escolher entre:
     - `IA Local (Ollama · GPU RX 580)`: Soberania e privacidade total, custo zero, particionamento em lote/item individual.
     - `IA Externa (Google Gemini API · gemini-3.8-flash)`: Alta velocidade para lotes maiores usando chave de API.

---

## 3. Caveats

1. **Arquivos PDF DANFE Escaneados (OCR)**:
   - A biblioteca `pdf-parse` extrai texto nativo embutido no PDF. Documentos que sejam fotos ou digitalizações de DANFE (sem camada de texto OCR) não possuem texto legível por `pdf-parse`. O parsing determinístico de PDF cobre DANFEs digitais (gerados diretamente por ERP/emissores com texto selecionável).
2. **Campos da Reforma Tributária em XMLs Vigentes**:
   - As notas fiscais emitidas atualmente no padrão NF-e 4.0 trazem ICMS, IPI, PIS e COFINS. Os campos de IBS/CBS e Imposto Seletivo (RTC) foram regulamentados pelas NT 2024.001 / NT 2025.001 para o ambiente de homologação/transição de 2026. A extração determinística deve contemplar todos os campos legados e prever os grupos do RTC quando presentes no XML.
3. **Ambiente de Testes Automatizados**:
   - Atualmente, não existiam arquivos de teste `.xml` ou `.pdf` reais na pasta `tests/` para simulação direta do endpoint de auditoria. A equipe subsequente deverá criar fixtures de teste (massa sintética de XML com múltiplos itens) para assegurar a cobertura dos novos componentes e rotas.

---

## 4. Conclusion

O diagnóstico confirma que a plataforma possui infraestrutura sólida (Next.js 16, bibliotecas tributárias nativas em `lib/`, integração com Siscomex e cliente Ollama operacional), mas **carece da arquitetura em 2 etapas para a auditoria de entrada de NF-e**:

1. **Etapa 1 — Extração Determinística Imediata (R1)**:
   - Criar módulo TypeScript puro de extração de NF-e (`lib/extrator-nfe.ts`) que processe XMLs e PDFs de forma completa:
     - Extrair 100% dos itens sem truncamento (`itens.length`);
     - Capturar código, descrição, NCM, CEST, CFOP, unidade, quantidade, valor unitário, valor total;
     - Capturar bases e alíquotas de ICMS/ST, IPI, PIS e COFINS;
     - Validar cada NCM em $O(1)$ contra os 10.515 NCMs oficiais do Siscomex em memória (`getMapaD8`);
     - Sinalizar indicadores de sensibilidade fiscal (e.g. CST com ST, CFOP interestadual, NCM inválido no Siscomex, valor elevado).
   - Disponibilizar endpoint `POST /api/auditoria-extrair` (ou ação desacoplada) com resposta imediata (< 100 ms).
   - Exibir na interface `AuditoriaEntrada.tsx` a tabela interativa contendo todos os dados fiscais e tributários do fornecedor.

2. **Etapa 2 — Seleção de Itens e Auditoria Seletiva (R2 & R3)**:
   - Adicionar checkboxes de seleção individual na tabela, com controles de cabeçalho ("Selecionar Todos", "Desmarcar Todos", "Selecionar Apenas Sensíveis").
   - Exibir contador reativo de seleção: `X de Y itens selecionados para auditoria`.
   - Adicionar seletor de motor de IA: `IA Local (Ollama - GPU RX 580)` vs `IA Externa (Google Gemini API)`.
   - Na auditoria local via Ollama, particionar os itens selecionados (lotes de 1 a 3 itens) com agregação progressiva no servidor, eliminando o estouro de timeout de 180s na RX 580.
   - Manter as salvaguardas existentes: sanitização com `sanearClassificacao()`, validação contra Siscomex e renderização do laudo técnico via `ParametrizacaoERP`.

---

## 5. Verification Method

Para verificar de forma independente as constatações deste relatório:

1. **Inspeção do Truncamento e Timeout em `route.ts`**:
   - Abrir `app/api/auditoria-entrada/route.ts` e verificar a linha 110: `const itensLimitados = itens.slice(0, 15);`.
   - Verificar a linha 208: `timeoutMs: 180000` na chamada `generateOllama`.
   - Verificar a ausência de particionamento de itens na inferência local.
2. **Inspeção da Interface em `AuditoriaEntrada.tsx`**:
   - Abrir `components/AuditoriaEntrada.tsx` e verificar a ausência de tabela pré-auditoria e a ausência de controles de seleção (`checkbox`).
3. **Execução da Suíte Atual de Testes**:
   - Executar no terminal:
     ```bash
     cd F:\Workspace\Apps\Aplicativo_MCM-
     npm test
     npm run typecheck
     ```
   - Confirmar que a suíte roda limpa (16 suítes passing) e que `tsc --noEmit` compila sem erros.
4. **Condições de Invalidação**:
   - Caso já existisse uma rota `/api/auditoria-extrair` desacoplada ou controles de seleção no componente `AuditoriaEntrada.tsx`, as conclusões deste relatório estariam invalidadas. A inspeção direta do código atesta que ambos estão ausentes e devem ser implementados.
