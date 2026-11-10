/**
 * Roda a suíte sobre o TypeScript REAL do app (lib/*.ts e lib/ai/*.ts),
 * transpilado na hora pelo esbuild e embutido no bundle. Nenhum mock da
 * lógica: são os mesmos módulos que o servidor Next carrega.
 *
 * Correções vs versão anterior:
 *  - inline-ts resolve caminhos físicos absolutos (preserva subdiretório ai/)
 *  - externals expandidos: react, react-dom, pdf-parse, @google/genai, next, next/server
 *  - NextResponse shimado para testes de rotas
 *  - LIBS e shim incluem relatorio-erp
 *  - Todos os arquivos de teste incluídos na fila
 */
import { build, transform } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

// Raiz absoluta do repositório
const ROOT = resolve(process.cwd());

// Módulos lib/* carregados via ncm:libs (shim virtual)
const LIBS = ['data', 'engine', 'parametrizacao', 'reforma', 'xml', 'marco-legal', 'precificacao', 'relatorio-erp'];

/** extrai parseCsv de components/Lote.tsx para '.parse-csv.ts' */
async function ensureParse() {
  const src = await readFile('components/Lote.tsx', 'utf8');
  const a = src.indexOf('function parseCsv');
  const b = src.indexOf('const esc =');
  if (a < 0 || b < 0) throw new Error('não localizei parseCsv em components/Lote.tsx');
  const code = '/** gerado por scripts/test.mjs — espelho direto do componente */\n'
    + 'export ' + src.slice(a, b).replace('async function', 'function');
  await writeFile('.parse-csv.ts', code, 'utf8');
}

/**
 * Plugin inline-ts — transpila imports .ts/.tsx em tempo real,
 * preservando subdiretórios (lib/ai/, app/api/, etc.).
 *
 * Estratégia de resolução (prioridade):
 *  1. Alias @/ → ROOT/
 *  2. Relativo (começa com . ou ..) → resolve a partir do diretório do importador
 *  3. Repo-relativo sem ./ → resolve a partir de ROOT
 *  Tenta .ts e .tsx; ignora módulos node_ / npm (deixa o esbuild tratar como external).
 */
const inlineTs = {
  name: 'inline-ts',
  setup(b) {
    // ───────── onResolve ─────────
    b.onResolve({ filter: /(\.(ts|tsx)$|^@\/)/ }, (args) => {
      let p = args.path;

      // 1. Alias @/ → ROOT/
      if (p.startsWith('@/')) {
        p = join(ROOT, p.slice(2));
      } else if (p.startsWith('.')) {
        // 2. Relativo — resolve a partir do resolveDir (preferido) ou do diretório do importador
        // args.resolveDir é preenchido pelo shim e pelo onLoad que define resolveDir
        const base = args.resolveDir
          || (args.importer && !args.importer.includes(':') ? dirname(args.importer) : ROOT);
        p = resolve(base, p);
      } else if (!p.includes('node_modules') && (p.startsWith('lib/') || p.startsWith('app/') || p.startsWith('components/') || p.startsWith('scripts/'))) {
        // 3. Repo-relativo curto
        p = join(ROOT, p);
      } else {
        // Módulo externo (npm, node:*) → deixar esbuild resolver normalmente
        return undefined;
      }

      // Garante extensão .ts ou .tsx
      for (const ext of ['', '.ts', '.tsx']) {
        const candidate = p.endsWith('.ts') || p.endsWith('.tsx') ? p : p + ext;
        if (existsSync(candidate)) {
          return { path: candidate, namespace: 'ts' };
        }
      }

      // Fallback: tenta trocar .ts → .tsx
      const asTsx = p.replace(/\.ts$/, '.tsx');
      if (existsSync(asTsx)) return { path: asTsx, namespace: 'ts' };

      return undefined; // deixa esbuild emitir o erro natural
    });

    // ───────── onLoad ─────────
    b.onLoad({ filter: /.*/, namespace: 'ts' }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      const loader = args.path.endsWith('.tsx') ? 'tsx' : 'ts';
      const out = await transform(src, { loader, format: 'esm', target: 'node20' });
      return { contents: out.code, loader: 'js', resolveDir: dirname(args.path) };
    });
  },
};

/**
 * Shim virtual ncm:libs — expõe todos os módulos lib/ para os testes
 * via: import { mods } from 'ncm:libs'
 */
