/**
 * Regras Fiscais Avançadas e Engrenagens Periciais do ICMS/PR
 * Decreto Estadual nº 7.871/2017 (RICMS/PR), Lei Estadual nº 11.580/1996,
 * Lei Estadual nº 15.562/2007, Decreto Estadual nº 8.660/2018, Decreto Estadual nº 5.143/2024,
 * Convênio ICMS 142/2018, Convênio ICMS 35/2011, e Consultas Tributárias SEFA/PR nº 43/2023, 51/2021 e 018/2026.
 */

import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from './matriz-icms-pr';
import { consultarMvaStPr, resolverCbenefPr } from './tabelas-pr';

export const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
export const r4 = (v: number): number => Math.round((v + Number.EPSILON) * 10000) / 10000;

// ============================================================================
// 1. DIFERIMENTO PARCIAL (ART. 28 ANEXO VIII - DECRETO PR Nº 5.143/2024)
// ============================================================================

export interface EntradaDiferimentoParcialPR {
  valorOperacao: number;
  aliqInternaPct: number;
  ufOrigem?: string;
  ufDestino?: string;
  crtEmitente?: '1' | '2' | '3' | '4' | number;
  crtDestinatario?: '1' | '2' | '3' | '4' | number;
  destinatarioConsumidorFinal?: boolean;
  ehCombustivel?: boolean;
  destinatarioConstrucaoCivil?: boolean;
}

export interface DiagnosticoDiferimentoParcialPR {
  aplicavel: boolean;
  motivoBloqueio?: string;
  cargaEfetiva: number;
  fatorBaseTributavel: number;
  fatorBaseTributavelPct: number;
  percentualDiferidoPct: number;
  bcTributada: number;
  icmsDestacado: number;
  icmsDiferido: number;
  cst: string;
  cBenefReferencia: string;
  exigeEstornoCredito: boolean;
  dispositivoLegal: string;
  memoriaCalculo: string[];
}

/**
 * Calcula o Diferimento Parcial do ICMS nas saídas internas paranaenses entre contribuintes
 * (Art. 28, inciso I, alínea "a" do Anexo VIII do RICMS/PR c/c Decreto nº 5.143/2024).
 * Carga tributária efetiva de 12% nas mercadorias sujeitas à alíquota interna superior a 12%.
 */
export function calcularDiferimentoParcialPR(
  input: EntradaDiferimentoParcialPR
): DiagnosticoDiferimentoParcialPR {
  const memoriaCalculo: string[] = [];
  const ufO = (input.ufOrigem || 'PR').trim().toUpperCase();
  const ufD = (input.ufDestino || 'PR').trim().toUpperCase();
  const crtD = Number(input.crtDestinatario ?? 3);
  const aliq =
    input.aliqInternaPct !== undefined && Number(input.aliqInternaPct) > 0
      ? Number(input.aliqInternaPct)
      : resolverAliquotaPrBitemporal('00000000', new Date().toISOString().slice(0, 10)).aliquotaIcmsPct;
  const valor = Number(input.valorOperacao || 0);

  // 1. Travas Automáticas de Bloqueio
  if (ufO !== 'PR' || ufD !== 'PR') {
    return {
      aplicavel: false,
      motivoBloqueio: 'Diferimento parcial aplicável exclusivamente a operações internas no Paraná (Art. 28 do Anexo VIII do RICMS/PR).',
      cargaEfetiva: aliq,
      fatorBaseTributavel: 1.0,
      fatorBaseTributavelPct: 100.0,
      percentualDiferidoPct: 0,
      bcTributada: valor,
      icmsDestacado: r2(valor * (aliq / 100)),
      icmsDiferido: 0,
      cst: '00',
      cBenefReferencia: 'SEM_BENEFICIO',
      exigeEstornoCredito: false,
      dispositivoLegal: 'Art. 28 do Anexo VIII do RICMS/PR (Inaplicável - Operação Interestadual).',
      memoriaCalculo: ['Operação interestadual — Diferimento parcial vedado.'],
    };
  }

  if (crtD === 1 || crtD === 4) {
    return {
      aplicavel: false,
      motivoBloqueio: 'Vedado diferimento parcial nas saídas destinadas a optante pelo Simples Nacional ou MEI (Art. 28, § 1º, "a" do Anexo VIII do RICMS/PR).',
      cargaEfetiva: aliq,
      fatorBaseTributavel: 1.0,
      fatorBaseTributavelPct: 100.0,
      percentualDiferidoPct: 0,
      bcTributada: valor,
      icmsDestacado: r2(valor * (aliq / 100)),
      icmsDiferido: 0,
      cst: '00',
      cBenefReferencia: 'SEM_BENEFICIO',
      exigeEstornoCredito: false,
      dispositivoLegal: 'Art. 28, § 1º, "a" do Anexo VIII do RICMS/PR (Vedação Simples Nacional / MEI).',
      memoriaCalculo: ['Destinatário optante pelo Simples Nacional/MEI — Diferimento parcial vedado expressamente pela SEFA/PR.'],
    };
  }

  if (input.destinatarioConsumidorFinal) {
    return {
      aplicavel: false,
      motivoBloqueio: 'Vedado diferimento parcial nas saídas destinadas a consumidor final (Art. 28, § 1º, "b" do Anexo VIII do RICMS/PR).',
      cargaEfetiva: aliq,
      fatorBaseTributavel: 1.0,
      fatorBaseTributavelPct: 100.0,
      percentualDiferidoPct: 0,
      bcTributada: valor,
      icmsDestacado: r2(valor * (aliq / 100)),
      icmsDiferido: 0,
      cst: '00',
      cBenefReferencia: 'SEM_BENEFICIO',
      exigeEstornoCredito: false,
      dispositivoLegal: 'Art. 28, § 1º, "b" do Anexo VIII do RICMS/PR (Vedação Consumidor Final).',
      memoriaCalculo: ['Destinatário consumidor final — Diferimento parcial vedado.'],
    };
  }

  if (input.ehCombustivel || input.destinatarioConstrucaoCivil) {
    return {
      aplicavel: false,
      motivoBloqueio: 'Vedado diferimento parcial para combustíveis/petróleo monofásicos ou empresas de construção civil (Art. 28, § 1º do Anexo VIII do RICMS/PR).',
      cargaEfetiva: aliq,
      fatorBaseTributavel: 1.0,
      fatorBaseTributavelPct: 100.0,
      percentualDiferidoPct: 0,
      bcTributada: valor,
      icmsDestacado: r2(valor * (aliq / 100)),
      icmsDiferido: 0,
      cst: '00',
      cBenefReferencia: 'SEM_BENEFICIO',
      exigeEstornoCredito: false,
      dispositivoLegal: 'Art. 28, § 1º do Anexo VIII do RICMS/PR (Vedação Combustíveis / Construção Civil).',
      memoriaCalculo: ['Atividade de construção civil ou combustíveis monofásicos — Diferimento parcial vedado.'],
    };
  }

  if (aliq <= 12.0) {
    return {
      aplicavel: false,
      motivoBloqueio: 'Diferimento parcial aplicável apenas a mercadorias sujeitas à alíquota interna superior a 12% (Art. 28 do Anexo VIII do RICMS/PR).',
      cargaEfetiva: aliq,
      fatorBaseTributavel: 1.0,
      fatorBaseTributavelPct: 100.0,
      percentualDiferidoPct: 0,
      bcTributada: valor,
      icmsDestacado: r2(valor * (aliq / 100)),
      icmsDiferido: 0,
      cst: '00',
      cBenefReferencia: 'SEM_BENEFICIO',
      exigeEstornoCredito: false,
      dispositivoLegal: 'Art. 28 do Anexo VIII do RICMS/PR (Alíquota menor ou igual a 12%).',
      memoriaCalculo: [`Alíquota interna de ${aliq}% já é igual ou inferior a 12% — Benefício não aplicável.`],
    };
  }

  // 2. Cálculo do Diferimento Parcial (Carga 12%)
  const fatorBaseTributavel = 12.0 / aliq;
  const fatorBaseTributavelPct = r4(fatorBaseTributavel * 100);
  const percentualDiferido = 1.0 - fatorBaseTributavel;
  const percentualDiferidoPct = r4(percentualDiferido * 100);

  const bcTributada = r2(valor * fatorBaseTributavel);
  const icmsDestacado = r2(valor * 0.12);
  const icmsDiferido = r2(valor * (aliq / 100) - icmsDestacado);

  memoriaCalculo.push(`Operação Interna PR entre Contribuintes do Regime Normal.`);
  memoriaCalculo.push(`Alíquota Interna Integral: ${aliq}% ➔ Carga Tributária Efetiva: 12,00%`);
  memoriaCalculo.push(`Fator de Base Tributável: 12 / ${aliq} = ${fatorBaseTributavel.toFixed(6)} (${fatorBaseTributavelPct.toFixed(4)}%)`);
  memoriaCalculo.push(`Percentual Diferido: ${percentualDiferidoPct.toFixed(4)}%`);
  memoriaCalculo.push(`Base de Cálculo Tributada: R$ ${valor.toFixed(2)} * ${fatorBaseTributavel.toFixed(6)} = R$ ${bcTributada.toFixed(2)}`);
  memoriaCalculo.push(`ICMS Destacado no Documento Fiscal: R$ ${valor.toFixed(2)} * 12% = R$ ${icmsDestacado.toFixed(2)}`);
  memoriaCalculo.push(`ICMS Diferido (Recolhimento Postergado): R$ ${icmsDiferido.toFixed(2)}`);
  memoriaCalculo.push(`Dispensa expressa de estorno de crédito da entrada na operação antecedente (Art. 28 Anexo VIII).`);

  const cBenefDiferimento = resolverCbenefPr({
    tipoBeneficio: 'diferimento_parcial_art28',
    cst: '51',
  });

  return {
    aplicavel: true,
    cargaEfetiva: 12.0,
    fatorBaseTributavel: r4(fatorBaseTributavel),
    fatorBaseTributavelPct,
    percentualDiferidoPct,
    bcTributada,
    icmsDestacado,
    icmsDiferido,
    cst: '51',
    cBenefReferencia: cBenefDiferimento.cBenef,
    exigeEstornoCredito: false,
    dispositivoLegal: 'Art. 28, inciso I, alínea "a" do Anexo VIII do RICMS/PR (Decreto nº 5.143/2024).',
    memoriaCalculo,
  };
}

