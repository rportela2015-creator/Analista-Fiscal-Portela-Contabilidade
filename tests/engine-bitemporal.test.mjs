/**
 * Testes Unitários: Enquadrador Matricial e Motor Bitemporal (lib/engine)
 * Etapa 16 (Passo 3 do Ciclo 4)
 *
 * Valida:
 * 1. Teste A: Transição temporal de vigência (ST expirando em 2026-02-28 vs Normal iniciando em 2026-03-01).
 *    Data 2026-02-20 deriva ST (CFOP 5405); Data 2026-03-10 deriva Normal (CFOP 5102).
 * 2. Teste B: Detecção de colisão normativa com conflito: true (Isenção Anexo V vs Diferimento Total Anexo VIII).
 * 3. Teste C: Hierarquia material e Longest Match NCM (8 dígitos prevalece sobre 4 dígitos).
 * 4. Teste D: Calculadora dinâmica de ICMS próprio, ST com MVA, Redução de BC, Diferimento e FCP.
 */

import assert from 'node:assert/strict';
import { avaliarRegrasVigentes, estaVigenteNaData } from '../lib/engine/enquadrador.ts';
import { executarCalculoIcms, calcularMvaAjustada } from '../lib/engine/calculadora.ts';

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

// -----------------------------------------------------------------------------
// CATÁLOGO MOCK PARA TESTES
// -----------------------------------------------------------------------------
const fontePadrao = {
  tipo: 'decreto',
  norma: '7871',
  dispositivo: 'RICMS/PR',
  url: 'https://www.fazenda.pr.gov.br',
  hash_arquivo: 'abc123hash',
  capturado_em: '2026-01-01T00:00:00Z',
  data_publicacao: '2017-10-01',
};

// Teste A: Regra de ST (vigente até 2026-02-28) e Regra Normal (vigente a partir de 2026-03-01)
const regraStExpirando = {
  id: 'PR_RICMS_ST_AUTOPECAS_2025',
  jurisdicao: 'PR',
  tributo: 'ICMS',
  tipo_regra: 'ST',
  vigencia: {
    inicio: '2020-01-01',
    fim: '2026-02-28',
  },
  condicoes: [
    {
      ncm_prefixo: ['87082999', '8708'],
      cest: '0100100',
      tipo_operacao: 'revenda',
      origem_uf: 'PR',
      destino_uf: 'PR',
      regime_destinatario: 'todos',
    },
  ],
  cst_exigido: '60',
  cfop_sugerido: '5405',
  fonte: fontePadrao,
  parametros: {
    regra_id: 'PR_RICMS_ST_AUTOPECAS_2025',
    aliquota_interna: 19.5,
    aliquota_interestadual: 12.0,
    mva_original: 40.0,
  },
};

const regraNormalIniciando = {
  id: 'PR_RICMS_NORMAL_AUTOPECAS_2026',
  jurisdicao: 'PR',
  tributo: 'ICMS',
  tipo_regra: 'aliquota_normal',
  vigencia: {
    inicio: '2026-03-01',
    fim: undefined,
  },
  condicoes: [
    {
      ncm_prefixo: ['87082999', '8708'],
      tipo_operacao: 'revenda',
      origem_uf: 'PR',
      destino_uf: 'PR',
      regime_destinatario: 'todos',
    },
  ],
  cst_exigido: '00',
  cfop_sugerido: '5102',
  fonte: fontePadrao,
  parametros: {
    regra_id: 'PR_RICMS_NORMAL_AUTOPECAS_2026',
    aliquota_interna: 19.5,
    aliquota_interestadual: 12.0,
  },
};

// -----------------------------------------------------------------------------
// TESTE A: BITEMPORALIDADE RIGOROSA (Vigência e Transição de Regime)
// -----------------------------------------------------------------------------
t('Teste A1: Data 2026-02-20 enquadra em ST e gera CFOP 5405 (CST 60)', () => {
  const catalogo = [regraStExpirando, regraNormalIniciando];

  const resultado = avaliarRegrasVigentes(
    '8708.29.99',
    '0100100',
    '2026-02-20',
    'interna',
    catalogo
  );

  assert.equal(resultado.regrasAplicaveis.length, 1, 'Deve selecionar exatamente 1 regra vigente em 2026-02-20');
  assert.equal(resultado.regraPrincipal?.id, 'PR_RICMS_ST_AUTOPECAS_2025');
  assert.equal(resultado.regraPrincipal?.tipo_regra, 'ST');
  assert.equal(resultado.cfopSugerido, '5405', 'Operação em 2026-02-20 deve gerar CFOP 5405');
  assert.equal(resultado.cstSugerido, '60', 'CST deve ser 60 (ST cobrada anteriormente)');
  assert.equal(resultado.conflito, false, 'Não deve haver conflito');
});

