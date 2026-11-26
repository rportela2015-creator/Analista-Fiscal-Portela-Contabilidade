# Changelog — Analista Fiscal Portela Contabilidade

Todas as alterações notáveis deste projeto serão documentadas neste arquivo.
O formato é baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e adere ao Versionamento Semântico.

---

## [8.0.0] - 2026-11-26 — Fechamento do Saneamento: Motor Único, Contrato Canônico, Saneamento NCM, Governança RFB Híbrida e Modularização
- **Rodada 1 (Fases 1 e 2) — Unificação do Motor Tributário PR & Blindagem de Códigos:**
  - Consolidação em `lib/engine/matriz-icms-pr.ts` com resolução bitemporal de alíquotas PR, FECOP e exclusões ST dos Decretos PR nº 6.048/2024 e nº 12.828/2026;
  - Blindagem determinística de `cClassTrib` (`lib/fiscal/reforma-tabela-oficial.ts`), `cBenef` Tabela 5.2 (`rules/cbenef-pr.json`) e CFOP (`lib/fiscal/cfop-resolver.ts`).
- **Rodada 2 (Fase 3) — Contrato Canônico `ItemFiscalAuditado` e Rateio CT-e FOB:**
  - Criação de `lib/types/item-fiscal-auditado.ts` e `lib/fiscal/extrator-cte.ts` (rateio proporcional de CT-e mod. 57 FOB por centavos com aritmética decimal estrita `lib/math/decimal-fiscal.ts`);
  - Propagação integral sem perdas entre Empresa Ativa -> Auditoria de Entrada -> Parametrização ERP -> Precificação (`tests/fluxo-canonico-item-auditado.test.mjs`).
- **Rodada 3 (Fase 4) — Saneamento Assistido `xProd × NCM` (Dual-Track Imutável):**
  - Criação de `lib/fiscal/aderencia-ncm.ts` e `lib/fiscal/saneamento-ncm.ts` com preservação de `ncmEscrituradoEntrada` para EFD C100/C170, simulação Antes × Depois, diferenciação `Anexo IX LC 214 pendente` vs. `cClassTrib a confirmar`, orientação CC-e (Ajuste SINIEF nº 07/2005 Cl. 14ª-A) e carimbo nos laudos HTML/TXT.
- **Rodada 4 (Fase 5 — Opção D) — Snapshot Validado como Caminho Primário e Governança RFB:**
  - Manifesto `rules/snapshot-floors.json` + pipeline atômico `scripts/rfb-refresh.mjs` (`npm run rfb:refresh` / `npm run rfb:verify`) gerando `public/data/rfb-status.json`;
  - Modo explícito `live → snapshot → hardcoded` em `lib/integracoes/rfb-health.ts`, `instrumentation.ts`, selos no App Shell (`app/page.tsx`) e aba Reforma (`components/Reforma.tsx`), trava HTTP 503 em fechamentos `hardcoded`, blindagem do `fetcher_ricms_pr.py`, `scripts/paridade.ps1` e workflow `.github/workflows/rfb-sync.yml`.
- **Rodada 5 (Fase 6) — Modularização, Calibração RGI, WCAG AA e Higiene:**
  - Modularização de `components/Precificar.tsx` em `components/precificar/*` e `components/AuditoriaEntrada.tsx` em `components/auditoria/*`;
  - Cobertura recursiva no `scripts/hookcheck.mjs`, foco visível esmeralda (`:focus-visible`) em `app/globals.css`, calibração do núcleo substantivo RGI (`Notebook` -> `8471.30.*`, `Bolo` -> `1905.90.90`) e limpeza de caches/órfãos em `data/raw/`.

---

## [7.2.0] - 2026-11-25 — Sincronização Direta com Projeto Stitch `10027389379931821169` (MargemReal Portela)
- **Extração & Documentação Stitch (`docs/ux-audit/stitch-sync/`):**
  - Materialização dos artefatos oficiais do projeto `10027389379931821169` (metadados, catálogo de telas, Design Systems, Guia de Integração Técnica Antigravity v3.0.0, Relatório de Conformidade Visual v2.6 e telas revisadas) em `docs/ux-audit/stitch-sync/10027389379931821169/`;
  - Diagnóstico estrutural em `docs/ux-audit/stitch-sync/DIFF-PROJETO-STITCH.md` e homologação final em navegador real em `docs/ux-audit/stitch-sync/RELATORIO-SINCRONIZACAO-STITCH.md`.
- **Design System Real Sem Dependência de Tailwind (`app/layout.tsx` & `app/globals.css`):**
  - Carregamento das famílias tipográficas Stitch (`Space Grotesk`, `Plus Jakarta Sans`, `JetBrains Mono` e `Playfair Display`);
  - Implementação completa dos tokens **Fiscal Intelligence & Pricing** (Dark Analytical Cockpit, padrão `#0B0F17` / `#10B981`) e **Heritage Fiscal** (Light/Print `#F8F9FA` / `#1B4332`) via variáveis CSS e classes `.st-*` reais, eliminando classes utilitárias não compiladas.
- **App Shell & Componentes Base (`app/page.tsx` & `components/ui/*.tsx`):**
  - Sidebar lateral esquerda recolhível (`64px` / `248px`, `#appSidebar` e `#headerSidebarToggleBtn`), topbar compacta (`56px`), barra de abas em linha única (`44px`), alternador de tema (`Cockpit` / `Heritage`) e preservação integral do `NivelOperacionalSwitcher` e regiões `aria-live="polite"`;
  - Atualização de `KpiStrip`, `StickyActionBar`, `ProgressiveSection`, `ItemDetailDrawer`, `LegalCitationBlock` e `NivelOperacionalSwitcher` com CSS real, grid 4 colunas responsivo, `tabular-nums`, dimensões explícitas de ícones SVG e sincronização automática de expansão no nível `Sênior`.
- **Sincronização das Abas & Preservação dos 4 Marcos:**
  - Alinhamento visual e remoção de fundos claros hardcoded em `CadastroEmpresas.tsx`, `AuditoriaEntrada.tsx`, `TabelaItensExtracao.tsx`, `PainelNfseDanfse.tsx`, `Precificar.tsx`, `Classificar.tsx`, `Lote.tsx`, `Reforma.tsx` e `Parametrizar.tsx` seguindo a Governança Visual v2.6;
  - 100% de preservação das entregas dos Marcos 1–4 (`fontes-normativas.ts`, `difal-pr.ts`, `useParametrosPrecificacao.ts`, `/api/cnpj/[cnpj]` e `data/db/empresas-store.json`) e de `rules/rules.json`.
- **Validação Visual em Chrome Headless CDP (`scripts/audit_stitch_sync.mjs`):**
  - Inspeção automatizada e visual em `1920x1080` e `1366x768` (`docs/ux-audit/screenshots/stitch-sync/`): `0` erros de console/runtime, `0` overflow horizontal, cabeçalho `103px` em linha única mesmo em `1366x768`, `0` alvos interativos `< 36px` e paridade confirmada nos 3 níveis operacionais e nos 2 temas.

---

