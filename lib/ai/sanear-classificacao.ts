import type { Record8 } from '@/lib/data';
import {
  validarNcmIA,
  validarClassTribIA,
  validarCstCsosnIA,
  validarCbenefIA,
  validarMvaIA,
} from './validar';
import { resolverAliquotaPrBitemporal } from '@/lib/engine/matriz-icms-pr';

export interface ClassificacaoIA {
  ncm?: string | null;
  confianca?: 'ALTA' | 'MEDIA' | 'BAIXA';
  descricaoNcm?: string;
  valido?: boolean;
  aviso?: string;
  cClassTrib?: string | null;
  cstIbsCbs?: string | null;
  cBenefPr?: string | null;
  cBenef?: string | null;
  cstOuCsosnIcms?: string | null;
  mvaOriginalPct?: number | null;
  redIbsCbsPct?: number | null;
  redBcIcmsPct?: number | null;
  enquadramentoPendente?: boolean;
  avisosSaneamento?: string[];
  [campo: string]: unknown;
}

export interface ContextoSaneamentoErpIA {
  regime?: string;
  ncmFallback?: string;
  cest?: string;
  dataFatoGerador?: string;
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
  contexto?: ContextoSaneamentoErpIA
): ClassificacaoIA {
  const base: ClassificacaoIA = { ...(resultado ?? {}) };
  const validacao = validarNcmIA({ ncm: base.ncm, confianca: base.confianca }, mapaD8);
  const avisos: string[] = [];

  if (!validacao.valido) {
    return {
      ...base,
      ncm: '',
      confianca: 'BAIXA',
      valido: false,
      descricaoNcm: '',
      aviso: validacao.aviso,
      avisosSaneamento: validacao.aviso ? [validacao.aviso] : [],
    };
  }

  const out: ClassificacaoIA = {
    ...base,
    ncm: validacao.ncm,
    confianca: validacao.confianca,
    valido: true,
    descricaoNcm: validacao.descricaoNcm,
  };

  if (base.cClassTrib !== undefined && base.cClassTrib !== null && String(base.cClassTrib).trim() !== '') {
    const redEsp = base.redIbsCbsPct !== undefined && base.redIbsCbsPct !== null
      ? Number(base.redIbsCbsPct)
      : undefined;
    const ctVal = validarClassTribIA(base.cClassTrib, redEsp);
    out.cClassTrib = ctVal.cClassTrib;
    if (ctVal.valido) {
      out.cstIbsCbs = ctVal.cstOficial;
      out.redIbsCbsPct = ctVal.reducaoOficialPct;
      out.enquadramentoPendente = false;
    } else {
      out.cstIbsCbs = '';
      out.enquadramentoPendente = true;
      if (ctVal.aviso) avisos.push(ctVal.aviso);
    }
  }

  if (base.cstOuCsosnIcms !== undefined || base.cBenefPr !== undefined || base.cBenef !== undefined || base.mvaOriginalPct !== undefined) {
    const saneadoErp = sanearCodificacaoErpIA(out, {
      ...contexto,
      ncmFallback: validacao.ncm,
    });
    Object.assign(out, saneadoErp);
    if (Array.isArray(saneadoErp.avisosSaneamento)) {
      avisos.push(...saneadoErp.avisosSaneamento);
    }
  }

  if (avisos.length > 0) {
    out.avisosSaneamento = [...new Set(avisos)];
    out.aviso = out.avisosSaneamento.join(' | ');
  }

  return out;
}

/**
 * Saneia codificação tributária de ERP gerada por IA contra tabelas oficiais
 * (reforma.json, rules/cbenef-pr.json, rules/mva-st-pr.json e rules/icms-pr-matriz.json).
 */
export function sanearCodificacaoErpIA(
  itemIA: ClassificacaoIA | null | undefined,
  contexto: ContextoSaneamentoErpIA = {},
  mapaD8?: Map<string, Record8>
): ClassificacaoIA {
  const base: ClassificacaoIA = { ...(itemIA ?? {}) };
  const avisos: string[] = Array.isArray(base.avisosSaneamento) ? [...base.avisosSaneamento] : [];

  let ncmUsado = String(base.ncm || contexto.ncmFallback || '').replace(/\D/g, '');
  if (mapaD8 && base.ncm) {
    const valNcm = validarNcmIA({ ncm: base.ncm, confianca: base.confianca }, mapaD8);
    if (!valNcm.valido && valNcm.aviso) {
      avisos.push(valNcm.aviso);
      ncmUsado = String(contexto.ncmFallback || '').replace(/\D/g, '');
    } else {
      ncmUsado = valNcm.ncm.replace(/\D/g, '');
    }
  }

  const dataRef = contexto.dataFatoGerador || new Date().toISOString().slice(0, 10);
  const dadosPr = ncmUsado.length >= 4 ? resolverAliquotaPrBitemporal(ncmUsado, dataRef) : null;
  const redBcPct = base.redBcIcmsPct !== undefined && base.redBcIcmsPct !== null ? Number(base.redBcIcmsPct) : 0;

  // 1. CST / CSOSN
  const cstVal = validarCstCsosnIA(base.cstOuCsosnIcms, contexto.regime, {
    redBcIcmsPct: redBcPct,
    ehMonofasico: dadosPr?.ehCombustivelMonofasico,
  });
  if (!cstVal.valido && cstVal.aviso) avisos.push(cstVal.aviso);

  // 2. MVA + exclusão ST / monofásico
  const mvaVal = validarMvaIA(
    base.mvaOriginalPct,
    ncmUsado,
    contexto.cest ?? (base.cest as string | undefined),
    dataRef
  );
  if (!mvaVal.valido && mvaVal.aviso) avisos.push(mvaVal.aviso);

  // 3. cBenef PR (Tabela 5.2 + bloqueio Rejeição 928)
  const cbVal = validarCbenefIA(
    base.cBenefPr ?? base.cBenef,
    cstVal.cstOuCsosn,
    ncmUsado,
    dataRef
  );
  if (!cbVal.valido && cbVal.aviso) avisos.push(cbVal.aviso);

  // 4. cClassTrib contra reforma.json
  const redIbsEsperada =
    base.redIbsCbsPct !== undefined && base.redIbsCbsPct !== null
      ? Number(base.redIbsCbsPct)
      : undefined;
  const ctVal = validarClassTribIA(base.cClassTrib, redIbsEsperada);
  if (!ctVal.valido && ctVal.aviso) avisos.push(ctVal.aviso);

  const avisosUnicos = [...new Set(avisos)];

  return {
    ...base,
    cstOuCsosnIcms: cstVal.cstOuCsosn,
    mvaOriginalPct: mvaVal.mvaOriginalPct,
    cBenefPr: cbVal.cBenef,
    cClassTrib: ctVal.cClassTrib,
    cstIbsCbs: ctVal.valido ? ctVal.cstOficial : '',
    redIbsCbsPct: ctVal.valido ? ctVal.reducaoOficialPct : 0,
    enquadramentoPendente: ctVal.enquadramentoPendente,
    avisosSaneamento: avisosUnicos,
    ...(avisosUnicos.length > 0 ? { aviso: avisosUnicos.join(' | ') } : {}),
  };
}
