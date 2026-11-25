# Dossiê de Integração Técnica e Engenharia: MargemReal Portela ➔ Antigravity
**Versão:** 3.0.0-PROD  
**Ecossistema:** MargemReal Portela — Inteligência Fiscal, Precificação & Reforma Tributária  
**Design System Vinculado:** `Fiscal Intelligence & Pricing` (Dark Mode `#0e1511`, Acentos Esmeralda `#10b981`, Tipografia `Space Grotesk`)  
**Autor:** Contabilidade Portela (Desde 1970) — Divisão de Engenharia de Software e Perícia Contábil-Tributária  

---

## 1. Visão Geral e Arquitetura da Integração

O ecossistema **MargemReal Portela** foi concebido sob o paradigma **Local-First & Sovereign AI**, projetado para rodar com baixíssima latência (14ms a 35ms), processamento criptografado no cliente e comunicação assíncrona com microsserviços periféricos (*Sidecars RFB / Gecex / Confaz*).

A integração com o **Antigravity** (motor de orquestração avançada, visualização de dados e aceleração de fluxos de trabalho) tem como objetivo:
1. **Padronização do Contrato de Dados (Payloads JSON):** Unificar a esteira das Abas 0 a 8.
2. **Pipelines de Cálculo Determinístico:** Implementação pura em TypeScript/Python para valoração de estoque (CPC 16 / NBC TG 16) e formação de preço com Split Payment e IVA Dual (LC 214/2025).
3. **Mecanismo de Injeção e Sincronização de UI/Tokens:** Disponibilização dos tokens do Design System, estilos CSS de alta fidelidade e layouts ergonômicos.
4. **Governança Pericial e Laudos:** Rastreabilidade de cada citação jurídica em tempo de execução para alimentação de relatórios da diretoria e peças contábeis.

---

## 2. Mapa Estrutural dos Módulos (Abas 0 a 8)

```
[Aba 0: Clientes & Perfis] ──▶ Multi-Tenant, CRT, Alíquotas PGDAS, Certificados A1
        │
[Aba 1: Classificação]    ──▶ Motor Lexical RGI 1/6, NESH, Validação Siscomex
        │
[Aba 2: Lote CSV]         ──▶ Ingestão de Lotes de SKUs, Detecção Sensível O(1)
        │
[Aba 3: Consulta NCM]     ──▶ Árvore Tarifária, CEST, CADA, II, IPI
        │
[Aba 4: Parametrização]   ──▶ De-Para CFOP (1102 ➔ 5405), cClassTrib IBS/CBS
        │
[Aba 5: Auditoria Entrada]──▶ NF-e XML / DANFE, Glosas, Custo CPC 16, Barreira PR
        │
[Aba 6: Precificação]     ──▶ Formação Preço, Margem Líquida Real, Split Payment
        │
[Aba 7: Reforma IBS/CBS]  ──▶ Transição 2026-2033, Dual-Stack SEFA 48/2026, Simples Híbrido
        │
[Aba 8: Regras e Fontes]  ──▶ Catálogo Normativo, Citações Periciais para Laudos
```

---

## 3. Especificação dos Contratos de Dados (TypeScript Interfaces)

### 3.1. Perfil do Contribuinte (Tenant / Aba 0)
```typescript
export interface TaxProfile {
  tenantId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  uf: 'PR' | 'SP' | 'SC' | 'RS' | string;
  municipioIbge: string;
  regimeTributario: 'SIMPLES_NACIONAL' | 'SIMPLES_HIBRIDO' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
  crt: 1 | 2 | 3;
  aliquotaEfetivaDas: number; // Ex: 0.0845 para 8.45%
  isentoDifalEntradaPr: boolean; // Dec. 7.871/2017
  certificadoA1: {
    valido: boolean;
    diasRestantes: number;
    vencimento: string; // ISO 8601
  };
}
```

### 3.2. Item de Auditoria de Entrada (Aba 5 - CPC 16 R1)
```typescript
export interface InboundAuditItem {
  itemIndex: number;
  codigoProduto: string;
  descricaoMercadoria: string;
  ncm: string;
  cfopEntrada: string;
  cstCsosn: string;
  quantidade: number;
  unidade: string;
  valorBrutoProd: number;
  descontoIncondicional: number;
  freteSeguroOutros: number;
  
  // Tributos não recuperáveis que integram custo
  ipiNaoRecuperavel: number;
  icmsStNaoRecuperavel: number;
  outrosTributosNaoRec: number;
  
  // Créditos dedutíveis
  creditoIcms: number;
  creditoPisCofins: number;
  creditoIbsCbs: number;
  
  // Apuração do Custo
  custoAquisicaoRealTotal: number;
  custoUnitarioEfetivo: number;
  
  // Glosas e Flags Periciais
  glosasIdentificadas: Array<{
    tipo: 'CREDITO_INDEVIDO' | 'ST_RETIDO' | 'DIVERGENCIA_NCM' | 'BENEFICIO_ESTADUAL';
    descricao: string;
    amparoLegal: string;
    impactoFinanceiro: number;
  }>;
  requerPericia: boolean;
}
```

