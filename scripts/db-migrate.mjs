/**
 * Executor Idempotente de Migrations SQL do PostgreSQL
 * Analista Fiscal Portela Contabilidade
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Carregar variáveis de .env e .env.local se não presentes
function carregarEnvBasico() {
  const envFiles = ['.env', '.env.local'];
  for (const envFile of envFiles) {
    const full = path.join(ROOT, envFile);
    if (fs.existsSync(full)) {
      const lines = fs.readFileSync(full, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

carregarEnvBasico();

const DATABASE_URL = process.env.DATABASE_URL?.trim();

async function runMigrations() {
  if (!DATABASE_URL) {
    console.log('[db:migrate] DATABASE_URL não definida. Pulando migrações (modo In-Memory ativo).');
    process.exit(0);
  }

  const migrationsDir = path.join(ROOT, 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log(`[db:migrate] Diretório ${migrationsDir} não encontrado. Nada a migrar.`);
    process.exit(0);
  }

  const isSupabaseOrSsl =
    DATABASE_URL.includes('supabase') ||
    DATABASE_URL.includes('sslmode=require') ||
    process.env.DATABASE_SSL === 'true';

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 5000,
    ssl: isSupabaseOrSsl ? { rejectUnauthorized: false } : undefined,
  });

  let client;
  try {
    client = await pool.connect();
    console.log('[db:migrate] Conexão com PostgreSQL estabelecida com sucesso.');
  } catch (err) {
    console.warn(`[db:migrate] Aviso: Não foi possível conectar ao PostgreSQL (${err.message}).`);
    if (process.env.FAIL_ON_DB_ERROR === 'true') {
      process.exit(1);
    } else {
      console.log('[db:migrate] Continuando sem falha no build (ambiente sem Postgres ativo).');
      process.exit(0);
    }
  }

  try {
    // 1. Criar tabela de controle se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        sha256 CHAR(64) NOT NULL,
        executado_em TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Buscar migrações já executadas
    const res = await client.query('SELECT id, sha256 FROM _schema_migrations ORDER BY id ASC');
    const executadas = new Map(res.rows.map(r => [r.id, r.sha256]));

    // 3. Listar arquivos .sql
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[db:migrate] Total de arquivos de migração encontrados: ${files.length}`);

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(fullPath, 'utf-8');
      const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');

      if (executadas.has(file)) {
        const hashRegistrado = executadas.get(file);
        if (hashRegistrado !== hash) {
          console.warn(`[db:migrate] [ALERTA] Hash divergente para migração já executada: ${file}`);
        } else {
          console.log(`[db:migrate] [OK] Já executada: ${file}`);
        }
        continue;
      }

      console.log(`[db:migrate] [EXECUTANDO] ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO _schema_migrations (id, sha256) VALUES ($1, $2)',
          [file, hash]
        );
        await client.query('COMMIT');
        console.log(`[db:migrate] [SUCESSO] ${file} aplicada.`);
      } catch (sqlErr) {
        await client.query('ROLLBACK');
        console.error(`[db:migrate] [ERRO] Falha ao aplicar ${file}:`, sqlErr.message);
        throw sqlErr;
      }
    }

    console.log('[db:migrate] Todas as migrações foram verificadas e aplicadas.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('[db:migrate] Erro fatal durante a migração:', err);
  process.exit(1);
});
