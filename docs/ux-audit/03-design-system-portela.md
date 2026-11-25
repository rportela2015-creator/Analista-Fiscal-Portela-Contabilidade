# Design System Portela & Arquitetura de 3 Níveis Operacionais
**Documento de Especificação Técnica — Sub-etapa 20.1 (Fase 1 do Ciclo 7)**
*Analista Fiscal Portela v6.0.0 — Contabilidade Portela (Desde 1970)*
*Data de Especificação: 23 de Novembro de 2026*
*Responsável Técnico: Arquiteto de Produto B2B, Lead UI/UX Engineer & Especialista Fiscal*

---

## 1. Fundamentos & Identidade B2B Contábil Portela

### 1.1 Contexto e Herança Institucional
A **Contabilidade Portela**, atuante desde 1970, construiu sua reputação com base em rigor contábil, segurança patrimonial de seus clientes e conformidade fiscal absoluta. O **Analista Fiscal Portela v6.0.0** é a materialização tecnológica dessa herança: uma suíte operacional bitemporal que une a soberania de processamento local (*Local-First* na GPU RX 580 com Ollama) à velocidade em nuvem (Google Gemini 3.8 Flash), cobrindo desde a decodificação imediata de 10.515 códigos NCM do Siscomex até o cálculo de alta precisão do ICMS/PR (RICMS/PR Dec. 7.871/2017) e a transição da Reforma Tributária (Emenda Constitucional 132/2023 e LC 214/2025 - IBS/CBS/IS).

A operação de uma bancada fiscal contemporânea, no entanto, opera sob forte pressão temporal (fechamento de competências, apurações de SPED EFD-ICMS/IPI, emissão de guias de DIFAL e GNRE). O estresse operacional amplifica erros humanos quando a interface do sistema apresenta ruído cognitivo, tipografia instável ou dispersão de ações.

### 1.2 Filosofia de Design: *Zero Cognitive Clutter* & Precisão Pericial
Para responder a essas demandas, o **Design System Portela** foi desenvolvido sob quatro pilares inegociáveis:
1. **Precisão Cirúrgica e Redundância Semântica Tripla**: O status de um tributo ou crédito jamais pode depender exclusivamente de uma cor. A sinalização deve combinar **Cor + Ícone SVG Específico + Rótulo Textual Explícito**, assegurando legibilidade inequívoca e conformidade estrita com as diretrizes de acessibilidade WCAG 2.1 AA.
2. **Eliminação de Ruído Cognitivo (*Zero Cognitive Clutter*)**: Informações secundárias e fundamentações normativas profundas não devem competir pela atenção visual de quem está apenas conferindo se uma nota fiscal pode ser liberada. O detalhe existe, está íntegro no backend e pronto para ser acessado em 1 clique, mas não polui a esteira principal.
3. **Consistência Numérica e Alinhamento Decimal**: Números fiscais (valores contábeis em BRL, alíquotas com casas decimais, códigos NCM de 8 dígitos, CFOPs de 4 dígitos, CSTs e chaves criptográficas SHA-256) devem ter largura fixa de glifo (`font-variant-numeric: tabular-nums`). Nunca um caractere '1' pode ter largura menor que '8', evitando o "efeito zigue-zague" nas colunas financeiras.
4. **Hierarquia de Ações com CTA Único por Estado**: A tela deve guiar o operador. Em qualquer instante, deve existir **exatamente um botão primário sólido** em destaque (Sticky Action Bar), eliminando hesitações entre opções concorrentes.

---

## 2. Tokens Visuais do Design System (Design Tokens)

Os tokens do Design System Portela foram harmonizados utilizando a metodologia de design para aplicações corporativas densas (`@ui-ux-pro-max` com *Design Dial* de densidade 9/10 e `@building-data-apps` no padrão Zinc/Slate).

### 2.1 Paleta Semântica e Superfícies

A paleta prioriza seriedade corporativa (*Trust & Authority*), utilizando tons de azul-marinho profundo (*Navy*), ardósia (*Slate*) e verde floresta institucional, contrastados com fundos assépticos e limpos.

```css
:root {
  /* Marca e Identidade Institucional Portela */
  --portela-brand-navy: #0F172A;       /* Slate 900 - Solidez e autoridade */
  --portela-brand-blue: #0B3D91;       /* Azul tradicional Portela */
  --portela-brand-blue-hover: #0E5CC4; /* Realce de interação */
  --portela-brand-forest: #14532D;     /* Verde institucional floresta */
  --portela-brand-forest-hover: #166534;
  --portela-brand-cta: #0369A1;        /* Azul de Ação Primária (Sky 700) */
  --portela-brand-cta-hover: #0284C7;  /* Sky 600 */

  /* Superfícies e Estrutura - Light Mode (Padrão) */
  --surface-canvas: #F8FAFC;           /* Fundo principal da aplicação (Slate 50) */
  --surface-card: #FFFFFF;             /* Cartões, tabelas e painéis */
  --surface-subtle: #F1F5F9;           /* Cabeçalhos de tabela, zebra striping */
  --surface-panel: #EDF2F7;            /* Painéis de destaque suave */
  --border-subtle: #E2E8F0;            /* Divisores de linha (Slate 200) */
  --border-strong: #CBD5E1;            /* Contornos de inputs e cards ativos */
  --ring-focus: rgba(11, 61, 145, 0.4);/* Foco de acessibilidade teclado */

  /* Tipografia e Contraste de Texto */
  --text-primary: #0F172A;             /* Texto principal (Slate 900 - Contraste 13.5:1) */
  --text-secondary: #475569;           /* Rótulos e metadados (Slate 600 - Contraste 5.2:1) */
  --text-muted: #64748B;               /* Dicas secundárias (Slate 500 - Contraste 4.6:1) */
  --text-on-dark: #F8FAFC;             /* Texto sobre fundos sólidos */
}

/* Modo Noturno / Dark Mode Especializado para Perícia Fiscal */
[data-theme="dark"] {
  --surface-canvas: #090D16;           /* Fundo profundo antirreflexo */
  --surface-card: #0F172A;             /* Cards em Slate 900 */
  --surface-subtle: #1E293B;           /* Slate 800 */
  --surface-panel: #1A2234;
  --border-subtle: #334155;            /* Slate 700 */
  --border-strong: #475569;            /* Slate 600 */
  --ring-focus: rgba(56, 189, 248, 0.5);

  --text-primary: #F8FAFC;             /* Slate 50 */
  --text-secondary: #CBD5E1;           /* Slate 300 */
  --text-muted: #94A3B8;               /* Slate 400 */
}
```

