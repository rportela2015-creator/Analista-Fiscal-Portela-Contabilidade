/**
 * Suíte de Testes Automatizados: Integração do DIFAL, FECOP & Antecipação PR
 * na Auditoria de Entrada e Relatório Pericial (Sub-etapa 18.3)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { auditarDifalNotaEntrada } from '../lib/engine/difal-pr.ts';
import { POST } from '../app/api/auditoria-relatorio/route.ts';

test('auditarDifalNotaEntrada: Apuração determinística em NF-e SP -> PR', () => {
  const extracaoSimulada = {
    identificacao: {
      numero: '12345',
      serie: '1',
      dataEmissao: '2026-11-15',
    },
    emitente: {
      uf: 'SP',
      nome: 'Fornecedor Paulista Ltda',
      cnpj: '11222333000144',
      crt: 3,
    },
    destinatario: {
      uf: 'PR',
      nome: 'Empresa Paranaense S/A',
      cnpj: '44333222000155',
    },
    itens: [
      {
        index: 1,
        cProd: 'PROD-001',
        xProd: 'Material de Limpeza e Escritório',
        ncm: '34029090',
        vProd: 1000.0,
        tributos: {
          orig: 0,
          pICMS: 12.0,
          vICMS: 120.0,
        },
      },
      {
        index: 2,
        cProd: 'PROD-002',
        xProd: 'Mercadoria para Revenda Geral',
        ncm: '84713012',
        vProd: 500.0,
        tributos: {
          orig: 0,
          pICMS: 12.0,
          vICMS: 60.0,
        },
      },
    ],
  };

  // 1. Execução padrão: Item 1 com destinação explícita de uso e consumo, Item 2 revenda
  const resultado = auditarDifalNotaEntrada(extracaoSimulada, {
    crtDestinatario: 3,
    destinacaoPadrao: 'comercializacao',
    destinacaoPorItem: {
      1: 'uso_consumo',
      2: 'comercializacao',
    },
  });

  assert.ok(resultado, 'Resultado da auditoria de entrada não pode ser nulo');
  assert.equal(resultado.resumoDifalNota.exigeRecolhimentoNaNota, true);
  assert.equal(resultado.resumoDifalNota.totalItensAnalisados, 2);
  assert.equal(resultado.resumoDifalNota.totalItensComDifal, 1);

  // Item 1: R$ 1.000,00, 12% vs 19,5% Base Dupla
  // Base Dupla: 1000 * 0.88 / 0.805 = 1093.17
  // Débito: 1093.17 * 0.195 - 120.00 = 93.17
  assert.equal(resultado.resumoDifalNota.totalDebitoDifal, 93.17);
  assert.equal(resultado.resumoDifalNota.totalGeralRecolher, 93.17);

  const diagItem1 = resultado.itensDiagnostico['1'];
  assert.ok(diagItem1, 'Diagnóstico do item 1 deve existir');
  assert.equal(diagItem1.sujeitoDifal, true);
  assert.equal(diagItem1.modalidade, 'DIFAL_USO_CONSUMO');
  assert.equal(diagItem1.modalidadeBase, 'base_dupla');
  assert.equal(diagItem1.baseCalculoDifal, 1093.17);
  assert.equal(diagItem1.valorDebitoDifal, 93.17);

  const diagItem2 = resultado.itensDiagnostico['2'];
  assert.ok(diagItem2, 'Diagnóstico do item 2 deve existir');
  assert.equal(diagItem2.sujeitoDifal, false);
  assert.equal(diagItem2.exigeRecolhimento, false);

  // 2. Override: Mudar Item 2 também para Ativo Imobilizado
  const resultadoOverride = auditarDifalNotaEntrada(extracaoSimulada, {
    crtDestinatario: 3,
    destinacaoPadrao: 'comercializacao',
    destinacaoPorItem: {
      1: 'uso_consumo',
      2: 'ativo_imobilizado',
    },
  });

  assert.equal(resultadoOverride.resumoDifalNota.totalItensComDifal, 2);
  // Item 2: 500 * 0.88 / 0.805 = 546.58 -> Débito: 546.58 * 0.195 - 60 = 46.58
  // Total: 93.17 + 46.58 = 139.75
  assert.equal(resultadoOverride.resumoDifalNota.totalDebitoDifal, 139.75);
  assert.equal(resultadoOverride.resumoDifalNota.totalGeralRecolher, 139.75);
});

test('auditarDifalNotaEntrada: Operação interna no Paraná dispensa DIFAL', () => {
  const extracaoInterna = {
    emitente: { uf: 'PR', crt: 3 },
    destinatario: { uf: 'PR' },
    itens: [
      {
        index: 1,
        ncm: '34029090',
        vProd: 1000.0,
      },
    ],
  };

  const resultado = auditarDifalNotaEntrada(extracaoInterna, {
    destinacaoPadrao: 'uso_consumo',
  });

  assert.equal(resultado.resumoDifalNota.exigeRecolhimentoNaNota, false);
  assert.equal(resultado.resumoDifalNota.totalDebitoDifal, 0);
  assert.equal(resultado.resumoDifalNota.totalGeralRecolher, 0);
});

test('POST /api/auditoria-relatorio: Renderiza seção de DIFAL no HTML com sanitização XSS', async () => {
  const XSS_PAYLOAD = '<script>alert("xss")</script>';

  const payload = {
    format: 'html',
    parecerTecnicoXml: 'Parecer técnico fiscal sem problemas.',
    parecerConformidade: 'Conformidade atestada.',
    itens: [
      {
        cProd: 'P01',
        xProd: `Mercadoria com injeção ${XSS_PAYLOAD}`,
        ncm: '34029090',
        destinacao: 'uso_consumo',
        diagnosticoDifal: {
          sujeitoDifal: true,
          modalidade: 'DIFAL_USO_CONSUMO',
          baseCalculoDifal: 1093.17,
          aliquotaOrigem: 12.0,
          aliquotaDestino: 19.5,
          valorDebitoDifal: 93.17,
          guiaRecolhimento: 'GR-PR',
        },
      },
    ],
    resumoDifalEntrada: {
      exigeRecolhimentoNaNota: true,
      totalDebitoDifal: 93.17,
      totalDebitoFecop: 0,
      totalAntecipacaoArt16: 0,
      totalGeralRecolher: 93.17,
      guiasNecessarias: ['GR-PR'],
      prazoPrincipal: 'Até o dia 12 do mês subsequente',
      obrigacoesAcessorias: ['Outros Débitos — Reg. E111'],
      alertasConsolidados: [`Alerta com injeção ${XSS_PAYLOAD}`],
    },
  };

  const req = new Request('http://localhost:3000/api/auditoria-relatorio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const res = await POST(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');

  const html = await res.text();

  // 1. Cabeçalho institucional Portela
  assert.ok(
    html.includes('Portela Contabilidade') || html.includes('PORTELA'),
    'Deve conter cabeçalho institucional Portela'
  );

  // 2. Seção de DIFAL e valores
  assert.ok(
    html.includes('Apuração de DIFAL, FECOP') && html.includes('difal-section'),
    'Deve conter título da seção de DIFAL'
  );
  assert.ok(html.includes('93,17'), 'Deve conter o valor monetário formatado R$ 93,17');
  assert.ok(html.includes('GR-PR'), 'Deve conter a menção à guia GR-PR');

  // 3. Sanitização XSS: NUNCA deve conter tag de script crua
  assert.ok(!html.includes('<script>alert("xss")</script>'), 'Tag de script não pode sair sem sanitização');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'XSS deve estar escapado como entidade HTML');
});
