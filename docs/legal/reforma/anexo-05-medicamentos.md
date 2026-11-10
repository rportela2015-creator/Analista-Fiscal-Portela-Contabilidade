---
id: "reforma-anexo-05-08-medicamentos"
titulo: "Medicamentos — Redução de 60% e Alíquota Zero de CBS e IBS (LC nº 214/2025)"
tipo: "REFORMA"
norma: "Lei Complementar nº 214/2025 / Arts. 138, 142, Anexos V e VIII"
capitulos: ["30"]
posicoes: ["3003", "3004"]
ncms_relevantes: ["3004.10.11", "3004.10.12", "3004.20.11", "3004.90.99"]
vigencia_inicio: "2027-01-01"
tags: ["medicamentos", "farmaceuticos", "anexo v", "anexo viii", "reducao 60%", "aliquota zero", "antibioticos", "oncologicos"]
---

# Reforma Tributária: Medicamentos e Fármacos (Anexos V e VIII)

## Sistemática Tributária da Indústria Farmacêutica
O regime da reforma tributária unifica a complexa tributação monofásica de PIS/COFINS e as listas positiva/negativa/neutra em dois grupos bem delimitados sob a égide da LC nº 214/2025:
- **Anexo V (Redução de 60%)**: Medicamentos e fórmulas farmacêuticas em geral registrados na ANVISA, abrangendo antibióticos, anti-inflamatórios, analgésicos e medicamentos de uso contínuo (Art. 138);
- **Anexo VIII (Alíquota Zero)**: Medicamentos para tratamento de doenças graves, imunobiológicos, vacinas, hemoderivados, antirretrovirais e fármacos oncológicos (Art. 142).

## NCMs Abrangidos na Posição 3004
- `3004.10.11` a `3004.10.20`: Medicamentos contendo penicilinas ou seus derivados;
- `3004.20.11` a `3004.20.99`: Medicamentos contendo outros antibióticos;
- `3004.90.99`: Outros medicamentos formulados para fins terapêuticos ou profiláticos.

## Parametrização no ERP
- **CST IBS/CBS**: `200` (Redução de 60%) ou `400` (Alíquota Zero);
- **cClassTrib**:
  - `200030` ("Medicamentos com alíquota reduzida de 60% — Anexo V da LC 214/2025");
  - `400020` ("Medicamentos essenciais e oncológicos com alíquota zero — Anexo VIII da LC 214/2025");
- **Vedação de Imposto Seletivo**: Não incide sobre medicamentos.
