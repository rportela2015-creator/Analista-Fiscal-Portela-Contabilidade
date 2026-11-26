/**
 * Extrator Determinístico de CT-e (Conhecimento de Transporte Eletrônico — Modelo 57)
 * e Rateio Proporcional de Frete FOB sobre Itens de NF-e (CPC 16 R1).
 *
 * Toda aritmética monetária usa DecimalHalfEven (`lib/math/decimal-fiscal.ts`),
 * garantindo fechamento exato ao centavo sem resíduos de ponto flutuante.
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DecimalHalfEven, somarDecimaisRfb } from '../math/decimal-fiscal';
import { sanitizarCnpj } from './perfil-tributario';
import { FiscalExtractionError, type ExtractedItem } from '../extrator-nfe-types';

export type IndicadorTomadorCte = '0' | '1' | '2' | '3' | '4';

export type TipoTomadorCte =
  | 'remetente'
  | 'expedidor'
  | 'recebedor'
  | 'destinatario'
  | 'outros'
  | 'indefinido';

export interface ParticipanteCte {
  cnpj?: string;
  cpf?: string;
  nome?: string;
  uf?: string;
}

export interface ExtractedCteData {
  tipoDocumento: 'CTE_XML';
  chaveAcesso: string;
  numero: string;
  serie: string;
  modelo: string;
  dataEmissao?: string;
  ufInicio: string;
  ufFim: string;
  cfop?: string;
  modal?: string;
  emitente: ParticipanteCte;
  remetente?: ParticipanteCte;
  expedidor?: ParticipanteCte;
  recebedor?: ParticipanteCte;
  destinatario?: ParticipanteCte;
  tomador: {
    indicador: IndicadorTomadorCte | '';
    tipo: TipoTomadorCte;
    cnpj: string;
    cpf?: string;
    nome?: string;
    uf?: string;
  };
  valores: {
    vTPrest: number;
    vRec: number;
    componentes: { nome: string; valor: number }[];
  };
  icms: {
    cstIcms: string;
    vBC: number;
    pICMS: number;
    vICMS: number;
    pRedBC?: number;
    vTotTrib?: number;
  };
  carga?: {
    vCarga?: number;
    pesoBrutoKg?: number;
  };
  chavesNfeVinculadas: string[];
}

export interface VerificacaoTomadorCteResult {
  ehTomadora: boolean;
  ehTomadoraNaAquisicaoFob: boolean;
  modalFobConfirmado: boolean;
  cnpjTomador: string;
  cnpjEmpresaAtiva: string;
  tipoTomador: TipoTomadorCte;
  indicadorTomador: IndicadorTomadorCte | '';
  motivo: string;
}

export interface ItemRateioCteResult {
  index: number;
  cProd: string;
  proporcaoPct: number;
  baseRateio: number;
  vFreteCte: number;
  freteCteUnitario: number;
  vIcmsCte: number;
}

export interface RateioCteSobreItensResult {
  aplicado: boolean;
  chaveCte: string;
  criterioUtilizado: 'valor' | 'peso';
  verificacaoTomador: VerificacaoTomadorCteResult;
  chaveNfeCompativel: boolean;
  alertaVinculo?: string;
  motivoBloqueio?: string;
  vTPrestTotal: number;
  vIcmsCteTotal: number;
  somaRateadaFrete: number;
  somaRateadaIcms: number;
  diferencaCentavosFrete: number;
  diferencaCentavosIcms: number;
  conferidoCentavos: boolean;
  rateios: ItemRateioCteResult[];
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function numVal(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

function strVal(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function mapearTipoTomador(ind: string): TipoTomadorCte {
  switch (ind) {
    case '0':
      return 'remetente';
    case '1':
      return 'expedidor';
    case '2':
      return 'recebedor';
    case '3':
      return 'destinatario';
    case '4':
      return 'outros';
    default:
      return 'indefinido';
  }
}

function extrairParticipante(node: any, enderTag: string): ParticipanteCte | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const ender = node[enderTag] || node.enderToma || node.enderEmit || node.enderDest;
  return {
    cnpj: sanitizarCnpj(strVal(node.CNPJ)) || undefined,
    cpf: strVal(node.CPF).replace(/\D/g, '') || undefined,
    nome: strVal(node.xNome) || undefined,
    uf: strVal(ender?.UF) || undefined,
  };
}

function extrairBlocoIcmsCte(icmsNode: any): ExtractedCteData['icms'] {
  if (!icmsNode || typeof icmsNode !== 'object') {
    return { cstIcms: '', vBC: 0, pICMS: 0, vICMS: 0 };
  }

  const variantes = [
    icmsNode.ICMS00,
    icmsNode.ICMS20,
    icmsNode.ICMS45,
    icmsNode.ICMS60,
    icmsNode.ICMS90,
    icmsNode.ICMSOutraUF,
    icmsNode.ICMSSN,
  ];
  const bloco = variantes.find((v) => v && typeof v === 'object') || icmsNode;

  const cstIcms = strVal(bloco.CST) || (bloco.indSN === '1' ? 'SN' : '');
  const vBC = numVal(bloco.vBCOutraUF ?? bloco.vBC);
  const pICMS = numVal(bloco.pICMSOutraUF ?? bloco.pICMS);
  const vICMS = numVal(bloco.vICMSOutraUF ?? bloco.vICMS);
  const pRedBC = numVal(bloco.pRedBCOutraUF ?? bloco.pRedBC);

  return {
    cstIcms,
    vBC,
    pICMS,
    vICMS,
    pRedBC: pRedBC > 0 ? pRedBC : undefined,
  };
}

/**
 * Extrai dados fiscais estruturados de XML de CT-e (Modelo 57).
 */
