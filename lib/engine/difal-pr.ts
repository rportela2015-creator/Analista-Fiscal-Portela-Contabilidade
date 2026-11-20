/**
 * Motor Pericial de DIFAL, FECOP e Antecipação Tributária do Paraná (RICMS/PR)
 * Decreto Estadual nº 7.871/2017, Lei nº 11.580/1996 (Art. 14-A FECOP), Anexo XII do RICMS/PR, Lei nº 22.190/2024,
 * Decretos nº 6.048/2024, nº 11.314/2025 e nº 12.828/2026, Consulta SEFA/PR nº 48/2026.
 */

import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from './matriz-icms-pr';
import type { DiagnosticoDifalEntrada, ResumoDifalNfeEntrada } from '../types/motor-tributario';

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export interface EntradaApuracaoDifalPR {
  nItem?: number;
  xProd?: string;
  ncm: string;
  cest?: string;
  origemMercadoria?: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | number;
  finalidadeEntrada: 'uso_consumo' | 'revenda' | 'comercializacao' | 'industrializacao' | 'ativo_imobilizado';
  crtEmitente: '1' | '2' | '3' | '4' | number;
  crtDestinatario: '1' | '2' | '3' | '4' | number;
  ufEmitente: string;
  ufDestinatario: string;
  dataFatoGerador: string; // YYYY-MM-DD
  vProd: number;
  vFrete?: number;
  vSeg?: number;
  vDesc?: number;
  vOutro?: number;
  vIpi?: number;
  pIcmsOrigemPct?: number;
  vIcmsOrigem?: number;
  vIcmsStDestacado?: number;
  sujeitoStInternaPr?: boolean;
  pRedBcInternaPrPct?: number;
  aliqInternaPrOverridePct?: number;
  aliqFecopPrOverridePct?: number;
  incluirIbsCbsBcIcms?: boolean;
  vIbs?: number;
  vCbs?: number;
  vIs?: number;
  aplicarCarga12Art16SN?: boolean;
}

export interface EntradaDifalNaoContribuintePR {
  ncm: string;
  dataFatoGerador: string;
  crtEmitente: '1' | '2' | '3' | '4' | number;
  ufEmitente: string;
  ufDestino?: string;
  vOper: number;
  pIcmsOrigemPct?: number;
  aliqInternaPrOverridePct?: number;
  aliqFecopPrOverridePct?: number;
  pRedBcInternaPrPct?: number;
}

export interface DiagnosticoDifalNaoContribuinte {
  exigeRecolhimento: boolean;
  baseCalculoUnica: number;
  aliquotaOrigem: number;
  aliquotaDestino: number;
  aliquotaFecop: number;
  valorDebitoDifal: number;
  valorDebitoFecop: number;
  valorTotalDebito: number;
  fundamentacaoLegal: string;
  memoriaCalculo: string[];
}

/**
 * Apura determinística e bitemporalmente o DIFAL e a Antecipação Tributária
 * nas operações interestaduais de entrada destinadas a contribuintes no Paraná.
 */
