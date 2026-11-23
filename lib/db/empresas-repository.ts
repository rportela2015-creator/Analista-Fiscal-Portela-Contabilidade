/**
 * Repositório Dual-Mode de Empresas e Perfis Tributários Bitemporais
 * Analista Fiscal Portela Contabilidade
 */

import { randomUUID } from 'node:crypto';
import { getDbPool, isDatabaseConfigured } from './client';
import {
  Empresa,
  PerfilTributario,
  EmpresaInput,
  PerfilTributarioInput,
  validarSobreposicaoVigencias,
  resolverPerfilVigenteNaData,
  sanitizarCnpj,
} from '../fiscal/perfil-tributario';

export const ESCRITORIO_PADRAO_ID = '00000000-0000-4000-8000-000000000001';

export interface EmpresasRepository {
  listar(escritorioId?: string): Promise<Empresa[]>;
  buscarPorId(id: string): Promise<Empresa | null>;
  buscarPorCnpj(cnpj: string): Promise<Empresa | null>;
  criar(input: EmpresaInput): Promise<Empresa>;
  atualizar(id: string, dados: Partial<EmpresaInput>): Promise<Empresa | null>;
  adicionarPerfil(empresaId: string, input: PerfilTributarioInput): Promise<PerfilTributario>;
  listarPerfis(empresaId: string): Promise<PerfilTributario[]>;
  buscarPerfilVigente(empresaId: string, dataISO: string): Promise<PerfilTributario | null>;
}

// ============================================================================
// IMPLEMENTAÇÃO POSTGRESQL 17
// ============================================================================

export class PostgresEmpresasRepository implements EmpresasRepository {
  async listar(escritorioId: string = ESCRITORIO_PADRAO_ID): Promise<Empresa[]> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const res = await pool.query(
      `SELECT id, escritorio_id, cnpj, razao_social, nome_fantasia,
              inscricao_estadual, uf, municipio_ibge, ativo, metadata,
              criado_em, atualizado_em
       FROM empresas
       WHERE escritorio_id = $1
       ORDER BY razao_social ASC`,
      [escritorioId]
    );

