/**
 * Orquestrador Fiscal DAG (Directed Acyclic Graph)
 * Analista Fiscal Portela Contabilidade — Ciclo 6 (Sub-etapa 19.5)
 *
 * Executa a auditoria e análise de NF-e em 6 etapas causais estritas:
 *  1. Extração & Normalização Canônica (com perfil bitemporal resolvido)
 *  2. Motor Oficial RFB RTC (À Montante — Simples / Regular / Validação XML)
 *  3. Motor Estadual ICMS/PR v5.0.0 (À Jusante — DIFAL, FECOP, ST com IBS/CBS)
 *  4. Classificação Tripartida de Créditos (XML, Regra, Efetivado CPC 16 / Art. 47)
 *  5. Custos CPC 16, Precificação & Comparativo dos 4 Regimes Tributários
 *  6. Persistência Auditável e Idempotente no PostgreSQL 17 / In-Memory Dual-Mode
 */

import { createHash } from 'node:crypto';
import {
  extrairDadosXmlNfe,
} from '../extrator-nfe';
import type {
  ExtractedInvoiceData,
  ExtractedItem,
} from '../extrator-nfe-types';
import {
  normalizarExtracaoNfe,
  DocumentoFiscalNormalizado,
  PerfilAdquirenteNormalizacao,
} from '../fiscal/documento-normalizado';
import {
  classificarCreditosItemEntrada,
  ClassificacaoTripartidaCreditos,
  DestinacaoItem,
  StatusExtincaoDebitoFornecedor,
  RegimeAdquirente,
} from '../fiscal/credito-tributario';
import {
  DecimalHalfEven,
  arredondarMoedaRfbNum,
} from '../math/decimal-fiscal';
import {
  getEmpresasRepository,
  ESCRITORIO_PADRAO_ID,
  type EmpresasRepository,
} from '../db/empresas-repository';
import {
  getDocumentosRepository,
  ErroDocumentoDuplicado,
  type DocumentosRepository,
} from '../db/documentos-repository';
import {
  RegimeTributario,
  AliquotasEfetivas,
  BeneficiosParana,
  ReformaTributariaPerfil,
  resolverPerfilVigenteNaData,
} from '../fiscal/perfil-tributario';
import {
  calcularRegimeRegularComFallback,
  validarXmlRtcRfb,
} from '../integracoes/rtc-regime-regular/client';
import type {
  ResultadoCalculoRegimeRegularNormalizado,
  ItemCalculadoNormalizado,
} from '../integracoes/rtc-regime-regular/normalizer';
import { mapearDocumentoParaOperacaoRfb } from '../integracoes/rtc-regime-regular/mapper';
import {
  calcularSimplesNacionalComFallback,
} from '../integracoes/rtc-simples/client';
import type {
  ResultadoSimplesNormalizado,
  ItemSimplesNormalizado,
} from '../integracoes/rtc-simples/normalizer';
import { mapearDocumentoParaSimplesRfb } from '../integracoes/rtc-simples/mapper';
import {
  auditarDifalNotaEntrada,
} from './difal-pr';
import type {
  DiagnosticoDifalEntrada,
  ResumoDifalNfeEntrada,
} from '../types/motor-tributario';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from './matriz-icms-pr';
import {
  calcularIcmsStPR,
  type DiagnosticoIcmsStPR,
} from './icms-pr-regras';

// ============================================================================
// CONTRATOS DO ORQUESTRADOR FISCAL
// ============================================================================

export interface OrquestracaoNfeInput {
  xml?: string;
  extracao?: ExtractedInvoiceData;
  empresaId?: string;
  escritorioId?: string;
  perfilAdquirente?: {
    regime: RegimeTributario;
    aliquotasEfetivas?: AliquotasEfetivas;
    simplesOptanteHibrido2027?: boolean;
    beneficiosParana?: BeneficiosParana;
    reformaTributaria?: ReformaTributariaPerfil;
  };
  destinacaoPadrao?: DestinacaoItem;
  destinacaoPorItem?: Record<string | number, DestinacaoItem>;
  statusExtincaoRtc?: StatusExtincaoDebitoFornecedor;
  margemAlvoPct?: number;
  despesasVariaveisPct?: number;
  validarGruposXmlRtc?: boolean;
  persistir?: boolean;
  empresasRepo?: EmpresasRepository;
  documentosRepo?: DocumentosRepository;
}

export interface CenarioComparativoRegime {
  regime: 'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
  nomeExibicao: string;
  cmvLiquidoTotal: number;
  creditosAproveitados: number;
  tributosSaidaEstimados: number;
  precoVendaSugerido: number;
  margemLiquidaPct: number;
  cargaTributariaEfetivaPct: number;
  melhorCenario: boolean;
  justificativa: string;
}

