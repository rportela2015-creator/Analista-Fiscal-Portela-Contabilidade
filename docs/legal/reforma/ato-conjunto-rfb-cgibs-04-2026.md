---
id: "reforma-ato-conjunto-04-2026"
titulo: "Ato Conjunto RFB/CGIBS nº 4/2026 — Cronograma de Obrigatoriedade de Emissão de DF-e com Campos de IBS e CBS"
tipo: "REFORMA"
norma: "Ato Conjunto RFB/CGIBS nº 4, de 30 de julho de 2026 / Arts. 1º a 3º"
capitulos: []
posicoes: []
ncms_relevantes: []
vigencia_inicio: "2026-08-03"
tags: ["ato conjunto 04/2026", "cronograma", "obrigatoriedade", "nf-e", "nfc-e", "03/08/2026", "01/10/2026", "01/12/2026", "01/01/2027", "simples nacional"]
---

# Ato Conjunto RFB/CGIBS nº 4/2026: Datas de Início da Obrigatoriedade de DF-e

## Cronograma Oficial de Entrada em Vigor por Modelo de DF-e
Em cumprimento ao Art. 112 do Decreto nº 12.955/2026 (RCBS) e da Resolução CGIBS nº 6/2026 (RIBS), a obrigatoriedade de preenchimento dos grupos de IBS e CBS observará o seguinte cronograma em relação aos fatos geradores:

1. **3 de agosto de 2026**:
   - **NF-e (modelo 55)**: Emissão com preenchimento obrigatório dos campos da reforma;
   - **NFC-e (modelo 65)**: Varejo geral com campos de IBS/CBS;
   - **CT-e (modelo 57)** e **CT-e OS (modelo 67)**: Transportes intermunicipais e interestaduais.

2. **1º de outubro de 2026**:
   - **NFS-e**: Prestadores de serviços municipais em geral sujeitos ao ISS (LC 116/2003).

3. **1º de dezembro de 2026**:
   - **NFS-e**: Plataformas digitais intermediadoras (Art. 22 da LC 214/2025), serviços de tecnologia/software (subitens 1.03, 1.05 e 1.09) e transporte municipal (subitem 16.01);
   - **BP-e (modelo 63)**: Bilhete de passagem aéreo e rodoviário interestadual/metropolitano;
   - Locações de bens móveis, imóveis e cessões onerosas de direitos.

4. **1º de janeiro de 2027**:
   - Início da vigência plena das alíquotas oficiais de CBS e IBS e opção pelo regime regular para contribuintes do **Simples Nacional** e regimes específicos monofásicos.

## Diretrizes de Parametrização para Desenvolvedores de Software Fiscal
- As validações de esquema XML referentes a `<cClassTrib>` e `<gIBSCBS>` passam a rejeitar documentos sem os campos a partir de **03/08/2026** para emissores de Regime Normal.
- Optantes pelo Simples Nacional não são autuados antes de 01/01/2027 pelas regras regulares de apuração, salvo se optarem formalmente pelo regime regular nos termos da Resolução CGSN nº 186/2026.
