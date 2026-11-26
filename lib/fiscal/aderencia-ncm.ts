/**
 * Motor Determinístico de Aderência Semântica xProd × NCM (RGI 1–6 + Armadilhas)
 *
 * Totalmente puro, sem chamadas a LLM e sem dependência de módulos Node (`node:fs`),
 * executando tanto no cliente React quanto em APIs/testes Node sobre o Dataset oficial.
 */

import {
  armadilhasAplicaveis,
  classify,
  normalize,
  parseQuery,
  stem,
  tokenize,
  type Candidate,
} from '../engine';
import { describePath, fmtCode, normalizeNcm, type Dataset, type Record8 } from '../data';

export type StatusAderenciaNcm = 'ADERENTE' | 'REQUER_PERICIA' | 'DIVERGENTE';

export const ORIENTACAO_OPERACIONAL_CCE_NCM =
  'Atenção (Ajuste SINIEF nº 07/2005, cláusula décima quarta-A): Carta de Correção Eletrônica (CC-e) NÃO pode alterar o NCM quando houver impacto em alíquota ou valor de tributo. Mantenha o NCM original do XML na escrituração de entrada (EFD C100/C170) com registro de risco ou exija NF-e complementar/devolução/regularização do fornecedor; aplique o NCM saneado exclusivamente no cadastro de saída (ERP) e na precificação.';

export interface CandidatoRgiSugerido {
  ncm: string;
  ncmFormatado: string;
  descricaoOficial: string;
  hierarquia: string[];
  score: number;
  regraRgiAplicada: string;
  motivoSugestao: string;
}

export interface ResultadoAderenciaNcm {
  ncmInformado: string;
  ncmFormatado: string;
  ncmValidoSiscomex: boolean;
  descricaoOficialNcm?: string;
  hierarquiaNcm: string[];
  scoreAderencia: number;
  statusAderencia: StatusAderenciaNcm;
  motivos: string[];
  armadilhasDetectadas: string[];
  candidatosRgi: CandidatoRgiSugerido[];
}

function extrairTokensArvore(rec: Record8, ds: Dataset): {
  ownTokens: Set<string>;
  ancTokens: Set<string>;
  hierarquiaTextos: string[];
} {
  const path = describePath(ds, rec);
  const hierarquiaTextos = path.map((p) => `${fmtCode(p.code)} — ${p.desc}`);
  const ownTokens = new Set(tokenize(rec.desc));
  const ancTokens = new Set<string>();
  for (const p of path) {
    if (p.code === rec.d8) continue;
    for (const tok of tokenize(p.desc)) {
      if (!ownTokens.has(tok)) ancTokens.add(tok);
    }
  }
  return { ownTokens, ancTokens, hierarquiaTextos };
}

function selecionarRegraRgiSugestao(
  cand: Candidate,
  recAtual: Record8 | undefined,
  armadilhasIds: string[]
): { regra: string; motivo: string } {
  if (recAtual && (recAtual.gen === 1 || recAtual.d8.endsWith('90') || recAtual.d8.endsWith('99')) && cand.rec.gen === 0) {
    return {
      regra: 'RGI 3(a) + RGI 6',
      motivo: `Posição nominal mais específica (${fmtCode(cand.rec.d8)}) prevalece sobre código residual/genérico (${fmtCode(recAtual.d8)}).`,
    };
  }
  if (armadilhasIds.length > 0) {
    return {
      regra: 'RGI 1 + Nota Legal / Armadilha',
      motivo: `Aderente às armadilhas normativas aplicáveis à descrição (${armadilhasIds.slice(0, 2).join(', ')}).`,
    };
  }
  const termosCasados = cand.matched.slice(0, 3).map((m) => m.term);
  return {
    regra: 'RGI 1 + RGI 6',
    motivo:
      termosCasados.length > 0
        ? `Casamento direto pelos termos da NESH/Siscomex: ${termosCasados.join(', ')}.`
        : 'Maior aderência lexical e hierárquica (Capítulo -> Posição -> Subitem) na Tabela NCM vigente.',
  };
}

function verificarConflitoAlimentacaoPanificacao(xProdNorm: string, d8: string): string | null {
  const ehPaoEstrito = d8 === '19059010' || d8 === '19051000' || d8 === '19054000';
  const termosConfeitaria = /\b(bolo|chocolate|rechead|torta|panetone|bombom|trufa|mousse|pav[eê]|pudim|alfajor)\b/i;
  if (ehPaoEstrito && termosConfeitaria.test(xProdNorm)) {
    return `Descrição de confeitaria/bolo/chocolate conflita com NCM específico de pão (${fmtCode(d8)}); risco de uso indevido de alíquota de cesta básica.`;
  }
  const ehBoloConfeitaria = d8.startsWith('190520');
  if (ehBoloConfeitaria && /\b(pao frances|pao de forma|pao de sal)\b/i.test(xProdNorm)) {
    return `Descrição de pão comum conflita com posição específica de pão de especiarias/bolos (${fmtCode(d8)}).`;
  }
  return null;
}

