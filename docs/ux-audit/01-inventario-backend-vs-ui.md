# Inventário de Capacidades de Backend vs. Exposição na UI
**Documento Técnico de Auditoria & Mapeamento Ergonômico — Sub-etapa 20.1 (Fase 1 do Ciclo 7)**
*Analista Fiscal Portela v6.0.0 — Contabilidade Portela (Desde 1970)*
*Data de Emissão: 23 de Novembro de 2026*
*Responsável Técnico: Frente A — Auditoria de Capacidades Ocultas & Especialista Fiscal*

---

## 1. Sumário Executivo & Metodologia da Auditoria

O **Analista Fiscal Portela v6.0.0** consolidou uma arquitetura tributária de altíssimo rigor técnico, combinando motores determinísticos bitemporais do ICMS do Paraná (RICMS/PR Dec. 7.871/2017), conformidade estrita com as leis estaduais (Lei nº 11.580/1996, Lei nº 15.562/2007, Lei nº 22.190/2024), consultas tributárias vinculantes da SEFA/PR, orquestração DAG em 6 etapas, integração com sidecars oficiais da Receita Federal (RTC para Simples Nacional e Regime Regular com validação XSD) e inteligência artificial soberana local (*Local-First* na GPU RX 580 com Ollama) aliada à nuvem (Gemini 3.8 Flash).

Contudo, a auditoria de código-fonte realizada sobre o backend (`@lib/engine/**`, `@lib/fiscal/**`, `@lib/integracoes/**` e `/app/api/**`) em contraste com a interface visual (`/app/**` e `/components/**`) revelou um descompasso estrutural crítico:

> **O backend calcula com precisão pericial centenas de parâmetros tributários cruciais (memórias de cálculo passo a passo, fatores matemáticos de diferimento, bases duplas reconstituídas, segregação de FECOP em guias apartadas, alertas de ST indevida, comparativos de 4 regimes, paridade centavo a centavo contra a RFB e códigos de ajuste para a EFD Sped Fiscal). Porém, na interface com o usuário, mais de 65% dessas capacidades encontram-se OCULTAS NO BACKEND, ENTERRADAS EM EXCESSO DE TEXTO corrido ou EXIGEM MUITOS CLIQUES e rolagem vertical excessiva para serem alcançadas.**

### Metodologia de Classificação de Visibilidade na UI
Cada capacidade e regra tributária foi auditada segundo a taxonomia estrita:
1. **`EXPOSTA_COM_CLAREZA`**: O operador visualiza o veredito e os dados essenciais de imediato na tela principal, com hierarquia visual adequada e sem necessidade de caçar a informação.
2. **`ENTERRA_EM_EXCESSO_DE_TEXTO`**: A capacidade existe na tela, mas é apresentada na forma de notas de texto longo, caixas de alerta monocromáticas ou tooltips (`title` HTML), gerando fadiga cognitiva e alto risco de passar despercebida no fechamento mensal.
3. **`EXIGE_MUITOS_CLIQUES`**: A capacidade está implementada no frontend, mas requer navegar por múltiplas abas, rolar milhares de pixels verticalmente, expandir tabelas secundárias ou abrir múltiplos modais sobrepostos.
4. **`OCULTA_NO_BACKEND`**: O cálculo é executado com total rigor matemático no TypeScript/Node.js, o dado está presente no objeto de resposta ou na memória do motor, mas a interface simplesmente não o renderiza em nenhum componente visual, descartando-o silenciosamente.

---

## 2. Mapeamento Completo das Rotas de API (`/app/api/**`)

O sistema disponibiliza 21 rotas de API REST/Next.js estruturadas. A tabela abaixo sintetiza a função de cada endpoint, os contratos de entrada/saída e o diagnóstico de visibilidade no cliente:

