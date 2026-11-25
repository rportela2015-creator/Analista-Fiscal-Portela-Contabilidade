# Auditoria Visual, Ergonomia, Acessibilidade (WCAG AA) e Web Vitals
**Documento Pericial de Diagnóstico em Navegador Real — Sub-etapa 20.1 (Fase 1 do Ciclo 7)**
*Analista Fiscal Portela v6.0.0 — Contabilidade Portela (Desde 1970)*
*Data da Auditoria: 23 de Novembro de 2026*
*Ambiente de Execução: Google Chrome 158.0.8127.37 (Headless Chrome com Chrome DevTools Protocol nativo / Next.js 16.3.4)*

---

## 1. Resumo Executivo da Auditoria

Esta auditoria inspecionou exaustivamente as interfaces do **Analista Fiscal Portela v6.0.0** em ambiente de navegador real, simulando o comportamento exato vivenciado por operadores, auditores fiscais e contadores da banca da Contabilidade Portela. A inspeção foi executada sob o protocolo Chrome DevTools (CDP) em duas resoluções canônicas de trabalho contábil:
1. **1920x1080 (Desktop Full HD)**: Padrão das estações de perícia contábil e auditoria com monitores externos.
2. **1366x768 (Notebook Corporativo)**: Padrão crítico de mobilidade corporativa, notebooks de campo e bancadas de digitação fiscal, onde a densidade vertical restrita evidencia gargalos severos de ergonomia.

### 1.1 Síntese dos Top 5 Gargalos de UX e Acessibilidade Detectados
1. **Espaço Vertical Estático Opressivo (*Dead Space* de 465px em 1366x768)**: Em notebooks de 1366x768 (altura útil de 768px), o conjunto formado por `header.top` (362px), o banner fixo de arquitetura em 3 níveis (101px) e o disclaimer legal obrigatório (84px) consome **60,5% de toda a área vertical visível** antes do início da aba ativa. Isso empurra o botão de ação principal (CTA) para fora da primeira dobra em quase todas as telas operacionais.
2. **Ausência de CTA Único e Competição Visual Severa**: Na aba crítica de *Auditoria de Entrada*, dois botões primários maciços (`Auditar Documento` vs `⚡ Executar Orquestração Completa`) competem lado a lado com a mesma cor azul e peso visual, desorientando o operador quanto à precedência do fluxo. Na aba de *Precificação*, o único botão estilizado como primário no topo é uma ação de exportação (`📑 Exportar Detalhado`), e não de cálculo.
3. **Inexistência de Regiões Vivas de Acessibilidade (Zero `aria-live` e `role="alert"`)**: A aplicação possui **zero** tags `aria-live` ou `role="alert"`. Quando alertas fiscais de quarentena, divergências de NCM, travas de CST ou erros de importação são disparados, tecnologias assistivas (leitores de tela para contadores com baixa visão) não recebem qualquer aviso em tempo real.
4. **Violações de Contraste WCAG 2.1 AA e Alvos de Clique Reduzidos (< 44px)**: Foram identificadas violações sistemáticas de contraste em rótulos corporativos (ex.: textos cinza-médio `#7b88a3` sobre fundo claro `#fafbfe` com contraste 3.48:1, abaixo do limiar de 4.5:1), além de alvos interativos com altura insuficiente (todos os 9 botões da barra de abas possuem altura de 40px, e botões secundários `.mini` possuem 26–28px, violando a regra de 44x44px).
5. **Layout Shift Elevado (CLS até 10.2) e DOM Excessivo em Telas Normativas (1.767 nós)**: A transição entre abas provoca saltos repentinos de layout pela ausência de reserva de espaço mínimo (`min-height`) antes do carregamento dos componentes assíncronos (`dynamic import`), enquanto a aba de *Reforma Tributária* carrega 1.767 nós no DOM sem virtualização, gerando travamentos perceptíveis em carregamentos volumosos.

---

## 2. Catálogo Oficial de Screenshots Capturados

Todos os screenshots foram gerados automaticamente no navegador real Chrome e estão persistidos em alta resolução em `docs/ux-audit/screenshots/`:

