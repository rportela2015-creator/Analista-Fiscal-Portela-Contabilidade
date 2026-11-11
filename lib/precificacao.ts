/**
 * Motor de custeio e precificação pós-Reforma Tributária (IBS/CBS/IS/ICMS) — funções puras.
 *
 * Contrato: nenhuma E/S aqui. O chamador injeta `Reforma` (tabelas oficiais) e `MarcoLegal` (rules/marco-legal.json).
 * Percentuais entram e saem em %, valores em R$ por unidade. Arredondamento half-up a cada campo fiscal,
 * como na NF-e. O oráculo numérico é o motor Python (Decimal) — ver tests/precificacao.test.mjs.
 *
 * Suporte completo a 4 regimes tributários:
 *  - simples (DAS unificado com ICMS e IBS/CBS integrados)
 *  - simples_hibrido (DAS reduzido + IBS/CBS apurados no regime regular por fora com crédito B2B)
 *  - presumido (PIS/COFINS cumulativo 3,65% sem crédito de entrada; IRPJ/CSLL presumidos 2,28%)
 *  - real (PIS/COFINS não cumulativo 9,25% com crédito integral de entrada; IRPJ/CSLL sobre LAIR)
 */
import type { ClassTrib, Reforma, Record8 } from './data';
import type { PrecificacaoItemInput } from './extrator-nfe-types';
import {
  alertasDeStatus,
  aliquotasDoAno,
  citar,
  reducaoDoClassTrib,
  icmsInterestadual,
  icmsInternoUf,
  calcularDasEfetivo,
  irpjCsllPresumidoPct,
  calcularMvaAjustada,
  calcularEstornoProporcionalIcms,
  mapearCfopEntrada,
  detectarReducoesFiscaisPorNcm,
  calcularReducaoConvenioIcms,
  calcularDifalDetalhado,
  calcularDetalhamentoSimplesHibrido,
  obterFcpPorUf,
  type DestinacaoMercadoria,
  type AliquotasAno,
  type MarcoLegal,
  type RegimeTributario,
  type DetalhamentoSimplesHibrido,
} from './marco-legal';

export const r2 = (x: number): number => {
  const s = x < 0 ? -1 : 1;
  return (s * Math.round(Number((Math.abs(x) * 100).toPrecision(14)))) / 100;
};
const pc = (x: number) => x / 100;

export type RegimePisCofins2026 = 'cumulativo' | 'monofasico_st' | 'nao_cumulativo';
export type ModoCredito = 'integral' | 'vp' | 'nenhum';

export type ItemPreco = {
  codigo: string;
  descricao: string;
  ncm?: string;
  cst?: string;
  cClassTrib?: string;
  cstIcms?: string;
  csosn?: string;
  origemMercadoria?: string;
  crtEmitente?: '1' | '2' | '3' | '4';
  modFrete?: '0' | '1' | '2' | '9';
  pesoBruto?: number;
  cfopEntradaMapeado?: string;
  pRedBC?: number;
  pRedBCST?: number;
  vICMSDeson?: number;
  motDesICMS?: string;
  pMVAST?: number;
  pisCofinsMonofasico?: boolean;
  temSt?: boolean;
  infAdProd?: string;
  aliquotaCreditoIcmsSimplesPct?: number;
  dispensaEstornoEntrada?: boolean;
  baseReduzidaSaidaPct?: number;
  tipoEstabelecimento?: 'comercio' | 'industria';
  destinacao?: DestinacaoMercadoria;
  ufOrigem?: string;
  ufDestino?: string;
  quantidade: number;
  valorBrutoEntrada: number;
  freteSeguroOutrasEntrada?: number;
  descontoIncondicionalEntrada?: number;
  ipiEntrada?: number;
  isEntrada?: number;
  icmsStEntrada?: number;
  iiEntrada?: number;
  /** totais do LOTE destacados na NF-e de entrada */
  credCbsEntrada?: number;
  credIbsEntrada?: number;
  credIcmsEntrada?: number;
  credPisCofinsEntrada?: number;
  /** % de redução (use `reducaoDoClassTrib` para derivar da tabela oficial) */
  pRedCbs?: number;
  pRedIbs?: number;
  estoqueAbertura?: boolean;
  regimePisCofins2026?: RegimePisCofins2026;
  origem?: 'nacional' | 'importado';
  pisCofinsImportacaoPagoUnit?: number;
};

export interface AliquotasSugeridas {
  ipiPct: number;
  iiPct: number;
  icmsCompraPct: number;
  icmsVendaPct: number;
  pisCofinsCompraPct: number;
  pisCofinsVendaPct: number;
  cbsPct: number;
  ibsPct: number;
  reducaoIbsCbsPct: number;
  isPct: number;
  dasEfetivoPct: number;
  dasReduzidoHibridoPct: number;
  irpjCsllEfetivoPct: number;
}

export interface SugestaoResultado {
  aliquotasSugeridas: AliquotasSugeridas;
  aliquotasAplicadas: AliquotasSugeridas;
  camposEditados: (keyof AliquotasSugeridas)[];
}

export interface ComposicaoCusto {
  valorProdutoBruto: number;
  descontosIncondicionais: number;
  freteSeguroOutros: number;
  tributosNaoRecuperaveis: {
    ipi: number;
    icmsSt: number;
    ii: number;
    impostoSeletivo: number;
    tributosEntradaNaoAproveitados: number;
    total: number;
  };
  impostosARecuperar: {
    creditoIcms: number;
    creditoPisCofins: number;
    creditoCbs: number;
    creditoIbs: number;
    totalImpostosRecuperaveis: number;
  };
  custoAquisicaoReal: number;
  custoUnitarioReal: number;
  glosado: boolean;
  motivoGlosa?: string;
}

export interface AnaliseVrlEArbitramento {
  valorRealizavelLiquido: number;
  requerProvisaoImpairment: boolean;
  valorProvisaoUnitaria: number;
  custoArbitradoRir2018: number;
}

export interface PontoEquilibrioContabil {
  pecVolume: number;
  pecValor: number;
}

export interface RelatorioMargens {
  regime: RegimeTributario;
  custoAquisicaoReal: number;
  precoVendaLiquido: number;
  tributosVendaPorDentro: number;
  ivaDualPorFora: number;
  precoVendaFinalNota: number;
  splitPaymentRetido: number;
  creditoTransferidoClienteB2B: number;
  margemSugeridaPct: number;
  margemSugeridaValor: number;
  provisaoIrpjCsll: number;
  margemLiquidaValor: number;
  margemLiquidaPct: number;
  margemContribuicaoUnitaria?: number;
  pontoEquilibrioContabil?: PontoEquilibrioContabil;
  analiseVrlEArbitramento?: AnaliseVrlEArbitramento;
}

export interface ComparativoRegimesResultado {
  regimes: Record<RegimeTributario, RelatorioMargens>;
  melhorMargemLiquida: {
    regime: RegimeTributario;
    margemLiquidaValor: number;
    margemLiquidaPct: number;
  };
  melhorCompetitividadeB2B: {
    regime: RegimeTributario;
    creditoTransferido: number;
    custoEfetivoClienteB2B: number;
  };
  analiseSimplesHibrido?: DetalhamentoSimplesHibrido;
}

