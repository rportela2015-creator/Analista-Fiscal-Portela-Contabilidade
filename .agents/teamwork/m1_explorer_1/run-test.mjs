import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const outfile = '.agents/teamwork/m1_explorer_1/.temp-bundle.mjs';

try {
  await build({
    entryPoints: ['.agents/teamwork/m1_explorer_1/test-proposed-extrator.mjs'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    alias: {
      '@': process.cwd().replace(/\\/g, '/'),
    },
    external: ['pdf-parse'],
    logLevel: 'warning',
  });

  const r = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
  await rm(outfile, { force: true });
  process.exit(r.status ?? 0);
} catch (err) {
  console.error(err);
  await rm(outfile, { force: true }).catch(() => {});
  process.exit(1);
}
