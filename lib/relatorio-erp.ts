/**
 * Motor de Relatórios Fiscais para Parametrização de ERP
 * Suporta Modo Resumido (somente campo e código) e Modo Detalhado (com citação legal).
 * Totalmente puro, tipado e seguro contra XSS (interpolação via esc()).
 */

import { esc } from './relatorio';

export interface ParametrosErpItem {
  cProd?: string;
  xProd?: string;
  ncm?: string;
  descricaoNcm?: string;
  cest?: string;
  cfop?: string;
  cstIcms?: string;
  csosn?: string;
  aliqIcms?: string;
  cstIpi?: string;
  aliqIpi?: string;
  cstPis?: string;
  aliqPis?: string;
  cstCofins?: string;
  aliqCofins?: string;
  cstIbsCbs?: string;
  cClassTrib?: string;
  descricaoClassTrib?: string;
  fundamentoClassTrib?: string;
  aliqCbs?: string;
  aliqIbsUf?: string;
  aliqIbsMun?: string;
  isTributa?: boolean;
  cstIs?: string;
  cClassTribIs?: string;
  aliqIsAdv?: string;
  aliqIsAre?: string;
  permiteCredito?: boolean;
  instrucao?: string;
}

export interface ParametrosErpContexto {
  emitente?: {
    cnpj?: string;
    ie?: string;
    nome?: string;
    municipioIbge?: string;
    uf?: string;
    regime?: string;
    crt?: string;
    regApIBSCBSSN?: string;
  };
  destinatario?: {
    cnpjCpf?: string;
    ie?: string;
    nome?: string;
    uf?: string;
    indIEDest?: string;
  };
  operacao?: {
    tipo?: string;
    finalidade?: string;
    modelo?: string;
    anoReforma?: number;
  };
}

export interface ParametrosErpPayload {
  contexto: ParametrosErpContexto;
  itens: ParametrosErpItem[];
}

export interface CampoLegalErp {
  campo: string;
  tagXml: string;
  codigo: string;
  descricao?: string;
  normaLegal: string;
  dispositivo: string;
  fundamento: string;
}

