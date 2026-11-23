-- ==============================================================================
-- Schema Fiscal Multi-Tenant Portela Contabilidade (PostgreSQL 17 / Supabase)
-- 15 Tabelas Operacionais e Bitemporais para Auditoria e Motores RTC
-- Governança: Sub-etapa 19.4 (Passo 4 de 7 do Ciclo 6)
-- ==============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Escritórios Contábeis (Tenant Raiz)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escritorios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(14),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Idempotente: Escritório Padrão Contabilidade Portela
INSERT INTO escritorios (id, nome, ativo)
VALUES ('00000000-0000-4000-8000-000000000001', 'Contabilidade Portela', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. Empresas Clientes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
    cnpj VARCHAR(14) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    ie VARCHAR(30),
    im VARCHAR(30),
    uf CHAR(2) NOT NULL,
    codigo_municipio_ibge VARCHAR(7),
    cnae_principal VARCHAR(10),
    cnaes_secundarios JSONB NOT NULL DEFAULT '[]'::jsonb,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_empresas_escritorio_cnpj UNIQUE (escritorio_id, cnpj)
);

-- ------------------------------------------------------------------------------
-- 3. Perfis Tributários Bitemporais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfis_tributarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    vigencia_inicio DATE NOT NULL,
    vigencia_fim DATE NULL,
    regime_federal VARCHAR(30) NOT NULL CHECK (regime_federal IN ('LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', 'MEI')),
    crt SMALLINT NOT NULL CHECK (crt BETWEEN 1 AND 4),
    opcao_simples_hibrido BOOLEAN NOT NULL DEFAULT false,
    rbt12 NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    rba NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    fator_r NUMERIC(8,6) NOT NULL DEFAULT 0.000000,
    impedimento_sublimite BOOLEAN NOT NULL DEFAULT false,
    anexo_padrao VARCHAR(16),
    c_ativ_sn_padrao VARCHAR(32),
    aliquotas_efetivas_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    incluir_ibs_cbs_bc_icms BOOLEAN NOT NULL DEFAULT true,
    adesao_rot_st BOOLEAN NOT NULL DEFAULT false,
    eh_industria BOOLEAN NOT NULL DEFAULT false,
    regime_especial_atacadista_pr BOOLEAN NOT NULL DEFAULT false,
    observacoes TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfis_empresa_vigencia ON perfis_tributarios (empresa_id, vigencia_inicio, vigencia_fim);

-- ------------------------------------------------------------------------------
-- 4. Documentos Fiscais (Imutáveis por chave_acesso)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos_fiscais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    modelo VARCHAR(10) NOT NULL,
    chave_acesso VARCHAR(60) NOT NULL,
    tipo_operacao VARCHAR(20) NOT NULL DEFAULT 'ENTRADA',
    data_emissao DATE,
    data_entrada DATE,
    emitente_cnpj VARCHAR(14),
    emitente_uf CHAR(2),
    emitente_crt SMALLINT,
    destinatario_cnpj VARCHAR(14),
    destinatario_uf CHAR(2),
    valor_total_nota NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    leiaute_versao VARCHAR(20),
    sha256_xml CHAR(64) NOT NULL,
    xml_original_gzip BYTEA,
    status_auditoria VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_documentos_empresa_chave UNIQUE (empresa_id, chave_acesso)
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa_chave ON documentos_fiscais (empresa_id, chave_acesso);

-- ------------------------------------------------------------------------------
-- 5. Itens dos Documentos Fiscais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itens_documentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    documento_id UUID NOT NULL REFERENCES documentos_fiscais(id) ON DELETE CASCADE,
    n_item INT NOT NULL,
    c_prod VARCHAR(60),
    x_prod TEXT NOT NULL,
    ncm VARCHAR(8),
    nbs VARCHAR(9),
    cest VARCHAR(7),
    cfop VARCHAR(4) NOT NULL,
    orig CHAR(1),
    cst_csosn VARCHAR(4),
    c_class_trib VARCHAR(6),
    quantidade NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
    unidade VARCHAR(10),
    v_prod NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_frete NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_seg NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_desc NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_outro NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT uq_itens_documento_nitem UNIQUE (documento_id, n_item)
);

CREATE INDEX IF NOT EXISTS idx_itens_documento_id ON itens_documentos (documento_id);

