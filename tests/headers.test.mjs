import assert from 'node:assert/strict';
import nextConfig from '../next.config.mjs';
import { test } from 'node:test';

test('headers()', async (t) => {
  const headers = await nextConfig.headers();

  await t.test('existe regra com has.query.v e immutable', () => {
    const immutableRule = headers.find(h =>
      h.has?.some(has => has.type === 'query' && has.key === 'v') &&
      h.headers.some(h => h.key === 'Cache-Control' && h.value.includes('immutable'))
    );
    assert.ok(immutableRule, 'Regra immutable com has.query.v não encontrada');
  });

  await t.test('nenhuma regra sem has aplica immutable', () => {
    const noHasImmutable = headers.find(h =>
      !h.has && h.headers.some(header => header.key === 'Cache-Control' && header.value.includes('immutable'))
    );
    assert.ok(!noHasImmutable, 'Encontrada regra sem `has` que aplica immutable');
  });

  await t.test('meta.json => no-cache', () => {
    const metaRule = headers.find(h => h.source === '/data/meta.json');
    assert.ok(metaRule, 'Regra de meta.json não encontrada');
    const cacheHeader = metaRule.headers.find(h => h.key === 'Cache-Control');
    assert.ok(cacheHeader && cacheHeader.value === 'no-cache', 'Cache-Control de meta.json deve ser no-cache');
  });

  await t.test('nenhuma regra possui X-Frame-Options: ALLOWALL (inseguro)', () => {
    const hasAllowAll = headers.some(h =>
      h.headers.some(header => header.key === 'X-Frame-Options' && header.value === 'ALLOWALL')
    );
    assert.equal(hasAllowAll, false, 'X-Frame-Options: ALLOWALL deve ser removido');
  });

  await t.test('todas as regras possuem CSP com frame-ancestors e X-Content-Type-Options', () => {
    for (const rule of headers) {
      const csp = rule.headers.find(h => h.key === 'Content-Security-Policy');
      assert.ok(csp, `Regra ${rule.source} deve possuir Content-Security-Policy`);
      assert.ok(csp.value.includes("frame-ancestors 'self'"), `CSP deve conter frame-ancestors 'self'`);

      const nosniff = rule.headers.find(h => h.key === 'X-Content-Type-Options');
      assert.ok(nosniff && nosniff.value === 'nosniff', `Regra ${rule.source} deve possuir X-Content-Type-Options: nosniff`);
    }
  });
});
