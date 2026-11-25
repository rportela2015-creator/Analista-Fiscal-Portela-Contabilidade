/**
 * Consulta e Normalização Oficial de CNPJ na Base Pública da Receita Federal
 * Cadeia com fallback automático: BrasilAPI -> CNPJ.ws -> ReceitaWS.
 * Módulo isomórfico (zero dependências de node:*).
 */

import {
  sanitizarCnpj,
  validarCnpj,
  formatarCnpj,
  type RegimeTributario,
} from './perfil-tributario';

export interface CnaeItem {
  codigo: string;
  descricao: string;
}

export interface EnderecoCnpjReceita {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cep: string;
  municipio: string;
  municipioIbge?: string;
  uf: string;
}

export interface OpcaoRegimeSimples {
  optanteSimples: boolean;
  dataOpcaoSimples?: string | null;
  dataExclusaoSimples?: string | null;
  optanteMei: boolean;
  dataOpcaoMei?: string | null;
  dataExclusaoMei?: string | null;
}

export interface DadosCnpjReceita {
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  dataSituacaoCadastral?: string;
  dataInicioAtividade?: string;
  naturezaJuridica: string;
  porte: string;
  capitalSocial?: number;
  endereco: EnderecoCnpjReceita;
  telefone?: string;
  email?: string;
  cnaePrincipal: CnaeItem;
  cnaesSecundarios: CnaeItem[];
  simplesNacional: OpcaoRegimeSimples;
  regimeTributarioSugerido: RegimeTributario;
  fonte: 'brasilapi' | 'cnpjws' | 'receitaws';
  consultadoEm: string;
}

export interface ResultadoConsultaCnpj {
  sucesso: boolean;
  dados?: DadosCnpjReceita;
  erro?: string;
  tentativas?: Array<{ fonte: string; erro: string }>;
}

function normalizarCodigoCnae(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(7, '0');
}

function limparIbge(raw: unknown): string | undefined {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 7 ? digits : undefined;
}

/**
 * Sugere automaticamente o regime tributário com base em Simples Nacional, MEI e Natureza Jurídica.
 */
export function inferirRegimeTributarioSugerido(params: {
  optanteMei?: boolean | null;
  optanteSimples?: boolean | null;
  naturezaJuridica?: string | null;
}): RegimeTributario {
  if (params.optanteMei === true) return 'MEI';
  if (params.optanteSimples === true) return 'SIMPLES_NACIONAL';

  const nat = String(params.naturezaJuridica || '').toUpperCase();
  if (
    nat.includes('204-6') ||
    nat.includes('205-4') ||
    nat.includes('2046') ||
    nat.includes('2054') ||
    nat.includes('SOCIEDADE ANONIMA') ||
    nat.includes('SOCIEDADE ANÔNIMA') ||
    nat.includes('BANCO') ||
    nat.includes('INSTITUICAO FINANCEIRA') ||
    nat.includes('INSTITUIÇÃO FINANCEIRA')
  ) {
    return 'LUCRO_REAL';
  }

  return 'LUCRO_PRESUMIDO';
}

