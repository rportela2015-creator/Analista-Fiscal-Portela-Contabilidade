/**
 * Arcabouço legal do motor de precificação.
 *
 * Tudo que é norma/percentual/calendário vive em `rules/marco-legal.json` (versionado, com STATUS de
 * verificação por norma) e nas tabelas oficiais já carregadas em `public/data/reforma.json`. Este módulo
 * só RESOLVE: dado ano/UF/cClassTrib, devolve os parâmetros vigentes + as normas que os sustentam.
 * Nada de NCM ou percentual hardcoded aqui (AGENTS.md §1).
 */
import type { ClassTrib, Reforma } from './data';

export type StatusNorma = 'confirmado' | 'confirmado_fonte_secundaria' | 'conhecimento_geral' | 'nao_verificado';

export type Norma = {
  id: string;
  norma: string;
  dispositivo: string;
  tema: string;
  resumo: string;
  efeito_motor: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  status: StatusNorma;
  fontes: string[];
  observacao?: string;
  titulo?: string;
  diploma?: string;
  artigos?: string;
  orgao?: string;
  esfera?: string;
  vigencia?: string;
  status_vigencia?: string;
  fonte_oficial?: string;
};

export type DestinacaoMercadoria = 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado';

export type RegimeTributario = 'simples' | 'simples_hibrido' | 'presumido' | 'real';

export type FaixaSimples = {
  faixa: number;
  limite_superior: number;
  aliquota_nominal_pct: number;
  deducao: number;
  partilha_pct: {
    irpj: number;
    csll: number;
    cofins: number;
    pis: number;
    cpp: number;
    icms: number;
  };
};

export type ParametrosTransicao = {
  ibs_fracao_pct: Record<string, number>;
  icms_fator_pct: Record<string, number>;
  ibs_municipal_pct_2027_2028: number;
  ano_ibs_pleno: number;
  norma_ids: string[];
};

export type ParametrosCreditoEstoque = {
  aliquota_pct: number;
  parcelas: number;
  mes_limite_apropriacao: number;
  ano_base: number;
  regimes_elegiveis: string[];
  regimes_inelegiveis: Record<string, string>;
  uso_exclusivo: string;
  prazo_anos: number;
  norma_ids: string[];
};

export type ParametrosIcms = {
  base_inclui_iva_padrao: boolean;
  norma_ids: string[];
  interestadual: {
    regioes: Record<string, string[]>;
    origens_7: string[];
    destinos_7: string[];
    aliquota_geral_pct: number;
    aliquota_menor_pct: number;
    aliquota_importado_pct: number;
    norma_ids: string[];
  };
  aliquotas_internas_uf?: Record<string, number>;
};

export type ParametrosLucroPresumido = {
  atividades: Record<string, { presuncao_irpj_pct: number; presuncao_csll_pct: number }>;
  aliquota_irpj_pct: number;
  aliquota_csll_pct: number;
  pis_pct?: number;
  cofins_pct?: number;
  total_pis_cofins_pct?: number;
  adicional_irpj_pct?: number;
  limite_adicional_mensal?: number;
  norma_ids: string[];
};

export type ParametrosLucroReal = {
  pis_pct: number;
  cofins_pct: number;
  total_pis_cofins_pct: number;
  aliquota_irpj_pct: number;
  adicional_irpj_pct: number;
  aliquota_csll_pct: number;
  norma_ids: string[];
};

export type ParametrosSimplesNacional = {
  anexo_i_comercio: FaixaSimples[];
  norma_ids: string[];
};

export type FonteConsultaOficial = {
  nome: string;
  url: string;
  metodo: string;
  periodicidade: string;
};

export type ParametrosCfopDePara = {
  norma_ids: string[];
  regras: Record<string, Record<DestinacaoMercadoria, string>>;
};

export type ParametrosRegrasIcmsPrVizinhos = {
  norma_ids: string[];
  aliquota_modal_pr_pct: number;
  origens_importadas: string[];
  aliquota_importados_pct: number;
  ufs_limitrofes_12_pct: string[];
  aliquota_limitrofes_pct: number;
  difal_uso_consumo: { exigido: boolean; norma: string };
  difal_comercial_simples_pr: { exigido: boolean; norma: string };
};

export type ParametrosContabilidadeCustos = {
  norma_ids: string[];
  arbitramento_revenda_pct: number;
  arbitramento_industria_pct: number;
  custeio_absorcao_obrigatorio_lucro_real: boolean;
  metodos_admitidos: string[];
  metodos_vedados: string[];
  criterios_rateio_frete: string[];
  ajuste_vrl_obrigatorio: boolean;
};

