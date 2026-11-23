/**
 * Cliente de Conexão Relacional PostgreSQL 17
 * Compatível com Docker local e Supabase (PgBouncer / Transaction Pooler).
 */

import { Pool, PoolConfig } from 'pg';

let globalPool: Pool | null = null;

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
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECT_TIMEOUT_MS || '5000', 10),
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
      return {
        connected: true,
        versao: res.rows[0]?.versao,
        duracaoMs: Date.now() - inicio,
      };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
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
}
