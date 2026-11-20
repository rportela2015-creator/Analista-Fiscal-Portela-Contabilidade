import { ExtractedItem } from './extrator-nfe-types';
import { RegimeTributario, DestinacaoMercadoria } from './marco-legal';
import { esc } from './html';

export interface ParametrosCalculoCustoItem {
  regime: RegimeTributario;
  destinacao?: DestinacaoMercadoria;
  tipoEstabelecimento?: 'comercio' | 'industria';
  ufOrigem?: string;
  ufDestino?: string;
}

export interface ComposicaoCustoItemIndividual {
  index: number;
  cProd: string;
  xProd: string;
  ncm: string;
  cest?: string;
  quantidade: number;
  unidade: string;
  valorBruto: number;
  descontoIncondicional: number;
  freteSeguroOutros: number;
  tributosNaoRecuperaveis: {
    ipi: number;
    icmsSt: number;
    ii: number;
    impostoSeletivo: number;
    tributosNaoAproveitados: number;
    total: number;
  };
  impostosRecuperaveis: {
    creditoIcms: number;
    creditoPisCofins: number;
    creditoCbs: number;
    creditoIbs: number;
    total: number;
  };
  custoTotalReal: number;
  custoUnitarioReal: number;
  glosado: boolean;
  motivoGlosa?: string;
  fundamentacaoLegal: {
    norma: string;
    artigo: string;
    explicacao: string;
  }[];
}

export interface RelatorioCustoEntradaConsolidado {
  parametros: ParametrosCalculoCustoItem;
  totalItens: number;
  valorTotalBruto: number;
  descontosTotais: number;
  freteSeguroTotais: number;
  tributosNaoRecuperaveisTotais: number;
  impostosRecuperaveisTotais: number;
  custoTotalRealConsolidado: number;
  itens: ComposicaoCustoItemIndividual[];
}

function r2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula a composição do custo de aquisição do item segundo o Item 11 do CPC 16 (R1):
 * Custo de aquisição = Preço de compra + Impostos não recuperáveis + Frete/Seguro/Manuseio - Descontos comerciais/Abatimentos - Impostos recuperáveis
 */
