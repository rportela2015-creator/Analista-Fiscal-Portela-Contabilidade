import { NextResponse } from 'next/server';
import { z } from 'zod';
import { esc } from '@/lib/html';

const diagnosticoDifalSchema = z.object({
  sujeitoDifal: z.boolean().optional().nullable(),
  modalidade: z.string().optional().nullable(),
  modalidadeBase: z.string().optional().nullable(),
  baseCalculoOperacao: z.number().optional().nullable(),
  baseCalculoDifal: z.number().optional().nullable(),
  aliquotaOrigem: z.number().optional().nullable(),
  aliquotaDestino: z.number().optional().nullable(),
  aliquotaFecop: z.number().optional().nullable(),
  aliquotaInternaEfetiva: z.number().optional().nullable(),
  valorDebitoDifal: z.number().optional().nullable(),
  valorDebitoFecop: z.number().optional().nullable(),
  valorTotalDebito: z.number().optional().nullable(),
  efeitoCaixaLiquido: z.number().optional().nullable(),
  guiaRecolhimento: z.string().optional().nullable(),
  vencimento: z.string().optional().nullable(),
  codigoAjusteEfd: z.string().optional().nullable(),
  obrigacaoAcessoria: z.string().optional().nullable(),
  fundamentacaoLegal: z.string().optional().nullable(),
  alertasAuditoria: z.array(z.string()).optional().nullable(),
}).passthrough().optional().nullable();

const resumoDifalEntradaSchema = z.object({
  totalItensAnalisados: z.number().optional().nullable(),
  totalItensComDifal: z.number().optional().nullable(),
  totalDifalGeral: z.number().optional().nullable(),
  totalFecopGeral: z.number().optional().nullable(),
  totalGeralRecolher: z.number().optional().nullable(),
  exigeRecolhimentoNaNota: z.boolean().optional().nullable(),
  totalBaseDifal: z.number().optional().nullable(),
  totalDebitoDifal: z.number().optional().nullable(),
  totalDebitoFecop: z.number().optional().nullable(),
  totalAntecipacaoArt16: z.number().optional().nullable(),
  totalEfeitoCaixaLiquido: z.number().optional().nullable(),
  guiasNecessarias: z.array(z.string()).optional().nullable(),
  prazoPrincipal: z.string().optional().nullable(),
  obrigacoesAcessorias: z.array(z.string()).optional().nullable(),
  alertasConsolidados: z.array(z.string()).optional().nullable(),
}).passthrough().optional().nullable();

const relatorioItemSchema = z.object({
  cProd: z.string().optional().nullable(),
  xProd: z.string().optional().nullable(),
  ncm: z.string().optional().nullable(),
  cest: z.string().optional().nullable(),
  cfopEntrada: z.string().optional().nullable(),
  cstIcmsEntrada: z.string().optional().nullable(),
  aliqIcms: z.string().optional().nullable(),
  permiteCredito: z.boolean().optional().nullable(),
  cstPisCofinsEntrada: z.string().optional().nullable(),
  aliqPis: z.string().optional().nullable(),
  aliqCofins: z.string().optional().nullable(),
  cClassTrib: z.string().optional().nullable(),
  aliqIbsTransitorio: z.string().optional().nullable(),
  aliqCbsTransitorio: z.string().optional().nullable(),
  regimeEspecial: z.string().optional().nullable(),
  instrucaoCadastro: z.string().optional().nullable(),
  destinacao: z.string().optional().nullable(),
  diagnosticoDifal: diagnosticoDifalSchema,
});

const relatorioPayloadSchema = z.object({
  format: z.enum(['html', 'txt']).optional().default('html'),
  parecerTecnicoXml: z.string().optional().nullable(),
  parecerConformidade: z.string().optional().nullable(),
  itens: z.array(relatorioItemSchema).optional().nullable(),
  resumoDifalEntrada: resumoDifalEntradaSchema,
  relatorioDifal: resumoDifalEntradaSchema,
});