export function extrairDadosXmlCte(xmlContent: string): ExtractedCteData {
  if (!xmlContent || !xmlContent.trim()) {
    throw new FiscalExtractionError('Conteúdo XML de CT-e vazio.', 'CTE_XML_VAZIO', 400);
  }

  const valid = XMLValidator.validate(xmlContent);
  if (valid !== true) {
    throw new FiscalExtractionError(
      `XML de CT-e malformado: ${valid.err?.msg || 'estrutura inválida'}.`,
      'CTE_XML_INVALIDO',
      400
    );
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
    removeNSPrefix: true,
  });

  const parsed = parser.parse(xmlContent);
  const cteProc = parsed?.cteProc || parsed?.procCTe;
  const cteNode = cteProc?.CTe || parsed?.CTe || parsed;
  const infCte = cteNode?.infCte || parsed?.infCte;

  if (!infCte || !infCte.ide) {
    throw new FiscalExtractionError(
      'Documento XML não corresponde a um CT-e válido (nó <infCte> ausente).',
      'NAO_E_CTE',
      400
    );
  }

  const ide = infCte.ide;
  const modelo = strVal(ide.mod || '57');
  if (modelo && modelo !== '57') {
    throw new FiscalExtractionError(
      `Documento modelo ${modelo} rejeitado no extrator de CT-e (esperado modelo 57).`,
      'MODELO_NAO_CTE',
      400
    );
  }

  const idAttr = strVal(infCte['@_Id']).replace(/^CTe/i, '').replace(/\D/g, '');
  const protChave = strVal(cteProc?.protCTe?.infProt?.chCTe).replace(/\D/g, '');
  const chaveAcesso = protChave || idAttr;

  const emitente = extrairParticipante(infCte.emit, 'enderEmit') || {};
  const remetente = extrairParticipante(infCte.rem, 'enderReme');
  const expedidor = extrairParticipante(infCte.exped, 'enderExped');
  const recebedor = extrairParticipante(infCte.receb, 'enderReceb');
  const destinatario = extrairParticipante(infCte.dest, 'enderDest');

  // Resolução determinística do tomador (toma3/toma03 vs toma4)
  const toma3 = ide.toma3 || ide.toma03;
  const toma4 = ide.toma4;
  let indicador: IndicadorTomadorCte | '' = '';
  let cnpjTomador = '';
  let cpfTomador: string | undefined;
  let nomeTomador: string | undefined;
  let ufTomador: string | undefined;

  if (toma4 && typeof toma4 === 'object') {
    indicador = '4';
    cnpjTomador = sanitizarCnpj(strVal(toma4.CNPJ));
    cpfTomador = strVal(toma4.CPF).replace(/\D/g, '') || undefined;
    nomeTomador = strVal(toma4.xNome) || undefined;
    ufTomador = strVal(toma4.enderToma?.UF) || undefined;
  } else if (toma3 && typeof toma3 === 'object') {
    const t = strVal(toma3.toma);
    if (t === '0' || t === '1' || t === '2' || t === '3') {
      indicador = t;
    }
    const mapa: Record<string, ParticipanteCte | undefined> = {
      '0': remetente,
      '1': expedidor,
      '2': recebedor,
      '3': destinatario,
    };
    const part = mapa[indicador];
    cnpjTomador = sanitizarCnpj(part?.cnpj || '');
    cpfTomador = part?.cpf;
    nomeTomador = part?.nome;
    ufTomador = part?.uf;
  }

  const vPrestNode = infCte.vPrest || {};
  const componentes = asArray(vPrestNode.Comp).map((comp: any) => ({
    nome: strVal(comp?.xNome || 'Frete'),
    valor: new DecimalHalfEven(numVal(comp?.vComp)).toDecimalPlaces(2).toNumber(),
  }));

  const vTPrest = new DecimalHalfEven(numVal(vPrestNode.vTPrest)).toDecimalPlaces(2).toNumber();
  const vRec = new DecimalHalfEven(numVal(vPrestNode.vRec || vPrestNode.vTPrest)).toDecimalPlaces(2).toNumber();

  const icms = extrairBlocoIcmsCte(infCte.imp?.ICMS);
  const vTotTrib = numVal(infCte.imp?.vTotTrib);
  if (vTotTrib > 0) icms.vTotTrib = vTotTrib;

  const infCTeNorm = infCte.infCTeNorm || {};
  const chavesNfeVinculadas = Array.from(
    new Set(
      asArray(infCTeNorm.infDoc?.infNFe)
        .map((n: any) => strVal(n?.chave).replace(/\D/g, ''))
        .filter((k) => k.length === 44)
    )
  );

  let pesoBrutoKg: number | undefined;
  const infQs = asArray(infCTeNorm.infCarga?.infQ);
  for (const q of infQs) {
    const cUnid = strVal(q?.cUnid);
    const tpMed = strVal(q?.tpMed).toUpperCase();
    if (cUnid === '01' || tpMed.includes('PESO BRUTO') || tpMed === 'KG') {
      pesoBrutoKg = numVal(q?.qCarga);
      break;
    }
  }
  const vCarga = numVal(infCTeNorm.infCarga?.vCarga);

  return {
    tipoDocumento: 'CTE_XML',
    chaveAcesso,
    numero: strVal(ide.nCT),
    serie: strVal(ide.serie),
    modelo,
    dataEmissao: strVal(ide.dhEmi) || undefined,
    ufInicio: strVal(ide.UFIni || emitente.uf || ''),
    ufFim: strVal(ide.UFFim || destinatario?.uf || ''),
    cfop: strVal(ide.CFOP) || undefined,
    modal: strVal(ide.modal) || undefined,
    emitente,
    remetente,
    expedidor,
    recebedor,
    destinatario,
    tomador: {
      indicador,
      tipo: mapearTipoTomador(indicador),
      cnpj: cnpjTomador,
      cpf: cpfTomador,
      nome: nomeTomador,
      uf: ufTomador,
    },
    valores: {
      vTPrest,
      vRec,
      componentes,
    },
    icms,
    carga: vCarga > 0 || pesoBrutoKg ? { vCarga: vCarga || undefined, pesoBrutoKg } : undefined,
    chavesNfeVinculadas,
  };
}

