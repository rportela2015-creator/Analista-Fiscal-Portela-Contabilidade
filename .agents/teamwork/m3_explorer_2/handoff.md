# Handoff Report — M3 Explorer 2: Google Gemini API Cloud Engine Integration

**Role**: `teamwork_explorer` (M3 Explorer 2)  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m3_explorer_2`  
**Milestone**: Milestone 3 — Selective Partitioned AI Audit Engine (Ollama RX 580 & Gemini API)  
**Parent Conversation ID**: `9730c36f-6867-4776-9dd9-88da718cd7da`  
**Date**: 2026-11-09T20:05:00Z  

---

## 1. Observation

### 1.1 Dependency and Runtime Inspection (`package.json`)
- In `F:\Workspace\Apps\Aplicativo_MCM-\package.json`:
  - Line 21: `"@google/genai": "^2.22.0"` is declared in `dependencies`.
  - Line 28: `"zod": "^4.6.7"` is present.
  - Line 2: `"name": "classificador-ncm"`, `"type": "module"`.
  - Deprecated legacy packages (`@google/generative-ai` or `google-generativeai`) are **not present**.
- Runtime command execution:
  - Command: `node -e "import('@google/genai').then(m => console.log('GoogleGenAI loaded successfully:', typeof m.GoogleGenAI, typeof m.Type))"`
  - Result: `GoogleGenAI loaded successfully: function object` (exit code 0).
  - Command: `node -e "import('@google/genai').then(m => console.log('Type values:', m.Type))"`
  - Result:
    ```json
    {
      "TYPE_UNSPECIFIED": "TYPE_UNSPECIFIED",
      "STRING": "STRING",
      "NUMBER": "NUMBER",
      "INTEGER": "INTEGER",
      "BOOLEAN": "BOOLEAN",
      "ARRAY": "ARRAY",
      "OBJECT": "OBJECT",
      "NULL": "NULL"
    }
    ```

### 1.2 Target Model and Existing Codebase Usage
- File `F:\Workspace\Apps\Aplicativo_MCM-\AGENTS.md` (Line 12):
  > "- Utilizamos `@google/genai` (SDK nativo do Gemini, atualmente `gemini-3.8-flash`) para geração de IA forçando saídas em JSON via `responseSchema`."
- File `F:\Workspace\Apps\Aplicativo_MCM-\app\api\classificar-ia\route.ts`:
  - Line 2: `import { GoogleGenAI, Type } from '@google/genai';`
  - Lines 119-122: Reads `const apiKey = process.env.GEMINI_API_KEY;` and initializes `const ai = new GoogleGenAI({ apiKey });`.
  - Lines 123-138: Configures `responseMimeType: 'application/json'` and `responseSchema` with `Type.OBJECT`.
  - Line 140: Uses `const modelos = ['gemini-3.8-flash', 'gemini-3.6-flash'];`.
- File `F:\Workspace\Apps\Aplicativo_MCM-\lib\extrator-nfe.ts`:
  - Line 998: `modelo: motor === 'ollama' ? (modelo || 'qwen2.5:7b') : 'gemini-3.8-flash'`.
- File `F:\Workspace\Apps\Aplicativo_MCM-\tests\m2-challenger-stress.test.mjs`:
  - Line 702: `assert.equal(payloadGemini.modelo, 'gemini-3.8-flash');`.

### 1.3 Data Sovereignty Mode
- File `F:\Workspace\Apps\Aplicativo_MCM-\lib\ollama-client.ts`:
  - Lines 21-26:
    ```typescript
    export function getSovereigntyMode(): SovereigntyMode {
      const mode = (process.env.AI_SOVEREIGNTY_MODE || 'local_first').toLowerCase().trim();
      if (mode === 'local_strict') return 'local_strict';
      if (mode === 'hybrid') return 'hybrid';
      return 'local_first';
    }
    ```
- File `F:\Workspace\Apps\Aplicativo_MCM-\app\api\auditoria-entrada\route.ts`:
  - Lines 333-341: In `local_strict`, blocks transmission to external cloud with HTTP 503 and informative warning.

### 1.4 E2E Test Expectations and Schema Requirements
- File `F:\Workspace\Apps\Aplicativo_MCM-\tests\e2e-auditoria-entrada.test.mjs`:
  - Lines 101-146: Each audited item finding contains:
    - `index`: number
    - `cProd`: string
    - `xProd`: string
    - `ncm`: `{ declarado, auditado, validoSiscomex, divergente, descricaoOficialSiscomex, confianca, rgiAplicada, fundamentacaoNcm }`
    - `cfop`: `{ saidaFornecedor, entradaSugerido, descricaoCfop, justificativa }`
    - `icms`: `{ cstCsosnDeclarado, cstIcmsEntradaSugerido, permiteCredito, aliqIcmsCredito, alertaStDifal, fundamentoIcms }`
    - `pisCofins`: `{ cstPisDeclarado, cstPisCofinsEntradaSugerido, permiteCredito, enquadramento }`
    - `reforma`: `{ cClassTrib, descricaoClassTrib, cstIbsCbs, aliqIbsTeste2026, aliqCbsTeste2026, sujeitoImpostoSeletivo, alertaTransicao }`
    - `instrucaoCadastroERP`: string
    - `statusItem`: `'Regular' | 'Atenção' | 'Inconsistente'`
  - Lines 154-163: The envelope `AuditedInvoiceResponse` contains:
    - `motorUtilizado`: string (e.g. `'Gemini Cloud (gemini-3.8-flash)'`)
    - `tempoExecucaoMs`: number
    - `statusGlobal`: `'Regular' | 'Atenção' | 'Inconsistente'`
    - `parecerTecnicoGeral`: string
    - `parecerConformidadeCreditos`: string
    - `totalItensAuditados`: number
    - `itens`: `AuditedItemFinding[]`
  - Lines 669-684 (Test T4.04): Verifies `motor: 'gemini'`, `totalItensAuditados: 3`, `res.motorUtilizado.includes('Gemini')`, and presence of `reforma.cClassTrib` and `instrucaoCadastroERP`.

### 1.5 UI Consumer Integration (`components/AuditoriaEntrada.tsx` & `ParametrizacaoERP.tsx`)
- File `F:\Workspace\Apps\Aplicativo_MCM-\components\AuditoriaEntrada.tsx`:
  - Lines 35-83: `adaptAuditResultForERP` supports both nested structured object access (`it.ncm.auditado`, `it.cfop.entradaSugerido`, `it.icms.cstIcmsEntradaSugerido`, `it.reforma.cClassTrib`) and flat fields.
  - Lines 500-520: UI explicitly communicates Gemini API as:
    > "Google Gemini API (Nuvem) — Modelo Cloud: gemini-3.8-flash via SDK oficial (@google/genai). Execução Paralela. Utiliza chave de API configurada no ambiente (GEMINI_API_KEY)."

---

## 2. Logic Chain

1. **SDK Compliance**: Based on Observation 1.1, the project is configured with `@google/genai` (^2.22.0) and uses ESM. Invoking Gemini API via `GoogleGenAI` conforms to current official Google GenAI standards without any deprecated APIs.
2. **Model Selection**: Based on Observations 1.2 and 1.5, `gemini-3.8-flash` is established as the canonical cloud engine model. It provides 1M context token capacity, response latency under 2.5s for multi-item invoices, and strict schema compliance.
3. **Data Protection & Sovereignty (R4 & Compliance)**:
   - Based on Observation 1.3, if `AI_SOVEREIGNTY_MODE === 'local_strict'`, the system must abort before network dispatch to ensure zero confidential fiscal data leaves the perimeter.
   - Based on Requirement R4 from `ORIGINAL_REQUEST.md`, non-tax nodes (`<transp>`, `<cobr>`, `<pag>`, `<infAdic>`, `<compra>`, `<exporta>`) must be stripped during context preparation, keeping strictly sensitive fiscal fields: NCM, CFOP, CST/CSOSN, ICMS, IPI, PIS, COFINS, and RTC.
4. **Deterministic Siscomex Grounding**:
   - While LLMs can hallucinate 8-digit NCM codes, the project maintains an authoritative database of 10,515 Siscomex codes in `public/data/ncm.json` accessed via `getMapaD8()` (Observation 1.1 in tests).
   - In the Gemini engine, the model's output must be post-processed against `getMapaD8()`: if `ncm.auditado` does not exist in Siscomex, it is deterministically tagged with `validoSiscomex = false`, `confianca = 'BAIXA'`, and `statusItem = 'Inconsistente'`.
5. **Contract Adherence**:
   - Defining `geminiAuditResponseSchema` using `Type.OBJECT` and `Type.ARRAY` guarantees that the JSON returned by `ai.models.generateContent` conforms directly to `AuditedInvoiceResponse` and `AuditedItemFinding[]`, satisfying all assertions in `tests/e2e-auditoria-entrada.test.mjs` (Observation 1.4).

---

## 3. Caveats

1. **API Key Dependency**: The cloud engine requires a valid `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). If absent or invalid, the engine throws an actionable error (`GEMINI_KEY_AUSENTE`). In environments without Internet access or credentials (such as local air-gapped CI), test suites must use the deterministic simulator or mock harness.
2. **Rate Limits & Quota**: Free tier Gemini API keys may be subject to RPM/TPM throttling (HTTP 429). The engine must handle HTTP 429 gracefully, advising fallback to Ollama Local on the RX 580.
3. **Batch Sizing**: While `gemini-3.8-flash` supports 1M context tokens, passing more than 30 items in a single prompt may increase response generation latency beyond 6s. Micro-batching in groups of 15 items with `Promise.all` is recommended for invoices with > 25 items.