### 2.2 Semáforo Fiscal Triplo Obrigatório (Acessibilidade WCAG 2.1 AA)

É estritamente vedada a apresentação de status fiscal apoiada unicamente em cores. Todo estado fiscal no Analista Fiscal Portela deve compor a trinca:
`[ COR COM CONTRASTE >= 4.5:1 ] + [ ÍCONE SVG VETORIAL ] + [ RÓTULO TEXTUAL EXPLÍCITO ]`

| Sinalizador | Significado Fiscal | Tokens Light Mode | Tokens Dark Mode | Ícone SVG Obrigatório (Lucide/Phosphor) | Rótulo Textual Padrão |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vermelho**<br>*(Risco Alto)* | Glosa fiscal iminente, alíquota divergente, NCM inexistente na tabela oficial do Siscomex, infração ao RICMS/PR ou retenção de crédito por falta de quitação no fornecedor. | **Bg:** `#FEF2F2`<br>**Border:** `#F87171`<br>**Text:** `#991B1B` | **Bg:** `rgba(69,10,10,0.35)`<br>**Border:** `#EF4444`<br>**Text:** `#FCA5A5` | `AlertTriangle`<br>ou `ShieldAlert` | `GLOSA FISCAL`<br>`NCM INEXISTENTE`<br>`RISCO ALTO` |
| **Amarelo**<br>*(Atenção)* | Diferimento parcial (Art. 28 RICMS/PR), necessidade de conferência de MVA ajustada, crédito condicionado ou transição da Reforma (IBS/CBS em alíquota teste). | **Bg:** `#FFFBEB`<br>**Border:** `#FBBF24`<br>**Text:** `#92400E` | **Bg:** `rgba(69,26,3,0.35)`<br>**Border:** `#F59E0B`<br>**Text:** `#FDE68A` | `AlertCircle`<br>ou `HelpCircle` | `ATENÇÃO`<br>`DIFERIMENTO`<br>`REQUER CONFERÊNCIA` |
| **Verde**<br>*(Regular)* | Classificação homologada no Siscomex, crédito fiscal autorizado (Art. 47 LC 214/2025 via Split Payment), conformidade de alíquota e CFOP regular. | **Bg:** `#ECFDF5`<br>**Border:** `#34D399`<br>**Text:** `#065F46` | **Bg:** `rgba(2,44,34,0.35)`<br>**Border:** `#10B981`<br>**Text:** `#A7F3D0` | `CheckCircle2`<br>ou `ShieldCheck` | `REGULAR`<br>`CRÉDITO HOMOLOGADO`<br>`CONFORME SISCOMEX` |
| **Azul**<br>*(Informativo)* | Base legal correlata, solução de consulta vinculada, memória de cálculo com base dupla, código de ajuste na EFD ou paridade com motor oficial RFB. | **Bg:** `#EFF6FF`<br>**Border:** `#60A5FA`<br>**Text:** `#1E40AF` | **Bg:** `rgba(23,37,84,0.35)`<br>**Border:** `#3B82F6`<br>**Text:** `#BFDBFE` | `BookOpen`<br>ou `Scale` | `BASE LEGAL`<br>`PARIDADE RFB`<br>`INFORMATIVO` |

### 2.3 Escala Tipográfica & Regra Estrita de *Tabular Numbers*