| Rota de API | Método | Finalidade Fiscal & Negócio | Parâmetros Principais | Resposta do Backend | Diagnóstico de Consumo no Frontend |
| :--- | :---: | :--- | :--- | :--- | :--- |
| `/api/fiscal/orquestrar-nfe` | `POST` | Orquestrador DAG unificado em 6 etapas: Extração -> RTC RFB -> ICMS/PR -> Créditos 3 Camadas -> 4 Regimes -> Persistência PostgreSQL/In-Memory. | `file` (XML) ou `xml`, `empresaId`, `statusExtincaoRtc`, `destinacaoPadrao`, `persistir`, `validarGruposXmlRtc` | `ResultadoOrquestracaoNfe`: etapas, totais RTC, resumo DIFAL, créditos 3 camadas, comparativo 4 regimes, SHA-256 | `ENTERRA_EM_EXCESSO_DE_TEXTO` / `EXIGE_MUITOS_CLIQUES`. Executado na `AuditoriaEntrada.tsx`, mas os resultados são distribuídos em blocos verticais extensos. O hash SHA-256 e o relatório de paridade item a item não são mostrados. |
| `/api/fiscal/auditar-nfse` | `POST` | Auditoria pericial de NFS-e / DPS Padrão Nacional, validação de schema DF-e, NT 004/2026, NT 007/2026 (retenções), conciliação com sidecar RTC. | `xml`, `empresaId`, `statusExtincaoRtc`, `persistir` | `ResultadoAuditoriaNfse`: alertas (CRITICO/ATENCAO), créditos tomador, conciliação RTC, tributos municipais/federais | `EXPOSTA_COM_CLAREZA` via componente dedicado `PainelNfseDanfse.tsx`, acionado por detecção automática de XML de NFS-e no upload da Auditoria de Entrada. |
| `/api/auditoria-entrada/extrair` | `POST` | Extração determinística imediata (<200ms) de NF-e sem LLM, saneamento O(1) contra 10.515 NCMs Siscomex e pré-computação de sensibilidade. | `file` (multipart/form-data: XML ou PDF), `regime`, `finalidade` | `ExtractedInvoiceData`: emitente, destinatário, itens normalizados, resumo financeiro, sensibilidade tributária | `EXPOSTA_COM_CLAREZA` na tabela de itens da `AuditoriaEntrada.tsx`, porém o botão de extração compete com o botão da orquestração completa gerando confusão sobre qual acionar. |
| `/api/auditoria-entrada/auditar` | `POST` | Auditoria seletiva profunda de itens por IA Especialista (Ollama Local RX 580 particionado ou Google Gemini Cloud) com laudo pericial. | `AuditRequestPayload`: `motor`, `modelo`, `regime`, `finalidade`, `ufDestino`, `extracao`, `selectedIndices` | `AuditResponsePayload`: parecer técnico, conformidade de créditos, parametrização ERP sugerida por item | `EXIGE_MUITOS_CLIQUES`. Exige que o operador selecione checkboxes na tabela, role até o seletor de motores, escolha entre Ollama e Gemini e clique em "Auditar". |
| `/api/auditoria-relatorio` | `POST` | Geração de relatório executivo de auditoria de entrada em formatos HTML ou TXT consolidado. | JSON com dados da nota, itens enriquecidos com DIFAL, orquestração DAG, SHA-256, `format` | Blob com download do arquivo (`relatorio_executivo.html`) | `EXPOSTA_COM_CLAREZA`, mas o botão de download fica escondido após a finalização da auditoria de IA. |
| `/api/rtc/status` | `GET` | Probe de saúde, latência e versões de banco de dados/aplicação dos 3 sidecars oficiais da RFB (Regime Regular, Simples Nacional, DANFSe). | Nenhum | `StatusIntegracoesRfb`: status por serviço (ONLINE/OFFLINE), circuit breaker (CLOSED/OPEN), latências, versões | `EXPOSTA_COM_CLAREZA` na aba `CadastroEmpresas.tsx` (card de infraestrutura) com badges de conectividade e botão de revalidação. |
| `/api/rtc/danfse` | `POST` | Renderização do DANFSe oficial da Receita Federal em PDF via sidecar `rtc-danfse` a partir do XML. | `xml` (body ou JSON), `stc` ('0'\|'1'\|'2'), `canhoto` (boolean) | Binário `application/pdf` com cabeçalho `Content-Disposition: inline` | `EXPOSTA_COM_CLAREZA` no `PainelNfseDanfse.tsx` através de botão dedicado com abertura do PDF oficial em nova aba. |
| `/api/rtc/validar-xml` | `POST` | Validação estrutural de XML contra schemas XSD oficiais da Reforma Tributária (grupos W03, UB, etc.). | `xml`, `tipo` ('nfe'\|'nfse'), `subtipo` ('completo'\|'grupo') | `sucesso`, `valido`, `duracaoMs`, erros detalhados de validação | `OCULTA_NO_BACKEND` na UI direta. É chamado pelo orquestrador DAG, mas na interface só aparece uma badge binária `XML: VALIDO/INVALIDO`, sem exibir os erros do XSD. |
| `/api/rtc/calcular-regular` | `POST` | Cálculo oficial de IBS, CBS e Imposto Seletivo para contribuintes do Regime Regular via sidecar oficial RFB. | JSON com operação, emitente, destinatário, itens | `ResultadoCalculoRegimeRegularNormalizado`: tributos por item e totais (IBS UF, IBS Mun, CBS, IS) | `ENTERRA_EM_EXCESSO_DE_TEXTO`. Consumido indiretamente pelo orquestrador DAG; na UI os dados de rateio entre Estado e Município ficam espremidos em cards pequenos. |
| `/api/rtc/calcular-simples` | `POST` | Cálculo oficial de IBS e CBS para optantes do Simples Nacional (Regime Tradicional vs Híbrido) via sidecar RFB. | JSON com operação Simples Nacional, emitente, destinatário, itens | `ResultadoSimplesNormalizado`: tributos calculados no DAS ou por fora | `OCULTA_NO_BACKEND` / `ENTERRA_EM_EXCESSO_DE_TEXTO`. Consumido pelo orquestrador DAG; na UI da aba Reforma e Precificação os cálculos por fora ficam resumidos sem detalhes. |
| `/api/rtc/atividades-sn` | `GET` | Consulta a tabela oficial de atividades econômicas e anexos do Simples Nacional para enquadramento RTC. | `q` (termo de busca) ou código da atividade | Array de atividades oficiais com alíquotas e anexos LC 123 | `OCULTA_NO_BACKEND`. Rota disponível, porém sem campo de busca correspondente na UI de parametrização. |
| `/api/empresas` | `GET`, `POST` | Listagem e cadastro de empresas clientes do escritório Portela Contabilidade. | POST: dados cadastrais (CNPJ, Razão Social, UF, CNAE, IE) | Empresa cadastrada com UUID | `EXPOSTA_COM_CLAREZA` na aba `CadastroEmpresas.tsx`. |
| `/api/empresas/[id]` | `GET`, `PUT`, `DELETE` | Consulta, atualização cadastral e remoção de empresa cliente. | UUID no path | Dados da empresa | `EXPOSTA_COM_CLAREZA` na aba `CadastroEmpresas.tsx`. |
| `/api/empresas/[id]/perfis` | `GET`, `POST` | Gestão de perfis tributários bitemporais (regime, alíquotas efetivas, benefícios fiscais PR, split payment). | POST: `regimeTributario`, `vigenciaInicio`, `vigenciaFim`, flags de benefícios | Perfil persistido com vigência histórica e encerramento automático | `EXPOSTA_COM_CLAREZA` na aba `CadastroEmpresas.tsx`, mas com formulário longo de 20+ campos sem segmentação por abas. |
| `/api/empresas/[id]/perfil-vigente` | `GET` | Resolução do perfil tributário da empresa vigente em determinada data de fato gerador. | Query param `data` (YYYY-MM-DD) | Perfil ativo na data informada | `OCULTA_NO_BACKEND` na inspeção manual. Consumido automaticamente via hook `useEmpresaAtiva.ts`, sem feedback visual de qual perfil foi ativado por data na nota. |
| `/api/classificar-ia` | `POST` | Classificação pericial de mercadoria via IA (Ollama ou Gemini) com aplicação das RGI 1 a 6 e NESH. | `descricao`, `motor`, `candidatos` Siscomex saneados | NCM sugerido, confiança, fundamentação RGI/NESH, CST IBS/CBS, cClassTrib | `EXPOSTA_COM_CLAREZA` na aba `Classificar.tsx`. |
| `/api/codificar-erp-ia` | `POST` | Codificação assistida por IA para ERP quando aderência de cadastro for < 85%. | Linha do produto, contexto de saída, regime, UF destino | Códigos fiscais sugeridos (CFOP, CST, cBenef, cClassTrib) com justificativa | `EXIGE_MUITOS_CLIQUES`. Localizada na aba `Lote.tsx`, só é acionada após upload de planilha CSV e clique individual por linha. |
| `/api/parametrizacao-relatorio` | `POST` | Geração de relatórios de parametrização para ERP em HTML ou TXT. | Parâmetros de parametrização da nota fiscal | Arquivo exportável formatado | `EXPOSTA_COM_CLAREZA` através de modal na aba `Parametrizar.tsx`. |
| `/api/atualizar` | `POST` | Atualização do catálogo oficial Siscomex (10.515 NCMs) e tabelas da Reforma Tributária via dados abertos. | Nenhum | Status da atualização e contagem de registros carregados | `ENTERRA_EM_EXCESSO_DE_TEXTO` na aba `Regras.tsx`, em meio a dezenas de parágrafos de texto normativo. |
| `/api/webhook/fiscal` | `POST` | Recepção assíncrona de eventos de documentos fiscais de ERPs parceiros e mensageria DFe. | Payload JSON assinado com chave de evento e dados da nota | Confirmação de recebimento | `OCULTA_NO_BACKEND`. Rota pura de infraestrutura sem tela de monitoramento de webhooks na interface do usuário. |

---

## 3. Mapeamento Completo dos Motores Fiscais

O coração pericial do Analista Fiscal Portela reside em bibliotecas puras e especializadas em TypeScript:

```
lib/
├── engine/                      # Motores de Cálculo de Impostos Estaduais e Orquestração
│   ├── calculadora.ts           # Motor dinâmico de ICMS próprio, MVA Ajustada e reduções
│   ├── difal-pr.ts              # Motor pericial de DIFAL Base Dupla, FECOP e Antecipação PR
│   ├── enquadrador.ts           # Classificação matricial de regras fiscais por NCM/Regime
│   ├── icms-pr-regras.ts        # Regras avançadas: Diferimento Art. 28, Anexo VI, ST Anexo IX, Simples Dec. 8.660/18
│   ├── matriz-icms-pr.ts        # Matriz de alíquotas bitemporais do PR e exclusões de ST (Dec. 6.048/24 e 12.828/26)
│   ├── orquestrador-fiscal.ts   # Orquestrador DAG de 6 etapas causais com persistência PostgreSQL
│   └── precificacao-pr-2027.ts  # Dual-Stack 2027 (Consulta 48/26 vs Tese), Mesa de Compras PR e Combustíveis Ad Rem
├── fiscal/                      # Estruturas Canônicas e Conformidade Tributária
│   ├── auditoria-nfse.ts        # Auditor fiscal de NFS-e / DPS Nacional (NT 004/2026 e NT 007/2026)
│   ├── credito-tributario.ts    # Classificação Tripartida de Créditos (XML, Regra, CPC 16 / Art. 47 LC 214)
│   ├── documento-normalizado.ts # Normalização unificada de NF-e e NFS-e para processamento agnóstico
│   ├── paridade-rfb.ts          # Diagnóstico pericial de paridade centavo a centavo (RFB vs Motor Local)
│   └── perfil-tributario.ts     # Resolução determinística de perfis tributários bitemporais
├── integracoes/                 # Conectores com Motores Oficiais e Resiliência
│   ├── rfb-health.ts            # Circuit Breaker (30s cooldown), timeouts e monitoramento dos sidecars
│   ├── rtc-danfse/              # Cliente do gerador de PDF oficial do DANFSe da Receita Federal
│   ├── rtc-regime-regular/      # Cliente, mapper e normalizador do cálculo de IBS/CBS do Regime Regular
│   └── rtc-simples/             # Cliente, mapper e normalizador do cálculo de IBS/CBS do Simples Nacional
├── math/
│   └── decimal-fiscal.ts        # Precisão numérica ADR003 com DecimalHalfEven (arredondamento bancário RFB)
└── ...
```