export function normalizarBrasilApi(raw: any): DadosCnpjReceita {
  const cnpj = sanitizarCnpj(String(raw?.cnpj || ''));
  const optanteSimples = Boolean(raw?.opcao_pelo_simples);
  const optanteMei = Boolean(raw?.opcao_pelo_mei);
  const naturezaJuridica = String(raw?.natureza_juridica || '').trim();

  const cnaesSecundarios: CnaeItem[] = Array.isArray(raw?.cnaes_secundarios)
    ? raw.cnaes_secundarios
        .filter((c: any) => c && (c.codigo || c.descricao))
        .map((c: any) => ({
          codigo: normalizarCodigoCnae(c.codigo),
          descricao: String(c.descricao || '').trim(),
        }))
    : [];

  return {
    cnpj,
    cnpjFormatado: formatarCnpj(cnpj),
    razaoSocial: String(raw?.razao_social || '').trim(),
    nomeFantasia: String(raw?.nome_fantasia || '').trim(),
    situacaoCadastral: String(raw?.descricao_situacao_cadastral || raw?.situacao_cadastral || 'DESCONHECIDA').trim(),
    dataSituacaoCadastral: raw?.data_situacao_cadastral ? String(raw.data_situacao_cadastral) : undefined,
    dataInicioAtividade: raw?.data_inicio_atividade ? String(raw.data_inicio_atividade) : undefined,
    naturezaJuridica,
    porte: String(raw?.porte || raw?.descricao_porte || '').trim(),
    capitalSocial: typeof raw?.capital_social === 'number' ? raw.capital_social : undefined,
    endereco: {
      logradouro: [raw?.descricao_tipo_de_logradouro, raw?.logradouro].filter(Boolean).join(' ').trim(),
      numero: String(raw?.numero || '').trim(),
      complemento: raw?.complemento ? String(raw.complemento).trim() : undefined,
      bairro: String(raw?.bairro || '').trim(),
      cep: String(raw?.cep || '').replace(/\D/g, ''),
      municipio: String(raw?.municipio || '').trim(),
      municipioIbge: limparIbge(raw?.codigo_municipio_ibge),
      uf: String(raw?.uf || 'PR').trim().toUpperCase(),
    },
    telefone: raw?.ddd_telefone_1 ? String(raw.ddd_telefone_1).trim() : undefined,
    email: raw?.email ? String(raw.email).trim() : undefined,
    cnaePrincipal: {
      codigo: normalizarCodigoCnae(raw?.cnae_fiscal),
      descricao: String(raw?.cnae_fiscal_descricao || '').trim(),
    },
    cnaesSecundarios,
    simplesNacional: {
      optanteSimples,
      dataOpcaoSimples: raw?.data_opcao_pelo_simples || null,
      dataExclusaoSimples: raw?.data_exclusao_do_simples || null,
      optanteMei,
      dataOpcaoMei: raw?.data_opcao_pelo_mei || null,
      dataExclusaoMei: raw?.data_exclusao_do_mei || null,
    },
    regimeTributarioSugerido: inferirRegimeTributarioSugerido({
      optanteMei,
      optanteSimples,
      naturezaJuridica,
    }),
    fonte: 'brasilapi',
    consultadoEm: new Date().toISOString(),
  };
}