// ============================================================================
// 2. REDUÇÃO DE BASE DE CÁLCULO E ESTORNO (ANEXO VI E ART. 45, IV RICMS/PR)
// ============================================================================

export type PerfilReducaoAnexoVIPR =
  | 'CESTA_BASICA_ANEXO_VI_ITEM_9'
  | 'MAQUINAS_INDUSTRIAIS_ANEXO_VI_ITEM_21'
  | 'AERONAVES_DRONES_ANEXO_VI_ITEM_1'
  | 'INSUMOS_AGRO_ANEXO_VI_ITENS_15_16'
  | 'GENERICO_ANEXO_VI';

export interface EntradaReducaoBcEEstornoPR {
  perfil: PerfilReducaoAnexoVIPR;
  valorOperacao: number;
  aliqInternaPct: number;
  destinatarioConsumidorFinal?: boolean;
  ehParteOuPeca?: boolean;
  cargaEfetivaGenericaPct?: number;
  manutencaoCredito?: boolean;
  creditoIcmsEntrada?: number;
  ufOrigem?: string;
  ufDestino?: string;
}

export interface DiagnosticoReducaoBcEEstornoPR {
  beneficioAplicavel: boolean;
  perfil: PerfilReducaoAnexoVIPR;
  cst: string;
  cargaEfetivaPct: number;
  baseTributavelPct: number;
  percentualReducaoBc: number;
  bcReduzida: number;
  icmsDevido: number;
  isentoConsumidorFinal?: boolean;
  manutencaoCredito: boolean;
  percentualEstornoCredito: number;
  valorEstornoCredito: number;
  creditoLiquidoMantido: number;
  dispositivoLegal: string;
  alerta?: string;
  memoriaCalculo: string[];
}

/**
 * Calcula reduções de base de cálculo do Anexo VI do RICMS/PR e apura
 * o estorno proporcional obrigatório de créditos de entrada (Art. 45, IV RICMS/PR).
 */
