/**
 * Repositório Dual-Mode de Documentos Fiscais e Execuções Imutáveis
 * Analista Fiscal Portela Contabilidade
 */

import { randomUUID, createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { getDbPool, isDatabaseConfigured } from './client';
import { ESCRITORIO_PADRAO_ID } from './empresas-repository';

export class ErroDocumentoDuplicado extends Error {
  public readonly chaveAcesso: string;
  public readonly empresaId: string;

  constructor(chaveAcesso: string, empresaId: string) {
    super(`Documento fiscal com chave de acesso '${chaveAcesso}' já existe para a empresa ${empresaId}.`);
    this.name = 'ErroDocumentoDuplicado';
    this.chaveAcesso = chaveAcesso;
    this.empresaId = empresaId;
  }
}

export interface ItemDocumentoFiscalInput {
  numeroItem: number;
  codigoProduto: string;
  descricaoProduto: string;
  ncm: string;
  cest?: string | null;
  cfop: string;
  unidadeComercial: string;
  quantidadeComercial: number;
  valorUnitarioComercial: number;
  valorTotalBruto: number;
  valorDesconto?: number;
  valorFrete?: number;
  valorSeguro?: number;
  outrasDespesas?: number;

  origemMercadoria?: number;
  cstIcms?: string | null;
  csosnIcms?: string | null;
  baseCalculoIcms?: number;
  aliquotaIcms?: number;
  valorIcms?: number;

  baseCalculoIcmsSt?: number;
  aliquotaIcmsSt?: number;
  valorIcmsSt?: number;
  mvaAplicada?: number;

  cstPis?: string | null;
  valorPis?: number;
  cstCofins?: string | null;
  valorCofins?: number;

  cstIbs?: string | null;
  aliquotaIbs?: number;
  valorIbs?: number;
  cstCbs?: string | null;
  aliquotaCbs?: number;
  valorCbs?: number;

  creditoIcmsAdmissivel?: number;
  creditoPisAdmissivel?: number;
  creditoCofinsAdmissivel?: number;
  creditoIbsAdmissivel?: number;
  creditoCbsAdmissivel?: number;
  diagnosticoAuditoria?: Record<string, unknown> | null;
}

export interface DocumentoFiscalInput {
  escritorioId?: string;
  empresaId: string;
  chaveAcesso: string;
  numero: number;
  serie: string;
  modelo?: string;
  tipoOperacao: '0' | '1'; // 0=Entrada, 1=Saída
  dataEmissao: string; // ISO timestamp
  dataEntradaSaida?: string | null;

  emitenteCnpj: string;
  emitenteRazaoSocial: string;
  emitenteUf: string;
  emitenteIe?: string | null;

  destinatarioCnpj?: string | null;
  destinatarioRazaoSocial?: string | null;
  destinatarioUf?: string | null;
  destinatarioIe?: string | null;

  valorTotalProdutos: number;
  valorTotalNota: number;
  valorTotalIcms?: number;
  valorTotalIcmsSt?: number;
  valorTotalIbs?: number;
  valorTotalCbs?: number;

  xmlOriginal?: string; // string XML que será comprimida em gzip
  metadata?: Record<string, unknown>;
  itens?: ItemDocumentoFiscalInput[];
}

export interface DocumentoFiscalRegistro {
  id: string;
  escritorioId: string;
  empresaId: string;
  chaveAcesso: string;
  numero: number;
  serie: string;
  modelo: string;
  tipoOperacao: '0' | '1';
  dataEmissao: string;
  dataEntradaSaida?: string | null;
  emitenteCnpj: string;
  emitenteRazaoSocial: string;
  emitenteUf: string;
  destinatarioCnpj?: string | null;
  destinatarioRazaoSocial?: string | null;
  destinatarioUf?: string | null;
  valorTotalProdutos: number;
  valorTotalNota: number;
  valorTotalIcms: number;
  valorTotalIcmsSt: number;
  valorTotalIbs: number;
  valorTotalCbs: number;
  sha256Xml: string;
  xmlOriginalGzip?: Buffer | null;
  statusProcessamento: string;
  metadata?: Record<string, unknown> | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ExecucaoMotorInput {
  escritorioId?: string;
  empresaId?: string | null;
  documentoId?: string | null;
  itemDocumentoId?: string | null;
  motorTipo: string;
  versaoMotor: string;
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown> | null;
  sucesso: boolean;
  mensagemErro?: string | null;
  duracaoMs: number;
  iniciadoEm?: string;
}

export interface ExecucaoMotorRegistro extends ExecucaoMotorInput {
  id: string;
  concluidoEm: string;
}

export interface DocumentosRepository {
  salvarDocumento(input: DocumentoFiscalInput): Promise<DocumentoFiscalRegistro>;
  buscarPorChave(empresaId: string, chaveAcesso: string): Promise<DocumentoFiscalRegistro | null>;
  buscarXmlDescomprimido(documentoId: string): Promise<string | null>;
  listarPorEmpresa(empresaId: string, limite?: number): Promise<DocumentoFiscalRegistro[]>;
  registrarExecucaoMotor(input: ExecucaoMotorInput): Promise<ExecucaoMotorRegistro>;
  listarExecucoes(empresaId?: string, limite?: number): Promise<ExecucaoMotorRegistro[]>;
}

// ============================================================================
// IMPLEMENTAÇÃO POSTGRESQL 17
// ============================================================================

export class PostgresDocumentosRepository implements DocumentosRepository {
  async salvarDocumento(input: DocumentoFiscalInput): Promise<DocumentoFiscalRegistro> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const cleanChave = input.chaveAcesso.trim();
    const escritorioId = input.escritorioId || ESCRITORIO_PADRAO_ID;

    // Calcular hash SHA-256 e comprimir XML se fornecido
    let sha256 = '';
    let xmlGzip: Buffer | null = null;
    if (input.xmlOriginal) {
      sha256 = createHash('sha256').update(input.xmlOriginal).digest('hex');
      xmlGzip = zlib.gzipSync(Buffer.from(input.xmlOriginal, 'utf-8'));
    } else {
      sha256 = createHash('sha256').update(cleanChave).digest('hex');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Checar unicidade por empresa_id e chave_acesso
      const dupCheck = await client.query(
        'SELECT id FROM documentos_fiscais WHERE empresa_id = $1 AND chave_acesso = $2',
        [input.empresaId, cleanChave]
      );
      if (dupCheck.rows.length > 0) {
        throw new ErroDocumentoDuplicado(cleanChave, input.empresaId);
      }

      const docRes = await client.query(
        `INSERT INTO documentos_fiscais (
           escritorio_id, empresa_id, chave_acesso, numero, serie, modelo,
           tipo_operacao, data_emissao, data_entrada_saida,
           emitente_cnpj, emitente_razao_social, emitente_uf, emitente_ie,
           destinatario_cnpj, destinatario_razao_social, destinatario_uf, destinatario_ie,
           valor_total_produtos, valor_total_nota, valor_total_icms, valor_total_icms_st,
           valor_total_ibs, valor_total_cbs, xml_bruto_gzip, status_processamento,
           sha256_xml, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
         RETURNING id, escritorio_id, empresa_id, chave_acesso, numero, serie, modelo,
                   tipo_operacao, data_emissao, data_entrada_saida,
                   emitente_cnpj, emitente_razao_social, emitente_uf,
                   destinatario_cnpj, destinatario_razao_social, destinatario_uf,
                   valor_total_produtos, valor_total_nota, valor_total_icms, valor_total_icms_st,
                   valor_total_ibs, valor_total_cbs, sha256_xml, status_processamento,
                   metadata, criado_em, atualizado_em`,
        [
          escritorioId,
          input.empresaId,
          cleanChave,
          input.numero,
          input.serie,
          input.modelo || '55',
          input.tipoOperacao,
          input.dataEmissao,
          input.dataEntradaSaida || null,
          input.emitenteCnpj,
          input.emitenteRazaoSocial,
          input.emitenteUf,
          input.emitenteIe || null,
          input.destinatarioCnpj || null,
          input.destinatarioRazaoSocial || null,
          input.destinatarioUf || null,
          input.destinatarioIe || null,
          input.valorTotalProdutos,
          input.valorTotalNota,
          input.valorTotalIcms || 0,
          input.valorTotalIcmsSt || 0,
          input.valorTotalIbs || 0,
          input.valorTotalCbs || 0,
          xmlGzip,
          'PROCESSADO',
          sha256,
          JSON.stringify(input.metadata || {}),
        ]
      );

      const docId = docRes.rows[0].id;

      // Inserir itens vinculados
      if (input.itens && input.itens.length > 0) {
        for (const it of input.itens) {
          await client.query(
            `INSERT INTO itens_documentos_fiscais (
               documento_id, escritorio_id, empresa_id, numero_item,
               codigo_produto, descricao_produto, ncm, cest, cfop,
               unidade_comercial, quantidade_comercial, valor_unitario_comercial,
               valor_total_bruto, valor_desconto, valor_frete, valor_seguro, outras_despesas,
               origem_mercadoria, cst_icms, csosn_icms, base_calculo_icms, aliquota_icms, valor_icms,
               base_calculo_icms_st, aliquota_icms_st, valor_icms_st, mva_aplicada,
               cst_pis, valor_pis, cst_cofins, valor_cofins,
               cst_ibs, aliquota_ibs, valor_ibs, cst_cbs, aliquota_cbs, valor_cbs,
               credito_icms_admissivel, credito_pis_admissivel, credito_cofins_admissivel,
               credito_ibs_admissivel, credito_cbs_admissivel, diagnostico_auditoria
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43)`,
            [
              docId,
              escritorioId,
              input.empresaId,
              it.numeroItem,
              it.codigoProduto,
              it.descricaoProduto,
              it.ncm,
              it.cest || null,
              it.cfop,
              it.unidadeComercial,
              it.quantidadeComercial,
              it.valorUnitarioComercial,
              it.valorTotalBruto,
              it.valorDesconto || 0,
              it.valorFrete || 0,
              it.valorSeguro || 0,
              it.outrasDespesas || 0,
              it.origemMercadoria || 0,
              it.cstIcms || null,
              it.csosnIcms || null,
              it.baseCalculoIcms || 0,
              it.aliquotaIcms || 0,
              it.valorIcms || 0,
              it.baseCalculoIcmsSt || 0,
              it.aliquotaIcmsSt || 0,
              it.valorIcmsSt || 0,
              it.mvaAplicada || 0,
              it.cstPis || null,
              it.valorPis || 0,
              it.cstCofins || null,
              it.valorCofins || 0,
              it.cstIbs || null,
              it.aliquotaIbs || 0,
              it.valorIbs || 0,
              it.cstCbs || null,
              it.aliquotaCbs || 0,
              it.valorCbs || 0,
              it.creditoIcmsAdmissivel || 0,
              it.creditoPisAdmissivel || 0,
              it.creditoCofinsAdmissivel || 0,
              it.creditoIbsAdmissivel || 0,
              it.creditoCbsAdmissivel || 0,
              JSON.stringify(it.diagnosticoAuditoria || {}),
            ]
          );
        }
      }

      await client.query('COMMIT');
      return mapRowToDoc(docRes.rows[0]);
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new ErroDocumentoDuplicado(cleanChave, input.empresaId);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async buscarPorChave(empresaId: string, chaveAcesso: string): Promise<DocumentoFiscalRegistro | null> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const res = await pool.query(
      `SELECT id, escritorio_id, empresa_id, chave_acesso, numero, serie, modelo,
              tipo_operacao, data_emissao, data_entrada_saida,
              emitente_cnpj, emitente_razao_social, emitente_uf,
              destinatario_cnpj, destinatario_razao_social, destinatario_uf,
              valor_total_produtos, valor_total_nota, valor_total_icms, valor_total_icms_st,
              valor_total_ibs, valor_total_cbs, sha256_xml, status_processamento,
              metadata, criado_em, atualizado_em
       FROM documentos_fiscais
       WHERE empresa_id = $1 AND chave_acesso = $2`,
      [empresaId, chaveAcesso.trim()]
    );

    if (res.rows.length === 0) return null;
    return mapRowToDoc(res.rows[0]);
  }

  async buscarXmlDescomprimido(documentoId: string): Promise<string | null> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const res = await pool.query(
      'SELECT xml_bruto_gzip FROM documentos_fiscais WHERE id = $1',
      [documentoId]
    );

    if (res.rows.length === 0 || !res.rows[0].xml_bruto_gzip) return null;
    const buffer = res.rows[0].xml_bruto_gzip as Buffer;
    const decompressed = zlib.gunzipSync(buffer);
    return decompressed.toString('utf-8');
  }

  async listarPorEmpresa(empresaId: string, limite: number = 50): Promise<DocumentoFiscalRegistro[]> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const res = await pool.query(
      `SELECT id, escritorio_id, empresa_id, chave_acesso, numero, serie, modelo,
              tipo_operacao, data_emissao, data_entrada_saida,
              emitente_cnpj, emitente_razao_social, emitente_uf,
              destinatario_cnpj, destinatario_razao_social, destinatario_uf,
              valor_total_produtos, valor_total_nota, valor_total_icms, valor_total_icms_st,
              valor_total_ibs, valor_total_cbs, sha256_xml, status_processamento,
              metadata, criado_em, atualizado_em
       FROM documentos_fiscais
       WHERE empresa_id = $1
       ORDER BY data_emissao DESC
       LIMIT $2`,
      [empresaId, limite]
    );

    return res.rows.map(mapRowToDoc);
  }

  async registrarExecucaoMotor(input: ExecucaoMotorInput): Promise<ExecucaoMotorRegistro> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const escritorioId = input.escritorioId || ESCRITORIO_PADRAO_ID;
    const res = await pool.query(
      `INSERT INTO execucoes_motores (
         escritorio_id, empresa_id, documento_id, item_documento_id,
         motor_tipo, versao_motor, input_payload, output_payload,
         sucesso, mensagem_erro, duracao_ms, iniciado_em
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, now()))
       RETURNING id, escritorio_id, empresa_id, documento_id, item_documento_id,
                 motor_tipo, versao_motor, input_payload, output_payload,
                 sucesso, mensagem_erro, duracao_ms, iniciado_em, concluido_em`,
      [
        escritorioId,
        input.empresaId || null,
        input.documentoId || null,
        input.itemDocumentoId || null,
        input.motorTipo,
        input.versaoMotor,
        JSON.stringify(input.inputPayload || {}),
        input.outputPayload ? JSON.stringify(input.outputPayload) : null,
        input.sucesso,
        input.mensagemErro || null,
        input.duracaoMs,
        input.iniciadoEm || null,
      ]
    );

    return mapRowToExecucao(res.rows[0]);
  }

  async listarExecucoes(empresaId?: string, limite: number = 50): Promise<ExecucaoMotorRegistro[]> {
    const pool = getDbPool();
    if (!pool) throw new Error('Pool PostgreSQL não configurado');

    const params: (string | number)[] = [limite];
    let whereClause = '';
    if (empresaId) {
      params.unshift(empresaId);
      whereClause = 'WHERE empresa_id = $1';
    }

    const res = await pool.query(
      `SELECT id, escritorio_id, empresa_id, documento_id, item_documento_id,
              motor_tipo, versao_motor, input_payload, output_payload,
              sucesso, mensagem_erro, duracao_ms, iniciado_em, concluido_em
       FROM execucoes_motores
       ${whereClause}
       ORDER BY concluido_em DESC
       LIMIT $${params.length}`,
      params
    );

    return res.rows.map(mapRowToExecucao);
  }
}