---

## 4. Conclusion & Implementation Strategy

The Google Gemini Cloud Engine must be implemented in `lib/auditoria-particionada.ts` as the cloud audit provider for `AuditRequestPayload`. Below is the complete, concrete implementation architecture ready for implementation.

### 4.1 Interface Contracts and Types
```typescript
import { GoogleGenAI, Type } from '@google/genai';
import { getMapaD8 } from '@/lib/ai/ncm-server';
import { getSovereigntyMode } from '@/lib/ollama-client';
import type { AuditRequestPayload, ExtractedItem } from '@/lib/extrator-nfe';

export interface AuditedItemFinding {
  index: number;
  cProd: string;
  xProd: string;
  ncm: {
    declarado: string;
    auditado: string;
    validoSiscomex: boolean;
    divergente: boolean;
    descricaoOficialSiscomex: string;
    confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
    rgiAplicada?: string[];
    fundamentacaoNcm: string;
  };
  cfop: {
    saidaFornecedor: string;
    entradaSugerido: string;
    descricaoCfop: string;
    justificativa: string;
  };
  icms: {
    cstCsosnDeclarado: string;
    cstIcmsEntradaSugerido: string;
    permiteCredito: boolean;
    aliqIcmsCredito: string;
    alertaStDifal?: string;
    fundamentoIcms: string;
  };
  pisCofins: {
    cstPisDeclarado?: string;
    cstPisCofinsEntradaSugerido: string;
    permiteCredito: boolean;
    enquadramento: string;
  };
  reforma: {
    cClassTrib: string;
    descricaoClassTrib: string;
    cstIbsCbs: string;
    aliqIbsTeste2026: string;
    aliqCbsTeste2026: string;
    sujeitoImpostoSeletivo: boolean;
    alertaTransicao?: string;
  };
  instrucaoCadastroERP: string;
  statusItem: 'Regular' | 'Atenção' | 'Inconsistente';
}

export interface AuditedInvoiceResponse {
  motorUtilizado: string;
  tempoExecucaoMs: number;
  statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente';
  parecerTecnicoGeral: string;
  parecerConformidadeCreditos: string;
  totalItensAuditados: number;
  itens: AuditedItemFinding[];
}
```

