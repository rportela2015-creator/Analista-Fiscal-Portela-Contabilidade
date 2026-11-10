# Aplicativo_MCM- · Classificador de NCM + Auditoria Fiscal e Precificação

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20GPU%20RX%20580-orange.svg)](https://ollama.com/)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen.svg)](#testes-e-garantia-de-qualidade)

Plataforma integrada de **Inteligência Artificial Soberana, Auditoria Pericial Fiscal e Formação Científica de Preços** desenvolvida para a **Portela Contabilidade**.

O sistema combina a precisão determinística do vocabulário oficial do Siscomex (10.515 NCMs vigentes) com o motor pericial local via Ollama na GPU AMD Radeon RX 580 (Vulkan / ROCm), fallback em nuvem para Google Gemini Cloud (3.8-flash / 3.6-flash), auditoria de entrada de NF-e (Modelo 55) e DANFE (PDF), parametrização de ERP e o motor de precificação multi-regime fundamentado no Marco Legal Brasileiro (NBC TG 16/CPC 16, RIR/2018, LC 87/96, RICMS/PR e Reforma Tributária do Consumo LC 214/2025 e LC 227/2025).

> **Aviso de Conformidade Fiscal:** O aplicativo opera como ferramenta pericial de apoio à tomada de decisão contábil e tributária fundamentada. Todas as classificações fiscais, De-Para de CFOP e formações de preço trazem as notas legais, fundamentações normativas e memórias de cálculo auditáveis.

---

## 🏛️ Arquitetura das 4 Abas Principais

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         APLICATIVO MCM - ARQUITETURA                             │
├─────────────────────┬──────────────────────┬───────────────────┬─────────────────┤
│ 1. CLASSIFICAÇÃO IA │ 2. AUDITORIA ENTRADA │ 3. PARAMETRIZAÇÃO │ 4. PRECIFICAÇÃO │
│ • BM25 Siscomex     │ • XML NF-e & PDF     │ • Cadastro & DF-e │ • NBC TG 16     │
│ • Ollama GPU RX 580 │ • De-Para CFOP       │ • Maqueta de tags │ • 4 Regimes     │
│ • Gemini Cloud Fall.│ • Travas CRT/ST/MVA  │ • Validação XSD   │ • PEC & VRL     │
│ • Ranking & RGI 1-6 │ • Estorno Anexo II PR│ • Laudo Executivo │ • Gráficos & CSV│
└─────────────────────┴──────────────────────┴───────────────────┴─────────────────┘
```

### 1 · Classificação Fiscal & IA Híbrida
- **Motor Determinístico BM25**: Busca instantânea indexada sobre 10.515 subitens de 8 dígitos vigentes na Tabela NCM/SH do Siscomex com ponderação por TF-IDF, penalização de termos residuais e aplicação automática das Regras Gerais de Interpretação (RGI 1 a 6).
- **Inteligência Soberana Local (Ollama)**: Inferência 100% local e privada com os modelos `qwen2.5:7b` e `qwen3.5:4b` acelerados por hardware na GPU AMD Radeon RX 580 8GB (Vulkan). Garante conformidade total com a LGPD e sigilo contábil estrito sem consumo de cotas externas.
- **Fallback Resiliente em Nuvem (Gemini)**: Caso o motor local esteja desligado e o ambiente não exija soberania estrita (`local_strict`), aciona a API do Google Gemini com esquema JSON estrito e governança centralizada (`lib/ai/config.ts`).

### 2 · Auditoria Pericial de Entrada (XML NF-e e PDF DANFE)
- **Extração Determinística de 25 Campos**: Processa arquivos XML de NF-e (Modelo 55) e documentos DANFE em PDF com extração completa de emitente, destinatário, frete, seguro, outras despesas, descontos, IPI, ICMS normal, ICMS-ST, PIS/COFINS e campos da Reforma Tributária (`cClassTrib`, IBS e CBS).
- **De-Para Inteligente de CFOP de Entrada**: Mapeia automaticamente o CFOP de saída do fornecedor para o CFOP correto de entrada do adquirente (ex.: 5.102/6.102 ➔ 1.102 para revenda, 1.403 para ST, 1.556 para uso/consumo).
- **Travas Fiscais de Exceção**:
  - *Bloqueio de PIS/COFINS*: Impede tomada indevida de créditos quando o fornecedor for optante pelo Simples Nacional (CRT 1 ou 2) conforme Lei 10.637/02 art. 3º e Lei 10.833/03 art. 3º.
  - *Operações com ST*: Detecta CST 60 e CSOSN 500 informando que o imposto já foi retido na etapa anterior.
  - *Base de ST com IPI e MVA Ajustada*: Incorpora IPI na base de cálculo de ST para empresas comerciais e aplica a MVA Ajustada do Paraná (RICMS/PR Decreto 7.871/2017 Anexo IX).
  - *Estorno Proporcional de ICMS*: Alerta e aplica o estorno de crédito nas entradas de mercadorias com benefício de redução de base de cálculo na saída (RICMS/PR Anexo II).
- **Conexão Direta**: Botão "Precificar Itens da Nota" transfere os dados extraídos diretamente para o motor de precificação sem redigitação.

### 3 · Parametrização de ERP
- **Geração de Códigos Fiscais**: Gera a combinação exata de códigos para emissão de DF-e (NCM, CEST, CFOP, CST/CSOSN, CST do IPI, PIS/COFINS, `CST-IBS/CBS`, `cClassTrib` e Imposto Seletivo).
- **Maqueta de XML**: Visualização hierárquica das tags XML do documento fiscal prontas para integração no ERP.
- **Conferências Cadastrais Rigorosas**: Validação de CNPJ/CPF com dígito verificador, regras de Inscrição Estadual (SINTEC) e bloqueio de códigos rejeitados pela RFB.
- **Laudos Executivos Sanitizados**: Geração de relatórios executivos em HTML e TXT formatados e imunes a vulnerabilidades XSS.

### 4 · Precificação & Margens (Custo Real NBC TG 16)
- **Demonstração do Custo de Aquisição Real**: Em estrita conformidade com a NBC TG 16 (R2) / CPC 16 e os arts. 304 a 310 do RIR/2018 (Decreto 9.580/2018):
  - `(+)` Valor Bruto dos Produtos
  - `(+)` Frete (FOB com rateio por peso ou valor) e Seguro
  - `(+)` Outras Despesas Acessórias
  - `(+)` Tributos não recuperáveis (ICMS-ST retido/antecipado, IPI não creditável, DIFAL)
  - `(-)` Descontos Incondicionais obtidos
  - `(-)` Créditos Tributários Recuperáveis (ICMS próprio, PIS e COFINS não-cumulativos, IBS e CBS)
- **Comparativo Multi-Regime dos 4 Regimes Tributários**:
  1. *Simples Nacional* (Anexo I da LC 123/2006, com segregação automática de receitas com ST e PIS/COFINS monofásico no DAS)
  2. *Simples Híbrido 2027+* (DAS com ICMS/ISS + apuração de IBS/CBS pelo regime regular não-cumulativo)
  3. *Lucro Presumido* (PIS 0,65% e COFINS 3% cumulativos + ICMS por dentro + IRPJ e CSLL presumidos)
  4. *Lucro Real* (PIS 1,65% e COFINS 7,6% não-cumulativos com recuperação ampla de créditos na entrada)
- **Ponto de Equilíbrio Contábil (PEC)**: Calcula a receita mínima e o volume de unidades necessárias para cobrir os custos fixos da operação comercial.
- **Valor Realizável Líquido (VRL / Impairment / Arbitramento Fiscal)**: Avalia o preço de venda estimado deduzido dos custos de acabamento e despesas de venda conforme o item 9 da NBC TG 16 e o art. 304 do RIR/2018.
- **Gráficos e Exportação Segura**:
  - Gráfico Waterfall Stacked Bar 100% interativo demonstrando a decomposição visual do preço.
  - Exportação segura em HTML executivo pronto para impressão e CSV detalhado para planilhas.

---

## 📚 Marco Legal e Fontes Normativas Integradas

O sistema integra e valida **28 diplomas legais e fontes oficiais**, gerenciados pelo script atômico com Circuit Breaker (`scripts/atualizar_marco_legal.py`):

1. **NBC TG 16 (R2) / CPC 16**: Mensuração e Composição do Custo de Estoques.
2. **RIR/2018 (Decreto nº 9.580/2018, arts. 304-310)**: Determinação dos Custos de Aquisição para fins de IRPJ e CSLL.
3. **Lei Federal nº 6.404/1976 (art. 183)**: Critérios de Avaliação do Ativo Circulante e Estoques.
4. **Lei Complementar nº 87/1996 (Lei Kandir)**: Princípio da Não-Cumulatividade e Créditos de ICMS.
5. **RICMS/PR (Decreto Estadual nº 7.871/2017)**: Regulamento do ICMS do Estado do Paraná.
6. **RICMS/PR Anexo II**: Benefícios Fiscais de Redução de Base de Cálculo e Estorno Proporcional.
7. **RICMS/PR Anexo IX**: Regime de Substituição Tributária e MVA Original/Ajustada.
8. **Lei Federal nº 10.637/2002**: Regime Não-Cumulativo do PIS/PASEP e vedações a créditos.
9. **Lei Federal nº 10.833/2003**: Regime Não-Cumulativo da COFINS e regras de apropriação.
10. **Lei Complementar nº 123/2006**: Estatuto Nacional da Microempresa e EPP (Simples Nacional).
11. **Resolução SF nº 13/2012**: Alíquota interestadual de 4% para mercadorias importadas.
12. **Resolução SF nº 22/1989**: Alíquotas do ICMS nas operações interestaduais (7% e 12%).
13. **Emenda Constitucional nº 87/2015**: Sistemática de partilha do DIFAL nas operações para consumidor final.
14. **Lei Complementar nº 190/2022**: Regulamentação nacional da cobrança do DIFAL de ICMS.
15. **Convênio ICMS 142/2018**: Normas gerais de Substituição Tributária e MVA Ajustada pelo CONFAZ.
16. **Emenda Constitucional nº 132/2023**: Reforma Tributária do Consumo e criação do IVA Dual.
17. **Lei Complementar nº 214/2025**: Instituição do Imposto sobre Bens e Serviços (IBS) e Contribuição sobre Bens e Serviços (CBS).
18. **Lei Complementar nº 227/2025**: Regimes Específicos e Diferenciados da Reforma Tributária.
19. **IN RFB nº 2.169/2023**: Notas Explicativas do Sistema Harmonizado (NESH).
20. **Tabela NCM/SH Siscomex**: Nomenclatura Comum do Mercosul (MDIC/Secex/RFB).
21. **Tabela TIPI (Decreto nº 11.158/2022)**: Tabela de Incidência do IPI.
22. **Tarifa Externa Comum (TEC)**: Resolução Gecex nº 272/2021 (Mercosul).
23. **Código Tributário Nacional (Lei nº 5.172/1966)**: Normas gerais de direito tributário.
24. **Decreto nº 70.235/1972**: Processo Administrativo Fiscal (PAF) e defesas periciais.
25. **Regras Gerais de Interpretação (RGI 1 a 6)**: Metodologia internacional da OMA para classificação de mercadorias.
26. **Soluções de Consulta COSIT/RFB**: Precedentes administrativos e orientações fiscais federais.
27. **Soluções de Consulta DISIT/SRRF**: Uniformização de interpretação da legislação tributária.
28. **Decreto nº 72.122/1973 (RIR Histórico)**: Princípios consolidados de apropriação de despesas operacionais.

---

## 🔒 Hardening de Segurança e Rotas de API

O aplicativo possui uma camada defensiva de segurança e isolamento:

| Rota | Método | Proteção / Hardening | Descrição |
|---|---|---|---|
| `/api/atualizar` | `POST` | `ENABLE_UPDATE_ROUTE=true`<br>`Bearer <UPDATE_TOKEN>`<br>`timingSafeEqual`<br>Zod Enum<br>Lock de concorrência | Dispara atualização dos dados fiscais (`fontes`, `completo`, `reforma`, `marco-legal`). Exige autenticação com tempo constante e trunca logs em 20 KB. |
| `/api/atualizar` | `GET` | Público | Retorna informações de uso e status de ativação da rota administrativa. |
| `/api/classificar-ia` | `POST` | Rate Limit (20 req/min/IP)<br>Modo Soberano Local | Classifica descrições via BM25 + Ollama local GPU RX 580 ou fallback Gemini Cloud. Retorna 429 com `Retry-After: 60` se excedido. |
| `/api/auditoria-entrada` | `POST` | Rate Limit (20 req/min/IP)<br>Limite de Upload 5 MB (413)<br>Magic Bytes XML/PDF (400)<br>Truncamento 60k chars | Processa XML de NF-e e PDF de DANFE com checagem estrita de integridade e headers de tempo de execução. |
| `/api/auditoria-relatorio` | `POST` | Validação Zod<br>Sanitização `esc()` (XSS)<br>CSP rígido | Gera laudos periciais em HTML e TXT com cabeçalho `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`. |
| `/api/parametrizacao-relatorio` | `POST` | Validação de Payload<br>Sanitização de saída | Gera relatórios resumidos e detalhados de parametrização fiscal para ERPs. |

### Cabeçalhos de Segurança (`next.config.mjs`)
- `Content-Security-Policy`: `frame-ancestors 'self' ${process.env.FRAME_ANCESTORS}` (impede clickjacking, eliminando `ALLOWALL`).
- `X-Content-Type-Options`: `nosniff` (impede MIME-sniffing malicioso).
- `Referrer-Policy`: `strict-origin-when-cross-origin`.
- **Cache Inteligente**: Arquivos estáticos em `/data/:path*?v=...` contam com `Cache-Control: public, max-age=31536000, immutable`, enquanto `/data/meta.json` opera com `no-cache` para detecção imediata de novas versões.

---

## 🚀 Instalação e Execução

### Pré-requisitos
- **Node.js**: v20+ ou v22+
- **Python**: 3.10+ com bibliotecas padrão (`urllib`, `json`, `hashlib`, etc.)
- **Ollama (Opcional para IA Soberana)**: Rodando com `qwen2.5:7b` ou `qwen3.5:4b` na GPU AMD Radeon RX 580.

### Passo a Passo

1. **Clonar e instalar dependências**:
   ```bash
   git clone https://github.com/usuario/Aplicativo_MCM-.git
   cd Aplicativo_MCM-
   npm install
   ```

2. **Configurar variáveis de ambiente**:
   ```bash
   cp .env.example .env.local
   ```
   Edite o arquivo `.env.local` conforme necessário:
   - `AI_SOVEREIGNTY_MODE=local_first` (ou `local_strict` para travar nuvem)
   - `GEMINI_API_KEY=sua_chave_opcional`
   - `ENABLE_UPDATE_ROUTE=false`

3. **Verificar integridade do Marco Legal**:
   ```bash
   python scripts/atualizar_marco_legal.py --check
   ```

4. **Compilar dados fiscais (Pipeline)**:
   ```bash
   python scripts/pipeline.py
   ```

5. **Iniciar ambiente de desenvolvimento**:
   ```bash
   npm run dev
   ```
   Acesse `http://localhost:3000`.

---

## 🧪 Testes e Garantia de Qualidade

O projeto adota uma política rigorosa de **Definition of Done (DoD)** com testes automatizados:

- **Verificação Estática de Tipos**:
  ```bash
  npm run typecheck
  ```
- **Auditoria de Hooks do React e Integridade de Render**:
  ```bash
  node scripts/hookcheck.mjs
  ```
- **Suíte Completa de Testes**:
  ```bash
  npm test
  ```
  Executa todas as suítes de testes:
  - `tests/auditoria.test.mjs`: Testes do motor de auditoria de entrada.
  - `tests/precificacao.test.mjs`: 32 testes de cálculo de custo real, 4 regimes e margens.
  - `tests/exportacao-precificacao.test.mjs`: Testes de integridade da exportação HTML e CSV.
  - `tests/headers.test.mjs`: Validação dos headers de cache e CSP no `next.config.mjs`.
  - `tests/api-security.test.mjs`: Testes de autenticação, rate limit, limites de 5 MB e magic bytes.
  - `tests/engine.test.mjs`: Testes do motor BM25 e classificação fiscal.
  - E mais 18 suítes complementares.

---

## 📄 Licença e Responsabilidade

Desenvolvido para uso profissional por contadores, analistas fiscais e advogados tributaristas. Os cálculos fiscais refletem a legislação vigente em 2026 e o cronograma de transição da Reforma Tributária até 2033.
