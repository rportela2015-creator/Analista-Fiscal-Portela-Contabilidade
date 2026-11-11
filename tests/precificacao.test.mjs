/**
 * Motor de precificação + marco legal.
 *  - GOLDEN: valores do oráculo Python (pricing_engine_v2.py, Decimal) e do comparativo do manual de crédito de estoque.
 *  - OFICIAL: alíquotas/reduções derivadas de public/data/reforma.json (RFB), nunca chutadas.
 *  - INVARIANTES: margem realizada = alvo e identidade preço = líquido + tributos, em grade de cenários.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mods } from 'ncm:libs';

globalThis.fetch = async (u) => {
  let url = String(u); if (url.includes('?v=')) url = url.split('?v=')[0];
  const rel = url.replace(/^\//, '');
  for (const base of ['public', '.']) {
    try { const t = await readFile(`${process.cwd()}/${base}/${rel}`, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(t) }; } catch { /* próximo */ }
  }
  return { ok: false, status: 404, json: async () => null };
};

const t = (nome, fn) => { try { fn(); console.log(`OK  ${nome}`); } catch (e) { console.log(`XX  ${nome}\n    ${e.message}`); process.exit(1); } };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b} ± ${tol}, veio ${a}`);

const reforma = await mods.data.loadReforma();
const marco = JSON.parse(await readFile(`${process.cwd()}/rules/marco-legal.json`, 'utf8'));
const ctx = { reforma, marco };
const r2 = mods.preco.r2;
const {
  simular, precificar, trajetoria, creditoEstoqueAbertura, cronogramaEstoqueAgregado,
  paramsDoClassificador, sugerirAliquotasPrecificacao, calcularCustoAquisicaoReal, compararQuatroRegimes,
  ratearDespesasAcessoriaEFrete
} = mods.preco;
const {
  aliquotasDoAno, reducaoDoClassTrib, icmsInterestadual, icmsInternoUf, irpjCsllPresumidoPct,
  obterFaixaSimples, calcularDasEfetivo, citar,
  mapearCfopEntrada, calcularMvaAjustada, calcularEstornoProporcionalIcms, listarFontesOficiaisMarcoLegal,
  obterFcpPorUf, calcularReducaoConvenioIcms, detectarReducoesFiscaisPorNcm, calcularDifalDetalhado, calcularDetalhamentoSimplesHibrido
} = mods.marco;

// ---------------------------------------------------------------------------------------------
t('marco legal: toda norma tem status válido e as ids referenciadas pelos parâmetros existem', () => {
  const ok = ['confirmado', 'confirmado_fonte_secundaria', 'conhecimento_geral', 'nao_verificado'];
  for (const n of marco.normas) assert.ok(ok.includes(n.status), `status inválido em ${n.id}`);
  const ids = new Set(marco.normas.map((n) => n.id));
  assert.equal(ids.size, marco.normas.length, 'id de norma duplicado');
  const refs = Object.values(marco.parametros).flatMap((p) => p.norma_ids || []);
  for (const r of refs) assert.ok(ids.has(r), `norma_ids aponta para id inexistente: ${r}`);
});

t('alíquotas OFICIAIS por ano: 2027 PR = CBS 8,4 / IBS 0,05+0,05; 2028 carry-forward; 2029 = oficial; 2031 derivado', () => {
  const a27 = aliquotasDoAno(reforma, marco, 2027, 'PR');
  assert.equal(a27.cbs, 8.4); assert.equal(a27.ibsUf, 0.05); assert.equal(a27.ibsMun, 0.05); assert.equal(a27.icmsFator, 1);
  const a28 = aliquotasDoAno(reforma, marco, 2028, 'PR');
  assert.equal(a28.cbs, 8.4); assert.ok(a28.notas.some((n) => /carry-forward/.test(n)), 'deveria avisar o carry-forward de 2028');
  const a29 = aliquotasDoAno(reforma, marco, 2029, 'PR', { ibsMunicipalRefPct: 2 });
  assert.equal(a29.cbs, 8.5); assert.equal(a29.ibsUf, 1.6); near(a29.ibsMun, 0.2, 1e-9); near(a29.icmsFator, 0.9, 1e-9);
  const a31 = aliquotasDoAno(reforma, marco, 2031, 'PR');
  near(a31.ibsUf, 4.8, 1e-9, 'IBS-UF 2031 = 16,0 x 30%'); near(a31.icmsFator, 0.7, 1e-9);
  assert.ok(a31.notas.some((n) => /MUNICIPAL/.test(n)), 'sem ibsMunicipalRefPct deve alertar');
  const a33 = aliquotasDoAno(reforma, marco, 2033, 'PR');
  assert.equal(a33.ibsUf, 16); assert.equal(a33.icmsFator, 0);
  assert.throws(() => aliquotasDoAno(reforma, marco, 2026, 'PR'), /2027\+/);
});

t('redução derivada do texto oficial: zero=100, 60%, 80%, 30%, integral=0, 200025 = CBS zero/IBS 60 (override)', () => {
  const ct = (c) => reforma.classificacoes.find((x) => x.c === c);
  assert.deepEqual([reducaoDoClassTrib(ct('200003'), marco).cbs, reducaoDoClassTrib(ct('200003'), marco).ibs], [100, 100]);
  assert.equal(reducaoDoClassTrib(ct('200038'), marco).cbs, 60);       // insumos agropecuários (Anexo IX)
  assert.equal(reducaoDoClassTrib(ct('200026'), marco).ibs, 80);
  assert.equal(reducaoDoClassTrib(ct('200052'), marco).cbs, 30);       // profissões intelectuais
  assert.equal(reducaoDoClassTrib(ct('000001'), marco).origem, 'nenhuma');
  const x = reducaoDoClassTrib(ct('200025'), marco);
  assert.deepEqual([x.cbs, x.ibs, x.origem], [100, 60, 'manual']);
});

t('cClassTrib 200030 é dispositivo médico (Anexo IV), NÃO fertilizante; fertilizante/insumo agro = 200038', () => {
  const ct = (c) => reforma.classificacoes.find((x) => x.c === c);
  assert.match(ct('200030').d, /dispositivos m[ée]dicos/i);
  assert.match(ct('200038').d, /insumos agropecu[áa]rios/i);
});

t('ICMS interestadual e presumido vêm do marco legal', () => {
  assert.equal(icmsInterestadual(marco, 'PR', 'BA'), 7);
  assert.equal(icmsInterestadual(marco, 'PR', 'SP'), 12);
  assert.equal(icmsInterestadual(marco, 'BA', 'SP'), 12);
  assert.equal(icmsInterestadual(marco, 'PR', 'BA', true), 4);
  assert.equal(irpjCsllPresumidoPct(marco, 'comercio'), 2.28);
});

// ---------------------------------------------------------------------------------------------
// GOLDEN
const ITEM = { codigo: 'SKU-7214', descricao: 'Vergalhão CA-50', quantidade: 1, valorBrutoEntrada: 100, credIcmsEntrada: 12 };
const OVR = { cbs: 8.7, ibs: 0.1, nota: 'golden Python (CBS ref 8,8 - 0,1; IBS 0,1)' };
const P1 = { ano: 2027, aliquotasOverride: OVR, margemLiquidaPct: 20, despesasVariaveisPct: 5, custoFixoUnit: 7, irpjCsllPct: 2.28, icmsSaidaPct: 12 };

t('GOLDEN Python caso 1 (compra 2027): preço 164,97 / vProdLiq 133,43 / CBS 11,61 / IBS 0,13 / ICMS 19,80 / lucro 26,69', () => {
  const r = simular(ITEM, P1, ctx);
  assert.equal(r.entrada.custoLiquido, 88); assert.equal(r.preco.vProdLiq, 133.43); assert.equal(r.preco.precoFinal, 164.97);
  assert.equal(r.preco.vCBS, 11.61); assert.equal(r.preco.vIBS, 0.13); assert.equal(r.preco.vICMS, 19.8);
  assert.equal(r.resultado.lucroLiquido, 26.69); assert.equal(r.resultado.precoPisoLucroZero, 128.79);
  assert.equal(r.apuracaoCaixa.cbsCaixaNoMesDaVenda, 3.95);
});

t('GOLDEN Python caso 2 (estoque de abertura, presumido em 2026): custo 79,86 / vProdLiq 121,99 / preço 150,82 / VP 7,56', () => {
  const it = { ...ITEM, estoqueAbertura: true, regimePisCofins2026: 'cumulativo' };
  const r = simular(it, { ...P1, taxaDescontoMensalPct: 1 }, ctx);
  assert.equal(r.entrada.creditoEstoque.nominal, 8.14); assert.equal(r.entrada.creditoEstoque.valorPresente, 7.56);
  assert.equal(r.entrada.custoLiquido, 79.86); assert.equal(r.preco.vProdLiq, 121.99); assert.equal(r.preco.precoFinal, 150.82);
  assert.equal(r.preco.vCBS, 10.61); assert.equal(r.preco.vICMS, 18.1); assert.equal(r.resultado.lucroLiquido, 24.4);
  assert.equal(r.apuracaoCaixa.cbsCaixaNoMesDaVenda, 10.61, 'em jan/2027 nenhuma quota liberada (apropriação em jan, 1ª parcela em fev)');
});

t('GOLDEN manual (art. 381, premissas do manual: CBS 8,8 + IBS 0,1, sem calendário): 79,86 → 106,48 → 131,77', () => {
  const it = { ...ITEM, estoqueAbertura: true, regimePisCofins2026: 'cumulativo' };
  const p = { ano: 2027, aliquotasOverride: { cbs: 8.8, ibs: 0.1 }, margemLiquidaPct: 20, despesasVariaveisPct: 5, baseDespesas: 'vprodliq', icmsSaidaPct: 12 };
  const r = simular(it, p, ctx);
  assert.equal(r.entrada.custoLiquido, 79.86); assert.equal(r.preco.vProdLiq, 106.48); assert.equal(r.preco.precoFinal, 131.77);
  assert.equal(r.resultado.lucroLiquido, 21.3);
});

t('GOLDEN Python caso 3 (lote de 10 com redução de 60%): custo 212,35 / vProdLiq 269,38 / preço 290,48 / lucro 40,41', () => {
  const it = { codigo: 'INS', descricao: 'Fertilizante NPK', quantidade: 10, valorBrutoEntrada: 2212, credCbsEntrada: 70.4, credIbsEntrada: 141.6,
               credIcmsEntrada: 88.48, pRedCbs: 60, pRedIbs: 60 };
  const r = simular(it, { ano: 2027, aliquotasOverride: OVR, margemLiquidaPct: 15, despesasVariaveisPct: 4, custoFixoUnit: 5, icmsSaidaPct: 4 }, ctx);
  assert.equal(r.entrada.custoLiquido, 212.35); assert.equal(r.preco.vProdLiq, 269.38); assert.equal(r.preco.precoFinal, 290.48);
  assert.equal(r.resultado.lucroLiquido, 40.41);
});

// ---------------------------------------------------------------------------------------------
t('crédito de estoque: não cumulativo não tem; monofásico/ST tem; importado usa o PIS/COFINS-Importação pago; cronograma fecha no nominal', () => {
  const p = { ano: 2027, margemLiquidaPct: 20, despesasVariaveisPct: 0, icmsSaidaPct: 0 };
  const base = { codigo: 'x', descricao: 'x', quantidade: 1, valorBrutoEntrada: 88, estoqueAbertura: true };
  assert.equal(creditoEstoqueAbertura({ ...base, regimePisCofins2026: 'nao_cumulativo' }, p, 88, marco).elegivel, false);
  const mono = creditoEstoqueAbertura({ ...base, regimePisCofins2026: 'monofasico_st' }, p, 88, marco);
  assert.equal(mono.elegivel, true); assert.equal(mono.nominal, 8.14);
  const imp = creditoEstoqueAbertura({ ...base, regimePisCofins2026: 'cumulativo', origem: 'importado', pisCofinsImportacaoPagoUnit: 5.5 }, p, 88, marco);
  assert.equal(imp.nominal, 5.5);
  const soma = mono.cronograma.reduce((s, c) => s + c.valorUnit, 0);
  near(soma, mono.nominal, 0.005, 'soma das 12 parcelas');
  assert.equal(mono.cronograma.length, 12); assert.equal(mono.cronograma[0].mesRelJan2027, 2);
  assert.throws(() => creditoEstoqueAbertura({ ...base, regimePisCofins2026: 'cumulativo' }, { ...p, mesApropriacao: 7 }, 88, marco), /junho/);
});

t('VP < nominal quando há taxa; modo vp abate o VP do custo; modo nenhum não abate', () => {
  const it = { ...ITEM, estoqueAbertura: true, regimePisCofins2026: 'cumulativo' };
  const r = simular(it, { ...P1, taxaDescontoMensalPct: 1.5, modoCreditoEstoque: 'vp' }, ctx);
  assert.ok(r.entrada.creditoEstoque.valorPresente < r.entrada.creditoEstoque.nominal);
  assert.equal(r.entrada.custoLiquido, r2(88 - r.entrada.creditoEstoque.valorPresente));
  assert.equal(simular(it, { ...P1, modoCreditoEstoque: 'nenhum' }, ctx).entrada.custoLiquido, 88);
});

t('caixa: após as parcelas liberadas, o CBS de caixa cai (mês 7 com apropriação em jan = 6 quotas)', () => {
  const it = { ...ITEM, estoqueAbertura: true, regimePisCofins2026: 'cumulativo' };
  const m1 = simular(it, { ...P1, mesVenda: 1 }, ctx).apuracaoCaixa;
  const m7 = simular(it, { ...P1, mesVenda: 7 }, ctx).apuracaoCaixa;
  assert.ok(m7.cbsCaixaNoMesDaVenda < m1.cbsCaixaNoMesDaVenda);
  near(m7.creditoEstoqueDisponivelNoMes, 8.14 * 6 / 12, 0.01);
});

t('cronograma agregado soma itens x quantidade', () => {
  const it = { ...ITEM, estoqueAbertura: true, regimePisCofins2026: 'cumulativo' };
  const r = simular(it, P1, ctx);
  const ag = cronogramaEstoqueAgregado([{ quantidade: 100, resultado: r }, { quantidade: 50, resultado: r }]);
  near(ag.nominal, 8.14 * 150, 0.01); assert.equal(ag.parcelas.length, 12);
  near(ag.parcelas.reduce((s, p) => s + p.valor, 0), ag.nominal, 0.05);
});

t('trajetória 2027-2033 (dados oficiais): 2033 sem ICMS; carga indireta e preço mudam com o calendário', () => {
  const tr = trajetoria(ITEM, { ano: 2027, uf: 'PR', ibsMunicipalRefPct: 2, margemLiquidaPct: 20, despesasVariaveisPct: 5, icmsSaidaPct: 12 }, ctx);
  assert.equal(tr.length, 7); assert.equal(tr[6].vICMS, 0);
  assert.ok(tr[6].vIBS > tr[0].vIBS * 50, 'IBS pleno em 2033 muito maior que o de teste de 2027');
});

t('IS ad valorem entra na base de IBS/CBS e do ICMS; ponte com o classificador deriva reduções do cClassTrib', () => {
  const sem = simular(ITEM, { ...P1, aliquotasOverride: OVR }, ctx);
  const com = simular(ITEM, { ...P1, aliquotasOverride: OVR, isSaidaPct: 10 }, ctx);
  assert.ok(com.preco.vIS > 0 && com.preco.vCBS > sem.preco.vCBS && com.preco.precoFinal > sem.preco.precoFinal);
  const ponte = paramsDoClassificador({ is: 1, adv: 20, are: 1.5, ncm: '22030000' }, reforma.classificacoes.find((x) => x.c === '200034'), marco);
  assert.equal(ponte.isSaidaPct, 20); assert.equal(ponte.pRedCbs, 60);
  assert.ok(ponte.alertas.some((a) => /ad rem/.test(a)));
  const fria = paramsDoClassificador({ is: 1, adv: null, are: null, ncm: '22030000' }, undefined, marco);
  assert.equal(fria.isSaidaPct, 0); assert.ok(fria.alertas.some((a) => /dataset frio/.test(a)), 'IS sem alíquota não pode virar 0% em silêncio');
});

t('modos: resumido (padrão) é subconjunto enxuto do detalhado; detalhado traz base legal com status', () => {
  const res = precificar(ITEM, P1, ctx);
  const det = precificar(ITEM, P1, ctx, 'detalhado');
  assert.equal(res.precoFinal, det.preco.precoFinal); assert.ok(!('baseLegal' in res));
  assert.ok(det.baseLegal.length >= 3 && det.baseLegal.every((n) => n.status));
  assert.ok(res.alertas.length <= 4);
});

t('inviabilidade: margem + despesas + IRPJ/CSLL >= 100% falha com mensagem clara', () => {
  assert.throws(() => simular(ITEM, { ...P1, margemLiquidaPct: 95, despesasVariaveisPct: 5 }, ctx), /inviáveis/);
});

t('INVARIANTES em grade (192 cenários): margem realizada ≈ alvo e preço − tributos = vProdLiq', () => {
  let n = 0;
  for (const mg of [5, 20, 35]) for (const dv of [0, 5, 12]) for (const ir of [0, 2.28]) for (const bd of ['preco_final', 'vprodliq'])
    for (const icms of [0, 12]) for (const dentro of [true, false]) for (const is of [0, 10]) {
      const r = simular({ ...ITEM, valorBrutoEntrada: 400, credIcmsEntrada: 48 },
        { ano: 2027, aliquotasOverride: OVR, margemLiquidaPct: mg, despesasVariaveisPct: dv, irpjCsllPct: ir, baseDespesas: bd,
          icmsSaidaPct: icms, incluirIvaNaBaseIcms: dentro, isSaidaPct: is }, ctx);
      near(r.resultado.margemRealizadaPct, mg, 0.1, `margem (${mg}/${dv}/${ir}/${bd}/${icms}/${dentro}/${is})`);
      const liq = r.preco.precoFinal - r.preco.vICMS - r.preco.vCBS - r.preco.vIBS - r.preco.vIS;
      near(liq, r.preco.vProdLiq, 0.03, 'identidade do preço');
      n++;
    }
  assert.equal(n, 3 * 3 * 2 * 2 * 2 * 2 * 2);
});

t('citações: base legal do resultado cita normas existentes e sinaliza as não verificadas como alerta', () => {
  const r = simular({ ...ITEM, estoqueAbertura: true, regimePisCofins2026: 'cumulativo' }, P1, ctx);
  const ids = r.baseLegal.map((n) => n.id);
  assert.ok(ids.includes('LC214-381') && ids.includes('SEFA-PR-CONS-48-2026') && ids.includes('NT-2026-008'));
  assert.ok(r.alertas.some((a) => /Split|SPLIT|pagamento|LC 214\/2025/.test(a) || /NÃO verificada/.test(a)), 'deveria alertar sobre norma não verificada');
  assert.equal(citar(marco, ['nao-existe']).length, 0);
});

// ---------------------------------------------------------------------------------------------
// NOVOS TESTES - ETAPA 2 (4 Regimes, Composição de Custo Real, Overrides, B2B e Glosa)
// ---------------------------------------------------------------------------------------------

t('composição do Custo de Aquisição Real nos 4 regimes para a mesma compra: Lucro Real menor custo, Simples maior', () => {
  // NF de compra de insumo/mercadoria com IPI, Frete, ICMS, PIS/COFINS e IBS/CBS destacados
  const nfEntrada = {
    codigo: 'COMPRA-01',
    descricao: 'Bobina de Aço',
    quantidade: 1,
    valorBrutoEntrada: 1000,
    freteSeguroOutrasEntrada: 50,
    descontoIncondicionalEntrada: 0,
    ipiEntrada: 100,
    credIcmsEntrada: 120,
    credPisCofinsEntrada: 92.5,
    credCbsEntrada: 88,
    credIbsEntrada: 1,
  };

  const cSimples = calcularCustoAquisicaoReal(nfEntrada, 'simples');
  const cHibrido = calcularCustoAquisicaoReal(nfEntrada, 'simples_hibrido');
  const cPresumido = calcularCustoAquisicaoReal(nfEntrada, 'presumido');
  const cReal = calcularCustoAquisicaoReal(nfEntrada, 'real');

  // Simples não apropria créditos: ICMS (120) e IBS/CBS (89) viram custo não recuperável (209)
  assert.equal(cSimples.impostosARecuperar.totalImpostosRecuperaveis, 0);
  assert.equal(cSimples.tributosNaoRecuperaveis.total, 309); // 100 (IPI) + 209 (ICMS/IBS/CBS)
  assert.equal(cSimples.custoAquisicaoReal, 1359); // 1000 + 50 + 309 = 1359

  // Simples Híbrido apropria créditos de IBS/CBS (88 + 1 = 89); ICMS vira custo (120)
  assert.equal(cHibrido.impostosARecuperar.totalImpostosRecuperaveis, 89);
  assert.equal(cHibrido.custoAquisicaoReal, 1181); // 1000 + 50 + 100 + 120 - 89 = 1181

  // Lucro Presumido apropria ICMS (120) + IBS/CBS (89) = 209 (PIS/COFINS 92.5 é custo cumulativo)
  assert.equal(cPresumido.impostosARecuperar.totalImpostosRecuperaveis, 209);
  assert.equal(cPresumido.custoAquisicaoReal, 1033.5); // 1000 + 50 + 100 + 92.5 - 209 = 1033.5

  // Lucro Real apropria TUDO: ICMS (120) + PIS/COFINS (92.5) + IBS/CBS (89) = 301.5
  assert.equal(cReal.impostosARecuperar.totalImpostosRecuperaveis, 301.5);
  assert.equal(cReal.custoAquisicaoReal, 848.5); // 1000 + 50 + 100 - 301.5 = 848.5

  // Hierarquia contábil irrefutável do Custo Real de Aquisição:
  assert.ok(cReal.custoAquisicaoReal < cPresumido.custoAquisicaoReal);
  assert.ok(cPresumido.custoAquisicaoReal < cHibrido.custoAquisicaoReal);
  assert.ok(cHibrido.custoAquisicaoReal < cSimples.custoAquisicaoReal);
});

t('diferença entre Simples e Simples Híbrido: redução do DAS e transferência de crédito B2B', () => {
  const itemVenda = {
    codigo: 'REV-01',
    descricao: 'Produto Revenda',
    quantidade: 1,
    valorBrutoEntrada: 100,
    credCbsEntrada: 8.8,
    credIbsEntrada: 0.1,
  };

  const pBase = {
    ano: 2027,
    aliquotasOverride: OVR,
    margemLiquidaPct: 20,
    despesasVariaveisPct: 5,
    icmsSaidaPct: 12,
    rbt12Simples: 360000, // Faixa 2: nominal 7.30%, dedução 5940 -> efetiva 5.65%
  };

  const rSimples = simular(itemVenda, { ...pBase, regime: 'simples' }, ctx);
  const rHibrido = simular(itemVenda, { ...pBase, regime: 'simples_hibrido' }, ctx);

  assert.ok(rSimples.relatorioMargens);
  assert.ok(rHibrido.relatorioMargens);

  // No Simples Híbrido, o DAS é reduzido (exclusão de ICMS/PIS/COFINS da guia)
  assert.ok(rHibrido.relatorioMargens.tributosVendaPorDentro < rSimples.relatorioMargens.tributosVendaPorDentro);

  // No Simples Híbrido, a empresa transfere crédito integral de IBS e CBS ao cliente B2B
  assert.ok(rHibrido.relatorioMargens.creditoTransferidoClienteB2B > rSimples.relatorioMargens.creditoTransferidoClienteB2B);
  assert.equal(rHibrido.relatorioMargens.creditoTransferidoClienteB2B, rHibrido.preco.vCBS + rHibrido.preco.vIBS);

  // Comparativo dos 4 regimes através da função dedicada
  const comp = compararQuatroRegimes(itemVenda, pBase, ctx);
  assert.ok(comp.regimes.simples);
  assert.ok(comp.regimes.simples_hibrido);
  assert.ok(comp.regimes.presumido);
  assert.ok(comp.regimes.real);
  assert.ok(comp.melhorMargemLiquida.regime);
  assert.ok(comp.melhorCompetitividadeB2B.regime);
});

t('sugestão automática de alíquotas com overrides: registra camposEditados e recalcula preço', () => {
  const sugSemOverride = sugerirAliquotasPrecificacao({
    ncm: '84713012',
    cClassTrib: '200026', // Anexo V - redução de 80%
    ano: 2027,
    regime: 'presumido',
    ufOrigem: 'SP',
    ufDestino: 'PR',
    marco,
    dadosReforma: reforma,
    dadosNcm: { ipi: 15, is: 0 },
  });

  assert.equal(sugSemOverride.aliquotasSugeridas.ipiPct, 15);
  assert.equal(sugSemOverride.aliquotasSugeridas.cbsPct, 8.8);
  assert.equal(sugSemOverride.aliquotasSugeridas.reducaoIbsCbsPct, 80);
  assert.equal(sugSemOverride.aliquotasSugeridas.icmsCompraPct, 12); // SP -> PR
  assert.equal(sugSemOverride.aliquotasSugeridas.icmsVendaPct, 19.5); // interna PR
  assert.equal(sugSemOverride.camposEditados.length, 0);

  // Aplicação de override manual pelo usuário (ex: negociou ICMS de 7% e alterou CBS para 5%)
  const sugComOverride = sugerirAliquotasPrecificacao({
    ncm: '84713012',
    cClassTrib: '200026',
    ano: 2027,
    regime: 'presumido',
    ufOrigem: 'SP',
    ufDestino: 'PR',
    marco,
    dadosReforma: reforma,
    dadosNcm: { ipi: 15, is: 0 },
    overrides: {
      icmsVendaPct: 7,
      cbsPct: 5,
    },
  });

  assert.deepEqual(sugComOverride.camposEditados.sort(), ['cbsPct', 'icmsVendaPct'].sort());
  assert.equal(sugComOverride.aliquotasAplicadas.icmsVendaPct, 7);
  assert.equal(sugComOverride.aliquotasAplicadas.cbsPct, 5);

  // O override altera efetivamente o cálculo no motor
  const rNormal = simular(ITEM, { ...P1, ano: 2027 }, ctx);
  const rEditado = simular(ITEM, { ...P1, ano: 2027, overrides: { icmsVendaPct: 7, cbsPct: 5 } }, ctx);
  assert.notEqual(rNormal.preco.precoFinal, rEditado.preco.precoFinal);
  assert.equal(rEditado.aliquotasPct.icms, 7);
});

t('glosa de créditos em documento inidôneo (documentoInidoneo: true): créditos zerados e custo majorado', () => {
  const nf = {
    codigo: 'INIDONEO-01',
    descricao: 'Carga Sem Lastro',
    quantidade: 1,
    valorBrutoEntrada: 1000,
    credIcmsEntrada: 180,
    credCbsEntrada: 88,
    credIbsEntrada: 1,
    credPisCofinsEntrada: 92.5,
  };

  const cNormal = calcularCustoAquisicaoReal(nf, 'real', { documentoInidoneo: false });
  const cGlosado = calcularCustoAquisicaoReal(nf, 'real', { documentoInidoneo: true });

  assert.equal(cNormal.glosado, false);
  assert.equal(cNormal.impostosARecuperar.totalImpostosRecuperaveis, 361.5);
  assert.equal(cNormal.custoAquisicaoReal, 638.5);

  assert.equal(cGlosado.glosado, true);
  assert.equal(cGlosado.impostosARecuperar.totalImpostosRecuperaveis, 0);
  assert.equal(cGlosado.custoAquisicaoReal, 1361.5); // 1000 + tributos glosados não recuperáveis (361.5)
  assert.match(cGlosado.motivoGlosa, /inid[oô]neo/i);

  // Na simulação com documento inidôneo, gera alerta formal
  const rGlosado = simular(nf, { ...P1, regime: 'real', documentoInidoneo: true }, ctx);
  assert.ok(rGlosado.alertas.some((a) => /inid[oô]neo/i.test(a)));
});

t('mapearCfopEntrada: conversão correta de CFOPs de saída para entrada com flags de ST, crédito e DIFAL', () => {
  // Comercialização
  const c1 = mapearCfopEntrada('5.102', 'comercializacao', 'PR', 'PR', marco);
  assert.equal(c1.cfopEntrada, '1.102');
  assert.equal(c1.temSt, false);
  assert.equal(c1.geraCreditoIcms, true);
  assert.equal(c1.exigeDifal, false);

  const c2 = mapearCfopEntrada('6.102', 'comercializacao', 'SP', 'PR', marco);
  assert.equal(c2.cfopEntrada, '2.102');
  assert.equal(c2.temSt, false);
  assert.equal(c2.geraCreditoIcms, true);
  assert.equal(c2.exigeDifal, false);

  // ST (5.405 / 6.403)
  const cSt1 = mapearCfopEntrada('5.405', 'comercializacao', 'PR', 'PR', marco);
  assert.equal(cSt1.cfopEntrada, '1.403');
  assert.equal(cSt1.temSt, true);
  assert.equal(cSt1.geraCreditoIcms, false);
  assert.equal(cSt1.exigeDifal, false);

  const cSt2 = mapearCfopEntrada('6.403', 'comercializacao', 'SC', 'PR', marco);
  assert.equal(cSt2.cfopEntrada, '2.403');
  assert.equal(cSt2.temSt, true);
  assert.equal(cSt2.geraCreditoIcms, false);

  // Industrialização
  const ind1 = mapearCfopEntrada('5.102', 'industrializacao', 'PR', 'PR', marco);
  assert.equal(ind1.cfopEntrada, '1.101');
  assert.equal(ind1.geraCreditoIcms, true);

  const ind2 = mapearCfopEntrada('6.102', 'industrializacao', 'SP', 'PR', marco);
  assert.equal(ind2.cfopEntrada, '2.101');
  assert.equal(ind2.geraCreditoIcms, true);

  // Uso e Consumo
  const uso1 = mapearCfopEntrada('5.102', 'uso_consumo', 'PR', 'PR', marco);
  assert.equal(uso1.cfopEntrada, '1.556');
  assert.equal(uso1.geraCreditoIcms, false);
  assert.equal(uso1.exigeDifal, false);

  const uso2 = mapearCfopEntrada('6.102', 'uso_consumo', 'SP', 'PR', marco);
  assert.equal(uso2.cfopEntrada, '2.556');
  assert.equal(uso2.geraCreditoIcms, false);
  assert.equal(uso2.exigeDifal, true);

  // Ativo Imobilizado
  const imob1 = mapearCfopEntrada('5.102', 'ativo_imobilizado', 'PR', 'PR', marco);
  assert.equal(imob1.cfopEntrada, '1.551');
  assert.equal(imob1.geraCreditoIcms, false);
  assert.equal(imob1.exigeDifal, false);

  const imob2 = mapearCfopEntrada('6.102', 'ativo_imobilizado', 'SP', 'PR', marco);
  assert.equal(imob2.cfopEntrada, '2.551');
  assert.equal(imob2.geraCreditoIcms, false);
  assert.equal(imob2.exigeDifal, true);
});

t('calcularMvaAjustada: exemplo canônico SP -> PR (12% inter, 19,5% intra PR, MVA Original 40% => 53,04%)', () => {
  const mvaAjustada = calcularMvaAjustada(40, 12, 19.5);
  near(mvaAjustada, 53.04, 0.01, 'MVA Ajustada SP -> PR');

  // Quando alíquota inter = intra, MVA ajustada = MVA original
  const mvaMesmaAliq = calcularMvaAjustada(40, 19.5, 19.5);
  near(mvaMesmaAliq, 40.0, 0.01, 'MVA quando alíquotas coincidem');
});

t('calcularEstornoProporcionalIcms: redução de base transfere parcela estornada para o custo', () => {
  // Crédito de R$ 100 na entrada; saída com redução de 30% na base de cálculo
  const res = calcularEstornoProporcionalIcms(100, 30);
  assert.equal(res.creditoAproveitavel, 70);
  assert.equal(res.valorEstornadoParaCusto, 30);

  // Sem redução (0%) -> crédito integral mantido
  const resZero = calcularEstornoProporcionalIcms(100, 0);
  assert.equal(resZero.creditoAproveitavel, 100);
  assert.equal(resZero.valorEstornadoParaCusto, 0);

  // Redução de 100% (isenção com estorno) -> 0 de crédito aproveitável
  const resCem = calcularEstornoProporcionalIcms(150, 100);
  assert.equal(resCem.creditoAproveitavel, 0);
  assert.equal(resCem.valorEstornadoParaCusto, 150);
});

t('circuit breaker e catálogo de normas: 28 normas catalogadas e fontes oficiais listáveis', () => {
  const fontes = listarFontesOficiaisMarcoLegal(marco);
  assert.ok(fontes.length >= 20, 'deve ter pelo menos 20 normas catalogadas');
  const ids = new Set(fontes.map((f) => f.id));
  assert.ok(ids.has('NBC-TG-16-R2'));
  assert.ok(ids.has('RIR-2018-ESTOQUES'));
  assert.ok(ids.has('LEI-6404-ART183'));
  assert.ok(ids.has('LC87-1996-KANDIR'));
  assert.ok(ids.has('RICMS-PR-DEC7871'));
  assert.ok(ids.has('RES-SF-13-2012'));
  assert.ok(ids.has('LEIS-10637-10833-CRT1'));
});

// ---------------------------------------------------------------------------------------------
// ETAPA 6: TESTES AVANÇADOS DE EXCEÇÕES FISCAIS, FRETE FOB/CIF, SEGREGAÇÃO DO SIMPLES E VRL/PEC
// ---------------------------------------------------------------------------------------------

t('Regra 1: Fornecedor Simples Nacional (CRT 1) zera créditos de PIS/COFINS no adquirente Lucro Real', () => {
  const itemSimples = {
    quantidade: 1,
    valorBrutoEntrada: 1000,
    credPisCofinsEntrada: 92.5, // 9,25% que adquirente tentaria apropriar
    credIcmsEntrada: 0,
    crtEmitente: '1',
    csosn: '102', // Sem permissão de crédito
  };

  const comp = calcularCustoAquisicaoReal(itemSimples, 'real', { marco });
  // PIS/COFINS vira custo (não recuperável)
  assert.equal(comp.impostosARecuperar.creditoPisCofins, 0, 'PIS/COFINS deve ser zerado para CRT 1');
  assert.ok(comp.tributosNaoRecuperaveis.tributosEntradaNaoAproveitados >= 92.5, 'PIS/COFINS bloqueado deve integrar custo não recuperável');
  assert.equal(comp.custoAquisicaoReal, 1092.5, 'Custo incorpora PIS/COFINS não recuperável');

  // Caso com permissão de ICMS destacado na NF-e (CSOSN 101 e valor informado)
  const itemComIcmsPermitido = {
    quantidade: 1,
    valorBrutoEntrada: 1000,
    credPisCofinsEntrada: 92.5,
    credIcmsEntrada: 28.2, // LC 123 art 23 destacado
    crtEmitente: '1',
    csosn: '101',
  };
  const compComIcms = calcularCustoAquisicaoReal(itemComIcmsPermitido, 'real', { marco });
  assert.equal(compComIcms.impostosARecuperar.creditoPisCofins, 0, 'PIS/COFINS continua zerado');
  assert.equal(compComIcms.impostosARecuperar.creditoIcms, 28.2, 'ICMS permitido pela LC 123/06 é mantido');
  assert.equal(compComIcms.custoAquisicaoReal, 1064.3, 'Custo de aquisição deduz apenas o ICMS permitido');
});

t('Regra 2: Substituição Tributária Anterior (CST 60 / CSOSN 500) zera ICMS na saída e apropria ST no custo', () => {
  const itemSt = {
    quantidade: 1,
    valorBrutoEntrada: 1000,
    cstIcms: '60',
    credIcmsEntrada: 180, // Destaque para fins de ressarcimento/controle
    icmsStEntrada: 50,
  };

  const comp = calcularCustoAquisicaoReal(itemSt, 'real', { marco });
  // ICMS próprio não gera crédito de entrada na revenda de item com ST
  assert.equal(comp.impostosARecuperar.creditoIcms, 0, 'ICMS próprio não gera crédito em operação com ST');
  assert.equal(comp.tributosNaoRecuperaveis.icmsSt, 50, 'ICMS-ST integra custo não recuperável');
  assert.equal(comp.tributosNaoRecuperaveis.tributosEntradaNaoAproveitados, 180, 'ICMS próprio sem crédito integra tributos de entrada não aproveitados');
  assert.equal(comp.custoAquisicaoReal, 1230, 'Custo total incorpora ICMS-ST e ICMS próprio retido');

  // Sugestão de alíquotas para saída: alíquota interna de ICMS deve ser zerada
  const sug = sugerirAliquotasPrecificacao({
    ncm: '84818099',
    ano: 2027,
    regime: 'real',
    cstIcms: '60',
    marco,
  });
  assert.equal(sug.aliquotasSugeridas.icmsVendaPct, 0, 'ICMS de saída deve ser 0% para revenda de CST 60');

  // Na simulação de preço de saída com CST 60, o preço não embute ICMS de saída
  const pSt = {
    ano: 2027,
    regime: 'real',
    margemLiquidaPct: 15,
    cstIcms: '60',
    icmsSaidaPct: 0,
  };
  const rSim = simular(itemSt, pSt, ctx);
  assert.equal(rSim.aliquotasPct.icms, 0, 'Alíquota de ICMS simulada deve ser 0%');
  assert.equal(rSim.preco.vICMS, 0, 'Valor de ICMS na saída deve ser R$ 0');
});

t('Regra de Frete: ratearDespesasAcessoriaEFrete respeita CIF vs FOB, critérios valor/peso e créditos fiscais', () => {
  const itens = [
    {
      id: 'item-1',
      descricao: 'Peça Pesada Barata',
      ncm: '73181500',
      quantidade: 1,
      valorBrutoEntrada: 200,
      pesoBruto: 80, // 80% do peso
      freteSeguroOutrasEntrada: 0,
      credPisCofinsEntrada: 0,
      credIcmsEntrada: 0,
    },
    {
      id: 'item-2',
      descricao: 'Peça Leve Cara',
      ncm: '84818099',
      quantidade: 1,
      valorBrutoEntrada: 800,
      pesoBruto: 20, // 20% do peso
      freteSeguroOutrasEntrada: 0,
      credPisCofinsEntrada: 0,
      credIcmsEntrada: 0,
    },
  ];

  // Caso 1: modFrete === '0' (CIF) -> ignora CT-e externo para evitar duplicidade
  const rateioCif = ratearDespesasAcessoriaEFrete(itens, {
    freteCteTotal: 100,
    modFrete: '0',
    regimeDestinatario: 'real',
  });
  assert.equal(rateioCif[0].freteSeguroOutrasEntrada, 0, 'CIF não deve ratear frete externo');
  assert.equal(rateioCif[1].freteSeguroOutrasEntrada, 0, 'CIF não deve ratear frete externo');

  // Caso 2: modFrete === '1' (FOB) por VALOR
  const rateioValor = ratearDespesasAcessoriaEFrete(itens, {
    freteCteTotal: 100,
    icmsFreteCteTotal: 12,
    criterioRateio: 'valor',
    modFrete: '1',
    regimeDestinatario: 'real',
  });
  // Item 1 (20% do valor = 200/1000): frete = 20
  assert.equal(rateioValor[0].freteSeguroOutrasEntrada, 20);
  assert.equal(rateioValor[0].credPisCofinsEntrada, 1.85, '20 * 9,25% = 1,85');
  assert.equal(rateioValor[0].credIcmsEntrada, 2.4, '12 * 20% = 2,40');

  // Item 2 (80% do valor = 800/1000): frete = 80
  assert.equal(rateioValor[1].freteSeguroOutrasEntrada, 80);
  assert.equal(rateioValor[1].credPisCofinsEntrada, 7.4, '80 * 9,25% = 7,40');
  assert.equal(rateioValor[1].credIcmsEntrada, 9.6, '12 * 80% = 9,60');

  // Caso 3: modFrete === '1' (FOB) por PESO
  const rateioPeso = ratearDespesasAcessoriaEFrete(itens, {
    freteCteTotal: 100,
    criterioRateio: 'peso',
    modFrete: '1',
    regimeDestinatario: 'real',
  });
  // Item 1 (80% do peso): frete = 80
  assert.equal(rateioPeso[0].freteSeguroOutrasEntrada, 80);
  // Item 2 (20% do peso): frete = 20
  assert.equal(rateioPeso[1].freteSeguroOutrasEntrada, 20);
});

t('Simples Nacional: segregação de ICMS-ST e Monofásicos no DAS reduz carga tributária', () => {
  const item = {
    quantidade: 1,
    valorBrutoEntrada: 100,
    freteSeguroOutrasEntrada: 0,
    descontoIncondicionalEntrada: 0,
  };

  const pPadrao = {
    ano: 2027,
    regime: 'simples',
    rbt12Simples: 180000, // Faixa 1 = 4,00%
    margemLiquidaPct: 20,
    despesasVariaveisPct: 5,
    icmsSaidaPct: 0,
  };

  // Simulação padrão
  const rPadrao = simular(item, pPadrao, ctx);

  // Simulação com ST (segrega 34% de ICMS do DAS da Faixa 1)
  const pSt = { ...pPadrao, temSt: true };
  const rSt = simular(item, pSt, ctx);
  assert.ok(
    rSt.relatorioMargens.tributosVendaPorDentro < rPadrao.relatorioMargens.tributosVendaPorDentro,
    'Tributos do DAS devem cair com segregação de ICMS-ST'
  );
  assert.equal(
    rSt.relatorioMargens.creditoTransferidoClienteB2B,
    0,
    'Crédito B2B de ICMS deve ser 0 quando operação sujeita a ST'
  );

  // Simulação com PIS/COFINS Monofásico (segrega PIS e COFINS do DAS)
  const pMono = { ...pPadrao, pisCofinsMonofasico: true };
  const rMono = simular(item, pMono, ctx);
  assert.ok(
    rMono.relatorioMargens.tributosVendaPorDentro < rPadrao.relatorioMargens.tributosVendaPorDentro,
    'Tributos do DAS devem cair com segregação monofásica'
  );
});

t('Métricas Contábeis e Gerenciais: Margem de Contribuição, PEC, VRL e Arbitramento Fiscal RIR/2018', () => {
  const item = {
    quantidade: 1,
    valorBrutoEntrada: 100,
    freteSeguroOutrasEntrada: 10,
    descontoIncondicionalEntrada: 0,
    tipoEstabelecimento: 'comercio',
  };

  const p = {
    ano: 2027,
    regime: 'presumido',
    margemLiquidaPct: 20,
    despesasVariaveisPct: 5,
    custosFixosTotaisPeriodo: 5000,
    icmsSaidaPct: 19.5,
  };

  const r = simular(item, p, ctx);
  const rel = r.relatorioMargens;

  // Margem de Contribuição Unitária = PV - CV - DV
  assert.ok(rel.margemContribuicaoUnitaria > 0, 'MC deve ser positiva');
  near(
    rel.margemContribuicaoUnitaria,
    r.preco.precoFinal - rel.custoAquisicaoReal - r2(r.preco.precoFinal * 0.05),
    0.05,
    'MC unitária = PV - CustoReal - DV'
  );

  // Ponto de Equilíbrio Contábil (PEC)
  assert.ok(rel.pontoEquilibrioContabil.pecVolume > 0, 'PEC em volume deve ser > 0');
  assert.ok(rel.pontoEquilibrioContabil.pecValor > 0, 'PEC em valor deve ser > 0');
  near(
    rel.pontoEquilibrioContabil.pecValor,
    rel.pontoEquilibrioContabil.pecVolume * r.preco.precoFinal,
    0.5,
    'PEC Valor = PEC Volume * Preço de Venda'
  );

  // Análise de VRL e Arbitramento Fiscal
  assert.ok(rel.analiseVrlEArbitramento.valorRealizavelLiquido > 0, 'VRL deve ser > 0');
  assert.equal(rel.analiseVrlEArbitramento.requerProvisaoImpairment, false, 'Com margem de 20%, não deve exigir impairment');
  // Arbitramento RIR/2018 para comércio = 70% do PV
  near(
    rel.analiseVrlEArbitramento.custoArbitradoRir2018,
    r2(r.preco.precoFinal * 0.7),
    0.02,
    'Arbitramento RIR/2018 = 70% do PV'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 9: TESTES DO NOVO MARCO LEGAL (>= 35 NORMAS), O(1), DIFAL E SIMPLES HÍBRIDO
// ─────────────────────────────────────────────────────────────────────────────

t('Etapa 9: obterFcpPorUf e integridade de FCP nas 27 UFs em O(1)', () => {
  assert.equal(obterFcpPorUf('RJ', marco), 4.0, 'RJ deve possuir FCP de 4,0%');
  assert.equal(obterFcpPorUf('PR', marco), 2.0, 'PR deve possuir FCP de 2,0%');
  assert.equal(obterFcpPorUf('SP', marco), 2.0, 'SP deve possuir FCP de 2,0%');
  assert.equal(obterFcpPorUf('SC', marco), 0.0, 'SC não instituiu FCP geral (0,0%)');
  assert.equal(obterFcpPorUf('ES', marco), 0.0, 'ES não cobra FCP geral (0,0%)');
  assert.equal(obterFcpPorUf('XX', marco), 2.0, 'Fallback seguro para UF desconhecida');
});

t('Etapa 9: calcularReducaoConvenioIcms para Convênios 52/91 e 100/97', () => {
  // Convênio 52/1991 - Máquinas Agrícolas no Paraná
  const maqAgricola = calcularReducaoConvenioIcms({
    tipoConvenio: 'CONV_52_91_MAQ_AGRICOLA',
    ufOrigem: 'PR',
    ufDestino: 'PR',
    aliqNominalIcmsPct: 19.5,
    marco,
  });
  assert.equal(maqAgricola.aliqEfetivaPct, 5.6, 'Máquina agrícola no PR deve ter carga efetiva de 5,6%');
  assert.equal(maqAgricola.dispensaEstornoEntrada, true, 'Convênio 52/91 dispensa expressamente estorno na entrada');
  assert.equal(maqAgricola.cstSugerido, '20', 'CST deve ser 20 (com redução de base)');
  near(maqAgricola.pRedBC, 71.28, 0.05, 'Redução de BC de 19,5% para 5,6% é ~71,28%');

  // Convênio 100/1997 - Insumos Agropecuários Interno Paraná (Diferimento Total)
  const agroInternoPr = calcularReducaoConvenioIcms({
    tipoConvenio: 'CONV_100_97_INSUMO_AGRO',
    ufOrigem: 'PR',
    ufDestino: 'PR',
    marco,
  });
  assert.equal(agroInternoPr.aliqEfetivaPct, 0, 'Interno PR é diferido');
  assert.equal(agroInternoPr.percentualDiferimento, 100, 'Diferimento total (100%)');
  assert.equal(agroInternoPr.cstSugerido, '51', 'Diferimento exige CST 51');

  // Convênio 100/1997 - Insumos Agropecuários Interestadual (Redução 60%)
  const agroInter = calcularReducaoConvenioIcms({
    tipoConvenio: 'CONV_100_97_INSUMO_AGRO',
    ufOrigem: 'PR',
    ufDestino: 'SP',
    aliqNominalIcmsPct: 12.0,
    marco,
  });
  assert.equal(agroInter.pRedBC, 60.0, 'Redução interestadual de 60%');
  assert.equal(agroInter.aliqEfetivaPct, 4.8, '12% com 60% de redução = 4,8% efetivo');
});

t('Etapa 9: detectarReducoesFiscaisPorNcm em O(1) vinculando Reforma e ICMS', () => {
  // Teste NCM 8432.10.00 (Máquina Agrícola - Arado)
  const resMaq = detectarReducoesFiscaisPorNcm('8432.10.00', 'PR', marco);
  assert.ok(resMaq !== null, 'NCM 8432 deve ser reconhecido');
  assert.equal(resMaq?.reforma?.reducaoIbsCbsPct, 60.0, 'Reforma concede 60% de redução');
  assert.equal(resMaq?.reforma?.cClassTrib, '200003', 'cClassTrib para máquinas agrícolas é 200003');
  assert.equal(resMaq?.icms?.convenioCorrelato, 'CONV-ICMS-52-1991', 'ICMS correlato é Convênio 52/91');
  assert.equal(resMaq?.icms?.aliqEfetivaSugeridaPct, 5.6, 'ICMS interno PR efetivo é 5,6%');
  assert.equal(resMaq?.icms?.dispensaEstornoEntrada, true, 'Dispensa estorno na entrada');

  // Teste NCM 3105.20.00 (Fertilizantes NPK)
  const resFert = detectarReducoesFiscaisPorNcm('31052000', 'PR', marco);
  assert.ok(resFert !== null, 'NCM 3105 deve ser reconhecido');
  assert.equal(resFert?.reforma?.reducaoIbsCbsPct, 60.0, 'Reforma reduz 60% para fertilizantes');
  assert.equal(resFert?.reforma?.cClassTrib, '200001', 'cClassTrib de fertilizantes é 200001');
  assert.equal(resFert?.icms?.convenioCorrelato, 'CONV-ICMS-100-1997', 'Convênio correlato 100/97');
  assert.equal(resFert?.icms?.diferimentoPct, 100, 'Diferimento interno PR de 100%');
  assert.equal(resFert?.icms?.cstSugerido, '51', 'CST 51 para fertilizantes no PR');

  // Teste NCM 1006.10.92 (Arroz - Cesta Básica Nacional)
  const resArroz = detectarReducoesFiscaisPorNcm('1006.10.92', 'PR', marco);
  assert.ok(resArroz !== null, 'NCM 1006 deve ser reconhecido');
  assert.equal(resArroz?.reforma?.reducaoIbsCbsPct, 100.0, 'Alíquota Zero / Redução 100%');
  assert.equal(resArroz?.reforma?.cClassTrib, '100001', 'cClassTrib 100001 cesta básica');
});

t('Etapa 9: calcularDifalDetalhado com Base Dupla, Base Única e FCP Destino', () => {
  const paramsBase = {
    valorOperacao: 1000,
    aliqInterestadualPct: 12.0,
    aliqInternaDestinoPct: 19.5,
    ufDestino: 'PR',
    incluirFcp: true,
    marco,
  };

  // Base Dupla (com FCP PR 2% => total destino 21,5%)
  // V_sem_icms = 1000 * (1 - 0.12) = 880
  // Base_Destino = 880 / (1 - 0.215) = 880 / 0.785 = 1121.02
  // ICMS Destino Total = 1121.02 * 21.5% = 241.02
  // ICMS Origem = 1000 * 12% = 120.00
  // DIFAL Total = 241.02 - 120.00 = 121.02
  const rDupla = calcularDifalDetalhado({ ...paramsBase, metodologia: 'base_dupla' });
  near(rDupla.baseCalculo, 1121.02, 0.05, 'Base Dupla destino');
  assert.equal(rDupla.valorIcmsOrigem, 120.0, 'ICMS Origem = R$ 120');
  near(rDupla.valorTotalDevidoDestino, 121.02, 0.05, 'DIFAL Total devido destino');
  near(rDupla.valorFcpDestino, 22.42, 0.05, 'FCP Destino (1121.02 * 2%)');

  // Base Única
  // Base = 1000
  // ICMS Destino Total = 1000 * 21.5% = 215.00
  // ICMS Origem = 120.00
  // DIFAL Total = 95.00
  const rUnica = calcularDifalDetalhado({ ...paramsBase, metodologia: 'base_unica' });
  assert.equal(rUnica.baseCalculo, 1000, 'Base Única = 1000');
  assert.equal(rUnica.valorTotalDevidoDestino, 95.0, 'DIFAL Base Única = R$ 95');
  assert.equal(rUnica.valorFcpDestino, 20.0, 'FCP Destino = R$ 20');
});

t('Etapa 9: calcularDetalhamentoSimplesHibrido e Ponto de Inflexão (Break-even)', () => {
  // Cenário: Faturamento 100.000 / mês, DAS efetivo 10% (R$ 10.000)
  // Em 2027: expurgo do DAS é 18% => DAS cai para 8,2% (R$ 8.200, economia R$ 1.800)
  // Débito IBS/CBS na venda a 26,5% = R$ 26.500
  // Compras 90.000 a 26,5% de crédito = R$ 23.850
  // Saldo IBS/CBS = 26.500 - 23.850 = R$ 2.650
  // Total Híbrido = 8.200 + 2.650 = R$ 10.850 (> R$ 10.000, Simples Tradicional vence)
  const h1 = calcularDetalhamentoSimplesHibrido({
    ano: 2027,
    faturamentoMensal: 100000,
    aliquotaDasEfetivaPct: 10.0,
    comprasInsumosMercadorias: 90000,
    aliquotaMediaCreditoEntradaPct: 26.5,
    aliquotaIbsCbsVendaPct: 26.5,
    marco,
  });
  assert.equal(h1.fatorExpurgoDasPct, 18.0, 'Expurgo em 2027 deve ser 18%');
  assert.equal(h1.valorDasSemExpurgo, 10000, 'DAS Tradicional = R$ 10.000');
  assert.equal(h1.valorDasComExpurgo, 8200, 'DAS Híbrido = R$ 8.200');
  assert.equal(h1.economiaDas, 1800, 'Economia DAS = R$ 1.800');
  assert.equal(h1.pontoInflexao.regimeVencedor, 'simples', 'Tradicional vence sem compras suficientes');

  // Agora com compras de 95.000 a 26,5%:
  // Crédito = 25.175
  // Saldo IBS/CBS = 26.500 - 25.175 = R$ 1.325
  // Total Híbrido = 8.200 + 1.325 = R$ 9.525 (< R$ 10.000, Simples Híbrido vence!)
  const h2 = calcularDetalhamentoSimplesHibrido({
    ano: 2027,
    faturamentoMensal: 100000,
    aliquotaDasEfetivaPct: 10.0,
    comprasInsumosMercadorias: 95000,
    aliquotaMediaCreditoEntradaPct: 26.5,
    aliquotaIbsCbsVendaPct: 26.5,
    marco,
  });
  assert.equal(h2.pontoInflexao.regimeVencedor, 'simples_hibrido', 'Híbrido vence quando créditos cobrem saldo');
  near(h2.cargaTributariaTotal, 9525, 0.5, 'Carga híbrida R$ 9.525');
  assert.ok(h2.pontoInflexao.creditoMinimoEntradaParaEmpatePct > 0, 'Ponto de empate calculado');
});