---

## 4. Matriz Exaustiva de Capacidades do Sistema

Abaixo, cada uma das capacidades fiscais fundamentais do sistema é detalhada e classificada entre as 4 categorias ergonômicas de visibilidade, acompanhada do diagnóstico da dor do operador e da proposta de solução nos **3 Níveis Operacionais** (Gerencial, Operacional, Sênior):

```
+-------------------------------------------------------------------------------------------------------------------+
| LEGENDA DE VISIBILIDADE ATUAL:                                                                                   |
| [1] EXPOSTA_COM_CLAREZA         - Visível de imediato com boa hierarquia visual                                  |
| [2] ENTERRA_EM_EXCESSO_DE_TEXTO - Informação soterrada em parágrafos longos, notes monocromáticos ou tooltips   |
| [3] EXIGE_MUITOS_CLIQUES        - Exige rolagem excessiva, navegação em abas ou múltiplos modais                 |
| [4] OCULTA_NO_BACKEND           - Calculada com perfeição no backend, mas 100% omitida na tela visual           |
+-------------------------------------------------------------------------------------------------------------------+
```

---

### Capacidade 01: DIFAL Base Dupla (Convênio ICMS 142/18 e Art. 8º, § 12 da Lei PR 11.580/96)
- **Implementação Backend**: `lib/engine/difal-pr.ts` -> funções `apurarDifalEntradaPR()` e `auditarDifalNotaEntrada()`.
- **Lógica e Fundamentação**: Aplica a fórmula canônica paranaense de "cálculo por dentro": exclui o ICMS de origem da operação e divide a base pelo divisor `1 - (Alíquota Interna Efetiva + FECOP)`. Gera o valor do DIFAL deduzindo o crédito da origem.
- **Consumo Atual no Frontend**: Componente `AuditoriaEntrada.tsx` (linhas 1423–1434) e `TabelaItensExtracao.tsx` (linhas 779–807).
- **Classificação de Visibilidade**: `ENTERRA_EM_EXCESSO_DE_TEXTO`
- **Diagnóstico Ergonômico**: 
  - Na tela de Auditoria, o valor total do DIFAL aparece em um card amarelo-laranja com fundo `#fff7ed` misturado a outras 3 métricas.
  - Na tabela de itens, aparece como uma badge minúscula em fonte 10px (`DIFAL R$ XX.XX + FECOP R$ YY.YY`).
  - A base dupla reconstituída (que é o valor auditável mais crítico) só aparece como texto secundário minúsculo ("Base: R$ ZZ.ZZ") ou dentro do tooltip `title` do HTML.
  - A memória passo a passo do cálculo (que o fiscal precisa para confrontar a autuação da SEFA/PR) não é mostrada na tela, ficando restrita ao arquivo exportado em HTML.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Card KPI com veredito direto: "DIFAL Total Devido: R$ X.XXX,XX" com indicador de impacto no caixa e prazo de pagamento ("Vence dia 12"). Zero fórmulas.
  - **`operacional` (default)**: Coluna "DIFAL / FECOP" na tabela principal com valor final destacado e chip de status semáforo. Linha expansível ou Drawer lateral com resumo de Base de Partida vs. Base Reconstituída.
  - **`senior` (pericial)**: Painel completo de Base Dupla sob demanda com a memória integral: Base Bruta -> Dedução ICMS Origem -> Divisor `(1 - AliqTotal)` -> Base Reconstituída -> Débito Apurado -> Dedução Origem -> Guia GR-PR devida e código EFD.

---

### Capacidade 02: FECOP com Emissão em Guia Apartada (Art. 14-A da Lei PR 11.580/96 e Anexo XII do RICMS/PR)
- **Implementação Backend**: `lib/engine/difal-pr.ts` (linhas 189–200 e 558–564) e `lib/engine/icms-pr-regras.ts` (linhas 653–661).
- **Lógica e Fundamentação**: O Adicional de 2% do Fundo Estadual de Combate à Pobreza (FECOP) incidente sobre mercadorias supérfluas (bebidas, tabaco, cosméticos, eletrônicos) **não pode ser somado na mesma guia de recolhimento do DIFAL ou do ICMS-ST normal**; exige código de receita específico em guia GR-PR apartada.
- **Consumo Atual no Frontend**: `AuditoriaEntrada.tsx` (linhas 1435–1446).
- **Classificação de Visibilidade**: `ENTERRA_EM_EXCESSO_DE_TEXTO`
- **Diagnóstico Ergonômico**:
  - O sistema exibe o valor em um card informativo, mas não enfatiza a regra obrigatória de **guia apartada**. O operador novato pode recolher o valor somado na mesma guia do DIFAL (erro gravíssimo que gera inadimplência e juros na SEFA/PR).
  - O código de receita da GR-PR e o prazo específico de vencimento não possuem botões de cópia direta.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Notificação no semáforo: "Exige 2 guias distintas (DIFAL + FECOP Apartado)".
  - **`operacional` (default)**: Destaque visual com selo âmbar "GUIA APARTADA OBRIGATÓRIA" ao lado do valor do FECOP, com botão "Copiar dados para GR-PR".
  - **`senior` (pericial)**: Detalhamento da fundamentação legal do Art. 14-A da Lei 11.580/96, alíquota nominal (2%), base de cálculo e especificação do registro de ajuste na EFD Sped Fiscal.

---

### Capacidade 03: Trava Decreto Estadual nº 12.828/2026 e Decreto nº 6.048/2024 (Exclusão de ST)
- **Implementação Backend**: `lib/engine/matriz-icms-pr.ts` (`verificarExclusaoStPr`), `lib/engine/difal-pr.ts` (linhas 137–144) e `lib/engine/icms-pr-regras.ts` (linhas 538–567).
- **Lógica e Fundamentação**: Mercadorias expressamente excluídas da Substituição Tributária no Paraná pelos Decretos 6.048/2024 e 12.828/2026 (ex.: vinhos, bebidas quentes, artefatos plásticos). Se o remetente de outra UF destacar ICMS-ST na nota, o backend dispara alerta preventivo de ST indevida, orientando o destinatário a NÃO tomar crédito, não emitir com CST 60/CSOSN 500 e solicitar carta de correção ou estorno.
- **Consumo Atual no Frontend**: Inserido na lista de strings `alertasConsolidados` em `AuditoriaEntrada.tsx` (linhas 1521–1539).
- **Classificação de Visibilidade**: `ENTERRA_EM_EXCESSO_DE_TEXTO`
- **Diagnóstico Ergonômico**:
  - O alerta pericial mais perigoso (que pode gerar autuação de dezenas de milhares de reais por apropriação indébita de ST) é jogado dentro de uma caixa de alerta de texto corrido no rodapé da página.
  - Não há um semáforo vermelho explícito bloqueando o item na tabela ou sugerindo recusa/notificação imediata do fornecedor.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: KPI Vermelho piscante: "1 Alerta Crítico: ST Destacada Indevidamente (Decreto 12.828/2026)".
  - **`operacional` (default)**: Tag vermelha `[ST INDEVIDA - DEC. 12.828/2026]` na linha do produto na tabela, com botão de 1 clique "Copiar Notificação para Fornecedor".
  - **`senior` (pericial)**: Parecer técnico completo contendo o Art. 21 do Anexo IX do RICMS/PR, orientação de inventário no Bloco H do Sped e instrução de pleito de restituição de indébito perante a UF de origem.

