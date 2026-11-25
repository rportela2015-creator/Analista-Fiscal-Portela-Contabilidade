/**
 * Motor Consolidado de Apuração de DIFAL de Entrada Interestadual no Paraná (RICMS/PR)
 * Demonstrativo Produto a Produto, Somatório, Base Dupla, FECOP e Prazo Legal de Recolhimento.
 *
 * Fundamentação:
 * - RICMS/PR (Decreto Estadual nº 7.871/2017): Art. 3º, Art. 8º § 12, Art. 74 XIX e § 16 II, Art. 542 e Art. 545
 * - NPF nº 052/2018 (CRE/SEFA-PR): Registros E310, E316 e códigos PR239999 / PR259999
 * - Lei Estadual nº 11.580/1996 (Art. 14-A FECOP) e Decretos PR nº 6.048/2024 e nº 12.828/2026
 * - Consulta de Contribuinte SEFA/PR nº 48/2026 (Transição IBS/CBS/IS na BC do ICMS)
 */

import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from '../engine/matriz-icms-pr';

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export type PerfilContribuinteDifalPR = 'inscrito_normal' | 'simples_nacional' | 'nao_inscrito';

export type DestinacaoItemDifalPR =
  | 'uso_consumo'
  | 'ativo_imobilizado'
  | 'comercializacao'
  | 'industrializacao';

export interface EntradaItemDifalPR {
  nItem?: number;
  cProd?: string;
  xProd?: string;
  ncm: string;
  cest?: string;
  cfop?: string;
  cstIcms?: string;
  csosn?: string;
  origemMercadoria?: string | number;
  destinacao?: DestinacaoItemDifalPR;
  ufEmitente: string;
  ufDestinatario?: string;
  dataFatoGerador: string; // YYYY-MM-DD ou ISO
  vProd: number;
  vFrete?: number;
  vSeg?: number;
  vDesc?: number;
  vOutro?: number;
  vIpi?: number;
  pIcmsOrigemPct?: number;
  vIcmsOrigem?: number;
  vIcmsStDestacado?: number;
  temStAnterior?: boolean;
  incluirIbsCbsBcIcms?: boolean;
  vIbs?: number;
  vCbs?: number;
  vIs?: number;
  aliqIntraPrOverridePct?: number;
  fecopOverridePct?: number;
}

export interface ItemDemonstrativoDifalPR {
  nItem: number;
  cProd: string;
  xProd: string;
  NCM: string;
  CFOP: string;
  destinacao: DestinacaoItemDifalPR;
  vOperacao: number;
  aliqInter: number;
  aliqIntraPR: number;
  fecop: number;
  baseDupla: number;
  valorDifalPrincipal: number;
  valorFecop: number;
  valorDifalTotal: number;
  exigeRecolhimento: boolean;
  fundamento: string;
  motivoDispensa?: string;
  codigosEfd: string[];
  memoriaCalculo: string[];
  alertas: string[];
}

export interface PrazoRecolhimentoDifalPR {
  dataFatoGerador: string;
  dataVencimento: string; // YYYY-MM-DD ou 'ANTES_DA_SAIDA' ou ''
  dataVencimentoFormatada: string;
  regraPrazo: string;
  guia: 'GR-PR 1015' | 'DeSTDA/GR-PR' | 'GNRE' | 'DISPENSADO';
  codigoReceita: string;
  codigosEfd: string[];
  fundamentoLegal: string;
}

export interface SomatorioDifalPR {
  totalBaseDifal: number;
  totalDifalPrincipal: number;
  totalFecop: number;
  totalDifalGeral: number;
  qtdItensTributados: number;
  qtdItensAnalisados: number;
}

export interface DemonstrativoConsolidadoDifalPR {
  chaveNota?: string;
  numeroNota?: string;
  dataEmissao: string;
  ufEmitente: string;
  ufDestinatario: string;
  operacaoInterestadual: boolean;
  perfilContribuinte: PerfilContribuinteDifalPR;
  exigeRecolhimento: boolean;
  itens: ItemDemonstrativoDifalPR[];
  somatorio: SomatorioDifalPR;
  prazoRecolhimento: PrazoRecolhimentoDifalPR;
  alertas: string[];
}

