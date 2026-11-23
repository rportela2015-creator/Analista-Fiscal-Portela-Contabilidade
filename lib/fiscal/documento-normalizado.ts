/**
 * Contrato Canônico de Documento Fiscal Normalizado
 *
 * Modelo agnóstico e independente de formato XML (compatível com NF-e, NFC-e, CT-e e SPED),
 * fornecendo dupla representação (string fixa decimal para mensageria/JSON com precisão RTC
 * e número flutuante para exibições e cálculos locais).
 */

import { createHash } from 'node:crypto';
import {
  arredondarMoedaRfb,
  arredondarMoedaRfbNum,
  arredondarAliquotaRfb,
  somarDecimaisRfb,
} from '../math/decimal-fiscal';
import {
  classificarCreditosItemEntrada,
  type ClassificacaoTripartidaCreditos,
  type RegimeAdquirente,
  type DestinacaoItem,
  type StatusExtincaoDebitoFornecedor,
} from './credito-tributario';
import type { ExtractedInvoiceData, ExtractedItem } from '../extrator-nfe-types';

export interface ValorDecimalDual {
  str: string; // Formato fixo "0.00" para JSON/interoperabilidade com Java/Go (ADR003)
  num: number; // Formato numérico para operações no frontend
}

export interface PerfilAdquirenteNormalizacao {
  regime: RegimeAdquirente;
  tipoEstabelecimento?: 'comercio' | 'industria';
  destinacaoPadrao?: DestinacaoItem;
  uf?: string;
  statusExtincaoRtcPadrao?: StatusExtincaoDebitoFornecedor;
}

export interface ItemFiscalNormalizado {
  index: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string;
  cfop: string;
  uCom: string;
  quantidade: ValorDecimalDual;
  valorUnitario: ValorDecimalDual;
  valorBruto: ValorDecimalDual;
  desconto: ValorDecimalDual;
  freteSeguroOutros: ValorDecimalDual;
  tributosDestacadosXml: {
    icms: ValorDecimalDual;
    icmsSt: ValorDecimalDual;
    ipi: ValorDecimalDual;
    ii: ValorDecimalDual;
    pis: ValorDecimalDual;
    cofins: ValorDecimalDual;
    ibs: ValorDecimalDual;
    cbs: ValorDecimalDual;
    is: ValorDecimalDual;
    credSn: ValorDecimalDual;
  };
  creditosTripartidos: ClassificacaoTripartidaCreditos;
}

export interface DocumentoFiscalNormalizado {
  sha256: string;
  tipoDocumento: string;
  chaveAcesso?: string;
  numero?: string;
  serie?: string;
  dataEmissao?: string;
  naturezaOperacao?: string;
  modelo?: string;
  emitente: {
    documento: string; // CNPJ ou CPF
    nome: string;
    uf: string;
    municipio?: string;
    crt: string;
  };
  adquirente: {
    documento: string;
    nome: string;
    uf: string;
    municipio?: string;
    regime: RegimeAdquirente;
  };
  itens: ItemFiscalNormalizado[];
  totais: {
    valorProdutos: ValorDecimalDual;
    valorTotalNota: ValorDecimalDual;
    totalIcms: ValorDecimalDual;
    totalIcmsSt: ValorDecimalDual;
    totalIpi: ValorDecimalDual;
    totalPis: ValorDecimalDual;
    totalCofins: ValorDecimalDual;
    totalIbs: ValorDecimalDual;
    totalCbs: ValorDecimalDual;
    totalIs: ValorDecimalDual;
    totalCreditoEfetivadoCmv: ValorDecimalDual;
  };
  dataProcessamentoIso: string;
}

function criarValorDecimalDual(valor: string | number, casas: number = 2): ValorDecimalDual {
  const str = casas === 2 ? arredondarMoedaRfb(valor) : arredondarAliquotaRfb(valor, casas);
  return {
    str,
    num: Number(str),
  };
}

/**
 * Normaliza qualquer saída bruta da extração de NF-e para a estrutura canônica independente.
 */
