/**
 * Cliente de Conexão Relacional PostgreSQL 17 & Persistência Local Atômica em JSON
 * Compatível com Docker local, Supabase e modo nativo Windows (sem Docker).
 */

import { Pool, PoolConfig } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_EMPRESAS_STORE_REL_PATH = 'data/db/empresas-store.json';

export interface EmpresasJsonStoreData<TEmpresa = unknown, TPerfil = unknown> {
  version: number;
  updatedAt: string;
  empresas: TEmpresa[];
  perfis: Record<string, TPerfil[]>;
}

export function resolveEmpresasStorePath(customPath?: string): string {
  if (customPath && customPath.trim().length > 0) {
    return path.resolve(customPath);
  }
  const fromEnv = process.env.EMPRESAS_STORE_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  return path.join(process.cwd(), 'data', 'db', 'empresas-store.json');
}

export async function readEmpresasStoreJson<TEmpresa = unknown, TPerfil = unknown>(
  customPath?: string
): Promise<EmpresasJsonStoreData<TEmpresa, TPerfil>> {
  const target = resolveEmpresasStorePath(customPath);
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ target, 'utf8');
    if (!raw.trim()) {
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        empresas: [],
        perfis: {},
      };
    }
    const parsed = JSON.parse(raw) as Partial<EmpresasJsonStoreData<TEmpresa, TPerfil>>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      empresas: Array.isArray(parsed.empresas) ? parsed.empresas : [],
      perfis: parsed.perfis && typeof parsed.perfis === 'object' ? parsed.perfis : {},
    };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT') {
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        empresas: [],
        perfis: {},
      };
    }
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      empresas: [],
      perfis: {},
    };
  }
}

export async function writeEmpresasStoreJsonAtomic<TEmpresa = unknown, TPerfil = unknown>(
  data: EmpresasJsonStoreData<TEmpresa, TPerfil>,
  customPath?: string
): Promise<string> {
  const target = resolveEmpresasStorePath(customPath);
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });

  const payload: EmpresasJsonStoreData<TEmpresa, TPerfil> = {
    version: data.version ?? 1,
    updatedAt: new Date().toISOString(),
    empresas: Array.isArray(data.empresas) ? data.empresas : [],
    perfis: data.perfis || {},
  };

  const jsonContent = JSON.stringify(payload, null, 2);
  const tempPath = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;

  const handle = await fs.open(/*turbopackIgnore: true*/ tempPath, 'w');
  try {
    await handle.writeFile(jsonContent, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await fs.rename(tempPath, target);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'EPERM' || code === 'EBUSY' || code === 'EEXIST') {
      await fs.copyFile(tempPath, target);
      await fs.unlink(tempPath).catch(() => {});
    } else {
      await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  return target;
}

let globalPool: Pool | null = null;
let isDatabaseOffline = false;
let lastDbFailureTime = 0;
const DB_OFFLINE_COOLDOWN_MS = 30_000;

export function markDatabaseOffline(): void {
  isDatabaseOffline = true;
  lastDbFailureTime = Date.now();
}

export function resetDatabaseOfflineStatusForTests(): void {
  isDatabaseOffline = false;
  lastDbFailureTime = 0;
}

export function isDatabaseAccessible(): boolean {
  if (!isDatabaseConfigured()) return false;
  if (isDatabaseOffline) {
    if (Date.now() - lastDbFailureTime > DB_OFFLINE_COOLDOWN_MS) {
      isDatabaseOffline = false;
      return true;
    }
    return false;
  }
  return true;
}

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && url.length > 0);
}

export function getDbPool(): Pool | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (globalPool) {
    return globalPool;
  }

  const connectionString = process.env.DATABASE_URL?.trim() || '';

  const isSupabaseOrSsl =
    connectionString.includes('supabase') ||
    connectionString.includes('sslmode=require') ||
    process.env.DATABASE_SSL === 'true';

  const config: PoolConfig = {
    connectionString,
    max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECT_TIMEOUT_MS || '1500', 10),
  };

  if (isSupabaseOrSsl) {
    config.ssl = {
      rejectUnauthorized: false,
    };
  }

  globalPool = new Pool(config);

  globalPool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]', err);
  });

  return globalPool;
}

export interface DatabaseHealthResult {
  connected: boolean;
  versao?: string;
  duracaoMs: number;
  erro?: string;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  const inicio = Date.now();
  if (!isDatabaseConfigured()) {
    return {
      connected: false,
      duracaoMs: Date.now() - inicio,
      erro: 'DATABASE_URL não configurada (modo In-Memory ativo)',
    };
  }

  if (!isDatabaseAccessible()) {
    return {
      connected: false,
      duracaoMs: Date.now() - inicio,
      erro: 'PostgreSQL em cooldown offline (modo In-Memory ativo)',
    };
  }

  const pool = getDbPool();
  if (!pool) {
    return {
      connected: false,
      duracaoMs: Date.now() - inicio,
      erro: 'Não foi possível inicializar pool PostgreSQL',
    };
  }

  try {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT version() AS versao, now() AS timestamp_db');
      isDatabaseOffline = false;
      return {
        connected: true,
        versao: res.rows[0]?.versao,
        duracaoMs: Date.now() - inicio,
      };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    markDatabaseOffline();
    const msg = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      duracaoMs: Date.now() - inicio,
      erro: msg,
    };
  }
}

export async function closeDbPoolForTests(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
  resetDatabaseOfflineStatusForTests();
}
