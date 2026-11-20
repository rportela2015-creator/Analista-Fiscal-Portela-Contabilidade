# Changelog — Analista Fiscal Portela Contabilidade

Todas as alterações notáveis deste projeto serão documentadas neste arquivo.
O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e adere ao Versionamento Semântico.

---

## [Ciclo 5] — Motor Fiscal Bitemporal do ICMS/PR, Auditoria de DIFAL na Entrada & Núcleo Dual-Stack 2026–2027
**Período:** Novembro/2026  
**Responsável Técnico:** Arquiteto Tributário Sênior (RICMS/PR & LC 214/2025) & Engenheiro Full-Stack Next.js/TypeScript

### Sub-Etapa 18.1: Matriz Normativa Bitemporal do ICMS/PR & Extrator NT 2026.008
- **Matriz Normativa (`rules/icms-pr-matriz.json`):**
  - Mapeamento histórico e prospectivo da alíquota modal interna do Paraná: 18% (até 2022), 19% (Lei nº 21.308/2022, 01/01/2023 a 17/03/2024), 19,5% (Lei nº 21.850/2023, vigente a partir de 18/03/2024);
  - Catálogo seletivo de alíquotas com travas de partes e peças de máquinas industriais (12% vs 19,5%);
  - Anexo XII do RICMS/PR (Art. 14-A da Lei nº 11.580/1996 — FECOP 2% em perfumaria, cosméticos e cervejas);
  - Registro de exclusões bitemporais de Substituição Tributária (Decreto nº 6.048/2024 para artefatos plásticos domésticos e Decreto nº 12.828/2026 a partir de 01/03/2026 para eletroeletrônicos e celulares);
  - Combustíveis monofásicos *ad rem* (Lei Complementar nº 192/2022, Convênio ICMS 15/2023 e virada em 01/02/2027 pelos Convênios ICMS nº 127/2026 e nº 128/2026).
- **Loader Bitemporal (`lib/engine/matriz-icms-pr.ts`):**
  - Funções `resolverAliquotaPrBitemporal`, `verificarExclusaoStPr` e `obterParametrosSimplesNacionalPr`.
- **Evolução do Extrator de NF-e (`lib/extrator-nfe.ts`):**
  - Compatibilidade com a NT 2026.008 v1.01 e NT 2025.002 v1.52 (grupos `<impostoDevol>`, `<IBS>`, `<CBS>`, `<IS>`).
- **Suíte de Testes:** `tests/matriz-icms-pr.test.mjs` (todas as asserções validadas).

---

### Sub-Etapa 18.2: Motor Determinístico de DIFAL, FECOP e Antecipação Tributária (RICMS/PR)
- **Módulo `lib/engine/difal-pr.ts`:**
  - **Modalidade 1 (Uso/Consumo e Ativo Imobilizado):** Fórmula de Base Dupla do Paraná (Art. 8º, § 12 da Lei nº 11.580/1996 e Art. 74 do RICMS/PR), segregando ICMS DIFAL e FECOP (Art. 14-A Lei 11.580/96 c/c Anexo XII) com códigos de guia e obrigações acessórias;
  - **Modalidade 2 (ICMS-ST na Entrada sem Retenção):** Art. 11 do Anexo IX do RICMS/PR com responsabilidade do adquirente via GR-PR (Código 10009-9);
  - **Modalidade 3 (Antecipação Tributária Art. 16):** Importados à alíquota de 4% (Resolução SF 13/2012) e Gás Natural, aplicando carga de 12% no regime normal (diferimento parcial Art. 28 Anexo VIII) com efeito caixa líquido nulo via crédito na EFD ICMS/IPI;
  - **Modalidade 4 (DIFAL Não Contribuinte / EC 87/2015):** Apuração por Base Única no remetente para consumidores finais não contribuintes no PR;
  - **Virada 2027 (Consulta SEFA/PR nº 48/2026):** Inclusão opcional de IBS/CBS na Base de Cálculo do ICMS.
- **Suíte de Testes:** `tests/difal-pr.test.mjs` (11 cenários cobrindo todas as modalidades).

---

### Sub-Etapa 18.3: Integração do DIFAL na Pipeline de Extração, UI e Relatório Pericial
- **Pipeline de Extração (`app/api/auditoria-entrada/route.ts`):**
  - Execução automática da apuração de DIFAL, FECOP e Antecipação Art. 16 para notas fiscais interestaduais com destino ao Paraná.
- **Interface da Aba de Auditoria de Entrada (`components/AuditoriaEntrada.tsx`):**
  - Card Executivo de DIFAL/FECOP/Antecipação com indicadores de valores totais a recolher, efeito financeiro de caixa, guias e prazos;
  - Coluna de DIFAL/ST/Antecipação na tabela detalhada de itens (`components/TabelaItensExtracao.tsx`).
