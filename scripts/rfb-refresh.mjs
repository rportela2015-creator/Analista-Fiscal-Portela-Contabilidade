#!/usr/bin/env node
/**
 * Refresh, Validação por Pisos (Floors) e Publicação Atômica do Snapshot RFB / Reforma / NCM.
 *
 * Cross-platform (Windows nativo + Linux CI):
 *  - Detecta automaticamente `python` ou `python3`.
 *  - Executa pipeline em diretório temporário `.rfb-stage/` (ou valida `public/data/` em `--skip-download --dry-run`).
 *  - Valida TODOS os artefatos contra `rules/snapshot-floors.json` (`minBytes`, parse JSON estrito, `minRecords`, `magicBytes`).
 *  - Calcula SHA-256 por arquivo e `snapshotSha256` consolidado.
 *  - Publica atomicamente (`.tmp` -> `renameSync`) em `public/data/` e gera `public/data/rfb-status.json`.
 *
 * Flags:
 *  --max-age-days <N>   Idade máxima antes do refresh (default: 30)
 *  --force              Força recomputação/publicação mesmo se snapshot estiver dentro do prazo
 *  --dry-run            Executa validação sem gravar em public/data/
 *  --skip-download      Não baixa novas fontes RFB; usa data/raw/ local
 *  --check-clean-git    Aborta se `git status --porcelain public/data` estiver sujo
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());

export function detectarPython() {
  const candidates = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const bin of candidates) {
    const r = spawnSync(bin, ['--version'], { stdio: 'pipe', encoding: 'utf8' });
    if (r.status === 0) {
      return bin;
    }
  }
  throw new Error('Interpretador Python não encontrado no PATH (tentado: python, python3).');
}

export function contarRegistrosJson(obj, recordPath) {
  if (obj == null) return 0;
  let alvo = obj;
  if (recordPath && typeof recordPath === 'string') {
    for (const seg of recordPath.split('.')) {
      if (alvo && typeof alvo === 'object') {
        alvo = alvo[seg];
      } else {
        alvo = undefined;
        break;
      }
    }
  }
  if (Array.isArray(alvo)) return alvo.length;
  if (alvo && typeof alvo === 'object') return Object.keys(alvo).length;
  return 0;
}

export function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function calcularSnapshotSha256(fileEntries) {
  const ordenados = [...fileEntries].sort((a, b) => a.file.localeCompare(b.file));
  const payload = ordenados.map((f) => `${f.file}:${f.sha256}`).join('\n');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Valida um único artefato em disco contra a especificação de piso (`minBytes`, `minRecords`, `format`, `magicBytes`).
 */
export function validarArtefatoContraFloor(filePath, spec, logicalName = filePath) {
  const required = spec?.required !== false;
  if (!existsSync(filePath)) {
    if (!required) {
      return { ok: true, skipped: true, file: logicalName, bytes: 0, records: 0, sha256: null };
    }
    return {
      ok: false,
      file: logicalName,
      error: `Artefato obrigatório ausente: ${logicalName}`,
    };
  }

  const stat = statSync(filePath);
  if (!stat.isFile()) {
    return { ok: false, file: logicalName, error: `Caminho não é arquivo regular: ${logicalName}` };
  }

  const bytes = stat.size;
  const minBytes = Number(spec?.minBytes ?? 0);
  if (bytes < minBytes) {
    return {
      ok: false,
      file: logicalName,
      bytes,
      error: `${logicalName} abaixo do piso de tamanho (${bytes} bytes < minBytes ${minBytes})`,
    };
  }

  const rawBuf = readFileSync(filePath);
  const sha256 = sha256Buffer(rawBuf);

  if (spec?.magicBytes) {
    const magic = String(spec.magicBytes);
    const head = rawBuf.subarray(0, Buffer.byteLength(magic, 'utf8')).toString('utf8');
    if (head !== magic) {
      return {
        ok: false,
        file: logicalName,
        bytes,
        sha256,
        error: `${logicalName} falhou na validação de assinatura binária (esperado "${magic}", encontrado "${head.replace(/[\r\n]/g, '')}")`,
      };
    }
  }

  let records = 0;
  if (spec?.format === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(rawBuf.toString('utf8'));
    } catch (err) {
      return {
        ok: false,
        file: logicalName,
        bytes,
        sha256,
        error: `${logicalName} contém JSON inválido: ${err?.message || err}`,
      };
    }

    records = contarRegistrosJson(parsed, spec.recordPath);
    const minRecords = Number(spec?.minRecords ?? 0);
    if (records < minRecords) {
      return {
        ok: false,
        file: logicalName,
        bytes,
        records,
        sha256,
        error: `${logicalName} abaixo do piso de registros (${records} < minRecords ${minRecords})`,
      };
    }
  }

  return {
    ok: true,
    skipped: false,
    file: logicalName,
    bytes,
    records,
    sha256,
  };
}

