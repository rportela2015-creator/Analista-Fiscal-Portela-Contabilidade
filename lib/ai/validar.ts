import type { Record8 } from '@/lib/data';

export interface ValidacaoIAOutput {
  ncm: string;
  valido: boolean;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  descricaoNcm?: string;
  aviso?: string;
}

export function validarNcmIA(
  r: { ncm?: string | null; confianca?: 'ALTA' | 'MEDIA' | 'BAIXA' },
  mapaD8: Map<string, Record8> | Record<string, any>
): ValidacaoIAOutput {
  const raw = String(r.ncm ?? '').trim();
  let d8 = '';
  if (!/[\d.]+[eE][+-]?\d+/.test(raw)) {
    const d = raw.replace(/\D/g, '');
    d8 = d.length === 7 ? d.padStart(8, '0') : d;
  }
  const rec = mapaD8 instanceof Map ? mapaD8.get(d8) : (mapaD8 as any)[d8];

  if (!rec || d8.length !== 8) {
    return {
      ncm: d8,
      valido: false,
      confianca: 'BAIXA',
      aviso: 'NCM não localizado na tabela oficial do Siscomex; descartado.',
    };
  }

  return {
    ncm: rec.ncm || d8,
    valido: true,
    confianca: r.confianca || 'MEDIA',
    descricaoNcm: rec.desc || rec.descricao,
  };
}
