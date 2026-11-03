import type { Record8 } from '@/lib/data';
import { validarNcmIA } from './validar';

type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA';
const CONFIANCAS: readonly string[] = ['ALTA', 'MEDIA', 'BAIXA'];

export interface ItemAuditoria {
  cProd?: string | number;
  ncm?: string | null;
  confianca?: string;
  ncmValidado?: boolean;
  [campo: string]: unknown;
}

/** Itens originais do XML, indexados por cProd (ver parser em auditoria-entrada). */
export type ItensOriginais = Record<string, { NCM?: string | number | null; [campo: string]: unknown }>;

/**
 * Reconcilia os itens devolvidos pela IA com a tabela oficial. Função PURA (não muta a entrada).
 *
 * Regras:
 *  1. XML manda: se o item veio de um XML, o NCM do XML (por cProd) substitui o do modelo,
 *     sempre. Nunca é apagado nem trocado pelo modelo.
 *  2. Todo NCM final passa por validarNcmIA, e a confiança do MODELO é repassada.
 *  3. Válido  => ncmValidado:true, confiança do modelo preservada (MEDIA só se ausente/inválida).
 *     Inválido => ncmValidado:false, confiança BAIXA (o NCM é mantido para o usuário ver).
 */
export function reconciliarItens<T extends ItemAuditoria>(
  itens: T[] | undefined | null,
  originalItens: ItensOriginais | undefined | null,
  mapaD8: Map<string, Record8>,
  isXml: boolean,
): T[] {
  if (!Array.isArray(itens)) return [];

  return itens.map((item) => {
    const copia: T = { ...item };

    if (isXml && copia.cProd !== undefined && copia.cProd !== null) {
      const original = originalItens?.[String(copia.cProd)];
      const ncmXml = original?.NCM;
      if (ncmXml !== undefined && ncmXml !== null && String(ncmXml) !== '') {
        copia.ncm = String(ncmXml);
      }
    }

    const confModelo = CONFIANCAS.includes(String(copia.confianca))
      ? (copia.confianca as Confianca)
      : undefined;

    const validacao = validarNcmIA({ ncm: copia.ncm, confianca: confModelo }, mapaD8);

    if (!validacao.valido) {
      copia.ncmValidado = false;
      copia.confianca = 'BAIXA';
    } else {
      copia.ncmValidado = true;
      copia.confianca = validacao.confianca;
    }
    return copia;
  });
}