export type ParamsPreco = {
  ano: number;
  uf?: string;
  regime?: RegimeTributario;
  documentoInidoneo?: boolean;
  destinoItem?: DestinacaoMercadoria | 'revenda';
  rbt12Simples?: number;
  /** substitui o cálculo por ano (testes/cenários) */
  aliquotasOverride?: { cbs: number; ibs: number; icmsFator?: number; nota?: string };
  ibsMunicipalRefPct?: number;
  margemLiquidaPct: number;
  despesasVariaveisPct: number;
  baseDespesas?: 'preco_final' | 'vprodliq';
  custoFixoUnit?: number;
  irpjCsllPct?: number;
  baseIrpjCsll?: 'receita_bruta' | 'vprodliq';
  icmsSaidaPct: number;
  isSaidaPct?: number;
  deducaoLegalBaseIva?: number;
  incluirIvaNaBaseIcms?: boolean;
  aproveitarCreditoIva?: boolean;
  aproveitarCreditoIcms?: boolean;
  vprodIncluiIbsCbs?: boolean;
  estimarIvaEntrada?: boolean;
  modoCreditoEstoque?: ModoCredito;
  mesApropriacao?: number;
  mesVenda?: number;
  taxaDescontoMensalPct?: number;
  overrides?: Partial<AliquotasSugeridas>;
  custosFixosTotaisPeriodo?: number;
  tipoEstabelecimento?: 'comercio' | 'industria';
  destinacao?: DestinacaoMercadoria;
  baseReduzidaSaidaPct?: number;
  pisCofinsMonofasico?: boolean;
  temSt?: boolean;
  operacaoInternaPRB2B?: boolean;
  destinatarioContribuinte?: boolean;
  dispensaEstornoEntrada?: boolean;
};

export type Ctx = { reforma: Reforma | null; marco: MarcoLegal };

export type CreditoEstoque = {
  elegivel: boolean;
  motivo: string;
  nominal: number;
  valorPresente: number;
  aplicadoNoCusto: number;
  modo: ModoCredito;
  cronograma: { mesRelJan2027: number; valorUnit: number }[];
};

export type ResultadoDetalhado = {
  item: { codigo: string; descricao: string; ncm?: string; cst?: string; cClassTrib?: string };
  ano: number;
  aliquotasPct: { cbs: number; ibs: number; icms: number; is: number };
  calendario: string;
  entrada: {
    desembolsoUnit: number;
    ivaEstimado: boolean;
    custoAntesCreditoEstoque: number;
    creditoEstoque: CreditoEstoque;
    creditoCbsUnit: number;
    creditoIbsUnit: number;
    creditoIcmsUnit: number;
    custoLiquido: number;
    custoBase: number;
  };
  preco: {
    vProdLiq: number;
    vIS: number;
    vBcIbsCbs: number;
    vCBS: number;
    vIBS: number;
    vBcIcms: number;
    vICMS: number;
    precoFinal: number;
    markupSobreCustoLiquido: number | null;
  };
  resultado: {
    despesasVariaveis: number;
    irpjCsll: number;
    lucroLiquido: number;
    margemRealizadaPct: number;
    margemContribuicaoUnit: number;
    indiceMcPct: number;
    precoPisoLucroZero: number;
    precoPisoContribuicao: number;
    cargaIndiretaPctPreco: number;
  };
  apuracaoCaixa: {
    cbsLiquidoCorrente: number;
    ibsLiquidoCorrente: number;
    icmsLiquido: number;
    cbsEconomicoAposCreditoEstoque: number;
    cbsCaixaNoMesDaVenda: number;
    creditoEstoqueDisponivelNoMes: number;
    retencaoSplitIva: number;
    entradaLiquidaConta: number;
  };
  baseLegal: ReturnType<typeof citar>;
  alertas: string[];
  composicaoCusto?: ComposicaoCusto;
  relatorioMargens?: RelatorioMargens;
};

export type ResultadoResumido = {
  item: string;
  ano: number;
  custoLiquido: number;
  vProdLiq: number;
  precoFinal: number;
  tributosSaida: { vCBS: number; vIBS: number; vICMS: number; vIS: number };
  lucroLiquido: number;
  margemRealizadaPct: number;
  precoPisoLucroZero: number;
  cbsCaixaMesVenda: number;
  alertas: string[];
};

// ---------------------------------------------------------------------------------------------
// crédito presumido de CBS sobre estoque de abertura (parâmetros em marco-legal.json)
// ---------------------------------------------------------------------------------------------
export function creditoEstoqueAbertura(
  it: ItemPreco,
  p: ParamsPreco,
  custoAquisicaoUnit: number,
  marco: MarcoLegal
): CreditoEstoque {
  const cfg = marco.parametros.credito_estoque;
  const modo = p.modoCreditoEstoque ?? 'integral';
  const vazio = (motivo: string): CreditoEstoque => ({
    elegivel: false,
    motivo,
    nominal: 0,
    valorPresente: 0,
    aplicadoNoCusto: 0,
    modo,
    cronograma: [],
  });
  if (!it.estoqueAbertura) return vazio('item não é estoque de abertura');
  const regime = it.regimePisCofins2026 ?? 'nao_cumulativo';
  if (!cfg.regimes_elegiveis.includes(regime))
    return vazio(cfg.regimes_inelegiveis[regime] || `regime ${regime} sem direito ao crédito presumido`);
  const mesAprop = p.mesApropriacao ?? 1;
  if (mesAprop < 1 || mesAprop > cfg.mes_limite_apropriacao)
    throw new Error(
      `mesApropriacao deve estar entre 1 e ${cfg.mes_limite_apropriacao} (apropriação até junho/${cfg.ano_base}).`
    );
  const importado = it.origem === 'importado';
  const nominal = importado ? it.pisCofinsImportacaoPagoUnit ?? 0 : r2(custoAquisicaoUnit * pc(cfg.aliquota_pct));
  const n = cfg.parcelas,
    parcela = r2(nominal / n),
    t = pc(p.taxaDescontoMensalPct ?? 0);
  const cronograma: CreditoEstoque['cronograma'] = [];
  let vp = 0;
  for (let k = 1; k <= n; k++) {
    const mes = mesAprop + k; // 1ª parcela: período seguinte à apropriação
    const val = k < n ? parcela : r2(nominal - parcela * (n - 1));
    cronograma.push({ mesRelJan2027: mes, valorUnit: val });
    vp += val / Math.pow(1 + t, mes);
  }
  const valorPresente = r2(vp);
  const aplicado = modo === 'integral' ? nominal : modo === 'vp' ? valorPresente : 0;
  return {
    elegivel: true,
    motivo: importado ? 'ok (importado: PIS/COFINS-Importação efetivamente pago)' : 'ok',
    nominal,
    valorPresente,
    aplicadoNoCusto: aplicado,
    modo,
    cronograma,
  };
}

// ---------------------------------------------------------------------------------------------
// núcleo algébrico
// ---------------------------------------------------------------------------------------------
function coef(a: number, s: number, ci: number, ded: number, dentro: boolean) {
  const k = dentro ? ((1 + s) * (1 + ci)) / (1 - a) : (1 + s) * (1 / (1 - a) + ci);
  const m = dentro ? (-ci * ded) / (1 - a) : -ci * ded;
  return { k, m, kr: k - ci * (1 + s), mr: m + ci * ded };
}

function resolveVL(
  custo: number,
  mg: number,
  dv: number,
  ir: number,
  baseDv: string,
  baseIr: string,
  c: ReturnType<typeof coef>
): number {
  const dP = baseDv === 'preco_final' ? dv : 0,
    dL = dv - dP;
  const irR = baseIr === 'receita_bruta' ? ir : 0,
    irL = ir - irR;
  const den = 1 - mg - dL - irL - dP * c.k - irR * c.kr;
  if (den <= 0)
    throw new Error('Margem + despesas + IRPJ/CSLL inviáveis: nenhum preço fecha a conta (denominador <= 0).');
  return (custo + dP * c.m + irR * c.mr) / den;
}