export function apurarDifalEntradaPR(input: EntradaApuracaoDifalPR): DiagnosticoDifalEntrada {
  const ufE = String(input.ufEmitente || '').trim().toUpperCase();
  const ufD = String(input.ufDestinatario || 'PR').trim().toUpperCase();
  const alertasAuditoria: string[] = [];
  const memoriaCalculo: string[] = [];

  // 1. Verificação preliminar de jurisdição
  if (ufE === 'PR' || ufD !== 'PR') {
    return {
      sujeitoDifal: false,
      tipoDifal: 'nao_aplicavel',
      modalidadeBase: 'isento',
      exigeRecolhimento: false,
      modalidade: 'DISPENSADO',
      aliquotaOrigem: 0,
      aliquotaDestino: 0,
      aliquotaFecop: 0,
      aliquotaInternaEfetiva: 0,
      baseCalculoOrigem: 0,
      baseCalculoDestino: 0,
      baseCalculoOperacao: 0,
      baseCalculoDifal: 0,
      valorDifal: 0,
      valorFecop: 0,
      valorTotalRecolher: 0,
      valorDebitoDifal: 0,
      valorDebitoFecop: 0,
      valorTotalDebito: 0,
      efeitoCaixaLiquido: 0,
      guiaRecolhimento: 'DISPENSADO',
      memoriaCalculo: ['Operação interna no PR ou destino fora do PR — DIFAL interestadual dispensado.'],
      fundamentacaoLegal: 'Operação não sujeita ao DIFAL de entrada no Paraná.',
      alertasAuditoria: [],
    };
  }

  // 2. Resolução da alíquota interna do PR e FECOP bitemporal
  const dadosPr = resolverAliquotaPrBitemporal(input.ncm, input.dataFatoGerador);
  const aliqInternaBase = input.aliqInternaPrOverridePct ?? dadosPr.aliquotaIcmsPct;
  const aliqFecopPrPct = input.aliqFecopPrOverridePct ?? dadosPr.aliquotaFecopPct;
  const aliqInternaEfetiva = input.pRedBcInternaPrPct
    ? r2(aliqInternaBase * (1 - input.pRedBcInternaPrPct / 100))
    : aliqInternaBase;

  // 3. Resolução da alíquota interestadual de origem e auditoria
  const origNum = Number(input.origemMercadoria ?? 0);
  const pIcmsOrigemPct = input.pIcmsOrigemPct !== undefined
    ? input.pIcmsOrigemPct
    : ([1, 2, 3, 8].includes(origNum) ? 4.0 : 12.0);

  const crtE = Number(input.crtEmitente);
  if (crtE !== 1 && crtE !== 4 && input.pIcmsOrigemPct !== undefined) {
    if ([1, 2, 3, 8].includes(origNum) && Math.abs(input.pIcmsOrigemPct - 4.0) > 0.01) {
      alertasAuditoria.push(
        `Alíquota interestadual destacada (${input.pIcmsOrigemPct}%) diverge dos 4% aplicáveis para mercadorias com Conteúdo de Importação (Origem ${origNum} - Resolução Senado Federal nº 13/2012).`
      );
    } else if ([0, 4, 5, 6, 7].includes(origNum) && ['SP', 'RJ', 'MG', 'RS', 'SC'].includes(ufE) && Math.abs(input.pIcmsOrigemPct - 12.0) > 0.01) {
      alertasAuditoria.push(
        `Alíquota interestadual destacada (${input.pIcmsOrigemPct}%) diverge dos 12% aplicáveis para operações originadas na Região Sul/Sudeste com destino ao Paraná.`
      );
    }
  }

  // 4. Auditoria Preventiva de Substituição Tributária Indevida (Decretos PR 6.048/2024 e 12.828/2026)
  const exclusaoSt = verificarExclusaoStPr(input.ncm, input.cest, input.dataFatoGerador);
  if (exclusaoSt.excluidoDaSt && (input.vIcmsStDestacado ?? 0) > 0) {
    alertasAuditoria.push(
      `[ALERTA CRÍTICO ST INDEVIDA] A mercadoria NCM ${input.ncm} foi expressamente excluída do regime de Substituição Tributária no Paraná a partir de ${exclusaoSt.dataExclusao} pelo ${exclusaoSt.decreto}. O remetente destacou R$ ${input.vIcmsStDestacado?.toFixed(2)} de ICMS-ST indevidamente. O destinatário paranaense NÃO deve creditar este valor nem emitir saídas com CST 60/CSOSN 500. Notificar o fornecedor para cancelamento/reemissão ou pleitear restituição de indébito perante a UF de origem.`
    );
  }

  // 5. Parcela RTC (IBS/CBS/IS) na Transição 2027 (Consulta SEFA/PR nº 48/2026)
  const anoFatoGerador = parseInt(input.dataFatoGerador.slice(0, 4), 10) || 2026;
  const incluirIbsCbs = input.incluirIbsCbsBcIcms ?? (anoFatoGerador >= 2027);
  let parcelaIva2027 = 0;
  if (anoFatoGerador >= 2027) {
    if (incluirIbsCbs) {
      parcelaIva2027 = r2((input.vIbs ?? 0) + (input.vCbs ?? 0) + (input.vIs ?? 0));
      if (parcelaIva2027 > 0) {
        memoriaCalculo.push(
          `Adicionada parcela de IBS/CBS/IS (R$ ${parcelaIva2027.toFixed(2)}) à base do ICMS conforme orientação da Consulta SEFA/PR nº 48/2026.`
        );
      }
    } else {
      memoriaCalculo.push(
        'Parcela de IBS/CBS/IS excluída da base de cálculo do ICMS com fundamento em tese jurídica/decisão judicial (não incidência de tributo federal sobre estadual).'
      );
    }
  }

  const vProd = input.vProd || 0;
  const vFrete = input.vFrete || 0;
  const vSeg = input.vSeg || 0;
  const vDesc = input.vDesc || 0;
  const vOutro = input.vOutro || 0;
  const vIpi = input.vIpi || 0;

  // ---------------------------------------------------------------------------
  // MODALIDADE 1: USO/CONSUMO OU ATIVO IMOBILIZADO (Base Dupla Art. 8º, § 12 RICMS/PR)
  // ---------------------------------------------------------------------------
  if (input.finalidadeEntrada === 'uso_consumo' || input.finalidadeEntrada === 'ativo_imobilizado') {
    const ehAtivo = input.finalidadeEntrada === 'ativo_imobilizado';
    const tipoDifal = ehAtivo ? 'ativo_imobilizado' : 'uso_consumo';
    const modalidade = ehAtivo ? 'DIFAL_ATIVO_IMOBILIZADO' : 'DIFAL_USO_CONSUMO';

    const baseCalculoOperacao = r2(vProd - vDesc + vFrete + vSeg + vOutro + vIpi + parcelaIva2027);
    const vIcmsOrigem = input.vIcmsOrigem !== undefined
      ? input.vIcmsOrigem
      : r2((vProd - vDesc + vFrete + vSeg + vOutro) * (pIcmsOrigemPct / 100));

    const vSemIcmsOrigem = Math.max(0, r2(baseCalculoOperacao - vIcmsOrigem));
    const divisor = 1 - (aliqInternaEfetiva + aliqFecopPrPct) / 100;
    const baseCalculoDifal = r2(vSemIcmsOrigem / divisor);

    const valorDebitoDifal = r2(Math.max(0, baseCalculoDifal * (aliqInternaEfetiva / 100) - vIcmsOrigem));
    const valorDebitoFecop = r2(baseCalculoDifal * (aliqFecopPrPct / 100));
    const valorTotalDebito = r2(valorDebitoDifal + valorDebitoFecop);

    memoriaCalculo.push(`Valor da Operação de Entrada (incluindo IPI e despesas): R$ ${baseCalculoOperacao.toFixed(2)}`);
    memoriaCalculo.push(`ICMS Destacado na Origem (${pIcmsOrigemPct}%): R$ ${vIcmsOrigem.toFixed(2)}`);
    memoriaCalculo.push(`Valor Excluído ICMS Origem: R$ ${vSemIcmsOrigem.toFixed(2)}`);
    memoriaCalculo.push(`Divisor Base Dupla: 1 - (${aliqInternaEfetiva}% + ${aliqFecopPrPct}%) / 100 = ${divisor.toFixed(4)}`);
    memoriaCalculo.push(`Base de Cálculo Reconstituída (Base Dupla): R$ ${baseCalculoDifal.toFixed(2)}`);
    memoriaCalculo.push(`Débito DIFAL: (${baseCalculoDifal.toFixed(2)} * ${aliqInternaEfetiva}%) - R$ ${vIcmsOrigem.toFixed(2)} = R$ ${valorDebitoDifal.toFixed(2)}`);
    if (aliqFecopPrPct > 0) {
      memoriaCalculo.push(`Adicional FECOP (${aliqFecopPrPct}%): ${baseCalculoDifal.toFixed(2)} * ${aliqFecopPrPct}% = R$ ${valorDebitoFecop.toFixed(2)} (Guia Apartada — Art. 14-A da Lei nº 11.580/1996 e Anexo XII do RICMS/PR)`);
    }

    const crtD = Number(input.crtDestinatario);
    let guiaRecolhimento: string;
    let vencimento: string;
    let codigoAjusteEfd: string | undefined;
    let obrigacaoAcessoria: string;
    let ciapBlocoG = false;

    if (crtD === 3) {
      guiaRecolhimento = 'GR-PR (validar código de receita vigente SEFA/PR)';
      vencimento = 'Dia 12 do mês subsequente (Art. 74, XIX RICMS/PR)';
      if (ehAtivo) {
        ciapBlocoG = true;
        codigoAjusteEfd = 'PR020021';
        obrigacaoAcessoria = 'Crédito CIAP de 1/48 avos via Bloco G da EFD (código PR020021, Malha Fiscal AJCP01)';
        memoriaCalculo.push('Ativo Imobilizado gera direito a apropriação de crédito em 48 parcelas no Bloco G (código PR020021).');
      } else {
        codigoAjusteEfd = 'Outros Débitos — Reg. E111 (conferir código vigente na Tabela 5.1.1 SEFA/PR)';
        obrigacaoAcessoria = 'Lançamento na EFD ICMS/IPI (Reg. E111) e recolhimento em GR-PR (validar código de receita vigente SEFA/PR)';
      }
    } else if (crtD === 4) {
      guiaRecolhimento = 'GR-PR (validar código de receita vigente SEFA/PR)';
      vencimento = 'Dia 3 do 2º mês subsequente (Art. 74, § 16, II RICMS/PR c/c Decreto PR nº 11.314/2025)';
      obrigacaoAcessoria = 'Guia GR-PR com vencimento no dia 3 do 2º mês subsequente (Decreto PR nº 11.314/2025)';
    } else {
      guiaRecolhimento = 'GR-PR (validar código de receita vigente SEFA/PR)';
      vencimento = 'Dia 3 do 2º mês subsequente (Art. 74, § 16, II RICMS/PR)';
      obrigacaoAcessoria = 'DeSTDA (SEDIF-SN) até o dia 28 do mês subsequente';
    }

    return {
      sujeitoDifal: true,
      tipoDifal,
      modalidadeBase: 'base_dupla',
      exigeRecolhimento: valorTotalDebito > 0,
      modalidade,
      aliquotaOrigem: pIcmsOrigemPct,
      aliquotaDestino: aliqInternaBase,
      aliquotaFecop: aliqFecopPrPct,
      aliquotaInternaEfetiva: aliqInternaEfetiva,
      baseCalculoOrigem: baseCalculoOperacao,
      baseCalculoDestino: baseCalculoDifal,
      baseCalculoOperacao,
      baseCalculoDifal,
      valorDifal: valorDebitoDifal,
      valorFecop: valorDebitoFecop,
      valorTotalRecolher: valorTotalDebito,
      valorDebitoDifal,
      valorDebitoFecop,
      valorTotalDebito,
      efeitoCaixaLiquido: valorTotalDebito,
      guiaRecolhimento,
      vencimento,
      codigoAjusteEfd,
      obrigacaoAcessoria,
      ciapBlocoG,
      alertasAuditoria,
      memoriaCalculo,
      fundamentacaoLegal: `Art. 8º, § 12 da Lei Estadual nº 11.580/1996 c/c Lei nº 22.190/2024 e Art. 74 RICMS/PR (${dadosPr.dispositivoLegal}).`,
    };
  }

  // ---------------------------------------------------------------------------
  // MODALIDADE 2: REVENDA/INDÚSTRIA COM ST INTERNA PR SEM RETENÇÃO NA ORIGEM
  // ---------------------------------------------------------------------------
  if (
    (input.finalidadeEntrada === 'revenda' || input.finalidadeEntrada === 'comercializacao' || input.finalidadeEntrada === 'industrializacao') &&
    input.sujeitoStInternaPr &&
    !exclusaoSt.excluidoDaSt &&
    (input.vIcmsStDestacado ?? 0) === 0
  ) {
    memoriaCalculo.push(
      'Mercadoria sujeita ao regime de Substituição Tributária interna no Paraná sem retenção pelo remetente de outra UF.'
    );
    memoriaCalculo.push(
      'Responsabilidade atribuída ao adquirente paranaense para recolhimento do ICMS-ST na entrada (Art. 11 do Anexo IX do RICMS/PR), afastando o DIFAL.'
    );

    return {
      sujeitoDifal: false,
      tipoDifal: 'nao_aplicavel',
      modalidadeBase: 'base_simples',
      exigeRecolhimento: true,
      modalidade: 'ICMS_ST_ENTRADA_ART11',
      aliquotaOrigem: pIcmsOrigemPct,
      aliquotaDestino: aliqInternaBase,
      aliquotaFecop: aliqFecopPrPct,
      aliquotaInternaEfetiva: aliqInternaEfetiva,
      baseCalculoOrigem: r2(vProd - vDesc + vFrete + vSeg + vOutro),
      baseCalculoDestino: 0,
      baseCalculoOperacao: r2(vProd - vDesc + vFrete + vSeg + vOutro),
      baseCalculoDifal: 0,
      valorDifal: 0,
      valorFecop: 0,
      valorTotalRecolher: 0,
      valorDebitoDifal: 0,
      valorDebitoFecop: 0,
      valorTotalDebito: 0,
      efeitoCaixaLiquido: 0,
      guiaRecolhimento: 'GR-PR',
      vencimento: 'Na entrada da mercadoria no território paranaense ou prazo regulamentar',
      obrigacaoAcessoria: 'Recolhimento de ICMS-ST de entrada via GR-PR (Código 10009-9)',
      alertasAuditoria,
      memoriaCalculo,
      fundamentacaoLegal: 'Art. 11 do Anexo IX do RICMS/PR (Substituição Tributária na Entrada).',
    };
  }

  // ---------------------------------------------------------------------------
  // MODALIDADE 3: ANTECIPAÇÃO ART. 16 (Importado 4% ou Gás Natural NCM 27.11)
  // ---------------------------------------------------------------------------
  const ehImportado4 = pIcmsOrigemPct === 4.0 || [1, 2, 3, 8].includes(origNum);
  const ehGasNatural = input.ncm.replace(/\D/g, '').startsWith('2711');

  if (
    (input.finalidadeEntrada === 'revenda' || input.finalidadeEntrada === 'comercializacao' || input.finalidadeEntrada === 'industrializacao') &&
    (ehImportado4 || ehGasNatural)
  ) {
    const baseCalculoOperacao = r2(vProd - vDesc + vFrete + vSeg + vOutro + parcelaIva2027); // Art. 16 sem IPI
    const crtD = Number(input.crtDestinatario);

    if (crtD === 3) {
      // Regime Normal: Carga 12% (diferimento parcial Art. 28 Anexo VIII)
      const aliqAlvo = Math.min(12.0, aliqInternaBase);
      const difAliquota = Math.max(0, aliqAlvo - pIcmsOrigemPct);
      const valorDebitoDifal = r2(baseCalculoOperacao * (difAliquota / 100));

      memoriaCalculo.push(`Base de Cálculo da Operação (sem IPI): R$ ${baseCalculoOperacao.toFixed(2)}`);
      memoriaCalculo.push(`Alíquota Alvo no Regime Normal: ${aliqAlvo}% (diferimento parcial Art. 28 Anexo VIII)`);
      memoriaCalculo.push(`Diferencial Antecipação Art. 16: ${aliqAlvo}% - ${pIcmsOrigemPct}% = ${difAliquota}% ➔ R$ ${valorDebitoDifal.toFixed(2)}`);
      memoriaCalculo.push('Regime Normal: crédito fiscal simultâneo na EFD ICMS/IPI (Art. 16, §§ 2º e 3º) ➔ Efeito caixa líquido nulo (0,00).');

      return {
        sujeitoDifal: false,
        tipoDifal: 'nao_aplicavel',
        modalidadeBase: 'base_simples',
        exigeRecolhimento: true,
        modalidade: 'ANTECIPACAO_4_PCT_ART16',
        aliquotaOrigem: pIcmsOrigemPct,
        aliquotaDestino: aliqAlvo,
        aliquotaFecop: 0,
        aliquotaInternaEfetiva: aliqAlvo,
        baseCalculoOrigem: baseCalculoOperacao,
        baseCalculoDestino: baseCalculoOperacao,
        baseCalculoOperacao,
        baseCalculoDifal: baseCalculoOperacao,
        valorDifal: valorDebitoDifal,
        valorFecop: 0,
        valorTotalRecolher: valorDebitoDifal,
        valorDebitoDifal,
        valorDebitoFecop: 0,
        valorTotalDebito: valorDebitoDifal,
        efeitoCaixaLiquido: 0,
        guiaRecolhimento: 'CONTA_GRAFICA_EFD',
        vencimento: 'Apuração mensal EFD ICMS/IPI (Art. 16, §§ 2º e 3º RICMS/PR)',
        codigoAjusteEfd: 'Outros Débitos — Reg. E111 (conferir código vigente na Tabela 5.1.1 SEFA/PR)',
        obrigacaoAcessoria: 'Lançamento a débito (Reg. E111) com estorno/crédito concomitante na EFD',
        alertasAuditoria,
        memoriaCalculo,
        fundamentacaoLegal: 'Art. 16 do RICMS/PR c/c Lei Estadual nº 18.879/2016 (Antecipação 4%).',
      };
    } else {
      // Simples Nacional (1 / 2) ou MEI (4)
      const usarCarga12 = input.aplicarCarga12Art16SN === true;
      const aliqAlvo = usarCarga12 ? 12.0 : aliqInternaEfetiva;
      const difAliquota = Math.max(0, aliqAlvo - pIcmsOrigemPct);
      const valorDebitoDifal = r2(baseCalculoOperacao * (difAliquota / 100));

      memoriaCalculo.push(`Base de Cálculo da Operação: R$ ${baseCalculoOperacao.toFixed(2)}`);
      memoriaCalculo.push(`Alíquota Interna PR Aplicada: ${aliqAlvo}% (usarCarga12 = ${usarCarga12})`);
      memoriaCalculo.push(`Diferença de Alíquota Antecipação Art. 16: ${aliqAlvo}% - ${pIcmsOrigemPct}% = ${difAliquota}% ➔ R$ ${valorDebitoDifal.toFixed(2)}`);
      memoriaCalculo.push('Simples Nacional: tributação definitiva sem direito a tomada de crédito.');

      return {
        sujeitoDifal: false,
        tipoDifal: 'nao_aplicavel',
        modalidadeBase: 'base_simples',
        exigeRecolhimento: valorDebitoDifal > 0,
        modalidade: 'ANTECIPACAO_4_PCT_ART16',
        aliquotaOrigem: pIcmsOrigemPct,
        aliquotaDestino: aliqAlvo,
        aliquotaFecop: 0,
        aliquotaInternaEfetiva: aliqAlvo,
        baseCalculoOrigem: baseCalculoOperacao,
        baseCalculoDestino: baseCalculoOperacao,
        baseCalculoOperacao,
        baseCalculoDifal: baseCalculoOperacao,
        valorDifal: valorDebitoDifal,
        valorFecop: 0,
        valorTotalRecolher: valorDebitoDifal,
        valorDebitoDifal,
        valorDebitoFecop: 0,
        valorTotalDebito: valorDebitoDifal,
        efeitoCaixaLiquido: valorDebitoDifal,
        guiaRecolhimento: 'GR-PR',
        vencimento: 'Dia 3 do 2º mês subsequente (Art. 74, § 16, II RICMS/PR)',
        obrigacaoAcessoria: 'DeSTDA (SEDIF-SN) até o dia 28 do mês subsequente ao fato gerador',
        alertasAuditoria,
        memoriaCalculo,
        fundamentacaoLegal: 'Art. 16 do RICMS/PR c/c Lei Estadual nº 18.879/2016 e Art. 74, § 16, II.',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // MODALIDADE 4: COMERCIALIZAÇÃO / INDUSTRIALIZAÇÃO NACIONAL (12%) FORA DA ST
  // ---------------------------------------------------------------------------
  memoriaCalculo.push(
    'O Estado do Paraná não cobra DIFAL nem antecipação tributária em aquisições interestaduais de mercadorias nacionais (12%) destinadas à comercialização ou industrialização fora do regime de Substituição Tributária.'
  );

  return {
    sujeitoDifal: false,
    tipoDifal: 'nao_aplicavel',
    modalidadeBase: 'isento',
    exigeRecolhimento: false,
    modalidade: 'DISPENSADO',
    aliquotaOrigem: pIcmsOrigemPct,
    aliquotaDestino: aliqInternaBase,
    aliquotaFecop: 0,
    aliquotaInternaEfetiva: aliqInternaBase,
    baseCalculoOrigem: r2(vProd - vDesc + vFrete + vSeg + vOutro),
    baseCalculoDestino: 0,
    baseCalculoOperacao: r2(vProd - vDesc + vFrete + vSeg + vOutro),
    baseCalculoDifal: 0,
    valorDifal: 0,
    valorFecop: 0,
    valorTotalRecolher: 0,
    valorDebitoDifal: 0,
    valorDebitoFecop: 0,
    valorTotalDebito: 0,
    efeitoCaixaLiquido: 0,
    guiaRecolhimento: 'DISPENSADO',
    alertasAuditoria,
    memoriaCalculo,
    fundamentacaoLegal: 'Legislação do Paraná (Decreto nº 7.871/2017) não prevê DIFAL para revenda nacional 12%.',
  };
}

/**
 * Calcula o DIFAL em operações interestaduais destinadas a Consumidor Final
 * Não Contribuinte no Paraná (B2C - Art. 541 RICMS/PR c/c EC 87/2015 e LC 190/2021).
 */
export function calcularDifalNaoContribuintePR(
  input: EntradaDifalNaoContribuintePR
): DiagnosticoDifalNaoContribuinte {
  const memoriaCalculo: string[] = [];
  const crtE = Number(input.crtEmitente);

  // Dispensa constitucional e pacificada do Simples Nacional (ADIs 5464 e 5469 do STF)
  if (crtE === 1 || crtE === 4) {
    memoriaCalculo.push(
      'Remetente optante pelo Simples Nacional ou MEI está dispensado do recolhimento de DIFAL nas vendas interestaduais a consumidor final não contribuinte, conforme decisão vinculante do STF nas ADIs 5464 e 5469 acatada pela SEFA/PR.'
    );

    return {
      exigeRecolhimento: false,
      baseCalculoUnica: 0,
      aliquotaOrigem: 0,
      aliquotaDestino: 0,
      aliquotaFecop: 0,
      valorDebitoDifal: 0,
      valorDebitoFecop: 0,
      valorTotalDebito: 0,
      fundamentacaoLegal: 'ADIs 5464 e 5469 do STF (Cláusula nona do Convênio ICMS 93/2015 declarada inconstitucional).',
      memoriaCalculo,
    };
  }

  const dadosPr = resolverAliquotaPrBitemporal(input.ncm, input.dataFatoGerador);
  const aliqInternaBase = input.aliqInternaPrOverridePct ?? dadosPr.aliquotaIcmsPct;
  const aliqFecopPrPct = input.aliqFecopPrOverridePct ?? dadosPr.aliquotaFecopPct;
  const aliqInternaEfetiva = input.pRedBcInternaPrPct
    ? r2(aliqInternaBase * (1 - input.pRedBcInternaPrPct / 100))
    : aliqInternaBase;

  const pIcmsOrigemPct = input.pIcmsOrigemPct ?? 12.0;

  // Base Única "por dentro" — Art. 541 RICMS/PR c/c LC 190/2021
  const divisor = 1 - (aliqInternaEfetiva + aliqFecopPrPct) / 100;
  const baseCalculoUnica = r2(input.vOper / divisor);

  const difAliquota = Math.max(0, aliqInternaEfetiva - pIcmsOrigemPct);
  const valorDebitoDifal = r2(baseCalculoUnica * (difAliquota / 100));
  const valorDebitoFecop = r2(baseCalculoUnica * (aliqFecopPrPct / 100));
  const valorTotalDebito = r2(valorDebitoDifal + valorDebitoFecop);

  memoriaCalculo.push(`Valor da Operação de Partida: R$ ${input.vOper.toFixed(2)}`);
  memoriaCalculo.push(`Divisor Base Única: 1 - (${aliqInternaEfetiva}% + ${aliqFecopPrPct}%) / 100 = ${divisor.toFixed(4)}`);
  memoriaCalculo.push(`Base de Cálculo Única ("por dentro"): R$ ${baseCalculoUnica.toFixed(2)}`);
  memoriaCalculo.push(`DIFAL Destino PR: ${baseCalculoUnica.toFixed(2)} * (${aliqInternaEfetiva}% - ${pIcmsOrigemPct}%) = R$ ${valorDebitoDifal.toFixed(2)}`);
  if (aliqFecopPrPct > 0) {
    memoriaCalculo.push(`FECOP PR (${aliqFecopPrPct}%): ${baseCalculoUnica.toFixed(2)} * ${aliqFecopPrPct}% = R$ ${valorDebitoFecop.toFixed(2)} (Art. 14-A da Lei nº 11.580/1996 e Anexo XII do RICMS/PR)`);
  }

  return {
    exigeRecolhimento: valorTotalDebito > 0,
    baseCalculoUnica,
    aliquotaOrigem: pIcmsOrigemPct,
    aliquotaDestino: aliqInternaEfetiva,
    aliquotaFecop: aliqFecopPrPct,
    valorDebitoDifal,
    valorDebitoFecop,
    valorTotalDebito,
    fundamentacaoLegal: `Art. 541 do RICMS/PR c/c Lei Complementar Federal nº 190/2021 e Convênio ICMS 235/2021 (${dadosPr.dispositivoLegal}).`,
    memoriaCalculo,
  };
}

/**
 * Consolida pericialmente os diagnósticos de DIFAL de todos os itens de uma NF-e de entrada.
 */
export function consolidarDifalNfeEntrada(
  itensDiagnostico: Array<{ nItem?: number; xProd?: string; ncm?: string; diagnostico: DiagnosticoDifalEntrada }>
): ResumoDifalNfeEntrada {
  let totalBaseDifal = 0;
  let totalDebitoDifal = 0;
  let totalDebitoFecop = 0;
  let totalAntecipacaoArt16 = 0;
  let totalEfeitoCaixaLiquido = 0;

  let qtdItensComDebito = 0;
  let qtdItensUsoConsumo = 0;
  let qtdItensAtivoImobilizado = 0;
  let qtdItensAntecipacaoArt16 = 0;
  let qtdItensStEntradaArt11 = 0;

  const guiasSet = new Set<string>();
  const obrigacoesSet = new Set<string>();
  const prazosSet = new Set<string>();
  const alertasConsolidados: string[] = [];

  const itensFormatados = itensDiagnostico.map((item, idx) => {
    const diag = item.diagnostico;
    const nItem = item.nItem ?? (idx + 1);
    const xProd = item.xProd ?? `Item ${nItem}`;
    const ncm = item.ncm ?? '';

    if (diag.valorTotalDebito && diag.valorTotalDebito > 0) {
      qtdItensComDebito++;
    }

    if (diag.modalidade === 'DIFAL_USO_CONSUMO') qtdItensUsoConsumo++;
    if (diag.modalidade === 'DIFAL_ATIVO_IMOBILIZADO') qtdItensAtivoImobilizado++;
    if (diag.modalidade === 'ANTECIPACAO_4_PCT_ART16') {
      qtdItensAntecipacaoArt16++;
      totalAntecipacaoArt16 = r2(totalAntecipacaoArt16 + (diag.valorDebitoDifal || 0));
    }
    if (diag.modalidade === 'ICMS_ST_ENTRADA_ART11') qtdItensStEntradaArt11++;

    totalBaseDifal = r2(totalBaseDifal + (diag.baseCalculoDifal || 0));
    totalDebitoDifal = r2(totalDebitoDifal + (diag.valorDebitoDifal || 0));
    totalDebitoFecop = r2(totalDebitoFecop + (diag.valorDebitoFecop || 0));
    totalEfeitoCaixaLiquido = r2(totalEfeitoCaixaLiquido + (diag.efeitoCaixaLiquido || 0));

    if (diag.guiaRecolhimento && diag.guiaRecolhimento !== 'DISPENSADO') {
      if (diag.guiaRecolhimento.startsWith('GR-PR')) {
        if (diag.valorDebitoDifal && diag.valorDebitoDifal > 0) {
          guiasSet.add('GR-PR DIFAL (validar código de receita vigente SEFA/PR)');
        }
        if (diag.valorDebitoFecop && diag.valorDebitoFecop > 0) {
          guiasSet.add('GR-PR FECOP (Guia Apartada - validar código SEFA/PR)');
        }
        if (diag.modalidade === 'ANTECIPACAO_4_PCT_ART16') {
          guiasSet.add('GR-PR Antecipação Art. 16');
        }
      } else {
        guiasSet.add(diag.guiaRecolhimento);
      }
    }

    if (diag.vencimento) prazosSet.add(diag.vencimento);
    if (diag.obrigacaoAcessoria) obrigacoesSet.add(diag.obrigacaoAcessoria);

    if (diag.alertasAuditoria && diag.alertasAuditoria.length > 0) {
      for (const a of diag.alertasAuditoria) {
        if (!alertasConsolidados.includes(a)) alertasConsolidados.push(a);
      }
    }

    return {
      nItem,
      xProd,
      ncm,
      diagnostico: diag,
    };
  });

  const totalGeralRecolher = r2(totalDebitoDifal + totalDebitoFecop);
  const exigeRecolhimentoNaNota = totalGeralRecolher > 0 || qtdItensStEntradaArt11 > 0;

  return {
    totalItensAnalisados: itensDiagnostico.length,
    totalItensComDifal: qtdItensComDebito,
    totalDifalGeral: totalDebitoDifal,
    totalFecopGeral: totalDebitoFecop,
    totalGeralRecolher,
    exigeRecolhimentoNaNota,
    qtdItensComDebito,
    qtdItensUsoConsumo,
    qtdItensAtivoImobilizado,
    qtdItensAntecipacaoArt16,
    qtdItensStEntradaArt11,
    totalBaseDifal,
    totalDebitoDifal,
    totalDebitoFecop,
    totalAntecipacaoArt16,
    totalEfeitoCaixaLiquido,
    guiasNecessarias: Array.from(guiasSet),
    prazoPrincipal: Array.from(prazosSet).join('; ') || 'Sem recolhimento devido',
    obrigacoesAcessorias: Array.from(obrigacoesSet),
    alertasConsolidados,
    itens: itensFormatados,
  };
}

export interface OpcoesAuditoriaDifalEntrada {
  crtDestinatario?: '1' | '2' | '3' | '4' | number;
  destinacaoPadrao?: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado';
  destinacaoPorItem?: Record<string | number, 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'>;
  incluirIbsCbsBcIcms?: boolean;
  aplicarCarga12Art16SN?: boolean;
}

/**
 * Executa a auditoria completa e determinística de DIFAL, FECOP e Antecipação
 * para todos os itens de uma NF-e de entrada destinada a contribuinte paranaense.
 */
export function auditarDifalNotaEntrada(
  extracao: any,
  opcoes?: OpcoesAuditoriaDifalEntrada
): {
  itensDiagnostico: Record<string, DiagnosticoDifalEntrada>;
  resumoDifalNota: ResumoDifalNfeEntrada;
} {
  const crtDestinatario = opcoes?.crtDestinatario ?? 3;
  const destinacaoPadrao = opcoes?.destinacaoPadrao ?? 'comercializacao';
  const destinacaoPorItem = opcoes?.destinacaoPorItem || {};
  const incluirIbsCbsBcIcms = opcoes?.incluirIbsCbsBcIcms;
  const aplicarCarga12Art16SN = opcoes?.aplicarCarga12Art16SN;

  const emitente = extracao?.emitente || {};
  const destinatario = extracao?.destinatario || {};
  const identificacao = extracao?.identificacao || {};
  const itens = Array.isArray(extracao?.itens) ? extracao.itens : [];

  const ufEmitente = emitente.uf || identificacao.ufEmitente || 'SP';
  const ufDestinatario = destinatario.uf || 'PR';
  const crtEmitente = emitente.crt ?? 3;
  const dataFatoGerador = identificacao.dataEmissao || new Date().toISOString().slice(0, 10);

  const itensDiagnostico: Record<string, DiagnosticoDifalEntrada> = {};
  const itensParaConsolidar: Array<{ nItem: number; xProd: string; ncm: string; diagnostico: DiagnosticoDifalEntrada }> = [];

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx];
    const nItem = item.index ?? (idx + 1);
    const chaveItem = String(item.cProd || nItem);

    // 1. Determinação da destinação (override explícito ou inferência por CFOP)
    let destinacao: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado';
    if (destinacaoPorItem[chaveItem]) {
      destinacao = destinacaoPorItem[chaveItem];
    } else if (destinacaoPorItem[nItem]) {
      destinacao = destinacaoPorItem[nItem];
    } else {
      const cfop = String(item.cfop || item.cfopEntradaMapeado || '');
      if (cfop.endsWith('556') || cfop.endsWith('407')) {
        destinacao = 'uso_consumo';
      } else if (cfop.endsWith('551') || cfop.endsWith('406')) {
        destinacao = 'ativo_imobilizado';
      } else {
        destinacao = destinacaoPadrao;
      }
    }

    const trib = item.tributos || {};
    const orig = item.origemTabelaA !== undefined
      ? item.origemTabelaA
      : (item.origemMercadoria !== undefined ? parseInt(String(item.origemMercadoria), 10) : trib.orig);

    const inputItem: EntradaApuracaoDifalPR = {
      nItem,
      xProd: item.xProd || `Item ${nItem}`,
      ncm: item.ncm || '',
      cest: item.cest,
      origemMercadoria: orig,
      finalidadeEntrada: destinacao,
      crtEmitente: crtEmitente as any,
      crtDestinatario: crtDestinatario as any,
      ufEmitente,
      ufDestinatario,
      dataFatoGerador,
      vProd: Number(item.vProd || 0),
      vFrete: item.vFrete,
      vSeg: item.vSeg,
      vDesc: item.vDesc,
      vOutro: item.vOutro,
      vIpi: trib.vIPI ?? trib.vIpi ?? item.vIPI,
      pIcmsOrigemPct: trib.pICMS ?? trib.pIcms,
      vIcmsOrigem: trib.vICMS ?? trib.vIcms,
      vIcmsStDestacado: trib.vICMSST ?? trib.vIcmsSt ?? item.vICMSSTRet,
      sujeitoStInternaPr: Boolean(item.cest || trib.vBCST || trib.vBCSTRet),
      incluirIbsCbsBcIcms,
      vIbs: trib.vIBS ?? trib.vIbs,
      vCbs: trib.vCBS ?? trib.vCbs,
      vIs: trib.vIS ?? trib.vIs,
      aplicarCarga12Art16SN,
    };

    const diagnostico = apurarDifalEntradaPR(inputItem);
    itensDiagnostico[String(nItem)] = diagnostico;
    itensDiagnostico[chaveItem] = diagnostico;

    itensParaConsolidar.push({
      nItem,
      xProd: item.xProd || `Item ${nItem}`,
      ncm: item.ncm || '',
      diagnostico,
    });
  }

  const resumoDifalNota = consolidarDifalNfeEntrada(itensParaConsolidar);

  return {
    itensDiagnostico,
    resumoDifalNota,
  };
}