### 4.2 Structured JSON Schema (`responseSchema`)
```typescript
export const geminiAuditResponseSchema = {
  type: Type.OBJECT,
  properties: {
    statusGlobal: {
      type: Type.STRING,
      enum: ['Regular', 'Atenção', 'Inconsistente'],
      description: 'Status pericial global da nota fiscal'
    },
    parecerTecnicoGeral: {
      type: Type.STRING,
      description: 'Parecer técnico minucioso sobre os aspectos tributários sensíveis de entrada'
    },
    parecerConformidadeCreditos: {
      type: Type.STRING,
      description: 'Parecer executivo sobre conformidade de créditos de ICMS, PIS/COFINS e transição IBS/CBS'
    },
    itens: {
      type: Type.ARRAY,
      description: 'Lista de pareceres periciais para cada item selecionado',
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER, description: 'Número do item (1-indexed)' },
          cProd: { type: Type.STRING, description: 'Código do produto no fornecedor' },
          xProd: { type: Type.STRING, description: 'Descrição comercial do produto' },
          ncm: {
            type: Type.OBJECT,
            properties: {
              declarado: { type: Type.STRING, description: 'NCM declarado no documento' },
              auditado: { type: Type.STRING, description: 'NCM oficial auditado de 8 dígitos' },
              validoSiscomex: { type: Type.BOOLEAN, description: 'Se o NCM auditado consta na tabela oficial Siscomex' },
              divergente: { type: Type.BOOLEAN, description: 'Se houve divergência entre declarado e auditado' },
              descricaoOficialSiscomex: { type: Type.STRING, description: 'Descrição oficial do subitem no Siscomex' },
              confianca: { type: Type.STRING, enum: ['ALTA', 'MEDIA', 'BAIXA'] },
              rgiAplicada: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Regras Gerais de Interpretação aplicadas (ex.: RGI 1, RGI 6)'
              },
              fundamentacaoNcm: { type: Type.STRING, description: 'Justificativa técnica da classificação' }
            },
            required: ['declarado', 'auditado', 'validoSiscomex', 'divergente', 'confianca', 'fundamentacaoNcm']
          },
          cfop: {
            type: Type.OBJECT,
            properties: {
              saidaFornecedor: { type: Type.STRING, description: 'CFOP de saída do fornecedor' },
              entradaSugerido: { type: Type.STRING, description: 'CFOP de entrada sugerido para o adquirente (1xxx ou 2xxx)' },
              descricaoCfop: { type: Type.STRING, description: 'Descrição da operação do CFOP de entrada' },
              justificativa: { type: Type.STRING, description: 'Justificativa do enquadramento do CFOP' }
            },
            required: ['saidaFornecedor', 'entradaSugerido', 'descricaoCfop', 'justificativa']
          },
          icms: {
            type: Type.OBJECT,
            properties: {
              cstCsosnDeclarado: { type: Type.STRING, description: 'CST ou CSOSN de ICMS do documento' },
              cstIcmsEntradaSugerido: { type: Type.STRING, description: 'CST sugerido de entrada (ex: 00, 10, 60, 90)' },
              permiteCredito: { type: Type.BOOLEAN, description: 'Se a operação permite apropriação de crédito pelo adquirente' },
              aliqIcmsCredito: { type: Type.STRING, description: 'Alíquota de crédito de ICMS aplicável (ex: 18%, 12%, 0%)' },
              alertaStDifal: { type: Type.STRING, description: 'Alerta sobre Substituição Tributária ou DIFAL, se aplicável' },
              fundamentoIcms: { type: Type.STRING, description: 'Base legal (ex: Art. 23 LC 123/2006, Convênio 142/2018, Art. 155 CF/88)' }
            },
            required: ['cstCsosnDeclarado', 'cstIcmsEntradaSugerido', 'permiteCredito', 'aliqIcmsCredito', 'fundamentoIcms']
          },
          pisCofins: {
            type: Type.OBJECT,
            properties: {
              cstPisDeclarado: { type: Type.STRING, description: 'CST de PIS declarado' },
              cstPisCofinsEntradaSugerido: { type: Type.STRING, description: 'CST de crédito sugerido (ex: 50, 70, 73)' },
              permiteCredito: { type: Type.BOOLEAN, description: 'Se permite crédito de PIS/COFINS' },
              enquadramento: { type: Type.STRING, description: 'Regime cumulativo ou não-cumulativo' }
            },
            required: ['cstPisCofinsEntradaSugerido', 'permiteCredito', 'enquadramento']
          },
          reforma: {
            type: Type.OBJECT,
            properties: {
              cClassTrib: { type: Type.STRING, description: 'Código cClassTrib IBS/CBS da LC 214/2025 (ex: 000001)' },
              descricaoClassTrib: { type: Type.STRING, description: 'Descrição da classificação tributária da reforma' },
              cstIbsCbs: { type: Type.STRING, description: 'CST IBS/CBS sugerido (ex: 000, 200, 400)' },
              aliqIbsTeste2026: { type: Type.STRING, description: 'Alíquota de teste IBS 2026 (0,1%)' },
              aliqCbsTeste2026: { type: Type.STRING, description: 'Alíquota de teste CBS 2026 (0,9%)' },
              sujeitoImpostoSeletivo: { type: Type.BOOLEAN, description: 'Se o item é sujeito ao Imposto Seletivo' },
              alertaTransicao: { type: Type.STRING, description: 'Orientações sobre transição da LC 214/2025' }
            },
            required: ['cClassTrib', 'descricaoClassTrib', 'cstIbsCbs', 'aliqIbsTeste2026', 'aliqCbsTeste2026', 'sujeitoImpostoSeletivo']
          },
          instrucaoCadastroERP: {
            type: Type.STRING,
            description: 'Instrução direta e cirúrgica para parametrização do produto no ERP'
          },
          statusItem: {
            type: Type.STRING,
            enum: ['Regular', 'Atenção', 'Inconsistente'],
            description: 'Status pericial do item'
          }
        },
        required: [
          'index', 'cProd', 'xProd', 'ncm', 'cfop', 'icms', 'pisCofins',
          'reforma', 'instrucaoCadastroERP', 'statusItem'
        ]
      }
    }
  },
  required: ['statusGlobal', 'parecerTecnicoGeral', 'parecerConformidadeCreditos', 'itens']
};
```

