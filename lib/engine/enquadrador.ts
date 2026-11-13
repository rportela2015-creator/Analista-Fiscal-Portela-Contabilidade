/**
 * Enquadrador Tributário Matricial Bitemporal (ICMS / Reforma Tributária)
 * Aplicativo MCM - Auditoria Fiscal, NCM e Precificação
 *
 * Avalia regras fiscais com base em:
 * 1. Bitemporalidade rigorosa (vigência inicial e final da norma).
 * 2. Condições operacionais (origem, destino, destinação da mercadoria e regime do destinatário).
 * 3. Longest Match NCM (especificidade do NCM: 8 dígitos > 6 dígitos > 4 dígitos > 2 dígitos).
 * 4. Detecção determinística de conflitos normativos.
 */

import type {
  RegraFisco,
  Operacao,
  Vigencia,
  CondicaoOperacao,
  TipoRegraFiscal,
  TipoOperacaoFiscal,
  RegimeDestinatarioFiscal,
} from '../types/motor-tributario';
import { determinarCfopDaOperacao } from '../cfop-resolver';

export interface ParametrosOperacaoEnquadrador {
  operacao?: Operacao;
  origem_uf?: string;
  destino_uf?: string;
  regime_destinatario?: RegimeDestinatarioFiscal;
  tipo_operacao?: TipoOperacaoFiscal;
}

export interface ResultadoEnquadramento {
  regrasAplicaveis: RegraFisco[];
  conflito: boolean;
  regraPrincipal?: RegraFisco;
  cfopSugerido?: string;
  cstSugerido?: string;
  scoreMaximo?: number;
  motivoConflito?: string;
}

/**
 * Normaliza um código NCM ou CEST mantendo apenas dígitos numéricos.
 */
function limparDigitos(valor?: string | null): string {
  return (valor || '').replace(/\D/g, '');
}

/**
 * Normaliza datas no padrão YYYY-MM-DD para comparação cronológica direta.
 */
function normalizarDataIso(data: string): string {
  if (!data) return '';
  return data.trim().slice(0, 10);
}

/**
 * Verifica se a data de geração está compreendida no intervalo de vigência da norma.
 * Critério: vigencia.inicio <= dataGeracao E (vigencia.fim == null || vigencia.fim >= dataGeracao)
 */
export function estaVigenteNaData(vigencia: Vigencia, dataGeracao: string): boolean {
  const data = normalizarDataIso(dataGeracao);
  if (!data) return true; // Se não fornecida, assume corrente

  const inicio = normalizarDataIso(vigencia.inicio);
  if (inicio && data < inicio) {
    return false;
  }

  const fim = vigencia.fim ? normalizarDataIso(vigencia.fim) : null;
  if (fim && data > fim) {
    return false;
  }

  return true;
}

/**
 * Avalia a compatibilidade de uma condição operacional com a operação pretendida.
 */