/**
 * Verifica se a empresa ativa é a tomadora pagante do frete FOB no CT-e.
 * Aceita explicitamente `toma3 = 3` (Destinatário) ou `toma4` (Outros com CNPJ da empresa).
 * Frete CIF (`toma3 = 0` Remetente) ou CNPJ divergente bloqueia incorporação como frete FOB de entrada.
 */
export function verificarEmpresaTomadoraCte(
  cte: ExtractedCteData,
  cnpjEmpresaAtiva?: string
): VerificacaoTomadorCteResult {
  const cnpjEmpresa = sanitizarCnpj(cnpjEmpresaAtiva || '');
  const cnpjTomador = sanitizarCnpj(cte.tomador.cnpj || '');
  const ind = cte.tomador.indicador;
  const tipo = cte.tomador.tipo;

  if (ind === '0') {
    return {
      ehTomadora: Boolean(cnpjEmpresa && cnpjTomador && cnpjEmpresa === cnpjTomador),
      ehTomadoraNaAquisicaoFob: false,
      modalFobConfirmado: false,
      cnpjTomador,
      cnpjEmpresaAtiva: cnpjEmpresa,
      tipoTomador: tipo,
      indicadorTomador: ind,
      motivo:
        'CT-e com tomador Remetente (toma3=0 / modalidade CIF): frete arcado pelo fornecedor, não deve ser somado como custo FOB adicional na entrada.',
    };
  }

  if (!cnpjEmpresa) {
    const tomadorAdquirente = ind === '3' || ind === '4' || ind === '2';
    return {
      ehTomadora: tomadorAdquirente,
      ehTomadoraNaAquisicaoFob: tomadorAdquirente,
      modalFobConfirmado: tomadorAdquirente,
      cnpjTomador,
      cnpjEmpresaAtiva: '',
      tipoTomador: tipo,
      indicadorTomador: ind,
      motivo: tomadorAdquirente
        ? `Tomador ${tipo} (toma=${ind}) identificado no CT-e, porém sem CNPJ da empresa ativa selecionado para confrontação completa.`
        : 'Tomador do CT-e não identificado como destinatário/adquirente.',
    };
  }

  if (!cnpjTomador || cnpjTomador !== cnpjEmpresa) {
    return {
      ehTomadora: false,
      ehTomadoraNaAquisicaoFob: false,
      modalFobConfirmado: false,
      cnpjTomador,
      cnpjEmpresaAtiva: cnpjEmpresa,
      tipoTomador: tipo,
      indicadorTomador: ind,
      motivo: `CNPJ do tomador do CT-e (${cnpjTomador || 'não informado'}) diverge da empresa ativa (${cnpjEmpresa}); rateio FOB bloqueado para evitar duplicidade ou apropriação indevida.`,
    };
  }

  const modalFobConfirmado = ind === '3' || ind === '4' || ind === '2';
  return {
    ehTomadora: true,
    ehTomadoraNaAquisicaoFob: modalFobConfirmado,
    modalFobConfirmado,
    cnpjTomador,
    cnpjEmpresaAtiva: cnpjEmpresa,
    tipoTomador: tipo,
    indicadorTomador: ind,
    motivo: `Empresa ativa (${cnpjEmpresa}) confirmada como tomadora ${tipo} (toma=${ind}) do frete FOB no CT-e nº ${cte.numero || 's/n'}.`,
  };
}

