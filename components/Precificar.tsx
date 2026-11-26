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
import {
  resolverContextoEmpresaNaData,
  type ItemFiscalAuditado,
} from '@/lib/types/item-fiscal-auditado';
import PrecificarEntradaCpc16Card from '@/components/precificar/PrecificarEntradaCpc16Card';
import PrecificarParametrosForm from '@/components/precificar/PrecificarParametrosForm';
import PrecificarSplitPaymentCard from '@/components/precificar/PrecificarSplitPaymentCard';
import PrecificarDualStack2027Card from '@/components/precificar/PrecificarDualStack2027Card';
import { gerarHtmlLaudoPrecificacao } from '@/components/precificar/precificar-laudo-html';
import { useEmpresaAtiva } from '@/lib/hooks/useEmpresaAtiva';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import { useParametrosPrecificacao } from '@/lib/hooks/useParametrosPrecificacao';
import { obterFontesNormativasPorAba } from '@/lib/fiscal/fontes-normativas';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from '@/lib/engine/matriz-icms-pr';
import { consultarMvaStPr } from '@/lib/engine/tabelas-pr';
import {
  KpiStrip,
  StickyActionBar,
  ProgressiveSection,
  LegalCitationBlock,
  type KpiItemData,
  type NormativeCitation,
} from '@/components/ui';
import { formatarCnpj } from '@/lib/fiscal/perfil-tributario';