/** Tabela de fundamentação legal pericial para cada campo de codificação no ERP */
export function mapearCamposLegais(item: ParametrosErpItem, ctx: ParametrosErpContexto): CampoLegalErp[] {
  const ano = ctx.operacao?.anoReforma || 2026;
  const isSimples = ctx.emitente?.regime === 'simples' || ctx.emitente?.crt === '1';

  const campos: CampoLegalErp[] = [
    {
      campo: 'NCM (Nomenclatura Comum do Mercosul)',
      tagXml: 'prod/NCM',
      codigo: item.ncm || '— a parametrizar —',
      descricao: item.descricaoNcm || 'Classificação fiscal mercantil',
      normaLegal: 'Decreto Federal nº 97.409/1988 (Convenção Internacional do SH); Resolução Gecex nº 926/2026 (CAMEX); IN RFB nº 2.169/2023 (NESH)',
      dispositivo: 'RGI 1 (texto da posição 4D) e RGI 6 (desdobramento em subitem de 8D)',
      fundamento: 'A NCM é o eixo estruturante da classificação da mercadoria. Determina o tratamento aduaneiro (II), IPI e vinculação às tabelas de desoneração da LC 214/2025.'
    },
    {
      campo: 'CEST (Código Especificador da ST)',
      tagXml: 'prod/CEST',
      codigo: item.cest || '— não aplicável —',
      descricao: item.cest ? 'Sujeito ao regime de substituição tributária' : 'Mercadoria sem previsão de ST no convênio',
      normaLegal: 'Convênio ICMS nº 142/2018 (CONFAZ); Lei Complementar nº 87/1996 (Lei Kandir)',
      dispositivo: 'Cláusula 21ª e Anexos I a XXVIII do Convênio ICMS 142/2018; art. 8º da LC 87/1996',
      fundamento: 'Identificação obrigatória nos documentos fiscais para mercadorias passíveis de retenção do ICMS-ST no destino.'
    },
    {
      campo: 'CFOP (Código Fiscal de Operações e Prestações)',
      tagXml: 'prod/CFOP',
      codigo: item.cfop || '— a preencher —',
      descricao: `Operação ${ctx.operacao?.tipo || 'interna'} / Finalidade ${ctx.operacao?.finalidade || 'comercialização'}`,
      normaLegal: 'Convênio S/Nº de 15/12/1970 (CONFAZ); Ajustes SINIEF nº 49/2025 e nº 27/2026',
      dispositivo: 'Tabela de CFOP anexa ao Convênio S/N de 1970 (grupos 1/2/3 entrada, 5/6/7 saída)',
      fundamento: 'Define a natureza jurídica e circulatória da operação mercantil no território nacional e exterior.'
    },
    {
      campo: isSimples ? 'CSOSN (Simples Nacional)' : 'CST do ICMS (Regime Normal)',
      tagXml: isSimples ? 'ICMS/CSOSN' : 'ICMS/CST',
      codigo: (isSimples ? item.csosn : item.cstIcms) || (isSimples ? '102' : '000'),
      descricao: item.aliqIcms ? `Alíquota ICMS: ${item.aliqIcms}` : 'Conforme regime e UF de destino',
      normaLegal: isSimples
        ? 'Lei Complementar nº 123/2006; Resolução CGSN nº 140/2018 / Resol. CGSN nº 186/2026; Ajuste SINIEF nº 19/2012'
        : 'Lei Complementar nº 87/1996 (Lei Kandir); Convênio SINIEF s/nº de 15/12/1970 (Tabela B)',
      dispositivo: isSimples ? 'Art. 18 da LC 123/2006 e Tabela B do Anexo do Ajuste SINIEF 19/2012' : 'Art. 12 da LC 87/1996 e Tabela B do Convênio SINIEF s/n 1970',
      fundamento: isSimples
        ? 'Tributação englobada pelo Simples Nacional com recolhimento através de DAS, salvo hipóteses especiais de ST ou diferimento.'
        : 'Define a tributação integral, redução de base, isenção ou cobrança por substituição tributária perante a Fazenda Estadual.'
    },
    {
      campo: 'CST do IPI',
      tagXml: 'IPI/CST',
      codigo: item.cstIpi || '53',
      descricao: item.aliqIpi ? `Alíquota: ${item.aliqIpi}%` : 'Não tributado ou saída não tributada',
      normaLegal: 'Decreto Federal nº 7.212/2010 (RIPI/2010); IN RFB nº 2.022/2021; IN RFB nº 1.009/2010',
      dispositivo: 'Arts. 9º, 209 e seguintes do Decreto 7.212/2010',
      fundamento: 'Classifica saídas industriais tributadas, imunes ou desoneradas. Na Reforma Tributária, o IPI é reduzido a zero em 2027 salvo Zona Franca de Manaus.'
    },
    {
      campo: 'CST de PIS / COFINS',
      tagXml: 'PIS/CST e COFINS/CST',
      codigo: item.cstPis || item.cstCofins || '01',
      descricao: `PIS: ${item.aliqPis || '—'} | COFINS: ${item.aliqCofins || '—'}`,
      normaLegal: 'Leis Federais nº 10.637/2002 (PIS), nº 10.833/2003 (COFINS) e nº 9.718/1998; IN RFB nº 2.121/2022',
      dispositivo: 'Art. 2º da Lei 10.637/2002; Art. 2º da Lei 10.833/2003; Arts. 165 e ss. da IN RFB 2.121/2022',
      fundamento: 'Define o regime de creditamento das contribuições sociais vigentes até a sua extinção total em 31/12/2026.'
    },
    {
      campo: 'CST de IBS e CBS (Reforma Tributária)',
      tagXml: 'IBSCBS/CST',
      codigo: item.cstIbsCbs || '000',
      descricao: item.cstIbsCbs === '000' ? '000 — Tributação Integral'
        : item.cstIbsCbs === '200' ? '200 — Alíquota Zero / Cesta Básica'
        : item.cstIbsCbs === '410' ? '410 — Imunidade / Não Incidência'
        : item.cstIbsCbs === '620' ? '620 — Regime Monofásico'
        : 'Tabela Oficial da Calculadora da RFB',
      normaLegal: 'Lei Complementar nº 214, de 16/01/2025 (Livro I); Lei Complementar nº 227, de 13/01/2026',
      dispositivo: 'Ato Conjunto RFB/CGIBS nº 1/2025; Resolução CGIBS nº 13/2026; Arts. 4º a 7º da LC 214/2025',
      fundamento: 'Padronização nacional de 18 códigos de situação tributária do IVA Dual que rege a cobrança e não-cumulatividade plena.'
    },
    {
      campo: 'cClassTrib (Classificação Tributária Nacional)',
      tagXml: 'IBSCBS/cClassTrib',
      codigo: item.cClassTrib || '000001',
      descricao: item.descricaoClassTrib || 'Tributadas integralmente',
      normaLegal: 'Lei Complementar nº 214/2025 (Arts. 8º, 9º, 103, 125 a 140; Anexos I a X); LC 227/2026',
      dispositivo: item.fundamentoClassTrib || 'Ato Conjunto RFB/CGIBS nº 4/2026; ADE RFB/CGIBS nº 6/2026',
      fundamento: 'Código nacional de 6 dígitos que amarra formalmente a nota fiscal ao tratamento tributário diferenciado e regimes aduaneiros.'
    },
    {
      campo: `Alíquotas de Referência (${ano})`,
      tagXml: 'IBSCBS/pCBS e pIBSUF',
      codigo: `CBS: ${item.aliqCbs || (ano === 2026 ? '0,90%' : '8,40%')} | IBS Estadual: ${item.aliqIbsUf || (ano === 2026 ? '0,10%' : '—')}`,
      descricao: ano === 2026 ? 'Alíquota de teste compensável com PIS/COFINS' : 'Vigência plena da CBS federal',
      normaLegal: 'Emenda Constitucional nº 132/2023; Lei Complementar nº 214/2025, Arts. 343 a 348',
      dispositivo: 'Art. 125 do ADCT (CF/88); arts. 343 a 345 da LC 214/2025',
      fundamento: 'Cronograma cogente de transição gradual da Reforma Tributária do Consumo (2026 a 2033).'
    },
    {
      campo: 'Imposto Seletivo (IS)',
      tagXml: 'IS/CSTIS e pIS',
      codigo: item.isTributa ? `Tributado (CST ${item.cstIs || '000'})` : 'Não Sujeito',
      descricao: item.isTributa ? `Alíquota ad valorem: ${item.aliqIsAdv || '—'}%` : 'Bens sem incidência de Imposto Seletivo',
      normaLegal: 'Art. 153, VIII da Constituição Federal (EC nº 132/2023); Lei Complementar nº 214/2025 (Livro II)',
      dispositivo: 'Arts. 392 a 420 da Lei Complementar nº 214/2025',
      fundamento: 'Incidência monofásica sobre veículos, embarcações, aeronaves, bebidas alcoólicas, cigarros, bebidas açucaradas e bens minerais extraídos a partir de 2027.'
    }
  ];

  if (isSimples) {
    campos.push({
      campo: 'Apuração IBS/CBS no Simples Nacional',
      tagXml: 'emit/regApIBSCBSSN',
      codigo: ctx.emitente?.regApIBSCBSSN === '1' ? '1 (Simplificada)' : '0 (Apuração Normal)',
      descricao: ctx.emitente?.regApIBSCBSSN === '1' ? 'Apuração simplificada com transferência limitada' : 'Apuração normal de IBS/CBS',
      normaLegal: 'Lei Complementar nº 214/2025, arts. 257 a 265; LC 123/2006',
      dispositivo: 'Art. 257 da LC 214/2025; Manual de Orientação da NF-e',
      fundamento: 'Garante o controle da tomada de crédito de IBS/CBS pelos adquirentes de empresas do Simples Nacional.'
    });
  }

  return campos;
}

