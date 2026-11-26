/**
 * Bateria ESTRITA de Conformidade de Pipeline, Matriz PR, DIFAL, Precificação e Blindagem IA.
 * Todas as asserções falham em caso de regressão ou divergência entre motores.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mods } from 'ncm:libs';

import matriz from '../rules/icms-pr-matriz.json';
import cbenefTabela from '../rules/cbenef-pr.json';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from '../lib/engine/matriz-icms-pr.ts';
import { calcularDiferimentoParcialPR, calcularReducaoBcEEstornoPR, calcularIcmsStPR } from '../lib/engine/icms-pr-regras.ts';
import { resolverCbenefPr, consultarMvaStPr } from '../lib/engine/tabelas-pr.ts';
import { apurarDifalEntradaPR } from '../lib/engine/difal-pr.ts';
import {
  calcularDifalItemEntradaPR,
  calcularPrazoRecolhimentoDifalPR,
  apurarDemonstrativoDifalEntradaPR,
  consolidarMultiplasNotasDifalPR,
} from '../lib/fiscal/difal-pr.ts';
import { validarClassTribOficial } from '../lib/fiscal/reforma-tabela-oficial.ts';
import {
  calcularCmvLiquidoPR,
  calcularPrecoVenda2026PR,
  simularPrecificacaoDualStack2027PR,
  compararFornecedoresCustoAterrissadoPR,
} from '../lib/engine/precificacao-pr-2027.ts';
import {
  validarClassTribIA,
  validarCstCsosnIA,
  validarCbenefIA,
  validarMvaIA,
} from '../lib/ai/validar.ts';
import { sanearClassificacao, sanearCodificacaoErpIA } from '../lib/ai/sanear-classificacao.ts';

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const perto = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

// ───────── Dataset / marco ─────────
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
const ds = await mods.data.loadDataset();
await ds.pronto;
const marco = await mods.marco.loadMarcoLegal();
const reformaJson = JSON.parse(await readFile('public/data/reforma.json', 'utf8'));
const { gerarParametrizacaoErpResumida } = mods['lote-erp'];
const { sugerirAliquotasPrecificacao, calcularCustoAquisicaoReal } = mods.preco;

const erp = (ncm, over = {}) =>
  gerarParametrizacaoErpResumida(
    { codigo: 'T', descricao: 'teste', ncm, confiancaNcmPct: 95, origemNcm: 'MOTOR' },
    { regimeSaida: 'presumido', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2026, ...over },
    ds, null, marco
  );

// ════════════════════════════════════════════════════════════════════════════
// 1. OPERAÇÕES INTERNAS (PR) E SANEAMENTO DA MATRIZ
// ════════════════════════════════════════════════════════════════════════════
test('INT-1 Alíquota modal PR bitemporal (18% → 19% em 12/03/2023 → 19,5% em 18/03/2024)', () => {
  const casos = [
    ['2023-03-11', 18], ['2023-03-12', 19], ['2024-03-17', 19], ['2024-03-18', 19.5], ['2026-11-26', 19.5],
  ];
  for (const [data, esperado] of casos) {
    const res = resolverAliquotaPrBitemporal('61091000', data);
    assert.equal(res.aliquotaIcmsPct, esperado, `modal em ${data}`);
    assert.equal(res.aliquotaBasePct, esperado);
  }
});

test('INT-2 Vigências modais da matriz são contíguas, sem lacuna nem sobreposição', () => {
  const v = [...matriz.aliquota_modal_pr].sort((a, b) => a.vigencia_inicio.localeCompare(b.vigencia_inicio));
  const dia = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  for (let i = 1; i < v.length; i++) {
    assert.ok(v[i - 1].vigencia_fim, `vigência ${i - 1} deveria ter fim`);
    assert.equal(v[i].vigencia_inicio, dia(v[i - 1].vigencia_fim, 1), `lacuna/sobreposição entre vigências ${i - 1} e ${i}`);
  }
  assert.equal(v[v.length - 1].vigencia_fim, null, 'última vigência deve ser aberta');
});

test('INT-3 Alíquotas seletivas por NCM e composição explícita aliquotaBasePct + fecopPct', () => {
  const d = '2026-06-01';
  assert.equal(resolverAliquotaPrBitemporal('02013000', d).aliquotaTotalPct, 7);
  assert.equal(resolverAliquotaPrBitemporal('22030000', d).aliquotaTotalPct, 29);
  assert.equal(resolverAliquotaPrBitemporal('33030010', d).aliquotaTotalPct, 25);
  assert.equal(resolverAliquotaPrBitemporal('87032310', d).aliquotaTotalPct, 25);
  assert.equal(resolverAliquotaPrBitemporal('84322900', d).aliquotaTotalPct, 12);
  const perf = resolverAliquotaPrBitemporal('33030010', d);
  assert.equal(r2(perf.aliquotaBasePct + perf.fecopPct), perf.aliquotaTotalPct);
});

test('INT-4 Nenhum prefixo com FECOP resulta em total inferior à seletiva; 5 prefixos marcados para conferência', () => {
  for (const f of matriz.fecop_anexo_xii.itens) {
    assert.ok(f.aliquotaBasePct !== undefined && f.fecopPct !== undefined, `${f.id} deve separar aliquotaBasePct e fecopPct`);
    for (const p of f.prefixos_ncm) {
      const ncm = p.padEnd(8, '0');
      const sel = matriz.aliquotas_seletivas_pr.find(
        (s) => s.prefixos_ncm.some((x) => ncm.startsWith(x) || p.startsWith(x)) && !(s.excluir_ncms || []).some((e) => ncm.startsWith(e))
      );
      const r = resolverAliquotaPrBitemporal(ncm, '2026-06-01');
      assert.equal(r.aliquotaTotalPct, r2(r.aliquotaBasePct + r.fecopPct));
      if (sel) {
        assert.ok(r.aliquotaTotalPct >= sel.aliquota_pct, `NCM ${p}: total ${r.aliquotaTotalPct}% < seletiva ${sel.aliquota_pct}%`);
      }
    }
  }
  for (const pPendente of ['22011000', '22021000', '22042100', '71131100', '71141100']) {
    const r = resolverAliquotaPrBitemporal(pPendente, '2026-06-01');
    assert.equal(r.validacaoNormativa, 'pendente_conferencia_lei_11580', `NCM ${pPendente} deve expor metadado de conferência normativa`);
  }
});

test('INT-4B Prefixo amplo 190590 exige NCM 8d listado e não presume 7% sem conferência', () => {
  const b = resolverAliquotaPrBitemporal('19059090', '2026-06-01');
  assert.equal(b.aliquotaIcmsPct, 19.5, '19059090 não deve presumir 7% automaticamente');
  assert.equal(b.requerConferenciaNormativa, true);
  assert.match(b.motivoConferenciaNormativa || '', /190590/);
});

test('INT-5 Combustíveis monofásicos ad rem (LC 192/2022; Convênios ICMS 127/2026 e 128/2026)', () => {
  const g = resolverAliquotaPrBitemporal('27101259', '2026-06-01');
  assert.equal(g.tipoAliquota, 'monofasica');
  assert.equal(g.ehCombustivelMonofasico, true);
  assert.equal(g.aliquotaIcmsPct, 0);
  assert.ok(g.aliquotaAdRem > 0);
});

test('INT-6 Diferimento parcial Art. 28 + cBenef validado da Tabela 5.2', () => {
  const v = 1000, a = 19.5;
  const ok = calcularDiferimentoParcialPR({ valorOperacao: v, aliqInternaPct: a, ufOrigem: 'PR', ufDestino: 'PR', crtEmitente: 3, crtDestinatario: 3 });
  assert.equal(ok.aplicavel, true);
  assert.equal(ok.cargaEfetiva, 12);
  assert.equal(ok.cBenefReferencia, 'PR830001');
  assert.ok(perto(ok.bcTributada, r2(v * 12 / a), 0.01));
  assert.ok(perto(ok.icmsDestacado, r2(ok.bcTributada * a / 100), 0.01));
  assert.ok(perto(ok.icmsDiferido, r2(v * a / 100 - ok.icmsDestacado), 0.01));
  for (const extra of [{ crtDestinatario: 1 }, { destinatarioConsumidorFinal: true }, { ehCombustivel: true }, { ufDestino: 'SP' }, { ufOrigem: 'SP' }]) {
    const b = calcularDiferimentoParcialPR({ valorOperacao: v, aliqInternaPct: a, ufOrigem: 'PR', ufDestino: 'PR', crtEmitente: 3, crtDestinatario: 3, ...extra });
    assert.equal(b.aplicavel, false);
    assert.equal(b.icmsDiferido, 0);
  }
});

test('INT-7 Redução de BC Anexo VI e estorno/manutenção de crédito (Arts. 45 IV / 46 II)', () => {
  for (const perfil of ['MAQUINAS_INDUSTRIAIS_ANEXO_VI_ITEM_21', 'CESTA_BASICA_ANEXO_VI_ITEM_9']) {
    const r = calcularReducaoBcEEstornoPR({ perfil, valorOperacao: 10000, aliqInternaPct: 19.5, creditoIcmsEntrada: 1950, manutencaoCredito: true });
    assert.ok(r.bcReduzida <= 10000);
    assert.ok(perto(r.icmsDevido, r2(r.bcReduzida * 19.5 / 100), 0.01));
    assert.ok(perto(r.icmsDevido, r2(10000 * r.cargaEfetivaPct / 100), 0.02));
    assert.ok(perto(r.creditoLiquidoMantido, r2(1950 - r.valorEstornoCredito), 0.01));
  }
  const g = calcularReducaoBcEEstornoPR({ perfil: 'GENERICO_ANEXO_VI', valorOperacao: 10000, aliqInternaPct: 19.5, cargaEfetivaGenericaPct: 7, creditoIcmsEntrada: 1950, manutencaoCredito: false });
  assert.ok(perto(g.valorEstornoCredito, r2(1950 * g.percentualEstornoCredito / 100), 0.02));
  assert.ok(g.percentualEstornoCredito > 0);
});

test('INT-8/9/10/11 ICMS-ST, Conv. 35/2011, Decretos PR 6.048/2024 e 12.828/2026 e bloqueio de monofásico', () => {
  // NCM 87082999 (Autopeças, 19.5% sem FECOP)
  const r = calcularIcmsStPR({ ncm: '87082999', cest: '01.001.00', dataFatoGerador: '2026-06-01', vProd: 1000,
    aliqInternaPrPct: 19.5, ufOrigem: 'SP', ufDestino: 'PR', crtEmitente: 3, aliqInterestadualPct: 12, mvaOriginalPct: 40 });
  const mvaAj = (1.4 * (1 - 0.12) / (1 - 0.195) - 1) * 100;
  assert.equal(r.sujeitoSt, true);
  assert.ok(perto(r.mvaEfetivaPct, mvaAj, 0.01));
  assert.ok(perto(r.bcSt, r2(1000 * (1 + mvaAj / 100)), 0.05));
  assert.ok(perto(r.valorIcmsSt, r2(r.bcSt * 0.195 - 120), 0.05));

  // NCM 22021000 com FECOP 2% herdado automaticamente da matriz PR
  const rFecop = calcularIcmsStPR({ ncm: '22021000', cest: '03.007.00', dataFatoGerador: '2026-06-01', vProd: 1000,
    ufOrigem: 'SP', ufDestino: 'PR', crtEmitente: 3, aliqInterestadualPct: 12 });
  assert.equal(rFecop.sujeitoSt, true);
  assert.equal(rFecop.aliquotaInternaPrTotalPct, 20);
  assert.ok(rFecop.valorFecopSt > 0);

  const sn = calcularIcmsStPR({ ncm: '22021000', cest: '03.007.00', dataFatoGerador: '2026-06-01', vProd: 1000,
    aliqInternaPrPct: 19.5, ufOrigem: 'SP', ufDestino: 'PR', crtEmitente: 1, aliqInterestadualPct: 12, mvaOriginalPct: 40 });
  assert.equal(sn.mvaAjustada, false);
  assert.equal(sn.mvaEfetivaPct, 40);

  const nb = { ncm: '84713012', cest: '21.028.00', vProd: 1000, aliqInternaPrPct: 19.5, mvaOriginalPct: 40, ufOrigem: 'SP', ufDestino: 'PR', aliqInterestadualPct: 12 };
  assert.equal(calcularIcmsStPR({ ...nb, dataFatoGerador: '2026-02-28' }).sujeitoSt, true);
  const depois = calcularIcmsStPR({ ...nb, dataFatoGerador: '2026-03-01' });
  assert.equal(depois.sujeitoSt, false);
  assert.match(depois.decretoExclusao, /12\.828\/2026/);

  const mono = calcularIcmsStPR({ ncm: '27101259', cest: '06.001.00', dataFatoGerador: '2026-06-01', vProd: 1000, mvaOriginalPct: 40 });
  assert.equal(mono.sujeitoSt, false);
  assert.equal(mono.criterioBase, 'NAO_APLICAVEL');
  assert.equal(mono.mvaEfetivaPct, 0);
  assert.equal(mono.valorIcmsSt, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. OPERAÇÕES EXTERNAS: DIFAL (núcleo único), importação, prazos, NT 2026.008
// ════════════════════════════════════════════════════════════════════════════
const difal = (o) => calcularDifalItemEntradaPR({ ncm: '84713012', ufEmitente: 'SP', ufDestinatario: 'PR', dataFatoGerador: '2026-06-01',
  vProd: 1000, cfop: '6556', destinacao: 'uso_consumo', pIcmsOrigemPct: 12, ...o });

test('EXT-1..6 DIFAL base dupla, importação 4%, dispensas, bitemporal, prazos e somatório', () => {
  for (const destinacao of ['uso_consumo', 'ativo_imobilizado']) {
    const d = difal({ destinacao });
    const base = (1000 - 120) / (1 - 0.195);
    assert.ok(perto(d.baseDupla, base));
    assert.ok(perto(d.valorDifalTotal, base * 0.195 - 120));
    assert.equal(d.exigeRecolhimento, true);
    assert.ok(d.codigosEfd.includes('E310') && d.codigosEfd.includes('PR239999'));
  }

  const imp = difal({ origemMercadoria: 1, pIcmsOrigemPct: undefined });
  assert.equal(imp.aliqInter, 4);

  for (const o of [{ destinacao: 'comercializacao' }, { destinacao: 'industrializacao' }, { ncm: '73181500', cstIcms: '60' }, { ufEmitente: 'PR' }, { ufDestinatario: 'SP' }]) {
    const d = difal(o);
    assert.equal(d.exigeRecolhimento, false, JSON.stringify(o));
    assert.equal(d.valorDifalTotal, 0);
  }
  // NCM 84713012 excluído da ST em 2026-06-01 (Decreto 12.828/2026) NÃO tem dispensa válida por CST 60
  assert.equal(difal({ ncm: '84713012', cstIcms: '60' }).exigeRecolhimento, true);

  const n = calcularPrazoRecolhimentoDifalPR('2026-06-15', 'inscrito_normal', true);
  assert.equal(n.guia, 'GR-PR 1015'); assert.equal(n.dataVencimento, '2026-07-12');
  const s = calcularPrazoRecolhimentoDifalPR('2026-06-15', 'simples_nacional', true);
  assert.equal(s.guia, 'DeSTDA/GR-PR'); assert.equal(s.dataVencimento, '2026-08-20');
  assert.equal(calcularPrazoRecolhimentoDifalPR('2026-06-15', 'nao_inscrito', true).guia, 'GNRE');
});

test('EXT-6B Destinação ambígua ("consumo") normaliza para uso_consumo com alerta estruturado explícito', () => {
  const viaFiscal = calcularDifalItemEntradaPR({
    ncm: '84713012', ufEmitente: 'SP', ufDestinatario: 'PR', dataFatoGerador: '2026-06-01',
    vProd: 1000, destinacao: 'consumo', pIcmsOrigemPct: 12,
  });
  assert.equal(viaFiscal.destinacao, 'uso_consumo');
  assert.equal(viaFiscal.exigeRecolhimento, true);
  assert.ok(viaFiscal.valorDifalTotal > 90);
  assert.ok(viaFiscal.alertas.some((a) => /ALERTA DESTINAÇÃO AMBÍGUA/i.test(a)));

  const viaEngine = apurarDifalEntradaPR({
    ncm: '84713012', ufEmitente: 'SP', ufDestinatario: 'PR', dataFatoGerador: '2026-06-01',
    vProd: 1000, finalidadeEntrada: 'consumo', crtEmitente: 3, crtDestinatario: 3, pIcmsOrigemPct: 12,
  });
  assert.equal(viaEngine.valorTotalDebito, viaFiscal.valorDifalTotal);
  assert.ok((viaEngine.alertasAuditoria || []).some((a) => /ALERTA DESTINAÇÃO AMBÍGUA/i.test(a)));
});

test('EXT-7 Paridade total entre lib/fiscal/difal-pr.ts e núcleo único lib/engine/difal-pr.ts', () => {
  const ncms = ['84713012', '85171231', '33030010', '22030000', '22042100', '71131100', '87032310', '61091000'];
  for (const ncm of ncms) {
    for (const [orig, pInter] of [[0, 12], [1, 4]]) {
      const a = difal({ ncm, origemMercadoria: orig, pIcmsOrigemPct: pInter });
      const b = apurarDifalEntradaPR({ ncm, finalidadeEntrada: 'uso_consumo', crtEmitente: 3, crtDestinatario: 3, ufEmitente: 'SP', ufDestinatario: 'PR',
        dataFatoGerador: '2026-06-01', vProd: 1000, pIcmsOrigemPct: pInter, origemMercadoria: orig });
      assert.equal(a.baseDupla, b.baseCalculoDifal);
      assert.equal(a.valorDifalPrincipal, b.valorDebitoDifal);
      assert.equal(a.valorFecop, b.valorDebitoFecop);
      assert.equal(a.valorDifalTotal, b.valorTotalDebito);
    }
  }
});

test('EXT-8 NT 2026.008: vProd permanece sem IBS/CBS/IS e extrator reconhece grupo IBSCBS', async () => {
  const { extrairDadosXmlNfe } = await import('../lib/extrator-nfe.ts');
  const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe41260100000000000191550010000001001000001001"><ide><dhEmi>2026-06-10T10:00:00-03:00</dhEmi><nNF>100</nNF></ide>
<emit><CNPJ>11111111000191</CNPJ><xNome>Forn SP</xNome><enderEmit><UF>SP</UF></enderEmit><CRT>3</CRT></emit><dest><CNPJ>22222222000191</CNPJ><xNome>Dest PR</xNome><enderDest><UF>PR</UF></enderDest></dest>
<det nItem="1"><prod><cProd>1</cProd><xProd>Item</xProd><NCM>84713012</NCM><CFOP>6556</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>1000.00</vUnCom><vProd>1000.00</vProd></prod>
<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>12.00</pICMS><vICMS>120.00</vICMS></ICMS00></ICMS>
<gIBSCBS><cClassTrib>000001</cClassTrib><CST>000</CST><vBC>1000.00</vBC><pIBS>0.10</pIBS><vIBS>1.00</vIBS><pCBS>0.90</pCBS><vCBS>9.00</vCBS></gIBSCBS></imposto></det>
<total><ICMSTot><vProd>1000.00</vProd><vNF>1000.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  const e = extrairDadosXmlNfe(xml);
  assert.equal(e.itens[0].vProd, 1000);
  assert.equal(e.itens[0].tributos.vIBS, 1);
  assert.equal(e.itens[0].tributos.vCBS, 9);
  assert.equal(e.itens[0].tributos.cClassTrib, '000001');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. CMV / PRECIFICAÇÃO (CPC 16 R1, Tema 69, transição 2026–2027)
// ════════════════════════════════════════════════════════════════════════════
test('PRC-1..3 CPC 16 R1, Tema 69 e Dual-Stack 2027 (SEFA/PR 48/2026 vs tese judicial)', () => {
  const real = calcularCmvLiquidoPR({ valorProdutos: 1000, vIcmsOrigem: 120, regimeComprador: 'LUCRO_REAL' });
  assert.ok(perto(real.baseCreditoPisCofins, 880));
  assert.ok(perto(real.cmvLiquido, 1000 - 120 - 880 * 0.0925));

  const p = calcularPrecoVenda2026PR({ cmvLiquido: 800, aliquotaIcmsEfetivaSaidaPct: 19.5, aliquotaPisCofinsSaidaPct: 9.25, despesasVariaveisPct: 5, margemAlvoPct: 10 });
  assert.ok(perto(p.basePisCofinsSaida, p.precoVenda - p.valorIcmsSaida, 0.05));

  const iva = simularPrecificacaoDualStack2027PR({ precoLiquidoSemTributos: 1000, aliquotaIcmsPrPct: 19.5, aliquotaCbsPct: 8.8, aliquotaIbsPct: 0.1 });
  assert.ok(iva.precoFinalModo1 > iva.precoFinalModo2);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. DEPENDÊNCIAS E PARIDADE EM MODO ESTRITO (DEP-1 .. DEP-8)
// ════════════════════════════════════════════════════════════════════════════
test('DEP-1 Camadas: lib/engine e lib/fiscal não importam UI e o grafo de imports é acíclico', async () => {
  const { readdir } = await import('node:fs/promises');
  const grafo = new Map();
  for (const dir of ['lib/engine', 'lib/fiscal']) {
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.ts'))) {
      const src = await readFile(`${dir}/${f}`, 'utf8');
      const imps = [...src.matchAll(/^(?!import\s+type\b).*?from\s+'([^']+)'/gm)].map((m) => m[1]);
      for (const i of imps) assert.ok(!/components|\/app\//.test(i), `${dir}/${f} importa camada de UI em runtime: ${i}`);
      grafo.set(`${dir}/${f}`.replace(/\.ts$/, ''), imps.filter((i) => i.startsWith('.')).map((i) => {
        const p = new URL(i, `file:///${dir}/${f}`).pathname.slice(1);
        return p.replace(/\.ts$/, '');
      }));
    }
  }
  const estado = new Map();
  const visita = (n, pilha) => {
    if (estado.get(n) === 2 || !grafo.has(n)) return;
    assert.notEqual(estado.get(n), 1, `ciclo: ${[...pilha, n].join(' → ')}`);
    estado.set(n, 1);
    for (const m of grafo.get(n)) visita(m, [...pilha, n]);
    estado.set(n, 2);
  };
  for (const n of grafo.keys()) visita(n, []);
});

test('DEP-2 Motores de ERP, Precificação e Orquestrador consomem matriz PR e exclusão ST', async () => {
  for (const f of ['lib/lote-erp.ts', 'lib/precificacao.ts', 'lib/engine/precificacao-pr-2027.ts', 'lib/engine/orquestrador-fiscal.ts', 'components/Precificar.tsx']) {
    const src = await readFile(f, 'utf8');
    assert.ok(/resolverAliquotaPrBitemporal/.test(src), `${f} deve consumir resolverAliquotaPrBitemporal`);
    assert.ok(/verificarExclusaoStPr/.test(src), `${f} deve consumir verificarExclusaoStPr`);
  }
});

test('DEP-3 Paridade ERP × Matriz PR × Precificação por NCM (seletivas e modal)', () => {
  for (const ncm of ['02013000', '22030000', '33030010', '87032310', '84322900', '61091000', '85171231']) {
    const m = resolverAliquotaPrBitemporal(ncm, '2026-06-01');
    const l = erp(ncm);
    assert.equal(l.aliqIcmsNominalPct, m.aliquotaIcmsPct, `ERP NCM ${ncm}`);
    const sug = sugerirAliquotasPrecificacao({
      ncm, ano: 2026, regime: 'presumido', ufOrigem: 'PR', ufDestino: 'PR', marco,
      destinatarioContribuinte: false,
    });
    assert.equal(sug.aliquotasSugeridas.icmsCompraPct, m.aliquotaIcmsPct, `Precificação compra NCM ${ncm}`);
  }
});

test('DEP-4 NCMs excluídos da ST (Decretos PR 6.048/2024 e 12.828/2026) nunca saem com CST 60, CFOP 5405 ou MVA > 0', () => {
  for (const ncm of ['84713012', '85163100', '85171231', '39241000']) {
    const ex = verificarExclusaoStPr(ncm, (ds.byD8.get(ncm)?.cest || [])[0], '2026-06-01');
    assert.equal(ex.excluidoDaSt, true);
    const l = erp(ncm);
    assert.notEqual(l.cstOuCsosnIcms, '60');
    assert.notEqual(l.cfopSaida, '5405');
    assert.equal(l.mvaOriginalPct, 0);

    const custo = calcularCustoAquisicaoReal(
      { codigo: 'X', descricao: 'teste', ncm, quantidade: 1, valorBrutoEntrada: 1000, temSt: true, ufOrigem: 'SP', ufDestino: 'PR' },
      'presumido', { ufOrigem: 'SP', ufDestino: 'PR', marco }
    );
    assert.equal(custo.tributosNaoRecuperaveis.icmsSt, 0, `NCM ${ncm} excluído não deve provisionar ST antecipada`);
  }

  const mesa = compararFornecedoresCustoAterrissadoPR({
    regimeComprador: 'LUCRO_PRESUMIDO',
    ncm: '84713012',
    dataFatoGerador: '2026-06-01',
    sujeitoStPr: true,
    cotacoes: [{ id: 'sp', nome: 'SP', ufEmitente: 'SP', crtEmitente: 3, precoUnitario: 1000 }],
  });
  assert.equal(mesa.cotacoesRanqueadas[0].icmsStEntrada, 0);
});

test('DEP-5 Combustível monofásico (CST 61, ICMS 0%, MVA 0) e vedação de CST 20 com redução 100%', () => {
  const g = erp('27101259');
  assert.equal(g.cstOuCsosnIcms, '61');
  assert.equal(g.aliqIcmsNominalPct, 0);
  assert.equal(g.mvaOriginalPct, 0);
  assert.notEqual(g.cfopSaida, '5405');

  const adubo = erp('31051000');
  assert.notEqual(adubo.cstOuCsosnIcms, '20');
  assert.ok(adubo.cstOuCsosnIcms === '51' || adubo.cstOuCsosnIcms === '40');
});

test('DEP-6 cClassTrib oficial validado em reforma.json e remoção de 000001 como fallback silencioso', () => {
  const tab = new Map(reformaJson.classificacoes.map((c) => [c.c, c]));
  for (const ncm of ['31051000', '38089199', '84322900', '30049069', '10063021', '07133319', '09012100']) {
    const l = erp(ncm);
    assert.ok(tab.has(l.cClassTrib), `NCM ${ncm}: cClassTrib ${l.cClassTrib} deve existir em reforma.json`);
    const v = validarClassTribOficial(l.cClassTrib, l.redIbsCbsPct);
    assert.equal(v.valido, true, v.motivo);
    if (ncm === '84322900') {
      assert.equal(l.enquadramentoPendente, true);
      assert.match(l.justificativaEnquadramento || '', /Anexo IX/i);
    } else {
      assert.notEqual(l.enquadramentoPendente, true);
    }
  }

  const semRegra = erp('61091000');
  assert.equal(semRegra.cClassTrib, '');
  assert.equal(semRegra.enquadramentoPendente, true);
  assert.ok(semRegra.justificativaEnquadramento);
});

test('DEP-7 cBenef exclusivamente da Tabela 5.2 (rules/cbenef-pr.json) + bloqueio CST 10 (Rejeição 928)', () => {
  const codigosOficiais = new Set(cbenefTabela.itens.map((i) => i.codigo));
  for (const ncm of ['31051000', '84322900', '61091000']) {
    const l = erp(ncm);
    if (l.cBenefPr !== 'SEM_CBENEF') {
      assert.ok(codigosOficiais.has(l.cBenefPr), `${l.cBenefPr} fora de rules/cbenef-pr.json`);
    }
  }
  const rej928 = resolverCbenefPr({ codigo: 'PR820001', cst: '10', ncm: '84322900' });
  assert.equal(rej928.valido, false);
  assert.equal(rej928.bloqueadoRejeicao928, true);
  assert.equal(rej928.cBenef, 'SEM_CBENEF');

  const inventado = resolverCbenefPr({ codigo: 'PR999999', cst: '20', ncm: '84322900' });
  assert.equal(inventado.valido, false);
  assert.equal(inventado.cBenef, 'SEM_CBENEF');
});

test('DEP-8 Propagação de regime 2026 × 2027 e MVA oficial da tabela Anexo IX', () => {
  const real = erp('61091000', { regimeSaida: 'real', anoCalendario: 2026 });
  const pres = erp('61091000', { regimeSaida: 'presumido', anoCalendario: 2026 });
  const sn = erp('61091000', { regimeSaida: 'simples', anoCalendario: 2026 });
  const r27 = erp('61091000', { regimeSaida: 'real', anoCalendario: 2027 });
  assert.deepEqual([real.aliqPisPct, real.aliqCofinsPct], [1.65, 7.6]);
  assert.deepEqual([pres.aliqPisPct, pres.aliqCofinsPct], [0.65, 3]);
  assert.deepEqual([sn.aliqPisPct, sn.aliqCofinsPct], [0, 0]);
  assert.deepEqual([r27.aliqPisPct, r27.aliqCofinsPct], [0, 0]);
  assert.equal(sn.cstOuCsosnIcms, '102');
  assert.equal(consultarMvaStPr({ ncm: '33030010', dataFatoGerador: '2026-06-01' }).mvaOriginalPct, 58);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. BLINDAGEM ANTI-ALUCINAÇÃO DA IA (cClassTrib, cBenef, CST e MVA)
// ════════════════════════════════════════════════════════════════════════════
test('IA-1..4 Blindagem determinística rejeita cClassTrib inexistente, CST 20+100%, cBenef em CST 10 e MVA excluída', () => {
  // cClassTrib inexistente (100001) ou incompatível com 60% (200001)
  assert.equal(validarClassTribIA('100001').valido, false);
  assert.equal(validarClassTribIA('200001', 60).valido, false);
  assert.equal(validarClassTribIA('200038', 60).valido, true);

  // CST 20 + 100% sanitizado para CST 40; combustível monofásico exigindo CST 61
  assert.equal(validarCstCsosnIA('20', 'presumido', { redBcIcmsPct: 100 }).cstOuCsosn, '40');
  assert.equal(validarCstCsosnIA('60', 'real', { ehMonofasico: true }).cstOuCsosn, '61');

  // Rejeição 928 em CST 10
  const cb = validarCbenefIA('PR820001', '10', '84322900');
  assert.equal(cb.valido, false);
  assert.equal(cb.cBenef, 'SEM_CBENEF');
  assert.equal(cb.bloqueadoRejeicao928, true);

  // MVA em NCM excluído pelo Decreto 12.828/2026 zerada
  const mvaExcl = validarMvaIA(40, '84713012', '2102800', '2026-06-01');
  assert.equal(mvaExcl.valido, false);
  assert.equal(mvaExcl.mvaOriginalPct, 0);

  // Saneamento integrado
  const mapaD8 = new Map([['84713012', { ncm: '8471.30.12', desc: 'Máquinas automáticas portáteis' }]]);
  const saneado = sanearClassificacao(
    { ncm: '84713012', confianca: 'ALTA', cClassTrib: '100001', cBenefPr: 'PR999999', cstOuCsosnIcms: '20', redBcIcmsPct: 100, mvaOriginalPct: 40 },
    mapaD8,
    { regime: 'presumido', dataFatoGerador: '2026-06-01' }
  );
  assert.equal(saneado.cClassTrib, '');
  assert.equal(saneado.enquadramentoPendente, true);
  assert.equal(saneado.cBenefPr, 'SEM_CBENEF');
  assert.equal(saneado.cstOuCsosnIcms, '40');
  assert.equal(saneado.mvaOriginalPct, 0);

  const erpIa = sanearCodificacaoErpIA(
    { ncm: '27101259', cstOuCsosnIcms: '60', cBenefPr: 'PR820001', mvaOriginalPct: 40, cClassTrib: '200001', redIbsCbsPct: 60 },
    { regime: 'real', dataFatoGerador: '2026-06-01' }
  );
  assert.equal(erpIa.cstOuCsosnIcms, '61');
  assert.equal(erpIa.cBenefPr, 'SEM_CBENEF');
  assert.equal(erpIa.mvaOriginalPct, 0);
  assert.equal(erpIa.cClassTrib, '');
  assert.ok((erpIa.avisosSaneamento || []).length >= 3);
});