A tipografia do sistema é dividida em duas famílias funcionais:
- **Família de Leitura e Interface (Sans-Serif)**: `Plus Jakarta Sans`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`. Otimizada para alta legibilidade de títulos, seções e descrições mercadológicas de notas fiscais.
- **Família Numérica e Pericial (Monospace)**: `JetBrains Mono`, `Fira Code`, `ui-monospace`, `Menlo`, `monospace`. Utilizada para chaves de acesso, hashes SHA-256 de lotes, códigos de 8 dígitos NCM, CFOP, CST e tabelas de apuração.

#### Regra Mandatória: `tabular-nums`
Para evitar oscilações visuais nas tabelas e cards de KPIs, todos os elementos contendo moeda (`R$`), percentuais (`%`), datas (`dd/mm/aaaa`), quantidades e códigos fiscais **devem** aplicar as seguintes propriedades CSS:

```css
.fiscal-number,
.tabular-nums,
table.fiscal-grid td.num,
.kpi-value {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-variant-numeric: tabular-nums lining-nums;
  -moz-font-feature-settings: "tnum" 1, "lnum" 1;
  -webkit-font-feature-settings: "tnum" 1, "lnum" 1;
  font-feature-settings: "tnum" 1, "lnum" 1;
  text-align: right;
}
```

#### Tabela de Escala Tipográfica

| Nível Hierárquico | Tamanho (px / rem) | Peso (Weight) | Entrelinha (Line Height) | Aplicação Fiscal |
| :--- | :--- | :--- | :--- | :--- |
| **Display / H1** | `24px` / `1.5rem` | `700` (Bold) | `1.25` | Título da Aba e Identificação de Empresa Ativa |
| **Heading / H2** | `18px` / `1.125rem` | `600` (Semi-bold) | `1.3` | Títulos de Seções e Painéis (ex: "Resultado da Orquestração") |
| **Subheading / H3** | `14px` / `0.875rem` | `600` (Semi-bold) | `1.35` | Títulos de Cards de Indicadores e Grupos de Itens |
| **Body (Padrão)** | `13px` / `0.8125rem` | `400` (Regular) | `1.5` | Descrições de mercadorias, pareceres e textos explicativos |
| **Body Small / Hint**| `11.5px` / `0.72rem` | `400` / `500` | `1.4` | Dicas de campo, fundamentos legais resumidos e subtítulos |
| **Data / Numbers** | `13px` / `0.8125rem` | `600` (Semi-bold) | `1.2` | Valores de itens em tabelas, alíquotas e base de cálculo |
| **Data Large (KPI)**| `22px` / `1.375rem` | `700` (Bold) | `1.1` | Valores principais dos cards de indicadores (KpiStrip) |
| **Micro Badge / Tag**| `10.5px` / `0.65rem`| `700` (Bold) | `1.0` | Badges de CST, CFOP, NCM e Semáforo Fiscal |

### 2.4 Grade de Espaçamento & Densidade Operacional (Density 9/10)

Para manter a densidade informacional sem gerar sufocamento visual, o sistema adota uma grade base de `4px`:

- **Espaçamento Micro (4px - `--space-1`)**: Gaps internos entre ícone e texto de badges, alinhamento fino de tags fiscais.
- **Espaçamento Compacto (8px - `--space-2`)**: Padding vertical de células de tabela, espaçamento entre inputs e seus rótulos, gap de botões agrupados.
- **Espaçamento Padrão Interno (12px - `--space-3`)**: Padding horizontal de células de tabela, padding interno de cards de itens e caixas de alerta.
- **Espaçamento Médio (16px - `--space-4`)**: Padding de cartões de KPI, gap entre colunas de grids de formulário.
- **Espaçamento Macro (20px/24px - `--space-5 / --space-6`)**: Margem entre seções operacionais distintas (ex: entre os KPIs e a Tabela de Itens).
- **Sticky Offset (64px)**: Reserva de margem inferior no container principal (`padding-bottom: 72px`) para impedir que a `StickyActionBar` sobreponha dados da tabela.

---

## 3. Hierarquia de Ações & Sticky Action Bar

### 3.1 O Problema da Dispersão de Ações em Lotes Fiscais
A auditoria visual realizada nas telas atuais revelou que, em notas fiscais com 20 a 100 itens, os botões decisórios ficavam posicionados após centenas de linhas de tabela. O operador precisava rolar a tela repetidas vezes para executar a auditoria ou transmitir para o ERP. Além disso, existiam múltiplos botões com o mesmo peso visual competindo entre si (`Auditar Documento`, `Executar Orquestração Completa`, `Auditar Selecionados`).

### 3.2 Especificação da Barra de Ações Fixa (*Sticky Action Bar*)

A **Sticky Action Bar** é uma barra persistente ancorada no rodapé inferior da viewport (`fixed bottom-0 left-0 right-0 z-40`), garantindo que o operador tenha sempre ao alcance dos olhos:
1. O resumo quantitativo do estado atual (itens selecionados, valor total, glosas detectadas).
2. **Exatamente 1 Botão Primário Sólido (CTA Único)** correspondente à fase em que a nota se encontra.
3. Ações secundárias discretas estilizadas como botões outline ou ghost.

```
+----------------------------------------------------------------------------------------------------+
|  [Status Badge: 14 Itens Selecionados | Total: R$ 42.150,00 | 2 Glosas ]       (Ações Secundárias)  [CTA PRIMÁRIO SÓLIDO] |
+----------------------------------------------------------------------------------------------------+
```

### 3.3 Comportamento e CTA Primário nos 4 Estados Fundamentais

| Estado da Tela | Condição de Ativação | CTA Primário Sólido (Único) | Ações Secundárias Permitidas (Ghost / Outline) | Informação de Apoio à Esquerda |
| :--- | :--- | :--- | :--- | :--- |
| **1. Vazio**<br>*(Empty State)* | Nenhum documento importado na sessão. | **"Selecionar Arquivo Fiscal"**<br>*(Gera abertura de file picker)* | • "Importar por Chave de Acesso (44 dígitos)"<br>• "Carregar Exemplo Demonstrativo" | "Nenhum documento carregado no momento." |
| **2. Extraído / Em Triagem**<br>*(Staged / Ingested)* | XML ou DANFE processado pelo extrator determinístico imediato (<200ms). | **"Auditar Itens Selecionados"**<br>*(Dispara motor de IA/Orquestrador DAG)* | • "Selecionar Apenas Sensíveis"<br>• "Marcar Todos / Limpar"<br>• "Exportar Prévia CSV"<br>• "Carregar Outro Arquivo" | `N de M itens selecionados (R$ X,XX) · Y itens sensíveis` |
| **3. Auditado / Concluído**<br>*(Audited / Validated)* | Parecer pericial concluído; glosas e créditos calculados. | **"Salvar e Sincronizar ERP"**<br>*(Injeta parâmetros fiscais no cadastro)* | • "Emitir Laudo Pericial Formal (PDF)"<br>• "Simular Precificação dos Itens"<br>• "Copiar XML Ajustado"<br>• "Revisar Glosas" | `Auditoria Concluída: X regulares, Y glosas (R$ Z em risco)` |
| **4. NFS-e / Serviços**<br>*(DANFSe / RTC)* | Arquivo processado correspondente a RPS, NFS-e ou DANFSe. | **"Processar Retenções & Tomador"**<br>*(Aplica LC 116 e regras IBS/CBS)* | • "Exportar Guia de Retenção Municipal"<br>• "Validar Município Prestador"<br>• "Ver Parecer Tributário" | `Tomador e Prestador mapeados · R$ X de ISS retido` |

---

## 4. Matriz de Divulgação Progressiva (3 Níveis Operacionais)

A grande inovação de usabilidade do Analista Fiscal Portela é a **Divulgação Progressiva em 3 Níveis Operacionais**, desenhada para atender desde o sócio-diretor até o perito tributário sem exigir três sistemas diferentes.

### 4.1 Arquitetura dos Níveis Operacionais

```
                         +-----------------------------------+
                         |    NIVEL OPERACIONAL GLOBAL       |
                         |  [ Gerencial | Operacional* | Sênior ]|
                         +-----------------+-----------------+
                                           |
         +---------------------------------+---------------------------------+
         |                                 |                                 |
         v                                 v                                 v
