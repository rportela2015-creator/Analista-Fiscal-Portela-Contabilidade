---
id: "reforma-imposto-seletivo"
titulo: "Imposto Seletivo (IS) — Critérios de Incidência, Fato Gerador e NCMs Sujeitos (LC nº 214/2025)"
tipo: "REFORMA"
norma: "Lei Complementar nº 214/2025 / Título VI e Anexos"
capitulos: ["22", "24", "27", "87"]
posicoes: ["2203", "2208", "2402", "2709", "8703"]
ncms_relevantes: ["2203.00.00", "2208.30.20", "2402.20.00", "8703.22.10"]
vigencia_inicio: "2027-01-01"
tags: ["imposto seletivo", "is", "cigarro", "bebidas alcoolicas", "automoveis", "reforma tributaria"]
---

# Reforma Tributária: Imposto Seletivo (IS)

## Competência e Fato Gerador
O Imposto Seletivo (IS), instituído pelo Artigo 153, VIII da Constituição Federal e disciplinado pela Lei Complementar nº 214/2025, tem finalidade extrafiscal e incide uma única vez (monofásico) sobre a produção, extração, comercialização ou importação de bens prejudiciais à saúde ou ao meio ambiente.

## Categorias de Mercadorias Tributadas e Amostra de NCMs
1. **Veículos Automotores de Passageiros**: Posição `8703` (alíquotas moduladas por eficiência energética e emissão de CO2);
2. **Bebidas Alcoólicas**: Posições `2203` (Cervejas), `2204` (Vinhos), `2208` (Destilados como cachaça e uísque);
3. **Produtos de Tabaco**: Posição `2402` (Cigarros, charutos e cigarrilhas);
4. **Bebidas Açucaradas / Refrigerantes**: Posição `2202` (incidência escalonada);
5. **Bens Minerais Extraídos**: Posições `2709` (Petróleo bruto) e minérios de ferro.

## Parametrização no ERP e Impacto nos Níveis do Sistema
- **Selo Visual**: Os NCMs afetados recebem a tag `<span className="badge red">IS 2027</span>` nas telas de consulta e classificação.
- **Parametrização do XML**: No preenchimento da tag `<IS>`, deve-se declarar o grupo de tributação do Imposto Seletivo com as alíquotas oficiais `ad valorem` e `ad rem` parametrizadas pela regulamentação da Receita Federal.
