import fs from 'node:fs';
import path from 'node:path';
import type { Dataset, Record8, SearchIndex, Rules } from '@/lib/data';

let mapaD8Cache: Map<string, Record8> | null = null;
let mapaD8Mtime: number | null = null;
let serverDatasetCache: Dataset | null = null;
let serverDatasetMtimeMap: Record<string, number> = {};

export function resetMapaD8Cache(): void {
  mapaD8Cache = null;
  mapaD8Mtime = null;
}

export function resetServerDatasetCache(): void {
  serverDatasetCache = null;
  serverDatasetMtimeMap = {};
}

export function getMapaD8(): Map<string, Record8> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'ncm.json');
  try {
    const stats = fs.statSync(filePath);
    if (mapaD8Cache && mapaD8Mtime === stats.mtimeMs) {
      return mapaD8Cache;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lista = JSON.parse(fileContent) as Record8[];

    if (mapaD8Cache && (!Array.isArray(lista) || lista.length === 0)) {
      console.warn('public/data/ncm.json corrompido ou vazio. Mantendo cache anterior.');
      return mapaD8Cache;
    }

    if (!Array.isArray(lista)) {
      throw new Error('public/data/ncm.json não contém uma lista válida de registros.');
    }

    mapaD8Cache = new Map(lista.map((r) => [r.d8, r]));
    mapaD8Mtime = stats.mtimeMs;
    return mapaD8Cache;
  } catch (err) {
    if (mapaD8Cache) {
      console.warn('Erro ao ler public/data/ncm.json. Mantendo cache anterior:', err);
      return mapaD8Cache;
    }
    throw err;
  }
}

export function getServerDataset(): Dataset {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const files = ['ncm.json', 'hierarquia.json', 'search.json', 'regras.json', 'meta.json'];

  try {
    let shouldReload = !serverDatasetCache;
    const currentMtimes: Record<string, number> = {};

    for (const f of files) {
      const p = path.join(dataDir, f);
      const s = fs.statSync(p);
      currentMtimes[f] = s.mtimeMs;
      if (serverDatasetMtimeMap[f] !== s.mtimeMs) {
        shouldReload = true;
      }
    }

    if (!shouldReload && serverDatasetCache) {
      return serverDatasetCache;
    }

    const records = JSON.parse(fs.readFileSync(path.join(dataDir, 'ncm.json'), 'utf-8')) as Record8[];
    const hier = JSON.parse(fs.readFileSync(path.join(dataDir, 'hierarquia.json'), 'utf-8')) as Record<string, string>;
    const search = JSON.parse(fs.readFileSync(path.join(dataDir, 'search.json'), 'utf-8')) as SearchIndex;
    const rules = JSON.parse(fs.readFileSync(path.join(dataDir, 'regras.json'), 'utf-8')) as Rules;
    const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'meta.json'), 'utf-8'));

    const byD8 = new Map<string, Record8>();
    for (const r of records) {
      byD8.set(r.d8, r);
      if (!byD8.has(r.ncm)) byD8.set(r.ncm, r);
    }

    const ds: Dataset = {
      records,
      byD8,
      byNcm: byD8,
      hier,
      search,
      rules,
      meta,
      cest: {},
      cfop: [],
      attrs: { codigos: [], defs: {} },
      pronto: Promise.resolve<Dataset>(null as unknown as Dataset),
    };
    ds.pronto = Promise.resolve(ds);

    serverDatasetCache = ds;
    serverDatasetMtimeMap = currentMtimes;
    return serverDatasetCache;
  } catch (err) {
    if (serverDatasetCache) {
      console.warn('Erro ao carregar dataset server-side. Mantendo cache anterior:', err);
      return serverDatasetCache;
    }
    throw err;
  }
}
