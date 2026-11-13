/**
 * Resolução Dinâmica de CFOP (Código Fiscal de Operações e Prestações)
 * Aplicativo MCM - Auditoria Fiscal, NCM e Precificação
 *
 * Determina o CFOP cruzando a Natureza da Operação (Entrada/Saída),
 * Localização Geográfica (Interna, Interestadual, Exterior) e o Tratamento Tributário
 * expresso pelo CST do ICMS (ex: ST, Diferimento, Isenção, Tributação Normal),
 * desvinculando o CFOP da dependência estática do NCM.
 */

import type { Operacao, Finalidade } from './parametrizacao';

export type NaturezaOperacao = 'entrada' | 'saida';

export interface DadosOperacao {
  operacao?: Operacao;
  natureza?: NaturezaOperacao;
  finalidade?: Finalidade;
  origemUf?: string;
  destinoUf?: string;
  isDevolucao?: boolean;
}

export interface ParametrosCfopResolver {
  natureza?: NaturezaOperacao;       // 'saida' (padrão) ou 'entrada'
  operacao?: Operacao;               // 'interna', 'interestadual', 'importacao', 'exportacao'
  finalidade?: Finalidade;           // 'comercializacao', 'industrializacao', 'consumo', 'ativo'
  cst: string;                       // CST ou CSOSN (ex: '00', '10', '20', '40', '51', '60', '500')
  temSt?: boolean;                   // Flag explícita de Substituição Tributária
  isDevolucao?: boolean;             // Flag de operação de devolução/retorno
}

/**
 * Deriva o prefixo do CFOP (1º dígito) com base na natureza e localização da operação.
 */
export function determinarPrefixoCfop(operacao: Operacao, natureza: NaturezaOperacao = 'saida'): string {
  if (natureza === 'saida') {
    switch (operacao) {
      case 'interna':
        return '5';
      case 'interestadual':
        return '6';
      case 'exportacao':
        return '7';
      default:
        return '5';
    }
  } else {
    // entrada
    switch (operacao) {
      case 'interna':
        return '1';
      case 'interestadual':
        return '2';
      case 'importacao':
        return '3';
      default:
        return '1';
    }
  }
}

/**
 * Função principal: Determina o CFOP de forma dinâmica cruzando a Operação com o CST.
 *
 * @param operacao - Operacao ('interna', 'interestadual', 'importacao', 'exportacao') ou objeto completo
 * @param cst - CST do ICMS ('00', '10', '20', '40', '41', '50', '51', '60', '70', '90' ou CSOSN)
 * @returns Código CFOP formatado de 4 dígitos (ex: '5102', '5405', '6403', '1556')
 */