+------------------+             +--------------------+            +-------------------+
| NÍVEL 1:         |             | NÍVEL 2:           |            | NÍVEL 3:          |
| GERENCIAL        |             | OPERACIONAL        |            | SÊNIOR / PERICIAL |
+------------------+             +--------------------+            +-------------------+
| • 4 KPIs Macro   |             | • Mini-KPIs Topo   |            | • Tudo do Nível 2 |
| • Semáforo Risco |             | • Tabela Enxuta    |            | • RICMS/PR, LC 214|
| • Veredito Puro  |             |   (6-7 colunas)    |            | • Base Dupla      |
| • 1 CTA Decisório|             | • ItemDetailDrawer |            | • HALF_EVEN       |
| • ZERO Leis/Mem. |             | • Sticky Action Bar|            | • Crédito 3 Níveis|
+--------+---------+             +---------+----------+            | • EFD, GR-PR, Hash|
         |                                 |                       +---------+---------+
         |                                 |                                 |
         +---------------------------------+---------------------------------+
                                           |
                                           v
                  +-------------------------------------------------+
                  |      REGRA DE EXPANSÃO SOB DEMANDA (1 CLIQUE)   |
                  | [Ver Memória de Cálculo] | [Ver Base Normativa] |
                  |    -> Abre Gaveta Lateral sem mudar o Modo Global |
                  +-------------------------------------------------+
```

---

### 4.2 Nível 1 — Gerencial (Executive / Director / Sócio-Administrador)

- **Público-Alvo**: Sócios, Diretores Financeiros, Gestores de Contabilidade e Tomadores de Decisão.
- **Objetivo**: Avaliar em menos de 5 segundos se a operação fiscal é segura, qual é o impacto no fluxo de caixa e se o pagamento da nota fiscal ao fornecedor deve ser autorizado ou retido.
- **Densidade**: Mínima, sintética, sem jargões fiscais herméticos ou memórias de cálculo expostas.
- **Elementos Visíveis na Interface**:
  1. **Faixa de 4 KPIs de Veredito Executivo**:
     - **Card 1: Posição Fiscal do Lote**: Índice global de conformidade (ex: `92.4% Conforme · Baixo Risco`).
     - **Card 2: Exceções Críticas**: Quantidade de inconformidades que geram auto de infração (ex: `2 Itens com Glosa Fiscal`).
     - **Card 3: Impacto Financeiro Líquido**: Risco financeiro de autuação vs. Crédito fiscal aproveitável (ex: `Risco: R$ 3.420,00 | Crédito Válido: R$ 18.250,00`).
     - **Card 4: Ação Imediata Recomendada**: Recomendação prática em 1 linha (ex: `Liberar pagamento retendo R$ 3.420,00 até correção de NCM pelo fornecedor`).
  2. **Barra Consolidada de Semáforo de Risco**: Gráfico horizontal segmentado (Verde / Amarelo / Vermelho) demonstrando a proporção de itens em cada faixa.
  3. **CTA Primário Gerencial Único**: `"Autorizar e Gerar Dossiê Gerencial"` ou `"Exportar Relatório para Diretoria"`.
  4. **Restrição Mandatória**: Nenhuma citação legal (Artigos de Decretos, Convênios CONFAZ ou Leis Complementares) ou memória de cálculo decimal é exibida por padrão.

---

### 4.3 Nível 2 — Operacional (Analista Pleno / Padrão do Sistema)

- **Público-Alvo**: Analistas Fiscais, Assistentes Contábeis, Faturistas e Operadores de ERP.
- **Objetivo**: Executar a conferência diária dos itens da nota com agilidade máxima, saneando divergências sem perder tempo com dados periféricos.
- **Densidade**: Média/Alta balanceada.
- **Elementos Visíveis na Interface**:
  1. **Faixa Compacta de Mini-KPIs**: Resumo do lote no topo (Itens Totais, Itens Sensíveis, Valor Total da Nota, ICMS Próprio Destacado).
  2. **Tabela Enxuta de 6 a 7 Colunas**:
     - Coluna 1: `[x]` (Checkbox de Seleção com Master Checkbox).
     - Coluna 2: `# / Código` (Número ordinal e código do produto no fornecedor).
     - Coluna 3: `Descrição do Produto` (Nome comercial com destaque visual para termos críticos).
     - Coluna 4: `NCM Siscomex` (Código formatado `0000.00.00` + Selo de Validade Siscomex O(1)).
     - Coluna 5: `CFOP / CST` (Códigos de entrada sugeridos pelo motor).
     - Coluna 6: `Valor Total` (Valor monetário formatado com `tabular-nums` alinhado à direita).
     - Coluna 7: `Status Fiscal & Inspeção` (Badge do Semáforo Triplo + Botão `"Inspecionar"` para abrir a gaveta).
  3. **Ocultação de Colunas Secundárias**: Colunas como PIS, COFINS, IPI, MVA original, MVA ajustada, Base Dupla do DIFAL e Alíquotas de IBS/CBS ficam recolhidas por padrão e podem ser ativadas pelo menu *"Gerenciar Colunas"* ou visualizadas na gaveta lateral.
  4. **ItemDetailDrawer Lateral Retrátil**: Ao clicar em uma linha ou no botão *"Inspecionar"*, uma gaveta lateral desliza à direita da tela (ocupando 480px a 540px), permitindo inspecionar todos os detalhes técnicos do item selecionado sem sair da tela nem perder a paginação da tabela.

---

### 4.4 Nível 3 — Sênior / Pericial (Auditor Fiscal / Sócio Contábil)