- **Relatório Pericial HTML (`app/api/auditoria-relatorio/route.ts`):**
  - Seção pericial formatada e sanitizada contra XSS via `esc()` de `@lib/html.ts`, pronta para impressão/PDF com cabeçalho oficial Portela Contabilidade.
- **Suíte de Testes:** `tests/auditoria-difal-entrada.test.mjs`.

---

### Sub-Etapa 18.4: Engrenagens Periciais Avançadas do ICMS/PR
- **Módulo `lib/engine/icms-pr-regras.ts`:**
  - **`calcularDiferimentoParcialPR` (Art. 28 Anexo VIII):** Carga efetiva de 12% com 5 travas de bloqueio determinísticas (destinatário Simples Nacional/MEI, consumidor final, combustíveis, interestadual, alíquota <= 12%);
  - **`calcularReducaoBcEEstornoPR` (Anexo VI):** Redução da Cesta Básica (Item 9) para carga efetiva de 7% e cálculo do Estorno Proporcional Obrigatório de Créditos na Entrada (Art. 45, IV do RICMS/PR) vs Isenção Integral para Consumidor Final (Anexo V Item 21, CST 40);
  - **`calcularIcmsStPR`:** Hierarquia pericial de apuração (Preço Máximo > PMPF > Preço Sugerido > MVA, Consulta SEFA/PR nº 018/2026); ordem matemática de redutor sobre MVA antes do ajuste CONFAZ (Consulta SEFA/PR nº 43/2023); trava do Convênio ICMS 35/2011 (MVA Original para fornecedores optantes pelo Simples Nacional); trava de exclusão de ST pelo Decreto nº 12.828/2026;
  - **`calcularSimplesNacionalPR` (Decreto Estadual nº 8.660/2018):** Faixa isenta de ICMS no PGDAS-D até R$ 360.000,00 de RBT12; trava de 2017 para redução proporcional do ICMS entre R$ 360k e R$ 3,6M; controle do sublimite estadual de R$ 3.600.000,00 com recolhimento por fora na EFD ICMS/IPI quando ultrapassado.
- **Integração no Motor Calculadora (`lib/engine/calculadora.ts`):**
  - Enriquecimento dos diagnósticos fiscais e re-exportação através de `lib/engine/index.ts` e `lib/engine.ts`.
- **Suíte de Testes:** `tests/icms-pr-regras.test.mjs` (8 cenários periciais auditados).

---

### Sub-Etapa 18.5: Núcleo Dual-Stack 2026–2027, Mesa de Compras PR & Virada de Combustíveis
- **Módulo `lib/engine/precificacao-pr-2027.ts`:**
  - **`calcularCmvLiquidoPR` (NBC TG 16 / CPC 16):** Custo de Mercadorias Vendidas por regime (Lucro Real com Tema 69 STF no crédito de entrada de PIS/COFINS via Lei nº 14.592/2023, Lucro Presumido, Simples Nacional e MEI);
  - **`calcularPrecoVenda2026PR` (Mark-Up Divisor):** Formação de preço por dentro com exclusão do ICMS da base do PIS/COFINS (Tema 69 STF — RE 574.706/PR);
  - **`simularPrecificacaoDualStack2027PR` (Choque 2027):** Modelagem comparativa entre a Consulta Tributária SEFA/PR nº 48/2026 (IBS e CBS compondo a base de cálculo do ICMS por dentro) e a Tese Judicial de exclusão (análoga ao Tema 69), calculando efeito cascata, aumento percentual de ICMS e erosão de margem se preço permanecer travado;
  - **`compararFornecedoresCustoAterrissadoPR` (Mesa de Compras PR):** Sourcing inteligente comparando fornecedores internos e interestaduais com ST, Antecipação Art. 16 e custo de oportunidade do capital de giro sobre o desembolso tributário antecipado;
  - **`simularImpactoCombustivelAdRem2027`:** Projeção orçamentária do reajuste das alíquotas *ad rem* dos combustíveis monofásicos a partir de 01/02/2027 (Convênios ICMS nº 127/2026 e nº 128/2026).
- **Interface da Aba de Precificação (`components/Precificar.tsx`):**
  - Toggle jurídico da Consulta SEFA/PR nº 48/2026 com comparativo lado a lado;
  - Painel expansível da Mesa de Compras PR com tabela ranqueada e destaque de economia real;
  - Alerta executivo da janela de cancelamento irretratável do Simples Híbrido 2027 (Resoluções CGSN nº 186/2026 e 194/2026);
  - Radar logístico de combustíveis monofásicos *ad rem*.
- **Suíte de Testes:** `tests/precificacao-dual-stack-2027.test.mjs` (5 testes numéricos rigorosos).
- **Garantia de Qualidade (DoD):**
  - Ordem estrita de React Hooks (`scripts/hookcheck.mjs`);
  - Tipagem estrita com zero erros no `npm run typecheck`;
  - 35 suítes de testes automatizados com 100% de aprovação no `npm test`;
  - Validação do build de produção via `npm run build`.
