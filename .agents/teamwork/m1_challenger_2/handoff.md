# Challenger Report: Milestone 1 PDF Parsing Resilience & Dual-Routing Stress Testing

**Agent**: `m1_challenger_2`  
**Working Directory**: `F:\Workspace\Apps\Aplicativo_MCM-\.agents\teamwork\m1_challenger_2`  
**Target**: Milestone 1 (Deterministic Extraction & Dual Routing)  
**Verdict**: **`REQUEST_CHANGES`**  
**Date**: 2026-11-09T15:22:00Z  

---

## 1. Observation

### 1.1 Baseline Build and Test Suite Results
1. **`npm run typecheck`**:
   - Command: `npm run typecheck` (`tsc --noEmit`)
   - Result: Exit code 0, clean output with zero diagnostic errors.
2. **`npm test`**:
   - Command: `node scripts/test.mjs`
   - Result: Exit code 0, all 18 standard project test suites passed (`SUÍTES COMPLETAS ✓`).
3. **`node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`**:
   - Command: `node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs`
   - Result: Exit code 0, 54/54 E2E tests passed across Tiers 1 to 4.

### 1.2 Adversarial PDF Parsing & Edge Case Tests (`tests/m1-challenger-stress.test.mjs`)
Direct execution command:
```powershell
node scripts/test.mjs tests/m1-challenger-stress.test.mjs
```
All 14 tests were executed against real PDF 1.4 binary payloads and non-standard XMLs.

- **Obs 1 (`pdf-parse: ^2.4.5` class adapter compatibility)**:
  `package.json` specifies `"pdf-parse": "^2.4.5"`. In `pdf-parse: 2.4.5`, `import('pdf-parse')` exports `PDFParse: [Function: PDFParse]` and `default: undefined`. Direct invocation as a function (`pdfParse(buffer)`) throws `TypeError`. The class adapter pattern in `lib/extrator-nfe.ts:592-594` (`new PDFParse({ data: pdfBuffer })`) was directly instantiated and verified to extract text streams without throwing `TypeError`.
- **Obs 2 (Fatal TypeError on Chave de Acesso fallback regex)**:
  In `lib/extrator-nfe.ts`, lines 648–651:
  ```typescript
  648: const chaveMatch = text.match(/(?:CHAVE DE ACESSO|Chave de Acesso)[\s:]*([0-9\s]{44,60})/i) ||
  649:                    text.match(/\b(?:\d{4}\s+){10}\d{4}\b/) ||
  650:                    text.match(/\b\d{44}\b/);
  651: const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : undefined;
  ```
  When a PDF document presents an access key without the exact uppercase phrase `"CHAVE DE ACESSO"`, line 649 or line 650 matches. However, neither line 649 nor line 650 contains a capturing group `()`. Therefore, `chaveMatch[1]` evaluates to `undefined`. Line 651 executes `chaveMatch[1].replace(...)`, resulting in an unhandled exception:
  ```
  TypeError: Cannot read properties of undefined (reading 'replace')
      at extrairDadosPdfDanfe (lib/extrator-nfe.ts:651)
  ```
  Reproduced and verified in test `[CHALLENGER-PDF-BUG-3]`.
- **Obs 3 (Critical value corruption: Brazilian currency thousands separator dot)**:
  In `lib/extrator-nfe.ts`, lines 168–174:
  ```typescript
  168: function parseNumber(val: any): number {
  169:   if (val === undefined || val === null || val === '') return 0;
  170:   if (typeof val === 'number') return isNaN(val) ? 0 : val;
  171:   const s = String(val).replace(',', '.').trim();
  172:   const n = parseFloat(s);
  173:   return isNaN(n) ? 0 : n;
  174: }
  ```
  And similarly in `parseOptionalNumber` (lines 176–182).
  In standard Brazilian DANFEs (printed via SAP, TOTVS, Linx, etc.), currency totals and unit values are formatted with period as thousands separator and comma as decimal separator: e.g. `"9.000,00"`, `"1.500,00"`, `"25.000,00"`.
  `String(val).replace(',', '.')` converts `"9.000,00"` into `"9.000.00"`. `parseFloat("9.000.00")` parses only up to the second period, evaluating to `9`!
  - `parseNumber("9.000,00")` yields `9` instead of `9000` (99.9% value loss).
  - `parseNumber("1.500,00")` yields `1.5` instead of `1500`.
  - `parseNumber("10.500,50")` yields `10.5` instead of `10500.5`.
  Reproduced and verified in test `[CHALLENGER-PDF-BUG-1]`.