## [7.1.0] - 2026-11-25 — Fontes Normativas, Demonstrativo DIFAL PR, Precificação Persistente e Cadastro CNPJ RFB
- **Marco 1 — Catálogo Oficial de Fontes Legais (`lib/fiscal/fontes-normativas.ts`):**
  - Consolidação estruturada das normas oficiais: RICMS/PR (Decreto nº 7.871/2017 Arts. 3º, 8º § 12, 28, 74, 542 e 545), NPF 052/2018 (registros E310/E316 e códigos PR239999/PR259999), Decretos PR 6.048/2024 e 12.828/2026, Consulta SEFA/PR nº 48/2026, LC nº 214/2025, LC nº 227/2026 (CG-IBS), NT 2026.008 v1.01 (Ato Conjunto RFB/CGIBS nº 10/2026), Resoluções CGSN nº 186/2026 e nº 194/2026 e Convênios ICMS nº 127/2026 e nº 128/2026;
  - Integração direta nos blocos `LegalCitationBlock` das abas `AuditoriaEntrada.tsx`, `Precificar.tsx` e `Reforma.tsx`.
- **Marco 2 — Demonstrativo DIFAL Produto a Produto, Somatório e Prazo Legal (`lib/fiscal/difal-pr.ts` + `AuditoriaEntrada.tsx`):**
  - Apuração item a item (`cProd`, `xProd`, `NCM`, `CFOP`, `destinacao`, `vOperacao`, `aliqInter`, `aliqIntraPR`, `fecop`, `baseDupla`, `valorDifalPrincipal`, `valorFecop`, `valorDifalTotal`, `exigeRecolhimento`, `fundamento`);
  - Somatório consolidado da nota e somatório acumulado de múltiplas notas na sessão (`totalBaseDifal`, `totalDifalPrincipal`, `totalFecop`, `totalDifalGeral`, `qtdItensTributados`);
  - Cálculo automático de vencimento e guia/EFD: `GR-PR 1015` (dia 12 do mês subsequente), `DeSTDA/GR-PR` (dia 20 do 2º mês subsequente) e `GNRE` (antes da saída para não inscritos), com inspeção detalhada via `ItemDetailDrawer`.
- **Marco 3 — Precificação com Alíquotas Customizadas Persistentes (`lib/hooks/useParametrosPrecificacao.ts` + `Precificar.tsx`):**
  - Persistência segmentada por `empresaId` em `localStorage` (`portela_precificacao_aliquotas_v1`) cobrindo CBS, IBS, IS, ICMS, PIS/COFINS, IPI, DAS, IRPJ/CSLL e Redução IVA, com indicador discreto e botão `Restaurar Alíquotas Padrão` (`min-h-[44px]`).
- **Marco 4 — Persistência Local Atômica de Empresas + Consulta Oficial por CNPJ (`lib/db/client.ts`, `lib/db/empresas-repository.ts`, `app/api/cnpj/[cnpj]/route.ts`, `CadastroEmpresas.tsx`):**
  - Store JSON atômico em `data/db/empresas-store.json` (com exclusão de watchers em `next.config.mjs` e `tsconfig.json`) preservando fallback dual-mode com `pg.Pool`;
  - Consulta pública da Receita Federal via BrasilAPI com fallback automático para CNPJ.ws e ReceitaWS e preenchimento cadastral automático na aba `CadastroEmpresas.tsx`.
- **Testes Automatizados (50 Suítes):**
  - Novas suítes determinísticas `tests/difal-demonstrativo-e-fontes.test.mjs`, `tests/precificacao-persistencia-aliquotas.test.mjs` e `tests/empresas-persistencia-e-cnpj.test.mjs` registradas em `scripts/test.mjs`.

---

## [7.0.0] - 2026-11-23 — Ciclo 7 Concluído: Design System Portela, Acessibilidade WCAG AA, Arquitetura em 3 Níveis Operacionais e Release Oficial v7.0.0
**Período de Execução:** Novembro/2026  
**Responsável Técnico:** Lead QA Frontend, Auditor de Acessibilidade/Performance e Release Engineer  
**Status do Ciclo 7:** 7 de 7 Sub-Etapas Concluídas (20.1 a 20.7) | 47 Suítes de Testes Oficiais Aprovadas (100% Passing)

### Sub-Etapa 20.7: Homologação em Navegador Real (CDP), Suíte 47 de Integridade e Fechamento do Ciclo 7 (v7.0.0)
- **Inspeção e Auditoria em Navegador Real (Chrome DevTools Protocol - CDP):**
  - Execução de testes no navegador real Chrome Headless (`v158`) com Next.js 16 em modo de produção (`npm run start`) nas resoluções `1920x1080` (Desktop Full HD) e `1366x768` (Notebook Corporativo);
  - Inspeção exaustiva das 6 abas prioritárias (`Clientes & Perfis`, `Auditoria de Entrada`, `Precificação & Margens`, `Classificar produto`, `Lote CSV` e `Reforma IBS/CBS/IS`);
  - Geração e persistência do catálogo oficial com 36 screenshots em alta resolução em `docs/ux-audit/screenshots/v7/`, cobrindo as permutações completas de resoluções e níveis operacionais (*Gerencial*, *Operacional* e *Sênior*);
  - Documentação do relatório pericial de homologação em `docs/ux-audit/04-qa-final-v7.md`.
- **Comprovação dos Ganhos Ergonômicos e Acessibilidade (vs Sub-Etapa 20.1):**
  - *Redução de Dead Space*: Cabeçalho estático reduzido de 465px para **100px** (56px header corporativo + 44px abas), liberando **+365px** de espaço útil na primeira dobra em 1366x768;
  - *Visibilidade de CTA Primário*: 100% dos fluxos possuem exatamente 1 CTA primário sólido e inequívoco visível na primeira dobra ou fixado no rodapé via `StickyActionBar` (0 rolagens necessárias para acionar comandos fundamentais);
  - *Acessibilidade WCAG 2.1 AA*: Regiões dinâmicas assistidas por `aria-live="polite"` e `role="status"`, seletor de nível estruturado com `role="radiogroup"` / `role="radio"`, alvos interativos touch/click com dimensões mínimas >= 44x44px e tipografia contábil com `font-variant-numeric: tabular-nums; text-align: right;`;
  - *Performance e Estabilidade*: First Contentful Paint (FCP) de **104ms**, DOM Interactive de **44ms**, Load Event em **159ms**, CLS = 0.00 e zero estouro horizontal indesejado.
- **Nova Suíte 47 de Testes Automatizados (`tests/ux-release-v7-integridade.test.mjs`):**
  - Validação programática do contrato do App Shell (`app/page.tsx`), header compacto e `NivelOperacionalSwitcher`;
  - Validação da integridade dos 3 níveis operacionais (`lib/hooks/useNivelOperacional.ts`) e barrel exports em `components/ui/index.ts`;
  - Validação de segurança em `next.config.mjs` (ausência de `X-Frame-Options: ALLOWALL`, presença de CSP com `frame-ancestors` e `nosniff`);
  - Validação estrita de imutabilidade e integridade pericial de `rules/rules.json`.
- **Atualização de Metadados de Release:**
  - `package.json` atualizado para `"version": "7.0.0"`;
  - Documentação consolidada em `README.md` e `CHANGELOG.md`.

