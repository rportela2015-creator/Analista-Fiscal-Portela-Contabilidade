---
id: "reforma-anexo-04-07-dispositivos-medicos"
titulo: "Dispositivos Médicos e de Acessibilidade — Redução de 60% e Alíquota Zero de CBS e IBS (LC nº 214/2025)"
tipo: "REFORMA"
norma: "Lei Complementar nº 214/2025 / Arts. 136, 140, Anexos IV e VII"
capitulos: ["87", "90"]
posicoes: ["8713", "9018", "9021"]
ncms_relevantes: ["8713.10.00", "8713.90.00", "9018.11.00", "9018.12.10", "9018.13.00"]
vigencia_inicio: "2027-01-01"
tags: ["dispositivos medicos", "acessibilidade", "cadeira de rodas", "eletrocardiografo", "reducao 60%", "aliquota zero", "anexo iv", "anexo vii"]
---

# Reforma Tributária: Dispositivos Médicos e Acessibilidade (Anexos IV e VII)

## Regime Diferenciado e Tratamento Tributário
A Lei Complementar nº 214/2025 estabelece tratamento tributário favorecido para o setor de saúde humana e acessibilidade para pessoas com deficiência:
- **Anexo IV (Redução de 60% das Alíquotas)**: Dispositivos médicos de uso hospitalar, ambulatorial e clínico geral têm redução de 60% nas alíquotas de CBS e IBS (Art. 136);
- **Anexo VII (Alíquota Zero / Desoneração Total)**: Dispositivos médicos essenciais, próteses, órteses e aparelhos para pessoas com deficiência física, auditiva ou visual gozam de **alíquota zero** (Art. 140).

## Principais Posições e NCMs Abrangidos
1. **Cadeiras de Rodas e Veículos para Inválidos**: Posição `8713` (`8713.10.00` sem motor, `8713.90.00` com motor ou outro mecanismo de propulsão);
2. **Aparelhos de Eletrodiagnóstico**: Posição `9018` (`9018.11.00` Eletrocardiógrafos, `9018.12.10` Aparelhos de ecografia, `9018.13.00` Aparelhos de ressonância magnética nuclear);
3. **Artigos e Aparelhos Ortopédicos e Próteses**: Posição `9021` (Próteses articulares, aparelhos para fraturas, aparelhos auditivos).

## Parametrização no ERP
- **CST IBS/CBS**: `200` (Alíquota Reduzida) para itens do Anexo IV; `400` (Alíquota Zero / Isenção) para itens do Anexo VII;
- **cClassTrib**:
  - `200021` ("Fornecimento de dispositivos médicos com redução de 60% — Anexo IV");
  - `400015` ("Fornecimento de dispositivos de acessibilidade e próteses com alíquota zero — Anexo VII");
- **Exclusão de Imposto Seletivo**: Não incide sob nenhuma hipótese sobre dispositivos médicos.
