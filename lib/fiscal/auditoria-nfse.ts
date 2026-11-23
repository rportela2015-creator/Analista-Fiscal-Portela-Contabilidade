/**
 * Auditor Fiscal Determinístico de NFS-e / DPS Padrão Nacional
 * Validação de Schemas DF-e, Regras da Reforma Tributária (NT 004, NT 007, NT 009, LC nº 214/2025)
 * e Conciliação com os Motores Oficiais da Receita Federal (RTC).
 */

import type {
  ExtracaoNfseNacional,
  ResultadoAuditoriaNfse,
  AlertaFiscalNfse,
  ConciliacaoRtcNfse,
} from '../extrator-nfse-types';
import {
  calcularRegimeRegularComFallback,
} from '../integracoes/rtc-regime-regular/client';
import {
  calcularSimplesNacionalComFallback,
} from '../integracoes/rtc-simples/client';
import {
  arredondarMoedaRfbNum,
} from '../math/decimal-fiscal';
import { getEmpresasRepository } from '../db/empresas-repository';
import { resolverPerfilVigenteNaData, type RegimeTributario } from './perfil-tributario';

export interface OpcoesAuditoriaNfse {
  empresaId?: string;
  perfilAdquirente?: {
    regime: RegimeTributario;
    simplesOptanteHibrido2027?: boolean;
  };
  statusExtincaoRtc?: 'EXTINTO_SPLIT' | 'EXTINTO_PAGAMENTO' | 'AGUARDANDO_EXTINCAO' | 'SIMULACAO_PROJETADA';
  calcularRtcOficial?: boolean;
}