/**
 * Avalia deterministicamente a aderência semântica entre `xProd` e `ncmRaw` contra o Dataset oficial.
 */
export function avaliarAderenciaNcm(
  xProd: string,
  ncmRaw: string,
  ds?: Dataset | null
): ResultadoAderenciaNcm {
  const d8 = normalizeNcm(ncmRaw);
  const ncmFmt = d8.length === 8 ? fmtCode(d8) : String(ncmRaw || '--------');
  const descLimpa = String(xProd || '').trim();

  if (!ds) {
    return {
      ncmInformado: d8,
      ncmFormatado: ncmFmt,
      ncmValidoSiscomex: d8.length === 8,
      hierarquiaNcm: [],
      scoreAderencia: 50,
      statusAderencia: 'REQUER_PERICIA',
      motivos: ['Catálogo oficial Siscomex ainda não carregado em memória para confronto semântico completo.'],
      armadilhasDetectadas: [],
      candidatosRgi: [],
    };
  }

  const recAtual = d8.length === 8 ? ds.byD8.get(d8) : undefined;
  const cls = classify(descLimpa, ds, { top: 12 });
  const q = cls.query || parseQuery(descLimpa, ds);
  const armadilhas = armadilhasAplicaveis(q, ds);
  const armadilhasIds = armadilhas.map((a) => a.titulo || a.id);

  const ehAlimentoSemMaquina =
    /\b(bolo|chocolate|rechead|torta|panetone|pao|biscoito|bolacha|macarrao|arroz|feijao|cafe|alimento)\b/i.test(
      normalize(descLimpa)
    ) && !/\b(forno|maquina|aparelho|equipamento|industrial|batedeira|liquidificador|misturador)\b/i.test(normalize(descLimpa));

  const construirCandidatos = (excluirD8?: string): CandidatoRgiSugerido[] => {
    const vistos = new Set<string>();
    const lista: CandidatoRgiSugerido[] = [];
    for (const cand of cls.candidates) {
      if (!ds.byD8.has(cand.rec.d8)) continue;
      if (excluirD8 && cand.rec.d8 === excluirD8) continue;
      if (ehAlimentoSemMaquina && (cand.rec.d8.startsWith('84') || cand.rec.d8.startsWith('85'))) continue;
      if (vistos.has(cand.rec.d8)) continue;
      vistos.add(cand.rec.d8);
      const { hierarquiaTextos } = extrairTokensArvore(cand.rec, ds);
      const rgiInfo = selecionarRegraRgiSugestao(cand, recAtual, armadilhasIds);
      lista.push({
        ncm: cand.rec.d8,
        ncmFormatado: fmtCode(cand.rec.d8),
        descricaoOficial: cand.rec.desc,
        hierarquia: hierarquiaTextos,
        score: Math.round(cand.score * 10) / 10,
        regraRgiAplicada: rgiInfo.regra,
        motivoSugestao: rgiInfo.motivo,
      });
      if (lista.length >= 3) break;
    }
    return lista;
  };

  if (!recAtual) {
    return {
      ncmInformado: d8,
      ncmFormatado: ncmFmt,
      ncmValidoSiscomex: false,
      hierarquiaNcm: [],
      scoreAderencia: 0,
      statusAderencia: 'DIVERGENTE',
      motivos: [
        d8.length === 8
          ? `Código NCM ${ncmFmt} não localizado nos registros oficiais Siscomex vigentes.`
          : `Código NCM "${ncmRaw}" em formato inválido (esperados 8 dígitos).`,
      ],
      armadilhasDetectadas: armadilhasIds,
      candidatosRgi: construirCandidatos(),
    };
  }

  const { ownTokens, ancTokens, hierarquiaTextos } = extrairTokensArvore(recAtual, ds);
  const top1 = cls.candidates[0];
  const rankAtual = cls.candidates.findIndex((c) => c.rec.d8 === d8);
  const motivos: string[] = [];

  // Sobreposição ponderada entre termos/sinônimos de xProd e a árvore do NCM do XML
  let pesoTotal = 0;
  let pesoCasado = 0;
  let ownHits = 0;
  for (const [term, w] of q.weights.entries()) {
    pesoTotal += w;
    if (ownTokens.has(term)) {
      pesoCasado += w;
      ownHits++;
    } else if (ancTokens.has(term)) {
      pesoCasado += w * 0.6;
    } else {
      // Verifica correspondência por prefixo morfológico próximo (>= 5 chars) para flexões leves
      const stemTerm = stem(term);
      if (stemTerm.length >= 5) {
        for (const ot of ownTokens) {
          if (ot.startsWith(stemTerm.slice(0, 5)) || stemTerm.startsWith(ot.slice(0, 5))) {
            pesoCasado += w * 0.8;
            ownHits++;
            break;
          }
        }
      }
    }
  }

  const hitRatio = pesoTotal > 0 ? Math.min(1, pesoCasado / pesoTotal) : 0;
  let score = 20 + Math.round(hitRatio * 42);

  if (ownHits > 0) {
    score += Math.min(20, ownHits * 10);
  }

  if (rankAtual === 0) {
    score += 36;
  } else if (rankAtual >= 1 && rankAtual <= 2) {
    score += 30;
  } else if (rankAtual >= 3 && rankAtual <= 5) {
    score += 20;
  } else if (rankAtual >= 6) {
    score += 12;
  } else if (top1) {
    const mesmaPosicao = top1.rec.d8.slice(0, 4) === d8.slice(0, 4);
    const mesmoCapitulo = top1.rec.d8.slice(0, 2) === d8.slice(0, 2);
    if (mesmaPosicao && hitRatio > 0.2) {
      score += 14;
    } else if (mesmoCapitulo && hitRatio > 0.15) {
      score += 6;
    } else if (!mesmoCapitulo && top1.score >= 45 && top1.coverage >= 0.3) {
      score -= 28;
      motivos.push(
        `NCM informado (Capítulo ${d8.slice(0, 2)}) não figura entre os candidatos da busca RGI; o motor aponta para Capítulo ${top1.rec.d8.slice(0, 2)} (${fmtCode(top1.rec.d8)}).`
      );
    }
  }

  // Verificação de armadilhas penais sobre o NCM do XML
  for (const a of armadilhas) {
    const candsArm = new Set((a.candidatos || []).map((c) => normalizeNcm(c)));
    const penalizado = (a.penalizar_prefijos || []).some((p) => d8.startsWith(normalizeNcm(p)));
    if (penalizado && !candsArm.has(d8)) {
      score -= 28;
      motivos.push(`Armadilha normativa (${a.titulo}): ${a.explicacao}`);
    }
  }

  // Conflito de matéria declarada vs capítulo
  if (q.material && top1) {
    const chapsMat = ds.rules.materiais[q.material] || [];
    if (chapsMat.length > 0 && !chapsMat.some((c) => d8.startsWith(c)) && chapsMat.some((c) => top1.rec.d8.startsWith(c))) {
      score -= 20;
      motivos.push(
        `Material identificado ("${q.material}") aponta para capítulos ${chapsMat.join(', ')}, divergindo do NCM ${ncmFmt}.`
      );
    }
  }

  // Subposição genérica / residual .90 / .99 quando existe item nominal forte (RGI 3(a))
  const ehResidual = recAtual.gen === 1 || d8.endsWith('90') || d8.endsWith('99');
  if (ehResidual && top1 && top1.rec.d8 !== d8 && top1.rec.gen === 0 && top1.score > (cls.candidates[rankAtual]?.score ?? 0) * 1.15) {
    score -= 18;
    motivos.push(
      `NCM residual/genérico (${ncmFmt} — "${recAtual.desc}") enquanto RGI 3(a) favorece descrição nominal específica (${fmtCode(top1.rec.d8)} — "${top1.rec.desc}").`
    );
  }

  // Regra pericial explícita panificação/cesta básica vs confeitaria/chocolate
  const xProdNorm = normalize(descLimpa);
  const conflitoAlim = verificarConflitoAlimentacaoPanificacao(xProdNorm, d8);
  if (conflitoAlim) {
    score -= 35;
    motivos.push(conflitoAlim);
  }

  // Caso não haja nenhum termo em comum com a descrição própria nem ranking top 12
  if (ownHits === 0 && hitRatio < 0.15 && rankAtual === -1 && top1 && top1.rec.d8 !== d8) {
    score = Math.min(score, 35);
    motivos.push(
      `Descrição "${descLimpa}" não possui interseção relevante com "${recAtual.desc}" (${ncmFmt}).`
    );
  }

  if (descLimpa.length < 4) {
    score = Math.min(score, 50);
    motivos.push('Descrição comercial excessivamente curta para confirmar aderência semântica.');
  }

  const scoreFinal = Math.max(0, Math.min(100, Math.round(score)));
  let statusAderencia: StatusAderenciaNcm = 'ADERENTE';
  if (scoreFinal < 45 || Boolean(conflitoAlim)) {
    statusAderencia = 'DIVERGENTE';
  } else if (scoreFinal < 72 || (ehResidual && rankAtual !== 0)) {
    statusAderencia = 'REQUER_PERICIA';
  }

  if (statusAderencia === 'ADERENTE' && motivos.length === 0) {
    motivos.push(`Descrição "${descLimpa}" compatível com a posição oficial ${ncmFmt} (${recAtual.desc}).`);
  }

  return {
    ncmInformado: d8,
    ncmFormatado: ncmFmt,
    ncmValidoSiscomex: true,
    descricaoOficialNcm: recAtual.desc,
    hierarquiaNcm: hierarquiaTextos,
    scoreAderencia: scoreFinal,
    statusAderencia,
    motivos: Array.from(new Set(motivos)),
    armadilhasDetectadas: armadilhasIds,
    candidatosRgi: construirCandidatos(statusAderencia === 'ADERENTE' ? undefined : d8),
  };
}
