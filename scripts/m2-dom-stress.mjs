#!/usr/bin/env node
/**
 * scripts/m2-dom-stress.mjs
 *
 * Executor Orquestrador da Suíte de Estresse Empírico do Milestone 2:
 * 1. Empacota e executa tests/m2-ssr-stress.tsx em Node.js puro (SSR renderToString sem DOM).
 * 2. Empacota e executa tests/m2-dom-stress-entry.tsx sob JSDOM (100 ciclos de montagem, tri-state, eventos, hooks).
 *
 * Uso: node scripts/m2-dom-stress.mjs
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

if (!existsSync('node_modules/jsdom')) {
  console.error('XX jsdom ausente — execute `npm i -D jsdom` antes de rodar o harness');
  process.exit(1);
}
if (!existsSync('public/data/ncm.json')) {
  console.error('XX public/data/ncm.json ausente — execute `npm run build:dados` antes do harness');
  process.exit(1);
}

let falhasTotais = 0;

// ─── ETAPA 1: SSR String Rendering (ReactDOMServer.renderToString) ────────────
console.log('\n[1/2] Empacotando e executando testes de SSR em Node.js puro...');
const SAIDA_SSR = '.m2-ssr-bundle.mjs';
try {
  await build({
    absWorkingDir: process.cwd(),
    entryPoints: ['tests/m2-ssr-stress.tsx'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: SAIDA_SSR,
    loader: { '.css': 'empty' },
    tsconfig: './tsconfig.json',
    alias: { '@': '.' },
    external: ['react', 'react-dom', 'react-dom/server', 'node:fs/promises', 'node:fs', 'node:path', 'node:assert/strict'],
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"development"' },
  });

  const resSsr = spawnSync(process.execPath, [SAIDA_SSR], { stdio: 'inherit', cwd: process.cwd() });
  if (resSsr.status !== 0) {
    falhasTotais++;
    console.error('XX Etapa SSR falhou com status:', resSsr.status);
  }
} catch (err) {
  falhasTotais++;
  console.error('XX Falha ao empacotar SSR harness:', err);
} finally {
  await rm(SAIDA_SSR, { force: true });
}

// ─── ETAPA 2: JSDOM Mount, Cycles, Events & Hook Conformity ───────────────────
console.log('\n[2/2] Empacotando e executando testes de estresse em JSDOM real...');
const SAIDA_DOM = '.m2-dom-bundle.mjs';
try {
  await build({
    absWorkingDir: process.cwd(),
    entryPoints: ['tests/m2-dom-stress-entry.tsx'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: SAIDA_DOM,
    loader: { '.css': 'empty' },
    tsconfig: './tsconfig.json',
    alias: { '@': '.' },
    external: ['react', 'react-dom', 'react-dom/client', 'react-dom/server', 'jsdom', 'node:fs/promises', 'node:fs', 'node:path', 'node:assert/strict'],
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"development"' },
  });

  const resDom = spawnSync(process.execPath, [SAIDA_DOM], { stdio: 'inherit', cwd: process.cwd() });
  if (resDom.status !== 0) {
    falhasTotais++;
    console.error('XX Etapa JSDOM falhou com status:', resDom.status);
  }
} catch (err) {
  falhasTotais++;
  console.error('XX Falha ao empacotar JSDOM harness:', err);
} finally {
  await rm(SAIDA_DOM, { force: true });
}

console.log('\n══════════════════════════════════════════════════════════════════════');
if (falhasTotais === 0) {
  console.log('  M2 EMPIRICAL CHALLENGER STRESS HARNESS: ALL PHASES PASSED ✓');
  console.log('══════════════════════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.error(`  M2 EMPIRICAL CHALLENGER STRESS HARNESS: ${falhasTotais} ETAPA(S) COM FALHA XX`);
  console.log('══════════════════════════════════════════════════════════════════════');
  process.exit(1);
}
