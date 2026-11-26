/**
 * MOTOR DE LOTE E ADERÊNCIA DE PARAMETRIZAÇÃO ERP (ABA 2)
 * Aplicativo MCM / Analista Fiscal Portela Contabilidade
 *
 * Provê:
 * 1. Avaliação rigorosa da confiança da relação Descrição x NCM (corte em 85%).
 * 2. Parametrização gerencial resumida para ERP por Regime Tributário de Saída:
 *    - Simples Nacional (DAS)
 *    - Simples Híbrido (ICMS Simples + IBS/CBS Por Fora)
 *    - Lucro Presumido (Cumulativo)
 *    - Lucro Real (Não Cumulativo)
 * 3. Cálculo de aderência dos códigos de ERP (corte em 85% para acionar Codificação Assistida por IA).
 * 4. Exportação de CSV gerencial limpo (sem textos jurídicos longos, apenas colunas de cadastro ERP).
 */

import type { Dataset, Record8, Reforma } from './data';
import { classify, buildNotes } from './engine';
import { determinarCfop } from './cfop-resolver';
import {
  aliquotasDoAno,
  detectarReducoesFiscaisPorNcm,
  obterFcpPorUf,
  icmsInternoUf,
  icmsInterestadual,
  calcularMvaAjustada,
  type MarcoLegal,
} from './marco-legal';
import {
  resolverAliquotaPrBitemporal,
  verificarExclusaoStPr,
} from './engine/matriz-icms-pr';
import { consultarMvaStPr, resolverCbenefPr } from './engine/tabelas-pr';
import { validarClassTribOficial } from './fiscal/reforma-tabela-oficial';

export type RegimeSaidaLote = 'simples' | 'simples_hibrido' | 'presumido' | 'real';

export interface ContextoSaidaLote {
  regimeSaida: RegimeSaidaLote;
  ufOrigem: string;
  ufDestino: string;
  finalidadeSaida: 'revenda' | 'consumidor_final' | 'industrializacao';
  anoCalendario: 2026 | 2027 | 2029 | 2033;
  temStRetidaAnteriormente?: boolean;
  dataFatoGerador?: string;
}

export interface LinhaLoteErp {
  id: number;
  codigo: string;
  descricao: string;
  ncm: string;
  descricaoNcm: string;
  confiancaNcmPct: number;
  requerIaNcm: boolean;
  origemNcm: 'MOTOR' | 'GEMINI_IA';
  motivoBaixaConfianca?: string;

  // Parâmetros de Saída para o ERP
  regimeSaida: RegimeSaidaLote;
  ufOrigem: string;
  ufDestino: string;
  finalidadeSaida: string;
  cest: string;
  cfopSaida: string;
  cstOuCsosnIcms: string;
  cBenefPr: string;
  aliqIcmsNominalPct: number;
  redBcIcmsPct: number;
  cargaIcmsEfetivaPct: number;
  mvaOriginalPct: number;
  mvaAjustadaPct: number;
  fcpPct: number;

  // PIS / COFINS
  cstPisCofins: string;
  aliqPisPct: number;
  aliqCofinsPct: number;

  // Reforma Tributária (IBS / CBS / IS)
  cstIbsCbs: string;
  cClassTrib: string;
  redIbsCbsPct: number;
  aliqCbsEfetivaPct: number;
  aliqIbsEfetivaPct: number;
  aliqIsPct: number;
  enquadramentoPendente?: boolean;
  justificativaEnquadramento?: string;
  validacaoNormativaIcms?: 'validado' | 'pendente_conferencia_lei_11580';
  requerConferenciaNormativaIcms?: boolean;
  observacaoCbenef?: string;

  // Governança de Parametrização do ERP
  aderenciaErpPct: number;
  requerCodificacaoIaErp: boolean;
  origemParam: 'MOTOR_DETERMINISTICO' | 'IA_ASSISTIDA';
  statusErp: string;
}

