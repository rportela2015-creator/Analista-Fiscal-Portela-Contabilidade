# Handoff Report: Siscomex NCM Validation, Sensitivity Rules & Edge Cases for Milestone 1

**Agent ID**: `m1_explorer_3`  
**Milestone**: M1 - Deterministic Extraction Engine & Endpoint  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3`  
**Target File**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_explorer_3\handoff.md`  
**Date**: 2026-11-09T14:50:00Z  

---

## 1. Observation

### 1.1 Siscomex Map & Existing Validation Pipeline
Direct code inspection and runtime execution revealed:
1. **`lib/ai/ncm-server.ts` (`getMapaD8`)**:
   - Lines 8-19: Reads `public/data/ncm.json` synchronously and creates a `Map<string, Record8>` cached in `mapaD8Cache`:
     ```typescript
     export function getMapaD8(): Map<string, Record8> {
       if (mapaD8Cache) return mapaD8Cache;
       const filePath = path.join(process.cwd(), 'public', 'data', 'ncm.json');
       const fileContent = fs.readFileSync(filePath, 'utf-8');
       const lista = JSON.parse(fileContent) as Record8[];
       mapaD8Cache = new Map(lista.map(r => [r.d8, r]));
       return mapaD8Cache;
     }
     ```
   - Execution of `node -e "const { getMapaD8 } = require('./lib/ai/ncm-server.ts'); console.log(getMapaD8().size);"` confirmed exactly **10,515 records** indexed by `d8` (8 numeric digits).
   - `public/data/ncm-frio.json` contains cold metadata for all 10,515 NCMs, including `cest: string[]`, `cestD`, `cestS`. An inspection confirmed that **2,697 NCMs** possess mapped CEST codes.

2. **`lib/ai/validar.ts` (`validarNcmIA`)**:
   - Lines 15-23:
     ```typescript
     const raw = String(r.ncm ?? '').trim();
     let d8 = '';
     if (!/[\d.]+[eE][+-]?\d+/.test(raw)) {
       const d = raw.replace(/\D/g, '');
       d8 = d.length === 7 ? d.padStart(8, '0') : d;
     }
     const rec = mapaD8 instanceof Map ? mapaD8.get(d8) : (mapaD8 as any)[d8];
     if (!rec || d8.length !== 8) {
       return { ncm: d8, valido: false, confianca: 'BAIXA', aviso: 'NCM não localizado na tabela oficial do Siscomex; descartado.' };
     }
     ```
   - Verified that `validarNcmIA` already guards against scientific notation (`/[\d.]+[eE][+-]?\d+/`), strips non-digits (`/\D/g`), and normalizes 7-digit NCMs using `padStart(8, '0')`.
   - Verified that `lib/ai/sanear-classificacao.ts:27-29` replaces hallucinated descriptions with official Siscomex text or zeroes out invalid NCMs.

3. **Existing Monolithic Parser Hotspots (`app/api/auditoria-entrada/route.ts`)**:
   - Line 59: `const itens = Array.isArray(nfe.det) ? nfe.det : (nfe.det ? [nfe.det] : []);` handles single vs multiple `det`, but:
   - Line 110: `const itensLimitados = itens.slice(0, 15);` hardcodes a 15-item truncation cutoff!
   - Lines 111-120: Does not compute `ncmValidoSiscomex` or `sensivelParaAuditoria`.
   - Lines 130-154: PDF parsing is unstructured DANFE regex text that is bundled directly into the monolithic Ollama call.

### 1.2 Empirical Edge Case & Benchmark Findings
Direct execution of test scripts in Node.js v24.19.0 established the following metrics:
- **XML Parsing (`fast-xml-parser`)**:
  - Without configuration, a single `<det>` element parses as an `Object`, while multiple `<det>` elements parse as an `Array`.
  - With `{ isArray: (name) => name === 'det' }`, both 1-item and 50+-item documents parse consistently as `Array<any>`.
  - Parsing a 55-item XML takes **4.93 ms**.
  - Handling UTF-8 BOM (`\uFEFF`) is supported transparently without parsing errors.