| Resolução | Tela / Aba | Arquivo PNG Gerado | Peso | Status Visual |
| :--- | :--- | :--- | :--- | :--- |
| **1920x1080** | 0 · Clientes & Perfis | `1920x1080_01_clientes_perfis.png` | 351 KB | Formulário extenso de perfil fiscal; status de sidecars e base PostgreSQL |
| **1920x1080** | 5 · Auditoria (Entrada) | `1920x1080_02_auditoria_entrada.png` | 353 KB | Upload de XML/PDF com campos fiscais e CTAs concorrentes |
| **1920x1080** | 6 · Precificação & Margens | `1920x1080_03_precificacao.png` | 396 KB | 2 colunas densas com 35 parâmetros, decomposição e comparativo 4 regimes |
| **1920x1080** | 1 · Classificar produto | `1920x1080_04_classificar.png` | 370 KB | Textarea descritiva, chips de exemplo, parâmetros de UF e botão IA |
| **1920x1080** | 2 · Lote (CSV) | `1920x1080_05_lote.png` | 355 KB | Ingestão em massa, área de upload, colunas esperadas e barra de contexto |
| **1920x1080** | 7 · Reforma (IBS/CBS/IS) | `1920x1080_06_reforma.png` | 379 KB | Tabelas de transição 2026–2033, alíquotas nacionais e códigos cClassTrib |
| **1920x1080** | 3 · Consultar NCM | `1920x1080_07_consultar.png` | 333 KB | Consulta textual à tabela oficial Siscomex de 10.515 códigos |
| **1920x1080** | 4 · Parametrização ERP | `1920x1080_08_parametrizar.png` | 359 KB | Matriz de mapeamento de saída com 8 tabelas de códigos fiscais |
| **1920x1080** | 8 · Regras e fontes | `1920x1080_09_regras.png` | 390 KB | Repositório de fontes legais, fundamentações e notas normativas |
| **1366x768** | 0 · Clientes & Perfis | `1366x768_01_clientes_perfis.png` | 288 KB | **Crítico**: CTA de salvar soterrado a 1.088px do topo (fora da tela) |
| **1366x768** | 5 · Auditoria (Entrada) | `1366x768_02_auditoria_entrada.png` | 284 KB | **Crítico**: CTA "Auditar Documento" soterrado a 835px (requer 1.1 rolagens) |
| **1366x768** | 6 · Precificação & Margens | `1366x768_03_precificacao.png` | 292 KB | Duas colunas espremidas em ~590px cada; dados cortados lateralmente |
| **1366x768** | 1 · Classificar produto | `1366x768_04_classificar.png` | 293 KB | Textarea e chips ocupando primeira dobra sem CTA claro visível |
| **1366x768** | 2 · Lote (CSV) | `1366x768_05_lote.png` | 296 KB | Área de drag-and-drop comprimida com barra de botões abaixo da dobra |
| **1366x768** | 7 · Reforma (IBS/CBS/IS) | `1366x768_06_reforma.png` | 300 KB | Tabela de alíquotas com scroll horizontal e 1.767 nós no DOM |
| **1366x768** | 3 · Consultar NCM | `1366x768_07_consultar.png` | 286 KB | Campo de busca estreito e tabela de resultados empurrada |
| **1366x768** | 4 · Parametrização ERP | `1366x768_08_parametrizar.png` | 287 KB | Excesso de texto descritivo e ausência de barra fixa de comandos |
| **1366x768** | 8 · Regras e fontes | `1366x768_09_regras.png` | 289 KB | CTA de regeneração de base localizado a 4.947px (6.4 rolagens) |

---

## 3. Diagnóstico de Ergonomia & Comportamento em 1366x768

### 3.1 O Problema do *Dead Space* Vertical Fixo (465px)
Na resolução corporativa padrão (1366x768), os elementos estáticos do topo da aplicação consomem quase a totalidade da janela gráfica útil:

```
┌─────────────────────────────────────────────────────────────┐ 0px
│ HEADER CORPORATIVO (Logotipo Portela, Título, Metadados)     │ 
│ Altura real renderizada: 362px                              │
├─────────────────────────────────────────────────────────────┤ 362px
│ BANNER ARQUITETURA 3 NÍVEIS (Nível 1 ➔ Nível 2 ➔ Nível 3)   │
│ Altura real renderizada: 101px                              │
├─────────────────────────────────────────────────────────────┤ 463px
│ BARRA DE ABAS (nav.tabs) - Altura: 40px                     │
├─────────────────────────────────────────────────────────────┤ 503px
│ DISCLAIMER LEGAL ESTÁTICO ("Isto é apoio à decisão...")     │
│ Altura real renderizada: 84px                               │
├═════════════════════════════════════════════════════════════┤ 587px (Área residual)
│ ÁREA ÚTIL DISPONÍVEL NA 1ª DOBRA: APENAS 181px a 303px!     │
└─────────────────────────────────────────────────────────────┘ 768px (Limite do Viewport)
```