function validar(it: ItemPreco, p: ParamsPreco) {
  if (!(it.quantidade > 0)) throw new Error('quantidade deve ser > 0');
  if (!(p.icmsSaidaPct >= 0 && p.icmsSaidaPct < 100)) throw new Error('ICMS fora de [0,100)');
  if ((p.deducaoLegalBaseIva ?? 0) < 0) throw new Error('deducaoLegalBaseIva < 0');
}

/**
 * Sugere alíquotas oficiais conforme NCM, ClassTrib, ano e regime,
 * e aplica overrides manuais registrando os campos editados.
 */
export function sugerirAliquotasPrecificacao(params: {
  ncm: string;
  cClassTrib?: string;
  cstIcms?: string;
  csosn?: string;
  temSt?: boolean;
  operacaoInternaPRB2B?: boolean;
  destinatarioContribuinte?: boolean;
  ano: number;
  regime: RegimeTributario;
  ufOrigem?: string;
  ufDestino?: string;
  faixaSimples?: number;
  rbt12?: number;
  dadosNcm?: any;
  dadosReforma?: any;
  marco?: MarcoLegal;
  overrides?: Partial<AliquotasSugeridas>;
}): SugestaoResultado {
  const { ncm, cClassTrib, ano, regime, dadosNcm, dadosReforma, marco, overrides } = params;
  const ufOrigem = (params.ufOrigem || 'PR').toUpperCase();
  const ufDestino = (params.ufDestino || 'PR').toUpperCase();

  // Consulta O(1) às reduções fiscais e convênios correlatos
  const reducoesNcm = detectarReducoesFiscaisPorNcm(ncm, ufDestino, marco);

  // IPI e II do NCM
  const ipiPct = typeof dadosNcm?.ipi === 'number' ? dadosNcm.ipi : 0;
  const iiPct = typeof dadosNcm?.ii === 'number' ? dadosNcm.ii : 0;

  // ICMS compra (interestadual ou interno)
  let icmsCompraPct = 18;
  if (marco) {
    if (ufOrigem !== ufDestino) {
      icmsCompraPct = icmsInterestadual(marco, ufOrigem, ufDestino, dadosNcm?.importado ?? false);
    } else {
      icmsCompraPct = icmsInternoUf(marco, ufOrigem);
    }
  }

  // ICMS venda (Regra 2: se ST retida anteriormente ou substituída, ICMS de saída é 0)
  const isStSubstituido =
    params.cstIcms === '60' ||
    params.csosn === '500' ||
    Boolean(params.temSt);
  let icmsVendaPct = isStSubstituido ? 0 : (marco ? icmsInternoUf(marco, ufDestino) : 18);

  // Se houver benefício/convênio no PR (ex: Máquinas Agrícolas 5,6% ou diferimento parcial)
  if (reducoesNcm?.icms?.aliqEfetivaSugeridaPct !== undefined && !isStSubstituido) {
    icmsVendaPct = reducoesNcm.icms.aliqEfetivaSugeridaPct;
  }

  // Diferimento Parcial B2B no Paraná (Art. 28 Anexo VIII RICMS/PR -> 12% efetivo)
  const isOperacaoB2BPr =
    (params.operacaoInternaPRB2B === true ||
      (ufOrigem === 'PR' && ufDestino === 'PR' && params.destinatarioContribuinte !== false)) &&
    !isStSubstituido;
  if (isOperacaoB2BPr && reducoesNcm?.icms?.aliqEfetivaSugeridaPct === undefined) {
    icmsVendaPct = 12.0;
  }

  // CBS e IBS
  let cbsPct = 8.8;
  let ibsPct = 0.1;
  let reducaoIbsCbsPct = 0;

  if (ano === 2026) {
    cbsPct = 0.9;
    ibsPct = 0.1;
  } else if (ano === 2027 || ano === 2028) {
    cbsPct = 8.8;
    ibsPct = 0.1;
  } else if (ano >= 2029 && ano <= 2032) {
    const fracao = ((ano - 2028) * 10) / 100;
    cbsPct = 8.8;
    ibsPct = r2(17.7 * fracao);
  } else if (ano >= 2033) {
    cbsPct = 8.8;
    ibsPct = 17.7;
  }

  if (reducoesNcm?.reforma?.reducaoIbsCbsPct) {
    reducaoIbsCbsPct = reducoesNcm.reforma.reducaoIbsCbsPct;
  }

  if (cClassTrib && dadosReforma?.classificacoes) {
    const ct = dadosReforma.classificacoes.find((x: any) => x.c === cClassTrib);
    if (ct) {
      const red = reducaoDoClassTrib(ct, marco);
      reducaoIbsCbsPct = Math.max(red.cbs, red.ibs);
    }
  }

  // IS
  let isPct = 0;
  if (dadosNcm?.is === 1 && typeof dadosNcm.adv === 'number') {
    isPct = dadosNcm.adv;
  }

  // PIS/COFINS
  let pisCofinsCompraPct = 0;
  let pisCofinsVendaPct = 0;
  if (ano <= 2026) {
    if (regime === 'real') {
      pisCofinsCompraPct = 9.25;
      pisCofinsVendaPct = 9.25;
    } else if (regime === 'presumido') {
      pisCofinsCompraPct = 0; // cumulativo não credita
      pisCofinsVendaPct = 3.65;
    }
  }

  // DAS
  let dasEfetivoPct = 0;
  let dasReduzidoHibridoPct = 0;
  if (marco && (regime === 'simples' || regime === 'simples_hibrido')) {
    const rbt = params.rbt12 || 180000;
    const das = calcularDasEfetivo(marco, rbt);
    dasEfetivoPct = das.dasEfetivoPct;
    dasReduzidoHibridoPct = das.dasReduzidoHibridoPct;
  }

  // IRPJ/CSLL efetivo
  let irpjCsllEfetivoPct = 0;
  if (regime === 'presumido') {
    irpjCsllEfetivoPct = marco ? irpjCsllPresumidoPct(marco, 'comercio') : 2.28;
  } else if (regime === 'real') {
    // Estimativa de provisão sobre a receita operacional
    irpjCsllEfetivoPct = 4.8;
  }

  const sugeridas: AliquotasSugeridas = {
    ipiPct,
    iiPct,
    icmsCompraPct,
    icmsVendaPct,
    pisCofinsCompraPct,
    pisCofinsVendaPct,
    cbsPct,
    ibsPct,
    reducaoIbsCbsPct,
    isPct,
    dasEfetivoPct,
    dasReduzidoHibridoPct,
    irpjCsllEfetivoPct,
  };

  const aplicadas: AliquotasSugeridas = { ...sugeridas };
  const camposEditados: (keyof AliquotasSugeridas)[] = [];

  if (overrides) {
    for (const key of Object.keys(overrides) as (keyof AliquotasSugeridas)[]) {
      const val = overrides[key];
      if (val !== undefined && val !== sugeridas[key]) {
        aplicadas[key] = val;
        camposEditados.push(key);
      }
    }
  }

  return {
    aliquotasSugeridas: sugeridas,
    aliquotasAplicadas: aplicadas,
    camposEditados,
  };
}

/**
 * Rateia frete FOB e despesas acessórias externas (ex.: CT-e) proporcionalmente entre os itens.
 * - Se modFrete === '0' (CIF), ignora freteCteTotal externo (evita duplicidade).
 * - Se modFrete === '1' (FOB), distribui por 'valor' (vProd) ou 'peso' (pesoBruto).
 * - Apropria créditos sobre o frete conforme o regime do adquirente (Art. 3º, II das Leis 10.637/10.833).
 */