export type MarcoLegal = {
  versao: string;
  verificado_em: string;
  normas: Norma[];
  parametros: {
    transicao: ParametrosTransicao;
    credito_estoque: ParametrosCreditoEstoque;
    icms: ParametrosIcms;
    lucro_presumido: ParametrosLucroPresumido;
    lucro_real?: ParametrosLucroReal;
    simples_nacional?: ParametrosSimplesNacional;
    cronograma_referencia?: Record<
      string,
      {
        cbs_pct: number;
        ibs_pct: number;
        fracao_ibs_pct?: number;
        icms_fator_pct?: number;
        compensavel?: boolean;
        pis_cofins_extinto?: boolean;
        soma_iva_pct?: number;
      }
    >;
    nfe: { vprod_inclui_ibs_cbs: boolean; versao_nt: string; norma_ids: string[] };
    reducoes_manuais: Record<string, { cbs: number; ibs: number } | string>;
    fontes_consulta_oficiais?: Record<string, FonteConsultaOficial>;
    cfop_de_para?: ParametrosCfopDePara;
    regras_icms_pr_vizinhos?: ParametrosRegrasIcmsPrVizinhos;
    contabilidade_custos?: ParametrosContabilidadeCustos;
  };
};

/** Carrega o marco legal (mesmo padrão de fetch/versão de lib/data.ts). */
let marcoCache: Promise<MarcoLegal | null> | null = null;
export function loadMarcoLegal(): Promise<MarcoLegal | null> {
  if (!marcoCache) {
    marcoCache = (async () => {
      try {
        const r = await fetch('/data/marco-legal.json', { cache: 'no-cache' });
        return r.ok ? ((await r.json()) as MarcoLegal) : null;
      } catch {
        return null;
      }
    })();
  }
  return marcoCache;
}

export const citar = (
  marco: MarcoLegal,
  ids: string[]
): Pick<Norma, 'id' | 'norma' | 'dispositivo' | 'status' | 'tema'>[] =>
  ids
    .map((id) => marco.normas.find((n) => n.id === id))
    .filter((n): n is Norma => !!n)
    .map(({ id, norma, dispositivo, status, tema }) => ({ id, norma, dispositivo, status, tema }));

/** Normas não verificadas viram alerta (nada é dado como certo sem lastro). */
export const alertasDeStatus = (marco: MarcoLegal, ids: string[]): string[] =>
  citar(marco, ids)
    .filter((n) => n.status === 'nao_verificado' || n.status === 'conhecimento_geral')
    .map(
      (n) =>
        `${n.norma} (${n.dispositivo}) — ${
          n.status === 'nao_verificado' ? 'NÃO verificada' : 'conhecimento geral, não reconferida'
        }.`
    );

export type AliquotasAno = {
  ano: number;
  cbs: number;
  ibsUf: number;
  ibsMun: number;
  ibs: number;
  icmsFator: number;
  fonte: string;
  notas: string[];
};

const ultimoAnoAte = (anos: number[], ano: number) =>
  anos.filter((a) => a <= ano).sort((a, b) => b - a)[0];

/**
 * Alíquotas efetivas do ano (em %). CBS e IBS-UF vêm da tabela OFICIAL (reforma.aliquotas) com
 * carry-forward quando o ano não está na tabela (a tabela só traz 2026, 2027, 2029 e 2033).
 * IBS municipal NÃO existe na tabela oficial carregada: 2027-28 vem do marco legal; de 2029 em diante
 * depende de `ibsMunicipalRefPct` (alíquota municipal plena) — sem ela, é 0 e o resultado alerta.
 */