t('Teste A2: Data 2026-03-10 enquadra em Alíquota Normal e gera CFOP 5102 (CST 00)', () => {
  const catalogo = [regraStExpirando, regraNormalIniciando];

  const resultado = avaliarRegrasVigentes(
    '8708.29.99',
    '',
    '2026-03-10',
    'interna',
    catalogo
  );

  assert.equal(resultado.regrasAplicaveis.length, 1, 'Deve selecionar exatamente 1 regra vigente em 2026-03-10');
  assert.equal(resultado.regraPrincipal?.id, 'PR_RICMS_NORMAL_AUTOPECAS_2026');
  assert.equal(resultado.regraPrincipal?.tipo_regra, 'aliquota_normal');
  assert.equal(resultado.cfopSugerido, '5102', 'Operação em 2026-03-10 deve gerar CFOP 5102');
  assert.equal(resultado.cstSugerido, '00', 'CST deve ser 00 (Integral)');
  assert.equal(resultado.conflito, false, 'Não deve haver conflito');
});

// -----------------------------------------------------------------------------
// TESTE B: DETECÇÃO DE COLISÃO NORMATIVA (Isenção x Diferimento Total)
// -----------------------------------------------------------------------------
t('Teste B: Colisão intencional entre Isenção (Anexo V) e Diferimento Total (Anexo VIII) gera conflito: true', () => {
  const regraIsencao = {
    id: 'PR_RICMS_ANEXO_V_ART_2',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'isencao',
    vigencia: { inicio: '2026-01-01', fim: '2026-12-31' },
    condicoes: [
      {
        ncm_prefixo: ['07019000', '0701'],
        tipo_operacao: 'revenda',
        origem_uf: 'PR',
        destino_uf: 'PR',
        regime_destinatario: 'todos',
      },
    ],
    cst_exigido: '40',
    fonte: fontePadrao,
  };

  const regraDiferimento = {
    id: 'PR_RICMS_ANEXO_VIII_ART_10',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'diferimento',
    vigencia: { inicio: '2026-01-01', fim: '2026-12-31' },
    condicoes: [
      {
        ncm_prefixo: ['07019000', '0701'],
        tipo_operacao: 'revenda',
        origem_uf: 'PR',
        destino_uf: 'PR',
        regime_destinatario: 'todos',
      },
    ],
    cst_exigido: '51',
    fonte: fontePadrao,
  };

  const catalogoConflitante = [regraIsencao, regraDiferimento];

  const resultado = avaliarRegrasVigentes(
    '0701.90.00',
    '',
    '2026-06-15',
    'interna',
    catalogoConflitante
  );

  assert.equal(resultado.conflito, true, 'Deve sinalizar conflito: true para auditoria humana');
  assert.ok(resultado.motivoConflito && resultado.motivoConflito.includes('Colisão detectada'));
  assert.equal(resultado.regrasAplicaveis.length, 2, 'Ambas as regras concorrentes devem ser listadas');
});

// -----------------------------------------------------------------------------
// TESTE C: LONGEST MATCH NCM (8 dígitos prevalece sobre 4 dígitos)
// -----------------------------------------------------------------------------
t('Teste C: Regra específica com 8 dígitos tem precedência sobre regra genérica de 4 dígitos', () => {
  const regraGenerica4 = {
    id: 'REGRA_GENERICA_8432',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'aliquota_normal',
    vigencia: { inicio: '2020-01-01' },
    condicoes: [
      {
        ncm_prefixo: ['8432'], // 4 dígitos
        tipo_operacao: 'revenda',
        origem_uf: 'PR',
        destino_uf: 'PR',
        regime_destinatario: 'todos',
      },
    ],
    cst_exigido: '00',
    fonte: fontePadrao,
  };

  const regraEspecifica8 = {
    id: 'REGRA_ESPECIFICA_84321000',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'reducao_bc',
    vigencia: { inicio: '2020-01-01' },
    condicoes: [
      {
        ncm_prefixo: ['84321000'], // 8 dígitos exatos
        tipo_operacao: 'revenda',
        origem_uf: 'PR',
        destino_uf: 'PR',
        regime_destinatario: 'todos',
      },
    ],
    cst_exigido: '20',
    fonte: fontePadrao,
    parametros: {
      regra_id: 'REGRA_ESPECIFICA_84321000',
      aliquota_interna: 19.5,
      aliquota_interestadual: 12.0,
      pRedBC: 71.28,
    },
  };

  const catalogo = [regraGenerica4, regraEspecifica8];

  const resultado = avaliarRegrasVigentes(
    '8432.10.00',
    '',
    '2026-06-01',
    'interna',
    catalogo
  );

  assert.equal(resultado.regrasAplicaveis.length, 1, 'Apenas a regra mais específica deve ser eleita');
  assert.equal(resultado.regraPrincipal?.id, 'REGRA_ESPECIFICA_84321000', 'Regra de 8 dígitos deve vencer a de 4');
  assert.equal(resultado.regraPrincipal?.tipo_regra, 'reducao_bc');
  assert.equal(resultado.cstSugerido, '20');
});