export function ratearDespesasAcessoriaEFrete(
  itens: PrecificacaoItemInput[],
  opcoes: {
    freteCteTotal?: number;
    icmsFreteCteTotal?: number;
    criterioRateio?: 'valor' | 'peso';
    modFrete?: '0' | '1';
    regimeDestinatario?: RegimeTributario;
    mercadoriaSujeitaSt?: boolean;
  } = {}
): PrecificacaoItemInput[] {
  const {
    freteCteTotal = 0,
    icmsFreteCteTotal = 0,
    criterioRateio = 'valor',
    modFrete = '1',
    regimeDestinatario = 'real',
    mercadoriaSujeitaSt = false,
  } = opcoes;

  // Se modFrete === '0' (CIF), ignora freteCteTotal externo (evita duplicidade de frete já embutido)
  if (modFrete === '0' || freteCteTotal <= 0 || !itens.length) {
    return itens;
  }

  const pesoTotal = itens.reduce((acc, it) => acc + (it.pesoBruto ?? 0), 0);
  const usarPeso = criterioRateio === 'peso' && pesoTotal > 0;
  const baseTotal = usarPeso
    ? pesoTotal
    : itens.reduce((acc, it) => acc + (it.valorBrutoEntrada || 0), 0);

  return itens.map((it) => {
    const fatorRateio =
      baseTotal > 0
        ? (usarPeso ? (it.pesoBruto ?? 0) : it.valorBrutoEntrada) / baseTotal
        : 1 / itens.length;

    const freteRateado = r2(freteCteTotal * fatorRateio);
    const icmsFreteRateado = r2(icmsFreteCteTotal * fatorRateio);

    let credPisCofinsFrete = 0;
    let credIcmsFrete = 0;

    if (regimeDestinatario === 'real') {
      // Art. 3º, II das Leis 10.637/02 e 10.833/03: 1,65% PIS + 7,60% COFINS = 9,25%
      credPisCofinsFrete = r2(freteRateado * 0.0925);
      // ICMS sobre o CT-e gera crédito, salvo se a mercadoria transportada for sujeita a ST
      if (!mercadoriaSujeitaSt && !it.temSt) {
        credIcmsFrete = icmsFreteRateado;
      }
    } else if (regimeDestinatario === 'presumido') {
      // PIS/COFINS cumulativo: sem crédito
      credPisCofinsFrete = 0;
      if (!mercadoriaSujeitaSt && !it.temSt) {
        credIcmsFrete = icmsFreteRateado;
      }
    } else {
      // Simples: zero crédito
      credPisCofinsFrete = 0;
      credIcmsFrete = 0;
    }

    return {
      ...it,
      freteSeguroOutrasEntrada: r2(it.freteSeguroOutrasEntrada + freteRateado),
      credPisCofinsEntrada: r2(it.credPisCofinsEntrada + credPisCofinsFrete),
      credIcmsEntrada: r2(it.credIcmsEntrada + credIcmsFrete),
      detalhesTributos: {
        ...it.detalhesTributos,
        vPIS: r2((it.detalhesTributos?.vPIS ?? 0) + r2(freteRateado * 0.0165)),
        vCOFINS: r2((it.detalhesTributos?.vCOFINS ?? 0) + r2(freteRateado * 0.076)),
        vICMS: r2((it.detalhesTributos?.vICMS ?? 0) + credIcmsFrete),
      },
    };
  });
}

/**
 * Calcula a composição contábil do Custo de Aquisição Real (NBC TG 16 / OT CFC 01/2026).
 */
