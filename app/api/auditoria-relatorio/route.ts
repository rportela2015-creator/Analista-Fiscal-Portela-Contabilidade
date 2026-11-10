import { NextResponse } from 'next/server';
import { z } from 'zod';
import { esc } from '@/lib/html';

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
});

const relatorioPayloadSchema = z.object({
  format: z.enum(['html', 'txt']).optional().default('html'),
  parecerTecnicoXml: z.string().optional().nullable(),
  parecerConformidade: z.string().optional().nullable(),
  itens: z.array(relatorioItemSchema).optional().nullable(),
});

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

      const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Portela Contabilidade - Laudo de Auditoria Fiscal</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.6; background-color: #f8fafc; }
    .container { max-width: 1000px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    h1 { text-align: center; color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-top: 0; }
    .header-info { text-align: center; margin-bottom: 28px; font-size: 0.9em; color: #64748b; }
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
  </style>
</head>
<body>
  <div class="container">
    <h1>Portela Contabilidade - Laudo de Auditoria Fiscal</h1>
    <div class="header-info">Data da geração: ${esc(dataHoraFormatada)}</div>

    <div class="section parecer-tecnico">
      <h2>Parecer Técnico do Documento</h2>
      <p>${parecerTecnicoSafe}</p>
    </div>

    <div class="section parecer-conformidade">
      <h2>Parecer Breve de Conformidade e Créditos</h2>
      <p>${parecerConformidadeSafe}</p>
    </div>

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