/**
 * Arredondamento fiscal para duas casas decimais.
 */
export function r2(x: number): number {
  const s = x < 0 ? -1 : 1;
  return (s * Math.round(Number((Math.abs(x) * 100).toPrecision(14)))) / 100;
}

/**
 * Avalia o percentual de confiança entre a Descrição informada e o NCM.
 * Se ncmInformado for fornecido e válido, afere aderência com os termos da descrição.
 * Caso contrário, executa classify() no Dataset do Siscomex.
 * Gatilho estrito: confiancaNcmPct > 85 -> requerIaNcm = false; <= 85 -> requerIaNcm = true.
 */
export function avaliarConfiancaDescricaoNcm(
  descricao: string,
  ncmInformado: string | undefined,
  db: Dataset
): {
  ncm: string;
  descricaoNcm: string;
  confiancaNcmPct: number;
  requerIaNcm: boolean;
  motivoBaixaConfianca?: string;
  candidatosAlternativos?: string[];
} {
  const textoLimpo = (descricao || '').trim();
  const ncmLimpo = (ncmInformado || '').replace(/\D/g, '');

  // 1. Caso haja NCM informado com 8 dígitos válidos
  if (ncmLimpo.length === 8 && db?.byD8?.has(ncmLimpo)) {
    const recOficial = db.byD8.get(ncmLimpo)!;
    const descOficial = recOficial.desc.replace(/^[-–\s]+/, '');

    // Classifica o texto para comparar se o NCM informado coincide com os candidatos do Siscomex
    const res = classify(textoLimpo, db, { top: 6 });
    const c0 = res.candidates[0];
    const n = c0 ? buildNotes(c0, res.query, db, res.candidates) : null;

    // Coleta todos os textos da árvore genealógica do NCM (pais/posição/capítulo) e normaliza
    const normalizarTexto = (s: string) =>
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const textosHierarquia: string[] = [normalizarTexto(descOficial)];
    for (const p of recOficial.path || []) {
      const hDesc = db.hier?.[p];
      if (hDesc) textosHierarquia.push(normalizarTexto(hDesc));
    }
    const textoCompletoNcm = textosHierarquia.join(' ');

    // Normalização dos termos da query e da hierarquia (filtrando números ou unidades de medida puras)
    const termosRelevantes = res.query.terms.filter(
      (t) => t.length > 2 && !/^\d+(g|kg|ml|l|m|cm|mm|un|pct)?$/i.test(t)
    );
    const matchesNaHierarquia = termosRelevantes.filter((t) =>
      textoCompletoNcm.includes(normalizarTexto(t))
    ).length;
    const taxaCobertura = termosRelevantes.length > 0 ? matchesNaHierarquia / termosRelevantes.length : 0;

    // Se o NCM informado coincide com a mesma posição de 4 dígitos ou tem termos essenciais comprovados na árvore
    const mesmaPosicao = c0 && c0.rec.d8.slice(0, 4) === ncmLimpo.slice(0, 4);
    const temCandidatoNaPosicao = res.candidates.some((cand) => cand.rec.d8.slice(0, 4) === ncmLimpo.slice(0, 4));

    if (
      (c0 && c0.rec.d8 === ncmLimpo) ||
      (temCandidatoNaPosicao && taxaCobertura >= 0.4) ||
      taxaCobertura >= 0.5
    ) {
      let conf = Math.round(taxaCobertura * 50 + 45);
      if (c0 && c0.rec.d8 === ncmLimpo) {
        conf = Math.max(90, Math.round((n?.confidence ?? 0.90) * 100));
      } else if (temCandidatoNaPosicao) {
        conf = Math.max(88, conf);
      }
      const confAjustada = Math.max(86, Math.min(98, conf));
      return {
        ncm: recOficial.ncm,
        descricaoNcm: descOficial,
        confiancaNcmPct: confAjustada,
        requerIaNcm: false,
        candidatosAlternativos: res.candidates.slice(0, 3).map((x) => x.rec.ncm),
      };
    }

    let conf = Math.round(taxaCobertura * 60 + 10);
    if (recOficial.gen === 1) {
      conf = Math.min(conf, 65); // NCM genérico "Outros"
    }

    const requerIa = conf <= 85;
    return {
      ncm: recOficial.ncm,
      descricaoNcm: descOficial,
      confiancaNcmPct: conf,
      requerIaNcm: requerIa,
      motivoBaixaConfianca: requerIa
        ? `NCM informado (${recOficial.ncm}) difere da sugestão do motor (${c0 ? c0.rec.ncm : 'nenhuma'}) ou tem baixa aderência lexical.`
        : undefined,
      candidatosAlternativos: res.candidates.slice(0, 3).map((x) => x.rec.ncm),
    };
  }

  // 2. Não há NCM informado ou NCM informado é inválido -> usa classify()
  const res = classify(textoLimpo, db, { top: 6 });
  const c = res.candidates[0];

  if (!c) {
    return {
      ncm: '',
      descricaoNcm: 'Nenhum código NCM encontrado para o produto',
      confiancaNcmPct: 0,
      requerIaNcm: true,
      motivoBaixaConfianca: 'Nenhum código da Tabela NCM oficial descreve o texto informado.',
    };
  }

  const n = buildNotes(c, res.query, db, res.candidates);
  let conf = Math.round(n.confidence * 100);

  // Penalização para descrições vagas ou jargões sem valor fiscal
  const jargaoList = db.rules?.jargao_sem_valor_fiscal || [];
  const temJargao = jargaoList.some((j) => textoLimpo.toLowerCase().includes(j.toLowerCase()));
  if (temJargao || n.band === 'baixa') {
    conf = Math.min(conf, 45);
  }

  const requerIa = conf <= 85;
  return {
    ncm: c.rec.ncm,
    descricaoNcm: c.rec.desc.replace(/^[-–\s]+/, ''),
    confiancaNcmPct: conf,
    requerIaNcm: requerIa,
    motivoBaixaConfianca: requerIa
      ? `Aderência do motor (${conf}%) abaixo do limiar de segurança de 85%. Necessita desambiguação por IA.`
      : undefined,
    candidatosAlternativos: res.candidates.slice(1, 4).map((x) => x.rec.ncm),
  };
}