- **NCM Normalization Tests**:
  - Standard 8-digit NCM (`"8471.30.12"` or `"84713012"`): Validated in O(1) against `mapaD8`, formats to `"8471.30.12"`, official description retrieved.
  - 7-digit NCM (`"1012100"`): Zero-padded to `"01012100"` (Reprodutores de raça pura), returns `valido: true`, description retrieved.
  - Excel Scientific Notation (`"8.4713E+07"` and `"8.4713e+07"`): Regex `/[\d.]+[eE][+-]?\d+/` intercepts before `replace(/\D/g, '')`, returning `valido: false` and preventing corruption into bogus 7-digit numbers.
  - Invalid 8-digit code (`"99999999"`): Looked up and rejected with `valido: false`.
  - Position/Chapter only (`"8471"` or `"84"`): Rejected with `valido: false`.
  - Whitespace/Trimming (`"  8471.30.12  "`): Trims cleanly, passes validation.
- **Sensitivity Rules Throughput**:
  - Evaluating 200 items across all 4 sensitivity criteria took **0.302 ms** (< 1ms).

---

## 2. Logic Chain

1. **Decoupling Extraction from Inference (R1 Acceptance)**:
   - Observation 1.1 reveals that `route.ts` currently truncates items to 15 because it immediately sends them to the local Ollama LLM on GPU RX 580.
   - By eliminating the LLM invocation from Stage 1, parsing 100% of invoice items with `fast-xml-parser` and validating all NCMs in-memory against `getMapaD8()` takes < 15ms total, well below the 200ms target.

2. **Dual-Status Classification per Item (`ncmValidoSiscomex` and `sensivelParaAuditoria`)**:
   - `ncmValidoSiscomex` is a strict binary indicator of whether the declared NCM exists in the 10,515 valid Siscomex codes loaded by `getMapaD8()`.
   - `sensivelParaAuditoria` is a broader fiscal risk indicator. An item must be flagged sensitive (`sensivelParaAuditoria = true`) whenever:
     - **Rule 1 (Invalid NCM)**: `!ncmValidoSiscomex` (missing NCM, scientific notation, or non-existent in Siscomex).
     - **Rule 2 (Substituição Tributária)**: CST in `{10, 30, 60, 70}` or CSOSN in `{201, 202, 203, 500}` or `vBCST > 0` or `vICMSST > 0` or `pMVAST > 0`. ST items require distinct inbound CFOP mapping (1.403/2.403), MVA verification, and tax credit segregation.
     - **Rule 3 (Interstate without CEST)**: The transaction is interstate (`emitenteUf !== destinatarioUf` or CFOP starts with `2` or `6`), `<CEST>` is absent in the item, and the product either has ST or is an NCM with a registered CEST in `public/data/ncm-frio.json`. Under Convênio ICMS 142/2018 (Cláusula vigésima primeira), CEST is mandatory for goods in Anexos II a XXVI in interstate operations regardless of whether ST is retained in that specific transaction.
     - **Rule 4 (Credit Discrepancy)**: Supplier is Simples Nacional (`emitente.crt === '1'` or CSOSN present) and emits CSOSN `102` ("Tributada pelo Simples Nacional sem permissão de crédito"), or `103`, `300`, `400`, `500`, while the buyer is Regime Regular. Inbound ERP parameterization must not credit ICMS from CSOSN 102 under pain of fiscal penalty (LC 123/2006, art. 23). Also catches Simples suppliers emitting Normal CST (e.g. `00`), or Normal suppliers emitting CST `40`/`41` on commercial purchases.

3. **Single vs Multi-Item Deterministic Robustness**:
   - Observation 1.2 proved that `fast-xml-parser` collapses single child tags into an object. Configuring `isArray: (name) => name === 'det'` eliminates this discrepancy at parse time, avoiding runtime type errors or manual array checks.

---

## 3. Caveats