---

### Capacidade 04: Diferimento Parcial Art. 28 do Anexo VIII do RICMS/PR (Decreto nº 5.143/2024)
- **Implementação Backend**: `lib/engine/icms-pr-regras.ts` -> função `calcularDiferimentoParcialPR()`.
- **Lógica e Fundamentação**: Reduz a carga efetiva do ICMS para 12% nas saídas internas entre contribuintes paranaenses do regime normal para produtos com alíquota superior a 12%. Contém travas automáticas estritas: vedado para destinatário Simples Nacional/MEI, vedado para consumidor final, vedado para combustíveis e empresas de construção civil. Gera CST 51 e cBenef PR830001.
- **Consumo Atual no Frontend**: Não possui tela própria dedicada. Consumido internamente pela `Precificar.tsx` e referenciado no `Parametrizar.tsx`.
- **Classificação de Visibilidade**: `OCULTA_NO_BACKEND`
- **Diagnóstico Ergonômico**:
  - Embora o motor calcule o fator de base tributável (`12/aliq`), percentual diferido (`38,46%`), ICMS destacado (`12%`) e ICMS diferido (`7,5%`), o operador da tela de Auditoria e Parametrização não vê a memória de cálculo do diferimento. Ele só vê o CST 51 final.
  - As razões de bloqueio (ex.: por que o diferimento foi cancelado para um cliente MEI) ficam ocultas se não houver erro fatal.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Indicador de economia tributária: "Diferimento Parcial Aplicado: Carga 12% (Economia de 7,5 p.p. no ato)".
  - **`operacional` (default)**: Badge azul/amarela `CST 51 - Diferimento Parcial 12%` com tooltip descritivo do cBenef PR830001.
  - **`senior` (pericial)**: Bloco expansível de fundamentação com a matemática exata: `Fator = 12 / 19,5 = 0,615385`; Base Tributada e memória de dispensa de estorno da entrada (Art. 28, Anexo VIII).

---

### Capacidade 05: Redução de Base de Cálculo e Estorno Proporcional Anexo VI (Art. 45, IV do RICMS/PR)
- **Implementação Backend**: `lib/engine/icms-pr-regras.ts` -> função `calcularReducaoBcEEstornoPR()`.
- **Lógica e Fundamentação**: Benefícios fiscais do Anexo VI (Item 9 - Cesta Básica com carga 7% B2B vs Isenção Consumidor Final com 100% de estorno; Item 21 - Máquinas Industriais com carga 8,8% e trava de partes e peças da Consulta SEFA/PR 51/2021; Item 1 - Aeronaves 4%; Itens 15/16 - Agropecuária). Calcula com precisão o estorno proporcional obrigatório de créditos de entrada.
- **Consumo Atual no Frontend**: Referenciado apenas indiretamente em regras e fórmulas de custos.
- **Classificação de Visibilidade**: `OCULTA_NO_BACKEND`
- **Diagnóstico Ergonômico**:
  - É uma das maiores armadilhas de fiscalização no Paraná: empresas que usam a redução do Item 21 do Anexo VI em partes e peças sofrem autuação por glosa de crédito (Consulta 51/2021). O backend tem essa trava implementada com perfeição, mas ela não tem destaque visual proativo na UI antes do fechamento.
  - O estorno proporcional de crédito da entrada raramente é discriminado na tela para o operador lançar no Bloco E da EFD.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Alerta executivo de risco: "Operação com Redução de Base de Cálculo — Estorno Obrigatório de R$ X.XXX,XX de Crédito".
  - **`operacional` (default)**: Tag informativa do benefício Anexo VI na linha do item com o valor do estorno calculado em destaque.
  - **`senior` (pericial)**: Drawer pericial com fundamentação cruzada: Citação do Item do Anexo VI, Art. 45, IV, jurisprudência da Consulta SEFA/PR 51/2021 para partes/peças e código de ajuste de estorno na EFD ICMS/IPI.

---

### Capacidade 06: Simples Nacional PR — Decreto Estadual nº 8.660/2018 & Sublimite de R$ 3,6M
- **Implementação Backend**: `lib/engine/icms-pr-regras.ts` -> função `calcularSimplesNacionalPR()`.
- **Lógica e Fundamentação**: Aplica a Tabela Estadual do Paraná (Lei 15.562/2007 e Dec. 8.660/2018):
  1. Isenção total de ICMS no DAS para faturamento RBT12 até R$ 360.000,00 (com trava: ST e DIFAL continuam devidos fora do DAS; vedado crédito para adquirente);
  2. Faixas 3 a 5: Alíquota estadual reduzida com aplicação da Trava de 20% sobre o ano de 2017 (Art. 9º-A) e apuração do percentual de redução a informar no PGDAS-D;
  3. Monitoramento do sublimite estadual de R$ 3,6M (efeito em 01/01 seguinte para excesso até 20%; efeito imediato no mês seguinte para excesso > 20%; exclusão geral para > R$ 4,8M).
- **Consumo Atual no Frontend**: Consumido em simulações internas, mas **não possui tela ou painel de fechamento do Simples Nacional**.
- **Classificação de Visibilidade**: `OCULTA_NO_BACKEND`
- **Diagnóstico Ergonômico**:
  - O contador precisa calcular todo mês qual o "Percentual de Redução" a preencher no campo do PGDAS-D da Receita Federal. O backend calcula esse número exato (`percentualReducaoPgdasPct`), mas o operador contábil não encontra essa informação na interface visual!
  - Alertas sobre proximidade do sublimite estadual de R$ 3,6M ficam invisíveis na interface principal.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Termômetro de Sublimite do Paraná: "RBA acumulada: R$ 3.250.000,00 (90,2% do Sublimite Estadual)".
  - **`operacional` (default)**: Card dedicado de Fechamento Simples Nacional: "Alíquota ICMS PR: X,XX% · Redução PGDAS-D: Y,YY% (Copiar para PGDAS)".
  - **`senior` (pericial)**: Memória completa de cálculo confrontando Alíquota Nominal Nacional vs Tabela Dec. 8.660/2018 vs Trava Art. 9º-A (Lei 15.562/07) e vigência de migração obrigatória para o Regime Normal.

---