export function determinarCfop(
  operacaoOuParams: Operacao | ParametrosCfopResolver,
  cstParam?: string
): string {
  let opts: ParametrosCfopResolver;

  if (typeof operacaoOuParams === 'string') {
    opts = {
      operacao: operacaoOuParams,
      cst: cstParam || '00',
      natureza: 'saida',
      finalidade: 'comercializacao',
    };
  } else {
    opts = {
      natureza: 'saida',
      operacao: 'interna',
      finalidade: 'comercializacao',
      ...operacaoOuParams,
    };
  }

  const natureza = opts.natureza || 'saida';
  const operacao = opts.operacao || 'interna';
  const finalidade = opts.finalidade || 'comercializacao';
  const cstLimpo = (opts.cst || '').replace(/\D/g, '').slice(-2).padStart(2, '0');
  const csosnLimpo = (opts.cst || '').replace(/\D/g, '');
  const prefixo = determinarPrefixoCfop(operacao, natureza);

  // Identificação de Substituição Tributária
  const isSt =
    opts.temSt === true ||
    cstLimpo === '10' ||
    cstLimpo === '30' ||
    cstLimpo === '60' ||
    cstLimpo === '70' ||
    csosnLimpo === '201' ||
    csosnLimpo === '202' ||
    csosnLimpo === '203' ||
    csosnLimpo === '500';

  // ---------------------------------------------------------------------------
  // 1. OPERAÇÕES DE SAÍDA (Prefixos 5, 6, 7)
  // ---------------------------------------------------------------------------
  if (natureza === 'saida') {
    // Exterior / Exportação
    if (operacao === 'exportacao') {
      return '7102'; // Venda de mercadoria adquirida ou recebida de terceiros para o exterior
    }

    // Devolução de compra
    if (opts.isDevolucao) {
      if (isSt) return `${prefixo}411`; // Devolução de compra de mercadoria sujeita a ST
      return `${prefixo}202`;           // Devolução de compra para comercialização
    }

    // Regras de ST na Saída
    if (isSt) {
      // CST 60 / CSOSN 500: Mercadoria cobrada anteriormente por ST (Revendedor Varejista/Atacadista)
      if (cstLimpo === '60' || csosnLimpo === '500') {
        return `${prefixo}405`; // Venda de mercadoria adquirida/recebida de terceiros com ST retida antes
      }
      // CST 10 / 30 / 70: Saída com retenção do ICMS-ST pelo próprio remetente (Substituto Tributário)
      return `${prefixo}403`;   // Venda de mercadoria de terceiros em operação sujeita a ST
    }

    // Operações sem ST (Tributação Integral, Redução de BC, Isenção ou Diferimento)
    // CST 00 (Integral), 20 (Redução), 40/41 (Isenção), 51 (Diferimento)
    switch (finalidade) {
      case 'industrializacao':
        return `${prefixo}101`; // Venda de produção do estabelecimento
      case 'ativo':
        return `${prefixo}551`; // Venda de bem do ativo imobilizado
      case 'consumo':
        return `${prefixo}102`; // Venda de mercadoria de terceiros
      case 'comercializacao':
      default:
        return `${prefixo}102`; // Venda de mercadoria adquirida ou recebida de terceiros
    }
  }

  // ---------------------------------------------------------------------------
  // 2. OPERAÇÕES DE ENTRADA (Prefixos 1, 2, 3)
  // ---------------------------------------------------------------------------
  // Exterior / Importação
  if (operacao === 'importacao') {
    if (finalidade === 'industrializacao') return '3101';
    if (finalidade === 'consumo') return '3556';
    if (finalidade === 'ativo') return '3551';
    return '3102'; // Importação para comercialização
  }

  // Devolução de venda
  if (opts.isDevolucao) {
    if (isSt) return `${prefixo}411`;
    return `${prefixo}202`;
  }

  // Entrada para Uso e Consumo
  if (finalidade === 'consumo') {
    if (isSt) return `${prefixo}407`; // Compra de mercadoria para uso ou consumo com ST
    return `${prefixo}556`;           // Compra de material para uso ou consumo
  }

  // Entrada para Ativo Imobilizado
  if (finalidade === 'ativo') {
    if (isSt) return `${prefixo}406`; // Compra de bem para o ativo imobilizado com ST
    return `${prefixo}551`;           // Compra de bem para o ativo imobilizado
  }

  // Entrada para Industrialização
  if (finalidade === 'industrializacao') {
    if (isSt) return `${prefixo}401`; // Compra para industrialização em operação sujeita a ST
    return `${prefixo}101`;           // Compra para industrialização
  }

  // Entrada para Revenda / Comercialização
  if (isSt) {
    return `${prefixo}403`;           // Compra para comercialização em operação com mercadoria sujeita a ST
  }

  return `${prefixo}102`;             // Compra para comercialização normal
}

/**
 * Função utilitária de conveniência para determinação de CFOP com desacoplamento completo de NCM.
 *
 * @param operacao - Objeto de dados da operação ou string ('interna', 'interestadual', etc.)
 * @param cst - Código CST ou CSOSN do ICMS
 * @param temSubstituicao - Booleano indicando se a mercadoria/operação está sujeita a Substituição Tributária
 * @returns CFOP resultante de 4 dígitos
 */
export function determinarCfopDaOperacao(
  operacao: Operacao | DadosOperacao,
  cst: string,
  temSubstituicao?: boolean
): string {
  if (typeof operacao === 'string') {
    return determinarCfop({
      operacao,
      cst,
      temSt: temSubstituicao,
      natureza: 'saida',
      finalidade: 'comercializacao',
    });
  }
  return determinarCfop({
    ...operacao,
    cst,
    temSt: temSubstituicao !== undefined ? temSubstituicao : undefined,
  });
}

