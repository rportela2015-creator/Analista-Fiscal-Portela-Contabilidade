/**
 * Motor de Classificação Tripartida de Créditos Tributários na Entrada
 *
 * Segregação em 3 camadas:
 *  1. destacadoXml: Espelho fiel e imutável dos tributos destacados no documento fiscal (XML)
 *  2. creditoAdmitidoRegra: Créditos que o ordenamento fiscal brasileiro e paranaense autorizam
 *     conforme regime tributário, destinação da mercadoria e regras bitemporais
 *  3. creditoEfetivadoCusto: Créditos que efetivamente reduzem o custo de aquisição (CMV)
 *     segundo o CPC 16 (NBC TG 16) e regras de split payment / extinção da LC nº 214/2025
 */

import { arredondarMoedaRfbNum } from '../math/decimal-fiscal';

export type RegimeAdquirente =
  | 'LUCRO_REAL'
  | 'LUCRO_PRESUMIDO'
  | 'SIMPLES_NACIONAL'
  | 'SIMPLES_HIBRIDO'
  | 'MEI';

export type DestinacaoItem =
  | 'comercializacao'
  | 'revenda'
  | 'industrializacao'
  | 'insumo'
  | 'ativo_imobilizado'
  | 'uso_consumo';

export type StatusExtincaoDebitoFornecedor =
  | 'EXTINTO_SPLIT'
  | 'EXTINTO_PAGAMENTO'
  | 'AGUARDANDO_EXTINCAO'
  | 'SIMULACAO_PROJETADA';

export type ModalidadeApropriacaoIcms =
  | 'INTEGRAL'
  | 'CIAP_48_AVOS'
  | 'ESTORNO_PARCIAL_ANEXO_VI'
  | 'VEDADO';

export interface EntradaItemCreditoTributario {
  // Valores destacados no XML
  vProd: number;
  vFrete?: number;
  vSeg?: number;
  vOutro?: number;
  vDesc?: number;
  vIPI?: number;
  vICMS?: number;
  vICMSST?: number;
  vPIS?: number;
  vCOFINS?: number;
  vIBS?: number;
  vCBS?: number;
  vCredICMSSN?: number;
  pCredSN?: number;

  // Parâmetros do Emitente e Mercadoria
  crtEmitente?: '1' | '2' | '3' | '4' | number | string;
  emitenteSnIsentoPr?: boolean; // Faixa até R$ 360k PR (Art. 26, § 15, III, "a" RICMS/PR)
  temSt?: boolean; // Sujeito à Substituição Tributária
  percentualEstornoAnexoVI?: number; // Estorno do Anexo VI RICMS/PR (Art. 45, IV)

  // Parâmetros do Adquirente e Destinação
  regimeAdquirente: RegimeAdquirente;
  destinacao: DestinacaoItem;
  ehIndustria?: boolean;
  usoPessoal?: boolean; // Art. 57 LC 214/2025 (veículos recreativos, alimentação particular, etc.)
  statusExtincaoFornecedor?: StatusExtincaoDebitoFornecedor;

  // Parâmetros adicionais
  recalcularPisCofinsTema69?: boolean;
}

export interface CamadaCreditoFiscal {
  icmsProprio: number;
  icmsSt: number;
  pis: number;
  cofins: number;
  ipi: number;
  ibs: number;
  cbs: number;
  credSnInformado: number;
  total: number;
}

export interface ClassificacaoTripartidaCreditos {
  destacadoXml: CamadaCreditoFiscal;
  creditoAdmitidoRegra: CamadaCreditoFiscal;
  creditoEfetivadoCusto: CamadaCreditoFiscal;
  modalidadeApropriacaoIcms: ModalidadeApropriacaoIcms;
  statusExtincaoFornecedor: StatusExtincaoDebitoFornecedor;
  justificativas: string[];
  alertasGlosa: string[];
}

/**
 * Classifica os créditos tributários de um item de entrada em três camadas independentes.
 */
