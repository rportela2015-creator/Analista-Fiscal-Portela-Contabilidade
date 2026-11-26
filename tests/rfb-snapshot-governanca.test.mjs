/**
 * Suíte Estrita: Governança de Snapshot RFB, Modo Explícito (live -> snapshot -> hardcoded),
 * Validação de Pisos (snapshot-floors.json), Bloqueio Hardcoded e Carimbo de Rastreabilidade.
 * Executa 100% offline, sem depender de rede ou Docker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NextRequest } from 'next/server';

import {
  getRtcMode,
  resetRtcModeCacheForTests,
  MENSAGEM_BLOQUEIO_HARDCODED,
} from '../lib/integracoes/rfb-health.ts';
import {
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoHtml,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpDetalhadoTxt,
} from '../lib/relatorio-erp.ts';
import { POST as gerarRelatorioAuditoriaPost } from '../app/api/auditoria-relatorio/route.ts';
import { POST as gerarRelatorioParametrizacaoPost } from '../app/api/parametrizacao-relatorio/route.ts';
import {
  validarArtefatoContraFloor,
  validarSnapshotFloors,
} from '../scripts/rfb-refresh.mjs';

const ROOT = resolve(process.cwd());

test('GOV-1 getRtcMode retorna snapshot válido e calcula stale > 30 dias em fixture temporária', async () => {
  const prevProbe = process.env.RTC_LIVE_PROBE;
  const prevDir = process.env.RFB_DATA_DIR;
  const prevMaxAge = process.env.RFB_MAX_AGE_DAYS;
  delete process.env.RTC_LIVE_PROBE;
  delete process.env.RFB_DATA_DIR;
  delete process.env.RFB_MAX_AGE_DAYS;
  resetRtcModeCacheForTests();

  try {
    // 1. Snapshot real recém-gerado em public/data
    const statusAtual = await getRtcMode({ skipCache: true });
    assert.equal(statusAtual.mode, 'snapshot');
    assert.equal(statusAtual.stale, false);
    assert.equal(statusAtual.bloqueioOperacional, false);
    assert.ok(statusAtual.snapshotSha256 && statusAtual.snapshotSha256.length === 64);
    assert.ok(statusAtual.normasVigentes.ntNfe.includes('NT'));
    assert.ok(statusAtual.normasVigentes.ricmsPr.includes('Dec. 7.871/2017'));
    assert.ok(statusAtual.normasVigentes.lcReforma.includes('LC 214/2025'));

    // 2. Fixture com snapshot vencido (> 30 dias)
    const dirVencido = await mkdtemp(join(tmpdir(), 'rfb-stale-'));
    try {
      const quarentaDiasAtras = new Date(Date.now() - 40 * 86_400_000).toISOString();
      await writeFile(
        join(dirVencido, 'rfb-status.json'),
        JSON.stringify({
          updatedAt: quarentaDiasAtras,
          snapshotSha256: 'a'.repeat(64),
          normasVigentes: statusAtual.normasVigentes,
          files: [{ file: 'public/data/reforma.json', bytes: 200, records: 1, sha256: 'b'.repeat(64) }],
        }),
        'utf8'
      );
      await writeFile(
        join(dirVencido, 'reforma.json'),
        JSON.stringify({
          disponivel: true,
          classificacoes: [
            { c: '000001', cst: '000', d: 'Tributadas integralmente pelo IBS e pela CBS' },
            { c: '200003', cst: '200', d: 'Cesta Básica Nacional de Alimentos — Alíquota Zero' },
          ],
        }),
        'utf8'
      );

      const statusVencido = await getRtcMode({ dataDir: dirVencido, maxAgeDays: 30, skipCache: true });
      assert.equal(statusVencido.mode, 'snapshot');
      assert.equal(statusVencido.stale, true);
      assert.ok((statusVencido.ageDays ?? 0) >= 39);
      assert.equal(statusVencido.bloqueioOperacional, false);
    } finally {
      await rm(dirVencido, { recursive: true, force: true });
    }
  } finally {
    if (prevProbe !== undefined) process.env.RTC_LIVE_PROBE = prevProbe;
    if (prevDir !== undefined) process.env.RFB_DATA_DIR = prevDir;
    if (prevMaxAge !== undefined) process.env.RFB_MAX_AGE_DAYS = prevMaxAge;
    resetRtcModeCacheForTests();
  }
});

test('GOV-2 getRtcMode cai para hardcoded com bloqueioOperacional=true quando snapshot ausente/corrompido', async () => {
  const prevProbe = process.env.RTC_LIVE_PROBE;
  delete process.env.RTC_LIVE_PROBE;
  resetRtcModeCacheForTests();

  const dirVazio = await mkdtemp(join(tmpdir(), 'rfb-empty-'));
  const dirCorrompido = await mkdtemp(join(tmpdir(), 'rfb-corrupt-'));

  try {
    const resVazio = await getRtcMode({ dataDir: dirVazio, skipCache: true });
    assert.equal(resVazio.mode, 'hardcoded');
    assert.equal(resVazio.stale, true);
    assert.equal(resVazio.bloqueioOperacional, true);
    assert.equal(resVazio.motivoBloqueio, MENSAGEM_BLOQUEIO_HARDCODED);

    await writeFile(join(dirCorrompido, 'rfb-status.json'), '{json-corrompido', 'utf8');
    await writeFile(join(dirCorrompido, 'reforma.json'), '{"disponivel":false,"classificacoes":[]}', 'utf8');
    const resCorrupt = await getRtcMode({ dataDir: dirCorrompido, skipCache: true });
    assert.equal(resCorrupt.mode, 'hardcoded');
    assert.equal(resCorrupt.stale, true);
    assert.equal(resCorrupt.bloqueioOperacional, true);
  } finally {
    if (prevProbe !== undefined) process.env.RTC_LIVE_PROBE = prevProbe;
    await rm(dirVazio, { recursive: true, force: true });
    await rm(dirCorrompido, { recursive: true, force: true });
    resetRtcModeCacheForTests();
  }
});

test('GOV-3 Validador de pisos rejeita PDF stub de 166 bytes e JSON abaixo de minRecords', async () => {
  const floorsConfig = JSON.parse(await readFile(join(ROOT, 'rules', 'snapshot-floors.json'), 'utf8'));
  const tmpRoot = await mkdtemp(join(tmpdir(), 'rfb-floors-'));

  try {
    await mkdir(join(tmpRoot, 'data', 'raw'), { recursive: true });
    await mkdir(join(tmpRoot, 'public', 'data'), { recursive: true });

    // Stub de 166 bytes sem tamanho mínimo
    const pdfStub = Buffer.from(
      '%PDF-1.4\n% ESTADO DO PARANA - SECRETARIA DA FAZENDA\n% RICMS/PR - DECRETO N 7.871/2017\n'
    );
    const pdfStubPath = join(tmpRoot, 'data', 'raw', 'ricms_pr_oficial.pdf');
    await writeFile(pdfStubPath, pdfStub);

    const checkStub = validarArtefatoContraFloor(
      pdfStubPath,
      floorsConfig.files['data/raw/ricms_pr_oficial.pdf'],
      'data/raw/ricms_pr_oficial.pdf'
    );
    assert.equal(checkStub.ok, false);
    assert.match(checkStub.error, /abaixo do piso de tamanho/i);

    // Arquivo HTML salvo com extensão .pdf (sem %PDF-) acima de 50 KB
    const htmlDisfarce = Buffer.from('<html><body>Erro 403 SEFA/PR</body></html>'.padEnd(60000, ' '));
    await writeFile(pdfStubPath, htmlDisfarce);
    const checkMagic = validarArtefatoContraFloor(
      pdfStubPath,
      floorsConfig.files['data/raw/ricms_pr_oficial.pdf'],
      'data/raw/ricms_pr_oficial.pdf'
    );
    assert.equal(checkMagic.ok, false);
    assert.match(checkMagic.error, /assinatura binária/i);

    // JSON de reforma com registros insuficientes (< 50 classificacoes)
    const stageDir = join(tmpRoot, '.stage');
    await mkdir(stageDir, { recursive: true });
    await writeFile(
      join(stageDir, 'reforma.json'),
      JSON.stringify({ disponivel: true, classificacoes: [{ c: '000001' }] }).padEnd(55000, ' '),
      'utf8'
    );
    const checkReforma = validarArtefatoContraFloor(
      join(stageDir, 'reforma.json'),
      floorsConfig.files['public/data/reforma.json'],
      'public/data/reforma.json'
    );
    assert.equal(checkReforma.ok, false);
    assert.match(checkReforma.error, /abaixo do piso de registros/i);

    // Conjunto válido atual do repositório passa 100%
    const repoCheck = validarSnapshotFloors(ROOT, floorsConfig);
    assert.equal(repoCheck.ok, true, `Falhas inesperadas: ${repoCheck.errors.join('; ')}`);
    assert.equal(repoCheck.files.length, 6);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('GOV-4 Relatórios bloqueiam fechamento em modo hardcoded (503), permitem rascunho explícito e escapam carimbo', async () => {
  const prevDir = process.env.RFB_DATA_DIR;
  const prevProbe = process.env.RTC_LIVE_PROBE;
  delete process.env.RTC_LIVE_PROBE;
  resetRtcModeCacheForTests();

  const dirVazio = await mkdtemp(join(tmpdir(), 'rfb-hardcoded-api-'));

  try {
    // 1. Modo snapshot válido -> APIs geram relatório com carimbo no rodapé + escape XSS
    delete process.env.RFB_DATA_DIR;
    const reqAuditoriaOk = new NextRequest('http://localhost/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'html',
        rastreabilidadeSnapshot: {
          mode: 'snapshot<script>alert(1)</script>',
          updatedAt: '2026-11-26T15:00:00Z',
          snapshotSha256: 'hash-validado-sha256',
          normasVigentes: ['NT 2026.008', 'LC 214/2025 <script>alert(2)</script>'],
        },
        itens: [
          {
            cProd: 'P1',
            xProd: 'Item Teste',
            ncm: '84713012',
            cfopEntrada: '1102',
            cstIcmsEntrada: '00',
            aliqIcms: '19.5%',
            permiteCredito: true,
          },
        ],
      }),
    });
    const resAudOk = await gerarRelatorioAuditoriaPost(reqAuditoriaOk);
    assert.equal(resAudOk.status, 200);
    const htmlAudOk = await resAudOk.text();
    assert.match(htmlAudOk, /Rastreabilidade Snapshot:/);
    assert.match(htmlAudOk, /hash-validado-sha256/);
    assert.match(htmlAudOk, /Normas Vigentes:/);
    assert.ok(!htmlAudOk.includes('<script>alert('));
    assert.ok(htmlAudOk.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

    // Rodapés de lib/relatorio-erp.ts (4 geradores) incluem carimbo completo
    const erpPayload = {
      contexto: { emitente: { nome: 'Portela', cnpj: '12345678000195', uf: 'PR', regime: 'presumido', crt: '3' } },
      rastreabilidadeSnapshot: {
        mode: 'snapshot',
        updatedAt: '2026-11-26T15:00:00Z',
        snapshotSha256: 'sha256-erp-rodape',
        normasVigentes: ['NT 2026.008', 'LC 214/2025'],
      },
      itens: [{ cProd: 'P1', xProd: 'Item', ncm: '84713012' }],
    };
    for (const h of [gerarRelatorioErpResumidoHtml(erpPayload), gerarRelatorioErpDetalhadoHtml(erpPayload)]) {
      assert.match(h, /Modo:<\/strong> snapshot/);
      assert.match(h, /Atualizado em:<\/strong> 2026-11-26T15:00:00Z/);
      assert.match(h, /Hash SHA-256:<\/strong> sha256-erp-rodape/);
      assert.match(h, /Normas Vigentes:<\/strong> NT 2026\.008 \| LC 214\/2025/);
    }
    for (const tx of [gerarRelatorioErpResumidoTxt(erpPayload), gerarRelatorioErpDetalhadoTxt(erpPayload)]) {
      assert.match(tx, /Modo=snapshot \| Atualizado em=2026-11-26T15:00:00Z \| Hash SHA-256=sha256-erp-rodape/);
      assert.match(tx, /Normas Vigentes: NT 2026\.008 \| LC 214\/2025/);
    }

    // 2. Modo hardcoded -> ambas as APIs bloqueiam fechamento com HTTP 503
    process.env.RFB_DATA_DIR = dirVazio;
    resetRtcModeCacheForTests();

    const reqAudBlock = new NextRequest('http://localhost/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'html', itens: [] }),
    });
    const resAudBlock = await gerarRelatorioAuditoriaPost(reqAudBlock);
    assert.equal(resAudBlock.status, 503);
    const jsonAudBlock = await resAudBlock.json();
    assert.equal(jsonAudBlock.codigo, 'RTC_HARDCODED_BLOQUEADO');
    assert.equal(jsonAudBlock.rtcStatus?.mode, 'hardcoded');

    const reqParamBlock = new NextRequest('http://localhost/api/parametrizacao-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: erpPayload, mode: 'resumido', format: 'html' }),
    });
    const resParamBlock = await gerarRelatorioParametrizacaoPost(reqParamBlock);
    assert.equal(resParamBlock.status, 503);
    const jsonParamBlock = await resParamBlock.json();
    assert.equal(jsonParamBlock.codigo, 'RTC_HARDCODED_BLOQUEADO');

    // 3. Simulação explícita permitida apenas com marcação RASCUNHO NÃO OFICIAL
    const reqAudRascunho = new NextRequest('http://localhost/api/auditoria-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'html',
        permitirSimulacaoHardcoded: true,
        itens: [],
      }),
    });
    const resAudRascunho = await gerarRelatorioAuditoriaPost(reqAudRascunho);
    assert.equal(resAudRascunho.status, 200);
    const htmlRascunho = await resAudRascunho.text();
    assert.match(htmlRascunho, /RASCUNHO NÃO OFICIAL/);

    const reqParamRascunho = new NextRequest('http://localhost/api/parametrizacao-relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { contexto: {}, itens: [{ cProd: 'X1', xProd: 'Teste', ncm: '84713012' }] },
        mode: 'detalhado',
        format: 'txt',
        permitirSimulacaoHardcoded: true,
      }),
    });
    const resParamRascunho = await gerarRelatorioParametrizacaoPost(reqParamRascunho);
    assert.equal(resParamRascunho.status, 200);
    const jsonParamRascunho = await resParamRascunho.json();
    assert.match(jsonParamRascunho.content, /RASCUNHO NÃO OFICIAL/);
  } finally {
    if (prevDir !== undefined) process.env.RFB_DATA_DIR = prevDir;
    else delete process.env.RFB_DATA_DIR;
    if (prevProbe !== undefined) process.env.RTC_LIVE_PROBE = prevProbe;
    await rm(dirVazio, { recursive: true, force: true });
    resetRtcModeCacheForTests();
  }
});