export function calcularReducaoBcEEstornoPR(
  input: EntradaReducaoBcEEstornoPR
): DiagnosticoReducaoBcEEstornoPR {
  const memoriaCalculo: string[] = [];
  const aliq =
    input.aliqInternaPct !== undefined && Number(input.aliqInternaPct) > 0
      ? Number(input.aliqInternaPct)
      : resolverAliquotaPrBitemporal('00000000', new Date().toISOString().slice(0, 10)).aliquotaIcmsPct;
  const valor = Number(input.valorOperacao || 0);
  const creditoEntrada = Number(input.creditoIcmsEntrada || 0);

  // Perfil 1: Cesta Básica (Item 9 do Anexo VI do RICMS/PR)
  if (input.perfil === 'CESTA_BASICA_ANEXO_VI_ITEM_9') {
    if (input.destinatarioConsumidorFinal) {
      // Saída a consumidor final -> Redirecionamento para Isenção Integral (Item 21 Anexo V)
      const valorEstorno = r2(creditoEntrada * 1.0);
      memoriaCalculo.push(`Operação com produto da Cesta Básica destinada a Consumidor Final.`);
      memoriaCalculo.push(`Aplicação do Item 21 do Anexo V do RICMS/PR: Isenção Integral (CST 40).`);
      memoriaCalculo.push(`Estorno Obrigatório do Crédito de Entrada (Art. 45, inciso I do RICMS/PR): 100% ➔ R$ ${valorEstorno.toFixed(2)}.`);

      return {
        beneficioAplicavel: true,
        perfil: input.perfil,
        cst: '40',
        cargaEfetivaPct: 0,
        baseTributavelPct: 0,
        percentualReducaoBc: 100.0,
        bcReduzida: 0,
        icmsDevido: 0,
        isentoConsumidorFinal: true,
        manutencaoCredito: false,
        percentualEstornoCredito: 100.0,
        valorEstornoCredito: valorEstorno,
        creditoLiquidoMantido: 0,
        dispositivoLegal: 'Art. 3º e Item 21 do Anexo V do RICMS/PR (Isenção interna a consumidor final) c/c Art. 45, I.',
        memoriaCalculo,
      };
    }

    // Saída B2B Contribuinte: Carga 7%
    const baseTributavelFator = 7.0 / aliq;
    const baseTributavelPct = r4(baseTributavelFator * 100);
    const percentualReducaoBc = r4(100.0 - baseTributavelPct);
    const bcReduzida = r2(valor * baseTributavelFator);
    const icmsDevido = r2(valor * 0.07);

    const manutencao = input.manutencaoCredito ?? false;
    let percentualEstornoCredito = 0;
    let valorEstornoCredito = 0;
    let creditoLiquidoMantido = creditoEntrada;

    if (!manutencao && creditoEntrada > 0) {
      const fatorEstorno = 1.0 - baseTributavelFator;
      percentualEstornoCredito = r4(fatorEstorno * 100);
      valorEstornoCredito = r2(creditoEntrada * fatorEstorno);
      creditoLiquidoMantido = r2(creditoEntrada - valorEstornoCredito);
    }

    memoriaCalculo.push(`Cesta Básica B2B — Item 9 do Anexo VI do RICMS/PR.`);
    memoriaCalculo.push(`Alíquota Interna: ${aliq}% ➔ Carga Efetiva: 7,00%`);
    memoriaCalculo.push(`Base Tributável: (7 / ${aliq}) = ${baseTributavelPct.toFixed(4)}% ➔ Redução: ${percentualReducaoBc.toFixed(4)}%`);
    memoriaCalculo.push(`Base Reduzida: R$ ${bcReduzida.toFixed(2)} | ICMS Devido (7%): R$ ${icmsDevido.toFixed(2)}`);

    if (!manutencao) {
      memoriaCalculo.push(`Estorno Proporcional Obrigatório (Art. 45, IV RICMS/PR): ${percentualEstornoCredito.toFixed(4)}% sobre R$ ${creditoEntrada.toFixed(2)} = R$ ${valorEstornoCredito.toFixed(2)}`);
      memoriaCalculo.push(`Crédito Líquido Remanescente: R$ ${creditoLiquidoMantido.toFixed(2)}`);
    } else {
      memoriaCalculo.push(`Manutenção expressa de crédito autorizada.`);
    }

    return {
      beneficioAplicavel: true,
      perfil: input.perfil,
      cst: '20',
      cargaEfetivaPct: 7.0,
      baseTributavelPct,
      percentualReducaoBc,
      bcReduzida,
      icmsDevido,
      isentoConsumidorFinal: false,
      manutencaoCredito: manutencao,
      percentualEstornoCredito,
      valorEstornoCredito,
      creditoLiquidoMantido,
      dispositivoLegal: 'Item 9 do Anexo VI do RICMS/PR c/c Art. 45, inciso IV (Estorno Proporcional).',
      memoriaCalculo,
    };
  }

  // Perfil 2: Máquinas e Aparelhos Industriais (Item 21 do Anexo VI - Convênio ICMS 52/1991)
  if (input.perfil === 'MAQUINAS_INDUSTRIAIS_ANEXO_VI_ITEM_21') {
    if (input.ehParteOuPeca) {
      memoriaCalculo.push(`Item identificado como partes e peças isoladas.`);
      memoriaCalculo.push(`Trava de Bloqueio: Consulta Tributária SEFA/PR nº 51/2021 veda o benefício do Item 21 do Anexo VI a partes e peças.`);
      memoriaCalculo.push(`Tributação normal com alíquota integral de ${aliq}%.`);

      return {
        beneficioAplicavel: false,
        perfil: input.perfil,
        cst: '00',
        cargaEfetivaPct: aliq,
        baseTributavelPct: 100.0,
        percentualReducaoBc: 0,
        bcReduzida: valor,
        icmsDevido: r2(valor * (aliq / 100)),
        manutencaoCredito: true,
        percentualEstornoCredito: 0,
        valorEstornoCredito: 0,
        creditoLiquidoMantido: creditoEntrada,
        dispositivoLegal: 'Item 21 do Anexo VI do RICMS/PR (Inaplicável a partes/peças — Consulta SEFA/PR nº 51/2021).',
        alerta: 'Benefício do Item 21 do Anexo VI do RICMS/PR inaplicável a partes e peças (Consulta SEFA/PR nº 51/2021). Risco de glosa e autuação por apropriação indevida.',
        memoriaCalculo,
      };
    }

    const baseTributavelFator = 8.8 / aliq;
    const baseTributavelPct = r4(baseTributavelFator * 100);
    const percentualReducaoBc = r4(100.0 - baseTributavelPct);
    const bcReduzida = r2(valor * baseTributavelFator);
    const icmsDevido = r2(valor * 0.088);

    memoriaCalculo.push(`Máquinas Industriais — Item 21 do Anexo VI (Convênio ICMS 52/1991).`);
    memoriaCalculo.push(`Carga Tributária Efetiva: 8,80% | Manutenção Integral de Crédito Autorizada (Cláusula 5ª Convênio 52/91).`);

    return {
      beneficioAplicavel: true,
      perfil: input.perfil,
      cst: '20',
      cargaEfetivaPct: 8.8,
      baseTributavelPct,
      percentualReducaoBc,
      bcReduzida,
      icmsDevido,
      manutencaoCredito: true,
      percentualEstornoCredito: 0,
      valorEstornoCredito: 0,
      creditoLiquidoMantido: creditoEntrada,
      dispositivoLegal: 'Item 21 do Anexo VI do RICMS/PR (Convênio ICMS 52/1991 — Carga 8,8% c/ manutenção de crédito).',
      memoriaCalculo,
    };
  }

  // Perfil 3: Aeronaves, Drones e Partes (Item 1 do Anexo VI - Convênio ICMS 75/1991)
  if (input.perfil === 'AERONAVES_DRONES_ANEXO_VI_ITEM_1') {
    const baseTributavelFator = 4.0 / aliq;
    const baseTributavelPct = r4(baseTributavelFator * 100);
    const percentualReducaoBc = r4(100.0 - baseTributavelPct);
    const bcReduzida = r2(valor * baseTributavelFator);
    const icmsDevido = r2(valor * 0.04);

    memoriaCalculo.push(`Aeronaves e Equipamentos — Item 1 do Anexo VI (Convênio ICMS 75/1991).`);
    memoriaCalculo.push(`Carga Tributária Efetiva: 4,00% com manutenção de crédito assegurada.`);

    return {
      beneficioAplicavel: true,
      perfil: input.perfil,
      cst: '20',
      cargaEfetivaPct: 4.0,
      baseTributavelPct,
      percentualReducaoBc,
      bcReduzida,
      icmsDevido,
      manutencaoCredito: true,
      percentualEstornoCredito: 0,
      valorEstornoCredito: 0,
      creditoLiquidoMantido: creditoEntrada,
      dispositivoLegal: 'Item 1 do Anexo VI do RICMS/PR (Convênio ICMS 75/1991 — Carga 4% c/ manutenção de crédito).',
      memoriaCalculo,
    };
  }

  // Perfil 4 ou Genérico: Insumos Agropecuários ou Genérico Anexo VI
  const cargaAlvo = input.cargaEfetivaGenericaPct ?? 4.0;
  const baseTributavelFator = cargaAlvo / aliq;
  const baseTributavelPct = r4(baseTributavelFator * 100);
  const percentualReducaoBc = r4(100.0 - baseTributavelPct);
  const bcReduzida = r2(valor * baseTributavelFator);
  const icmsDevido = r2(valor * (cargaAlvo / 100));

  const manutencao = input.manutencaoCredito ?? true;
  let percentualEstornoCredito = 0;
  let valorEstornoCredito = 0;
  let creditoLiquidoMantido = creditoEntrada;

  if (!manutencao && creditoEntrada > 0) {
    const fatorEstorno = 1.0 - baseTributavelFator;
    percentualEstornoCredito = r4(fatorEstorno * 100);
    valorEstornoCredito = r2(creditoEntrada * fatorEstorno);
    creditoLiquidoMantido = r2(creditoEntrada - valorEstornoCredito);
  }

  const ehAgro = input.perfil === 'INSUMOS_AGRO_ANEXO_VI_ITENS_15_16';
  const alertaAgro = ehAgro
    ? 'Benefício restrito aos insumos expressamente nominados nos Itens 15 e 16 do Anexo VI do RICMS/PR (interpretação literal — Art. 111 do CTN). Não extensível a remineralizadores de solo ou aditivos não listados.'
    : undefined;

  memoriaCalculo.push(`Redução de Base de Cálculo Anexo VI.`);
  memoriaCalculo.push(`Carga Tributária Efetiva: ${cargaAlvo.toFixed(2)}% | Base Tributável: ${baseTributavelPct.toFixed(4)}%`);
  if (alertaAgro) memoriaCalculo.push(`Alerta de Rigor: ${alertaAgro}`);

  return {
    beneficioAplicavel: true,
    perfil: input.perfil,
    cst: '20',
    cargaEfetivaPct: cargaAlvo,
    baseTributavelPct,
    percentualReducaoBc,
    bcReduzida,
    icmsDevido,
    manutencaoCredito: manutencao,
    percentualEstornoCredito,
    valorEstornoCredito,
    creditoLiquidoMantido,
    dispositivoLegal: ehAgro
      ? 'Itens 15 e 16 do Anexo VI do RICMS/PR (Insumos Agropecuários).'
      : 'Anexo VI do RICMS/PR (Redução de Base de Cálculo).',
    alerta: alertaAgro,
    memoriaCalculo,
  };
}