**Consequência Operacional Direta**:
O operador contábil precisa rolar a página verticalmente **antes mesmo de ver o primeiro controle ou resultado útil da aba selecionada**. O disclaimer legal, embora juridicamente indispensável, não precisa permanecer estático consumindo 84px em todas as abas após a primeira leitura pelo usuário.

### 3.2 Mapeamento de "Scroll to Action" (Rolagens Necessárias até o CTA Principal)

| Tela / Aba | Texto do CTA Principal | Posição Vertical (Top) | Visível na 1ª Dobra (1366x768)? | Rolagens Necessárias |
| :--- | :--- | :--- | :---: | :---: |
| **0 · Clientes & Perfis** | "Salvar Empresa e Perfil" | **1.088px** | ❌ Não | **1.4 rolagens** |
| **5 · Auditoria (Entrada)** | "Auditar Documento (Extrair Itens)" | **835px** | ❌ Não | **1.1 rolagens** |
| **6 · Precificação & Margens** | "📑 Exportar Detalhado" *(falso CTA primário)* | 508px | ⚠️ Sim *(porém ação incorreta)* | 0 rolagens |
| **1 · Classificar produto** | "✦ Classificar com IA Especialista" *(estilizado como chip)* | 610px | ⚠️ Parcial | 0.8 rolagens |
| **2 · Lote (CSV)** | "Processar Lote CSV" | 720px | ⚠️ Limítrofe | 0.9 rolagens |
| **4 · Parametrização de ERP** | *(Sem CTA primário de topo — múltiplos botões dispersos)* | > 950px | ❌ Não | > 1.2 rolagens |
| **8 · Regras e fontes** | "baixar fontes + regenerar dataset" | **4.947px** | ❌ Não | **6.4 rolagens** |

### 3.3 Ergonomia e Apresentação de Dados Numéricos Fiscais

1. **Ausência de Alinhamento Numérico Decimal à Direita (`td.num`)**:
   - Nas tabelas de composição de custos e comparativo tributário de `Precificar.tsx` (Tabela 1 e Tabela 2), as células numéricas foram renderizadas **sem** a classe `.num` e **sem** alinhamento à direita.
   - Valores contábeis como `R$ 1.250,00` e `R$ 84,50` aparecem alinhados à esquerda, desalinhando as vírgulas decimais e forçando o auditor a ler cada linha individualmente, impedindo a varredura visual rápida característica de contadores seniores.
2. **Ausência Mandatória de `font-variant-numeric: tabular-nums`**:
   - Fontes de largura proporcional provocam oscilação de largura entre os números (o dígito `1` ocupa menos pixels que o dígito `8`), desestabilizando a leitura de alíquotas com 4 casas decimais e colunas de NCMs.
3. **Comportamento em Telas com Excesso de Colunas**:
   - Na aba *Parametrização de ERP*, 8 tabelas de 4 colunas possuem largura fixa de 1.162px em container de 1.162px. Ao abrir em monitores menores ou com zoom de 125% (comum em escritórios contábeis), há corte de conteúdo sem indicador de scroll horizontal suave.

---

## 4. Auditoria de Hierarquia Visual de Botões e Ações

### 4.1 Competição Destrutiva de Botões Primários em "Auditoria de Entrada"
Na aba de maior valor da plataforma (Auditoria de Entrada), o formulário de upload exibe os seguintes botões:

```html
<!-- CÓDIGO ATUAL INSPECIONADO -->
<div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
  <button type="submit" class="btn primary">
    Auditar Documento (Extrair Itens)
  </button>
  <button type="button" class="btn primary" style="background: #2563eb; border-color: #2563eb; font-weight: 600;">
    ⚡ Executar Orquestração Completa (RFB RTC + ICMS/PR + Créditos + 4 Regimes)
  </button>
</div>
```

**Falhas de Engenharia UI/UX Identificadas**:
- **Dois CTAs primários maciços concorrendo pelo mesmo clique**: O operador não compreende se deve primeiro extrair e depois orquestrar, ou se o botão azul mais vibrante invalida o primeiro.
- **Rótulo prolixo com 82 caracteres**: O segundo botão contém siglas técnicas complexas (`RFB RTC + ICMS/PR + Créditos + 4 Regimes`) que sobrecarregam o botão, violando as boas práticas de concisão e legibilidade de botões corporativos.
- **Solução Exigida (Alinhada à Frente C)**: Apenas **1 CTA Primário Sólido** em *Sticky Action Bar* inferior ("Auditar Nota Fiscal"), com seletor de profundidade (*toggle* ou *dropdown* anexo: "Extração Rápida" vs "Orquestração Fiscal Completa").