### Sub-Etapa 20.6: Refatoração de Classificação Fiscal, Parametrização em Lote e Reforma Tributária em 3 Níveis Operacionais
- **Classificação Fiscal Individual (`components/Classificar.tsx`):**
  - Conexão nativa com `useNivelOperacional` e `useEmpresaAtiva` para adaptação dinâmica entre níveis *gerencial*, *operacional* e *sênior*;
  - `KpiStrip` superior com 4 macro-indicadores em tempo real: NCM Sugerido/Validado, Confiança da Classificação, Alíquotas & Regras (RTC/PR) e Status de Consistência Fiscal com `tabular-nums` e semáforo fiscal;
  - `ProgressiveSection` (`id="sec-classificacao-legal"`) com `LegalCitationBlock` cobrindo RGI 1 a 6, NESH (IN RFB nº 2.169/2023), LC 214/2025 e RICMS/PR, expandido no nível sênior e colapsável sob demanda nos demais níveis;
  - `StickyActionBar` fixa no rodapé com 1 CTA primário sólido (`✦ Classificar com IA Especialista` ou `📋 Relatório ERP Resumido`), feedback `aria-live="polite"` e alvos táteis >= 44px.
- **Parametrização em Lote de ERP (`components/Lote.tsx`):**
  - Conexão nativa com `useNivelOperacional` e `useEmpresaAtiva`;
  - `KpiStrip` executivo com Total de Itens, Classificados/NCM Validado, Divergências/Requer IA e Taxa de Prontidão ERP em `tabular-nums`;
  - Encapsulamento da barra de contexto de saída tributária em `ProgressiveSection` (`id="sec-lote-contexto-saida"`) e fundamentação normativa do SPED/LC 214 em `ProgressiveSection` (`id="sec-lote-fundamentacao"`);
  - `StickyActionBar` com CTA primário (`⬇️ Baixar CSV para ERP` ou `⚙️ Processar Lote no Motor Fiscal`), ações secundárias de reconciliação assistida por IA (Gemini) e feedback de status com `role="status"` e `aria-live="polite"`.
- **Reforma Tributária e Tabela cClassTrib (`components/Reforma.tsx`):**
  - Conexão nativa com `useNivelOperacional`;
  - `KpiStrip` com 4 indicadores: Classificações cClassTrib, Situações Tributárias CST-IBS/CBS, Imposto Seletivo (Art. 393+) e Alíquotas de Teste 2026 (CBS 0,90% + IBS 0,10%);
  - Paginação acessível com controle estrito de DOM (25, 50 ou 100 itens por página) eliminando inchaço de nós simultâneos e garantindo alvos mínimos >= 44px;
  - `ProgressiveSection` (`id="sec-reforma-fundamentos"`) com `LegalCitationBlock` unificando LC 214/2025, LC 227/2025 e normas do Comitê Gestor do IBS;
  - `StickyActionBar` com CTA primário sólido e feedback reativo de cópia para a área de transferência.
- **Testes Automatizados & Qualidade (DoD):**
  - Nova Suíte 46 de Testes (`tests/ux-classificar-lote-reforma-niveis.test.mjs`) validando os contratos de props, paginação, WCAG AA e renderização condicional;
  - Registro da Suíte 46 no orquestrador `scripts/test.mjs`;
  - 100% de conformidade com `node scripts/hookcheck.mjs` (components, app e components/ui);
  - Verificação de tipos via `npm run typecheck` com 0 erros.

### Sub-Etapa 20.5: Refatoração de Precificação e Gestão de Empresas em 3 Níveis Operacionais, KpiStrip, StickyActionBar e ProgressiveSection
- **Módulo de Precificação e Rentabilidade (`components/Precificar.tsx`):**
  - Conexão nativa com `useNivelOperacional` para alternância dinâmica de densidade entre níveis *gerencial*, *operacional* e *sênior*;
  - `KpiStrip` superior com 4 macro-indicadores em tempo real: Preço de Venda Sugerido (vNF), Margem Líquida Realizada, Carga Tributária Efetiva e Regime Mais Vantajoso, com `tabular-nums` e semáforo fiscal consolidado;
  - Divulgação progressiva: Card 2 (*Rastreabilidade de Entrada, De-Para CFOP e Frete*) encapsulado em `ProgressiveSection` (`minLevel="operacional"`), e Seção 4 (*Transição 2027: Dual-Stack SEFA/PR 48/2026, Simples Híbrido, Mesa de Compras & Combustíveis Ad Rem*) encapsulado em `ProgressiveSection` (`minLevel="senior"`) com expansão pontual sob demanda de 1 clique;
  - `LegalCitationBlock` unificado para fundamentação normativa (CPC 16 R1, LC 214/2025, RICMS/PR Art. 28 Anexo VIII, SEFA/PR 48/2026 e LC 123/2006);
  - `StickyActionBar` fixa no rodapé com CTA primário sólido e inequívoco (`Exportar / Aplicar Tabela` ou `Calcular Preço e Margens`), ações secundárias de laudo e planilha, e região `aria-live="polite"`.
- **Módulo de Cadastro e Gestão de Empresas (`components/CadastroEmpresas.tsx`):**
  - Adoção de `useNivelOperacional` e integração de `ProgressiveSection`;
  - Encapsulamento da barra de monitoramento de infraestrutura / sidecars RFB em `ProgressiveSection` (`minLevel="operacional"`);
  - Encapsulamento de parâmetros fiscais avançados bitemporais (alíquotas efetivas, Simples Híbrido, ROT-ST e Split Payment) em `ProgressiveSection` (`minLevel="senior"`) no formulário de vigência;
  - Acessibilidade WCAG AA: botões de ação e cards com alvos mínimos >= 44px/48px, suporte completo a navegação por teclado (`Enter` e `Space`), e regiões de feedback com `role="status"` e `aria-live="polite"`.
- **Testes Automatizados & Qualidade (DoD):**
  - Nova Suíte 45 de Testes (`tests/ux-precificacao-empresas-niveis.test.mjs`) validando os contratos de props, 3 níveis operacionais, alvos >= 44px e citações legais;
  - Registro da Suíte 45 no orquestrador `scripts/test.mjs`;
  - 100% de conformidade com `node scripts/hookcheck.mjs` (components, app e components/ui);
  - Verificação de tipos via `npm run typecheck` com 0 erros.

### Sub-Etapa 20.4: Refatoração da Aba 5 (Auditoria de Entrada) com Tabela Enxuta de 7 Colunas, ItemDetailDrawer e StickyActionBar
- **Tabela Enxuta de Itens (`components/TabelaItensExtracao.tsx`):**
  - Reestruturação da grade para exatamente 7 colunas (`Item / Cód.`, `Descrição / NCM (Siscomex)`, `CFOP / Destinação`, `Vlr. Operação`, `ICMS / ST / DIFAL`, `Crédito Efetivo`, `Ações`);
  - Formatação e alinhamento de valores com `font-variant-numeric: tabular-nums` e touch targets mínimos de 44px em botões e controles;
  - Integração do `ItemDetailDrawer` (500px no desktop) com foco gerenciado, tecla `Escape` e 4 abas estruturadas: *Tributos*, *DIFAL & ST*, *Créditos (CPC 16 / Não Cumulatividade)* e *Base Legal & Parecer* (com `LegalCitationBlock`);
  - Eliminação de botões concorrentes e redundantes em cada linha da tabela.