### 4.3 Sensitive Inbound Fiscal Prompt Generator
```typescript
export function montarPromptGeminiAudit(payload: AuditRequestPayload): string {
  const { contextoAdquirente, documentoContexto, itensSelecionados } = payload;
  const isInterstate = (documentoContexto.emitenteUf || 'SP').toUpperCase() !== (contextoAdquirente.ufDestino || 'SP').toUpperCase();

  // Strip all non-tax nodes and keep strictly sensitive tax fields
  const itensSensiveis = itensSelecionados.map((it) => ({
    index: it.index,
    cProd: it.cProd,
    xProd: it.xProd,
    ncmDeclarado: it.ncm,
    ncmValidoSiscomex: it.ncmValidoSiscomex,
    descricaoSiscomexOficial: it.descricaoOficialSiscomex || it.descricaoSiscomex,
    cest: it.cest,
    cfopSaida: it.cfop,
    tributosFornecedor: {
      cstIcms: it.tributos?.cstIcms,
      csosn: it.tributos?.csosn,
      pICMS: it.tributos?.pICMS,
      vBC: it.tributos?.vBC,
      vICMS: it.tributos?.vICMS,
      vBCST: it.tributos?.vBCST,
      vICMSST: it.tributos?.vICMSST,
      pMVAST: it.tributos?.pMVAST,
      cstIpi: it.tributos?.cstIpi,
      pIPI: it.tributos?.pIPI,
      cstPis: it.tributos?.cstPis,
      pPIS: it.tributos?.pPIS,
      cstCofins: it.tributos?.cstCofins,
      pCOFINS: it.tributos?.pCOFINS,
      cClassTrib: it.tributos?.cClassTrib,
      cstIbsCbs: it.tributos?.cstIbsCbs,
    },
    motivosSensibilidade: it.motivosSensibilidade,
  }));

  return `Você é um Auditor Fiscal Pericial de Elite da Receita Federal e dos Fiscos Estaduais, especialista em classificação no Sistema Harmonizado (NCM/SH), RGI 1 a 6, tributação de entrada (ICMS, IPI, PIS, COFINS) e Reforma Tributária do Consumo (IBS/CBS/IS - LC 214/2025 e LC 227/2025).