export function normalizarCnpjWs(raw: any): DadosCnpjReceita {
  const est = raw?.estabelecimento || {};
  const cnpj = sanitizarCnpj(String(est?.cnpj || raw?.cnpj_raiz || ''));
  const simplesRaw = raw?.simples || {};
  const optanteSimples = String(simplesRaw?.simples || '').toLowerCase() === 'sim' || simplesRaw?.simples === true;
  const optanteMei = String(simplesRaw?.mei || '').toLowerCase() === 'sim' || simplesRaw?.mei === true;
  const naturezaJuridica = String(raw?.natureza_juridica?.descricao || raw?.natureza_juridica?.id || '').trim();

  const cnaePrincipalObj = est?.atividade_principal || {};
  const cnaesSecundarios: CnaeItem[] = Array.isArray(est?.atividades_secundarias)
    ? est.atividades_secundarias.map((c: any) => ({
        codigo: normalizarCodigoCnae(c?.id || c?.subclasse),
        descricao: String(c?.descricao || '').trim(),
      }))
    : [];

  return {
    cnpj,
    cnpjFormatado: formatarCnpj(cnpj),
    razaoSocial: String(raw?.razao_social || '').trim(),
    nomeFantasia: String(est?.nome_fantasia || '').trim(),
    situacaoCadastral: String(est?.situacao_cadastral || 'DESCONHECIDA').trim(),
    dataSituacaoCadastral: est?.data_situacao_cadastral ? String(est.data_situacao_cadastral) : undefined,
    dataInicioAtividade: est?.data_inicio_atividade ? String(est.data_inicio_atividade) : undefined,
    naturezaJuridica,
    porte: String(raw?.porte?.descricao || '').trim(),
    capitalSocial: raw?.capital_social ? Number(raw.capital_social) : undefined,
    endereco: {
      logradouro: [est?.tipo_logradouro, est?.logradouro].filter(Boolean).join(' ').trim(),
      numero: String(est?.numero || '').trim(),
      complemento: est?.complemento ? String(est.complemento).trim() : undefined,
      bairro: String(est?.bairro || '').trim(),
      cep: String(est?.cep || '').replace(/\D/g, ''),
      municipio: String(est?.cidade?.nome || '').trim(),
      municipioIbge: limparIbge(est?.cidade?.ibge_id),
      uf: String(est?.estado?.sigla || 'PR').trim().toUpperCase(),
    },
    telefone: est?.telefone1 ? `${est?.ddd1 || ''}${est.telefone1}`.trim() : undefined,
    email: est?.email ? String(est.email).trim() : undefined,
    cnaePrincipal: {
      codigo: normalizarCodigoCnae(cnaePrincipalObj?.id || cnaePrincipalObj?.subclasse),
      descricao: String(cnaePrincipalObj?.descricao || '').trim(),
    },
    cnaesSecundarios,
    simplesNacional: {
      optanteSimples,
      dataOpcaoSimples: simplesRaw?.data_opcao_simples || null,
      dataExclusaoSimples: simplesRaw?.data_exclusao_simples || null,
      optanteMei,
      dataOpcaoMei: simplesRaw?.data_opcao_mei || null,
      dataExclusaoMei: simplesRaw?.data_exclusao_mei || null,
    },
    regimeTributarioSugerido: inferirRegimeTributarioSugerido({
      optanteMei,
      optanteSimples,
      naturezaJuridica,
    }),
    fonte: 'cnpjws',
    consultadoEm: new Date().toISOString(),
  };
}

export function normalizarReceitaWs(raw: any): DadosCnpjReceita {
  const cnpj = sanitizarCnpj(String(raw?.cnpj || ''));
  const optanteSimples = Boolean(raw?.simples?.optante);
  const optanteMei = Boolean(raw?.simei?.optante);
  const naturezaJuridica = String(raw?.natureza_juridica || '').trim();

  const principalRaw = Array.isArray(raw?.atividade_principal) ? raw.atividade_principal[0] : raw?.atividade_principal;
  const cnaesSecundarios: CnaeItem[] = Array.isArray(raw?.atividades_secundarias)
    ? raw.atividades_secundarias
        .filter((c: any) => c && c.code && !String(c.code).startsWith('00'))
        .map((c: any) => ({
          codigo: normalizarCodigoCnae(c.code),
          descricao: String(c.text || '').trim(),
        }))
    : [];

  return {
    cnpj,
    cnpjFormatado: formatarCnpj(cnpj),
    razaoSocial: String(raw?.nome || '').trim(),
    nomeFantasia: String(raw?.fantasia || '').trim(),
    situacaoCadastral: String(raw?.situacao || 'DESCONHECIDA').trim(),
    dataSituacaoCadastral: raw?.data_situacao ? String(raw.data_situacao) : undefined,
    dataInicioAtividade: raw?.abertura ? String(raw.abertura) : undefined,
    naturezaJuridica,
    porte: String(raw?.porte || '').trim(),
    capitalSocial: raw?.capital_social ? Number(raw.capital_social) : undefined,
    endereco: {
      logradouro: String(raw?.logradouro || '').trim(),
      numero: String(raw?.numero || '').trim(),
      complemento: raw?.complemento ? String(raw.complemento).trim() : undefined,
      bairro: String(raw?.bairro || '').trim(),
      cep: String(raw?.cep || '').replace(/\D/g, ''),
      municipio: String(raw?.municipio || '').trim(),
      municipioIbge: undefined,
      uf: String(raw?.uf || 'PR').trim().toUpperCase(),
    },
    telefone: raw?.telefone ? String(raw.telefone).trim() : undefined,
    email: raw?.email ? String(raw.email).trim() : undefined,
    cnaePrincipal: {
      codigo: normalizarCodigoCnae(principalRaw?.code),
      descricao: String(principalRaw?.text || '').trim(),
    },
    cnaesSecundarios,
    simplesNacional: {
      optanteSimples,
      dataOpcaoSimples: raw?.simples?.data_opcao || null,
      dataExclusaoSimples: raw?.simples?.data_exclusao || null,
      optanteMei,
      dataOpcaoMei: raw?.simei?.data_opcao || null,
      dataExclusaoMei: raw?.simei?.data_exclusao || null,
    },
    regimeTributarioSugerido: inferirRegimeTributarioSugerido({
      optanteMei,
      optanteSimples,
      naturezaJuridica,
    }),
    fonte: 'receitaws',
    consultadoEm: new Date().toISOString(),
  };
}