/**
 * Valida todos os artefatos listados no manifesto `rules/snapshot-floors.json`.
 * Quando `stagePublicDir` for fornecido, artefatos `public/data/*` são resolvidos a partir dele.
 */
export function validarSnapshotFloors(rootDir, floorsConfig, opts = {}) {
  const stagePublicDir = opts.stagePublicDir || null;
  const results = [];
  const errors = [];

  const entries = Object.entries(floorsConfig?.files || {});
  for (const [relPath, spec] of entries) {
    let targetPath = resolve(rootDir, relPath);
    if (stagePublicDir && relPath.startsWith('public/data/')) {
      const fileName = relPath.slice('public/data/'.length);
      targetPath = resolve(stagePublicDir, fileName);
    }

    const r = validarArtefatoContraFloor(targetPath, spec, relPath);
    if (!r.ok) {
      errors.push(r.error);
    } else if (!r.skipped && relPath.startsWith('public/data/')) {
      results.push({
        file: relPath,
        bytes: r.bytes,
        records: r.records,
        sha256: r.sha256,
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    files: results,
    snapshotSha256: calcularSnapshotSha256(results),
  };
}

function writeFileAtomic(targetPath, content) {
  const tmpPath = `${targetPath}.tmp`;
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, targetPath);
}

function parseCliArgs(argv) {
  let maxAgeDays = 30;
  let force = false;
  let dryRun = false;
  let skipDownload = false;
  let checkCleanGit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') force = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--skip-download') skipDownload = true;
    else if (arg === '--check-clean-git') checkCleanGit = true;
    else if (arg === '--max-age-days' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n >= 0) maxAgeDays = n;
    } else if (arg.startsWith('--max-age-days=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) maxAgeDays = n;
    }
  }
  return { maxAgeDays, force, dryRun, skipDownload, checkCleanGit };
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const floorsPath = resolve(ROOT, 'rules', 'snapshot-floors.json');
  const publicDataDir = resolve(ROOT, 'public', 'data');
  const statusPath = resolve(publicDataDir, 'rfb-status.json');
  const stageDir = resolve(ROOT, '.rfb-stage');

  if (!existsSync(floorsPath)) {
    console.error(`XX Manifesto de pisos não encontrado: ${floorsPath}`);
    process.exit(1);
  }
  const floorsConfig = JSON.parse(readFileSync(floorsPath, 'utf8'));

  if (args.checkCleanGit) {
    const gitCheck = spawnSync('git', ['status', '--porcelain', 'public/data'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (gitCheck.status !== 0) {
      console.error(`XX Falha ao verificar git status em public/data: ${gitCheck.stderr}`);
      process.exit(1);
    }
    if ((gitCheck.stdout || '').trim().length > 0) {
      console.error('XX Trava de segurança (--check-clean-git): há alterações pendentes em public/data/.');
      console.error(gitCheck.stdout.trim());
      process.exit(1);
    }
  }

  // Idempotência temporal quando não --force e não --dry-run
  if (!args.force && !args.dryRun && existsSync(statusPath)) {
    try {
      const currentStatus = JSON.parse(readFileSync(statusPath, 'utf8'));
      const updatedMs = Date.parse(currentStatus?.updatedAt || '');
      if (Number.isFinite(updatedMs)) {
        const ageDays = (Date.now() - updatedMs) / 86_400_000;
        const checkAtual = validarSnapshotFloors(ROOT, floorsConfig);
        if (ageDays <= args.maxAgeDays && checkAtual.ok) {
          console.log(
            `✓ Snapshot RFB vigente (idade: ${ageDays.toFixed(1)}d <= ${args.maxAgeDays}d, sha256=${currentStatus.snapshotSha256}). Use --force para regerar.`
          );
          return;
        }
      }
    } catch {
      // rfb-status.json inválido/corrompido -> prossegue com regeneração
    }
  }

  // Modo verificação pura (--skip-download --dry-run / npm run rfb:verify)
  if (args.skipDownload && args.dryRun) {
    const verificacao = validarSnapshotFloors(ROOT, floorsConfig);
    if (!verificacao.ok) {
      console.error('XX Validação de pisos do snapshot falhou:');
      for (const e of verificacao.errors) console.error(`   - ${e}`);
      process.exit(1);
    }
    console.log(`✓ rfb:verify OK — ${verificacao.files.length} arquivos validados | snapshotSha256=${verificacao.snapshotSha256}`);
    return;
  }

  const pyBin = detectarPython();

  if (!args.skipDownload) {
    const baixarArgs = ['scripts/baixar_reforma.py'];
    if (args.force) baixarArgs.push('--forcar');
    console.log(`[1/4] Executando download oficial (${pyBin} ${baixarArgs.join(' ')})...`);
    const dlRes = spawnSync(pyBin, baixarArgs, { cwd: ROOT, stdio: 'inherit' });
    if (dlRes.status !== 0) {
      console.error('XX Download das fontes RFB falhou; abortando sem alterar public/data/.');
      process.exit(dlRes.status ?? 1);
    }
  } else {
    console.log('[1/4] --skip-download ativo: reutilizando fontes locais em data/raw/.');
  }

  // Limpa/recria staging
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  try {
    console.log(`[2/4] Executando pipeline em staging (.rfb-stage/) com ${pyBin}...`);
    const pipeRes = spawnSync(pyBin, ['scripts/pipeline.py'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, PIPELINE_OUT_DIR: stageDir },
    });
    if (pipeRes.status !== 0) {
      throw new Error(`scripts/pipeline.py retornou código ${pipeRes.status}`);
    }

    console.log('[3/4] Validando artefatos contra rules/snapshot-floors.json...');
    const validacao = validarSnapshotFloors(ROOT, floorsConfig, { stagePublicDir: stageDir });
    if (!validacao.ok) {
      throw new Error(`Violação de pisos de snapshot:\n - ${validacao.errors.join('\n - ')}`);
    }

    // Ler meta.json do staging e sincronizar status
    const metaStage = JSON.parse(readFileSync(resolve(stageDir, 'meta.json'), 'utf8'));
    let manifestInfo = null;
    const manifestPath = resolve(ROOT, floorsConfig.manifestRef || 'services/rfb-manifest.json');
    if (existsSync(manifestPath)) {
      manifestInfo = JSON.parse(readFileSync(manifestPath, 'utf8'));
    }

    const updatedAtIso = new Date().toISOString();
    metaStage.gerado_em = updatedAtIso;
    writeFileAtomic(resolve(stageDir, 'meta.json'), JSON.stringify(metaStage, null, 1));

    // Recalcular hashes após sincronizar gerado_em em meta.json
    const validacaoFinal = validarSnapshotFloors(ROOT, floorsConfig, { stagePublicDir: stageDir });
    if (!validacaoFinal.ok) {
      throw new Error(`Violação pós-sincronização de meta.json:\n - ${validacaoFinal.errors.join('\n - ')}`);
    }

    const rfbStatus = {
      schemaVersion: '1.0.0',
      updatedAt: updatedAtIso,
      maxAgeDays: Number(floorsConfig.maxAgeDaysDefault ?? 30),
      metaVersao: metaStage.versao || null,
      metaGeradoEm: metaStage.gerado_em || updatedAtIso,
      ncmVigente: metaStage.ncm_vigente || null,
      ncmAto: metaStage.ncm_ato || null,
      manifestVersao: manifestInfo?.versaoManifesto || null,
      snapshotSha256: validacaoFinal.snapshotSha256,
      normasVigentes: floorsConfig.normasVigentes,
      files: validacaoFinal.files,
    };

    if (args.dryRun) {
      console.log(`[4/4] --dry-run OK: ${validacaoFinal.files.length} arquivos válidos | snapshotSha256=${rfbStatus.snapshotSha256}`);
      return;
    }

    console.log('[4/4] Publicando atomicamente em public/data/ e gravando rfb-status.json...');
    mkdirSync(publicDataDir, { recursive: true });
    for (const nome of readdirSync(stageDir)) {
      if (!nome.endsWith('.json')) continue;
      const conteudo = readFileSync(resolve(stageDir, nome), 'utf8');
      writeFileAtomic(resolve(publicDataDir, nome), conteudo);
    }
    writeFileAtomic(statusPath, JSON.stringify(rfbStatus, null, 2) + '\n');
    console.log(`✓ Snapshot publicado com sucesso! snapshotSha256=${rfbStatus.snapshotSha256}`);
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  basename(process.argv[1]) === 'rfb-refresh.mjs' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`XX rfb-refresh falhou: ${err?.message || err}`);
    process.exit(1);
  }
}