### Capacidade 07: Orquestrador Fiscal DAG (Directed Acyclic Graph)
- **Implementação Backend**: `lib/engine/orquestrador-fiscal.ts` -> função `orquestrarAnaliseNfeCompleta()`.
- **Lógica e Fundamentação**: Executa o fluxo causal completo em 6 etapas sequenciais: (1) Extração canônica com perfil bitemporal -> (2) Motor Oficial RFB RTC -> (3) Motor Estadual ICMS/PR v5.0.0 -> (4) Classificação Tripartida de Créditos -> (5) Custos CPC 16 e 4 Regimes -> (6) Persistência PostgreSQL 17 / In-Memory com hash SHA-256 e auditoria de idempotência.
- **Consumo Atual no Frontend**: `AuditoriaEntrada.tsx` (linhas 355–395 e 829–1136).
- **Classificação de Visibilidade**: `EXIGE_MUITOS_CLIQUES` / `ENTERRA_EM_EXCESSO_DE_TEXTO`
- **Diagnóstico Ergonômico**:
  - Para acionar a orquestração DAG, o usuário precisa fazer o upload, não pode usar o botão comum de extração determinística e deve clicar num botão secundário azul ("⚡ Executar Orquestração Completa").
  - Quando a orquestração termina, a tela descarrega mais de 300 linhas de componentes empilhados verticalmente, sem navegação por abas ou resumo executivo consolidado.
  - O hash SHA-256 (garantia pericial de custódia do arquivo) é computado, mas não é renderizado na tela.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: KpiStrip de topo com 4 cartões consolidados: Total da Nota, Custo Líquido Real, Total de Débitos a Recolher e Veredito Global (Conforme / Risco).
  - **`operacional` (default)**: A orquestração DAG deve ser a esteira única e padrão do botão primário ("Auditar e Orquestrar Nota"). Os resultados são apresentados na tabela de itens com colunas sintetizadas e barra fixa inferior (*Sticky Action Bar*).
  - **`senior` (pericial)**: Aba ou Drawer técnico demonstrando a linha do tempo das 6 etapas do DAG, tempos de execução de cada motor em milissegundos, hash SHA-256 criptográfico para cópia e confirmação de persistência no banco.

---

### Capacidade 08: Classificação Tripartida de Créditos Tributários (Art. 47 LC 214/2025 e CPC 16 / NBC TG 16)
- **Implementação Backend**: `lib/fiscal/credito-tributario.ts` -> função `classificarCreditosItemEntrada()`.
- **Lógica e Fundamentação**: Segrega rigidamente os tributos de entrada em 3 camadas:
  - **Camada 1 (Destacado no XML)**: Espelho imutável do documento fiscal emitido pelo fornecedor;
  - **Camada 2 (Admitido pela Regra)**: O que o ordenamento fiscal autoriza conforme o regime do adquirente e destinação;
  - **Camada 3 (Efetivado no Custo / CMV)**: Crédito real que reduz o estoque segundo CPC 16 e confirmação de extinção de débito via Split Payment da LC 214/2025.
- **Consumo Atual no Frontend**: `AuditoriaEntrada.tsx` (linhas 943–1034).
- **Classificação de Visibilidade**: `ENTERRA_EM_EXCESSO_DE_TEXTO`
- **Diagnóstico Ergonômico**:
  - A tabela tripartida atual exibe todos os tributos (ICMS, PIS, COFINS, IPI, IBS, CBS) em uma grade compacta, mas não permite filtrar a tabela de itens por divergências entre camadas (ex.: onde a Camada 1 difere da Camada 3).
  - A retenção de créditos de IBS/CBS do Art. 47 (aguardando extinção no fornecedor) aparece apenas como uma caixa de texto marrom, sem destacar quais produtos específicos da nota geraram a retenção.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: KPI sintético: "Crédito Efetivado no CMV: R$ X.XXX,XX" com indicador de glosa: "R$ YYY,YY retidos pelo Art. 47".
  - **`operacional` (default)**: Coluna "Crédito Efetivo" na tabela de itens. Tag informativa em itens com crédito retido aguardando Split Payment.
  - **`senior` (pericial)**: Tabela analítica completa das 3 camadas por item, com exibição de justificativas legais, fundamentação de retenção e aplicação do Tema 69 STF (exclusão de ICMS da base de crédito PIS/COFINS).

---

### Capacidade 09: Comparativo de Formação de Preço e Custo nos 4 Regimes Tributários
- **Implementação Backend**: `lib/engine/orquestrador-fiscal.ts` (linhas 1112–1133) e `lib/precificacao.ts` (`compararQuatroRegimes`).
- **Lógica e Fundamentação**: Simula e compara o CMV líquido, créditos aproveitados, carga tributária na saída e preço de venda sugerido entre: (1) Simples Nacional Tradicional, (2) Simples Nacional Híbrido 2027 (IBS/CBS por fora), (3) Lucro Presumido e (4) Lucro Real, elegendo o cenário mais econômico com justificativa.
- **Consumo Atual no Frontend**: `AuditoriaEntrada.tsx` (linhas 1036–1135) e `Precificar.tsx`.
- **Classificação de Visibilidade**: `ENTERRA_EM_EXCESSO_DE_TEXTO` / `EXIGE_MUITOS_CLIQUES`
- **Diagnóstico Ergonômico**:
  - Os 4 cartões aparecem na `AuditoriaEntrada.tsx`, mas possuem grande quantidade de linhas e números em fontes pequenas, dificultando a visualização rápida da melhor opção pelo cliente ou diretor.
  - Para manipular os parâmetros dessa simulação (margem de lucro, despesas operacionais), o usuário precisa navegar manualmente até a aba 6 (Precificação), perdendo o contexto da auditoria de entrada.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Card de Veredito Comparativo: "Cenário Recomendado: **Lucro Real** (Economia anual estimada de R$ XX.XXX,XX vs Simples)".
  - **`operacional` (default)**: Mini-gráfico de barras comparativo ou cards compactos com apenas: Preço Sugerido, Margem Líquida e Carga Efetiva.
  - **`senior` (pericial)**: Detalhamento da composição de mark-up divisor, crédito de PIS/COFINS não cumulativo, despesas aduaneiras e alíquotas efetivas de saída.

---

### Capacidade 10: Mesa de Compras PR (Comparador de Custo Efetivo Aterrissado com Capital de Giro)
- **Implementação Backend**: `lib/engine/precificacao-pr-2027.ts` -> função `compararFornecedoresCustoAterrissadoPR()`.
- **Lógica e Fundamentação**: Confronta cotações de fornecedores internos do PR vs fornecedores interestaduais (SP, SC, etc.), calculando o **Custo Efetivo Aterrissado**: inclui preço de compra, frete, IPI, ICMS próprio, ICMS-ST, Antecipação Art. 16 e o **Custo Financeiro do Capital de Giro** imobilizado nas guias antecipadas em estoque médio de 45 dias a 1,5% ao mês. Ranqueia as cotações e aponta o fornecedor verdadeiramente mais econômico.
- **Consumo Atual no Frontend**: `Precificar.tsx` (linhas 2744–2876).
- **Classificação de Visibilidade**: `EXIGE_MUITOS_CLIQUES` (Enterrada no fim de página com 2.960 linhas)
- **Diagnóstico Ergonômico**:
  - É uma ferramenta estratégica de altíssimo valor para o departamento de suprimentos das empresas clientes, mas está posicionada na linha 2.744 de um arquivo com quase 3.000 linhas na aba Precificar!
  - Para visualizá-la, o operador precisa rolar milhares de pixels e ainda clicar em um botão de toggle ("▼ Expandir Mesa de Compras"). O usuário comum nunca a descobrirá.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Resumo da cotação vencedora no topo da análise de compras: "Melhor Fornecedor: Fornecedor PR (Economia de 8,4% considerando desembolsos de guias antecipadas)".
  - **`operacional` (default)**: Seção de fácil acesso na Precificação ou aba dedicada de "Simulação de Fornecedores", com tabela de cotações já aberta e ranqueada.
  - **`senior` (pericial)**: Painel paramétrico com ajuste de taxa de capital de giro (CDI/Empréstimo), prazo de giro de estoque (dias) e memória analítica de impacto no fluxo de caixa por UF fornecedora.