- **Público-Alvo**: Auditores Fiscais, Peritos Judiciais Tributários, Advogados Tributaristas e Sócios Responsáveis Técnicos.
- **Objetivo**: Auditoria exaustiva, fundamentação jurídica irrevogável para defesa em fiscalizações da SEFA/PR ou RFB e validação matemática de centavos em arredondamento bancário.
- **Densidade**: Máxima pericial (exposição total de memória de cálculo e embasamento).
- **Elementos Visíveis na Interface**:
  1. **Tudo do Nível Operacional**, mantendo a estrutura da tabela e da gaveta.
  2. **Blocos de Fundamentação Normativa Completa (`LegalCitationBlock`)**:
     - Citação explícita dos artigos do Regulamento do ICMS do Paraná (RICMS/PR - Decreto Estadual nº 7.871/2017):
       - Art. 28: Diferimento Parcial de ICMS no Paraná.
       - Anexo IX: Regras estritas de Substituição Tributária por NCM e MVA.
       - Anexo VI: Estorno proporcional de crédito e créditos presumidos.
     - Citação das normas da Reforma Tributária:
       - LC 214/2025: Classificação `cClassTrib`, regimes diferenciados e alíquotas de transição (IBS 0,1% / CBS 0,9%).
       - Artigo 47 da LC 214/2025: Extinção de débito do fornecedor via *Split Payment* como pré-requisito de apropriação de créditos de IBS/CBS.
     - Aplicação formal das Regras Gerais de Interpretação do Sistema Harmonizado (RGI 1 a 6) e Notas Explicativas da NESH (IN RFB nº 2.169/2023).
     - Pareceres vinculantes: Soluções de Consulta COSIT/DISIT da RFB e Consultas Tributárias da SEFA/PR (ex: Consulta 48/2026 sobre trava do Decreto 12.828/2026).
  3. **Memória de Cálculo Decimal Detalhada**:
     - Exibição de fórmulas passo a passo: Base Dupla do DIFAL no Paraná:
       $$\text{Base 1} = \frac{V_{\text{prod}} + \text{Frete} - \text{ICMS Origem}}{1 - \text{Aliq Destino}}$$
     - Precisão decimal arbitrária via `Decimal.js` com arredondamento estrito `ROUND_HALF_EVEN` (Banqueiro).
     - Segregação mandatória de ICMS Próprio, ICMS-ST e FECOP Paraná (Fundo de Combate à Pobreza - recolhimento em guia apartada GNRE).
     - Matriz de Crédito em 3 Camadas da Reforma: Extinto por Split Payment, Extinto por Pagamento Convencional ou Suspenso/Aguardando Extinção.
     - Códigos fiscais de escrituração: Tabela 5.1.1 EFD-ICMS/IPI, Registro C100/C170/C190 e código de recolhimento na GR-PR (Receita Estadual).
     - Hash SHA-256 de integridade criptográfica da auditoria do lote para arquivo pericial.

---

### 4.5 Regra de Expansão Sob Demanda (Micro-Divulgação em 1 Clique)

A mudança de nível operacional global afeta a tela inteira. No entanto, o fluxo de trabalho real exige flexibilidade: um diretor no Nível Gerencial pode querer investigar o motivo de uma glosa específica de R$ 8.000,00 sem precisar transformar toda a interface executiva em um mar de tabelas técnicas.

**Regra de Ouro da Micro-Divulgação**:
> Em qualquer nível operacional (`gerencial` ou `operacional`), todo card de risco, alerta fiscal ou linha da tabela de itens **DEVE** possuir um controle explícito de 1 clique (`"Ver memória de cálculo"`, `"Ver base normativa"`, `"Expandir perícia"`).
>
> Ao acionar esse controle, o sistema **NÃO altera o nível operacional global**. Em vez disso, projeta instantaneamente a gaveta lateral (`ItemDetailDrawer`) ou um modal de foco centrado especificamente naquele item, exibindo a fundamentação sênior/pericial completa daquele ponto.
> Ao fechar a gaveta (`Esc` ou clique fora), o usuário retorna ao seu nível operacional original com zero perda de estado ou scroll.

---

### 4.6 Matriz Comparativa Cruzada dos 3 Níveis Operacionais

| Componente / Recurso | Nível 1: Gerencial | Nível 2: Operacional (Padrão) | Nível 3: Sênior / Pericial | Expansão Sob Demanda |
| :--- | :--- | :--- | :--- | :--- |
| **KPIs de Topo** | 4 KPIs Sintéticos de Veredito Executivo | Faixa compacta (4 mini-cards densos) | Faixa completa com detalhes de segregação | Presente no Nível 1 e 2 |
| **Tabela de Itens** | Oculta (apenas resumo e lista de exceções) | Visível (6 a 7 colunas prioritárias) | Visível (colunas expandidas + colunas fiscais) | N/A |
| **Colunas Secundárias** | Inacessíveis na tabela | Ocultas (acessíveis via Drawer) | Visíveis ou facilmente ativadas | Visualização imediata no Drawer |
| **Gaveta de Inspeção (Drawer)**| Abre somente via clique em exceção | Abre ao clicar em qualquer linha | Aberta ou fixável em split view | Abre em qualquer nível |
| **Fundamentação Legal** | Oculta | Oculta por padrão (acessível no Drawer) | **Exibida aberta por padrão** | Abre via `[Ver Base Legal]` |
| **Memória Base Dupla / ST** | Oculta | Resumo numérico no Drawer | **Fórmula matemática expandida** | Abre via `[Ver Cálculo]` |
| **Créditos 3 Camadas LC 214**| Apenas valor financeiro líquido | Status resumido por item | **Segregação detalhada (Split vs Retido)**| Abre via `[Ver Créditos]` |
| **Códigos EFD / GR-PR** | Ocultos | Disponíveis para envio via ERP | **Exibidos com código de ajuste EFD 5.1.1** | Visível na aba ERP do Drawer |
| **Hash SHA-256 do Lote** | Oculto | Oculto | **Visível com botão de cópia rápida** | Visível no rodapé do Drawer |

---

## 5. Mapeamento dos 3 Níveis nas Abas Críticas do Sistema

### 5.1 Aplicação na Aba 5: Auditoria de Entrada (NF-e/DANFE)