const shim = {
  name: 'shim',
  setup(b) {
    // ncm:libs
    b.onResolve({ filter: /^ncm:libs$/ }, () => ({ path: 'ncm:libs', namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
      // Usa caminhos relativos simples — o resolveDir aponta para lib/,
      // então inline-ts resolve cada import como lib/<m>.ts a partir de ROOT.
      contents:
        LIBS.map((m, i) => `import * as ns${i} from "./${m}.ts";`).join('\n')
        + `\nexport const mods = { data: ns0, engine: ns1, param: ns2, reforma: ns3, xml: ns4, marco: ns5, preco: ns6, relatorioErp: ns7 };`,
      loader: 'js',
      resolveDir: join(ROOT, 'lib'),
    }));

    // next/server shim — NextResponse mínimo para testes de rotas API
    b.onResolve({ filter: /^next(\/server)?$/ }, (args) => ({
      path: args.path, namespace: 'next-shim',
    }));
    b.onLoad({ filter: /.*/, namespace: 'next-shim' }, () => ({
      contents: `
export class NextResponse extends Response {
  static json(data, init) {
    const body = JSON.stringify(data);
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    return new NextResponse(body, { ...init, headers });
  }
  static redirect(url, init) {
    const status = typeof init === 'number' ? init : init?.status ?? 302;
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
  static next(init) { return new NextResponse(null, init); }
}
export const NextRequest = Request;
export default { NextResponse, NextRequest };
`,
      loader: 'js',
    }));
  },
};

// ─────────────────────────── FILA DE TESTES ───────────────────────────
// Inclui todos os arquivos de teste existentes.
// Testes que dependem de infra externa (Ollama, GPU) são tolerados com skip
// no próprio arquivo; aqui apenas controlamos quais entram na fila.
const ALL_TESTS = [
  'tests/data.test.mjs',
  'tests/engine.test.mjs',
  'tests/lote.test.mjs',
  'tests/probe.test.mjs',
  'tests/reforma.test.mjs',
  'tests/xml.test.mjs',
  'tests/auditoria.test.mjs',
  'tests/rules-integrity.test.mjs',
  'tests/fiscal.test.mjs',
  'tests/pipeline.test.mjs',
  'tests/versioning.test.mjs',
  'tests/versioning-fallback.test.mjs',
  'tests/versioning-fallback-empty.test.mjs',
  'tests/precificacao.test.mjs',
  'tests/exportacao-precificacao.test.mjs',
  'tests/relatorio-erp.test.mjs',
  'tests/extrator-nfe.test.mjs',
  'tests/extrator-multifonte.test.mjs',
  'tests/tabela-itens-extracao.test.mjs',
  'tests/auditoria-particionada.test.mjs',
  'tests/e2e-auditoria-entrada.test.mjs',
  'tests/classificar-ia-cache.test.mjs',
  'tests/ollama-client.test.mjs',
  'tests/headers.test.mjs',
  'tests/api-security.test.mjs',
];

// Suporte a execução de suíte única via CLI: node scripts/test.mjs tests/foo.test.mjs
const cliArgs = process.argv.slice(2).filter((a) => a.endsWith('.mjs'));
const entries = cliArgs.length > 0 ? cliArgs : ALL_TESTS;

// Externos — não empacotar, deixar o Node resolver em runtime
const EXTERNALS = [
  'react', 'react-dom',
  'pdf-parse',
  '@google/genai',
  'next', 'next/server',
  'jsdom',
  'node:*',
];

// ─────────────────────────── RUNNER ───────────────────────────
await ensureParse();
let fail = 0;

// 1) Ordem de hooks nos componentes (typecheck não pega; quebrar isso é tela branca)
{
  console.log('\n──────── scripts/hookcheck.mjs ────────');
  const r = spawnSync(process.execPath, ['scripts/hookcheck.mjs', 'components'], { stdio: 'inherit' });
  if (r.status !== 0) fail++;
}

// 2) Fumaça de UI em DOM real (jsdom) — monta, digita, troca select, desmonta
{
  console.log('\n──────── scripts/ui-smoke.mjs ────────');
  const r = spawnSync(process.execPath, ['scripts/ui-smoke.mjs'], { stdio: 'inherit' });
  if (r.status !== 0) fail++;
}

// 3) Suítes de testes TypeScript/JS
for (const entry of entries) {
  // Verifica se o arquivo existe antes de tentar buildar
  if (!existsSync(join(ROOT, entry))) {
    console.warn(`\n⚠  ${entry} não encontrado — pulando`);
    continue;
  }

  const out = '.bundle-' + entry.split('/').pop() + '.mjs';
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile: out,
      plugins: [inlineTs, shim],
      logLevel: 'warning',
      external: EXTERNALS,
    });
  } catch (err) {
    console.error(`✗ build de teste falhou em ${entry}: ${err.message ?? err}`);
    fail++;
    continue;
  }
  console.log(`\n──────── ${entry} ────────`);
  const r = spawnSync(process.execPath, [out], { stdio: 'inherit' });
  fail += r.status ?? 1;
  await rm(out, { force: true });
}

await rm('.parse-csv.ts', { force: true });

if (fail) {
  console.error(`\n✗ ${fail} suíte(s) falharam`);
  process.exit(1);
}
console.log('\nSUÍTES COMPLETAS ✓');
