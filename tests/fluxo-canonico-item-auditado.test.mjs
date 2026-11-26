/**
 * Suíte Estrita do Fluxo Canônico Único: ItemFiscalAuditado, CT-e FOB (Mod. 57),
 * Segregação CPC 16 R1 nos 4 Regimes, Trava SN PR, Anexo IX e Propagação Entrada -> ERP -> Precificação.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mods } from 'ncm:libs';

import {
  extrairDadosXmlCte,
  verificarEmpresaTomadoraCte,
  ratearCteSobreItensNfe,
} from '../lib/fiscal/extrator-cte.ts';
import {
  inferirPerfilAtividadePorCnae,
  resolverContextoEmpresaNaData,
  construirItemFiscalAuditado,
  construirNotaFiscalAuditadaSessao,
  converterAuditadoParaPrecificacao,
  converterAuditadoParaParametrizacao,
} from '../lib/types/item-fiscal-auditado.ts';
import { gerarRelatorioErpResumidoHtml, gerarRelatorioErpDetalhadoHtml, gerarRelatorioErpResumidoTxt } from '../lib/relatorio-erp.ts';

globalThis.fetch = async (u) => {
  const url = String(u).split('?v=')[0];
  const rel = url.replace(/^\//, '');
  try {
    const t = await readFile(process.cwd() + '/public/' + rel, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(t) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};
const marco = await mods.marco.loadMarcoLegal();

const CNPJ_ATIVA = '12345678000195';
const CNPJ_FORNECEDOR = '98765432000110';
const CNPJ_TERCEIRO = '11222333000181';

function criarEmpresaFixture({
  regimeTributario,
  cnaePrincipal = '4711302', // Comércio varejista
  simplesOptanteHibrido2027 = false,
  vigenciaInicio = '2026-01-01',
}) {
  return {
    id: `emp-${regimeTributario}-${cnaePrincipal}`,
    escritorioId: 'esc-1',
    cnpj: CNPJ_ATIVA,
    razaoSocial: `Empresa Teste ${regimeTributario}`,
    uf: 'PR',
    inscricaoEstadual: '9012345678',
    ativo: true,
    cnaePrincipal,
    criadoEm: '2026-01-01T00:00:00Z',
    atualizadoEm: '2026-01-01T00:00:00Z',
    perfis: [
      {
        id: 'perf-1',
        empresaId: `emp-${regimeTributario}-${cnaePrincipal}`,
        escritorioId: 'esc-1',
        regimeTributario,
        vigenciaInicio,
        vigenciaFim: null,
        aliquotasEfetivas: {},
        simplesOptanteHibrido2027,
        beneficiosParana: { diferimentoParcialArt28: false, optanteRotSt: false, reducoesBcAtivas: [] },
        reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
        criadoEm: '2026-01-01T00:00:00Z',
        atualizadoEm: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function criarItemNfeBase(overrides = {}) {
  return {
    index: 1,
    cProd: 'CAMISA-01',
    xProd: 'Camisa de Algodão',
    ncm: '61091000',
    ncmValidoSiscomex: true,
    cfop: '6101',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 1000,
    vProd: 1000,
    vFrete: 0,
    vSeg: 0,
    vDesc: 0,
    vOutro: 0,
    origemMercadoria: '0',
    origemTabelaA: 0,
    crtEmitente: '3',
    sensivelParaAuditoria: false,
    tributos: {
      cstIcms: '00',
      orig: 0,
      vBC: 1000,
      pICMS: 12,
      vICMS: 120,
      pIPI: 0,
      vIPI: 0,
      cstPis: '01',
      vBCPis: 880,
      pPIS: 1.65,
      vPIS: 14.52,
      cstCofins: '01',
      vBCCofins: 880,
      pCOFINS: 7.6,
      vCOFINS: 66.88,
      ...(overrides.tributos || {}),
    },
    ...overrides,
    ...(overrides.tributos ? { tributos: { cstIcms: '00', orig: 0, vBC: 1000, pICMS: 12, vICMS: 120, pIPI: 0, vIPI: 0, cstPis: '01', vBCPis: 880, pPIS: 1.65, vPIS: 14.52, cstCofins: '01', vBCCofins: 880, pCOFINS: 7.6, vCOFINS: 66.88, ...overrides.tributos } } : {}),
  };
}

function criarXmlCteFixture({
  tomaIndicador = '3',
  cnpjTomador = CNPJ_ATIVA,
  vTPrest = '100.00',
  vICMS = '12.00',
  chavesNfe = ['41260698765432000110550010000001231000001234'],
}) {
  const tomaBlock =
    tomaIndicador === '4'
      ? `<toma4><toma>4</toma><CNPJ>${cnpjTomador}</CNPJ><xNome>Tomador Outros</xNome><enderToma><UF>PR</UF></enderToma></toma4>`
      : `<toma3><toma>${tomaIndicador}</toma></toma3>`;

  const remCnpj = tomaIndicador === '0' ? cnpjTomador : CNPJ_FORNECEDOR;
  const destCnpj = tomaIndicador === '3' ? cnpjTomador : CNPJ_ATIVA;
  const nfesXml = chavesNfe.map((ch) => `<infNFe><chave>${ch}</chave></infNFe>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte">
  <CTe>
    <infCte Id="CTe41260611111111000111570010000005001000005001" versao="4.00">
      <ide>
        <cUF>41</cUF>
        <CFOP>6352</CFOP>
        <mod>57</mod>
        <serie>1</serie>
        <nCT>500</nCT>
        <dhEmi>2026-06-15T10:00:00-03:00</dhEmi>
        <modal>01</modal>
        <UFIni>SP</UFIni>
        <UFFim>PR</UFFim>
        ${tomaBlock}
      </ide>
      <emit><CNPJ>11111111000111</CNPJ><xNome>Transportadora Paranaense</xNome><enderEmit><UF>PR</UF></enderEmit></emit>
      <rem><CNPJ>${remCnpj}</CNPJ><xNome>Fornecedor SP</xNome><enderReme><UF>SP</UF></enderReme></rem>
      <dest><CNPJ>${destCnpj}</CNPJ><xNome>Empresa Ativa PR</xNome><enderDest><UF>PR</UF></enderDest></dest>
      <vPrest>
        <vTPrest>${vTPrest}</vTPrest>
        <vRec>${vTPrest}</vRec>
        <Comp><xNome>FRETE PESO</xNome><vComp>${vTPrest}</vComp></Comp>
      </vPrest>
      <imp>
        <ICMS>
          <ICMS00>
            <CST>00</CST>
            <vBC>${vTPrest}</vBC>
            <pICMS>12.00</pICMS>
            <vICMS>${vICMS}</vICMS>
          </ICMS00>
        </ICMS>
      </imp>
      <infCTeNorm>
        <infCarga><vCarga>1000.00</vCarga><infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>30.0000</qCarga></infQ></infCarga>
        <infDoc>${nfesXml}</infDoc>
      </infCTeNorm>
    </infCte>
  </CTe>
</cteProc>`;
}

// ════════════════════════════════════════════════════════════════════════════
// CENÁRIO 1: 4 REGIMES COM E SEM IPI + COM E SEM CT-E FOB + NT 2026.008 v1.01
// ════════════════════════════════════════════════════════════════════════════
test('CENÁRIO 1 — 4 Regimes (LR Comércio, LR Indústria, LP, SN) com/sem IPI, com/sem CT-e FOB e NT 2026.008', () => {
  const itemSemIpi = criarItemNfeBase();
  const itemComIpi = criarItemNfeBase({
    tributos: { pIPI: 10, vIPI: 100 },
  });
  const doc = {
    chaveNfe: '41260698765432000110550010000001231000001234',
    dhEmi: '2026-06-15T09:00:00-03:00',
    ufOrigem: 'SP',
    ufDestino: 'PR',
    emitCrt: '3',
  };

  const empLrComercio = criarEmpresaFixture({ regimeTributario: 'LUCRO_REAL', cnaePrincipal: '4711302' });
  const empLrIndustria = criarEmpresaFixture({ regimeTributario: 'LUCRO_REAL', cnaePrincipal: '2833000' });
  const empLpComercio = criarEmpresaFixture({ regimeTributario: 'LUCRO_PRESUMIDO', cnaePrincipal: '4711302' });
  const empSnComercio = criarEmpresaFixture({ regimeTributario: 'SIMPLES_NACIONAL', cnaePrincipal: '4711302' });

  const ctxLrCom = resolverContextoEmpresaNaData({ empresaAtiva: empLrComercio, dataEmissao: doc.dhEmi });
  const ctxLrInd = resolverContextoEmpresaNaData({ empresaAtiva: empLrIndustria, dataEmissao: doc.dhEmi });
  const ctxLp = resolverContextoEmpresaNaData({ empresaAtiva: empLpComercio, dataEmissao: doc.dhEmi });
  const ctxSn = resolverContextoEmpresaNaData({ empresaAtiva: empSnComercio, dataEmissao: doc.dhEmi });

  assert.equal(ctxLrCom.perfilAtividade, 'comercio');
  assert.equal(ctxLrInd.perfilAtividade, 'industria');

  // Sem IPI e sem CT-e FOB
  const lrComSemIpi = construirItemFiscalAuditado({ item: itemSemIpi, documento: doc, contextoEmpresa: ctxLrCom, destinacao: 'revenda', opcoes: { marco } });
  const lpSemIpi = construirItemFiscalAuditado({ item: itemSemIpi, documento: doc, contextoEmpresa: ctxLp, destinacao: 'revenda', opcoes: { marco } });
  const snSemIpi = construirItemFiscalAuditado({ item: itemSemIpi, documento: doc, contextoEmpresa: ctxSn, destinacao: 'revenda', opcoes: { marco } });

  assert.equal(lrComSemIpi.custoCpc16.creditosRecuperaveis.icmsNfe, 120);
  assert.equal(lrComSemIpi.custoCpc16.creditosRecuperaveis.pisCofinsNfe, 81.4); // 9,25% * (1000 - 120) = 81,40
  assert.equal(lrComSemIpi.custoCpc16.cmvLiquidoUnitario, 798.6);

  assert.equal(lpSemIpi.custoCpc16.creditosRecuperaveis.icmsNfe, 120);
  assert.equal(lpSemIpi.custoCpc16.creditosRecuperaveis.pisCofinsNfe, 0);
  assert.equal(lpSemIpi.custoCpc16.cmvLiquidoUnitario, 880);

  assert.equal(snSemIpi.custoCpc16.creditosRecuperaveis.total, 0);
  assert.equal(snSemIpi.custoCpc16.cmvLiquidoUnitario, 1000);

  // Com IPI 10% (R$ 100,00): LR Indústria recupera IPI; Comércio/LP/SN incorporam IPI ao custo
  const lrIndComIpi = construirItemFiscalAuditado({ item: itemComIpi, documento: doc, contextoEmpresa: ctxLrInd, destinacao: 'insumo_industrial', opcoes: { marco } });
  const lrComComIpi = construirItemFiscalAuditado({ item: itemComIpi, documento: doc, contextoEmpresa: ctxLrCom, destinacao: 'revenda', opcoes: { marco } });
  const lpComIpi = construirItemFiscalAuditado({ item: itemComIpi, documento: doc, contextoEmpresa: ctxLp, destinacao: 'revenda', opcoes: { marco } });
  const snComIpi = construirItemFiscalAuditado({ item: itemComIpi, documento: doc, contextoEmpresa: ctxSn, destinacao: 'revenda', opcoes: { marco } });

  assert.equal(lrIndComIpi.custoCpc16.creditosRecuperaveis.ipi, 100);
  assert.equal(lrIndComIpi.custoCpc16.tributosNaoRecuperaveis.ipi, 0);
  assert.equal(lrIndComIpi.custoCpc16.cmvLiquidoUnitario, 798.6);

  assert.equal(lrComComIpi.custoCpc16.creditosRecuperaveis.ipi, 0);
  assert.equal(lrComComIpi.custoCpc16.tributosNaoRecuperaveis.ipi, 100);
  assert.equal(lrComComIpi.custoCpc16.cmvLiquidoUnitario, 898.6);

  assert.equal(lpComIpi.custoCpc16.cmvLiquidoUnitario, 980);
  assert.equal(snComIpi.custoCpc16.cmvLiquidoUnitario, 1100);

  // Com CT-e FOB R$ 100,00 (ICMS 12% = R$ 12,00) sobre a NF-e sem IPI
  const cteFob = extrairDadosXmlCte(criarXmlCteFixture({ tomaIndicador: '3', cnpjTomador: CNPJ_ATIVA, vTPrest: '100.00', vICMS: '12.00' }));
  const invSemIpi = {
    tipoDocumento: 'XML',
    identificacao: { chaveAcesso: doc.chaveNfe, dataEmissao: doc.dhEmi, numero: '123', serie: '1' },
    emitente: { cnpj: CNPJ_FORNECEDOR, uf: 'SP', crt: '3', nome: 'Fornecedor SP' },
    destinatario: { cnpj: CNPJ_ATIVA, uf: 'PR', nome: 'Empresa Ativa' },
    resumoFinanceiro: { vProdTotal: 1000, vNF: 1000, vICMSTotal: 120 },
    totalItens: 1,
    itens: [itemSemIpi],
  };

  const sessLrComCte = construirNotaFiscalAuditadaSessao({ invoice: invSemIpi, contextoEmpresa: ctxLrCom, destinacaoPadrao: 'revenda', cteFob, marco });
  const sessLrIndCte = construirNotaFiscalAuditadaSessao({ invoice: invSemIpi, contextoEmpresa: ctxLrInd, destinacaoPadrao: 'insumo_industrial', cteFob, marco });
  const sessLpCte = construirNotaFiscalAuditadaSessao({ invoice: invSemIpi, contextoEmpresa: ctxLp, destinacaoPadrao: 'revenda', cteFob, marco });
  const sessSnCte = construirNotaFiscalAuditadaSessao({ invoice: invSemIpi, contextoEmpresa: ctxSn, destinacaoPadrao: 'revenda', cteFob, marco });

  // No LR: +100 frete - 12 ICMS CTe - 8.14 PIS/COFINS CTe (9,25% de 88) = +79.86 -> 798.60 + 79.86 = 878.46
  assert.equal(sessLrComCte.itens[0].custoCpc16.creditosRecuperaveis.icmsCteFob, 12);
  assert.equal(sessLrComCte.itens[0].custoCpc16.creditosRecuperaveis.pisCofinsCteFob, 8.14);
  assert.equal(sessLrComCte.itens[0].custoCpc16.cmvLiquidoUnitario, 878.46);
  assert.equal(sessLrIndCte.itens[0].custoCpc16.cmvLiquidoUnitario, 878.46);
  // No LP: +100 frete - 12 ICMS CTe = +88.00 -> 880 + 88 = 968.00
  assert.equal(sessLpCte.itens[0].custoCpc16.cmvLiquidoUnitario, 968);
  // No SN: +100 frete - 0 créditos = 1100.00
  assert.equal(sessSnCte.itens[0].custoCpc16.cmvLiquidoUnitario, 1100);

  // Quadro comparativo real impresso no log do teste
  console.log(
    '[CMV_COMPARATIVO_4_REGIMES]',
    JSON.stringify({
      baseSemIpiSemFob: {
        LR_COMERCIO: lrComSemIpi.custoCpc16.cmvLiquidoUnitario,
        LR_INDUSTRIA: construirItemFiscalAuditado({ item: itemSemIpi, documento: doc, contextoEmpresa: ctxLrInd, destinacao: 'insumo_industrial', opcoes: { marco } }).custoCpc16.cmvLiquidoUnitario,
        LP: lpSemIpi.custoCpc16.cmvLiquidoUnitario,
        SN: snSemIpi.custoCpc16.cmvLiquidoUnitario,
      },
      baseSemIpiComCteFob100: {
        LR_COMERCIO: sessLrComCte.itens[0].custoCpc16.cmvLiquidoUnitario,
        LR_INDUSTRIA: sessLrIndCte.itens[0].custoCpc16.cmvLiquidoUnitario,
        LP: sessLpCte.itens[0].custoCpc16.cmvLiquidoUnitario,
        SN: sessSnCte.itens[0].custoCpc16.cmvLiquidoUnitario,
      },
      baseComIpi100SemFob: {
        LR_COMERCIO: lrComComIpi.custoCpc16.cmvLiquidoUnitario,
        LR_INDUSTRIA: lrIndComIpi.custoCpc16.cmvLiquidoUnitario,
        LP: lpComIpi.custoCpc16.cmvLiquidoUnitario,
        SN: snComIpi.custoCpc16.cmvLiquidoUnitario,
      },
    })
  );

  // NT 2026.008 v1.01: IBS/CBS por fora (R$ 10 + R$ 88) sem dupla contagem no LR/LP e incorporado ao CMV no SN
  const itemNt = criarItemNfeBase({
    vProdLiq: 1000,
    tributos: { vIBS: 10, vCBS: 88, pIBS: 1, pCBS: 8.8 },
  });
  const lrNt = construirItemFiscalAuditado({ item: itemNt, documento: doc, contextoEmpresa: ctxLrCom, destinacao: 'revenda', opcoes: { marco } });
  const snNt = construirItemFiscalAuditado({ item: itemNt, documento: doc, contextoEmpresa: ctxSn, destinacao: 'revenda', opcoes: { marco } });
  assert.equal(lrNt.custoCpc16.cmvLiquidoUnitario, 798.6);
  assert.equal(snNt.custoCpc16.tributosNaoRecuperaveis.ibsCbsNaoRecuperavel, 98);
  assert.equal(snNt.custoCpc16.cmvLiquidoUnitario, 1098);
});

// ════════════════════════════════════════════════════════════════════════════
// CENÁRIO 2: CRT=1 vs CRT=3 (MVA ORIGINAL VS AJUSTADA) + TRAVA SN PR <= 360K
// ════════════════════════════════════════════════════════════════════════════
test('CENÁRIO 2 — Fornecedor CRT=1 (MVA Original Conv. 35/11) vs CRT=3 (MVA Ajustada) e trava PR <= R$ 360 mil', () => {
  const empLp = criarEmpresaFixture({ regimeTributario: 'LUCRO_PRESUMIDO' });
  const ctxLp = resolverContextoEmpresaNaData({ empresaAtiva: empLp, dataEmissao: '2026-06-15' });
  const docBase = { dhEmi: '2026-06-15', ufOrigem: 'SP', ufDestino: 'PR' };

  const itemStCrt1 = criarItemNfeBase({
    ncm: '33030010',
    cest: '2000100',
    crtEmitente: '1',
    tributos: { csosn: '201', cstIcms: undefined, vICMS: 0, pICMS: 0, pCredSN: 2.5, vCredICMSSN: 25, vPIS: 0, vCOFINS: 0 },
  });
  const itemStCrt3 = criarItemNfeBase({
    ncm: '33030010',
    cest: '2000100',
    crtEmitente: '3',
  });

  const audCrt1 = construirItemFiscalAuditado({ item: itemStCrt1, documento: { ...docBase, emitCrt: '1' }, contextoEmpresa: ctxLp, destinacao: 'revenda', opcoes: { marco } });
  const audCrt3 = construirItemFiscalAuditado({ item: itemStCrt3, documento: { ...docBase, emitCrt: '3' }, contextoEmpresa: ctxLp, destinacao: 'revenda', opcoes: { marco } });

  assert.equal(audCrt1.tributacaoEstadual.tipoMvaPr, 'original_conv_35_2011');
  assert.equal(audCrt1.tributacaoEstadual.mvaAplicadaPrPct, 58);
  assert.equal(audCrt3.tributacaoEstadual.tipoMvaPr, 'ajustada');
  assert.ok(audCrt3.tributacaoEstadual.mvaAplicadaPrPct > 58);

  // Fornecedor SN tributado normalmente com CSOSN 101 na faixa isenta PR <= 360k vs fora da faixa
  const itemSn101 = criarItemNfeBase({
    crtEmitente: '1',
    tributos: { csosn: '101', cstIcms: undefined, pCredSN: 2.5, vCredICMSSN: 25, vICMS: 0, pICMS: 0, vPIS: 0, vCOFINS: 0 },
  });
  const audSnNormal = construirItemFiscalAuditado({
    item: itemSn101,
    documento: { dhEmi: '2026-06-15', ufOrigem: 'PR', ufDestino: 'PR', emitCrt: '1', emitSnIsentoPr: false },
    contextoEmpresa: ctxLp,
    destinacao: 'revenda',
    opcoes: { marco },
  });
  const audSnIsento360k = construirItemFiscalAuditado({
    item: itemSn101,
    documento: { dhEmi: '2026-06-15', ufOrigem: 'PR', ufDestino: 'PR', emitCrt: '1', emitSnIsentoPr: true },
    contextoEmpresa: ctxLp,
    destinacao: 'revenda',
    opcoes: { marco },
  });

  assert.equal(audSnNormal.custoCpc16.creditosRecuperaveis.icmsNfe, 25);
  assert.equal(audSnIsento360k.custoCpc16.creditosRecuperaveis.icmsNfe, 0);
  assert.ok(audSnIsento360k.alertasFiscais.some((a) => a.includes('360 mil')));

  const ctxSn300k = resolverContextoEmpresaNaData({
    empresaAtiva: criarEmpresaFixture({ regimeTributario: 'SIMPLES_NACIONAL' }),
    dataEmissao: '2026-06-15',
    faturamentoAnualRbt12: 300000,
  });
  assert.equal(ctxSn300k.faixaIsentaIcmsPrSn, true);
});

// ════════════════════════════════════════════════════════════════════════════
// CENÁRIO 3: CT-E FOB MULTI-ITENS (FECHAMENTO EXATO EM CENTAVOS E BLOQUEIO CIF)
// ════════════════════════════════════════════════════════════════════════════
test('CENÁRIO 3 — CT-e FOB mod. 57 multi-itens fecha centavo a centavo e bloqueia CIF / CNPJ divergente', () => {
  const itens = [
    criarItemNfeBase({ index: 1, cProd: 'A', vProd: 100, qCom: 1 }),
    criarItemNfeBase({ index: 2, cProd: 'B', vProd: 100, qCom: 1 }),
    criarItemNfeBase({ index: 3, cProd: 'C', vProd: 100, qCom: 1 }),
  ];

  const cteDest = extrairDadosXmlCte(criarXmlCteFixture({ tomaIndicador: '3', cnpjTomador: CNPJ_ATIVA, vTPrest: '100.00', vICMS: '12.00' }));
  assert.equal(cteDest.modelo, '57');
  assert.equal(cteDest.tomador.indicador, '3');

  const rateioOk = ratearCteSobreItensNfe(itens, cteDest, { cnpjEmpresaAtiva: CNPJ_ATIVA, criterio: 'valor' });
  assert.equal(rateioOk.aplicado, true);
  assert.equal(rateioOk.conferidoCentavos, true);
  assert.equal(rateioOk.diferencaCentavosFrete, 0);
  assert.equal(rateioOk.somaRateadaFrete, 100);
  assert.deepEqual(
    rateioOk.rateios.map((r) => r.vFreteCte),
    [33.33, 33.33, 33.34]
  );

  // Tomador 4 (Outros) com CNPJ da empresa ativa também libera rateio
  const cteToma4 = extrairDadosXmlCte(criarXmlCteFixture({ tomaIndicador: '4', cnpjTomador: CNPJ_ATIVA }));
  assert.equal(verificarEmpresaTomadoraCte(cteToma4, CNPJ_ATIVA).ehTomadoraNaAquisicaoFob, true);

  // Bloqueios obrigatórios: CIF (toma3 = 0) e CNPJ divergente
  const cteCif = extrairDadosXmlCte(criarXmlCteFixture({ tomaIndicador: '0', cnpjTomador: CNPJ_FORNECEDOR }));
  const rateioCif = ratearCteSobreItensNfe(itens, cteCif, { cnpjEmpresaAtiva: CNPJ_ATIVA });
  assert.equal(rateioCif.aplicado, false);
  assert.ok(rateioCif.motivoBloqueio);

  const cteTerceiro = extrairDadosXmlCte(criarXmlCteFixture({ tomaIndicador: '4', cnpjTomador: CNPJ_TERCEIRO }));
  const rateioTerceiro = ratearCteSobreItensNfe(itens, cteTerceiro, { cnpjEmpresaAtiva: CNPJ_ATIVA });
  assert.equal(rateioTerceiro.aplicado, false);

  // Priorização de peso bruto quando disponível no critério 'auto'
  const itensPeso = [
    criarItemNfeBase({ index: 1, cProd: 'P1', vProd: 500, pesoBruto: 10 }),
    criarItemNfeBase({ index: 2, cProd: 'P2', vProd: 500, pesoBruto: 30 }),
  ];
  const rateioPeso = ratearCteSobreItensNfe(itensPeso, cteDest, { cnpjEmpresaAtiva: CNPJ_ATIVA, criterio: 'auto' });
  assert.equal(rateioPeso.criterioUtilizado, 'peso');
  assert.deepEqual(
    rateioPeso.rateios.map((r) => r.vFreteCte),
    [25, 75]
  );
});

// ════════════════════════════════════════════════════════════════════════════
// CENÁRIO 4: DESTINAÇÃO AUSENTE OU AMBÍGUA (SEM ZERAR SILENCIOSAMENTE)
// ════════════════════════════════════════════════════════════════════════════
test('CENÁRIO 4 — Destinação ausente/ambígua preserva flag de pendência e DIFAL sem zerar silenciosamente', () => {
  const empLp = criarEmpresaFixture({ regimeTributario: 'LUCRO_PRESUMIDO' });
  const ctxLp = resolverContextoEmpresaNaData({ empresaAtiva: empLp, dataEmissao: '2026-06-15' });

  for (const destAmbigua of [undefined, '', 'nao_definida']) {
    const aud = construirItemFiscalAuditado({
      item: criarItemNfeBase(),
      documento: { dhEmi: '2026-06-15', ufOrigem: 'SP', ufDestino: 'PR', emitCrt: '3' },
      contextoEmpresa: ctxLp,
      destinacao: destAmbigua,
      opcoes: { marco },
    });

    assert.equal(aud.destinacaoPendenteConfirmacao, true);
    assert.ok(aud.alertaDestinacao);
    assert.equal(aud.tributacaoEstadual.diagnosticoDifal?.exigeRecolhimento, true);
    assert.ok((aud.tributacaoEstadual.diagnosticoDifal?.valorDebitoDifal ?? 0) > 0);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CENÁRIO 5: BITEMPORALIDADE, HAND-OFF ENTRADA -> ERP -> PRECIFICAÇÃO E ESC()
// ════════════════════════════════════════════════════════════════════════════
test('CENÁRIO 5 — Propagação bitemporal Entrada -> ERP -> Precificação, Anexo IX (8432) e escape XSS', () => {
  const empHistorico = {
    id: 'emp-hist',
    escritorioId: 'esc-1',
    cnpj: CNPJ_ATIVA,
    razaoSocial: 'Indústria <script>alert(1)</script> Ltda',
    uf: 'PR',
    inscricaoEstadual: '9012345678',
    ativo: true,
    cnaePrincipal: { codigo: '2833000', descricao: 'Fabricação de máquinas e equipamentos para agricultura' },
    criadoEm: '2025-01-01T00:00:00Z',
    atualizadoEm: '2026-01-01T00:00:00Z',
    perfis: [
      {
        id: 'p-2025',
        empresaId: 'emp-hist',
        escritorioId: 'esc-1',
        regimeTributario: 'LUCRO_PRESUMIDO',
        vigenciaInicio: '2025-01-01',
        vigenciaFim: '2025-12-31',
        aliquotasEfetivas: {},
        simplesOptanteHibrido2027: false,
        beneficiosParana: { diferimentoParcialArt28: false, optanteRotSt: false, reducoesBcAtivas: [] },
        reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
        criadoEm: '2025-01-01T00:00:00Z',
        atualizadoEm: '2025-01-01T00:00:00Z',
      },
      {
        id: 'p-2026',
        empresaId: 'emp-hist',
        escritorioId: 'esc-1',
        regimeTributario: 'LUCRO_REAL',
        vigenciaInicio: '2026-01-01',
        vigenciaFim: null,
        aliquotasEfetivas: {},
        simplesOptanteHibrido2027: false,
        beneficiosParana: { diferimentoParcialArt28: false, optanteRotSt: false, reducoesBcAtivas: [] },
        reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
        criadoEm: '2026-01-01T00:00:00Z',
        atualizadoEm: '2026-01-01T00:00:00Z',
      },
    ],
  };

  assert.equal(inferirPerfilAtividadePorCnae('5611201'), 'alimentacao_3_2');
  assert.equal(inferirPerfilAtividadePorCnae('0111301'), 'rural');

  const ctx2025 = resolverContextoEmpresaNaData({ empresaAtiva: empHistorico, dataEmissao: '2025-06-15' });
  const ctx2026 = resolverContextoEmpresaNaData({ empresaAtiva: empHistorico, dataEmissao: '2026-06-15' });
  assert.equal(ctx2025.regimeTributario, 'LP');
  assert.equal(ctx2026.regimeTributario, 'LR');
  assert.equal(ctx2026.perfilAtividade, 'industria');

  const cte = extrairDadosXmlCte(criarXmlCteFixture({ tomaIndicador: '3', cnpjTomador: CNPJ_ATIVA, vTPrest: '100.00', vICMS: '12.00' }));
  const item8432 = criarItemNfeBase({
    cProd: 'MAQ-8432',
    xProd: 'Semeadora <img src=x onerror=alert(2)> Agrícola',
    ncm: '84322900',
    tributos: { pIPI: 10, vIPI: 100 },
  });

  const sessao = construirNotaFiscalAuditadaSessao({
    invoice: {
      tipoDocumento: 'XML',
      identificacao: { chaveAcesso: '41260698765432000110550010000001231000001234', dataEmissao: '2026-06-15T10:00:00-03:00' },
      emitente: { cnpj: CNPJ_FORNECEDOR, uf: 'SP', crt: '3' },
      destinatario: { cnpj: CNPJ_ATIVA, uf: 'PR' },
      resumoFinanceiro: { vProdTotal: 1000, vNF: 1100 },
      totalItens: 1,
      itens: [item8432],
    },
    contextoEmpresa: ctx2026,
    destinacaoPadrao: 'insumo_industrial',
    cteFob: cte,
    marco,
  });

  const aud = sessao.itens[0];
  assert.equal(aud.tributacaoReforma.cClassTrib, '200038');
  assert.equal(aud.tributacaoReforma.requerConferenciaAnexoIX, true);
  assert.equal(aud.tributacaoReforma.enquadramentoPendente, true);
  // NCM 84322900 (máquina agrícola) possui alíquota seletiva interna de 12% no PR (Lei 11.580/96)
  assert.equal(aud.tributacaoEstadual.aliqIcmsPrBitemporalPct, 12);

  // Item modal (NCM 61091000) em 2026 preserva alíquota modal interna do PR de 19.5%
  const audModal = construirItemFiscalAuditado({
    item: criarItemNfeBase({ ncm: '61091000' }),
    documento: { dhEmi: '2026-06-15', ufOrigem: 'SP', ufDestino: 'PR', emitCrt: '3' },
    contextoEmpresa: ctx2026,
    destinacao: 'revenda',
    opcoes: { marco },
  });
  assert.equal(audModal.tributacaoEstadual.aliqIcmsPrBitemporalPct, 19.5);

  const paraErp = converterAuditadoParaParametrizacao(aud, marco);
  const paraPrec = converterAuditadoParaPrecificacao(aud);

  assert.equal(paraErp.cClassTribSugerido, '200038');
  assert.equal(paraErp.custoCpc16?.cmvLiquidoUnitario, aud.custoCpc16.cmvLiquidoUnitario);
  assert.equal(paraErp.itemAuditado?.contextoEmpresa.regimeTributario, 'LR');

  assert.equal(paraPrec.cmvLiquidoUnitarioAuditado, aud.custoCpc16.cmvLiquidoUnitario);
  assert.equal(paraPrec.freteCteFobRateado, 100);
  assert.equal(paraPrec.ipiEntrada, 0); // LR Indústria recuperou os R$ 100 de IPI
  assert.equal(paraPrec.credIcmsEntrada, 132); // 120 NF-e + 12 CT-e
  assert.equal(paraPrec.credPisCofinsEntrada, 89.54); // 81,40 NF-e + 8,14 CT-e
  assert.equal(paraPrec.itemAuditado?.tributacaoEstadual.aliqIcmsPrBitemporalPct, 12);

  // Relatórios HTML e TXT escapados
  const payloadErp = {
    contexto: { emitente: { nome: empHistorico.razaoSocial, cnpj: CNPJ_ATIVA, uf: 'PR', regime: 'real', crt: '3' } },
    itens: [
      {
        cProd: paraErp.codigoProduto,
        xProd: paraErp.descricao,
        ncm: paraErp.ncm,
        cfop: paraErp.cfopSaidaSugerido,
        cClassTrib: paraErp.cClassTribSugerido,
        custoCpc16: paraErp.custoCpc16,
      },
    ],
  };
  const htmlRes = gerarRelatorioErpResumidoHtml(payloadErp);
  const htmlDet = gerarRelatorioErpDetalhadoHtml(payloadErp);
  const txtRes = gerarRelatorioErpResumidoTxt(payloadErp);

  assert.match(htmlRes, /Segregação de Custos de Entrada \(CPC 16 R1\)/);
  assert.match(htmlDet, /Segregação de Custos de Entrada \(CPC 16 R1\)/);
  assert.match(txtRes, /SEGREGAÇÃO DE CUSTOS CPC 16 \(R1\)/);
  assert.ok(!htmlRes.includes('<script>alert(1)</script>'));
  assert.ok(!htmlDet.includes('<img src=x onerror=alert(2)>'));
});
