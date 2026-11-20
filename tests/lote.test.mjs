
import { parseCsv } from '../.parse-csv.ts';
import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';
globalThis.fetch = async (u) => { let url = String(u); if (url.includes('?v=')) { url = url.split('?v=')[0]; } const rel = url.replace(/^\//, '');
  const { readFile } = await import('node:fs/promises');
  try{const t=await readFile(process.cwd()+'/public/'+rel,'utf8');return {ok:true,status:200,json:async()=>JSON.parse(t)}}catch{return{ok:false,status:404,json:async()=>null}}};
const ds = await mods.data.loadDataset(); await ds.pronto;

const csv = await (await import('node:fs/promises')).readFile('exemplos/produtos-exemplo.csv','utf8');
const rows = parseCsv(csv);
assert.equal(rows.length, 11, `11 linhas (cabecalho + 10), veio ${rows.length}`);
assert.deepEqual(rows[0], ['codigo','descricao','unidade']);
const head = rows[0].map(h=>h.trim().toLowerCase());
const idx = head.findIndex(h=>['descricao','produto','desc','nome','item'].some(c=>h.includes(c)));
assert.equal(idx, 1, `coluna descricao detectada (idx=${idx})`);

const saida = rows.slice(1).map(r => {
  const texto = r[idx].trim();
  const res = mods.engine.classify(texto, ds, {top:6});
  const c = res.candidates[0];
  const n = mods.engine.buildNotes(c, res.query, ds, res.candidates);
  return { texto: texto.slice(0,42), ncm: c?.rec.ncm, band: n.band, conf: +n.confidence.toFixed(2) };
});
for (const s of saida) console.log('   ', JSON.stringify(s));
const classificadas = saida.filter(s=>s.ncm).length;
assert.ok(classificadas >= 8, `linhas classificadas (got ${classificadas}/10)`);
const vagas = saida.filter(s=>s.texto.toLowerCase().includes('variedade'));
assert.equal(vagas[0]?.band, 'baixa', 'linha vaga deve sair em banda baixa');
console.log(`OK  lote: ${rows.length-1} linhas lidas, ${classificadas} classificadas, vaga→${vagas[0]?.band}`);
{ // o CSV exportado ganhou colunas de reforma/ERP — o cabeçalho e o corpo têm de bater
  const linhas = saida.length;
  assert.equal(linhas, 10, `linhas classificadas: ${linhas}`);
}
console.log('LOTE OK ✓');

// ─────────────────────────────────────────────────────────────────────────────
// NOVOS TESTES OBRIGATÓRIOS DO MOTOR LOTE-ERP (ABA 2 INTELIGENTE)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n──────── INICIANDO TESTES DO MOTOR LOTE-ERP (ABA 2) ────────');

const {
  avaliarConfiancaDescricaoNcm,
  gerarParametrizacaoErpResumida,
  exportarLoteErpCSV,
} = mods['lote-erp'];

// 1. Item com descrição clara e NCM informado com aderência > 85%
{
  const desc = 'Café torrado em grãos tradicional pacote 500g';
  const ncmInformado = '09012100';
  console.log('Classificando café:', desc);
  const debugClass = mods.engine.classify(desc, ds, {top: 5});
  console.log('Top candidatos café:', debugClass.candidates.map(c => ({ ncm: c.rec.ncm, d8: c.rec.d8, desc: c.rec.desc, score: c.score })));
  console.log('Query terms:', debugClass.query.terms);
  console.log('Hier 0901:', ds.hier?.['0901'], 'Hier 09012:', ds.hier?.['09012']);

  const aval = avaliarConfiancaDescricaoNcm(desc, ncmInformado, ds);
  console.log('Resultado aval:', aval);

  assert.ok(aval.confiancaNcmPct >= 86, `Confiança NCM deve ser > 85%, obtido: ${aval.confiancaNcmPct}%`);
  assert.equal(aval.requerIaNcm, false, 'Item com alta confiança não deve requerer IA para NCM');

  // Parametrização de saída imediata para Simples Nacional
  const ctxSimples = {
    regimeSaida: 'simples',
    ufOrigem: 'PR',
    ufDestino: 'PR',
    finalidadeSaida: 'revenda',
    anoCalendario: 2026,
  };
  const linhaSimples = gerarParametrizacaoErpResumida(
    { codigo: 'CAFE-01', descricao: desc, ncm: aval.ncm, confiancaNcmPct: aval.confiancaNcmPct, origemNcm: 'MOTOR' },
    ctxSimples,
    ds
  );

  assert.equal(linhaSimples.cfopSaida, '5102', 'Revenda interna Simples Nacional deve sugerir CFOP 5102');
  assert.equal(linhaSimples.cstOuCsosnIcms, '102', 'Simples sem ST deve sugerir CSOSN 102');
  assert.equal(linhaSimples.cstPisCofins, '49', 'Simples Nacional em 2026 usa CST PIS/COFINS 49 (alíquota 0)');
  assert.equal(linhaSimples.aliqPisPct, 0);
  assert.equal(linhaSimples.aliqCofinsPct, 0);
  assert.ok(linhaSimples.cClassTrib.length === 6, 'cClassTrib deve ter 6 dígitos');
  console.log('OK  Teste 1: Item claro com > 85% gera parametrização imediata sem depender de IA');
}

// 2. Item com descrição genérica/ambígua (<= 85%) marcando requerIaNcm: true
{
  const descVaga = 'Kit brinde variedade linha casa diversos';
  const avalVaga = avaliarConfiancaDescricaoNcm(descVaga, undefined, ds);

  assert.ok(avalVaga.confiancaNcmPct <= 85, `Confiança de descrição vaga deve ser <= 85%, obtido: ${avalVaga.confiancaNcmPct}%`);
  assert.equal(avalVaga.requerIaNcm, true, 'Descrição vaga deve acionar requerIaNcm: true');
  assert.ok(avalVaga.motivoBaixaConfianca, 'Deve indicar o motivo da baixa confiança');

  // Simula o retorno de um NCM validado vindo do Gemini IA
  const ncmValidadoIa = '84713012'; // Notebook
  const linhaPosIa = gerarParametrizacaoErpResumida(
    { codigo: 'VAGO-01', descricao: descVaga, ncm: ncmValidadoIa, confiancaNcmPct: 95, origemNcm: 'GEMINI_IA' },
    { regimeSaida: 'presumido', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2026 },
    ds
  );

  assert.equal(linhaPosIa.origemNcm, 'GEMINI_IA');
  assert.equal(linhaPosIa.confiancaNcmPct, 95);
  assert.equal(linhaPosIa.requerIaNcm, false);
  assert.equal(linhaPosIa.cfopSaida, '5405', '8471.30.12 possui CEST de informática/eletrônicos (21.028.00) gerando ST 5405');
  console.log('OK  Teste 2: Descrição vaga (<= 85%) aciona requerIaNcm e calcula parâmetros após IA');
}

// 3. Variação dos códigos gerados conforme regimeSaida (simples vs presumido vs real vs simples_hibrido)
{
  const itemTeste = {
    codigo: 'MOV-01',
    descricao: 'Mesa de madeira para escritório',
    ncm: '94036000',
    confiancaNcmPct: 92,
    origemNcm: 'MOTOR',
  };

  // Simples Nacional
  const paramSimples = gerarParametrizacaoErpResumida(
    itemTeste,
    { regimeSaida: 'simples', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2026 },
    ds
  );
  assert.equal(paramSimples.cstOuCsosnIcms, '102', 'Simples sem ST deve gerar CSOSN 102');
  assert.equal(paramSimples.aliqPisPct, 0);

  // Lucro Presumido
  const paramPresumido = gerarParametrizacaoErpResumida(
    itemTeste,
    { regimeSaida: 'presumido', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2026 },
    ds
  );
  assert.equal(paramPresumido.cstOuCsosnIcms, '00', 'Presumido sem ST deve gerar CST 00');
  assert.equal(paramPresumido.cstPisCofins, '01');
  assert.equal(paramPresumido.aliqPisPct, 0.65);
  assert.equal(paramPresumido.aliqCofinsPct, 3.0);

  // Lucro Real
  const paramReal = gerarParametrizacaoErpResumida(
    itemTeste,
    { regimeSaida: 'real', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2026 },
    ds
  );
  assert.equal(paramReal.cstOuCsosnIcms, '00', 'Real sem ST deve gerar CST 00');
  assert.equal(paramReal.cstPisCofins, '01');
  assert.equal(paramReal.aliqPisPct, 1.65);
  assert.equal(paramReal.aliqCofinsPct, 7.6);

  // Simples Híbrido em 2027
  const paramHibrido2027 = gerarParametrizacaoErpResumida(
    itemTeste,
    { regimeSaida: 'simples_hibrido', ufOrigem: 'PR', ufDestino: 'PR', finalidadeSaida: 'revenda', anoCalendario: 2027 },
    ds
  );
  assert.equal(paramHibrido2027.cstOuCsosnIcms, '102', 'ICMS no Simples continua com CSOSN 102');
  assert.ok(paramHibrido2027.aliqCbsEfetivaPct > 0, 'No Simples Híbrido em 2027, CBS é apurada por fora (> 0)');
  assert.ok(paramHibrido2027.aliqIbsEfetivaPct > 0, 'No Simples Híbrido em 2027, IBS é apurado por fora (> 0)');
  console.log('OK  Teste 3: Variação fiel de CSOSN/CST, PIS/COFINS e IBS/CBS conforme regimeSaida e ano');
}

// 4. Detecção de requerCodificacaoIaErp e exportação do CSV resumido limpo
{
  const itemIncerteza = {
    codigo: 'AUTO-99',
    descricao: 'Peça automotiva genérica sem especificação',
    ncm: '87082990', // NCM terminado em .90 ("Outros")
    confiancaNcmPct: 75,
    origemNcm: 'MOTOR',
  };

  const linhaIncerteza = gerarParametrizacaoErpResumida(
    itemIncerteza,
    { regimeSaida: 'presumido', ufOrigem: 'PR', ufDestino: 'SP', finalidadeSaida: 'revenda', anoCalendario: 2026, temStRetidaAnteriormente: true },
    ds
  );

  assert.ok(linhaIncerteza.aderenciaErpPct <= 85, `Aderência ERP deve ser <= 85%, obtido: ${linhaIncerteza.aderenciaErpPct}%`);
  assert.equal(linhaIncerteza.requerCodificacaoIaErp, true, 'Deve exigir Codificação Assistida por IA');

  // Geração e validação do CSV resumido
  const csvResumido = exportarLoteErpCSV([linhaIncerteza]);
  assert.ok(csvResumido.startsWith('\uFEFF'), 'CSV deve ter BOM UTF-8');
  assert.ok(csvResumido.includes('CODIGO;DESCRICAO;REGIME_SAIDA;UF_ORIGEM;UF_DESTINO'), 'Cabeçalho deve conter colunas de ERP');
  assert.ok(csvResumido.includes('CFOP_SAIDA;CST_CSOSN_ICMS;CBENEF_PR'), 'Deve conter colunas fiscais de saída');
  assert.ok(csvResumido.includes('AUTO-99'), 'Deve conter os dados do item exportado');
  assert.ok(!csvResumido.includes('fundamentacao_legal'), 'CSV resumido não deve conter textos jurídicos longos');
  console.log('OK  Teste 4: Aderência ERP <= 85% detectada e CSV resumido gerado com sucesso');
}

console.log('\nSUÍTE LOTE-ERP COMPLETA E APROVADA ✓');