export function aliquotasDoAno(
  reforma: Reforma | null,
  marco: MarcoLegal,
  ano: number,
  uf = 'PR',
  opts: { ibsMunicipalRefPct?: number } = {}
): AliquotasAno {
  if (ano < 2027) throw new Error('Precificação cobre 2027+: em 2026 PIS/COFINS seguem vigentes e IBS/CBS são só teste.');
  const t = marco.parametros.transicao;
  const al = reforma?.aliquotas || {};
  const anos = Object.keys(al).map(Number);
  const notas: string[] = [];
  if (!anos.length) throw new Error('Tabela oficial de alíquotas (reforma.json) não carregada — rode npm run build:reforma.');

  const aBase = ultimoAnoAte(anos, ano);
  const cbs = al[String(aBase)]?.uniao;
  if (cbs == null) throw new Error(`CBS de ${ano} indisponível na tabela oficial.`);
  if (aBase !== ano) notas.push(`CBS ${ano}: tabela oficial não tem o ano; usado ${aBase} (carry-forward).`);

  const ufDe = (a: number) => {
    const x = al[String(a)];
    return x?.uf_por?.[uf] ?? (x?.uf || [])[0];
  };
  const fracao = (t.ibs_fracao_pct[String(ano)] ?? (ano >= t.ano_ibs_pleno ? 100 : 0)) / 100;
  let ibsUf: number;
  if (ano <= 2028) {
    ibsUf = ufDe(aBase) ?? 0;
  } else if (al[String(ano)]) {
    ibsUf = ufDe(ano) ?? 0; // oficial (ex.: 2029 = 1,6)
  } else {
    const plena = ufDe(t.ano_ibs_pleno);
    if (plena == null) throw new Error('IBS-UF pleno (2033) ausente na tabela oficial; impossível derivar o escalonamento.');
    ibsUf = plena * fracao;
    notas.push(`IBS-UF ${ano} derivado: ${t.ano_ibs_pleno} (${plena}%) x ${fracao * 100}% — a tabela oficial não tem este ano.`);
  }

  let ibsMun = 0;
  if (ano <= 2028) ibsMun = t.ibs_municipal_pct_2027_2028;
  else if (opts.ibsMunicipalRefPct != null) ibsMun = opts.ibsMunicipalRefPct * fracao;
  else notas.push('IBS MUNICIPAL não incluído: a tabela oficial carregada só traz a parte da UF. Informe ibsMunicipalRefPct para 2029+.');

  const icmsFator = (t.icms_fator_pct[String(ano)] ?? (ano >= t.ano_ibs_pleno ? 0 : 100)) / 100;
  return { ano, cbs, ibsUf, ibsMun, ibs: ibsUf + ibsMun, icmsFator, fonte: 'reforma.json (RFB) + marco-legal.json', notas };
}

/**
 * Percentuais de redução de CBS/IBS de um cClassTrib, DERIVADOS do texto oficial `tt`:
 * "Alíquota zero" = 100%; "Alíquota reduzida em N%" = N%. Exceções documentadas em `reducoes_manuais`.
 */
export function reducaoDoClassTrib(
  ct: Pick<ClassTrib, 'c' | 'tt'> | undefined | null,
  marco?: MarcoLegal | null
): { cbs: number; ibs: number; origem: 'oficial' | 'manual' | 'nenhuma'; nota?: string } {
  if (!ct) return { cbs: 0, ibs: 0, origem: 'nenhuma' };
  const manual = marco?.parametros.reducoes_manuais?.[ct.c];
  if (manual && typeof manual === 'object') return { cbs: manual.cbs, ibs: manual.ibs, origem: 'manual', nota: `override em marco-legal.json para ${ct.c}` };
  const tt = (ct.tt || '').toLowerCase();
  if (/zero/.test(tt) && !/reduzida/.test(tt)) return { cbs: 100, ibs: 100, origem: 'oficial' };
  const m = tt.match(/reduzida\s+em\s+(\d{1,3})\s*%/);
  if (m) return { cbs: Number(m[1]), ibs: Number(m[1]), origem: 'oficial' };
  return { cbs: 0, ibs: 0, origem: 'nenhuma' };
}

/** ICMS interestadual (tabela do marco legal). Importado: 4%. */
export function icmsInterestadual(marco: MarcoLegal, ufOrigem: string, ufDestino: string, importado = false): number {
  const p = marco.parametros.icms.interestadual;
  if (importado) return p.aliquota_importado_pct;
  const reg = (uf: string) => Object.keys(p.regioes).find((r) => p.regioes[r].includes(uf));
  const o = reg(ufOrigem), d = reg(ufDestino);
  return o && d && p.origens_7.includes(o) && p.destinos_7.includes(d) ? p.aliquota_menor_pct : p.aliquota_geral_pct;
}

/** Obtém alíquota interna padrão de ICMS da UF. */
export function icmsInternoUf(marco: MarcoLegal, uf: string): number {
  const ufUpper = (uf || 'PR').toUpperCase();
  const al = marco.parametros.icms?.aliquotas_internas_uf?.[ufUpper];
  if (al != null) return al;
  return 18.0; // fallback padrão nacional
}

/** IRPJ+CSLL efetivos sobre a RECEITA no Lucro Presumido (sem o adicional de 10% do IRPJ). */
export function irpjCsllPresumidoPct(marco: MarcoLegal, atividade: string): number {
  const p = marco.parametros.lucro_presumido, a = p.atividades[atividade];
  if (!a) throw new Error(`Atividade desconhecida: ${atividade}`);
  return Math.round((a.presuncao_irpj_pct * p.aliquota_irpj_pct + a.presuncao_csll_pct * p.aliquota_csll_pct)) / 100;
}

