#!/usr/bin/env node
/**
 * Runner executável de Paridade RFB (Sidecars Docker vs. Motor Local) sem depender de `tsx`.
 * Compila on-the-fly com `esbuild` os módulos reais `lib/fiscal/paridade-rfb.ts` e
 * `lib/integracoes/rtc-regime-regular/client.ts`.
 */

import { build } from 'esbuild';
import { existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const BUNDLE_OUT = join(ROOT, '.paridade-runner.bundle.mjs');

const inlineTs = {
  name: 'inline-ts-paridade',
  setup(b) {
    b.onResolve({ filter: /(\.(ts|tsx)$|^@\/)/ }, (args) => {
      let p = args.path;
      if (p.startsWith('@/')) {
        p = join(ROOT, p.slice(2));
      } else if (p.startsWith('.')) {
        const base = args.resolveDir || (args.importer ? dirname(args.importer) : ROOT);
        p = resolve(base, p);
      } else {
        return undefined;
      }

      for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
        const cand = p.endsWith('.ts') || p.endsWith('.tsx') ? p : p + ext;
        if (existsSync(cand) && statSync(cand).isFile()) {
          return { path: cand, namespace: 'ts' };
        }
      }
      return undefined;
    });

    b.onLoad({ filter: /.*/, namespace: 'ts' }, async (args) => {
      const { readFile } = await import('node:fs/promises');
      const { transform } = await import('esbuild');
      const src = await readFile(args.path, 'utf8');
      const out = await transform(src, { loader: 'ts', format: 'esm', target: 'node20' });
      return { contents: out.code, loader: 'js', resolveDir: dirname(args.path) };
    });
  },
};

const runnerCode = `
import { getRtcMode } from './lib/integracoes/rfb-health.ts';
import { calcularRegimeRegularRfb } from './lib/integracoes/rtc-regime-regular/client.ts';
import { arredondarMoedaRfb } from './lib/math/decimal-fiscal.ts';
import { compararParidadeRtc } from './lib/fiscal/paridade-rfb.ts';

async function main() {
  const status = await getRtcMode({ skipCache: true });
  console.log('[PARIDADE] Modo detectado:', status.mode, '| SHA-256:', status.snapshotSha256);

  if (status.mode !== 'live') {
    console.error('[PARIDADE] Sidecar RFB não está em modo live. Suba os containers ou defina RTC_LIVE_PROBE=true.');
    process.exit(1);
  }

  const operacao = {
    id: 'paridade-ci-1',
    versao: '1.0.0',
    municipio: 4106902,
    uf: 'PR',
    dhFatoGerador: '2026-06-15T10:00:00-03:00',
    itens: [
      {
        numero: 1,
        ncm: '84713012',
        cst: '000',
        cClassTrib: '000001',
        baseCalculo: 1000,
        quantidade: 1,
        unidade: 'UN',
      },
    ],
  };

  const oficial = await calcularRegimeRegularRfb(operacao);
  const localEstimado = {
    totais: {
      baseCalculoTotal: arredondarMoedaRfb(1000),
      valorIbsEstadualTotal: arredondarMoedaRfb(1),
      valorIbsMunicipalTotal: arredondarMoedaRfb(0),
      valorIbsTotal: arredondarMoedaRfb(1),
      valorCbsTotal: arredondarMoedaRfb(9),
      valorImpostoSeletivoTotal: arredondarMoedaRfb(0),
      valorTributosTotal: arredondarMoedaRfb(10),
    },
    itens: [
      {
        numero: 1,
        estadoItem: 'CALCULADO',
        baseCalculo: arredondarMoedaRfb(1000),
        valorIbsEstadual: arredondarMoedaRfb(1),
        valorIbsMunicipal: arredondarMoedaRfb(0),
        valorIbsTotal: arredondarMoedaRfb(1),
        valorCbs: arredondarMoedaRfb(9),
        valorImpostoSeletivo: arredondarMoedaRfb(0),
      },
    ],
  };

  const relatorio = compararParidadeRtc(oficial, localEstimado);
  console.log('[PARIDADE] Relatório:', JSON.stringify(relatorio, null, 2));
  if (!relatorio.paridadeTotal) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[PARIDADE] Erro:', err?.message || err);
  process.exit(1);
});
`;

try {
  await build({
    stdin: {
      contents: runnerCode,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: BUNDLE_OUT,
    plugins: [inlineTs],
    external: ['decimal.js', 'zod', 'node:*'],
  });

  const res = spawnSync(process.execPath, [BUNDLE_OUT], { cwd: ROOT, stdio: 'inherit' });
  process.exitCode = res.status ?? 1;
} finally {
  await rm(BUNDLE_OUT, { force: true });
}