// ============================================================================
// 3. MOTOR DE ICMS-ST (ANEXO IX RICMS/PR E CONSULTAS SEFA/PR)
// ============================================================================

export interface EntradaIcmsStPR {
  ncm: string;
  cest?: string;
  dataFatoGerador: string; // YYYY-MM-DD
  vProd: number;
  vFrete?: number;
  vSeg?: number;
  vOutro?: number;
  vDesc?: number;
  vIpi?: number;
  quantidade?: number;
  aliqInternaPrPct: number;
  aliqFecopPrPct?: number;
  aliqInterestadualPct?: number;
  mvaOriginalPct?: number;
  precoMaximoOrgaoPublico?: number;
  pmpf?: number;
  precoSugeridoFabricante?: number;
  ehAtacadistaRegimeEspecial?: boolean;
  aplicarRedutorArt16SN?: boolean;
  crtEmitente?: '1' | '2' | '3' | '4' | number;
  crtDestinatario?: '1' | '2' | '3' | '4' | number;
  ufOrigem?: string;
  ufDestino?: string;
  vIcmsProprioOrigem?: number;
}

export interface DiagnosticoIcmsStPR {
  sujeitoSt: boolean;
  criterioBase: 'PRECO_MAXIMO_ORGAO_PUBLICO' | 'PMPF' | 'PRECO_SUGERIDO_FABRICANTE' | 'MVA' | 'NAO_APLICAVEL';
  mvaOriginalPct: number;
  fatorRedutorMva: number;
  mvaAposRedutorPct: number;
  mvaAjustada: boolean;
  mvaEfetivaPct: number;
  basePartidaSt: number;
  bcSt: number;
  aliquotaInternaPrTotalPct: number;
  debitoTotalSt: number;
  creditoOrigemDedutivel: number;
  valorIcmsSt: number;
  valorFecopSt: number;
  valorTotalRecolherSt: number;
  decretoExclusao?: string;
  alerta?: string;
  fundamentacaoLegal: string;
  memoriaCalculo: string[];
}

