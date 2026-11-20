'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Dataset, Reforma } from '@/lib/data';
import { loadDataset, loadReforma } from '@/lib/data';
import {
  loadMarcoLegal,
  type MarcoLegal,
  type RegimeTributario,
  type DestinacaoMercadoria,
  mapearCfopEntrada,
  calcularMvaAjustada,
  calcularEstornoProporcionalIcms,
  listarFontesOficiaisMarcoLegal,
  detectarReducoesFiscaisPorNcm,
  calcularReducaoConvenioIcms,
  calcularDifalDetalhado,
  calcularDetalhamentoSimplesHibrido,
  obterFcpPorUf,
  type TipoConvenioIcms,
  type DetalhamentoSimplesHibrido,
  type ResultadoDifalDetalhado,
} from '@/lib/marco-legal';
import {
  simular,
  sugerirAliquotasPrecificacao,
  calcularCustoAquisicaoReal,
  compararQuatroRegimes,
  ratearDespesasAcessoriaEFrete,
  determinarCfopVendaDestinatario,
  type ItemPreco,
  type ParamsPreco,
  type AliquotasSugeridas,
  type ResultadoDetalhado,
  type ComparativoRegimesResultado,
  type CrtEmitente,
  simularPrecificacaoDualStack2027PR,
  compararFornecedoresCustoAterrissadoPR,
  simularImpactoCombustivelAdRem2027,
  type CotacaoFornecedorPR,
} from '@/lib/precificacao';
import type { PrecificacaoItemInput } from '@/lib/extrator-nfe-types';
import { esc } from '@/lib/html';
import { PORTELA_HEADER_CSS, renderHeaderPortela } from '@/lib/relatorio-header';

export interface PrecificarProps {
  itensIniciais?: PrecificacaoItemInput[];
}

const ITEM_PADRAO: PrecificacaoItemInput = {
  codigo: 'PROD-001',
  descricao: 'Produto Exemplo (Revenda / Comercialização)',
  ncm: '84713012',
  cfop: '5102',
  quantidade: 1,
  valorBrutoEntrada: 100,
  freteSeguroOutrasEntrada: 5,
  descontoIncondicionalEntrada: 0,
  ipiEntrada: 10,
  icmsStEntrada: 0,
  iiEntrada: 0,
  isEntrada: 0,
  credIcmsEntrada: 12,
  credPisCofinsEntrada: 9.25,
  credCbsEntrada: 8.8,
  credIbsEntrada: 0.1,
  crtEmitente: '3',
  origemMercadoria: '0',
  tipoEstabelecimento: 'comercio',
  destinacao: 'comercializacao',
  modFrete: '0',
  pesoBruto: 1.5,
};

