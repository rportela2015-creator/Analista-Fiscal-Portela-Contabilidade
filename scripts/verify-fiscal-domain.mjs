import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  normalizarNcm,
  validarNcmSiscomex,
  avaliarSensibilidadeFiscal,
} from '../lib/extrator-nfe.ts';
import { getMapaD8 } from '../lib/ai/ncm-server.ts';

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  ADVERSARIAL FISCAL DOMAIN VERIFICATION (M1 REVIEWER IT2-2)');
console.log('══════════════════════════════════════════════════════════════════════');

const mapaD8 = getMapaD8();

// 1. SISCOMEX O(1) MAP VERIFICATION
console.log('\n[1] SISCOMEX O(1) IN-MEMORY LOOKUP');
assert.ok(mapaD8 instanceof Map, 'mapaD8 deve ser uma instância de Map');
console.log(`- Total de NCMs no mapa em memória: ${mapaD8.size}`);
assert.equal(mapaD8.size, 10515, 'Catálogo oficial do Siscomex deve conter exatamente 10.515 registros NCM');

// Performance benchmark O(1)
const ncmsTeste = ['84713012', '01012100', '22021000', '48025610', '84834090', '99999999', '00000000'];
const t0 = performance.now();
const ITERATIONS = 100000;
for (let i = 0; i < ITERATIONS; i++) {
  const ncm = ncmsTeste[i % ncmsTeste.length];
  validarNcmSiscomex(ncm, mapaD8);
}
const duracaoTotal = performance.now() - t0;
const mediaPorLookupUs = (duracaoTotal / ITERATIONS) * 1000;
console.log(`- Benchmark: ${ITERATIONS} lookups executados em ${duracaoTotal.toFixed(2)}ms (média: ${mediaPorLookupUs.toFixed(4)} µs/lookup)`);
assert.ok(mediaPorLookupUs < 5, 'Cada lookup deve levar < 5 microssegundos (O(1) in-memory Map)');

// Normalização e validação
assert.equal(validarNcmSiscomex('84713012', mapaD8).valido, true);
assert.equal(validarNcmSiscomex('99999999', mapaD8).valido, false);
assert.equal(validarNcmSiscomex('00000000', mapaD8).valido, false);
assert.equal(validarNcmSiscomex('', mapaD8).valido, false);
assert.equal(validarNcmSiscomex('8471', mapaD8).valido, false);
console.log('✓ Siscomex O(1) e catálogo oficial 10.515 validados');

// 2. REGULAR CLEAN INDUSTRIAL ITEM (T1.20)
console.log('\n[2] ITEM INDUSTRIAL LIMPO (CST 50, IPI 10%)');
const itemLimpo = {
  index: 1,
  cProd: 'NOTE-001',
  xProd: 'NOTEBOOK INDUSTRIAL DELL',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 5000,
  vProd: 5000,
  tributos: {
    cstIcms: '00',
    vBC: 5000,
    pICMS: 18,
    vICMS: 900,
    cstIpi: '50',
    vBCIpi: 5000,
    pIPI: 10,
    vIPI: 500,
    cstPis: '01',
    cstCofins: '01',
  },
};

const sensLimpo = avaliarSensibilidadeFiscal(itemLimpo, '3');
console.log('- Sensibilidade item limpo (CRT 3, sem restrições):', sensLimpo);
assert.equal(sensLimpo.sensivelParaAuditoria, false, 'Item limpo regular NÃO deve ser sensível para auditoria');
assert.equal(sensLimpo.motivosSensibilidade.length, 0);

// Com adquirente Consumo -> Deve virar sensível (vedação de crédito)
const sensConsumo = avaliarSensibilidadeFiscal(itemLimpo, '3', { finalidade: 'Uso e Consumo' });
console.log('- Sensibilidade item limpo com adquirente Consumo:', sensConsumo);
assert.equal(sensConsumo.sensivelParaAuditoria, true);
assert.ok(sensConsumo.motivosSensibilidade.includes('IPI_DESTACADO'));

