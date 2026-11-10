import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 1500;

// Trava em memória contra concorrência
let isUpdating = false;

const tipoSchema = z.enum(['fontes', 'completo', 'reforma', 'marco-legal']);

const pyCmd = process.platform === 'win32' ? 'python' : 'python3';

const run = (cmd: string, args: string[], timeoutMs: number) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn(cmd, args, { cwd: process.cwd() });
    let out = '', er = '';
    const killer = setTimeout(() => {
      try {
        p.kill('SIGKILL');
      } catch {
        /* ignora falha de kill */
      }
    }, timeoutMs);

    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (er += d));
    p.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code: code ?? -1, stdout: out, stderr: er });
    });
    p.on('error', (err) => {
      clearTimeout(killer);
      resolve({ code: -1, stdout: out, stderr: `${er}\n${err.message}` });
    });
  });

function constantTimeCompare(a: string, b: string): boolean {
  try {
    const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
    const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

function truncateStdout(str: string, maxBytes = 20 * 1024): string {
  if (str.length <= maxBytes) return str;
  return `... [truncado - exibindo últimos 20 KB]\n${str.slice(-maxBytes)}`;
}

/**
 * POST /api/atualizar?tipo=fontes|completo|reforma|marco-legal
 *
 * Headers obrigatórios:
 *  - Authorization: Bearer <UPDATE_TOKEN>
 *
 * Configurações de ambiente:
 *  - ENABLE_UPDATE_ROUTE=true (necessário para habilitar a rota)
 *  - UPDATE_TOKEN=<segredo> (token exigido no header Authorization)
 */
export async function POST(req: Request) {
  // 1. Verificação de ativação da rota
  if (process.env.ENABLE_UPDATE_ROUTE !== 'true') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Rota de atualização desativada por configuração de ambiente (ENABLE_UPDATE_ROUTE!=true).',
        codigo: 'ROTA_DESATIVADA',
      },
      { status: 403 }
    );
  }

  // 2. Autenticação Bearer Token com proteção contra timing attack
  const expectedToken = process.env.UPDATE_TOKEN;
  if (!expectedToken || expectedToken.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Serviço de atualização não configurado no servidor (UPDATE_TOKEN não definido).',
        codigo: 'TOKEN_NAO_CONFIGURADO',
      },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Autenticação obrigatória. Forneça o token via cabeçalho Authorization: Bearer <token>.',
        codigo: 'NAO_AUTORIZADO',
      },
      { status: 401 }
    );
  }

  const providedToken = authHeader.slice(7).trim();
  if (!constantTimeCompare(providedToken, expectedToken.trim())) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Token de atualização inválido ou não autorizado.',
        codigo: 'TOKEN_INVALIDO',
      },
      { status: 403 }
    );
  }

  // 3. Validação do parâmetro "tipo" com Zod
  const url = new URL(req.url);
  const rawTipo = url.searchParams.get('tipo') || 'completo';
  const tipoValidation = tipoSchema.safeParse(rawTipo);

  if (!tipoValidation.success) {
    return NextResponse.json(
      {
        ok: false,
        error: `Parâmetro 'tipo' inválido: '${rawTipo}'. Valores aceitos: 'fontes', 'completo', 'reforma', 'marco-legal'.`,
        detalhes: tipoValidation.error.issues,
        codigo: 'TIPO_INVALIDO',
      },
      { status: 400 }
    );
  }

  const tipo = tipoValidation.data;

  // 4. Lock em memória contra concorrência
  if (isUpdating) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Uma operação de atualização já está em andamento. Aguarde a finalização antes de disparar outra.',
        codigo: 'ATUALIZACAO_EM_ANDAMENTO',
      },
      { status: 409 }
    );
  }

  isUpdating = true;
  const partes: string[] = [];

  try {
    // 5. Execução dos scripts conforme o tipo selecionado

    // Tipo: 'reforma' (não baixa fontes do Siscomex)
    if (tipo === 'reforma') {
      const ref = await run(pyCmd, ['scripts/baixar_reforma.py'], 300_000);
      partes.push(`$ ${pyCmd} scripts/baixar_reforma.py\n${ref.stdout}${ref.stderr ? `\n[stderr]\n${ref.stderr}` : ''}`);
      if (ref.code !== 0) {
        return NextResponse.json(
          { ok: false, tipo, exitCode: ref.code, stdout: truncateStdout(partes.join('\n\n')) },
          { status: 502 }
        );
      }

      const is = await run(pyCmd, ['scripts/baixar_is.py'], 1_500_000);
      partes.push(`$ ${pyCmd} scripts/baixar_is.py\n${is.stdout}${is.stderr ? `\n[stderr]\n${is.stderr}` : ''}`);
      if (is.code !== 0) {
        return NextResponse.json(
          { ok: false, tipo, exitCode: is.code, stdout: truncateStdout(partes.join('\n\n')) },
          { status: 502 }
        );
      }

      const pipe2 = await run(pyCmd, ['scripts/pipeline.py'], 180_000);
      partes.push(`$ ${pyCmd} scripts/pipeline.py\n${pipe2.stdout}${pipe2.stderr ? `\n[stderr]\n${pipe2.stderr}` : ''}`);
      const code = pipe2.code || 0;

      return NextResponse.json(
        { ok: code === 0, tipo, exitCode: code, stdout: truncateStdout(partes.join('\n\n')) },
        { status: code === 0 ? 200 : 502 }
      );
    }

    // Tipo: 'marco-legal' (executa verificação de integridade do marco legal + pipeline)
    if (tipo === 'marco-legal') {
      const ml = await run(pyCmd, ['scripts/atualizar_marco_legal.py', '--check'], 120_000);
      partes.push(`$ ${pyCmd} scripts/atualizar_marco_legal.py --check\n${ml.stdout}${ml.stderr ? `\n[stderr]\n${ml.stderr}` : ''}`);
      if (ml.code !== 0) {
        return NextResponse.json(
          { ok: false, tipo, exitCode: ml.code, stdout: truncateStdout(partes.join('\n\n')) },
          { status: 502 }
        );
      }

      const pipe = await run(pyCmd, ['scripts/pipeline.py'], 180_000);
      partes.push(`$ ${pyCmd} scripts/pipeline.py\n${pipe.stdout}${pipe.stderr ? `\n[stderr]\n${pipe.stderr}` : ''}`);
      return NextResponse.json(
        { ok: pipe.code === 0, tipo, exitCode: pipe.code, stdout: truncateStdout(partes.join('\n\n')) },
        { status: pipe.code === 0 ? 200 : 502 }
      );
    }

    // Tipos 'fontes' e 'completo': requerem download de fontes do Siscomex
    const fontes = await run(pyCmd, ['scripts/baixar_fontes.py'], 240_000);
    partes.push(`$ ${pyCmd} scripts/baixar_fontes.py\n${fontes.stdout}${fontes.stderr ? `\n[stderr]\n${fontes.stderr}` : ''}`);
    if (fontes.code !== 0) {
      return NextResponse.json(
        { ok: false, tipo, exitCode: fontes.code, stdout: truncateStdout(partes.join('\n\n')) },
        { status: 502 }
      );
    }

    if (tipo === 'completo') {
      // Valida marco legal antes do pipeline
      const ml = await run(pyCmd, ['scripts/atualizar_marco_legal.py', '--check'], 120_000);
      partes.push(`$ ${pyCmd} scripts/atualizar_marco_legal.py --check\n${ml.stdout}${ml.stderr ? `\n[stderr]\n${ml.stderr}` : ''}`);
      if (ml.code !== 0) {
        return NextResponse.json(
          { ok: false, tipo, exitCode: ml.code, stdout: truncateStdout(partes.join('\n\n')) },
          { status: 502 }
        );
      }

      const pipe = await run(pyCmd, ['scripts/pipeline.py'], 180_000);
      partes.push(`$ ${pyCmd} scripts/pipeline.py\n${pipe.stdout}${pipe.stderr ? `\n[stderr]\n${pipe.stderr}` : ''}`);
      return NextResponse.json(
        { ok: pipe.code === 0, tipo, exitCode: pipe.code, stdout: truncateStdout(partes.join('\n\n')) },
        { status: pipe.code === 0 ? 200 : 502 }
      );
    }

    // tipo === 'fontes' concluído com sucesso
    return NextResponse.json({
      ok: true,
      tipo,
      exitCode: 0,
      stdout: truncateStdout(partes.join('\n\n')),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        tipo,
        error: error?.message || 'Erro inesperado durante a execução da atualização.',
        stdout: truncateStdout(partes.join('\n\n')),
      },
      { status: 500 }
    );
  } finally {
    isUpdating = false;
  }
}

export async function GET() {
  const isEnabled = process.env.ENABLE_UPDATE_ROUTE === 'true';
  return NextResponse.json({
    ok: true,
    ativo: isEnabled,
    uso: 'POST /api/atualizar?tipo=fontes|completo|reforma|marco-legal',
    autenticacao: 'Header Authorization: Bearer <UPDATE_TOKEN>',
    fontes: 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json',
  });
}