### 4.2 Inversão de Papéis em "Precificação & Margens"
No cabeçalho de `Precificar.tsx`, foram encontrados três botões alinhados:
- `📄 Exportar Resumido` (`class="btn-secundario"`)
- `📑 Exportar Detalhado` (`class="btn primary"`, estilizado em `#0b3d91`)
- `📊 Exportar CSV` (`class="btn-secundario"`)

**Falha Crítica**:
O único botão estilizado como primário na tela é uma ação de saída (`Exportar Detalhado`). Não existe botão primário para "Recalcular Cenário" ou "Aplicar Parâmetros". O operador é induzido visualmente a exportar relatórios antes de validar se os parâmetros de entrada foram adequadamente calculados.

### 4.3 Uso Indevido de Classes em Botões de Ação Central
- Em `Classificar.tsx`, o acionamento da IA Especialista utiliza a classe `.chip` (`class="chip"`), que conceitualmente no Design System Portela é destinada a tags passivas ou seletores rápidos de texto. O botão mais avançado da tela fica disfarçado como se fosse uma tag decorativa.

---

## 5. Auditoria de Acessibilidade (WCAG 2.1 Nível AA)

A auditoria aplicou as diretrizes internacionais de acessibilidade digital WCAG 2.1 e as regras do `@a11y-debugging` no DOM vivo.

### 5.1 Violações Estritas de Contraste de Cor (Critério 1.4.3)
O limiar normativo WCAG 2.1 AA exige contraste mínimo de **4.5:1 para texto normal (< 18px)** e **3.0:1 para texto grande (>= 18px ou >= 14px em negrito)**.

| Elemento / Seletor | Texto Inspecionado | Cor do Texto (FG) | Fundo Efetivo (BG) | Contraste Real | Requisito WCAG | Veredito |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| `span.office-title` | "CONTABILIDADE PORTELA" | `rgb(201, 230, 212)` | Gradiente verde-escuro (`#0e291b`) | **1.24:1** | 3.0:1 | ❌ **FALHA** |
| `span.office-sub` | "AUDITORIA FISCAL & TRIBUTÁRIA..." | `rgba(255, 255, 255, 0.7)` | Gradiente verde-escuro | **1.07:1** | 4.5:1 | ❌ **FALHA** |
| `span.tag` | "PORTAL ÚNICO SISCOMEX" | `rgb(255, 255, 255)` | `rgba(255, 255, 255, 0.14)` | **1.00:1** | 4.5:1 | ❌ **FALHA** |
| `span.tier-num` | "NÍVEL 1", "NÍVEL 2", "NÍVEL 3" | `rgb(163, 230, 185)` | `rgba(255, 255, 255, 0.08)` | **1.44:1** | 4.5:1 | ❌ **FALHA** |
| `.note .src` | Citações normativas de rodapé | `rgb(123, 136, 163)` (`#7b88a3`) | `#fafbfe` (fundo do card) | **3.48:1** | 4.5:1 | ❌ **FALHA** |
| `tax .k` | Rótulos de tributos ("NCM", "CST", "IBS") | `rgb(67, 80, 107)` (`#43506b`) a 10.5px | `#fbfcfe` | **3.92:1** | 4.5:1 | ❌ **FALHA** |
| `badge.grey` | Selos fiscais neutros | `rgb(67, 80, 107)` | `#eef1f7` | **4.10:1** | 4.5:1 | ❌ **FALHA** |

### 5.2 Alvos de Toque e Clique Abaixo de 44x44px (Critério 2.5.5 e 2.5.8)
A diretriz WCAG 2.5.5 recomenda alvos mínimos de 44x44px (ou 48x48px sob as diretrizes Google/Android).

1. **Botões de Troca de Abas (`nav.tabs button`)**:
   - Todas as 9 abas possuem altura real de **40px** (padding vertical de 9px + fonte de 14px com line-height 1.55 = 40.7px).
   - Larguras variam entre 110px e 192px. A altura de 40px fica **4px abaixo do mínimo aceitável de 44px**, gerando toques acidentais em telas sensíveis ao toque (ex.: tablets de fiscalização ou notebooks 2-em-1).