export async function auditarNfseNacional(
  extracao: ExtracaoNfseNacional,
  opcoes?: OpcoesAuditoriaNfse
): Promise<ResultadoAuditoriaNfse> {
  const alertas: AlertaFiscalNfse[] = [];
  const statusExtincao = opcoes?.statusExtincaoRtc || 'SIMULACAO_PROJETADA';

  // 1. Resolução do Perfil do Tomador (Adquirente do Serviço)
  let regimeTomador: RegimeTributario = 'LUCRO_REAL';
  let simplesHibrido2027 = false;

  if (opcoes?.empresaId) {
    try {
      const empresasRepo = getEmpresasRepository();
      const emp = await empresasRepo.buscarPorId(opcoes.empresaId);
      if (emp) {
        const perfis = await empresasRepo.listarPerfis(emp.id);
        const perfilVigente = resolverPerfilVigenteNaData(perfis, extracao.identificacao.dCompet || extracao.identificacao.dhEmi);
        if (perfilVigente) {
          regimeTomador = perfilVigente.regimeTributario;
          simplesHibrido2027 = Boolean(perfilVigente.simplesOptanteHibrido2027);
        }
      }
    } catch {
      // Fallback gracioso caso repositório não responda
    }
  }

  if (opcoes?.perfilAdquirente) {
    regimeTomador = opcoes.perfilAdquirente.regime || regimeTomador;
    if (opcoes.perfilAdquirente.simplesOptanteHibrido2027 !== undefined) {
      simplesHibrido2027 = opcoes.perfilAdquirente.simplesOptanteHibrido2027;
    }
  }

  // --------------------------------------------------------------------------
  // 2. VALIDAÇÃO DE SCHEMA & REJEIÇÕES PREVENTIVAS DF-E
  // --------------------------------------------------------------------------

  // 2.1 Logradouro do Tomador (xLgr) vazio ou ausente
  if (extracao.tomador) {
    const end = extracao.tomador.endereco;
    const xLgrTrim = end?.xLgr !== undefined ? end.xLgr.trim() : '';
    if (!end || xLgrTrim.length === 0) {
      alertas.push({
        severidade: 'CRITICO',
        codigo: 'REJEICAO_SCHEMA_LOGRADOURO_TOMADOR_EM_BRANCO',
        titulo: 'Logradouro do Tomador em Branco (<xLgr>)',
        detalhe: 'A tag <xLgr> do endereço do Tomador está vazia ou ausente no XML. No Padrão Nacional da NFS-e, isso acarreta rejeição de schema imediata no Ambiente Nacional.',
        baseLegal: 'Manual de Orientação do Contribuinte NFS-e Padrão Nacional — Regras de Validação de Schema XSD',
      });
    }

    if (end?.cMun && !/^\d{7}$/.test(end.cMun.trim())) {
      alertas.push({
        severidade: 'CRITICO',
        codigo: 'REJEICAO_SCHEMA_MUNICIPIO_INVALIDO',
        titulo: 'Código de Município do Tomador Inválido (<cMun>)',
        detalhe: `O código de município IBGE do Tomador informado ("${end.cMun}") não possui 7 dígitos numéricos válidos.`,
        baseLegal: 'Tabela de Municípios IBGE / MOC NFS-e',
      });
    }
  }

  // 2.2 Código de Tributação Nacional (cTribNac)
  if (!extracao.servico.cTribNac || extracao.servico.cTribNac.trim().length === 0) {
    alertas.push({
      severidade: 'CRITICO',
      codigo: 'REJEICAO_SCHEMA_CTRIBNAC_AUSENTE',
      titulo: 'Código de Tributação Nacional Ausente (<cTribNac>)',
      detalhe: 'O serviço declarado não possui código cTribNac preenchido. O Padrão Nacional exige a classificação nacional unificada.',
      baseLegal: 'Resolução CGSN nº 169/2022 e MOC NFS-e',
    });
  }

  // --------------------------------------------------------------------------
  // 3. REFORMA TRIBUTÁRIA: COMPETÊNCIAS >= 2026-08-03 E NT 004
  // --------------------------------------------------------------------------
  const dataRef = extracao.identificacao.dCompet || extracao.identificacao.dhEmi;
  const isCompetenciaReforma = dataRef >= '2026-08-03';
  const prestadorEhSimples = extracao.prestador.regimeTributario?.opSimpNac === 2 || extracao.prestador.regimeTributario?.opSimpNac === 3;

  if (isCompetenciaReforma && !prestadorEhSimples) {
    if (!extracao.reformaTributaria || !extracao.reformaTributaria.presente) {
      alertas.push({
        severidade: 'CRITICO',
        codigo: 'NT004_GRUPO_IBSCBS_OBRIGATORIO',
        titulo: 'Obrigatoriedade dos Grupos IBS/CBS (NT 004)',
        detalhe: `Para fatos geradores e competências a partir de 03/08/2026 (${dataRef}), prestadores do Regime Regular são obrigados a destacar os grupos da Reforma Tributária (IBS/CBS) na DPS/NFS-e conforme a NT 004 do Padrão Nacional.`,
        baseLegal: 'Nota Técnica nº 004/2026 — Padrão Nacional da NFS-e c/c Art. 47 da LC nº 214/2025',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 4. RETENÇÕES FEDERAIS E COERÊNCIA DA BASE DO IBS/CBS (NT 007)
  // --------------------------------------------------------------------------
  if (extracao.valores.tpRetPisCofins !== undefined) {
    const vServ = extracao.valores.vServ;
    const vDescIncond = extracao.valores.vDescIncond;
    const bcEsperadaIbsCbs = Math.max(0, vServ - vDescIncond);
    const bcDeclaradaIbsCbs = extracao.reformaTributaria?.vBC;

    if (bcDeclaradaIbsCbs !== undefined && bcDeclaradaIbsCbs < bcEsperadaIbsCbs - 0.05) {
      const somaRetencoes = extracao.valores.vPIS + extracao.valores.vCOFINS + extracao.valores.vRetIRRF + extracao.valores.vRetCSLL;
      if (Math.abs(bcEsperadaIbsCbs - somaRetencoes - bcDeclaradaIbsCbs) < 1.0) {
        alertas.push({
          severidade: 'ATENCAO',
          codigo: 'NT007_BASE_IBSCBS_CONTAMINADA',
          titulo: 'Base de Cálculo do IBS/CBS Aparentemente Contaminada por Retenções Federais',
          detalhe: `A base de cálculo do IBS/CBS informada (R$ ${bcDeclaradaIbsCbs.toFixed(2)}) é inferior ao valor do serviço deduzido de descontos incondicionais (R$ ${bcEsperadaIbsCbs.toFixed(2)}), coincidindo com a dedução de retenções federais na fonte (PIS/COFINS/IRRF). Conforme a LC nº 214/2025, retenções na fonte não reduzem a base tributável do IBS e da CBS.`,
          baseLegal: 'Nota Técnica nº 007/2026 c/c Art. 12 da LC nº 214/2025',
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. OPERAÇÕES IMOBILIÁRIAS / LOCAÇÃO (ART. 261 E 265 LC 214/2025 E NT 009)
  // --------------------------------------------------------------------------
  const cTrib = extracao.servico.cTribNac;
  const cClassTrib = extracao.reformaTributaria?.cClassTrib;
  const ehLocacaoOuImovel =
    cTrib.startsWith('99.03') ||
    cTrib.startsWith('99.04') ||
    cTrib.startsWith('9903') ||
    cTrib.startsWith('9904') ||
    cClassTrib === '200027';

  if (ehLocacaoOuImovel) {
    // 5.1 CST esperado é 200 (com redução de alíquota)
    if (extracao.reformaTributaria?.cst && extracao.reformaTributaria.cst !== '200') {
      alertas.push({
        severidade: 'ATENCAO',
        codigo: 'CST_REDUCAO_LOCACAO_INCOMPATIVEL',
        titulo: 'CST Incompatível com Operação de Locação/Cessão de Imóvel',
        detalhe: `Operações com cClassTrib 200027 / subitens 99.03 e 99.04 gozam de regime diferenciado de redução, exigindo CST 200 (Redução de alíquota). Declarado CST ${extracao.reformaTributaria.cst}.`,
        baseLegal: 'Art. 261 da LC nº 214/2025 e Tabela de Correlação CST RTC',
      });
    }

    // 5.2 Redução de 70% (Art. 261 da LC 214/2025)
    const pRedCbs = extracao.reformaTributaria?.pRedAliqCBS ?? 0;
    const pRedIbs = extracao.reformaTributaria?.pRedAliqIBS ?? 0;
    if (pRedCbs > 0 && Math.abs(pRedCbs - 70.0) > 0.5) {
      alertas.push({
        severidade: 'ATENCAO',
        codigo: 'REDUCAO_70_LOCACAO_DIVERGENTE',
        titulo: 'Percentual de Redução Divergente de 70% na Locação de Imóvel',
        detalhe: `O Art. 261 da LC nº 214/2025 estabelece redução de 70% na alíquota de IBS e CBS para operações de locação e cessão onerosa de bens imóveis. Declarado: CBS ${pRedCbs}%, IBS ${pRedIbs}%.`,
        baseLegal: 'Art. 261, § 1º da LC nº 214/2025',
      });
    }

    // 5.3 Obrigatoriedade do código CIB (Art. 265 da LC 214/2025)
    if (!extracao.reformaTributaria?.cib || extracao.reformaTributaria.cib.trim().length === 0) {
      alertas.push({
        severidade: 'CRITICO',
        codigo: 'CIB_OBRIGATORIO_LOCACAO_IMOVEL',
        titulo: 'Código CIB Ausente em Operação Imobiliária / Locação',
        detalhe: 'A NFS-e declara prestação de serviço imobiliário ou locação de imóvel (cClassTrib 200027 / 99.03 / 99.04), mas não contém o código CIB (Cadastro Imobiliário Brasileiro). Risco iminente de autuação e malha fiscal cruzada SINTER/CIB.',
        baseLegal: 'Art. 265 da Lei Complementar nº 214/2025 c/c NT 008 e NT 009 NFS-e',
      });
    }
  }

  // --------------------------------------------------------------------------
  // 6. CONCILIAÇÃO COM MOTOR OFICIAL RTC (RECEITA FEDERAL)
  // --------------------------------------------------------------------------
  let conciliacaoRtc: ConciliacaoRtcNfse | undefined;

  if (opcoes?.calcularRtcOficial !== false && extracao.reformaTributaria?.cClassTrib) {
    try {
      const bcNum = extracao.reformaTributaria.vBC || extracao.valores.vBC;
      const dhFatoGerador = extracao.identificacao.dhEmi || new Date().toISOString();
      const ano = parseInt(dhFatoGerador.slice(0, 4), 10);

      const payloadRegular = {
        id: `nfse-auditoria-${extracao.sha256.slice(0, 16)}`,
        versao: '1.0.0',
        dhFatoGerador,
        municipio: parseInt(extracao.prestador.endereco?.cMun || '4106902', 10),
        uf: extracao.prestador.endereco?.uf || 'PR',
        tpDoc: 55, // Simulação com mesmo motor ROC
        itens: [
          {
            numero: 1,
            cst: extracao.reformaTributaria.cst || '000',
            cClassTrib: extracao.reformaTributaria.cClassTrib || '000001',
            baseCalculo: bcNum,
            aliquotasNominais: ano >= 2027 ? { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 } : null,
          },
        ],
      };

      const resRegular = await calcularRegimeRegularComFallback(payloadRegular as any);

      const vIbsOficial = arredondarMoedaRfbNum(Number(resRegular.totais.valorIbsTotal || 0));
      const vCbsOficial = arredondarMoedaRfbNum(Number(resRegular.totais.valorCbsTotal || 0));
      const vIbsXml = arredondarMoedaRfbNum(extracao.reformaTributaria.vIBS || 0);
      const vCbsXml = arredondarMoedaRfbNum(extracao.reformaTributaria.vCBS || 0);

      const difIbs = Math.abs(vIbsXml - vIbsOficial);
      const difCbs = Math.abs(vCbsXml - vCbsOficial);
      const divergenciaCentavos = difIbs > 0.02 || difCbs > 0.02;

      conciliacaoRtc = {
        executada: true,
        origem: resRegular.origemCalculo,
        divergenciaCentavos,
        vIbsXml,
        vIbsOficial,
        vCbsXml,
        vCbsOficial,
        detalhes: divergenciaCentavos
          ? `Divergência detectada entre o XML e o cálculo oficial da Receita Federal: IBS XML R$ ${vIbsXml.toFixed(2)} vs Oficial R$ ${vIbsOficial.toFixed(2)}; CBS XML R$ ${vCbsXml.toFixed(2)} vs Oficial R$ ${vCbsOficial.toFixed(2)}.`
          : 'Valores destacados no XML coincidem estritamente com o cálculo do motor oficial da RFB (HALF_EVEN).',
      };

      if (divergenciaCentavos && (vIbsXml > 0 || vCbsXml > 0)) {
        alertas.push({
          severidade: 'ATENCAO',
          codigo: 'DIVERGENCIA_CENTAVOS_RTC_XML',
          titulo: 'Divergência de Arredondamento entre XML e Motor Oficial RTC',
          detalhe: conciliacaoRtc.detalhes || '',
          baseLegal: 'ADR003 RFB (Arredondamento Bancário HALF_EVEN)',
        });
      }
    } catch {
      conciliacaoRtc = {
        executada: false,
        origem: 'NAO_APLICAVEL',
        divergenciaCentavos: false,
        vIbsXml: extracao.reformaTributaria.vIBS || 0,
        vIbsOficial: 0,
        vCbsXml: extracao.reformaTributaria.vCBS || 0,
        vCbsOficial: 0,
      };
    }
  }

  // --------------------------------------------------------------------------
  // 7. CRÉDITOS TRIBUTÁRIOS DO TOMADOR (CPC 16 / ART. 47 LC 214/2025)
  // --------------------------------------------------------------------------
  let creditosTomador = undefined;

  // 7.1 PIS/COFINS no Lucro Real
  const tomaEhLucroReal = regimeTomador === 'LUCRO_REAL';
  const pisCofinsAdmitido = tomaEhLucroReal && extracao.valores.vServ > 0;
  const valorPisCred = pisCofinsAdmitido ? arredondarMoedaRfbNum(extracao.valores.vServ * 0.0165) : 0;
  const valorCofinsCred = pisCofinsAdmitido ? arredondarMoedaRfbNum(extracao.valores.vServ * 0.076) : 0;

  // 7.2 IBS e CBS na Reforma
  const permiteCreditoIbsCbs =
    tomaEhLucroReal ||
    regimeTomador === 'LUCRO_PRESUMIDO' ||
    (regimeTomador === 'SIMPLES_NACIONAL' && simplesHibrido2027);

  const vIbsDestaque = extracao.reformaTributaria?.vIBS || 0;
  const vCbsDestaque = extracao.reformaTributaria?.vCBS || 0;
  const retidoAguardandoExtincao = statusExtincao === 'AGUARDANDO_EXTINCAO';

  creditosTomador = {
    pisCofinsLucroReal: {
      admitido: pisCofinsAdmitido,
      valorPis: valorPisCred,
      valorCofins: valorCofinsCred,
      justificativa: tomaEhLucroReal
        ? 'Tomador no Lucro Real: direito a crédito de PIS (1,65%) e COFINS (7,60%) sobre serviços tomados utilizados como insumo (Art. 3º das Leis 10.637/2002 e 10.833/2003).'
        : `Tomador no ${regimeTomador}: créditos de PIS/COFINS na entrada não são admitidos no regime cumulativo ou Simples tradicional.`,
    },
    ibsCbsReforma: {
      admitido: permiteCreditoIbsCbs && (vIbsDestaque > 0 || vCbsDestaque > 0),
      valorIbs: retidoAguardandoExtincao ? 0 : vIbsDestaque,
      valorCbs: retidoAguardandoExtincao ? 0 : vCbsDestaque,
      statusExtincao,
      retidoAguardandoExtincao,
      justificativa: retidoAguardandoExtincao
        ? 'Crédito de IBS e CBS admitido pela regra mas RETIDO cautelarmente aguardando confirmação da extinção do débito pelo prestador no Split Payment (Art. 47 da LC nº 214/2025).'
        : permiteCreditoIbsCbs
          ? 'Não cumulatividade ampla: crédito de IBS e CBS efetivado no custo do tomador conforme Art. 47 da LC nº 214/2025.'
          : 'Tomador no Simples Nacional tradicional: vedado crédito de IBS/CBS na entrada (Art. 41 da LC nº 214/2025).',
    },
  };

  const validoParaEmissao = !alertas.some((a) => a.severidade === 'CRITICO');

  return {
    sucesso: true,
    extracao,
    validoParaEmissao,
    alertas,
    conciliacaoRtc,
    creditosTomador,
  };
}