- **Painel de Auditoria de Entrada (`components/AuditoriaEntrada.tsx`):**
  - Conexão nativa com `useNivelOperacional` para adaptação fluida de densidade entre níveis *gerencial*, *operacional* e *sênior*;
  - `KpiStrip` superior com 4 macro-indicadores em tempo real: Total de Itens/XMLs, Divergências Críticas, Total ICMS/ST/DIFAL e Crédito Efetivo Estimado;
  - Encapsulamento de camadas avançadas (auditoria RFB, motor RTC bitemporal e detalhes analíticos) em `ProgressiveSection` com expansão local sob demanda;
  - `StickyActionBar` fixa no rodapé estabelecendo a regra de ouro de exatamente 1 CTA primário sólido e inequívoco por estado de tela (`Importar XML` -> `Executar Orquestração Completa` -> `Exportar Laudo Pericial`), complementada por região `aria-live="polite"`.
- **Painel NFS-e e DANFSe Nacional (`components/PainelNfseDanfse.tsx`):**
  - Adaptação completa aos 3 níveis operacionais com alvos de ação >= 44px;
  - Destaque ao CTA primário sólido de emissão (`Gerar DANFSe Oficial (PDF)`) com feedback `aria-busy` e alto contraste;
  - Encapsulamento de custódia XML, dados de RPS e auditoria em `ProgressiveSection`.
- **Testes Automatizados & Qualidade (DoD):**
  - Nova Suíte 44 de Testes (`tests/ux-auditoria-entrada-niveis.test.mjs`) validando contratos estruturais, WCAG AA, e renderização condicional por nível;
  - 100% de conformidade com `node scripts/hookcheck.mjs` (components, app e components/ui);
  - Verificação de tipos via `npm run typecheck` com 0 erros.

### Sub-Etapa 20.3: Hook de Nível Operacional, 6 Componentes UI Reutilizáveis e Refatoração do App Shell
- **Hook Persistente de Nível Operacional (`lib/hooks/useNivelOperacional.ts`):**
  - Implementação de `useNivelOperacional` com os tipos `'gerencial' | 'operacional' | 'senior'`;
  - Persistência em `localStorage` sob a chave `'portela_nivel_operacional_v1'` com fallback gracioso para `'operacional'`;
  - Sincronização multi-abas e reativa via evento customizado `'nivel_operacional_changed'` e nativo `'storage'`;
  - Exposição de `{ nivel, setNivel, isGerencial, isOperacional, isSenior, isHydrated }` com declaração estrita de hooks no topo.
- **6 Componentes Base Reutilizáveis em `components/ui/` com WCAG 2.1 AA:**
  - `NivelOperacionalSwitcher.tsx`: Controle segmentado acessível (`role="radiogroup"`, `role="radio"`, `aria-checked`), navegação por teclado (Setas, Home, End) e alvos com altura mínima >= 44px;
  - `KpiStrip.tsx`: Faixa de indicadores com `font-variant-numeric: tabular-nums`, semáforo fiscal combinando cor + ícone SVG + rótulo textual e barra consolidada de diagnóstico de risco opcional;
  - `StickyActionBar.tsx`: Barra de ação fixa no rodapé da viewport com exatamente 1 CTA primário sólido de alto contraste (alvo >= 44px, `aria-busy`), ações secundárias discretas, resumo contextual e região `aria-live="polite"`;
  - `ProgressiveSection.tsx`: Seção com divulgação progressiva por nível operacional e suporte à expansão sob demanda pontual de 1 clique (`aria-expanded`, `aria-controls`) sem alterar o nível global da aplicação;
  - `ItemDetailDrawer.tsx`: Painel lateral retrátil (500px em desktop) com `role="dialog"`, `aria-modal="true"`, foco acessível, fechamento por `Esc` e abas parametrizáveis;
  - `LegalCitationBlock.tsx`: Bloco semântico de citação e memória de cálculo (RICMS/PR, LC 214/2025, NESH/RGI, Consultas SEFA/PR, ADR003) expandido no nível sênior e colapsável com 1 clique nos demais níveis;
  - `index.ts`: Barrel export unificado para todo o ecossistema `components/ui`.
- **Refatoração do App Shell (`app/page.tsx`):**
  - Substituição do banner inflado por cabeçalho enxuto (~56px) com identidade visual Portela, chip dinâmico da empresa ativa e seletor `NivelOperacionalSwitcher`;
  - Redução do *dead space* vertical de 465px para ~100px, liberando +365px imediatos para tabelas em 1366x768;
  - Barra de navegação compacta (~44px) com alvos de clique acessíveis e região global `aria-live="polite"`;
  - Reserva de altura anti-CLS (`minHeight: 600px`) para mitigar Cumulative Layout Shift durante o carregamento de abas dinâmicas `next/dynamic`.
- **Testes Automatizados & Qualidade (DoD):**
  - Nova Suíte 43 de Testes (`tests/ux-fundacao-componentes.test.mjs`) integrada no `scripts/test.mjs`;
  - 100% de conformidade com `node scripts/hookcheck.mjs` (components, app e components/ui);
  - Verificação de tipos via `npm run typecheck` com 0 erros.

---

## [6.0.0] - 2026-11-22 — Ciclo 6 Concluído: Precisão Numérica RFB ADR003, Motores Sidecars RTC, NFS-e Nacional, Orquestrador DAG e Paridade Oficial
**Período de Execução:** Novembro/2026  
**Responsável Técnico:** Arquiteto Tributário Sênior & Engenheiro Full-Stack TypeScript  
**Status do Ciclo 6:** 7 de 7 Sub-Etapas Concluídas (19.1 a 19.7) | 42 Suítes de Testes Oficiais Aprovadas (100% Passing)

### Sub-Etapa 19.7: Motor de Diagnóstico de Paridade RFB vs. Local, Laudo Pericial Unificado (HTML/TXT) e Fechamento do Ciclo 6 (v6.0.0)
- **Motor de Diagnóstico e Auditoria de Paridade RFB vs. Local (`lib/fiscal/paridade-rfb.ts`):**
  - Implementação da função pura `compararParidadeRtc(resultadoOficialRfb, resultadoLocal, opcoes?)` com precisão `DecimalHalfEven` (ADR003);
  - Comparação item a item de `vBC`, `vIBSUF`, `vIBSMun`, `vIBS`, `vCBS`, `vIS` e `totalTributosRtc`, e totalizadores gerais da nota;
  - Tolerância configurável (padrão `0.00` centavos de divergência admitida);
  - Classificação pericial de causa provável (`ARREDONDAMENTO_HALF_EVEN`, `DIVERGENCIA_BASE_CALCULO`, `DIVERGENCIA_ALIQUOTA_OU_REDUCAO`, `ITEM_NAO_CALCULADO_RFB`);
  - Re-exportação centralizada no barramento fiscal (`lib/engine/index.ts`).
