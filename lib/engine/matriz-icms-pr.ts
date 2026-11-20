/**
 * Motor Bitemporal e Matriz Normativa do ICMS/PR
 *
 * Baseado na Lei Estadual nº 11.580/1996, Lei nº 21.308/2022, Lei nº 21.850/2023,
 * Decretos Estaduais nº 6.048/2024 e nº 12.828/2026, Convênios ICMS 15/2023, 127/2026 e 128/2026.
 */

import matrizData from '../../rules/icms-pr-matriz.json';

export interface ResultadoAliquotaPr {
  aliquotaIcmsPct: number;
  aliquotaFecopPct: number;
  aliquotaTotalPct: number;
  sujeitoFecop: boolean;
  ehCombustivelMonofasico: boolean;
  aliquotaAdRem?: number;
  unidadeAdRem?: string;
  dispositivoLegal: string;
  tipoAliquota: 'modal' | 'seletiva' | 'monofasica';
}

export interface ResultadoExclusaoStPr {
  excluidoDaSt: boolean;
  decreto?: string;
  dataExclusao?: string;
  orientacao?: string;
}

export interface ParametrosSimplesPr {
  faixaIsentaRbt12Ate: number;
  sublimiteEstadualRbt12: number;
  limiteExcesso20Pct: number;
  tetoFederalRbt12: number;
  tabelaComercio: string;
  tabelaIndustria: string;
  travaReducao2017: string;
}

function limparDigitos(val?: string | null): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function normalizarData(data?: string | null): string {
  if (!data) {
    return new Date().toISOString().slice(0, 10);
  }
  const limpa = String(data).trim();
  if (limpa.includes('T')) {
    return limpa.split('T')[0];
  }
  if (limpa.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(limpa)) {
    return limpa.slice(0, 10);
  }
  return limpa;
}

/**
 * Resolve a alíquota interna do ICMS no Estado do Paraná com estrita bitemporalidade,
 * identificando alíquotas seletivas, FECOP (Anexo XII) e combustíveis monofásicos (ad rem).
 */
export function resolverAliquotaPrBitemporal(
  ncm: string,
  dataFatoGerador: string,
  ehParteOuPeca: boolean = false
): ResultadoAliquotaPr {
  const ncmLimpo = limparDigitos(ncm);
  const data = normalizarData(dataFatoGerador);

  // 1. Verificação de Combustíveis Monofásicos Ad Rem (LC 192/2022)
  if (matrizData.combustiveis_monofasicos_ad_rem) {
    for (const periodo of matrizData.combustiveis_monofasicos_ad_rem) {
      const inicio = periodo.vigencia_inicio;
      const fim = periodo.vigencia_fim;
      const dentroVigencia = data >= inicio && (!fim || data <= fim);

      if (dentroVigencia && periodo.aliquotas) {
        for (const chaveComb of Object.keys(periodo.aliquotas)) {
          const comb = (periodo.aliquotas as any)[chaveComb];
          if (comb?.prefixos_ncm?.some((prefixo: string) => ncmLimpo.startsWith(prefixo))) {
            return {
              aliquotaIcmsPct: 0,
              aliquotaFecopPct: 0,
              aliquotaTotalPct: 0,
              sujeitoFecop: false,
              ehCombustivelMonofasico: true,
              aliquotaAdRem: comb.valor_ad_rem,
              unidadeAdRem: comb.unidade,
              dispositivoLegal: periodo.dispositivo_legal,
              tipoAliquota: 'monofasica',
            };
          }
        }
      }
    }
  }

  // 2. Verificação de Alíquota Seletiva e Incidência de FECOP (Art. 14 e 14-A Lei 11.580/1996)
  let aliquotaIcmsPct: number | null = null;
  let aliquotaFecopPct: number = 0;
  let sujeitoFecop: boolean = false;
  let dispositivoLegal: string = '';
  let tipoAliquota: 'modal' | 'seletiva' | 'monofasica' = 'modal';

  // Verifica se há enquadramento em alíquotas seletivas (7%, 12%, 18%, 25%, 29%)
  if (matrizData.aliquotas_seletivas_pr) {
    for (const seletiva of matrizData.aliquotas_seletivas_pr) {
      if (ehParteOuPeca && (seletiva as any).exclui_partes_e_pecas) {
        continue;
      }
      if (seletiva.excluir_ncms?.some((exc: string) => ncmLimpo === exc || ncmLimpo.startsWith(exc))) {
        continue;
      }
      if (seletiva.prefixos_ncm?.some((prefixo: string) => ncmLimpo.startsWith(prefixo))) {
        aliquotaIcmsPct = seletiva.aliquota_pct;
        dispositivoLegal = seletiva.dispositivo_legal;
        tipoAliquota = 'seletiva';
        break;
      }
    }
  }

  // 3. Verificação de FECOP (Anexo XII RICMS/PR c/c Art. 14-A Lei 11.580/1996)
  if (matrizData.fecop_anexo_xii?.itens) {
    for (const itemFecop of matrizData.fecop_anexo_xii.itens) {
      const ehExcecao = itemFecop.excluir_ncms?.some(
        (exc: string) => ncmLimpo === exc || ncmLimpo.startsWith(exc)
      );
      if (ehExcecao) {
        continue;
      }

      if (itemFecop.prefixos_ncm?.some((pref: string) => ncmLimpo.startsWith(pref))) {
        sujeitoFecop = true;
        aliquotaFecopPct = itemFecop.fecop_pct;

        // Se o item FECOP definir base ICMS específica (ex: perfumaria 23% ICMS + 2% FECOP = 25% total)
        if (itemFecop.base_icms_pct !== undefined) {
          aliquotaIcmsPct = itemFecop.base_icms_pct;
        }
        tipoAliquota = 'seletiva';
        dispositivoLegal = `${dispositivoLegal ? dispositivoLegal + ' c/c ' : ''}${matrizData.fecop_anexo_xii.dispositivo_legal}`;
        break;
      }
    }
  }

  // 4. Se não for seletiva, aplica Alíquota Modal Bitemporal
  if (aliquotaIcmsPct === null) {
    let modalEncontrada = false;
    if (matrizData.aliquota_modal_pr) {
      for (const modal of matrizData.aliquota_modal_pr) {
        const inicio = modal.vigencia_inicio;
        const fim = modal.vigencia_fim;
        if (data >= inicio && (!fim || data <= fim)) {
          aliquotaIcmsPct = modal.aliquota_pct;
          dispositivoLegal = modal.dispositivo_legal;
          tipoAliquota = 'modal';
          modalEncontrada = true;
          break;
        }
      }
    }
    // Fallback de segurança se data fora do intervalo previsto
    if (!modalEncontrada || aliquotaIcmsPct === null) {
      aliquotaIcmsPct = 19.5;
      dispositivoLegal = 'Art. 14, IV da Lei nº 11.580/1996 (redação Lei nº 21.850/2023)';
      tipoAliquota = 'modal';
    }
  }

  const aliquotaTotalPct = Number((aliquotaIcmsPct + aliquotaFecopPct).toFixed(2));

  return {
    aliquotaIcmsPct,
    aliquotaFecopPct,
    aliquotaTotalPct,
    sujeitoFecop,
    ehCombustivelMonofasico: false,
    dispositivoLegal,
    tipoAliquota,
  };
}