export function calcularCustoItemCPC16(
  item: ExtractedItem,
  params: ParametrosCalculoCustoItem
): ComposicaoCustoItemIndividual {
  const q = item.qCom > 0 ? item.qCom : 1;
  const vProd = item.vProd || 0;
  const vDesc = item.vDesc || 0;
  const frete = (item.vFrete || 0) + (item.vSeg || 0) + (item.vOutro || 0);

  const t = item.tributos || {};
  const ipi = t.vIPI || 0;
  const icmsSt = t.vICMSST || 0;
  const ii = t.vII || 0;
  const isVal = t.vIS || 0;

  const glosado = params.destinacao === 'uso_consumo';
  const motivoGlosa = glosado
    ? 'Destinação para Uso e Consumo: Apropriação de créditos de ICMS/PIS/COFINS vedada (CPC 16 item 11 c/c Leis 10.637/02, 10.833/03 e Lei Complementar 87/96).'
    : undefined;

  let credIcms = 0;
  let credPisCofins = 0;
  let credCbs = 0;
  let credIbs = 0;
  let tribNaoAprov = 0;

  const fundLegal: { norma: string; artigo: string; explicacao: string }[] = [];

  fundLegal.push({
    norma: 'CPC 16 (R1) / NBC TG 16 (R2)',
    artigo: 'Item 11',
    explicacao: 'O custo de aquisição dos estoques compreende o preço de compra, os impostos de importação e outros tributos (exceto os recuperáveis), bem como os custos de transporte, seguro e manuseio, deduzidos de descontos comerciais e abatimentos.',
  });

  const isFornecedorSimplesHibrido = String(item.crtEmitente) === 'simples_hibrido';
  const isFornecedorSimples =
    !isFornecedorSimplesHibrido &&
    (item.crtEmitente === '1' ||
      item.crtEmitente === '2' ||
      (item.crtEmitente as any) === 1 ||
      (item.crtEmitente as any) === 2 ||
      (Boolean((item.tributos as any)?.csosn) && !(item.tributos as any)?.cstIcms));

  if (!glosado) {
    switch (params.regime) {
      case 'simples':
        // No Simples Nacional cumulativo padrão, nenhum tributo é creditável
        tribNaoAprov = (t.vICMS || 0) + (t.vCBS || 0) + (t.vIBS || 0);
        fundLegal.push({
          norma: 'Lei Complementar nº 123/2006',
          artigo: 'Art. 23',
          explicacao: 'Microempresas e EPPs optantes pelo Simples Nacional não farão jus à apropriação nem transferirão créditos relativos a impostos ou contribuições abrangidos pelo regime.',
        });
        break;

      case 'simples_hibrido':
        // Simples Híbrido: Credita IBS e CBS no regime não-cumulativo regular, ICMS fica no Simples
        credCbs = t.vCBS || 0;
        credIbs = t.vIBS || 0;
        tribNaoAprov = t.vICMS || 0;
        fundLegal.push({
          norma: 'Lei Complementar nº 214/2025',
          artigo: 'Art. 28 e 41',
          explicacao: 'Opção do optante pelo Simples Nacional pelo recolhimento de IBS e CBS no regime regular não-cumulativo, mantendo o aproveitamento integral de créditos de entrada.',
        });
        break;

      case 'presumido':
        // Lucro Presumido: PIS e COFINS são cumulativos (sem crédito na entrada); ICMS e IBS/CBS geram crédito
        credIcms = t.vICMS || 0;
        credCbs = t.vCBS || 0;
        credIbs = t.vIBS || 0;
        tribNaoAprov = (t.vPIS || 0) + (t.vCOFINS || 0);
        fundLegal.push({
          norma: 'Leis nº 9.718/1998 e 10.833/2003',
          artigo: 'Art. 8º e 10',
          explicacao: 'Regime cumulativo de PIS/COFINS no Lucro Presumido veda a apropriação de créditos de insumos ou mercadorias de revenda.',
        });
        break;

      case 'real':
        // Lucro Real: Não-cumulatividade plena (ICMS, PIS/COFINS, CBS, IBS)
        credIcms = t.vICMS || 0;
        credPisCofins = (t.vPIS || 0) + (t.vCOFINS || 0);
        credCbs = t.vCBS || 0;
        credIbs = t.vIBS || 0;
        fundLegal.push({
          norma: 'Leis nº 10.637/2002 e 10.833/2003',
          artigo: 'Art. 3º',
          explicacao: 'Não-cumulatividade do PIS e da COFINS: direito ao creditamento em relação a bens adquiridos para revenda ou insumos de produção.',
        });
        break;
    }

    // Restrição especial de tributos para compras de Fornecedor Simples Nacional (Tradicional vs Híbrido)
    if (isFornecedorSimples) {
      if (credPisCofins > 0) {
        tribNaoAprov += credPisCofins;
        credPisCofins = 0;
        fundLegal.push({
          norma: 'Leis nº 10.637/2002 e 10.833/2003',
          artigo: 'Art. 3º, § 2º, II',
          explicacao: 'Vedado crédito de PIS/COFINS sobre aquisições efetuadas junto a pessoas jurídicas optantes pelo Simples Nacional.',
        });
      }
      if (credCbs > 0) {
        tribNaoAprov += credCbs;
        credCbs = 0;
      }
      if (credIbs > 0) {
        tribNaoAprov += credIbs;
        credIbs = 0;
      }
    } else if (isFornecedorSimplesHibrido) {
      // Simples Híbrido: Fornecedor recolhe IBS/CBS por fora (art. 58 LC 214/2025), transferindo crédito pleno
      if (credPisCofins > 0) {
        tribNaoAprov += credPisCofins;
        credPisCofins = 0;
      }
      fundLegal.push({
        norma: 'Lei Complementar nº 214/2025',
        artigo: 'Art. 58',
        explicacao: 'Fornecedor no Simples Híbrido recolhe IBS e CBS pelo regime regular não-cumulativo, assegurando direito a crédito integral ao adquirente.',
      });
    }

    // Crédito de ICMS de fornecedor Simples Nacional (se destacado percentual em pCredSN)
    if (isFornecedorSimples && (params.regime === 'real' || params.regime === 'presumido')) {
      const pCred = (item as any).aliquotaCreditoIcmsSimplesPct || t.pCredSN || 0;
      if (pCred > 0 && credIcms === 0) {
        credIcms = r2((vProd - vDesc) * (pCred / 100));
        fundLegal.push({
          norma: 'Lei Complementar nº 123/2006',
          artigo: 'Art. 23, § 1º',
          explicacao: `Aproveitamento de crédito de ICMS à alíquota de ${pCred}% permitida no documento fiscal emitido por ME/EPP do Simples Nacional.`,
        });
      }
    }

    // Mercadorias com ST retida anteriormente (CST 60 ou CSOSN 500)
    const cstIcms = (t as any).cstIcms || '';
    const csosn = (t as any).csosn || '';
    if (cstIcms === '60' || csosn === '500') {
      if (credIcms > 0) {
        tribNaoAprov += credIcms;
        credIcms = 0;
        fundLegal.push({
          norma: 'RICMS/PR c/c Convênio ICMS 142/2018',
          artigo: 'Substituição Tributária',
          explicacao: 'Mercadoria com ICMS retido anteriormente por ST (CST 60 / CSOSN 500): adquirente substituído não apropria crédito próprio na entrada para revenda.',
        });
      }
    }
  } else {
    // Mercadoria para uso e consumo: todos os tributos compõem custo do estoque/despesa
    tribNaoAprov = (t.vICMS || 0) + (t.vPIS || 0) + (t.vCOFINS || 0) + (t.vCBS || 0) + (t.vIBS || 0);
  }

  const totalTribNaoRecup = r2(ipi + icmsSt + ii + isVal + tribNaoAprov);
  const totalImpostosRecup = r2(credIcms + credPisCofins + credCbs + credIbs);

  const custoTotalReal = r2(vProd - vDesc + frete + totalTribNaoRecup - totalImpostosRecup);
  const custoUnitarioReal = r2(custoTotalReal / q);

  return {
    index: item.index,
    cProd: item.cProd,
    xProd: item.xProd,
    ncm: item.ncm,
    cest: item.cest,
    quantidade: q,
    unidade: item.uCom || 'UN',
    valorBruto: vProd,
    descontoIncondicional: vDesc,
    freteSeguroOutros: frete,
    tributosNaoRecuperaveis: {
      ipi,
      icmsSt,
      ii,
      impostoSeletivo: isVal,
      tributosNaoAproveitados: tribNaoAprov,
      total: totalTribNaoRecup,
    },
    impostosRecuperaveis: {
      creditoIcms: credIcms,
      creditoPisCofins: credPisCofins,
      creditoCbs: credCbs,
      creditoIbs: credIbs,
      total: totalImpostosRecup,
    },
    custoTotalReal,
    custoUnitarioReal,
    glosado,
    motivoGlosa,
    fundamentacaoLegal: fundLegal,
  };
}

