# Relatório de Sincronização Direta — Projeto Stitch `10027389379931821169` (`v7.2.0`)

**Projeto Stitch:** `Análise de Interface UI` (`https://stitch.google.com/projects/10027389379931821169`)  
**Artefatos de Referência:** `docs/ux-audit/stitch-sync/10027389379931821169/`  
**Relatório de Diff:** `docs/ux-audit/stitch-sync/DIFF-PROJETO-STITCH.md`  
**Screenshots Capturados:** `docs/ux-audit/screenshots/stitch-sync/`  
**Data:** 2026-11-25

---

## 1. Resumo das Divergências Alinhadas

1. **Folha de Estilos Real em `app/globals.css` (Fim da Dependência de Tailwind Não-Compilado):**
   - O `package.json` não possui `tailwindcss`, fazendo com que classes utilitárias usadas em `app/page.tsx`, `components/ui/*`, `TabelaItensExtracao.tsx` e `PainelNfseDanfse.tsx` não tivessem CSS compilado.
   - Implementado sistema completo de classes reais `.st-*`, `.btn-secundario`, `.badge-stat`, `.sr-only` e `.tabular-nums` em `app/globals.css`, com grids responsivos reais (4 colunas no `KpiStrip` em `>= 1120px`, 2 em tablets e 1 em mobile).
2. **Adoção Integral dos 2 Design Systems do Stitch:**
   - **Padrão (`fiscal-dark` — *Fiscal Intelligence & Pricing*):** Canvas `#0B0F17`, dim/rail `#0e1511`, cards `#111827`, containers `#161d19`/`#1c2420`/`#1e293b`, floresta profunda `#1B4332`, esmeralda primária `#10B981`/`#34D399`, alerta `#F59E0B`, erro `#EF4444`, info `#38BDF8`.
   - **Alternância em 1 Clique (`heritage-light` — *Heritage Fiscal*):** Superfície `#F8F9FA`, cards `#FFFFFF`, texto `#0F172A`, acentos `#1B4332` / `#52796F` / `#D8F3DC`.
   - Carregamento das fontes oficiais do Stitch (`Space Grotesk`, `Plus Jakarta Sans`, `JetBrains Mono` e `Playfair Display`) em `app/layout.tsx`.
3. **App Shell Stitch com Sidebar Lateral Recolhível (`app/page.tsx`):**
   - Barra lateral esquerda `#appSidebar` alternando entre `64px` (recolhida) e `248px` (expandida) via `#headerSidebarToggleBtn` e botão inferior, sincronizada via variável CSS `--sidebar-width` com o `<main>` e com a `StickyActionBar`.
   - Topbar compacta com logo Portela, chip da Empresa Ativa, `NivelOperacionalSwitcher` (`Gerencial`, `Operacional`, `Sênior`), alternador de tema (`Heritage` / `Cockpit`) e barra de abas `role="tablist"` em linha única (inclusive em `1366x768`).
4. **Governança Visual v2.6 & Harmonia das Abas (Marcos 1–4 Preservados):**
   - Cabeçalhos funcionais limpos (`.st-page-header` / `.st-page-title`) acompanhados de `.st-badge-norma` nas abas `Clientes & Perfis Tributários`, `Classificação Fiscal`, `Auditoria em Lote`, `Auditoria de Entrada`, `Precificação & Margens` e `Reforma Tributária`.
   - Remoção de fundos brancos/claros hardcoded no JSX das abas (`CadastroEmpresas.tsx`, `AuditoriaEntrada.tsx`, `TabelaItensExtracao.tsx`, `PainelNfseDanfse.tsx`, `Precificar.tsx`, `Classificar.tsx`, `Lote.tsx`, `Parametrizar.tsx`), substituindo por variáveis semânticas compatíveis com ambos os temas e mantendo os templates de impressão A4 intactos.
   - Preservação integral dos Marcos 1–4 (`fontes-normativas.ts`, `difal-pr.ts` + demonstrativo/prazo/EFD, `useParametrosPrecificacao.ts`, `/api/cnpj/[cnpj]` + `data/db/empresas-store.json`) e imutabilidade de `rules/rules.json`.

---

## 2. Métricas Coletadas no Navegador Real (Chrome Headless CDP)

Fonte bruta: `docs/ux-audit/stitch-sync/stitch-sync-audit-results.json`

| Métrica | `1920x1080` (Desktop) | `1366x768` (Notebook) | Status |
| :--- | :--- | :--- | :--- |
| Erros de Console / Runtime (`consoleErrors` / `pageErrors`) | `0` / `0` | `0` / `0` | Aprovado |
| Altura do Cabeçalho (`header.st-topbar`) | `103px` | `103px` | Aprovado |
| Largura da Sidebar (Recolhida / Expandida) | `64px` / `248px` | `64px` (recolhida) | Aprovado |
| Overflow Horizontal (`scrollWidth > innerWidth`) | `false` (todas as 6 abas) | `false` (todas as 6 abas) | Aprovado |
| Grid 4 Colunas em Linha Única no `KpiStrip` | `true` (Classificar, Lote, Precificar, Reforma) | `true` (Classificar, Lote, Precificar, Reforma) | Aprovado |
| Alvos Interativos `< 36px` (`below36pxTargets`) | `0` (todas as 6 abas) | `0` (todas as 6 abas) | Aprovado |
| Regiões `aria-live="polite"` Presentes | `1`–`2` por aba | `1`–`2` por aba | Aprovado |
| Alternância de Tema (`fiscal-dark` ↔ `heritage-light`) | Confirmada (`heritage-light`) | — | Aprovado |

---

## 3. Catálogo de Screenshots Gerados (`docs/ux-audit/screenshots/stitch-sync/`)

- `1920x1080_sidebar_expandida.png` (Sidebar expandida a `248px` em `Clientes & Perfis`)
- `1920x1080_01_clientes_perfis_operacional.png` / `1366x768_01_clientes_perfis_operacional.png`
- `1920x1080_02_classificar_operacional.png` / `1366x768_02_classificar_operacional.png`
- `1920x1080_03_lote_operacional.png` / `1366x768_03_lote_operacional.png`
- `1920x1080_04_auditoria_entrada_operacional.png` / `1920x1080_04_auditoria_entrada_gerencial.png` / `1920x1080_04_auditoria_entrada_senior.png` / `1366x768_04_auditoria_entrada_operacional.png`
- `1920x1080_05_precificacao_operacional.png` / `1920x1080_05_precificacao_gerencial.png` / `1920x1080_05_precificacao_senior.png` / `1366x768_05_precificacao_operacional.png`
- `1920x1080_05_precificacao_heritage_light.png` (Tema claro `Heritage Fiscal`)
- `1920x1080_06_reforma_operacional.png` / `1366x768_06_reforma_operacional.png`