---

### Capacidade 11: Consulta Tributária SEFA/PR nº 48/2026 (Transição 2027: Dual-Stack Grossing-up vs. Tese Judicial)
- **Implementação Backend**: `lib/engine/precificacao-pr-2027.ts` (`simularPrecificacaoDualStack2027PR`) e `lib/engine/difal-pr.ts` (linhas 145–162).
- **Lógica e Fundamentação**: Simula o impacto financeiro da Consulta SEFA/PR nº 48/2026, que orienta a inclusão dos novos tributos (IBS, CBS e Imposto Seletivo) na base de cálculo do ICMS durante a transição (*Grossing-up* completo), comparando contra o Modo Tese Judicial (análogo ao Tema 69 STF) que exclui o IVA Dual da base estadual.
- **Consumo Atual no Frontend**: `AuditoriaEntrada.tsx` (linhas 1344–1355) e `Precificar.tsx` (linhas 2598–2740).
- **Classificação de Visibilidade**: `EXIGE_MUITOS_CLIQUES` / `ENTERRA_EM_EXCESSO_DE_TEXTO`
- **Diagnóstico Ergonômico**:
  - Na `AuditoriaEntrada.tsx`, é apenas um checkbox isolado sem explicação clara de impacto em reais.
  - Na `Precificar.tsx`, a simulação completa fica após a linha 2.500, com dezenas de números e cards de fórmulas teóricas.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Indicador de risco/contingência: "Impacto da Consulta 48/2026: +R$ X,XX por unidade (+Y% de aumento no ICMS se não acionar tese judicial)".
  - **`operacional` (default)**: Switcher de 1 clique: `[ ] Consulta SEFA/PR 48/2026 (Oficial) | [ ] Tese Judicial (Tema 69)` atualizando o preço final instantaneamente.
  - **`senior` (pericial)**: Quadro de efeito cascata discriminado: Base com Grossing-up vs Base sem Grossing-up, erosão de margem líquida e parecer para embasamento de mandado de segurança.

---

### Capacidade 12: Radar Logístico de Combustíveis Monofásicos Ad Rem (Convênios ICMS 127/2026 e 128/2026)
- **Implementação Backend**: `lib/engine/precificacao-pr-2027.ts` -> função `simularImpactoCombustivelAdRem2027()`.
- **Lógica e Fundamentação**: Simula a virada das alíquotas *ad rem* (R$ fixo por litro/kg) no Paraná em 01/02/2027 para Óleo Diesel/Biodiesel, Gasolina/EAC e GLP/GLGN. Calcula a variação percentual, o acréscimo de custo mensal e anual para a frota da empresa e sugere CST 61 com código de ajuste EFD PR012000.
- **Consumo Atual no Frontend**: `Precificar.tsx` (linhas 2879–2940).
- **Classificação de Visibilidade**: `OCULTA_NO_BACKEND` / `EXIGE_MUITOS_CLIQUES`
- **Diagnóstico Ergonômico**:
  - Fica na última seção de `Precificar.tsx` (linha 2.879), sem destaque em nenhuma outra aba do sistema, tornando-se praticamente invisível para empresas transportadoras ou distribuidoras paranaenses.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Card em clientes de transporte/frotas: "Virada Ad Rem 01/02/2027: Acréscimo projetado de R$ XX.XXX,XX/ano no Diesel".
  - **`operacional` (default)**: Módulo de simulação rápida por litragem mensal com atualização de custos logísticos.
  - **`senior` (pericial)**: Detalhamento normativo com citação dos Convênios 127/2026 e 128/2026, parametrização do CST 61 e orientação de escrituração no Sped Fiscal com código PR012000.

---

### Capacidade 13: Auditoria Fiscal de NFS-e / DANFSe Nacional (NT 004, NT 007 e LC 214/2025)
- **Implementação Backend**: `lib/fiscal/auditoria-nfse.ts`, `lib/integracoes/rtc-danfse/*` e `app/api/fiscal/auditar-nfse/route.ts`.
- **Lógica e Fundamentação**: Audita DPS e NFS-e no Padrão Nacional: validação preventiva de schema (xLgr, cMun 7 dígitos, cTribNac), exigência de grupos de IBS/CBS para fatos geradores a partir de 03/08/2026 (NT 004/2026), detecção de bases contaminadas por retenções federais (NT 007/2026), classificação de créditos do tomador e renderização do DANFSe oficial em PDF.
- **Consumo Atual no Frontend**: `AuditoriaEntrada.tsx` via `PainelNfseDanfse.tsx`.
- **Classificação de Visibilidade**: `EXPOSTA_COM_CLAREZA` (quando acionada por upload de NFS-e)
- **Diagnóstico Ergonômico**:
  - O painel `PainelNfseDanfse.tsx` é bem construído, porém não possui aba própria na barra de navegação principal (`page.tsx`), dependendo exclusivamente de o operador arrastar um arquivo XML de serviço para dentro da aba de entrada de mercadorias.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Resumo de retenções na fonte devidas pelo tomador (ISSQN, IRRF, CSLL, PIS, COFINS).
  - **`operacional` (default)**: Alertas categorizados com semáforo visual e botão destacado para visualização do DANFSe oficial em PDF em 1 clique.
  - **`senior` (pericial)**: Detalhamento pericial das Notas Técnicas 004/2026 e 007/2026 e conciliação com o motor oficial da Receita Federal.

---

### Capacidade 14: Diagnóstico Pericial de Paridade RFB (Motor Oficial vs. Motor Local via ADR003 Half-Even)
- **Implementação Backend**: `lib/fiscal/paridade-rfb.ts` -> função `compararParidadeRtc()`.
- **Lógica e Fundamentação**: Compara centavo a centavo todas as bases de cálculo e alíquotas oficiais do sidecar da Receita Federal contra o motor local, identificando divergências com tolerância zero e classificando a causa provável (`ARREDONDAMENTO_HALF_EVEN`, `DIVERGENCIA_BASE_CALCULO`, `DIVERGENCIA_ALIQUOTA_OU_REDUCAO`).
- **Consumo Atual no Frontend**: NENHUM.
- **Classificação de Visibilidade**: `OCULTA_NO_BACKEND`
- **Diagnóstico Ergonômico**:
  - O backend produz o relatório completo (`RelatorioParidadeRfb`), mas o frontend simplesmente não possui componente que o renderize! A tela exibe apenas uma badge estática verde "OFICIAL RFB", desperdiçando a capacidade de auditoria de paridade centavo a centavo.
- **Proposta nos 3 Níveis Operacionais**:
  - **`gerencial`**: Badge de conformidade: "Paridade 100% Homologada pela Receita Federal (Divergência: R$ 0,00)".
  - **`operacional` (default)**: Selo de Paridade ao lado dos totais de IBS e CBS.
  - **`senior` (pericial)**: Tabela de auditoria de paridade item a item demonstrando a comparação de cada campo e apontando desvios de centavos decorrentes do método HALF_EVEN.

---

### Capacidade 15: Outras Capacidades Relevantes Identificadas no Backend

