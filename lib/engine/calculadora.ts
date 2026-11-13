/**
 * Calculadora Tributária Dinâmica do ICMS e ST
 * Aplicativo MCM - Auditoria Fiscal, NCM e Precificação
 *
 * Extrai taxas, MVAs, reduções e diferimentos exclusivamente dos parâmetros da RegraFisco
 * selecionada pelo Enquadrador Matricial, desvinculando-se de valores fixos (hardcoded).
 */

import type {
  RegraFisco,
  ValoresFinanceiros,
  DetalheCalculo,
  ParametroCalculo,
} from '../types/motor-tributario';

/**
 * Arredonda valores monetários para duas casas decimais com precisão bancária.
 */
function round2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula a MVA Ajustada segundo a fórmula canônica do CONFAZ:
 * MVA_ajustada = [ (1 + MVA_orig) * (1 - ALIQ_inter) / (1 - ALIQ_intra) ] - 1
 */
export function calcularMvaAjustada(
  mvaOriginal: number,
  aliquotaInter: number,
  aliquotaIntra: number
): number {
  if (aliquotaIntra >= 100 || aliquotaInter >= 100) return mvaOriginal;
  const fatorOrig = 1 + mvaOriginal / 100;
  const fatorInter = 1 - aliquotaInter / 100;
  const fatorIntra = 1 - aliquotaIntra / 100;

  if (fatorIntra <= 0) return mvaOriginal;

  const mvaAjustada = (fatorOrig * (fatorInter / fatorIntra) - 1) * 100;
  return round2(Math.max(0, mvaAjustada));
}

/**
 * Executa o cálculo determinístico do ICMS próprio, ICMS-ST, Diferimento, Reduções e FCP
 * com base na regra de enquadramento eleita e nos dados financeiros informados.
 */