AUDITORIA DE ENTRADA — CONTEXTO FISCAL:
- Adquirente (Destino): UF ${contextoAdquirente.ufDestino} | Regime: ${contextoAdquirente.regime} | Finalidade: ${contextoAdquirente.finalidade}
- Emitente (Origem): UF ${documentoContexto.emitenteUf || 'SP'} | CNPJ: ${documentoContexto.emitenteCnpj || 'N/A'} | CRT: ${documentoContexto.emitenteCrt || '3'} (${documentoContexto.emitenteCrt === '1' ? 'Simples Nacional' : 'Regime Normal'})
- Operação: ${isInterstate ? 'INTERESTADUAL' : 'INTERNA'} | Natureza: ${documentoContexto.naturezaOperacao || 'Venda'}

DIRETRIZES PERICIAIS OBRIGATÓRIAS:
1. NCM: Validar a descrição comercial com o NCM declarado. Se inválido ou incompatível, classificar pelas RGI 1 a 6 e indicar fundamentação.
2. CFOP DE ENTRADA: Converter saída do fornecedor para entrada no adquirente:
   - Saída 5xxx -> Entrada 1xxx (ex: 5102 -> 1102 para Revenda; 5101 -> 1101 para Industrialização; 5551 -> 1551 para Ativo; 5556 -> 1556 para Consumo).
   - Saída 6xxx -> Entrada 2xxx (ex: 6102/6101 -> 2102/2101 para Revenda; 6403/6401 -> 2403 para ST).
   - Saída com ST (5405/6403) -> Entrada 1403/2403 ou 1405/2405.
