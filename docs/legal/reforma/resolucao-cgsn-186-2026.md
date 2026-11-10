---
id: "reforma-resolucao-cgsn-186-2026"
titulo: "Resolução CGSN nº 186/2026 — Prazos e Condições para Opção pelo Regime Regular de IBS e CBS pelas ME e EPP em 2027"
tipo: "REFORMA"
norma: "Resolução CGSN nº 186, de 9 de abril de 2026 / Arts. 1º a 5º"
capitulos: []
posicoes: []
ncms_relevantes: []
vigencia_inicio: "2026-09-01"
tags: ["cgsn 186/2026", "simples nacional", "me", "epp", "opcao regime regular", "ibs", "cbs", "janeiro a junho 2027", "setembro 2026"]
---

# Resolução CGSN nº 186/2026: Opção do Simples Nacional para IBS e CBS em 2027

## Janela Temporal de Exercício de Opção
A Resolução CGSN nº 186/2026 regulamenta o Artigo 41, §§ 3º e 4º da LC nº 214/2025 e o Art. 16 da LC nº 123/2006:
1. **Prazo de Manifestação**: O contribuinte do Simples Nacional deverá manifestar sua opção pelo regime regular de apuração e recolhimento do IBS e da CBS entre **01 de setembro de 2026 e 30 de setembro de 2026** no Portal do Simples Nacional;
2. **Produção de Efeitos**: Produz efeitos a partir de **1º de janeiro de 2027** para o semestre de **janeiro a junho de 2027**;
3. **Cancelamento Irretratável**: O solicitante poderá cancelar o pedido até o último dia de **novembro de 2026**.

## Consequências Tributárias da Opção
- **Empresas que optarem pelo Regime Regular de IBS/CBS**:
  - Apuram IBS e CBS pelo regime não cumulativo pleno com direito a apropriação e transferência integral de créditos fiscais para seus clientes de regime normal;
  - Deixam de recolher as parcelas de IBS e CBS dentro do Documento de Arrecadação do Simples Nacional (DAS);
  - Mantêm os demais tributos federais (IRPJ, CSLL, PIS residual, COFINS residual, CPP) recolhidos via DAS.
- **Empresas que mantiverem a apuração unificada do Simples**:
  - Recolhem IBS e CBS englobados na alíquota única do DAS;
  - Só transferem créditos de IBS e CBS aos adquirentes correspondentes ao montante efetivamente recolhido em sua faixa do DAS.

## Parametrização no Módulo ERP
- No cadastro de empresas no ERP, deve ser incluído o flag `optante_ibs_cbs_regime_regular` (Sim/Não).
- Quando `Sim`, nas emissões de notas a partir de 01/01/2027 o sistema substitui o CST simplificado pelo CST de regime regular (ex.: CST `000` / `200` com destaque das alíquotas plenas de IBS/CBS).
