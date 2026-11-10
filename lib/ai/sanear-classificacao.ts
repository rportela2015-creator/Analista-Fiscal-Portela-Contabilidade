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

export interface CandidatoSiscomexValido {
  ncm: string;
  desc: string;
  score?: number;
}

/**
 * Valida rigorosamente uma lista de candidatos contra a tabela oficial do Siscomex.
 *
 * 1. Remove NCMs inexistentes, truncados ou maliciosos (anti-alucinação/anti-injeção).
 * 2. Substitui a descrição adulterada pela descrição OFICIAL e selada do Siscomex.
 * 3. Limita o número de candidatos a maxCandidatos (default: 6) para evitar estouro de contexto/memória.
 */
export function validarCandidatosSiscomex(
  candidatos: unknown,
  mapaD8: Map<string, Record8>,
  maxCandidatos = 6
): CandidatoSiscomexValido[] {
  if (!Array.isArray(candidatos) || candidatos.length === 0) {
    return [];
  }

  const resultado: CandidatoSiscomexValido[] = [];
  const jaVistos = new Set<string>();

  for (const item of candidatos) {
    if (!item || typeof item !== 'object') continue;

    const rawNcm = String((item as any).ncm ?? '').trim();
    if (/[\d.]+[eE][+-]?\d+/.test(rawNcm)) continue;

    const d = rawNcm.replace(/\D/g, '');
    const d8 = d.length === 7 ? d.padStart(8, '0') : d;
    if (d8.length !== 8) continue;

    const rec = mapaD8.get(d8);
    if (!rec) continue;

    if (jaVistos.has(d8)) continue;
    jaVistos.add(d8);

    const score =
      typeof (item as any).score === 'number' && Number.isFinite((item as any).score)
        ? Number((item as any).score.toFixed(2))
        : undefined;

    resultado.push({
      ncm: rec.ncm || d8,
      desc: rec.desc || (rec as any).descricao || '',
      score,
    });

    if (resultado.length >= maxCandidatos) {
      break;
    }
  }

  return resultado;
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
