/**
 * Extrator Determinístico de XML de NFS-e / DPS Padrão Nacional
 * Aderente às especificações da Receita Federal do Brasil (NT 004, NT 007, NT 008, NT 009)
 * e compatível com o gerador oficial DANFSe em Go.
 */

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type {
  TipoXmlFiscal,
  ExtracaoNfseNacional,
  EnderecoNfseNacional,
  PrestadorNfseNacional,
  TomadorNfseNacional,
  ServicoNfseNacional,
  ValoresNfseNacional,
  ReformaTributariaNfse,
} from './extrator-nfse-types';

/**
 * Detecta se o XML é uma NF-e de mercadorias (modelo 55/65),
 * uma NFS-e Padrão Nacional, uma DPS Padrão Nacional ou formato desconhecido.
 */
export function detectarTipoXmlFiscal(xmlContent: string): TipoXmlFiscal {
  if (!xmlContent || typeof xmlContent !== 'string') {
    return 'DESCONHECIDO';
  }

  const clean = xmlContent.trim();
  if (!clean.startsWith('<')) {
    return 'DESCONHECIDO';
  }

  // Checagem de NF-e (raiz <nfeProc> ou <NFe>)
  if (/<nfeProc\b/i.test(clean) || (/<NFe\b/i.test(clean) && !/<NFSe\b/i.test(clean))) {
    return 'NFE';
  }

  // Checagem de NFS-e Nacional (<NFSe>)
  if (/<NFSe\b/i.test(clean)) {
    return 'NFSE_NACIONAL';
  }

  // Checagem de DPS Nacional isolada (<DPS>)
  if (/<DPS\b/i.test(clean)) {
    return 'DPS_NACIONAL';
  }

  return 'DESCONHECIDO';
}

function parseNum(val: unknown, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const str = String(val).replace(',', '.').trim();
  const n = parseFloat(str);
  return isNaN(n) ? fallback : n;
}

function parseStr(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') return '';
  return String(val);
}

function parseOptionalStr(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'object') return undefined;
  return String(val);
}

function extrairEndereco(node: any): EnderecoNfseNacional | undefined {
  if (!node || typeof node !== 'object') return undefined;

  // Pode vir em enderNac, endNac, end ou direto
  const nac = node.enderNac || node.endNac || node.end?.endNac || (node.xLgr !== undefined ? node : undefined);
  const ext = node.enderExt || node.endExt || node.end?.endExt;

  if (!nac && !ext) return undefined;

  const alvo = nac || ext || {};

  return {
    xLgr: parseOptionalStr(alvo.xLgr),
    nro: parseOptionalStr(alvo.nro),
    xCpl: parseOptionalStr(alvo.xCpl),
    xBairro: parseOptionalStr(alvo.xBairro),
    cMun: parseOptionalStr(alvo.cMun),
    xMun: parseOptionalStr(alvo.xMun),
    uf: parseOptionalStr(alvo.UF || alvo.uf),
    cep: parseOptionalStr(alvo.CEP || alvo.cep),
    cPais: parseOptionalStr(alvo.cPais),
    xCidade: parseOptionalStr(alvo.xCidade),
  };
}

/**
 * Extrai deterministamente todos os campos estruturados de uma NFS-e ou DPS Padrão Nacional.
 */