/**
 * Motor Pericial de ICMS-ST do Paraná:
 * 1. Filtro bitemporal de exclusões normativas (Decretos 6.048/2024 e 12.828/2026).
 * 2. Hierarquia legal de base de cálculo (PMPF > Fabricante > MVA — Consulta SEFA/PR nº 018/2026).
 * 3. Ordem matemática: redutores de MVA aplicados ANTES do ajuste (Consulta SEFA/PR nº 43/2023).
 * 4. Trava Convênio ICMS 35/2011: sem MVA ajustada para emitentes do Simples Nacional.
 */
export function calcularIcmsStPR(input: EntradaIcmsStPR): DiagnosticoIcmsStPR {
  const memoriaCalculo: string[] = [];
  const ufO = (input.ufOrigem || 'PR').trim().toUpperCase();
  const ufD = (input.ufDestino || 'PR').trim().toUpperCase();
  const crtE = Number(input.crtEmitente ?? 3);
  const data = input.dataFatoGerador || new Date().toISOString().slice(0, 10);

  const dadosPrItem = resolverAliquotaPrBitemporal(input.ncm, data);
  const aliqPr =
    input.aliqInternaPrPct !== undefined && Number(input.aliqInternaPrPct) > 0
      ? Number(input.aliqInternaPrPct)
      : dadosPrItem.aliquotaIcmsPct;
  const aliqFec =
    input.aliqFecopPrPct !== undefined
      ? Number(input.aliqFecopPrPct)
      : dadosPrItem.aliquotaFecopPct;
  const aliqPrTotal = aliqPr + aliqFec;
  const aliqInter = Number(input.aliqInterestadualPct ?? (ufO === 'PR' ? aliqPr : 12.0));

  const vProd = Number(input.vProd || 0);
  const vFrete = Number(input.vFrete || 0);
  const vSeg = Number(input.vSeg || 0);
  const vOutro = Number(input.vOutro || 0);
  const vDesc = Number(input.vDesc || 0);
  const vIpi = Number(input.vIpi || 0);
  const qtd = Number(input.quantidade || 1);

  // 0. Trava para Combustíveis Monofásicos ad rem (LC 192/2022 e Convênios ICMS 127/2026 e 128/2026)
  if (dadosPrItem.ehCombustivelMonofasico) {
    const msgMono = `Combustível NCM ${input.ncm} sujeito à tributação monofásica ad rem (${dadosPrItem.aliquotaAdRem} ${dadosPrItem.unidadeAdRem}, CST 61) — vedada aplicação de ST percentual/MVA.`;
    memoriaCalculo.push(msgMono);
    return {
      sujeitoSt: false,
      criterioBase: 'NAO_APLICAVEL',
      mvaOriginalPct: 0,
      fatorRedutorMva: 1.0,
      mvaAposRedutorPct: 0,
      mvaAjustada: false,
      mvaEfetivaPct: 0,
      basePartidaSt: 0,
      bcSt: 0,
      aliquotaInternaPrTotalPct: 0,
      debitoTotalSt: 0,
      creditoOrigemDedutivel: 0,
      valorIcmsSt: 0,
      valorFecopSt: 0,
      valorTotalRecolherSt: 0,
      alerta: msgMono,
      fundamentacaoLegal: `${dadosPrItem.dispositivoLegal} (Tributação Monofásica Ad Rem — CST 61).`,
      memoriaCalculo,
    };
  }

  // 1. Verificação Bitemporal de Exclusão de ST
  const exclusao = verificarExclusaoStPr(input.ncm, input.cest, data);
  if (exclusao.excluidoDaSt) {
    const dataEfeitoStr = exclusao.dataExclusao ? ` a partir de ${exclusao.dataExclusao}` : '';
    const msgAlerta = `Mercadoria (NCM ${input.ncm}) excluída do regime de Substituição Tributária pelo ${exclusao.decreto}${dataEfeitoStr}. Aplicação do Art. 21 do Anexo IX do RICMS/PR: inventário no Bloco H e apropriação de crédito em conta gráfica.`;
    memoriaCalculo.push(`Exclusão de ST identificada: ${exclusao.decreto}`);
    memoriaCalculo.push(msgAlerta);

    return {
      sujeitoSt: false,
      criterioBase: 'NAO_APLICAVEL',
      mvaOriginalPct: 0,
      fatorRedutorMva: 1.0,
      mvaAposRedutorPct: 0,
      mvaAjustada: false,
      mvaEfetivaPct: 0,
      basePartidaSt: 0,
      bcSt: 0,
      aliquotaInternaPrTotalPct: aliqPrTotal,
      debitoTotalSt: 0,
      creditoOrigemDedutivel: 0,
      valorIcmsSt: 0,
      valorFecopSt: 0,
      valorTotalRecolherSt: 0,
      decretoExclusao: exclusao.decreto,
      alerta: msgAlerta,
      fundamentacaoLegal: `Art. 21 do Anexo IX do RICMS/PR c/c ${exclusao.decreto}.`,
      memoriaCalculo,
    };
  }

  // 2. Hierarquia Legal de Base de Cálculo (Consulta SEFA/PR nº 018/2026)
  let criterioBase: 'PRECO_MAXIMO_ORGAO_PUBLICO' | 'PMPF' | 'PRECO_SUGERIDO_FABRICANTE' | 'MVA' = 'MVA';
  let bcSt = 0;
  const basePartidaSt = r2(vProd - vDesc + vFrete + vSeg + vOutro + vIpi);

  let mvaOriginalPct =
    input.mvaOriginalPct !== undefined
      ? Number(input.mvaOriginalPct)
      : consultarMvaStPr({ ncm: input.ncm, cest: input.cest, dataFatoGerador: data }).mvaOriginalPct;
  let fatorRedutorMva = 1.0;
  let mvaAposRedutorPct = mvaOriginalPct;
  let mvaAjustada = false;
  let mvaEfetivaPct = mvaOriginalPct;

  if (input.precoMaximoOrgaoPublico && input.precoMaximoOrgaoPublico > 0) {
    criterioBase = 'PRECO_MAXIMO_ORGAO_PUBLICO';
    bcSt = r2(input.precoMaximoOrgaoPublico * qtd);
    memoriaCalculo.push(`Base ST fixada por Preço Máximo estabelecido por Órgão Público: R$ ${bcSt.toFixed(2)}.`);
  } else if (input.pmpf && input.pmpf > 0) {
    criterioBase = 'PMPF';
    bcSt = r2(input.pmpf * qtd);
    memoriaCalculo.push(`Base ST fixada por PMPF (Preço Médio Ponderado a Consumidor Final): R$ ${bcSt.toFixed(2)}.`);
    memoriaCalculo.push(`Consulta SEFA/PR nº 018/2026: PMPF é critério legal obrigatório e prevalece inclusive sobre qualquer pleito de redutor de MVA de atacadista.`);
  } else if (input.precoSugeridoFabricante && input.precoSugeridoFabricante > 0) {
    criterioBase = 'PRECO_SUGERIDO_FABRICANTE';
    bcSt = r2(input.precoSugeridoFabricante * qtd);
    memoriaCalculo.push(`Base ST fixada por Preço Sugerido por Fabricante: R$ ${bcSt.toFixed(2)}.`);
  } else {
    // Critério 4: MVA (Margem de Valor Agregado)
    criterioBase = 'MVA';

    // Passo 1 — Aplicar redutores sobre a MVA original ANTES do ajuste
    if (input.ehAtacadistaRegimeEspecial) {
      fatorRedutorMva = 0.50; // Redutor de 50% para atacadista distribuidor substituto (Art. 14, § 3º)
      memoriaCalculo.push(`Aplicação de Redutor de 50% na MVA Original para Atacadista Distribuidor (Art. 14, § 3º do Anexo IX).`);
    } else if (input.aplicarRedutorArt16SN) {
      // Art. 16 Anexo IX: Redução para optantes pelo Simples Nacional
      fatorRedutorMva = aliqPrTotal >= 18.0 ? 0.70 : 0.50;
      memoriaCalculo.push(`Aplicação de Redutor do Art. 16 do Anexo IX para adquirente optante pelo Simples Nacional (Fator ${fatorRedutorMva}).`);
    }

    mvaAposRedutorPct = Number((mvaOriginalPct * fatorRedutorMva).toFixed(4));
    memoriaCalculo.push(`MVA Original: ${mvaOriginalPct}% ➔ MVA após redutores: ${mvaAposRedutorPct}%`);

    // Passo 2 — Ajuste de MVA (Consulta SEFA/PR nº 43/2023)
    const ehInterestadual = ufO !== 'PR';
    const emitenteSimples = crtE === 1 || crtE === 4;

    if (!ehInterestadual) {
      mvaEfetivaPct = mvaAposRedutorPct;
      mvaAjustada = false;
      memoriaCalculo.push(`Operação interna no PR: Não se aplica ajuste de MVA.`);
    } else if (emitenteSimples) {
      // Convênio ICMS 35/2011 e Arts. 1º, § 8º e 11, § 4º Anexo IX: Simples Nacional NÃO ajusta MVA
      mvaEfetivaPct = mvaAposRedutorPct;
      mvaAjustada = false;
      memoriaCalculo.push(`Remetente optante pelo Simples Nacional/MEI: NÃO se aplica MVA Ajustada (Convênio ICMS 35/2011 e Art. 1º, § 8º do Anexo IX do RICMS/PR).`);
    } else {
      // Regime Normal em operação interestadual: Aplica fórmula CONFAZ sobre a MVA já reduzida
      const fatorInter = 1.0 - (aliqInter / 100);
      const fatorIntra = 1.0 - (aliqPrTotal / 100);
      const fatorAjustado = ((1.0 + mvaAposRedutorPct / 100) * (fatorInter / fatorIntra)) - 1.0;
      mvaEfetivaPct = Number((fatorAjustado * 100).toFixed(2));
      mvaAjustada = true;

      memoriaCalculo.push(`Ajuste de MVA Interestadual (CONFAZ): ((1 + ${mvaAposRedutorPct}%) * (1 - ${aliqInter}%) / (1 - ${aliqPrTotal}%)) - 1 = ${mvaEfetivaPct}%`);
    }

    // Passo 3 — Base de Cálculo ST por MVA
    bcSt = r2(basePartidaSt * (1.0 + mvaEfetivaPct / 100));
    memoriaCalculo.push(`Base de Partida ST (Produtos + IPI + Frete + Desp - Desc): R$ ${basePartidaSt.toFixed(2)}`);
    memoriaCalculo.push(`Base de Cálculo ST Final: R$ ${basePartidaSt.toFixed(2)} * (1 + ${mvaEfetivaPct}%) = R$ ${bcSt.toFixed(2)}`);
  }

  // 3. Débito ST e Dedução do Crédito de Origem
  const debitoTotalSt = r2(bcSt * (aliqPr / 100));

  let creditoOrigemDedutivel = 0;
  if (input.vIcmsProprioOrigem !== undefined && input.vIcmsProprioOrigem > 0) {
    creditoOrigemDedutivel = input.vIcmsProprioOrigem;
  } else {
    // Se não fornecido ou remetente Simples Nacional (Art. 11, § 4º Anexo IX), deduz a alíquota interestadual sobre a base sem IPI
    const baseOrigemSemIpi = r2(vProd - vDesc + vFrete + vSeg + vOutro);
    creditoOrigemDedutivel = r2(baseOrigemSemIpi * (aliqInter / 100));
  }

  const valorIcmsSt = r2(Math.max(0, debitoTotalSt - creditoOrigemDedutivel));
  const valorFecopSt = aliqFec > 0 ? r2(bcSt * (aliqFec / 100)) : 0;
  const valorTotalRecolherSt = r2(valorIcmsSt + valorFecopSt);

  memoriaCalculo.push(`Débito Total ST: R$ ${bcSt.toFixed(2)} * ${aliqPr}% = R$ ${debitoTotalSt.toFixed(2)}`);
  memoriaCalculo.push(`Crédito de ICMS Dedutível da Origem: R$ ${creditoOrigemDedutivel.toFixed(2)}`);
  memoriaCalculo.push(`ICMS-ST Líquido a Recolher: R$ ${valorIcmsSt.toFixed(2)}`);
  if (valorFecopSt > 0) {
    memoriaCalculo.push(`FECOP-ST (${aliqFec}%): R$ ${bcSt.toFixed(2)} * ${aliqFec}% = R$ ${valorFecopSt.toFixed(2)} (Art. 14-A da Lei nº 11.580/1996 e Anexo XII do RICMS/PR — Guia Apartada)`);
  }

  return {
    sujeitoSt: true,
    criterioBase,
    mvaOriginalPct,
    fatorRedutorMva,
    mvaAposRedutorPct,
    mvaAjustada,
    mvaEfetivaPct,
    basePartidaSt,
    bcSt,
    aliquotaInternaPrTotalPct: aliqPrTotal,
    debitoTotalSt,
    creditoOrigemDedutivel,
    valorIcmsSt,
    valorFecopSt,
    valorTotalRecolherSt,
    fundamentacaoLegal: 'Anexo IX do RICMS/PR (Substituição Tributária) c/c Consultas SEFA/PR nº 43/2023 e nº 018/2026.',
    memoriaCalculo,
  };
}