// Com adquirente Imobilizado -> Deve virar sensível (vedação de crédito)
const sensImobilizado = avaliarSensibilidadeFiscal(itemLimpo, '3', { finalidade: 'Ativo Imobilizado' });
console.log('- Sensibilidade item limpo com adquirente Imobilizado:', sensImobilizado);
assert.equal(sensImobilizado.sensivelParaAuditoria, true);
assert.ok(sensImobilizado.motivosSensibilidade.includes('IPI_DESTACADO'));

// Com adquirente Simples Nacional -> Deve virar sensível (vedação de crédito)
const sensAdqSimples = avaliarSensibilidadeFiscal(itemLimpo, '3', { regime: 'Simples Nacional' });
console.log('- Sensibilidade item limpo com adquirente Simples Nacional:', sensAdqSimples);
assert.equal(sensAdqSimples.sensivelParaAuditoria, true);
assert.ok(sensAdqSimples.motivosSensibilidade.includes('IPI_DESTACADO'));
console.log('✓ Item industrial limpo e restrições de crédito de IPI validados');

// 3. SIMPLES NACIONAL COM CSTS NORMAIS
console.log('\n[3] SIMPLES NACIONAL (CRT 1) COM CST NORMAL');
const normalCsts = ['00', '10', '20', '30', '40', '41', '50', '51', '60', '70', '90'];

for (const cst of normalCsts) {
  const itemSimplesCstNormal = {
    index: 1,
    cProd: `PROD-SN-${cst}`,
    xProd: `Produto Simples com CST ${cst}`,
    ncm: '84713012',
    ncmValidoSiscomex: true,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 100,
    vProd: 100,
    tributos: {
      cstIcms: cst,
    },
  };

  const sens = avaliarSensibilidadeFiscal(itemSimplesCstNormal, '1');
  assert.equal(
    sens.sensivelParaAuditoria,
    true,
    `Simples Nacional (CRT 1) com CST normal ${cst} DEVE ser marcado como sensível`
  );
  assert.ok(
    sens.motivosSensibilidade.includes('INCONSISTENCIA_SIMPLES_COM_CST_NORMAL'),
    `Simples Nacional com CST normal ${cst} deve conter motivo INCONSISTENCIA_SIMPLES_COM_CST_NORMAL`
  );
}
console.log(`✓ Todos os 11 CSTs normais (${normalCsts.join(', ')}) detectados como inconsistência para Simples Nacional`);

// 4. SIMPLES NACIONAL COM CSOSN DE VEDAÇÃO DE CRÉDITO
console.log('\n[4] SIMPLES NACIONAL COM VEDAÇÃO DE CRÉDITO (CSOSN 102, 103, 300, 400, 500)');
const vedadosCsosn = ['102', '103', '300', '400', '500'];
for (const csosn of vedadosCsosn) {
  const itemCsosn = {
    index: 1,
    cProd: `PROD-CSOSN-${csosn}`,
    xProd: `Produto CSOSN ${csosn}`,
    ncm: '84713012',
    ncmValidoSiscomex: true,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 100,
    vProd: 100,
    tributos: {
      csosn,
    },
  };
  const sens = avaliarSensibilidadeFiscal(itemCsosn, '1');
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(
    sens.motivosSensibilidade.includes('CREDITO_VEDADO_SIMPLES_NACIONAL'),
    `CSOSN ${csosn} deve disparar CREDITO_VEDADO_SIMPLES_NACIONAL`
  );
}
console.log('✓ Todos os CSOSNs de vedação de crédito detectados');

// 5. IPI ISENTO COM VALOR E IPI ATÍPICO
console.log('\n[5] IPI ISENTO COM VALOR E CSTS ATÍPICOS');
const cstsIsentoComValor = ['51', '52', '53', '54', '55'];
for (const cstIpi of cstsIsentoComValor) {
  const itemIpiIsento = {
    index: 1,
    cProd: `PROD-IPI-${cstIpi}`,
    xProd: `Item IPI Isento ${cstIpi}`,
    ncm: '84713012',
    ncmValidoSiscomex: true,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 100,
    vProd: 100,
    tributos: {
      cstIpi,
      vIPI: 15,
    },
  };
  const sens = avaliarSensibilidadeFiscal(itemIpiIsento, '3');
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(sens.motivosSensibilidade.includes('IPI_DESTACADO'));
}