### 3.3. Mecânica de Formação de Preço e Split Payment (Aba 6 & 7)
```typescript
export interface PricingEngineInput {
  custoUnitarioReal: number; // R$ 52.98
  margemLiquidaPretendidaPct: number; // Ex: 0.20 para 20%
  despesasComerciaisPct: number; // Ex: 0.05 para 5%
  tributosPorDentroPct: number; // ICMS / PIS / COFINS (se aplicável)
  
  // Alíquotas de Saída (Reforma Tributária - Transição 2027)
  cbsSaidaPct: number; // Ex: 0.088 (8.8%)
  ibsSaidaPct: number; // Ex: 0.001 (0.1%)
  impostoSeletivoPct: number; // Ex: 0.00
  
  // Modos de Simulação
  aplicarConsultaSefaPr48: boolean; // Grossing-up de IBS/CBS na BC do ICMS
  simularDocumentoInidoneo: boolean;
}

export interface PricingEngineOutput {
  vProdLiquido: number; // R$ 73.30
  vNFPrecoFinalConsumidor: number; // R$ 79.82
  
  decomposicaoMonetaria: {
    custoReal: number; // R$ 52.98
    despesasVariaveis: number; // R$ 3.99
    margemLiquidaReal: number; // R$ 14.66 (18.4% sobre vNF / 20% s/ liq)
    tributosPorDentro: number; // R$ 0.00
    cbsValor: number; // R$ 6.45
    ibsValor: number; // R$ 0.07
    impostoSeletivoValor: number; // R$ 0.00
    totalIvaDual: number; // R$ 6.52
  };
  
  splitPayment: {
    retidoBancosOperacao: number; // R$ 6.52 (vai direto ao Fisco)
    creditadoVendedor: number; // R$ 73.30 (líquido garantido)
  };
  
  creditoGeradoClienteB2B: number; // R$ 6.52 se regime normal / híbrido
}
```

---

## 4. Algoritmos de Cálculo em TypeScript

### 4.1. Apurador de Custo Real de Entrada (NBC TG 16 / CPC 16 R1, Item 11)
```typescript
export function calcularCustoRealEntrada(item: {
  valorProdutos: number;
  descontosIncondicionais: number;
  freteDespesasAcessorias: number;
  ipiSemCredito: number;
  icmsStSemCredito: number;
  creditosFiscaisAproveitaveis: number;
  quantidade: number;
}): { custoTotal: number; custoUnitario: number } {
  // Fórmula estrita CPC 16:
  // Custo = Compra - Descontos + Gastos Acessórios + Tributos Não Recuperáveis - Tributos Recuperáveis
  const custoTotal =
    item.valorProdutos -
    item.descontosIncondicionais +
    item.freteDespesasAcessorias +
    item.ipiSemCredito +
    item.icmsStSemCredito -
    item.creditosFiscaisAproveitaveis;

  const custoUnitario = item.quantidade > 0 ? custoTotal / item.quantidade : custoTotal;

  return {
    custoTotal: Number(custoTotal.toFixed(2)),
    custoUnitario: Number(custoUnitario.toFixed(2)),
  };
}
```

### 4.2. Formador de Preço de Venda com Split Payment (LC 214/2025)
```typescript
export function calcularFormacaoPreco(input: PricingEngineInput): PricingEngineOutput {
  const {
    custoUnitarioReal,
    margemLiquidaPretendidaPct,
    despesasComerciaisPct,
    tributosPorDentroPct,
    cbsSaidaPct,
    ibsSaidaPct,
    impostoSeletivoPct,
  } = input;

  // Divisor para cálculo do Preço Líquido (Mark-up por dentro de margem e despesas)
  const divisor = 1 - despesasComerciaisPct - margemLiquidaPretendidaPct - tributosPorDentroPct;
  if (divisor <= 0) {
    throw new Error('Inconsistência matemática: a soma de margem e encargos atinge 100%.');
  }

  const vProdLiquido = Number((custoUnitarioReal / divisor).toFixed(2));
  const despesasVariaveis = Number((vProdLiquido * despesasComerciaisPct).toFixed(2));
  const margemLiquidaReal = Number((vProdLiquido * margemLiquidaPretendidaPct).toFixed(2));
  const tributosPorDentro = Number((vProdLiquido * tributosPorDentroPct).toFixed(2));

  // IVA Dual por fora (Non-cumulative Split Payment model)
  const cbsValor = Number((vProdLiquido * cbsSaidaPct).toFixed(2));
  const ibsValor = Number((vProdLiquido * ibsSaidaPct).toFixed(2));
  const impostoSeletivoValor = Number((vProdLiquido * impostoSeletivoPct).toFixed(2));
  const totalIvaDual = Number((cbsValor + ibsValor + impostoSeletivoValor).toFixed(2));

  const vNFPrecoFinalConsumidor = Number((vProdLiquido + totalIvaDual).toFixed(2));

  return {
    vProdLiquido,
    vNFPrecoFinalConsumidor,
    decomposicaoMonetaria: {
      custoReal: custoUnitarioReal,
      despesasVariaveis,
      margemLiquidaReal,
      tributosPorDentro,
      cbsValor,
      ibsValor,
      impostoSeletivoValor,
      totalIvaDual,
    },
    splitPayment: {
      retidoBancosOperacao: totalIvaDual,
      creditadoVendedor: vProdLiquido,
    },
    creditoGeradoClienteB2B: totalIvaDual,
  };
}
```