import { PORTELA_HEADER_CSS, renderHeaderPortela } from '@/lib/relatorio-header';

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Corpo da requisição JSON inválido ou malformado.', codigo: 'JSON_MALFORMADO' },
        { status: 400 }
      );
    }

    if (!body) {
      return NextResponse.json(
        { error: 'Nenhum dado fornecido para o relatório fiscal.', codigo: 'PAYLOAD_AUSENTE' },
        { status: 400 }
      );
    }

    const parseResult = relatorioPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Estrutura inválida para geração de relatório.',
          detalhes: parseResult.error.issues,
          codigo: 'PAYLOAD_INVALIDO',
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;
    const format = data.format;
    const dataHoraFormatada = new Date().toLocaleString('pt-BR');

    if (format === 'html') {
      const parecerTecnicoSafe = esc(data.parecerTecnicoXml || 'Nenhum parecer técnico disponível.');
      const parecerConformidadeSafe = esc(data.parecerConformidade || 'Nenhum parecer de conformidade disponível.');

      const itensHtml = data.itens && data.itens.length > 0
        ? data.itens.map((item, i) => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-title">Item ${i + 1}: ${esc(item.cProd || 'N/A')} - ${esc(item.xProd || 'N/A')}</div>
        <div class="item-ncm">NCM: ${esc(item.ncm || 'N/A')} | CEST: ${esc(item.cest || 'N/A')}</div>
      </div>

      <div class="grid-container">
        <div class="tax-block icms">
          <div class="tax-title">Bloco ICMS/ST</div>
          <div class="tax-row"><span class="tax-label">CFOP Entrada:</span> <span class="tax-value">${esc(item.cfopEntrada || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">CST ICMS:</span> <span class="tax-value">${esc(item.cstIcmsEntrada || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota ICMS:</span> <span class="tax-value">${esc(item.aliqIcms || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Permite Crédito:</span> <span class="tax-value">${item.permiteCredito ? 'Sim' : 'Não'}</span></div>
        </div>

        <div class="tax-block pis-cofins">
          <div class="tax-title">Bloco PIS/COFINS</div>
          <div class="tax-row"><span class="tax-label">CST PIS/COFINS:</span> <span class="tax-value">${esc(item.cstPisCofinsEntrada || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota PIS:</span> <span class="tax-value">${esc(item.aliqPis || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota COFINS:</span> <span class="tax-value">${esc(item.aliqCofins || 'N/A')}</span></div>
        </div>

        <div class="tax-block reforma">
          <div class="tax-title">Bloco Reforma Tributária (IBS/CBS)</div>
          <div class="tax-row"><span class="tax-label">cClassTrib:</span> <span class="tax-value">${esc(item.cClassTrib || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota IBS:</span> <span class="tax-value">${esc(item.aliqIbsTransitorio || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Alíquota CBS:</span> <span class="tax-value">${esc(item.aliqCbsTransitorio || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Regime Especial:</span> <span class="tax-value">${esc(item.regimeEspecial || 'N/A')}</span></div>
        </div>
      </div>

      <div class="instruction">
        <strong>Instrução Pericial:</strong> ${esc(item.instrucaoCadastro || 'N/A')}
      </div>
    </div>
        `).join('')
        : '<p>Nenhum item processado nesta auditoria.</p>';

      const headerPortelaHtml = renderHeaderPortela({
        titulo: 'Laudo Técnico de Auditoria Fiscal e Tributária',
        subtitulo: 'Auditoria de Entrada de Documento Fiscal Eletrônico (DF-e)',
        dataHora: dataHoraFormatada,
        documentoRef: data.itens && data.itens.length ? `${data.itens.length} itens auditados` : undefined,
      });

      const resumoDifal = data.resumoDifalEntrada || data.relatorioDifal;
      let difalHtml = '';
      if (resumoDifal) {
        const totalDifalStr = (resumoDifal.totalDebitoDifal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const totalFecopStr = (resumoDifal.totalDebitoFecop ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const totalGeralStr = (resumoDifal.totalGeralRecolher ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const totalAntec16Str = (resumoDifal.totalAntecipacaoArt16 ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const guiasStr = esc(resumoDifal.guiasNecessarias?.join(', ') || 'Sem guias exigidas');
        const prazoStr = esc(resumoDifal.prazoPrincipal || 'Sem prazo definido');
        const obriStr = esc(resumoDifal.obrigacoesAcessorias?.join('; ') || 'Nenhuma');

        const alertasHtml = resumoDifal.alertasConsolidados && resumoDifal.alertasConsolidados.length > 0
          ? `<div class="alerta-box-difal"><strong>Alertas de Auditoria:</strong><ul>${resumoDifal.alertasConsolidados.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`
          : '';

        const itensDifalRows = (data.itens || [])
          .filter(it => it.diagnosticoDifal)
          .map((it, idx) => {
            const d = it.diagnosticoDifal!;
            const baseOp = (d.baseCalculoOperacao ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const baseDif = (d.baseCalculoDifal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const debDif = (d.valorDebitoDifal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const debFec = (d.valorDebitoFecop ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const debTot = (d.valorTotalDebito ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            return `<tr>
              <td>${idx + 1} - ${esc(it.xProd || it.cProd || 'Item')}</td>
              <td>${esc(it.destinacao || 'Padrão')}</td>
              <td>${esc(d.modalidade || 'N/A')}</td>
              <td style="text-align:right">${baseOp}</td>
              <td style="text-align:right">${baseDif}</td>
              <td style="text-align:right">${debDif}</td>
              <td style="text-align:right">${debFec}</td>
              <td style="text-align:right; font-weight:bold">${debTot}</td>
            </tr>`;
          }).join('');

        const tabelaItensDifalHtml = itensDifalRows
          ? `<table class="tabela-difal">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Destinação</th>
                  <th>Modalidade</th>
                  <th style="text-align:right">Base Operação</th>
                  <th style="text-align:right">Base Dupla DIFAL</th>
                  <th style="text-align:right">Débito DIFAL</th>
                  <th style="text-align:right">Débito FECOP</th>
                  <th style="text-align:right">Total Débito</th>
                </tr>
              </thead>
              <tbody>
                ${itensDifalRows}
              </tbody>
            </table>`
          : '';

        difalHtml = `
    <div class="section difal-section">
      <h2>Apuração de DIFAL, FECOP e Antecipação Tributária na Entrada (RICMS/PR)</h2>
      <div class="difal-metrics">
        <div class="difal-metric-card">
          <div class="metric-title">Débito DIFAL</div>
          <div class="metric-val">${totalDifalStr}</div>
        </div>
        <div class="difal-metric-card">
          <div class="metric-title">FECOP 2% (Art. 14-A da Lei nº 11.580/1996 e Anexo XII do RICMS/PR)</div>
          <div class="metric-val">${totalFecopStr}</div>
        </div>
        <div class="difal-metric-card">
          <div class="metric-title">Antecipação Art. 16</div>
          <div class="metric-val">${totalAntec16Str}</div>
        </div>
        <div class="difal-metric-card highlight">
          <div class="metric-title">Total a Recolher</div>
          <div class="metric-val">${totalGeralStr}</div>
        </div>
      </div>
      <div class="difal-details">
        <p><strong>Guias Necessárias:</strong> ${guiasStr}</p>
        <p><strong>Prazo Principal:</strong> ${prazoStr}</p>
        <p><strong>Obrigações Acessórias:</strong> ${obriStr}</p>
      </div>
      ${alertasHtml}
      ${tabelaItensDifalHtml}
    </div>`;
      }

      const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Portela Contabilidade - Laudo de Auditoria Fiscal</title>
  <style>
    ${PORTELA_HEADER_CSS}
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.6; background-color: #f8fafc; }
    .container { max-width: 1000px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .section { margin-bottom: 24px; padding: 20px; border-radius: 6px; }
    .parecer-tecnico { background-color: #f0f9ff; border-left: 4px solid #0284c7; }
    .parecer-conformidade { background-color: #f0fdf4; border-left: 4px solid #16a34a; }
    h2 { color: #0f172a; margin-top: 0; font-size: 1.25rem; }
    .item-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 18px; margin-bottom: 18px; background-color: #ffffff; }
    .item-header { border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 14px; }
    .item-title { font-weight: 600; font-size: 1.05rem; color: #0f172a; }
    .item-ncm { font-size: 0.875rem; color: #64748b; font-family: monospace; }
    .grid-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .tax-block { padding: 12px; border-radius: 6px; background-color: #f8fafc; border: 1px solid #e2e8f0; }
    .tax-block.icms { border-left: 4px solid #2563eb; }
    .tax-block.pis-cofins { border-left: 4px solid #d97706; }
    .tax-block.reforma { border-left: 4px solid #059669; }
    .tax-title { font-weight: 600; margin-bottom: 8px; font-size: 0.9rem; color: #334155; }
    .tax-row { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; }
    .tax-label { color: #64748b; }
    .tax-value { font-weight: 600; color: #0f172a; font-family: monospace; }
    .instruction { margin-top: 14px; padding: 12px; background-color: #eff6ff; border-radius: 6px; font-size: 0.875rem; border-left: 4px solid #3b82f6; }
    .difal-section { background-color: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #ea580c; border-radius: 6px; }
    .difal-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
    .difal-metric-card { background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #fdba74; }
    .difal-metric-card.highlight { background: #ffedd5; border: 2px solid #ea580c; }
    .metric-title { font-size: 0.8rem; font-weight: 600; color: #9a3412; text-transform: uppercase; }
    .metric-val { font-size: 1.2rem; font-weight: 700; color: #7c2d12; margin-top: 4px; font-family: monospace; }
    .difal-details { margin: 14px 0; font-size: 0.875rem; color: #431407; }
    .alerta-box-difal { background: #fee2e2; border-left: 4px solid #ef4444; padding: 10px 14px; margin: 12px 0; border-radius: 4px; color: #991b1b; font-size: 0.85rem; }
    .tabela-difal { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 0.85rem; background: #ffffff; border-radius: 6px; overflow: hidden; }
    .tabela-difal th, .tabela-difal td { padding: 8px 10px; border: 1px solid #fed7aa; }
    .tabela-difal th { background-color: #ffedd5; color: #9a3412; text-align: left; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    ${headerPortelaHtml}

    <div class="section parecer-tecnico">
      <h2>Parecer Técnico do Documento</h2>
      <p>${parecerTecnicoSafe}</p>
    </div>

    <div class="section parecer-conformidade">
      <h2>Parecer Breve de Conformidade e Créditos</h2>
      <p>${parecerConformidadeSafe}</p>
    </div>

    ${difalHtml}

    <h2>Parametrização de ERP - Detalhamento de Itens</h2>
    ${itensHtml}
  </div>
</body>
</html>`;

      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'attachment; filename="relatorio_executivo.html"',
        },
      });
    }

    // Formato TXT
    let txtContent = `# Portela Contabilidade - Laudo de Auditoria Fiscal\n`;
    txtContent += `Data da geração: ${dataHoraFormatada}\n\n`;

    txtContent += `## Parecer Técnico do Documento\n`;
    txtContent += `${data.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}\n\n`;

    txtContent += `## Parecer Breve de Conformidade e Créditos\n`;
    txtContent += `${data.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}\n\n`;

    txtContent += `## Parametrização de ERP - Detalhamento de Itens\n\n`;

    if (data.itens && data.itens.length > 0) {
      data.itens.forEach((item, i) => {
        txtContent += `### Item ${i + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}\n`;
        txtContent += `- NCM: ${item.ncm || 'N/A'} | CEST: ${item.cest || 'N/A'}\n\n`;

        txtContent += `#### [ICMS/ST]\n`;
        txtContent += `- CFOP: ${item.cfopEntrada || 'N/A'}\n`;
        txtContent += `- CST: ${item.cstIcmsEntrada || 'N/A'}\n`;
        txtContent += `- Alíquota: ${item.aliqIcms || 'N/A'}\n`;
        txtContent += `- Crédito: ${item.permiteCredito ? 'Sim' : 'Não'}\n\n`;

        txtContent += `#### [PIS/COFINS]\n`;
        txtContent += `- CST: ${item.cstPisCofinsEntrada || 'N/A'}\n`;
        txtContent += `- Alíquota PIS: ${item.aliqPis || 'N/A'}\n`;
        txtContent += `- Alíquota COFINS: ${item.aliqCofins || 'N/A'}\n\n`;

        txtContent += `#### [REFORMA TRIBUTÁRIA]\n`;
        txtContent += `- cClassTrib: ${item.cClassTrib || 'N/A'}\n`;
        txtContent += `- Alíquota IBS: ${item.aliqIbsTransitorio || 'N/A'}\n`;
        txtContent += `- Alíquota CBS: ${item.aliqCbsTransitorio || 'N/A'}\n`;
        txtContent += `- Regime Especial: ${item.regimeEspecial || 'N/A'}\n\n`;

        txtContent += `**Instrução de Cadastro:** ${item.instrucaoCadastro || 'N/A'}\n`;
        txtContent += `---------------------------------------------------\n\n`;
      });
    } else {
      txtContent += `Nenhum item processado nesta auditoria.\n`;
    }

    return new NextResponse(txtContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment; filename="relatorio_executivo.txt"',
      },
    });
  } catch (error: any) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json(
      { error: 'Falha interna ao gerar o relatório executivo.', codigo: 'ERRO_RELATORIO' },
      { status: 500 }
    );
  }
}
