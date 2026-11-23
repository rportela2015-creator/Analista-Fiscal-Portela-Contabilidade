import { randomUUID } from 'node:crypto';
import type { DocumentoFiscalNormalizado } from '../../fiscal/documento-normalizado';
import type { OperacaoInputRfb, ItemOperacaoInputRfb } from './schema';

/**
 * Converte um DocumentoFiscalNormalizado para o formato oficial OperacaoInput exigido pela Calculadora RTC.
 */
export function mapearDocumentoParaOperacaoRfb(
  doc: DocumentoFiscalNormalizado,
  opcoes?: {
    municipioPadraoIbge?: number;
    ufPadrao?: string;
    tpDoc?: number;
    aliquotasNominais2027?: { cbs: number; ibsEstadual: number; ibsMunicipal: number };
  }
): OperacaoInputRfb {
  const uf = (doc.adquirente.uf || opcoes?.ufPadrao || 'PR').toUpperCase();
  // Se município for número IBGE, usa; senão default para Curitiba (4106902) ou opção informada
  let municipio = opcoes?.municipioPadraoIbge ?? 4106902;
  if (doc.adquirente.municipio && /^\d{7}$/.test(doc.adquirente.municipio)) {
    municipio = parseInt(doc.adquirente.municipio, 10);
  }

  const dhFatoGerador = doc.dataEmissao
    ? (doc.dataEmissao.includes('T') ? doc.dataEmissao : `${doc.dataEmissao}T12:00:00-03:00`)
    : new Date().toISOString();

  const ano = parseInt(dhFatoGerador.slice(0, 4), 10);
  const exigeAliquotasNominais = ano >= 2027;

  const itens: ItemOperacaoInputRfb[] = doc.itens.map((item, idx) => {
    const rawNcm = item.ncm ? item.ncm.replace(/\D/g, '') : null;
    const ncmValido = rawNcm && rawNcm.length === 8 ? rawNcm : null;

    // Classificação provisória e CST para o item se não estiver preenchido
    const cst = '000';
    const cClassTrib = '000001';
    const baseCalculo = item.valorBruto.num - item.desconto.num;

    const itemRfb: ItemOperacaoInputRfb = {
      numero: item.index || idx + 1,
      ncm: ncmValido,
      cst,
      cClassTrib,
      baseCalculo: Math.max(0, baseCalculo),
      quantidade: item.quantidade.num > 0 ? item.quantidade.num : 1,
      unidade: item.uCom || 'UN',
    };

    if (exigeAliquotasNominais) {
      itemRfb.aliquotasNominais = opcoes?.aliquotasNominais2027 ?? {
        cbs: 8.8,
        ibsEstadual: 0.05,
        ibsMunicipal: 0.05,
      };
    }

    return itemRfb;
  });

  return {
    id: randomUUID().replace(/-/g, ''),
    versao: '1.0.0',
    dhFatoGerador,
    municipio,
    uf,
    tpDoc: opcoes?.tpDoc ?? 55,
    itens,
  };
}
