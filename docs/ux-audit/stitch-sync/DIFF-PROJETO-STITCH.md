# Diff de Fidelidade Visual e Estrutural — Projeto Stitch `10027389379931821169` vs. App v7.1.0

**Projeto Stitch:** `Análise de Interface UI` (`projects/10027389379931821169`)  
**URL de Origem:** `https://stitch.google.com/projects/10027389379931821169`  
**Artefatos de Referência Salvos:** `docs/ux-audit/stitch-sync/10027389379931821169/`  
**Data da Auditoria:** 2026-11-25

---

## 1. Diagnóstico Crítico da Causa-Raiz de Divergência

1. **Ausência de Compilador Tailwind CSS no `package.json`:**
   - O projeto possui apenas `next`, `react`, `react-dom`, `zod`, `decimal.js`, `fast-xml-parser`, `pdf-parse`, `pg` e `@google/genai`, **sem `tailwindcss`**.
   - Entretanto, `app/page.tsx`, todos os 6 componentes em `components/ui/*.tsx`, `components/TabelaItensExtracao.tsx` e `components/PainelNfseDanfse.tsx` utilizavam classes Tailwind (`grid-cols-1 lg:grid-cols-4`, `fixed bottom-0`, `sr-only`, `flex-col`, `rounded-xl`, `bg-white`, `text-slate-900`, `w-4 h-4`, `animate-pulse`, etc.) que não possuíam regras CSS compiladas em `app/globals.css`.
   - **Impacto:** O grid de 4 colunas do `KpiStrip` colapsava em fluxo vertical ou dependente apenas de fallback inline; o `.sr-only` do `aria-live` ficava sem ocultação visual dedicada caso dependesse da classe; o `ItemDetailDrawer` e a `StickyActionBar` dependiam de classes fixas não compiladas; e `w-4 h-4` em SVGs podia perder dimensão explícita.
   - **Correção:** Criação de folha CSS real, completa e responsiva em `app/globals.css` (classes semânticas `.st-*` + variáveis CSS Stitch) e atualização dos 6 componentes em `components/ui/`, `app/page.tsx`, `TabelaItensExtracao.tsx` e `PainelNfseDanfse.tsx` para usar classes reais (mantendo os identificadores e textos exigidos pelas Suítes 43–50).

2. **Divergência de Design System (`Fiscal Intelligence & Pricing` Dark + `Heritage Fiscal` Light):**
   - Todas as 8 telas `"Interface Revisada"` e o *Guia de Integração Técnica Antigravity* (`guia-integracao-antigravity.md`) especificam o tema principal **`Fiscal Intelligence & Pricing` (Dark Analytical Cockpit)** (`#0B0F17` canvas, `#0e1511` sidebar/dim, `#111827` / `#161d19` cards, `#1c2420` / `#1E293B` containers sutis, `#1B4332` floresta profunda, `#10B981` / `#34D399` esmeralda primária, `#F59E0B` alerta, `#EF4444` risco, `#0EA5E9` info, `#F9FAFB` / `#dde4dd` texto primário, `#9CA3AF` texto secundário) com alternância opcional para **`Heritage Fiscal` (Light/Print)** (`#F8F9FA`, `#FFFFFF`, `#0F172A`, `#1B4332`, `#52796F`, `#D8F3DC`).
   - A v7.1.0 ainda utilizava paleta clara legada (`#f5f7fb` / `#0b3d91`), misturada com variáveis inexistentes (`var(--panel)`, `var(--bg-subtle)`, `var(--portela-brand-cta)`) e blocos inline hardcoded claros (`#ffffff`, `#f8fafc`, `#f0fdf4`, `#fffbeb`) ou escuros isolados (`#2a2a2a`, `#1e3a1e`).

3. **Tipografia Institucional:**
   - **Stitch:** `Space Grotesk` (headings/displays), `Plus Jakarta Sans` (corpo), `JetBrains Mono` (NCMs, CNPJs, códigos CFOP/CST/EFD, valores com `font-variant-numeric: tabular-nums lining-nums`), e `Playfair Display` (acentos editoriais / modo Heritage Fiscal).
   - **v7.1.0:** `ui-sans-serif` e `Georgia` genéricos em `app/globals.css`, sem carregamento das fontes do Google Fonts em `app/layout.tsx`.

---

## 2. Matriz de Divergências por Módulo e Plano de Alinhamento

