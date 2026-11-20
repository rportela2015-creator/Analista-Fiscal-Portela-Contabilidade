/**
 * Modelo de Dados Bitemporal para o Motor de ICMS e Regras Fiscais
 * Aplicativo MCM - Auditoria Fiscal, NCM e Precificação
 *
 * Provê rastreabilidade completa de vigência legal, validade do dado,
 * proveniência de fontes oficiais (RICMS, Convênios CONFAZ, Leis Complementares)
 * e condições operacionais parametrizadas para apuração tributária determinística.
 */

import type {
  DiagnosticoDiferimentoParcialPR,
  DiagnosticoReducaoBcEEstornoPR,
  DiagnosticoIcmsStPR,
  DiagnosticoSimplesNacionalPR,
} from '../engine/icms-pr-regras';

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

  // Campos complementares opcionais para regimes específicos (ICMS/PR)
  quantidade?: number;
  ncm?: string;
  cest?: string;
  dataFatoGerador?: string;
  ufOrigem?: string;
  ufDestino?: string;
  crtEmitente?: '1' | '2' | '3' | '4' | number;
  crtDestinatario?: '1' | '2' | '3' | '4' | number;
  destinatarioConsumidorFinal?: boolean;
  ehCombustivel?: boolean;
  destinatarioConstrucaoCivil?: boolean;
  ehAtacadistaRegimeEspecial?: boolean;
  aplicarRedutorArt16SN?: boolean;
  precoMaximoOrgaoPublico?: number;
  pmpf?: number;
  precoSugeridoFabricante?: number;
  mvaOriginalPct?: number;
  aliqFecopPct?: number;
  creditoIcmsEntrada?: number;
  manutencaoCredito?: boolean;
  ehParteOuPeca?: boolean;
  perfilReducaoPr?: string;
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

  // Diagnósticos periciais complementares do ICMS/PR (Sub-etapa 18.4)
  diferimentoParcialPr?: DiagnosticoDiferimentoParcialPR;
  reducaoBcEstornoPr?: DiagnosticoReducaoBcEEstornoPR;
  calculoStPr?: DiagnosticoIcmsStPR;
  simplesNacionalPr?: DiagnosticoSimplesNacionalPR;
}

/**
 * Chave de Decisão Fiscal em 9 Dimensões
 * Modelo canônico para enquadramento fiscal e auditoria determinística de entradas
 */
export interface ChaveDecisaoFiscal9D {
  ncm: string; // 8 dígitos
  cest?: string;
  origemMercadoria: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | number; // Tabela A CST
  finalidadeEntrada: 'uso_consumo' | 'revenda' | 'comercializacao' | 'industrializacao' | 'ativo_imobilizado';
  regimeEmitente: 'simples_nacional' | 'regime_normal';
  regimeDestinatario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  ufOrigem: string; // 2 caracteres
  ufDestino: string; // 2 caracteres
  dataFatoGerador: string; // YYYY-MM-DD
}

/**
 * Diagnóstico pericial de DIFAL de entrada (Uso/Consumo ou Ativo Imobilizado)
 */
export interface DiagnosticoDifalEntrada {
  sujeitoDifal: boolean;
  tipoDifal: 'uso_consumo' | 'ativo_imobilizado' | 'nao_aplicavel';
  modalidadeBase: 'base_dupla' | 'base_simples' | 'isento';
  aliquotaOrigem: number;
  aliquotaDestino: number;
  aliquotaFecop: number;
  baseCalculoOrigem: number;
  baseCalculoDestino: number;
  valorDifal: number;
  valorFecop: number;
  valorTotalRecolher: number;
  memoriaCalculo: string[];
  fundamentacaoLegal: string;

  // Campos complementares da Sub-etapa 18.2 (DIFAL e Antecipação PR)
  exigeRecolhimento?: boolean;
  modalidade?: 'DIFAL_USO_CONSUMO' | 'DIFAL_ATIVO_IMOBILIZADO' | 'ICMS_ST_ENTRADA_ART11' | 'ANTECIPACAO_4_PCT_ART16' | 'DISPENSADO';
  baseCalculoOperacao?: number;
  baseCalculoDifal?: number;
  aliquotaInternaEfetiva?: number;
  valorDebitoDifal?: number;
  valorDebitoFecop?: number;
  valorTotalDebito?: number;
  efeitoCaixaLiquido?: number;
  guiaRecolhimento?: 'GR-PR' | 'CONTA_GRAFICA_EFD' | 'DISPENSADO' | string;
  vencimento?: string;
  codigoAjusteEfd?: string;
  obrigacaoAcessoria?: string;
  ciapBlocoG?: boolean;
  alertasAuditoria?: string[];
  decretoExclusaoSt?: string;
}

/**
 * Resumo consolidado de DIFAL para os itens de uma NF-e de entrada
 */
export interface ResumoDifalNfeEntrada {
  totalItensAnalisados: number;
  totalItensComDifal: number;
  totalDifalGeral: number;
  totalFecopGeral: number;
  totalGeralRecolher: number;
  itens: Array<{
    nItem: number;
    xProd: string;
    ncm: string;
    diagnostico: DiagnosticoDifalEntrada;
  }>;

  // Indicadores consolidados executivos
  exigeRecolhimentoNaNota?: boolean;
  qtdItensComDebito?: number;
  qtdItensUsoConsumo?: number;
  qtdItensAtivoImobilizado?: number;
  qtdItensAntecipacaoArt16?: number;
  qtdItensStEntradaArt11?: number;
  totalBaseDifal?: number;
  totalDebitoDifal?: number;
  totalDebitoFecop?: number;
  totalAntecipacaoArt16?: number;
  totalEfeitoCaixaLiquido?: number;
  guiasNecessarias?: string[];
  prazoPrincipal?: string;
  obrigacoesAcessorias?: string[];
  alertasConsolidados?: string[];
}

