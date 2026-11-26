import { NextResponse } from 'next/server';
import { z } from 'zod';
import { esc } from '@/lib/html';
import {
  formatarStatusReformaSaneamento,
  resolverRastreabilidadeSnapshot,
} from '@/lib/fiscal/saneamento-ncm';
import {
  getRtcMode,
  MENSAGEM_BLOQUEIO_HARDCODED,
} from '@/lib/integracoes/rfb-health';
import {
  PORTELA_COPYRIGHT,
  PORTELA_FOOTER_CSS,
  PORTELA_HEADER_CSS,
  PORTELA_VERSION,
  renderHeaderPortela,
} from '@/lib/relatorio-header';

function fmtMoeda(val: number | string | undefined | null): string {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? 0));
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(val: number | string | undefined | null, casas = 2): string {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? 0));
  if (isNaN(n)) return '0,00%';
  return `${n.toFixed(casas).replace('.', ',')}%`;
}

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
}).passthrough();

const empresaEntitySchema = z.object({
  id: z.string().optional().nullable(),
  razaoSocial: z.string().optional().nullable(),
  nomeFantasia: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  regime: z.string().optional().nullable(),
  cnaePrincipal: z.string().optional().nullable(),
  inscricaoEstadual: z.string().optional().nullable(),
}).passthrough().optional().nullable();

const nfeParteSchema = z.object({
  xNome: z.string().optional().nullable(),
  CNPJ: z.string().optional().nullable(),
  CPF: z.string().optional().nullable(),
  IE: z.string().optional().nullable(),
  enderEmit: z.object({ UF: z.string().optional().nullable() }).passthrough().optional().nullable(),
  enderDest: z.object({ UF: z.string().optional().nullable() }).passthrough().optional().nullable(),
}).passthrough().optional().nullable();