/**
 * Consolida o cálculo do CPC 16 para todos os itens fornecidos
 */
export function consolidarCustosEntradaCPC16(
  itens: ExtractedItem[],
  params: ParametrosCalculoCustoItem
): RelatorioCustoEntradaConsolidado {
  const itensCalculados = itens.map((it) => calcularCustoItemCPC16(it, params));

  const valorTotalBruto = r2(itensCalculados.reduce((acc, it) => acc + it.valorBruto, 0));
  const descontosTotais = r2(itensCalculados.reduce((acc, it) => acc + it.descontoIncondicional, 0));
  const freteSeguroTotais = r2(itensCalculados.reduce((acc, it) => acc + it.freteSeguroOutros, 0));
  const tributosNaoRecuperaveisTotais = r2(
    itensCalculados.reduce((acc, it) => acc + it.tributosNaoRecuperaveis.total, 0)
  );
  const impostosRecuperaveisTotais = r2(
    itensCalculados.reduce((acc, it) => acc + it.impostosRecuperaveis.total, 0)
  );
  const custoTotalRealConsolidado = r2(
    itensCalculados.reduce((acc, it) => acc + it.custoTotalReal, 0)
  );

  return {
    parametros: params,
    totalItens: itens.length,
    valorTotalBruto,
    descontosTotais,
    freteSeguroTotais,
    tributosNaoRecuperaveisTotais,
    impostosRecuperaveisTotais,
    custoTotalRealConsolidado,
    itens: itensCalculados,
  };
}