export function classificarCreditosItemEntrada(
  input: EntradaItemCreditoTributario
): ClassificacaoTripartidaCreditos {
  const justificativas: string[] = [];
  const alertasGlosa: string[] = [];

  const vICMS = arredondarMoedaRfbNum(input.vICMS || 0);
  const vICMSST = arredondarMoedaRfbNum(input.vICMSST || 0);
  const vPIS = arredondarMoedaRfbNum(input.vPIS || 0);
  const vCOFINS = arredondarMoedaRfbNum(input.vCOFINS || 0);
  const vIPI = arredondarMoedaRfbNum(input.vIPI || 0);
  const vIBS = arredondarMoedaRfbNum(input.vIBS || 0);
  const vCBS = arredondarMoedaRfbNum(input.vCBS || 0);
  const vCredICMSSN = arredondarMoedaRfbNum(input.vCredICMSSN || 0);

  // -------------------------------------------------------------------------
  // CAMADA 1: DESTACADO XML (ESPELHO FIEL E IMUTÁVEL DO XML)
  // -------------------------------------------------------------------------
  const totalXml = arredondarMoedaRfbNum(
    vICMS + vICMSST + vPIS + vCOFINS + vIPI + vIBS + vCBS + vCredICMSSN
  );

  const destacadoXml: CamadaCreditoFiscal = {
    icmsProprio: vICMS,
    icmsSt: vICMSST,
    pis: vPIS,
    cofins: vCOFINS,
    ipi: vIPI,
    ibs: vIBS,
    cbs: vCBS,
    credSnInformado: vCredICMSSN,
    total: totalXml,
  };

  // -------------------------------------------------------------------------
  // CAMADA 2: CRÉDITO ADMITIDO PELA REGRA TRIBUTÁRIA VIGENTE
  // -------------------------------------------------------------------------
  const crtE = String(input.crtEmitente ?? '3');
  const ehEmitenteSn = crtE === '1' || crtE === '2' || crtE === 'simples_hibrido';
  const regimeAdq = input.regimeAdquirente;
  const dest = input.destinacao;

  let admitidoIcms = 0;
  let modalidadeIcms: ModalidadeApropriacaoIcms = 'INTEGRAL';

  // 2.1 ICMS PRÓPRIO
  if (regimeAdq === 'SIMPLES_NACIONAL' || regimeAdq === 'MEI') {
    admitidoIcms = 0;
    modalidadeIcms = 'VEDADO';
    justificativas.push('Adquirente optante pelo Simples Nacional/MEI: vedada apropriação de crédito individualizado de ICMS (Art. 23 LC 123/2006).');
  } else if (dest === 'uso_consumo') {
    admitidoIcms = 0;
    modalidadeIcms = 'VEDADO';
    alertasGlosa.push('Entrada para Uso e Consumo: crédito de ICMS vedado até 01/01/2033 (Art. 33, I da LC 87/1996 e Art. 24, § 1º, I da Lei PR 11.580/1996).');
  } else if (input.temSt && (dest === 'revenda' || dest === 'comercializacao')) {
    admitidoIcms = 0;
    modalidadeIcms = 'VEDADO';
    justificativas.push('Mercadoria sujeita à Substituição Tributária (ST) na revenda: imposto já retido/antecipado encerra a fase de tributação; crédito próprio de ICMS vedado.');
  } else if (dest === 'ativo_imobilizado') {
    modalidadeIcms = 'CIAP_48_AVOS';
    admitidoIcms = ehEmitenteSn ? (input.emitenteSnIsentoPr ? 0 : vCredICMSSN) : vICMS;
    justificativas.push('Ativo Imobilizado: crédito admitido na proporção de 1/48 avos por mês mediante controle em CIAP Bloco G (Art. 20, § 5º LC 87/1996).');
  } else {
    // Revenda / Insumo tributado
    if (ehEmitenteSn) {
      if (input.emitenteSnIsentoPr) {
        admitidoIcms = 0;
        alertasGlosa.push('Fornecedor Simples Nacional PR na faixa de isenção estadual (RBT12 <= R$ 360.000,00): vedado o aproveitamento de crédito de ICMS pelo adquirente (Art. 26, § 15, III, "a" do RICMS/PR).');
      } else {
        admitidoIcms = vCredICMSSN > 0 ? vCredICMSSN : 0;
        justificativas.push(`Crédito de ICMS Simples Nacional admitido conforme alíquota informada na NF-e (R$ ${admitidoIcms.toFixed(2)}).`);
      }
    } else {
      admitidoIcms = vICMS;
    }

    // Aplicação de estorno proporcional Anexo VI (Art. 45, IV RICMS/PR)
    const estornoPct = Number(input.percentualEstornoAnexoVI || 0);
    if (estornoPct > 0 && admitidoIcms > 0) {
      modalidadeIcms = 'ESTORNO_PARCIAL_ANEXO_VI';
      const valorEstorno = arredondarMoedaRfbNum(admitidoIcms * (estornoPct / 100));
      admitidoIcms = arredondarMoedaRfbNum(admitidoIcms - valorEstorno);
      justificativas.push(`Redução de Base de Cálculo na saída subsequente: estorno obrigatório de ${estornoPct}% do crédito de entrada (Art. 45, IV do RICMS/PR) no valor de R$ ${valorEstorno.toFixed(2)}.`);
    }
  }

  // 2.2 PIS E COFINS
  let admitidoPis = 0;
  let admitidoCofins = 0;

  if (regimeAdq === 'LUCRO_REAL') {
    if (dest === 'uso_consumo') {
      admitidoPis = 0;
      admitidoCofins = 0;
      alertasGlosa.push('Entrada para Uso e Consumo: mercadoria não gera direito a crédito de PIS/COFINS (Art. 3º das Leis 10.637/2002 e 10.833/2003).');
    } else {
      if (input.recalcularPisCofinsTema69) {
        // Base de crédito calculada excluindo o ICMS da operação (Lei 14.592/2023)
        const baseLiquida = Math.max(0, (input.vProd || 0) + (input.vFrete || 0) + (input.vSeg || 0) + (input.vOutro || 0) - (input.vDesc || 0) - vICMS);
        admitidoPis = arredondarMoedaRfbNum(baseLiquida * 0.0165);
        admitidoCofins = arredondarMoedaRfbNum(baseLiquida * 0.076);
        justificativas.push(`Lucro Real: crédito de PIS (1,65%) e COFINS (7,60%) recalculado sobre base líquida de ICMS (Lei nº 14.592/2023 c/c Tema 69 STF): Base R$ ${baseLiquida.toFixed(2)}.`);
      } else {
        admitidoPis = vPIS;
        admitidoCofins = vCOFINS;
        justificativas.push('Lucro Real: crédito de PIS/COFINS não cumulativo admitido conforme escrituração.');
      }
    }
  } else {
    // Lucro Presumido, Simples Nacional, MEI
    admitidoPis = 0;
    admitidoCofins = 0;
    if (vPIS > 0 || vCOFINS > 0) {
      justificativas.push(`${regimeAdq}: regime cumulativo / unificado; créditos de PIS e COFINS na entrada não são aproveitáveis.`);
    }
  }

  // 2.3 IPI
  let admitidoIpi = 0;
  if (input.ehIndustria && (dest === 'industrializacao' || dest === 'insumo')) {
    admitidoIpi = vIPI;
    if (vIPI > 0) {
      justificativas.push(`Estabelecimento Industrial: crédito de IPI admitido para matéria-prima/insumo industrializável (R$ ${vIPI.toFixed(2)}).`);
    }
  } else {
    admitidoIpi = 0;
    if (vIPI > 0) {
      justificativas.push('IPI não recuperável: adquirente comercial ou mercadoria não destinada à industrialização (incorpora ao custo do estoque).');
    }
  }

  // 2.4 IBS E CBS (LC Nº 214/2025)
  let admitidoIbs = 0;
  let admitidoCbs = 0;

  const regimePermiteIbsCbs =
    regimeAdq === 'LUCRO_REAL' ||
    regimeAdq === 'LUCRO_PRESUMIDO' ||
    regimeAdq === 'SIMPLES_HIBRIDO';

  if (regimePermiteIbsCbs) {
    if (input.usoPessoal) {
      admitidoIbs = 0;
      admitidoCbs = 0;
      alertasGlosa.push('Bens ou serviços para uso pessoal de sócios/diretores: vedação expressa de crédito de IBS e CBS (Art. 57 da LC nº 214/2025).');
    } else {
      // Art. 47 e 57: Não cumulatividade plena para quaisquer insumos, bens e despesas operacionais
      admitidoIbs = vIBS;
      admitidoCbs = vCBS;
      if (vIBS > 0 || vCBS > 0) {
        justificativas.push(`IBS/CBS: Não cumulatividade ampla autorizada para a atividade econômica (Art. 47 da LC nº 214/2025): IBS R$ ${vIBS.toFixed(2)}, CBS R$ ${vCBS.toFixed(2)}.`);
      }
    }
  } else {
    admitidoIbs = 0;
    admitidoCbs = 0;
    if (vIBS > 0 || vCBS > 0) {
      justificativas.push('Simples Nacional tradicional: IBS e CBS recolhidos no DAS unificado; créditos da entrada vedados (Art. 41 LC 214/2025).');
    }
  }

  const totalAdmitido = arredondarMoedaRfbNum(
    admitidoIcms + admitidoPis + admitidoCofins + admitidoIpi + admitidoIbs + admitidoCbs
  );

  const creditoAdmitidoRegra: CamadaCreditoFiscal = {
    icmsProprio: admitidoIcms,
    icmsSt: 0, // ICMS-ST de entrada não é crédito em conta gráfica, é antecipação
    pis: admitidoPis,
    cofins: admitidoCofins,
    ipi: admitidoIpi,
    ibs: admitidoIbs,
    cbs: admitidoCbs,
    credSnInformado: ehEmitenteSn && !input.emitenteSnIsentoPr ? vCredICMSSN : 0,
    total: totalAdmitido,
  };

  // -------------------------------------------------------------------------
  // CAMADA 3: CRÉDITO EFETIVADO NO CUSTO (CPC 16 / NBC TG 16)
  // -------------------------------------------------------------------------
  const statusExtincao = input.statusExtincaoFornecedor || 'SIMULACAO_PROJETADA';

  let efetivadoIbs = 0;
  let efetivadoCbs = 0;

  if (admitidoIbs > 0 || admitidoCbs > 0) {
    if (
      statusExtincao === 'EXTINTO_SPLIT' ||
      statusExtincao === 'EXTINTO_PAGAMENTO' ||
      statusExtincao === 'SIMULACAO_PROJETADA'
    ) {
      efetivadoIbs = admitidoIbs;
      efetivadoCbs = admitidoCbs;
      justificativas.push(`IBS/CBS efetivado no CMV: extinção do débito pelo fornecedor confirmada (${statusExtincao}).`);
    } else {
      // AGUARDANDO_EXTINCAO
      efetivadoIbs = 0;
      efetivadoCbs = 0;
      alertasGlosa.push('Crédito potencial de IBS/CBS retido aguardando extinção do débito pelo fornecedor (Art. 47 LC 214/2025).');
    }
  }

  const totalEfetivado = arredondarMoedaRfbNum(
    admitidoIcms + admitidoPis + admitidoCofins + admitidoIpi + efetivadoIbs + efetivadoCbs
  );

  const creditoEfetivadoCusto: CamadaCreditoFiscal = {
    icmsProprio: admitidoIcms,
    icmsSt: 0,
    pis: admitidoPis,
    cofins: admitidoCofins,
    ipi: admitidoIpi,
    ibs: efetivadoIbs,
    cbs: efetivadoCbs,
    credSnInformado: creditoAdmitidoRegra.credSnInformado,
    total: totalEfetivado,
  };

  return {
    destacadoXml,
    creditoAdmitidoRegra,
    creditoEfetivadoCusto,
    modalidadeApropriacaoIcms: modalidadeIcms,
    statusExtincaoFornecedor: statusExtincao,
    justificativas,
    alertasGlosa,
  };
}