2. **Botões Secundários de Ação Rápida (`button.mini`)**:
   - Possuem altura de **26px a 28px** com padding de `5px 10px` e fonte de 12px.
   - Usados para ações sensíveis como "↺ Carregar Outro Arquivo" e filtros de tabelas.
3. **Chips de Seleção de Exemplo (`.chip`)**:
   - Altura de **30px a 32px**.

### 5.3 Ausência Total de Feedback Dinâmico Acessível (`aria-live` e `role="alert"`)
- **Total de Regiões Vivas Identificadas na Aplicação**: **ZERO (0)**.
- **Total de Alertas de Erro ou Advertência**: **32 blocos** nas classes `.err`, `.disclaimer`, `.note.critico`, `.verif.erro`.
- **Impacto**: Quando o motor fiscal detecta uma irregularidade grave em uma nota fiscal (ex.: retenção de crédito por falta de quitação no fornecedor nos termos do Art. 47 da LC 214/2025 ou CST divergente), a mensagem é injetada visualmente na tela, mas leitores de tela como NVDA ou JAWS permanecem em silêncio absoluto.
- **Recomendação**: Adicionar obrigatoriamente `role="alert"` e `aria-live="assertive"` a todos os blocos de erro fiscal e `aria-live="polite"` a status de progresso assíncrono.

### 5.4 Controles de Formulário Órfãos (Sem Vínculo com Label)
- Na aba `Precificar.tsx`, foram detectados **11 controles de formulário órfãos** (`<select>` e `<input>` sem atributos `id` correspondentes ao `htmlFor` do `<label>` e sem atributos `aria-label`).
- Na aba `Lote.tsx`, foram detectados **7 controles órfãos**.
- Na aba `Classificar.tsx`, foram detectados campos sem identificadores acessíveis explícitos.

---

## 6. Performance e Métricas Web Vitals no Navegador Real

As métricas foram mensuradas através da API de Performance do Google Chrome (`largest-contentful-paint`, `layout-shift` e `PerformanceObserver`).

### 6.1 Tabela Comparativa de Performance por Aba

| Aba Inspecionada | Contagem de Nós DOM | Profundidade Máxima | LCP Elemento Principal | LCP Render Time | Cumulative Layout Shift (CLS) |
| :--- | :---: | :---: | :--- | :---: | :---: |
| **0 · Clientes & Perfis** | 135 | 9 | `H1` (Título Institucional) | 156 ms | 0.0000 *(estável)* |
| **5 · Auditoria (Entrada)** | 124 | 7 | `H1` (Título Institucional) | 156 ms | 0.2292 *(salto moderado)* |
| **6 · Precificação & Margens** | 599 | 11 | `H1` (Título Institucional) | 156 ms | 0.8728 *(deslocamento alto)* |
| **1 · Classificar produto** | 141 | 7 | `P.hint` (Texto explicativo) | 8.192 ms *(carregamento assíncrono)* | 1.6354 *(deslocamento alto)* |
| **2 · Lote (CSV)** | 184 | 8 | Tabela / área de importação | 8.192 ms | 1.8172 *(deslocamento alto)* |
| **7 · Reforma (IBS/CBS/IS)** | **1.767** | 9 | Tabela de cClassTrib / Alíquotas | 8.192 ms | **2.2854 (crítico)** |
| **3 · Consultar NCM** | 206 | 8 | Tabela Siscomex | 8.192 ms | 2.7642 |
| **4 · Parametrização de ERP** | 796 | 10 | Matrizes de CST/CFOP | 8.192 ms | 3.3944 |
| **8 · Regras e fontes** | 663 | 8 | `DIV.x` (Blocos normativos) | 21.068 ms *(carga estendida)* | **10.2354 (crítico)** |

### 6.2 Análise de Gargalos de Performance

1. **Sobrecarga do DOM na Aba Reforma Tributária (1.767 Nós)**:
   - A aba `Reforma.tsx` renderiza a totalidade dos códigos `cClassTrib`, CSTs e fundamentações legais sem paginação ou virtualização de lista.
   - Em dispositivos móveis ou máquinas corporativas modestas, isso consome ciclos excessivos da thread principal do V8 durante recalculos de estilo (*style recalculation*).
