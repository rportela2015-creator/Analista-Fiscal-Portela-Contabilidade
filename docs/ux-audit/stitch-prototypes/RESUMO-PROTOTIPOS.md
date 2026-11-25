# Relatório Executivo de Prototipação — Sub-etapa 20.2 (Fase 2 do Ciclo 7)
## Analista Fiscal Portela — Protótipos Google Stitch MCP & 3 Níveis Operacionais

**Data:** 23 de Novembro de 2026  
**Status:** Aprovado para Implementação (Sub-etapa 20.3)  
**Conector de Design:** Google Stitch MCP (`https://stitch.google.com/mcp`)  
**Base Normativa:** LC 214/2025, LC 227/2025, NT 004/007/008/009, RICMS/PR Dec. 7.871/17, CPC 16 (R1), WCAG 2.1 AA.

---

### 1. Visão Geral e Arquivos Entregues

Em conformidade estrita com o escopo da **Sub-etapa 20.2**, nenhum componente de produção (`@components/*.tsx` ou `@app/page.tsx`) nem `@rules/rules.json` foram alterados. Todos os protótipos visuais interativos e especificações de tokens foram concebidos e armazenados em `docs/ux-audit/stitch-prototypes/`:

| Arquivo de Protótipo | Escopo & Abas Cobertas | Interatividades Demonstradas |
| :--- | :--- | :--- |
| [`01-app-shell.html`](file:///F:/Workspace/Apps/Analista-Fiscal-Portela-Contabilidade/docs/ux-audit/stitch-prototypes/01-app-shell.html) | Shell da Aplicação, Header, Navegação, Grid Base | Seletor de 3 Níveis, Empresa Ativa, Dropdown de Ações, Alternância de Abas, Redução de Dead Space de 465px para 100px. |
| [`02-auditoria-entrada-3-niveis.html`](file:///F:/Workspace/Apps/Analista-Fiscal-Portela-Contabilidade/docs/ux-audit/stitch-prototypes/02-auditoria-entrada-3-niveis.html) | **Aba 5: Auditoria de Entrada** (NF-e XML / CTE) | Modo Gerencial (4 KPIs + Barra de Risco), Modo Operacional (Tabela enxuta 7 colunas + `ItemDetailDrawer` 500px com 4 abas), Modo Sênior (DAG RFB 7 fases + Base Dupla Dec. 7.871/17 + Hash SHA-256), `StickyActionBar` com CTA primário sólido. |
| [`03-precificacao-3-niveis.html`](file:///F:/Workspace/Apps/Analista-Fiscal-Portela-Contabilidade/docs/ux-audit/stitch-prototypes/03-precificacao-3-niveis.html) | **Aba 6: Precificação & Margens** (CPC 16 / Simulação) | Modo Gerencial (4 KPIs Financeiros + Gráfico comparativo de 4 regimes), Modo Operacional (Formulário de premissas compacto + Tabela 6 colunas + Drawer de simulação unitária), Modo Sênior (Dual-Stack Reforma 2027 + Mesa de Compras PR + Capital de Giro CDI 100% 45 dias + Radar Ad Rem LC 192/22), `StickyActionBar`. |

---

### 2. Top 5 Gargalos de UX/A11y da Sub-etapa 20.1 Solucionados

| # | Gargalo Diagnosticado em 20.1 | Solução Arquitetural no Protótipo | Evidência no Protótipo |
| :--- | :--- | :--- | :--- |
| **G1** | **Dead Space Vertical Excessivo (465px)**<br>No baseline 1366x768, o usuário precisava rolar a página inteira apenas para visualizar as primeiras linhas da tabela. | **Header Unificado e Compacto (56px) + Nav (44px) = 100px total**.<br>Liberação imediata de **+365px verticais** de conteúdo útil acima da dobra (*above the fold*). | Visível em todos os protótipos (`01-app-shell.html`, `02`, `03`). |
| **G2** | **CTAs Dispersos e Baixo Contraste**<br>Mais de 8 botões concorrendo por atenção visual, muitos com contraste inferior a 3:1. | **1 CTA Primário Sólido por Estado de Tela** (`#1e3a8a`, alvo >= 44px, contraste 9.5:1 no texto branco, WCAG AAA) integrado na **`StickyActionBar`** fixa no rodapé da viewport. | Botão *"Auditar 14 Itens Selecionados"* e *"Salvar Parâmetros e Atualizar ERP"*. |
| **G3** | **Sobrecarga Cognitiva e Ruído Técnico**<br>Usuários de perfil gerencial eram bombardeados por fórmulas jurídicas e hashes de custódia. | **Arquitetura de 3 Níveis Operacionais com Divulgação Progressiva sob Demanda**: `Gerencial` (CFO/Sócios), `Operacional` (Rotina Fiscal) e `Sênior / Pericial` (Auditor/Perito). | Comutador pill no topo + alternância reativa instantânea de views. |
| **G4** | **Tabelas Superlotadas (18+ Colunas)**<br>Rolagem horizontal desordenada que quebrava o fluxo de conferência de notas fiscais. | **Tabelas Enxutas de 6 a 7 Colunas Essenciais**.<br>Memória de cálculo, desdobramentos de alíquotas e justificativas legais foram movidos para o **`ItemDetailDrawer` lateral de 500px**, acionado via clique ou `[Inspecionar]`. | Demonstração completa no `02-auditoria-entrada-3-niveis.html`. |
| **G5** | **Alinhamento Numérico Truncado**<br>Valores em reais desalinhados horizontalmente com fontes proporcionais. | **Adoção do token `tabular-nums` com a tipografia `JetBrains Mono`**, garantindo alinhamento de vírgulas e centavos em colunas financeiras. | Classes CSS `.tabular-nums` em todas as tabelas e KPIs. |

---

### 3. Top 5 Motores e Capacidades do Backend Expostos na Interface

| # | Capacidade do Backend (Subexposta no Ciclo 6) | Onde e Como Foi Exposta no Protótipo | Nível Operacional |
| :--- | :--- | :--- | :--- |
| **C1** | **Orquestrador DAG RFB (Pipeline 7 Fases)**<br>`lib/fiscal/dag-orchestrator.ts` | Barra visual de progresso com 7 etapas encadeadas (Parser XML → Siscomex → Cesta Básica → Base Dupla → Split Payment → RTC → Laudo). | Sênior / Pericial |
| **C2** | **Paridade RFB Centavo a Centavo (`DecimalHalfEven`)**<br>`lib/fiscal/paridade-rfb.ts` | Seção de auditoria de paridade comparando centavos calculados vs padrão oficial RFB com prova de zero drift. | Sênior / Pericial |
| **C3** | **Cálculo Base Dupla DIFAL PR (Dec. 7.871/17)**<br>`lib/fiscal/base-dupla-pr.ts` | Aba *"DIFAL PR"* no `ItemDetailDrawer` exibindo Base 1, Base 2, dedução do imposto de origem e alíquota interna 19,5%. | Operacional (Drawer) & Sênior |
| **C4** | **Simulação Dual-Stack Reforma Tributária 2027**<br>`lib/fiscal/reforma-tributaria.ts` | Painel comparativo lado a lado no Modo Sênior (Legado vs IBS/CBS Art. 8º e 47 LC 214/2025) e barra comparativa de 4 regimes no Modo Gerencial. | Gerencial & Sênior |
| **C5** | **Integração ERP & Cadeia de Custódia SHA-256**<br>`lib/fiscal/laudo-pericial.ts` e `lib/fiscal/export-erp.ts` | Aba *"Lançamento ERP"* no Drawer com botão de cópia formatado (Domínio/Prosoft) e bloco de hash SHA-256 imutável. | Operacional & Sênior |

---

### 4. Especificação de Componentes para a Sub-etapa 20.3 (Design System)

Para a execução da **Sub-etapa 20.3**, serão codificados componentes modulares reutilizáveis em TypeScript/React, respeitando a ordem estrita de hooks (`scripts/hookcheck.mjs`):

1. **`NivelOperacionalSwitcher.tsx`**:
   - Controle tipo *segmented pill* acessível (`role="tablist"`), sincronizado com `localStorage` ou estado React.
   - Suporte aos estados `'gerencial' | 'operacional' | 'senior'`.
2. **`StickyActionBar.tsx`**:
   - Barra fixa no rodapé (`position: fixed; bottom: 0`) com elevação visual (`box-shadow`), contendo sumário à esquerda e 1 CTA primário sólido à direita (alvo >= 44px).
3. **`ItemDetailDrawer.tsx`**:
   - Drawer deslizante lateral de 500px com overlay semitransparente, tecla de atalho `Esc` para fechamento, acessibilidade de foco e abas internas parametrizáveis.
4. **`ProgressiveSection.tsx`**:
   - Accordion com chevron acessível e contadores de auditoria, permitindo expansão micro-progressiva sem alterar o nível global.
5. **`KpiStrip.tsx` e `KpiCard.tsx`**:
   - Componentes visuais para exibição de métricas gerenciais e operacionais com suporte a `tabular-nums` e bordas semânticas (`highlight`, `warning`, `danger`).
6. **`LegalCitationBlock.tsx`**:
   - Bloco estilizado para fundamentação legal com ícone, artigo de lei citado, tribunal/órgão e jurisprudência aplicável.

---

### 5. Conclusão da Sub-etapa 20.2

Com a aprovação dos 3 protótipos de alta fidelidade e do resumo executivo, a fundação visual do **Analista Fiscal Portela** atinge paridade com os padrões de design de produtos B2B de ponta, preparando o ambiente para a implementação limpa e sustentável da **Sub-etapa 20.3**.
