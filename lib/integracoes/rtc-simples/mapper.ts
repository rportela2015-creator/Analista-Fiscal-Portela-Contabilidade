import { randomUUID } from 'node:crypto';
import type { DocumentoFiscalNormalizado } from '../../fiscal/documento-normalizado';
import type {
  OperacaoSimplesNaoAssistidaInputRfb,
  ItemSimplesUnificadoInputRfb,
  AliquotasEfetivasInputRfb,
} from './schema';
import { arredondarMoedaRfb } from '../../math/decimal-fiscal';

/**
 * Converte um DocumentoFiscalNormalizado para a estrutura oficial OperacaoSimplesNaoAssistidaInput
 */
export function mapearDocumentoParaSimplesRfb(
  doc: DocumentoFiscalNormalizado,
  opcoes?: {
    tpDoc?: string;
    CRT?: string;
    aliquotasEfetivas?: AliquotasEfetivasInputRfb;
    cAtivSNPadrao?: string;
  }
): OperacaoSimplesNaoAssistidaInputRfb {
  const data = doc.dataEmissao
    ? doc.dataEmissao.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const tpDoc = opcoes?.tpDoc ?? (doc.modelo === '65' ? '65' : '55');
  const CRT = opcoes?.CRT ?? (doc.emitente.crt || '1');

  const aliquotasEfetivas: AliquotasEfetivasInputRfb = opcoes?.aliquotasEfetivas ?? {
    anexoI: {
      pCBSSN: '1.1612',
      pIBSSN: '0.0129',
    },
  };

  const itens: ItemSimplesUnificadoInputRfb[] = doc.itens.map((item, idx) => {
    const rawNcm = item.ncm ? item.ncm.replace(/\D/g, '') : null;
    const ncmValido = rawNcm && rawNcm.length === 8 ? rawNcm : undefined;
    const baseCalculo = arredondarMoedaRfb(item.valorBruto.num - item.desconto.num);

    return {
      numero: item.index || idx + 1,
      cAtivSN: opcoes?.cAtivSNPadrao ?? '01', // Atividade padrão 01 (comércio varejista)
      cClassTrib: '000001',
      ncm: ncmValido,
      baseCalculo,
      valorImpostoSeletivo: '0.00',
    };
  });

  return {
    id: randomUUID().replace(/-/g, ''),
    versao: '3.0.0',
    data,
    tpDoc,
    CRT,
    aliquotasEfetivas,
    itens,
  };
}