export interface ResultadoOrquestracaoNfe {
  sucesso: boolean;
  chaveAcesso: string;
  sha256Xml: string;
  empresaId?: string;
  dataEmissao: string;
  perfilUtilizado: {
    regime: RegimeTributario;
    vigenciaInicio?: string;
    vigenciaFim?: string | null;
    origemPerfil: 'BANCO_DADOS' | 'INLINE_REQUEST';
    simplesOptanteHibrido2027: boolean;
    beneficiosParana: BeneficiosParana;
  };
  etapas: {
    extracao: {
      sucesso: boolean;
      totalItens: number;
      emitente: { cnpj: string; razaoSocial: string; uf: string; crt?: string };
      destinatario: { cnpj?: string; razaoSocial?: string; uf?: string };
      valoresNota: { vProd: number; vNF: number; vICMS: number; vST: number; vIBS?: number; vCBS?: number };
    };
    rtc: {
      sucesso: boolean;
      motorRtcUtilizado: 'REGIME_REGULAR' | 'SIMPLES_NACIONAL';
      origemCalculoRtc: 'OFICIAL_RFB' | 'FALLBACK_LOCAL_ESTIMADO';
      versaoAplicacaoRfb?: string;
      versaoBaseDadosRfb?: string;
      duracaoRtcMs: number;
      totaisRtc: {
        vIbsUf: number;
        vIbsMun: number;
        vIbsTotal: number;
        vCbs: number;
        vIs: number;
        vIvaTotal: number;
      };
      validacaoXml?: {
        executada: boolean;
        valido: boolean;
        status: 'VALIDO' | 'INVALIDO' | 'INDISPONIVEL_FALLBACK' | 'NAO_APLICAVEL';
        erros?: string[];
      };
    };
    icmsPr: {
      sucesso: boolean;
      versaoMotor: string;
      resumoDifal: ResumoDifalNfeEntrada;
      itensDiagnosticoDifal: Record<string, DiagnosticoDifalEntrada>;
      itensDiagnosticoSt?: Record<string, DiagnosticoIcmsStPR>;
      alertasPr: string[];
    };
    creditos: {
      sucesso: boolean;
      statusExtincaoFornecedor: StatusExtincaoDebitoFornecedor;
      camadas: {
        totalDestacadoXml: { icms: number; pis: number; cofins: number; ipi: number; ibs: number; cbs: number; total: number };
        totalCreditoAdmitidoRegra: { icms: number; pis: number; cofins: number; ipi: number; ibs: number; cbs: number; total: number };
        totalCreditoEfetivadoCusto: { icms: number; pis: number; cofins: number; ipi: number; ibs: number; cbs: number; total: number };
      };
      retidoAguardandoExtincaoIbsCbs: { ibs: number; cbs: number; total: number };
      itensCredito: Array<{
        index: number;
        cProd: string;
        xProd: string;
        destinacao: DestinacaoItem;
        classificacao: ClassificacaoTripartidaCreditos;
      }>;
    };
    custosEPrecificacao: {
      sucesso: boolean;
      cmvLiquidoTotal: number;
      desembolsoTotalEntrada: number;
      comparativoRegimes: Record<'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL', CenarioComparativoRegime>;
      melhorCenario: 'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
    };
    persistencia?: {
      salvo: boolean;
      documentoJaExistia: boolean;
      documentoId?: string;
      execucaoMotorId?: string;
    };
  };
  alertasGerais: string[];
  duracaoTotalMs: number;
}

function normalizarDestinacaoParaDifal(
  d: DestinacaoItem
): 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado' {
  if (d === 'revenda') return 'comercializacao';
  if (d === 'insumo') return 'industrializacao';
  return d;
}

// ============================================================================
// IMPLEMENTAÇÃO PURA DO ORQUESTRADOR EM DAG SEQUENCIAL
// ============================================================================