// ============================================================================
// 1. MODO RESUMIDO (SOMENTE CAMPO E CÓDIGO CORRESPONDENTE)
// ============================================================================

export function gerarRelatorioErpResumidoTxt(payload: ParametrosErpPayload, agora: Date = new Date()): string {
  const { contexto, itens } = payload;
  let txt = `================================================================================\n`;
  txt += `PARAMETRIZAÇÃO FISCAL DE ERP — MODO RESUMIDO (CÓDIGO E CAMPO)\n`;
  txt += `Contabilidade Portela (Desde 1970) · Data da Geração: ${agora.toLocaleString('pt-BR')}\n`;
  txt += `================================================================================\n\n`;

  txt += `DADOS DA EMPRESA E OPERAÇÃO:\n`;
  txt += `- Emitente: ${contexto.emitente?.cnpj || 'Não informado'} | UF: ${contexto.emitente?.uf || '—'} | Regime: ${contexto.emitente?.regime || '—'}\n`;
  txt += `- Destino: ${contexto.destinatario?.uf || '—'} | Operação: ${contexto.operacao?.tipo || 'interna'} | Finalidade: ${contexto.operacao?.finalidade || 'comercialização'}\n`;
  txt += `- Modelo DF-e: ${contexto.operacao?.modelo || '55'} | Ano Base Reforma: ${contexto.operacao?.anoReforma || 2026}\n\n`;

  itens.forEach((item, idx) => {
    txt += `--------------------------------------------------------------------------------\n`;
    txt += `ITEM ${idx + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'Produto sem descrição'}\n`;
    txt += `--------------------------------------------------------------------------------\n`;
    txt += `${'CAMPO / TAG'.padEnd(35)} | ${'CÓDIGO / PARÂMETRO'}\n`;
    txt += `------------------------------------+-------------------------------------------\n`;

    const campos = mapearCamposLegais(item, contexto);
    for (const c of campos) {
      txt += `${c.campo.padEnd(35)} | ${c.codigo}\n`;
    }
    if (item.instrucao) {
      txt += `\nINSTRUÇÃO ERP: ${item.instrucao}\n`;
    }
    txt += `\n`;
  });

  txt += `================================================================================\n`;
  txt += `Fim do Relatório Resumido para Parametrização de ERP.\n`;
  return txt;
}