export function calcularCustoAquisicaoReal(
  it: ItemPreco,
  regime: RegimeTributario = 'presumido',
  opts: {
    documentoInidoneo?: boolean;
    destinoItem?: string;
    tipoEstabelecimento?: 'comercio' | 'industria';
    ufOrigem?: string;
    ufDestino?: string;
    baseReduzidaSaidaPct?: number;
    marco?: MarcoLegal | null;
  } = {}
): ComposicaoCusto {
  const q = it.quantidade > 0 ? it.quantidade : 1;
  const vProd = it.valorBrutoEntrada;
  const vDesc = it.descontoIncondicionalEntrada ?? 0;
  const frete = it.freteSeguroOutrasEntrada ?? 0;
  const ipi = it.ipiEntrada ?? 0;
  const isVal = it.isEntrada ?? 0;
  let icmsSt = it.icmsStEntrada ?? 0;
  const ii = it.iiEntrada ?? 0;

  const glosado = opts.documentoInidoneo === true || opts.destinoItem === 'uso_consumo';
  const motivoGlosa = opts.documentoInidoneo
    ? 'Documento fiscal inidôneo: vedada a apropriação de quaisquer créditos fiscais (LC 214/2025).'
    : opts.destinoItem === 'uso_consumo'
    ? 'Destinação para uso e consumo: créditos de ICMS/PIS/COFINS glosados por vedação legal.'
    : undefined;

  let credIcms = 0;
  let credPisCofins = 0;
  let credCbs = 0;
  let credIbs = 0;
  let tribNaoAprov = 0;

  // DIFAL de Uso/Consumo ou Ativo Imobilizado (calculado antes para integrar tribNaoAprov mesmo se houver vedação de crédito)
  const isUsoOuAtivo =
    opts.destinoItem === 'uso_consumo' ||
    opts.destinoItem === 'ativo_imobilizado' ||
    it.destinacao === 'uso_consumo' ||
    it.destinacao === 'ativo_imobilizado';
  const ufOrig = opts.ufOrigem || it.ufOrigem;
  const ufDest = opts.ufDestino || it.ufDestino || 'PR';

  let difalDevido = 0;
  if (isUsoOuAtivo && ufOrig && ufDest && ufOrig !== ufDest) {
    const aliqInterDifal = ['1', '2', '3', '8'].includes(it.origemMercadoria || '') ? 4 : 12;
    const aliqIntraDifal = 19.5;
    const valorBaseOperacao = vProd - vDesc + frete + ipi;

    // Real e Presumido: Base Dupla Contribuinte (art. 155 §2º VII CF/88 c/c Lei 190/2021)
    // Simples e Simples Híbrido: Base Única
    const metodologiaDifal = (regime === 'real' || regime === 'presumido') ? 'base_dupla' : 'base_unica';
    const difalCalc = calcularDifalDetalhado({
      valorOperacao: valorBaseOperacao,
      aliqInterestadualPct: aliqInterDifal,
      aliqInternaDestinoPct: aliqIntraDifal,
      ufDestino: ufDest,
      metodologia: metodologiaDifal,
      incluirFcp: true,
      marco: opts.marco,
    });

    difalDevido = difalCalc.valorTotalDevidoDestino;
  }

  const isFornecedorSimples = it.crtEmitente === '1' || it.crtEmitente === '2' || (Boolean(it.csosn) && !it.cstIcms);

  if (!glosado) {
    switch (regime) {
      case 'simples':
        // Simples tradicional não se credita de nada na entrada
        tribNaoAprov = (it.credIcmsEntrada ?? 0) + (it.credCbsEntrada ?? 0) + (it.credIbsEntrada ?? 0);
        break;

      case 'simples_hibrido':
        // Simples Híbrido credita IBS e CBS no regime regular, mas não ICMS
        credCbs = it.credCbsEntrada ?? 0;
        credIbs = it.credIbsEntrada ?? 0;
        tribNaoAprov = it.credIcmsEntrada ?? 0;
        break;

      case 'presumido':
        // Lucro Presumido credita ICMS e IBS/CBS; PIS/COFINS é cumulativo (sem crédito)
        credIcms = it.credIcmsEntrada ?? 0;
        credCbs = it.credCbsEntrada ?? 0;
        credIbs = it.credIbsEntrada ?? 0;
        tribNaoAprov = it.credPisCofinsEntrada ?? 0;
        break;

      case 'real':
        // Lucro Real credita integralmente ICMS, PIS/COFINS, CBS e IBS
        credIcms = it.credIcmsEntrada ?? 0;
        credPisCofins = it.credPisCofinsEntrada ?? 0;
        credCbs = it.credCbsEntrada ?? 0;
        credIbs = it.credIbsEntrada ?? 0;
        break;
    }

    // Regra 1: Fornecedor Simples Nacional (Art. 3º §2º II Leis 10.637/02 e 10.833/03)
    if (isFornecedorSimples) {
      // Bloqueia integralmente crédito de PIS e COFINS no adquirente (mesmo no Lucro Real)
      if (credPisCofins > 0) {
        tribNaoAprov += credPisCofins;
        credPisCofins = 0;
      }
      // Crédito de ICMS: permitido se informado alíquota em <pCredSN> ou <infAdProd> (Art. 23 LC 123/2006).
      // Se houver aliquotaCreditoIcmsSimplesPct e estiver no Real ou Presumido:
      const aliqSimples = it.aliquotaCreditoIcmsSimplesPct ?? 0;
      if (aliqSimples > 0 && (regime === 'real' || regime === 'presumido') && credIcms === 0) {
        credIcms = r2((vProd - vDesc) * (aliqSimples / 100));
      } else if (['102', '103', '300', '400', '500'].includes(it.csosn || '') && aliqSimples === 0) {
        tribNaoAprov += credIcms;
        credIcms = 0;
      }
    }

    // Regra 2: Substituição Tributária Anterior ou Retida (CST 60 / CSOSN 500 ou vICMSST > 0)
    // No comércio revendedor substituído, o ICMS próprio não gera crédito de entrada
    if (it.cstIcms === '60' || it.csosn === '500' || (it.icmsStEntrada ?? 0) > 0) {
      if (credIcms > 0) {
        tribNaoAprov += credIcms;
        credIcms = 0;
      }
    }

    // Regra 3: Inclusão do IPI na Base de ST e Provisionamento de Antecipação ST no PR
    const tipoEstab = opts.tipoEstabelecimento || it.tipoEstabelecimento || 'comercio';
    const ufOrig = opts.ufOrigem || it.ufOrigem;
    const ufDest = opts.ufDestino || it.ufDestino || 'PR';
    if (
      tipoEstab === 'comercio' &&
      (it.temSt || Boolean(it.pMVAST) || ['10', '30', '70'].includes(it.cstIcms || '')) &&
      (it.icmsStEntrada ?? 0) === 0 &&
      ufOrig &&
      ufDest === 'PR' &&
      ufOrig !== 'PR'
    ) {
      const aliqInterST = ['1', '2', '3', '8'].includes(it.origemMercadoria || '') ? 4 : 12;
      const aliqIntraPR = 19.5;
      const mvaOrig = it.pMVAST || 40;
      const mvaAjustada = calcularMvaAjustada(mvaOrig, aliqInterST, aliqIntraPR);
      const baseCalculoSt = (vProd - vDesc + frete + ipi) * (1 + mvaAjustada / 100);
      const icmsProprioOrigem = (vProd - vDesc + frete) * (aliqInterST / 100);
      const icmsStAntecipado = Math.max(0, r2(baseCalculoSt * (aliqIntraPR / 100) - icmsProprioOrigem));
      icmsSt += icmsStAntecipado;
    }

    // Regra 4: Estorno Proporcional por Redução de Base na Saída (RICMS/PR Anexo II)
    // Se houver dispensaEstornoEntrada (Convênio 52/91 Item 22 Anexo VI RICMS/PR), valorEstornadoParaCusto = 0
    const dispensaEstorno = Boolean(it.dispensaEstornoEntrada);
    const baseRedSaida = opts.baseReduzidaSaidaPct ?? it.baseReduzidaSaidaPct;
    if (baseRedSaida !== undefined && baseRedSaida < 100 && credIcms > 0 && !dispensaEstorno) {
      const estorno = calcularEstornoProporcionalIcms(credIcms, 100 - baseRedSaida);
      tribNaoAprov += estorno.valorEstornadoParaCusto;
      credIcms = estorno.creditoAproveitavel;
    }
  } else {
    // Quando glosado, todos os tributos destacados que seriam créditos viram custo
    tribNaoAprov =
      (it.credIcmsEntrada ?? 0) +
      (it.credPisCofinsEntrada ?? 0) +
      (it.credCbsEntrada ?? 0) +
      (it.credIbsEntrada ?? 0);
  }

  // Agrega o DIFAL devido aos tributos não recuperáveis
  tribNaoAprov += difalDevido;

  const totalTribNaoRecup = r2(ipi + isVal + icmsSt + ii + tribNaoAprov);
  const totalImpostosRecup = r2(credIcms + credPisCofins + credCbs + credIbs);

  const custoAquisicaoReal = r2(vProd - vDesc + frete + totalTribNaoRecup - totalImpostosRecup);
  const custoUnitarioReal = r2(custoAquisicaoReal / q);

  return {
    valorProdutoBruto: vProd,
    descontosIncondicionais: vDesc,
    freteSeguroOutros: frete,
    tributosNaoRecuperaveis: {
      ipi,
      icmsSt,
      ii,
      impostoSeletivo: isVal,
      tributosEntradaNaoAproveitados: tribNaoAprov,
      total: totalTribNaoRecup,
    },
    impostosARecuperar: {
      creditoIcms: credIcms,
      creditoPisCofins: credPisCofins,
      creditoCbs: credCbs,
      creditoIbs: credIbs,
      totalImpostosRecuperaveis: totalImpostosRecup,
    },
    custoAquisicaoReal,
    custoUnitarioReal,
    glosado,
    motivoGlosa,
  };
}