// IPI atípico (CST 99 ou CST 00 a 49 em saída)
for (const cstIpi of ['99', '01', '49']) {
  const itemAtipico = {
    index: 1,
    cProd: `PROD-IPI-${cstIpi}`,
    xProd: `Item IPI Atípico ${cstIpi}`,
    ncm: '84713012',
    ncmValidoSiscomex: true,
    cfop: '5102',
    uCom: 'UN',
    qCom: 1,
    vUnCom: 100,
    vProd: 100,
    tributos: {
      cstIpi,
    },
  };
  const sens = avaliarSensibilidadeFiscal(itemAtipico, '3');
  assert.equal(sens.sensivelParaAuditoria, true);
  assert.ok(sens.motivosSensibilidade.includes('IPI_DESTACADO'));
}
console.log('✓ IPI isento com valor e CSTs atípicos validados');

// 6. CFOP INTERESTADUAL, ST, MONOFÁSICOS E REDUÇÃO DE BC
console.log('\n[6] DEMAIS GATILHOS FISCAIS DE ENTRADA');
// ST
const itemSt = {
  index: 1,
  cProd: 'ST-01',
  xProd: 'Item com ST',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5405',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  tributos: { cstIcms: '60' },
};
assert.ok(avaliarSensibilidadeFiscal(itemSt, '3').motivosSensibilidade.includes('SUBSTITUICAO_TRIBUTARIA'));

// CFOP Interestadual
const itemCfop6 = {
  index: 1,
  cProd: 'INT-01',
  xProd: 'Item interestadual',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '6102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  tributos: { cstIcms: '00' },
};
assert.ok(avaliarSensibilidadeFiscal(itemCfop6, '3').motivosSensibilidade.includes('CFOP_INTERESTADUAL'));

// Redução de Base
const itemRedBc = {
  index: 1,
  cProd: 'RED-01',
  xProd: 'Item reducao bc',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  tributos: { cstIcms: '20' },
};
assert.ok(avaliarSensibilidadeFiscal(itemRedBc, '3').motivosSensibilidade.includes('REDUCAO_BASE_CALCULO'));

// Isenção
const itemIsencao = {
  index: 1,
  cProd: 'ISEN-01',
  xProd: 'Item isencao',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  tributos: { cstIcms: '40' },
};
assert.ok(avaliarSensibilidadeFiscal(itemIsencao, '3').motivosSensibilidade.includes('ISENCAO_OU_NAO_TRIBUTADO'));

// Monofásico
const itemMonofasico = {
  index: 1,
  cProd: 'MONO-01',
  xProd: 'Item monofásico',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  tributos: { cstPis: '04', cstCofins: '04' },
};
assert.ok(avaliarSensibilidadeFiscal(itemMonofasico, '3').motivosSensibilidade.includes('PIS_COFINS_MONOFASICO_OU_ZERO'));

// Descrição insuficiente
const itemDescCurta = {
  index: 1,
  cProd: 'DESC-01',
  xProd: 'AB',
  ncm: '84713012',
  ncmValidoSiscomex: true,
  cfop: '5102',
  uCom: 'UN',
  qCom: 1,
  vUnCom: 100,
  vProd: 100,
  tributos: {},
};
assert.ok(avaliarSensibilidadeFiscal(itemDescCurta, '3').motivosSensibilidade.includes('DESCRICAO_INSUFICIENTE'));

console.log('✓ Todos os demais gatilhos fiscais de entrada validados com precisão cirúrgica');

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('  TODAS AS VERIFICAÇÕES DO DOMÍNIO FISCAL APROVADAS COM SUCESSO! ✓');
console.log('══════════════════════════════════════════════════════════════════════');