| # | Capacidade Fiscal no Backend | Arquivo & Função Backend | Consumo Atual na UI | Classificação Atual | Proposta nos 3 Níveis Operacionais |
| :-: | :--- | :--- | :--- | :---: | :--- |
| **A** | **CIAP Bloco G (1/48 avos - Art. 20, § 5º LC 87/96)** | `lib/engine/difal-pr.ts` (linhas 212–217) e `lib/fiscal/credito-tributario.ts` (linha 161) | Menção textual em `AuditoriaEntrada.tsx` | `ENTERRA_EM_EXCESSO_DE_TEXTO` | **Gerencial:** Total de crédito anual a apropriar.<br>**Operacional:** Badge `Ativo Imobilizado - CIAP 1/48`.<br>**Sênior:** Cronograma das 48 parcelas e código PR020021 para EFD. |
| **B** | **Antecipação 4% Art. 16 RICMS/PR (Importados e Gás)** | `lib/engine/difal-pr.ts` (linhas 310–403) | Card de Antecipação em `AuditoriaEntrada.tsx` | `ENTERRA_EM_EXCESSO_DE_TEXTO` | **Gerencial:** Efeito caixa: R$ 0,00 no Regime Normal vs R$ X no Simples.<br>**Operacional:** Badge com guia GR-PR.<br>**Sênior:** Memória de lançamento na EFD (E111 com estorno concomitante). |
| **C** | **Hierarquia de Base ST: PMPF > Preço Fabricante > MVA (Consulta SEFA/PR 018/2026)** | `lib/engine/icms-pr-regras.ts` (linhas 569–593) | Não discriminado na UI | `OCULTA_NO_BACKEND` | **Operacional:** Indicação do critério eleito.<br>**Sênior:** Parecer da Consulta 018/2026 demonstrando prevalência de PMPF. |
| **D** | **Ordem de Redutores de MVA antes do Ajuste CONFAZ (Consulta SEFA/PR 43/2023)** | `lib/engine/icms-pr-regras.ts` (linhas 597–638) | Não discriminado na UI | `OCULTA_NO_BACKEND` | **Sênior:** Passo 1 (MVA com redutor) -> Passo 2 (Ajuste interestadual CONFAZ). |
| **E** | **Trava Convênio ICMS 35/2011 (Simples Nacional sem MVA Ajustada)** | `lib/engine/icms-pr-regras.ts` (linhas 618–622) | Não discriminado na UI | `OCULTA_NO_BACKEND` | **Operacional:** Tag `MVA Original (Conv. 35/11)`.<br>**Sênior:** Fundamentação jurídica da dispensa de ajuste. |
| **F** | **Rateio de Frete CIF vs FOB (CT-e) por Valor ou Peso** | `lib/precificacao.ts` (`ratearDespesasAcessoriaEFrete`) | Controles em `Precificar.tsx` | `EXIGE_MUITOS_CLIQUES` | **Operacional:** Toggle direto no upload da nota: `[x] Frete FOB via CT-e`. |
| **G** | **Mark-up Divisor com Exclusão Tema 69 STF e Ponto de Equilíbrio (PEC)** | `lib/precificacao.ts` (`simular`, `calcularCustoAquisicaoReal`) | Tabelas em `Precificar.tsx` | `ENTERRA_EM_EXCESSO_DE_TEXTO` | **Gerencial:** Ponto de equilíbrio contábil em unidades e R$.<br>**Sênior:** Fórmula do mark-up divisor deduzindo PIS/COFINS. |
| **H** | **Circuit Breaker com 3 Estados e Cooldown 30s para Sidecars RFB** | `lib/integracoes/rfb-health.ts` | Indicador em `CadastroEmpresas.tsx` | `EXPOSTA_COM_CLAREZA` | **Operacional:** Badge persistente de status dos sidecars no header. |
| **I** | **Validação XSD RTC Grupos W03/UB (Erros Estruturais)** | `app/api/rtc/validar-xml/route.ts` | Badge binária em `AuditoriaEntrada.tsx` | `OCULTA_NO_BACKEND` | **Sênior:** Drawer com a árvore de tags do XML rejeitadas pelo XSD. |
| **J** | **Hash SHA-256 e Auditoria Idempotente de Duplicatas** | `lib/engine/orquestrador-fiscal.ts` (linhas 254–257) | Apenas no payload JSON | `OCULTA_NO_BACKEND` | **Operacional:** Badge de integridade com hash truncado e botão de cópia. |

---

## 5. Levantamento Exaustivo de Dados Calculados e Descartados ou Subexpostos

A tabela a seguir inventaria todos os campos calculados deterministicamente pelo backend que atualmente não possuem tratamento visual adequado na interface do usuário:

| Campo Calculado pelo Backend | Origem no Backend | Tipo de Dado | Significado Pericial / Negócio | Status Atual na UI | Proposta de Enquadramento nos 3 Níveis Operacionais |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `memoriaCalculo` (DIFAL Base Dupla) | `difal-pr.ts` (linhas 192–200) | `string[]` | Demonstração passo a passo da reconstituição da base dupla do ICMS/PR e cálculo do FECOP. | Descartado na tela (só vai para o HTML exportado) | **Sênior:** Bloco expansível `Ver Memória de Cálculo` com renderização das equações matemáticas e fatores. |
| `baseCalculoDifal` (Reconstituída) | `difal-pr.ts` (linha 186) | `number` | Base de cálculo "por dentro" com o ICMS e FECOP do Paraná embutidos. | Tooltip pequeno em HTML | **Operacional:** Exibição clara no Drawer do item como "Base Reconstituída (PR)". |
| `codigoAjusteEfd` | `difal-pr.ts` (linhas 214, 218) | `string` | Código oficial da Tabela 5.1.1 / 5.2 da SEFA/PR para lançamento na EFD ICMS/IPI (ex.: `PR020021`). | Texto corrido misturado | **Operacional & Sênior:** Chip com botão de 1 clique "Copiar Código EFD" para colar no software contábil. |
| `ciapBlocoG` | `difal-pr.ts` (linha 213) | `boolean` | Flag de imobilizado que confere direito a apropriação em 48 meses. | Texto corrido | **Operacional:** Badge com tag `CIAP Bloco G`.<br>**Sênior:** Projeção da parcela mensal `1/48`. |
| `fatorBaseTributavel` | `icms-pr-regras.ts` (linha 158) | `number` | Coeficiente exato do diferimento parcial (`12/aliq`, ex: `0,615385`). | Oculto no backend | **Sênior:** Exibição no Drawer de fundamentação do Art. 28 do Anexo VIII. |
| `percentualDiferidoPct` | `icms-pr-regras.ts` (linha 161) | `number` | Percentual diferido de imposto recolhido na etapa subsequente (ex: `38,4615%`). | Oculto no backend | **Operacional:** Badge `Diferido 38,46%`. |
| `percentualReducaoPgdasPct` | `icms-pr-regras.ts` (linha 841) | `number` | Percentual de redução a informar no aplicativo PGDAS-D da Receita Federal. | Oculto no backend | **Operacional:** Card executivo com o valor e botão "Copiar para PGDAS-D". |
| `aliquotaTrava2017Pct` | `icms-pr-regras.ts` (linha 835) | `number` | Teto legal do Art. 9º-A da Lei 15.562/07 (máximo 20% sobre alíquota de 2017). | Oculto no backend | **Sênior:** Quadro de comparação da Tabela Estadual do Simples Nacional. |
| `statusSublimite` | `icms-pr-regras.ts` (linha 726) | `enum` | Enquadramento nos limites de faturamento de R$ 3,6M e R$ 4,8M. | Oculto no backend | **Gerencial:** Semáforo de sublimite na ficha da empresa cliente. |
| `divergencias` (Paridade RTC) | `paridade-rfb.ts` (linha 44) | `DivergenciaItemParidade[]` | Lista detalhada de divergências de centavos e alíquotas RFB vs Local. | 100% Oculto | **Sênior:** Tabela de paridade pericial com realce em vermelho de divergências. |
| `causaProvavel` | `paridade-rfb.ts` (linha 29) | `enum` | Diagnóstico automático da causa de desvio (`ARREDONDAMENTO_HALF_EVEN`, etc.). | 100% Oculto | **Sênior:** Explicação técnica fundamentada do desvio de arredondamento. |
| `sha256Xml` | `orquestrador-fiscal.ts` (linha 254) | `string` | Hash criptográfico SHA-256 da NF-e para garantia de integridade da custódia. | Oculto na UI | **Operacional & Sênior:** Exibição no topo da nota em fonte mono com botão de cópia. |
| `duracaoRtcMs` | `orquestrador-fiscal.ts` (linha 153) | `number` | Tempo de resposta do sidecar da Receita Federal em milissegundos. | Fonte cinza de 11px | **Sênior:** Monitor de telemetria e latência dos sidecars. |
| `retidoAguardandoExtincaoIbsCbs` | `orquestrador-fiscal.ts` (linha 185) | `{ ibs, cbs, total }` | Segregação dos créditos de IBS e CBS retidos pelo Art. 47 da LC 214/2025. | Texto em caixa marrom | **Operacional:** Filtro na tabela para exibir apenas itens retidos. |
| `erros` de Validação XSD RTC | `rtc-regime-regular/client.ts` | `string[]` | Mensagens exatas dos erros de schema XSD retornados pelo validador RFB. | Oculto (só status binário) | **Sênior:** Lista navegável de tags com erro de schema XSD. |
| `custoCapitalGiro` (Mesa Compras) | `precificacao-pr-2027.ts` (linha 522) | `number` | Custo de oportunidade financeiro dos tributos antecipados em estoque. | Enterrado no fim de página | **Gerencial & Operacional:** Coluna discriminada no comparativo de fornecedores. |
| `efeitoCascataReais` (Dual-Stack) | `precificacao-pr-2027.ts` (linha 312) | `number` | Diferença em R$ decorrente da inclusão ou exclusão do IVA Dual na base ICMS. | Enterrado no fim de página | **Gerencial:** Indicador de contingência financeira da Consulta SEFA/PR 48/2026. |