- **Consolidação do Laudo Pericial Unificado (`app/api/auditoria-relatorio/route.ts`):**
  - Extensão do schema Zod com suporte retrocompatível a `orquestracaoDag`, `auditoriaNfse`, `paridadeRfb` e `sha256`;
  - Renderização pericial em HTML com o cabeçalho institucional Portela Contabilidade (`lib/relatorio-header.ts`) e estilização corporativa;
  - Bloco de Auditoria Pericial de NFS-e / DPS Nacional: exibição de identificação, partes, serviço (`cTribNac`, `cNBS`), retenções federais, CIB imobiliário (Art. 265 LC 214/2025), conciliação RTC e diagnóstico de conformidade;
  - Bloco do Orquestrador Fiscal DAG: validação de schema XML (`/xml/validate`), totais RTC, tabela comparativa de créditos tributários em 3 camadas (Destacado XML, Admitido Regra, Efetivado Custo CPC 16), alerta de Split Payment e comparativo dos 4 regimes com destaque do melhor cenário;
  - Bloco de Diagnóstico de Paridade: tabela detalhada de divergências com indicação de causa pericial;
  - Rodapé Técnico de Governança: registro da versão `v6.0.0`, versões dos motores integrados (RTC Regime Regular v1.0, RTC Simples Nacional v1.0, Gerador DANFSE v1.0.0, Motor PR v5.0.0), hash SHA-256 e declaração legal de conformidade com EC 132/2023, LC 214/2025 e LC 227/2025;
  - Sanitização estrita contra XSS: interpolação 100% protegida com `esc()` e Content Security Policy `default-src 'none'; style-src 'unsafe-inline'`;
  - Suporte completo ao formato TXT estruturado para arquivamento contábil e auditoria fiscal em terminal.
- **Integração nas Interfaces de Usuário:**
  - `components/AuditoriaEntrada.tsx`: enriquecimento do payload de exportação com `orquestracaoDag` e `sha256`;
  - `components/PainelNfseDanfse.tsx`: adição de botões para download do Laudo Pericial em HTML e TXT com ordem estrita de hooks (`hookcheck OK`) e acessibilidade WCAG AA.
- **Validação de Infraestrutura e Higiene Multiplataforma:**
  - Script PowerShell `scripts/validar-stack-rfb.ps1` com suporte às flags `-SkipDockerUp` e `-OnlyConfigCheck`, sem uso de `&&`;
  - Criação do arquivo de higienização de quebra de linhas `.gitattributes` (`text=auto eol=lf`, `*.ps1 eol=crlf`).
- **Suíte 42 de Testes Automatizados (`tests/paridade-rfb-relatorio.test.mjs`):**
  - Adição da 42ª suíte ao test runner oficial `scripts/test.mjs`, cobrindo paridade exata HALF_EVEN, detecção e classificação de desvios, emissão de laudo NF-e DAG e NFS-e (HTML e TXT) com sanitização XSS, e integridade dos scripts de infraestrutura.

### Sub-Etapa 19.6: Extração e Auditoria Pericial de NFS-e / DPS Nacional (Reforma NT 004/007/009), Geração Oficial de DANFSe (Go) e Auto-Detecção na UI
- **Extrator Determinístico de NFS-e / DPS Padrão Nacional (`lib/extrator-nfse.ts` e `lib/extrator-nfse-types.ts`):**
  - Implementação de `detectarTipoXmlFiscal(xmlContent)` distinguindo em O(1) entre `NF-e` de mercadorias (`<nfeProc>` / `<NFe>`), `NFS-e Nacional` (`<NFSe>`), `DPS Nacional` (`<DPS>`) e formatos desconhecidos;
  - Extração estrita via `fast-xml-parser` preservando tags vazias (`trimValues: false`), calculando SHA-256 e mapeando todos os nós estruturados inspecionados no repositório oficial Go (`internal/domain/models/models.go`): identificação, prestador, tomador, intermediário, serviço (`cTribNac`, `cNBS`, subitens NT 005 `99.02`, `99.03`, `99.04`), valores legados, retenções federais (`tpRetPisCofins` NT 007) e grupos da Reforma Tributária (`IBSCBS`, `CST`, `cClassTrib`, alíquotas com redução e código CIB);
  - Detecção automática de layouts das Notas Técnicas NT 004, NT 007, NT 008 v1.02 e NT 009.
- **Auditor Fiscal Pericial de NFS-e Nacional (`lib/fiscal/auditoria-nfse.ts`):**
  - Validação preventiva de schema XML: acusação de logradouro do tomador em branco (`<xLgr>`) e código IBGE inválido com severidade `CRITICO`, prevenindo rejeições no Ambiente Nacional;
  - Travas da Reforma Tributária pós-03/08/2026: exigência obrigatória dos grupos de IBS/CBS para prestadores em Regime Regular (NT 004 c/c Art. 47 da LC nº 214/2025);
  - Coerência de retenções federais (NT 007): alerta contra contaminação indevida da base do IBS/CBS por deduções de PIS/COFINS/IRRF retidos;
  - Auditoria de operações imobiliárias e locação de imóveis (`cClassTrib 200027` e subitens `99.03` / `99.04`): verificação de CST `200`, redução de 70% (Art. 261 da LC nº 214/2025) e exigência obrigatória do código CIB (Art. 265 da LC nº 214/2025) sob pena de alerta de risco de malha fina cruzada SINTER/CIB;
  - Conciliação opcional com sidecar `rtc-regime-regular` via precisão `HALF_EVEN` (`lib/math/decimal-fiscal.ts`), apontando eventuais divergências de centavos contra o cálculo oficial da RFB;
  - Segregação de créditos do tomador (PIS/COFINS no Lucro Real vs IBS/CBS com controle de retenção em `AGUARDANDO_EXTINCAO`).
- **Endpoint REST de Auditoria de NFS-e (`app/api/fiscal/auditar-nfse/route.ts`):**
  - Rota `POST /api/fiscal/auditar-nfse` aceitando `multipart/form-data` ou `application/json`;
  - Camada de segurança estrita: rate limit (30 req/min), limite de 5 MB (HTTP 413) e bloqueio anti-XXE (`<!DOCTYPE` / `<!ENTITY`, HTTP 400);
  - Persistência opcional no PostgreSQL 17 / In-Memory (`lib/db/documentos-repository.ts`) com `modelo: 'NFSE'` e compressão GZIP.
- **Aprimoramento do Cliente `rtc-danfse` e API (`lib/integracoes/rtc-danfse/client.ts` e `app/api/rtc/danfse/route.ts`):**
  - Suporte explícito aos parâmetros oficiais `stc` (`0` Válida, `1` Substituída, `2` Cancelada) e `canhoto` (`boolean`);
  - Tratamento resiliente retornando HTTP 503 com `{ error, codigo: 'DANFSE_SIDECAR_OFFLINE', orientacao }` quando o sidecar Go estiver inacessível.
- **Painel Interativo de NFS-e e DANFSe (`components/PainelNfseDanfse.tsx`):**
  - Componente acessível (WCAG AA) com ordem estrita de hooks no topo absoluto (`hookcheck OK`);
  - Apresentação completa dos dados do documento, partes, códigos fiscais, valores e cards de tributos;
  - Lista filtrável de alertas periciais por severidade (`CRITICO`, `ATENCAO`, `INFO`) com base legal explícita;
  - Controles oficiais do DANFSe com seleção de situação (`stc`), toggle de canhoto, geração via backend oficial da RFB, preview seguro por `Blob URL` (com cleanup `URL.revokeObjectURL`) e download do PDF.
- **Auto-Detecção de Documentos na Aba 5 (`components/AuditoriaEntrada.tsx`):**
  - Ao fazer upload de arquivo `.xml`, o componente analisa imediatamente a raiz do documento via `detectarTipoXmlFiscal`;
  - Se `NF-e`: mantém o fluxo clássico de mercadorias (DIFAL/PR, ICMS-ST, Orquestrador DAG);
  - Se `NFS-e` ou `DPS Nacional`: aciona instantaneamente a auditoria pericial e renderiza o `<PainelNfseDanfse />` integrado na mesma tela.
