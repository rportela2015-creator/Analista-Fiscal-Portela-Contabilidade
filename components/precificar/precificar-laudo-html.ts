import { esc } from '@/lib/html';
import { PORTELA_HEADER_CSS, renderHeaderPortela } from '@/lib/relatorio-header';
import type { DestinacaoMercadoria, RegimeTributario } from '@/lib/marco-legal';
import type { CrtEmitente, ComparativoRegimesResultado, ItemPreco, ResultadoDetalhado } from '@/lib/precificacao';

export interface DadosLaudoPrecificacao {
  modo: 'resumido' | 'detalhado';
  itemAtual: any;
  cfopExibicao: string;
  destinacao: DestinacaoMercadoria;
  crtEmitente: CrtEmitente;
  regime: RegimeTributario;
  ufOrigem: string;
  ufDestino: string;
  ano: number;
  compCusto: any;
  resultado: ResultadoDetalhado;
  comparativo: ComparativoRegimesResultado;
  custosFixosTotais: number;
  tipoEstabelecimento: 'comercio' | 'industria';
  beneficiosFiscais: any;
  analiseSimplesHibrido: any;
}

export function gerarHtmlLaudoPrecificacao(dados: DadosLaudoPrecificacao): string {
  const {
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
  } = dados;

  const relMarg = resultado.relatorioMargens;
  const vrl = relMarg?.analiseVrlEArbitramento?.valorRealizavelLiquido ?? 0;
  const reqImpairment = relMarg?.analiseVrlEArbitramento?.requerProvisaoImpairment ?? false;
  const provImpairment = relMarg?.analiseVrlEArbitramento?.valorProvisaoUnitaria ?? 0;
  const custoArbitrado = relMarg?.analiseVrlEArbitramento?.custoArbitradoRir2018 ?? 0;
  const pecVol = relMarg?.pontoEquilibrioContabil?.pecVolume ?? 0;
  const pecVal = relMarg?.pontoEquilibrioContabil?.pecValor ?? 0;
  const mcUnit = relMarg?.margemContribuicaoUnitaria ?? 0;

  return `<!DOCTYPE html>
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
      <div class="quadro-bloco-a-total">
        <span>Custo de Aquisição Real Total:</span>
        <span style="font-size: 15px;">R$ ${compCusto.custoAquisicaoReal.toFixed(2)}</span>
      </div>
      <div class="quadro-bloco-a-unit">
        <span>Custo Unitário Efetivo:</span>
        <span style="font-size: 15px;">R$ ${compCusto.custoUnitarioReal.toFixed(2)} / un</span>
      </div>
    </div>

    <div class="card-bloco-b">
      <h2>Bloco B — Formação de Preço e Demonstração de Resultados</h2>
      <table>
        <tbody>
          <tr><td>Preço de Venda Líquido (vProdLiq)</td><td class="num" style="font-weight: 700;">R$ ${resultado.preco.vProdLiq.toFixed(2)}</td></tr>
          <tr><td>(+) Tributos por Dentro (ICMS / DAS)</td><td class="num">+ R$ ${(relMarg?.tributosVendaPorDentro ?? resultado.preco.vICMS).toFixed(2)}</td></tr>
          <tr><td>(+) IVA Dual por Fora (CBS: R$ ${resultado.preco.vCBS.toFixed(2)} + IBS: R$ ${resultado.preco.vIBS.toFixed(2)})</td><td class="num">+ R$ ${(resultado.preco.vCBS + resultado.preco.vIBS).toFixed(2)}</td></tr>
        </tbody>
      </table>
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
}