export async function orquestrarAnaliseNfeCompleta(
  input: OrquestracaoNfeInput
): Promise<ResultadoOrquestracaoNfe> {
  const tInicio = Date.now();
  const alertasGerais: string[] = [];

  // --------------------------------------------------------------------------
  // ETAPA 1: EXTRAÇÃO & NORMALIZAÇÃO CANÔNICA
  // --------------------------------------------------------------------------
  let extracao: ExtractedInvoiceData;
  let rawXml = input.xml || '';

  if (rawXml) {
    if (rawXml.length > 5 * 1024 * 1024) {
      throw new Error('Arquivo excede o limite máximo de 5 MB.');
    }
    if (rawXml.includes('<!DOCTYPE') || rawXml.includes('<!ENTITY')) {
      throw new Error('XML rejeitado por conter declarações DTD/XXE potencialmente inseguras.');
    }
    extracao = extrairDadosXmlNfe(rawXml);
  } else if (input.extracao) {
    extracao = input.extracao;
  } else {
    throw new Error('É obrigatório fornecer o XML da NF-e ou os dados já extraídos.');
  }

  const chaveAcesso =
    extracao.identificacao?.chaveAcesso ||
    `NFE${extracao.emitente?.cnpj || '000'}${extracao.identificacao?.numero || '0'}`;

  const sha256Xml = rawXml
    ? createHash('sha256').update(rawXml).digest('hex')
    : createHash('sha256').update(chaveAcesso).digest('hex');

  const dataEmissao =
    extracao.identificacao?.dataEmissao || new Date().toISOString();

  // Resolução do Perfil Tributário Bitemporal
  let regimeAdquirente: RegimeTributario = 'LUCRO_REAL';
  let aliquotasEfetivas: AliquotasEfetivas = {};
  let simplesOptanteHibrido2027 = false;
  let beneficiosParana: BeneficiosParana = {
    diferimentoParcialArt28: true,
    optanteRotSt: false,
    reducoesBcAtivas: [],
  };
  let reformaTributaria: ReformaTributariaPerfil = {
    optanteSplitPayment2026: false,
    creditoPresumidoIbsCbs: false,
  };
  let origemPerfil: 'BANCO_DADOS' | 'INLINE_REQUEST' = 'INLINE_REQUEST';
  let vigenciaInicioPerfil: string | undefined;
  let vigenciaFimPerfil: string | null | undefined;

  if (input.empresaId) {
    const empresasRepo = input.empresasRepo || getEmpresasRepository();
    const empresaCadastrada = await empresasRepo.buscarPorId(input.empresaId);
    if (empresaCadastrada) {
      const perfis = await empresasRepo.listarPerfis(empresaCadastrada.id);
      const perfilVigente = resolverPerfilVigenteNaData(perfis, dataEmissao);
      if (perfilVigente) {
        regimeAdquirente = perfilVigente.regimeTributario;
        aliquotasEfetivas = perfilVigente.aliquotasEfetivas || {};
        simplesOptanteHibrido2027 = Boolean(perfilVigente.simplesOptanteHibrido2027);
        beneficiosParana = perfilVigente.beneficiosParana || beneficiosParana;
        reformaTributaria = perfilVigente.reformaTributaria || reformaTributaria;
        origemPerfil = 'BANCO_DADOS';
        vigenciaInicioPerfil = perfilVigente.vigenciaInicio;
        vigenciaFimPerfil = perfilVigente.vigenciaFim;
      }
    }
  }

  // Override com o que foi passado explicitamente no input
  if (input.perfilAdquirente) {
    regimeAdquirente = input.perfilAdquirente.regime || regimeAdquirente;
    aliquotasEfetivas = input.perfilAdquirente.aliquotasEfetivas || aliquotasEfetivas;
    if (input.perfilAdquirente.simplesOptanteHibrido2027 !== undefined) {
      simplesOptanteHibrido2027 = input.perfilAdquirente.simplesOptanteHibrido2027;
    }
    beneficiosParana = input.perfilAdquirente.beneficiosParana || beneficiosParana;
    reformaTributaria = input.perfilAdquirente.reformaTributaria || reformaTributaria;
  }

  const destinacaoPadrao: DestinacaoItem = input.destinacaoPadrao || 'comercializacao';
  const destinacaoPorItem: Record<string | number, DestinacaoItem> = input.destinacaoPorItem || {};

  // Mapeia para o perfil de normalização canônica
  const perfilNorm: PerfilAdquirenteNormalizacao = {
    regime: (simplesOptanteHibrido2027
      ? 'SIMPLES_HIBRIDO'
      : regimeAdquirente) as RegimeAdquirente,
    destinacaoPadrao,
  };

  const docNormalizado: DocumentoFiscalNormalizado = normalizarExtracaoNfe(
    extracao,
    perfilNorm
  );

  // --------------------------------------------------------------------------
  // ETAPA 2: MOTOR OFICIAL RFB RTC (À MONTANTE)
  // --------------------------------------------------------------------------
  const tRtcInicio = Date.now();
  let motorRtcUtilizado: 'REGIME_REGULAR' | 'SIMPLES_NACIONAL' = 'REGIME_REGULAR';
  let origemCalculoRtc: 'OFICIAL_RFB' | 'FALLBACK_LOCAL_ESTIMADO' = 'FALLBACK_LOCAL_ESTIMADO';
  let versaoAplicacaoRfb: string | undefined;
  let versaoBaseDadosRfb: string | undefined;

  let rtcTotais = {
    vIbsUf: 0,
    vIbsMun: 0,
    vIbsTotal: 0,
    vCbs: 0,
    vIs: 0,
    vIvaTotal: 0,
  };

  const isSimplesTradicional =
    (regimeAdquirente === 'SIMPLES_NACIONAL' || regimeAdquirente === 'MEI') &&
    !simplesOptanteHibrido2027;

  let itensResultadoRtc: Array<{
    itemIndex: number;
    vIbsUf: number;
    vIbsMun: number;
    vCbs: number;
    vIs: number;
  }> = [];

  if (isSimplesTradicional) {
    motorRtcUtilizado = 'SIMPLES_NACIONAL';
    const payloadSimples = mapearDocumentoParaSimplesRfb(docNormalizado, {
      aliquotasEfetivas: aliquotasEfetivas as any,
    });
    const resSimples: ResultadoSimplesNormalizado = await calcularSimplesNacionalComFallback(
      payloadSimples
    );

    origemCalculoRtc = resSimples.origemCalculo === 'OFICIAL_RFB' ? 'OFICIAL_RFB' : 'FALLBACK_LOCAL_ESTIMADO';
    versaoAplicacaoRfb = resSimples.versaoMotor;
    versaoBaseDadosRfb = resSimples.versaoBaseDados;

    rtcTotais = {
      vIbsUf: 0,
      vIbsMun: 0,
      vIbsTotal: 0,
      vCbs: 0,
      vIs: 0,
      vIvaTotal: 0,
    };

    itensResultadoRtc = (resSimples.itens || []).map((it: ItemSimplesNormalizado) => ({
      itemIndex: it.numero,
      vIbsUf: 0,
      vIbsMun: 0,
      vCbs: 0,
      vIs: 0,
    }));
  } else {
    motorRtcUtilizado = 'REGIME_REGULAR';
    const payloadRegular = mapearDocumentoParaOperacaoRfb(docNormalizado, {
      ufPadrao: 'PR',
      municipioPadraoIbge: 4106902,
    });
    const resRegular: ResultadoCalculoRegimeRegularNormalizado = await calcularRegimeRegularComFallback(
      payloadRegular
    );

    origemCalculoRtc = resRegular.origemCalculo === 'OFICIAL_RFB' ? 'OFICIAL_RFB' : 'FALLBACK_LOCAL_ESTIMADO';
    versaoAplicacaoRfb = resRegular.versaoMotor;
    versaoBaseDadosRfb = resRegular.versaoBaseDados;

    const vIbsUf = Number(resRegular.totais?.valorIbsEstadualTotal || 0);
    const vIbsMun = Number(resRegular.totais?.valorIbsMunicipalTotal || 0);
    const vCbs = Number(resRegular.totais?.valorCbsTotal || 0);
    const vIs = Number(resRegular.totais?.valorImpostoSeletivoTotal || 0);
    const vIbsTotal = arredondarMoedaRfbNum(vIbsUf + vIbsMun);
    const vIvaTotal = arredondarMoedaRfbNum(vIbsTotal + vCbs + vIs);

    rtcTotais = {
      vIbsUf,
      vIbsMun,
      vIbsTotal,
      vCbs,
      vIs,
      vIvaTotal,
    };

    itensResultadoRtc = (resRegular.itens || []).map((it: ItemCalculadoNormalizado) => ({
      itemIndex: it.numero,
      vIbsUf: Number(it.valorIbsEstadual || 0),
      vIbsMun: Number(it.valorIbsMunicipal || 0),
      vCbs: Number(it.valorCbs || 0),
      vIs: Number(it.valorImpostoSeletivo || 0),
    }));
  }

  const duracaoRtcMs = Date.now() - tRtcInicio;

  // Validação de Grupos XML da Reforma Tributária (se houver grupos ou solicitado)
  let validacaoXmlResult: {
    executada: boolean;
    valido: boolean;
    status: 'VALIDO' | 'INVALIDO' | 'INDISPONIVEL_FALLBACK' | 'NAO_APLICAVEL';
    erros?: string[];
  } = {
    executada: false,
    valido: true,
    status: 'NAO_APLICAVEL',
  };

  const temTagsReforma =
    rawXml.includes('<IBSCBS>') ||
    rawXml.includes('<IS>') ||
    Boolean(input.validarGruposXmlRtc);

  if (temTagsReforma && rawXml) {
    try {
      const valRes = await validarXmlRtcRfb(rawXml, 'nfe');
      validacaoXmlResult = {
        executada: true,
        valido: valRes.valido,
        status: valRes.valido ? 'VALIDO' : 'INVALIDO',
        erros: valRes.valido ? undefined : ['Validação oficial RFB rejeitou os grupos XML da Reforma Tributária.'],
      };
      if (!valRes.valido) {
        alertasGerais.push(
          'Inconsistência estrutural detectada na validação de grupos XML da Reforma Tributária pelo sidecar oficial da RFB.'
        );
      }
    } catch {
      validacaoXmlResult = {
        executada: true,
        valido: false,
        status: 'INDISPONIVEL_FALLBACK',
        erros: ['Sidecar de validação XML indisponível (modo fallback ativo).'],
      };
    }
  }

  // --------------------------------------------------------------------------
  // ETAPA 3: MOTOR ESTADUAL ICMS/PR v5.0.0 (À JUSANTE)
  // --------------------------------------------------------------------------
  const anoFatoGerador = parseInt(dataEmissao.slice(0, 4), 10) || 2026;
  const extracaoEnriquecida: ExtractedInvoiceData = JSON.parse(JSON.stringify(extracao));

  // Enriquecer itens com os tributos oficiais do RTC (vIBS, vCBS, vIS)
  for (let i = 0; i < (extracaoEnriquecida.itens || []).length; i++) {
    const it = extracaoEnriquecida.itens[i];
    const rtcItem = itensResultadoRtc[i];
    if (rtcItem) {
      if (!it.tributos) it.tributos = {};
      const trib = it.tributos as any;

      // Preserva tributos originais do XML em campo separado
      (it as any).originalXmlTributos = {
        vIBS: trib.vIBS,
        vCBS: trib.vCBS,
        vIS: trib.vIS,
      };

      // Se no XML não veio destacado ou estamos projetando >= 2027, injeta os valores do RTC
      if (trib.vIBS === undefined || trib.vIBS === null || anoFatoGerador >= 2027) {
        trib.vIBS = rtcItem.vIbsUf + rtcItem.vIbsMun;
        trib.vIbs = trib.vIBS;
      }
      if (trib.vCBS === undefined || trib.vCBS === null || anoFatoGerador >= 2027) {
        trib.vCBS = rtcItem.vCbs;
        trib.vCbs = trib.vCBS;
      }
      if (trib.vIS === undefined || trib.vIS === null || anoFatoGerador >= 2027) {
        trib.vIS = rtcItem.vIs;
        trib.vIs = trib.vIS;
      }
    }
  }

  // Consulta SEFA/PR nº 48/2026 (IBS/CBS na base do ICMS em 2027+)
  const incluirIbsCbsBcIcms =
    beneficiosParana.regimeEspecialSefaPr?.includes('48/2026') ||
    (anoFatoGerador >= 2027 && Boolean(beneficiosParana.diferimentoParcialArt28));

  const destinacaoDifalPorItem: Record<string | number, 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'> = {};
  for (const [k, v] of Object.entries(destinacaoPorItem)) {
    destinacaoDifalPorItem[k] = normalizarDestinacaoParaDifal(v);
  }

  const difalAuditoria = auditarDifalNotaEntrada(extracaoEnriquecida, {
    crtDestinatario: isSimplesTradicional ? '1' : '3',
    destinacaoPadrao: normalizarDestinacaoParaDifal(destinacaoPadrao),
    destinacaoPorItem: destinacaoDifalPorItem,
    incluirIbsCbsBcIcms,
    aplicarCarga12Art16SN: isSimplesTradicional,
  });

  // Checagem de ST Paraná (Art. 11 Anexo IX e Exclusão Decretos 6.048/2024 e 12.828/2026)
  const itensDiagnosticoSt: Record<string, DiagnosticoIcmsStPR> = {};
  const alertasPr: string[] = [];

  for (const it of extracaoEnriquecida.itens || []) {
    const exclusaoSt = verificarExclusaoStPr(it.ncm, it.cest, dataEmissao);
    if (exclusaoSt.excluidoDaSt && (it.tributos?.vICMSST ?? 0) > 0) {
      alertasPr.push(
        `Item ${it.index} (${it.xProd}): NCM ${it.ncm} foi EXCLUÍDA da ST no Paraná${exclusaoSt.decreto ? ` pelo ${exclusaoSt.decreto}` : ''}${exclusaoSt.dataExclusao ? ` em ${exclusaoSt.dataExclusao}` : ''}, porém consta ST destacada no XML.`
      );
    }

    // Se houver ST destacada ou responsabilidade (consumindo alíquota e FECOP da matriz PR bitemporal)
    if ((it.tributos?.vICMSST ?? 0) > 0 || (it.tributos?.pMVAST ?? 0) > 0) {
      const dadosPrSt = resolverAliquotaPrBitemporal(it.ncm, dataEmissao.slice(0, 10));
      const diagSt = calcularIcmsStPR({
        ncm: it.ncm,
        cest: it.cest,
        dataFatoGerador: dataEmissao.slice(0, 10),
        vProd: it.vProd,
        aliqInternaPrPct: dadosPrSt.aliquotaIcmsPct,
        aliqFecopPrPct: dadosPrSt.aliquotaFecopPct,
        aliqInterestadualPct: it.tributos?.pICMS || 12,
        vFrete: it.vFrete,
        vIpi: it.tributos?.vIPI,
        mvaOriginalPct: it.tributos?.pMVAST,
        crtEmitente: extracao.emitente?.crt ?? 3,
      });
      itensDiagnosticoSt[String(it.index)] = diagSt;
    }
  }

  // --------------------------------------------------------------------------
  // ETAPA 4: CLASSIFICAÇÃO TRIPARTIDA DE CRÉDITOS
  // --------------------------------------------------------------------------
  const statusExtincao = input.statusExtincaoRtc || 'EXTINTO_SPLIT';
  const itensCredito: Array<{
    index: number;
    cProd: string;
    xProd: string;
    destinacao: DestinacaoItem;
    classificacao: ClassificacaoTripartidaCreditos;
  }> = [];

  let tXmlIcms = 0;
  let tXmlPis = 0;
  let tXmlCofins = 0;
  let tXmlIpi = 0;
  let tXmlIbs = 0;
  let tXmlCbs = 0;

  let tRegraIcms = 0;
  let tRegraPis = 0;
  let tRegraCofins = 0;
  let tRegraIpi = 0;
  let tRegraIbs = 0;
  let tRegraCbs = 0;

  let tCustoIcms = 0;
  let tCustoPis = 0;
  let tCustoCofins = 0;
  let tCustoIpi = 0;
  let tCustoIbs = 0;
  let tCustoCbs = 0;

  let retidoIbs = 0;
  let retidoCbs = 0;

  for (let i = 0; i < (extracaoEnriquecida.itens || []).length; i++) {
    const it = extracaoEnriquecida.itens[i];
    const destinacao = destinacaoPorItem[it.index] || destinacaoPadrao;
    const t = it.tributos || {};

    const temSt =
      (t.vICMSST ?? 0) > 0 ||
      ['10', '30', '60', '70'].includes(t.cstIcms || '') ||
      ['201', '202', '203', '500'].includes(t.csosn || '');

    const classif = classificarCreditosItemEntrada({
      vProd: it.vProd,
      vFrete: it.vFrete,
      vSeg: it.vSeg,
      vOutro: it.vOutro,
      vDesc: it.vDesc,
      vIPI: t.vIPI,
      vICMS: t.vICMS,
      vPIS: t.vPIS,
      vCOFINS: t.vCOFINS,
      vIBS: t.vIBS,
      vCBS: t.vCBS,
      pCredSN: t.pCredSN,
      vCredICMSSN: t.vCredICMSSN,
      temSt,
      destinacao,
      regimeAdquirente: (simplesOptanteHibrido2027
        ? 'SIMPLES_HIBRIDO'
        : regimeAdquirente) as RegimeAdquirente,
      crtEmitente: extracao.emitente?.crt ?? 3,
      emitenteSnIsentoPr:
        extracao.emitente?.uf === 'PR' && (extracao.emitente?.crt === '1' || extracao.emitente?.crt === '2'),
      statusExtincaoFornecedor: statusExtincao,
    });

    itensCredito.push({
      index: it.index,
      cProd: it.cProd,
      xProd: it.xProd,
      destinacao,
      classificacao: classif,
    });

    // Camada 1: Destacado XML
    tXmlIcms += classif.destacadoXml.icmsProprio;
    tXmlPis += classif.destacadoXml.pis;
    tXmlCofins += classif.destacadoXml.cofins;
    tXmlIpi += classif.destacadoXml.ipi;
    tXmlIbs += classif.destacadoXml.ibs;
    tXmlCbs += classif.destacadoXml.cbs;

    // Camada 2: Admitido Regra
    tRegraIcms += classif.creditoAdmitidoRegra.icmsProprio;
    tRegraPis += classif.creditoAdmitidoRegra.pis;
    tRegraCofins += classif.creditoAdmitidoRegra.cofins;
    tRegraIpi += classif.creditoAdmitidoRegra.ipi;
    tRegraIbs += classif.creditoAdmitidoRegra.ibs;
    tRegraCbs += classif.creditoAdmitidoRegra.cbs;

    // Camada 3: Efetivado Custo (CPC 16)
    tCustoIcms += classif.creditoEfetivadoCusto.icmsProprio;
    tCustoPis += classif.creditoEfetivadoCusto.pis;
    tCustoCofins += classif.creditoEfetivadoCusto.cofins;
    tCustoIpi += classif.creditoEfetivadoCusto.ipi;
    tCustoIbs += classif.creditoEfetivadoCusto.ibs;
    tCustoCbs += classif.creditoEfetivadoCusto.cbs;

    // Retenção do Art. 47 LC 214/2025
    if (statusExtincao === 'AGUARDANDO_EXTINCAO') {
      retidoIbs += classif.creditoAdmitidoRegra.ibs;
      retidoCbs += classif.creditoAdmitidoRegra.cbs;
    }
  }

  const camadasCredito = {
    totalDestacadoXml: {
      icms: arredondarMoedaRfbNum(tXmlIcms),
      pis: arredondarMoedaRfbNum(tXmlPis),
      cofins: arredondarMoedaRfbNum(tXmlCofins),
      ipi: arredondarMoedaRfbNum(tXmlIpi),
      ibs: arredondarMoedaRfbNum(tXmlIbs),
      cbs: arredondarMoedaRfbNum(tXmlCbs),
      total: arredondarMoedaRfbNum(tXmlIcms + tXmlPis + tXmlCofins + tXmlIpi + tXmlIbs + tXmlCbs),
    },
    totalCreditoAdmitidoRegra: {
      icms: arredondarMoedaRfbNum(tRegraIcms),
      pis: arredondarMoedaRfbNum(tRegraPis),
      cofins: arredondarMoedaRfbNum(tRegraCofins),
      ipi: arredondarMoedaRfbNum(tRegraIpi),
      ibs: arredondarMoedaRfbNum(tRegraIbs),
      cbs: arredondarMoedaRfbNum(tRegraCbs),
      total: arredondarMoedaRfbNum(tRegraIcms + tRegraPis + tRegraCofins + tRegraIpi + tRegraIbs + tRegraCbs),
    },
    totalCreditoEfetivadoCusto: {
      icms: arredondarMoedaRfbNum(tCustoIcms),
      pis: arredondarMoedaRfbNum(tCustoPis),
      cofins: arredondarMoedaRfbNum(tCustoCofins),
      ipi: arredondarMoedaRfbNum(tCustoIpi),
      ibs: arredondarMoedaRfbNum(tCustoIbs),
      cbs: arredondarMoedaRfbNum(tCustoCbs),
      total: arredondarMoedaRfbNum(tCustoIcms + tCustoPis + tCustoCofins + tCustoIpi + tCustoIbs + tCustoCbs),
    },
  };

  const retidoAguardandoExtincaoIbsCbs = {
    ibs: arredondarMoedaRfbNum(retidoIbs),
    cbs: arredondarMoedaRfbNum(retidoCbs),
    total: arredondarMoedaRfbNum(retidoIbs + retidoCbs),
  };

  if (retidoAguardandoExtincaoIbsCbs.total > 0) {
    alertasGerais.push(
      `Crédito de IBS/CBS no valor de R$ ${retidoAguardandoExtincaoIbsCbs.total.toFixed(2)} foi retido e NÃO abate o CMV líquido por estar com status AGUARDANDO_EXTINCAO (Art. 47 da LC nº 214/2025).`
    );
  }

  // --------------------------------------------------------------------------
  // ETAPA 5: CUSTOS CPC 16, PRECIFICAÇÃO & COMPARATIVO DOS 4 REGIMES
  // --------------------------------------------------------------------------
  const margemAlvo = input.margemAlvoPct ?? 20.0;
  const despesasVariaveis = input.despesasVariaveisPct ?? 5.0;

  let valorTotalProdutos = 0;
  let valorTotalFrete = 0;
  let valorTotalSeguro = 0;
  let valorTotalOutros = 0;
  let valorTotalDesconto = 0;
  let valorTotalIpi = 0;
  let valorTotalSt = 0;

  for (const it of extracaoEnriquecida.itens || []) {
    valorTotalProdutos += it.vProd || 0;
    valorTotalFrete += it.vFrete || 0;
    valorTotalSeguro += it.vSeg || 0;
    valorTotalOutros += it.vOutro || 0;
    valorTotalDesconto += it.vDesc || 0;
    valorTotalIpi += it.tributos?.vIPI || 0;
    valorTotalSt += it.tributos?.vICMSST || 0;
  }

  const difalTotalDevido = difalAuditoria.resumoDifalNota.totalDifalGeral || 0;
  const fecopTotalDevido = difalAuditoria.resumoDifalNota.totalFecopGeral || 0;

  const desembolsoTotalEntrada = arredondarMoedaRfbNum(
    valorTotalProdutos -
      valorTotalDesconto +
      valorTotalFrete +
      valorTotalSeguro +
      valorTotalOutros +
      valorTotalIpi +
      valorTotalSt +
      difalTotalDevido +
      fecopTotalDevido
  );

  // CMV Líquido Real usando Camada 3 de Créditos Efetivados
  const cmvLiquidoCalculado = arredondarMoedaRfbNum(
    desembolsoTotalEntrada - camadasCredito.totalCreditoEfetivadoCusto.total
  );

  // GERAÇÃO DO COMPARATIVO TRIBUTÁRIO DE 4 REGIMES
  const comparativoRegimes = gerarComparativoQuatroRegimes({
    valorTotalProdutos,
    valorTotalDesconto,
    valorTotalFrete,
    valorTotalSeguro,
    valorTotalOutros,
    valorTotalIpi,
    valorTotalSt,
    difalTotalDevido,
    fecopTotalDevido,
    camadasCredito,
    margemAlvoPct: margemAlvo,
    despesasVariaveisPct: despesasVariaveis,
    ano: anoFatoGerador,
    aliquotasEfetivas,
  });

  // Determinar melhor cenário
  let menorPreco = Infinity;
  let melhorRegimeKey: 'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL' =
    'LUCRO_REAL';

  for (const key of ['SIMPLES_TRADICIONAL', 'SIMPLES_HIBRIDO_2027', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const) {
    const c = comparativoRegimes[key];
    if (c.precoVendaSugerido < menorPreco) {
      menorPreco = c.precoVendaSugerido;
      melhorRegimeKey = key;
    }
  }

  for (const key of ['SIMPLES_TRADICIONAL', 'SIMPLES_HIBRIDO_2027', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const) {
    comparativoRegimes[key].melhorCenario = key === melhorRegimeKey;
  }

  // --------------------------------------------------------------------------
  // ETAPA 6: PERSISTÊNCIA AUDITÁVEL E IDEMPOTENTE
  // --------------------------------------------------------------------------
  let persistenciaResult:
    | { salvo: boolean; documentoJaExistia: boolean; documentoId?: string; execucaoMotorId?: string }
    | undefined;

  if (input.persistir && input.empresaId) {
    const docRepo = input.documentosRepo || getDocumentosRepository();
    const escritorioId = input.escritorioId || ESCRITORIO_PADRAO_ID;

    let documentoIdSalvo: string | undefined;
    let jaExistia = false;

    const numNota = parseInt(String(extracao.identificacao?.numero || '0').replace(/\D/g, ''), 10) || 0;

    try {
      const docGravado = await docRepo.salvarDocumento({
        escritorioId,
        empresaId: input.empresaId,
        chaveAcesso,
        numero: numNota,
        serie: extracao.identificacao?.serie || '1',
        tipoOperacao: (extracao.identificacao?.tipoOperacao as any) || '0',
        dataEmissao,
        emitenteCnpj: extracao.emitente?.cnpj || '00000000000000',
        emitenteRazaoSocial: extracao.emitente?.nome || 'EMITENTE',
        emitenteUf: extracao.emitente?.uf || 'SP',
        destinatarioCnpj: extracao.destinatario?.cnpj,
        destinatarioRazaoSocial: extracao.destinatario?.nome,
        destinatarioUf: extracao.destinatario?.uf || 'PR',
        valorTotalProdutos,
        valorTotalNota: extracao.resumoFinanceiro?.vNF || desembolsoTotalEntrada,
        valorTotalIcms: extracao.resumoFinanceiro?.vICMSTotal || 0,
        valorTotalIcmsSt: extracao.resumoFinanceiro?.vICMSSTTotal || 0,
        valorTotalIbs: rtcTotais.vIbsTotal,
        valorTotalCbs: rtcTotais.vCbs,
        xmlOriginal: rawXml || undefined,
        metadata: {
          motorRtc: motorRtcUtilizado,
          origemRtc: origemCalculoRtc,
          difalTotal: difalTotalDevido,
          cmvLiquido: cmvLiquidoCalculado,
        },
      });
      documentoIdSalvo = docGravado.id;
    } catch (err: unknown) {
      const anyErr = err as any;
      if (
        err instanceof ErroDocumentoDuplicado ||
        anyErr?.name === 'ErroDocumentoDuplicado' ||
        anyErr?.code === '23505'
      ) {
        jaExistia = true;
        const docExistente = await docRepo.buscarPorChave(input.empresaId, chaveAcesso);
        documentoIdSalvo = docExistente?.id;
      } else {
        throw err;
      }
    }

    // Registro imutável de execução do motor
    const execReg = await docRepo.registrarExecucaoMotor({
      escritorioId,
      empresaId: input.empresaId,
      documentoId: documentoIdSalvo,
      motorTipo: 'ORQUESTRADOR_DAG_FISCAL',
      versaoMotor: 'v6.0.0-dag',
      inputPayload: {
        chaveAcesso,
        regimeAdquirente,
        statusExtincao,
        destinacaoPadrao,
        incluirIbsCbsBcIcms,
      },
      outputPayload: {
        totaisRtc: rtcTotais,
        difalResumo: difalAuditoria.resumoDifalNota,
        camadasCredito,
        melhorCenario: melhorRegimeKey,
        duracaoMs: Date.now() - tInicio,
      },
      sucesso: true,
      duracaoMs: Date.now() - tInicio,
    });

    persistenciaResult = {
      salvo: true,
      documentoJaExistia: jaExistia,
      documentoId: documentoIdSalvo,
      execucaoMotorId: execReg.id,
    };
  }

  const duracaoTotalMs = Date.now() - tInicio;

  return {
    sucesso: true,
    chaveAcesso,
    sha256Xml,
    empresaId: input.empresaId,
    dataEmissao,
    perfilUtilizado: {
      regime: regimeAdquirente,
      vigenciaInicio: vigenciaInicioPerfil,
      vigenciaFim: vigenciaFimPerfil,
      origemPerfil,
      simplesOptanteHibrido2027,
      beneficiosParana,
    },
    etapas: {
      extracao: {
        sucesso: true,
        totalItens: (extracao.itens || []).length,
        emitente: {
          cnpj: extracao.emitente?.cnpj || '',
          razaoSocial: extracao.emitente?.nome || '',
          uf: extracao.emitente?.uf || 'PR',
          crt: extracao.emitente?.crt,
        },
        destinatario: {
          cnpj: extracao.destinatario?.cnpj,
          razaoSocial: extracao.destinatario?.nome,
          uf: extracao.destinatario?.uf || 'PR',
        },
        valoresNota: {
          vProd: valorTotalProdutos,
          vNF: extracao.resumoFinanceiro?.vNF || desembolsoTotalEntrada,
          vICMS: extracao.resumoFinanceiro?.vICMSTotal || 0,
          vST: extracao.resumoFinanceiro?.vICMSSTTotal || 0,
          vIBS: rtcTotais.vIbsTotal,
          vCBS: rtcTotais.vCbs,
        },
      },
      rtc: {
        sucesso: true,
        motorRtcUtilizado,
        origemCalculoRtc,
        versaoAplicacaoRfb,
        versaoBaseDadosRfb,
        duracaoRtcMs,
        totaisRtc: rtcTotais,
        validacaoXml: validacaoXmlResult,
      },
      icmsPr: {
        sucesso: true,
        versaoMotor: 'v5.0.0',
        resumoDifal: difalAuditoria.resumoDifalNota,
        itensDiagnosticoDifal: difalAuditoria.itensDiagnostico,
        itensDiagnosticoSt,
        alertasPr,
      },
      creditos: {
        sucesso: true,
        statusExtincaoFornecedor: statusExtincao,
        camadas: camadasCredito,
        retidoAguardandoExtincaoIbsCbs,
        itensCredito,
      },
      custosEPrecificacao: {
        sucesso: true,
        cmvLiquidoTotal: cmvLiquidoCalculado,
        desembolsoTotalEntrada,
        comparativoRegimes,
        melhorCenario: melhorRegimeKey,
      },
      persistencia: persistenciaResult,
    },
    alertasGerais,
    duracaoTotalMs,
  };
}

// ============================================================================
// HELPER PARA GERAÇÃO DETERMINÍSTICA DO COMPARATIVO DE 4 REGIMES (HALF_EVEN)
// ============================================================================

interface EntradaComparativoQuatroRegimes {
  valorTotalProdutos: number;
  valorTotalDesconto: number;
  valorTotalFrete: number;
  valorTotalSeguro: number;
  valorTotalOutros: number;
  valorTotalIpi: number;
  valorTotalSt: number;
  difalTotalDevido: number;
  fecopTotalDevido: number;
  camadasCredito: {
    totalDestacadoXml: { icms: number; pis: number; cofins: number; ipi: number; ibs: number; cbs: number; total: number };
    totalCreditoAdmitidoRegra: { icms: number; pis: number; cofins: number; ipi: number; ibs: number; cbs: number; total: number };
    totalCreditoEfetivadoCusto: { icms: number; pis: number; cofins: number; ipi: number; ibs: number; cbs: number; total: number };
  };
  margemAlvoPct: number;
  despesasVariaveisPct: number;
  ano: number;
  aliquotasEfetivas: AliquotasEfetivas;
}

function gerarComparativoQuatroRegimes(
  params: EntradaComparativoQuatroRegimes
): Record<'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL', CenarioComparativoRegime> {
  const {
    valorTotalProdutos,
    valorTotalDesconto,
    valorTotalFrete,
    valorTotalSeguro,
    valorTotalOutros,
    valorTotalIpi,
    valorTotalSt,
    difalTotalDevido,
    fecopTotalDevido,
    camadasCredito,
    margemAlvoPct,
    despesasVariaveisPct,
    ano,
    aliquotasEfetivas,
  } = params;

  const custoAterrissadoBruto = arredondarMoedaRfbNum(
    valorTotalProdutos -
      valorTotalDesconto +
      valorTotalFrete +
      valorTotalSeguro +
      valorTotalOutros +
      valorTotalIpi +
      valorTotalSt +
      difalTotalDevido +
      fecopTotalDevido
  );

  // 1. SIMPLES NACIONAL TRADICIONAL
  const cmvSimples = custoAterrissadoBruto;
  const aliqDasPct = aliquotasEfetivas.faixaSimples
    ? Math.max(4.0, aliquotasEfetivas.faixaSimples * 1.8)
    : 8.5; // Média comércio PR Anexo I
  const divisorSimples = new DecimalHalfEven(100)
    .minus(aliqDasPct)
    .minus(despesasVariaveisPct)
    .minus(margemAlvoPct)
    .dividedBy(100);
  const precoSimples = arredondarMoedaRfbNum(
    new DecimalHalfEven(cmvSimples).dividedBy(divisorSimples).toNumber()
  );
  const tribSimples = arredondarMoedaRfbNum(
    new DecimalHalfEven(precoSimples).times(aliqDasPct).dividedBy(100).toNumber()
  );

  // 2. SIMPLES HÍBRIDO 2027
  const credIbsCbsHibrido = arredondarMoedaRfbNum(
    camadasCredito.totalCreditoEfetivadoCusto.ibs + camadasCredito.totalCreditoEfetivadoCusto.cbs
  );
  const cmvHibrido = arredondarMoedaRfbNum(custoAterrissadoBruto - credIbsCbsHibrido);
  const aliqDasSemIva = Math.max(2.5, aliqDasPct - 2.8);
  const aliqIvaHibrido = 8.9; // 8.8% CBS + 0.1% IBS em 2027
  const aliqTotalHibrido = aliqDasSemIva + aliqIvaHibrido;
  const divisorHibrido = new DecimalHalfEven(100)
    .minus(aliqTotalHibrido)
    .minus(despesasVariaveisPct)
    .minus(margemAlvoPct)
    .dividedBy(100);
  const precoHibrido = arredondarMoedaRfbNum(
    new DecimalHalfEven(cmvHibrido).dividedBy(divisorHibrido).toNumber()
  );
  const tribHibrido = arredondarMoedaRfbNum(
    new DecimalHalfEven(precoHibrido).times(aliqTotalHibrido).dividedBy(100).toNumber()
  );

  // 3. LUCRO PRESUMIDO
  const aliqModalPrAno = resolverAliquotaPrBitemporal('00000000', `${ano}-06-01`).aliquotaIcmsPct;
  const credPresumido = arredondarMoedaRfbNum(
    camadasCredito.totalCreditoEfetivadoCusto.icms +
      (ano >= 2027 ? camadasCredito.totalCreditoEfetivadoCusto.ibs + camadasCredito.totalCreditoEfetivadoCusto.cbs : 0)
  );
  const cmvPresumido = arredondarMoedaRfbNum(custoAterrissadoBruto - credPresumido);
  const aliqPresumidoSaida =
    ano >= 2027
      ? arredondarMoedaRfbNum(aliqModalPrAno + 3.0)
      : arredondarMoedaRfbNum(aliqModalPrAno + 0.65 + 3.0 + 2.28);
  const divisorPresumido = new DecimalHalfEven(100)
    .minus(aliqPresumidoSaida)
    .minus(despesasVariaveisPct)
    .minus(margemAlvoPct)
    .dividedBy(100);
  const precoPresumido = arredondarMoedaRfbNum(
    new DecimalHalfEven(cmvPresumido).dividedBy(divisorPresumido).toNumber()
  );
  const tribPresumido = arredondarMoedaRfbNum(
    new DecimalHalfEven(precoPresumido).times(aliqPresumidoSaida).dividedBy(100).toNumber()
  );

  // 4. LUCRO REAL
  const credReal = camadasCredito.totalCreditoEfetivadoCusto.total;
  const cmvReal = arredondarMoedaRfbNum(custoAterrissadoBruto - credReal);
  const aliqRealSaida =
    ano >= 2027
      ? arredondarMoedaRfbNum(aliqModalPrAno + 5.0)
      : arredondarMoedaRfbNum(aliqModalPrAno + 9.25);
  const divisorReal = new DecimalHalfEven(100)
    .minus(aliqRealSaida)
    .minus(despesasVariaveisPct)
    .minus(margemAlvoPct)
    .dividedBy(100);
  const precoReal = arredondarMoedaRfbNum(
    new DecimalHalfEven(cmvReal).dividedBy(divisorReal).toNumber()
  );
  const tribReal = arredondarMoedaRfbNum(
    new DecimalHalfEven(precoReal).times(aliqRealSaida).dividedBy(100).toNumber()
  );

  return {
    SIMPLES_TRADICIONAL: {
      regime: 'SIMPLES_TRADICIONAL',
      nomeExibicao: 'Simples Nacional (Tradicional)',
      cmvLiquidoTotal: cmvSimples,
      creditosAproveitados: 0,
      tributosSaidaEstimados: tribSimples,
      precoVendaSugerido: precoSimples,
      margemLiquidaPct: margemAlvoPct,
      cargaTributariaEfetivaPct: aliqDasPct,
      melhorCenario: false,
      justificativa: 'DAS unificado com redução ICMS PR (Dec. 8.660/2018), sem direito a crédito de entrada.',
    },
    SIMPLES_HIBRIDO_2027: {
      regime: 'SIMPLES_HIBRIDO_2027',
      nomeExibicao: 'Simples Híbrido 2027 (LC 214/2025)',
      cmvLiquidoTotal: cmvHibrido,
      creditosAproveitados: credIbsCbsHibrido,
      tributosSaidaEstimados: tribHibrido,
      precoVendaSugerido: precoHibrido,
      margemLiquidaPct: margemAlvoPct,
      cargaTributariaEfetivaPct: arredondarMoedaRfbNum((tribHibrido / (precoHibrido || 1)) * 100),
      melhorCenario: false,
      justificativa: 'DAS segregado com recolhimento de IBS/CBS por fora e crédito amplo nas aquisições.',
    },
    LUCRO_PRESUMIDO: {
      regime: 'LUCRO_PRESUMIDO',
      nomeExibicao: 'Lucro Presumido',
      cmvLiquidoTotal: cmvPresumido,
      creditosAproveitados: credPresumido,
      tributosSaidaEstimados: tribPresumido,
      precoVendaSugerido: precoPresumido,
      margemLiquidaPct: margemAlvoPct,
      cargaTributariaEfetivaPct: aliqPresumidoSaida,
      melhorCenario: false,
      justificativa: 'ICMS pela conta gráfica ordinária e PIS/COFINS cumulativo sem crédito de insumo.',
    },
    LUCRO_REAL: {
      regime: 'LUCRO_REAL',
      nomeExibicao: 'Lucro Real',
      cmvLiquidoTotal: cmvReal,
      creditosAproveitados: credReal,
      tributosSaidaEstimados: tribReal,
      precoVendaSugerido: precoReal,
      margemLiquidaPct: margemAlvoPct,
      cargaTributariaEfetivaPct: aliqRealSaida,
      melhorCenario: false,
      justificativa: 'Não cumulatividade ampla: dedução de ICMS, PIS/COFINS (Tema 69 STF) e IBS/CBS extintos.',
    },
  };
}