// ============================================================================
// 4. TABELA ESTADUAL E SUBLIMITE SIMPLES NACIONAL PR (LEI 15.562/2007 E DEC. 8.660/2018)
// ============================================================================

export interface EntradaSimplesNacionalPR {
  rbt12: number;
  rbaAnoCalendario?: number;
  anexo: 'I_COMERCIO' | 'II_INDUSTRIA';
}

export interface DiagnosticoSimplesNacionalPR {
  rbt12: number;
  faixa: number;
  anexo: 'I_COMERCIO' | 'II_INDUSTRIA';
  isentoIcmsDas: boolean;
  aliquotaEfetivaNacionalPct: number;
  parcelaIcmsNacionalPct: number;
  aliquotaIcmsTabelaPrPct: number;
  aliquotaTrava2017Pct?: number;
  aliquotaIcmsPrFinalPct: number;
  percentualReducaoPgdasPct: number;
  statusSublimite: 'ENQUADRADO_NO_SUBLIMITE' | 'EXCESSO_ATE_20_PCT' | 'EXCESSO_SUPERIOR_20_PCT' | 'EXCLUSAO_GERAL_SIMPLES';
  inicioRegimeNormalIcms: string | null;
  alerta?: string;
  dispositivoLegal: string;
  memoriaCalculo: string[];
}

