/**
 * Suíte de Testes: Persistência Relacional PostgreSQL / In-Memory Dual-Mode,
 * Gestão Bitemporal de Perfis Tributários e Auditoria Imutável
 *
 * Sub-Etapa 19.4 (Passo 4 de 7 do Ciclo 6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  validarCnpj,
  sanitizarCnpj,
  formatarCnpj,
  EmpresaInputSchema,
  validarSobreposicaoVigencias,
  resolverPerfilVigenteNaData,
  mapearPerfilParaContextoAuditoria,
} from '../lib/fiscal/perfil-tributario.ts';

import {
  getInMemoryEmpresasRepositoryForTests,
} from '../lib/db/empresas-repository.ts';

import {
  getInMemoryDocumentosRepositoryForTests,
  ErroDocumentoDuplicado,
} from '../lib/db/documentos-repository.ts';

// ==============================================================================
// TESTE 1: Validador Algorítmico Real de CNPJ (14 dígitos + 2 DVs)
// ==============================================================================
test('1. Validador algorítmico real de CNPJ e Zod Schema', () => {
  // CNPJs válidos conhecidos
  const cnpjsValidos = [
    '00.000.000/0001-91', // Banco do Brasil
    '33.000.167/0001-01', // Petrobras
    '04.206.050/0001-80', // Ouvidoria Geral da República
    '00000000000191',    // Sem pontuação
  ];

  for (const cnpj of cnpjsValidos) {
    assert.strictEqual(validarCnpj(cnpj), true, `Deveria validar CNPJ real: ${cnpj}`);
  }

  // CNPJs inválidos matemáticos ou de formato
  const cnpjsInvalidos = [
    '',                     // Vazio
    '1234567890123',        // 13 dígitos
    '123456789012345',      // 15 dígitos
    '00.000.000/0000-00',   // Todos zeros
    '11.111.111/1111-11',   // Todos uns
    '00.000.000/0001-92',   // DV incorreto
    '33.000.167/0001-09',   // DV incorreto
  ];

  for (const cnpj of cnpjsInvalidos) {
    assert.strictEqual(validarCnpj(cnpj), false, `Deveria rejeitar CNPJ inválido: ${cnpj}`);
  }

  // Sanitização e formatação
  assert.strictEqual(sanitizarCnpj('00.000.000/0001-91'), '00000000000191');
  assert.strictEqual(formatarCnpj('00000000000191'), '00.000.000/0001-91');

  // Schema Zod
  const parseValido = EmpresaInputSchema.safeParse({
    cnpj: '00.000.000/0001-91',
    razaoSocial: 'Banco do Brasil S.A.',
    uf: 'DF',
  });
  assert.strictEqual(parseValido.success, true);

  const parseInvalido = EmpresaInputSchema.safeParse({
    cnpj: '00.000.000/0001-00',
    razaoSocial: 'Empresa Teste',
  });
  assert.strictEqual(parseInvalido.success, false);
});

// ==============================================================================
// TESTE 2: Validação Bitemporal de Sobreposição de Vigências
// ==============================================================================
test('2. Validação bitemporal de sobreposição temporal de vigências', () => {
  // Início superior ao fim deve ser rejeitado imediatamente
  const vInvertida = validarSobreposicaoVigencias([], {
    vigenciaInicio: '2026-12-31',
    vigenciaFim: '2026-01-01',
  });
  assert.strictEqual(vInvertida.valido, false);
  assert.ok(vInvertida.erro?.includes('não pode ser superior'));

  // Perfil existente de 2025-01-01 até indeterminado
  const perfisExistentes = [
    {
      id: 'p1',
      empresaId: 'emp-1',
      escritorioId: 'esc-1',
      regimeTributario: 'SIMPLES_NACIONAL',
      vigenciaInicio: '2025-01-01',
      vigenciaFim: null,
      aliquotasEfetivas: {},
      simplesOptanteHibrido2027: false,
      beneficiosParana: { diferimentoParcialArt28: true, optanteRotSt: false, reducoesBcAtivas: [] },
      reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
      criadoEm: '2025-01-01T00:00:00Z',
      atualizadoEm: '2025-01-01T00:00:00Z',
    },
  ];

  // Tentativa de adicionar perfil em 2026-01-01 sem autorização de encerramento automático
  const vConflito = validarSobreposicaoVigencias(
    perfisExistentes,
    { vigenciaInicio: '2026-01-01', vigenciaFim: null },
    false
  );
  assert.strictEqual(vConflito.valido, false);
  assert.ok(vConflito.conflito);
  assert.strictEqual(vConflito.conflito?.id, 'p1');

  // Adição com encerramento automático: P1 deve ser encerrado em 2025-12-31
  const vResolvido = validarSobreposicaoVigencias(
    perfisExistentes,
    { vigenciaInicio: '2026-01-01', vigenciaFim: null },
    true
  );
  assert.strictEqual(vResolvido.valido, true);
  assert.ok(vResolvido.perfisAjustados);
  const p1Ajustado = vResolvido.perfisAjustados?.find(p => p.id === 'p1');
  assert.strictEqual(p1Ajustado?.vigenciaFim, '2025-12-31');
});

// ==============================================================================
// TESTE 3: Resolução Determinística do Perfil Vigente no Fato Gerador
// ==============================================================================
test('3. Resolução determinística do perfil fiscal vigente no fato gerador', () => {
  const perfis = [
    {
      id: 'p-2024',
      empresaId: 'emp-1',
      escritorioId: 'esc-1',
      regimeTributario: 'SIMPLES_NACIONAL',
      vigenciaInicio: '2024-01-01',
      vigenciaFim: '2024-12-31',
      aliquotasEfetivas: { icmsEfetivo: 2.5 },
      simplesOptanteHibrido2027: false,
      beneficiosParana: { diferimentoParcialArt28: true, optanteRotSt: false, reducoesBcAtivas: [] },
      reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
      criadoEm: '2024-01-01T00:00:00Z',
      atualizadoEm: '2024-01-01T00:00:00Z',
    },
    {
      id: 'p-2025',
      empresaId: 'emp-1',
      escritorioId: 'esc-1',
      regimeTributario: 'LUCRO_PRESUMIDO',
      vigenciaInicio: '2025-01-01',
      vigenciaFim: '2025-12-31',
      aliquotasEfetivas: { icmsEfetivo: 19.5, pisEfetivo: 0.65, cofinsEfetivo: 3.0 },
      simplesOptanteHibrido2027: false,
      beneficiosParana: { diferimentoParcialArt28: true, optanteRotSt: true, reducoesBcAtivas: [] },
      reformaTributaria: { optanteSplitPayment2026: false, creditoPresumidoIbsCbs: false },
      criadoEm: '2025-01-01T00:00:00Z',
      atualizadoEm: '2025-01-01T00:00:00Z',
    },
    {
      id: 'p-2026',
      empresaId: 'emp-1',
      escritorioId: 'esc-1',
      regimeTributario: 'LUCRO_REAL',
      vigenciaInicio: '2026-01-01',
      vigenciaFim: null, // vigente por tempo indeterminado
      aliquotasEfetivas: { icmsEfetivo: 19.5, pisEfetivo: 1.65, cofinsEfetivo: 7.6 },
      simplesOptanteHibrido2027: false,
      beneficiosParana: { diferimentoParcialArt28: true, optanteRotSt: true, reducoesBcAtivas: ['ANEXO_VI_ART_1'] },
      reformaTributaria: { optanteSplitPayment2026: true, creditoPresumidoIbsCbs: false },
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoEm: '2026-01-01T00:00:00Z',
    },
  ];

  // Data anterior a qualquer vigência
  const ant = resolverPerfilVigenteNaData(perfis, '2023-11-20');
  assert.strictEqual(ant, null);

  // Data em 2024
  const r2024 = resolverPerfilVigenteNaData(perfis, '2024-06-15T14:30:00Z');
  assert.strictEqual(r2024?.id, 'p-2024');
  assert.strictEqual(r2024?.regimeTributario, 'SIMPLES_NACIONAL');

  // Limite exato de início de 2025
  const r2025 = resolverPerfilVigenteNaData(perfis, '2025-01-01');
  assert.strictEqual(r2025?.id, 'p-2025');
  assert.strictEqual(r2025?.regimeTributario, 'LUCRO_PRESUMIDO');

  // Data em 2026 (indeterminado)
  const r2026 = resolverPerfilVigenteNaData(perfis, '2026-11-22');
  assert.strictEqual(r2026?.id, 'p-2026');
  assert.strictEqual(r2026?.regimeTributario, 'LUCRO_REAL');
});

// ==============================================================================
// TESTE 4: Mapeamento de Perfil para Contexto de Auditoria dos Motores
// ==============================================================================
test('4. Mapeamento de perfil para contexto de auditoria fiscal e motor RTC', () => {
  const perfilHibrido = {
    id: 'p-hibrido-2027',
    empresaId: 'emp-1',
    escritorioId: 'esc-1',
    regimeTributario: 'SIMPLES_NACIONAL',
    vigenciaInicio: '2027-01-01',
    vigenciaFim: null,
    aliquotasEfetivas: { icmsEfetivo: 3.5, pisEfetivo: 0.38, cofinsEfetivo: 1.6 },
    simplesOptanteHibrido2027: true,
    beneficiosParana: {
      diferimentoParcialArt28: true,
      optanteRotSt: false,
      regimeEspecialSefaPr: 'Consulta 48/2026 SEFA/PR',
      reducoesBcAtivas: ['CESTA_BASICA_7'],
    },
    reformaTributaria: { optanteSplitPayment2026: true, creditoPresumidoIbsCbs: false },
    criadoEm: '2027-01-01T00:00:00Z',
    atualizadoEm: '2027-01-01T00:00:00Z',
  };

  const ctx = mapearPerfilParaContextoAuditoria(perfilHibrido);
  assert.strictEqual(ctx.isSimplesNacional, true);
  assert.strictEqual(ctx.isSimplesHibrido2027, true);
  assert.strictEqual(ctx.aplicaDiferimentoArt28, true);
  assert.strictEqual(ctx.aplicaRotSt, false);
  assert.strictEqual(ctx.splitPayment2026, true);
  assert.strictEqual(ctx.icmsEfetivoSimples, 3.5);
  assert.strictEqual(ctx.regimeEspecialSefaPr, 'Consulta 48/2026 SEFA/PR');
  assert.deepStrictEqual(ctx.reducoesBcAtivas, ['CESTA_BASICA_7']);
});

// ==============================================================================
// TESTE 5: Repositório de Documentos Fiscais, Compressão GZIP e Duplicidade
// ==============================================================================
test('5. Repositório de Documentos: Compressão GZIP, SHA-256 e Unicidade por Chave', async () => {
  const repo = getInMemoryDocumentosRepositoryForTests();
  repo.limparParaTestes();

  const xmlOriginal = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe41261100000000000191550010000001231000001234">
    <emit><CNPJ>00000000000191</CNPJ><xNome>EMPRESA TESTE LTDA</xNome><UF>PR</UF></emit>
    <total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

  const hashEsperado = crypto.createHash('sha256').update(xmlOriginal).digest('hex');
  const chaveAcesso = '41261100000000000191550010000001231000001234';
  const empresaId = 'empresa-teste-01';

  // 1. Salvar documento
  const docSalvo = await repo.salvarDocumento({
    empresaId,
    chaveAcesso,
    numero: 123,
    serie: '1',
    tipoOperacao: '0',
    dataEmissao: '2026-11-22T10:00:00Z',
    emitenteCnpj: '00000000000191',
    emitenteRazaoSocial: 'EMPRESA TESTE LTDA',
    emitenteUf: 'PR',
    valorTotalProdutos: 1500.0,
    valorTotalNota: 1500.0,
    xmlOriginal,
  });

  assert.ok(docSalvo.id);
  assert.strictEqual(docSalvo.chaveAcesso, chaveAcesso);
  assert.strictEqual(docSalvo.sha256Xml, hashEsperado);

  // 2. Descomprimir XML e verificar integridade byte-a-byte
  const xmlRecuperado = await repo.buscarXmlDescomprimido(docSalvo.id);
  assert.strictEqual(xmlRecuperado, xmlOriginal);

  // 3. Trava de duplicidade para a mesma empresa
  await assert.rejects(
    async () => {
      await repo.salvarDocumento({
        empresaId,
        chaveAcesso,
        numero: 123,
        serie: '1',
        tipoOperacao: '0',
        dataEmissao: '2026-11-22T10:00:00Z',
        emitenteCnpj: '00000000000191',
        emitenteRazaoSocial: 'EMPRESA TESTE LTDA',
        emitenteUf: 'PR',
        valorTotalProdutos: 1500.0,
        valorTotalNota: 1500.0,
        xmlOriginal,
      });
    },
    (err) => {
      assert.ok(err instanceof ErroDocumentoDuplicado);
      assert.strictEqual(err.chaveAcesso, chaveAcesso);
      return true;
    }
  );

  // 4. Mesma chave para OUTRA empresa deve ser aceita (isolamento multi-tenant)
  const outraEmpresa = await repo.salvarDocumento({
    empresaId: 'empresa-teste-02',
    chaveAcesso,
    numero: 123,
    serie: '1',
    tipoOperacao: '0',
    dataEmissao: '2026-11-22T10:00:00Z',
    emitenteCnpj: '00000000000191',
    emitenteRazaoSocial: 'EMPRESA TESTE LTDA',
    emitenteUf: 'PR',
    valorTotalProdutos: 1500.0,
    valorTotalNota: 1500.0,
  });
  assert.ok(outraEmpresa.id);
  assert.notStrictEqual(outraEmpresa.id, docSalvo.id);
});

// ==============================================================================
// TESTE 6: Auditoria Imutável de Execuções de Motores Fiscais
// ==============================================================================
test('6. Registro e recuperação de auditoria imutável de execuções de motores', async () => {
  const repo = getInMemoryDocumentosRepositoryForTests();

  const reg1 = await repo.registrarExecucaoMotor({
    empresaId: 'empresa-teste-01',
    motorTipo: 'DIFAL_PARANA',
    versaoMotor: '18.2.0',
    inputPayload: { ufOrigem: 'SP', ufDestino: 'PR', valorOperacao: 1000.0 },
    outputPayload: { difalDevido: 75.0, aliquotaInterna: 19.5, aliquotaInterestadual: 12.0 },
    sucesso: true,
    duracaoMs: 4,
  });

  const reg2 = await repo.registrarExecucaoMotor({
    empresaId: 'empresa-teste-01',
    motorTipo: 'RTC_SIMPLES_NACIONAL',
    versaoMotor: '19.3.0',
    inputPayload: { cnae: '4711302', anexo: 'I', receita12m: 360000 },
    outputPayload: { aliquotaEfetiva: 4.0 },
    sucesso: true,
    duracaoMs: 12,
  });

  assert.ok(reg1.id);
  assert.ok(reg2.id);

  const lista = await repo.listarExecucoes('empresa-teste-01');
  assert.strictEqual(lista.length >= 2, true);

  const motorSimples = lista.find(e => e.motorTipo === 'RTC_SIMPLES_NACIONAL');
  assert.ok(motorSimples);
  assert.strictEqual(motorSimples?.versaoMotor, '19.3.0');
  assert.strictEqual(motorSimples?.sucesso, true);
  assert.deepStrictEqual(motorSimples?.outputPayload, { aliquotaEfetiva: 4.0 });
});
