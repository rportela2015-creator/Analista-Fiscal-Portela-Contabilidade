import type { Record8 } from '@/lib/data';
import { validarNcmIA } from './validar';

export interface ClassificacaoIA {
  ncm?: string | null;
  confianca?: 'ALTA' | 'MEDIA' | 'BAIXA';
  descricaoNcm?: string;
  valido?: boolean;
  aviso?: string;
  [campo: string]: unknown;
}

/**
 * Saneia a classificação devolvida pela IA contra a tabela oficial. Função PURA.
 *
 *  - NCM inexistente / formato inválido => ncm:"", confianca:"BAIXA", valido:false,
 *    descricaoNcm:"" e aviso (a IA nunca chega ao front com NCM inventado).
 *  - NCM válido => ncm no formato oficial e descricaoNcm OFICIAL da tabela.
 */
export function sanearClassificacao(
  resultado: ClassificacaoIA | null | undefined,
  mapaD8: Map<string, Record8>,
): ClassificacaoIA {
  const base: ClassificacaoIA = { ...(resultado ?? {}) };
  const validacao = validarNcmIA({ ncm: base.ncm, confianca: base.confianca }, mapaD8);

  if (!validacao.valido) {
    return { ...base, ncm: '', confianca: 'BAIXA', valido: false, descricaoNcm: '', aviso: validacao.aviso };
  }
  return {
    ...base,
    ncm: validacao.ncm,
    confianca: validacao.confianca,
    valido: true,
    descricaoNcm: validacao.descricaoNcm,
  };
}