// -----------------------------------------------------------------------------
// TESTE D: CALCULADORA DINÂMICA (ICMS Próprio, ST, Redução, Diferimento, FCP)
// -----------------------------------------------------------------------------
t('Teste D1: Cálculo de ICMS-ST com MVA Ajustada e Débito Próprio', () => {
  const regraSt = {
    id: 'REGRA_CALC_ST',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'ST',
    vigencia: { inicio: '2020-01-01' },
    condicoes: [],
    fonte: fontePadrao,
    parametros: {
      regra_id: 'REGRA_CALC_ST',
      aliquota_interna: 19.5,
      aliquota_interestadual: 12.0,
      mva_original: 40.0,
    },
  };

  const valores = {
    valor_operacao: 1000.0,
    frete: 50.0,
    seguro: 10.0,
    outras_despesas: 0.0,
    desconto_incondicional: 60.0, // Base integral = 1000 + 50 + 10 - 60 = 1000.00
    ipi: 100.0,                   // Total com IPI para ST = 1100.00
  };

  const calc = executarCalculoIcms(regraSt, valores);

  // ICMS Próprio: 1000 * 19.5% = 195.00
  assert.equal(calc.base_calculo_propria, 1000.0);
  assert.equal(calc.valor_icms_proprio, 195.0);
  assert.equal(calc.Valor_ICMS_Proprio, 195.0);

  // Base ST: (1000 + 100) * (1 + 0.40) = 1100 * 1.4 = 1540.00
  assert.equal(calc.base_calculo_st, 1540.0);
  // Débito ST Bruto = 1540 * 19.5% = 300.30
  // ICMS ST = 300.30 - 195.00 = 105.30
  assert.equal(calc.valor_icms_st, 105.3);
  assert.equal(calc.Valor_ICMS_ST, 105.3);
});

t('Teste D2: Redução de Base de Cálculo (Máquinas Agrícolas - Carga Efetiva 5,6%)', () => {
  const regraReducao = {
    id: 'REGRA_MAQUINAS_AGRICOLAS',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'reducao_bc',
    vigencia: { inicio: '2020-01-01' },
    condicoes: [],
    fonte: fontePadrao,
    parametros: {
      regra_id: 'REGRA_MAQUINAS_AGRICOLAS',
      aliquota_interna: 19.5,
      aliquota_interestadual: 12.0,
      pRedBC: 71.282, // resulta em ~5.6%
    },
  };

  const valores = { valor_operacao: 10000.0 };
  const calc = executarCalculoIcms(regraReducao, valores);

  assert.ok(calc.base_calculo_propria < 10000.0, 'Base de cálculo deve ser reduzida');
  assert.equal(calc.Valor_ICMS_ST, 0, 'Não deve ter ST em redução de base comum');
  assert.ok(calc.Valor_ICMS_Proprio > 550 && calc.Valor_ICMS_Proprio < 570);
});

t('Teste D3: Diferimento Parcial (Art. 28 Anexo VIII PR - Carga Efetiva 13%)', () => {
  const regraDiferimento = {
    id: 'REGRA_DIFERIMENTO_PARCIAL',
    jurisdicao: 'PR',
    tributo: 'ICMS',
    tipo_regra: 'diferimento',
    vigencia: { inicio: '2020-01-01' },
    condicoes: [],
    fonte: fontePadrao,
    parametros: {
      regra_id: 'REGRA_DIFERIMENTO_PARCIAL',
      aliquota_interna: 19.5,
      aliquota_interestadual: 12.0,
      carga_efetiva: 13.0,
    },
  };

  const valores = { valor_operacao: 1000.0 };
  const calc = executarCalculoIcms(regraDiferimento, valores);

  // Integral: 195.00, Carga devida no ato: 130.00 (13%), Diferido: 65.00
  assert.equal(calc.base_calculo_propria, 1000.0);
  assert.equal(calc.valor_icms_proprio, 130.0);
  assert.equal(calc.valor_icms_diferido, 65.0);
  assert.equal(calc.Carga_Efetiva, 13.0);
});

t('Teste D4: Formula de MVA Ajustada do CONFAZ', () => {
  // MVA Original = 40%, Alíquota Inter = 12%, Alíquota Intra = 19.5%
  // [ (1 + 0.40) * (1 - 0.12) / (1 - 0.195) ] - 1 = [ 1.40 * 0.88 / 0.805 ] - 1 = [ 1.232 / 0.805 ] - 1 = 1.53043 - 1 = 53.04%
  const mvaAjustada = calcularMvaAjustada(40.0, 12.0, 19.5);
  assert.ok(mvaAjustada >= 53.0 && mvaAjustada <= 53.1, `MVA ajustada calculada: ${mvaAjustada}`);
});

console.log('\nSUÍTE MOTOR BITEMPORAL & CALCULADORA OK ✓');