/**
 * Gera relatório HTML de composição de custos segundo o CPC 16 (Modo Resumido ou Detalhado)
 */
export function gerarRelatorioCustosHtml(
  rel: RelatorioCustoEntradaConsolidado,
  modo: 'resumido' | 'detalhado' = 'resumido'
): string {
  const agora = new Date().toLocaleString('pt-BR');
  const fmtBrl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const linhasTabela = rel.itens
    .map((it) => {
      const fundHtml =
        modo === 'detalhado'
          ? `
          <tr style="background-color: #f8fafc;">
            <td colspan="9" style="padding: 10px 16px; font-size: 11px; border-bottom: 1.5px solid #cbd5e1;">
              <strong style="color: #3A4A1E; display: block; margin-bottom: 4px;">⚖️ Fundamentação Legal CPC 16 (R1) / Legislação Tributária:</strong>
              ${it.fundamentacaoLegal
                .map(
                  (f) =>
                    `<div style="margin-bottom: 3px;">• <b>${esc(f.norma)} (${esc(f.artigo)}):</b> ${esc(f.explicacao)}</div>`
                )
                .join('')}
              ${it.motivoGlosa ? `<div style="color: #b91c1c; margin-top: 4px;">⚠️ <b>Glosa:</b> ${esc(it.motivoGlosa)}</div>` : ''}
            </td>
          </tr>`
          : '';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <td style="padding: 8px 10px; font-weight: 600;">${it.index}</td>
          <td style="padding: 8px 10px;">
            <div style="font-weight: 600; color: #0f172a;">${esc(it.xProd)}</div>
            <div style="font-size: 10.5px; color: #64748b; font-family: monospace;">Cód: ${esc(it.cProd)} | NCM: ${esc(it.ncm)}</div>
          </td>
          <td style="padding: 8px 10px; text-align: right;">${it.quantidade} ${esc(it.unidade)}</td>
          <td style="padding: 8px 10px; text-align: right;">${fmtBrl(it.valorBruto)}</td>
          <td style="padding: 8px 10px; text-align: right; color: #047857;">- ${fmtBrl(it.descontoIncondicional)}</td>
          <td style="padding: 8px 10px; text-align: right;">+ ${fmtBrl(it.freteSeguroOutros)}</td>
          <td style="padding: 8px 10px; text-align: right; color: #b91c1c;">+ ${fmtBrl(it.tributosNaoRecuperaveis.total)}</td>
          <td style="padding: 8px 10px; text-align: right; color: #1d4ed8;">- ${fmtBrl(it.impostosRecuperaveis.total)}</td>
          <td style="padding: 8px 10px; text-align: right; font-weight: 700; background: #f0fdf4; color: #166534;">
            <div>${fmtBrl(it.custoTotalReal)}</div>
            <div style="font-size: 10px; color: #15803d;">(${fmtBrl(it.custoUnitarioReal)}/un)</div>
          </td>
        </tr>
        ${fundHtml}
      `;
    })
    .join('');

  return `
  <div style="max-width: 1100px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #5B7B35; padding-bottom: 12px; margin-bottom: 16px;">
      <div>
        <h2 style="margin: 0; color: #3A4A1E; font-size: 18px;">Relatório de Custo Real de Entrada — Item 11 do CPC 16 (R1)</h2>
        <span style="font-size: 12px; color: #64748b;">Regime do Adquirente: <b>${esc(rel.parametros.regime.toUpperCase())}</b> · Emissão: ${esc(agora)}</span>
      </div>
      <span style="font-size: 11px; background: #ecfccb; color: #365314; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
        ${modo === 'detalhado' ? 'Visão Detalhada com Citação Legal' : 'Visão Resumida (Tabela de Custos)'}
      </span>
    </div>

    <!-- Cards de Totais -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
        <span style="font-size: 11px; color: #64748b; display: block;">Valor Bruto:</span>
        <strong style="font-size: 13px; color: #1e293b;">${fmtBrl(rel.valorTotalBruto)}</strong>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
        <span style="font-size: 11px; color: #64748b; display: block;">Frete / Seguro / Outros:</span>
        <strong style="font-size: 13px; color: #1e293b;">+ ${fmtBrl(rel.freteSeguroTotais)}</strong>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 10px; border-radius: 6px;">
        <span style="font-size: 11px; color: #991b1b; display: block;">Tributos Não Recuperáveis:</span>
        <strong style="font-size: 13px; color: #b91c1c;">+ ${fmtBrl(rel.tributosNaoRecuperaveisTotais)}</strong>
      </div>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 6px;">
        <span style="font-size: 11px; color: #1e40af; display: block;">Créditos Fiscais Recuperáveis:</span>
        <strong style="font-size: 13px; color: #1d4ed8;">- ${fmtBrl(rel.impostosRecuperaveisTotais)}</strong>
      </div>
      <div style="background: #dcfce7; border: 1px solid #86efac; padding: 10px; border-radius: 6px;">
        <span style="font-size: 11px; color: #14532d; display: block; font-weight: 600;">Custo Real Consolidado:</span>
        <strong style="font-size: 14px; color: #166534;">${fmtBrl(rel.custoTotalRealConsolidado)}</strong>
      </div>
    </div>

    <!-- Tabela por Item -->
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <thead>
        <tr style="background: #f1f5f9; font-size: 11px; color: #475569; text-transform: uppercase;">
          <th style="padding: 8px 10px;">Item</th>
          <th style="padding: 8px 10px;">Descrição da Mercadoria</th>
          <th style="padding: 8px 10px; text-align: right;">Qtd</th>
          <th style="padding: 8px 10px; text-align: right;">vProd</th>
          <th style="padding: 8px 10px; text-align: right;">Desc (-)</th>
          <th style="padding: 8px 10px; text-align: right;">Frete (+)</th>
          <th style="padding: 8px 10px; text-align: right;">Trib Ñ Rec (+)</th>
          <th style="padding: 8px 10px; text-align: right;">Créditos (-)</th>
          <th style="padding: 8px 10px; text-align: right;">Custo Real</th>
        </tr>
      </thead>
      <tbody>
        ${linhasTabela}
      </tbody>
    </table>
  </div>
  `.trim();
}

/**
 * Rateia o frete global da NF-e proporcionalmente ao valor dos produtos segundo o CPC 16 Item 11.
 * Assegura que o total distribuído coincida exatamente com freteTotal (tratando arredondamento no último item).
 */
export function ratearFreteItensCPC16<T extends { vProd: number; pesoBruto?: number; vFrete?: number }>(
  itens: T[],
  freteTotal: number,
  criterio: 'valor' | 'peso' = 'valor'
): T[] {
  if (!itens || itens.length === 0 || freteTotal <= 0) {
    return itens;
  }

  const baseTotal = itens.reduce((acc, it) => {
    if (criterio === 'peso' && (it.pesoBruto ?? 0) > 0) {
      return acc + (it.pesoBruto ?? 0);
    }
    return acc + (it.vProd || 0);
  }, 0);

  if (baseTotal <= 0) return itens;

  let acumulado = 0;
  return itens.map((it, idx) => {
    const isUltimo = idx === itens.length - 1;
    let parcelaFrete: number;

    if (isUltimo) {
      parcelaFrete = r2(freteTotal - acumulado);
    } else {
      const baseItem = criterio === 'peso' && (it.pesoBruto ?? 0) > 0 ? (it.pesoBruto ?? 0) : (it.vProd || 0);
      parcelaFrete = r2(freteTotal * (baseItem / baseTotal));
      acumulado += parcelaFrete;
    }

    return {
      ...it,
      vFrete: parcelaFrete,
    };
  });
}

// Re-exportação de conveniência do motor de CMV Líquido e Custo Aterrissado PR 2026-2027
export {
  calcularCmvLiquidoPR,
  compararFornecedoresCustoAterrissadoPR,
  type EntradaCmvLiquidoPR,
  type ResultadoCmvLiquidoPR,
  type CotacaoFornecedorPR,
  type EntradaComparativoFornecedoresPR,
  type ResultadoComparativoFornecedoresPR,
} from './engine/precificacao-pr-2027';