#### Estado: Extraído / Pós-Orquestração DAG
1. **No Modo Gerencial**:
   - Exibe o cabeçalho corporativo da empresa ativa (CNPJ, UF, Regime).
   - Apresenta os 4 KPIs: `Conformidade Geral (Ex: 88%)`, `3 Itens com Glosa`, `R$ 4.250 em Risco Fiscal`, `Recomendação: Reter pagamento de R$ 4.250`.
   - Exibe lista resumida apenas dos 3 itens com problema com botão `[Entender Risco]`.
   - CTA Primário: `"Aprovar Itens Regulares (R$ 38.100,00)"`.
2. **No Modo Operacional (Default)**:
   - Apresenta mini-faixa superior: `Total NF: R$ 42.350 | 18 Itens | 3 Sensíveis | 0 NCMs Inexistentes`.
   - Renderiza a **Tabela Enxuta de 7 Colunas**:
     `[Checkbox] | [#] | [Descrição do Produto] | [NCM Siscomex + Selo] | [CFOP / CST Entrada] | [Valor Total (tabular-nums)] | [Semáforo + Inspecionar]`.
   - Ao clicar na linha 4, abre o `ItemDetailDrawer` lateral direito mostrando: tributos destacados, diagnóstico DIFAL, cálculo de entrada no Paraná e destinação (`Revenda`, `Industrialização`, `Uso/Consumo`).
   - Sticky Action Bar exibe: `18 itens selecionados | R$ 42.350,00` e o CTA Primário Sólido: `"Auditar 18 Itens via Motor Local"`.
3. **No Modo Sênior / Pericial**:
   - Mantém a tabela operacional ativa.
   - Abaixo ou acoplado à tabela, projeta o painel `OrquestradorFiscalDag`:
     - Bloco RFB RTC: Status da paridade com o motor oficial da Receita Federal.
     - Bloco ICMS/PR v5.0.0: Diferimento parcial (Art. 28), alíquota interna PR (19,5%), MVA ajustada com fórmula completa.
     - Bloco Créditos Art. 47 LC 214/2025: Detalhamento do status de extinção no fornecedor (*Split Payment* extinto vs débito em aberto).
     - Hash criptográfico SHA-256 do payload auditado com timestamp UTC.

---

### 5.2 Aplicação na Aba 6: Precificação & Margens (Dual-Stack 2027)

#### Cenário: Formação de Preço de Venda com ICMS/PR + IBS/CBS e CPC 16
1. **No Modo Gerencial**:
   - Exibe os KPIs de formação de preço: `Preço de Venda Sugerido (R$ 145,00)`, `Margem Líquida Real (18,4%)`, `Custo Tributário Total (31,2%)`, `Regime Mais Vantajoso (Lucro Real)`.
   - Gráfico sintético comparando o preço final nos 4 regimes (Simples, Presumido, Real, Arbitrado).
   - CTA Primário: `"Exportar Tabela de Preços Aprovada"`.
2. **No Modo Operacional (Default)**:
   - Formulário compacto de premissas (Markup alvo, Frete, UF Origem/Destino).
   - Tabela de composição de custos: Custo de Aquisição Real (CPC 16), deduções de créditos fiscais e impostos sobre a venda.
   - Gaveta lateral permitindo alternar simulações rápidas de frete ou margem sem recarregar a tela.
   - Sticky Action Bar com CTA Primário: `"Salvar Parâmetros de Precificação"`.
3. **No Modo Sênior / Pericial**:
   - Visualização expandida da simulação **Dual-Stack 2027**:
     - Memória de cálculo simultânea do regime legado (PIS/COFINS cumulativo/não-cumulativo + ICMS PR com estorno proporcional Anexo VI) lado a lado com a Reforma Tributária (CBS 0,9% + IBS 0,1% com não-cumulatividade plena).
     - Simulação de Custo Aterrissado na Mesa de Compras PR: comparativo entre fornecedor interno do PR vs fornecedor de SP/SC considerando DIFAL Base Dupla e créditos de entrada.
     - Radar de Combustíveis Ad Rem (Lei Complementar 192/2022 - tributação monofásica por litro).

---

## 6. Contratos de Tipos e Assinaturas TypeScript dos Componentes Reutilizáveis (Sub-etapa 20.3)

Abaixo estão formalizadas as interfaces e assinaturas estritas dos **6 componentes fundamentais** que comporão a biblioteca de interface do sistema na Sub-etapa 20.3.