export function normalizarExtracaoNfe(
  extracao: ExtractedInvoiceData,
  perfilAdquirente: PerfilAdquirenteNormalizacao
): DocumentoFiscalNormalizado {
  // Geração do SHA-256 do documento para auditoria e rastreabilidade imutável
  const payloadParaHash =
    extracao.identificacao?.chaveAcesso ||
    `${extracao.emitente?.cnpj || ''}-${extracao.identificacao?.numero || ''}-${extracao.identificacao?.serie || ''}-${extracao.identificacao?.dataEmissao || ''}`;
  const sha256 = createHash('sha256').update(payloadParaHash).digest('hex');

  const destinacaoPadrao = perfilAdquirente.destinacaoPadrao || 'comercializacao';
  const ehIndustria = perfilAdquirente.tipoEstabelecimento === 'industria';

  const itensNormalizados: ItemFiscalNormalizado[] = (extracao.itens || []).map((it, idx) => {
    const t = it.tributos || {};
    const vFrete = it.vFrete ?? 0;
    const vSeg = it.vSeg ?? 0;
    const vOutro = it.vOutro ?? 0;
    const vDesc = it.vDesc ?? 0;

    const temSt =
      (t.vICMSST ?? 0) > 0 ||
      ['10', '30', '60', '70'].includes(t.cstIcms || '') ||
      ['201', '202', '203', '500'].includes(t.csosn || '');

    // Classificação Tripartida dos Créditos
    const creditosTripartidos = classificarCreditosItemEntrada({
      vProd: it.vProd || 0,
      vFrete,
      vSeg,
      vOutro,
      vDesc,
      vIPI: t.vIPI ?? 0,
      vICMS: t.vICMS ?? 0,
      vICMSST: t.vICMSST ?? 0,
      vPIS: t.vPIS ?? 0,
      vCOFINS: t.vCOFINS ?? 0,
      vIBS: t.vIBS ?? 0,
      vCBS: t.vCBS ?? 0,
      vCredICMSSN: t.vCredICMSSN ?? 0,
      pCredSN: t.pCredSN,
      crtEmitente: it.crtEmitente || extracao.emitente?.crt,
      regimeAdquirente: perfilAdquirente.regime,
      destinacao: destinacaoPadrao,
      ehIndustria,
      temSt,
      statusExtincaoFornecedor: perfilAdquirente.statusExtincaoRtcPadrao,
    });

    return {
      index: it.index ?? idx + 1,
      codigo: it.cProd || `ITEM-${idx + 1}`,
      descricao: it.xProd,
      ncm: it.ncm,
      cest: it.cest,
      cfop: it.cfop,
      uCom: it.uCom || 'UN',
      quantidade: criarValorDecimalDual(it.qCom > 0 ? it.qCom : 1, 4),
      valorUnitario: criarValorDecimalDual(it.vUnCom || 0, 4),
      valorBruto: criarValorDecimalDual(it.vProd || 0),
      desconto: criarValorDecimalDual(vDesc),
      freteSeguroOutros: criarValorDecimalDual(vFrete + vSeg + vOutro),
      tributosDestacadosXml: {
        icms: criarValorDecimalDual(t.vICMS ?? 0),
        icmsSt: criarValorDecimalDual(t.vICMSST ?? 0),
        ipi: criarValorDecimalDual(t.vIPI ?? 0),
        ii: criarValorDecimalDual(t.vII ?? 0),
        pis: criarValorDecimalDual(t.vPIS ?? 0),
        cofins: criarValorDecimalDual(t.vCOFINS ?? 0),
        ibs: criarValorDecimalDual(t.vIBS ?? 0),
        cbs: criarValorDecimalDual(t.vCBS ?? 0),
        is: criarValorDecimalDual(t.vIS ?? 0),
        credSn: criarValorDecimalDual(t.vCredICMSSN ?? 0),
      },
      creditosTripartidos,
    };
  });

  // Fechamento de Totais com soma decimal exata (ADR003)
  const totalProdutosStr = somarDecimaisRfb(itensNormalizados.map((i) => i.valorBruto.str));
  const totalIcmsStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.icms.str));
  const totalIcmsStStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.icmsSt.str));
  const totalIpiStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.ipi.str));
  const totalPisStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.pis.str));
  const totalCofinsStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.cofins.str));
  const totalIbsStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.ibs.str));
  const totalCbsStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.cbs.str));
  const totalIsStr = somarDecimaisRfb(itensNormalizados.map((i) => i.tributosDestacadosXml.is.str));
  const totalCredEfetivadoStr = somarDecimaisRfb(itensNormalizados.map((i) => i.creditosTripartidos.creditoEfetivadoCusto.total));

  const totalNotaCalculado = somarDecimaisRfb([
    totalProdutosStr,
    somarDecimaisRfb(itensNormalizados.map((i) => i.freteSeguroOutros.str)),
    totalIpiStr,
    totalIcmsStStr,
    totalIsStr,
    // Menos descontos
    `-${somarDecimaisRfb(itensNormalizados.map((i) => i.desconto.str))}`,
  ]);

  return {
    sha256,
    tipoDocumento: extracao.tipoDocumento,
    chaveAcesso: extracao.identificacao?.chaveAcesso,
    numero: extracao.identificacao?.numero,
    serie: extracao.identificacao?.serie,
    dataEmissao: extracao.identificacao?.dataEmissao,
    naturezaOperacao: extracao.identificacao?.naturezaOperacao,
    modelo: extracao.identificacao?.modelo,
    emitente: {
      documento: extracao.emitente?.cnpj || extracao.emitente?.cpf || '',
      nome: extracao.emitente?.nome || '',
      uf: extracao.emitente?.uf || 'PR',
      municipio: extracao.emitente?.municipio,
      crt: extracao.emitente?.crt || '3',
    },
    adquirente: {
      documento: extracao.destinatario?.cnpj || extracao.destinatario?.cpf || '',
      nome: extracao.destinatario?.nome || '',
      uf: perfilAdquirente.uf || extracao.destinatario?.uf || 'PR',
      municipio: extracao.destinatario?.municipio,
      regime: perfilAdquirente.regime,
    },
    itens: itensNormalizados,
    totais: {
      valorProdutos: { str: totalProdutosStr, num: Number(totalProdutosStr) },
      valorTotalNota: { str: totalNotaCalculado, num: Number(totalNotaCalculado) },
      totalIcms: { str: totalIcmsStr, num: Number(totalIcmsStr) },
      totalIcmsSt: { str: totalIcmsStStr, num: Number(totalIcmsStStr) },
      totalIpi: { str: totalIpiStr, num: Number(totalIpiStr) },
      totalPis: { str: totalPisStr, num: Number(totalPisStr) },
      totalCofins: { str: totalCofinsStr, num: Number(totalCofinsStr) },
      totalIbs: { str: totalIbsStr, num: Number(totalIbsStr) },
      totalCbs: { str: totalCbsStr, num: Number(totalCbsStr) },
      totalIs: { str: totalIsStr, num: Number(totalIsStr) },
      totalCreditoEfetivadoCmv: { str: totalCredEfetivadoStr, num: Number(totalCredEfetivadoStr) },
    },
    dataProcessamentoIso: new Date().toISOString(),
  };
}
