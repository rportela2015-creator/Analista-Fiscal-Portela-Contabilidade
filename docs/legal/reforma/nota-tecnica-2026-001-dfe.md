---
id: "reforma-nota-tecnica-2026-001-dfe"
titulo: "Nota Técnica 2026.001 — Padrão de Adaptação e Validação dos Documentos Fiscais Eletrônicos para a Reforma Tributária (RTC)"
tipo: "REFORMA"
norma: "Nota Técnica 2026.001 v1.02b / ENCAT / SEFAZ / RFB"
capitulos: []
posicoes: []
ncms_relevantes: []
vigencia_inicio: "2026-08-03"
tags: ["nota tecnica 2026.001", "paa nfe", "rtc", "cclasstrib", "gibscbs", "regras de validacao", "encat", "sefaz"]
---

# Nota Técnica 2026.001: Adaptação da NF-e e NFC-e à Reforma Tributária do Consumo (RTC)

## Objetivos e Novos Grupos de Informação
A Nota Técnica 2026.001 introduz as alterações no leiaute da Nota Fiscal Eletrônica (NF-e, modelo 55) e da Nota Fiscal de Consumidor Eletrônica (NFC-e, modelo 65) necessárias para viabilizar a apuração do IBS, da CBS e do Imposto Seletivo:

1. **Tag `<cClassTrib>`**: Código de Classificação Tributária da Operação com 6 dígitos alfanuméricos, vinculando cada item de mercadoria à sua fundamentação legal na LC 214/2025;
2. **Grupo `<gIBSCBS>`**:
   - `<CST>`: Código de Situação Tributária do IBS/CBS (ex.: `000` tributado integralmente, `200` redução, `400` alíquota zero/isenção, `620` monofásico);
   - `<vBCIBS>` e `<pIBS>`: Base de cálculo e alíquota estadual/municipal do IBS;
   - `<vBCBS>` e `<pCBS>`: Base de cálculo e alíquota federal da CBS;
3. **Grupo `<gIS>`**:
   - Alíquota `ad valorem` ou valor `ad rem` por unidade de medida tributável do Imposto Seletivo;
4. **Mecanismo de Pagamento Vinculado (Split Payment)**:
   - Identificação do tipo de liquidação financeira no grupo `<pag>` para retenção automática na fonte pagadora.

## Regras de Validação Severas e Erros de Rejeição
- **Rejeição por cClassTrib Inexistente**: O código deve constar obrigatoriamente na Tabela de Classificação Tributária oficial publicada pelo Comitê Gestor do IBS e Receita Federal;
- **Rejeição por Incompatibilidade CST x cClassTrib**: O prefixo do cClassTrib de 6 dígitos deve corresponder exatamente ao CST informado no mesmo grupo (ex.: CST `200` exige cClassTrib iniciando em `200...`);
- **Rejeição de NCM em Regime Sujeito a IS**: Itens de bebidas alcoólicas, cigarros ou veículos que omitirem a informação do grupo `<IS>` serão rejeitados a partir de 2027.