/**
 * Gera a parametrização gerencial resumida para o ERP de acordo com o Regime Tributário de Saída.
 */
export function gerarParametrizacaoErpResumida(
  item: {
    codigo: string;
    descricao: string;
    ncm: string;
    confiancaNcmPct: number;
    origemNcm: 'MOTOR' | 'GEMINI_IA';
  },
  ctx: ContextoSaidaLote,
  db: Dataset,
  reforma?: Reforma | null,
  marco?: MarcoLegal | null
): LinhaLoteErp {
  const d8 = item.ncm.replace(/\D/g, '');
  const rec: Record8 | null = db?.byD8?.get(d8) || null;
  const isInterestadual = ctx.ufOrigem.toUpperCase() !== ctx.ufDestino.toUpperCase();
  const ufOrig = ctx.ufOrigem.toUpperCase();
  const ufDest = ctx.ufDestino.toUpperCase();
  const dataRef = ctx.dataFatoGerador || `${ctx.anoCalendario}-06-01`;

  // 0. Fonte Única Bitemporal PR + Exclusões ST + Monofásicos Ad Rem
  const dadosPr = resolverAliquotaPrBitemporal(d8, dataRef);
  const cestsDisponiveis = rec?.cest || [];
  const cestBruto = cestsDisponiveis.length > 0 ? cestsDisponiveis[0] : '';
  const exclusaoSt = verificarExclusaoStPr(d8, cestBruto, dataRef);
  const mvaInfo = consultarMvaStPr({ ncm: d8, cest: cestBruto, dataFatoGerador: dataRef });

  // 1. CEST e Substituição Tributária (ST) — vedado em monofásico ad rem ou NCM excluído por Decreto
  const aplicaExclusaoPr = (ufOrig === 'PR' || ufDest === 'PR') && exclusaoSt.excluidoDaSt;
  const ehMonofasico = dadosPr.ehCombustivelMonofasico;
  const temSt =
    !ehMonofasico &&
    !aplicaExclusaoPr &&
    Boolean(ctx.temStRetidaAnteriormente || mvaInfo.sujeitoSt);
  const cest = temSt ? cestBruto || mvaInfo.cestTabela || '' : '';

  // 2. CFOP de Saída
  const cfopSaida = determinarCfop({
    natureza: 'saida',
    operacao: isInterestadual ? 'interestadual' : 'interna',
    finalidade: ctx.finalidadeSaida === 'industrializacao' ? 'industrializacao' : 'comercializacao',
    cst: temSt ? '60' : '00',
    temSt,
  });

  // 3. CST / CSOSN do ICMS
  let cstOuCsosnIcms = '00';
  if (ctx.regimeSaida === 'simples' || ctx.regimeSaida === 'simples_hibrido') {
    cstOuCsosnIcms = ehMonofasico ? '500' : temSt ? '500' : '102';
  } else {
    cstOuCsosnIcms = ehMonofasico ? '61' : temSt ? '60' : '00';
  }

  // 4. Benefício Fiscal ICMS / Paraná via Matriz Bitemporal e Tabela 5.2 (cBenef)
  const reducoes = detectarReducoesFiscaisPorNcm(d8, ufDest, marco);
  let cBenefPr = 'SEM_CBENEF';
  let observacaoCbenef: string | undefined;
  let redBcIcmsPct = 0;

  let aliqIcmsNominalPct = 0;
  if (ehMonofasico) {
    aliqIcmsNominalPct = 0; // tributação ad rem (LC 192/2022 / Convênios 127 e 128/2026)
  } else if (isInterestadual) {
    aliqIcmsNominalPct = marco ? icmsInterestadual(marco, ufOrig, ufDest, false) : 12.0;
  } else if (ufOrig === 'PR') {
    aliqIcmsNominalPct = dadosPr.aliquotaIcmsPct;
  } else {
    aliqIcmsNominalPct = marco ? icmsInternoUf(marco, ufOrig) : 18.0;
  }

  if (!ehMonofasico && reducoes?.icms) {
    if (reducoes.icms.diferimentoPct && reducoes.icms.diferimentoPct > 0) {
      if (ctx.regimeSaida === 'presumido' || ctx.regimeSaida === 'real') {
        cstOuCsosnIcms = '51';
      }
      if (ufOrig === 'PR') {
        const resCb = resolverCbenefPr({
          tipoBeneficio: 'diferimento_total_insumos_agro',
          cst: cstOuCsosnIcms,
          ncm: d8,
          dataFatoGerador: dataRef,
        });
        cBenefPr = resCb.cBenef;
        observacaoCbenef = resCb.observacaoConferencia;
      }
    } else if (reducoes.icms.aliqEfetivaSugeridaPct !== undefined) {
      const efetiva = reducoes.icms.aliqEfetivaSugeridaPct;
      redBcIcmsPct = aliqIcmsNominalPct > 0 ? r2((1 - efetiva / aliqIcmsNominalPct) * 100) : 0;

      if (redBcIcmsPct >= 100) {
        // Redução integral nunca pode gerar CST 20; mapeia para isenção (CST 40)
        redBcIcmsPct = 100;
        if (ctx.regimeSaida === 'presumido' || ctx.regimeSaida === 'real') {
          cstOuCsosnIcms = '40';
        }
        if (ufOrig === 'PR') {
          const resCb = resolverCbenefPr({
            tipoBeneficio: 'isencao_insumos_agro_conv100',
            cst: cstOuCsosnIcms,
            ncm: d8,
            dataFatoGerador: dataRef,
          });
          cBenefPr = resCb.cBenef;
          observacaoCbenef = resCb.observacaoConferencia;
        }
      } else if (redBcIcmsPct > 0) {
        if (ctx.regimeSaida === 'presumido' || ctx.regimeSaida === 'real') {
          cstOuCsosnIcms = '20';
        }
        if (ufOrig === 'PR') {
          const resCb = resolverCbenefPr({
            tipoBeneficio: 'reducao_bc_anexo_vi',
            cst: cstOuCsosnIcms,
            ncm: d8,
            dataFatoGerador: dataRef,
          });
          cBenefPr = resCb.cBenef;
          observacaoCbenef = resCb.observacaoConferencia;
        }
      }
    }
  }

  const fcpPct = ehMonofasico
    ? 0
    : ufDest === 'PR'
    ? dadosPr.aliquotaFecopPct
    : obterFcpPorUf(ufDest, marco);

  const cargaIcmsEfetivaPct =
    ehMonofasico || ctx.regimeSaida === 'simples' || ctx.regimeSaida === 'simples_hibrido' || temSt
      ? 0
      : r2((aliqIcmsNominalPct + fcpPct) * (1 - redBcIcmsPct / 100));

  // MVA exclusivamente da tabela Anexo IX PR (zero em monofásico ou excluído por Decreto)
  const mvaOriginalPct = temSt ? mvaInfo.mvaOriginalPct : 0;
  const aliqDestinoPrOuUf =
    ufDest === 'PR'
      ? dadosPr.aliquotaTotalPct
      : marco
      ? icmsInternoUf(marco, ufDest)
      : 18.0;
  const mvaAjustadaPct =
    temSt && isInterestadual && mvaOriginalPct > 0
      ? calcularMvaAjustada(mvaOriginalPct, aliqIcmsNominalPct, aliqDestinoPrOuUf)
      : mvaOriginalPct;

  // 5. PIS / COFINS conforme Regime e Ano
  let cstPisCofins = '49';
  let aliqPisPct = 0;
  let aliqCofinsPct = 0;

  if (ctx.anoCalendario <= 2026) {
    if (ctx.regimeSaida === 'presumido') {
      cstPisCofins = '01';
      aliqPisPct = 0.65;
      aliqCofinsPct = 3.0;
    } else if (ctx.regimeSaida === 'real') {
      cstPisCofins = '01';
      aliqPisPct = 1.65;
      aliqCofinsPct = 7.6;
    } else {
      // simples e simples_hibrido
      cstPisCofins = '49';
      aliqPisPct = 0;
      aliqCofinsPct = 0;
    }
  } else {
    // 2027+: PIS/COFINS extintos e substituídos por CBS
    cstPisCofins = '49';
    aliqPisPct = 0;
    aliqCofinsPct = 0;
  }

  // 6. Reforma Tributária (IBS / CBS / IS) — validado em reforma.json, sem fallback silencioso '000001'
  let cstIbsCbs = '';
  let cClassTrib = '';
  let redIbsCbsPct = 0;
  let aliqCbsEfetivaPct = 0;
  let aliqIbsEfetivaPct = 0;
  let aliqIsPct = 0;
  let enquadramentoPendente = false;
  let justificativaEnquadramento: string | undefined;

  let aliqCbsNominal = 0.9;
  let aliqIbsNominal = 0.1;

  if (ctx.anoCalendario >= 2027 && reforma && marco) {
    try {
      const aliqAno = aliquotasDoAno(reforma, marco, ctx.anoCalendario, ufDest);
      aliqCbsNominal = aliqAno.cbs;
      aliqIbsNominal = aliqAno.ibs;
    } catch {
      aliqCbsNominal = 8.8;
      aliqIbsNominal = 17.7;
    }
  } else if (ctx.anoCalendario >= 2027) {
    aliqCbsNominal = 8.8;
    aliqIbsNominal = 17.7;
  }

  if (reducoes?.reforma) {
    const checkCt = validarClassTribOficial(
      reducoes.reforma.cClassTrib,
      reducoes.reforma.reducaoIbsCbsPct
    );
    if (checkCt.valido) {
      cClassTrib = checkCt.codigo;
      redIbsCbsPct = checkCt.reducaoOficialPct;
      cstIbsCbs = redIbsCbsPct === 100 ? '02' : checkCt.cstOficial || '01';
    } else {
      enquadramentoPendente = true;
      justificativaEnquadramento =
        checkCt.motivo || 'cClassTrib sem validação determinística em reforma.json.';
    }
  } else {
    enquadramentoPendente = true;
    justificativaEnquadramento =
      'NCM sem mapeamento determinístico na tabela oficial (reforma.json); enquadramento IBS/CBS pendente de conferência fiscal (não atribuído 000001 sem validação).';
  }

  // Imposto Seletivo
  if (rec?.is === 1 && ctx.anoCalendario >= 2027) {
    aliqIsPct = rec.adv ?? 10.0;
  }

  if (ctx.regimeSaida === 'simples' && ctx.anoCalendario === 2026) {
    // No Simples tradicional em 2026 (fase de teste CBS 0,9% e IBS 0,1%), não há destaque
    aliqCbsEfetivaPct = 0;
    aliqIbsEfetivaPct = 0;
  } else {
    // simples_hibrido, presumido, real ou transição 2027+
    const fatorReducao = 1 - redIbsCbsPct / 100;
    aliqCbsEfetivaPct = r2(aliqCbsNominal * fatorReducao);
    aliqIbsEfetivaPct = r2(aliqIbsNominal * fatorReducao);
  }

  // 7. Cálculo de Aderência dos Códigos de ERP (0 a 100)
  let aderenciaErpPct = 95;
  const motivosIncerteza: string[] = [];

  if (d8.endsWith('90') || rec?.gen === 1) {
    aderenciaErpPct -= 15;
    motivosIncerteza.push('NCM residual/Outros (.90)');
  }
  if (cestsDisponiveis.length > 1) {
    aderenciaErpPct -= 15;
    motivosIncerteza.push('Múltiplos CESTs possíveis para o NCM');
  }
  if (temSt && !cest) {
    aderenciaErpPct -= 20;
    motivosIncerteza.push('Operação com ST sem CEST cadastrado');
  }
  if (item.confiancaNcmPct <= 85) {
    aderenciaErpPct -= 20;
    motivosIncerteza.push('Confiança da relação NCM abaixo de 85%');
  }

  aderenciaErpPct = Math.max(10, Math.min(100, aderenciaErpPct));
  const requerCodificacaoIaErp = aderenciaErpPct <= 85;

  let statusErp = 'PRONTO_PARAMETRIZAR';
  if (requerCodificacaoIaErp) {
    statusErp = `REQUER_IA_ERP (${motivosIncerteza.join(', ') || 'Incerteza fiscal'})`;
  }

  return {
    id: 0,
    codigo: item.codigo || 'S/COD',
    descricao: item.descricao,
    ncm: item.ncm,
    descricaoNcm: rec ? rec.desc.replace(/^[-–\s]+/, '') : '',
    confiancaNcmPct: item.confiancaNcmPct,
    requerIaNcm: item.confiancaNcmPct <= 85,
    origemNcm: item.origemNcm,
    motivoBaixaConfianca: motivosIncerteza.join(' | ') || undefined,

    regimeSaida: ctx.regimeSaida,
    ufOrigem: ctx.ufOrigem,
    ufDestino: ctx.ufDestino,
    finalidadeSaida: ctx.finalidadeSaida,
    cest,
    cfopSaida,
    cstOuCsosnIcms,
    cBenefPr,
    aliqIcmsNominalPct,
    redBcIcmsPct,
    cargaIcmsEfetivaPct,
    mvaOriginalPct,
    mvaAjustadaPct,
    fcpPct,

    cstPisCofins,
    aliqPisPct,
    aliqCofinsPct,

    cstIbsCbs,
    cClassTrib,
    redIbsCbsPct,
    aliqCbsEfetivaPct,
    aliqIbsEfetivaPct,
    aliqIsPct,
    ...(enquadramentoPendente ? { enquadramentoPendente, justificativaEnquadramento } : {}),
    ...(dadosPr.validacaoNormativa ? { validacaoNormativaIcms: dadosPr.validacaoNormativa } : {}),
    ...(dadosPr.requerConferenciaNormativa ? { requerConferenciaNormativaIcms: true } : {}),
    ...(observacaoCbenef ? { observacaoCbenef } : {}),

    aderenciaErpPct,
    requerCodificacaoIaErp,
    origemParam: 'MOTOR_DETERMINISTICO',
    statusErp,
  };
}

