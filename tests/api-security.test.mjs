import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST as postAtualizar, GET as getAtualizar } from '../app/api/atualizar/route.ts';
import { POST as postAuditoriaRelatorio } from '../app/api/auditoria-relatorio/route.ts';
import { POST as postAuditoriaEntrada } from '../app/api/auditoria-entrada/route.ts';
import { checkRateLimit, resetRateLimitStore } from '../lib/rate-limit.ts';

test('Segurança e Proteções da API', async (t) => {
  // Limpa o store de rate limit antes dos testes
  resetRateLimitStore();

  await t.test('POST /api/atualizar - Trava ENABLE_UPDATE_ROUTE desativada (403)', async () => {
    const originalEnv = process.env.ENABLE_UPDATE_ROUTE;
    process.env.ENABLE_UPDATE_ROUTE = 'false';

    try {
      const req = new Request('http://localhost:3000/api/atualizar', {
        method: 'POST',
      });
      const res = await postAtualizar(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.equal(data.codigo, 'ROTA_DESATIVADA');
    } finally {
      process.env.ENABLE_UPDATE_ROUTE = originalEnv;
    }
  });

  await t.test('POST /api/atualizar - Ausência de Bearer token (401)', async () => {
    const originalEnable = process.env.ENABLE_UPDATE_ROUTE;
    const originalToken = process.env.UPDATE_TOKEN;
    process.env.ENABLE_UPDATE_ROUTE = 'true';
    process.env.UPDATE_TOKEN = 'token_super_secreto_123';

    try {
      const req = new Request('http://localhost:3000/api/atualizar', {
        method: 'POST',
      });
      const res = await postAtualizar(req);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.equal(data.codigo, 'NAO_AUTORIZADO');
    } finally {
      process.env.ENABLE_UPDATE_ROUTE = originalEnable;
      process.env.UPDATE_TOKEN = originalToken;
    }
  });

  await t.test('POST /api/atualizar - Bearer token incorreto (403)', async () => {
    const originalEnable = process.env.ENABLE_UPDATE_ROUTE;
    const originalToken = process.env.UPDATE_TOKEN;
    process.env.ENABLE_UPDATE_ROUTE = 'true';
    process.env.UPDATE_TOKEN = 'token_super_secreto_123';

    try {
      const req = new Request('http://localhost:3000/api/atualizar', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_incorreto',
        },
      });
      const res = await postAtualizar(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.equal(data.codigo, 'TOKEN_INVALIDO');
    } finally {
      process.env.ENABLE_UPDATE_ROUTE = originalEnable;
      process.env.UPDATE_TOKEN = originalToken;
    }
  });

  await t.test('POST /api/atualizar - Parâmetro tipo inválido com Zod (400)', async () => {
    const originalEnable = process.env.ENABLE_UPDATE_ROUTE;
    const originalToken = process.env.UPDATE_TOKEN;
    process.env.ENABLE_UPDATE_ROUTE = 'true';
    process.env.UPDATE_TOKEN = 'token_super_secreto_123';

    try {
      const req = new Request('http://localhost:3000/api/atualizar?tipo=hack_invalido', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token_super_secreto_123',
        },
      });
      const res = await postAtualizar(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.equal(data.codigo, 'TIPO_INVALIDO');
    } finally {
      process.env.ENABLE_UPDATE_ROUTE = originalEnable;
      process.env.UPDATE_TOKEN = originalToken;
    }
  });

  await t.test('GET /api/atualizar - Informa status de ativação e uso (200)', async () => {
    const res = await getAtualizar();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok('ativo' in data);
    assert.ok(data.uso.includes('tipo=fontes|completo|reforma|marco-legal'));
  });

  await t.test('lib/rate-limit.ts - Limita 20 requisições por janela e reseta corretamente', () => {
    resetRateLimitStore();
    const testIp = '192.168.1.100';

    // 20 requisições devem ser permitidas
    for (let i = 0; i < 20; i++) {
      const check = checkRateLimit(testIp, { maxRequests: 20, windowMs: 60_000 });
      assert.equal(check.success, true);
      assert.equal(check.remaining, 19 - i);
    }

    // A 21ª requisição deve ser bloqueada
    const blocked = checkRateLimit(testIp, { maxRequests: 20, windowMs: 60_000 });
    assert.equal(blocked.success, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSec > 0);

    // Outro IP não deve ser afetado
    const otherIpCheck = checkRateLimit('192.168.1.101', { maxRequests: 20, windowMs: 60_000 });
    assert.equal(otherIpCheck.success, true);
  });

  await t.test('POST /api/auditoria-entrada - Rejeita arquivo que excede 5MB (413)', async () => {
    resetRateLimitStore();
    const formData = new FormData();
    // Cria buffer simulado de 5.5 MB
    const largeBlob = new Blob([new Uint8Array(5.5 * 1024 * 1024)], { type: 'application/xml' });
    formData.append('file', largeBlob, 'nfe_grande.xml');

    const req = new Request('http://localhost:3000/api/auditoria-entrada', {
      method: 'POST',
      body: formData,
    });

    const res = await postAuditoriaEntrada(req);
    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.codigo, 'TAMANHO_EXCEDIDO');
  });

  await t.test('POST /api/auditoria-entrada - Rejeita arquivo XML com magic bytes inválidos (400)', async () => {
    resetRateLimitStore();
    const formData = new FormData();
    const fakeXmlBlob = new Blob(['CONTEUDO_TOTALMENTE_INVALIDO_NAO_XML'], { type: 'application/xml' });
    formData.append('file', fakeXmlBlob, 'fake.xml');

    const req = new Request('http://localhost:3000/api/auditoria-entrada', {
      method: 'POST',
      body: formData,
    });

    const res = await postAuditoriaEntrada(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.codigo, 'MAGIC_BYTES_INVALIDO');
  });

  await t.test('POST /api/auditoria-entrada - Rejeita arquivo PDF com magic bytes inválidos (400)', async () => {
    resetRateLimitStore();
    const formData = new FormData();
    const fakePdfBlob = new Blob(['NOT_A_REAL_PDF_HEADER_123456'], { type: 'application/pdf' });
    formData.append('file', fakePdfBlob, 'fake.pdf');

    const req = new Request('http://localhost:3000/api/auditoria-entrada', {
      method: 'POST',
      body: formData,
    });

    const res = await postAuditoriaEntrada(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.codigo, 'MAGIC_BYTES_INVALIDO');
  });

  await t.test('POST /api/auditoria-relatorio - Sanitiza XSS com esc() e injeta CSP rígido', async () => {
    const payload = {
      format: 'html',
      parecerTecnicoXml: '<script>alert("XSS")</script> Parecer Seguro',
      parecerConformidade: '<b>Conforme</b> & <img src=x onerror=alert(1)>',
      itens: [
        {
          cProd: '<script>',
          xProd: 'Produto "Teste" & <Injeção>',
          ncm: '84713012',
          cfopEntrada: '1102',
          permiteCredito: true,
        },
      ],
    };

    const req = new Request('http://localhost:3000/api/auditoria-relatorio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const res = await postAuditoriaRelatorio(req);
    assert.equal(res.status, 200);

    const csp = res.headers.get('Content-Security-Policy');
    assert.ok(csp && csp.includes("default-src 'none'"));
    assert.ok(csp.includes("style-src 'unsafe-inline'"));

    const html = await res.text();
    // Confirma que scripts e tags brutas foram escapados
    assert.equal(html.includes('<script>alert("XSS")</script>'), false);
    assert.ok(html.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('Produto &quot;Teste&quot; &amp; &lt;Injeção&gt;'));
  });
});