async function fetchJsonComTimeout(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AnalistaFiscalPortela/7.1',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta o CNPJ na base pública da Receita Federal via BrasilAPI,
 * com fallback automático para CNPJ.ws e ReceitaWS.
 */
export async function consultarCnpjOficial(
  cnpjRaw: string,
  options?: { fetchFn?: typeof fetch; timeoutMs?: number }
): Promise<ResultadoConsultaCnpj> {
  const cnpj = sanitizarCnpj(cnpjRaw);
  if (!validarCnpj(cnpj)) {
    return {
      sucesso: false,
      erro: 'CNPJ inválido. Informe 14 dígitos com dígitos verificadores válidos.',
    };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 6000;
  const tentativas: Array<{ fonte: string; erro: string }> = [];

  // 1. BrasilAPI
  try {
    const resp = await fetchJsonComTimeout(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      fetchFn,
      timeoutMs
    );
    if (resp.ok && resp.data && resp.data.razao_social) {
      return {
        sucesso: true,
        dados: normalizarBrasilApi(resp.data),
        tentativas,
      };
    }
    tentativas.push({
      fonte: 'brasilapi',
      erro: resp.data?.message || `HTTP ${resp.status}`,
    });
  } catch (err) {
    tentativas.push({
      fonte: 'brasilapi',
      erro: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. CNPJ.ws
  try {
    const resp = await fetchJsonComTimeout(
      `https://publica.cnpj.ws/cnpj/${cnpj}`,
      fetchFn,
      timeoutMs
    );
    if (resp.ok && resp.data && resp.data.razao_social) {
      return {
        sucesso: true,
        dados: normalizarCnpjWs(resp.data),
        tentativas,
      };
    }
    tentativas.push({
      fonte: 'cnpjws',
      erro: resp.data?.detalhes || resp.data?.titulo || `HTTP ${resp.status}`,
    });
  } catch (err) {
    tentativas.push({
      fonte: 'cnpjws',
      erro: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. ReceitaWS
  try {
    const resp = await fetchJsonComTimeout(
      `https://receitaws.com.br/v1/cnpj/${cnpj}`,
      fetchFn,
      timeoutMs
    );
    if (resp.ok && resp.data && resp.data.status !== 'ERROR' && resp.data.nome) {
      return {
        sucesso: true,
        dados: normalizarReceitaWs(resp.data),
        tentativas,
      };
    }
    tentativas.push({
      fonte: 'receitaws',
      erro: resp.data?.message || `HTTP ${resp.status}`,
    });
  } catch (err) {
    tentativas.push({
      fonte: 'receitaws',
      erro: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    sucesso: false,
    erro: 'Não foi possível obter os dados do CNPJ nos provedores públicos da Receita Federal (BrasilAPI, CNPJ.ws e ReceitaWS).',
    tentativas,
  };
}