/**
 * Verifica se a mercadoria foi expressamente excluída do regime de Substituição Tributária (ST)
 * no Estado do Paraná com base na vigência histórica dos Decretos nº 6.048/2024 e nº 12.828/2026.
 */
export function verificarExclusaoStPr(
  ncm: string,
  cest: string | undefined,
  dataFatoGerador: string
): ResultadoExclusaoStPr {
  const ncmLimpo = limparDigitos(ncm);
  const cestLimpo = limparDigitos(cest);
  const data = normalizarData(dataFatoGerador);

  if (!matrizData.exclusoes_st_pr) {
    return { excluidoDaSt: false };
  }

  for (const exclusao of matrizData.exclusoes_st_pr) {
    const inicio: string = exclusao.vigencia_inicio;
    const fim: string | null = exclusao.vigencia_fim as string | null;
    const dentroVigencia = data >= inicio && (!fim || data <= fim);

    if (dentroVigencia) {
      // 1º critério: CEST bate com segmento revogado (ex: 21 para eletrônicos)
      const matchCest =
        cestLimpo.length >= 2 &&
        exclusao.segmentos_cest?.some((seg: string) => cestLimpo.startsWith(seg));

      // 2º critério: NCM bate com prefixos revogados pelo Decreto
      const matchNcm = exclusao.prefixos_ncm?.some((pref: string) => ncmLimpo.startsWith(pref));

      if (matchCest || matchNcm) {
        return {
          excluidoDaSt: true,
          decreto: exclusao.norma,
          dataExclusao: exclusao.vigencia_inicio,
          orientacao: exclusao.orientacao,
        };
      }
    }
  }

  return {
    excluidoDaSt: false,
  };
}

/**
 * Retorna os parâmetros vigentes do Simples Nacional no Paraná (Decreto nº 8.660/2018 e LC 123/2006).
 */
export function obterParametrosSimplesPr(): ParametrosSimplesPr {
  const sn = matrizData.simples_nacional_pr;
  return {
    faixaIsentaRbt12Ate: sn.faixa_isenta_rbt12_ate,
    sublimiteEstadualRbt12: sn.sublimite_estadual_rbt12,
    limiteExcesso20Pct: sn.limite_excesso_20_pct,
    tetoFederalRbt12: sn.teto_federal_rbt12,
    tabelaComercio: sn.tabela_comercio,
    tabelaIndustria: sn.tabela_industria,
    travaReducao2017: sn.trava_reducao_2017,
  };
}
