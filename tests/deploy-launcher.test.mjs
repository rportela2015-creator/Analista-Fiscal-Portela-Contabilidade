/**
 * Suíte de Testes de Validação de Infraestrutura, Deploy e Launcher (Etapa 13)
 *
 * Valida:
 * 1. Existência e integridade de Iniciar-MCM.bat e scripts/mcm-launcher.ps1.
 * 2. Execução de scripts/mcm-launcher.ps1 com -CheckOnly (exit code 0).
 * 3. Validação estrutural do Notebook colab/MCM_Colab_Launcher.ipynb (Jupyter v4).
 * 4. Validação dos manifestos Dockerfile e docker-compose.yml (serviço web + legal updater sob demanda).
 */
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

const asyncT = async (nome, fn) => {
  try {
    await fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

// -----------------------------------------------------------------------------
// 1. Existência e integridade dos executáveis locais
// -----------------------------------------------------------------------------
await asyncT('Infra: Iniciar-MCM.bat e scripts/mcm-launcher.ps1 presentes e consistentes', async () => {
  const batPath = resolve(ROOT, 'Iniciar-MCM.bat');
  const ps1Path = resolve(ROOT, 'scripts/mcm-launcher.ps1');

  await access(batPath);
  await access(ps1Path);

  const batContent = await readFile(batPath, 'utf8');
  assert.ok(batContent.includes('mcm-launcher.ps1'), 'Iniciar-MCM.bat deve chamar mcm-launcher.ps1');
  assert.ok(batContent.includes('powershell.exe'), 'Iniciar-MCM.bat deve invocar powershell.exe');

  const ps1Content = await readFile(ps1Path, 'utf8');
  assert.ok(ps1Content.includes('param ('), 'Launcher deve definir bloco de parâmetros');
  assert.ok(ps1Content.includes('$CheckOnly'), 'Launcher deve suportar -CheckOnly');
  assert.ok(ps1Content.includes('OLLAMA_KEEP_ALIVE'), 'Launcher deve configurar OLLAMA_KEEP_ALIVE');
  assert.ok(ps1Content.includes('ENABLE_UPDATE_ROUTE'), 'Launcher deve configurar ENABLE_UPDATE_ROUTE');
});

// -----------------------------------------------------------------------------
// 2. Execução real do launcher em modo -CheckOnly
// -----------------------------------------------------------------------------
t('Infra: scripts/mcm-launcher.ps1 executa com -CheckOnly e retorna exit code 0', () => {
  const psCmd = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const res = spawnSync(psCmd, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'scripts/mcm-launcher.ps1',
    '-CheckOnly',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(res.status, 0, `mcm-launcher.ps1 -CheckOnly falhou: ${res.stderr || res.stdout}`);
  assert.ok(res.stdout.includes('[MCM Preflight]'), 'Deve emitir mensagem de preflight');
  assert.ok(res.stdout.includes('Ambiente 100% verificado'), 'Deve confirmar integridade');
});

// -----------------------------------------------------------------------------
// 3. Validação do Notebook do Google Colab
// -----------------------------------------------------------------------------
await asyncT('Infra: colab/MCM_Colab_Launcher.ipynb é um notebook Jupyter v4 válido com 4 células', async () => {
  const ipynbPath = resolve(ROOT, 'colab/MCM_Colab_Launcher.ipynb');
  await access(ipynbPath);

  const rawJson = await readFile(ipynbPath, 'utf8');
  const nb = JSON.parse(rawJson);

  assert.equal(nb.nbformat, 4, 'Notebook deve ser nbformat versão 4');
  assert.ok(Array.isArray(nb.cells), 'Notebook deve possuir array de células');

  // Filtra células de código
  const codeCells = nb.cells.filter((c) => c.cell_type === 'code');
  assert.equal(codeCells.length, 4, 'Notebook deve possuir exatamente 4 células executáveis');

  // Célula 1: Montagem Drive e Symlink
  const c1Text = codeCells[0].source.join('');
  assert.ok(c1Text.includes('/content/drive'), 'Célula 1 deve montar /content/drive');
  assert.ok(c1Text.includes('Aplicativo_MCM_Data'), 'Célula 1 deve criar pasta persistente no Drive');
  assert.ok(c1Text.includes('os.symlink'), 'Célula 1 deve conectar public/data e rules via symlink');

  // Célula 2: Atualização do marco legal
  const c2Text = codeCells[1].source.join('');
  assert.ok(c2Text.includes('atualizar_marco_legal.py'), 'Célula 2 deve rodar atualizar_marco_legal.py');

  // Célula 3: Servidor Next.js e Cloudflared
  const c3Text = codeCells[2].source.join('');
  assert.ok(c3Text.includes('cloudflared tunnel'), 'Célula 3 deve iniciar cloudflared tunnel');
  assert.ok(c3Text.includes('ENABLE_UPDATE_ROUTE'), 'Célula 3 deve travar rota de atualização');

  // Célula 4: Teste do Webhook Fiscal
  const c4Text = codeCells[3].source.join('');
  assert.ok(c4Text.includes('/api/webhook/fiscal'), 'Célula 4 deve testar o endpoint /api/webhook/fiscal');
});

// -----------------------------------------------------------------------------
// 4. Validação de Dockerfile e docker-compose.yml
// -----------------------------------------------------------------------------
await asyncT('Infra: Dockerfile multi-stage e docker-compose.yml com profile updater sob demanda', async () => {
  const dockerfilePath = resolve(ROOT, 'Dockerfile');
  const composePath = resolve(ROOT, 'docker-compose.yml');
  const ignorePath = resolve(ROOT, '.dockerignore');

  await access(dockerfilePath);
  await access(composePath);
  await access(ignorePath);

  const dockerfile = await readFile(dockerfilePath, 'utf8');
  assert.ok(dockerfile.includes('AS builder'), 'Dockerfile deve ter estágio builder');
  assert.ok(dockerfile.includes('AS runner'), 'Dockerfile deve ter estágio runner');
  assert.ok(dockerfile.includes('USER nextjs'), 'Dockerfile deve rodar sob usuário não-root');
  assert.ok(dockerfile.includes('ENABLE_UPDATE_ROUTE="false"'), 'Dockerfile deve travar ENABLE_UPDATE_ROUTE por padrão');

  const compose = await readFile(composePath, 'utf8');
  assert.ok(compose.includes('mcm-web:'), 'docker-compose deve conter serviço mcm-web');
  assert.ok(compose.includes('mcm-legal-updater:'), 'docker-compose deve conter serviço mcm-legal-updater');
  assert.ok(compose.includes('profiles:'), 'mcm-legal-updater deve usar profile sob demanda');
  assert.ok(compose.includes('- updater'), 'mcm-legal-updater deve pertencer ao profile updater');
});

console.log('\nSUÍTE DEPLOY E LAUNCHER OK ✓');