function atendeCondicaoOperacional(
  condicao: CondicaoOperacao,
  ncmLimpo: string,
  cestLimpo: string,
  params: ParametrosOperacaoEnquadrador
): { compativel: boolean; ncmMatchDigits: number; score: number } {
  const operacao = params.operacao || 'interna';
  const origemUf = (params.origem_uf || (operacao === 'interna' ? 'PR' : 'SP')).toUpperCase();
  const destinoUf = (params.destino_uf || 'PR').toUpperCase();
  const regime = params.regime_destinatario || 'todos';
  const tipoOp = params.tipo_operacao || 'revenda';

  // 1. Compatibilidade de UF Origem
  if (condicao.origem_uf && condicao.origem_uf !== '*' && condicao.origem_uf.toUpperCase() !== origemUf) {
    return { compativel: false, ncmMatchDigits: 0, score: 0 };
  }

  // 2. Compatibilidade de UF Destino
  if (condicao.destino_uf && condicao.destino_uf !== '*' && condicao.destino_uf.toUpperCase() !== destinoUf) {
    return { compativel: false, ncmMatchDigits: 0, score: 0 };
  }

  // 3. Compatibilidade de Regime do Destinatário
  if (
    condicao.regime_destinatario &&
    condicao.regime_destinatario !== 'todos' &&
    regime !== 'todos' &&
    condicao.regime_destinatario !== regime
  ) {
    return { compativel: false, ncmMatchDigits: 0, score: 0 };
  }

  // 4. Compatibilidade de Tipo de Operação / Destinação
  if (condicao.tipo_operacao) {
    const condTipo = condicao.tipo_operacao;
    const ehEquivalenteRevenda =
      (condTipo === 'revenda' || condTipo === 'comercializacao') &&
      (tipoOp === 'revenda' || tipoOp === 'comercializacao');

    if (condTipo !== tipoOp && !ehEquivalenteRevenda) {
      return { compativel: false, ncmMatchDigits: 0, score: 0 };
    }
  }

  // 5. Longest Match NCM
  let maiorNcmMatch = 0;
  if (condicao.ncm_prefixo && condicao.ncm_prefixo.length > 0) {
    for (const prefixo of condicao.ncm_prefixo) {
      const pLimpo = limparDigitos(prefixo);
      if (pLimpo && ncmLimpo.startsWith(pLimpo)) {
        if (pLimpo.length > maiorNcmMatch) {
          maiorNcmMatch = pLimpo.length;
        }
      }
    }
    // Se a condição exigia prefixo NCM e nenhum casou, é incompatível
    if (maiorNcmMatch === 0) {
      return { compativel: false, ncmMatchDigits: 0, score: 0 };
    }
  }

  // 6. Compatibilidade de CEST se aplicável
  let cestScore = 0;
  if (condicao.cest) {
    const cLimpo = limparDigitos(condicao.cest);
    if (cestLimpo) {
      if (cestLimpo === cLimpo) {
        cestScore = 100;
      } else {
        // Se ambos especificaram CESTs divergentes, não atende
        return { compativel: false, ncmMatchDigits: 0, score: 0 };
      }
    } else {
      cestScore = 50;
    }
  }

  // Cálculo de Score de Especificidade
  // Base NCM: 8 dígitos = 800, 6 = 600, 4 = 400, 2 = 200
  let score = maiorNcmMatch * 100;
  score += cestScore;
  if (condicao.destino_uf && condicao.destino_uf !== '*') score += 40;
  if (condicao.origem_uf && condicao.origem_uf !== '*') score += 30;
  if (condicao.regime_destinatario && condicao.regime_destinatario !== 'todos') score += 20;
  if (condicao.tipo_operacao) score += 10;

  return { compativel: true, ncmMatchDigits: maiorNcmMatch, score };
}

/**
 * Função principal do Enquadrador Matricial:
 * Avalia regras vigentes em uma data específica considerando condições operacionais e longest match.
 *
 * @param ncm - Código NCM consultado (8 dígitos)
 * @param cest - Código CEST (7 dígitos) ou vazio
 * @param dataGeracao - Data da operação/emissão no formato YYYY-MM-DD
 * @param operacao - Tipo de operação ('interna', 'interestadual'...) ou objeto completo de parâmetros
 * @param regrasCatalogo - Catálogo de regras bitemporais cadastradas no fisco
 */
