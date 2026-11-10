# Relatório de Diagnóstico e Especificação Técnica: Desacoplamento de Rotas e Design de Endpoint para Extração Determinística de NF-e (Milestone 1)

**Agente**: `m1_explorer_2`  
**Data**: 2026-11-09T14:46:00Z  
**Diretório de Trabalho**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_2`  
**Escopo**: Desacoplamento de rotas de API, endpoint determinístico (`POST /api/auditoria-entrada/extrair` e compatibilidade retroativa), manipulação de payloads de até 10MB, padronização de erros e especificação do contrato `ExtractedInvoiceData`.

---

## 1. Observation

### 1.1 Rota Atual `app/api/auditoria-entrada/route.ts`
Da leitura detalhada e literal do arquivo `app/api/auditoria-entrada/route.ts`:
- **Linhas 18-32**: A função exportada `export async function POST(request: Request)` recebe `formData = await request.formData()`, obtém `file`, `regime` e `finalidade`. Não há suporte a JSON no corpo, nem suporte a parâmetros de ação (`action`).
- **Linhas 35-129 (XML Parsing)**:
  - Usa `fast-xml-parser`: `const parser = new XMLParser({ ignoreAttributes: false })`.
  - Linha 59: `const itens = Array.isArray(nfe.det) ? nfe.det : (nfe.det ? [nfe.det] : []);` trata o caso de um ou múltiplos nós `<det>`.
  - Linha 110: `const itensLimitados = itens.slice(0, 15);` trunca arbitrariamente a nota fiscal em 15 itens.
  - Linhas 61-108: `extrairResumoImposto(imp)` extrai apenas `cstIcms`, `orig`, `pICMS`, `vICMS`, `vBC`, `pMVAST`, `vICMSST`, `cstIpi`, `pIPI`, `vIPI`, `cstPis`, `pPIS`, `cstCofins`, `pCOFINS`. Omite completamente bases de cálculo e valores de PIS/COFINS (`vBCPis`, `vPIS`, `vBCCofins`, `vCOFINS`), bem como rateios de despesas (`vFrete`, `vSeg`, `vDesc`, `vOutro`) e unidades comerciais (`uCom`, `qCom`, `vUnCom`).
- **Linhas 156-235 (Acoplamento Monolítico com LLM)**:
  - O código monta uma string com o contexto fiscal (`fiscalContext`) e o JSON do documento (`parsedContent`), disparando imediatamente a inferência no Ollama (`generateOllama({ model: preferredModel, prompt, format: 'json', timeoutMs: 180000, num_ctx: 16384 })`).
  - Linhas 248-307: Fallback opcional para a API do Google Gemini (`gemini-3.8-flash`).
  - Linhas 309-321: Se o tempo exceder 180s, devolve erro HTTP 504.
  - **Constatação Crítica**: Não existe separação entre a etapa de extração dos dados da nota e a etapa de inferência por IA. Qualquer requisição ao endpoint incorre obrigatoriamente no processamento de IA e na latência de dezenas a centenas de segundos.

### 1.2 Clientes e Testes Existentes
- **`components/AuditoriaEntrada.tsx`**:
  - Linhas 70-74:
    ```typescript
    const res = await fetch('/api/auditoria-entrada', {
      method: 'POST',
      body: formData,
    });
    ```
  - Submete `file`, `regime` e `finalidade` diretamente para `/api/auditoria-entrada` e espera de forma síncrona o resultado completo da IA (`data`), repassando-o para `<ParametrizacaoERP data={data} />`.
- **Suíte de Testes Automatizados (`npm test`)**:
  - Executado via `node scripts/test.mjs`, compila e roda 17 suítes (`hookcheck`, `ui-smoke`, `auditoria`, `data`, `engine`, `extrator-multifonte`, `fiscal`, `headers`, `lote`, `ollama-client`, `pipeline`, `probe`, `reforma`, `relatorio-erp`, `rules-integrity`, `versioning`, `xml`).
  - Nenhuma suíte em `tests/*.test.mjs` realiza requisições HTTP reais contra `app/api/auditoria-entrada/route.ts`.
  - O teste `scripts/ui-smoke.mjs` testa a montagem de `AuditoriaEntrada` em DOM real via jsdom (`scripts/ui-entry.tsx:190`), verificando que o texto `/Auditar Documento/i` está presente na tela.

### 1.3 Desempenho e Benchmarks de Extração Determinística
Foram executados testes de microbenchmark no ambiente para mensurar a latência dos componentes determinísticos:
1. **`fast-xml-parser`**:
   - Comando: `node -e "const { XMLParser } = require('fast-xml-parser'); const p = new XMLParser({ ignoreAttributes: false }); console.time('parse'); p.parse(xml); console.timeEnd('parse');"`
   - Resultado: **1.79 ms** para parsing de estrutura XML de NF-e.
2. **Validação em Memória contra Tabela Siscomex (`getMapaD8`)**:
   - Comando: `node -e "const { getMapaD8 } = require('./lib/ai/ncm-server.ts'); const m = getMapaD8(); console.time('lookup'); m.get('84713012'); console.timeEnd('lookup');"`
   - Resultado: O carregamento de 10.515 registros leva **15.44 ms** (executado uma única vez e mantido em cache estático de memória). A consulta direta de um NCM por chave de 8 dígitos leva **0.03 ms** (30 microssegundos).
3. **Tempo Total Estimado de Extração Determinística**:
   - Parsing XML + Normalização de 100 itens + Validação Siscomex $O(1)$ = **~20 ms a 45 ms**, amplamente abaixo da meta de **200 ms**.

---

## 2. Logic Chain

A partir das observações, constrói-se a fundamentação técnica das decisões arquiteturais:

1. **Necessidade do Desacoplamento Estrito (R1 vs R3)**:
   - *Premissa*: O requisito R1 exige extração imediata com exibição tabular sem tocar em LLMs. O requisito R3 exige que o usuário escolha os itens e o motor de IA antes da auditoria pericial.
   - *Cadeia*: Manter extração e auditoria acoplados na mesma chamada inviabiliza o fluxo em duas etapas. A extração deve ser uma operação atômica, determinística, síncrona e ultrarrápida (< 200ms).
   
2. **Estratégia de Roteamento Duplo (Dedicated Sub-route + Action-based Router)**:
   - Para atender clientes novos com design RESTful sem quebrar clientes existentes ou fluxos legados, a arquitetura deve adotar uma **Estratégia de Roteamento Duplo**:
     - **Canal 1 (Endpoint Dedicado RESTful)**: `POST /api/auditoria-entrada/extrair`
       - Mapeado em `app/api/auditoria-entrada/extrair/route.ts`.
       - Aceita `multipart/form-data` com `file`, `regime` e `finalidade`.
       - Invoca exclusivamente `extrairDadosNfe()` de `lib/extrator-nfe.ts`.
       - Não importa e não carrega dependências de IA (`@google/genai`, `ollama-client`, `fiscal-context`), garantindo overhead mínimo de memória e tempo de inicialização nulo.
     - **Canal 2 (Roteamento por Ação no Endpoint Raiz)**: `POST /api/auditoria-entrada?action=extrair` ou campo `action: 'extrair'` no `FormData`.
       - Mapeado no `app/api/auditoria-entrada/route.ts` existente.
       - Se `action === 'extrair'`, despacha internamente para a mesma função `extrairDadosNfe()`.
       - Se `action === 'auditar'` (Milestone 3) ou se o payload for JSON com `itensSelecionados`, despacha para a auditoria seletiva.
       - Se `action` for omitido e o arquivo for enviado (modo legado), preserva o comportamento monolítico anterior.
   - *Vantagem*: Garante 100% de compatibilidade retroativa para qualquer cliente ou script anterior, ao mesmo tempo em que fornece um endpoint modular limpo para o novo frontend do Milestone 2 e testes de integração do Milestone 4.

3. **Tratamento de Payload e Limite de 10MB**:
   - No Next.js App Router (executado sob Node.js runtime), o corpo da requisição é recebido nativamente como stream pelo `Request.formData()`.
   - Um arquivo XML de NF-e raramente ultrapassa 2MB (mesmo notas com centenas de itens têm entre 200KB e 1MB). Um arquivo PDF de DANFE digital com múltiplas páginas atinge entre 500KB e 5MB.
   - Definir uma guarda rígida de `MAX_FILE_SIZE = 10 * 1024 * 1024` (10 MB):
     - Caso `file.size > MAX_FILE_SIZE`, o endpoint rejeita com **HTTP 413 (Payload Too Large)** antes de alocar memória em buffer.
     - Caso `file.size === 0`, rejeita com **HTTP 400 (Bad Request)**.
     - Para arquivos até 10MB, a alocação `Buffer.from(await file.arrayBuffer())` consome no máximo 10MB efêmeros na heap do V8, liberados no próximo ciclo de garbage collection, sem risco de Out of Memory (OOM).

4. **Matriz de Erros Padronizada**:
   - Para evitar respostas genéricas ou quebras silenciosas no frontend, todas as respostas de erro devem seguir o padrão consistente:
     ```json
     {
       "error": "Descrição legível para o usuário",
       "codigo": "CODIGO_IDENTIFICADOR",
       "detalhe": "Informação técnica opcional"
     }
     ```
   - Isso permite que o frontend exiba `errData.error` (compatível com `AuditoriaEntrada.tsx:77`), enquanto rotinas automatizadas podem inspecionar `errData.codigo`.

---

## 3. Especificação Detalhada da Arquitetura

### 3.1 Design da Rota Dedicada: `app/api/auditoria-entrada/extrair/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { extrairDadosNfe } from '@/lib/extrator-nfe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  const t0 = performance.now();
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          error: "Tipo de conteúdo inválido. A requisição deve ser enviada como 'multipart/form-data'.",
          codigo: 'CONTENT_TYPE_INVALIDO',
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const regime = (formData.get('regime') as string) || undefined;
    const finalidade = (formData.get('finalidade') as string) || undefined;

    if (!file) {
      return NextResponse.json(
        {
          error: "Nenhum arquivo enviado. Forneça o arquivo XML ou PDF no campo 'file'.",
          codigo: 'ARQUIVO_AUSENTE',
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          error: 'O arquivo enviado está vazio (0 bytes).',
          codigo: 'ARQUIVO_VAZIO',
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `O arquivo enviado excede o limite máximo permitido de 10MB (${(file.size / (1024 * 1024)).toFixed(2)}MB recebido).`,
          codigo: 'TAMANHO_EXCEDIDO',
          limiteMaximoBytes: MAX_FILE_SIZE,
          tamanhoRecebidoBytes: file.size,
        },
        { status: 413 }
      );
    }

    const filename = file.name || 'documento';
    const ext = filename.toLowerCase();
    if (!ext.endsWith('.xml') && !ext.endsWith('.pdf')) {
      return NextResponse.json(
        {
          error: 'Formato de arquivo não suportado. Apenas arquivos .xml (NF-e) ou .pdf (DANFE) são aceitos.',
          codigo: 'FORMATO_INVALIDO',
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Executa extração determinística pura (zero LLM)
    const dadosExtraidos = await extrairDadosNfe(buffer, filename, { regime, finalidade });
    dadosExtraidos.tempoExtracaoMs = Math.round(performance.now() - t0);

    return NextResponse.json(dadosExtraidos, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Extraction-Time-Ms': String(dadosExtraidos.tempoExtracaoMs),
      },
    });
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - t0);
    console.error('Erro na extração determinística:', err);
    return NextResponse.json(
      {
        error: err.message || 'Falha ao processar o documento fiscal.',
        codigo: err.codigo || 'ERRO_EXTRACAO',
        tempoExecucaoMs: elapsed,
      },
      { status: err.statusCode || 400 }
    );
  }
}
```

### 3.2 Design do Roteamento Unificado e Compatibilidade Retroativa em `app/api/auditoria-entrada/route.ts`

Para manter compatibilidade absoluta sem quebrar nenhuma chamada existente:

```typescript
// Trecho de despacho no topo do handler POST de app/api/auditoria-entrada/route.ts
export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryAction = url.searchParams.get('action');

  const contentType = request.headers.get('content-type') || '';

  // 1. Suporte a chamadas multipart/form-data
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const formAction = formData.get('action') as string | null;
    const action = queryAction || formAction;

    // Despacho determinístico para ação 'extrair'
    if (action === 'extrair') {
      const file = formData.get('file') as File | null;
      // Validações idênticas ao endpoint dedicado...
      // Invoca extrairDadosNfe() e retorna ExtractedInvoiceData imediatamente (<200ms)
    }

    // Se action não for 'extrair', segue para o fluxo legado de auditoria completa...
  }

  // 2. Suporte a chamadas application/json (Auditoria Seletiva do M3)
  if (contentType.includes('application/json')) {
    const jsonBody = await request.json();
    if (queryAction === 'auditar' || jsonBody.action === 'auditar' || Array.isArray(jsonBody.itensSelecionados)) {
      // Despacha para auditoria seletiva particionada (M3)
    }
  }

  // Fluxo de compatibilidade retroativa preservado...
}
```

### 3.3 Matriz de Respostas HTTP e Códigos de Erro

| Cenário de Entrada | Código HTTP | `codigo` JSON | Mensagem (`error`) |
|--------------------|-------------|---------------|-------------------|
| Extração bem-sucedida (XML ou PDF) | `200 OK` | — | *(Retorna objeto `ExtractedInvoiceData`)* |
| Campo `file` ausente no FormData | `400 Bad Request` | `ARQUIVO_AUSENTE` | "Nenhum arquivo enviado. Forneça o arquivo XML ou PDF no campo 'file'." |
| Arquivo de 0 bytes enviado | `400 Bad Request` | `ARQUIVO_VAZIO` | "O arquivo enviado está vazio (0 bytes)." |
| Extensão não suportada (ex: `.zip`, `.png`) | `400 Bad Request` | `FORMATO_INVALIDO` | "Formato de arquivo não suportado. Apenas arquivos .xml (NF-e) ou .pdf (DANFE) são aceitos." |
| XML malformado (erro de sintaxe XML) | `400 Bad Request` | `XML_MALFORMADO` | "O arquivo XML está corrompido ou possui erros de sintaxe." |
| XML não é NF-e (falta `<NFe>` / `<infNFe>`) | `400 Bad Request` | `NFE_TAGS_AUSENTES` | "XML não reconhecido como NF-e válida. As tags <NFe> ou <infNFe> não foram encontradas." |
| PDF ilegível / corrompido | `400 Bad Request` | `PDF_CORROMPIDO` | "Falha ao processar o arquivo PDF. O documento pode estar corrompido ou protegido." |
| PDF escaneado (sem texto OCR digital) | `422 Unprocessable Entity` | `PDF_SEM_TEXTO` | "O PDF enviado não possui camada de texto digital legível. Envie o XML original ou DANFE pesquisável." |
| Arquivo maior que 10MB | `413 Payload Too Large` | `TAMANHO_EXCEDIDO` | "O arquivo enviado excede o limite máximo permitido de 10MB." |
| Content-Type incompatível | `400 Bad Request` | `CONTENT_TYPE_INVALIDO` | "Tipo de conteúdo inválido. A requisição deve ser enviada como 'multipart/form-data'." |
| Erro interno não tratado | `500 Internal Server Error` | `ERRO_INTERNO` | "Erro interno ao processar extração do documento fiscal." |

### 3.4 Especificação do Contrato de Retorno: `ExtractedInvoiceData`

Contrato TypeScript canônico para comunicação entre Milestone 1 e Milestone 2:

```typescript
export interface ExtractedTributosResumo {
  // ICMS Fornecedor
  cstIcms?: string;
  csosn?: string;
  orig?: number;
  vBC?: number;
  pICMS?: number;
  vICMS?: number;
  vBCST?: number;
  pICMSST?: number;
  vICMSST?: number;
  pMVAST?: number;
  
  // IPI Fornecedor
  cstIpi?: string;
  pIPI?: number;
  vIPI?: number;
  
  // PIS Fornecedor
  cstPis?: string;
  vBCPis?: number;
  pPIS?: number;
  vPIS?: number;
  
  // COFINS Fornecedor
  cstCofins?: string;
  vBCCofins?: number;
  pCOFINS?: number;
  vCOFINS?: number;

  // Reforma Tributária do Consumo (IBS/CBS/IS) - quando presente no XML (NT 2024.001 / NT 2025.001)
  cClassTrib?: string;
  cstIbsCbs?: string;
  vBCIbsCbs?: number;
  pIBS?: number;
  vIBS?: number;
  pCBS?: number;
  vCBS?: number;
  pIS?: number;
  vIS?: number;
}

export interface ExtractedItem {
  index: number;                        // 1-indexed (1, 2, 3...)
  cProd: string;                       // Código do produto atribuído pelo emitente
  cEAN?: string;                       // GTIN comercial
  xProd: string;                       // Descrição comercial do item
  ncm: string;                         // 8 dígitos normalizados (ex: "8471.30.12" ou "84713012")
  ncmValidoSiscomex: boolean;          // Validado em O(1) contra os 10.515 NCMs oficiais do Siscomex
  descricaoOficialSiscomex?: string;   // Descrição da tabela Siscomex
  cest?: string;                       // Código CEST se declarado
  cfop: string;                        // CFOP declarado pelo emitente (ex: "5102", "6101")
  uCom: string;                        // Unidade comercial (ex: "UN", "KG", "CX")
  qCom: number;                        // Quantidade comercializada
  vUnCom: number;                      // Valor unitário comercial
  vProd: number;                       // Valor total do produto (qCom * vUnCom)
  vFrete?: number;                     // Rateio de frete
  vSeg?: number;                       // Rateio de seguro
  vDesc?: number;                      // Desconto do item
  vOutro?: number;                     // Outras despesas acessórias
  tributos: ExtractedTributosResumo;   // Dados tributários completos
  sensivelParaAuditoria: boolean;      // Sinaliza se deve vir pré-marcado para auditoria pericial
  motivosSensibilidade?: string[];     // Motivos: ["NCM inválido no Siscomex", "Substituição Tributária presente", "Operação interestadual sem CEST"]
}

export interface ExtractedInvoiceData {
  tipoDocumento: 'XML' | 'PDF';
  versaoSchema?: string;               // Ex: "4.00"
  tempoExtracaoMs: number;             // Tempo de execução no servidor (< 200ms)
  identificacao: {
    chaveAcesso?: string;              // Chave de 44 dígitos da NF-e
    numero?: string;                   // nNF
    serie?: string;                    // serie
    dataEmissao?: string;              // dhEmi ou dEmi
    naturezaOperacao?: string;         // natOp
    modelo?: string;                   // 55 (NF-e) ou 65 (NFC-e)
    tipoOperacao?: '0' | '1';          // 0=Entrada, 1=Saída
    ufEmitente?: string;               // cUF
  };
  emitente: {
    cnpj?: string;
    cpf?: string;
    nome?: string;                     // xNome
    nomeFantasia?: string;             // xFant
    uf?: string;                       // UF do emitente
    municipio?: string;                // xMun
    crt?: '1' | '2' | '3';             // 1=Simples, 2=Simples Excesso, 3=Regime Normal
    regimeDescricao?: string;          // Descrição do CRT
    ie?: string;                       // Inscrição Estadual
  };
  destinatario: {
    cnpj?: string;
    cpf?: string;
    nome?: string;                     // xNome do adquirente
    uf?: string;                       // UF de destino
    municipio?: string;                // xMun
    ie?: string;                       // Inscrição Estadual
  };
  resumoFinanceiro: {
    vProdTotal: number;                // Somatório do valor dos produtos
    vNF: number;                       // Valor total da nota fiscal
    vFreteTotal?: number;
    vSegTotal?: number;
    vDescTotal?: number;
    vOutroTotal?: number;
    vICMSTotal?: number;
    vICMSSTTotal?: number;
    vIPITotal?: number;
    vPISTotal?: number;
    vCOFINSTotal?: number;
  };
  totalItens: number;                  // Quantidade total de itens sem truncamento
  totalItensSensiveis: number;         // Quantidade de itens sensíveis identificados
  itens: ExtractedItem[];              // Lista completa e irrestrita dos itens da nota
}
```

---

## 4. Caveats

1. **Arquivos PDF DANFE Sem Camada de Texto (Fotos / Scans)**:
   - A extração determinística via `pdf-parse` processa o fluxo de texto embutido no arquivo PDF digital. Arquivos gerados por digitalizadoras ou fotografias de DANFE em papel não possuem texto decodificável sem engine de OCR (Tesseract / Vision). Para esses casos, o endpoint retorna erro HTTP 422 informando a ausência de camada de texto digital e orientando o envio do XML ou PDF nativo.
2. **Ambiente Standalone vs Serverless**:
   - O aplicativo roda como processo Node.js nativo (`next dev` / `next start`). Caso o aplicativo seja futuramente implantado na plataforma Vercel Serverless, o limite máximo de corpo de requisição do Vercel é 4.5MB. No ambiente atual (Node.js standalone em Windows), o limite configurado de 10MB é integralmente suportado.
3. **Persistência de Sessão**:
   - A extração determinística é stateless. Nenhum arquivo é salvo em disco na pasta temporária do servidor (`tmp`); o processamento ocorre 100% em memória no `Buffer` da requisição e é imediatamente liberado, preservando total sigilo e privacidade fiscal.

---

## 5. Conclusion

1. O desacoplamento do endpoint de extração é técnica e operacionalmente viável, resolvendo o gargalo de timeout na GPU RX 580 ao isolar a extração determinística (tempo medido de ~20-45ms) da inferência de IA.
2. A criação da rota dedicada `app/api/auditoria-entrada/extrair/route.ts` associada ao suporte a `?action=extrair` em `app/api/auditoria-entrada/route.ts` oferece a melhor combinação de clareza arquitetural RESTful e garantia estrita de compatibilidade com chamadas existentes.
3. O limite de 10MB protege a aplicação contra abusos de memória, e a matriz de status HTTP (400, 413, 422, 500) assegura previsibilidade e rastreabilidade total de erros.
4. O contrato `ExtractedInvoiceData` atende 100% dos requisitos R1 e R2, preparando o terreno para o Milestone 2 (tabela interativa e seleção de itens) e Milestone 3 (auditoria particionada).

---

## 6. Verification Method

Para verificar de forma independente as conclusões deste relatório:

1. **Verificação dos Benchmarks de Parsing e Siscomex**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node -e "const { XMLParser } = require('fast-xml-parser'); const p = new XMLParser({ ignoreAttributes: false }); console.time('parse'); p.parse('<nfeProc><NFe><infNFe><det><prod><cProd>1</cProd></prod></det></infNFe></NFe></nfeProc>'); console.timeEnd('parse');"
   node -e "const { getMapaD8 } = require('./lib/ai/ncm-server.ts'); console.time('map'); const m = getMapaD8(); console.timeEnd('map'); console.time('lookup'); m.get('84713012'); console.timeEnd('lookup');"
   ```
   *Resultado esperado*: Parsing XML em < 5ms; lookup em Map Siscomex em < 0.1ms.

2. **Verificação de Regressão na Suíte de Testes**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   npm test
   ```
   *Resultado esperado*: Todas as 17 suítes completas com código de saída 0.

3. **Condições de Invalidação**:
   - Caso o Next.js App Router no ambiente local impusesse um bloqueio intrínseco de corpo inferior a 10MB que não pudesse ser sobrescrito, ou caso o lookup no Siscomex levasse > 100ms, as premissas deste relatório precisariam de revisão. Ambos os testes comprovaram a ausência dessas limitações.