// ============================================================================
// IMPLEMENTAÇÃO IN-MEMORY
// ============================================================================

export class InMemoryDocumentosRepository implements DocumentosRepository {
  private docs: Map<string, DocumentoFiscalRegistro> = new Map();
  private xmls: Map<string, Buffer> = new Map();
  private execucoes: ExecucaoMotorRegistro[] = [];

  async salvarDocumento(input: DocumentoFiscalInput): Promise<DocumentoFiscalRegistro> {
    const cleanChave = input.chaveAcesso.trim();

    // Validar duplicidade
    for (const d of this.docs.values()) {
      if (d.empresaId === input.empresaId && d.chaveAcesso === cleanChave) {
        throw new ErroDocumentoDuplicado(cleanChave, input.empresaId);
      }
    }

    const agora = new Date().toISOString();
    const id = randomUUID();

    let sha256 = '';
    let xmlGzip: Buffer | null = null;
    if (input.xmlOriginal) {
      sha256 = createHash('sha256').update(input.xmlOriginal).digest('hex');
      xmlGzip = zlib.gzipSync(Buffer.from(input.xmlOriginal, 'utf-8'));
      this.xmls.set(id, xmlGzip);
    } else {
      sha256 = createHash('sha256').update(cleanChave).digest('hex');
    }

    const doc: DocumentoFiscalRegistro = {
      id,
      escritorioId: input.escritorioId || ESCRITORIO_PADRAO_ID,
      empresaId: input.empresaId,
      chaveAcesso: cleanChave,
      numero: input.numero,
      serie: input.serie,
      modelo: input.modelo || '55',
      tipoOperacao: input.tipoOperacao,
      dataEmissao: input.dataEmissao,
      dataEntradaSaida: input.dataEntradaSaida || null,
      emitenteCnpj: input.emitenteCnpj,
      emitenteRazaoSocial: input.emitenteRazaoSocial,
      emitenteUf: input.emitenteUf,
      destinatarioCnpj: input.destinatarioCnpj || null,
      destinatarioRazaoSocial: input.destinatarioRazaoSocial || null,
      destinatarioUf: input.destinatarioUf || null,
      valorTotalProdutos: input.valorTotalProdutos,
      valorTotalNota: input.valorTotalNota,
      valorTotalIcms: input.valorTotalIcms || 0,
      valorTotalIcmsSt: input.valorTotalIcmsSt || 0,
      valorTotalIbs: input.valorTotalIbs || 0,
      valorTotalCbs: input.valorTotalCbs || 0,
      sha256Xml: sha256,
      statusProcessamento: 'PROCESSADO',
      metadata: input.metadata || null,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    this.docs.set(id, doc);
    return doc;
  }

  async buscarPorChave(empresaId: string, chaveAcesso: string): Promise<DocumentoFiscalRegistro | null> {
    const cleanChave = chaveAcesso.trim();
    for (const d of this.docs.values()) {
      if (d.empresaId === empresaId && d.chaveAcesso === cleanChave) {
        return d;
      }
    }
    return null;
  }

  async buscarXmlDescomprimido(documentoId: string): Promise<string | null> {
    const buf = this.xmls.get(documentoId);
    if (!buf) return null;
    const dec = zlib.gunzipSync(buf);
    return dec.toString('utf-8');
  }

  async listarPorEmpresa(empresaId: string, limite: number = 50): Promise<DocumentoFiscalRegistro[]> {
    const lista: DocumentoFiscalRegistro[] = [];
    for (const d of this.docs.values()) {
      if (d.empresaId === empresaId) {
        lista.push(d);
      }
    }
    return lista
      .sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao))
      .slice(0, limite);
  }

  async registrarExecucaoMotor(input: ExecucaoMotorInput): Promise<ExecucaoMotorRegistro> {
    const agora = new Date().toISOString();
    const reg: ExecucaoMotorRegistro = {
      ...input,
      id: randomUUID(),
      escritorioId: input.escritorioId || ESCRITORIO_PADRAO_ID,
      concluidoEm: agora,
    };
    this.execucoes.unshift(reg);
    return reg;
  }

  async listarExecucoes(empresaId?: string, limite: number = 50): Promise<ExecucaoMotorRegistro[]> {
    if (!empresaId) return this.execucoes.slice(0, limite);
    return this.execucoes.filter(e => e.empresaId === empresaId).slice(0, limite);
  }

  limparParaTestes(): void {
    this.docs.clear();
    this.xmls.clear();
    this.execucoes = [];
  }
}