```typescript
/**
 * @file /components/design-system/types.ts
 * Contratos de tipos e interfaces fundamentais do Design System Portela v6.0.0
 */

export type NivelOperacional = 'gerencial' | 'operacional' | 'senior';

export type FiscalTrafficLightStatus = 'danger' | 'warning' | 'success' | 'info';

export interface FiscalStatusInfo {
  status: FiscalTrafficLightStatus;
  label: string;
  code?: string;
  description?: string;
}

/* =========================================================================
 * 1. NivelOperacionalSwitcher
 * Alternador global de nível de divulgação progressiva com persistência
 * ========================================================================= */
export interface NivelOperacionalOption {
  id: NivelOperacional;
  label: string;
  badge: string;
  hint: string;
  iconName: 'LayoutDashboard' | 'SlidersHorizontal' | 'Scale';
}

export interface NivelOperacionalSwitcherProps {
  /** Nível operacional atualmente ativo no estado da aplicação */
  currentLevel: NivelOperacional;
  /** Callback disparado na troca de nível */
  onLevelChange: (level: NivelOperacional) => void;
  /** Chave de persistência no localStorage/sessionStorage (default: 'portela_nivel_operacional') */
  storageKey?: string;
  /** Tamanho do controle visual */
  size?: 'sm' | 'md' | 'lg';
  /** Se o switcher está desabilitado (ex: durante processamento assíncrono) */
  disabled?: boolean;
  /** Classe CSS customizada adicional */
  className?: string;
}

/* =========================================================================
 * 2. StickyActionBar
 * Barra de ação persistente ancorada no rodapé da viewport
 * ========================================================================= */
export interface ActionSummaryData {
  itemCount: number;
  totalValueBrl?: number;
  selectedCount?: number;
  riskCount?: number;
  warningCount?: number;
  regularCount?: number;
}

export interface StickyActionBarProps {
  /** Estado de tela ativo para determinação das ações primárias */
  screenState: 'empty' | 'staged' | 'audited' | 'nfse';
  /** Resumo quantitativo para o slot esquerdo */
  summary?: ActionSummaryData;
  /** Configuração do CTA Primário Sólido Obrigatório (Exatamente 1) */
  primaryAction: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    loading?: boolean;
    loadingText?: string;
    disabled?: boolean;
    title?: string;
  };
  /** Ações secundárias opcionais (estilizadas como ghost / outline) */
  secondaryActions?: Array<{
    id: string;
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    title?: string;
    variant?: 'ghost' | 'outline' | 'destructive-ghost';
  }>;
  /** Mensagem ou badge contextual extra (ex: 'Soberania Local-First RX 580') */
  contextBadge?: React.ReactNode;
  /** Se a barra deve ser oculta condicionalmente */
  visible?: boolean;
}

/* =========================================================================
 * 3. ProgressiveSection
 * Seção com visibilidade controlada por nível e suporte à expansão sob demanda
 * ========================================================================= */
export interface ProgressiveSectionProps {
  /** Identificador único da seção para acessibilidade e âncora */
  id: string;
  /** Nível mínimo necessário para exibição padrão da seção */
  minLevel: NivelOperacional;
  /** Nível operacional atual do sistema */
  currentLevel: NivelOperacional;
  /** Título do cabeçalho da seção */
  title: string;
  /** Subtítulo ou dica explicativa da seção */
  subtitle?: string;
  /** Seção colapsável opcional */
  collapsible?: boolean;
  /** Estado inicial de expansão se colapsável */
  defaultExpanded?: boolean;
  /** Rótulo do botão de expansão pontual sob demanda (se estiver em nível inferior) */
  onDemandTriggerLabel?: string;
  /** Conteúdo pericial ou técnico da seção */
  children: React.ReactNode;
  /** Badge fiscal associado ao cabeçalho da seção */
  fiscalBadge?: FiscalStatusInfo;
}

/* =========================================================================
 * 4. KpiStrip & KpiCard
 * Faixa de cartões de indicadores executivos com suporte a semáforo fiscal
 * ========================================================================= */
export interface KpiItemData {
  id: string;
  label: string;
  value: string | number;
  formattedValue?: string;
  unit?: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trafficLight?: FiscalTrafficLightStatus;
  statusLabel?: string;
  icon?: React.ReactNode;
  tooltipText?: string;
  /** Ação pontual ao clicar no KPI (ex: ver itens com glosa) */
  onClick?: () => void;
}

export interface KpiStripProps {
  /** Lista de indicadores a serem exibidos (Máx 4 para Nível Gerencial) */
  items: KpiItemData[];
  /** Modo de densidade visual */
  density?: 'compact' | 'standard' | 'spacious';
  /** Nível operacional atual (afeta a quantidade de dados e o estilo) */
  level?: NivelOperacional;
  /** Barra de progresso / semáforo consolidado de risco abaixo dos cards */
  showConsolidatedTrafficLightBar?: boolean;
  proportions?: {
    regularPct: number;
    warningPct: number;
    riskPct: number;
  };
}

/* =========================================================================
 * 5. ItemDetailDrawer
 * Gaveta lateral retrátil para inspeção pericial de linha de tabela
 * ========================================================================= */
export interface DrawerTabOption {
  id: 'fiscal' | 'icms-pr' | 'reforma' | 'memoria-calculo' | 'erp-xml';
  label: string;
  icon?: React.ReactNode;
}

export interface ItemDetailDrawerProps<T = any> {
  /** Se a gaveta lateral está aberta */
  isOpen: boolean;
  /** Callback para fechamento da gaveta (ao clicar no X, fora ou Esc) */
  onClose: () => void;
  /** Item ou registro atualmente sob inspeção */
  item: T | null;
  /** Índice do item atual (1-indexed) */
  currentIndex?: number;
  /** Total de itens da lista para controle de paginação */
  totalItems?: number;
  /** Callback para navegar para o item anterior (seta para cima ou botão) */
  onNavigatePrevious?: () => void;
  /** Callback para navegar para o próximo item (seta para baixo ou botão) */
  onNavigateNext?: () => void;
  /** Título principal do item (ex: 'Item #4 · PROD-004 · Parafuso Sextavado') */
  title: string;
  /** NCM com validação Siscomex */
  ncmInfo?: {
    code: string;
    formatted: string;
    isValidSiscomex: boolean;
    descriptionSiscomex?: string;
  };
  /** Status fiscal do item */
  fiscalStatus: FiscalStatusInfo;
  /** Conteúdo das abas internas de detalhamento */
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: DrawerTabOption[];
  /** Renderizador de conteúdo por aba */
  renderTabContent?: (tabId: string, item: T) => React.ReactNode;
  /** Ações rápidas fixadas no rodapé da gaveta (ex: 'Enviar para ERP') */
  footerActions?: React.ReactNode;
}

/* =========================================================================
 * 6. LegalCitationBlock
 * Bloco semântico de citação e fundamentação normativa
 * ========================================================================= */
export interface NormativeCitation {
  id: string;
  norma: string;         // Ex: 'RICMS/PR - Decreto Estadual nº 7.871/2017'
  artigo: string;        // Ex: 'Art. 28, Inciso I, Alínea a'
  ementa: string;        // Ex: 'Diferimento parcial de ICMS nas operações internas entre contribuintes...'
  linkOficial?: string;  // Link para SEFA/PR ou Planalto
  esfera: 'estadual-pr' | 'federal' | 'municipal' | 'harmonizado-wco';
  statusVigencia: 'vigente' | 'transicao' | 'revogado';
}

export interface LegalCitationBlockProps {
  /** Lista de citações normativas embasando o cálculo ou parecer */
  citations: NormativeCitation[];
  /** Título do bloco */
  title?: string;
  /** Se o bloco começa colapsado */
  defaultCollapsed?: boolean;
  /** Hash criptográfico SHA-256 do lote auditado associado a esta base */
  auditHashSha256?: string;
  /** Timestamp de conferência contra as bases oficiais */
  verifiedAtUtc?: string;
  /** Se permite cópia rápida da fundamentação para a área de transferência */
  enableCopyMarkdown?: boolean;
}
```