---

## 5. Dicionário de Tokens do Design System (`Fiscal Intelligence & Pricing`)

Para garantir renderização idêntica em qualquer componente Antigravity, utilize a seguinte folha de tokens CSS / Tailwind config:

```css
:root {
  /* Superfícies & Fundos */
  --bg-app: #0e1511;                 /* Fundo principal da viewport */
  --bg-card: #161d19;                /* Containers analíticos e cards */
  --bg-card-subtle: #1c2420;         /* Tabelas e blocos secundários */
  --bg-card-hover: #222c27;          /* Interações de hover */
  
  /* Linhas e Contornos */
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-medium: rgba(255, 255, 255, 0.12);
  --border-accent: rgba(16, 185, 129, 0.35);
  
  /* Acentos Semânticos Fiscais */
  --accent-emerald: #10b981;         /* Conformidade, Crédito, Custo Líquido */
  --accent-emerald-glow: rgba(16, 185, 129, 0.15);
  --accent-crimson: #ef4444;         /* Glosas, Tributos s/ Crédito, Erros */
  --accent-crimson-subtle: rgba(239, 68, 68, 0.12);
  --accent-amber: #f59e0b;           /* Perícia Requerida, Alertas Legais */
  --accent-amber-subtle: rgba(245, 158, 11, 0.12);
  --accent-blue: #3b82f6;            /* Informação Siscomex, Atributos */
  
  /* Tipografia */
  --font-family-sans: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-feature-numeric: 'tnum' 1, 'zero' 1; /* Alinhamento tabular rigoroso */
}
```

---

## 6. Catálogo de Citações Normativas para Injeção Pericial (Aba 8)

| Chave Normativa | Norma / Órgão | Dispositivo Legal | Aplicação no Sistema Antigravity |
| :--- | :--- | :--- | :--- |
| `CPC16_ITEM11` | NBC TG 16 (R1) / CPC 16 | Item 11 | Valoração de estoques: soma tributos não recuperáveis (ST/IPI) e deduz abatimentos. |
| `LC214_ART28_47`| Lei Complementar 214/2025 | Arts. 28 e 47 | Não-cumulatividade plena de IBS e CBS; disciplina a apropriação e o Split Payment. |
| `LC214_ART378` | Lei Complementar 214/2025 | Arts. 378 a 383 | Regras de transição do PIS/COFINS e aproveitamento de saldos credores de estoque. |
| `RICMS_PR_ANEXO8`| Dec. Estadual PR nº 7.871/17 | Art. 28, Anexo VIII | Diferimento parcial de ICMS nas operações internas entre contribuintes no Paraná. |
| `SEFA_PR_48_2026`| Parecer Coord. Receita PR | Consulta Tributária 48/2026 | Grossing-up de IBS e CBS na base de cálculo do ICMS no período dual-stack (2026–2027). |
| `IN_RFB_2169` | Receita Federal do Brasil | IN RFB nº 2.169/2023 | Tabela NESH e Regras Gerais de Interpretação (RGI 1 a 6) para NCMs e Subitens. |

---

## 7. Procedimento de Teste de Integração (Health-Check & Telemetria)

Ao subir os microsserviços e invocar o pipeline Antigravity:
1. **Verificação de Endpoints Locais (Sidecars):**
   - Siscomex Cache: `http://127.0.0.1:11434/status` (Health: `OK`)
   - Postgres Multi-Tenant: `PostgreSQL 17 Dual-Mode` (Conexões ativas: `Pool 10`)
2. **Teste de Estresse de Custo:**
   - Submeta um payload com 100 itens de NF-e; o tempo de cálculo em lote não deve exceder 50ms com alocação in-memory.
3. **Validação de Formação de Preço:**
   - Conferir se o preço final `vNF` decompõe exatamente em `vProdLiquido + (CBS + IBS + IS)`.

---
*Documento homologado para orquestração técnica e deployment no Antigravity.*