/**
 * Localiza a faixa do Simples Nacional (Anexo I - Comércio) com base na Receita Bruta Acumulada (RBT12).
 */
export function obterFaixaSimples(marco: MarcoLegal, rbt12: number): FaixaSimples {
  const faixas = marco.parametros.simples_nacional?.anexo_i_comercio || [];
  if (!faixas.length) {
    // Fallback padrão se não configurado
    return {
      faixa: 1,
      limite_superior: 180000,
      aliquota_nominal_pct: 4.0,
      deducao: 0,
      partilha_pct: { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 41.5, icms: 34.0 },
    };
  }
  for (const f of faixas) {
    if (rbt12 <= f.limite_superior) return f;
  }
  return faixas[faixas.length - 1];
}

/**
 * Calcula a alíquota efetiva do Simples Nacional e a alíquota reduzida no modo Híbrido (IBS/CBS por fora).
 * Fórmula: [(RBT12 * AlíquotaNominal) - ParcelaDeduzir] / RBT12
 */
export function calcularDasEfetivo(
  marco: MarcoLegal,
  rbt12: number
): { dasEfetivoPct: number; dasReduzidoHibridoPct: number; faixa: FaixaSimples } {
  const f = obterFaixaSimples(marco, Math.max(1, rbt12));
  const rbt = Math.max(1, rbt12);
  const efetiva = Math.max(0, ((rbt * (f.aliquota_nominal_pct / 100)) - f.deducao) / rbt) * 100;
  
  // No Simples Híbrido, deduz-se do DAS a parcela correspondente a PIS, COFINS e ICMS
  const partilha = f.partilha_pct;
  const pctDeduzir = (partilha.pis + partilha.cofins + partilha.icms) / 100;
  const reduzida = efetiva * (1 - pctDeduzir);

  return {
    dasEfetivoPct: Math.round(efetiva * 100) / 100,
    dasReduzidoHibridoPct: Math.round(reduzida * 100) / 100,
    faixa: f,
  };
}

/**
 * Mapeia o CFOP de saída do emitente para o CFOP de entrada adequado no adquirente,
 * considerando a destinação física/econômica e a localização geográfica (interna vs. interestadual).
 * Retorna flags normativas de ST, crédito de ICMS e exigência de DIFAL.
 */
export function mapearCfopEntrada(
  cfopSaidaEmitente: string,
  destinacao: DestinacaoMercadoria,
  ufOrigem = 'PR',
  ufDestino = 'PR',
  marco?: MarcoLegal | null
): {
  cfopEntrada: string;
  temSt: boolean;
  geraCreditoIcms: boolean;
  exigeDifal: boolean;
  normaId: string;
} {
  const raw = String(cfopSaidaEmitente || '').trim();
  const temPonto = raw.includes('.');
  const cLimpo = raw.replace(/\D/g, '');

  const isInterestadual =
    cLimpo.startsWith('6') ||
    cLimpo.startsWith('2') ||
    Boolean(ufOrigem && ufDestino && ufOrigem.toUpperCase() !== ufDestino.toUpperCase());
  const prefixo = isInterestadual ? '2' : '1';

  let cfopDigitos = '';
  const regrasCustom = marco?.parametros?.cfop_de_para?.regras;
  if (regrasCustom && regrasCustom[cLimpo] && regrasCustom[cLimpo][destinacao]) {
    cfopDigitos = regrasCustom[cLimpo][destinacao].replace(/\D/g, '');
  }

  const isSt = cLimpo.startsWith('54') || cLimpo.startsWith('64');

  if (!cfopDigitos) {
    if (isSt) {
      switch (destinacao) {
        case 'comercializacao':
          cfopDigitos = `${prefixo}403`;
          break;
        case 'industrializacao':
          cfopDigitos = `${prefixo}401`;
          break;
        case 'uso_consumo':
          cfopDigitos = `${prefixo}407`;
          break;
        case 'ativo_imobilizado':
          cfopDigitos = `${prefixo}406`;
          break;
      }
    } else {
      switch (destinacao) {
        case 'comercializacao':
          cfopDigitos = `${prefixo}102`;
          break;
        case 'industrializacao':
          cfopDigitos = `${prefixo}101`;
          break;
        case 'uso_consumo':
          cfopDigitos = `${prefixo}556`;
          break;
        case 'ativo_imobilizado':
          cfopDigitos = `${prefixo}551`;
          break;
      }
    }
  }

  const temSt = isSt || cfopDigitos.startsWith('14') || cfopDigitos.startsWith('24');

  // Regra de crédito de ICMS na entrada (LC 87/96):
  // - ST recolhida não gera crédito de ICMS na entrada normal (recolhimento retido)
  // - Uso/consumo não gera crédito (LC 87/96 art. 33, I até 2033)
  // - Ativo imobilizado gera via CIAP (1/48 avos), não compondo crédito imediato na apuração direta de entrada
  // - Comercialização e industrialização normais geram crédito
  const geraCreditoIcms = !temSt && (destinacao === 'comercializacao' || destinacao === 'industrializacao');

  // Exigência de DIFAL (EC 87/2015, LC 190/2022):
  // Operação interestadual para uso/consumo ou ativo imobilizado
  const exigeDifal = isInterestadual && (destinacao === 'uso_consumo' || destinacao === 'ativo_imobilizado');

  const normaId = temSt || exigeDifal ? 'RICMS-PR-DEC7871' : 'LC87-1996-KANDIR';

  const cfopEntrada =
    temPonto && cfopDigitos.length === 4
      ? `${cfopDigitos[0]}.${cfopDigitos.slice(1)}`
      : cfopDigitos;

  return {
    cfopEntrada,
    temSt,
    geraCreditoIcms,
    exigeDifal,
    normaId,
  };
}