-- ------------------------------------------------------------------------------
-- 6. Tributos dos Documentos Fiscais (Camada 1 Imutável do XML)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tributos_documentos (
    item_id UUID PRIMARY KEY REFERENCES itens_documentos(id) ON DELETE CASCADE,
    v_bc_icms NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    p_icms NUMERIC(18,6) NOT NULL DEFAULT 0.000000,
    v_icms NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_bc_st NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_icms_st NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_fcp_st NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_bc_st_ret NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_ipi NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_pis NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_cofins NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_ibs NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_cbs NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    v_is NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    p_cred_sn NUMERIC(18,6) NOT NULL DEFAULT 0.000000,
    v_cred_icms_sn NUMERIC(18,2) NOT NULL DEFAULT 0.00
);

-- ------------------------------------------------------------------------------
-- 7. Produtos (Catálogo por Empresa)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    c_prod VARCHAR(60) NOT NULL,
    descricao TEXT NOT NULL,
    ncm_atual VARCHAR(8),
    cest_atual VARCHAR(7),
    c_class_trib_atual VARCHAR(6),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_produtos_empresa_cprod UNIQUE (empresa_id, c_prod)
);

-- ------------------------------------------------------------------------------
-- 8. Histórico de Classificações Fiscais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classificacoes_fiscais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
    ncm VARCHAR(8) NOT NULL,
    cest VARCHAR(7),
    c_class_trib VARCHAR(6),
    origem VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    fundamentacao TEXT,
    confianca NUMERIC(5,2),
    data_classificacao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 9. Análises e Auditorias Fiscais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analises_fiscais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    documento_id UUID NOT NULL REFERENCES documentos_fiscais(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    resultado_auditoria_json JSONB NOT NULL,
    total_difal NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_fecop NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_st_indevida NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_creditos_admitidos NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    total_creditos_efetivados NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    alertas_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    auditado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 10. Créditos Tributários Tripartidos
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creditos_tributarios (
    item_id UUID PRIMARY KEY REFERENCES itens_documentos(id) ON DELETE CASCADE,
    destacado_json JSONB NOT NULL,
    admitido_json JSONB NOT NULL,
    efetivado_custo_json JSONB NOT NULL,
    status_extincao_rtc VARCHAR(30) NOT NULL DEFAULT 'EXTINTO',
    regra_aplicada TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 11. Custos de Aquisição (CMV Líquido CPC 16 / NBC TG 16)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custos_aquisicao (
    item_id UUID PRIMARY KEY REFERENCES itens_documentos(id) ON DELETE CASCADE,
    valor_aquisicao_bruto NUMERIC(18,2) NOT NULL,
    deducoes_creditos NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    acrescimos_tributarios NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    cmv_liquido_cpc16 NUMERIC(18,2) NOT NULL,
    regime_apuracao VARCHAR(30) NOT NULL,
    calculado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 12. Simulações Tributárias (Cenários 2026/2027)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS simulacoes_tributarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    ano_cenario INT NOT NULL,
    cenario_nome VARCHAR(100) NOT NULL,
    comparativo_regimes_json JSONB NOT NULL,
    regime_recomendado VARCHAR(30),
    economia_estimada NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 13. Precificações e Margens
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS precificacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cmv_base NUMERIC(18,2) NOT NULL,
    margem_lucro NUMERIC(8,4) NOT NULL,
    mark_up_divisor NUMERIC(8,4) NOT NULL,
    preco_venda_sugerido NUMERIC(18,2) NOT NULL,
    inclui_ibs_cbs_bc_icms BOOLEAN NOT NULL DEFAULT true,
    calculado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 14. Versões de Regras e Bases SQLite Oficiais
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS versoes_regras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    motor VARCHAR(50) NOT NULL,
    versao_app VARCHAR(50) NOT NULL,
    versao_db_sqlite VARCHAR(50) NOT NULL,
    sha256_db CHAR(64),
    registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_versoes_motor_app_db UNIQUE (motor, versao_app, versao_db_sqlite)
);

-- ------------------------------------------------------------------------------
-- 15. Execuções de Motores Oficiais (Auditoria Forense Imutável)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS execucoes_motores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escritorio_id UUID NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    documento_id UUID REFERENCES documentos_fiscais(id) ON DELETE SET NULL,
    perfil_tributario_id UUID REFERENCES perfis_tributarios(id) ON DELETE SET NULL,
    motor_chamado VARCHAR(50) NOT NULL,
    origem_calculo VARCHAR(50) NOT NULL,
    payload_enviado_json JSONB,
    resposta_bruta_json JSONB,
    erros_json JSONB,
    duracao_ms INT NOT NULL DEFAULT 0,
    versao_regra_id UUID REFERENCES versoes_regras(id) ON DELETE SET NULL,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execucoes_empresa_data ON execucoes_motores (empresa_id, executado_em DESC);