/**
 * Calculadora da Tabela Estadual de Redução do Simples Nacional no Paraná
 * (Lei Estadual nº 15.562/2007, Lei nº 19.358/2017 e Decreto Estadual nº 8.660/2018).
 * Apura isenção para RBT12 até R$ 360k, trava de 20% sobre 2017 e controle do sublimite de R$ 3.600.000,00.
 */
export function calcularSimplesNacionalPR(
  input: EntradaSimplesNacionalPR
): DiagnosticoSimplesNacionalPR {
  const memoriaCalculo: string[] = [];
  const rbt12 = Number(input.rbt12 || 0);
  const rba = Number(input.rbaAnoCalendario ?? rbt12);
  const anexo = input.anexo || 'I_COMERCIO';

  // 1. Controle do Sublimite Estadual do Paraná (R$ 3.600.000,00)
  let statusSublimite: 'ENQUADRADO_NO_SUBLIMITE' | 'EXCESSO_ATE_20_PCT' | 'EXCESSO_SUPERIOR_20_PCT' | 'EXCLUSAO_GERAL_SIMPLES' = 'ENQUADRADO_NO_SUBLIMITE';
  let inicioRegimeNormalIcms: string | null = null;

  if (rba > 4800000) {
    statusSublimite = 'EXCLUSAO_GERAL_SIMPLES';
    inicioRegimeNormalIcms = 'Exclusão Geral do Simples Nacional (excesso > R$ 4,8M)';
    memoriaCalculo.push(`RBA acumulada de R$ ${rba.toFixed(2)} ultrapassa o teto nacional de R$ 4.800.000,00.`);
  } else if (rba > 4320000) {
    statusSublimite = 'EXCESSO_SUPERIOR_20_PCT';
    inicioRegimeNormalIcms = 'Mês subsequente ao excesso (imediato)';
    memoriaCalculo.push(`RBA acumulada de R$ ${rba.toFixed(2)} ultrapassa em mais de 20% o sublimite estadual do Paraná (R$ 3.600.000,00 * 1,20 = R$ 4.320.000,00).`);
    memoriaCalculo.push(`Obrigação de recolhimento do ICMS no Regime Normal a partir do mês subsequente ao do excesso.`);
  } else if (rba > 3600000) {
    statusSublimite = 'EXCESSO_ATE_20_PCT';
    inicioRegimeNormalIcms = '01/01 do ano-calendário seguinte';
    memoriaCalculo.push(`RBA acumulada de R$ ${rba.toFixed(2)} ultrapassa o sublimite estadual do Paraná (R$ 3.600.000,00) em até 20%.`);
    memoriaCalculo.push(`Obrigação de recolhimento do ICMS no Regime Normal a partir de 1º de janeiro do ano-calendário seguinte.`);
  }

  // 2. Determinação da Faixa Nacional e Parâmetros (LC 123/2006)
  let faixa = 1;
  let aliqNominalNac = 0.04;
  let deducaoNac = 0;
  let percIcmsNac = 0.34;

  if (anexo === 'I_COMERCIO') {
    if (rbt12 <= 180000) {
      faixa = 1; aliqNominalNac = 0.04; deducaoNac = 0; percIcmsNac = 0.34;
    } else if (rbt12 <= 360000) {
      faixa = 2; aliqNominalNac = 0.073; deducaoNac = 5940; percIcmsNac = 0.34;
    } else if (rbt12 <= 720000) {
      faixa = 3; aliqNominalNac = 0.095; deducaoNac = 13860; percIcmsNac = 0.335;
    } else if (rbt12 <= 1800000) {
      faixa = 4; aliqNominalNac = 0.107; deducaoNac = 22500; percIcmsNac = 0.335;
    } else if (rbt12 <= 3600000) {
      faixa = 5; aliqNominalNac = 0.143; deducaoNac = 87300; percIcmsNac = 0.335;
    } else {
      faixa = 6; aliqNominalNac = 0.190; deducaoNac = 378000; percIcmsNac = 0;
    }
  } else {
    // Anexo II - Indústria
    if (rbt12 <= 180000) {
      faixa = 1; aliqNominalNac = 0.045; deducaoNac = 0; percIcmsNac = 0.32;
    } else if (rbt12 <= 360000) {
      faixa = 2; aliqNominalNac = 0.078; deducaoNac = 5940; percIcmsNac = 0.32;
    } else if (rbt12 <= 720000) {
      faixa = 3; aliqNominalNac = 0.100; deducaoNac = 13860; percIcmsNac = 0.32;
    } else if (rbt12 <= 1800000) {
      faixa = 4; aliqNominalNac = 0.112; deducaoNac = 22500; percIcmsNac = 0.32;
    } else if (rbt12 <= 3600000) {
      faixa = 5; aliqNominalNac = 0.147; deducaoNac = 85500; percIcmsNac = 0.32;
    } else {
      faixa = 6; aliqNominalNac = 0.300; deducaoNac = 720000; percIcmsNac = 0;
    }
  }

  // 3. Caso Especial: RBT12 até R$ 360.000,00 (Faixas 1 e 2) ➔ Isenção Total de ICMS no DAS
  if (rbt12 <= 360000) {
    const alertaSN = 'Isenção total do ICMS na guia DAS pelo Decreto Estadual nº 8.660/2018. ATENÇÃO: As operações sujeitas à Substituição Tributária (ST), ao DIFAL e à Antecipação Tributária de 4% continuam exigíveis fora do DAS (Art. 5º do Anexo XI do RICMS/PR). Vedada a transferência de crédito de ICMS nas saídas destinadas a contribuintes do Regime Normal (Art. 26, § 15, III, "a" do Anexo XI do RICMS/PR).';
    memoriaCalculo.push(`RBT12 de R$ ${rbt12.toFixed(2)} enquadrada na faixa de isenção estadual (até R$ 360.000,00).`);
    memoriaCalculo.push(alertaSN);

    return {
      rbt12,
      faixa,
      anexo,
      isentoIcmsDas: true,
      aliquotaEfetivaNacionalPct: r4(((rbt12 * aliqNominalNac - deducaoNac) / Math.max(1, rbt12)) * 100),
      parcelaIcmsNacionalPct: 0,
      aliquotaIcmsTabelaPrPct: 0,
      aliquotaTrava2017Pct: 0,
      aliquotaIcmsPrFinalPct: 0,
      percentualReducaoPgdasPct: 100.0,
      statusSublimite,
      inicioRegimeNormalIcms,
      alerta: alertaSN,
      dispositivoLegal: 'Art. 2º da Lei Estadual nº 15.562/2007 e Tabela I do Decreto Estadual nº 8.660/2018 (Isenção DAS).',
      memoriaCalculo,
    };
  }

  // 4. Faixas 3, 4 e 5: Redução de ICMS no Paraná (Decreto nº 8.660/2018 + Trava 2017)
  const aliqEfetivaNac = ((rbt12 * aliqNominalNac - deducaoNac) / rbt12) * 100;
  const parcelaIcmsNac = aliqEfetivaNac * percIcmsNac;

  let aliqNominalPr = 0;
  let deducaoPr = 0;
  let aliq2017Ref = 0;

  if (anexo === 'I_COMERCIO') {
    if (faixa === 3) {
      aliqNominalPr = 0.0335; deducaoPr = 7200; aliq2017Ref = 1.86;
    } else if (faixa === 4) {
      aliqNominalPr = 0.035845; deducaoPr = 14352; aliq2017Ref = 2.27;
    } else if (faixa === 5) {
      aliqNominalPr = 0.047915; deducaoPr = 36078; aliq2017Ref = 3.35;
    }
  } else {
    // Indústria
    if (faixa === 3) {
      aliqNominalPr = 0.0320; deducaoPr = 6800; aliq2017Ref = 1.80;
    } else if (faixa === 4) {
      aliqNominalPr = 0.0350; deducaoPr = 14000; aliq2017Ref = 2.20;
    } else if (faixa === 5) {
      aliqNominalPr = 0.0460; deducaoPr = 34000; aliq2017Ref = 3.20;
    }
  }

  const aliqIcmsTabelaPr = ((rbt12 * aliqNominalPr - deducaoPr) / rbt12) * 100;
  const aliqTrava2017 = aliq2017Ref * 1.20; // Art. 9º-A Lei 15.562/2007 (máximo 20% sobre 2017)

  // A alíquota final do ICMS é a menor entre: Tabela PR, Trava de 20% e a Parcela Nacional
  const aliqFinalPr = Math.min(aliqIcmsTabelaPr, aliqTrava2017, parcelaIcmsNac);

  // Percentual de redução a preencher no campo do PGDAS-D
  const percentualReducaoPgdas = parcelaIcmsNac > 0
    ? r2((1.0 - aliqFinalPr / parcelaIcmsNac) * 100)
    : 0;

  memoriaCalculo.push(`RBT12: R$ ${rbt12.toFixed(2)} ➔ Faixa ${faixa} do ${anexo}.`);
  memoriaCalculo.push(`Alíquota Efetiva Nacional do Simples: ${r4(aliqEfetivaNac)}%`);
  memoriaCalculo.push(`Parcela Teórica de ICMS Nacional: ${r4(aliqEfetivaNac)}% * ${(percIcmsNac * 100).toFixed(1)}% = ${r4(parcelaIcmsNac)}%`);
  memoriaCalculo.push(`Alíquota de ICMS Tabela PR (Decreto nº 8.660/2018): ${r4(aliqIcmsTabelaPr)}%`);
  memoriaCalculo.push(`Trava Legal 2017 (Art. 9º-A da Lei nº 15.562/2007): ${aliq2017Ref}% * 1,20 = ${r4(aliqTrava2017)}%`);
  memoriaCalculo.push(`Alíquota Final de ICMS Paraná Aplicável: ${r4(aliqFinalPr)}%`);
  memoriaCalculo.push(`Percentual de Redução a informar no PGDAS-D: ${percentualReducaoPgdas}%`);

  return {
    rbt12,
    faixa,
    anexo,
    isentoIcmsDas: false,
    aliquotaEfetivaNacionalPct: r4(aliqEfetivaNac),
    parcelaIcmsNacionalPct: r4(parcelaIcmsNac),
    aliquotaIcmsTabelaPrPct: r4(aliqIcmsTabelaPr),
    aliquotaTrava2017Pct: r4(aliqTrava2017),
    aliquotaIcmsPrFinalPct: r4(aliqFinalPr),
    percentualReducaoPgdasPct: percentualReducaoPgdas,
    statusSublimite,
    inicioRegimeNormalIcms,
    dispositivoLegal: 'Tabelas I e II do Decreto Estadual nº 8.660/2018 c/c Art. 9º-A da Lei Estadual nº 15.562/2007.',
    memoriaCalculo,
  };
}