export function simular(it: ItemPreco, p: ParamsPreco, ctx: Ctx): ResultadoDetalhado {
  validar(it, p);
  const { marco } = ctx;
  const alertas: string[] = [];
  const normas = new Set<string>(['LC214-12-2', 'NT-2026-008']);

  const regime: RegimeTributario = p.regime || 'presumido';

  // --- alíquotas do ano (oficiais + marco legal) ---
  let al: AliquotasAno;
  if (p.aliquotasOverride) {
    const o = p.aliquotasOverride;
    al = {
      ano: p.ano,
      cbs: o.cbs,
      ibsUf: o.ibs,
      ibsMun: 0,
      ibs: o.ibs,
      icmsFator: o.icmsFator ?? 1,
      fonte: o.nota ?? 'override',
      notas: [],
    };
    alertas.push('Alíquotas informadas manualmente (override) — não derivadas da tabela oficial.');
  } else {
    al = aliquotasDoAno(ctx.reforma, marco, p.ano, p.uf ?? 'PR', { ibsMunicipalRefPct: p.ibsMunicipalRefPct });
    alertas.push(...al.notas);
    if (p.ano <= 2028) normas.add('ADCT127-LC214-344-347');
    else normas.add('EC132-TRANSICAO-2029-2033');
  }

  // Se houver overrides específicos de CBS/IBS
  const cbsPctEfetivo = p.overrides?.cbsPct !== undefined ? p.overrides.cbsPct : al.cbs;
  const ibsPctEfetivo = p.overrides?.ibsPct !== undefined ? p.overrides.ibsPct : al.ibs;
  const redPctEfetivo =
    p.overrides?.reducaoIbsCbsPct !== undefined ? p.overrides.reducaoIbsCbsPct : (it.pRedCbs ?? 0);

  const c = pc(cbsPctEfetivo) * (1 - pc(redPctEfetivo));
  const i = pc(ibsPctEfetivo) * (1 - pc(p.overrides?.reducaoIbsCbsPct !== undefined ? p.overrides.reducaoIbsCbsPct : (it.pRedIbs ?? 0)));
  // Se ST com cadeia encerrada (CST 60, CSOSN 500 ou ST retida), alíquota de saída é 0
  const isStSubstituido =
    it.cstIcms === '60' ||
    it.csosn === '500' ||
    (it.icmsStEntrada ?? 0) > 0 ||
    Boolean(p.temSt ?? it.temSt);

  const icmsSaidaEfetivoPct =
    p.overrides?.icmsVendaPct !== undefined
      ? p.overrides.icmsVendaPct
      : isStSubstituido
      ? 0
      : p.icmsSaidaPct;

  const a = pc(icmsSaidaEfetivoPct) * al.icmsFator;
  const s = pc(p.overrides?.isPct !== undefined ? p.overrides.isPct : (p.isSaidaPct ?? 0));
  const q = it.quantidade;
  const dentro = p.incluirIvaNaBaseIcms ?? marco.parametros.icms.base_inclui_iva_padrao;
  if (dentro && a > 0) normas.add('SEFA-PR-CONS-48-2026');
  if ((p.isSaidaPct ?? 0) > 0 || (p.overrides?.isPct ?? 0) > 0) normas.add('IS-LC214');
  if (isStSubstituido) {
    alertas.push('Mercadoria sujeita a ICMS-ST / retida anteriormente (CST 60/CSOSN 500): ICMS na saída zerado (cadeia encerrada).');
  }

  // --- Composição Contábil do Custo de Aquisição Real ---
  const compCusto = calcularCustoAquisicaoReal(it, regime, {
    documentoInidoneo: p.documentoInidoneo,
    destinoItem: p.destinoItem || it.destinacao,
    tipoEstabelecimento: p.tipoEstabelecimento || it.tipoEstabelecimento,
    ufOrigem: it.ufOrigem,
    ufDestino: p.uf || it.ufDestino,
    baseReduzidaSaidaPct: p.baseReduzidaSaidaPct ?? it.baseReduzidaSaidaPct,
    marco,
  });
  if (compCusto.glosado && compCusto.motivoGlosa) {
    alertas.push(compCusto.motivoGlosa);
  }

  // --- motor 1: custeio de entrada ---
  const base = it.valorBrutoEntrada + (it.freteSeguroOutrasEntrada ?? 0) - (it.descontoIncondicionalEntrada ?? 0);
  let credCbs = it.credCbsEntrada ?? 0,
    credIbs = it.credIbsEntrada ?? 0;
  let ivaPorFora = !(p.vprodIncluiIbsCbs ?? marco.parametros.nfe.vprod_inclui_ibs_cbs);
  let estimado = false;
  if (!it.estoqueAbertura && (p.estimarIvaEntrada ?? true) && credCbs === 0 && credIbs === 0) {
    const baseIva = base - (it.credIcmsEntrada ?? 0); // base do IVA exclui ICMS (art. 12 §2º V) e IPI
    credCbs = r2(baseIva * c);
    credIbs = r2(baseIva * i);
    ivaPorFora = true;
    estimado = true;
    alertas.push('IBS/CBS de entrada ESTIMADOS pelas alíquotas do ano; use o valor destacado na NF-e quando houver.');
  }
  const desembolso = base + (it.ipiEntrada ?? 0) + (it.isEntrada ?? 0) + (ivaPorFora ? credCbs + credIbs : 0);
  const recIva = p.aproveitarCreditoIva === false ? 0 : credCbs + credIbs;
  const recIcms = p.aproveitarCreditoIcms === false ? 0 : it.credIcmsEntrada ?? 0;
  const custoPre = r2((desembolso - recIva - recIcms) / q);

  const cr = creditoEstoqueAbertura(it, p, custoPre, marco);
  if (it.estoqueAbertura) {
    normas.add('LC214-381');
    normas.add('CPC16-R3');
    if (cr.modo === 'vp') normas.add('CPC12-AVP');
  }
  if (it.estoqueAbertura && !cr.elegivel) alertas.push(`Sem crédito de estoque: ${cr.motivo}.`);
  if (cr.elegivel && cr.modo === 'integral')
    alertas.push(
      `Crédito de estoque abatido do custo pelo valor nominal; o caixa só libera 1/${
        marco.parametros.credito_estoque.parcelas
      } por mês a partir do mês ${(p.mesApropriacao ?? 1) + 1}. VP = ${cr.valorPresente}.`
    );
  if (cr.elegivel)
    alertas.push('Devolução de item do estoque de abertura estorna o crédito presumido proporcional (art. 381).');
  const custoLiq = custoPre - cr.aplicadoNoCusto;
  const custoFixo = p.custoFixoUnit ?? 0;
  const custoBase = custoLiq + custoFixo;

  // --- motor 2: vProdLiq (sistema linear) ---
  const mg = pc(p.margemLiquidaPct),
    dv = pc(p.despesasVariaveisPct ?? 0),
    ir = pc(p.overrides?.irpjCsllEfetivoPct !== undefined ? p.overrides.irpjCsllEfetivoPct : (p.irpjCsllPct ?? 0));
  const baseDv = p.baseDespesas ?? 'preco_final',
    baseIr = p.baseIrpjCsll ?? 'receita_bruta';
  const ded = p.deducaoLegalBaseIva ?? 0;
  const co = coef(a, s, c + i, ded, dentro);
  const vl = r2(resolveVL(custoBase, mg, dv, ir, baseDv, baseIr, co));
  if ((1 + s) * vl < ded) throw new Error('Dedução legal maior que a base de IBS/CBS: revise deducaoLegalBaseIva.');

  // --- motor 3: tributos de saída (arredondados como na NF-e) ---
  const vIS = r2(vl * s);
  const bcIva = vl + vIS - ded;
  const vCBS = r2(bcIva * c),
    vIBS = r2(bcIva * i);
  let bcIcms = 0,
    vICMS = 0,
    preco: number;
  if (a > 0) {
    if (dentro) {
      bcIcms = r2((vl + vIS + vCBS + vIBS) / (1 - a));
      preco = bcIcms;
    } else {
      bcIcms = r2((vl + vIS) / (1 - a));
      preco = bcIcms + vCBS + vIBS;
    }
    vICMS = r2(bcIcms * a);
  } else preco = vl + vIS + vCBS + vIBS;

  // --- resultado econômico realizado ---
  const dvVal = r2(dv * (baseDv === 'preco_final' ? preco : vl));
  const receitaBruta = preco - vCBS - vIBS;
  const irVal = r2(ir * (baseIr === 'receita_bruta' ? receitaBruta : vl));
  const lucro = vl - custoBase - dvVal - irVal;
  const mc = vl - custoLiq - dvVal - irVal;
  const pisoDe = (cst: number) => r2(co.k * resolveVL(cst, 0, dv, ir, baseDv, baseIr, co) + co.m);
  const margemReal = vl > 0 ? (lucro / vl) * 100 : 0;
  if (Math.abs(margemReal - p.margemLiquidaPct) > 0.05)
    alertas.push(`Margem realizada ${r2(margemReal)}% difere do alvo por arredondamento fiscal.`);
  if ((p.irpjCsllPct ?? 0) > 0 || (p.overrides?.irpjCsllEfetivoPct ?? 0) > 0)
    alertas.push(...alertasDeStatus(marco, ['LC224-PRESUMIDO']));
  alertas.push(...alertasDeStatus(marco, ['SPLIT-PAYMENT']).slice(0, 1));
  if (dentro && a > 0)
    alertas.push("ICMS 'por dentro' com IBS/CBS/IS na base (SEFA-PR Consulta 48/2026); outras UFs/liminares podem divergir.");

  // --- apuração e caixa ---
  const cuCbs = p.aproveitarCreditoIva === false ? 0 : r2(credCbs / q);
  const cuIbs = p.aproveitarCreditoIva === false ? 0 : r2(credIbs / q);
  const cuIcms = p.aproveitarCreditoIcms === false ? 0 : r2((it.credIcmsEntrada ?? 0) / q);
  const cbsLiq = vCBS - cuCbs,
    ibsLiq = vIBS - cuIbs,
    icmsLiq = vICMS - cuIcms;
  const parcelas = marco.parametros.credito_estoque.parcelas;
  const quotasDisp = cr.elegivel ? Math.max(0, Math.min(parcelas, (p.mesVenda ?? 1) - (p.mesApropriacao ?? 1))) : 0;
  const disp = r2((cr.nominal * quotasDisp) / parcelas);

  // --- Relatório de Margens e Vantagem B2B ---
  let tributosPorDentro = vICMS;
  let creditoB2B = vCBS + vIBS + vICMS;

  if (regime === 'simples') {
    const rbt = p.rbt12Simples || 180000;
    const das = calcularDasEfetivo(marco, rbt);
    let dasPctAplicado = das.dasEfetivoPct;

    if (isStSubstituido) {
      dasPctAplicado = dasPctAplicado * (1 - das.faixa.partilha_pct.icms / 100);
      alertas.push('Simples Nacional: parcela do ICMS segregada do DAS por Substituição Tributária.');
    }
    if (p.pisCofinsMonofasico ?? it.pisCofinsMonofasico) {
      const partilhaMono = (das.faixa.partilha_pct.pis + das.faixa.partilha_pct.cofins) / 100;
      dasPctAplicado = dasPctAplicado * (1 - partilhaMono);
      alertas.push('Simples Nacional: parcelas de PIS e COFINS segregadas do DAS por regime monofásico.');
    }

    tributosPorDentro = r2(preco * (dasPctAplicado / 100));
    // No Simples comum, se houve segregação de ST, crédito transferido de ICMS é 0
    creditoB2B = isStSubstituido
      ? 0
      : r2(preco * ((das.faixa.partilha_pct.icms / 100) * (das.dasEfetivoPct / 100)));
  } else if (regime === 'simples_hibrido') {
    const rbt = p.rbt12Simples || 180000;
    const das = calcularDasEfetivo(marco, rbt);
    let dasHibridoPct = das.dasReduzidoHibridoPct;

    if (p.pisCofinsMonofasico ?? it.pisCofinsMonofasico) {
      const partilhaMono = (das.faixa.partilha_pct.pis + das.faixa.partilha_pct.cofins) / 100;
      dasHibridoPct = dasHibridoPct * (1 - partilhaMono);
      alertas.push('Simples Híbrido: parcelas de PIS e COFINS segregadas por regime monofásico.');
    }

    tributosPorDentro = r2(preco * (dasHibridoPct / 100));
    // No Simples Híbrido, transfere crédito INTEGRAL de IBS e CBS
    creditoB2B = r2(vCBS + vIBS);
  }

  // Indicadores gerenciais e contábeis:
  const precoFinalVenda = r2(preco);
  const custoUnit = compCusto.custoUnitarioReal;
  const mcUnit = r2(precoFinalVenda - custoUnit - dvVal);

  const cfTotais = p.custosFixosTotaisPeriodo ?? 0;
  const pecVolume = mcUnit > 0 && cfTotais > 0 ? r2(cfTotais / mcUnit) : 0;
  const pecValor = r2(pecVolume * precoFinalVenda);

  const vrl = r2(precoFinalVenda - dvVal);
  const requerImpairment = vrl < custoUnit;
  const provisaoUnit = requerImpairment ? r2(custoUnit - vrl) : 0;
  const tipoEst = p.tipoEstabelecimento || it.tipoEstabelecimento || 'comercio';
  const arbitramentoRir = r2(precoFinalVenda * (tipoEst === 'industria' ? 0.8 : 0.7));

  if (requerImpairment) {
    alertas.push(
      `Alerta de Impairment (CPC 16 / Lei 6.404/76): Valor Realizável Líquido (R$ ${vrl}) inferior ao Custo Real (R$ ${custoUnit}). Provisão de R$ ${provisaoUnit}/un.`
    );
  }

  const relMargens: RelatorioMargens = {
    regime,
    custoAquisicaoReal: compCusto.custoAquisicaoReal,
    precoVendaLiquido: vl,
    tributosVendaPorDentro: tributosPorDentro,
    ivaDualPorFora: r2(vCBS + vIBS + vIS),
    precoVendaFinalNota: precoFinalVenda,
    splitPaymentRetido: r2(vCBS + vIBS),
    creditoTransferidoClienteB2B: creditoB2B,
    margemSugeridaPct: p.margemLiquidaPct,
    margemSugeridaValor: r2(vl * (p.margemLiquidaPct / 100)),
    provisaoIrpjCsll: irVal,
    margemLiquidaValor: r2(lucro),
    margemLiquidaPct: r2(margemReal),
    margemContribuicaoUnitaria: mcUnit,
    pontoEquilibrioContabil: {
      pecVolume,
      pecValor,
    },
    analiseVrlEArbitramento: {
      valorRealizavelLiquido: vrl,
      requerProvisaoImpairment: requerImpairment,
      valorProvisaoUnitaria: provisaoUnit,
      custoArbitradoRir2018: arbitramentoRir,
    },
  };

  return {
    item: { codigo: it.codigo, descricao: it.descricao, ncm: it.ncm, cst: it.cst, cClassTrib: it.cClassTrib },
    ano: p.ano,
    aliquotasPct: {
      cbs: r2(c * 100),
      ibs: Math.round(i * 1e6) / 1e4,
      icms: r2(a * 100),
      is: r2(s * 100),
    },
    calendario: al.fonte,
    entrada: {
      desembolsoUnit: r2(desembolso / q),
      ivaEstimado: estimado,
      custoAntesCreditoEstoque: custoPre,
      creditoEstoque: cr,
      creditoCbsUnit: cuCbs,
      creditoIbsUnit: cuIbs,
      creditoIcmsUnit: cuIcms,
      custoLiquido: r2(custoLiq),
      custoBase: r2(custoBase),
    },
    preco: {
      vProdLiq: vl,
      vIS,
      vBcIbsCbs: r2(bcIva),
      vCBS,
      vIBS,
      vBcIcms: bcIcms,
      vICMS,
      precoFinal: r2(preco),
      markupSobreCustoLiquido: custoLiq > 0 ? Math.round((preco / custoLiq) * 1e4) / 1e4 : null,
    },
    resultado: {
      despesasVariaveis: dvVal,
      irpjCsll: irVal,
      lucroLiquido: r2(lucro),
      margemRealizadaPct: r2(margemReal),
      margemContribuicaoUnit: r2(mc),
      indiceMcPct: vl > 0 ? r2((mc / vl) * 100) : 0,
      precoPisoLucroZero: pisoDe(custoBase),
      precoPisoContribuicao: pisoDe(custoLiq),
      cargaIndiretaPctPreco: r2(((vCBS + vIBS + vICMS + vIS) / preco) * 100),
    },
    apuracaoCaixa: {
      cbsLiquidoCorrente: r2(cbsLiq),
      ibsLiquidoCorrente: r2(ibsLiq),
      icmsLiquido: r2(icmsLiq),
      cbsEconomicoAposCreditoEstoque: r2(cbsLiq - cr.nominal),
      cbsCaixaNoMesDaVenda: r2(Math.max(0, cbsLiq - disp)),
      creditoEstoqueDisponivelNoMes: disp,
      retencaoSplitIva: r2(vCBS + vIBS),
      entradaLiquidaConta: r2(preco - vCBS - vIBS),
    },
    baseLegal: citar(marco, [...normas]),
    alertas: [...new Set(alertas)],
    composicaoCusto: compCusto,
    relatorioMargens: relMargens,
  };
}