---

## 7. Diretrizes de Acessibilidade (WCAG 2.1 AA) e Ergonomia Visual

### 7.1 Checklist de Conformidade WCAG 2.1 Nível AA

1. **Critério 1.4.1 (Uso de Cor)**:
   - Em conformidade: Nenhum elemento do sistema utiliza apenas cor para transmitir significado. Todas as situações de alerta contêm ícone e rótulo de texto descritivo.
2. **Critério 1.4.3 (Contraste Mínimo)**:
   - Texto padrão e títulos: Relação de contraste mínima de **4.5:1** contra os fundos (`#0F172A` em `#FFFFFF` atinge **13.5:1**).
   - Textos secundários (`#475569` em `#FFFFFF`) atingem **5.2:1**.
   - Badges do Semáforo Fiscal:
     - Vermelho: `#991B1B` em `#FEF2F2` (Contraste **5.8:1** - Aprovado).
     - Amarelo: `#92400E` em `#FFFBEB` (Contraste **4.7:1** - Aprovado).
     - Verde: `#065F46` em `#ECFDF5` (Contraste **5.1:1** - Aprovado).
     - Azul: `#1E40AF` em `#EFF6FF` (Contraste **6.9:1** - Aprovado).
3. **Critério 1.4.11 (Contraste Não-Textual)**:
   - Bordas de inputs, botões e contornos de cards mantêm no mínimo **3:1** contra as cores de superfície adjacentes.
4. **Critério 2.1.1 (Teclado)**:
   - Toda a aplicação é 100% operável via teclado:
     - `Tab` / `Shift+Tab`: Navegação sequencial lógica por formulários e tabelas.
     - `Barra de Espaço`: Marcar/desmarcar checkboxes de itens.
     - `Enter`: Acionar botão primário ou abrir gaveta lateral de inspeção.
     - `Esc`: Fechar a gaveta lateral `ItemDetailDrawer` ou diálogos de confirmação.
     - `Setas ↑ / ↓`: Navegar entre itens na tabela quando a gaveta lateral estiver aberta.
     - Atalho `Alt + 1`, `Alt + 2`, `Alt + 3`: Alternar instantaneamente entre os níveis Gerencial, Operacional e Sênior.
5. **Critério 2.4.7 (Foco Visível)**:
   - O indicador de foco (`--ring-focus`) projeta um anel nítido de `2px` com offset de `2px`, assegurando que o operador que navega por teclado saiba com precisão onde está posicionado.
6. **Critério 4.1.3 (Mensagens de Status / `aria-live`)**:
   - Painéis de processamento assíncrono (ex.: extração determinística imediata, execução de orquestrador DAG ou auditoria via Ollama na GPU RX 580) devem incluir atributos `role="status"` e `aria-live="polite"`, permitindo que leitores de tela anunciem o término do processamento.

---

### 7.2 Ergonomia e Adaptação em Resoluções Críticas (`1366x768` vs `1920x1080`)

A auditoria visual em browser real comprovou que monitores corporativos comuns no setor contábil operam na resolução **`1366x768`** (laptops e desktops convencionais de escritórios), enquanto telas de perícia utilizam **`1920x1080`**.

#### Diretrizes para `1366x768`:
- A tabela de itens no Nível Operacional **não pode ultrapassar 7 colunas visíveis**, garantindo que a largura total da tabela não exceda `1280px` e eliminando barras de rolagem horizontal quebradas.
- O container principal deve reservar `max-height: 48vh` para o corpo da tabela, assegurando que o cabeçalho, os mini-KPIs e a `StickyActionBar` caibam confortavelmente sem forçar rolagem excessiva da página.
- O `ItemDetailDrawer` em `1366x768` deve ocupar `440px` de largura (`32%` da viewport), mantendo a tabela principal visível e legível à esquerda para consulta comparativa simultânea.

#### Diretrizes para `1920x1080`:
- O layout expande harmoniosamente até `max-w-[1680px]`.
- O `ItemDetailDrawer` ocupa `540px` de largura, com espaço amplo para abrir memórias de cálculo completas e textos normativos integrais sem truncamento de linhas.

---

## 8. Guia de Implementação e Transição para a Sub-etapa 20.2 (Google Stitch) & 20.3

### 8.1 Papel do Design System na Sub-etapa 20.2 (Prototipação Google Stitch MCP)
Na Sub-etapa 20.2, os protótipos de alta fidelidade das abas críticas (Auditoria de Entrada e Precificação) serão gerados através do **Google Stitch MCP**. Este arquivo de especificação (`03-design-system-portela.md`) servirá como o *Master Prompt & Style Guide* fornecido às ferramentas de IA gerativa de UI do Stitch, garantindo:
- Aderência estrita à paleta e aos tokens declarados.
- Renderização dos protótipos nos 3 Níveis Operacionais exatos.
- Presença obrigatória da `StickyActionBar` com 1 CTA Primário Sólido.
- Validação das telas nas dimensões `1920x1080` e `1366x768`.

### 8.2 Roteiro de Codificação para a Sub-etapa 20.3 (Componentes Reutilizáveis)
Na Sub-etapa 20.3, a equipe criará fisicamente os componentes em `@/components/design-system/`:
1. `NivelOperacionalSwitcher.tsx`
2. `StickyActionBar.tsx`
3. `ProgressiveSection.tsx`
4. `KpiStrip.tsx` e `KpiCard.tsx`
5. `ItemDetailDrawer.tsx`
6. `LegalCitationBlock.tsx`

Todos os componentes serão tipados em conformidade com o TypeScript 5.7+ e o React 19 instalados no projeto, respeitando o rigor de zero warnings no script `scripts/hookcheck.mjs`.

---
*Fim do Documento Técnico — Analista Fiscal Portela v6.0.0*
