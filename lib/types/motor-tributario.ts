/**
 * Modelo de Dados Bitemporal para o Motor de ICMS e Regras Fiscais
 * Aplicativo MCM - Auditoria Fiscal, NCM e Precificação
 *
 * Provê rastreabilidade completa de vigência legal, validade do dado,
 * proveniência de fontes oficiais (RICMS, Convênios CONFAZ, Leis Complementares)
 * e condições operacionais parametrizadas para apuração tributária determinística.
 */

export type Operacao = 'interna' | 'interestadual' | 'importacao' | 'exportacao';

export type TipoFonteOficial =
  | 'decreto'
  | 'resolucao'
  | 'convenio'
  | 'lei_complementar'
  | 'lei_ordinaria'
  | 'instrucao_normativa'
  | 'solucao_consulta';

export type JurisdicaoRegra = 'PR' | 'Nacional' | string;

export type TributoRegra = 'ICMS' | 'IBS' | 'CBS' | 'IS' | 'IPI' | 'PIS' | 'COFINS';

export type TipoRegraFiscal =
  | 'ST'
  | 'isencao'
  | 'reducao_bc'
  | 'diferimento'
  | 'aliquota_normal'
  | 'credito_presumido'
  | 'suspensao';

export type TipoOperacaoFiscal =
  | 'uso_consumo'
  | 'revenda'
  | 'industrializacao'
  | 'ativo_imobilizado'
  | 'comercializacao';

export type RegimeDestinatarioFiscal =
  | 'simples'
  | 'presumido'
  | 'real'
  | 'todos';

/**
 * Rastreabilidade da norma oficial de origem
 */
export interface FonteOficial {
  tipo: TipoFonteOficial;
  norma: string;
  dispositivo: string;
  url: string;
  hash_arquivo: string;
  capturado_em: string; // ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
  data_publicacao: string; // YYYY-MM-DD
}

/**
 * Vigência legal da norma no tempo histórico
 */
export interface Vigencia {
  inicio: string; // YYYY-MM-DD
  fim?: string;   // YYYY-MM-DD (opcional se vigente indefinidamente)
}

/**
 * Condições de enquadramento da operação mercantil
 */
export interface CondicaoOperacao {
  ncm_prefixo: string[];
  cest?: string;
  tipo_operacao: TipoOperacaoFiscal;
  origem_uf: string;
  destino_uf: string;
  regime_destinatario: RegimeDestinatarioFiscal;
}

/**
 * Regra do Fisco com rastreabilidade bitemporal e amarração normativa
 */
export interface RegraFisco {
  id: string;
  jurisdicao: JurisdicaoRegra;
  tributo: TributoRegra;
  tipo_regra: TipoRegraFiscal;
  condicoes: CondicaoOperacao[];
  cst_exigido?: string;
  cfop_sugerido?: string;
  cBenef_sugerido?: string;
  fonte: FonteOficial;
  vigencia: Vigencia;
  parametros?: ParametroCalculo;
}

/**
 * Parâmetros quantitativos de cálculo associados a uma Regra do Fisco
 */
export interface ParametroCalculo {
  regra_id: string;
  aliquota_interna: number;       // Ex: 19.5 para 19,5%
  aliquota_interestadual: number; // Ex: 12.0 para 12% ou 4.0 para 4%
  fcp?: number;                   // Fundo de Combate à Pobreza (%)
  mva_original?: number;          // Margem de Valor Agregado original (%)
  mva_ajustada?: number;          // Margem de Valor Agregado ajustada (%)
  pmpf?: number;                  // Preço Médio Ponderado a Consumidor Final (em R$)
  pRedBC?: number;                // Percentual de redução da base de cálculo (%)
  pDif?: number;                  // Percentual de diferimento parcial (%)
  carga_efetiva?: number;         // Carga tributária efetiva final (%)
}

/**
 * Entradas financeiras para apuração tributária de uma linha de mercadoria
 */
export interface ValoresFinanceiros {
  valor_operacao: number;          // Valor bruto dos produtos/mercadorias
  frete?: number;                  // Frete
  seguro?: number;                 // Seguro
  outras_despesas?: number;        // Outras despesas acessórias
  desconto_incondicional?: number; // Descontos incondicionais
  ipi?: number;                    // IPI destacado
}

/**
 * Resultado estruturado e memória de cálculo gerada pelo motor tributário
 */
export interface DetalheCalculo {
  base_calculo_propria: number;
  aliquota_propria: number;
  valor_icms_proprio: number;
  Valor_ICMS_Proprio: number; // Compatibilidade com padrão de saída
  base_calculo_st?: number;
  aliquota_st?: number;
  mva_aplicada?: number;
  valor_icms_st?: number;
  Valor_ICMS_ST: number;
  fcp?: number;
  FCP: number;
  reducao_bc_percentual?: number;
  diferimento_percentual?: number;
  valor_icms_diferido?: number;
  carga_efetiva: number;
  Carga_Efetiva: number;
  memoria_calculo: string[];
}