export function extrairNfseNacionalXml(xmlContent: string): ExtracaoNfseNacional {
  if (!xmlContent || !xmlContent.trim()) {
    throw new Error('Conteúdo XML de NFS-e/DPS não pode ser vazio.');
  }

  // Trava anti-XXE
  if (/<!DOCTYPE/i.test(xmlContent) || /<!ENTITY/i.test(xmlContent)) {
    throw new Error('Segurança Fiscal: XML contém declaração DOCTYPE ou ENTITY potencialmente vulnerável a XXE');
  }

  const tipoDetectado = detectarTipoXmlFiscal(xmlContent);
  if (tipoDetectado !== 'NFSE_NACIONAL' && tipoDetectado !== 'DPS_NACIONAL') {
    throw new Error('O XML fornecido não foi identificado como NFS-e ou DPS Padrão Nacional válida.');
  }

  const sha256 = createHash('sha256').update(xmlContent).digest('hex');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false, // Crucial para auditoria: preserva tags vazias como ""
    parseTagValue: false,
  });

  const parsed = parser.parse(xmlContent);

  // Localiza nós principais
  const nfseNode = parsed.NFSe || parsed['nfe:NFSe'] || parsed.nfse;
  const infNFSe = nfseNode?.infNFSe || nfseNode;

  const dpsNode = infNFSe?.DPS || parsed.DPS || parsed['nfe:DPS'];
  const infDPS = dpsNode?.infDPS || dpsNode || {};

  // Versões
  const versaoLayout = parseOptionalStr(nfseNode?.['@_versao'] || infDPS?.['@_versao'] || parsed.DPS?.['@_versao']);
  const chNFSe = parseOptionalStr(infNFSe?.['@_Id'] || infNFSe?.Id)?.replace(/^NFS/i, '');
  const idDps = parseOptionalStr(infDPS?.['@_Id'] || infDPS?.Id)?.replace(/^DPS/i, '');

  const nNFSe = parseOptionalStr(infNFSe?.nNFSe);
  const nDPS = parseOptionalStr(infDPS?.nDPS);
  const serie = parseOptionalStr(infDPS?.serie);
  const dhEmi = parseStr(infDPS?.dhEmi || infNFSe?.dhProc || new Date().toISOString());
  const dCompet = parseStr(infDPS?.dCompet || dhEmi.slice(0, 10));
  const ambGer = parseOptionalStr(infNFSe?.ambGer || infDPS?.tpAmb);
  const tpEmit = infDPS?.tpEmit ? parseInt(String(infDPS.tpEmit), 10) : undefined;
  const verAplic = parseOptionalStr(infNFSe?.verAplic);

  // Detecção de notas técnicas
  const temNt004 = xmlContent.includes('<IBSCBS') || xmlContent.includes('<gIBSCBS') || xmlContent.includes('<cClassTrib');
  const temNt007 = xmlContent.includes('<tpRetPisCofins');
  const temNt008 = xmlContent.includes('<gLocacao') || xmlContent.includes('<gUnidImob') || xmlContent.includes('<cib>');
  const temNt009 = xmlContent.includes('<vAjusteBC') || temNt008;

  // Prestador (emit em infNFSe ou prest em infDPS)
  const emitNode = infNFSe?.emit || {};
  const prestNode = infDPS?.prest || {};

  const prestador: PrestadorNfseNacional = {
    cnpj: parseOptionalStr(emitNode.CNPJ || emitNode.cnpj || prestNode.CNPJ || prestNode.cnpj),
    cpf: parseOptionalStr(emitNode.CPF || emitNode.cpf || prestNode.CPF || prestNode.cpf),
    nif: parseOptionalStr(emitNode.NIF || prestNode.NIF),
    im: parseOptionalStr(emitNode.IM || prestNode.IM),
    xNome: parseOptionalStr(emitNode.xNome || emitNode.xFant || prestNode.xNome),
    xFant: parseOptionalStr(emitNode.xFant),
    fone: parseOptionalStr(emitNode.fone || prestNode.fone),
    email: parseOptionalStr(emitNode.email || prestNode.email),
    regimeTributario: prestNode.regTrib
      ? {
          opSimpNac: prestNode.regTrib.opSimpNac !== undefined ? parseInt(String(prestNode.regTrib.opSimpNac), 10) : undefined,
          regApTribSN: prestNode.regTrib.regApTribSN !== undefined ? parseInt(String(prestNode.regTrib.regApTribSN), 10) : undefined,
          regEspTrib: prestNode.regTrib.regEspTrib !== undefined ? parseInt(String(prestNode.regTrib.regEspTrib), 10) : undefined,
        }
      : undefined,
    endereco: extrairEndereco(emitNode) || extrairEndereco(prestNode),
  };

  // Tomador (toma em infDPS)
  const tomaNode = infDPS?.toma;
  let tomador: TomadorNfseNacional | undefined;
  if (tomaNode && typeof tomaNode === 'object') {
    tomador = {
      cnpj: parseOptionalStr(tomaNode.CNPJ || tomaNode.cnpj),
      cpf: parseOptionalStr(tomaNode.CPF || tomaNode.cpf),
      nif: parseOptionalStr(tomaNode.NIF),
      im: parseOptionalStr(tomaNode.IM),
      xNome: parseOptionalStr(tomaNode.xNome),
      fone: parseOptionalStr(tomaNode.fone),
      email: parseOptionalStr(tomaNode.email),
      endereco: extrairEndereco(tomaNode),
    };
  }

  // Intermediário (interm em infDPS)
  const intermNode = infDPS?.interm;
  let intermediario = undefined;
  if (intermNode && typeof intermNode === 'object') {
    intermediario = {
      cnpj: parseOptionalStr(intermNode.CNPJ),
      cpf: parseOptionalStr(intermNode.CPF),
      im: parseOptionalStr(intermNode.IM),
      xNome: parseOptionalStr(intermNode.xNome),
    };
  }

  // Serviço (serv em infDPS)
  const servNode = infDPS?.serv || {};
  const cServ = servNode.cServ || {};
  const locPrest = servNode.locPrest || {};
  const cTribNac = parseStr(cServ.cTribNac || servNode.cTribNac);
  const xDescServ = parseStr(cServ.xDescServ || servNode.xDescServ);
  const cNBS = parseOptionalStr(cServ.cNBS || servNode.cNBS);
  const cTribMun = parseOptionalStr(cServ.cTribMun || servNode.cTribMun);

  let subitemNovoFatoGeradorNt005: '99.02' | '99.03' | '99.04' | null = null;
  if (cTribNac.startsWith('99.02') || cTribNac.startsWith('9902')) {
    subitemNovoFatoGeradorNt005 = '99.02';
  } else if (cTribNac.startsWith('99.03') || cTribNac.startsWith('9903')) {
    subitemNovoFatoGeradorNt005 = '99.03';
  } else if (cTribNac.startsWith('99.04') || cTribNac.startsWith('9904')) {
    subitemNovoFatoGeradorNt005 = '99.04';
  }

  const servico: ServicoNfseNacional = {
    cTribNac,
    cTribMun,
    cNBS,
    xDescServ,
    cLocPrestacao: parseOptionalStr(locPrest.cLocPrestacao),
    xLocPrestacao: parseOptionalStr(locPrest.xLocPrestacao || infNFSe?.xLocPrestacao),
    ufPrestacao: parseOptionalStr(locPrest.UF || locPrest.uf),
    obra: servNode.obra
      ? {
          cObra: parseOptionalStr(servNode.obra.cObra),
          inscImobFisc: parseOptionalStr(servNode.obra.inscImobFisc),
        }
      : undefined,
    subitemNovoFatoGeradorNt005,
  };

  // Valores (Valores em infNFSe e ValoresDPS em infDPS.valores)
  const valNFSe = infNFSe?.valores || {};
  const valDPS = infDPS?.valores || {};
  const valServPrest = valDPS.vServPrest || {};
  const valDesc = valDPS.vDescCondIncond || {};
  const valDedRed = valDPS.vDedRed || {};
  const valTrib = valDPS.trib || {};
  const tribFed = valTrib.tribFed || {};
  const tribMun = valTrib.tribMun || {};
  const pisCofins = tribFed.piscofins || tribFed.pisCofins || {};

  const vServ = parseNum(valServPrest.vServ ?? valNFSe.vServ ?? valDPS.vServ);
  const vDescIncond = parseNum(valDesc.vDescIncond);
  const vDescCond = parseNum(valDesc.vDescCond);
  const vDedRed = parseNum(valDedRed.vDR ?? valDedRed.vDedRed);
  const vBC = parseNum(valNFSe.vBC ?? valDPS.vBC ?? vServ - vDescIncond - vDedRed);
  const pAliqAplic = valNFSe.pAliqAplic !== undefined ? parseNum(valNFSe.pAliqAplic) : undefined;
  const vISSQN = parseNum(valNFSe.vISSQN ?? tribMun.vISSQN);
  const vRetIRRF = parseNum(tribFed.vRetIRRF);
  const vRetCP = parseNum(tribFed.vRetCP);
  const vRetCSLL = parseNum(tribFed.vRetCSLL);
  const vPIS = parseNum(pisCofins.vPis ?? pisCofins.vPIS ?? tribFed.vPIS);
  const vCOFINS = parseNum(pisCofins.vCofins ?? pisCofins.vCOFINS ?? tribFed.vCOFINS);
  const tpRetPisCofins = pisCofins.tpRetPisCofins !== undefined ? parseInt(String(pisCofins.tpRetPisCofins), 10) : undefined;
  const vLiq = parseNum(valNFSe.vLiq ?? vServ - vDescIncond - vISSQN - vRetIRRF - vRetCP - vRetCSLL - vPIS - vCOFINS);

  const valores: ValoresNfseNacional = {
    vServ,
    vDescIncond,
    vDescCond,
    vDedRed,
    vBC,
    pAliqAplic,
    vISSQN,
    vRetIRRF,
    vRetCP,
    vRetCSLL,
    vPIS,
    vCOFINS,
    tpRetPisCofins,
    vLiq,
    vCalcBM: parseNum(valNFSe.vCalcBM),
    tpBM: valNFSe.tpBM ? parseInt(String(valNFSe.tpBM), 10) : undefined,
    vTotalRet: parseNum(valNFSe.vTotalRet),
  };

  // Reforma Tributária (IBS/CBS)
  const ibsCbsNFSe = infNFSe?.IBSCBS;
  const ibsCbsDPS = infDPS?.IBSCBS;
  const ibsCbsAlvo = ibsCbsNFSe || ibsCbsDPS;

  let reformaTributaria: ReformaTributariaNfse | undefined;
  if (ibsCbsAlvo && typeof ibsCbsAlvo === 'object') {
    const tribIbs = ibsCbsAlvo.valores?.trib?.gIBSCBS || ibsCbsDPS?.valores?.trib?.gIBSCBS || {};
    const respValores = ibsCbsNFSe?.valores || {};
    const totCIBS = ibsCbsNFSe?.totCIBS || {};
    const gIbsTot = totCIBS.gIBS || {};
    const gCbsTot = totCIBS.gCBS || {};

    const cst = parseOptionalStr(tribIbs.CST || ibsCbsAlvo.CST);
    const cClassTrib = parseOptionalStr(tribIbs.cClassTrib || ibsCbsAlvo.cClassTrib);
    const rtcBc = parseNum(respValores.vBC ?? ibsCbsAlvo.vBC ?? vBC);
    const pIbsUf = parseNum(respValores.uf?.pIBSUF ?? respValores.uf?.pAliqEfetUF);
    const vIbsUf = parseNum(gIbsTot.gIBSUFTot?.vIBSUF);
    const pIbsMun = parseNum(respValores.mun?.pIBSMun ?? respValores.mun?.pAliqEfetMun);
    const vIbsMun = parseNum(gIbsTot.gIBSMunTot?.vIBSMun);
    const vIbsTot = parseNum(gIbsTot.vIBSTot ?? (vIbsUf + vIbsMun));
    const pCbs = parseNum(respValores.fed?.pCBS ?? respValores.fed?.pAliqEfetCBS);
    const vCbs = parseNum(gCbsTot.vCBS);
    const pRedAliqIbs = parseNum(respValores.uf?.pRedAliqUF ?? respValores.mun?.pRedAliqMun);
    const pRedAliqCbs = parseNum(respValores.fed?.pRedAliqCBS);

    // CIB / Imóvel (Art. 265 LC 214/2025)
    const imovelNode = ibsCbsDPS?.imovel || ibsCbsNFSe?.imovel || servNode.obra || {};
    const gLocacao = ibsCbsDPS?.gLocacao || ibsCbsNFSe?.gLocacao;
    const gUnidImob = ibsCbsDPS?.gUnidImob || ibsCbsNFSe?.gUnidImob;

    const cib = parseOptionalStr(
      gLocacao?.cib ||
      gUnidImob?.cib ||
      ibsCbsDPS?.cib ||
      ibsCbsNFSe?.cib ||
      ibsCbsAlvo.cib ||
      imovelNode.cib ||
      imovelNode.inscImobFisc
    );

    reformaTributaria = {
      presente: true,
      cst,
      cClassTrib,
      vBC: rtcBc,
      pIBSUF: pIbsUf,
      vIBSUF: vIbsUf,
      pIBSMun: pIbsMun,
      vIBSMun: vIbsMun,
      vIBS: vIbsTot,
      pCBS: pCbs,
      vCBS: vCbs,
      pRedAliqIBS: pRedAliqIbs,
      pRedAliqCBS: pRedAliqCbs,
      cib,
      inscImobFisc: parseOptionalStr(imovelNode.inscImobFisc),
      gLocacao: gLocacao ? { cib: parseOptionalStr(gLocacao.cib), nContrato: parseOptionalStr(gLocacao.nContrato) } : undefined,
      gUnidImob: gUnidImob ? { cib: parseOptionalStr(gUnidImob.cib) } : undefined,
    };
  }

  // Totais de Tributos
  const totTribNode = valTrib.totTrib || {};
  const vTotTrib = totTribNode.vTotTrib || {};
  const vTotFed = parseNum(vTotTrib.vTotTribFed ?? (vPIS + vCOFINS + vRetIRRF + vRetCSLL + vRetCP));
  const vTotMun = parseNum(vTotTrib.vTotTribMun ?? vISSQN);
  const vTotEst = parseNum(vTotTrib.vTotTribEst ?? (reformaTributaria?.vIBSUF ?? 0));

  return {
    tipoDocumento: tipoDetectado,
    sha256,
    versaoLayout,
    identificacao: {
      chNFSe,
      idDps,
      nNFSe,
      nDPS,
      serie,
      dhEmi,
      dCompet,
      ambGer,
      tpEmit,
      verAplic,
      temNt004,
      temNt007,
      temNt008,
      temNt009,
    },
    prestador,
    tomador,
    intermediario,
    servico,
    valores,
    reformaTributaria,
    totaisTributos: {
      federais: vTotFed,
      estaduais: vTotEst,
      municipais: vTotMun,
      total: vTotFed + vTotEst + vTotMun,
    },
    rawXml: xmlContent,
  };
}