| Módulo / Arquivo | Estado Atual (v7.1.0) | Referência Stitch (`10027389379931821169`) | Ação de Sincronização |
| :--- | :--- | :--- | :--- |
| **`app/layout.tsx`** | Sem carregamento de fontes; título legado `"Agente de Classificação Fiscal por NCM"`. | Título `"MargemReal Portela — Inteligência Fiscal & Precificação"`; fontes `Space Grotesk`, `Plus Jakarta Sans`, `JetBrains Mono`, `Playfair Display`. | Atualizar `metadata` e adicionar links Google Fonts com `display=swap`. |
| **`app/globals.css`** | Paleta clara azulada `#0b3d91`/`#f5f7fb`; sem regras para classes Tailwind usadas em `ui/*`; variáveis `--panel`/`--bg-subtle` ausentes. | Tokens completos `Fiscal Intelligence & Pricing` (padrão) + `[data-theme="heritage-light"]`; CSS real para sidebar recolhível, topbar, KpiStrip 4 col, StickyActionBar, Drawer, ProgressiveSection, LegalCitationBlock e `tabular-nums`. | Reescrever `app/globals.css` mantendo compatibilidade com classes existentes (`card`, `tb`, `btn`, `ghost`, `mini`, `badge`, `note`, `res`, `tax`, `xmlpre`, `selo-*`) e adicionando sistema `.st-*`. |
| **`app/page.tsx`** | Topbar verde sem sidebar lateral; classes Tailwind não compiladas; sem alternador de tema; abas superiores em estilo `#f5f7fb` ativo. | Sidebar esquerda recolhível (`64px` / `248px` com `#appSidebar` e `#headerSidebarToggleBtn`) + Topbar compacta (`56px`) + Chip Empresa Ativa + `NivelOperacionalSwitcher` + Toggle de Tema + Barra de abas compacta (`44px`). | Refatorar App Shell preservando todos os seletores e atributos exigidos pelas Suítes 43 e 47 (`minHeight: '56px'`, `minHeight: '44px'`, `role="tablist"`, `role="tab"`, `aria-live="polite"`, sem `three-tier-banner`). |
| **`components/ui/*`** | `bg-white`, `slate-*`, `w-4 h-4`, `fixed bottom-0` sem CSS compilado; `ProgressiveSection` não reagia à mudança dinâmica de `currentLevel` para `senior`. | Superfícies escuras com alto contraste WCAG AA, borda semântica 4px no `KpiStrip`, CTA primário esmeralda `#10B981`, drawer modal acessível com backdrop blur, blocos normativos com cópia Markdown. | Migrar os 6 componentes base para classes `.st-*` + variáveis CSS Stitch, com dimensões SVG explícitas e sincronização reativa do estado `senior` em `ProgressiveSection`. |
| **Aba 0 (`CadastroEmpresas.tsx`)** | Mistura de `var(--panel)` indefinido e cores soltas (`#2a2a2a`, `#1e3a1e`, `#142f1f`). | `"Clientes & Perfis Tributários"`, cards com contraste consistente, badges de regime e status RFB. | Alinhar superfícies ao tema Stitch via CSS vars e cabeçalho limpo v2.6; preservar 100% do Marco 4 (CNPJ RFB + `empresas-store.json`). |
| **Aba 1 (`Classificar.tsx`)** | Caixas brancas (`white`, `#f8fafc`, `#FEF9C3`, `#edf2f7`). | `"Classificação Fiscal"` com badges `RGI 1–6`, `NESH`, `Siscomex`, cards escuros analíticos e semáforo esmeralda/âmbar/carmesim. | Substituir fundos claros fixos por variáveis semânticas Stitch; preservar KPIs, `sec-classificacao-legal` e citações (Suíte 46). |
| **Aba 2 (`Lote.tsx`)** | Caixas claras (`#ffffff`, `#dcfce7`, `#fef3c7`, `#fee2e2`, `#e0e7ff`). | `"Auditoria em Lote"` com badge `CSV / ERP`, painel de métricas `tabular-nums` e semáforo dark. | Substituir fundos claros fixos por tokens semânticos Stitch; preservar KPIs, seções progressivas e acessibilidade (Suíte 46). |
| **Aba 5 (`AuditoriaEntrada.tsx`, `TabelaItensExtracao.tsx`, `PainelNfseDanfse.tsx`)** | Fundos claros (`#f8fafc`, `#f0fdf4`, `#fffbeb`, `#ffffff`) e classes Tailwind órfãs em `TabelaItensExtracao` e `PainelNfseDanfse`. | `"Auditoria de Entrada"` com `KpiStrip` de 4 KPIs, tabela enxuta de 7 colunas, `ItemDetailDrawer`, painel DIFAL PR + prazo/guia/EFD em `JetBrains Mono` e `LegalCitationBlock`. | Unificar classes `.st-table-*` e `.st-nfse-*` em `globals.css`, converter fundos fixos para tokens Stitch e preservar 100% dos Marcos 1 e 2 + Suíte 44. |
| **Aba 6 (`Precificar.tsx`)** | Títulos longos com legislação dentro de `<h2>`; múltiplos blocos com `#ffffff`, `#f8fafc`, `#fffbeb`, `#eff6ff`, `#f3e8ff`. | Títulos funcionais limpos (2–4 palavras) + badges normativas adjacentes (`CPC 16 (R1)`, `LC 214/2025`, `SEFA/PR 48/2026`); blocos analíticos com alto contraste e `tabular-nums`. | Higienizar `<h2>` mantendo todas as strings e citações exigidas pelas Suítes 45 e Marco 3 (`useParametrosPrecificacao`, `Restaurar Alíquotas Padrão`). |
| **Aba 7 (`Reforma.tsx`) e Abas 3/4/8** | Estilo legado claro (`#f8fafc`, `#ffffff`, `#ecfdf5`, `#fffbeb`). | `"Reforma Tributária"` com badges `LC 214/2025`, `LC 227/2026`, `NT 2026.008`, tabela paginada escura `tabular-nums` e painel de fontes normativas. | Alinhar às variáveis Stitch preservando paginação, filtros, KPIs da Suíte 46 e fontes normativas do Marco 1. |