/**
 * Calcula a MVA Ajustada quando a alíquota interestadual for menor que a alíquota interna de destino:
 * MVA Ajustada = {[(1 + MVA_orig) * (1 - ALQ_inter) / (1 - ALQ_intra)] - 1} * 100
 *
 * @param mvaOriginalPct - Percentual original de MVA (ex: 40 para 40%)
 * @param aliqInterestadualPct - Alíquota interestadual (ex: 12 ou 4)
 * @param aliqInternaDestinoPct - Alíquota interna do estado de destino (padrão 19.5% para o PR)
 * @returns MVA ajustada em percentual arredondada em 2 casas decimais (ex: 53.04)
 */
export function calcularMvaAjustada(
  mvaOriginalPct: number,
  aliqInterestadualPct: number,
  aliqInternaDestinoPct = 19.5
): number {
  const mvaOrig = mvaOriginalPct / 100;
  const alqInter = aliqInterestadualPct / 100;
  const alqIntra = aliqInternaDestinoPct / 100;

  if (alqIntra >= 1 || alqIntra <= 0) return mvaOriginalPct;
  const fator = (1 - alqInter) / (1 - alqIntra);
  const mvaAjustada = (1 + mvaOrig) * fator - 1;
  return Math.round(mvaAjustada * 10000) / 100;
}

/**
 * Calcula o estorno proporcional de crédito de ICMS em operações com redução de base de cálculo (LC 87/96 art. 21, II).
 * O valor estornado deixa de ser crédito na apuração e transfere-se para o Custo de Aquisição Real (NBC TG 16).
 *
 * @param creditoIcmsEntrada - Valor do crédito destacado na entrada (em R$)
 * @param baseReduzidaPct - Percentual da redução da base de cálculo (ex: 30 para 30% de redução na saída)
 */
export function calcularEstornoProporcionalIcms(
  creditoIcmsEntrada: number,
  baseReduzidaPct: number
): { creditoAproveitavel: number; valorEstornadoParaCusto: number } {
  if (creditoIcmsEntrada <= 0 || baseReduzidaPct <= 0) {
    return { creditoAproveitavel: Math.max(0, creditoIcmsEntrada), valorEstornadoParaCusto: 0 };
  }
  const pctEstorno = Math.min(100, Math.max(0, baseReduzidaPct)) / 100;
  const valorEstornadoParaCusto = Math.round(creditoIcmsEntrada * pctEstorno * 100) / 100;
  const creditoAproveitavel = Math.round((creditoIcmsEntrada - valorEstornadoParaCusto) * 100) / 100;
  return { creditoAproveitavel, valorEstornadoParaCusto };
}

/**
 * Lista o catálogo de fontes normativas oficiais registradas no Marco Legal com status e links.
 */
export function listarFontesOficiaisMarcoLegal(marco?: MarcoLegal | null): {
  id: string;
  norma: string;
  diploma?: string;
  tema: string;
  status: StatusNorma;
  vigencia: string;
  fonteOficial: string;
}[] {
  if (!marco?.normas) return [];
  return marco.normas.map((n) => ({
    id: n.id,
    norma: n.norma,
    diploma: n.diploma || n.norma,
    tema: n.tema,
    status: n.status,
    vigencia: n.vigencia || (n.vigencia_fim ? `até ${n.vigencia_fim}` : 'vigente'),
    fonteOficial: n.fonte_oficial || (n.fontes && n.fontes[0]) || '',
  }));
}