export interface OpcoesRateioCte {
  cnpjEmpresaAtiva?: string;
  chaveNfe?: string;
  criterio?: 'valor' | 'peso' | 'auto';
  exigirVinculoChaveNfe?: boolean;
}

/**
 * Rateia o valor do CT-e FOB (`vTPrest` e `vICMS`) proporcionalmente entre os itens da NF-e
 * usando aritmética DecimalHalfEven e ajuste exato dos centavos residuais no último item ativo.
 */
export function ratearCteSobreItensNfe(
  itens: Pick<ExtractedItem, 'index' | 'cProd' | 'vProd' | 'qCom' | 'pesoBruto'>[],
  cte: ExtractedCteData,
  opcoes: OpcoesRateioCte = {}
): RateioCteSobreItensResult {
  const verificacaoTomador = verificarEmpresaTomadoraCte(cte, opcoes.cnpjEmpresaAtiva);
  const vTPrestTotal = new DecimalHalfEven(cte.valores.vTPrest || 0).toDecimalPlaces(2);
  const vIcmsCteTotal = new DecimalHalfEven(cte.icms.vICMS || 0).toDecimalPlaces(2);

  const zeroRateios = (): ItemRateioCteResult[] =>
    itens.map((item) => ({
      index: item.index,
      cProd: item.cProd,
      proporcaoPct: 0,
      baseRateio: 0,
      vFreteCte: 0,
      freteCteUnitario: 0,
      vIcmsCte: 0,
    }));

  const chaveNfeNorm = strVal(opcoes.chaveNfe).replace(/\D/g, '');
  let chaveNfeCompativel = true;
  let alertaVinculo: string | undefined;
  if (chaveNfeNorm && cte.chavesNfeVinculadas.length > 0) {
    chaveNfeCompativel = cte.chavesNfeVinculadas.includes(chaveNfeNorm);
    if (!chaveNfeCompativel) {
      alertaVinculo = `A chave da NF-e (${chaveNfeNorm}) não consta nas chaves vinculadas do CT-e (${cte.chavesNfeVinculadas.join(', ')}).`;
    }
  }

  if (!verificacaoTomador.ehTomadoraNaAquisicaoFob) {
    return {
      aplicado: false,
      chaveCte: cte.chaveAcesso,
      criterioUtilizado: 'valor',
      verificacaoTomador,
      chaveNfeCompativel,
      alertaVinculo,
      motivoBloqueio: verificacaoTomador.motivo,
      vTPrestTotal: vTPrestTotal.toNumber(),
      vIcmsCteTotal: vIcmsCteTotal.toNumber(),
      somaRateadaFrete: 0,
      somaRateadaIcms: 0,
      diferencaCentavosFrete: 0,
      diferencaCentavosIcms: 0,
      conferidoCentavos: true,
      rateios: zeroRateios(),
    };
  }

  if (opcoes.exigirVinculoChaveNfe && !chaveNfeCompativel) {
    return {
      aplicado: false,
      chaveCte: cte.chaveAcesso,
      criterioUtilizado: 'valor',
      verificacaoTomador,
      chaveNfeCompativel: false,
      alertaVinculo,
      motivoBloqueio: alertaVinculo,
      vTPrestTotal: vTPrestTotal.toNumber(),
      vIcmsCteTotal: vIcmsCteTotal.toNumber(),
      somaRateadaFrete: 0,
      somaRateadaIcms: 0,
      diferencaCentavosFrete: 0,
      diferencaCentavosIcms: 0,
      conferidoCentavos: true,
      rateios: zeroRateios(),
    };
  }

  if (itens.length === 0 || vTPrestTotal.lte(0)) {
    return {
      aplicado: false,
      chaveCte: cte.chaveAcesso,
      criterioUtilizado: 'valor',
      verificacaoTomador,
      chaveNfeCompativel,
      alertaVinculo,
      motivoBloqueio: itens.length === 0 ? 'Nenhum item na NF-e para rateio.' : 'CT-e sem valor de prestação positivo.',
      vTPrestTotal: vTPrestTotal.toNumber(),
      vIcmsCteTotal: vIcmsCteTotal.toNumber(),
      somaRateadaFrete: 0,
      somaRateadaIcms: 0,
      diferencaCentavosFrete: 0,
      diferencaCentavosIcms: 0,
      conferidoCentavos: true,
      rateios: zeroRateios(),
    };
  }

  const todosTemPeso = itens.length > 0 && itens.every((it) => Number(it.pesoBruto || 0) > 0);
  const criterioOpt = opcoes.criterio || 'auto';
  const criterioUtilizado: 'valor' | 'peso' =
    criterioOpt === 'peso' || (criterioOpt === 'auto' && todosTemPeso)
      ? 'peso'
      : 'valor';

  const bases = itens.map((it) =>
    criterioUtilizado === 'peso'
      ? Math.max(0, Number(it.pesoBruto || 0))
      : Math.max(0, Number(it.vProd || 0))
  );
  const totalBaseDec = bases.reduce(
    (acc, b) => acc.plus(new DecimalHalfEven(b)),
    new DecimalHalfEven(0)
  );

  if (totalBaseDec.lte(0)) {
    return {
      aplicado: false,
      chaveCte: cte.chaveAcesso,
      criterioUtilizado,
      verificacaoTomador,
      chaveNfeCompativel,
      alertaVinculo,
      motivoBloqueio: `Base de rateio (${criterioUtilizado}) zerada para os itens da NF-e.`,
      vTPrestTotal: vTPrestTotal.toNumber(),
      vIcmsCteTotal: vIcmsCteTotal.toNumber(),
      somaRateadaFrete: 0,
      somaRateadaIcms: 0,
      diferencaCentavosFrete: 0,
      diferencaCentavosIcms: 0,
      conferidoCentavos: true,
      rateios: zeroRateios(),
    };
  }

  let lastActiveIdx = -1;
  for (let i = bases.length - 1; i >= 0; i--) {
    if (bases[i] > 0) {
      lastActiveIdx = i;
      break;
    }
  }

  let acumFrete = new DecimalHalfEven(0);
  let acumIcms = new DecimalHalfEven(0);
  const rateios: ItemRateioCteResult[] = [];

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const base = bases[i];
    if (base <= 0) {
      rateios.push({
        index: it.index,
        cProd: it.cProd,
        proporcaoPct: 0,
        baseRateio: 0,
        vFreteCte: 0,
        freteCteUnitario: 0,
        vIcmsCte: 0,
      });
      continue;
    }

    const frac = new DecimalHalfEven(base).div(totalBaseDec);
    const freteItem =
      i === lastActiveIdx
        ? vTPrestTotal.minus(acumFrete).toDecimalPlaces(2)
        : vTPrestTotal.mul(frac).toDecimalPlaces(2);
    const icmsItem =
      i === lastActiveIdx
        ? vIcmsCteTotal.minus(acumIcms).toDecimalPlaces(2)
        : vIcmsCteTotal.mul(frac).toDecimalPlaces(2);

    if (i !== lastActiveIdx) {
      acumFrete = acumFrete.plus(freteItem);
      acumIcms = acumIcms.plus(icmsItem);
    }

    const qCom = it.qCom > 0 ? it.qCom : 1;
    const freteCteUnitario = freteItem.div(qCom).toDecimalPlaces(4).toNumber();

    rateios.push({
      index: it.index,
      cProd: it.cProd,
      proporcaoPct: frac.mul(100).toDecimalPlaces(4).toNumber(),
      baseRateio: base,
      vFreteCte: freteItem.toNumber(),
      freteCteUnitario,
      vIcmsCte: icmsItem.toNumber(),
    });
  }

  const somaRateadaFrete = new DecimalHalfEven(
    somarDecimaisRfb(rateios.map((r) => r.vFreteCte))
  ).toDecimalPlaces(2);
  const somaRateadaIcms = new DecimalHalfEven(
    somarDecimaisRfb(rateios.map((r) => r.vIcmsCte))
  ).toDecimalPlaces(2);
  const diffFrete = vTPrestTotal.minus(somaRateadaFrete).abs().toNumber();
  const diffIcms = vIcmsCteTotal.minus(somaRateadaIcms).abs().toNumber();

  return {
    aplicado: true,
    chaveCte: cte.chaveAcesso,
    criterioUtilizado,
    verificacaoTomador,
    chaveNfeCompativel,
    alertaVinculo,
    vTPrestTotal: vTPrestTotal.toNumber(),
    vIcmsCteTotal: vIcmsCteTotal.toNumber(),
    somaRateadaFrete: somaRateadaFrete.toNumber(),
    somaRateadaIcms: somaRateadaIcms.toNumber(),
    diferencaCentavosFrete: diffFrete,
    diferencaCentavosIcms: diffIcms,
    conferidoCentavos: diffFrete === 0 && diffIcms === 0,
    rateios,
  };
}
