---
id: "reforma-regulamentos-cbs-ibs-2026"
titulo: "Regulamentos do IBS e da CBS — Decreto nº 12.955/2026 (RCBS) e Resolução CGIBS nº 6/2026 (RIBS)"
tipo: "REFORMA"
norma: "Decreto nº 12.955/2026 e Resolução CGIBS nº 6/2026 / Parte Comum"
capitulos: []
posicoes: []
ncms_relevantes: []
vigencia_inicio: "2026-04-30"
tags: ["rcbs", "ribs", "decreto 12955", "resolucao cgibs 6", "regulamento cbs", "regulamento ibs", "split payment", "nao cumulatividade"]
---

# Regulamentação Infraconstitucional da Reforma: RCBS e RIBS

## Estrutura Harmonizada entre União, Estados e Municípios
O Decreto nº 12.955, de 29 de abril de 2026 (Regulamento da CBS - RCBS) e a Resolução CGIBS nº 6, de 30 de abril de 2026 (Regulamento do IBS - RIBS) contêm uma **Parte Geral Unificada** de redação idêntica, assegurando a uniformidade de interpretação do modelo do IVA dual brasileiro:

1. **Fato Gerador Amplo**: Fornecimento oneroso de qualquer bem material ou imaterial (inclusive direitos, marcas, softwares e ativos digitais) ou prestação de qualquer serviço;
2. **Princípio do Destino**: A tributação pertence ao local de consumo/entrega do bem ou da fruição do serviço;
3. **Não Cumulatividade Plena**: Todo IBS e CBS incidente sobre aquisições tributadas gera crédito fiscal imediato e financeiro, com exceção expressa de itens de uso e consumo pessoal exclusivo sem pertinência com a atividade econômica;
4. **Mecanismo de Split Payment (Liquidação Financeira Vinculada)**:
   - Pagamento inteligente e automático no momento da liquidação bancária/PIX/cartão;
   - Separação imediata do montante devido aos cofres públicos do IBS/CBS e do valor líquido creditado ao fornecedor.

## Impacto na Classificação Fiscal e Atributos de ERP
- Os documentos fiscais eletrônicos são a base única de constituição do crédito;
- O preenchimento correto do `cClassTrib` (Classificação Tributária da Operação) é requisito de validade jurídica para que o adquirente possa apropriar crédito na entrada (`/api/auditoria-entrada`).