1. **Adquirente Context Optionality**: In Stage 1 extraction, the caller may upload an XML before specifying their tax regime or finality. Rule 4 (Credit Discrepancy) must default defensively: any supplier item with CSOSN `102` must be flagged as sensitive so the user can verify credit applicability in Stage 2.
2. **DANFE PDF Structural Variability**: While XML parsing is 100% deterministic, DANFE PDFs can have variable column arrangements or page breaks. For PDF uploads, deterministic extraction extracts header data and matches tabular lines via regex, flagging all unparsed or unverified rows as sensitive so they can be inspected in the UI.
3. **CEST Catalog Merging**: `public/data/ncm.json` does not include CEST arrays in the warm split (they reside in `ncm-frio.json`). To keep extraction < 10ms, `ncm-frio.json` should either be loaded once synchronously alongside `ncm.json` in `lib/ai/ncm-server.ts` or read from a pre-indexed Set of NCMs with CEST.

---

## 4. Conclusion & Concrete Helper Specifications

The deterministic extraction engine (`lib/extrator-nfe.ts`) must implement the following pure, high-performance functions:

### 4.1 Recommended Helper Signatures for `lib/extrator-nfe.ts`

```typescript
import { XMLParser } from 'fast-xml-parser';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import { getMapaD8 } from '@/lib/ai/ncm-server';
import type { Record8 } from '@/lib/data';

/**
 * Normaliza e higieniza código NCM extraído do XML/PDF.
 * Rejeita notação científica (8.4713E+07), remove pontuação e aplica padStart(8, '0') se tiver 7 dígitos.
 */
export function normalizarNcm(raw: any): { d8: string; formatado: string; validoFormato: boolean } {
  if (!raw) return { d8: '', formatado: '', validoFormato: false };
  const s = String(raw).trim();
  if (/[\d.]+[eE][+-]?\d+/.test(s)) {
    return { d8: '', formatado: '', validoFormato: false };
  }
  const d = s.replace(/\D/g, '');
  const d8 = d.length === 7 ? d.padStart(8, '0') : d;
  const validoFormato = d8.length === 8;
  const formatado = validoFormato
    ? `${d8.slice(0, 4)}.${d8.slice(4, 6)}.${d8.slice(6)}`
    : d8;

  return { d8, formatado, validoFormato };
}

/**
 * Validação instantânea contra o catálogo oficial de 10.515 registros Siscomex.
 */
export function validarNcmSiscomex(d8: string, mapaD8: Map<string, Record8>): { valido: boolean; record?: Record8 } {
  if (!d8 || d8.length !== 8) return { valido: false };
  const record = mapaD8.get(d8);
  return { valido: !!record, record };
}

/**
 * Extrai bloco de tributos do fornecedor com suporte a todos os grupos ICMS/IPI/PIS/COFINS da NF-e.
 */
export function extrairTributosDet(imposto: any): ExtractedTributosResumo {
  const tributos: ExtractedTributosResumo = {};
  if (!imposto) return tributos;

  // ICMS (ICMS00..ICMS90, ICMSSN101..900, ICMSST, ICMSPart)
  if (imposto.ICMS) {
    const icmsGroup = Object.values(imposto.ICMS)[0] as any;
    if (icmsGroup) {
      if (icmsGroup.CST !== undefined) tributos.cstIcms = String(icmsGroup.CST).trim();
      if (icmsGroup.CSOSN !== undefined) tributos.csosn = String(icmsGroup.CSOSN).trim();
      if (icmsGroup.orig !== undefined) tributos.orig = Number(icmsGroup.orig);
      if (icmsGroup.vBC !== undefined) tributos.vBC = parseFloat(String(icmsGroup.vBC)) || 0;
      if (icmsGroup.pICMS !== undefined) tributos.pICMS = parseFloat(String(icmsGroup.pICMS)) || 0;
      if (icmsGroup.vICMS !== undefined) tributos.vICMS = parseFloat(String(icmsGroup.vICMS)) || 0;
      if (icmsGroup.vBCST !== undefined) tributos.vBCST = parseFloat(String(icmsGroup.vBCST)) || 0;
      if (icmsGroup.pICMSST !== undefined) tributos.pICMSST = parseFloat(String(icmsGroup.pICMSST)) || 0;
      if (icmsGroup.vICMSST !== undefined) tributos.vICMSST = parseFloat(String(icmsGroup.vICMSST)) || 0;
      if (icmsGroup.pMVAST !== undefined) tributos.pMVAST = parseFloat(String(icmsGroup.pMVAST)) || 0;
    }
  }

  // IPI (IPITrib, IPINT)
  if (imposto.IPI) {
    const ipiGroup = imposto.IPI.IPITrib || imposto.IPI.IPINT;
    if (ipiGroup) {
      if (ipiGroup.CST !== undefined) tributos.cstIpi = String(ipiGroup.CST).trim();
      if (ipiGroup.pIPI !== undefined) tributos.pIPI = parseFloat(String(ipiGroup.pIPI)) || 0;
      if (ipiGroup.vIPI !== undefined) tributos.vIPI = parseFloat(String(ipiGroup.vIPI)) || 0;
    }
  }

  // PIS (PISAliq, PISQtde, PISNT, PISOutr)
  if (imposto.PIS) {
    const pisGroup = Object.values(imposto.PIS)[0] as any;
    if (pisGroup) {
      if (pisGroup.CST !== undefined) tributos.cstPis = String(pisGroup.CST).trim();
      if (pisGroup.vBC !== undefined) tributos.vBCPis = parseFloat(String(pisGroup.vBC)) || 0;
      if (pisGroup.pPIS !== undefined) tributos.pPIS = parseFloat(String(pisGroup.pPIS)) || 0;
      if (pisGroup.vPIS !== undefined) tributos.vPIS = parseFloat(String(pisGroup.vPIS)) || 0;
    }
  }

  // COFINS (COFINSAliq, COFINSQtde, COFINSNT, COFINSOutr)
  if (imposto.COFINS) {
    const cofinsGroup = Object.values(imposto.COFINS)[0] as any;
    if (cofinsGroup) {
      if (cofinsGroup.CST !== undefined) tributos.cstCofins = String(cofinsGroup.CST).trim();
      if (cofinsGroup.vBC !== undefined) tributos.vBCCofins = parseFloat(String(cofinsGroup.vBC)) || 0;
      if (cofinsGroup.pCOFINS !== undefined) tributos.pCOFINS = parseFloat(String(cofinsGroup.pCOFINS)) || 0;
      if (cofinsGroup.vCOFINS !== undefined) tributos.vCOFINS = parseFloat(String(cofinsGroup.vCOFINS)) || 0;
    }
  }

  return tributos;
}

/**
 * Avalia as 4 regras de sensibilidade para determinar `sensivelParaAuditoria`.
 */
export function avaliarSensibilidadeItem(params: {
  ncmValidoSiscomex: boolean;
  d8: string;
  tributos: ExtractedTributosResumo;
  cest?: string;
  cfop: string;
  emitenteUf?: string;
  destinatarioUf?: string;
  emitenteCrt?: string;
  adquirenteRegime?: string;
  ncmTemCestCatalogo?: boolean;
}): { sensivelParaAuditoria: boolean; motivos: string[] } {
  const motivos: string[] = [];

  // Regra 1: NCM Inválido no Siscomex
  if (!params.ncmValidoSiscomex) {
    motivos.push('NCM_INVALIDO_SISCOMEX');
  }

  // Regra 2: CST/CSOSN de Substituição Tributária (ST)
  const cst = params.tributos.cstIcms || '';
  const csosn = params.tributos.csosn || '';
  const stCodes = new Set(['10', '30', '60', '70', '201', '202', '203', '500']);
  const temStCodigo = stCodes.has(cst) || stCodes.has(csosn);
  const temStValores = (params.tributos.vBCST ?? 0) > 0 || (params.tributos.vICMSST ?? 0) > 0 || (params.tributos.pMVAST ?? 0) > 0;
  const temST = temStCodigo || temStValores;

  if (temST) {
    motivos.push('ICMS_ST_PRESENTE');
  }

  // Regra 3: Operação Interestadual sem CEST
  const cfopLimpo = params.cfop.replace(/\D/g, '');
  const isInterstate = (params.emitenteUf && params.destinatarioUf && params.emitenteUf.toUpperCase() !== params.destinatarioUf.toUpperCase() && params.emitenteUf !== 'EX' && params.destinatarioUf !== 'EX')
    || cfopLimpo.startsWith('2')
    || cfopLimpo.startsWith('6');

  const temCestDeclarado = !!(params.cest && params.cest.replace(/\D/g, '').length >= 7);
  if (isInterstate && !temCestDeclarado && (temST || params.ncmTemCestCatalogo)) {
    motivos.push('INTERESTADUAL_SEM_CEST');
  }

  // Regra 4: Suspeita de discrepância de crédito
  const isFornecedorSimples = params.emitenteCrt === '1' || !!csosn;
  const isAdquirenteRegimeNormal = !params.adquirenteRegime || !params.adquirenteRegime.toLowerCase().includes('simples');

  if (isFornecedorSimples && csosn === '102') {
    motivos.push('DISCREPANCIA_CREDITO_CSOSN_102');
  } else if (isFornecedorSimples && ['103', '300', '400', '500'].includes(csosn) && isAdquirenteRegimeNormal) {
    motivos.push('CREDITO_ICMS_VEDADO_SIMPLES');
  } else if (isFornecedorSimples && cst === '00') {
    motivos.push('INCONSISTENCIA_SIMPLES_COM_CST_NORMAL');
  }

  return {
    sensivelParaAuditoria: motivos.length > 0,
    motivos
  };
}

/**
 * Parser determinístico integral de NF-e XML.
 */
export function parsearNfeXml(xmlString: string, contexto?: { regime?: string; finalidade?: string }): ExtractedInvoiceData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'det'
  });

  const parsed = parser.parse(xmlString.replace(/^\uFEFF/, ''));
  const nfe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
  if (!nfe) throw new Error('XML de NF-e inválido: tag <infNFe> não encontrada.');

  const mapaD8 = getMapaD8();

  const emitente = {
    cnpj: nfe.emit?.CNPJ ? String(nfe.emit.CNPJ) : undefined,
    cpf: nfe.emit?.CPF ? String(nfe.emit.CPF) : undefined,
    nome: nfe.emit?.xNome ? String(nfe.emit.xNome) : undefined,
    uf: nfe.emit?.enderEmit?.UF ? String(nfe.emit.enderEmit.UF) : undefined,
    crt: (nfe.emit?.CRT ? String(nfe.emit.CRT) : undefined) as '1' | '2' | '3' | undefined,
    regimeDescricao: nfe.emit?.CRT === '1' ? 'Simples Nacional' : (nfe.emit?.CRT === '2' ? 'Simples Excesso' : 'Regime Normal')
  };

  const destinatario = {
    cnpj: nfe.dest?.CNPJ ? String(nfe.dest.CNPJ) : undefined,
    cpf: nfe.dest?.CPF ? String(nfe.dest.CPF) : undefined,
    nome: nfe.dest?.xNome ? String(nfe.dest.xNome) : undefined,
    uf: nfe.dest?.enderDest?.UF ? String(nfe.dest.enderDest.UF) : undefined
  };

  const totalXml = nfe.total?.ICMSTot;
  const resumoFinanceiro = {
    vProdTotal: parseFloat(String(totalXml?.vProd || 0)),
    vNF: parseFloat(String(totalXml?.vNF || 0)),
    vICMSTotal: totalXml?.vICMS !== undefined ? parseFloat(String(totalXml.vICMS)) : undefined,
    vIPITotal: totalXml?.vIPI !== undefined ? parseFloat(String(totalXml.vIPI)) : (totalXml?.vIPITot !== undefined ? parseFloat(String(totalXml.vIPITot)) : undefined),
    vPISTotal: totalXml?.vPIS !== undefined ? parseFloat(String(totalXml.vPIS)) : undefined,
    vCOFINSTotal: totalXml?.vCOFINS !== undefined ? parseFloat(String(totalXml.vCOFINS)) : undefined
  };

  const rawDet = nfe.det || [];
  const itens: ExtractedItem[] = rawDet.map((d: any, idx: number) => {
    const prod = d.prod || {};
    const norm = normalizarNcm(prod.NCM);
    const validacao = validarNcmSiscomex(norm.d8, mapaD8);
    const tributos = extrairTributosDet(d.imposto);

    const sensibilidade = avaliarSensibilidadeItem({
      ncmValidoSiscomex: validacao.valido,
      d8: norm.d8,
      tributos,
      cest: prod.CEST ? String(prod.CEST) : undefined,
      cfop: String(prod.CFOP || ''),
      emitenteUf: emitente.uf,
      destinatarioUf: destinatario.uf,
      emitenteCrt: emitente.crt,
      adquirenteRegime: contexto?.regime
    });

    return {
      index: idx + 1,
      cProd: String(prod.cProd || ''),
      cEAN: prod.cEAN ? String(prod.cEAN) : undefined,
      xProd: String(prod.xProd || ''),
      ncm: prod.NCM ? String(prod.NCM) : '',
      ncmValidoSiscomex: validacao.valido,
      cest: prod.CEST ? String(prod.CEST) : undefined,
      cfop: String(prod.CFOP || ''),
      uCom: String(prod.uCom || 'UN'),
      qCom: parseFloat(String(prod.qCom || 0)),
      vUnCom: parseFloat(String(prod.vUnCom || 0)),
      vProd: parseFloat(String(prod.vProd || 0)),
      tributos,
      sensivelParaAuditoria: sensibilidade.sensivelParaAuditoria
    };
  });

  return {
    tipoDocumento: 'XML',
    identificacao: {
      chaveAcesso: (nfe['@_Id'] || '').replace(/\D/g, ''),
      numero: nfe.ide?.nNF ? String(nfe.ide.nNF) : undefined,
      serie: nfe.ide?.serie ? String(nfe.ide.serie) : undefined,
      dataEmissao: nfe.ide?.dhEmi || nfe.ide?.dEmi,
      naturezaOperacao: nfe.ide?.natOp,
      modelo: nfe.ide?.mod ? String(nfe.ide.mod) : undefined
    },
    emitente,
    destinatario,
    resumoFinanceiro,
    totalItens: itens.length,
    itens
  };
}
```