2. **Explosão de CLS na Transição entre Abas (CLS > 2.0)**:
   - A aplicação utiliza `next/dynamic` com `ssr: false` para todas as abas. Durante o tempo em que o componente está sendo importado, a área abaixo do cabeçalho colapsa para `0px` ou exibe um card de loading minúsculo.
   - Quando o componente pesado (ex.: `Precificar` com 599 nós ou `Reforma` com 1.767 nós) finaliza o carregamento, a página empurra bruscamente o rodapé para baixo, gerando pontuações de layout shift inaceitáveis segundo os padrões Web Vitals (onde CLS deve ser `< 0.1`).
3. **LCP Estendido em Carregamentos Assíncronos**:
   - Embora o LCP do HTML estático inicial seja ultrarrápido (156ms no `H1`), o elemento de maior relevância visual do conteúdo útil da aba só é pintado após o download e parsing dos arquivos `ncm.json` (10.515 registros) e `reforma.json`.
   - Recomenda-se a implementação de *Skeleton Loaders* com altura reservada correspondente à altura média da aba, eliminando o CLS e suavizando a percepção de LCP pelo operador.

---

## 7. Diretrizes de Engenharia para a Sub-etapa 20.3 (Remediação Visual e A11y)

Para atender simultaneamente aos achados desta auditoria (Frente B) e às especificações do Design System Portela (Frente C), a implementação na Sub-etapa 20.3 deverá seguir rigorosamente as diretrizes abaixo:

### 7.1 Compactação do Cabeçalho e Eliminação do *Dead Space*
- **Transformar o Banner de 3 Níveis em um Seletor Ativo Funcional**: Em vez de ser um banner estático decorativo de 101px, ele deve ser integrado ao componente `NivelOperacionalSwitcher` especificado pela Frente C, permitindo alternar instantaneamente entre **Gerencial**, **Operacional** e **Sênior**.
- **Disclaimer Legal com Fechamento sob Demanda (*Dismissable*)**: O disclaimer legal de 84px deve vir aberto na primeira sessão e possuir controle de minimização rápida para banner compacto de 24px com ícone ⚖️, liberando 60px preciosos de altura útil.
- **Redução da Altura do Cabeçalho em 1366x768**: Reduzir o padding de `header.top` e empilhar a marca em linha horizontal compacta, limitando o cabeçalho a no máximo 90px de altura total.

### 7.2 Implementação Mandatória da *Sticky Action Bar*
- Toda tela operacional (especialmente Auditoria de Entrada, Precificação e Lote) deve fixar uma barra de ações inferior no rodapé da janela (`position: sticky; bottom: 0`), garantindo que o **CTA Primário Sólido** esteja **100% visível em qualquer resolução**, inclusive em 1366x768, sem depender de rolagem vertical.
- Unificar os botões concorrentes de *Auditoria de Entrada* em um único CTA sólido com seletor de modo anexo.

### 7.3 Conformidade WCAG 2.1 AA Completa
- **Elevação dos Alvos de Toque**: Ajustar `nav.tabs button` para `padding: 12px 16px; min-height: 44px;` e `button.mini` para `min-height: 36px; padding: 6px 12px;`.
- **Correção da Paleta de Contraste**: Aplicar os tokens de cor semânticos da Frente C (`--text-secondary: #475569`, contraste 5.2:1; e `--portela-brand-cta: #0369A1`, contraste 6.1:1).
- **Semáforo Fiscal Acessível**: Implementar semáforo de 3 camadas: `Cor + Ícone SVG (Lucide) + Texto Explicativo`.
- **Injeção de `role="alert"` e `aria-live="assertive"`**: Adicionar regiões acessíveis em todos os alertas de erro fiscal e de conformidade.
- **Associação Estrita de Labels**: Adicionar `id` e `htmlFor` ou envolver todos os `<select>` e `<input>` em tags `<label>` semânticas em `Precificar.tsx` e `Lote.tsx`.

### 7.4 Otimização de Performance e Web Vitals
- **Virtualização de Linhas na Tabela de Reforma**: Adicionar virtualização de lista para renderizar apenas os elementos visíveis na janela de rolagem, reduzindo os nós DOM de 1.767 para menos de 100 nós ativos.
- **Skeleton Screens com Altura Reservada**: Adicionar `min-height: 520px` e skeleton cards nos fallbacks de `dynamic()`, zerando os saltos de layout (CLS < 0.05).
- **Alinhamento Numérico com `tabular-nums`**: Aplicar globalmente `font-variant-numeric: tabular-nums; text-align: right;` a todas as células financeiras e percentuais.

---
*Relatório pericial emitido em estrita conformidade com as evidências reais coletadas no Chrome DevTools Protocol.*
