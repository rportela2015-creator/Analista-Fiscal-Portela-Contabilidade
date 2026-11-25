import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO,
  carregarAliquotasManuais,
  salvarAliquotasManuais,
  limparAliquotasManuais,
} from '../lib/hooks/useParametrosPrecificacao.ts';
import { sugerirAliquotasPrecificacao, simular } from '../lib/precificacao.ts';
import { mods } from 'ncm:libs';

function criarStorageMock() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('Marco 3 — Persistência de alíquotas editadas manualmente segmentada por empresa', () => {
  const storage = criarStorageMock();

  // Salva alíquotas customizadas para empresa A (CBS, IBS, IS, ICMS, PIS/COFINS, IPI, DAS, IRPJ/CSLL)
  salvarAliquotasManuais(
    'empresa-alpha',
    {
      cbsPct: 9.5,
      ibsPct: 1.4,
      isPct: 2.0,
      icmsVendaPct: 19.5,
      pisCofinsVendaPct: 3.65,
      ipiPct: 5.0,
      dasEfetivoPct: 8.2,
      irpjCsllEfetivoPct: 3.1,
    },
    storage
  );

  // Salva configuração independente para empresa B
  salvarAliquotasManuais('empresa-beta', { cbsPct: 10.2, ibsPct: 0.5 }, storage);

  const bruto = storage.getItem(CHAVE_STORAGE_ALIQUOTAS_PRECIFICACAO);
  assert.ok(bruto, 'Deve gravar na chave oficial portela_precificacao_aliquotas_v1');

  // Simula recarregamento de página (leitura fresca a partir do storage serializado)
  const recarregadoAlpha = carregarAliquotasManuais('empresa-alpha', storage);
  const recarregadoBeta = carregarAliquotasManuais('empresa-beta', storage);

  assert.equal(recarregadoAlpha.cbsPct, 9.5);
  assert.equal(recarregadoAlpha.ibsPct, 1.4);
  assert.equal(recarregadoAlpha.isPct, 2.0);
  assert.equal(recarregadoAlpha.icmsVendaPct, 19.5);
  assert.equal(recarregadoAlpha.pisCofinsVendaPct, 3.65);
  assert.equal(recarregadoAlpha.ipiPct, 5.0);
  assert.equal(recarregadoAlpha.dasEfetivoPct, 8.2);
  assert.equal(recarregadoAlpha.irpjCsllEfetivoPct, 3.1);

  assert.equal(recarregadoBeta.cbsPct, 10.2);
  assert.equal(recarregadoBeta.ibsPct, 0.5);
  assert.equal(recarregadoBeta.icmsVendaPct, undefined);

  // Sanitização contra valores inválidos
  salvarAliquotasManuais('empresa-gamma', { cbsPct: -5, ibsPct: 150, icmsVendaPct: 17 }, storage);
  const recarregadoGamma = carregarAliquotasManuais('empresa-gamma', storage);
  assert.equal(recarregadoGamma.cbsPct, undefined);
  assert.equal(recarregadoGamma.ibsPct, undefined);
  assert.equal(recarregadoGamma.icmsVendaPct, 17);

  // Restauração para empresa A não deve apagar empresa B
  limparAliquotasManuais('empresa-alpha', storage);
  assert.deepEqual(carregarAliquotasManuais('empresa-alpha', storage), {});
  assert.equal(carregarAliquotasManuais('empresa-beta', storage).cbsPct, 10.2);
});

test('Marco 3 — Integração das alíquotas persistidas no cálculo de sugerirAliquotasPrecificacao e simular', () => {
  const marco = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'rules', 'marco-legal.json'), 'utf8'));
  const reforma = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'reforma.json'), 'utf8'));
  const storage = criarStorageMock();

  salvarAliquotasManuais('emp-01', { cbsPct: 11.5, ibsPct: 2.5 }, storage);
  const overridesPersistidos = carregarAliquotasManuais('emp-01', storage);

  const sugPadrao = sugerirAliquotasPrecificacao({
    ncm: '84713012',
    ano: 2027,
    regime: 'presumido',
    ufOrigem: 'PR',
    ufDestino: 'PR',
    dadosReforma: reforma,
    marco,
  });

  const sugCustom = sugerirAliquotasPrecificacao({
    ncm: '84713012',
    ano: 2027,
    regime: 'presumido',
    ufOrigem: 'PR',
    ufDestino: 'PR',
    dadosReforma: reforma,
    marco,
    overrides: overridesPersistidos,
  });

  assert.equal(sugCustom.aliquotasAplicadas.cbsPct, 11.5);
  assert.equal(sugCustom.aliquotasAplicadas.ibsPct, 2.5);
  assert.ok(sugCustom.camposEditados.includes('cbsPct'));
  assert.ok(sugCustom.camposEditados.includes('ibsPct'));

  const item = {
    codigo: 'P1',
    descricao: 'Produto Teste',
    ncm: '84713012',
    quantidade: 1,
    valorBrutoEntrada: 100,
  };

  const resPadrao = simular(
    item,
    {
      ano: 2027,
      uf: 'PR',
      regime: 'presumido',
      margemLiquidaPct: 20,
      despesasVariaveisPct: 5,
      icmsSaidaPct: sugPadrao.aliquotasAplicadas.icmsVendaPct,
      overrides: sugPadrao.aliquotasAplicadas,
    },
    { reforma, marco }
  );

  const resCustom = simular(
    item,
    {
      ano: 2027,
      uf: 'PR',
      regime: 'presumido',
      margemLiquidaPct: 20,
      despesasVariaveisPct: 5,
      icmsSaidaPct: sugCustom.aliquotasAplicadas.icmsVendaPct,
      overrides: sugCustom.aliquotasAplicadas,
    },
    { reforma, marco }
  );

  assert.ok(resCustom.preco.vCBS > resPadrao.preco.vCBS);
  assert.ok(resCustom.preco.vIBS > resPadrao.preco.vIBS);
  assert.ok(mods.preco);
});

test('Marco 3 — Precificar.tsx integra useParametrosPrecificacao, indicador custom e botão Restaurar Padrão >= 44px', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components', 'Precificar.tsx'), 'utf8');
  assert.ok(src.includes('useParametrosPrecificacao'));
  assert.ok(src.includes('Restaurar Alíquotas Padrão'));
  assert.ok(src.includes('Customizada') || src.includes('customizadas'));
  assert.ok(src.includes('min-h-[44px]') || src.includes("minHeight: '44px'"));
});