/**
 * Escapa células para formato CSV seguro contra injeção e quebras de linha.
 */
function escCsv(val: any): string {
  const str = String(val ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exporta lote de linhas em formato CSV gerencial resumido, com colunas diretas para o ERP.
 * Não inclui justificativas ou textos jurídicos longos.
 */
export function exportarLoteErpCSV(linhas: LinhaLoteErp[]): string {
  const cabecalho = [
    'CODIGO',
    'DESCRICAO',
    'REGIME_SAIDA',
    'UF_ORIGEM',
    'UF_DESTINO',
    'FINALIDADE',
    'NCM',
    'CONF_NCM_PCT',
    'ORIGEM_NCM',
    'CEST',
    'CFOP_SAIDA',
    'CST_CSOSN_ICMS',
    'CBENEF_PR',
    'ALIQ_ICMS_PCT',
    'RED_BC_ICMS_PCT',
    'ALIQ_ICMS_EFET_PCT',
    'MVA_ORIG_PCT',
    'MVA_AJUST_PCT',
    'FCP_PCT',
    'CST_PIS_COFINS',
    'ALIQ_PIS_PCT',
    'ALIQ_COFINS_PCT',
    'CST_IBS_CBS',
    'CCLASSTRIB',
    'RED_IBS_CBS_PCT',
    'ALIQ_CBS_EFET_PCT',
    'ALIQ_IBS_EFET_PCT',
    'ALIQ_IS_PCT',
    'ADERENCIA_ERP_PCT',
    'ORIGEM_PARAM',
    'STATUS_ERP',
  ].join(';');

  const dados = linhas.map((l) =>
    [
      escCsv(l.codigo),
      escCsv(l.descricao),
      escCsv(l.regimeSaida),
      escCsv(l.ufOrigem),
      escCsv(l.ufDestino),
      escCsv(l.finalidadeSaida),
      escCsv(l.ncm),
      l.confiancaNcmPct,
      escCsv(l.origemNcm),
      escCsv(l.cest),
      escCsv(l.cfopSaida),
      escCsv(l.cstOuCsosnIcms),
      escCsv(l.cBenefPr),
      l.aliqIcmsNominalPct,
      l.redBcIcmsPct,
      l.cargaIcmsEfetivaPct,
      l.mvaOriginalPct,
      l.mvaAjustadaPct,
      l.fcpPct,
      escCsv(l.cstPisCofins),
      l.aliqPisPct,
      l.aliqCofinsPct,
      escCsv(l.cstIbsCbs),
      escCsv(l.cClassTrib),
      l.redIbsCbsPct,
      l.aliqCbsEfetivaPct,
      l.aliqIbsEfetivaPct,
      l.aliqIsPct,
      l.aderenciaErpPct,
      escCsv(l.origemParam),
      escCsv(l.statusErp),
    ].join(';')
  );

  return '\uFEFF' + [cabecalho, ...dados].join('\r\n');
}