- **Obs 4 (Date of emission regex omission)**:
  In `lib/extrator-nfe.ts`, line 656:
  ```typescript
  const dataMatch = text.match(/DATA\s+(?:DA\s+)?EMISS[AÃ]O[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
  ```
  The regex accommodates `"DATA DA EMISSÃO"` and `"DATA EMISSÃO"`, but omits the preposition `"DE"`. Standard Brazilian DANFE documents (Manual do DANFE, item 7.3.3) use the label `"DATA DE EMISSÃO"`. When a DANFE contains `"DATA DE EMISSÃO 01/03/2026"`, `dataMatch` returns `null`, leaving `identificacao.dataEmissao: undefined`.
  Reproduced and verified in test `[CHALLENGER-PDF-BUG-2]`.

### 1.3 Non-Standard XML Resilience
- **Obs 5 (UTF-8 BOM `\uFEFF`)**:
  Both string input with `\uFEFF` and Buffer input with initial bytes `[0xEF, 0xBB, 0xBF]` were parsed successfully without throwing `XML_MALFORMADO` syntax errors.
- **Obs 6 (Missing `<total>` and `<dest>`)**:
  When `<total>` is completely missing from XML, `resumoFinanceiro.vProdTotal` and `vNF` default to `0`, and all tax totals evaluate to `undefined` without throwing. Missing `<dest>` is similarly handled with `destinatario.cnpj: undefined`.
- **Obs 7 (Zero-value items and absent `<imposto>`)**:
  Invoices containing items with `qCom=0`, `vUnCom=0`, and `vProd=0` (bonificação / amostra grátis) evaluate cleanly without `NaN` or division by zero. Absent `<imposto>` yields `tributos: {}`.

### 1.4 Dual-Routing HTTP Integration (`tests/m1-dual-routing-http.mjs`)
Executed directly against the running Next.js application on `http://localhost:3000`:
- **Route B (`POST /api/auditoria-entrada/extrair`)**: HTTP 200 OK, returns `ExtractedInvoiceData` conforming to `PROJECT.md`.
- **Route A (`POST /api/auditoria-entrada?action=extrair`)**: HTTP 200 OK, returns `ExtractedInvoiceData`.
- **Route A (`POST /api/auditoria-entrada` with FormData `action=extrair`)**: HTTP 200 OK, returns `ExtractedInvoiceData`.
- **Parity**: Both routes return identical data payload (`tipoDocumento`, `totalItens`, `itens`, Siscomex validation, and financial totals).
- **Error Validation Parity**: Both routes enforce identical error codes for missing files (400 `ARQUIVO_AUSENTE`), empty files (400 `ARQUIVO_VAZIO`), and invalid extensions (400 `FORMATO_INVALIDO`).

---

## 2. Logic Chain