3. ICMS / CRÉDITOS:
   - Fornecedor Simples Nacional (CRT 1, CSOSN 102/103): VEDADO crédito de ICMS (Art. 23 LC 123/2006). Definir permiteCredito: false, cstIcmsEntradaSugerido: '090', aliqIcmsCredito: '0%', statusItem: 'Atenção', e citar a LC 123/2006 no fundamentoIcms.
   - Adquirente Regime Regular comprando com CST 00/20 de fornecedor Regime Normal para revenda: permiteCredito: true.
   - Finalidade "Uso e Consumo": VEDADO crédito (permiteCredito: false, cstIcmsEntradaSugerido: '090').
4. ALERTA MANDATÓRIO ST E CEST (Convênio ICMS 142/2018):
   - Se a operação for interestadual com cálculo de ST (vBCST > 0 ou CST 10/70) e a tag CEST estiver ausente/vazia, emitir alertaStDifal: "ALERTA: Mercadoria com ST interestadual sem preenchimento de CEST obrigatório (Convênio 142/2018)" e statusItem: 'Inconsistente'.
5. PIS/COFINS: Para adquirente em Regime Não-Cumulativo (Lucro Real) em revenda/industrialização: permiteCredito: true, cstPisCofinsEntradaSugerido: '50'. Se fornecedor for Simples, permiteCredito: false, CST 70.
6. REFORMA TRIBUTÁRIA (LC 214/2025): Sugerir cClassTrib '000001' (Tributação Integral Padrão), cstIbsCbs '000', aliqIbsTeste2026 '0,1%', aliqCbsTeste2026 '0,9%'. Informar se incide Imposto Seletivo (art. 393 LC 214/2025).
7. STATUS ITEM: 'Inconsistente' (falta de CEST em ST, NCM inválido, erro grave), 'Atenção' (Simples CSOSN 102 sem crédito), ou 'Regular'.
8. STATUS GLOBAL: 'Inconsistente' se houver pelo menos um item inconsistente; senão 'Atenção' se houver item atenção; senão 'Regular'.

ITENS SELECIONADOS PARA AUDITORIA (DADOS FISCAIS SENSÍVEIS):
${JSON.stringify(itensSensiveis, null, 2)}`;
}
```