---

## 6. Top 5 Capacidades Prontas no Backend que Estavam Enterradas ou Subexpostas

Com base no impacto financeiro direto e no risco de autuação para as empresas atendidas pela Contabilidade Portela, destacam-se as 5 capacidades prioritárias a serem resgatadas na reformulação visual:

### 1. Auditoria Pericial de Paridade RFB Centavo a Centavo (`paridade-rfb.ts`)
- **Impacto**: O motor compara o cálculo oficial da Receita Federal contra o motor local com precisão `DecimalHalfEven` e tolerância zero. O código está 100% implementado e testado no backend, mas **não possui nenhum componente visual que o renderize na UI**. O fiscal precisa desse relatório para homologar fechamentos do novo sistema tributário.
- **Ação**: Implementar o componente `ParidadeRtcPanel` no nível Sênior sob demanda.

### 2. Trava de ST Indevida dos Decretos PR nº 6.048/2024 e nº 12.828/2026 (`difal-pr.ts` e `matriz-icms-pr.ts`)
- **Impacto**: Mercadorias como vinhos e cosméticos foram retiradas da Substituição Tributária no Paraná. Fornecedores de SP/SC continuam destacando ST indevidamente. O backend detecta a data de vigência do decreto e bloqueia o crédito, mas essa informação fica soterrada em um parágrafo de texto no fim da página de Auditoria.
- **Ação**: Criar um semáforo de Risco Alto na linha do produto com tag visual destacada e botão para gerar notificação de recusa ao fornecedor.

### 3. Simulador da Mesa de Compras PR com Custo Efetivo Aterrissado (`precificacao-pr-2027.ts`)
- **Impacto**: Ferramenta de grande apelo gerencial que prova ao cliente que comprar no Paraná com diferimento muitas vezes sai mais barato do que comprar em Santa Catarina ou São Paulo (mesmo com preço de partida menor), devido a ICMS-ST, Antecipação Art. 16 e custo financeiro de capital de giro. Está soterrada na linha 2.744 de uma página longa.
- **Ação**: Promover a Mesa de Compras para acesso direto em destaque ou drawer dedicado.

### 4. Apuração da Redução do PGDAS-D do Simples Nacional PR — Dec. 8.660/2018 (`icms-pr-regras.ts`)
- **Impacto**: Mensalmente o analista fiscal do escritório precisa calcular a redução da alíquota do ICMS do Paraná para lançar no PGDAS-D. O backend já calcula o percentual de redução exato (`percentualReducaoPgdasPct`), mas o valor não é exibido em nenhuma tela operacional.
- **Ação**: Exibir o card de "Fechamento Mensal PGDAS-D" na ficha da empresa e na análise de notas fiscais do Simples.

### 5. Memória de Reconstituição da Base Dupla do DIFAL (`difal-pr.ts`)
- **Impacto**: A reconstituição da base dupla e o divisor `(1 - AliqTotal)` são os pontos mais questionados por clientes e auditores. O backend calcula todas as variáveis passo a passo, mas a tela resume tudo em uma badge de 10px, forçando o operador a baixar um relatório HTML externo para auditar a memória.
- **Ação**: Inserir o botão expansível de 1 clique "Ver Memória de Base Dupla" na linha do item (Nível Sênior sob demanda).

---

## 7. Recomendações de Arquitetura Visual para as Sub-etapas 20.2 e 20.3

Para que a prototipação rápida via **Google Stitch MCP** (Sub-etapa 20.2) e a implementação de componentes em código (Sub-etapa 20.3) resolvam definitivamente esses gargalos, devem ser seguidas as seguintes diretrizes arquiteturais:

1. **Adoção Rígida da Matriz de Divulgação Progressiva**:
   - **`gerencial`**: Exibir apenas 4 KPIs macro (Total da Nota, Custo Efetivo Real, Total de Débitos a Recolher, Veredito de Risco) + 1 CTA Primário. Nenhuma fundamentação legal aberta por padrão.
   - **`operacional` (padrão de bancada)**: Tabela enxuta contendo no máximo 7 colunas visíveis essenciais (`Item/Código`, `Descrição`, `NCM + Siscomex`, `Valor Total`, `Tributos/DIFAL`, `Status Semáforo`, `Ações`). Os detalhes fiscais devem abrir em **Drawer Lateral deslizante** ou linha sanfonada, sem nunca forçar o usuário a sair da tela.
   - **`senior` (pericial sob demanda)**: Todos os blocos normativos (citações de decretos, artigos, consultas da SEFA/PR, memórias de cálculo completas, matriz de paridade e códigos EFD) devem ser acessíveis mediante controle de 1 clique ("Expandir Base Legal", "Ver Memória de Cálculo"), sem poluir a visão padrão.
2. **Implementação da Barra de Ações Persistente (*Sticky Action Bar*)**:
   - Fixar uma barra inferior no rodapé da viewport com o resumo de itens selecionados e **apenas 1 CTA Primário Sólido** em destaque por fase de operação, eliminando a hesitação entre botões concorrentes.
3. **Resgate de Dados Ocultos nos Componentes de Drawer**:
   - Alimentar os componentes `ItemDetailDrawer` e `LegalCitationBlock` com os campos hoje descartados (`memoriaCalculo`, `baseCalculoDifal`, `codigoAjusteEfd`, `percentualReducaoPgdasPct`, `sha256Xml` e `paridadeRtc`).
4. **Tipografia Tabular para Todos os Números**:
   - Aplicar estritamente `font-variant-numeric: tabular-nums` e alinhamento à direita em todas as colunas de moeda, alíquota e códigos fiscais.

---
*Fim do Relatório de Inventário Técnico de Backend vs. UI — Analista Fiscal Portela v6.0.0*
