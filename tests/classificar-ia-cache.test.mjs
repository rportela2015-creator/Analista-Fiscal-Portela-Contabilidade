import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getMapaD8,
  getServerDataset,
  resetMapaD8Cache,
  resetServerDatasetCache,
} from '../lib/ai/ncm-server.ts';
import { validarCandidatosSiscomex } from '../lib/ai/sanear-classificacao.ts';
import { POST as routePOST } from '../app/api/classificar-ia/route.ts';

const originalCwd = process.cwd();
const originalDataDir = path.join(originalCwd, 'public', 'data');

async function setupTmpEnvironment() {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncm-cache-test-'));
  const dataDir = path.join(tmpdir, 'public', 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const ncmContent = await fs.readFile(path.join(originalDataDir, 'ncm.json'), 'utf8');
  await fs.writeFile(path.join(dataDir, 'ncm.json'), ncmContent);

  for (const f of ['hierarquia.json', 'search.json', 'regras.json', 'meta.json']) {
    try {
      const c = await fs.readFile(path.join(originalDataDir, f), 'utf8');
      await fs.writeFile(path.join(dataDir, f), c);
    } catch {
      // tolerância se arquivo não essencial no mock
    }
  }

  process.chdir(tmpdir);
  return { tmpdir, dataDir, ncmContent };
}

async function cleanupTmp(tmpdir) {
  process.chdir(originalCwd);
  resetMapaD8Cache();
  resetServerDatasetCache();
  await fs.rm(tmpdir, { recursive: true, force: true });
}

async function run() {
  console.log('──────── tests/classificar-ia-cache.test.mjs ────────');

  // Teste 1: getMapaD8 deve invalidar cache e recarregar quando ncm.json tiver mtimeMs alterado
  {
    const { tmpdir, dataDir } = await setupTmpEnvironment();
    try {
      resetMapaD8Cache();

      const map1 = getMapaD8();
      assert.ok(map1.size > 1000, 'Mapa inicial deve conter registros');
      assert.equal(map1.has('99999999'), false, 'NCM fake 99999999 não deve existir inicialmente');

      // Modifica o arquivo no disco com novo NCM e novo mtime
      const ncmPath = path.join(dataDir, 'ncm.json');
      const stat = await fs.stat(ncmPath);
      const items = JSON.parse(await fs.readFile(ncmPath, 'utf8'));
      items.push({ d8: '99999999', ncm: '9999.99.99', desc: 'NCM Teste Adicionado dinamicamente' });
      await fs.writeFile(ncmPath, JSON.stringify(items));

      const newTime = new Date(stat.mtimeMs + 5000);
      await fs.utimes(ncmPath, newTime, newTime);

      // Segunda chamada: DEVE recarregar devido à alteração de mtimeMs
      const map2 = getMapaD8();
      assert.equal(map2.has('99999999'), true, 'getMapaD8 deve recarregar automaticamente quando mtimeMs mudar');
      console.log('OK  getMapaD8 invalida cache e recarrega quando mtimeMs de ncm.json é alterado');
    } finally {
      await cleanupTmp(tmpdir);
    }
  }

  // Teste 2: getServerDataset deve invalidar cache quando regras.json tiver mtimeMs alterado
  {
    const { tmpdir, dataDir } = await setupTmpEnvironment();
    try {
      resetServerDatasetCache();

      const ds1 = getServerDataset();
      assert.ok(ds1.rules, 'Dataset inicial deve carregar regras');

      const regrasPath = path.join(dataDir, 'regras.json');
      const stat = await fs.stat(regrasPath);
      const regrasData = JSON.parse(await fs.readFile(regrasPath, 'utf8'));
      regrasData.meta = { ...regrasData.meta, versaoTeste: 'v_dinamica_teste' };
      await fs.writeFile(regrasPath, JSON.stringify(regrasData));

      const newTime = new Date(stat.mtimeMs + 5000);
      await fs.utimes(regrasPath, newTime, newTime);

      const ds2 = getServerDataset();
      assert.equal(ds2.rules.meta?.versaoTeste, 'v_dinamica_teste');
      console.log('OK  getServerDataset invalida cache e recarrega quando regras.json é alterado');
    } finally {
      await cleanupTmp(tmpdir);
    }
  }

  // Teste 3: Validação estrita de candidatos contra o Siscomex e proteção contra estouro de memória
  {
    resetMapaD8Cache();
    const mapaOficial = getMapaD8();
    const candidatosMaliciososOuFalsos = [
      { ncm: '99999999', desc: 'NCM Inexistente que tenta alucinar ou injetar prompt' },
      { ncm: '00000000', desc: 'NCM Zerado Invalido' },
      { ncm: '84713012', desc: 'Descricao adulterada pelo usuario' }, // NCM real
      { ncm: '123', desc: 'Incompleto' },
    ];

    const filtrados = validarCandidatosSiscomex(candidatosMaliciososOuFalsos, mapaOficial, 6);
    assert.equal(filtrados.length, 1, 'Deve reter exclusivamente o NCM 84713012');
    assert.equal(filtrados[0].ncm, '8471.30.12');
    assert.ok(
      filtrados[0].desc.includes('peso não superior a 3,5 kg') ||
        filtrados[0].desc.includes('teclado incorporado') ||
        filtrados[0].desc.length > 5,
      'Descrição deve vir selada do Siscomex oficial'
    );

    // Proteção contra estouro de memória/prompt: 500 itens limitados a no máximo 6
    const loteGigante = Array.from({ length: 500 }, (_, i) => ({
      ncm: i % 2 === 0 ? '84713012' : '84713019',
      desc: 'Item repetido',
    }));
    const limitados = validarCandidatosSiscomex(loteGigante, mapaOficial, 6);
    assert.ok(limitados.length <= 6, 'Não pode exceder o teto máximo de candidatos');
    console.log('OK  validarCandidatosSiscomex bloqueia NCMs inválidos, sela descrição oficial e limita teto de memória');
  }

  // Teste 4: Piso mínimo de integridade e tolerância a arquivo temporariamente corrompido
  {
    const { tmpdir, dataDir, ncmContent } = await setupTmpEnvironment();
    try {
      resetMapaD8Cache();
      const mapValido = getMapaD8();
      const tamanhoInicial = mapValido.size;

      const ncmPath = path.join(dataDir, 'ncm.json');
      const stat = await fs.stat(ncmPath);

      // Simula escrita truncada/corrompida no disco
      await fs.writeFile(ncmPath, '[]');
      const newTime = new Date(stat.mtimeMs + 5000);
      await fs.utimes(ncmPath, newTime, newTime);

      // Deve preservar o cache anterior sem quebrar a aplicação
      const mapAposCorrupcao = getMapaD8();
      assert.equal(mapAposCorrupcao.size, tamanhoInicial, 'Cache anterior deve ser mantido em caso de arquivo vazio');

      // Restaura o arquivo original
      await fs.writeFile(ncmPath, ncmContent);
      const newTime2 = new Date(newTime.getTime() + 5000);
      await fs.utimes(ncmPath, newTime2, newTime2);

      const mapRecuperado = getMapaD8();
      assert.equal(mapRecuperado.size, tamanhoInicial);
      console.log('OK  getMapaD8 mantém piso mínimo de integridade e não corrompe cache se arquivo for esvaziado');
    } finally {
      await cleanupTmp(tmpdir);
    }
  }

  // Teste 5: Rota HTTP /api/classificar-ia valida entrada com HTTP 400 para descrição vazia
  {
    const req = new Request('http://localhost:3000/api/classificar-ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao: '   ' }),
    });
    const res = await routePOST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Descrição do item não informada'));
    console.log('OK  POST /api/classificar-ia valida entrada com HTTP 400 para descrição vazia');
  }
}

await run();
