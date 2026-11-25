import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { JsonFileEmpresasRepository } from '../lib/db/empresas-repository.ts';
import {
  normalizarBrasilApi,
  normalizarCnpjWs,
  normalizarReceitaWs,
  inferirRegimeTributarioSugerido,
  consultarCnpjOficial,
} from '../lib/fiscal/cnpj-consulta.ts';
import { GET as cnpjRouteGet } from '../app/api/cnpj/[cnpj]/route.ts';

test('Marco 4 — Persistência atômica em JSON (data/db/empresas-store.json) sobrevive a reinicialização', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portela-empresas-store-'));
  const storePath = path.join(tmpDir, 'empresas-store.json');

  try {
    // Instância 1 cria empresa + perfil + metadata cadastral
    const repo1 = new JsonFileEmpresasRepository(storePath);
    const criada = await repo1.criar({
      cnpj: '33.000.167/0001-01',
      razaoSocial: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
      nomeFantasia: 'PETROBRAS',
      uf: 'RJ',
      municipioIbge: '3304557',
      ativo: true,
      metadata: {
        cnaePrincipal: { codigo: '0600001', descricao: 'Extração de petróleo e gás natural' },
        situacaoCadastral: 'ATIVA',
      },
      perfilInicial: {
        regimeTributario: 'LUCRO_REAL',
        vigenciaInicio: '2026-01-01',
        vigenciaFim: null,
        simplesOptanteHibrido2027: false,
        aliquotasEfetivas: { icmsEfetivo: 18, pisEfetivo: 1.65, cofinsEfetivo: 7.6 },
        beneficiosParana: { diferimentoParcialArt28: true, optanteRotSt: false, reducoesBcAtivas: [] },
        reformaTributaria: { optanteSplitPayment2026: true, creditoPresumidoIbsCbs: false },
      },
    });

    assert.ok(fs.existsSync(storePath), 'Arquivo JSON de empresas deve ter sido criado no disco');

    // Instância 2 simula reinicialização completa do servidor em modo nativo Windows
    const repo2 = new JsonFileEmpresasRepository(storePath);
    const lista = await repo2.listar();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].razaoSocial, 'PETROLEO BRASILEIRO S.A. PETROBRAS');
    assert.equal(lista[0].perfis?.length, 1);
    assert.equal(lista[0].metadata?.cnaePrincipal?.codigo, '0600001');

    // Adiciona nova vigência encerrando a anterior automaticamente
    await repo2.adicionarPerfil(criada.id, {
      regimeTributario: 'LUCRO_PRESUMIDO',
      vigenciaInicio: '2027-01-01',
      encerrarAnteriorAutomaticamente: true,
      simplesOptanteHibrido2027: false,
      aliquotasEfetivas: { pisEfetivo: 0.65, cofinsEfetivo: 3.0 },
      beneficiosParana: { diferimentoParcialArt28: true, optanteRotSt: false, reducoesBcAtivas: [] },
      reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
    });

    // Instância 3 verifica bitemporalidade persistida em disco
    const repo3 = new JsonFileEmpresasRepository(storePath);
    const vigente2026 = await repo3.buscarPerfilVigente(criada.id, '2026-06-01');
    const vigente2027 = await repo3.buscarPerfilVigente(criada.id, '2027-06-01');
    assert.equal(vigente2026?.regimeTributario, 'LUCRO_REAL');
    assert.equal(vigente2026?.vigenciaFim, '2026-12-31');
    assert.equal(vigente2027?.regimeTributario, 'LUCRO_PRESUMIDO');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Marco 4 — Watchers e TypeScript ignoram data/db/**', () => {
  const nextCfg = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');
  const tsCfg = fs.readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf8');
  assert.ok(nextCfg.includes('data/db/**'), 'next.config.mjs deve excluir data/db/**');
  assert.ok(tsCfg.includes('data/db/**'), 'tsconfig.json deve excluir data/db/**');
});

test('Marco 4 — Normalização BrasilAPI, CNPJ.ws e ReceitaWS + Inferência de Regime', () => {
  const br = normalizarBrasilApi({
    cnpj: '00000000000191',
    razao_social: 'PORTELA CONTABILIDADE LTDA',
    nome_fantasia: 'PORTELA FISCAL',
    descricao_situacao_cadastral: 'ATIVA',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'ME',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'XV DE NOVEMBRO',
    numero: '123',
    bairro: 'CENTRO',
    cep: '80020310',
    municipio: 'CURITIBA',
    codigo_municipio_ibge: 4106902,
    uf: 'PR',
    cnae_fiscal: 6920601,
    cnae_fiscal_descricao: 'Atividades de contabilidade',
    cnaes_secundarios: [{ codigo: 6920602, descricao: 'Atividades de consultoria e auditoria contábil e tributária' }],
    opcao_pelo_simples: true,
    opcao_pelo_mei: false,
  });

  assert.equal(br.fonte, 'brasilapi');
  assert.equal(br.razaoSocial, 'PORTELA CONTABILIDADE LTDA');
  assert.equal(br.endereco.municipioIbge, '4106902');
  assert.equal(br.endereco.uf, 'PR');
  assert.equal(br.cnaePrincipal.codigo, '6920601');
  assert.equal(br.simplesNacional.optanteSimples, true);
  assert.equal(br.regimeTributarioSugerido, 'SIMPLES_NACIONAL');

  const ws = normalizarCnpjWs({
    razao_social: 'EMPRESA SUL S/A',
    natureza_juridica: { id: '2054', descricao: 'Sociedade Anônima Fechada' },
    porte: { descricao: 'DEMAIS' },
    simples: { simples: 'Não', mei: 'Não' },
    estabelecimento: {
      cnpj: '33000167000101',
      nome_fantasia: 'SUL SA',
      situacao_cadastral: 'Ativa',
      tipo_logradouro: 'AVENIDA',
      logradouro: 'PARANA',
      numero: '500',
      bairro: 'CABRAL',
      cep: '80035130',
      cidade: { nome: 'Curitiba', ibge_id: 4106902 },
      estado: { sigla: 'PR' },
      atividade_principal: { id: '4711302', descricao: 'Comércio varejista' },
      atividades_secundarias: [],
    },
  });

  assert.equal(ws.fonte, 'cnpjws');
  assert.equal(ws.regimeTributarioSugerido, 'LUCRO_REAL');
  assert.equal(ws.endereco.municipioIbge, '4106902');

  const rws = normalizarReceitaWs({
    status: 'OK',
    cnpj: '04.206.050/0001-80',
    nome: 'MICRO EMPREENDEDOR INDIVIDUAL TESTE',
    fantasia: 'MEI TESTE',
    situacao: 'ATIVA',
    natureza_juridica: '213-5 - Empresário (Individual)',
    porte: 'MICRO EMPRESA',
    logradouro: 'RUA A',
    numero: '10',
    bairro: 'CENTRO',
    cep: '80000-000',
    municipio: 'CURITIBA',
    uf: 'PR',
    atividade_principal: [{ code: '47.81-4-00', text: 'Comércio varejista de artigos do vestuário' }],
    atividades_secundarias: [{ code: '00.00-0-00', text: 'Não informada' }],
    simples: { optante: true },
    simei: { optante: true },
  });

  assert.equal(rws.fonte, 'receitaws');
  assert.equal(rws.simplesNacional.optanteMei, true);
  assert.equal(rws.regimeTributarioSugerido, 'MEI');
  assert.equal(rws.cnaesSecundarios.length, 0);

  assert.equal(
    inferirRegimeTributarioSugerido({ optanteMei: false, optanteSimples: false, naturezaJuridica: '206-2' }),
    'LUCRO_PRESUMIDO'
  );
});

test('Marco 4 — Cadeia de fallback BrasilAPI -> CNPJ.ws -> ReceitaWS e rota GET /api/cnpj/[cnpj]', async () => {
  // 1. Rejeita CNPJ inválido sem chamar rede
  let chamadas = 0;
  const invalido = await consultarCnpjOficial('11.111.111/1111-11', {
    fetchFn: async () => {
      chamadas++;
      return new Response('{}', { status: 200 });
    },
  });
  assert.equal(invalido.sucesso, false);
  assert.equal(chamadas, 0);

  // 2. Simula falha da BrasilAPI (503) -> sucesso via CNPJ.ws
  const urlsChamadas = [];
  const resFallbackCnpjWs = await consultarCnpjOficial('00000000000191', {
    fetchFn: async (url) => {
      urlsChamadas.push(String(url));
      if (String(url).includes('brasilapi.com.br')) {
        return new Response(JSON.stringify({ message: 'indisponível' }), { status: 503 });
      }
      return new Response(
        JSON.stringify({
          razao_social: 'BANCO DO BRASIL SA',
          natureza_juridica: { descricao: 'Sociedade de Economia Mista' },
          simples: { simples: 'Não', mei: 'Não' },
          estabelecimento: {
            cnpj: '00000000000191',
            situacao_cadastral: 'Ativa',
            cidade: { nome: 'Brasília', ibge_id: 5300108 },
            estado: { sigla: 'DF' },
            atividade_principal: { id: '6421200', descricao: 'Bancos comerciais' },
            atividades_secundarias: [],
          },
        }),
        { status: 200 }
      );
    },
  });
  assert.equal(resFallbackCnpjWs.sucesso, true);
  assert.equal(resFallbackCnpjWs.dados?.fonte, 'cnpjws');
  assert.equal(urlsChamadas.length, 2);

  // 3. Simula falha da BrasilAPI e CNPJ.ws -> sucesso via ReceitaWS
  const resFallbackReceita = await consultarCnpjOficial('00000000000191', {
    fetchFn: async (url) => {
      if (String(url).includes('receitaws.com.br')) {
        return new Response(
          JSON.stringify({
            status: 'OK',
            cnpj: '00.000.000/0001-91',
            nome: 'BANCO DO BRASIL SA',
            situacao: 'ATIVA',
            uf: 'DF',
            atividade_principal: [{ code: '64.21-2-00', text: 'Bancos comerciais' }],
            atividades_secundarias: [],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 502 });
    },
  });
  assert.equal(resFallbackReceita.sucesso, true);
  assert.equal(resFallbackReceita.dados?.fonte, 'receitaws');

  // 4. Rota HTTP /api/cnpj/[cnpj] retorna 400 para CNPJ inválido
  const reqInvalida = new Request('http://localhost:3000/api/cnpj/123');
  const resp400 = await cnpjRouteGet(reqInvalida, { params: Promise.resolve({ cnpj: '123' }) });
  assert.equal(resp400.status, 400);

  // 5. UI CadastroEmpresas possui botão Consultar Receita Federal (CNPJ) com acessibilidade
  const cadSrc = fs.readFileSync(path.join(process.cwd(), 'components', 'CadastroEmpresas.tsx'), 'utf8');
  assert.ok(cadSrc.includes('Consultar Receita Federal (CNPJ)'));
  assert.ok(cadSrc.includes('aria-busy'));
  assert.ok(cadSrc.includes('aria-live="polite"'));
});