export function gerarRelatorioErpResumidoHtml(payload: ParametrosErpPayload, agora: Date = new Date()): string {
  const { contexto, itens } = payload;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Parametrização de ERP - Modo Resumido</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 30px; color: #2c3e50; line-height: 1.5; }
    .header { border-bottom: 2px solid #2980b9; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 1.5rem; color: #1a365d; }
    .header p { margin: 4px 0 0; color: #718096; font-size: 0.85rem; }
    .info-box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; font-size: 0.9rem; }
    .card { background: #ffffff; border: 1px solid #cbd5e0; border-radius: 8px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; }
    .card-header { background: #edf2f7; padding: 10px 16px; font-weight: 600; font-size: 1rem; border-bottom: 1px solid #cbd5e0; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #f8fafc; padding: 8px 16px; font-size: 0.8rem; color: #4a5568; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
    td { padding: 10px 16px; border-bottom: 1px solid #edf2f7; font-size: 0.9rem; }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; color: #2b6cb0; }
    .instrucao { background: #ebf8ff; border-left: 4px solid #3182ce; padding: 10px 14px; font-size: 0.85rem; margin: 12px 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Contabilidade Portela — Parametrização Fiscal de ERP (Modo Resumido)</h1>
    <p>Data de emissão: ${esc(agora.toLocaleString('pt-BR'))} · Parametrização para sistema emissor de DF-e</p>
  </div>

  <div class="info-box">
    <strong>Emitente:</strong> ${esc(contexto.emitente?.cnpj || '—')} (Regime: ${esc(contexto.emitente?.regime || '—')}, UF: ${esc(contexto.emitente?.uf || '—')}) ·
    <strong>Operação:</strong> ${esc(contexto.operacao?.tipo || 'interna')} (${esc(contexto.operacao?.finalidade || 'comercialização')}) ·
    <strong>Ano Base Reforma:</strong> ${esc(contexto.operacao?.anoReforma || 2026)}
  </div>

  ${itens.map((item, idx) => {
    const campos = mapearCamposLegais(item, contexto);
    return `
    <div class="card">
      <div class="card-header">
        Item ${idx + 1}: ${esc(item.cProd || 'N/A')} — ${esc(item.xProd || 'Produto')}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 45%;">Campo de Parametrização</th>
            <th style="width: 25%;">Tag DF-e / XML</th>
            <th style="width: 30%;">Código / Parâmetro ERP</th>
          </tr>
        </thead>
        <tbody>
          ${campos.map(c => `
          <tr>
            <td><strong>${esc(c.campo)}</strong></td>
            <td class="mono" style="color: #718096; font-size: 0.85rem;">&lt;${esc(c.tagXml)}&gt;</td>
            <td class="mono">${esc(c.codigo)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
      ${item.instrucao ? `<div class="instrucao"><strong>Instrução ERP:</strong> ${esc(item.instrucao)}</div>` : ''}
    </div>
    `;
  }).join('')}
</body>
</html>`;
}

// ============================================================================
// 2. MODO DETALHADO (COM CITAÇÃO LEGAL COMPLETA: LEI, DISPOSITIVO, ARTIGO)
// ============================================================================

export function gerarRelatorioErpDetalhadoTxt(payload: ParametrosErpPayload, agora: Date = new Date()): string {
  const { contexto, itens } = payload;
  let txt = `================================================================================\n`;
  txt += `LAUDO TÉCNICO DE PARAMETRIZAÇÃO FISCAL DE ERP — MODO DETALHADO\n`;
  txt += `Fundamentação Jurídica Integral: Leis Complementares, Decretos, Convênios e NESH\n`;
  txt += `Contabilidade Portela (Desde 1970) · Data da Geração: ${agora.toLocaleString('pt-BR')}\n`;
  txt += `================================================================================\n\n`;

  txt += `I. IDENTIFICAÇÃO INSTITUCIONAL E DA OPERAÇÃO FISCAL\n`;
  txt += `- Empresa Emitente: ${contexto.emitente?.nome || 'Cliente'} (CNPJ: ${contexto.emitente?.cnpj || '—'} | IE: ${contexto.emitente?.ie || 'ISENTO'})\n`;
  txt += `- Município IBGE: ${contexto.emitente?.municipioIbge || '—'} | UF Origem: ${contexto.emitente?.uf || '—'}\n`;
  txt += `- Regime Tributário: ${contexto.emitente?.regime || '—'} (CRT ${contexto.emitente?.crt || '1'})\n`;
  txt += `- Destinatário: ${contexto.destinatario?.cnpjCpf || 'Consumidor'} | UF Destino: ${contexto.destinatario?.uf || '—'}\n`;
  txt += `- Natureza da Operação: ${contexto.operacao?.tipo || 'interna'} | Destinação: ${contexto.operacao?.finalidade || 'revenda'}\n`;
  txt += `- Modelo do Documento: ${contexto.operacao?.modelo || '55'} (NF-e) | Ano de Apuração: ${contexto.operacao?.anoReforma || 2026}\n\n`;

  txt += `II. MATRIZ DETALHADA DE CAMPOS COM CITAÇÃO LEGAL E FUNDAMENTAÇÃO\n\n`;

  itens.forEach((item, idx) => {
    txt += `================================================================================\n`;
    txt += `ITEM ${idx + 1}: ${item.cProd || 'N/A'} — ${item.xProd || 'Produto'}\n`;
    txt += `================================================================================\n\n`;

    const campos = mapearCamposLegais(item, contexto);
    campos.forEach((c, ci) => {
      txt += `[${ci + 1}] ${c.campo.toUpperCase()}\n`;
      txt += `    - Tag no XML do DF-e: <${c.tagXml}>\n`;
      txt += `    - Parâmetro / Código a Gravar no ERP: ${c.codigo}\n`;
      if (c.descricao) txt += `    - Descrição Oficial / Detalhe: ${c.descricao}\n`;
      txt += `    - Amparo Legal: ${c.normaLegal}\n`;
      txt += `    - Dispositivo Específico: ${c.dispositivo}\n`;
      txt += `    - Fundamento Pericial: ${c.fundamento}\n\n`;
    });

    if (item.instrucao) {
      txt += `PARECER TÉCNICO DE CADASTRO:\n${item.instrucao}\n\n`;
    }
  });

  txt += `================================================================================\n`;
  txt += `DECLARAÇÃO DE RESPONSABILIDADE TÉCNICA:\n`;
  txt += `A parametrização fiscal acima consubstancia a melhor subsunção jurídica entre os fatos\n`;
  txt += `econômicos declarados e as normas tributárias vigentes no Sistema Harmonizado e no novo\n`;
  txt += `modelo da Reforma Tributária do Consumo (EC nº 132/2023, LC nº 214/2025 e LC nº 227/2026).\n`;
  txt += `Contabilidade Portela (Desde 1970) — Tradição e Excelência Tributária.\n`;
  txt += `================================================================================\n`;
  return txt;
}

export function gerarRelatorioErpDetalhadoHtml(payload: ParametrosErpPayload, agora: Date = new Date()): string {
  const { contexto, itens } = payload;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Laudo Pericial de Parametrização Fiscal de ERP (Modo Detalhado)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1a202c; line-height: 1.6; background: #f7fafc; }
    .container { max-width: 960px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { text-align: center; border-bottom: 3px solid #2b6cb0; padding-bottom: 20px; margin-bottom: 25px; }
    .header h1 { margin: 0; font-size: 1.6rem; color: #1a365d; text-transform: uppercase; letter-spacing: 0.5px; }
    .header h2 { margin: 6px 0; font-size: 1.1rem; color: #4a5568; font-weight: 500; }
    .meta { font-size: 0.85rem; color: #718096; margin-top: 8px; }
    .section-title { font-size: 1.15rem; font-weight: 700; color: #2c5282; margin: 24px 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; background: #edf2f7; padding: 16px; border-radius: 6px; font-size: 0.9rem; }
    .info-item strong { color: #2d3748; }
    .item-box { border: 1px solid #cbd5e0; border-radius: 8px; margin-top: 24px; padding: 20px; background: #ffffff; }
    .item-header { font-size: 1.2rem; font-weight: 700; color: #1a365d; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 16px; }
    .campo-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 5px solid #3182ce; border-radius: 6px; padding: 14px 18px; margin-bottom: 16px; }
    .campo-card.reforma { border-left-color: #38a169; background: #f0fff4; }
    .campo-card.is { border-left-color: #d69e2e; background: #fffff0; }
    .campo-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .campo-nome { font-weight: 700; font-size: 1rem; color: #2d3748; }
    .campo-cod { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 1.1rem; font-weight: 700; color: #2b6cb0; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; }
    .campo-detalhe { font-size: 0.88rem; color: #4a5568; margin-bottom: 8px; }
    .legal-block { background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.06); border-radius: 4px; padding: 8px 12px; font-size: 0.83rem; margin-top: 8px; }
    .legal-title { font-weight: 600; color: #2c5282; margin-bottom: 2px; }
    .legal-ref { color: #742a2a; font-weight: 500; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Laudo Técnico de Parametrização Fiscal de ERP</h1>
      <h2>Contabilidade Portela (Desde 1970) · Consultoria Fiscal Pericial</h2>
      <div class="meta">Documento emitido em: ${esc(agora.toLocaleString('pt-BR'))} · Regime Legal Vigente & Reforma Tributária</div>
    </div>

    <div class="section-title">I. Identificação do Contribuinte e Contexto Operacional</div>
    <div class="info-grid">
      <div class="info-item"><strong>Empresa Emitente:</strong> ${esc(contexto.emitente?.nome || 'Cliente')}</div>
      <div class="info-item"><strong>CNPJ:</strong> ${esc(contexto.emitente?.cnpj || '—')}</div>
      <div class="info-item"><strong>Inscrição Estadual:</strong> ${esc(contexto.emitente?.ie || 'ISENTO')}</div>
      <div class="info-item"><strong>Regime Tributário:</strong> ${esc(contexto.emitente?.regime || '—')} (CRT ${esc(contexto.emitente?.crt || '1')})</div>
      <div class="info-item"><strong>UF Origem / Destino:</strong> ${esc(contexto.emitente?.uf || '—')} → ${esc(contexto.destinatario?.uf || '—')}</div>
      <div class="info-item"><strong>Operação / Finalidade:</strong> ${esc(contexto.operacao?.tipo || 'interna')} (${esc(contexto.operacao?.finalidade || 'comercialização')})</div>
      <div class="info-item"><strong>Modelo Documento:</strong> Modelo ${esc(contexto.operacao?.modelo || '55')} (NF-e)</div>
      <div class="info-item"><strong>Ano Base da Reforma:</strong> ${esc(contexto.operacao?.anoReforma || 2026)} (Fase de Transição)</div>
    </div>

    <div class="section-title">II. Matriz de Parametrização com Fundamentação Jurídica</div>
    ${itens.map((item, idx) => {
      const campos = mapearCamposLegais(item, contexto);
      return `
      <div class="item-box">
        <div class="item-header">Item ${idx + 1}: ${esc(item.cProd || 'N/A')} — ${esc(item.xProd || 'Produto')}</div>
        ${campos.map(c => `
          <div class="campo-card ${c.campo.includes('IBS') || c.campo.includes('cClassTrib') ? 'reforma' : c.campo.includes('Seletivo') ? 'is' : ''}">
            <div class="campo-top">
              <span class="campo-nome">${esc(c.campo)} <code style="font-size: 0.8rem; color: #718096;">&lt;${esc(c.tagXml)}&gt;</code></span>
              <span class="campo-cod">${esc(c.codigo)}</span>
            </div>
            ${c.descricao ? `<div class="campo-detalhe">${esc(c.descricao)}</div>` : ''}
            <div class="legal-block">
              <div class="legal-title">Fundamentação Legal e Citação do Dispositivo:</div>
              <div><strong>Norma:</strong> ${esc(c.normaLegal)}</div>
              <div><strong>Dispositivo:</strong> <span class="legal-ref">${esc(c.dispositivo)}</span></div>
              <div style="margin-top: 4px; color: #4a5568;"><strong>Justificativa Técnica:</strong> ${esc(c.fundamento)}</div>
            </div>
          </div>
        `).join('')}
        ${item.instrucao ? `<div style="background: #ebf8ff; border-left: 4px solid #3182ce; padding: 12px; border-radius: 4px; font-size: 0.9rem; margin-top: 14px;"><strong>Parecer do Auditor:</strong> ${esc(item.instrucao)}</div>` : ''}
      </div>
      `;
    }).join('')}

    <div class="footer">
      <p>Este relatório técnico foi gerado pelo Sistema de Classificação Fiscal NCM & Reforma Tributária da Contabilidade Portela.</p>
      <p>As fundamentações legais baseiam-se na LC 214/2025, LC 227/2026, Convênios CONFAZ e Resoluções Gecex vigentes.</p>
    </div>
  </div>
</body>
</html>`;
}