export function resumir(r: ResultadoDetalhado): ResultadoResumido {
  const top = r.alertas.slice(0, 3);
  return {
    item: `${r.item.codigo} — ${r.item.descricao}`,
    ano: r.ano,
    custoLiquido: r.entrada.custoLiquido,
    vProdLiq: r.preco.vProdLiq,
    precoFinal: r.preco.precoFinal,
    tributosSaida: { vCBS: r.preco.vCBS, vIBS: r.preco.vIBS, vICMS: r.preco.vICMS, vIS: r.preco.vIS },
    lucroLiquido: r.resultado.lucroLiquido,
    margemRealizadaPct: r.resultado.margemRealizadaPct,
    precoPisoLucroZero: r.resultado.precoPisoLucroZero,
    cbsCaixaMesVenda: r.apuracaoCaixa.cbsCaixaNoMesDaVenda,
    alertas: r.alertas.length > 3 ? [...top, `… (+${r.alertas.length - 3}; use modo detalhado)`] : top,
  };
}

/** API única: resumido (padrão) ou detalhado. */
export function precificar(
  it: ItemPreco,
  p: ParamsPreco,
  ctx: Ctx,
  modo: 'resumido' | 'detalhado' = 'resumido'
): ResultadoResumido | ResultadoDetalhado {
  const r = simular(it, p, ctx);
  return modo === 'detalhado' ? r : resumir(r);
}