- **Bateria de Testes Automatizados (`tests/auditoria-nfse-danfse.test.mjs`):**
  - Registrada como a 41ª suíte oficial no test runner (`scripts/test.mjs`);
  - 5 testes automatizados cobrindo detecção de tipos, auditoria de locação `200027` com CIB, rejeições preventivas de schema XML, chamada oficial ao `rtc-danfse` com parâmetros e proteção anti-XXE / 5 MB.

### Sub-Etapa 19.5: Orquestrador Fiscal DAG, Endpoint Unificado de NF-e, Reatividade de Empresa Ativa e Integração Completa UI/Auditoria
- **Orquestrador Fiscal DAG (`lib/engine/orquestrador-fiscal.ts`):**
  - Implementação da função pura `orquestrarAnaliseNfeCompleta(input: OrquestracaoNfeInput)` respeitando ordem causal estrita em 6 etapas:
    1. *Extração e Normalização Canônica:* conversão para `DocumentoFiscalNormalizado` com resolução bitemporal determinística do perfil fiscal da empresa ativa no fato gerador;
    2. *Motor Oficial RFB RTC (À Montante):* roteamento inteligente por perfil adquirente (`rtc-simples` para Simples Tradicional vs `rtc-regime-regular` para Regime Geral e Simples Híbrido 2027) com validação de schemas XML (`/xml/validate`);
    3. *Motor Estadual ICMS/PR v5.0.0 (À Jusante):* enriquecimento dos itens com tributos do RTC (vIBS/vCBS/vIS) e injeção na Base Dupla do ICMS conforme Consulta SEFA/PR nº 48/2026 e travas do Art. 28 Anexo VIII, com detecção de desonerações da ST (Decretos 6.048/2024 e 12.828/2026);
    4. *Classificação Tripartida de Créditos:* segregação estrita das 3 camadas (XML, Regra, Efetivado Custo CPC 16) e isolamento da retenção cautelar de IBS/CBS em `AGUARDANDO_EXTINCAO` (LC nº 214/2025, Art. 47);
    5. *Custos CPC 16, Precificação e Comparativo dos 4 Regimes:* cálculo determinístico de mark-up divisor com `DecimalHalfEven` para `SIMPLES_TRADICIONAL`, `SIMPLES_HIBRIDO_2027`, `LUCRO_PRESUMIDO` e `LUCRO_REAL`, elegendo justificadamente o melhor cenário de menor desembolso ou maior margem;
    6. *Persistência Auditável e Idempotente:* gravação relacional dual-mode (PostgreSQL 17 / In-Memory) com captura tolerante de duplicidade em `(empresa_id, chave_acesso)` e registro imutável em `execucoes_motores`.
- **Endpoint Unificado da API (`app/api/fiscal/orquestrar-nfe/route.ts`):**
  - `POST /api/fiscal/orquestrar-nfe` suportando tanto `multipart/form-data` (upload de arquivo XML) quanto `application/json` (string XML ou extracao prévia);
  - Camada de segurança anti-XXE estrita bloqueando entidades externas (`<!DOCTYPE` / `<!ENTITY`), limite de payload de 5 MB (HTTP 413) e rate limit de 30 requisições/minuto (HTTP 429);
  - Validação estrita de parâmetros via schema Zod e tratamento estruturado de erros com telemetria de latência.
- **Hook Reativo de Empresa Ativa (`lib/hooks/useEmpresaAtiva.ts`):**
  - Gerenciamento reativo da chave `portela_empresa_ativa_v1` no `localStorage`;
  - Suporte a sincronização cross-tab via evento `storage` e eventos na mesma aba via `CustomEvent('empresa_ativa_changed')`;
  - Prevenção ativa de mismatch de hidratação SSR (`isHydrated: boolean`) e carregamento automático do perfil fiscal vigente no fato gerador via `/api/empresas/[id]/perfil-vigente`.
- **Integração na UI de Auditoria de Entrada (`components/AuditoriaEntrada.tsx`):**
  - Ordem estrita de React Hooks no topo absoluto do componente antes de qualquer retorno condicional (`hookcheck OK`);
  - Banner informativo da empresa ativa selecionada com acesso rápido de troca;
  - Seletor dinâmico de status de extinção RTC (LC 214/2025, Art. 47: `SIMULACAO_PROJETADA`, `EXTINTO_SPLIT`, `AGUARDANDO_EXTINCAO`, `EXTINTO_PAGAMENTO`);
  - Botão de execução da Orquestração Completa DAG com 3 novos painéis interativos:
    1. *Status RFB RTC & Validação XML:* observabilidade de latência, versão do sidecar e conformidade de schemas;
    2. *Auditoria de Créditos em 3 Camadas:* comparativo lado a lado de Destacado XML vs Admitido Regra vs Efetivado Custo (CPC 16) com alerta destacado de retenção em `AGUARDANDO_EXTINCAO`;
    3. *Comparativo dos 4 Regimes:* cards de viabilidade comparando CMV Líquido, Tributos de Saída e Preço Sugerido com selo de melhor cenário e botão de transferência direta do custo efetivo para a aba de Precificação.
- **Integração na UI de Precificação (`components/Precificar.tsx`):**
  - Integração do hook `useEmpresaAtiva()` no topo absoluto do componente com ordem estrita de hooks (`hookcheck OK`);
  - Banner de empresa ativa com sincronização automática do regime de apuração e toggle automático da Consulta SEFA/PR nº 48/2026;
  - Interoperabilidade com o botão de precificação da aba de Entrada.
- **Suíte de Testes Automatizados (`tests/orquestrador-fiscal-dag.test.mjs`):**
  - Registrada como a 40ª suíte oficial no test runner (`scripts/test.mjs`);
  - 5 testes automatizados cobrindo:
    1. *Ordem Causal 2027 (DAG):* RTC alimenta DIFAL PR na Base Dupla com IBS/CBS da Consulta 48/2026 (R$ 114,73) vs Tese Judicial (R$ 93,17);
    2. *Roteamento Bitemporal:* Simples Tradicional em 2026 via `rtc-simples` vs Simples Híbrido em 2027 via `rtc-regime-regular`;
    3. *Validação XML:* detecção e bloqueio de schemas inconsistentes da Reforma pelo sidecar oficial;
    4. *Créditos em 3 Camadas:* retenção cautelar de R$ 89,00 em `AGUARDANDO_EXTINCAO` vs apropriação no CMV em `EXTINTO_SPLIT` e ranking dos 4 regimes;
    5. *Persistência Idempotente:* execução duplicada da mesma nota sem violar integridade relacional, mantendo 1 único documento e 2 execuções de motor.

### Sub-Etapa 19.4: Camada de Persistência Relacional PostgreSQL 17, Motor Bitemporal Multi-Tenant e Gestão de Clientes/Perfis
- **Schema Relacional PostgreSQL 17 (`db/migrations/0001_schema_fiscal_portela.sql`):**
  - DDL com 15 tabelas multi-tenant estruturadas hierarquicamente com `escritorio_id UUID NOT NULL REFERENCES escritorios(id)` e `empresa_id UUID NOT NULL REFERENCES empresas(id)`;
  - Tipagem monetária exata `NUMERIC(18,2)` para bases e valores e `NUMERIC(18,6)` / `NUMERIC(8,6)` para alíquotas e fatores;
  - Tabela de controle de concorrência e integridade `_schema_migrations` com hash SHA-256 idempotente;
  - Armazenamento compactado de XML original em coluna `BYTEA` (`xml_bruto_gzip`) reduzindo footprint de storage;
  - Registro de auditoria imutável de execuções de motores (`execucoes_motores`) e seed determinístico do escritório padrão `00000000-0000-4000-8000-000000000001`.
