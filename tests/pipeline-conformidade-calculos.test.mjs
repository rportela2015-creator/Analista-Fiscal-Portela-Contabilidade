/**
 * Bateria de conformidade de PIPELINE e DEPENDÊNCIAS de cálculo de impostos.
 * Operações INTERNAS (PR) e EXTERNAS (interestaduais / importação) + paridade entre motores.
 *
 * Princípios:
 *  - Valores esperados vêm de fórmulas independentes (lei) ou de invariantes, nunca copiados da saída do motor.
 *  - Falhas "duras" (assert) cobrem o que DEVE estar correto hoje.
 *  - Divergências CONHECIDAS entre motores são registradas via divergencia(...): imprimem "DIVERGÊNCIA"
 *    e não quebram o portão, exceto com CONFORMIDADE_STRICT=1 (aí falham).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mods } from 'ncm:libs';

import matriz from '../rules/icms-pr-matriz.json';
import { resolverAliquotaPrBitemporal, verificarExclusaoStPr } from '../lib/engine/matriz-icms-pr.ts';
import { calcularDiferimentoParcialPR, calcularReducaoBcEEstornoPR, calcularIcmsStPR } from '../lib/engine/icms-pr-regras.ts';
import { apurarDifalEntradaPR } from '../lib/engine/difal-pr.ts';
import {
  calcularDifalItemEntradaPR,
  calcularPrazoRecolhimentoDifalPR,
  apurarDemonstrativoDifalEntradaPR,
  consolidarMultiplasNotasDifalPR,
} from '../lib/fiscal/difal-pr.ts';
import {
  calcularCmvLiquidoPR,
  calcularPrecoVenda2026PR,
  simularPrecificacaoDualStack2027PR,
} from '../lib/engine/precificacao-pr-2027.ts';

const STRICT = process.env.CONFORMIDADE_STRICT === '1';
const divergencias = [];
function divergencia(id, descricao, conforme) {
  if (conforme) return;
  divergencias.push({ id, descricao });
  console.log(`   DIVERGÊNCIA [${id}] ${descricao}`);
  if (STRICT) assert.fail(`[${id}] ${descricao}`);
}
after(() => {
  console.log(`\n=== RESUMO DE DIVERGÊNCIAS CONHECIDAS: ${divergencias.length} ===`);
  for (const d of divergencias) console.log(` - [${d.id}] ${d.descricao}`);
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const perto = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

// ───────── Dataset / marco (mesmo shim de fetch dos demais testes) ─────────
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

const erp = (ncm, over = {}) =>
  gerarParametrizacaoErpResumida(
    { codigo: 'T', descricao: 'teste', ncm, confiancaNcmPct: 95, origemNcm: 'MOTOR' },
    { regimeSaida: 'presumido', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2026, ...over },
    ds, null, marco
  );

// ════════════════════════════════════════════════════════════════════════════
// 1. OPERAÇÕES INTERNAS (PR)
// ════════════════════════════════════════════════════════════════════════════
test('INT-1 Alíquota modal PR bitemporal (18% → 19% em 12/03/2023 → 19,5% em 18/03/2024) nas viradas exatas', () => {
  const casos = [
    ['2023-03-11', 18], ['2023-03-12', 19], ['2024-03-17', 19], ['2024-03-18', 19.5], ['2026-11-26', 19.5],
  ];
  for (const [data, esperado] of casos) {
    assert.equal(resolverAliquotaPrBitemporal('61091000', data).aliquotaIcmsPct, esperado, `modal em ${data}`);
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

test('INT-3 Alíquotas seletivas por NCM (Art. 14 Lei 11.580/96) e FECOP somado ao total', () => {
  const d = '2026-06-01';
  assert.equal(resolverAliquotaPrBitemporal('02013000', d).aliquotaTotalPct, 7);      // carnes
  assert.equal(resolverAliquotaPrBitemporal('22030000', d).aliquotaTotalPct, 29);     // cerveja 27 + 2 FECOP
  assert.equal(resolverAliquotaPrBitemporal('33030010', d).aliquotaTotalPct, 25);     // perfume 23 + 2 FECOP
  assert.equal(resolverAliquotaPrBitemporal('87032310', d).aliquotaTotalPct, 25);     // automóvel
  assert.equal(resolverAliquotaPrBitemporal('84322900', d).aliquotaTotalPct, 12);     // máquina agrícola
  const perf = resolverAliquotaPrBitemporal('33030010', d);
  assert.equal(r2(perf.aliquotaIcmsPct + perf.aliquotaFecopPct), perf.aliquotaTotalPct);
});

test('INT-4 FECOP não sobrescreve silenciosamente a alíquota seletiva (consistência interna da matriz)', () => {
  for (const f of matriz.fecop_anexo_xii.itens) {
    for (const p of f.prefixos_ncm) {
      const ncm = p.padEnd(8, '0');
      const sel = matriz.aliquotas_seletivas_pr.find(
        (s) => s.prefixos_ncm.some((x) => ncm.startsWith(x) || p.startsWith(x)) && !(s.excluir_ncms || []).some((e) => ncm.startsWith(e))
      );
      if (!sel) continue;
      const total = resolverAliquotaPrBitemporal(ncm, '2026-06-01').aliquotaTotalPct;
      divergencia(`MATRIZ-FECOP-${p}`, `NCM ${p}: seletiva declarada ${sel.aliquota_pct}% × total do motor ${total}% (base ${f.base_icms_pct}+${f.fecop_pct} FECOP)`,
        perto(total, sel.aliquota_pct, 0.001));
    }
  }
});

test('INT-5 Combustíveis monofásicos ad rem: ICMS percentual zero e ad rem informado (LC 192/2022; Conv. ICMS 127/128/2026)', () => {
  const g = resolverAliquotaPrBitemporal('27101259', '2026-06-01');
  assert.equal(g.tipoAliquota, 'monofasica');
  assert.equal(g.ehCombustivelMonofasico, true);
  assert.equal(g.aliquotaIcmsPct, 0);
  assert.ok(g.aliquotaAdRem > 0, 'ad rem deve ser positivo');
});

test('INT-6 Diferimento parcial Art. 28: carga 12%, BC = valor×12/alíq, trava Simples/consumidor final/interestadual/combustível', () => {
  const v = 1000, a = 19.5;
  const ok = calcularDiferimentoParcialPR({ valorOperacao: v, aliqInternaPct: a, ufOrigem: 'PR', ufDestino: 'PR', crtEmitente: 3, crtDestinatario: 3 });
  assert.equal(ok.aplicavel, true);
  assert.equal(ok.cargaEfetiva, 12);
  assert.ok(perto(ok.bcTributada, r2(v * 12 / a), 0.01));
  assert.ok(perto(ok.icmsDestacado, r2(ok.bcTributada * a / 100), 0.01));
  assert.ok(perto(ok.icmsDiferido, r2(v * a / 100 - ok.icmsDestacado), 0.01), 'diferido = ICMS pleno − destacado');
  for (const extra of [{ crtDestinatario: 1 }, { destinatarioConsumidorFinal: true }, { ehCombustivel: true }, { ufDestino: 'SP' }, { ufOrigem: 'SP' }]) {
    const b = calcularDiferimentoParcialPR({ valorOperacao: v, aliqInternaPct: a, ufOrigem: 'PR', ufDestino: 'PR', crtEmitente: 3, crtDestinatario: 3, ...extra });
    assert.equal(b.aplicavel, false, `deveria bloquear: ${JSON.stringify(extra)}`);
    assert.equal(b.icmsDiferido, 0);
  }
});

test('INT-7 Redução de BC Anexo VI e estorno/manutenção de crédito (Arts. 45 IV / 46 II): invariantes', () => {
  for (const perfil of ['MAQUINAS_INDUSTRIAIS_ANEXO_VI_ITEM_21', 'CESTA_BASICA_ANEXO_VI_ITEM_9']) {
    const r = calcularReducaoBcEEstornoPR({ perfil, valorOperacao: 10000, aliqInternaPct: 19.5, creditoIcmsEntrada: 1950, manutencaoCredito: true });
    assert.ok(r.bcReduzida <= 10000);
    assert.ok(perto(r.icmsDevido, r2(r.bcReduzida * 19.5 / 100), 0.01), `${perfil}: ICMS devido = BC reduzida × alíquota`);
    assert.ok(perto(r.icmsDevido, r2(10000 * r.cargaEfetivaPct / 100), 0.02), `${perfil}: ICMS devido = valor × carga efetiva`);
    assert.ok(perto(r.creditoLiquidoMantido, r2(1950 - r.valorEstornoCredito), 0.01));
    assert.ok(r.valorEstornoCredito >= 0 && r.percentualEstornoCredito >= 0);
  }
  const g = calcularReducaoBcEEstornoPR({ perfil: 'GENERICO_ANEXO_VI', valorOperacao: 10000, aliqInternaPct: 19.5, cargaEfetivaGenericaPct: 7, creditoIcmsEntrada: 1950, manutencaoCredito: false });
  assert.ok(perto(g.valorEstornoCredito, r2(1950 * g.percentualEstornoCredito / 100), 0.02), 'estorno = crédito × % de estorno');
  assert.ok(g.percentualEstornoCredito > 0, 'sem manutenção expressa, o estorno proporcional (Art. 45, IV) deve ser > 0');
});

test('INT-8 ICMS-ST: MVA ajustada = ((1+MVA)(1−alqInter)/(1−alqIntra))−1; BC ST, ICMS-ST e crédito de origem', () => {
  const r = calcularIcmsStPR({ ncm: '22021000', cest: '03.007.00', dataFatoGerador: '2026-06-01', vProd: 1000,
    aliqInternaPrPct: 19.5, ufOrigem: 'SP', ufDestino: 'PR', crtEmitente: 3, aliqInterestadualPct: 12, mvaOriginalPct: 40 });
  const mvaAj = (1.4 * (1 - 0.12) / (1 - 0.195) - 1) * 100;
  assert.equal(r.sujeitoSt, true);
  assert.ok(perto(r.mvaEfetivaPct, mvaAj, 0.01), `MVA ajustada esperada ${mvaAj.toFixed(2)} obtida ${r.mvaEfetivaPct}`);
  assert.ok(perto(r.bcSt, r2(1000 * (1 + mvaAj / 100)), 0.05));
  assert.ok(perto(r.valorIcmsSt, r2(r.bcSt * 0.195 - 120), 0.05));
});

test('INT-9 Trava Conv. ICMS 35/2011: emitente do Simples Nacional não usa MVA ajustada', () => {
  const r = calcularIcmsStPR({ ncm: '22021000', cest: '03.007.00', dataFatoGerador: '2026-06-01', vProd: 1000,
    aliqInternaPrPct: 19.5, ufOrigem: 'SP', ufDestino: 'PR', crtEmitente: 1, aliqInterestadualPct: 12, mvaOriginalPct: 40 });
  assert.equal(r.mvaAjustada, false);
  assert.equal(r.mvaEfetivaPct, 40);
});

test('INT-10 Exclusões de ST por Decreto PR 6.048/2024 e 12.828/2026 são bitemporais', () => {
  const nb = { ncm: '84713012', cest: '21.028.00', vProd: 1000, aliqInternaPrPct: 19.5, mvaOriginalPct: 40, ufOrigem: 'SP', ufDestino: 'PR', aliqInterestadualPct: 12 };
  assert.equal(calcularIcmsStPR({ ...nb, dataFatoGerador: '2026-02-28' }).sujeitoSt, true, 'antes de 01/03/2026 ainda há ST');
  const depois = calcularIcmsStPR({ ...nb, dataFatoGerador: '2026-03-01' });
  assert.equal(depois.sujeitoSt, false);
  assert.match(depois.decretoExclusao, /12\.828\/2026/);
  const pl = { ncm: '39241000', cest: '19.001.00', vProd: 1000, aliqInternaPrPct: 19.5, mvaOriginalPct: 40 };
  assert.equal(calcularIcmsStPR({ ...pl, dataFatoGerador: '2024-07-31' }).sujeitoSt, true);
  const pl2 = calcularIcmsStPR({ ...pl, dataFatoGerador: '2024-08-01' });
  assert.equal(pl2.sujeitoSt, false);
  assert.match(pl2.decretoExclusao, /6\.048\/2024/);
  assert.equal(verificarExclusaoStPr('84713012', '21.028.00', '2026-06-01').excluidoDaSt, true);
});

test('INT-11 Combustível monofásico ad rem NÃO pode ser tratado como ST comum com MVA genérico', () => {
  const r = calcularIcmsStPR({ ncm: '27101259', cest: '06.001.00', dataFatoGerador: '2026-06-01', vProd: 1000, aliqInternaPrPct: 19.5, mvaOriginalPct: 40 });
  divergencia('ST-MONOFASICO', `calcularIcmsStPR trata gasolina (27101259) como ST por MVA ${r.mvaEfetivaPct}% (criterio=${r.criterioBase}); deveria ser monofásico ad rem`,
    !(r.sujeitoSt && r.criterioBase === 'MVA'));
});

// ════════════════════════════════════════════════════════════════════════════
// 2. OPERAÇÕES EXTERNAS: DIFAL (interestadual), importação, prazos, consolidação
// ════════════════════════════════════════════════════════════════════════════
const difal = (o) => calcularDifalItemEntradaPR({ ncm: '84713012', ufEmitente: 'SP', ufDestinatario: 'PR', dataFatoGerador: '2026-06-01',
  vProd: 1000, cfop: '6556', destinacao: 'uso_consumo', pIcmsOrigemPct: 12, ...o });

test('EXT-1 DIFAL base dupla: independente por fórmula (SP→PR, uso/consumo e ativo imobilizado)', () => {
  for (const destinacao of ['uso_consumo', 'ativo_imobilizado']) {
    const d = difal({ destinacao });
    const base = (1000 - 120) / (1 - 0.195);
    assert.ok(perto(d.baseDupla, base), `base ${d.baseDupla} vs ${base.toFixed(2)}`);
    assert.ok(perto(d.valorDifalTotal, base * 0.195 - 120));
    assert.equal(d.exigeRecolhimento, true);
    assert.ok(d.codigosEfd.includes('E310') && d.codigosEfd.includes('PR239999'));
  }
});

test('EXT-2 DIFAL importação (origem 1/2/3/8 → 4%) usa 4% e não 12%', () => {
  const d = difal({ origemMercadoria: 1, pIcmsOrigemPct: undefined });
  assert.equal(d.aliqInter, 4);
  const base = (1000 - 40) / (1 - 0.195);
  assert.ok(perto(d.valorDifalTotal, base * 0.195 - 40));
});

test('EXT-3 DIFAL dispensado: revenda, industrialização, ST anterior (CST 60), operação interna e saída do PR', () => {
  for (const o of [{ destinacao: 'comercializacao' }, { destinacao: 'industrializacao' }, { cstIcms: '60' }, { ufEmitente: 'PR' }, { ufDestinatario: 'SP' }]) {
    const d = difal(o);
    assert.equal(d.exigeRecolhimento, false, JSON.stringify(o));
    assert.equal(d.valorDifalTotal, 0);
    assert.ok(d.motivoDispensa);
  }
});

test('EXT-4 DIFAL bitemporal: usa 19% em 2024-01-01 e 19,5% em 2024-03-18', () => {
  const a = difal({ dataFatoGerador: '2024-01-01' }), b = difal({ dataFatoGerador: '2024-03-18' });
  assert.equal(a.aliqIntraPR, 19);
  assert.equal(b.aliqIntraPR, 19.5);
  assert.ok(a.valorDifalTotal < b.valorDifalTotal);
});

test('EXT-5 Prazo e guia: GR-PR 1015 (dia 12), DeSTDA (dia 20 do 2º mês), GNRE antes da saída, dispensado', () => {
  const n = calcularPrazoRecolhimentoDifalPR('2026-06-15', 'inscrito_normal', true);
  assert.equal(n.guia, 'GR-PR 1015'); assert.equal(n.dataVencimento, '2026-07-12');
  assert.equal(calcularPrazoRecolhimentoDifalPR('2026-12-31', 'inscrito_normal', true).dataVencimento, '2027-01-12');
  const s = calcularPrazoRecolhimentoDifalPR('2026-06-15', 'simples_nacional', true);
  assert.equal(s.guia, 'DeSTDA/GR-PR'); assert.equal(s.dataVencimento, '2026-08-20');
  assert.equal(calcularPrazoRecolhimentoDifalPR('2026-06-15', 'nao_inscrito', true).guia, 'GNRE');
  assert.equal(calcularPrazoRecolhimentoDifalPR('2026-06-15', 'inscrito_normal', false).guia, 'DISPENSADO');
});

const nota = (num, data, itens) => ({
  identificacao: { chaveAcesso: `4126${num}`, numero: String(num), dataEmissao: data },
  emitente: { uf: 'SP', crt: '3' }, destinatario: { uf: 'PR' },
  itens: itens.map((it, i) => ({ index: i + 1, cProd: `P${i + 1}`, xProd: it.x, ncm: it.ncm, cfop: it.cfop || '6556', vProd: it.v,
    tributos: { pICMS: 12, vICMS: it.v * 0.12, orig: 0, cstIcms: it.cst || '00' } })),
});

test('EXT-6 Somatório da nota = soma dos itens; consolidado multi-nota = soma das notas', () => {
  const n1 = apurarDemonstrativoDifalEntradaPR(nota(1, '2026-06-10', [{ x: 'a', ncm: '84713012', v: 1000 }, { x: 'b', ncm: '33030010', v: 500 }, { x: 'c', ncm: '84713012', v: 300, cfop: '6102' }]), { crtDestinatario: 3, inscritoEstadualPR: true, destinacaoPadrao: 'uso_consumo', destinacaoPorItem: { 3: 'comercializacao' } });
  const n2 = apurarDemonstrativoDifalEntradaPR(nota(2, '2026-07-10', [{ x: 'd', ncm: '85171231', v: 2000 }]), { crtDestinatario: 3, inscritoEstadualPR: true, destinacaoPadrao: 'uso_consumo' });
  for (const n of [n1, n2]) {
    const soma = (k) => r2(n.itens.reduce((a, i) => a + i[k], 0));
    assert.ok(perto(n.somatorio.totalDifalGeral, soma('valorDifalTotal'), 0.02));
    assert.ok(perto(n.somatorio.totalFecop, soma('valorFecop'), 0.02));
    assert.ok(perto(n.somatorio.totalDifalPrincipal, soma('valorDifalPrincipal'), 0.02));
    assert.equal(n.somatorio.qtdItensTributados, n.itens.filter((i) => i.exigeRecolhimento).length);
  }
  assert.equal(n1.somatorio.qtdItensTributados, 2);
  const c = consolidarMultiplasNotasDifalPR([n1, n2]);
  assert.equal(c.qtdNotas, 2);
  assert.ok(perto(c.totalDifalGeral, n1.somatorio.totalDifalGeral + n2.somatorio.totalDifalGeral, 0.02));
});

test('EXT-7 Paridade entre os dois motores de DIFAL: o TOTAL (DIFAL+FECOP) coincide; a repartição pode diferir com FECOP', () => {
  const ncms = ['84713012', '85171231', '33030010', '22030000', '71131100', '87032310', '61091000'];
  for (const ncm of ncms) {
    for (const [orig, pInter] of [[0, 12], [1, 4]]) {
      const a = difal({ ncm, origemMercadoria: orig, pIcmsOrigemPct: pInter });
      const b = apurarDifalEntradaPR({ ncm, finalidadeEntrada: 'uso_consumo', crtEmitente: 3, crtDestinatario: 3, ufEmitente: 'SP', ufDestinatario: 'PR',
        dataFatoGerador: '2026-06-01', vProd: 1000, pIcmsOrigemPct: pInter, origemMercadoria: orig });
      assert.ok(perto(a.valorDifalTotal, b.valorTotalDebito ?? b.valorTotalRecolher, 0.05),
        `NCM ${ncm} origem ${orig}: fiscal/difal-pr=${a.valorDifalTotal} × engine/difal-pr=${b.valorTotalDebito ?? b.valorTotalRecolher}`);
      if (a.fecop > 0) divergencia(`DIFAL-SPLIT-${ncm}-${orig}`, `NCM ${ncm}: repartição DIFAL/FECOP difere (${a.valorDifalPrincipal}/${a.valorFecop} × ${b.valorDebitoDifal}/${b.valorDebitoFecop}) — mesmo total, guias/EFD podem diferir`,
        perto(a.valorFecop, b.valorDebitoFecop ?? b.valorFecop, 0.05));
    }
  }
});

test('EXT-8 NT 2026.008: vProd permanece sem IBS/CBS/IS e leiaute é reconhecido; ST retida (CST 60) é lida', async () => {
  const { extrairDadosXmlNfe } = await import('../lib/extrator-nfe.ts');
  const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe41260100000000000191550010000001001000001001"><ide><dhEmi>2026-06-10T10:00:00-03:00</dhEmi><nNF>100</nNF></ide>
<emit><CNPJ>11111111000191</CNPJ><xNome>Forn SP</xNome><enderEmit><UF>SP</UF></enderEmit><CRT>3</CRT></emit><dest><CNPJ>22222222000191</CNPJ><xNome>Dest PR</xNome><enderDest><UF>PR</UF></enderDest></dest>
<det nItem="1"><prod><cProd>1</cProd><xProd>Item</xProd><NCM>84713012</NCM><CFOP>6556</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>1000.00</vUnCom><vProd>1000.00</vProd></prod>
<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>12.00</pICMS><vICMS>120.00</vICMS></ICMS00></ICMS>
<gIBSCBS><cClassTrib>000001</cClassTrib><CST>000</CST><vBC>1000.00</vBC><pIBS>0.10</pIBS><vIBS>1.00</vIBS><pCBS>0.90</pCBS><vCBS>9.00</vCBS></gIBSCBS></imposto></det>
<total><ICMSTot><vProd>1000.00</vProd><vNF>1000.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  const e = extrairDadosXmlNfe(xml);
  const it = e.itens[0];
  assert.equal(it.vProd, 1000, 'vProd não pode embutir IBS/CBS');
  assert.equal(it.tributos.vIBS, 1);
  assert.equal(it.tributos.vCBS, 9);
  assert.equal(it.tributos.cClassTrib, '000001');
});

test('EXT-9 CT-e: não há leitor de CT-e no pipeline de ingestão (lacuna de cobertura registrada)', async () => {
  const { readdir } = await import('node:fs/promises');
  const arquivos = (await readdir('lib')).filter((f) => f.endsWith('.ts'));
  let achou = false;
  for (const f of arquivos) {
    const src = await readFile(`lib/${f}`, 'utf8');
    if (/cteProc|infCte\b/.test(src)) achou = true;
  }
  divergencia('CTE-SEM-LEITOR', 'Nenhum módulo lê XML de CT-e (cteProc/infCte); frete de entrada só entra como vFrete da NF-e', achou);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. CMV / PRECIFICAÇÃO (CPC 16 R1, Tema 69, transição 2026–2027)
// ════════════════════════════════════════════════════════════════════════════
test('PRC-1 CMV (CPC 16 R1): crédito ICMS, base PIS/COFINS sem ICMS (Tema 69), DIFAL e frete incorporados ao custo', () => {
  const real = calcularCmvLiquidoPR({ valorProdutos: 1000, vIcmsOrigem: 120, regimeComprador: 'LUCRO_REAL' });
  assert.equal(real.creditoIcmsLiquido, 120);
  assert.ok(perto(real.baseCreditoPisCofins, 880));
  assert.ok(perto(real.creditoPisCofins, 880 * 0.0925));
  assert.ok(perto(real.cmvLiquido, 1000 - 120 - 880 * 0.0925));
  const semT69 = calcularCmvLiquidoPR({ valorProdutos: 1000, vIcmsOrigem: 120, regimeComprador: 'LUCRO_REAL', aplicarTema69CreditoPisCofins: false });
  assert.ok(semT69.baseCreditoPisCofins > real.baseCreditoPisCofins, 'sem Tema 69 a base inclui o ICMS');
  const pres = calcularCmvLiquidoPR({ valorProdutos: 1000, vIcmsOrigem: 120, regimeComprador: 'LUCRO_PRESUMIDO' });
  assert.equal(pres.creditoPisCofins, 0);
  assert.ok(perto(pres.cmvLiquido, 880));
  const sn = calcularCmvLiquidoPR({ valorProdutos: 1000, vIcmsOrigem: 120, regimeComprador: 'SIMPLES_NACIONAL' });
  assert.equal(sn.creditoIcmsLiquido, 0, 'Simples não apropria crédito de ICMS destacado');
  assert.ok(perto(sn.cmvLiquido, 1000));
  const comDifal = calcularCmvLiquidoPR({ valorProdutos: 1000, vFrete: 100, vIcmsOrigem: 120, vDifalOuAntecipacaoEntrada: 50, regimeComprador: 'LUCRO_REAL' });
  assert.ok(perto(comDifal.valorTotalNotaEntrada, 1150));
  assert.ok(perto(comDifal.baseCreditoPisCofins, 1150 - 120 - 50), 'DIFAL não gera crédito PIS/COFINS');
  assert.ok(perto(comDifal.cmvLiquido, 1150 - 120 - comDifal.creditoPisCofins));
});

test('PRC-2 Preço por dentro (mark-up divisor): fecha margem alvo e exclui ICMS da base PIS/COFINS', () => {
  const p = calcularPrecoVenda2026PR({ cmvLiquido: 800, aliquotaIcmsEfetivaSaidaPct: 19.5, aliquotaPisCofinsSaidaPct: 9.25, despesasVariaveisPct: 5, margemAlvoPct: 10 });
  assert.ok(perto(p.valorIcmsSaida, p.precoVenda * 0.195, 0.05));
  assert.ok(perto(p.basePisCofinsSaida, p.precoVenda - p.valorIcmsSaida, 0.05), 'Tema 69: base PIS/COFINS = preço − ICMS');
  const margem = p.precoVenda - 800 - p.valorIcmsSaida - p.valorPisCofinsSaida - p.valorDespesasVariaveis;
  assert.ok(perto(margem / p.precoVenda, 0.10, 0.0005), `margem líquida realizada ${(margem / p.precoVenda * 100).toFixed(3)}%`);
});

test('PRC-3 Transição 2027 (Consulta SEFA/PR 48/2026 × tese judicial): sem IBS/CBS os modos coincidem; com IBS/CBS a SEFA é maior', () => {
  const zero = simularPrecificacaoDualStack2027PR({ precoLiquidoSemTributos: 1000, aliquotaIcmsPrPct: 19.5, aliquotaCbsPct: 0, aliquotaIbsPct: 0 });
  assert.ok(perto(zero.precoFinalModo1, 1000 / 0.805));
  assert.ok(perto(zero.precoFinalModo1, zero.precoFinalModo2));
  const iva = simularPrecificacaoDualStack2027PR({ precoLiquidoSemTributos: 1000, aliquotaIcmsPrPct: 19.5, aliquotaCbsPct: 8.8, aliquotaIbsPct: 0.1 });
  assert.ok(iva.precoFinalModo1 > iva.precoFinalModo2);
  assert.ok(perto(iva.efeitoCascataReais, iva.precoFinalModo1 - iva.precoFinalModo2, 0.02));
});

// ════════════════════════════════════════════════════════════════════════════
// 4. DEPENDÊNCIAS E PARIDADE ENTRE MOTORES (ERP / Lote / Precificação × matriz PR)
// ════════════════════════════════════════════════════════════════════════════
test('DEP-1 Camadas: lib/engine e lib/fiscal não importam components/app e o grafo de imports é acíclico', async () => {
  const { readdir } = await import('node:fs/promises');
  const grafo = new Map();
  for (const dir of ['lib/engine', 'lib/fiscal']) {
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.ts'))) {
      const src = await readFile(`${dir}/${f}`, 'utf8');
      const imps = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const i of imps) assert.ok(!/components|\/app\//.test(i), `${dir}/${f} importa camada de UI: ${i}`);
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

test('DEP-2 Cada motor que formula preço/parâmetro de ICMS PR consome a matriz bitemporal e a exclusão de ST', async () => {
  const alvos = ['lib/lote-erp.ts', 'lib/precificacao.ts', 'lib/parametrizacao.ts', 'lib/engine/orquestrador-fiscal.ts', 'components/Precificar.tsx'];
  for (const f of alvos) {
    const src = await readFile(f, 'utf8');
    const usaMatriz = /resolverAliquotaPrBitemporal|matriz-icms-pr/.test(src);
    const usaExclusao = /verificarExclusaoStPr|calcularIcmsStPR/.test(src);
    const fixos = (src.match(/\b19\.5\b/g) || []).length;
    divergencia(`DEP-MATRIZ-${f}`, `${f} não consome resolverAliquotaPrBitemporal/matriz-icms-pr (19.5 literal ×${fixos})`, usaMatriz);
    divergencia(`DEP-ST-${f}`, `${f} não consulta exclusão de ST nem calcularIcmsStPR (MVA fixo)`, usaExclusao || /calculadora|icms-pr-regras/.test(src));
  }
});

test('DEP-3 ERP × matriz: ICMS nominal PR→PR por NCM deve coincidir com a matriz bitemporal', () => {
  for (const ncm of ['02013000', '22030000', '33030010', '87032310', '84322900', '61091000', '85171231']) {
    const m = resolverAliquotaPrBitemporal(ncm, '2026-06-01');
    const l = erp(ncm);
    divergencia(`ERP-ALIQ-${ncm}`, `NCM ${ncm}: ERP ${l.aliqIcmsNominalPct}% × matriz ${m.aliquotaIcmsPct}%`, perto(l.aliqIcmsNominalPct, m.aliquotaIcmsPct, 0.001));
  }
});

test('DEP-4 ERP × exclusão de ST (Decretos): NCM excluído não pode sair com CST 60, CFOP 5405 e MVA', () => {
  for (const ncm of ['84713012', '85163100', '85171231']) {
    const ex = verificarExclusaoStPr(ncm, (ds.byD8.get(ncm)?.cest || [])[0], '2026-06-01');
    const l = erp(ncm);
    if (ex.excluidoDaSt) {
      divergencia(`ERP-ST-${ncm}`, `NCM ${ncm} excluído da ST (${ex.decreto}) mas ERP gerou CST ${l.cstOuCsosnIcms}, CFOP ${l.cfopSaida}, MVA ${l.mvaOriginalPct}%`,
        l.cstOuCsosnIcms !== '60' && l.cfopSaida !== '5405' && l.mvaOriginalPct === 0);
    }
  }
});

test('DEP-5 ERP × combustível monofásico ad rem e coerência CST/redução de base', () => {
  const g = erp('27101259');
  divergencia('ERP-MONOFASICO', `Gasolina: ERP gerou ICMS ${g.aliqIcmsNominalPct}%, CST ${g.cstOuCsosnIcms}, MVA ${g.mvaOriginalPct}% (esperado ad rem, sem MVA)`,
    g.mvaOriginalPct === 0 && g.cstOuCsosnIcms !== '60');
  const adubo = erp('31051000');
  divergencia('ERP-RED-100-CST20', `Adubo: redução de BC ${adubo.redBcIcmsPct}% com CST ${adubo.cstOuCsosnIcms} (CST 20 exige redução parcial)`,
    !(adubo.redBcIcmsPct >= 100 && adubo.cstOuCsosnIcms === '20'));
  assert.ok(adubo.redBcIcmsPct >= 0 && adubo.redBcIcmsPct <= 100);
});

test('DEP-6 cClassTrib emitido existe na tabela oficial e o tipo (zero/redução) bate com o percentual aplicado', () => {
  const tab = new Map(reformaJson.classificacoes.map((c) => [c.c, c]));
  for (const ncm of ['31051000', '38089199', '84322900', '30049069', '10063021', '07133319']) {
    const l = erp(ncm);
    const c = tab.get(l.cClassTrib);
    divergencia(`CCLASS-EXISTE-${ncm}`, `NCM ${ncm}: cClassTrib ${l.cClassTrib} não existe na tabela oficial`, Boolean(c));
    if (c && l.redIbsCbsPct === 100) divergencia(`CCLASS-ZERO-${ncm}`, `NCM ${ncm}: redução 100% mas ${l.cClassTrib} = "${c.tt}"`, /zero/i.test(c.tt));
    if (c && l.redIbsCbsPct === 60) divergencia(`CCLASS-60-${ncm}`, `NCM ${ncm}: redução 60% mas ${l.cClassTrib} = "${c.tt}"`, /60%/.test(c.tt));
  }
});

test('DEP-7 cBenef emitido pelo ERP precisa vir de tabela validada (SEFA/PR Tabela 5.2)', () => {
  const emitidos = ['31051000', '84322900'].map((n) => erp(n).cBenefPr).filter((c) => c !== 'SEM_CBENEF');
  divergencia('CBENEF-SEM-TABELA', `cBenef ${[...new Set(emitidos)].join(', ')} é constante embutida (lote-erp.ts), sem tabela por NCM/norma`, emitidos.length === 0);
});

test('DEP-8 Regime de saída propaga para PIS/COFINS e cClassTrib sem valores residuais (2026 × 2027)', () => {
  const real = erp('61091000', { regimeSaida: 'real', anoCalendario: 2026 });
  const pres = erp('61091000', { regimeSaida: 'presumido', anoCalendario: 2026 });
  const sn = erp('61091000', { regimeSaida: 'simples', anoCalendario: 2026 });
  const r27 = erp('61091000', { regimeSaida: 'real', anoCalendario: 2027 });
  assert.deepEqual([real.aliqPisPct, real.aliqCofinsPct], [1.65, 7.6]);
  assert.deepEqual([pres.aliqPisPct, pres.aliqCofinsPct], [0.65, 3]);
  assert.deepEqual([sn.aliqPisPct, sn.aliqCofinsPct], [0, 0]);
  assert.deepEqual([r27.aliqPisPct, r27.aliqCofinsPct], [0, 0], 'PIS/COFINS extintos em 2027');
  assert.equal(sn.cstOuCsosnIcms, '102');
});