export default function Precificar({ itensIniciais }: PrecificarProps) {
  // ---------------------------------------------------------------------------
  // 1. HOOKS DE ESTADO (ORDEM ESTRITA NO TOPO ABSOLUTO - scripts/hookcheck.mjs)
  // ---------------------------------------------------------------------------
  const [ds, setDs] = useState<Dataset | null>(null);
  const [reforma, setReforma] = useState<Reforma | null>(null);
  const [marco, setMarco] = useState<MarcoLegal | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Itens carregados da NF-e ou manuais
  const [itens, setItens] = useState<PrecificacaoItemInput[]>([]);
  const [itemIndex, setItemIndex] = useState<number>(0);

  // Cenário de Simulação Geral
  const [ano, setAno] = useState<number>(2027);
  const [regime, setRegime] = useState<RegimeTributario>('presumido');
  const [ufOrigem, setUfOrigem] = useState<string>('PR');
  const [ufDestino, setUfDestino] = useState<string>('PR');
  const [margemAlvo, setMargemAlvo] = useState<number>(20);
  const [despesasVar, setDespesasVar] = useState<number>(5);
  const [custoFixo, setCustoFixo] = useState<number>(0);
  const [rbt12, setRbt12] = useState<number>(360000);
  const [documentoInidoneo, setDocumentoInidoneo] = useState<boolean>(false);

  // Parâmetros Fiscais Avançados (Etapas 5 e 6)
  const [destinacao, setDestinacao] = useState<DestinacaoMercadoria>('comercializacao');
  const [crtEmitente, setCrtEmitente] = useState<CrtEmitente>('3');
  const [origemMercadoria, setOrigemMercadoria] = useState<string>('0');
  const [pisCofinsMonofasico, setPisCofinsMonofasico] = useState<boolean>(false);
  const [baseReduzidaSaidaPct, setBaseReduzidaSaidaPct] = useState<number>(100);
  const [tipoEstabelecimento, setTipoEstabelecimento] = useState<'comercio' | 'industria'>('comercio');

  // Módulo de Frete CIF vs. FOB (CT-e)
  const [modFrete, setModFrete] = useState<'0' | '1'>('0');
  const [freteCteTotal, setFreteCteTotal] = useState<number>(0);
  const [icmsFreteCteTotal, setIcmsFreteCteTotal] = useState<number>(0);
  const [criterioRateio, setCriterioRateio] = useState<'valor' | 'peso'>('valor');

  // Governança Contábil: Custos Fixos Totais e Ponto de Equilíbrio (PEC)
  const [custosFixosTotais, setCustosFixosTotais] = useState<number>(5000);

  // Gaveta do Marco Legal & Fontes Oficiais
  const [expandirMarcoLegal, setExpandirMarcoLegal] = useState<boolean>(false);

  // Overrides Manuais de Alíquotas
  const [modoEdicao, setModoEdicao] = useState<boolean>(false);
  const [overrides, setOverrides] = useState<Partial<AliquotasSugeridas>>({});

  // Parâmetros Específicos da Etapa 12: Convênios ICMS/PR e Simples Híbrido
  const [convenioIcmsSelecionado, setConvenioIcmsSelecionado] = useState<string>('auto');
  const [hibridoComprasCreditoPct, setHibridoComprasCreditoPct] = useState<number>(50);
  const [hibridoMixB2bPct, setHibridoMixB2bPct] = useState<number>(40);

  // Sub-etapa 18.5: Dual-Stack 2027 & Mesa de Compras PR
  const [incluirIbsCbsBcIcms, setIncluirIbsCbsBcIcms] = useState<boolean>(true);
  const [expandirMesaCompras, setExpandirMesaCompras] = useState<boolean>(false);
  const [taxaCapGiroMesa, setTaxaCapGiroMesa] = useState<number>(1.5);
  const [prazoEstoqueMesa, setPrazoEstoqueMesa] = useState<number>(45);
  const [cotacoesMesa, setCotacoesMesa] = useState<CotacaoFornecedorPR[]>([
    {
      id: 'pr-normal',
      nome: 'Fornecedor PR (Regime Normal)',
      ufEmitente: 'PR',
      crtEmitente: 3,
      precoUnitario: 1000,
      freteUnitario: 30,
      vIpiUnitario: 0,
    },
    {
      id: 'sc-normal',
      nome: 'Fornecedor SC (Regime Normal - Sem Protocolo)',
      ufEmitente: 'SC',
      crtEmitente: 3,
      precoUnitario: 1000,
      freteUnitario: 50,
      vIpiUnitario: 100,
    },
    {
      id: 'sc-simples',
      nome: 'Fornecedor SC (Simples Nacional - Conv. 35/11)',
      ufEmitente: 'SC',
      crtEmitente: 1,
      precoUnitario: 1000,
      freteUnitario: 50,
      vIpiUnitario: 100,
    },
  ]);

  // ---------------------------------------------------------------------------
  // 2. EFEITOS DE CARGA E SINCRONIZAÇÃO
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let ativo = true;
    Promise.all([loadDataset(), loadReforma(), loadMarcoLegal()]).then(([d, ref, m]) => {
      if (ativo) {
        setDs(d);
        setReforma(ref);
        setMarco(m);
        setCarregando(false);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (itensIniciais && itensIniciais.length > 0) {
      setItens(itensIniciais);
      setItemIndex(0);
      return;
    }
    try {
      const salvo = sessionStorage.getItem('ncm-precificar-itens');
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItens(parsed);
          setItemIndex(0);
        }
      }
    } catch {
      /* storage indisponível */
    }
  }, [itensIniciais]);

  useEffect(() => {
    const itemSel = itens[itemIndex];
    if (itemSel) {
      if (itemSel.destinacao) setDestinacao(itemSel.destinacao);
      if (itemSel.crtEmitente) setCrtEmitente(itemSel.crtEmitente);
      if (itemSel.origemMercadoria) setOrigemMercadoria(itemSel.origemMercadoria);
      if (itemSel.pisCofinsMonofasico !== undefined) setPisCofinsMonofasico(itemSel.pisCofinsMonofasico);
      if (itemSel.baseReduzidaSaidaPct !== undefined) setBaseReduzidaSaidaPct(itemSel.baseReduzidaSaidaPct);
      if (itemSel.tipoEstabelecimento) setTipoEstabelecimento(itemSel.tipoEstabelecimento);
      if ((itemSel as any).ufOrigem) setUfOrigem((itemSel as any).ufOrigem);
      if ((itemSel as any).ufDestino) setUfDestino((itemSel as any).ufDestino);
      if (itemSel.modFrete === '0' || itemSel.modFrete === '1') setModFrete(itemSel.modFrete);
    }
  }, [itens, itemIndex]);

  // ---------------------------------------------------------------------------
  // 3. MEMOS DE CÁLCULO E PROCESSAMENTO FISCAL
  // ---------------------------------------------------------------------------
  const itensAtuais = useMemo(() => {
    return itens.length > 0 ? itens : [ITEM_PADRAO];
  }, [itens]);

  // Rateio de frete CT-e FOB
  const itensRateados = useMemo(() => {
    return ratearDespesasAcessoriaEFrete(itensAtuais, {
      freteCteTotal,
      icmsFreteCteTotal,
      criterioRateio,
      modFrete,
      regimeDestinatario: regime,
      mercadoriaSujeitaSt: Boolean(itensAtuais[itemIndex]?.temSt),
    });
  }, [itensAtuais, freteCteTotal, icmsFreteCteTotal, criterioRateio, modFrete, regime, itemIndex]);

  const itemAtual = itensRateados[itemIndex] || itensRateados[0];

  // De-Para de CFOP
  const deParaCfop = useMemo(() => {
    if (!marco) return null;
    return mapearCfopEntrada(itemAtual.cfop || '5102', destinacao, ufOrigem, ufDestino, marco);
  }, [itemAtual.cfop, destinacao, ufOrigem, ufDestino, marco]);

  // Dados do NCM
  const dadosNcm = useMemo(() => {
    return ds?.byD8?.get(itemAtual.ncm.replace(/\D/g, ''));
  }, [ds, itemAtual.ncm]);

  // Sugestão de alíquotas com overrides
  const sugestao = useMemo(() => {
    if (!marco) return null;
    return sugerirAliquotasPrecificacao({
      ncm: itemAtual.ncm,
      cClassTrib: itemAtual.cClassTrib,
      cstIcms: itemAtual.cstIcms,
      csosn: itemAtual.csosn,
      temSt: Boolean(deParaCfop?.temSt || itemAtual.temSt),
      ano,
      regime,
      ufOrigem,
      ufDestino,
      rbt12,
      dadosNcm,
      dadosReforma: reforma,
      marco,
      overrides,
    });
  }, [
    itemAtual.ncm,
    itemAtual.cClassTrib,
    itemAtual.cstIcms,
    itemAtual.csosn,
    itemAtual.temSt,
    deParaCfop,
    ano,
    regime,
    ufOrigem,
    ufDestino,
    rbt12,
    dadosNcm,
    reforma,
    marco,
    overrides,
  ]);

  // Montagem do ItemPreco com todas as variáveis da NF-e e rateio
  const itemPreco: ItemPreco = useMemo(() => {
    return {
      codigo: itemAtual.codigo,
      descricao: itemAtual.descricao,
      ncm: itemAtual.ncm,
      cClassTrib: itemAtual.cClassTrib,
      cstIcms: itemAtual.cstIcms,
      csosn: itemAtual.csosn,
      origemMercadoria,
      crtEmitente,
      modFrete,
      pesoBruto: itemAtual.pesoBruto,
      cfopEntradaMapeado: deParaCfop?.cfopEntrada,
      pRedBC: itemAtual.pRedBC,
      pRedBCST: itemAtual.pRedBCST,
      vICMSDeson: itemAtual.vICMSDeson,
      motDesICMS: itemAtual.motDesICMS,
      pMVAST: itemAtual.pMVAST,
      pisCofinsMonofasico,
      temSt: Boolean(deParaCfop?.temSt || itemAtual.temSt),
      baseReduzidaSaidaPct,
      tipoEstabelecimento,
      destinacao,
      ufOrigem,
      ufDestino,
      quantidade: itemAtual.quantidade,
      valorBrutoEntrada: itemAtual.valorBrutoEntrada,
      freteSeguroOutrasEntrada: itemAtual.freteSeguroOutrasEntrada,
      descontoIncondicionalEntrada: itemAtual.descontoIncondicionalEntrada,
      ipiEntrada: itemAtual.ipiEntrada,
      icmsStEntrada: itemAtual.icmsStEntrada,
      iiEntrada: itemAtual.iiEntrada,
      isEntrada: itemAtual.isEntrada,
      credIcmsEntrada: itemAtual.credIcmsEntrada,
      credPisCofinsEntrada: itemAtual.credPisCofinsEntrada,
      credCbsEntrada: itemAtual.credCbsEntrada,
      credIbsEntrada: itemAtual.credIbsEntrada,
      pRedCbs: sugestao?.aliquotasAplicadas.reducaoIbsCbsPct,
      pRedIbs: sugestao?.aliquotasAplicadas.reducaoIbsCbsPct,
    };
  }, [
    itemAtual,
    origemMercadoria,
    crtEmitente,
    modFrete,
    deParaCfop,
    pisCofinsMonofasico,
    baseReduzidaSaidaPct,
    tipoEstabelecimento,
    destinacao,
    ufOrigem,
    ufDestino,
    sugestao,
  ]);

  // Parâmetros de precificação
  const paramsPreco: ParamsPreco = useMemo(() => {
    return {
      ano,
      uf: ufDestino,
      regime,
      documentoInidoneo,
      destinoItem: destinacao,
      rbt12Simples: rbt12,
      margemLiquidaPct: margemAlvo,
      despesasVariaveisPct: despesasVar,
      custoFixoUnit: custoFixo,
      custosFixosTotaisPeriodo: custosFixosTotais,
      icmsSaidaPct: sugestao?.aliquotasAplicadas.icmsVendaPct ?? 18,
      isSaidaPct: sugestao?.aliquotasAplicadas.isPct ?? 0,
      irpjCsllPct: sugestao?.aliquotasAplicadas.irpjCsllEfetivoPct ?? 2.28,
      pisCofinsMonofasico,
      temSt: Boolean(deParaCfop?.temSt || itemAtual.temSt),
      baseReduzidaSaidaPct,
      tipoEstabelecimento,
      overrides: sugestao?.aliquotasAplicadas,
    };
  }, [
    ano,
    ufDestino,
    regime,
    documentoInidoneo,
    destinacao,
    rbt12,
    margemAlvo,
    despesasVar,
    custoFixo,
    custosFixosTotais,
    sugestao,
    pisCofinsMonofasico,
    deParaCfop,
    itemAtual.temSt,
    baseReduzidaSaidaPct,
    tipoEstabelecimento,
  ]);

  // Custo de Aquisição Real (NBC TG 16)
  const compCusto = useMemo(() => {
    return calcularCustoAquisicaoReal(itemPreco, regime, {
      documentoInidoneo,
      destinoItem: destinacao,
      tipoEstabelecimento,
      ufOrigem,
      ufDestino,
      baseReduzidaSaidaPct,
      marco,
    });
  }, [itemPreco, regime, documentoInidoneo, destinacao, tipoEstabelecimento, ufOrigem, ufDestino, baseReduzidaSaidaPct, marco]);

  // Simulação e Comparativo dos 4 Regimes
  const { resultado, comparativo, erroCalculo } = useMemo(() => {
    if (!reforma || !marco) {
      return { resultado: null, comparativo: null, erroCalculo: null };
    }
    try {
      const res = simular(itemPreco, paramsPreco, { reforma, marco });
      const comp = compararQuatroRegimes(itemPreco, paramsPreco, { reforma, marco });
      return { resultado: res, comparativo: comp, erroCalculo: null };
    } catch (e: any) {
      return { resultado: null, comparativo: null, erroCalculo: e.message || 'Erro ao calcular formação de preço' };
    }
  }, [itemPreco, paramsPreco, reforma, marco]);

  // Barra Horizontal Segmentada de Decomposição do Preço (100% Stacked Bar)
  const decompPreco = useMemo(() => {
    if (!resultado) return null;
    const pv = resultado.preco.precoFinal;
    if (pv <= 0) return null;

    const custo = compCusto.custoUnitarioReal;
    const dv = resultado.resultado.despesasVariaveis;
    const tribDentro = resultado.relatorioMargens?.tributosVendaPorDentro ?? resultado.preco.vICMS;
    const irpj = resultado.resultado.irpjCsll;
    const ivaDual = resultado.preco.vCBS + resultado.preco.vIBS + resultado.preco.vIS;
    const margemLiq = Math.max(0, resultado.resultado.lucroLiquido);

    const calcPct = (v: number) => Math.max(0, Math.min(100, Math.round((v / pv) * 1000) / 10));

    return {
      custo: { valor: custo, pct: calcPct(custo), cor: '#334155', label: 'Custo Real de Aquisição' },
      dv: { valor: dv, pct: calcPct(dv), cor: '#ea580c', label: 'Despesas Comerciais / Variáveis' },
      tribDentro: { valor: tribDentro, pct: calcPct(tribDentro), cor: '#7c3aed', label: 'Tributos Saída (ICMS / DAS)' },
      irpj: { valor: irpj, pct: calcPct(irpj), cor: '#dc2626', label: 'Provisão IRPJ / CSLL' },
      ivaDual: { valor: ivaDual, pct: calcPct(ivaDual), cor: '#0284c7', label: 'IVA Dual por Fora (Split Payment)' },
      margemLiq: { valor: margemLiq, pct: calcPct(margemLiq), cor: '#16a34a', label: 'Margem Líquida Realizada' },
    };
  }, [resultado, compCusto]);

  // Catálogo de Normas Oficiais
  const fontesOficiais = useMemo(() => {
    return listarFontesOficiaisMarcoLegal(marco);
  }, [marco]);

  // ---------------------------------------------------------------------------
  // 3.1 DETECÇÃO AUTOMÁTICA DE BENEFÍCIOS FISCAIS (REFORMA + RICMS/PR E CONVÊNIOS)
  // ---------------------------------------------------------------------------
  const beneficiosFiscais = useMemo(() => {
    const reducaoAuto = detectarReducoesFiscaisPorNcm(itemAtual.ncm, ufDestino, marco);
    const fcpDestino = obterFcpPorUf(ufDestino, marco);

    let convenioEfetivo: string = convenioIcmsSelecionado;
    if (convenioEfetivo === 'auto') {
      if (reducaoAuto?.icms?.convenioCorrelato === 'CONV-ICMS-52-1991') {
        convenioEfetivo = 'conv_52_91_agricola';
      } else if (reducaoAuto?.icms?.convenioCorrelato === 'CONV-ICMS-100-1997') {
        convenioEfetivo = 'conv_100_97_60';
      } else {
        convenioEfetivo = 'nenhum';
      }
    }

    const isInterna = ufOrigem.toUpperCase() === ufDestino.toUpperCase();
    const aliqNominal = isInterna ? 19.5 : (['PR', 'SP', 'RJ', 'MG', 'RS', 'SC'].includes(ufOrigem.toUpperCase()) ? 12.0 : 7.0);
    let aliqEfetiva = aliqNominal;
    let pRedBC = 0;
    let diferimentoPct = 0;
    let cstIcms = itemAtual.cstIcms || '00';
    let dispensaEstorno = true;
    let descricaoRegra = 'Tributação Integral de ICMS conforme alíquota padrão da UF.';
    let normaId = 'RICMS-PR-REGRA-GERAL';

    if (convenioEfetivo === 'conv_52_91_agricola') {
      const c = calcularReducaoConvenioIcms({
        tipoConvenio: 'CONV_52_91_MAQ_AGRICOLA',
        ufOrigem,
        ufDestino,
        aliqNominalIcmsPct: aliqNominal,
        marco,
      });
      aliqEfetiva = c.aliqEfetivaPct;
      pRedBC = c.pRedBC;
      cstIcms = c.cstSugerido;
      dispensaEstorno = c.dispensaEstornoEntrada;
      descricaoRegra = c.descricaoRegra;
      normaId = c.normaId;
    } else if (convenioEfetivo === 'conv_52_91_industrial') {
      const c = calcularReducaoConvenioIcms({
        tipoConvenio: 'CONV_52_91_MAQ_INDUSTRIAL',
        ufOrigem,
        ufDestino,
        aliqNominalIcmsPct: aliqNominal,
        marco,
      });
      aliqEfetiva = c.aliqEfetivaPct;
      pRedBC = c.pRedBC;
      cstIcms = c.cstSugerido;
      dispensaEstorno = c.dispensaEstornoEntrada;
      descricaoRegra = c.descricaoRegra;
      normaId = c.normaId;
    } else if (convenioEfetivo === 'conv_100_97_60') {
      const c = calcularReducaoConvenioIcms({
        tipoConvenio: 'CONV_100_97_INSUMO_AGRO',
        ufOrigem,
        ufDestino,
        aliqNominalIcmsPct: aliqNominal,
        marco,
      });
      aliqEfetiva = c.aliqEfetivaPct;
      pRedBC = c.pRedBC;
      cstIcms = c.cstSugerido;
      dispensaEstorno = c.dispensaEstornoEntrada;
      descricaoRegra = c.descricaoRegra;
      normaId = c.normaId;
    } else if (convenioEfetivo === 'conv_100_97_30') {
      pRedBC = 30.0;
      aliqEfetiva = Math.round(aliqNominal * 0.7 * 100) / 100;
      cstIcms = '20';
      dispensaEstorno = true;
      descricaoRegra = 'Convênio ICMS 100/1997: Redução de 30% na base de cálculo de insumos agropecuários com manutenção de créditos na entrada.';
      normaId = 'CONV-ICMS-100-1997';
    } else if (convenioEfetivo === 'diferimento_parcial_pr_12') {
      aliqEfetiva = 12.0;
      diferimentoPct = 38.4615;
      cstIcms = '51';
      dispensaEstorno = true;
      descricaoRegra = 'Art. 28 Anexo VIII RICMS/PR: Diferimento parcial de ICMS na saída interna B2B (carga tributária efetiva de 12%).';
      normaId = 'RICMS-PR-ART28-ANEXO-VIII';
    } else if (convenioEfetivo === 'diferimento_total_pr') {
      aliqEfetiva = 0.0;
      diferimentoPct = 100.0;
      cstIcms = '51';
      dispensaEstorno = true;
      descricaoRegra = 'Art. 31 Anexo VIII RICMS/PR: Diferimento total de 100% de ICMS para etapa subsequente (CST 51).';
      normaId = 'RICMS-PR-ART31-ANEXO-VIII';
    } else if (convenioEfetivo === 'cesta_basica_pr') {
      aliqEfetiva = 7.0;
      pRedBC = Math.round((1 - 7.0 / aliqNominal) * 10000) / 100;
      cstIcms = '20';
      dispensaEstorno = false;
      descricaoRegra = 'Item 6 Anexo II RICMS/PR: Redução de base de cálculo da cesta básica para carga de 7%. Exige estorno proporcional de créditos na entrada.';
      normaId = 'RICMS-PR-ANEXO-II-ISENCAO';
    }

    // Reforma Tributária
    const cClassTrib = itemAtual.cClassTrib || reducaoAuto?.reforma?.cClassTrib || '000001';
    const reducaoIbsCbsPct = reducaoAuto?.reforma?.reducaoIbsCbsPct ?? 0;
    const cstIbsCbs = reducaoIbsCbsPct === 100 ? '02' : reducaoIbsCbsPct > 0 ? '01' : '01';
    const exigeTribRegular = reducaoIbsCbsPct > 0;
    const temaReforma = reducaoAuto?.reforma?.tema || (reducaoIbsCbsPct > 0 ? 'Regime Diferenciado da Reforma' : 'Regime Regular Geral');

    // Apuração do DIFAL quando destinação for consumo ou ativo
    let difalInfo: ResultadoDifalDetalhado | null = null;
    const exigeDifal = (destinacao === 'uso_consumo' || destinacao === 'ativo_imobilizado') && ufOrigem !== ufDestino;
    if (exigeDifal) {
      const metodologia = regime === 'simples' ? 'base_unica' : 'base_dupla';
      difalInfo = calcularDifalDetalhado({
        valorOperacao: compCusto.valorProdutoBruto || 100,
        aliqInterestadualPct: aliqNominal,
        aliqInternaDestinoPct: 19.5,
        ufDestino,
        metodologia,
        incluirFcp: true,
        marco,
      });
    }

    return {
      reforma: {
        cClassTrib,
        cstIbsCbs,
        reducaoIbsCbsPct,
        exigeTribRegular,
        tema: temaReforma,
        normaId: reducaoAuto?.reforma?.normaId || 'LC214-ANEXOS-REDUCOES',
      },
      icms: {
        convenioSelecionado: convenioEfetivo,
        aliqNominalPct: aliqNominal,
        aliqEfetivaPct: aliqEfetiva,
        pRedBC,
        diferimentoPct,
        cstIcmsSugerido: cstIcms,
        dispensaEstornoEntrada: dispensaEstorno,
        fcpDestinoPct: fcpDestino,
        descricaoRegra,
        normaId,
      },
      difal: difalInfo,
    };
  }, [
    itemAtual.ncm,
    itemAtual.cClassTrib,
    itemAtual.cstIcms,
    ufOrigem,
    ufDestino,
    convenioIcmsSelecionado,
    destinacao,
    regime,
    compCusto.valorProdutoBruto,
    marco,
  ]);

  // ---------------------------------------------------------------------------
  // 3.2 ANÁLISE DO SIMPLES HÍBRIDO E PONTO DE INFLEXÃO (BREAK-EVEN LC 214/25)
  // ---------------------------------------------------------------------------
  const analiseSimplesHibrido = useMemo(() => {
    const faturamentoMensal = Math.max(1, rbt12 / 12);
    const comprasInsumos = faturamentoMensal * (hibridoComprasCreditoPct / 100);
    const aliqDasOriginal = sugestao?.aliquotasAplicadas.dasEfetivoPct ?? 9.5;
    const aliqIbsCbsVenda = 26.5;

    const calc = calcularDetalhamentoSimplesHibrido({
      ano,
      faturamentoMensal,
      aliquotaDasEfetivaPct: aliqDasOriginal,
      comprasInsumosMercadorias: comprasInsumos,
      aliquotaMediaCreditoEntradaPct: 26.5,
      aliquotaIbsCbsVendaPct: aliqIbsCbsVenda,
      marco,
    });

    const creditoB2bTradicionalPct = Math.round(aliqDasOriginal * 0.35 * 100) / 100;
    const creditoB2bHibridoPct = aliqIbsCbsVenda;
    const ganhoCompetitividadeB2bPct = Math.round((creditoB2bHibridoPct - creditoB2bTradicionalPct) * 100) / 100;
    const ganhoCompetitividadeB2bValor = Math.round(faturamentoMensal * (hibridoMixB2bPct / 100) * (ganhoCompetitividadeB2bPct / 100) * 100) / 100;

    return {
      ...calc,
      creditoB2bTradicionalPct,
      creditoB2bHibridoPct,
      ganhoCompetitividadeB2bPct,
      ganhoCompetitividadeB2bValor,
    };
  }, [ano, rbt12, hibridoComprasCreditoPct, hibridoMixB2bPct, sugestao, marco]);

  // ---------------------------------------------------------------------------
  // 3.3 SUB-ETAPA 18.5: SIMULADOR DUAL-STACK 2027, MESA DE COMPRAS & COMBUSTÍVEIS
  // ---------------------------------------------------------------------------
  const simulacaoDualStack = useMemo(() => {
    const pLiq = compCusto.custoUnitarioReal > 0 ? compCusto.custoUnitarioReal : 100;
    const aliqIcms = sugestao?.aliquotasAplicadas.icmsVendaPct ?? (ufDestino === 'PR' ? 19.5 : 12.0);
    return simularPrecificacaoDualStack2027PR({
      precoLiquidoSemTributos: pLiq,
      aliquotaIcmsPrPct: aliqIcms,
      aliquotaFecopPrPct: 0,
      aliquotaCbsPct: 8.8,
      aliquotaIbsPct: 0.1,
      aliquotaIsPct: 0,
      incluirIbsCbsBcIcms,
    });
  }, [compCusto.custoUnitarioReal, sugestao, ufDestino, incluirIbsCbsBcIcms]);

  const resultadoMesaCompras = useMemo(() => {
    return compararFornecedoresCustoAterrissadoPR({
      regimeComprador: regime === 'simples' ? 'SIMPLES_NACIONAL' : (regime === 'real' ? 'LUCRO_REAL' : 'LUCRO_PRESUMIDO'),
      ncm: itemAtual.ncm || '87082999',
      dataFatoGerador: `${ano}-06-15`,
      sujeitoStPr: Boolean(deParaCfop?.temSt || itemAtual.temSt),
      mvaOriginalPct: 40,
      taxaCapitalGiroMensalPct: taxaCapGiroMesa,
      prazoMedioEstoqueDias: prazoEstoqueMesa,
      cotacoes: cotacoesMesa,
    });
  }, [regime, itemAtual.ncm, itemAtual.temSt, ano, deParaCfop, taxaCapGiroMesa, prazoEstoqueMesa, cotacoesMesa]);

  const impactoDiesel2027 = useMemo(() => {
    return simularImpactoCombustivelAdRem2027('DIESEL_BIODIESEL', 10000);
  }, []);

  const atualizarCotacaoMesa = useCallback((id: string, campo: keyof CotacaoFornecedorPR, valor: any) => {
    setCotacoesMesa((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [campo]: valor } : c))
    );
  }, []);

  // Callbacks de manipulação
  const aplicarCampoOverride = useCallback((campo: keyof AliquotasSugeridas, valor: number) => {
    setOverrides((prev) => ({ ...prev, [campo]: valor }));
  }, []);

  const limparOverrides = useCallback(() => {
    setOverrides({});
  }, []);

  // ---------------------------------------------------------------------------
  // 4. EXPORTAÇÃO SEGURA: LAUDO HTML IMPRIMÍVEL (Sanitização via esc())
  // ---------------------------------------------------------------------------
  const exportarLaudoHtml = useCallback((modo: 'resumido' | 'detalhado' = 'detalhado') => {
    if (!resultado || !comparativo) return;

    const cfopVendaDest = resultado.cfopVendaDestinatario || determinarCfopVendaDestinatario(itemAtual, ufDestino);
    const cfopExibicao = `Origem: ${itemAtual.cfop || '5102'} ➔ Entrada: ${deParaCfop?.cfopEntrada || '1102'} ➔ Venda (Dest.): ${cfopVendaDest}`;

    const relMarg = resultado.relatorioMargens;
    const vrl = relMarg?.analiseVrlEArbitramento?.valorRealizavelLiquido ?? 0;
    const reqImpairment = relMarg?.analiseVrlEArbitramento?.requerProvisaoImpairment ?? false;
    const provImpairment = relMarg?.analiseVrlEArbitramento?.valorProvisaoUnitaria ?? 0;
    const custoArbitrado = relMarg?.analiseVrlEArbitramento?.custoArbitradoRir2018 ?? 0;
    const pecVol = relMarg?.pontoEquilibrioContabil?.pecVolume ?? 0;
    const pecVal = relMarg?.pontoEquilibrioContabil?.pecValor ?? 0;
    const mcUnit = relMarg?.margemContribuicaoUnitaria ?? 0;

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Laudo Pericial de Precificação & Custo Real - ${esc(itemAtual.codigo)} (${modo.toUpperCase()})</title>
  <style>
    ${PORTELA_HEADER_CSS}
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; line-height: 1.45; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 12.5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #fff; margin-bottom: 16px; }
    .card-bloco-a { background: #fff5f5; border: 1.5px solid #fecdd3; border-radius: 6px; padding: 14px; margin-bottom: 16px; }
    .card-bloco-a h2 { margin: 0 0 10px; font-size: 14px; color: #991b1b; border-bottom: 1px solid #fecdd3; padding-bottom: 6px; }
    .card-bloco-b { background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 6px; padding: 14px; margin-bottom: 16px; }
    .card-bloco-b h2 { margin: 0 0 10px; font-size: 14px; color: #166534; border-bottom: 1px solid #bbf7d0; padding-bottom: 6px; }
    .card-bloco-c { background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .card-bloco-c h2 { margin: 0 0 12px; font-size: 15px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .quadro-bloco-a-total { background: #fee2e2; border: 2px solid #e11d48; border-radius: 6px; padding: 10px 12px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; color: #9f1239; font-weight: 800; font-size: 13px; }
    .quadro-bloco-a-unit { background: #ffe4e6; border: 2px solid #f43f5e; border-radius: 6px; padding: 10px 12px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; color: #881337; font-weight: 800; font-size: 13px; }
    .quadro-bloco-b-vnf { background: #dcfce7; border: 2px solid #16a34a; border-radius: 6px; padding: 10px 12px; margin: 8px 0; display: flex; justify-content: space-between; align-items: center; color: #14532d; font-weight: 800; font-size: 13.5px; }
    .exec-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 10px; }
    .exec-card-red { background: #fff1f2; border: 2px solid #f43f5e; border-radius: 8px; padding: 14px; text-align: center; }
    .exec-card-green { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 14px; text-align: center; }
    .exec-card-blue { background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 14px; text-align: center; }
    .exec-val { font-size: 24px; font-weight: 900; line-height: 1.2; margin: 4px 0; }
    .exec-lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
    .exec-sub { font-size: 10.5px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    th { text-align: left; background: #f8fafc; color: #475569; font-size: 11px; text-transform: uppercase; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .highlight-green { color: #15803d; font-weight: 700; }
    .highlight-red { color: #b91c1c; font-weight: 600; }
    .total-row { font-weight: 700; background: #f8fafc; border-top: 2px solid #cbd5e1; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .badge-blue { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
    .badge-green { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .badge-amber { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .badge-purple { background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; }
    .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      .card, .card-bloco-a, .card-bloco-b, .card-bloco-c { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: right;">
    <button onclick="window.print()" style="background: #0b3d91; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;">🖨️ Imprimir / Salvar PDF</button>
  </div>

  ${renderHeaderPortela({
    titulo: 'Laudo Pericial de Precificação & Custo de Aquisição Real',
    subtitulo: modo === 'resumido'
      ? 'Resumo Executivo Gerencial · NBC TG 16 / OT CFC 01/2026'
      : 'Auditoria Fiscal & Contábil Detalhada · NBC TG 16 / OT CFC 01/2026',
    documentoRef: `ITEM ${itemAtual.codigo} | CALENDÁRIO FISCAL ${ano}`,
  })}

  <div class="meta-box">
    <strong>Item:</strong> ${esc(itemAtual.codigo)} — ${esc(itemAtual.descricao)} | 
    <strong>NCM:</strong> ${esc(itemAtual.ncm)} | 
    <strong>Rastreabilidade CFOP:</strong> ${esc(cfopExibicao)} | 
    <strong>Destinação:</strong> ${esc(destinacao.toUpperCase())} | 
    <strong>CRT Fornecedor:</strong> ${esc(String(crtEmitente) === 'simples_hibrido' ? 'Simples Híbrido (IBS/CBS Por Fora)' : crtEmitente)} | 
    <strong>Regime Adquirente:</strong> ${esc(regime.toUpperCase())} | 
    <strong>Fluxo:</strong> ${esc(ufOrigem)} ➔ ${esc(ufDestino)}
  </div>

  <div class="grid">
    <!-- BLOCO A: CUSTO DE AQUISIÇÃO REAL -->
    <div class="card-bloco-a">
      <h2>Bloco A — Custo de Aquisição Real (NBC TG 16 / CPC 16)</h2>
      <table>
        <tbody>
          <tr><td>Valor Bruto dos Produtos (vProd)</td><td class="num">R$ ${compCusto.valorProdutoBruto.toFixed(2)}</td></tr>
          <tr><td>(-) Descontos Incondicionais</td><td class="num highlight-green">- R$ ${compCusto.descontosIncondicionais.toFixed(2)}</td></tr>
          <tr><td>(+) Frete, Seguro e Despesas Acessórias</td><td class="num">+ R$ ${compCusto.freteSeguroOutros.toFixed(2)}</td></tr>
          <tr><td>(+) Tributos Não Recuperáveis (IPI, ST, II, IS, trib. não creditados)</td><td class="num highlight-red">+ R$ ${compCusto.tributosNaoRecuperaveis.total.toFixed(2)}</td></tr>
          <tr><td>(-) Impostos a Recuperar (ICMS, PIS/COFINS, CBS, IBS)</td><td class="num highlight-green">- R$ ${compCusto.impostosARecuperar.totalImpostosRecuperaveis.toFixed(2)}</td></tr>
        </tbody>
      </table>

      <!-- QUADROS DE DESTAQUE CONTORNADOS DE PONTA A PONTA -->
      <div class="quadro-bloco-a-total">
        <span>Custo de Aquisição Real Total:</span>
        <span style="font-size: 15px;">R$ ${compCusto.custoAquisicaoReal.toFixed(2)}</span>
      </div>
      <div class="quadro-bloco-a-unit">
        <span>Custo Unitário Efetivo:</span>
        <span style="font-size: 15px;">R$ ${compCusto.custoUnitarioReal.toFixed(2)} / un</span>
      </div>
    </div>

    <!-- BLOCO B: FORMAÇÃO DE PREÇO E DEMONSTRAÇÃO -->
    <div class="card-bloco-b">
      <h2>Bloco B — Formação de Preço e Demonstração de Resultados</h2>
      <table>
        <tbody>
          <tr><td>Preço de Venda Líquido (vProdLiq)</td><td class="num" style="font-weight: 700;">R$ ${resultado.preco.vProdLiq.toFixed(2)}</td></tr>
          <tr><td>(+) Tributos por Dentro (ICMS / DAS)</td><td class="num">+ R$ ${(relMarg?.tributosVendaPorDentro ?? resultado.preco.vICMS).toFixed(2)}</td></tr>
          <tr><td>(+) IVA Dual por Fora (CBS: R$ ${resultado.preco.vCBS.toFixed(2)} + IBS: R$ ${resultado.preco.vIBS.toFixed(2)})</td><td class="num">+ R$ ${(resultado.preco.vCBS + resultado.preco.vIBS).toFixed(2)}</td></tr>
        </tbody>
      </table>

      <!-- QUADRO VERDE CONTORNADO: PREÇO FINAL DA NOTA -->
      <div class="quadro-bloco-b-vnf">
        <span>Preço de Venda Final na Nota (vNF):</span>
        <span style="font-size: 16px;">R$ ${resultado.preco.precoFinal.toFixed(2)}</span>
      </div>

      <table>
        <tbody>
          <tr><td>Split Payment Retido na Liquidação Bancária</td><td class="num highlight-red">R$ ${resultado.apuracaoCaixa.retencaoSplitIva.toFixed(2)}</td></tr>
          <tr><td>Crédito Fiscal Transferido para Cliente B2B</td><td class="num highlight-green">R$ ${(relMarg?.creditoTransferidoClienteB2B ?? 0).toFixed(2)}</td></tr>
          <tr><td>Margem de Contribuição Unitária</td><td class="num">R$ ${mcUnit.toFixed(2)} (${resultado.resultado.indiceMcPct.toFixed(1)}%)</td></tr>
          <tr><td>Provisão de IRPJ e CSLL</td><td class="num highlight-red">R$ ${resultado.resultado.irpjCsll.toFixed(2)}</td></tr>
          <tr style="background: #f0fdf4; font-weight: 700;"><td>Margem Líquida Real Realizada</td><td class="num" style="color: #16a34a;">R$ ${resultado.resultado.lucroLiquido.toFixed(2)} (${resultado.resultado.margemRealizadaPct.toFixed(1)}%)</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- BLOCO C: RESUMO EXECUTIVO (3 CARDS COM FONTE 24PX E PESO 900) -->
  <div class="card-bloco-c">
    <h2>Bloco C — Resumo Executivo Gerencial</h2>
    <div class="exec-grid">
      <div class="exec-card-red">
        <div class="exec-lbl" style="color: #be123c;">Custo Efetivo de Entrada Unitário</div>
        <div class="exec-val" style="color: #9f1239;">R$ ${compCusto.custoUnitarioReal.toFixed(2)}</div>
        <div class="exec-sub" style="color: #e11d48;">Líquido de Impostos (CPC 16)</div>
      </div>
      <div class="exec-card-green">
        <div class="exec-lbl" style="color: #15803d;">Margem Líquida Realizada (%)</div>
        <div class="exec-val" style="color: #14532d;">${resultado.resultado.margemRealizadaPct.toFixed(1)}%</div>
        <div class="exec-sub" style="color: #16a34a;">R$ ${resultado.resultado.lucroLiquido.toFixed(2)} / un</div>
      </div>
      <div class="exec-card-blue">
        <div class="exec-lbl" style="color: #1d4ed8;">Preço de Venda Sugerido (vNF)</div>
        <div class="exec-val" style="color: #1e40af;">R$ ${resultado.preco.precoFinal.toFixed(2)}</div>
        <div class="exec-sub" style="color: #2563eb;">vProd Líquido + Tributos</div>
      </div>
    </div>
  </div>

  <!-- COMPARATIVO DOS 4 REGIMES -->
  <div class="card">
    <h2>Comparativo Estratégico nos 4 Regimes Tributários</h2>
    <table>
      <thead>
        <tr>
          <th>Regime Tributário</th>
          <th class="num">Custo Real</th>
          <th class="num">Preço Final (vNF)</th>
          <th class="num">Crédito B2B</th>
          <th class="num">Custo Efetivo B2B</th>
          <th class="num">Margem Líquida (R$)</th>
          <th class="num">Margem Líquida (%)</th>
        </tr>
      </thead>
      <tbody>
        ${(['simples', 'simples_hibrido', 'presumido', 'real'] as RegimeTributario[])
          .map((reg) => {
            const info = comparativo.regimes[reg];
            const isMaiorMargem = comparativo.melhorMargemLiquida.regime === reg;
            const isMelhorB2B = comparativo.melhorCompetitividadeB2B.regime === reg;
            const nomeRegime =
              reg === 'simples'
                ? 'Simples Nacional'
                : reg === 'simples_hibrido'
                ? 'Simples Híbrido'
                : reg === 'presumido'
                ? 'Lucro Presumido'
                : 'Lucro Real';

            return `<tr>
            <td>
              <strong>${esc(nomeRegime)}</strong>
              ${isMaiorMargem ? '<span class="badge badge-green">🏆 Maior Margem</span>' : ''}
              ${isMelhorB2B ? '<span class="badge badge-blue">💼 Melhor B2B</span>' : ''}
            </td>
            <td class="num">R$ ${info.custoAquisicaoReal.toFixed(2)}</td>
            <td class="num">R$ ${info.precoVendaFinalNota.toFixed(2)}</td>
            <td class="num highlight-green">R$ ${info.creditoTransferidoClienteB2B.toFixed(2)}</td>
            <td class="num" style="font-weight: 600;">R$ ${(info.precoVendaFinalNota - info.creditoTransferidoClienteB2B).toFixed(2)}</td>
            <td class="num">R$ ${info.margemLiquidaValor.toFixed(2)}</td>
            <td class="num highlight-green">${info.margemLiquidaPct.toFixed(1)}%</td>
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>

  ${
    modo === 'detalhado'
      ? `
  <!-- GOVERNANÇA CONTÁBIL (NBC TG 16 / CPC 16 / RIR 2018) -->
  <div class="card">
    <h2>Governança Contábil, Ponto de Equilíbrio & Limites Fiscais (CPC 16 / RIR 2018)</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 12px;">
      <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0;">
        <strong>Teste VRL & Impairment:</strong><br/>
        Custo Real: R$ ${compCusto.custoUnitarioReal.toFixed(2)}/un<br/>
        VRL: R$ ${vrl.toFixed(2)}/un<br/>
        ${
          reqImpairment
            ? `<span style="color: #b91c1c; font-weight: 700;">⚠️ Impairment Exigido: R$ ${provImpairment.toFixed(2)}/un</span>`
            : '<span style="color: #15803d; font-weight: 700;">✅ Em Conformidade (Sem Provisão)</span>'
        }
      </div>
      <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0;">
        <strong>Ponto de Equilíbrio (PEC):</strong><br/>
        Custos Fixos Totais: R$ ${custosFixosTotais.toFixed(2)}<br/>
        PEC em Volume: ${pecVol.toFixed(0)} unidades<br/>
        PEC em Faturamento: R$ ${pecVal.toFixed(2)}
      </div>
      <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0;">
        <strong>Arbitramento Fiscal (RIR/2018):</strong><br/>
        Atividade: ${esc(tipoEstabelecimento.toUpperCase())}<br/>
        Custo Arbitrado: R$ ${custoArbitrado.toFixed(2)} (${tipoEstabelecimento === 'industria' ? '80%' : '70%'} do PV)<br/>
        Base Legal: Art. 309 Decreto 9.580/2018
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Benefícios Fiscais Detectados (Reforma LC 214/25 & RICMS/PR - CONFAZ)</h2>
    <div class="grid">
      <div>
        <strong style="color: #0b3d91;">Reforma Tributária (IBS/CBS):</strong>
        <div style="font-size: 11.5px; margin-top: 4px;">
          <div><strong>cClassTrib:</strong> ${esc(beneficiosFiscais.reforma.cClassTrib)}</div>
          <div><strong>CST IBS/CBS:</strong> CST ${esc(beneficiosFiscais.reforma.cstIbsCbs)}</div>
          <div><strong>Redução de Alíquota:</strong> ${esc(beneficiosFiscais.reforma.reducaoIbsCbsPct)}%</div>
          <div><strong>Enquadramento:</strong> ${esc(beneficiosFiscais.reforma.tema)} (${esc(beneficiosFiscais.reforma.normaId)})</div>
          <div><strong>Grupo NT 2025.002:</strong> ${beneficiosFiscais.reforma.exigeTribRegular ? '<span class="badge badge-green">&lt;gTribRegular&gt; Exigido</span>' : '<span class="badge badge-blue">Tributação Normal</span>'}</div>
        </div>
      </div>
      <div>
        <strong style="color: #1d4ed8;">ICMS Paraná & Convênios CONFAZ:</strong>
        <div style="font-size: 11.5px; margin-top: 4px;">
          <div><strong>Regime / Convênio:</strong> ${esc(beneficiosFiscais.icms.convenioSelecionado)} (${esc(beneficiosFiscais.icms.normaId)})</div>
          <div><strong>Alíquota Nominal ➔ Efetiva:</strong> ${esc(beneficiosFiscais.icms.aliqNominalPct)}% ➔ <strong class="highlight-green">${esc(beneficiosFiscais.icms.aliqEfetivaPct)}%</strong></div>
          ${beneficiosFiscais.icms.pRedBC > 0 ? `<div><strong>Redução de Base (pRedBC):</strong> ${esc(beneficiosFiscais.icms.pRedBC)}%</div>` : ''}
          ${beneficiosFiscais.icms.diferimentoPct > 0 ? `<div><strong>Diferimento:</strong> ${esc(beneficiosFiscais.icms.diferimentoPct)}%</div>` : ''}
          <div><strong>CST ICMS Sugerido:</strong> CST ${esc(beneficiosFiscais.icms.cstIcmsSugerido)} | FCP Destino: +${esc(beneficiosFiscais.icms.fcpDestinoPct)}%</div>
          <div style="margin-top: 4px;">
            ${beneficiosFiscais.icms.dispensaEstornoEntrada
              ? '<span class="badge badge-green">✅ Dispensa Legal de Estorno na Entrada</span>'
              : '<span class="badge badge-amber">⚠️ Exige Estorno Proporcional (Anexo II)</span>'}
          </div>
        </div>
      </div>
    </div>
    ${beneficiosFiscais.difal ? `
      <div style="margin-top: 10px; padding: 8px 12px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 4px; font-size: 11.5px;">
        <strong>Apuração do DIFAL (EC 87/2015 & LC 190/2022):</strong>
        Metodologia: <strong>${esc(beneficiosFiscais.difal.metodologia === 'base_dupla' ? 'Base Dupla (R$ ' + beneficiosFiscais.difal.baseCalculo.toFixed(2) + ')' : 'Base Única')}</strong> |
        DIFAL Líquido: <strong>R$ ${esc(beneficiosFiscais.difal.valorDifalLiquido.toFixed(2))}</strong> |
        FCP Destino: <strong>R$ ${esc(beneficiosFiscais.difal.valorFcpDestino.toFixed(2))}</strong> |
        Total Devido: <strong class="highlight-red">R$ ${esc(beneficiosFiscais.difal.valorTotalDevidoDestino.toFixed(2))}</strong>
      </div>
    ` : ''}
  </div>

  <div class="card">
    <h2>Diagnóstico Estratégico do Simples Híbrido (Ponto de Inflexão & Break-Even)</h2>
    <div class="grid">
      <div>
        <div style="font-size: 11.5px;">
          <div><strong>DAS Tradicional (Sem Expurgo):</strong> R$ ${esc(analiseSimplesHibrido.valorDasSemExpurgo.toFixed(2))} (${esc(analiseSimplesHibrido.aliquotaDasOriginalPct.toFixed(2))}%)</div>
          <div><strong>Fator de Expurgo PIS/COFINS/ICMS:</strong> -${esc(analiseSimplesHibrido.fatorExpurgoDasPct)}%</div>
          <div><strong>DAS Híbrido Reduzido:</strong> R$ ${esc(analiseSimplesHibrido.valorDasComExpurgo.toFixed(2))} (${esc(analiseSimplesHibrido.aliquotaDasAjustadaPct.toFixed(2))}%)</div>
          <div><strong>Economia Bruta no DAS:</strong> <strong class="highlight-green">R$ ${esc(analiseSimplesHibrido.economiaDas.toFixed(2))}</strong></div>
          <div><strong>Débito IBS/CBS Venda:</strong> R$ ${esc(analiseSimplesHibrido.debitoIbsCbsVenda.toFixed(2))}</div>
          <div><strong>Crédito IBS/CBS Compras:</strong> -R$ ${esc(analiseSimplesHibrido.creditoEntradaAproveitado.toFixed(2))}</div>
          <div><strong>Saldo IBS/CBS a Pagar:</strong> R$ ${esc(analiseSimplesHibrido.saldoIbsCbsAPagar.toFixed(2))}</div>
          <div><strong>Carga Tributária Total Híbrido:</strong> <strong>R$ ${esc(analiseSimplesHibrido.cargaTributariaTotal.toFixed(2))}</strong></div>
        </div>
      </div>
      <div>
        <div style="font-size: 11.5px;">
          <div><strong>Crédito B2B Transferido (Tradicional):</strong> ${esc(analiseSimplesHibrido.creditoB2bTradicionalPct)}% (Restrito)</div>
          <div><strong>Crédito B2B Transferido (Híbrido):</strong> <strong class="highlight-green">${esc(analiseSimplesHibrido.creditoB2bHibridoPct)}% (Integral 26,5%)</strong></div>
          <div><strong>Ganho de Competitividade PJ:</strong> +${esc(analiseSimplesHibrido.ganhoCompetitividadeB2bPct)}% (R$ ${esc(analiseSimplesHibrido.ganhoCompetitividadeB2bValor.toFixed(2))}/mês)</div>
          <div style="margin-top: 8px;">
            <strong>Ponto de Inflexão (Compras com Crédito p/ Empate):</strong>
            <span class="badge badge-purple" style="font-size: 11px;">${esc(analiseSimplesHibrido.pontoInflexao.creditoMinimoEntradaParaEmpatePct)}% da Receita</span>
          </div>
          <div style="margin-top: 8px;">
            ${analiseSimplesHibrido.pontoInflexao.regimeVencedor === 'simples_hibrido'
              ? '<span class="badge badge-green" style="font-size: 11.5px;">🏆 RECOMENDADO: SIMPLES HÍBRIDO</span>'
              : '<span class="badge badge-blue" style="font-size: 11.5px;">🛡️ RECOMENDADO: SIMPLES TRADICIONAL</span>'}
          </div>
          <div style="margin-top: 6px; font-style: italic; color: #475569;">
            ${esc(analiseSimplesHibrido.pontoInflexao.justificativa)}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Fundamentação Legal & Alertas Periciais</h2>
    <div style="font-size: 11px; color: #475569;">
      ${resultado.baseLegal.map((b) => `<div><strong>${esc(b.norma)}</strong> (${esc(b.dispositivo)}): ${esc(b.tema)} — <em>Status: ${esc(b.status)}</em></div>`).join('')}
      ${resultado.alertas.map((a) => `<div style="margin-top: 4px; color: #b45309;">⚠️ ${esc(a)}</div>`).join('')}
    </div>
  </div>
  `
      : ''
  }

  <div class="footer">
    <div>Contabilidade Portela · Laudo Pericial de Precificação v2.0</div>
    <div>Soberania de Dados Local-First · Documento Válido para Instrução Fiscal e Gerencial</div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `laudo_precificacao_${itemAtual.codigo || 'item'}_${modo}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }, [
    resultado,
    comparativo,
    deParaCfop,
    itemAtual,
    destinacao,
    crtEmitente,
    regime,
    ufOrigem,
    ufDestino,
    compCusto,
    ano,
    custosFixosTotais,
    tipoEstabelecimento,
    beneficiosFiscais,
    analiseSimplesHibrido,
  ]);

  // ---------------------------------------------------------------------------
  // 5. EXPORTAÇÃO SEGURA: CSV / PLANILHA EXCEL
  // ---------------------------------------------------------------------------
  const exportarCsv = useCallback(() => {
    if (!reforma || !marco) return;

    const itensParaExportar = itensRateados.length > 0 ? itensRateados : [itemAtual];
    const linhas: string[] = [];

    linhas.push([
      'Item',
      'Código',
      'Descrição',
      'NCM',
      'CFOP Saída',
      'CFOP Entrada Mapeado',
      'Destinação',
      'Regime Adquirente',
      'Ano',
      'Quantidade',
      'Valor Produtos (R$)',
      'Frete/Seguro/Outros (R$)',
      'Descontos (R$)',
      'Tributos Não Recuperáveis (R$)',
      'Impostos a Recuperar (R$)',
      'Custo Aquisição Real (R$)',
      'Custo Unitário (R$)',
      'Preço Venda Líquido (R$)',
      'Tributos Saída ICMS/DAS (R$)',
      'CBS Saída (R$)',
      'IBS Saída (R$)',
      'Preço Final Venda vNF (R$)',
      'Split Payment Retido (R$)',
      'Crédito B2B Transferido (R$)',
      'Custo Efetivo Cliente B2B (R$)',
      'Margem Contribuição Unitária (R$)',
      'PEC Volume (un)',
      'PEC Valor (R$)',
      'VRL Unitário (R$)',
      'Impairment Exigido',
      'Custo Arbitrado RIR/2018 (R$)',
      'Margem Líquida (R$)',
      'Margem Líquida (%)',
      'cClassTrib Sugerido',
      'Redução IBS/CBS (%)',
      'Regime/Convênio ICMS',
      'Alíquota ICMS Efetiva (%)',
      'Dispensa Estorno Entrada',
      'DIFAL Total Devido (R$)',
      'Simples Híbrido Vencedor',
      'Ponto Inflexão Compras (%)',
    ].join(';'));

    for (let i = 0; i < itensParaExportar.length; i++) {
      const it = itensParaExportar[i];
      const dePara = mapearCfopEntrada(it.cfop || '5102', destinacao, ufOrigem, ufDestino, marco);

      const itPreco: ItemPreco = {
        codigo: it.codigo,
        descricao: it.descricao,
        ncm: it.ncm,
        cClassTrib: it.cClassTrib,
        cstIcms: it.cstIcms,
        csosn: it.csosn,
        origemMercadoria,
        crtEmitente,
        modFrete,
        pesoBruto: it.pesoBruto,
        cfopEntradaMapeado: dePara.cfopEntrada,
        pRedBC: it.pRedBC,
        pRedBCST: it.pRedBCST,
        vICMSDeson: it.vICMSDeson,
        motDesICMS: it.motDesICMS,
        pMVAST: it.pMVAST,
        pisCofinsMonofasico,
        temSt: Boolean(dePara.temSt || it.temSt),
        baseReduzidaSaidaPct,
        tipoEstabelecimento,
        destinacao,
        ufOrigem,
        ufDestino,
        quantidade: it.quantidade,
        valorBrutoEntrada: it.valorBrutoEntrada,
        freteSeguroOutrasEntrada: it.freteSeguroOutrasEntrada,
        descontoIncondicionalEntrada: it.descontoIncondicionalEntrada,
        ipiEntrada: it.ipiEntrada,
        icmsStEntrada: it.icmsStEntrada,
        iiEntrada: it.iiEntrada,
        isEntrada: it.isEntrada,
        credIcmsEntrada: it.credIcmsEntrada,
        credPisCofinsEntrada: it.credPisCofinsEntrada,
        credCbsEntrada: it.credCbsEntrada,
        credIbsEntrada: it.credIbsEntrada,
      };

      try {
        const c = calcularCustoAquisicaoReal(itPreco, regime, {
          documentoInidoneo,
          destinoItem: destinacao,
          tipoEstabelecimento,
          ufOrigem,
          ufDestino,
          baseReduzidaSaidaPct,
          marco,
        });
        const r = simular(
          itPreco,
          {
            ...paramsPreco,
            custosFixosTotaisPeriodo: custosFixosTotais,
            overrides: undefined,
          },
          { reforma, marco }
        );

        const rel = r.relatorioMargens;
        const b2bCred = rel?.creditoTransferidoClienteB2B ?? 0;
        const custoEfetivoB2B = r.preco.precoFinal - b2bCred;

        linhas.push([
          `"${i + 1}"`,
          `"${(it.codigo || '').replace(/"/g, '""')}"`,
          `"${(it.descricao || '').replace(/"/g, '""')}"`,
          `"${(it.ncm || '').replace(/"/g, '""')}"`,
          `"${(it.cfop || '').replace(/"/g, '""')}"`,
          `"${dePara.cfopEntrada}"`,
          `"${destinacao}"`,
          `"${regime}"`,
          `"${ano}"`,
          it.quantidade.toString().replace('.', ','),
          c.valorProdutoBruto.toFixed(2).replace('.', ','),
          c.freteSeguroOutros.toFixed(2).replace('.', ','),
          c.descontosIncondicionais.toFixed(2).replace('.', ','),
          c.tributosNaoRecuperaveis.total.toFixed(2).replace('.', ','),
          c.impostosARecuperar.totalImpostosRecuperaveis.toFixed(2).replace('.', ','),
          c.custoAquisicaoReal.toFixed(2).replace('.', ','),
          c.custoUnitarioReal.toFixed(2).replace('.', ','),
          r.preco.vProdLiq.toFixed(2).replace('.', ','),
          (rel?.tributosVendaPorDentro ?? r.preco.vICMS).toFixed(2).replace('.', ','),
          r.preco.vCBS.toFixed(2).replace('.', ','),
          r.preco.vIBS.toFixed(2).replace('.', ','),
          r.preco.precoFinal.toFixed(2).replace('.', ','),
          r.apuracaoCaixa.retencaoSplitIva.toFixed(2).replace('.', ','),
          b2bCred.toFixed(2).replace('.', ','),
          custoEfetivoB2B.toFixed(2).replace('.', ','),
          (rel?.margemContribuicaoUnitaria ?? 0).toFixed(2).replace('.', ','),
          (rel?.pontoEquilibrioContabil?.pecVolume ?? 0).toFixed(0),
          (rel?.pontoEquilibrioContabil?.pecValor ?? 0).toFixed(2).replace('.', ','),
          (rel?.analiseVrlEArbitramento?.valorRealizavelLiquido ?? 0).toFixed(2).replace('.', ','),
          rel?.analiseVrlEArbitramento?.requerProvisaoImpairment ? 'SIM' : 'NAO',
          (rel?.analiseVrlEArbitramento?.custoArbitradoRir2018 ?? 0).toFixed(2).replace('.', ','),
          r.resultado.lucroLiquido.toFixed(2).replace('.', ','),
          r.resultado.margemRealizadaPct.toFixed(2).replace('.', ','),
          `"${beneficiosFiscais.reforma.cClassTrib}"`,
          beneficiosFiscais.reforma.reducaoIbsCbsPct.toFixed(1).replace('.', ','),
          `"${beneficiosFiscais.icms.convenioSelecionado}"`,
          beneficiosFiscais.icms.aliqEfetivaPct.toFixed(2).replace('.', ','),
          beneficiosFiscais.icms.dispensaEstornoEntrada ? 'SIM' : 'NAO',
          (beneficiosFiscais.difal?.valorTotalDevidoDestino ?? 0).toFixed(2).replace('.', ','),
          `"${analiseSimplesHibrido.pontoInflexao.regimeVencedor}"`,
          analiseSimplesHibrido.pontoInflexao.creditoMinimoEntradaParaEmpatePct.toFixed(2).replace('.', ','),
        ].join(';'));
      } catch {
        /* continua para o próximo item se houver falha de simulação */
      }
    }

    const csvContent = '\uFEFF' + linhas.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planilha_precificacao_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [
    itensRateados,
    itemAtual,
    destinacao,
    ufOrigem,
    ufDestino,
    origemMercadoria,
    crtEmitente,
    modFrete,
    pisCofinsMonofasico,
    baseReduzidaSaidaPct,
    tipoEstabelecimento,
    regime,
    documentoInidoneo,
    paramsPreco,
    custosFixosTotais,
    ano,
    reforma,
    marco,
    beneficiosFiscais,
    analiseSimplesHibrido,
  ]);

  // ---------------------------------------------------------------------------
  // 6. RENDERIZAÇÃO PRINCIPAL DO COMPONENTE
  // ---------------------------------------------------------------------------
  return (
    <section className="painel-precificacao" aria-label="Painel de Precificação e Margens">
      {/* CABEÇALHO EXECUTIVO */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>💰 Motor de Precificação & Composição de Custo Real</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              NBC TG 16 / OT CFC 01/2026 · Formação de preço nos 4 regimes com apuração de IBS/CBS e créditos B2B
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secundario"
              style={{ fontSize: '13px', padding: '6px 12px' }}
              onClick={() => exportarLaudoHtml('resumido')}
              disabled={!resultado}
              title="Gerar laudo executivo resumido de alta legibilidade para diretoria"
            >
              📄 Exportar Resumido
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ background: '#0b3d91', borderColor: '#0b3d91', fontSize: '13px', padding: '6px 14px' }}
              onClick={() => exportarLaudoHtml('detalhado')}
              disabled={!resultado}
              title="Gerar laudo pericial fiscal completo com todas as seções e fundamentações"
            >
              📑 Exportar Detalhado
            </button>
            <button
              type="button"
              className="btn-secundario"
              style={{ fontSize: '13px', padding: '6px 14px' }}
              onClick={exportarCsv}
              disabled={carregando}
              title="Exportar planilha formatada em CSV para análise em Excel"
            >
              📊 Exportar CSV
            </button>
            {itens.length > 0 && (
              <span className="badge green" style={{ fontSize: '12px', padding: '4px 8px' }}>
                📦 {itens.length} {itens.length === 1 ? 'item da NF-e' : 'itens da NF-e'}
              </span>
            )}
          </div>
        </div>

        {/* Seletor de itens quando há múltiplos produtos */}
        {itens.length > 1 && (
          <div style={{ marginTop: 14, padding: 10, background: 'var(--bg-subtle)', borderRadius: 6 }}>
            <label htmlFor="select-item-nfe" style={{ fontWeight: 600, marginRight: 10 }}>
              Selecione o produto da nota para precificar:
            </label>
            <select
              id="select-item-nfe"
              value={itemIndex}
              onChange={(e) => {
                setItemIndex(Number(e.target.value));
                setOverrides({});
              }}
              style={{ maxWidth: 480 }}
            >
              {itens.map((it, idx) => (
                <option key={idx} value={idx}>
                  #{it.index || idx + 1} - {it.codigo} | {it.descricao.slice(0, 45)}... (NCM: {it.ncm})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {carregando ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Carregando tabelas oficiais da Reforma Tributária e Marco Legal...</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* =============================================================== */}
            {/* COLUNA ESQUERDA: PARÂMETROS, RASTREABILIDADE FISCAL E CUSTO REAL */}
            {/* =============================================================== */}
            <div>
              {/* CARD 1: CENÁRIO DA EMPRESA */}
              <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 12px' }}>1. Cenário Fiscal da Empresa</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Regime Tributário Adquirente:
                    </label>
                    <select value={regime} onChange={(e) => setRegime(e.target.value as RegimeTributario)}>
                      <option value="simples">Simples Nacional (Tradicional)</option>
                      <option value="simples_hibrido">Simples Híbrido (IBS/CBS por fora)</option>
                      <option value="presumido">Lucro Presumido</option>
                      <option value="real">Lucro Real</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Ano de Vigência / Calendário:
                    </label>
                    <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                      <option value={2026}>2026 (CBS 0,9% / IBS 0,1% Teste)</option>
                      <option value={2027}>2027 (CBS 8,8% / IBS 0,1% Transição)</option>
                      <option value={2028}>2028 (CBS 8,8% / IBS 0,1%)</option>
                      <option value={2029}>2029 (IBS 10% / ICMS 90%)</option>
                      <option value={2031}>2031 (IBS 30% / ICMS 70%)</option>
                      <option value={2033}>2033 (Vigência Plena 26,5%)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      UF Origem (Compra):
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={ufOrigem}
                      onChange={(e) => setUfOrigem(e.target.value.toUpperCase())}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      UF Destino (Venda):
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={ufDestino}
                      onChange={(e) => setUfDestino(e.target.value.toUpperCase())}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Margem Líquida Pretendida (%):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={margemAlvo}
                      onChange={(e) => setMargemAlvo(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Despesas Comerciais / Variáveis (%):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={despesasVar}
                      onChange={(e) => setDespesasVar(Number(e.target.value))}
                    />
                  </div>
                </div>

                {regime === 'simples' || regime === 'simples_hibrido' ? (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Receita Bruta Acumulada 12 Meses (RBT12 Simples Nacional - R$):
                    </label>
                    <input
                      type="number"
                      step="10000"
                      value={rbt12}
                      onChange={(e) => setRbt12(Number(e.target.value))}
                    />
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={documentoInidoneo}
                      onChange={(e) => setDocumentoInidoneo(e.target.checked)}
                    />
                    <span style={{ color: documentoInidoneo ? 'var(--bad)' : 'inherit', fontWeight: 600, fontSize: '12.5px' }}>
                      ⚠️ Simular documento fiscal inidôneo (glosar 100% dos créditos fiscais - art. 41 LC 214)
                    </span>
                  </label>
                </div>
              </div>

              {/* CARD 2: RASTREABILIDADE FISCAL, DE-PARA DE CFOP E FRETE */}
              <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 10px' }}>2. Rastreabilidade de Entrada, De-Para CFOP e Frete</h3>

                {/* PAINEL DE-PARA DE CFOP */}
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                        Rastreabilidade e Mapeamento de CFOP (Origem ➔ Entrada ➔ Venda)
                      </span>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0b3d91', marginTop: 2 }}>
                        CFOP Origem: {itemAtual.cfop || '5102'} ➔ Entrada: {deParaCfop?.cfopEntrada || '1102'} ➔ Venda (Destinatário): {resultado?.cfopVendaDestinatario || determinarCfopVendaDestinatario(itemAtual, ufDestino)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {deParaCfop?.geraCreditoIcms ? (
                        <span className="badge green" title="Crédito regular de ICMS na entrada">
                          ✅ Crédito ICMS Permitido
                        </span>
                      ) : (
                        <span className="badge red" title="Vedação legal de crédito de ICMS na entrada">
                          ⛔ Crédito ICMS Vedado
                        </span>
                      )}
                      {deParaCfop?.temSt ? (
                        <span className="badge yellow" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }} title="Operação com ICMS Substituição Tributária">
                          🛡️ Sujeito a ST (Retido)
                        </span>
                      ) : (
                        <span className="badge grey">Sem ST</span>
                      )}
                      {deParaCfop?.exigeDifal ? (
                        <span className="badge blue" style={{ background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff' }} title="Exigência de Diferencial de Alíquotas">
                          📦 DIFAL Exigido (EC 87/15)
                        </span>
                      ) : (
                        <span className="badge grey">DIFAL Disp.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* CONTROLES FISCAIS DO PRODUTO E FORNECEDOR */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Destinação da Mercadoria:
                    </label>
                    <select value={destinacao} onChange={(e) => setDestinacao(e.target.value as DestinacaoMercadoria)}>
                      <option value="comercializacao">Revenda (Comercialização)</option>
                      <option value="industrializacao">Matéria-Prima (Industrialização)</option>
                      <option value="uso_consumo">Uso e Consumo</option>
                      <option value="ativo_imobilizado">Ativo Imobilizado</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      CRT do Fornecedor / Emitente:
                    </label>
                    <select value={String(crtEmitente)} onChange={(e) => setCrtEmitente(e.target.value as CrtEmitente)}>
                      <option value="3">3 - Regime Normal (Lucro Real / Presumido)</option>
                      <option value="simples_hibrido">Simples Híbrido (IBS/CBS Regular por Fora)</option>
                      <option value="1">1 - Simples Nacional (Microempresa / EPP)</option>
                      <option value="2">2 - Simples Nacional (Sublimite Excedido)</option>
                      <option value="4">4 - MEI (Microempreendedor Individual)</option>
                    </select>
                    {String(crtEmitente) === 'simples_hibrido' && (
                      <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                        🏢 <b>Simples Híbrido:</b> Gera 100% dos créditos de IBS e CBS destacados ao adquirente.
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Origem da Mercadoria:
                    </label>
                    <select value={origemMercadoria} onChange={(e) => setOrigemMercadoria(e.target.value)}>
                      <option value="0">0 - Nacional</option>
                      <option value="1">1 - Estrangeira (Importação Direta 4%)</option>
                      <option value="2">2 - Estrangeira (Adquirida Mercado Interno 4%)</option>
                      <option value="3">3 - Nacional c/ Conteúdo Importação &gt; 40%</option>
                      <option value="8">8 - Nacional c/ Conteúdo Importação &gt; 70%</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Tipo de Estabelecimento:
                    </label>
                    <select value={tipoEstabelecimento} onChange={(e) => setTipoEstabelecimento(e.target.value as any)}>
                      <option value="comercio">Comércio (Arbitramento 70%)</option>
                      <option value="industria">Indústria (Arbitramento 80%)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Base de Cálculo Reduzida Saída (%):
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="100"
                      value={baseReduzidaSaidaPct}
                      onChange={(e) => setBaseReduzidaSaidaPct(Number(e.target.value))}
                      title="100% = Sem redução; se menor que 100%, estorna crédito proporcionalmente conforme Anexo II RICMS/PR"
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={pisCofinsMonofasico}
                        onChange={(e) => setPisCofinsMonofasico(e.target.checked)}
                      />
                      <span>PIS/COFINS Monofásico (Segrega DAS)</span>
                    </label>
                  </div>
                </div>

                {/* MÓDULO DE FRETE CIF VS FOB (CT-e) */}
                <div style={{ background: '#fdfcfe', padding: 12, borderRadius: 6, border: '1px solid #dfe5f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      🚚 Modalidade de Frete e Despesas de Transporte:
                    </label>
                    <select
                      value={modFrete}
                      onChange={(e) => setModFrete(e.target.value as '0' | '1')}
                      style={{ fontSize: '12px', padding: '3px 8px' }}
                    >
                      <option value="0">0 - Frete CIF (Por conta do Remetente / Embutido)</option>
                      <option value="1">1 - Frete FOB (Por conta do Destinatário / CT-e Externo)</option>
                    </select>
                  </div>

                  {modFrete === '1' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10, background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                          Frete CT-e Total (R$):
                        </label>
                        <input
                          type="number"
                          step="10"
                          value={freteCteTotal}
                          onChange={(e) => setFreteCteTotal(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                          ICMS no CT-e (R$):
                        </label>
                        <input
                          type="number"
                          step="5"
                          value={icmsFreteCteTotal}
                          onChange={(e) => setIcmsFreteCteTotal(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                          Critério de Rateio:
                        </label>
                        <select
                          value={criterioRateio}
                          onChange={(e) => setCriterioRateio(e.target.value as any)}
                        >
                          <option value="valor">Por Valor (vProd)</option>
                          <option value="peso">Por Peso Bruto (kg)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* BANNERS DE ALERTA NORMATIVO AUTOMÁTICO */}
                <div style={{ marginTop: 14 }}>
                  {(crtEmitente === '1' || crtEmitente === '2') && (
                    <div className="note atencao" style={{ marginBottom: 8, fontSize: '12px' }}>
                      <b>⚠️ Bloqueio Legal de PIS/COFINS (Leis 10.637/02 e 10.833/03 Art. 3º §2º II):</b> Aquisição de fornecedor do Simples Nacional não gera créditos de PIS/COFINS ao adquirente, mesmo sob o Lucro Real. Crédito de ICMS permitido exclusivamente se destacado no documento fiscal (Art. 23 LC 123/06).
                    </div>
                  )}

                  {(deParaCfop?.temSt || itemAtual.cstIcms === '60' || itemAtual.csosn === '500' || (itemAtual.icmsStEntrada ?? 0) > 0) && (
                    <div className="note info" style={{ marginBottom: 8, fontSize: '12px' }}>
                      <b>🛡️ Substituição Tributária / Retenção Anterior (CST 60 / CSOSN 500 / Anexo IX RICMS/PR):</b> ICMS-ST integra o custo de estoque não recuperável. Na revenda interna subsequente, o ICMS de saída é automaticamente zerado (0%) e, no Simples Nacional, a parcela de ICMS é segregada do DAS.
                    </div>
                  )}

                  {deParaCfop?.exigeDifal && (
                    <div className="note atencao" style={{ marginBottom: 8, fontSize: '12px' }}>
                      <b>📦 DIFAL Interestadual Exigido (EC 87/2015 e LC 190/2021):</b> Mercadoria interestadual destinada a consumo final ou ativo imobilizado exige o recolhimento do diferencial de alíquotas pelo adquirente.
                    </div>
                  )}

                  {baseReduzidaSaidaPct < 100 && (
                    <div className="note atencao" style={{ marginBottom: 8, fontSize: '12px' }}>
                      <b>📉 Estorno Proporcional de ICMS (RICMS/PR Anexo II):</b> Saída beneficiada com redução de base de cálculo em {100 - baseReduzidaSaidaPct}% exige o estorno proporcional do crédito de ICMS apropriado na entrada, transferindo-o para o custo contábil.
                    </div>
                  )}
                </div>
              </div>

              {/* CARD NOVO: DETECÇÃO AUTOMÁTICA DE BENEFÍCIOS FISCAIS (REFORMA + ICMS-PR/CONFAZ) */}
              <div className="card" style={{ marginBottom: 20, background: '#fcfdfe', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14.5px', color: '#0b3d91' }}>
                      🔍 Detecção Automática de Benefícios Fiscais (Reforma Tributária & RICMS/PR - CONFAZ)
                    </h3>
                    <p className="hint" style={{ margin: '3px 0 0', fontSize: '12px' }}>
                      Enquadramento em O(1) de alíquotas reduzidas, diferimentos estaduais, FCP e apuração de DIFAL.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {/* COLUNA 1: REFORMA TRIBUTÁRIA (IBS/CBS) */}
                  <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: '13px', color: '#0b3d91' }}>Reforma Tributária (IBS/CBS)</strong>
                      <span className="badge blue" style={{ fontSize: '10.5px' }}>LC 214/2025</span>
                    </div>

                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>cClassTrib Sugerido:</span>{' '}
                        <strong className="mono" style={{ color: '#0f172a' }}>{beneficiosFiscais.reforma.cClassTrib}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>CST IBS/CBS:</span>{' '}
                        <span className="badge grey" style={{ fontSize: '11px' }}>CST {beneficiosFiscais.reforma.cstIbsCbs}</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Redução de Alíquota (IBS/CBS):</span>{' '}
                        <strong style={{ color: beneficiosFiscais.reforma.reducaoIbsCbsPct > 0 ? '#15803d' : '#475569' }}>
                          {beneficiosFiscais.reforma.reducaoIbsCbsPct}%
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Tema / Fundamentação:</span>{' '}
                        <span style={{ fontWeight: 600 }}>{beneficiosFiscais.reforma.tema}</span>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {beneficiosFiscais.reforma.exigeTribRegular ? (
                          <span
                            className="badge green"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            title="Nota Técnica 2025.002: Exige preenchimento do grupo de tributação regular para validação do benefício fiscal na SEFAZ"
                          >
                            🏷️ Exige &lt;gTribRegular&gt; (NT 2025.002)
                          </span>
                        ) : (
                          <span className="badge grey" style={{ fontSize: '11px', padding: '3px 8px' }}>
                            🏷️ Tributação Normal (Sem &lt;gTribRegular&gt;)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* COLUNA 2: MOTOR ICMS PARANÁ & CONVÊNIOS CONFAZ */}
                  <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: '13px', color: '#1d4ed8' }}>ICMS Paraná & Convênios CONFAZ</strong>
                      <span className="badge" style={{ background: '#eff6ff', color: '#1e40af', fontSize: '10.5px' }}>RICMS/PR</span>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <label htmlFor="select-convenio-icms" style={{ fontSize: '11.5px', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                        Regime / Convênio de ICMS:
                      </label>
                      <select
                        id="select-convenio-icms"
                        value={convenioIcmsSelecionado}
                        onChange={(e) => setConvenioIcmsSelecionado(e.target.value)}
                        style={{ width: '100%', fontSize: '12px', padding: '4px 6px' }}
                      >
                        <option value="auto">⚡ Automático pelo NCM</option>
                        <option value="nenhum">Nenhum / Tributação Integral</option>
                        <option value="diferimento_parcial_pr_12">Diferimento Parcial B2B 12% (Art. 28 Anexo VIII)</option>
                        <option value="conv_52_91_agricola">Convênio ICMS 52/1991 - Máq. Agrícolas (5,6% PR)</option>
                        <option value="conv_52_91_industrial">Convênio ICMS 52/1991 - Máq. Industriais (8,8% PR)</option>
                        <option value="conv_100_97_60">Convênio ICMS 100/1997 - Insumos Agro (Red. 60%)</option>
                        <option value="conv_100_97_30">Convênio ICMS 100/1997 - Insumos Agro (Red. 30%)</option>
                        <option value="cesta_basica_pr">Cesta Básica PR - Carga 7% (Anexo II)</option>
                        <option value="diferimento_total_pr">Diferimento Total 100% CST 51 (Art. 31 Anexo VIII)</option>
                      </select>
                    </div>

                    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Alíq. Nominal vs Efetiva:</span>{' '}
                        <span>{beneficiosFiscais.icms.aliqNominalPct}%</span> ➔{' '}
                        <strong style={{ color: '#15803d' }}>{beneficiosFiscais.icms.aliqEfetivaPct}%</strong>
                        {beneficiosFiscais.icms.diferimentoPct > 0 && (
                          <span className="badge blue" style={{ marginLeft: 6, fontSize: '10px' }}>
                            Dif: {beneficiosFiscais.icms.diferimentoPct.toFixed(1)}%
                          </span>
                        )}
                        {beneficiosFiscais.icms.pRedBC > 0 && (
                          <span className="badge yellow" style={{ marginLeft: 6, fontSize: '10px' }}>
                            Red BC: {beneficiosFiscais.icms.pRedBC.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>CST ICMS Sugerido:</span>{' '}
                        <strong className="mono">CST {beneficiosFiscais.icms.cstIcmsSugerido}</strong>{' '}
                        | FCP Destino: <strong>+{beneficiosFiscais.icms.fcpDestinoPct}%</strong>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {beneficiosFiscais.icms.dispensaEstornoEntrada ? (
                          <span
                            className="badge green"
                            style={{ fontSize: '10.5px', padding: '2px 6px' }}
                            title="Cláusula Quarta Convênio ICMS 52/1991: Não se exigirá a anulação do crédito relativo às entradas."
                          >
                            ✅ Dispensa Legal de Estorno (Crédito Integral Mantido)
                          </span>
                        ) : (
                          <span
                            className="badge yellow"
                            style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontSize: '10.5px', padding: '2px 6px' }}
                            title="Item 6 Anexo II RICMS/PR: Redução com exigência de estorno proporcional de créditos."
                          >
                            ⚠️ Exige Estorno Proporcional (Anexo II RICMS/PR)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* PAINEL DIFAL QUANDO APLICÁVEL */}
                {beneficiosFiscais.difal && (
                  <div style={{ marginTop: 12, padding: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6, fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ color: '#7e22ce' }}>
                        📦 Apuração do DIFAL Interestadual ({beneficiosFiscais.difal.metodologia === 'base_dupla' ? 'Base Dupla - Lucro Real/Presumido' : 'Base Única - Simples Nacional'})
                      </strong>
                      <span className="badge" style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: '10.5px' }}>
                        EC 87/2015 & LC 190/2022
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 6 }}>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Base de Cálculo:</span>
                        <strong>R$ {beneficiosFiscais.difal.baseCalculo.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>DIFAL Líquido:</span>
                        <strong>R$ {beneficiosFiscais.difal.valorDifalLiquido.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Parcela FCP Destino:</span>
                        <strong>R$ {beneficiosFiscais.difal.valorFcpDestino.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Total Devido Destino:</span>
                        <strong style={{ color: '#b91c1c' }}>R$ {beneficiosFiscais.difal.valorTotalDevidoDestino.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 3: DEMONSTRAÇÃO DO CUSTO DE AQUISIÇÃO REAL */}
              <div className="card" style={{ background: '#fff5f5', border: '1.5px solid #fecdd3', marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 4px', color: '#991b1b' }}>Bloco A — Custo de Aquisição Real (NBC TG 16 / CPC 16)</h3>
                <p className="hint" style={{ margin: '0 0 10px', color: '#7f1d1d' }}>
                  Critério contábil estrito: impostos recuperáveis são deduzidos e tributos sem crédito integram o custo.
                </p>

                <table className="tabela-custo" style={{ width: '100%', fontSize: '0.9rem' }}>
                  <tbody>
                    <tr>
                      <td>Valor dos Produtos (vProd):</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>R$ {compCusto.valorProdutoBruto.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>(-) Descontos Incondicionais:</td>
                      <td style={{ textAlign: 'right', color: 'var(--ok)' }}>- R$ {compCusto.descontosIncondicionais.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>(+) Frete, Seguro e Despesas Acessórias:</td>
                      <td style={{ textAlign: 'right' }}>+ R$ {compCusto.freteSeguroOutros.toFixed(2)}</td>
                    </tr>
                    <tr style={{ background: '#fef2f2' }}>
                      <td>
                        (+) Tributos Não Recuperáveis:
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          IPI: R$ {compCusto.tributosNaoRecuperaveis.ipi.toFixed(2)} | ST: R$ {compCusto.tributosNaoRecuperaveis.icmsSt.toFixed(2)} | Outros sem crédito: R$ {compCusto.tributosNaoRecuperaveis.tributosEntradaNaoAproveitados.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--bad)', fontWeight: 600 }}>
                        + R$ {compCusto.tributosNaoRecuperaveis.total.toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ background: '#eef9f0' }}>
                      <td>
                        (-) Impostos a Recuperar:
                        <div style={{ fontSize: '11px', color: '#107c41' }}>
                          ICMS: R$ {compCusto.impostosARecuperar.creditoIcms.toFixed(2)} | PIS/COF: R$ {compCusto.impostosARecuperar.creditoPisCofins.toFixed(2)} | CBS: R$ {compCusto.impostosARecuperar.creditoCbs.toFixed(2)} | IBS: R$ {compCusto.impostosARecuperar.creditoIbs.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: '#107c41', fontWeight: 700 }}>
                        - R$ {compCusto.impostosARecuperar.totalImpostosRecuperaveis.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* DUAS LINHAS FINAIS CONTORNADAS DE PONTA A PONTA */}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: '#fee2e2', border: '2px solid #e11d48', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#9f1239' }}>Custo de Aquisição Real Total:</span>
                    <span style={{ fontWeight: 900, fontSize: '1.25rem', color: '#9f1239' }}>R$ {compCusto.custoAquisicaoReal.toFixed(2)}</span>
                  </div>

                  <div style={{ background: '#ffe4e6', border: '2px solid #f43f5e', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#881337' }}>Custo Unitário Efetivo:</span>
                    <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#881337' }}>R$ {compCusto.custoUnitarioReal.toFixed(2)} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>/ un</span></span>
                  </div>
                </div>

                {compCusto.glosado && (
                  <div className="note critico" style={{ marginTop: 12 }}>
                    <b>GLOSA DE CRÉDITO APLICADA:</b> {compCusto.motivoGlosa}
                  </div>
                )}
              </div>
            </div>

            {/* =============================================================== */}
            {/* COLUNA DIREITA: ALÍQUOTAS, FORMAÇÃO DE PREÇO E WATERFALL */}
            {/* =============================================================== */}
            <div>
              {/* CARD: ALÍQUOTAS APLICADAS E OVERRIDES */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Alíquotas Aplicadas & Edição</h3>
                  <button
                    type="button"
                    className="btn-secundario"
                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    onClick={() => setModoEdicao(!modoEdicao)}
                  >
                    {modoEdicao ? 'Fechar Edição' : '✏️ Editar Alíquotas (Override)'}
                  </button>
                </div>

                {sugestao && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
                      <div className="badge-stat">
                        <span className="lbl">CBS Saída</span>
                        <span className="val">{sugestao.aliquotasAplicadas.cbsPct}%</span>
                      </div>
                      <div className="badge-stat">
                        <span className="lbl">IBS Saída</span>
                        <span className="val">{sugestao.aliquotasAplicadas.ibsPct}%</span>
                      </div>
                      <div className="badge-stat">
                        <span className="lbl">ICMS Saída</span>
                        <span className="val">{sugestao.aliquotasAplicadas.icmsVendaPct}%</span>
                      </div>
                      <div className="badge-stat">
                        <span className="lbl">Redução IVA</span>
                        <span className="val">{sugestao.aliquotasAplicadas.reducaoIbsCbsPct}%</span>
                      </div>
                    </div>

                    {sugestao.camposEditados.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="badge yellow" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                          ⚠️ [Editado Manualmente]: {sugestao.camposEditados.join(', ')}
                        </span>
                        <button
                          type="button"
                          onClick={limparOverrides}
                          style={{ background: 'none', border: 'none', color: 'var(--bad)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                        >
                          ↺ Restaurar Alíquotas Oficiais
                        </button>
                      </div>
                    )}

                    {modoEdicao && (
                      <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-subtle)', borderRadius: 6 }}>
                        <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>Editar Alíquotas Manualmente:</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>CBS (%):</label>
                            <input
                              type="number"
                              step="0.1"
                              value={sugestao.aliquotasAplicadas.cbsPct}
                              onChange={(e) => aplicarCampoOverride('cbsPct', Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>IBS (%):</label>
                            <input
                              type="number"
                              step="0.1"
                              value={sugestao.aliquotasAplicadas.ibsPct}
                              onChange={(e) => aplicarCampoOverride('ibsPct', Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>ICMS Venda (%):</label>
                            <input
                              type="number"
                              step="0.5"
                              value={sugestao.aliquotasAplicadas.icmsVendaPct}
                              onChange={(e) => aplicarCampoOverride('icmsVendaPct', Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: 2 }}>Redução IVA (%):</label>
                            <input
                              type="number"
                              step="5"
                              value={sugestao.aliquotasAplicadas.reducaoIbsCbsPct}
                              onChange={(e) => aplicarCampoOverride('reducaoIbsCbsPct', Number(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* CARD: FORMAÇÃO DE PREÇO, DEMONSTRAÇÃO E WATERFALL BAR */}
              {erroCalculo ? (
                <div className="card note critico">
                  <b>Falha no Cálculo:</b> {erroCalculo}
                </div>
              ) : resultado ? (
                <div className="card" style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#166534' }}>
                    Bloco B — Formação de Preço e Demonstração de Resultados
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Preço Venda Líquido (vProdLiq):</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
                        R$ {resultado.preco.vProdLiq.toFixed(2)}
                      </div>
                    </div>

                    <div style={{ background: '#dcfce7', border: '2px solid #16a34a', padding: 12, borderRadius: 6 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#14532d' }}>Preço de Venda Final na Nota (vNF):</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#14532d' }}>
                        R$ {resultado.preco.precoFinal.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* BARRA HORIZONTAL SEGMENTADA (WATERFALL STACKED BAR 100%) */}
                  {decompPreco && (
                    <div style={{ marginBottom: 18, background: '#fff', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                          Decomposição Visual do Preço de Venda (100% vNF)
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Total Nota: R$ {resultado.preco.precoFinal.toFixed(2)}
                        </span>
                      </div>

                      {/* Barra Segmentada */}
                      <div
                        style={{
                          display: 'flex',
                          height: 32,
                          width: '100%',
                          borderRadius: 8,
                          overflow: 'hidden',
                          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                          background: '#f1f5f9',
                        }}
                        role="img"
                        aria-label="Gráfico de barras da composição do preço de venda"
                      >
                        {decompPreco.custo.pct > 0 && (
                          <div
                            style={{ width: `${decompPreco.custo.pct}%`, background: decompPreco.custo.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                            title={`${decompPreco.custo.label}: R$ ${decompPreco.custo.valor.toFixed(2)} (${decompPreco.custo.pct}%)`}
                          >
                            {decompPreco.custo.pct >= 10 ? `${decompPreco.custo.pct}%` : ''}
                          </div>
                        )}
                        {decompPreco.dv.pct > 0 && (
                          <div
                            style={{ width: `${decompPreco.dv.pct}%`, background: decompPreco.dv.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                            title={`${decompPreco.dv.label}: R$ ${decompPreco.dv.valor.toFixed(2)} (${decompPreco.dv.pct}%)`}
                          >
                            {decompPreco.dv.pct >= 7 ? `${decompPreco.dv.pct}%` : ''}
                          </div>
                        )}
                        {decompPreco.tribDentro.pct > 0 && (
                          <div
                            style={{ width: `${decompPreco.tribDentro.pct}%`, background: decompPreco.tribDentro.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                            title={`${decompPreco.tribDentro.label}: R$ ${decompPreco.tribDentro.valor.toFixed(2)} (${decompPreco.tribDentro.pct}%)`}
                          >
                            {decompPreco.tribDentro.pct >= 7 ? `${decompPreco.tribDentro.pct}%` : ''}
                          </div>
                        )}
                        {decompPreco.irpj.pct > 0 && (
                          <div
                            style={{ width: `${decompPreco.irpj.pct}%`, background: decompPreco.irpj.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                            title={`${decompPreco.irpj.label}: R$ ${decompPreco.irpj.valor.toFixed(2)} (${decompPreco.irpj.pct}%)`}
                          >
                            {decompPreco.irpj.pct >= 7 ? `${decompPreco.irpj.pct}%` : ''}
                          </div>
                        )}
                        {decompPreco.ivaDual.pct > 0 && (
                          <div
                            style={{ width: `${decompPreco.ivaDual.pct}%`, background: decompPreco.ivaDual.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                            title={`${decompPreco.ivaDual.label}: R$ ${decompPreco.ivaDual.valor.toFixed(2)} (${decompPreco.ivaDual.pct}%)`}
                          >
                            {decompPreco.ivaDual.pct >= 7 ? `${decompPreco.ivaDual.pct}%` : ''}
                          </div>
                        )}
                        {decompPreco.margemLiq.pct > 0 && (
                          <div
                            style={{ width: `${decompPreco.margemLiq.pct}%`, background: decompPreco.margemLiq.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}
                            title={`${decompPreco.margemLiq.label}: R$ ${decompPreco.margemLiq.valor.toFixed(2)} (${decompPreco.margemLiq.pct}%)`}
                          >
                            {decompPreco.margemLiq.pct >= 7 ? `${decompPreco.margemLiq.pct}%` : ''}
                          </div>
                        )}
                      </div>

                      {/* Legenda do Waterfall */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, fontSize: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, background: decompPreco.custo.cor, borderRadius: 2 }} />
                          <span>Custo Real: <b>R$ {decompPreco.custo.valor.toFixed(2)}</b> ({decompPreco.custo.pct}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, background: decompPreco.dv.cor, borderRadius: 2 }} />
                          <span>Desp. Var.: <b>R$ {decompPreco.dv.valor.toFixed(2)}</b> ({decompPreco.dv.pct}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, background: decompPreco.tribDentro.cor, borderRadius: 2 }} />
                          <span>Tributos Dentro: <b>R$ {decompPreco.tribDentro.valor.toFixed(2)}</b> ({decompPreco.tribDentro.pct}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, background: decompPreco.irpj.cor, borderRadius: 2 }} />
                          <span>IRPJ/CSLL: <b>R$ {decompPreco.irpj.valor.toFixed(2)}</b> ({decompPreco.irpj.pct}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, background: decompPreco.ivaDual.cor, borderRadius: 2 }} />
                          <span>IVA Dual (Split): <b>R$ {decompPreco.ivaDual.valor.toFixed(2)}</b> ({decompPreco.ivaDual.pct}%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, background: decompPreco.margemLiq.cor, borderRadius: 2 }} />
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>Margem Líq.: <b>R$ {decompPreco.margemLiq.valor.toFixed(2)}</b> ({decompPreco.margemLiq.pct}%)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <tbody>
                      <tr>
                        <td>Tributos de Saída por Dentro (ICMS / DAS):</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          R$ {(resultado.relatorioMargens?.tributosVendaPorDentro ?? resultado.preco.vICMS).toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td>IVA Dual por Fora (CBS: R$ {resultado.preco.vCBS.toFixed(2)} + IBS: R$ {resultado.preco.vIBS.toFixed(2)}):</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          R$ {(resultado.preco.vCBS + resultado.preco.vIBS).toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td>Split Payment Retido (Bancos):</td>
                        <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 600 }}>
                          R$ {resultado.apuracaoCaixa.retencaoSplitIva.toFixed(2)}
                        </td>
                      </tr>
                      <tr style={{ background: '#f0fdf4' }}>
                        <td>Crédito Transferido para Cliente B2B:</td>
                        <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 700 }}>
                          R$ {(resultado.relatorioMargens?.creditoTransferidoClienteB2B ?? 0).toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td>Margem de Contribuição Unitária:</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          R$ {(resultado.relatorioMargens?.margemContribuicaoUnitaria ?? resultado.resultado.margemContribuicaoUnit).toFixed(2)} ({resultado.resultado.indiceMcPct.toFixed(1)}%)
                        </td>
                      </tr>
                      <tr>
                        <td>Provisão de IRPJ e CSLL ({regime}):</td>
                        <td style={{ textAlign: 'right', color: '#b91c1c' }}>
                          R$ {resultado.resultado.irpjCsll.toFixed(2)}
                        </td>
                      </tr>
                      <tr style={{ borderTop: '2px solid #cbd5e1', fontWeight: 700, background: '#f0fdf4' }}>
                        <td>Margem Líquida Real Realizada:</td>
                        <td style={{ textAlign: 'right', color: '#16a34a', fontSize: '1rem' }}>
                          R$ {resultado.resultado.lucroLiquido.toFixed(2)} ({resultado.resultado.margemRealizadaPct.toFixed(1)}%)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

          {/* =============================================================== */}
          {/* BLOCO C: RESUMO EXECUTIVO (3 CARDS COM FONTE 24PX E PESO 900) */}
          {/* =============================================================== */}
          {resultado && (
            <div className="card" style={{ marginTop: 20, marginBottom: 24, padding: 16, background: '#f8fafc', border: '1.5px solid #cbd5e1' }}>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>
                  📌 Bloco C — Resumo Executivo Gerencial
                </h3>
                <p className="hint" style={{ margin: '3px 0 0' }}>
                  Tríade decisória contábil-comercial: Custo Efetivo de Entrada, Retorno Líquido Real e Preço Final ao Consumidor / Destinatário.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {/* CARD 1: VERMELHO - CUSTO EFETIVO DE ENTRADA UNITÁRIO */}
                <div style={{ background: '#fff1f2', border: '2px solid #f43f5e', borderRadius: 8, padding: '16px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Custo Efetivo de Entrada Unitário
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#9f1239', lineHeight: 1.2 }}>
                    R$ {compCusto.custoUnitarioReal.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#e11d48', marginTop: 4, fontWeight: 600 }}>
                    Líquido de Tributos Recuperáveis (CPC 16)
                  </div>
                </div>

                {/* CARD 2: VERDE - MARGEM LÍQUIDA (%) */}
                <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 8, padding: '16px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Margem Líquida Realizada (%)
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#14532d', lineHeight: 1.2 }}>
                    {resultado.resultado.margemRealizadaPct.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
                    R$ {resultado.resultado.lucroLiquido.toFixed(2)} por unidade vendida
                  </div>
                </div>

                {/* CARD 3: AZUL - PREÇO DE VENDA SUGERIDO */}
                <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: 8, padding: '16px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Preço de Venda Sugerido (vNF)
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#1e40af', lineHeight: 1.2 }}>
                    R$ {resultado.preco.precoFinal.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#2563eb', marginTop: 4, fontWeight: 600 }}>
                    vProd Líquido: R$ {resultado.preco.vProdLiq.toFixed(2)} + Tributos
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SEÇÃO 3: GOVERNANÇA CONTÁBIL & PONTO DE EQUILÍBRIO (NBC TG 16 / RIR 2018) */}
          {/* =============================================================== */}
          {resultado?.relatorioMargens && (
            <div className="card" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0 }}>📊 Governança Contábil, Ponto de Equilíbrio & Arbitramento (CPC 16 / RIR 2018)</h3>
                  <p className="hint" style={{ margin: '3px 0 0' }}>
                    Auditoria de integridade patrimonial, teste de impairment de estoques e limites fiscais de custeio.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="custos-fixos-input" style={{ fontSize: '12px', fontWeight: 600 }}>Custos Fixos do Período (R$):</label>
                  <input
                    id="custos-fixos-input"
                    type="number"
                    step="500"
                    value={custosFixosTotais}
                    onChange={(e) => setCustosFixosTotais(Number(e.target.value))}
                    style={{ width: 120, padding: '4px 8px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                {/* CARD 1: TESTE VRL & IMPAIRMENT */}
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                    1. Teste de Valor Realizável Líquido (CPC 16)
                  </div>
                  <div style={{ fontSize: '13px', marginBottom: 4 }}>
                    Custo Real Unitário: <b>R$ {compCusto.custoUnitarioReal.toFixed(2)}</b>
                  </div>
                  <div style={{ fontSize: '13px', marginBottom: 8 }}>
                    VRL (Preço - Desp. Venda): <b>R$ {(resultado.relatorioMargens.analiseVrlEArbitramento?.valorRealizavelLiquido ?? 0).toFixed(2)}</b>
                  </div>
                  {resultado.relatorioMargens.analiseVrlEArbitramento?.requerProvisaoImpairment ? (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 8px', borderRadius: 4, color: '#b91c1c', fontSize: '12px', fontWeight: 700 }}>
                      ⚠️ ALERTA IMPAIRMENT: Provisão de R$ {(resultado.relatorioMargens.analiseVrlEArbitramento?.valorProvisaoUnitaria ?? 0).toFixed(2)}/un exigida por lei (Art. 183 Lei 6.404/76)!
                    </div>
                  ) : (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 8px', borderRadius: 4, color: '#15803d', fontSize: '12px', fontWeight: 700 }}>
                      ✅ Em Conformidade: VRL supera o custo contábil. Dispensa provisão para perdas.
                    </div>
                  )}
                </div>

                {/* CARD 2: PONTO DE EQUILÍBRIO CONTÁBIL (PEC) */}
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                    2. Ponto de Equilíbrio Contábil (PEC)
                  </div>
                  <div style={{ fontSize: '13px', marginBottom: 4 }}>
                    Margem Contribuição Unitária: <b>R$ {(resultado.relatorioMargens.margemContribuicaoUnitaria ?? 0).toFixed(2)}</b> ({resultado.resultado.indiceMcPct.toFixed(1)}%)
                  </div>
                  <div style={{ fontSize: '13px', marginBottom: 4 }}>
                    PEC em Volume: <b>{(resultado.relatorioMargens.pontoEquilibrioContabil?.pecVolume ?? 0).toFixed(0)} un</b>
                  </div>
                  <div style={{ fontSize: '13px', color: '#0b3d91', fontWeight: 700 }}>
                    PEC em Faturamento: R$ {(resultado.relatorioMargens.pontoEquilibrioContabil?.pecValor ?? 0).toFixed(2)}
                  </div>
                </div>

                {/* CARD 3: LIMITE DE ARBITRAMENTO FISCAL RIR/2018 */}
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                    3. Limite Arbitramento Fiscal (Art. 309 RIR)
                  </div>
                  <div style={{ fontSize: '13px', marginBottom: 4 }}>
                    Custo Arbitrado Fiscal: <b>R$ {(resultado.relatorioMargens.analiseVrlEArbitramento?.custoArbitradoRir2018 ?? 0).toFixed(2)}</b>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: 6 }}>
                    Referência: {tipoEstabelecimento === 'industria' ? '80% (Indústria)' : '70% (Comércio)'} sobre o preço de venda.
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569' }}>
                    Parâmetro de glosa fiscal da RFB caso os registros de inventário sejam desclassificados.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SEÇÃO 4: COMPARATIVO DOS 4 REGIMES TRIBUTÁRIOS */}
          {/* =============================================================== */}
          {comparativo && (
            <div className="card" style={{ marginTop: 24 }}>
              <h3>Bloco C — Comparativo Estratégico nos 4 Regimes Tributários</h3>
              <p className="hint">
                Demonstração de custo real, preço final, margem líquida e atratividade competitiva para vendas B2B.
              </p>

              <table className="tabela-comparativa" style={{ width: '100%', marginTop: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
                    <th>Regime Tributário</th>
                    <th>Custo Aquisição Real</th>
                    <th>Preço Final (vNF)</th>
                    <th>Crédito Gerado p/ Cliente B2B</th>
                    <th>Custo Efetivo p/ Cliente B2B</th>
                    <th>Margem Líquida (R$)</th>
                    <th>Margem Líquida (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(['simples', 'simples_hibrido', 'presumido', 'real'] as RegimeTributario[]).map((reg) => {
                    const info = comparativo!.regimes[reg];
                    const isSelected = reg === regime;
                    const isMelhorMargem = comparativo!.melhorMargemLiquida.regime === reg;
                    const isMelhorB2B = comparativo!.melhorCompetitividadeB2B.regime === reg;
                    const custoEfetivoB2B = info.precoVendaFinalNota - info.creditoTransferidoClienteB2B;

                    return (
                      <tr
                        key={reg}
                        style={{
                          background: isSelected ? '#f0f9ff' : 'transparent',
                          fontWeight: isSelected ? 600 : 'normal',
                        }}
                      >
                        <td>
                          {reg === 'simples' && 'Simples Nacional'}
                          {reg === 'simples_hibrido' && 'Simples Híbrido'}
                          {reg === 'presumido' && 'Lucro Presumido'}
                          {reg === 'real' && 'Lucro Real'}
                          {isMelhorMargem && <span className="badge green" style={{ marginLeft: 6 }}>🏆 Maior Margem</span>}
                          {isMelhorB2B && <span className="badge blue" style={{ marginLeft: 6 }}>💼 Melhor B2B</span>}
                        </td>
                        <td>R$ {info.custoAquisicaoReal.toFixed(2)}</td>
                        <td>R$ {info.precoVendaFinalNota.toFixed(2)}</td>
                        <td style={{ color: '#16a34a', fontWeight: 600 }}>
                          R$ {info.creditoTransferidoClienteB2B.toFixed(2)}
                        </td>
                        <td style={{ fontWeight: 700, color: '#0b3d91' }}>
                          R$ {custoEfetivoB2B.toFixed(2)}
                        </td>
                        <td>R$ {info.margemLiquidaValor.toFixed(2)}</td>
                        <td style={{ color: '#16a34a', fontWeight: 600 }}>{info.margemLiquidaPct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* =============================================================== */}
          {/* SEÇÃO 4.1: ANÁLISE DO SIMPLES HÍBRIDO & PONTO DE INFLEXÃO (LC 214/25) */}
          {/* =============================================================== */}
          <div className="card" style={{ marginTop: 24, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, color: '#0b3d91' }}>
                  ⚖️ Análise Estratégica: Simples Tradicional (DAS) vs. Simples Híbrido (IBS/CBS Por Fora — LC 214/25 & Res. CGSN 186/26)
                </h3>
                <p className="hint" style={{ margin: '3px 0 0' }}>
                  Simulador do Ponto de Inflexão (Break-Even) e competitividade de créditos B2B na transição tributária.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label htmlFor="hibrido-compras-cred" style={{ fontSize: '12px', fontWeight: 600 }}>% Compras c/ Crédito:</label>
                  <input
                    id="hibrido-compras-cred"
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={hibridoComprasCreditoPct}
                    onChange={(e) => setHibridoComprasCreditoPct(Number(e.target.value))}
                    style={{ width: 68, padding: '3px 6px', fontSize: '12px' }}
                  />
                  <span style={{ fontSize: '12px' }}>%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label htmlFor="hibrido-mix-b2b" style={{ fontSize: '12px', fontWeight: 600 }}>% Mix Vendas B2B:</label>
                  <input
                    id="hibrido-mix-b2b"
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={hibridoMixB2bPct}
                    onChange={(e) => setHibridoMixB2bPct(Number(e.target.value))}
                    style={{ width: 68, padding: '3px 6px', fontSize: '12px' }}
                  />
                  <span style={{ fontSize: '12px' }}>%</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
              {/* BLOCO 1: DECOMPOSIÇÃO DO DAS */}
              <div style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                  1. Decomposição do DAS ({ano})
                </div>
                <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>DAS Tradicional Efetivo:</span>
                    <strong>{analiseSimplesHibrido.aliquotaDasOriginalPct.toFixed(2)}% (R$ {analiseSimplesHibrido.valorDasSemExpurgo.toFixed(2)})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                    <span>Expurgo PIS/COFINS e ICMS:</span>
                    <strong>-{analiseSimplesHibrido.fatorExpurgoDasPct}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}>
                    <span>DAS Híbrido Reduzido:</span>
                    <strong>{analiseSimplesHibrido.aliquotaDasAjustadaPct.toFixed(2)}% (R$ {analiseSimplesHibrido.valorDasComExpurgo.toFixed(2)})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f0fdf4', padding: '4px 6px', borderRadius: 4 }}>
                    <span style={{ fontWeight: 600 }}>Economia Bruta no DAS:</span>
                    <strong style={{ color: '#15803d' }}>R$ {analiseSimplesHibrido.economiaDas.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span>Saldo IBS/CBS a Pagar (Déb - Créd):</span>
                    <strong>R$ {analiseSimplesHibrido.saldoIbsCbsAPagar.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 4, fontWeight: 700 }}>
                    <span>Carga Tributária Total Híbrido:</span>
                    <span style={{ color: '#0b3d91' }}>R$ {analiseSimplesHibrido.cargaTributariaTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* BLOCO 2: VANTAGEM COMERCIAL B2B */}
              <div style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                  2. Vantagem Comercial B2B (Créditos Transferidos)
                </div>
                <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Crédito no Simples Tradicional:</span>
                    <div style={{ fontWeight: 700, color: '#b45309' }}>
                      {analiseSimplesHibrido.creditoB2bTradicionalPct.toFixed(2)}% (Restrito - Art. 58 §4º Res. CGSN 186)
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Crédito no Simples Híbrido:</span>
                    <div style={{ fontWeight: 700, color: '#15803d' }}>
                      {analiseSimplesHibrido.creditoB2bHibridoPct.toFixed(1)}% (Integral 26,5% Destacado na NF-e)
                    </div>
                  </div>
                  <div style={{ background: '#eff6ff', padding: '6px 8px', borderRadius: 4, marginTop: 4 }}>
                    <span style={{ color: '#1e40af', fontWeight: 600, display: 'block' }}>Ganho de Competitividade B2B:</span>
                    <strong style={{ fontSize: '13.5px', color: '#1d4ed8' }}>
                      +{analiseSimplesHibrido.ganhoCompetitividadeB2bPct.toFixed(2)}% de crédito para o cliente PJ
                    </strong>
                    <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: 2 }}>
                      Gera economia de R$ {analiseSimplesHibrido.ganhoCompetitividadeB2bValor.toFixed(2)}/mês para os compradores corporativos.
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOCO 3: VEREDITO & PONTO DE INFLEXÃO (BREAK-EVEN) */}
              <div style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                  3. Ponto de Inflexão & Veredito Executivo
                </div>
                <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Compras c/ Crédito p/ Empate (Break-Even):</span>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#7c3aed' }}>
                      {analiseSimplesHibrido.pontoInflexao.creditoMinimoEntradaParaEmpatePct.toFixed(1)}% da Receita Bruta
                    </div>
                  </div>
                  <div>
                    {analiseSimplesHibrido.pontoInflexao.regimeVencedor === 'simples_hibrido' ? (
                      <span className="badge green" style={{ fontSize: '12px', padding: '4px 10px', fontWeight: 700 }}>
                        🏆 Recomendado: Simples Híbrido
                      </span>
                    ) : (
                      <span className="badge blue" style={{ fontSize: '12px', padding: '4px 10px', fontWeight: 700 }}>
                        🛡️ Recomendado: Simples Tradicional
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.4, background: '#f8fafc', padding: '6px 8px', borderRadius: 4, border: '1px solid #f1f5f9' }}>
                    {analiseSimplesHibrido.pontoInflexao.justificativa}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: 2 }}>
                    ⚖️ <b>Aviso Normativo:</b> A opção pelo recolhimento de IBS/CBS fora do Simples é irretratável para todo o ano-calendário e deve ser manifestada entre setembro e novembro do ano anterior (LC 214/2025).
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SEÇÃO 4.2: SIMULADOR DUAL-STACK 2027 (CONSULTA SEFA/PR 48/2026 VS TESE JUDICIAL) */}
          {/* =============================================================== */}
          <div className="card" style={{ marginTop: 24, background: '#fff', border: '1.5px solid #0284c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, color: '#0369a1' }}>
                    ⚡ Simulador Dual-Stack 2027: Consulta SEFA/PR nº 48/2026 vs. Tese Judicial
                  </h3>
                  <span className="badge blue" style={{ fontSize: '11px' }}>Transição 2026–2027</span>
                </div>
                <p className="hint" style={{ margin: '3px 0 0' }}>
                  Projeção de impacto no preço final da inclusão do IBS/CBS na Base de Cálculo do ICMS (Grossing-up por dentro).
                </p>
              </div>

              {/* Toggle Jurídico */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0f9ff', padding: '6px 12px', borderRadius: 6, border: '1px solid #bae6fd' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>Posicionamento Jurídico:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={incluirIbsCbsBcIcms}
                    onChange={(e) => setIncluirIbsCbsBcIcms(e.target.checked)}
                  />
                  {incluirIbsCbsBcIcms ? '📜 Aplicar Consulta SEFA/PR nº 48/2026' : '⚖️ Tese Judicial (Excluir da BC)'}
                </label>
              </div>
            </div>

            {/* Alerta Executivo do Simples Nacional Híbrido 2027 */}
            {regime === 'simples' && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: '12px', color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚠️</span>
                <div>
                  <strong>Janela Normativa do Simples Nacional Híbrido 2027 (Resoluções CGSN nº 186/2026 e 194/2026):</strong>{' '}
                  A opção pelo regime híbrido (IBS/CBS no regime regular e DAS sem esses tributos) tem prazo irretratável de manifestação até 20/12/2026 no portal do Simples Nacional.
                </div>
              </div>
            )}

            {/* Comparativo Lado a Lado */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
              {/* Card Modo 1: SEFA/PR 48/2026 */}
              <div style={{
                background: incluirIbsCbsBcIcms ? '#f0fdf4' : '#f8fafc',
                border: incluirIbsCbsBcIcms ? '2px solid #22c55e' : '1px solid #cbd5e1',
                borderRadius: 8,
                padding: 14
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#166534' }}>
                    Modo 1: Administrativo SEFA/PR
                  </span>
                  {incluirIbsCbsBcIcms && <span className="badge green">Ativo</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginBottom: 8 }}>
                  Consulta SEFA/PR nº 48/2026 (IBS e CBS compõem a BC do ICMS)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Base de Cálculo ICMS:</span>
                    <strong>R$ {simulacaoDualStack.baseIcmsModo1.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ICMS Efetivo:</span>
                    <strong style={{ color: '#b91c1c' }}>R$ {simulacaoDualStack.valorIcmsModo1.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>IBS + CBS (por fora):</span>
                    <strong>R$ {(simulacaoDualStack.modoSefa.valorIbs + simulacaoDualStack.modoSefa.valorCbs).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #bbf7d0', paddingTop: 6, marginTop: 4, fontWeight: 800 }}>
                    <span>Preço Final Consumidor:</span>
                    <strong style={{ fontSize: '15px', color: '#14532d' }}>R$ {simulacaoDualStack.precoFinalModo1.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Card Modo 2: Tese Judicial */}
              <div style={{
                background: !incluirIbsCbsBcIcms ? '#f0fdf4' : '#f8fafc',
                border: !incluirIbsCbsBcIcms ? '2px solid #22c55e' : '1px solid #cbd5e1',
                borderRadius: 8,
                padding: 14
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#1e40af' }}>
                    Modo 2: Tese Judicial (Tema 69 STF)
                  </span>
                  {!incluirIbsCbsBcIcms && <span className="badge green">Ativo</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginBottom: 8 }}>
                  Exclusão do IBS e CBS da Base de Cálculo do ICMS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Base de Cálculo ICMS:</span>
                    <strong>R$ {simulacaoDualStack.baseIcmsModo2.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ICMS Efetivo:</span>
                    <strong style={{ color: '#2563eb' }}>R$ {simulacaoDualStack.valorIcmsModo2.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>IBS + CBS (por fora):</span>
                    <strong>R$ {(simulacaoDualStack.modoTese.valorIbs + simulacaoDualStack.modoTese.valorCbs).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #bfdbfe', paddingTop: 6, marginTop: 4, fontWeight: 800 }}>
                    <span>Preço Final Consumidor:</span>
                    <strong style={{ fontSize: '15px', color: '#1e3a8a' }}>R$ {simulacaoDualStack.precoFinalModo2.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Card Efeito Cascata & Choque de Margem */}
              <div style={{ background: '#fff1f2', border: '1.5px solid #fecdd3', borderRadius: 8, padding: 14 }}>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#9f1239' }}>
                  📊 Choque Comercial & Efeito Cascata
                </span>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Efeito Cascata (ICMS s/ IBS-CBS):</span>
                    <strong style={{ color: '#b91c1c' }}>+ R$ {simulacaoDualStack.efeitoCascataReais.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Aumento Efetivo no ICMS:</span>
                    <strong style={{ color: '#dc2626' }}>+{simulacaoDualStack.aumentoPercentualIcms.toFixed(2)}%</strong>
                  </div>
                  <div style={{ background: '#ffe4e6', padding: '6px 8px', borderRadius: 4, marginTop: 4 }}>
                    <span style={{ color: '#881337', fontWeight: 700, display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                      Risco de Erosão de Margem
                    </span>
                    <div style={{ color: '#9f1239', fontWeight: 800, fontSize: '14px' }}>
                      -{simulacaoDualStack.erosaoMargemPpSePrecoTravado.toFixed(2)} p.p. de margem
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#be123c', marginTop: 2 }}>
                      Caso o preço de venda seja mantido inalterado frente ao mercado em 2027.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SEÇÃO 4.3: MESA DE COMPRAS PR (COMPARADOR DE CUSTO ATERRISSADO) */}
          {/* =============================================================== */}
          <div className="card" style={{ marginTop: 24, background: '#f8fafc', border: '1.5px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f172a' }}>
                  🛒 Mesa de Compras PR: Comparador de Custo Efetivo Aterrissado
                </h3>
                <p className="hint" style={{ margin: '3px 0 0' }}>
                  Simulação de sourcing interestadual vs. interno com ICMS-ST, Antecipação Art. 16 e custo financeiro de estoque.
                </p>
              </div>
              <button
                type="button"
                className="btn-secundario"
                style={{ fontSize: '0.85rem', padding: '6px 14px', fontWeight: 600 }}
                onClick={() => setExpandirMesaCompras(!expandirMesaCompras)}
              >
                {expandirMesaCompras ? '▲ Ocultar Mesa de Compras' : '▼ Expandir Mesa de Compras (3 Cotações)'}
              </button>
            </div>

            {expandirMesaCompras && (
              <div style={{ marginTop: 16 }}>
                {/* Parâmetros Financeiros de Capital de Giro */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: '#fff', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label htmlFor="taxa-cap-giro" style={{ fontSize: '12px', fontWeight: 600 }}>Taxa Capital Giro Mensal:</label>
                    <input
                      id="taxa-cap-giro"
                      type="number"
                      step="0.1"
                      min="0"
                      value={taxaCapGiroMesa}
                      onChange={(e) => setTaxaCapGiroMesa(Number(e.target.value))}
                      style={{ width: 64, padding: '3px 6px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '12px' }}>% a.m.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label htmlFor="prazo-estoque" style={{ fontSize: '12px', fontWeight: 600 }}>Prazo Médio de Estoque:</label>
                    <input
                      id="prazo-estoque"
                      type="number"
                      step="5"
                      min="1"
                      value={prazoEstoqueMesa}
                      onChange={(e) => setPrazoEstoqueMesa(Number(e.target.value))}
                      style={{ width: 64, padding: '3px 6px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '12px' }}>dias</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    💡 Considera o custo de oportunidade financeiro sobre o desembolso antecipado de ICMS-ST / Art. 16.
                  </div>
                </div>

                {/* Tabela de Cotações da Mesa de Compras */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                        <th style={{ padding: '8px' }}>Fornecedor</th>
                        <th style={{ padding: '8px' }}>UF</th>
                        <th style={{ padding: '8px' }}>Regime</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Preço Unit.</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Frete</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>IPI</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>ICMS-ST / Ant.</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Custo Fin.</th>
                        <th style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>Custo Aterrissado</th>
                        <th style={{ padding: '8px' }}>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoMesaCompras.cotacoesRanqueadas.map((cot, idx) => {
                        const ehVencedor = idx === 0;
                        return (
                          <tr key={cot.id} style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: ehVencedor ? '#f0fdf4' : '#fff'
                          }}>
                            <td style={{ padding: '8px', fontWeight: 600 }}>
                              {cot.nome}
                              <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 400 }}>{cot.justificativaTributaria}</div>
                            </td>
                            <td style={{ padding: '8px' }}><span className="badge blue">{cot.ufEmitente}</span></td>
                            <td style={{ padding: '8px' }}>{cot.crtEmitente === '1' ? 'Simples' : 'Normal'}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>R$ {cot.precoUnitario.toFixed(2)}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>R$ {cot.freteUnitario.toFixed(2)}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>R$ {cot.vIpiUnitario.toFixed(2)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#b91c1c' }}>
                              R$ {(cot.icmsStEntrada + cot.antecipacaoArt16).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>
                              R$ {cot.custoCapitalGiro.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: ehVencedor ? '#15803d' : '#0f172a' }}>
                              R$ {cot.custoEfetivoAterrissado.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px' }}>
                              {ehVencedor ? (
                                <span className="badge green" style={{ fontWeight: 700 }}>🏆 Menor Custo</span>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#b91c1c' }}>
                                  +R$ {(cot.custoEfetivoAterrissado - resultadoMesaCompras.melhorOpcao.custoEfetivoAterrissado).toFixed(2)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Banner de Conclusão da Mesa de Compras */}
                <div style={{ marginTop: 12, background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#166534', fontSize: '13px' }}>
                      🏆 Vencedor da Mesa de Compras: {resultadoMesaCompras.melhorOpcao.nome}
                    </strong>
                    <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: 2 }}>
                      Economia real de <strong>R$ {resultadoMesaCompras.economiaVsPiorReais.toFixed(2)} ({resultadoMesaCompras.economiaVsPiorPct}%)</strong> por unidade vs. a pior opção analisada.
                    </div>
                  </div>
                  <span className="badge green" style={{ fontSize: '12px', padding: '6px 12px' }}>
                    Economia: R$ {resultadoMesaCompras.economiaVsPiorReais.toFixed(2)}/un
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* =============================================================== */}
          {/* SEÇÃO 4.4: RADAR DE COMBUSTÍVEIS MONOFÁSICOS AD REM (01/02/2027) */}
          {/* =============================================================== */}
          <div className="card" style={{ marginTop: 24, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h4 style={{ margin: 0, color: '#334155' }}>
                  ⛽ Radar Logístico: Virada de Combustíveis Monofásicos Ad Rem em 01/02/2027
                </h4>
                <span className="badge amber" style={{ fontSize: '10.5px' }}>Convênios ICMS 127/2026 e 128/2026</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>CST 61 / EFD PR012000</span>
            </div>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#475569', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <strong>Diesel / Biodiesel (NCM 2710.19.21):</strong> R$ 1,17 ➔ <strong>R$ 1,30/L</strong> (+11,11%) — Acréscimo de R$ 1.300,00/mês para 10.000 L.
              </div>
              <div>
                <strong>Gasolina / EAC (NCM 2710.12.59):</strong> R$ 1,57 ➔ <strong>R$ 1,64/L</strong> (+4,46%).
              </div>
              <div>
                <strong>GLP / GLGN (NCM 2711.19.10):</strong> R$ 1,47 ➔ <strong>R$ 1,54/kg</strong> (+4,76%).
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SEÇÃO 5: GAVETA DO MARCO LEGAL & FONTES OFICIAIS EXPANSÍVEL */}
          {/* =============================================================== */}
          <div className="card" style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>⚖️ Fundamentação Legal e Fontes Oficiais (Marco Legal Vigente)</h3>
              <button
                type="button"
                className="btn-secundario"
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                onClick={() => setExpandirMarcoLegal(!expandirMarcoLegal)}
              >
                {expandirMarcoLegal ? '▲ Ocultar Fontes' : '▼ Ver Catálogo de 28 Normas Oficiais'}
              </button>
            </div>

            {expandirMarcoLegal && (
              <div style={{ marginTop: 14 }}>
                <p className="hint">
                  Todas as regras e travas do motor são sustentadas em diplomas legais vigentes com rastreabilidade auditável:
                </p>
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 8 }}>
                  <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #cbd5e1' }}>ID</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #cbd5e1' }}>Norma</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #cbd5e1' }}>Tema</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #cbd5e1' }}>Vigência</th>
                        <th style={{ padding: '6px 8px', borderBottom: '1px solid #cbd5e1' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fontesOficiais.map((f) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 600 }}>{f.id}</td>
                          <td style={{ padding: '6px 8px' }}>{f.norma}</td>
                          <td style={{ padding: '6px 8px' }}>{f.tema}</td>
                          <td style={{ padding: '6px 8px' }}>{f.vigencia}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span className={`badge ${f.status === 'confirmado' ? 'green' : 'grey'}`}>
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