export function avaliarRegrasVigentes(
  ncm: string,
  cest: string,
  dataGeracao: string,
  operacao: Operacao | ParametrosOperacaoEnquadrador,
  regrasCatalogo: RegraFisco[]
): ResultadoEnquadramento {
  const ncmLimpo = limparDigitos(ncm);
  const cestLimpo = limparDigitos(cest);
  const params: ParametrosOperacaoEnquadrador =
    typeof operacao === 'string' ? { operacao } : { ...operacao };

  if (!regrasCatalogo || regrasCatalogo.length === 0) {
    return { regrasAplicaveis: [], conflito: false };
  }

  interface RegraComScore {
    regra: RegraFisco;
    maxMatchNcm: number;
    score: number;
  }

  const regrasCandidatas: RegraComScore[] = [];

  for (const regra of regrasCatalogo) {
    // 1. Filtragem Temporal (Vigência)
    if (!estaVigenteNaData(regra.vigencia, dataGeracao)) {
      continue;
    }

    // 2. Filtragem Operacional e Longest Match NCM
    let melhorMatchNcm = 0;
    let melhorScore = -1;
    let compativel = false;

    if (!regra.condicoes || regra.condicoes.length === 0) {
      // Regra genérica sem condições explícitas
      compativel = true;
      melhorScore = 10;
    } else {
      for (const cond of regra.condicoes) {
        const check = atendeCondicaoOperacional(cond, ncmLimpo, cestLimpo, params);
        if (check.compativel) {
          compativel = true;
          if (check.ncmMatchDigits > melhorMatchNcm) {
            melhorMatchNcm = check.ncmMatchDigits;
          }
          if (check.score > melhorScore) {
            melhorScore = check.score;
          }
        }
      }
    }

    if (compativel) {
      regrasCandidatas.push({
        regra,
        maxMatchNcm: melhorMatchNcm,
        score: melhorScore,
      });
    }
  }

  if (regrasCandidatas.length === 0) {
    return { regrasAplicaveis: [], conflito: false };
  }

  // 3. Hierarquia Material (Longest Match NCM):
  // Se houver regras com match de NCM mais específico (ex: 8 dígitos), descarta as mais genéricas (ex: 4 dígitos)
  const maxNcmDigits = Math.max(...regrasCandidatas.map((r) => r.maxMatchNcm));
  const regrasFiltradasPorNcm = regrasCandidatas.filter(
    (r) => r.maxMatchNcm === maxNcmDigits
  );

  // Ordena pelo score decrescente
  regrasFiltradasPorNcm.sort((a, b) => b.score - a.score);

  const regrasAplicaveis = regrasFiltradasPorNcm.map((r) => r.regra);
  const scoreMaximo = regrasFiltradasPorNcm[0]?.score || 0;

  // 4. Detecção de Conflitos Normativos Antagônicos
  // Conflito ocorre quando há regimes contraditórios para o mesmo fato gerador:
  // ex: isenção total simultânea com diferimento total ou redução antagônica sem ordenação
  let conflito = false;
  let motivoConflito: string | undefined;

  const tiposRegras = new Set(regrasAplicaveis.map((r) => r.tipo_regra));

  const temIsencao = tiposRegras.has('isencao');
  const temDiferimento = tiposRegras.has('diferimento');
  const temReducao = tiposRegras.has('reducao_bc');
  const temSt = tiposRegras.has('ST');
  const temNormal = tiposRegras.has('aliquota_normal');

  // Colisão de Isenção (Anexo V) x Diferimento Total (Anexo VIII)
  if (temIsencao && temDiferimento) {
    conflito = true;
    motivoConflito =
      'Colisão detectada entre hipótese de Isenção (Anexo V) e Diferimento (Anexo VIII) sem cláusula de prevalência legal.';
  } else if (temIsencao && temReducao) {
    conflito = true;
    motivoConflito =
      'Colisão detectada entre Isenção Total e Redução de Base de Cálculo no mesmo período de vigência.';
  } else if (temIsencao && temSt) {
    conflito = true;
    motivoConflito =
      'Colisão normativa entre Isenção Tributária e Regime de Substituição Tributária (ST).';
  } else if (regrasAplicaveis.length > 1 && temReducao && !temSt) {
    // Duas regras de redução com percentuais ou cargas divergentes
    const regrasReducao = regrasAplicaveis.filter((r) => r.tipo_regra === 'reducao_bc');
    if (regrasReducao.length > 1) {
      const pReds = new Set(regrasReducao.map((r) => r.parametros?.pRedBC).filter((v) => v !== undefined));
      if (pReds.size > 1) {
        conflito = true;
        motivoConflito = 'Múltiplas regras de redução de base de cálculo com percentuais divergentes.';
      }
    }
  }

  // 5. Seleção da Regra Principal e Sugestão de CST / CFOP
  const regraPrincipal = regrasAplicaveis[0];
  let cstSugerido = regraPrincipal?.cst_exigido;
  if (!cstSugerido) {
    switch (regraPrincipal?.tipo_regra) {
      case 'ST':
        cstSugerido = '60';
        break;
      case 'isencao':
        cstSugerido = '40';
        break;
      case 'reducao_bc':
        cstSugerido = '20';
        break;
      case 'diferimento':
        cstSugerido = '51';
        break;
      case 'aliquota_normal':
      default:
        cstSugerido = '00';
        break;
    }
  }

  // Derivação dinâmica de CFOP usando o resolver desacoplado
  const cfopSugerido =
    regraPrincipal?.cfop_sugerido ||
    determinarCfopDaOperacao(
      {
        operacao: params.operacao || 'interna',
        origemUf: params.origem_uf,
        destinoUf: params.destino_uf,
        finalidade: params.tipo_operacao === 'uso_consumo' ? 'consumo' : 'comercializacao',
      },
      cstSugerido,
      regraPrincipal?.tipo_regra === 'ST'
    );

  return {
    regrasAplicaveis,
    conflito,
    regraPrincipal,
    cfopSugerido,
    cstSugerido,
    scoreMaximo,
    motivoConflito,
  };
}