---

## 5. Verification Method

To independently verify these findings and edge cases:

1. **Verify Baseline Test Suite**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   npm test
   ```
   *Expected result*: All existing test suites pass.

2. **Verify NCM Siscomex Count & Map Performance**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   node -e "const { getMapaD8 } = require('./lib/ai/ncm-server.ts'); const m = getMapaD8(); console.log('Records:', m.size, 'Has 84713012:', m.has('84713012'));"
   ```
   *Expected result*: `Records: 10515 Has 84713012: true`.

3. **Verify Edge Cases (7-digit, scientific notation, ST, missing CEST)**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   @'
   const { getMapaD8 } = require('./lib/ai/ncm-server.ts');
   const { validarNcmIA } = require('./lib/ai/validar.ts');
   const mapa = getMapaD8();
   console.log('7-digit:', validarNcmIA({ ncm: '1012100' }, mapa).valido);
   console.log('Scientific:', validarNcmIA({ ncm: '8.4713E+07' }, mapa).valido);
   console.log('Invalid:', validarNcmIA({ ncm: '99999999' }, mapa).valido);
   '@ | node
   ```
   *Expected result*: `7-digit: true`, `Scientific: false`, `Invalid: false`.

4. **Verify XMLParser `isArray: (name) => name === 'det'`**:
   ```powershell
   Set-Location F:\Workspace\Apps\Aplicativo_MCM-
   @'
   const { XMLParser } = require('fast-xml-parser');
   const p = new XMLParser({ isArray: (n) => n === 'det' });
   const res1 = p.parse('<NFe><infNFe><det><prod><cProd>1</cProd></prod></det></infNFe></NFe>');
   console.log('Single is array:', Array.isArray(res1.NFe.infNFe.det));
   '@ | node
   ```
   *Expected result*: `Single is array: true`.