    return res.rows.map(mapRowToEmpresa);
  }

  async buscarPorId(id: string): Promise<Empresa | null> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const res = await pool.query(
      `SELECT id, escritorio_id, cnpj, razao_social, nome_fantasia,
              inscricao_estadual, uf, municipio_ibge, ativo, metadata,
              criado_em, atualizado_em
       FROM empresas
       WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return null;
    const empresa = mapRowToEmpresa(res.rows[0]);
    empresa.perfis = await this.listarPerfis(empresa.id);
    return empresa;
  }

  async buscarPorCnpj(cnpj: string): Promise<Empresa | null> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const cleanCnpj = sanitizarCnpj(cnpj);
    const res = await pool.query(
      `SELECT id, escritorio_id, cnpj, razao_social, nome_fantasia,
              inscricao_estadual, uf, municipio_ibge, ativo, metadata,
              criado_em, atualizado_em
       FROM empresas
       WHERE cnpj = $1`,
      [cleanCnpj]
    );

    if (res.rows.length === 0) return null;
    const empresa = mapRowToEmpresa(res.rows[0]);
    empresa.perfis = await this.listarPerfis(empresa.id);
    return empresa;
  }

  async criar(input: EmpresaInput): Promise<Empresa> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const escritorioId = input.escritorioId || ESCRITORIO_PADRAO_ID;
    const cleanCnpj = sanitizarCnpj(input.cnpj);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `INSERT INTO empresas (
           escritorio_id, cnpj, razao_social, nome_fantasia, inscricao_estadual,
           uf, municipio_ibge, ativo, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, escritorio_id, cnpj, razao_social, nome_fantasia,
                   inscricao_estadual, uf, municipio_ibge, ativo, metadata,
                   criado_em, atualizado_em`,
        [
          escritorioId,
          cleanCnpj,
          input.razaoSocial,
          input.nomeFantasia || null,
          input.inscricaoEstadual || null,
          input.uf || 'PR',
          input.municipioIbge || null,
          input.ativo !== false,
          JSON.stringify(input.metadata || {}),
        ]
      );

      const novaEmpresa = mapRowToEmpresa(res.rows[0]);

      if (input.perfilInicial) {
        const pRes = await client.query(
          `INSERT INTO perfis_tributarios (
             empresa_id, escritorio_id, regime_tributario, vigencia_inicio, vigencia_fim,
             aliquotas_efetivas, simples_optante_hibrido_2027, beneficios_parana,
             reforma_tributaria, observacoes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, empresa_id, escritorio_id, regime_tributario, vigencia_inicio, vigencia_fim,
                     aliquotas_efetivas, simples_optante_hibrido_2027, beneficios_parana,
                     reforma_tributaria, observacoes, criado_em, atualizado_em`,
          [
            novaEmpresa.id,
            escritorioId,
            input.perfilInicial.regimeTributario,
            input.perfilInicial.vigenciaInicio,
            input.perfilInicial.vigenciaFim || null,
            JSON.stringify(input.perfilInicial.aliquotasEfetivas || {}),
            Boolean(input.perfilInicial.simplesOptanteHibrido2027),
            JSON.stringify(input.perfilInicial.beneficiosParana || {}),
            JSON.stringify(input.perfilInicial.reformaTributaria || {}),
            input.perfilInicial.observacoes || null,
          ]
        );
        novaEmpresa.perfis = [mapRowToPerfil(pRes.rows[0])];
      } else {
        novaEmpresa.perfis = [];
      }

      await client.query('COMMIT');
      return novaEmpresa;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async atualizar(id: string, dados: Partial<EmpresaInput>): Promise<Empresa | null> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const empresaExistente = await this.buscarPorId(id);
    if (!empresaExistente) return null;

    const res = await pool.query(
      `UPDATE empresas
       SET razao_social = COALESCE($2, razao_social),
           nome_fantasia = COALESCE($3, nome_fantasia),
           inscricao_estadual = COALESCE($4, inscricao_estadual),
           uf = COALESCE($5, uf),
           municipio_ibge = COALESCE($6, municipio_ibge),
           ativo = COALESCE($7, ativo),
           metadata = COALESCE($8, metadata),
           atualizado_em = now()
       WHERE id = $1
       RETURNING id, escritorio_id, cnpj, razao_social, nome_fantasia,
                 inscricao_estadual, uf, municipio_ibge, ativo, metadata,
                 criado_em, atualizado_em`,
      [
        id,
        dados.razaoSocial || null,
        dados.nomeFantasia || null,
        dados.inscricaoEstadual || null,
        dados.uf || null,
        dados.municipioIbge || null,
        dados.ativo !== undefined ? dados.ativo : null,
        dados.metadata ? JSON.stringify(dados.metadata) : null,
      ]
    );

    const empresa = mapRowToEmpresa(res.rows[0]);
    empresa.perfis = await this.listarPerfis(empresa.id);
    return empresa;
  }

  async adicionarPerfil(empresaId: string, input: PerfilTributarioInput): Promise<PerfilTributario> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const empresa = await this.buscarPorId(empresaId);
    if (!empresa) throw new Error(`Empresa ${empresaId} não encontrada`);

    const perfisExistentes = await this.listarPerfis(empresaId);
    const validacao = validarSobreposicaoVigencias(
      perfisExistentes,
      input,
      Boolean(input.encerrarAnteriorAutomaticamente)
    );

    if (!validacao.valido) {
      throw new Error(validacao.erro || 'Conflito de sobreposição temporal de vigência.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Se perfis foram ajustados (ex: encerramento do anterior), aplica updates
      if (validacao.perfisAjustados) {
        for (const p of validacao.perfisAjustados) {
          const original = perfisExistentes.find(orig => orig.id === p.id);
          if (original && original.vigenciaFim !== p.vigenciaFim) {
            await client.query(
              'UPDATE perfis_tributarios SET vigencia_fim = $1, atualizado_em = now() WHERE id = $2',
              [p.vigenciaFim, p.id]
            );
          }
        }
      }

      const res = await client.query(
        `INSERT INTO perfis_tributarios (
           empresa_id, escritorio_id, regime_tributario, vigencia_inicio, vigencia_fim,
           aliquotas_efetivas, simples_optante_hibrido_2027, beneficios_parana,
           reforma_tributaria, observacoes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, empresa_id, escritorio_id, regime_tributario, vigencia_inicio, vigencia_fim,
                   aliquotas_efetivas, simples_optante_hibrido_2027, beneficios_parana,
                   reforma_tributaria, observacoes, criado_em, atualizado_em`,
        [
          empresaId,
          empresa.escritorioId,
          input.regimeTributario,
          input.vigenciaInicio,
          input.vigenciaFim || null,
          JSON.stringify(input.aliquotasEfetivas || {}),
          Boolean(input.simplesOptanteHibrido2027),
          JSON.stringify(input.beneficiosParana || {}),
          JSON.stringify(input.reformaTributaria || {}),
          input.observacoes || null,
        ]
      );

      await client.query('COMMIT');
      return mapRowToPerfil(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listarPerfis(empresaId: string): Promise<PerfilTributario[]> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const res = await pool.query(
      `SELECT id, empresa_id, escritorio_id, regime_tributario, vigencia_inicio, vigencia_fim,
              aliquotas_efetivas, simples_optante_hibrido_2027, beneficios_parana,
              reforma_tributaria, observacoes, criado_em, atualizado_em
       FROM perfis_tributarios
       WHERE empresa_id = $1
       ORDER BY vigencia_inicio DESC`,
      [empresaId]
    );

    return res.rows.map(mapRowToPerfil);
  }

  async buscarPerfilVigente(empresaId: string, dataISO: string): Promise<PerfilTributario | null> {
    const perfis = await this.listarPerfis(empresaId);
    return resolverPerfilVigenteNaData(perfis, dataISO);
  }
}

// ============================================================================
// IMPLEMENTAÇÃO IN-MEMORY (FALLBACK PARA DEV, CI OU TESTES SEM POSTGRES)
// ============================================================================

export class InMemoryEmpresasRepository implements EmpresasRepository {
  private empresas: Map<string, Empresa> = new Map();
  private perfis: Map<string, PerfilTributario[]> = new Map();

  async listar(escritorioId: string = ESCRITORIO_PADRAO_ID): Promise<Empresa[]> {
    const lista: Empresa[] = [];
    for (const emp of this.empresas.values()) {
      if (!escritorioId || emp.escritorioId === escritorioId) {
        lista.push({ ...emp, perfis: this.perfis.get(emp.id) || [] });
      }
    }
    return lista.sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial));
  }

  async buscarPorId(id: string): Promise<Empresa | null> {
    const emp = this.empresas.get(id);
    if (!emp) return null;
    return { ...emp, perfis: this.perfis.get(id) || [] };
  }

  async buscarPorCnpj(cnpj: string): Promise<Empresa | null> {
    const clean = sanitizarCnpj(cnpj);
    for (const emp of this.empresas.values()) {
      if (emp.cnpj === clean) {
        return { ...emp, perfis: this.perfis.get(emp.id) || [] };
      }
    }
    return null;
  }

  async criar(input: EmpresaInput): Promise<Empresa> {
    const cleanCnpj = sanitizarCnpj(input.cnpj);
    const existente = await this.buscarPorCnpj(cleanCnpj);
    if (existente) {
      throw new Error(`CNPJ ${cleanCnpj} já cadastrado para a empresa ${existente.razaoSocial}`);
    }

    const agora = new Date().toISOString();
    const id = randomUUID();
    const empresa: Empresa = {
      id,
      escritorioId: input.escritorioId || ESCRITORIO_PADRAO_ID,
      cnpj: cleanCnpj,
      razaoSocial: input.razaoSocial,
      nomeFantasia: input.nomeFantasia || null,
      inscricaoEstadual: input.inscricaoEstadual || null,
      uf: input.uf || 'PR',
      municipioIbge: input.municipioIbge || null,
      ativo: input.ativo !== false,
      metadata: input.metadata || null,
      criadoEm: agora,
      atualizadoEm: agora,
      perfis: [],
    };

    this.empresas.set(id, empresa);
    this.perfis.set(id, []);

    if (input.perfilInicial) {
      const p = await this.adicionarPerfil(id, input.perfilInicial);
      empresa.perfis = [p];
    }

    return empresa;
  }

  async atualizar(id: string, dados: Partial<EmpresaInput>): Promise<Empresa | null> {
    const emp = this.empresas.get(id);
    if (!emp) return null;

    const agora = new Date().toISOString();
    if (dados.razaoSocial !== undefined) emp.razaoSocial = dados.razaoSocial;
    if (dados.nomeFantasia !== undefined) emp.nomeFantasia = dados.nomeFantasia;
    if (dados.inscricaoEstadual !== undefined) emp.inscricaoEstadual = dados.inscricaoEstadual;
    if (dados.uf !== undefined) emp.uf = dados.uf;
    if (dados.municipioIbge !== undefined) emp.municipioIbge = dados.municipioIbge;
    if (dados.ativo !== undefined) emp.ativo = dados.ativo;
    if (dados.metadata !== undefined) emp.metadata = dados.metadata;
    emp.atualizadoEm = agora;

    this.empresas.set(id, emp);
    return { ...emp, perfis: this.perfis.get(id) || [] };
  }

  async adicionarPerfil(empresaId: string, input: PerfilTributarioInput): Promise<PerfilTributario> {
    const emp = this.empresas.get(empresaId);
    if (!emp) throw new Error(`Empresa ${empresaId} não encontrada`);

    const lista = this.perfis.get(empresaId) || [];
    const validacao = validarSobreposicaoVigencias(
      lista,
      input,
      Boolean(input.encerrarAnteriorAutomaticamente)
    );

    if (!validacao.valido) {
      throw new Error(validacao.erro || 'Conflito de sobreposição temporal de vigência.');
    }

    if (validacao.perfisAjustados) {
      this.perfis.set(empresaId, validacao.perfisAjustados);
    }

    const agora = new Date().toISOString();
    const novoPerfil: PerfilTributario = {
      id: randomUUID(),
      empresaId,
      escritorioId: emp.escritorioId,
      regimeTributario: input.regimeTributario,
      vigenciaInicio: input.vigenciaInicio,
      vigenciaFim: input.vigenciaFim || null,
      aliquotasEfetivas: input.aliquotasEfetivas || {},
      simplesOptanteHibrido2027: Boolean(input.simplesOptanteHibrido2027),
      beneficiosParana: input.beneficiosParana || {
        diferimentoParcialArt28: true,
        optanteRotSt: false,
        reducoesBcAtivas: [],
      },
      reformaTributaria: input.reformaTributaria || {
        optanteSplitPayment2026: false,
        creditoPresumidoIbsCbs: false,
      },
      observacoes: input.observacoes,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    const atualizados = this.perfis.get(empresaId) || [];
    atualizados.push(novoPerfil);
    atualizados.sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio));
    this.perfis.set(empresaId, atualizados);

    return novoPerfil;
  }

  async listarPerfis(empresaId: string): Promise<PerfilTributario[]> {
    return [...(this.perfis.get(empresaId) || [])];
  }

  async buscarPerfilVigente(empresaId: string, dataISO: string): Promise<PerfilTributario | null> {
    const perfis = await this.listarPerfis(empresaId);
    return resolverPerfilVigenteNaData(perfis, dataISO);
  }

  limparParaTestes(): void {
    this.empresas.clear();
    this.perfis.clear();
  }
}

// ============================================================================
// HELPERS DE MAPEAMENTO SQL
// ============================================================================

function mapRowToEmpresa(row: Record<string, unknown>): Empresa {
  return {
    id: String(row.id),
    escritorioId: String(row.escritorio_id),
    cnpj: String(row.cnpj),
    razaoSocial: String(row.razao_social),
    nomeFantasia: row.nome_fantasia ? String(row.nome_fantasia) : null,
    inscricaoEstadual: row.inscricao_estadual ? String(row.inscricao_estadual) : null,
    uf: String(row.uf),
    municipioIbge: row.municipio_ibge ? String(row.municipio_ibge) : null,
    ativo: Boolean(row.ativo),
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> : null,
    criadoEm: row.criado_em instanceof Date ? row.criado_em.toISOString() : String(row.criado_em),
    atualizadoEm: row.atualizado_em instanceof Date ? row.atualizado_em.toISOString() : String(row.atualizado_em),
  };
}

function mapRowToPerfil(row: Record<string, unknown>): PerfilTributario {
  const aliquotas = row.aliquotas_efetivas
    ? typeof row.aliquotas_efetivas === 'string'
      ? JSON.parse(row.aliquotas_efetivas)
      : row.aliquotas_efetivas
    : {};
  const beneficios = row.beneficios_parana
    ? typeof row.beneficios_parana === 'string'
      ? JSON.parse(row.beneficios_parana)
      : row.beneficios_parana
    : {};
  const reforma = row.reforma_tributaria
    ? typeof row.reforma_tributaria === 'string'
      ? JSON.parse(row.reforma_tributaria)
      : row.reforma_tributaria
    : {};

  const vInicio = row.vigencia_inicio instanceof Date
    ? row.vigencia_inicio.toISOString().slice(0, 10)
    : String(row.vigencia_inicio).slice(0, 10);
  const vFim = row.vigencia_fim
    ? row.vigencia_fim instanceof Date
      ? row.vigencia_fim.toISOString().slice(0, 10)
      : String(row.vigencia_fim).slice(0, 10)
    : null;

  return {
    id: String(row.id),
    empresaId: String(row.empresa_id),
    escritorioId: String(row.escritorio_id),
    regimeTributario: row.regime_tributario as PerfilTributario['regimeTributario'],
    vigenciaInicio: vInicio,
    vigenciaFim: vFim,
    aliquotasEfetivas: aliquotas,
    simplesOptanteHibrido2027: Boolean(row.simples_optante_hibrido_2027),
    beneficiosParana: beneficios,
    reformaTributaria: reforma,
    observacoes: row.observacoes ? String(row.observacoes) : undefined,
    criadoEm: row.criado_em instanceof Date ? row.criado_em.toISOString() : String(row.criado_em),
    atualizadoEm: row.atualizado_em instanceof Date ? row.atualizado_em.toISOString() : String(row.atualizado_em),
  };
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let singletonRepo: EmpresasRepository | null = null;
let inMemoryInstance: InMemoryEmpresasRepository | null = null;

export function getEmpresasRepository(): EmpresasRepository {
  if (singletonRepo) return singletonRepo;

  if (isDatabaseConfigured()) {
    singletonRepo = new PostgresEmpresasRepository();
  } else {
    if (!inMemoryInstance) {
      inMemoryInstance = new InMemoryEmpresasRepository();
    }
    singletonRepo = inMemoryInstance;
  }

  return singletonRepo;
}

export function getInMemoryEmpresasRepositoryForTests(): InMemoryEmpresasRepository {
  if (!inMemoryInstance) {
    inMemoryInstance = new InMemoryEmpresasRepository();
  }
  return inMemoryInstance;
}
