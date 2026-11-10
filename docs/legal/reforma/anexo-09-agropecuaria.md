---
id: "reforma-anexo-09-10-agropecuaria"
titulo: "Produtos Agropecuários, Aquícolas, Pesqueiros e Extrativos — Redução de 60% e Alíquota Zero (LC nº 214/2025)"
tipo: "REFORMA"
norma: "Lei Complementar nº 214/2025 / Arts. 144, 148, Anexos IX e X"
capitulos: ["01", "03", "07", "08", "12"]
posicoes: ["0101", "0301", "0701", "0801", "1201"]
ncms_relevantes: ["0101.21.00", "0301.91.10", "0701.10.00", "0701.90.00"]
vigencia_inicio: "2027-01-01"
tags: ["agropecuaria", "agronegocio", "aquicultura", "pesca", "extrativismo", "hortifrutigranjeiros", "anexo ix", "anexo x", "reducao 60%", "aliquota zero"]
---

# Reforma Tributária: Produtos do Agronegócio e Extrativos (Anexos IX e X)

## Regime Diferenciado do Agronegócio
A Lei Complementar nº 214/2025 consolida e preserva a competitividade da cadeia agropecuária e pesqueira nacional:
- **Anexo IX (Redução de 60% das Alíquotas)**: Produtos agropecuários, aquícolas, pesqueiros, florestais e extrativos vegetais in natura destinados à industrialização ou consumo que não componham a cesta básica nacional essencial (Art. 144);
- **Anexo X (Alíquota Zero / Desoneração)**: Insumos agropecuários fundamentais, sementes e mudas certificadas, reprodutores e matrizes de raça pura, fertilizantes e defensivos ecológicos (Art. 148).

## Principais Posições e Códigos NCM
1. **Reprodutores e Matrizes**: Capítulo 01 (ex.: `0101.21.00` Reprodutores de cavalos de raça pura);
2. **Alevinos e Matrizes para Piscicultura**: Capítulo 03 (`0301.91.10` para reprodução);
3. **Hortícolas e Legumes In Natura**: Capítulo 07 (ex.: `0701.10.00` Batata para semente, `0701.90.00` Outras batatas);
4. **Frutas Frescas**: Capítulo 08;
5. **Grãos e Oleaginosas**: Posição `1201` (Soja para semeadura e grão).

## Parametrização no ERP
- **CST IBS/CBS**: `200` (Redução de 60%) ou `400` (Alíquota Zero);
- **cClassTrib**:
  - `200040` ("Produtos agropecuários in natura com redução de 60% — Anexo IX");
  - `400030` ("Insumos agropecuários e sementes com alíquota zero — Anexo X");
- **Crédito Presumido do Produtor Rural Pessoa Física**: Quando o adquirente de regime regular compra de produtor rural não contribuinte, apropria crédito presumido nos termos do Art. 52 da LC 214/2025.