- **Cliente PostgreSQL e Script de Migração (`lib/db/client.ts` e `scripts/db-migrate.mjs`):**
  - Pool singleton `pg.Pool` configurável via `DATABASE_URL` com suporte a SSL inteligente para Supabase (`sslmode=require`, `rejectUnauthorized: false`);
  - Probes de saúde relacional com latência e versão (`checkDatabaseHealth`);
  - Script idempotente `scripts/db-migrate.mjs` integrado ao `package.json` (`npm run db:migrate`), com transações atômicas `BEGIN/COMMIT/ROLLBACK` e fallback tolerante a ambiente local sem banco ativo.
- **Motor Bitemporal e Validação Cadastral (`lib/fiscal/perfil-tributario.ts`):**
  - Validador algorítmico real de CNPJ (`validarCnpj`) com verificação matemática dos 2 dígitos verificadores e rejeição de repetidos;
  - Schemas Zod `EmpresaInputSchema` e `PerfilTributarioInputSchema`;
  - Funções puras bitemporais: `validarSobreposicaoVigencias` (com detecção de colisão e encerramento automático do anterior), `resolverPerfilVigenteNaData` e `mapearPerfilParaContextoAuditoria` (para alimentar motores DIFAL/PR e RTC).
- **Repositórios Dual-Mode (`lib/db/empresas-repository.ts` e `lib/db/documentos-repository.ts`):**
  - Suporte transparente a PostgreSQL 17 e In-Memory Fallback quando `DATABASE_URL` ausente;
  - Prevenção de documentos fiscais duplicados com trava única em `(empresa_id, chave_acesso)` e exceção `ErroDocumentoDuplicado`;
  - Compressão e descompressão gzip transparente com verificação de integridade SHA-256;
  - Registro cronológico imutável de execuções de motores.
- **Rotas REST da Camada de Empresas e Perfis (`app/api/empresas/*`):**
  - `GET /api/empresas` e `POST /api/empresas` (cadastro com proteção contra CNPJ duplicado 409);
  - `GET /api/empresas/[id]` e `PATCH /api/empresas/[id]`;
  - `GET /api/empresas/[id]/perfis` e `POST /api/empresas/[id]/perfis` (com tratamento bitemporal e trava de sobreposição 409);
  - `GET /api/empresas/[id]/perfil-vigente` (resolução determinística de perfil em data de fato gerador com mapeamento para auditoria).
- **Interface Acessível e Seletor de Cliente Ativo (`components/CadastroEmpresas.tsx`):**
  - Conformidade estrita à ordem de React Hooks no topo absoluto (`scripts/hookcheck.mjs`);
  - Seletor de empresa ativa com persistência em `localStorage` (`portela_empresa_ativa_v1`) e evento global `empresa_ativa_changed`;
  - Badges de conectividade do banco de dados e dos 3 sidecars RTC da Receita Federal;
  - Formulário bitemporal com toggles do Simples Híbrido 2027, Art. 28 RICMS/PR, ROT-ST, Split Payment e timeline de vigências;
  - Integrado à aba principal de `app/page.tsx` (`0 · Clientes & Perfis`).
- **Suíte de Testes Automatizados (`tests/persistencia-perfil-bitemporal.test.mjs`):**
  - 6 testes cobrindo validação algorítmica de CNPJ, validação bitemporal de sobreposição, resolução determinística na data, mapeamento para contexto de auditoria, integridade de compressão GZIP/SHA-256 e duplicidade de chave, e auditoria imutável de motores (registrada como a 39ª suíte oficial no test runner).

### Sub-Etapa 19.3: Clientes HTTP Tipados, Resiliência e Rotas de Integração dos Motores Oficiais RFB (RTC & DANFSe)
- **Camada de Resiliência e Monitoramento (`lib/integracoes/rfb-health.ts`):**
  - Leitura centralizada de variáveis de ambiente com defaults seguros (`RTC_REGIME_REGULAR_URL`, `RTC_SIMPLES_URL`, `RTC_DANFSE_URL`, `RTC_MODE`, `RTC_TIMEOUT_MS`);
  - Circuit Breaker em memória por serviço (`CLOSED | OPEN | HALF_OPEN`), abrindo após 3 falhas consecutivas de rede/5xx com cooldown de 30s e reset automático no primeiro sucesso;
  - Executor resiliente `executarChamadaRfb` com timeout via `AbortController`, medição de `duracaoMs` e normalização de erros RFC 7807 (`ProblemDetail`) e Echo JSON em `ErroIntegracaoRfb`;
  - Função `consultarStatusServicosRfb` com probes paralelos (`Promise.allSettled`) contra os endpoints de versão dos 3 sidecars.
- **Cliente Oficial `rtc-regime-regular` (`lib/integracoes/rtc-regime-regular/`):**
  - Schemas Zod (`schema.ts`) e mapper canônico (`mapper.ts`) convertendo `DocumentoFiscalNormalizado` para o leiaute oficial `OperacaoInput`;
  - Normalizador com Banker's Rounding `HALF_EVEN` (`normalizer.ts`), preservando alíquotas e valores de IBS UF, IBS Mun, CBS e IS;
  - Métodos `calcularRegimeRegularRfb` (`POST /api/calculadora/regime-geral`), `gerarXmlGruposRtcRfb` (`POST /api/calculadora/xml/generate`) e `validarXmlRtcRfb` (`POST /api/calculadora/xml/validate`);
  - Método `calcularRegimeRegularComFallback` com estimativa determinística local transparente quando `RTC_MODE === 'hybrid_fallback'` e erro 503 em `strict_rfb`.
- **Cliente Oficial `rtc-simples` (`lib/integracoes/rtc-simples/`):**
  - Schemas Zod (`schema.ts`) para `OperacaoSimplesNaoAssistidaInput`, `AliquotasEfetivasInput` e `ItemSimplesUnificadoInput`;
  - Mapper (`mapper.ts`) e normalizador (`normalizer.ts`) preservando cálculo item a item (`CALCULADO`, `CALCULO_SIMULADO`, `INCONSISTENCIA_ENTRADA`) sem derrubar a nota inteira;
  - Métodos `calcularSimplesNacionalRfb` (`POST /api/calculadora/observabilidade/simples-nacional/nao-assistido`) e `listarAtividadesSimplesRfb` com cache em memória TTL de 30 minutos (sem cachear erros);
  - Método `calcularSimplesNacionalComFallback` com suporte bimodal a fallback.
- **Cliente Oficial `rtc-danfse` (`lib/integracoes/rtc-danfse/`):**
  - Validação estrita de XML (`schema.ts`) com limite de 5 MB, verificação de tags fiscais e trava anti-XXE (rejeitando `<!DOCTYPE` e `<!ENTITY`);
  - Método `gerarDanfsePdfRfb` (`client.ts`) consumindo `POST /api/danfse`, validando assinatura `%PDF-` e retornando buffer binário.