export interface SomatorioMultiplasNotasDifalPR extends SomatorioDifalPR {
  qtdNotas: number;
  qtdNotasComDifal: number;
}

export interface OpcoesDemonstrativoDifalPR {
  perfilContribuinte?: PerfilContribuinteDifalPR;
  crtDestinatario?: '1' | '2' | '3' | '4' | number;
  inscritoEstadualPR?: boolean;
  destinacaoPadrao?: DestinacaoItemDifalPR;
  destinacaoPorItem?: Record<string | number, DestinacaoItemDifalPR>;
  incluirIbsCbsBcIcms?: boolean;
}

function normalizarDataIso(dataRaw?: string): string {
  if (!dataRaw) return new Date().toISOString().slice(0, 10);
  const str = String(dataRaw).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function adicionarMesesDiaFixo(dataIso: string, meses: number, diaFixo: number): { iso: string; br: string } {
  const clean = normalizarDataIso(dataIso);
  const [anoStr, mesStr] = clean.split('-');
  const anoBase = parseInt(anoStr, 10);
  const mesBaseIndex = parseInt(mesStr, 10) - 1; // 0..11

  const totalMeses = anoBase * 12 + mesBaseIndex + meses;
  const anoAlvo = Math.floor(totalMeses / 12);
  const mesAlvoIndex = totalMeses % 12; // 0..11
  const ultimoDiaMes = new Date(Date.UTC(anoAlvo, mesAlvoIndex + 1, 0)).getUTCDate();
  const diaAlvo = Math.min(diaFixo, ultimoDiaMes);

  const mm = String(mesAlvoIndex + 1).padStart(2, '0');
  const dd = String(diaAlvo).padStart(2, '0');
  return {
    iso: `${anoAlvo}-${mm}-${dd}`,
    br: `${dd}/${mm}/${anoAlvo}`,
  };
}

export function inferirDestinacaoPorCfop(
  cfopRaw?: string,
  fallback: DestinacaoItemDifalPR = 'comercializacao'
): DestinacaoItemDifalPR {
  const cfop = String(cfopRaw || '').replace(/\D/g, '');
  if (cfop.endsWith('556') || cfop.endsWith('407')) return 'uso_consumo';
  if (cfop.endsWith('551') || cfop.endsWith('406')) return 'ativo_imobilizado';
  if (cfop.endsWith('101') || cfop.endsWith('401')) return 'industrializacao';
  if (cfop.endsWith('102') || cfop.endsWith('403')) return 'comercializacao';
  return fallback;
}

export function resolverPerfilContribuinteDifalPR(opcoes?: OpcoesDemonstrativoDifalPR): PerfilContribuinteDifalPR {
  if (opcoes?.perfilContribuinte) return opcoes.perfilContribuinte;
  if (opcoes?.inscritoEstadualPR === false) return 'nao_inscrito';
  const crt = Number(opcoes?.crtDestinatario ?? 3);
  if (crt === 1 || crt === 2 || crt === 4) return 'simples_nacional';
  return 'inscrito_normal';
}

/**
 * Determina o prazo legal de recolhimento e a guia/código de receita aplicável no Paraná.
 */
export function calcularPrazoRecolhimentoDifalPR(
  dataNfeISO: string,
  perfil: PerfilContribuinteDifalPR,
  exigeRecolhimento = true
): PrazoRecolhimentoDifalPR {
  const dataBase = normalizarDataIso(dataNfeISO);

  if (!exigeRecolhimento) {
    return {
      dataFatoGerador: dataBase,
      dataVencimento: '',
      dataVencimentoFormatada: 'Sem recolhimento devido',
      regraPrazo: 'Operação dispensada de DIFAL na entrada',
      guia: 'DISPENSADO',
      codigoReceita: 'N/A',
      codigosEfd: [],
      fundamentoLegal: 'RICMS/PR (Decreto nº 7.871/2017) — hipótese não sujeita ao diferencial de alíquotas.',
    };
  }

  if (perfil === 'nao_inscrito') {
    return {
      dataFatoGerador: dataBase,
      dataVencimento: 'ANTES_DA_SAIDA',
      dataVencimentoFormatada: 'Antes da saída da mercadoria',
      regraPrazo: 'Recolhimento antecipado por operação (acompanha o trânsito fiscal)',
      guia: 'GNRE',
      codigoReceita: 'GNRE 10010-2',
      codigosEfd: ['GNRE'],
      fundamentoLegal: 'RICMS/PR Art. 542 — contribuinte/destinatário sem inscrição estadual ativa no CAD/ICMS-PR.',
    };
  }

  if (perfil === 'simples_nacional') {
    const venc = adicionarMesesDiaFixo(dataBase, 2, 20);
    return {
      dataFatoGerador: dataBase,
      dataVencimento: venc.iso,
      dataVencimentoFormatada: venc.br,
      regraPrazo: 'Até o dia 20 do 2º mês subsequente ao fato gerador (DeSTDA / GR-PR)',
      guia: 'DeSTDA/GR-PR',
      codigoReceita: 'DeSTDA / GR-PR',
      codigosEfd: ['DeSTDA', 'GR-PR'],
      fundamentoLegal: 'RICMS/PR Art. 74, § 16, II e Art. 545 — apuração para optantes pelo Simples Nacional.',
    };
  }

  // Contribuinte inscrito no Regime Normal
  const venc = adicionarMesesDiaFixo(dataBase, 1, 12);
  return {
    dataFatoGerador: dataBase,
    dataVencimento: venc.iso,
    dataVencimentoFormatada: venc.br,
    regraPrazo: 'Até o dia 12 do mês subsequente ao fato gerador',
    guia: 'GR-PR 1015',
    codigoReceita: '1015',
    codigosEfd: ['E310', 'E316', 'PR239999', 'PR259999'],
    fundamentoLegal: 'RICMS/PR Art. 74, XIX c/c NPF nº 052/2018 (Registros E310/E316 e códigos PR239999 / PR259999).',
  };
}

/**
 * Calcula o demonstrativo unitário do DIFAL de entrada (Base Dupla + FECOP) para um item.
 */
export function calcularDifalItemEntradaPR(input: EntradaItemDifalPR): ItemDemonstrativoDifalPR {
  const nItem = input.nItem ?? 1;
  const cProd = input.cProd || String(nItem);
  const xProd = input.xProd || `Item ${nItem}`;
  const ncm = String(input.ncm || '').replace(/\D/g, '');
  const cfop = String(input.cfop || '').replace(/\D/g, '');
  const ufE = String(input.ufEmitente || '').trim().toUpperCase();
  const ufD = String(input.ufDestinatario || 'PR').trim().toUpperCase();
  const data = normalizarDataIso(input.dataFatoGerador);
  const destinacao = input.destinacao || inferirDestinacaoPorCfop(cfop, 'comercializacao');

  const vProd = Number(input.vProd || 0);
  const vFrete = Number(input.vFrete || 0);
  const vSeg = Number(input.vSeg || 0);
  const vDesc = Number(input.vDesc || 0);
  const vOutro = Number(input.vOutro || 0);
  const vIpi = Number(input.vIpi || 0);

  const ano = parseInt(data.slice(0, 4), 10) || 2026;
  const incluirIva = input.incluirIbsCbsBcIcms ?? (ano >= 2027);
  const parcelaIva2027 = ano >= 2027 && incluirIva
    ? r2((input.vIbs ?? 0) + (input.vCbs ?? 0) + (input.vIs ?? 0))
    : 0;

  const vOperacao = r2(Math.max(0, vProd - vDesc + vFrete + vSeg + vOutro + vIpi + parcelaIva2027));

  const origNum = Number(input.origemMercadoria ?? 0);
  const aliqInter = input.pIcmsOrigemPct !== undefined
    ? Number(input.pIcmsOrigemPct)
    : ([1, 2, 3, 8].includes(origNum) ? 4.0 : 12.0);

  const dadosPr = resolverAliquotaPrBitemporal(ncm, data);
  const aliqIntraPR = input.aliqIntraPrOverridePct ?? dadosPr.aliquotaIcmsPct;
  const fecop = input.fecopOverridePct ?? dadosPr.aliquotaFecopPct;

  const alertas: string[] = [];
  const memoriaCalculo: string[] = [];

  // Verifica exclusão da ST pelos Decretos PR 6.048/2024 e 12.828/2026
  const exclusaoSt = verificarExclusaoStPr(ncm, input.cest, data);
  const possuiStDeclarada =
    input.cstIcms === '60' ||
    input.csosn === '500' ||
    (input.vIcmsStDestacado ?? 0) > 0 ||
    Boolean(input.temStAnterior);

  if (exclusaoSt.excluidoDaSt && (input.vIcmsStDestacado ?? 0) > 0) {
    alertas.push(
      `NCM ${ncm} excluída da ST no PR desde ${exclusaoSt.dataExclusao} (${exclusaoSt.decreto}): destaque de ICMS-ST de R$ ${(input.vIcmsStDestacado ?? 0).toFixed(2)} indevido.`
    );
  }

  // Regra 1: Operação não é interestadual para o PR
  if (!ufE || ufE === 'PR' || ufD !== 'PR') {
    const motivo = 'Operação interna no Paraná ou destino em outra UF — DIFAL de entrada interestadual dispensado.';
    return {
      nItem,
      cProd,
      xProd,
      NCM: ncm,
      CFOP: cfop,
      destinacao,
      vOperacao,
      aliqInter,
      aliqIntraPR,
      fecop,
      baseDupla: 0,
      valorDifalPrincipal: 0,
      valorFecop: 0,
      valorDifalTotal: 0,
      exigeRecolhimento: false,
      fundamento: 'RICMS/PR Art. 3º — incidência restrita a entradas interestaduais destinadas ao PR.',
      motivoDispensa: motivo,
      codigosEfd: [],
      memoriaCalculo: [motivo],
      alertas,
    };
  }

  // Regra 2: Destinação para revenda ou industrialização (fora de uso/consumo e ativo)
  if (destinacao !== 'uso_consumo' && destinacao !== 'ativo_imobilizado') {
    const motivo = `Destinação "${destinacao}" (comercialização/industrialização): não sujeita ao DIFAL de uso/consumo ou ativo imobilizado.`;
    return {
      nItem,
      cProd,
      xProd,
      NCM: ncm,
      CFOP: cfop,
      destinacao,
      vOperacao,
      aliqInter,
      aliqIntraPR,
      fecop,
      baseDupla: 0,
      valorDifalPrincipal: 0,
      valorFecop: 0,
      valorDifalTotal: 0,
      exigeRecolhimento: false,
      fundamento: 'RICMS/PR Art. 3º e Art. 8º, § 12 — DIFAL de entrada incide sobre uso/consumo e ativo imobilizado.',
      motivoDispensa: motivo,
      codigosEfd: [],
      memoriaCalculo: [motivo],
      alertas,
    };
  }

  // Regra 3: ST anterior válida encerrando tributação (exceto quando excluída pelos Decretos PR 6.048/24 e 12.828/26)
  if (possuiStDeclarada && !exclusaoSt.excluidoDaSt) {
    const motivo = 'Mercadoria com ICMS-ST retido/recolhido anteriormente (CST 60/CSOSN 500 ou vICMSST destacado), encerrando a cadeia tributária.';
    return {
      nItem,
      cProd,
      xProd,
      NCM: ncm,
      CFOP: cfop,
      destinacao,
      vOperacao,
      aliqInter,
      aliqIntraPR,
      fecop,
      baseDupla: 0,
      valorDifalPrincipal: 0,
      valorFecop: 0,
      valorDifalTotal: 0,
      exigeRecolhimento: false,
      fundamento: 'RICMS/PR Anexo IX — substituição tributária anterior com encerramento da tributação.',
      motivoDispensa: motivo,
      codigosEfd: [],
      memoriaCalculo: [motivo],
      alertas,
    };
  }

  // Regra 4: Cálculo Base Dupla ("por dentro") + FECOP
  const vIcmsOrigem = input.vIcmsOrigem !== undefined
    ? Number(input.vIcmsOrigem)
    : r2(Math.max(0, vProd - vDesc + vFrete + vSeg + vOutro) * (aliqInter / 100));

  const vSemIcmsOrigem = Math.max(0, r2(vOperacao - vIcmsOrigem));
  const somaAliqDestino = aliqIntraPR + fecop;
  const divisor = 1 - somaAliqDestino / 100;

  if (divisor <= 0 || somaAliqDestino <= aliqInter) {
    const motivo = `Alíquota interna efetiva (${somaAliqDestino}%) não excede a alíquota interestadual (${aliqInter}%) — sem diferencial a recolher.`;
    return {
      nItem,
      cProd,
      xProd,
      NCM: ncm,
      CFOP: cfop,
      destinacao,
      vOperacao,
      aliqInter,
      aliqIntraPR,
      fecop,
      baseDupla: 0,
      valorDifalPrincipal: 0,
      valorFecop: 0,
      valorDifalTotal: 0,
      exigeRecolhimento: false,
      fundamento: 'RICMS/PR Art. 8º, § 12 — diferença de alíquota nula ou negativa.',
      motivoDispensa: motivo,
      codigosEfd: [],
      memoriaCalculo: [motivo],
      alertas,
    };
  }

  const baseDupla = r2(vSemIcmsOrigem / divisor);
  const valorDifalPrincipal = r2(Math.max(0, baseDupla * (aliqIntraPR / 100) - vIcmsOrigem));
  const valorFecop = r2(baseDupla * (fecop / 100));
  const valorDifalTotal = r2(valorDifalPrincipal + valorFecop);
  const exigeRecolhimento = valorDifalTotal > 0;

  memoriaCalculo.push(`Valor da Operação (vProd - vDesc + frete/seg/out + IPI${parcelaIva2027 > 0 ? ' + IBS/CBS/IS' : ''}): R$ ${vOperacao.toFixed(2)}`);
  memoriaCalculo.push(`ICMS de Origem (${aliqInter}%): R$ ${vIcmsOrigem.toFixed(2)}`);
  memoriaCalculo.push(`Base sem ICMS Origem: R$ ${vSemIcmsOrigem.toFixed(2)}`);
  memoriaCalculo.push(`Base Dupla = ${vSemIcmsOrigem.toFixed(2)} / [1 - (${aliqIntraPR}% + ${fecop}%)/100] = R$ ${baseDupla.toFixed(2)}`);
  memoriaCalculo.push(`DIFAL Principal = (${baseDupla.toFixed(2)} * ${aliqIntraPR}%) - R$ ${vIcmsOrigem.toFixed(2)} = R$ ${valorDifalPrincipal.toFixed(2)}`);
  if (fecop > 0) {
    memoriaCalculo.push(`FECOP (${fecop}%): ${baseDupla.toFixed(2)} * ${fecop}% = R$ ${valorFecop.toFixed(2)} (Lei 11.580/96 Art. 14-A / Anexo XII)`);
  }
  if (parcelaIva2027 > 0) {
    memoriaCalculo.push(`Parcela IBS/CBS/IS (R$ ${parcelaIva2027.toFixed(2)}) incluída na BC conforme Consulta SEFA/PR nº 48/2026.`);
  }

  const fundamentoBase =
    `RICMS/PR (Decreto nº 7.871/2017) Art. 3º e Art. 8º, § 12 (Base Dupla)` +
    (fecop > 0 ? '; Art. 14-A Lei nº 11.580/1996 e Anexo XII (FECOP)' : '') +
    `; ${dadosPr.dispositivoLegal}; NPF nº 052/2018 (E310/E316, PR239999/PR259999).`;

  return {
    nItem,
    cProd,
    xProd,
    NCM: ncm,
    CFOP: cfop,
    destinacao,
    vOperacao,
    aliqInter,
    aliqIntraPR,
    fecop,
    baseDupla,
    valorDifalPrincipal,
    valorFecop,
    valorDifalTotal,
    exigeRecolhimento,
    fundamento: fundamentoBase,
    codigosEfd: exigeRecolhimento ? ['E310', 'E316', 'PR239999', 'PR259999'] : [],
    memoriaCalculo,
    alertas,
  };
}

/**
 * Executa a apuração consolidada item a item do DIFAL de entrada para uma NF-e extraída.
 */
export function apurarDemonstrativoDifalEntradaPR(
  extracao: any,
  opcoes?: OpcoesDemonstrativoDifalPR
): DemonstrativoConsolidadoDifalPR {
  const emitente = extracao?.emitente || {};
  const destinatario = extracao?.destinatario || {};
  const identificacao = extracao?.identificacao || {};
  const itensRaw: any[] = Array.isArray(extracao?.itens) ? extracao.itens : [];

  const ufEmitente = String(emitente.uf || identificacao.ufEmitente || 'SP').trim().toUpperCase();
  const ufDestinatario = String(destinatario.uf || 'PR').trim().toUpperCase();
  const dataEmissao = normalizarDataIso(identificacao.dataEmissao);
  const perfilContribuinte = resolverPerfilContribuinteDifalPR(opcoes);
  const destinacaoPadrao = opcoes?.destinacaoPadrao ?? 'comercializacao';
  const destinacaoPorItem = opcoes?.destinacaoPorItem || {};

  const itens: ItemDemonstrativoDifalPR[] = [];
  const alertasSet = new Set<string>();

  let totalBaseDifal = 0;
  let totalDifalPrincipal = 0;
  let totalFecop = 0;
  let totalDifalGeral = 0;
  let qtdItensTributados = 0;

  for (let idx = 0; idx < itensRaw.length; idx++) {
    const it = itensRaw[idx];
    const nItem = it.index ?? (idx + 1);
    const cProd = String(it.cProd || nItem);
    const trib = it.tributos || {};

    const destOverride =
      destinacaoPorItem[nItem] ??
      destinacaoPorItem[cProd] ??
      destinacaoPorItem[String(nItem)];

    const destinacao = destOverride ?? inferirDestinacaoPorCfop(it.cfop || it.cfopEntradaMapeado, destinacaoPadrao);
    const orig = it.origemTabelaA !== undefined
      ? it.origemTabelaA
      : (it.origemMercadoria !== undefined ? parseInt(String(it.origemMercadoria), 10) : trib.orig);

    const demonstrativoItem = calcularDifalItemEntradaPR({
      nItem,
      cProd,
      xProd: it.xProd || `Item ${nItem}`,
      ncm: it.ncm || '',
      cest: it.cest,
      cfop: it.cfop || it.cfopEntradaMapeado || '',
      cstIcms: trib.cstIcms,
      csosn: trib.csosn,
      origemMercadoria: orig,
      destinacao,
      ufEmitente,
      ufDestinatario,
      dataFatoGerador: dataEmissao,
      vProd: Number(it.vProd || 0),
      vFrete: Number(it.vFrete || 0),
      vSeg: Number(it.vSeg || 0),
      vDesc: Number(it.vDesc || 0),
      vOutro: Number(it.vOutro || 0),
      vIpi: trib.vIPI ?? trib.vIpi ?? it.vIPI ?? 0,
      pIcmsOrigemPct: trib.pICMS ?? trib.pIcms,
      vIcmsOrigem: trib.vICMS ?? trib.vIcms,
      vIcmsStDestacado: trib.vICMSST ?? trib.vIcmsSt ?? it.vICMSSTRet ?? 0,
      temStAnterior: Boolean(trib.cstIcms === '60' || trib.csosn === '500' || (trib.vICMSST ?? 0) > 0 || (it.vICMSSTRet ?? 0) > 0),
      incluirIbsCbsBcIcms: opcoes?.incluirIbsCbsBcIcms,
      vIbs: trib.vIBS ?? trib.vIbs ?? 0,
      vCbs: trib.vCBS ?? trib.vCbs ?? 0,
      vIs: trib.vIS ?? trib.vIs ?? 0,
    });

    itens.push(demonstrativoItem);

    if (demonstrativoItem.exigeRecolhimento) {
      qtdItensTributados++;
      totalBaseDifal = r2(totalBaseDifal + demonstrativoItem.baseDupla);
      totalDifalPrincipal = r2(totalDifalPrincipal + demonstrativoItem.valorDifalPrincipal);
      totalFecop = r2(totalFecop + demonstrativoItem.valorFecop);
      totalDifalGeral = r2(totalDifalGeral + demonstrativoItem.valorDifalTotal);
    }

    for (const a of demonstrativoItem.alertas) {
      alertasSet.add(a);
    }
  }

  const exigeRecolhimento = qtdItensTributados > 0 && totalDifalGeral > 0;
  const prazoRecolhimento = calcularPrazoRecolhimentoDifalPR(
    dataEmissao,
    perfilContribuinte,
    exigeRecolhimento
  );

  return {
    chaveNota: identificacao.chaveAcesso,
    numeroNota: identificacao.numero,
    dataEmissao,
    ufEmitente,
    ufDestinatario,
    operacaoInterestadual: ufEmitente !== 'PR' && ufDestinatario === 'PR',
    perfilContribuinte,
    exigeRecolhimento,
    itens,
    somatorio: {
      totalBaseDifal,
      totalDifalPrincipal,
      totalFecop,
      totalDifalGeral,
      qtdItensTributados,
      qtdItensAnalisados: itens.length,
    },
    prazoRecolhimento,
    alertas: Array.from(alertasSet),
  };
}

/**
 * Soma os demonstrativos de múltiplas notas fiscais auditadas na sessão ou em lote.
 */
export function consolidarMultiplasNotasDifalPR(
  demonstrativos: DemonstrativoConsolidadoDifalPR[]
): SomatorioMultiplasNotasDifalPR {
  let totalBaseDifal = 0;
  let totalDifalPrincipal = 0;
  let totalFecop = 0;
  let totalDifalGeral = 0;
  let qtdItensTributados = 0;
  let qtdItensAnalisados = 0;
  let qtdNotasComDifal = 0;

  for (const d of demonstrativos) {
    totalBaseDifal = r2(totalBaseDifal + (d.somatorio?.totalBaseDifal || 0));
    totalDifalPrincipal = r2(totalDifalPrincipal + (d.somatorio?.totalDifalPrincipal || 0));
    totalFecop = r2(totalFecop + (d.somatorio?.totalFecop || 0));
    totalDifalGeral = r2(totalDifalGeral + (d.somatorio?.totalDifalGeral || 0));
    qtdItensTributados += d.somatorio?.qtdItensTributados || 0;
    qtdItensAnalisados += d.somatorio?.qtdItensAnalisados || 0;
    if (d.exigeRecolhimento) qtdNotasComDifal++;
  }

  return {
    qtdNotas: demonstrativos.length,
    qtdNotasComDifal,
    totalBaseDifal,
    totalDifalPrincipal,
    totalFecop,
    totalDifalGeral,
    qtdItensTributados,
    qtdItensAnalisados,
  };
}
