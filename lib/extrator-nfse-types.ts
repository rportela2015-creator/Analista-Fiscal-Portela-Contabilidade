/**
 * Tipos Oficiais e Estruturados para Extração e Auditoria de NFS-e / DPS Padrão Nacional
 * Aderente aos Schemas da Receita Federal e ao gerador oficial DANFSe Go (calculadora-rtc-gerador-danfse)
 * Inspecionado em: internal/domain/models/models.go (NT 004, NT 007, NT 008 v1.02 e NT 009)
 */

export type TipoXmlFiscal =
  | 'NFE'
  | 'NFSE_NACIONAL'
  | 'DPS_NACIONAL'
  | 'DESCONHECIDO';

export interface EnderecoNfseNacional {
  xLgr?: string;
  nro?: string;
  xCpl?: string;
  xBairro?: string;
  cMun?: string;
  xMun?: string;
  uf?: string;
  cep?: string;
  cPais?: string;
  xCidade?: string;
}

export interface PrestadorNfseNacional {
  cnpj?: string;
  cpf?: string;
  nif?: string;
  im?: string;
  xNome?: string;
  xFant?: string;
  fone?: string;
  email?: string;
  regimeTributario?: {
    opSimpNac?: number;   // 1=Não Optante, 2=Optante - ME/EPP, 3=Optante - MEI
    regApTribSN?: number; // 1=Regime Geral, 2=Simples Nacional
    regEspTrib?: number;  // 0=Nenhum, 1=Ato Cooperado, etc.
  };
  endereco?: EnderecoNfseNacional;
}

export interface TomadorNfseNacional {
  cnpj?: string;
  cpf?: string;
  nif?: string;
  im?: string;
  xNome?: string;
  fone?: string;
  email?: string;
  endereco?: EnderecoNfseNacional;
}

export interface IntermediarioNfseNacional {
  cnpj?: string;
  cpf?: string;
  im?: string;
  xNome?: string;
}

export interface ServicoNfseNacional {
  cTribNac: string;
  cTribMun?: string;
  cNBS?: string;
  xDescServ: string;
  cLocPrestacao?: string;
  xLocPrestacao?: string;
  ufPrestacao?: string;
  obra?: {
    cObra?: string;
    inscImobFisc?: string;
  };
  subitemNovoFatoGeradorNt005?: '99.02' | '99.03' | '99.04' | null;
}

export interface ValoresNfseNacional {
  vServ: number;
  vDescIncond: number;
  vDescCond: number;
  vDedRed: number;
  vBC: number;
  pAliqAplic?: number;
  vISSQN: number;
  vRetIRRF: number;
  vRetCP: number;
  vRetCSLL: number;
  vPIS: number;
  vCOFINS: number;
  tpRetPisCofins?: number; // NT 007: 1=Retenção total, 2=Retenção parcial, 3=Não retido, etc.
  vLiq: number;
  vCalcBM?: number;
  tpBM?: number;
  vTotalRet?: number;
  vExclusoesReducoesBC?: number;
}

export interface ReformaTributariaNfse {
  presente: boolean;
  cst?: string;
  cClassTrib?: string;
  vBC?: number;
  pIBSUF?: number;
  vIBSUF?: number;
  pIBSMun?: number;
  vIBSMun?: number;
  vIBS?: number;
  pCBS?: number;
  vCBS?: number;
  pRedAliqIBS?: number;
  pRedAliqCBS?: number;
  cib?: string; // Cadastro Imobiliário Brasileiro (Art. 265 LC 214/2025)
  inscImobFisc?: string;
  gLocacao?: {
    cib?: string;
    nContrato?: string;
  };
  gUnidImob?: {
    cib?: string;
  };
}

export interface ExtracaoNfseNacional {
  tipoDocumento: 'NFSE_NACIONAL' | 'DPS_NACIONAL';
  sha256: string;
  versaoLayout?: string;
  versaoSchema?: string;
  identificacao: {
    chNFSe?: string;
    idDps?: string;
    nNFSe?: string;
    nDPS?: string;
    serie?: string;
    dhEmi: string;
    dCompet: string;
    ambGer?: string; // '1' Produção, '2' Homologação
    tpEmit?: number;
    verAplic?: string;
    temNt004: boolean; // Presença de grupos IBS/CBS
    temNt007: boolean; // Presença de tpRetPisCofins
    temNt008: boolean;
    temNt009: boolean; // Locação, CIB, gUnidImob, vAjusteBC
  };
  prestador: PrestadorNfseNacional;
  tomador?: TomadorNfseNacional;
  intermediario?: IntermediarioNfseNacional;
  servico: ServicoNfseNacional;
  valores: ValoresNfseNacional;
  reformaTributaria?: ReformaTributariaNfse;
  totaisTributos: {
    federais: number;
    estaduais: number;
    municipais: number;
    total: number;
  };
  rawXml: string;
}

export interface AlertaFiscalNfse {
  severidade: 'CRITICO' | 'ATENCAO' | 'INFO';
  codigo: string;
  titulo: string;
  detalhe: string;
  baseLegal?: string;
}

export interface ConciliacaoRtcNfse {
  executada: boolean;
  origem: 'OFICIAL_RFB' | 'FALLBACK_LOCAL_ESTIMADO' | 'NAO_APLICAVEL';
  divergenciaCentavos: boolean;
  vIbsXml: number;
  vIbsOficial: number;
  vCbsXml: number;
  vCbsOficial: number;
  detalhes?: string;
}

export interface ResultadoAuditoriaNfse {
  sucesso: boolean;
  extracao: ExtracaoNfseNacional;
  validoParaEmissao: boolean;
  alertas: AlertaFiscalNfse[];
  conciliacaoRtc?: ConciliacaoRtcNfse;
  creditosTomador?: {
    pisCofinsLucroReal: {
      admitido: boolean;
      valorPis: number;
      valorCofins: number;
      justificativa: string;
    };
    ibsCbsReforma: {
      admitido: boolean;
      valorIbs: number;
      valorCbs: number;
      statusExtincao: string;
      retidoAguardandoExtincao: boolean;
      justificativa: string;
    };
  };
}