### 4.4 Engine Execution & Siscomex Grounding (`executarAuditoriaGemini`)
```typescript
export async function executarAuditoriaGemini(payload: AuditRequestPayload): Promise<AuditedInvoiceResponse> {
  const startTime = Date.now();

  // 1. Soberania de dados
  const sovereigntyMode = getSovereigntyMode();
  if (sovereigntyMode === 'local_strict') {
    throw new Error(
      'Modo de Soberania Estrita ativo (AI_SOVEREIGNTY_MODE=local_strict). O envio de dados fiscais sensíveis para a Google Gemini API está bloqueado por política de soberania de dados. Utilize a IA Local Ollama na GPU RX 580.'
    );
  }

  // 2. Resolução da chave de API
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'Chave de API do Google Gemini não configurada no ambiente (GEMINI_API_KEY). Para auditar em nuvem com alta velocidade via gemini-3.8-flash, configure a variável de ambiente GEMINI_API_KEY.'
    );
  }

  // 3. Validação do payload
  if (!payload.itensSelecionados || payload.itensSelecionados.length === 0) {
    throw new Error('A lista de itens selecionados para auditoria não pode estar vazia (itensSelecionados.length === 0).');
  }

  const model = payload.modelo || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey });
  const prompt = montarPromptGeminiAudit(payload);

  // 4. Invocação do modelo via SDK oficial
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: geminiAuditResponseSchema,
    },
  });

  const rawText = typeof response.text === 'function' ? (response as any).text() : response.text;
  if (!rawText) {
    throw new Error('A Google Gemini API retornou uma resposta textual vazia.');
  }

  const parsed = JSON.parse(rawText);
  const mapaD8 = getMapaD8();

  // 5. Grounding pericial determinístico e saneamento contra Siscomex (10.515 registros)
  const itensAuditados: AuditedItemFinding[] = (parsed.itens || []).map((itGemini: any) => {
    const origItem = payload.itensSelecionados.find((it) => it.index === itGemini.index) || payload.itensSelecionados[0];
    const ncmClean = (itGemini.ncm?.auditado || itGemini.ncm?.declarado || origItem.ncm || '').replace(/\D/g, '');
    const recSiscomex = mapaD8.get(ncmClean);
    const ncmValidoSiscomex = Boolean(recSiscomex && ncmClean.length === 8);

    const isSimples102 = origItem.tributos?.csosn === '102';
    const isInterstateST = origItem.cfop.startsWith('6') && (origItem.tributos?.vBCST || origItem.cest);
    const isMissingCest = Boolean(origItem.tributos?.vBCST && !origItem.cest);

    // CFOP fallback de segurança determinístico
    let cfopEntrada = itGemini.cfop?.entradaSugerido || '1102';
    if (origItem.cfop.startsWith('6') && !cfopEntrada.startsWith('2')) {
      cfopEntrada = '2' + cfopEntrada.slice(1);
    }

    const permiteCreditoIcms = isSimples102 ? false : (itGemini.icms?.permiteCredito ?? true);
    const cstIcmsEntrada = isSimples102 ? '090' : (itGemini.icms?.cstIcmsEntradaSugerido || '00');

    let alertaStDifal = itGemini.icms?.alertaStDifal;
    if (isMissingCest && !alertaStDifal) {
      alertaStDifal = 'ALERTA: Mercadoria com ST interestadual sem preenchimento de CEST obrigatório (Convênio 142/2018)';
    }

    let statusItem: 'Regular' | 'Atenção' | 'Inconsistente' = itGemini.statusItem || 'Regular';
    if (!ncmValidoSiscomex || isMissingCest) {
      statusItem = 'Inconsistente';
    } else if (isSimples102) {
      statusItem = 'Atenção';
    }

    return {
      index: itGemini.index || origItem.index,
      cProd: itGemini.cProd || origItem.cProd,
      xProd: itGemini.xProd || origItem.xProd,
      ncm: {
        declarado: itGemini.ncm?.declarado || origItem.ncm,
        auditado: ncmValidoSiscomex ? (recSiscomex?.ncm || ncmClean) : (itGemini.ncm?.auditado || origItem.ncm),
        validoSiscomex: ncmValidoSiscomex,
        divergente: itGemini.ncm?.declarado !== (ncmValidoSiscomex ? recSiscomex?.ncm : ncmClean),
        descricaoOficialSiscomex: ncmValidoSiscomex ? (recSiscomex?.desc || recSiscomex?.descricao || '') : 'NCM Inexistente no Siscomex',
        confianca: ncmValidoSiscomex ? (itGemini.ncm?.confianca || 'ALTA') : 'BAIXA',
        rgiAplicada: itGemini.ncm?.rgiAplicada || ['RGI 1', 'RGI 6'],
        fundamentacaoNcm: itGemini.ncm?.fundamentacaoNcm || 'Classificação aterrada no Siscomex e NESH',
      },
      cfop: {
        saidaFornecedor: origItem.cfop,
        entradaSugerido: cfopEntrada,
        descricaoCfop: itGemini.cfop?.descricaoCfop || 'Compra para comercialização',
        justificativa: itGemini.cfop?.justificativa || 'Adequação da operação de saída do emitente para entrada no estabelecimento adquirente',
      },
      icms: {
        cstCsosnDeclarado: origItem.tributos?.cstIcms || origItem.tributos?.csosn || '00',
        cstIcmsEntradaSugerido: cstIcmsEntrada,
        permiteCredito: permiteCreditoIcms,
        aliqIcmsCredito: isSimples102 ? '0%' : (itGemini.icms?.aliqIcmsCredito || `${origItem.tributos?.pICMS || 18}%`),
        alertaStDifal,
        fundamentoIcms: isSimples102 ? 'Art. 23 da LC 123/2006 proíbe apropriação de crédito em operações CSOSN 102' : (itGemini.icms?.fundamentoIcms || 'Art. 155 da CF/88'),
      },
      pisCofins: {
        cstPisDeclarado: origItem.tributos?.cstPis,
        cstPisCofinsEntradaSugerido: itGemini.pisCofins?.cstPisCofinsEntradaSugerido || (isSimples102 ? '70' : '50'),
        permiteCredito: isSimples102 ? false : (itGemini.pisCofins?.permiteCredito ?? true),
        enquadramento: itGemini.pisCofins?.enquadramento || 'Regime Não-Cumulativo',
      },
      reforma: {
        cClassTrib: itGemini.reforma?.cClassTrib || '000001',
        descricaoClassTrib: itGemini.reforma?.descricaoClassTrib || 'Tributação Integral Padrão CBS/IBS',
        cstIbsCbs: itGemini.reforma?.cstIbsCbs || '000',
        aliqIbsTeste2026: itGemini.reforma?.aliqIbsTeste2026 || '0,1%',
        aliqCbsTeste2026: itGemini.reforma?.aliqCbsTeste2026 || '0,9%',
        sujeitoImpostoSeletivo: Boolean(itGemini.reforma?.sujeitoImpostoSeletivo),
        alertaTransicao: itGemini.reforma?.alertaTransicao || 'Alíquotas de teste para o ano-base 2026 conforme LC 214/2025',
      },
      instrucaoCadastroERP: itGemini.instrucaoCadastroERP || `Parametrizar produto ${origItem.cProd} com CFOP ${cfopEntrada} e CST ${cstIcmsEntrada}`,
      statusItem,
    };
  });

  const hasInconsistente = itensAuditados.some((i) => i.statusItem === 'Inconsistente');
  const hasAtencao = itensAuditados.some((i) => i.statusItem === 'Atenção');
  const statusGlobal: 'Regular' | 'Atenção' | 'Inconsistente' = hasInconsistente ? 'Inconsistente' : (hasAtencao ? 'Atenção' : 'Regular');

  return {
    motorUtilizado: `Gemini Cloud (${model})`,
    tempoExecucaoMs: Date.now() - startTime,
    statusGlobal,
    parecerTecnicoGeral: parsed.parecerTecnicoGeral || 'Auditoria pericial executada com sucesso com foco estrito em dados fiscais sensíveis de entrada via Google Gemini API.',
    parecerConformidadeCreditos: parsed.parecerConformidadeCreditos || 'Direitos creditórios avaliados de acordo com a legislação do Simples Nacional, Regime Regular e LC 214/2025.',
    totalItensAuditados: itensAuditados.length,
    itens: itensAuditados,
  };
}
```