// ============================================================================
// HELPERS DE MAPEAMENTO SQL
// ============================================================================

function mapRowToDoc(row: Record<string, unknown>): DocumentoFiscalRegistro {
  return {
    id: String(row.id),
    escritorioId: String(row.escritorio_id),
    empresaId: String(row.empresa_id),
    chaveAcesso: String(row.chave_acesso),
    numero: Number(row.numero),
    serie: String(row.serie),
    modelo: String(row.modelo),
    tipoOperacao: String(row.tipo_operacao) as '0' | '1',
    dataEmissao: row.data_emissao instanceof Date ? row.data_emissao.toISOString() : String(row.data_emissao),
    dataEntradaSaida: row.data_entrada_saida ? (row.data_entrada_saida instanceof Date ? row.data_entrada_saida.toISOString() : String(row.data_entrada_saida)) : null,
    emitenteCnpj: String(row.emitente_cnpj),
    emitenteRazaoSocial: String(row.emitente_razao_social),
    emitenteUf: String(row.emitente_uf),
    destinatarioCnpj: row.destinatario_cnpj ? String(row.destinatario_cnpj) : null,
    destinatarioRazaoSocial: row.destinatario_razao_social ? String(row.destinatario_razao_social) : null,
    destinatarioUf: row.destinatario_uf ? String(row.destinatario_uf) : null,
    valorTotalProdutos: Number(row.valor_total_produtos),
    valorTotalNota: Number(row.valor_total_nota),
    valorTotalIcms: Number(row.valor_total_icms || 0),
    valorTotalIcmsSt: Number(row.valor_total_icms_st || 0),
    valorTotalIbs: Number(row.valor_total_ibs || 0),
    valorTotalCbs: Number(row.valor_total_cbs || 0),
    sha256Xml: String(row.sha256_xml),
    statusProcessamento: String(row.status_processamento),
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> : null,
    criadoEm: row.criado_em instanceof Date ? row.criado_em.toISOString() : String(row.criado_em),
    atualizadoEm: row.atualizado_em instanceof Date ? row.atualizado_em.toISOString() : String(row.atualizado_em),
  };
}

