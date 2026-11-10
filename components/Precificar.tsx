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
} from '@/lib/marco-legal';
import {
  simular,
  sugerirAliquotasPrecificacao,
  calcularCustoAquisicaoReal,
  compararQuatroRegimes,
  ratearDespesasAcessoriaEFrete,
  type ItemPreco,
  type ParamsPreco,
  type AliquotasSugeridas,
  type ResultadoDetalhado,
  type ComparativoRegimesResultado,
} from '@/lib/precificacao';
import type { PrecificacaoItemInput } from '@/lib/extrator-nfe-types';
import { esc } from '@/lib/html';

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
  const [crtEmitente, setCrtEmitente] = useState<'1' | '2' | '3' | '4'>('3');
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
  const exportarLaudoHtml = useCallback(() => {
    if (!resultado || !comparativo) return;

    const cfopExibicao = deParaCfop
      ? `${itemAtual.cfop || '5102'} ➔ ${deParaCfop.cfopEntrada}`
      : itemAtual.cfop || '5102';

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
  <title>Laudo Pericial de Precificação & Custo Real - ${esc(itemAtual.codigo)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; line-height: 1.45; }
    .header { border-bottom: 2px solid #0b3d91; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; color: #0b3d91; font-size: 19px; text-transform: uppercase; }
    .header .sub { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 4px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 12.5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #fff; margin-bottom: 16px; }
    .card h2 { margin: 0 0 10px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
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
      .card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: right;">
    <button onclick="window.print()" style="background: #0b3d91; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; cursor: pointer;">🖨️ Imprimir / Salvar PDF</button>
  </div>

  <div class="header">
    <div>
      <h1>Laudo Pericial de Precificação & Custo de Aquisição Real</h1>
      <div class="sub">CONTABILIDADE PORTELA · AUDITORIA FISCAL & TRIBUTÁRIA · NBC TG 16 / OT CFC 01/2026</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #64748b;">
      <div>Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</div>
      <div>Vigência: Calendário Fiscal ${esc(ano)}</div>
    </div>
  </div>

  <div class="meta-box">
    <strong>Item:</strong> ${esc(itemAtual.codigo)} — ${esc(itemAtual.descricao)} | 
    <strong>NCM:</strong> ${esc(itemAtual.ncm)} | 
    <strong>De-Para CFOP:</strong> ${esc(cfopExibicao)} | 
    <strong>Destinação:</strong> ${esc(destinacao.toUpperCase())} | 
    <strong>CRT Fornecedor:</strong> ${esc(crtEmitente)} | 
    <strong>Regime Adquirente:</strong> ${esc(regime.toUpperCase())} | 
    <strong>Fluxo:</strong> ${esc(ufOrigem)} ➔ ${esc(ufDestino)}
  </div>

  <div class="grid">
    <!-- BLOCO A: CUSTO DE AQUISIÇÃO REAL -->
    <div class="card">
      <h2>Bloco A — Custo de Aquisição Real (NBC TG 16)</h2>
      <table>
        <tbody>
          <tr><td>Valor Bruto dos Produtos (vProd)</td><td class="num">R$ ${compCusto.valorProdutoBruto.toFixed(2)}</td></tr>
          <tr><td>(-) Descontos Incondicionais</td><td class="num highlight-green">- R$ ${compCusto.descontosIncondicionais.toFixed(2)}</td></tr>
          <tr><td>(+) Frete, Seguro e Despesas Acessórias</td><td class="num">+ R$ ${compCusto.freteSeguroOutros.toFixed(2)}</td></tr>
          <tr><td>(+) Tributos Não Recuperáveis (IPI, ST, II, IS, trib. não creditados)</td><td class="num highlight-red">+ R$ ${compCusto.tributosNaoRecuperaveis.total.toFixed(2)}</td></tr>
          <tr><td>(-) Impostos a Recuperar (ICMS, PIS/COFINS, CBS, IBS)</td><td class="num highlight-green">- R$ ${compCusto.impostosARecuperar.totalImpostosRecuperaveis.toFixed(2)}</td></tr>
          <tr class="total-row"><td>Custo de Aquisição Real Total</td><td class="num" style="color: #0b3d91;">R$ ${compCusto.custoAquisicaoReal.toFixed(2)}</td></tr>
          <tr><td>Custo Unitário Efetivo</td><td class="num" style="font-weight: 700;">R$ ${compCusto.custoUnitarioReal.toFixed(2)} / un</td></tr>
        </tbody>
      </table>
    </div>

    <!-- BLOCO B: FORMAÇÃO DE PREÇO E DEMONSTRAÇÃO -->
    <div class="card">
      <h2>Bloco B — Formação de Preço e Demonstração de Resultados</h2>
      <table>
        <tbody>
          <tr><td>Preço de Venda Líquido (vProdLiq)</td><td class="num" style="font-weight: 700;">R$ ${resultado.preco.vProdLiq.toFixed(2)}</td></tr>
          <tr><td>(+) Tributos por Dentro (ICMS / DAS)</td><td class="num">+ R$ ${(relMarg?.tributosVendaPorDentro ?? resultado.preco.vICMS).toFixed(2)}</td></tr>
          <tr><td>(+) IVA Dual por Fora (CBS: R$ ${resultado.preco.vCBS.toFixed(2)} + IBS: R$ ${resultado.preco.vIBS.toFixed(2)})</td><td class="num">+ R$ ${(resultado.preco.vCBS + resultado.preco.vIBS).toFixed(2)}</td></tr>
          <tr class="total-row"><td>Preço de Venda Final na Nota (vNF)</td><td class="num" style="color: #1e40af; font-size: 13.5px;">R$ ${resultado.preco.precoFinal.toFixed(2)}</td></tr>
          <tr><td>Split Payment Retido na Liquidação Bancária</td><td class="num highlight-red">R$ ${resultado.apuracaoCaixa.retencaoSplitIva.toFixed(2)}</td></tr>
          <tr><td>Crédito Fiscal Transferido para Cliente B2B</td><td class="num highlight-green">R$ ${(relMarg?.creditoTransferidoClienteB2B ?? 0).toFixed(2)}</td></tr>
          <tr><td>Margem de Contribuição Unitária</td><td class="num">R$ ${mcUnit.toFixed(2)} (${resultado.resultado.indiceMcPct.toFixed(1)}%)</td></tr>
          <tr><td>Provisão de IRPJ e CSLL</td><td class="num highlight-red">R$ ${resultado.resultado.irpjCsll.toFixed(2)}</td></tr>
          <tr style="background: #f0fdf4; font-weight: 700;"><td>Margem Líquida Real Realizada</td><td class="num" style="color: #16a34a;">R$ ${resultado.resultado.lucroLiquido.toFixed(2)} (${resultado.resultado.margemRealizadaPct.toFixed(1)}%)</td></tr>
        </tbody>
      </table>
    </div>
  </div>

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

  <div class="card">
    <h2>Fundamentação Legal & Alertas Periciais</h2>
    <div style="font-size: 11px; color: #475569;">
      ${resultado.baseLegal.map((b) => `<div><strong>${esc(b.norma)}</strong> (${esc(b.dispositivo)}): ${esc(b.tema)} — <em>Status: ${esc(b.status)}</em></div>`).join('')}
      ${resultado.alertas.map((a) => `<div style="margin-top: 4px; color: #b45309;">⚠️ ${esc(a)}</div>`).join('')}
    </div>
  </div>

  <div class="footer">
    <div>Classificador NCM & Reforma Tributária · Motor de Precificação v2.0</div>
    <div>Soberania de Dados Local-First · Documento Válido para Instrução Gerencial</div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `laudo_precificacao_${itemAtual.codigo || 'item'}.html`;
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
              className="btn primary"
              style={{ background: '#0b3d91', borderColor: '#0b3d91', fontSize: '13px', padding: '6px 14px' }}
              onClick={exportarLaudoHtml}
              disabled={!resultado}
              title="Gerar laudo pericial formatado para impressão ou salvamento em PDF"
            >
              📄 Exportar Laudo / Imprimir
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
                        Mapeamento Automático de Entrada (De-Para)
                      </span>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#0b3d91', marginTop: 2 }}>
                        CFOP {itemAtual.cfop || '5102'} ➔ {deParaCfop?.cfopEntrada || '1102'}
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
                    <select value={crtEmitente} onChange={(e) => setCrtEmitente(e.target.value as any)}>
                      <option value="3">3 - Regime Normal (Lucro Real / Presumido)</option>
                      <option value="1">1 - Simples Nacional (Microempresa / EPP)</option>
                      <option value="2">2 - Simples Nacional (Sublimite Excedido)</option>
                      <option value="4">4 - MEI (Microempreendedor Individual)</option>
                    </select>
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

              {/* CARD 3: DEMONSTRAÇÃO DO CUSTO DE AQUISIÇÃO REAL */}
              <div className="card">
                <h3 style={{ margin: '0 0 4px' }}>Bloco A — Custo de Aquisição Real (NBC TG 16 / CPC 16)</h3>
                <p className="hint" style={{ margin: '0 0 10px' }}>
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
                    <tr style={{ background: 'var(--bg-subtle)' }}>
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
                    <tr style={{ borderTop: '2px solid var(--line)', fontWeight: 700, fontSize: '1.05rem', background: '#f8fafc' }}>
                      <td>Custo de Aquisição Real Total:</td>
                      <td style={{ textAlign: 'right', color: 'var(--brand)' }}>R$ {compCusto.custoAquisicaoReal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Custo Unitário Real:</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>R$ {compCusto.custoUnitarioReal.toFixed(2)} / un</td>
                    </tr>
                  </tbody>
                </table>

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
                <div className="card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#0f172a' }}>
                    Bloco B — Formação de Preço e Demonstração de Resultados
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Preço Venda Líquido (vProdLiq):</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
                        R$ {resultado.preco.vProdLiq.toFixed(2)}
                      </div>
                    </div>

                    <div style={{ background: '#eff6ff', padding: 12, borderRadius: 6, border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '0.8rem', color: '#1d4ed8' }}>Preço Final na Nota (vNF):</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e40af' }}>
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
