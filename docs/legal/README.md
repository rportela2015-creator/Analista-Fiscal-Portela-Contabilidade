# Repositório de Fontes Legais da NCM & Reforma Tributária

**Contabilidade Portela (Desde 1970)**  
**Diretoria de Auditoria Fiscal & Tributária**

Este repositório contém a base documental normativa oficial em formato Markdown (`.md`), utilizada pelos três níveis da plataforma computacional (Nível 1: Ingestão, Nível 2: Motor Siscomex e Nível 3: Auditoria Pericial com IA Local Ollama).

## Estrutura do Acervo

1. `rgi/`: Regras Gerais para a Interpretação do Sistema Harmonizado (RGI 1 a 6) e Regras Gerais Complementares (RGC).
2. `nesh/`: Notas Explicativas do Sistema Harmonizado (IN RFB nº 2.169/2023), contendo critérios de matéria, função, inclusões e notas de exclusão de seções e capítulos.
3. `cosit/`: Soluções de Consulta COSIT/DISIT da Receita Federal do Brasil e pareceres da Organização Mundial das Alfândegas (OMA).
4. `reforma/`: Dispositivos normativos e anexos taxativos da Lei Complementar nº 214/2025 e Lei Complementar nº 227/2025 (Cesta Básica Nacional, Dispositivos Médicos, Insumos Agropecuários e Imposto Seletivo).

## Padrão de Frontmatter YAML

Todos os arquivos deste repositório devem conter cabeçalho YAML com as seguintes propriedades:

```yaml
---
id: "identificador-unico"
titulo: "Título oficial sucinto"
tipo: "NESH" | "COSIT" | "REFORMA" | "RGI"
norma: "Ato legal ou instrução normativa de referência"
capitulos: ["84", "85"]
posicoes: ["8471"]
ncms_relevantes: ["8471.30.12"]
vigencia_inicio: "AAAA-MM-DD"
tags: ["termo1", "termo2"]
---
```

## Compilação e Indexação

Para compilar este repositório em um índice estruturado consumível pela aplicação (`public/data/fontes-legais.json`):

```bash
python3 scripts/compilar_fontes_legais.py
```
O script valida automaticamente a integridade do frontmatter e confere se todos os NCMs citados constam na Tabela NCM oficial de 10.515 códigos da Receita Federal.