function mapRowToExecucao(row: Record<string, unknown>): ExecucaoMotorRegistro {
  return {
    id: String(row.id),
    escritorioId: String(row.escritorio_id),
    empresaId: row.empresa_id ? String(row.empresa_id) : null,
    documentoId: row.documento_id ? String(row.documento_id) : null,
    itemDocumentoId: row.item_documento_id ? String(row.item_documento_id) : null,
    motorTipo: String(row.motor_tipo),
    versaoMotor: String(row.versao_motor),
    inputPayload: (typeof row.input_payload === 'string' ? JSON.parse(row.input_payload) : row.input_payload) as Record<string, unknown>,
    outputPayload: row.output_payload ? ((typeof row.output_payload === 'string' ? JSON.parse(row.output_payload) : row.output_payload) as Record<string, unknown>) : null,
    sucesso: Boolean(row.sucesso),
    mensagemErro: row.mensagem_erro ? String(row.mensagem_erro) : null,
    duracaoMs: Number(row.duracao_ms),
    iniciadoEm: row.iniciado_em instanceof Date ? row.iniciado_em.toISOString() : String(row.iniciado_em),
    concluidoEm: row.concluido_em instanceof Date ? row.concluido_em.toISOString() : String(row.concluido_em),
  };
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let singletonDocsRepo: DocumentosRepository | null = null;
let inMemoryDocsInstance: InMemoryDocumentosRepository | null = null;

export function getDocumentosRepository(): DocumentosRepository {
  if (singletonDocsRepo) return singletonDocsRepo;

  if (isDatabaseConfigured()) {
    singletonDocsRepo = new PostgresDocumentosRepository();
  } else {
    if (!inMemoryDocsInstance) {
      inMemoryDocsInstance = new InMemoryDocumentosRepository();
    }
    singletonDocsRepo = inMemoryDocsInstance;
  }

  return singletonDocsRepo;
}

export function getInMemoryDocumentosRepositoryForTests(): InMemoryDocumentosRepository {
  if (!inMemoryDocsInstance) {
    inMemoryDocsInstance = new InMemoryDocumentosRepository();
  }
  return inMemoryDocsInstance;
}