export interface PrecificarProps {
  itensIniciais?: PrecificacaoItemInput[];
  itensAuditados?: ItemFiscalAuditado[];
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

export default function Precificar({ itensIniciais, itensAuditados }: PrecificarProps) {
  // ---------------------------------------------------------------------------
  // 1. HOOKS DE ESTADO (ORDEM ESTRITA NO TOPO ABSOLUTO - scripts/hookcheck.mjs)
  // ---------------------------------------------------------------------------
  const { empresaAtiva, perfilAtivo } = useEmpresaAtiva();
  const { nivel, isGerencial, isOperacional, isSenior } = useNivelOperacional();
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

  // Overrides Manuais de Alíquotas Persistidos por Empresa (Marco 3)
  const [modoEdicao, setModoEdicao] = useState<boolean>(false);
  const {
    overrides,
    setAliquota,
    restaurarPadrao,
    temCustomizacao,
    camposCustomizados,
  } = useParametrosPrecificacao(empresaAtiva?.id);

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
  // Sincronização automática do Regime da Empresa Ativa e Perfil Bitemporal na data dhEmi (preserva overrides manuais do usuário)
  const itemAtivoSel = itens[itemIndex] || itens[0];
  const dhEmiAtiva =
    itemAtivoSel?.itemAuditado?.dhEmi ||
    itensAuditados?.[itemIndex]?.dhEmi ||
    itensAuditados?.[0]?.dhEmi;
  const perfilRegimeTributario = perfilAtivo?.regimeTributario;
  const perfilSimplesHibrido2027 = perfilAtivo?.simplesOptanteHibrido2027;
  const perfilRegimeEspecialSefaPr = perfilAtivo?.beneficiosParana?.regimeEspecialSefaPr;
  const perfilDiferimentoArt28 = perfilAtivo?.beneficiosParana?.diferimentoParcialArt28;

  useEffect(() => {
    if (empresaAtiva) {
      const ctxEmpresa = resolverContextoEmpresaNaData({
        empresaAtiva,
        perfilFallback: perfilAtivo,
        dataEmissao: dhEmiAtiva,
      });
      setRegime((prev) => (prev === ctxEmpresa.regimeMotor ? prev : ctxEmpresa.regimeMotor));
      setTipoEstabelecimento((prev) =>
        prev === ctxEmpresa.tipoEstabelecimento ? prev : ctxEmpresa.tipoEstabelecimento
      );

      if (perfilRegimeEspecialSefaPr?.includes('48/2026') || perfilDiferimentoArt28) {
        setIncluirIbsCbsBcIcms((prev) => (prev ? prev : true));
      }
    } else if (itemAtivoSel?.itemAuditado?.contextoEmpresa) {
      const ctxAud = itemAtivoSel.itemAuditado.contextoEmpresa;
      setRegime((prev) => (prev === ctxAud.regimeMotor ? prev : ctxAud.regimeMotor));
      setTipoEstabelecimento((prev) =>
        prev === ctxAud.tipoEstabelecimento ? prev : ctxAud.tipoEstabelecimento
      );
    }
  }, [
    empresaAtiva,
    perfilAtivo,
    dhEmiAtiva,
    perfilRegimeTributario,
    perfilSimplesHibrido2027,
    perfilRegimeEspecialSefaPr,
    perfilDiferimentoArt28,
    itemAtivoSel,
  ]);

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
      if (itemSel.destinacao) {
        const d = itemSel.destinacao;
        setDestinacao((prev) => (prev === d ? prev : d));
      }
      if (itemSel.crtEmitente) {
        const c = itemSel.crtEmitente;
        setCrtEmitente((prev) => (prev === c ? prev : c));
      }
      if (itemSel.origemMercadoria) {
        const o = itemSel.origemMercadoria;
        setOrigemMercadoria((prev) => (prev === o ? prev : o));
      }
      if (itemSel.pisCofinsMonofasico !== undefined) {
        const p = itemSel.pisCofinsMonofasico;
        setPisCofinsMonofasico((prev) => (prev === p ? prev : p));
      }
      if (itemSel.baseReduzidaSaidaPct !== undefined) {
        const b = itemSel.baseReduzidaSaidaPct;
        setBaseReduzidaSaidaPct((prev) => (prev === b ? prev : b));
      }
      if (itemSel.tipoEstabelecimento) {
        const t = itemSel.tipoEstabelecimento;
        setTipoEstabelecimento((prev) => (prev === t ? prev : t));
      }
      const itemAny = itemSel as any;
      const aud = itemSel.itemAuditado || itensAuditados?.[itemIndex];
      if (aud?.ufOrigem || itemAny.ufOrigem) {
        const uo = aud?.ufOrigem || itemAny.ufOrigem;
        setUfOrigem((prev) => (prev === uo ? prev : uo));
      }
      if (aud?.ufDestino || itemAny.ufDestino) {
        const ud = aud?.ufDestino || itemAny.ufDestino;
        setUfDestino((prev) => (prev === ud ? prev : ud));
      }
      if (itemSel.modFrete === '0' || itemSel.modFrete === '1') {
        const m = itemSel.modFrete;
        setModFrete((prev) => (prev === m ? prev : m));
      }
    }
  }, [itens, itemIndex, itensAuditados]);

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

    const dataRef = `${ano}-06-15`;
    const dadosPrOrig = ufOrigem.toUpperCase() === 'PR' ? resolverAliquotaPrBitemporal(itemAtual.ncm, dataRef) : null;
    const dadosPrDest = ufDestino.toUpperCase() === 'PR' ? resolverAliquotaPrBitemporal(itemAtual.ncm, dataRef) : null;
    const isInterna = ufOrigem.toUpperCase() === ufDestino.toUpperCase();
    const aliqNominal = isInterna
      ? (dadosPrOrig ? (dadosPrOrig.ehCombustivelMonofasico ? 0 : dadosPrOrig.aliquotaIcmsPct) : 18.0)
      : (['PR', 'SP', 'RJ', 'MG', 'RS', 'SC'].includes(ufOrigem.toUpperCase()) ? 12.0 : 7.0);
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

    // Reforma Tributária (sem fallback silencioso '000001')
    const cClassTrib = itemAtual.cClassTrib || reducaoAuto?.reforma?.cClassTrib || '';
    const enquadramentoPendente = !cClassTrib;
    const reducaoIbsCbsPct = reducaoAuto?.reforma?.reducaoIbsCbsPct ?? 0;
    const cstIbsCbs = enquadramentoPendente ? '' : reducaoIbsCbsPct === 100 ? '02' : '01';
    const exigeTribRegular = reducaoIbsCbsPct > 0;
    const temaReforma =
      reducaoAuto?.reforma?.tema ||
      (enquadramentoPendente
        ? 'Enquadramento pendente de conferência na tabela oficial'
        : reducaoIbsCbsPct > 0
        ? 'Regime Diferenciado da Reforma'
        : 'Regime Regular Geral');

    // Apuração do DIFAL quando destinação for consumo ou ativo
    let difalInfo: ResultadoDifalDetalhado | null = null;
    const exigeDifal = (destinacao === 'uso_consumo' || destinacao === 'ativo_imobilizado') && ufOrigem !== ufDestino;
    if (exigeDifal) {
      const metodologia = regime === 'simples' ? 'base_unica' : 'base_dupla';
      const aliqDestinoDifal = dadosPrDest ? dadosPrDest.aliquotaIcmsPct : 18.0;
      difalInfo = calcularDifalDetalhado({
        valorOperacao: compCusto.valorProdutoBruto || 100,
        aliqInterestadualPct: aliqNominal,
        aliqInternaDestinoPct: aliqDestinoDifal,
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
        enquadramentoPendente,
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
    ano,
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
    const dadosPrSim = resolverAliquotaPrBitemporal(itemAtual.ncm || '', `${ano}-06-15`);
    const aliqIcms =
      sugestao?.aliquotasAplicadas.icmsVendaPct ??
      (ufDestino.toUpperCase() === 'PR' ? dadosPrSim.aliquotaIcmsPct : 12.0);
    const aliqCbs = sugestao?.aliquotasAplicadas.cbsPct ?? 8.8;
    const aliqIbs = sugestao?.aliquotasAplicadas.ibsPct ?? 0.1;
    const aliqIs = sugestao?.aliquotasAplicadas.isPct ?? 0;
    return simularPrecificacaoDualStack2027PR({
      precoLiquidoSemTributos: pLiq,
      aliquotaIcmsPrPct: aliqIcms,
      aliquotaFecopPrPct: ufDestino.toUpperCase() === 'PR' ? dadosPrSim.aliquotaFecopPct : 0,
      aliquotaCbsPct: aliqCbs,
      aliquotaIbsPct: aliqIbs,
      aliquotaIsPct: aliqIs,
      incluirIbsCbsBcIcms,
    });
  }, [compCusto.custoUnitarioReal, sugestao, ufDestino, incluirIbsCbsBcIcms, itemAtual.ncm, ano]);

  const resultadoMesaCompras = useMemo(() => {
    const dataRef = `${ano}-06-15`;
    const ncmMesa = itemAtual.ncm || '87082999';
    const exclusaoMesa = verificarExclusaoStPr(ncmMesa, itemAtual.cest, dataRef);
    const mvaMesa = consultarMvaStPr({ ncm: ncmMesa, cest: itemAtual.cest, dataFatoGerador: dataRef });
    const sujeitoStEfetivo =
      !exclusaoMesa.excluidoDaSt &&
      !mvaMesa.ehMonofasico &&
      Boolean((deParaCfop?.temSt || itemAtual.temSt) && mvaMesa.mvaOriginalPct > 0);
    return compararFornecedoresCustoAterrissadoPR({
      regimeComprador: regime === 'simples' ? 'SIMPLES_NACIONAL' : (regime === 'real' ? 'LUCRO_REAL' : 'LUCRO_PRESUMIDO'),
      ncm: ncmMesa,
      dataFatoGerador: dataRef,
      sujeitoStPr: sujeitoStEfetivo,
      mvaOriginalPct: sujeitoStEfetivo ? (itemAtual.pMVAST ?? mvaMesa.mvaOriginalPct) : 0,
      taxaCapitalGiroMensalPct: taxaCapGiroMesa,
      prazoMedioEstoqueDias: prazoEstoqueMesa,
      cotacoes: cotacoesMesa,
    });
  }, [regime, itemAtual.ncm, itemAtual.cest, itemAtual.pMVAST, itemAtual.temSt, ano, deParaCfop, taxaCapGiroMesa, prazoEstoqueMesa, cotacoesMesa]);


  // Citações Normativas para o Design System (LegalCitationBlock - Marco 1)
  const citacoesNormativas = useMemo<NormativeCitation[]>(() => {
    return obterFontesNormativasPorAba('precificacao');
  }, []);

  // 4 Macro-KPIs formatados para o KpiStrip (WCAG AA + Tabular Nums)
  const kpiItems = useMemo<KpiItemData[]>(() => {
    const pv = resultado?.preco.precoFinal ?? 0;
    const margemRealizada = resultado?.resultado.margemRealizadaPct ?? 0;
    const lucroLiq = resultado?.resultado.lucroLiquido ?? 0;

    const totalTributosSaida = resultado
      ? (resultado.relatorioMargens?.tributosVendaPorDentro ?? resultado.preco.vICMS) +
        resultado.preco.vCBS +
        resultado.preco.vIBS +
        resultado.resultado.irpjCsll
      : 0;
    const cargaTribPct = pv > 0 ? (totalTributosSaida / pv) * 100 : 0;

    const melhorRegimeObj = comparativo?.melhorMargemLiquida;
    const melhorRegimeNome = melhorRegimeObj
      ? melhorRegimeObj.regime === 'simples'
        ? 'Simples Nacional'
        : melhorRegimeObj.regime === 'simples_hibrido'
        ? 'Simples Híbrido'
        : melhorRegimeObj.regime === 'presumido'
        ? 'Lucro Presumido'
        : 'Lucro Real'
      : 'Calculando...';

    return [
      {
        id: 'kpi-pv',
        label: 'Preço de Venda Sugerido (vNF)',
        value: resultado ? `R$ ${pv.toFixed(2)}` : 'R$ 0,00',
        subValue: `vProd Líquido (R$ ${(resultado?.preco.vProdLiq ?? 0).toFixed(2)}) + Tributos`,
        trafficLight: 'info',
        statusLabel: 'Preço Final',
        tooltipText: 'Preço sugerido na nota fiscal com markup e tributos apurados (NBC TG 16)',
      },
      {
        id: 'kpi-margem',
        label: 'Margem Líquida Realizada',
        value: resultado ? `${margemRealizada.toFixed(1)}%` : '0.0%',
        subValue: `R$ ${lucroLiq.toFixed(2)} por unidade`,
        trafficLight: margemRealizada >= margemAlvo ? 'success' : margemRealizada > 0 ? 'warning' : 'danger',
        statusLabel: margemRealizada >= margemAlvo ? 'Meta Atingida' : 'Abaixo da Meta',
        trend: margemRealizada >= margemAlvo ? 'up' : 'down',
        trendValue: `Alvo: ${margemAlvo}%`,
      },
      {
        id: 'kpi-carga',
        label: 'Carga Tributária Efetiva',
        value: resultado ? `${cargaTribPct.toFixed(1)}%` : '0.0%',
        subValue: `ICMS/DAS + IVA Dual + IRPJ (R$ ${totalTributosSaida.toFixed(2)})`,
        trafficLight: 'info',
        statusLabel: 'Carga Total',
        tooltipText: 'Percentual total de tributos incidentes sobre o preço bruto final na nota',
      },
      {
        id: 'kpi-cenario',
        label: 'Regime Mais Vantajoso',
        value: melhorRegimeNome,
        subValue: melhorRegimeObj ? `Maior Margem: ${melhorRegimeObj.margemLiquidaPct.toFixed(1)}%` : '',
        trafficLight: 'success',
        statusLabel: 'Recomendado',
        trend: 'up',
        tooltipText: 'Regime fiscal mais rentável apurado na simulação comparativa quádrupla',
      },
    ];
  }, [resultado, margemAlvo, comparativo]);


  // Callbacks de manipulação persistente de alíquotas
  const aplicarCampoOverride = useCallback(
    (campo: keyof AliquotasSugeridas, valor: number) => {
      setAliquota(campo, valor);
    },
    [setAliquota]
  );

  const limparOverrides = useCallback(() => {
    restaurarPadrao();
  }, [restaurarPadrao]);

  // ---------------------------------------------------------------------------
  // 4. EXPORTAÇÃO SEGURA: LAUDO HTML IMPRIMÍVEL (Sanitização via esc())
  // ---------------------------------------------------------------------------
  const exportarLaudoHtml = useCallback((modo: 'resumido' | 'detalhado' = 'detalhado') => {
    if (!resultado || !comparativo) return;

    const cfopVendaDest = resultado.cfopVendaDestinatario || determinarCfopVendaDestinatario(itemAtual, ufDestino);
    const cfopExibicao = `Origem: ${itemAtual.cfop || '5102'} ➔ Entrada: ${deParaCfop?.cfopEntrada || '1102'} ➔ Venda (Dest.): ${cfopVendaDest}`;
    const htmlContent = gerarHtmlLaudoPrecificacao({
      modo,
      itemAtual,
      cfopExibicao,
      destinacao,
      crtEmitente,
      regime,
      ufOrigem,
      ufDestino,
      ano,
      compCusto,
      resultado,
      comparativo,
      custosFixosTotais,
      tipoEstabelecimento,
      beneficiosFiscais,
      analiseSimplesHibrido,
    });

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
            overrides: sugestao?.aliquotasAplicadas,
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
      <div className="st-page-header">
        <div>
          <div className="st-page-title-row">
            <h2 className="st-page-title">Precificação &amp; Margens</h2>
            <span className="st-badge-norma">CPC 16 (R1)</span>
            <span className="st-badge-norma">LC 214/2025</span>
            <span className="st-badge-norma">SEFA/PR 48/2026</span>
          </div>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Formação de preço nos 4 regimes com custo real de aquisição, Split Payment e comparativo estratégico B2B.
          </p>
        </div>
      </div>

      {empresaAtiva ? (
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid #3b82f6',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            🏢 <b>Empresa Ativa:</b> {empresaAtiva.razaoSocial} &middot; CNPJ:{' '}
            <span className="mono">{formatarCnpj(empresaAtiva.cnpj)}</span> &middot; UF: <b>{empresaAtiva.uf}</b> &middot; Regime Sincronizado:{' '}
            <b>{perfilAtivo?.regimeTributario || 'Não configurado'}</b>
            {itemAtual.itemAuditado?.contextoEmpresa?.cnaePrincipal && (
              <> &middot; Atividade: <b>{itemAtual.itemAuditado.contextoEmpresa.perfilAtividade}</b></>
            )}
          </div>
          <span style={{ fontSize: 11, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
            Regime Ativo Conectado ({itemAtual.itemAuditado?.contextoEmpresa?.dataFatoGerador || 'vigente'})
          </span>
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'var(--accent-amber-subtle)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: 'var(--warn)',
            borderRadius: 6,
            padding: '8px 14px',
            marginBottom: 16,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          ⚠️ Nenhuma empresa ativa selecionada: simulação utilizando parâmetros manuais (alíquotas customizadas em useParametrosPrecificacao preservadas).
        </div>
      )}
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
              className="btn"
              style={{ fontSize: '13px', padding: '8px 16px', minHeight: '44px' }}
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
            {itemAtual.itemAuditado?.saneamentoNcm?.overrideAtivo && itemAtual.itemAuditado.saneamentoNcm.ncmSaneadoSaida && (
              <span
                className="badge alta tabular-nums"
                style={{ fontSize: '12px', padding: '4px 8px' }}
                title={itemAtual.itemAuditado.saneamentoNcm.orientacaoOperacional}
              >
                ✓ NCM Saneado (XML: {itemAtual.itemAuditado.ncmEscrituradoEntrada.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')})
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
              }}
              style={{ maxWidth: 480, minHeight: '44px' }}
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

      {/* KPI STRIP DE FORMAÇÃO DE PREÇO (4 MACRO-INDICADORES FORMATADOS COM TABULAR-NUMS) */}
      <div style={{ marginBottom: 20 }}>
        <KpiStrip
          items={kpiItems}
          level={nivel}
          showConsolidatedTrafficLightBar
          proportions={{
            regularPct: (resultado?.resultado.margemRealizadaPct ?? 0) >= margemAlvo ? 70 : 40,
            warningPct: 20,
            riskPct: (resultado?.resultado.margemRealizadaPct ?? 0) < margemAlvo ? 40 : 10,
          }}
        />
      </div>

      {carregando ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Carregando tabelas oficiais da Reforma Tributária e Marco Legal...</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
            {/* =============================================================== */}
            {/* COLUNA ESQUERDA: PARÂMETROS, RASTREABILIDADE FISCAL E CUSTO REAL */}
            {/* =============================================================== */}
            <div>
              <PrecificarParametrosForm
                mode="cenario"
                regime={regime}
                setRegime={setRegime}
                ano={ano}
                setAno={setAno}
                ufOrigem={ufOrigem}
                setUfOrigem={setUfOrigem}
                ufDestino={ufDestino}
                setUfDestino={setUfDestino}
                margemAlvo={margemAlvo}
                setMargemAlvo={setMargemAlvo}
                despesasVar={despesasVar}
                setDespesasVar={setDespesasVar}
                rbt12={rbt12}
                setRbt12={setRbt12}
                documentoInidoneo={documentoInidoneo}
                setDocumentoInidoneo={setDocumentoInidoneo}
              />

              <PrecificarEntradaCpc16Card
                premissasSectionId="sec-premissas-rastreabilidade"
                nivel={nivel}
                isGerencial={isGerencial}
                isSenior={isSenior}
                itemAtual={itemAtual}
                audItem={itemAtual.itemAuditado || itensAuditados?.[itemIndex]}
                deParaCfop={deParaCfop}
                resultado={resultado}
                ufDestino={ufDestino}
                destinacao={destinacao}
                setDestinacao={setDestinacao}
                crtEmitente={crtEmitente}
                setCrtEmitente={setCrtEmitente}
                origemMercadoria={origemMercadoria}
                setOrigemMercadoria={setOrigemMercadoria}
                tipoEstabelecimento={tipoEstabelecimento}
                setTipoEstabelecimento={setTipoEstabelecimento}
                baseReduzidaSaidaPct={baseReduzidaSaidaPct}
                setBaseReduzidaSaidaPct={setBaseReduzidaSaidaPct}
                pisCofinsMonofasico={pisCofinsMonofasico}
                setPisCofinsMonofasico={setPisCofinsMonofasico}
                modFrete={modFrete}
                setModFrete={setModFrete}
                freteCteTotal={freteCteTotal}
                setFreteCteTotal={setFreteCteTotal}
                icmsFreteCteTotal={icmsFreteCteTotal}
                setIcmsFreteCteTotal={setIcmsFreteCteTotal}
                criterioRateio={criterioRateio}
                setCriterioRateio={setCriterioRateio}
                beneficiosFiscais={beneficiosFiscais}
                convenioIcmsSelecionado={convenioIcmsSelecionado}
                setConvenioIcmsSelecionado={setConvenioIcmsSelecionado}
                compCusto={compCusto}
              />
            </div>

            {/* =============================================================== */}
            {/* COLUNA DIREITA: ALÍQUOTAS, FORMAÇÃO DE PREÇO E WATERFALL */}
            {/* =============================================================== */}
            <div>
              <PrecificarParametrosForm
                mode="aliquotas"
                temCustomizacao={temCustomizacao}
                camposCustomizados={camposCustomizados}
                limparOverrides={limparOverrides}
                resetLabel="Restaurar Alíquotas Padrão"
                modoEdicao={modoEdicao}
                setModoEdicao={setModoEdicao}
                sugestao={sugestao}
                overrides={overrides}
                aplicarCampoOverride={aplicarCampoOverride}
                empresaNome={empresaAtiva?.razaoSocial}
              />

              <PrecificarSplitPaymentCard
                section="blocoB"
                regime={regime}
                tipoEstabelecimento={tipoEstabelecimento}
                resultado={resultado}
                erroCalculo={erroCalculo}
                decompPreco={decompPreco}
                compCusto={compCusto}
                comparativo={comparativo}
                custosFixosTotais={custosFixosTotais}
                setCustosFixosTotais={setCustosFixosTotais}
              />
            </div>
          </div>

          <PrecificarSplitPaymentCard
            section="blocoC_e_Regimes"
            regime={regime}
            tipoEstabelecimento={tipoEstabelecimento}
            resultado={resultado}
            erroCalculo={erroCalculo}
            decompPreco={decompPreco}
            compCusto={compCusto}
            comparativo={comparativo}
            custosFixosTotais={custosFixosTotais}
            setCustosFixosTotais={setCustosFixosTotais}
          />

          {/* =============================================================== */}
          {/* SEÇÃO 4: TRANSIÇÃO 2027, DUAL-STACK & MESA DE COMPRAS (PROGRESSIVE SECTION) */}
          {/* =============================================================== */}
          <div style={{ marginTop: 24 }}>
            <ProgressiveSection
              id="sec-dual-stack-mesa-compras"
              title="4. Transição 2027: Dual-Stack SEFA/PR 48/2026, Mesa de Compras & Combustíveis Ad Rem"
              subtitle="Análise do Simples Híbrido (LC 214/25), efeito cascata de IBS/CBS na BC do ICMS e cotações de fornecedores"
              minLevel="senior"
              currentLevel={nivel}
              defaultExpanded={isSenior}
              onDemandTriggerLabel="Expandir Análise Dual-Stack e Mesa de Compras PR"
              badge={<span className="badge amber" style={{ fontSize: '11px' }}>Nível Sênior</span>}
            >
              <PrecificarDualStack2027Card
                ano={ano}
                regime={regime}
                isSenior={isSenior}
                hibridoComprasCreditoPct={hibridoComprasCreditoPct}
                setHibridoComprasCreditoPct={setHibridoComprasCreditoPct}
                hibridoMixB2bPct={hibridoMixB2bPct}
                setHibridoMixB2bPct={setHibridoMixB2bPct}
                analiseSimplesHibrido={analiseSimplesHibrido}
                incluirIbsCbsBcIcms={incluirIbsCbsBcIcms}
                setIncluirIbsCbsBcIcms={setIncluirIbsCbsBcIcms}
                simulacaoDualStack={simulacaoDualStack}
                expandirMesaCompras={expandirMesaCompras}
                setExpandirMesaCompras={setExpandirMesaCompras}
                taxaCapGiroMesa={taxaCapGiroMesa}
                setTaxaCapGiroMesa={setTaxaCapGiroMesa}
                prazoEstoqueMesa={prazoEstoqueMesa}
                setPrazoEstoqueMesa={setPrazoEstoqueMesa}
                resultadoMesaCompras={resultadoMesaCompras}
              />
        </ProgressiveSection>
      </div>

          {/* =============================================================== */}
          {/* SEÇÃO 5: FUNDAMENTAÇÃO LEGAL & FONTES OFICIAIS (LEGAL CITATION BLOCK) */}
          {/* =============================================================== */}
          <div style={{ marginTop: 24, marginBottom: 32 }}>
            <LegalCitationBlock
              citations={citacoesNormativas}
              currentLevel={nivel}
              title="5. Fundamentação Normativa & Memória Pericial (CPC 16 (R1) / LC 214/2025 / LC 227/2026 / RICMS-PR)"
              defaultCollapsed={!isSenior}
              calculationMemory={`Preço Venda Líquido = Custo Unitário Real (R$ ${compCusto.custoUnitarioReal.toFixed(2)}) / [1 - Despesas Variáveis (${despesasVar}%) - Margem Líquida Pretendida (${margemAlvo}%) - Tributos por Dentro (${(resultado?.relatorioMargens?.tributosVendaPorDentro ?? resultado?.preco.vICMS ?? 0).toFixed(2)})]\nPreço Final vNF = vProd Líquido + IBS (${sugestao?.aliquotasAplicadas.ibsPct ?? 0.1}%) + CBS (${sugestao?.aliquotasAplicadas.cbsPct ?? 8.8}%) + Imposto Seletivo (${sugestao?.aliquotasAplicadas.isPct ?? 0}%)`}
            />

            {/* Gaveta opcional com as 28 normas oficiais */}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button
                type="button"
                className="btn-secundario"
                style={{ fontSize: '0.8rem', padding: '6px 12px', minHeight: '44px' }}
                onClick={() => setExpandirMarcoLegal(!expandirMarcoLegal)}
              >
                {expandirMarcoLegal ? '▲ Ocultar Catálogo Completo' : '▼ Ver Catálogo de 28 Normas Oficiais'}
              </button>
            </div>

            {expandirMarcoLegal && (
              <div className="card" style={{ marginTop: 10 }}>
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card-subtle)', zIndex: 1 }}>
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

      {/* BARRA DE AÇÃO PERSISTENTE (STICKY ACTION BAR COM 1 CTA PRIMÁRIO SÓLIDO) */}
      <StickyActionBar
        screenState={resultado ? 'audited' : 'default'}
        summary={{
          itemCount: itensRateados.length,
          totalValueBrl: resultado?.preco.precoFinal,
          selectedCount: 1,
          customMessage: `Item #${itemIndex + 1}: ${itemAtual.codigo} | PV: R$ ${(resultado?.preco.precoFinal ?? 0).toFixed(2)} | Margem: ${(resultado?.resultado.margemRealizadaPct ?? 0).toFixed(1)}%`,
        }}
        primaryAction={{
          label: resultado ? 'Exportar / Aplicar Tabela' : 'Calcular Preço e Margens',
          onClick: () => exportarLaudoHtml('detalhado'),
          disabled: !resultado,
          title: 'Exportar laudo pericial completo de formação de preço em HTML/PDF',
        }}
        secondaryActions={[
          {
            id: 'export-resumido',
            label: 'Laudo Resumido',
            onClick: () => exportarLaudoHtml('resumido'),
            disabled: !resultado,
            title: 'Gerar resumo executivo gerencial',
          },
          {
            id: 'export-csv',
            label: 'Exportar Planilha CSV',
            onClick: exportarCsv,
            disabled: carregando,
            title: 'Baixar formação de preço em planilha Excel/CSV',
          },
        ]}
        contextBadge={
          <span style={{ fontSize: '11px', background: '#1e3a5f', color: '#93c5fd', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
            Regime: {regime.toUpperCase()} · Nível: {nivel.toUpperCase()}
          </span>
        }
        statusMessage={resultado ? `Formação de preço calculada com sucesso para ${itemAtual.descricao.slice(0, 30)}...` : 'Aguardando simulação'}
      />
    </section>
  );
}