const relatorioPayloadSchema = z.object({
  format: z.enum(['html', 'txt']).optional().default('html'),
  parecerTecnicoXml: z.string().optional().nullable(),
  parecerConformidade: z.string().optional().nullable(),
  itens: z.array(relatorioItemSchema).optional().nullable(),
  itensAuditados: z.array(z.any()).optional().nullable(),
  totaisCpc16: z.any().optional().nullable(),
  cteFobResumo: z.any().optional().nullable(),
  resumoDifalEntrada: resumoDifalEntradaSchema,
  relatorioDifal: resumoDifalEntradaSchema,
  // Extensões Ciclo 6 (Sub-Etapas 19.5, 19.6 e 19.7)
  orquestracaoDag: z.any().optional().nullable(),
  auditoriaNfse: z.any().optional().nullable(),
  paridadeRfb: z.any().optional().nullable(),
  sha256: z.string().optional().nullable(),
  rastreabilidadeSnapshot: z.object({
    mode: z.string().optional().nullable(),
    updatedAt: z.string().optional().nullable(),
    snapshotSha256: z.string().optional().nullable(),
    normasVigentes: z.array(z.string()).optional().nullable(),
  }).passthrough().optional().nullable(),
  permitirSimulacaoHardcoded: z.boolean().optional().default(false),
  tituloDocumento: z.string().optional().nullable(),
  // Contexto de Empresa Ativa e NF-e
  empresaAtiva: empresaEntitySchema,
  empresa: empresaEntitySchema,
  nfe: z.object({
    emitente: nfeParteSchema,
    destinatario: nfeParteSchema,
  }).passthrough().optional().nullable(),
  regime: z.string().optional().nullable(),
  finalidade: z.string().optional().nullable(),
}).passthrough();

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

    const rtcStatus = await getRtcMode();
    const isRascunhoHardcoded = rtcStatus.mode === 'hardcoded' && Boolean(data.permitirSimulacaoHardcoded);
    if (rtcStatus.mode === 'hardcoded' && !data.permitirSimulacaoHardcoded) {
      return NextResponse.json(
        {
          error: MENSAGEM_BLOQUEIO_HARDCODED,
          codigo: 'RTC_HARDCODED_BLOQUEADO',
          rtcStatus,
        },
        { status: 503 }
      );
    }

    // Extrair dados do DAG, NFS-e e Paridade
    const dag = data.orquestracaoDag;
    const nfse = data.auditoriaNfse;
    const paridade = data.paridadeRfb || dag?.etapas?.rtc?.paridadeRfb;
    const sha256Calculado = data.sha256 || dag?.sha256Xml || nfse?.extracao?.sha256 || rtcStatus.snapshotSha256 || 'N/A';
    const rtcNormasArr = [
      rtcStatus.normasVigentes.ntNfe,
      rtcStatus.normasVigentes.ricmsPr,
      rtcStatus.normasVigentes.lcReforma,
    ];
    const rastreabilidadeSaneamento = resolverRastreabilidadeSnapshot(
      {
        mode: data.rastreabilidadeSnapshot?.mode || rtcStatus.mode,
        updatedAt: data.rastreabilidadeSnapshot?.updatedAt || rtcStatus.updatedAt || new Date().toISOString(),
        snapshotSha256: data.rastreabilidadeSnapshot?.snapshotSha256 || rtcStatus.snapshotSha256 || sha256Calculado,
        normasVigentes:
          Array.isArray(data.rastreabilidadeSnapshot?.normasVigentes) && data.rastreabilidadeSnapshot.normasVigentes.length > 0
            ? data.rastreabilidadeSnapshot.normasVigentes
            : rtcNormasArr,
        rascunhoNaoOficial: isRascunhoHardcoded,
      },
      sha256Calculado
    );
    const resumoDifal = data.resumoDifalEntrada || data.relatorioDifal;

    // Resolver empresa ativa / partes da NF-e / contexto operacional
    const empresaRaw = data.empresaAtiva || data.empresa;
    const nfeDest = data.nfe?.destinatario;
    const nfeEmit = data.nfe?.emitente;
    const dagDest = dag?.etapas?.extracao?.destinatario;
    const dagEmit = dag?.etapas?.extracao?.emitente;

    const empresaNome =
      empresaRaw?.razaoSocial ||
      empresaRaw?.nomeFantasia ||
      nfeDest?.xNome ||
      dagDest?.razaoSocial ||
      undefined;
    const empresaCnpj =
      empresaRaw?.cnpj ||
      nfeDest?.CNPJ ||
      nfeDest?.CPF ||
      dagDest?.cnpj ||
      undefined;
    const empresaUf =
      empresaRaw?.uf ||
      nfeDest?.enderDest?.UF ||
      dagDest?.uf ||
      undefined;
    const empresaRegime =
      empresaRaw?.regime ||
      data.regime ||
      dag?.perfilUtilizado?.regime ||
      undefined;
    const emitenteNome = nfeEmit?.xNome || dagEmit?.razaoSocial || undefined;
    const emitenteCnpj = nfeEmit?.CNPJ || nfeEmit?.CPF || dagEmit?.cnpj || undefined;
    const emitenteUf = nfeEmit?.enderEmit?.UF || dagEmit?.uf || undefined;
    const finalidadeOp = data.finalidade || undefined;

    // ------------------------------------------------------------------------
    // GERAÇÃO DO LAUDO EM FORMATO HTML
    // ------------------------------------------------------------------------
    if (format === 'html') {
      const tituloHeader = data.tituloDocumento || (
        nfse
          ? 'Laudo Técnico Pericial de NFS-e / DPS Nacional'
          : dag
          ? 'Laudo Pericial Unificado — Orquestrador Fiscal DAG & RTC'
          : 'Laudo Técnico de Auditoria Fiscal e Tributária'
      );

      const subtituloBase = nfse
        ? 'Auditoria de Tomador de Serviços — Reforma Tributária (LC 214/2025) e Retenções Federais'
        : dag
        ? 'Auditoria Canônica em 6 Etapas: RFB RTC, ICMS/PR, Créditos 3 Camadas e 4 Regimes'
        : 'Auditoria de Entrada de Documento Fiscal Eletrônico (DF-e)';
      const subtituloHeader = isRascunhoHardcoded
        ? `RASCUNHO NÃO OFICIAL (MODO HARDCODED) — ${subtituloBase}`
        : subtituloBase;

      const docRefHeader = nfse
        ? `NFS-e / DPS: ${esc(nfse.extracao?.identificacao?.nNFSe || nfse.extracao?.identificacao?.nDPS || 'Sem número')}`
        : dag
        ? `NF-e Chave: ${esc((dag.chaveAcesso || '').substring(0, 22))}... (${dag.etapas?.extracao?.totalItens ?? 0} itens)`
        : data.itens && data.itens.length
        ? `${data.itens.length} itens auditados`
        : undefined;

      const headerPortelaHtml = renderHeaderPortela({
        titulo: tituloHeader,
        subtitulo: subtituloHeader,
        dataHora: dataHoraFormatada,
        documentoRef: docRefHeader,
        empresaNome,
        empresaCnpj,
        empresaRegime,
      });

      let empresaSectionHtml = '';
      if (!nfse && (empresaNome || empresaCnpj || emitenteNome || emitenteCnpj || empresaRegime || finalidadeOp)) {
        empresaSectionHtml = `
    <div class="section empresa-section">
      <h2>Identificação da Empresa Ativa e Operação</h2>
      <div class="grid-container">
        ${(empresaNome || empresaCnpj || empresaUf || empresaRegime) ? `
        <div class="tax-block">
          <div class="tax-title">Empresa Ativa / Adquirente</div>
          ${empresaNome ? `<div class="tax-row"><span class="tax-label">Razão Social:</span> <span class="tax-value">${esc(empresaNome)}</span></div>` : ''}
          ${empresaCnpj ? `<div class="tax-row"><span class="tax-label">CNPJ/CPF:</span> <span class="tax-value">${esc(empresaCnpj)}</span></div>` : ''}
          ${empresaUf ? `<div class="tax-row"><span class="tax-label">UF:</span> <span class="tax-value">${esc(empresaUf)}</span></div>` : ''}
          ${empresaRegime ? `<div class="tax-row"><span class="tax-label">Regime Tributário:</span> <span class="tax-value">${esc(empresaRegime)}</span></div>` : ''}
        </div>` : ''}
        ${(emitenteNome || emitenteCnpj || emitenteUf || finalidadeOp) ? `
        <div class="tax-block">
          <div class="tax-title">Fornecedor / Contexto da Operação</div>
          ${emitenteNome ? `<div class="tax-row"><span class="tax-label">Emitente:</span> <span class="tax-value">${esc(emitenteNome)}</span></div>` : ''}
          ${emitenteCnpj ? `<div class="tax-row"><span class="tax-label">CNPJ/CPF Emitente:</span> <span class="tax-value">${esc(emitenteCnpj)}</span></div>` : ''}
          ${emitenteUf ? `<div class="tax-row"><span class="tax-label">UF Origem:</span> <span class="tax-value">${esc(emitenteUf)}</span></div>` : ''}
          ${finalidadeOp ? `<div class="tax-row"><span class="tax-label">Finalidade:</span> <span class="tax-value">${esc(finalidadeOp)}</span></div>` : ''}
        </div>` : ''}
      </div>
    </div>`;
      }

      // 1. Bloco de Parecer Técnico e Parecer de Conformidade
      let pareceresHtml = '';
      if (data.parecerTecnicoXml) {
        pareceresHtml += `
    <div class="section parecer-tecnico">
      <h2>Parecer Técnico do Documento</h2>
      <p>${esc(data.parecerTecnicoXml)}</p>
    </div>`;
      }
      if (data.parecerConformidade) {
        pareceresHtml += `
    <div class="section parecer-conformidade">
      <h2>Parecer Breve de Conformidade e Créditos</h2>
      <p>${esc(data.parecerConformidade)}</p>
    </div>`;
      }

      // 2. Bloco da Auditoria NFS-e / DPS Nacional (se presente)
      let nfseHtml = '';
      if (nfse && nfse.extracao) {
        const ext = nfse.extracao;
        const ident = ext.identificacao || {};
        const prest = ext.prestador || {};
        const tom = ext.tomador || {};
        const serv = ext.servico || {};
        const val = ext.valores || {};
        const ref = ext.reformaTributaria;
        const cred = nfse.creditosTomador;
        const conc = nfse.conciliacaoRtc;

        const alertasRows = (nfse.alertas || []).map((a: any) => {
          const badgeClass = a.severidade === 'CRITICO' ? 'badge-critico' : a.severidade === 'ATENCAO' ? 'badge-atencao' : 'badge-info';
          return `
          <div class="alerta-item ${badgeClass}">
            <div class="alerta-head">
              <span class="alerta-badge">[${esc(a.severidade)}]</span>
              <strong>${esc(a.titulo || a.codigo)}</strong>
            </div>
            <div class="alerta-detalhe">${esc(a.detalhe)}</div>
            ${a.baseLegal ? `<div class="alerta-base"><b>Fundamentação:</b> ${esc(a.baseLegal)}</div>` : ''}
          </div>`;
        }).join('');

        const cibHtml = ref?.cib ? `
        <div class="cib-highlight">
          <span class="cib-title">🏢 Cadastro Imobiliário Brasileiro (CIB) — Art. 265 da LC nº 214/2025</span>
          <div class="cib-val">CIB: <b>${esc(ref.cib)}</b> ${ref.inscImobFisc ? `| Inscrição Imobiliária Municipal: <b>${esc(ref.inscImobFisc)}</b>` : ''}</div>
          ${ref.gLocacao?.nContrato ? `<div>Contrato de Locação Vinculado: <b>${esc(ref.gLocacao.nContrato)}</b></div>` : ''}
        </div>` : '';

        const conciliacaoHtml = conc?.executada ? `
        <div class="conciliacao-box">
          <strong>Conciliação Oficial RFB RTC (NFS-e):</strong> ${esc(conc.origem)} |
          IBS Oficial: <b>${fmtMoeda(conc.vIbsOficial)}</b> (XML: ${fmtMoeda(conc.vIbsXml)}) |
          CBS Oficial: <b>${fmtMoeda(conc.vCbsOficial)}</b> (XML: ${fmtMoeda(conc.vCbsXml)})
          ${conc.divergenciaCentavos ? '<span class="tag-divergente">⚠️ Divergência de Centavos Detectada</span>' : '<span class="tag-conforme">✓ Conforme</span>'}
        </div>` : '';

        nfseHtml = `
    <div class="section nfse-section">
      <h2>Auditoria Pericial de NFS-e / DPS Nacional (Padrão Nacional & RTC)</h2>
      
      <div class="grid-container" style="margin-bottom: 16px;">
        <div class="tax-block">
          <div class="tax-title">Identificação do DF-e</div>
          <div class="tax-row"><span class="tax-label">Documento:</span> <span class="tax-value">${esc(ext.tipoDocumento || 'NFS-e')}</span></div>
          <div class="tax-row"><span class="tax-label">Número:</span> <span class="tax-value">${esc(ident.nNFSe || ident.nDPS || 'S/N')} (Série ${esc(ident.serie || '1')})</span></div>
          <div class="tax-row"><span class="tax-label">Emissão / Competência:</span> <span class="tax-value">${esc(ident.dhEmi || '')} / ${esc(ident.dCompet || '')}</span></div>
          <div class="tax-row"><span class="tax-label">Chave NFS-e:</span> <span class="tax-value monospace-sm">${esc(ident.chNFSe || ident.idDps || 'N/A')}</span></div>
        </div>

        <div class="tax-block">
          <div class="tax-title">Prestador do Serviço</div>
          <div class="tax-row"><span class="tax-label">CNPJ/CPF:</span> <span class="tax-value">${esc(prest.cnpj || prest.cpf || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Razão Social:</span> <span class="tax-value">${esc(prest.xNome || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Município:</span> <span class="tax-value">${esc(prest.endereco?.xMun || prest.endereco?.cMun || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Simples Nacional:</span> <span class="tax-value">${prest.optanteSimplesNacional ? 'Optante' : 'Regime Geral'}</span></div>
        </div>

        <div class="tax-block">
          <div class="tax-title">Tomador do Serviço (Adquirente)</div>
          <div class="tax-row"><span class="tax-label">CNPJ/CPF:</span> <span class="tax-value">${esc(tom.cnpj || tom.cpf || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Razão Social:</span> <span class="tax-value">${esc(tom.xNome || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Município:</span> <span class="tax-value">${esc(tom.endereco?.xMun || tom.endereco?.cMun || 'N/A')}</span></div>
          <div class="tax-row"><span class="tax-label">Logradouro:</span> <span class="tax-value">${esc(tom.endereco?.xLgr || 'Não Informado')}</span></div>
        </div>
      </div>

      <div class="servico-box">
        <strong>Serviço:</strong> [${esc(serv.cTribNac || 'S/C')}] ${serv.cNBS ? `(NBS: ${esc(serv.cNBS)})` : ''} — ${esc(serv.xDescServ || 'Sem descrição')}
        <div style="margin-top: 6px;"><b>Valor dos Serviços:</b> ${fmtMoeda(val.vServ)} | <b>Valor Líquido:</b> ${fmtMoeda(val.vLiq)}</div>
      </div>

      ${cibHtml}

      <div class="retencoes-box">
        <div class="retencoes-title">Quadro de Retenções Tributárias na Fonte</div>
        <div class="retencoes-grid">
          <div>IRRF: <b>${fmtMoeda(val.vRetIRRF)}</b></div>
          <div>CSLL: <b>${fmtMoeda(val.vRetCSLL)}</b></div>
          <div>PIS Retido: <b>${fmtMoeda(val.vPIS)}</b></div>
          <div>COFINS Retido: <b>${fmtMoeda(val.vCOFINS)}</b></div>
          <div>ISSQN Retido: <b>${fmtMoeda(val.vISSQN)}</b></div>
          <div style="color: #b91c1c; font-weight: bold;">Total Retido: ${fmtMoeda(val.vTotalRet ?? ((val.vRetIRRF || 0) + (val.vRetCSLL || 0) + (val.vPIS || 0) + (val.vCOFINS || 0) + (val.vISSQN || 0)))}</div>
        </div>
      </div>

      <div class="reforma-box">
        <div class="retencoes-title">Reforma Tributária (IBS / CBS - NT 004 & LC nº 214/2025)</div>
        <div class="reforma-grid">
          <div>IBS Estadual: <b>${fmtMoeda(ref?.vIBSUF)}</b> (${fmtPct(ref?.pIBSUF)})</div>
          <div>IBS Municipal: <b>${fmtMoeda(ref?.vIBSMun)}</b> (${fmtPct(ref?.pIBSMun)})</div>
          <div>CBS: <b>${fmtMoeda(ref?.vCBS)}</b> (${fmtPct(ref?.pCBS)})</div>
          <div style="font-weight: bold; color: #047857;">Total IBS/CBS: ${fmtMoeda((ref?.vIBS || 0) + (ref?.vCBS || 0))}</div>
        </div>
        ${cred ? `
        <div class="credito-nfse-box">
          <p><b>Direito a Crédito do Tomador:</b></p>
          <p>• PIS/COFINS (Lucro Real): <b>${cred.pisCofinsLucroReal.admitido ? `Admitido (${fmtMoeda(cred.pisCofinsLucroReal.valorPis + cred.pisCofinsLucroReal.valorCofins)})` : 'Não admitido'}</b> — ${esc(cred.pisCofinsLucroReal.justificativa)}</p>
          <p>• IBS/CBS (Reforma): <b>${cred.ibsCbsReforma.admitido ? `Admitido (${fmtMoeda(cred.ibsCbsReforma.valorIbs + cred.ibsCbsReforma.valorCbs)})` : 'Vedado'}</b> [Status: ${esc(cred.ibsCbsReforma.statusExtincao)}] — ${esc(cred.ibsCbsReforma.justificativa)}</p>
        </div>` : ''}
      </div>

      ${conciliacaoHtml}

      ${alertasRows ? `
      <div class="alertas-container">
        <h3>Diagnóstico Pericial e Alertas de Conformidade</h3>
        ${alertasRows}
      </div>` : ''}
    </div>`;
      }

      // 3. Bloco do Orquestrador Fiscal DAG (se presente)
      let dagHtml = '';
      if (dag && dag.etapas) {
        const etapas = dag.etapas;
        const rtc = etapas.rtc || {};
        const creditos = etapas.creditos || {};
        const camadas = creditos.camadas || {};
        const custos = etapas.custosEPrecificacao || {};
        const comparativo = custos.comparativoRegimes || {};

        const validacaoXmlStatus = rtc.validacaoXml?.status || 'NAO_APLICAVEL';
        const validacaoBadge = validacaoXmlStatus === 'VALIDO'
          ? '<span class="tag-conforme">✓ XML Válido (/xml/validate RFB)</span>'
          : validacaoXmlStatus === 'INVALIDO'
          ? '<span class="tag-divergente">✗ XML Inválido nos Schemas RFB</span>'
          : `<span class="tag-alerta">Status: ${esc(validacaoXmlStatus)}</span>`;

        // Tabela Comparativa de Créditos em 3 Camadas
        const dXml = camadas.totalDestacadoXml || {};
        const dReg = camadas.totalCreditoAdmitidoRegra || {};
        const dEfe = camadas.totalCreditoEfetivadoCusto || {};

        const tabelaCamadasCredito = `
        <table class="tabela-dag">
          <thead>
            <tr>
              <th>Tributo</th>
              <th style="text-align:right">1. Destacado no XML</th>
              <th style="text-align:right">2. Admitido por Regra</th>
              <th style="text-align:right">3. Efetivado no Custo</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>ICMS / ICMS-ST</td><td style="text-align:right">${fmtMoeda(dXml.icms)}</td><td style="text-align:right">${fmtMoeda(dReg.icms)}</td><td style="text-align:right; font-weight:bold; color:#047857">${fmtMoeda(dEfe.icms)}</td></tr>
            <tr><td>PIS</td><td style="text-align:right">${fmtMoeda(dXml.pis)}</td><td style="text-align:right">${fmtMoeda(dReg.pis)}</td><td style="text-align:right; font-weight:bold; color:#047857">${fmtMoeda(dEfe.pis)}</td></tr>
            <tr><td>COFINS</td><td style="text-align:right">${fmtMoeda(dXml.cofins)}</td><td style="text-align:right">${fmtMoeda(dReg.cofins)}</td><td style="text-align:right; font-weight:bold; color:#047857">${fmtMoeda(dEfe.cofins)}</td></tr>
            <tr><td>IPI</td><td style="text-align:right">${fmtMoeda(dXml.ipi)}</td><td style="text-align:right">${fmtMoeda(dReg.ipi)}</td><td style="text-align:right; font-weight:bold; color:#047857">${fmtMoeda(dEfe.ipi)}</td></tr>
            <tr><td>IBS (Reforma)</td><td style="text-align:right">${fmtMoeda(dXml.ibs)}</td><td style="text-align:right">${fmtMoeda(dReg.ibs)}</td><td style="text-align:right; font-weight:bold; color:#047857">${fmtMoeda(dEfe.ibs)}</td></tr>
            <tr><td>CBS (Reforma)</td><td style="text-align:right">${fmtMoeda(dXml.cbs)}</td><td style="text-align:right">${fmtMoeda(dReg.cbs)}</td><td style="text-align:right; font-weight:bold; color:#047857">${fmtMoeda(dEfe.cbs)}</td></tr>
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td>TOTAL DE CRÉDITOS</td>
              <td style="text-align:right">${fmtMoeda(dXml.total)}</td>
              <td style="text-align:right">${fmtMoeda(dReg.total)}</td>
              <td style="text-align:right; color:#047857">${fmtMoeda(dEfe.total)}</td>
            </tr>
          </tbody>
        </table>`;

        const retidoSplit = creditos.retidoAguardandoExtincaoIbsCbs?.total > 0
          ? `<div class="alerta-box-difal" style="margin-top: 10px;">
              ⚠️ <b>Atenção Split Payment / Art. 47 da LC 214/2025:</b> ${fmtMoeda(creditos.retidoAguardandoExtincaoIbsCbs.total)} em créditos de IBS/CBS foram retidos aguardando liquidação financeira pelo adquirente.
            </div>`
          : '';

        // Tabela do Comparativo dos 4 Regimes
        const regimesKeys: Array<'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL'> = [
          'SIMPLES_TRADICIONAL',
          'SIMPLES_HIBRIDO_2027',
          'LUCRO_PRESUMIDO',
          'LUCRO_REAL',
        ];

        const comparativoRows = regimesKeys.map(key => {
          const c = comparativo[key];
          if (!c) return '';
          const isMelhor = c.melhorCenario;
          const rowStyle = isMelhor ? 'background-color: #ecfdf5; font-weight: 600;' : '';
          return `
          <tr style="${rowStyle}">
            <td>
              ${esc(c.nomeExibicao || key)}
              ${isMelhor ? ' <span class="tag-conforme">★ Melhor Cenário</span>' : ''}
            </td>
            <td style="text-align:right">${fmtMoeda(c.cmvLiquidoTotal)}</td>
            <td style="text-align:right; color:#047857">${fmtMoeda(c.creditosAproveitados)}</td>
            <td style="text-align:right">${fmtMoeda(c.precoVendaSugerido)}</td>
            <td style="text-align:right">${fmtPct(c.margemLiquidaPct)}</td>
            <td style="text-align:right">${fmtPct(c.cargaTributariaEfetivaPct)}</td>
          </tr>`;
        }).join('');

        const melhorCenarioObj = Object.values(comparativo).find((c: any) => c.melhorCenario) as any;
        const parecerRegimesHtml = melhorCenarioObj ? `
        <div class="parecer-regime-box">
          <strong>Recomendação de Enquadramento Tributário:</strong> Enquadramento ótimo em <b>${esc(melhorCenarioObj.nomeExibicao)}</b>.
          <p style="margin-top: 4px; margin-bottom: 0;">${esc(melhorCenarioObj.justificativa)}</p>
        </div>` : '';

        dagHtml = `
    <div class="section dag-section">
      <h2>Orquestrador Fiscal DAG — Execução Canônica em 6 Etapas</h2>
      <div class="dag-meta">
        <div>Chave NF-e: <span class="monospace-sm">${esc(dag.chaveAcesso || 'N/A')}</span></div>
        <div>Emissão: <b>${esc(dag.dataEmissao || 'N/A')}</b> | Itens: <b>${dag.etapas?.extracao?.totalItens ?? 0}</b> | Status Extinção RTC: <b>${esc(creditos.statusExtincaoFornecedor || 'N/A')}</b></div>
      </div>

      <div class="rtc-status-strip">
        <div>Motor RTC: <b>${esc(rtc.motorRtcUtilizado || 'N/A')}</b> (${esc(rtc.origemCalculoRtc || 'N/A')})</div>
        <div>Latência: <b>${rtc.duracaoRtcMs ?? 0}ms</b></div>
        <div>${validacaoBadge}</div>
      </div>

      <div class="metricas-rtc-grid">
        <div class="metrica-rtc-card"><div class="m-label">IBS Estadual</div><div class="m-val">${fmtMoeda(rtc.totaisRtc?.vIbsUf)}</div></div>
        <div class="metrica-rtc-card"><div class="m-label">IBS Municipal</div><div class="m-val">${fmtMoeda(rtc.totaisRtc?.vIbsMun)}</div></div>
        <div class="metrica-rtc-card"><div class="m-label">CBS Federal</div><div class="m-val">${fmtMoeda(rtc.totaisRtc?.vCbs)}</div></div>
        <div class="metrica-rtc-card"><div class="m-label">Imposto Seletivo</div><div class="m-val">${fmtMoeda(rtc.totaisRtc?.vIs)}</div></div>
        <div class="metrica-rtc-card highlight"><div class="m-label">Total IVA Dual</div><div class="m-val">${fmtMoeda(rtc.totaisRtc?.vIvaTotal)}</div></div>
      </div>

      <h3>Classificação Tripartida de Créditos Tributários na Entrada</h3>
      ${tabelaCamadasCredito}
      ${retidoSplit}

      <h3 style="margin-top: 24px;">Comparativo e Simulação dos 4 Regimes Tributários</h3>
      <table class="tabela-dag">
        <thead>
          <tr>
            <th>Regime Tributário</th>
            <th style="text-align:right">CMV Líquido</th>
            <th style="text-align:right">Créditos</th>
            <th style="text-align:right">Preço Sugerido</th>
            <th style="text-align:right">Margem Líq. %</th>
            <th style="text-align:right">Carga Efet. %</th>
          </tr>
        </thead>
        <tbody>
          ${comparativoRows}
        </tbody>
      </table>
      ${parecerRegimesHtml}
    </div>`;
      }

      // 4. Bloco de Diagnóstico de Paridade RFB vs. Motor Local (se fornecido)
      let paridadeHtml = '';
      if (paridade) {
        const isTotal = paridade.paridadeTotal;
        const totalItens = paridade.qtdItensComparados ?? 0;
        const qtdDiv = paridade.qtdDivergencias ?? 0;
        const desvio = paridade.maiorDesvioAbsoluto || '0,00';
        const meta = paridade.metadadosVersao || {};

        const divergenciasRows = (paridade.divergencias || []).map((div: any) => `
        <tr>
          <td>${esc(String(div.numeroItem))}</td>
          <td><b>${esc(div.campo)}</b></td>
          <td style="text-align:right">${fmtMoeda(div.valorOficialRfb)}</td>
          <td style="text-align:right">${fmtMoeda(div.valorLocal)}</td>
          <td style="text-align:right; font-weight:bold; color:#b91c1c;">${fmtMoeda(div.diferencaAbsoluta)}</td>
          <td><span class="badge-atencao">${esc(div.causaProvavel)}</span></td>
        </tr>`).join('');

        paridadeHtml = `
    <div class="section paridade-section">
      <h2>Auditoria e Diagnóstico de Paridade: Motor Oficial RFB vs. Motor Local Portela</h2>
      <div class="paridade-strip ${isTotal ? 'paridade-ok' : 'paridade-alerta'}">
        <div>Status: <b>${isTotal ? '✓ Paridade Total (Zero Divergência)' : `⚠️ Divergências Detectadas (${qtdDiv})`}</b></div>
        <div>Itens Auditados: <b>${totalItens}</b> | Maior Desvio: <b>R$ ${esc(desvio)}</b></div>
        <div style="font-size: 0.8rem; color: #64748b;">RFB App: ${esc(meta.versaoAplicacaoRfb || 'v1.0')} · DB: ${esc(meta.versaoBaseDadosRfb || '2026.1')} · Local: ${esc(meta.motorLocalVersao || PORTELA_VERSION)}</div>
      </div>
      ${divergenciasRows ? `
      <table class="tabela-dag" style="margin-top: 14px;">
        <thead>
          <tr>
            <th>Item</th>
            <th>Campo Auditado</th>
            <th style="text-align:right">Oficial RFB</th>
            <th style="text-align:right">Motor Local</th>
            <th style="text-align:right">Diferença</th>
            <th>Causa Provável</th>
          </tr>
        </thead>
        <tbody>
          ${divergenciasRows}
        </tbody>
      </table>` : ''}
    </div>`;
      }

      // 5. Bloco DIFAL / FECOP / Antecipação PR (legado enriquecido)
      let difalHtml = '';
      if (resumoDifal) {
        const totalDifalStr = fmtMoeda(resumoDifal.totalDebitoDifal);
        const totalFecopStr = fmtMoeda(resumoDifal.totalDebitoFecop);
        const totalGeralStr = fmtMoeda(resumoDifal.totalGeralRecolher);
        const totalAntec16Str = fmtMoeda(resumoDifal.totalAntecipacaoArt16);
        const guiasStr = esc(resumoDifal.guiasNecessarias?.join(', ') || 'Sem guias exigidas');
        const prazoStr = esc(resumoDifal.prazoPrincipal || 'Sem prazo definido');
        const obriStr = esc(resumoDifal.obrigacoesAcessorias?.join('; ') || 'Nenhuma');

        const alertasHtml = resumoDifal.alertasConsolidados && resumoDifal.alertasConsolidados.length > 0
          ? `<div class="alerta-box-difal"><strong>Alertas de Auditoria:</strong><ul>${resumoDifal.alertasConsolidados.map((a: string) => `<li>${esc(a)}</li>`).join('')}</ul></div>`
          : '';

        const itensDifalRows = (data.itens || [])
          .filter(it => it.diagnosticoDifal)
          .map((it, idx) => {
            const d = it.diagnosticoDifal!;
            return `<tr>
              <td>${idx + 1} - ${esc(it.xProd || it.cProd || 'Item')}</td>
              <td>${esc(it.destinacao || 'Padrão')}</td>
              <td>${esc(d.modalidade || 'N/A')}</td>
              <td style="text-align:right">${fmtMoeda(d.baseCalculoOperacao)}</td>
              <td style="text-align:right">${fmtMoeda(d.baseCalculoDifal)}</td>
              <td style="text-align:right">${fmtMoeda(d.valorDebitoDifal)}</td>
              <td style="text-align:right">${fmtMoeda(d.valorDebitoFecop)}</td>
              <td style="text-align:right; font-weight:bold">${fmtMoeda(d.valorTotalDebito)}</td>
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
          <div class="metric-title">FECOP 2% (Art. 14-A Lei 11.580/96)</div>
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

      // 6. Itens de Parametrização de ERP (se presentes)
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
        : '';

      const secaoItensHtml = itensHtml ? `
      <h2>Parametrização de ERP - Detalhamento de Itens</h2>
      ${itensHtml}` : '';

      // 6b. Bloco de Segregação de Custos CPC 16 (R1) e Rateio CT-e FOB por Item
      const itensAudLista = Array.isArray(data.itensAuditados) ? data.itensAuditados : [];
      const cteResumo = data.cteFobResumo as any;
      const totaisCpc = data.totaisCpc16 as any;
      const cpc16Html = itensAudLista.length > 0 ? `
      <div class="section">
        <h2>Segregação de Custos de Entrada (CPC 16 R1) e Rateio CT-e FOB</h2>
        ${cteResumo ? `<p style="font-size:0.86rem; margin-bottom:10px;"><strong>CT-e FOB (Mod. 57):</strong> Nº ${esc(String(cteResumo.numero || 's/n'))} | Chave <span class="monospace-sm">${esc(String(cteResumo.chaveAcesso || 'N/A'))}</span> | Prestação: <b>${fmtMoeda(cteResumo.vTPrest)}</b> | Status Rateio: <b>${cteResumo.aplicado ? 'Aplicado ao Custo' : esc(String(cteResumo.motivoBloqueio || 'Bloqueado'))}</b></p>` : ''}
        <table class="tabela-dag">
          <thead>
            <tr>
              <th>Item / Produto</th>
              <th>NCM / Destinação</th>
              <th style="text-align:right">vProd Líq.</th>
              <th style="text-align:right">Frete NF-e</th>
              <th style="text-align:right">Frete CT-e FOB</th>
              <th style="text-align:right">Trib. Não Recup.</th>
              <th style="text-align:right">Créditos Recup.</th>
              <th style="text-align:right">CMV Líq. Unit.</th>
            </tr>
          </thead>
          <tbody>
            ${itensAudLista.map((aud: any) => {
              const cp = aud?.custoCpc16 || {};
              const freteNfe = Number(cp.freteNfe || 0) + Number(cp.seguroNfe || 0) + Number(cp.outrasDespesasNfe || 0);
              return `
              <tr>
                <td><strong>${esc(String(aud?.cProd || 'S/N'))}</strong> — ${esc(String(aud?.xProd || 'Produto'))}</td>
                <td>${esc(String(aud?.ncm || '—'))} · ${esc(String(aud?.destinacaoExplicita || 'Pendente'))}</td>
                <td style="text-align:right">${fmtMoeda(cp.valorProdutoLiquido)}</td>
                <td style="text-align:right">${fmtMoeda(freteNfe)}</td>
                <td style="text-align:right">${fmtMoeda(cp.freteCteFob)}</td>
                <td style="text-align:right; color:#b91c1c;">+${fmtMoeda(cp.tributosNaoRecuperaveis?.total)}</td>
                <td style="text-align:right; color:#15803d;">-${fmtMoeda(cp.creditosRecuperaveis?.total)}</td>
                <td style="text-align:right; font-weight:700;">${fmtMoeda(cp.cmvLiquidoUnitario)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${totaisCpc ? `<p style="font-size:0.86rem; margin-top:10px;"><strong>Totais Consolidados:</strong> Produtos ${fmtMoeda(totaisCpc.valorProdutosBruto)} | Frete CT-e FOB ${fmtMoeda(totaisCpc.freteCteFobTotal)} | Trib. Não Recup. +${fmtMoeda(totaisCpc.tributosNaoRecuperaveisTotal)} | Créditos -${fmtMoeda(totaisCpc.creditosRecuperaveisTotal)} | <strong>CMV Líquido Total: ${fmtMoeda(totaisCpc.cmvLiquidoTotal)}</strong></p>` : ''}
      </div>` : '';

      // 6c. Bloco Divergências xProd × NCM & Saneamento Dual-Track
      const itensSaneamento = itensAudLista.filter(
        (aud: any) =>
          aud?.saneamentoNcm &&
          (aud.saneamentoNcm.overrideAtivo || aud.saneamentoNcm.aderencia?.statusAderencia !== 'ADERENTE')
      );
      const saneamentoHtml = itensSaneamento.length > 0 ? `
      <div class="section" style="background-color:#fffbeb; border:1px solid #fcd34d; border-left:4px solid #d97706;">
        <h2>Divergências de Classificação &amp; Saneamento NCM (Entrada XML × Saída ERP)</h2>
        <div style="margin-bottom:10px; padding:8px 10px; background:#fef3c7; border:1px solid #f59e0b; border-radius:4px; font-size:0.78rem; color:#78350f;">
          <div><strong>Rastreabilidade Snapshot:</strong> <code>mode=${esc(rastreabilidadeSaneamento.mode)}</code> &middot; <strong>snapshotSha256:</strong> <span class="monospace-sm">${esc(rastreabilidadeSaneamento.snapshotSha256)}</span></div>
          <div style="margin-top:3px;"><strong>normasVigentes:</strong> ${esc(rastreabilidadeSaneamento.normasVigentes.join(' | '))}</div>
        </div>
        <table class="tabela-dag">
          <thead>
            <tr>
              <th>Item / Produto (xProd)</th>
              <th>Status &amp; Score</th>
              <th>NCM XML (Entrada)</th>
              <th>NCM Saneado (Saída)</th>
              <th>Impacto Antes × Depois</th>
              <th>Justificativa &amp; Orientação CC-e</th>
            </tr>
          </thead>
          <tbody>
            ${itensSaneamento.map((aud: any) => {
              const san = aud.saneamentoNcm;
              const ad = san.aderencia || {};
              const imp = san.impactoAntesDepois;
              const reformaStatusStr = imp
                ? `LC 214: ${formatarStatusReformaSaneamento(imp.antes).rotulo} → ${formatarStatusReformaSaneamento(imp.depois).rotulo}`
                : aud.tributacaoReforma
                  ? `LC 214: ${formatarStatusReformaSaneamento(aud.tributacaoReforma).rotulo}`
                  : '';
              const impactoStr = imp
                ? `Δ ICMS PR ${imp.deltaAliqIcmsPrPct >= 0 ? '+' : ''}${imp.deltaAliqIcmsPrPct}% | Δ DIFAL ${fmtMoeda(imp.deltaDifalTotal)} | Δ CMV Unit. ${fmtMoeda(imp.deltaCmvUnitario)}${reformaStatusStr ? ` | ${reformaStatusStr}` : ''}`
                : `Simulação pendente${reformaStatusStr ? ` | ${reformaStatusStr}` : ''}`;
              const orig = aud.ncmEscrituradoEntrada || aud.ncm || '—';
              const saida = san.overrideAtivo && san.ncmSaneadoSaida ? san.ncmSaneadoSaida : 'Não aplicado';
              return `
              <tr>
                <td><strong>${esc(String(aud.cProd || 'S/N'))}</strong> — ${esc(String(aud.xProd || 'Produto'))}</td>
                <td>${esc(String(ad.statusAderencia || 'REQUER_PERICIA'))} (${esc(String(ad.scoreAderencia ?? 0))}%)</td>
                <td class="monospace-sm">${esc(String(orig))}</td>
                <td class="monospace-sm"><strong>${esc(String(saida))}</strong></td>
                <td>${esc(impactoStr)}</td>
                <td><div>${esc(String(san.justificativaPericial || ad.motivos?.[0] || ''))}</div><div style="font-size:0.75rem; color:#78350f; margin-top:4px;">${esc(String(san.orientacaoOperacional || ''))}</div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '';

      // 7. Rodapé Técnico de Governança Pericial
      const rodapeTecnicoHtml = `
      <div class="rodape-tecnico">
        ${isRascunhoHardcoded ? '<div style="margin-bottom:8px; padding:6px 10px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-weight:700; border-radius:4px;">⚠️ RASCUNHO NÃO OFICIAL — Gerado em modo hardcoded (snapshot oficial RFB/Reforma ausente).</div>' : ''}
        <div class="rodape-linha">
          <div><b>Emissão:</b> ${esc(dataHoraFormatada)}</div>
          <div><b>Plataforma:</b> MargemReal Portela <span class="tag-versao">${esc(PORTELA_VERSION)}</span></div>
          <div><b>Integridade SHA-256:</b> <span class="monospace-sm">${esc(sha256Calculado)}</span></div>
        </div>
        <div class="rodape-motores" style="background:#f8fafc; padding:6px 8px; border:1px solid #e2e8f0; border-radius:4px;">
          <b>Rastreabilidade Snapshot:</b> <code>Modo=${esc(rastreabilidadeSaneamento.mode)}</code> | <b>Atualizado em:</b> ${esc(rastreabilidadeSaneamento.updatedAt || dataHoraFormatada)} | <b>Hash SHA-256:</b> <span class="monospace-sm">${esc(rastreabilidadeSaneamento.snapshotSha256)}</span><br/>
          <b>Normas Vigentes:</b> ${esc(rastreabilidadeSaneamento.normasVigentes.join(' | '))}
        </div>
        <div class="rodape-motores">
          <b>Motores Integrados:</b> RFB RTC Regime Regular v1.0 | RFB RTC Simples Nacional v1.0 | Gerador DANFSE v1.0.0 | Motor ICMS/PR v5.0.0
        </div>
        <div class="rodape-aviso">
          Laudo emitido em estrita conformidade com a EC nº 132/2023, Lei Complementar nº 214/2025, Lei Complementar nº 227/2025, RICMS/PR e instruções normativas da Receita Federal do Brasil e Comitê Gestor do IBS. As diretrizes periciais contidas neste relatório destinam-se ao suporte de decisões contábeis e parametrização fiscal de sistemas.
        </div>
        <div class="rodape-copyright">${esc(PORTELA_COPYRIGHT)}</div>
      </div>`;

      const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Portela Contabilidade - Laudo Pericial Fiscal</title>
  <style>
    ${PORTELA_HEADER_CSS}
    ${PORTELA_FOOTER_CSS}
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 30px; color: #1e293b; line-height: 1.5; background-color: #f8fafc; }
    .container { max-width: 1100px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .section { margin-bottom: 24px; padding: 20px; border-radius: 6px; }
    .empresa-section { background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #5B7B35; }
    .parecer-tecnico { background-color: #f0f9ff; border-left: 4px solid #0284c7; }
    .parecer-conformidade { background-color: #f0fdf4; border-left: 4px solid #16a34a; }
    .dag-section { background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #4f46e5; }
    .nfse-section { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #059669; }
    .paridade-section { background-color: #fbfbfe; border: 1px solid #e0e7ff; border-left: 4px solid #6366f1; }
    .difal-section { background-color: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #ea580c; border-radius: 6px; }
    h2 { color: #0f172a; margin-top: 0; font-size: 1.25rem; }
    h3 { color: #1e293b; font-size: 1.05rem; margin-top: 18px; margin-bottom: 8px; }
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
    .difal-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
    .difal-metric-card { background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #fdba74; }
    .difal-metric-card.highlight { background: #ffedd5; border: 2px solid #ea580c; }
    .metric-title { font-size: 0.8rem; font-weight: 600; color: #9a3412; text-transform: uppercase; }
    .metric-val { font-size: 1.2rem; font-weight: 700; color: #7c2d12; margin-top: 4px; font-family: monospace; }
    .difal-details { margin: 14px 0; font-size: 0.875rem; color: #431407; }
    .alerta-box-difal { background: #fee2e2; border-left: 4px solid #ef4444; padding: 10px 14px; margin: 12px 0; border-radius: 4px; color: #991b1b; font-size: 0.85rem; }
    .tabela-difal, .tabela-dag { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem; background: #ffffff; border-radius: 6px; overflow: hidden; }
    .tabela-difal th, .tabela-difal td, .tabela-dag th, .tabela-dag td { padding: 8px 10px; border: 1px solid #cbd5e1; }
    .tabela-difal th { background-color: #ffedd5; color: #9a3412; text-align: left; font-weight: 600; }
    .tabela-dag th { background-color: #f1f5f9; color: #334155; text-align: left; font-weight: 600; }
    .dag-meta { font-size: 0.85rem; color: #475569; margin-bottom: 12px; }
    .rtc-status-strip { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; background: #ffffff; padding: 10px 14px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 14px; font-size: 0.85rem; }
    .tag-conforme { background-color: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.78rem; }
    .tag-divergente { background-color: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.78rem; }
    .tag-alerta { background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.78rem; }
    .tag-versao { background-color: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.8rem; }
    .metricas-rtc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .metrica-rtc-card { background: #ffffff; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .metrica-rtc-card.highlight { background: #e0e7ff; border: 1px solid #818cf8; }
    .m-label { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .m-val { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-top: 3px; font-family: monospace; }
    .parecer-regime-box { margin-top: 14px; padding: 12px; background: #ecfdf5; border-radius: 6px; border: 1px solid #a7f3d0; font-size: 0.875rem; color: #065f46; }
    .paridade-strip { padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; }
    .paridade-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .paridade-alerta { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .cib-highlight { background: #ecfeff; border: 1px solid #a5f3fc; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 0.85rem; color: #155e75; }
    .cib-title { font-weight: 600; display: block; margin-bottom: 4px; }
    .servico-box { background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 14px; font-size: 0.875rem; }
    .retencoes-box, .reforma-box { background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 14px; }
    .retencoes-title { font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 8px; text-transform: uppercase; }
    .retencoes-grid, .reforma-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 0.85rem; font-family: monospace; }
    .credito-nfse-box { margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.825rem; font-family: sans-serif; }
    .conciliacao-box { background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; color: #1e40af; margin-bottom: 14px; }
    .alertas-container { margin-top: 14px; }
    .alerta-item { padding: 10px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 0.825rem; border-left: 4px solid transparent; }
    .badge-critico { background: #fee2e2; border-left-color: #ef4444; color: #7f1d1d; }
    .badge-atencao { background: #fef3c7; border-left-color: #f59e0b; color: #78350f; }
    .badge-info { background: #f1f5f9; border-left-color: #64748b; color: #334155; }
    .alerta-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .alerta-badge { font-weight: bold; font-size: 0.75rem; }
    .alerta-detalhe { margin-bottom: 2px; }
    .alerta-base { font-size: 0.75rem; color: #64748b; }
    .monospace-sm { font-family: monospace; font-size: 0.8rem; }
    .rodape-tecnico { margin-top: 36px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 0.8rem; color: #64748b; }
    .rodape-linha { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .rodape-motores { margin-bottom: 8px; font-size: 0.78rem; color: #475569; }
    .rodape-aviso { font-size: 0.72rem; line-height: 1.4; color: #94a3b8; text-align: justify; }
    .rodape-copyright { margin-top: 10px; font-size: 0.76rem; font-weight: 600; color: #334155; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    ${headerPortelaHtml}
    ${empresaSectionHtml}
    ${pareceresHtml}
    ${nfseHtml}
    ${dagHtml}
    ${paridadeHtml}
    ${difalHtml}
    ${cpc16Html}
    ${saneamentoHtml}
    ${secaoItensHtml}
    ${rodapeTecnicoHtml}
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

    // ------------------------------------------------------------------------
    // GERAÇÃO DO LAUDO EM FORMATO TXT
    // ------------------------------------------------------------------------
    let txtContent = `# Portela Contabilidade - Laudo Pericial de Auditoria Fiscal\n`;
    txtContent += `Data da geração: ${dataHoraFormatada}\n`;
    txtContent += `Plataforma: MargemReal Portela ${PORTELA_VERSION}\n`;
    txtContent += `Hash de Integridade SHA-256: ${sha256Calculado}\n`;
    txtContent += `================================================================================\n\n`;

    if (!nfse && (empresaNome || empresaCnpj || emitenteNome || emitenteCnpj || empresaRegime || finalidadeOp)) {
      txtContent += `[IDENTIFICAÇÃO DA EMPRESA E DOCUMENTO]\n`;
      if (empresaNome || empresaCnpj) {
        txtContent += `- Empresa Ativa / Adquirente: ${empresaNome || 'N/A'} (CNPJ/CPF: ${empresaCnpj || 'N/A'})${empresaUf ? ` | UF: ${empresaUf}` : ''}\n`;
      }
      if (empresaRegime) {
        txtContent += `- Regime Tributário: ${empresaRegime}\n`;
      }
      if (emitenteNome || emitenteCnpj) {
        txtContent += `- Emitente / Fornecedor: ${emitenteNome || 'N/A'} (CNPJ/CPF: ${emitenteCnpj || 'N/A'})${emitenteUf ? ` | UF: ${emitenteUf}` : ''}\n`;
      }
      if (finalidadeOp) {
        txtContent += `- Finalidade da Operação: ${finalidadeOp}\n`;
      }
      txtContent += `\n`;
    }

    if (data.parecerTecnicoXml) {
      txtContent += `## Parecer Técnico do Documento\n`;
      txtContent += `${data.parecerTecnicoXml}\n\n`;
    }

    if (data.parecerConformidade) {
      txtContent += `## Parecer Breve de Conformidade e Créditos\n`;
      txtContent += `${data.parecerConformidade}\n\n`;
    }

    // Seção NFS-e / DPS Nacional TXT
    if (nfse && nfse.extracao) {
      const ext = nfse.extracao;
      const ident = ext.identificacao || {};
      const prest = ext.prestador || {};
      const tom = ext.tomador || {};
      const serv = ext.servico || {};
      const val = ext.valores || {};
      const ref = ext.reformaTributaria;
      const cred = nfse.creditosTomador;

      txtContent += `## Auditoria Pericial de NFS-e / DPS Padrão Nacional (LC 214/2025)\n`;
      txtContent += `Documento: ${ext.tipoDocumento || 'NFS-e'} | Número: ${ident.nNFSe || ident.nDPS || 'S/N'} | Série: ${ident.serie || '1'}\n`;
      txtContent += `Chave / ID: ${ident.chNFSe || ident.idDps || 'N/A'}\n`;
      txtContent += `Emissão: ${ident.dhEmi || ''} | Competência: ${ident.dCompet || ''}\n`;
      txtContent += `Prestador: ${prest.xNome || 'N/A'} (CNPJ/CPF: ${prest.cnpj || prest.cpf || 'N/A'})\n`;
      txtContent += `Tomador: ${tom.xNome || 'N/A'} (CNPJ/CPF: ${tom.cnpj || tom.cpf || 'N/A'})\n`;
      txtContent += `Serviço: [${serv.cTribNac || 'S/C'}] ${serv.cNBS ? `(NBS ${serv.cNBS})` : ''} - ${serv.xDescServ || 'Sem descrição'}\n`;
      txtContent += `Valor dos Serviços: ${fmtMoeda(val.vServ)} | Valor Líquido: ${fmtMoeda(val.vLiq)}\n`;

      if (ref?.cib) {
        txtContent += `\n[CIB - CADASTRO IMOBILIÁRIO BRASILEIRO]\n`;
        txtContent += `CIB: ${ref.cib} | Inscrição Imobiliária: ${ref.inscImobFisc || 'N/A'}\n`;
      }

      txtContent += `\n[RETENÇÕES NA FONTE]\n`;
      txtContent += `- IRRF: ${fmtMoeda(val.vRetIRRF)} | CSLL: ${fmtMoeda(val.vRetCSLL)}\n`;
      txtContent += `- PIS: ${fmtMoeda(val.vPIS)} | COFINS: ${fmtMoeda(val.vCOFINS)} | ISSQN: ${fmtMoeda(val.vISSQN)}\n`;

      txtContent += `\n[REFORMA TRIBUTÁRIA IBS / CBS]\n`;
      txtContent += `- IBS Estadual: ${fmtMoeda(ref?.vIBSUF)} (${fmtPct(ref?.pIBSUF)})\n`;
      txtContent += `- IBS Municipal: ${fmtMoeda(ref?.vIBSMun)} (${fmtPct(ref?.pIBSMun)})\n`;
      txtContent += `- CBS Federal: ${fmtMoeda(ref?.vCBS)} (${fmtPct(ref?.pCBS)})\n`;

      if (cred) {
        txtContent += `\n[CRÉDITOS DO TOMADOR]\n`;
        txtContent += `- PIS/COFINS (Lucro Real): ${cred.pisCofinsLucroReal.admitido ? `Admitido (${fmtMoeda(cred.pisCofinsLucroReal.valorPis + cred.pisCofinsLucroReal.valorCofins)})` : 'Não admitido'}\n`;
        txtContent += `- IBS/CBS: ${cred.ibsCbsReforma.admitido ? `Admitido (${fmtMoeda(cred.ibsCbsReforma.valorIbs + cred.ibsCbsReforma.valorCbs)})` : 'Vedado'} [Status: ${cred.ibsCbsReforma.statusExtincao}]\n`;
      }

      if (nfse.alertas && nfse.alertas.length > 0) {
        txtContent += `\n[ALERTAS DE CONFORMIDADE DA NFS-E]\n`;
        nfse.alertas.forEach((a: any) => {
          txtContent += `* [${a.severidade}] ${a.titulo || a.codigo}: ${a.detalhe}\n`;
        });
      }
      txtContent += `\n--------------------------------------------------------------------------------\n\n`;
    }

    // Seção Orquestrador Fiscal DAG TXT
    if (dag && dag.etapas) {
      const etapas = dag.etapas;
      const rtc = etapas.rtc || {};
      const creditos = etapas.creditos || {};
      const camadas = creditos.camadas || {};
      const custos = etapas.custosEPrecificacao || {};
      const comparativo = custos.comparativoRegimes || {};

      txtContent += `## Orquestrador Fiscal DAG — Execução Canônica em 6 Etapas\n`;
      txtContent += `Chave NF-e: ${dag.chaveAcesso || 'N/A'}\n`;
      txtContent += `Motor RTC: ${rtc.motorRtcUtilizado || 'N/A'} (${rtc.origemCalculoRtc || 'N/A'}) | Latência: ${rtc.duracaoRtcMs ?? 0}ms\n`;
      txtContent += `Status Validação XML: ${rtc.validacaoXml?.status || 'N/A'}\n\n`;

      txtContent += `[TOTAIS RTC REFORMA TRIBUTÁRIA]\n`;
      txtContent += `- IBS UF: ${fmtMoeda(rtc.totaisRtc?.vIbsUf)} | IBS Mun: ${fmtMoeda(rtc.totaisRtc?.vIbsMun)}\n`;
      txtContent += `- CBS: ${fmtMoeda(rtc.totaisRtc?.vCbs)} | IS: ${fmtMoeda(rtc.totaisRtc?.vIs)} | Total IVA: ${fmtMoeda(rtc.totaisRtc?.vIvaTotal)}\n\n`;

      txtContent += `[CLASSIFICAÇÃO TRIPARTIDA DE CRÉDITOS]\n`;
      txtContent += `Tributo      | Destacado XML | Admitido Regra | Efetivado Custo\n`;
      txtContent += `---------------------------------------------------------------\n`;
      const dXml = camadas.totalDestacadoXml || {};
      const dReg = camadas.totalCreditoAdmitidoRegra || {};
      const dEfe = camadas.totalCreditoEfetivadoCusto || {};
      ['icms', 'pis', 'cofins', 'ipi', 'ibs', 'cbs', 'total'].forEach(k => {
        const nome = k.toUpperCase().padEnd(12, ' ');
        const vX = fmtMoeda(dXml[k]).padStart(13, ' ');
        const vR = fmtMoeda(dReg[k]).padStart(14, ' ');
        const vE = fmtMoeda(dEfe[k]).padStart(15, ' ');
        txtContent += `${nome} | ${vX} | ${vR} | ${vE}\n`;
      });

      if (creditos.retidoAguardandoExtincaoIbsCbs?.total > 0) {
        txtContent += `\n* ALERTA SPLIT PAYMENT: ${fmtMoeda(creditos.retidoAguardandoExtincaoIbsCbs.total)} retido aguardando liquidação financeira.\n`;
      }

      txtContent += `\n[COMPARATIVO DOS 4 REGIMES TRIBUTÁRIOS]\n`;
      const regimesKeys: Array<'SIMPLES_TRADICIONAL' | 'SIMPLES_HIBRIDO_2027' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL'> = [
        'SIMPLES_TRADICIONAL',
        'SIMPLES_HIBRIDO_2027',
        'LUCRO_PRESUMIDO',
        'LUCRO_REAL',
      ];
      regimesKeys.forEach(k => {
        const c = comparativo[k];
        if (c) {
          txtContent += `- ${c.nomeExibicao}${c.melhorCenario ? ' [MELHOR CENÁRIO]' : ''}:\n`;
          txtContent += `  CMV Líquido: ${fmtMoeda(c.cmvLiquidoTotal)} | Créditos: ${fmtMoeda(c.creditosAproveitados)} | Preço Sugerido: ${fmtMoeda(c.precoVendaSugerido)}\n`;
          txtContent += `  Margem Líq: ${fmtPct(c.margemLiquidaPct)} | Carga Efetiva: ${fmtPct(c.cargaTributariaEfetivaPct)}\n`;
        }
      });

      txtContent += `\n--------------------------------------------------------------------------------\n\n`;
    }

    // Seção Paridade TXT
    if (paridade) {
      txtContent += `## Auditoria de Paridade: Motor RFB vs. Motor Local Portela\n`;
      txtContent += `Status: ${paridade.paridadeTotal ? 'PARIDADE TOTAL (Zero Divergência)' : `DIVERGÊNCIAS DETECTADAS (${paridade.qtdDivergencias})`}\n`;
      txtContent += `Itens Comparados: ${paridade.qtdItensComparados} | Maior Desvio: R$ ${paridade.maiorDesvioAbsoluto || '0,00'}\n`;
      if (paridade.divergencias && paridade.divergencias.length > 0) {
        paridade.divergencias.forEach((d: any) => {
          txtContent += `* Item ${d.numeroItem} - ${d.campo}: RFB ${fmtMoeda(d.valorOficialRfb)} vs Local ${fmtMoeda(d.valorLocal)} (Dif: ${fmtMoeda(d.diferencaAbsoluta)}) [${d.causaProvavel}]\n`;
        });
      }
      txtContent += `\n--------------------------------------------------------------------------------\n\n`;
    }

    // Seção DIFAL / FECOP / Antecipação PR TXT
    if (resumoDifal) {
      txtContent += `## Apuração DIFAL / FECOP / Antecipação na Entrada (RICMS/PR)\n`;
      txtContent += `- Débito DIFAL: ${fmtMoeda(resumoDifal.totalDebitoDifal)}\n`;
      txtContent += `- Débito FECOP: ${fmtMoeda(resumoDifal.totalDebitoFecop)}\n`;
      txtContent += `- Antecipação Art. 16: ${fmtMoeda(resumoDifal.totalAntecipacaoArt16)}\n`;
      txtContent += `- Total a Recolher: ${fmtMoeda(resumoDifal.totalGeralRecolher)}\n`;
      txtContent += `- Guias: ${resumoDifal.guiasNecessarias?.join(', ') || 'Nenhuma'}\n`;
      txtContent += `- Prazo Principal: ${resumoDifal.prazoPrincipal || 'N/A'}\n\n`;
    }

    // Seção CPC 16 (R1) + CT-e FOB TXT
    if (Array.isArray(data.itensAuditados) && data.itensAuditados.length > 0) {
      txtContent += `## Segregação de Custos CPC 16 (R1) e Rateio CT-e FOB por Item\n\n`;
      if (data.cteFobResumo) {
        const cr = data.cteFobResumo as any;
        txtContent += `- CT-e FOB Nº ${cr.numero || 's/n'} (Chave ${cr.chaveAcesso || 'N/A'}) | Prestação: ${fmtMoeda(cr.vTPrest)} | Status: ${cr.aplicado ? 'Aplicado' : (cr.motivoBloqueio || 'Bloqueado')}\n\n`;
      }
      data.itensAuditados.forEach((aud: any, idx: number) => {
        const cp = aud?.custoCpc16 || {};
        const freteNfe = Number(cp.freteNfe || 0) + Number(cp.seguroNfe || 0) + Number(cp.outrasDespesasNfe || 0);
        txtContent += `- Item ${idx + 1}: ${aud?.cProd || 'S/N'} - ${aud?.xProd || 'Produto'} (NCM ${aud?.ncm || '—'})\n`;
        txtContent += `  vProd Líq: ${fmtMoeda(cp.valorProdutoLiquido)} | Frete NF-e: ${fmtMoeda(freteNfe)} | Frete CT-e FOB: ${fmtMoeda(cp.freteCteFob)}\n`;
        txtContent += `  Trib. Não Recup.: +${fmtMoeda(cp.tributosNaoRecuperaveis?.total)} | Créditos Recup.: -${fmtMoeda(cp.creditosRecuperaveis?.total)} | CMV Líq. Unit.: ${fmtMoeda(cp.cmvLiquidoUnitario)}\n`;
      });
      if (data.totaisCpc16) {
        const tc = data.totaisCpc16 as any;
        txtContent += `- CMV Líquido Consolidado da Nota: ${fmtMoeda(tc.cmvLiquidoTotal)} (CT-e FOB: ${fmtMoeda(tc.freteCteFobTotal)})\n`;
      }
      txtContent += `\n--------------------------------------------------------------------------------\n\n`;

      const itensSanTxt = (data.itensAuditados as any[]).filter(
        (aud) =>
          aud?.saneamentoNcm &&
          (aud.saneamentoNcm.overrideAtivo || aud.saneamentoNcm.aderencia?.statusAderencia !== 'ADERENTE')
      );
      if (itensSanTxt.length > 0) {
        txtContent += `## Divergências de Classificação & Saneamento NCM (Entrada XML × Saída ERP)\n`;
        txtContent += `Rastreabilidade Snapshot: mode=${rastreabilidadeSaneamento.mode} | snapshotSha256=${rastreabilidadeSaneamento.snapshotSha256} | normasVigentes=${rastreabilidadeSaneamento.normasVigentes.join('; ')}\n\n`;
        itensSanTxt.forEach((aud, idx) => {
          const san = aud.saneamentoNcm;
          const ad = san.aderencia || {};
          const imp = san.impactoAntesDepois;
          const reformaStatusTxt = imp
            ? `${formatarStatusReformaSaneamento(imp.antes).rotulo} -> ${formatarStatusReformaSaneamento(imp.depois).rotulo}`
            : aud.tributacaoReforma
              ? formatarStatusReformaSaneamento(aud.tributacaoReforma).rotulo
              : '';
          txtContent += `- Item ${idx + 1}: ${aud.cProd || 'S/N'} - ${aud.xProd || 'Produto'}\n`;
          txtContent += `  Aderência: ${ad.statusAderencia || 'REQUER_PERICIA'} (${ad.scoreAderencia ?? 0}%) | Entrada XML: ${aud.ncmEscrituradoEntrada || aud.ncm} | Saída Saneada: ${san.ncmSaneadoSaida || 'Não aplicado'}\n`;
          if (san.justificativaPericial) {
            txtContent += `  Justificativa: ${san.justificativaPericial}\n`;
          }
          if (imp) {
            txtContent += `  Impacto Antes × Depois: Δ ICMS PR ${imp.deltaAliqIcmsPrPct}% | Δ DIFAL ${fmtMoeda(imp.deltaDifalTotal)} | Δ CMV Unit. ${fmtMoeda(imp.deltaCmvUnitario)}${reformaStatusTxt ? ` | LC 214: ${reformaStatusTxt}` : ''}\n`;
          } else if (reformaStatusTxt) {
            txtContent += `  LC 214: ${reformaStatusTxt}\n`;
          }
          txtContent += `  Orientação CC-e: ${san.orientacaoOperacional || ''}\n\n`;
        });
        txtContent += `--------------------------------------------------------------------------------\n\n`;
      }
    }

    // Seção Itens Parametrização TXT
    if (data.itens && data.itens.length > 0) {
      txtContent += `## Parametrização de ERP - Detalhamento de Itens\n\n`;
      data.itens.forEach((item, i) => {
        txtContent += `### Item ${i + 1}: ${item.cProd || 'N/A'} - ${item.xProd || 'N/A'}\n`;
        txtContent += `- NCM: ${item.ncm || 'N/A'} | CEST: ${item.cest || 'N/A'}\n`;
        txtContent += `- ICMS: CFOP ${item.cfopEntrada || 'N/A'} | CST ${item.cstIcmsEntrada || 'N/A'} | Alíq ${item.aliqIcms || 'N/A'} | Crédito: ${item.permiteCredito ? 'Sim' : 'Não'}\n`;
        txtContent += `- PIS/COFINS: CST ${item.cstPisCofinsEntrada || 'N/A'} | PIS ${item.aliqPis || 'N/A'} | COFINS ${item.aliqCofins || 'N/A'}\n`;
        txtContent += `- Reforma (IBS/CBS): cClassTrib ${item.cClassTrib || 'N/A'} | IBS ${item.aliqIbsTransitorio || 'N/A'} | CBS ${item.aliqCbsTransitorio || 'N/A'}\n`;
        txtContent += `Instrução de Cadastro: ${item.instrucaoCadastro || 'N/A'}\n`;
        txtContent += `---------------------------------------------------\n\n`;
      });
    }

    if (isRascunhoHardcoded) {
      txtContent += `[AVISO] RASCUNHO NÃO OFICIAL — MODO HARDCODED (SNAPSHOT RFB AUSENTE)\n`;
    }
    txtContent += `Rastreabilidade Snapshot: Modo=${rastreabilidadeSaneamento.mode} | Atualizado em=${rastreabilidadeSaneamento.updatedAt || dataHoraFormatada} | Hash SHA-256=${rastreabilidadeSaneamento.snapshotSha256}\n`;
    txtContent += `Normas Vigentes: ${rastreabilidadeSaneamento.normasVigentes.join(' | ')}\n`;
    txtContent += `\n================================================================================\n`;
    txtContent += `Laudo emitido em estrita conformidade com a EC nº 132/2023, LC nº 214/2025,\n`;
    txtContent += `LC nº 227/2025, RICMS/PR e normas vigentes da Receita Federal do Brasil.\n`;
    txtContent += `MargemReal Portela ${PORTELA_VERSION} — ${PORTELA_COPYRIGHT}\n`;

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