- **Rotas Internas Next.js (`app/api/rtc/*`):**
  - `GET /api/rtc/status`: painel de saúde em tempo real dos motores;
  - `POST /api/rtc/calcular-regular`: cálculo do regime geral com rate limit (30 req/min) e fallback;
  - `POST /api/rtc/calcular-simples`: cálculo não assistido do Simples com rate limit e tratamento de erros por item;
  - `GET /api/rtc/atividades-sn`: catálogo de `cAtivSN` cacheado com suporte a filtros de texto, vigência e anexos;
  - `POST /api/rtc/validar-xml`: validação XSD com trava 5MB (413) e bloqueio anti-XXE (400);
  - `POST /api/rtc/danfse`: renderização e download do DANFSe com `Content-Disposition: inline` e `X-Content-Type-Options: nosniff`.
- **Suíte de Testes Automatizados (`tests/integracao-rfb-rtc.test.mjs`):**
  - 6 cenários cobrindo normalização HALF_EVEN, ProblemDetail RFC 7807, cache TTL de atividades, Circuit Breaker (OPEN), modos `hybrid_fallback`/`strict_rfb`, travas de segurança e validação de PDF (registrada como a 38ª suíte oficial no test runner).

### Sub-Etapa 19.2: Arquitetura de Containers Sidecars e Governança dos Motores Oficiais RFB (RTC & DANFSe)
- **Manifesto de Governança RFB (`services/rfb-manifest.json`):**
  - Registro canônico e rastreabilidade dos 3 repositórios oficiais da Receita Federal do Brasil:
    - `calculadora-rtc-regime-regular` (commit fixado `f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4`, Java 25 / Spring Boot 4, porta 8080, management 9101, contexto `/api`, healthcheck `/api/calculadora/dados-abertos/versao`);
    - `calculadora-rtc-simples-nacional` (commit fixado `a926d5a76095ac0295a6612a9a54db7ffead2396`, Java 25 / Spring Boot 4, porta 8082, management 9103, contexto `/api`, healthcheck `/api/versao`);
    - `calculadora-rtc-gerador-danfse` (commit fixado `8d79e6b2f7fad6375340afcb51c85ed370c64a14`, Tag `1.0.0`, Go 1.x / Echo v5, porta 8084, healthcheck `/health/live` e `/health/ready`).
  - Especificação formal de parâmetros de datasource SQLite (`mode=ro&date_class=TEXT&date_string_format=yyyy-MM-dd`), teto JVM `-Xms256m -Xmx768m -XX:+UseG1GC` e isolamento de rede `fiscal_net`.
- **Init-Container Gerador do Banco SQLite (`services/rtc-db-builder/`):**
  - Criação de `Dockerfile` e script entrypoint `build-sqlite.sh` em container leve `alpine:3.20` com `sqlite3`, `bash` e `coreutils`;
  - Execução estruturada da esteira Flyway do regime regular: baseline `B0001`, callbacks `beforeMigrate` e `afterMigrate`, e todas as migrações versionadas `V0002` até `V0073+`;
  - Otimização com `VACUUM; PRAGMA optimize;`, criação de alias retrocompatível `calculadora-pro.db`, geração de checksum `rtc-oficial.db.sha256` e metadados JSON `meta-rtc.json` com permissão estrita `chmod 644`.
- **Containers Multi-Stage dos Motores Java (`services/rtc-regime-regular/Dockerfile` e `services/rtc-simples/Dockerfile`):**
  - Stage de compilação com `eclipse-temurin:25-jdk-alpine` e runtime minimal com `eclipse-temurin:25-jre-alpine`;
  - Execução sob usuário não-root `appuser:appgroup`, perfil `offline`, datasource SQLite em modo somente leitura (`mode=ro`), teto estrito de heap de 768MB e `HEALTHCHECK` automatizado.
- **Container do Gerador de DANFSe (`services/rtc-danfse/Dockerfile`):**
  - Multi-stage em Go (`golang:1.24-alpine` -> `alpine:3.20`), geração de Swagger UI, compilação estática (`CGO_ENABLED=0`), porta `8084` e probe `/health/live`.
- **Orquestração e Isolamento de Rede (`docker-compose.yml` e `.env.example`):**
  - Criação da rede interna `fiscal_net` (`bridge`), garantindo isolamento total (nenhuma porta dos sidecars `8080`, `8082`, `8084`, `5432` exposta no host; apenas `mcm-web` mapeia `3000:3000`);
  - Inclusão do banco primário `postgres:17-alpine` com probe `pg_isready`;
  - Volumes persistentes `postgres_data` e `rtc_sqlite_data` (montado `:ro` nos serviços Java);
  - Script auxiliar `scripts/sync-rfb-sources.ps1` com detecção inteligente de cache local em `_inspecao_rfb_rtc` e fallback para clone Git oficial, ignorando `.upstream` no `.gitignore`.
- **Suíte de Testes Estruturais (`tests/rfb-infra-config.test.mjs`):**
  - Validação automatizada de integridade do manifesto, ausência de portas públicas para sidecars, teto de heap de 768MB e volume `:ro` (registrado como 37ª suíte oficial no test runner).

### Sub-Etapa 19.1: Precisão Numérica ADR003 (HALF_EVEN), Motor Tripartido de Créditos & Documento Normalizado
- **Camada Numérica ADR003 (`lib/math/decimal-fiscal.ts`):**
  - Implementação de instâncias isoladas de `decimal.js` com Banker's Rounding (`ROUND_HALF_EVEN`) e 28 dígitos de precisão;
  - Funções de arredondamento monetário estrito (`arredondarMoedaRfb`, `arredondarMoedaRfbNum`), precisão de alíquotas (`arredondarAliquotaRfb`) e fechamento de totais item a item (`somarDecimaisRfb`).
- **Motor de Classificação Tripartida de Créditos (`lib/fiscal/credito-tributario.ts`):**
  - Segregação fiscal estrita em 3 camadas:
    - **Camada 1 (`destacadoXml`):** Registro imutável dos tributos originais da NF-e;
    - **Camada 2 (`creditoAdmitidoRegra`):** Filtro legal por regime tributário e destinação (vedação em uso/consumo e ST, bloqueio de crédito em fornecedor Simples Nacional PR isento Art. 26 § 15 III "a" RICMS/PR, estorno Anexo VI, CIAP 1/48 avos para ativo imobilizado, não cumulatividade plena de IBS/CBS exceto uso pessoal Art. 57 LC 214/25);
    - **Camada 3 (`creditoEfetivadoCusto`):** Créditos efetivamente dedutíveis do CMV segundo CPC 16 / NBC TG 16, condicionando IBS/CBS à extinção do débito pelo fornecedor (Art. 47 LC 214/2025).
- **Refatoração de `converterItemExtracaoParaPrecificacao` (`lib/extrator-nfe-types.ts`):**
  - Preenchimento seguro de créditos fiscais consumindo a Camada 3 (`creditoEfetivadoCusto`), eliminando apropriação indevida de PIS/COFINS no Lucro Presumido e de ICMS em mercadorias com ST ou uso/consumo, anexando `auditoriaCreditos`.
- **Contrato Canônico Normalizado (`lib/fiscal/documento-normalizado.ts`):**
  - Definição de `DocumentoFiscalNormalizado` e função `normalizarExtracaoNfe` com geração de hash SHA-256 e dupla representação de valores (string decimal fixo para mensageria RTC e número flutuante para interface).
- **Suíte de Testes:** `tests/credito-tripartido-decimal.test.mjs` (6 testes numéricos rigorosos, 100% aprovados).

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