1. **Premise 1**: A core objective of Milestone 1 is robust deterministic extraction of NF-e from both XML and digital DANFE PDF, ensuring accurate fiscal figures for subsequent audit.
2. **From Obs 1 & Obs 3**: In digital DANFE PDFs, financial figures invariably use Brazilian currency conventions (`R$ 9.000,00`). Because `parseNumber` and `parseOptionalNumber` in `lib/extrator-nfe.ts:171` execute `replace(',', '.')` without removing thousands separator dots (`.`), `"9.000,00"` becomes `"9.000.00"`. `parseFloat` truncates this to `9`. Consequently, financial totals and item values in PDF DANFEs are corrupted by orders of magnitude.
3. **From Obs 2**: Digital DANFEs in production vary in formatting. Fallback regexes (`/\b(?:\d{4}\s+){10}\d{4}\b/` and `/\b\d{44}\b/`) are specifically intended to capture the 44-digit key when the standard label is absent. Because neither regex contains a capture group, `chaveMatch[1]` is `undefined`. Calling `.replace()` on `undefined` causes an uncaught `TypeError`, crashing the extraction request instead of returning extracted data.
4. **From Obs 4**: Omitting `"DE"` from the emission date regex results in silent omission of `dataEmissao` on standard DANFEs.
5. **Conclusion**: While XML extraction, UTF-8 BOM sanitization, and dual routing are fully operational and verified, the two critical flaws in PDF parsing (value truncation and fatal crash on access key fallback) violate the acceptance criteria of Milestone 1. Therefore, changes must be requested before proceeding to Milestone 2.

---

## 3. Caveats

- **Scope boundary**: This review tested Milestone 1 (deterministic extraction and dual routing). Stage 2 AI auditing (Ollama / Gemini) and UI components were not evaluated, as they belong to Milestones 2 and 3.
- **Server packaging of native modules**: Next.js App Router bundling for `pdf-parse` v2 requires monitoring if deployed in strict serverless/standalone environments where `@napi-rs/canvas` or worker scripts are bundled into Webpack/Turbopack chunks.
- No other caveats.

---

## 4. Conclusion & Actionable Recommendations

### Explicit Verdict
**`REQUEST_CHANGES`**

### Required Modifications for Developer:
1. **Fix Currency Parsing in `lib/extrator-nfe.ts` (`parseNumber` and `parseOptionalNumber`)**:
   Adjust `parseNumber` and `parseOptionalNumber` to properly handle Brazilian thousands dots when a comma is present:
   ```typescript
   function parseNumber(val: any): number {
     if (val === undefined || val === null || val === '') return 0;
     if (typeof val === 'number') return isNaN(val) ? 0 : val;
     let s = String(val).trim();
     if (s.includes(',')) {
       s = s.replace(/\./g, '').replace(',', '.');
     }
     const n = parseFloat(s);
     return isNaN(n) ? 0 : n;
   }
   ```
2. **Fix Chave de Acesso Fallback Regex in `lib/extrator-nfe.ts:651`**:
   Safely fallback to `chaveMatch[0]` when `chaveMatch[1]` is undefined:
   ```typescript
   const chaveAcesso = chaveMatch ? (chaveMatch[1] || chaveMatch[0]).replace(/\s+/g, '') : undefined;
   ```
3. **Fix Data de Emissão Regex in `lib/extrator-nfe.ts:656`**:
   Include `"DE"` in the preposition group:
   ```typescript
   const dataMatch = text.match(/DATA\s+(?:DA|DE\s+)?EMISS[AÃ]O[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
   ```

---

## 5. Verification Method

To independently reproduce and verify all findings:

1. **Run full project test suite and typecheck**:
   ```powershell
   npm run typecheck
   npm test
   node scripts/test.mjs tests/e2e-auditoria-entrada.test.mjs
   ```
2. **Run empirical adversarial stress harness**:
   ```powershell
   node scripts/test.mjs tests/m1-challenger-stress.test.mjs
   ```
   *Expected*: Validates all 14 tests, including isolation of the thousands separator truncation (`[CHALLENGER-PDF-BUG-1]`), the emission date omission (`[CHALLENGER-PDF-BUG-2]`), and the fatal `TypeError` on fallback regex (`[CHALLENGER-PDF-BUG-3]`).
3. **Run HTTP dual-routing verification suite**:
   ```powershell
   node tests/m1-dual-routing-http.mjs
   ```
   *Expected*: Validates parity and status codes between `/api/auditoria-entrada/extrair` and `/api/auditoria-entrada?action=extrair`.