export function executarCalculoIcms(
  regraPrincipal: RegraFisco,
  valores: ValoresFinanceiros
): DetalheCalculo {
  const memoria: string[] = [];

  // 1. Apuração da Base Bruta
  const valorOperacao = valores.valor_operacao || 0;
  const frete = valores.frete || 0;
  const seguro = valores.seguro || 0;
  const outrasDespesas = valores.outras_despesas || 0;
  const desconto = valores.desconto_incondicional || 0;
  const ipi = valores.ipi || 0;

  // Base inicial do ICMS normal: Operação + Frete + Seguro + Outras Despesas - Desconto (IPI não entra na base própria se revenda)
  const baseIntegral = Math.max(0, valorOperacao + frete + seguro + outrasDespesas - desconto);
  memoria.push(
    `Base bruta da operação: R$ ${baseIntegral.toFixed(2)} (Valor: ${valorOperacao.toFixed(2)}, Frete: ${frete.toFixed(2)}, Seguro: ${seguro.toFixed(2)}, Outras: ${outrasDespesas.toFixed(2)}, Desc: ${desconto.toFixed(2)})`
  );

  // Parâmetros da regra eleita
  const params: ParametroCalculo = regraPrincipal.parametros || {
    regra_id: regraPrincipal.id,
    aliquota_interna: 19.5,
    aliquota_interestadual: 12.0,
  };

  const aliquotaInterna = params.aliquota_interna ?? 19.5;
  const aliquotaInter = params.aliquota_interestadual ?? 12.0;
  const aliquotaAplicada = aliquotaInterna;
  const fcpPercentual = params.fcp ?? 0;

  let baseCalculoPropria = baseIntegral;
  let reducaoPercentual = params.pRedBC ?? 0;
  let diferimentoPercentual = params.pDif ?? 0;
  let cargaEfetiva = aliquotaAplicada;

  // 2. Tratamento por Tipo de Regra
  switch (regraPrincipal.tipo_regra) {
    case 'isencao': {
      baseCalculoPropria = 0;
      reducaoPercentual = 100;
      cargaEfetiva = 0;
      memoria.push(`Regra de Isenção aplicada (${regraPrincipal.id}): Base de cálculo própria zerada.`);
      break;
    }

    case 'reducao_bc': {
      // Se informada a carga efetiva pretendida, deriva o pRedBC se não fornecido
      if (params.carga_efetiva && params.carga_efetiva > 0 && reducaoPercentual <= 0) {
        reducaoPercentual = round2((1 - params.carga_efetiva / aliquotaAplicada) * 100);
      }

      if (reducaoPercentual > 0) {
        const fatorReducao = (100 - reducaoPercentual) / 100;
        baseCalculoPropria = round2(baseIntegral * fatorReducao);
        cargaEfetiva = round2((aliquotaAplicada * (100 - reducaoPercentual)) / 100);
        memoria.push(
          `Redução de Base de Cálculo (${reducaoPercentual}%): Base efetiva R$ ${baseCalculoPropria.toFixed(2)} (Carga efetiva: ${cargaEfetiva.toFixed(2)}%)`
        );
      }
      break;
    }

    case 'diferimento': {
      // Diferimento total ou parcial
      if (diferimentoPercentual <= 0 && (!params.carga_efetiva || params.carga_efetiva === 0)) {
        // Diferimento total (100%)
        diferimentoPercentual = 100;
        cargaEfetiva = 0;
      } else if (params.carga_efetiva && params.carga_efetiva > 0) {
        // Ex: Art. 28 Anexo VIII PR (19,5% -> 13% efetivo => pDif = 33,33%)
        cargaEfetiva = params.carga_efetiva;
        diferimentoPercentual = round2(((aliquotaAplicada - cargaEfetiva) / aliquotaAplicada) * 100);
      }
      memoria.push(
        `Diferimento aplicado (${diferimentoPercentual}%): Carga devida no ato de ${cargaEfetiva.toFixed(2)}%`
      );
      break;
    }

    case 'ST': {
      memoria.push(`Operação com mercadoria enquadrada no Regime de Substituição Tributária (ST).`);
      break;
    }

    case 'aliquota_normal':
    default: {
      memoria.push(`Tributação normal com alíquota integral de ${aliquotaAplicada}%.`);
      break;
    }
  }

  // 3. Cálculo do ICMS Próprio
  let valorIcmsProprio = 0;
  let valorIcmsDiferido = 0;

  if (baseCalculoPropria > 0) {
    const icmsIntegral = round2((baseCalculoPropria * aliquotaAplicada) / 100);

    if (diferimentoPercentual > 0) {
      if (params.carga_efetiva && params.carga_efetiva > 0) {
        // Carga efetiva direta evita distorção de centavos por dízima periódica (ex: 33,33%)
        valorIcmsProprio = round2((baseCalculoPropria * params.carga_efetiva) / 100);
        valorIcmsDiferido = round2(icmsIntegral - valorIcmsProprio);
      } else {
        valorIcmsDiferido = round2((icmsIntegral * diferimentoPercentual) / 100);
        valorIcmsProprio = round2(icmsIntegral - valorIcmsDiferido);
      }
      memoria.push(
        `ICMS Próprio com Diferimento: Integral R$ ${icmsIntegral.toFixed(2)} - Diferido R$ ${valorIcmsDiferido.toFixed(2)} = Devido R$ ${valorIcmsProprio.toFixed(2)}`
      );
    } else {
      valorIcmsProprio = icmsIntegral;
      memoria.push(`ICMS Próprio apurado: R$ ${valorIcmsProprio.toFixed(2)}`);
    }
  }

  // 4. Cálculo do FCP se aplicável
  let valorFcp = 0;
  if (fcpPercentual > 0 && baseCalculoPropria > 0) {
    valorFcp = round2((baseCalculoPropria * fcpPercentual) / 100);
    memoria.push(`FCP (${fcpPercentual}%): R$ ${valorFcp.toFixed(2)}`);
  }

  // 5. Cálculo do ICMS-ST se a regra for de Substituição Tributária
  let baseCalculoSt: number | undefined;
  let aliquotaSt: number | undefined;
  let mvaAplicada: number | undefined;
  let valorIcmsSt: number | undefined;

  if (regraPrincipal.tipo_regra === 'ST') {
    aliquotaSt = aliquotaInterna;

    // Definição da MVA
    if (params.mva_ajustada && params.mva_ajustada > 0) {
      mvaAplicada = params.mva_ajustada;
    } else if (params.mva_original && params.mva_original > 0) {
      mvaAplicada = params.mva_original;
    } else {
      mvaAplicada = 0;
    }

    // Base ST inclui o IPI
    const totalComIpi = baseIntegral + ipi;

    if (params.pmpf && params.pmpf > 0) {
      baseCalculoSt = round2(params.pmpf);
      memoria.push(`Base ST calculada por PMPF: R$ ${baseCalculoSt.toFixed(2)}`);
    } else {
      baseCalculoSt = round2(totalComIpi * (1 + mvaAplicada / 100));
      memoria.push(
        `Base ST (Total com IPI R$ ${totalComIpi.toFixed(2)} + MVA ${mvaAplicada}%): R$ ${baseCalculoSt.toFixed(2)}`
      );
    }

    // Débito ST bruto = Base ST * Alíquota Interna
    const debitoStBruto = round2((baseCalculoSt * aliquotaSt) / 100);
    // ICMS ST = Débito ST - ICMS Próprio
    valorIcmsSt = Math.max(0, round2(debitoStBruto - valorIcmsProprio));
    memoria.push(
      `ICMS ST: Débito Bruto R$ ${debitoStBruto.toFixed(2)} - Crédito Próprio R$ ${valorIcmsProprio.toFixed(2)} = R$ ${valorIcmsSt.toFixed(2)}`
    );
  }

  return {
    base_calculo_propria: round2(baseCalculoPropria),
    aliquota_propria: aliquotaAplicada,
    valor_icms_proprio: valorIcmsProprio,
    Valor_ICMS_Proprio: valorIcmsProprio,
    base_calculo_st: baseCalculoSt,
    aliquota_st: aliquotaSt,
    mva_aplicada: mvaAplicada,
    valor_icms_st: valorIcmsSt ?? 0,
    Valor_ICMS_ST: valorIcmsSt ?? 0,
    fcp: valorFcp,
    FCP: valorFcp,
    reducao_bc_percentual: reducaoPercentual > 0 ? reducaoPercentual : undefined,
    diferimento_percentual: diferimentoPercentual > 0 ? diferimentoPercentual : undefined,
    valor_icms_diferido: valorIcmsDiferido > 0 ? valorIcmsDiferido : undefined,
    carga_efetiva: cargaEfetiva,
    Carga_Efetiva: cargaEfetiva,
    memoria_calculo: memoria,
  };
}
