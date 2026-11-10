---
name: ncm-fiscal-auditor
description: >-
  Especialista em auditoria pericial fiscal, classificação de mercadorias no Sistema Harmonizado (NCM/SH),
  aplicação das Regras Gerais de Interpretação (RGI 1 a 6), Notas Explicativas da NESH (IN RFB nº 2.169/2023),
  Soluções de Consulta COSIT/DISIT e enquadramento da Reforma Tributária do Consumo (LC 214/2025 e LC 227/2025).
  Use quando precisar classificar mercadorias, desatar empates entre posições fiscais, fundamentar laudos periciais
  ou auditar dados tributários de NF-e.
metadata:
  version: 1.0.0
---

# Auditoria e Classificação Fiscal de Mercadorias (NCM/SH & Reforma Tributária)

Esta habilidade orienta a análise pericial, classificação aduaneira e determinação de regimes tributários para qualquer mercadoria comercializada no Brasil.

---

## 1. Estrutura Hierárquica do Código NCM (8 dígitos)

A Nomenclatura Comum do Mercosul (NCM) adota o Sistema Harmonizado de Designação e de Codificação de Mercadorias (SH) até o 6º dígito, com desdobramentos específicos do Mercosul no 7º e 8º dígitos:

| Nível | Dígitos | Exemplo (`8471.30.12`) | Descrição |
|---|---|---|---|
| **Capítulo** | 2 | `84` | Reatores nucleares, caldeiras, máquinas, aparelhos mecânicos e suas partes |
| **Posição** | 4 | `8471` | Máquinas automáticas para processamento de dados e suas unidades |
| **Subposição 1** | 5 | `8471.3` | Máquinas automáticas para processamento de dados, portáteis, de peso <= 10 kg |
| **Subposição 2** | 6 | `8471.30` | Posição fechada no nível SH de 6 dígitos |
| **Item** | 7 | `8471.30.1` | De peso inferior a 3,5 kg, com tela plana |
| **Subitem** | 8 | `8471.30.12` | Com teclado incorporado e tela tátil (touchscreen) |

---

## 2. Metodologia das Regras Gerais de Interpretação (RGI 1 a 6)

A classificação é governada pela aplicação sequencial e obrigatória das seguintes regras:

### RGI 1 — Regra Mãe (Texto da Posição e Notas Legais)
> *"Os títulos dos Capítulos, Seções e Subcapítulos têm apenas valor indicativo. A classificação é determinada legalmente pelos textos das posições (4 dígitos) e pelas Notas de Seção e de Capítulo."*
- Se a mercadoria estiver nominalmente expressa no texto da posição e não for excluída por Notas de Seção ou Capítulo, a classificação se encerra na RGI 1.

### RGI 2 — Mercadorias Incompletas, Desmontadas ou Misturas
- **RGI 2(a)**: Artigo incompleto ou inacabado se classifica na mesma posição do artigo completo, desde que já apresente as características essenciais do produto acabado. Aplica-se também a artigos desmontados (CKD/SKD).
- **RGI 2(b)**: Produtos obtidos pela mistura ou associação de matérias.

### RGI 3 — Conflito entre Duas ou Mais Posições
- **RGI 3(a) — Especificidade**: A posição mais específica prevalece sobre a mais genérica.
- **RGI 3(b) — Característica Essencial**: Para misturas, sortidos, kits comerciais e obras compostas de matérias diferentes, a classificação é determinada pela matéria ou elemento que lhes confere a característica essencial.
- **RGI 3(c) — Ordem Numérica**: Em caso de empate absoluto, adota-se a posição situada em último lugar na ordem numérica entre as concorrentes.

### RGI 4 — Analogia
- Aplica-se apenas residualmente a produtos inéditos que não encontrem qualquer correspondência, classificando-se na posição dos artigos mais semelhantes.

### RGI 5 — Embalagens, Estojos e Continentes
- **RGI 5(a)**: Estojos e estojamentos de instrumentos musicais, armas, jóias concebidos especialmente para o artigo e destinados a acompanhá-lo por longo tempo se classificam com o artigo (exceto se conferirem a característica essencial ao conjunto).
- **RGI 5(b)**: Embalagens comuns reutilizáveis ou descartáveis seguem o regime das mercadorias que acondicionam.

### RGI 6 — Desdobramento em Subposições e Subitens
- A determinação do 5º ao 8º dígito deve obedecer às mesmas regras RGI 1 a 5, comparando-se sempre subposições do mesmo nível hierárquico (um hífen com um hífen; dois hífens com dois hífens).

---

## 3. Fontes Oficiais de Jurisprudência Vinculante

1. **NESH (Notas Explicativas do Sistema Harmonizado)**:
   - Aprovadas no Brasil pela **IN RFB nº 2.169/2023**. Descrevem com precisão microscópica o que entra e o que é excluído em cada posição de 4 dígitos.
2. **Soluções de Consulta COSIT e DISIT**:
   - Manifestações oficiais e vinculantes da Receita Federal que pacificam o enquadramento de mercadorias controversas.

---

## 4. Enquadramento na Reforma Tributária do Consumo (LC 214/2025 e LC 227/2025)

Toda classificação NCM no novo modelo tributário deve informar:

1. **Código de Classificação Tributária (`cClassTrib`)**:
   - Código padronizado nacional para identificação dos tratamentos tributários de IBS e CBS.
2. **Regimes Especiais e Diferenciados**:
   - **Alíquota Zero**: Cesta Básica Nacional de Alimentos (art. 8º da LC 214/2025).
   - **Redução de 60%**: Dispositivos médicos, medicamentos, serviços de saúde, educação, produtos agropecuários in natura.
   - **Redução de 30%**: Serviços de profissão regulamentada.
3. **Imposto Seletivo (IS)**:
   - Incidência sobre veículos, aeronaves, embarcações, bebidas alcoólicas, cigarros e derivados de tabaco, bebidas açucaradas e bens minerais extraídos.
4. **Cronograma de Transição Gradual (2026 a 2033)**:
   - 2026: Alíquota de teste (CBS 0,9% e IBS 0,1%).
   - 2027: Extinção definitiva de PIS e COFINS; CBS em vigor pleno; IPI zerado para a maioria dos bens (salvo ZFM).
   - 2029 a 2032: Redução progressiva de ICMS e ISS (1/10 ao ano) e aumento proporcional do IBS.
   - 2033: Entrada em vigor definitiva e integral do novo modelo tributário.

---

## 5. Estrutura Padrão do Laudo Técnico Pericial de Classificação Fiscal

Um laudo formal emitido deve conter obrigatoriamente:
1. **Identificação do Interessado**: CNPJ/Nome, Data e Protocolo de Análise.
2. **Descrição Técnica do Objeto**: Matéria constitutiva, destinação, modo de operação e especificações.
3. **Classificação Determinada**: Código NCM (8 dígitos) e descrição oficial Siscomex.
4. **Fundamentação Jurídica Sequencial**:
   - Citação da RGI 1 (texto da posição 4 dígitos).
   - Notas de Seção e Capítulo aplicáveis.
   - Trecho da NESH correspondente.
   - Citação da RGI 6 (desdobramento em subitem).
   - Precedentes de Soluções de Consulta COSIT (se aplicável).
5. **Cenário Tributário Vigente & Transição da Reforma**:
   - IPI, II, PIS/COFINS, ICMS (CEST se ST).
   - `cClassTrib`, CST IBS/CBS, alíquotas do cronograma 2026-2033 e incidência de Imposto Seletivo.
6. **Declaração de Responsabilidade Técnica**.
