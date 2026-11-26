/**
 * Camada de Consulta às Tabelas Oficiais Validadas do Paraná:
 *  - Tabela 5.2 SEFA/PR (cBenef) — rules/cbenef-pr.json
 *  - Anexo IX RICMS/PR (MVA ICMS-ST) — rules/mva-st-pr.json
 */

import cbenefData from '../../rules/cbenef-pr.json';
import mvaStData from '../../rules/mva-st-pr.json';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from './matriz-icms-pr';

export interface ResultadoCbenefPr {
  cBenef: string;
  valido: boolean;
  norma?: string;
  tipoBeneficio?: string;
  bloqueadoRejeicao928?: boolean;
  observacaoConferencia?: string;
}

export interface ResultadoMvaStPr {
  sujeitoSt: boolean;
  mvaOriginalPct: number;
  encontradoNaTabela: boolean;
  ehMonofasico?: boolean;
  excluidoDaSt?: boolean;
  decretoExclusao?: string;
  segmento?: string;
  cestTabela?: string;
  motivo?: string;
}

function limparDigitos(val?: string | null): string {
  return val ? String(val).replace(/\D/g, '') : '';
}

function normalizarData(data?: string | null): string {
  if (!data) return new Date().toISOString().slice(0, 10);
  const s = String(data).trim();
  if (s.includes('T')) return s.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function dentroVigencia(data: string, inicio?: string | null, fim?: string | null): boolean {
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

/**
 * Resolve ou valida um código cBenef/PR contra a Tabela 5.2 estruturada (rules/cbenef-pr.json).
 * Bloqueia explicitamente cBenef em CST 10 (Rejeição 928) e em CSTs tributados/ST incompatíveis.
 */
export function resolverCbenefPr(params: {
  codigo?: string | null;
  cst?: string | null;
  ncm?: string | null;
  tipoBeneficio?: string | null;
  dataFatoGerador?: string | null;
}): ResultadoCbenefPr {
  const cst = String(params.cst ?? '').replace(/\D/g, '').padStart(2, '0').slice(-2);
  const ncm = limparDigitos(params.ncm);
  const data = normalizarData(params.dataFatoGerador);
  const codigoSolicitado = params.codigo ? String(params.codigo).trim().toUpperCase() : '';

  if (cst && cbenefData.cstsBloqueadosCbenef.includes(cst)) {
    const ehRej928 = cst === '10';
    return {
      cBenef: 'SEM_CBENEF',
      valido: false,
      bloqueadoRejeicao928: ehRej928,
      observacaoConferencia: ehRej928
        ? 'CST 10 proíbe preenchimento de cBenef (Rejeição 928 SEFAZ/PR); retornado SEM_CBENEF.'
        : `CST ${cst} não admite código cBenef segundo Tabela 5.2 SEFA/PR.`,
    };
  }

  for (const item of cbenefData.itens) {
    if (!dentroVigencia(data, item.vigenciaInicio, item.vigenciaFim)) continue;

    const matchCodigo = codigoSolicitado
      ? item.codigo.toUpperCase() === codigoSolicitado
      : false;
    const matchTipo = params.tipoBeneficio
      ? item.tipoBeneficio === params.tipoBeneficio
      : false;

    if (!matchCodigo && !matchTipo) continue;

    if (cst && !item.cstPermitidos.includes(cst)) {
      continue;
    }

    const prefixos = item.ncmsOuCriterios?.prefixosNcm;
    if (Array.isArray(prefixos) && prefixos.length > 0 && ncm.length >= 4) {
      const bateNcm = prefixos.some((pref: string) => ncm.startsWith(pref));
      if (!bateNcm) continue;
    }

    return {
      cBenef: item.codigo,
      valido: true,
      norma: item.norma,
      tipoBeneficio: item.tipoBeneficio,
    };
  }

  return {
    cBenef: 'SEM_CBENEF',
    valido: false,
    observacaoConferencia:
      codigoSolicitado && codigoSolicitado !== 'SEM_CBENEF'
        ? `Código cBenef "${codigoSolicitado}" sem correspondência válida na Tabela 5.2 SEFA/PR para CST ${cst || '-'} e NCM ${ncm || '-'}.`
        : 'Benefício sem cBenef específico validado na Tabela 5.2 SEFA/PR; conferir enquadramento.',
  };
}

/**
 * Consulta a MVA Original oficial do Anexo IX RICMS/PR (rules/mva-st-pr.json),
 * respeitando trava para combustíveis monofásicos ad rem e exclusões bitemporais (Decretos PR 6.048/2024 e 12.828/2026).
 */
export function consultarMvaStPr(params: {
  ncm: string;
  cest?: string | null;
  dataFatoGerador?: string | null;
}): ResultadoMvaStPr {
  const ncm = limparDigitos(params.ncm);
  const cest = limparDigitos(params.cest);
  const data = normalizarData(params.dataFatoGerador);

  // 1. Combustíveis monofásicos ad rem NÃO são ST por MVA
  const aliqPr = resolverAliquotaPrBitemporal(ncm, data);
  if (aliqPr.ehCombustivelMonofasico) {
    return {
      sujeitoSt: false,
      mvaOriginalPct: 0,
      encontradoNaTabela: false,
      ehMonofasico: true,
      motivo: `NCM ${ncm} sujeita à tributação monofásica ad rem (${aliqPr.dispositivoLegal}); MVA inaplicável.`,
    };
  }

  // 2. Exclusões bitemporais de ST no PR (Decretos 6.048/2024 e 12.828/2026)
  const exclusao = verificarExclusaoStPr(ncm, params.cest ?? undefined, data);
  if (exclusao.excluidoDaSt) {
    return {
      sujeitoSt: false,
      mvaOriginalPct: 0,
      encontradoNaTabela: false,
      excluidoDaSt: true,
      decretoExclusao: exclusao.decreto,
      motivo: exclusao.orientacao || `NCM ${ncm} excluída da ST no PR pelo ${exclusao.decreto}.`,
    };
  }

  // 3. Busca determinística por NCM exato (8d) > CEST (7d) > Prefixo NCM (4d)
  const vigentes = mvaStData.itens.filter((it) =>
    dentroVigencia(data, it.vigenciaInicio, it.vigenciaFim)
  );

  let match =
    (ncm.length === 8 ? vigentes.find((it) => limparDigitos(it.ncm) === ncm) : undefined) ||
    (cest.length === 7 ? vigentes.find((it) => limparDigitos(it.cest) === cest) : undefined) ||
    (ncm.length >= 4 ? vigentes.find((it) => it.prefixoNcm && ncm.startsWith(it.prefixoNcm)) : undefined);

  if (match) {
    return {
      sujeitoSt: true,
      mvaOriginalPct: Number(match.mvaOriginalPct),
      encontradoNaTabela: true,
      segmento: match.segmento,
      cestTabela: match.cest,
    };
  }

  return {
    sujeitoSt: false,
    mvaOriginalPct: 0,
    encontradoNaTabela: false,
    motivo: `NCM ${ncm || '-'} sem previsão de MVA ST na tabela Anexo IX PR (rules/mva-st-pr.json); não presumir MVA genérico.`,
  };
}