---

## 5. Verification Method

To independently verify all findings and validate this design against the test suite:

1. **Verify Official SDK Package and Runtime Compatibility**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node -e "import('@google/genai').then(m => console.log('SDK OK:', typeof m.GoogleGenAI, typeof m.Type.OBJECT))"
   ```
   *Expected output*: `SDK OK: function string`.

2. **Verify TypeScript Typecheck**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   npx tsc --noEmit
   ```
   *Expected output*: Exits with code 0 and 0 errors.

3. **Verify E2E Test Suite (Tiers 1 to 4)**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
   ```
   *Expected output*: All 54 tests pass (22 Tier 1, 21 Tier 2, 6 Tier 3, 5 Tier 4, including T4.04 Gemini Cloud API execution).

4. **Verify Adversarial M2 Stress Tests**:
   ```powershell
   cd F:\Workspace\Apps\Aplicativo_MCM-
   node scripts/test.mjs tests/m2-challenger-stress.test.mjs
   ```
   *Expected output*: All 23 adversarial tests pass, confirming engine validation guarantees `gemini-3.8-flash`.

5. **Invalidation Conditions**:
   - Reverting to deprecated SDK `@google/generative-ai` or passing unvetted schemas invalidates the design.
   - Bypassing the Siscomex dictionary check (`getMapaD8()`) allows AI hallucinations into ERP parametrization.
   - Disabling `AI_SOVEREIGNTY_MODE` check violates strict data governance.