/** Compara os 4 regimes tributários para o mesmo item e cenário de preço. */
export function compararQuatroRegimes(it: ItemPreco, p: ParamsPreco, ctx: Ctx): ComparativoRegimesResultado {
  const regimes: RegimeTributario[] = ['simples', 'simples_hibrido', 'presumido', 'real'];
  const res: Partial<Record<RegimeTributario, RelatorioMargens>> = {};

  for (const reg of regimes) {
    const r = simular(it, { ...p, regime: reg }, ctx);
    if (r.relatorioMargens) {
      res[reg] = r.relatorioMargens;
    }
  }

  const list = Object.values(res) as RelatorioMargens[];
  const bestMargem = [...list].sort((a, b) => b.margemLiquidaValor - a.margemLiquidaValor)[0];
  const bestB2B = [...list].sort((a, b) => b.creditoTransferidoClienteB2B - a.creditoTransferidoClienteB2B)[0];

  // Análise aprofundada do Simples Híbrido com Ponto de Inflexão (Break-even)
  const relSimples = res['simples'];
  const faturamentoEstimado = (relSimples?.precoVendaFinalNota ?? 100) * (it.quantidade > 0 ? it.quantidade : 1);
  const comprasEstimadas = it.valorBrutoEntrada;
  const analiseHibrido = calcularDetalhamentoSimplesHibrido({
    ano: p.ano,
    faturamentoMensal: faturamentoEstimado,
    aliquotaDasEfetivaPct: p.overrides?.dasEfetivoPct ?? 10.0,
    comprasInsumosMercadorias: comprasEstimadas,
    aliquotaMediaCreditoEntradaPct: (p.overrides?.cbsPct ?? 8.8) + (p.overrides?.ibsPct ?? 0.1),
    aliquotaIbsCbsVendaPct: (p.overrides?.cbsPct ?? 8.8) + (p.overrides?.ibsPct ?? 0.1),
    marco: ctx.marco,
  });

  return {
    regimes: res as Record<RegimeTributario, RelatorioMargens>,
    melhorMargemLiquida: {
      regime: bestMargem.regime,
      margemLiquidaValor: bestMargem.margemLiquidaValor,
      margemLiquidaPct: bestMargem.margemLiquidaPct,
    },
    melhorCompetitividadeB2B: {
      regime: bestB2B.regime,
      creditoTransferido: bestB2B.creditoTransferidoClienteB2B,
      custoEfetivoClienteB2B: r2(bestB2B.precoVendaFinalNota - bestB2B.creditoTransferidoClienteB2B),
    },
    analiseSimplesHibrido: analiseHibrido,
  };
}

/** Trajetória 2027-2033 de um item RECORRENTE (sem crédito de estoque): a regra que muda é o calendário. */
export function trajetoria(
  it: ItemPreco,
  p: ParamsPreco,
  ctx: Ctx,
  anos: number[] = [2027, 2028, 2029, 2030, 2031, 2032, 2033]
) {
  return anos.map((ano) => {
    const r = simular({ ...it, estoqueAbertura: false }, { ...p, ano }, ctx);
    return {
      ano,
      precoFinal: r.preco.precoFinal,
      vProdLiq: r.preco.vProdLiq,
      vCBS: r.preco.vCBS,
      vIBS: r.preco.vIBS,
      vICMS: r.preco.vICMS,
      cargaIndiretaPctPreco: r.resultado.cargaIndiretaPctPreco,
      alertas: r.alertas,
    };
  });
}

export function sensibilidadeMargem(it: ItemPreco, p: ParamsPreco, ctx: Ctx, margens: number[]) {
  return margens.map((m) => {
    const r = simular(it, { ...p, margemLiquidaPct: m }, ctx);
    return { margemPct: m, precoFinal: r.preco.precoFinal, lucroLiquido: r.resultado.lucroLiquido };
  });
}

/** Cronograma AGREGADO do crédito de estoque da empresa (soma de itens x quantidades) — nível em que a apuração acontece. */
export function cronogramaEstoqueAgregado(itens: { quantidade: number; resultado: ResultadoDetalhado }[]) {
  const porMes = new Map<number, number>();
  let nominal = 0,
    vp = 0;
  for (const { quantidade, resultado } of itens) {
    const ce = resultado.entrada.creditoEstoque;
    if (!ce.elegivel) continue;
    nominal += ce.nominal * quantidade;
    vp += ce.valorPresente * quantidade;
    for (const c of ce.cronograma)
      porMes.set(c.mesRelJan2027, (porMes.get(c.mesRelJan2027) ?? 0) + c.valorUnit * quantidade);
  }
  return {
    nominal: r2(nominal),
    valorPresente: r2(vp),
    parcelas: [...porMes.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([mes, valor]) => ({ mesRelJan2027: mes, valor: r2(valor) })),
  };
}

/** Ponte com o app: preenche IS (ad valorem) e reduções a partir do NCM (Record8) e do cClassTrib escolhido. */
export function paramsDoClassificador(
  rec: Pick<Record8, 'is' | 'adv' | 'are' | 'ncm'> | undefined,
  ct: ClassTrib | undefined,
  marco: MarcoLegal
) {
  const red = reducaoDoClassTrib(ct, marco);
  const alertas: string[] = [];
  if (rec?.is == null) alertas.push('NCM ainda não consultado na tabela oficial do IS — confirme na Calculadora da RFB.');
  if (rec?.is === 1 && rec.adv == null && rec.are == null)
    alertas.push(
      'NCM com IS, mas sem alíquota na tabela: os campos adv/are chegam no dataset frio (aguarde ds.pronto) — o motor está usando IS = 0%.'
    );
  if (rec?.are != null) alertas.push(`IS ad rem (${rec.are} por unidade) NÃO é modelado: o motor aplica só o ad valorem.`);
  if (red.origem === 'nenhuma' && ct && ct.red)
    alertas.push(
      `cClassTrib ${ct.c} tem redução na tabela oficial mas o percentual não pôde ser derivado — informe pRedCbs/pRedIbs.`
    );
  return { isSaidaPct: rec?.is === 1 ? rec.adv ?? 0 : 0, pRedCbs: red.cbs, pRedIbs: red.ibs, alertas };
}
