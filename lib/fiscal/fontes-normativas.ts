/**
 * Catálogo Normativo Estruturado e Isomórfico (Cliente & Servidor)
 * Consolida referências oficiais do RICMS/PR, NPF SEFA/PR, Decretos PR,
 * Reforma Tributária (LC 214/2025, LC 227/2026), NT 2026.008, CGSN, CONFAZ e CPC 16.
 */

import type { NormativeCitation } from '@/components/ui/LegalCitationBlock';

export type AbaSistemaFontes = 'auditoria' | 'precificacao' | 'reforma';

export type CategoriaFonteNormativa =
  | 'ricms_pr'
  | 'efd_sefa_pr'
  | 'consulta_pr'
  | 'reforma_tributaria'
  | 'nfe_nt'
  | 'simples_nacional'
  | 'confaz_combustiveis'
  | 'contabilidade_custos';

export interface FonteNormativa extends NormativeCitation {
  categoria: CategoriaFonteNormativa;
  abas: AbaSistemaFontes[];
  diploma: string;
  vigencia: string;
}

export const CATALOGO_FONTES_NORMATIVAS: FonteNormativa[] = [
  {
    id: 'ricms-pr-art3-base-dupla',
    norma: 'RICMS/PR — Decreto Estadual nº 7.871/2017',
    diploma: 'Decreto PR nº 7.871/2017',
    artigo: 'Art. 3º e Art. 8º, § 12',
    ementa:
      'Disciplina a Base Dupla ("cálculo por dentro") na apuração do DIFAL de entrada interestadual destinada a uso, consumo ou ativo imobilizado no Paraná, excluindo o ICMS de origem e recompondo a base com a alíquota interna paranaense + FECOP.',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria', 'precificacao'],
    vigencia: 'Vigente',
  },
  {
    id: 'ricms-pr-art28-diferimento',
    norma: 'RICMS/PR — Decreto Estadual nº 7.871/2017',
    diploma: 'Decreto PR nº 7.871/2017',
    artigo: 'Art. 28, Anexo VIII',
    ementa:
      'Concede diferimento parcial de ICMS nas operações internas B2B entre contribuintes paranaenses com redução da carga tributária efetiva para 12%, postergando o saldo remanescente para etapa posterior.',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria', 'precificacao'],
    vigencia: 'Vigente',
  },
  {
    id: 'ricms-pr-art74-prazos',
    norma: 'RICMS/PR — Decreto Estadual nº 7.871/2017',
    diploma: 'Decreto PR nº 7.871/2017',
    artigo: 'Art. 74, XIX e § 16, II',
    ementa:
      'Define os prazos legais de recolhimento do DIFAL no Paraná: até o dia 12 do mês subsequente via GR-PR (código de receita 1015) para contribuinte inscrito no Regime Normal, e até o dia 20 do 2º mês subsequente para optantes do Simples Nacional (DeSTDA/GR-PR).',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria'],
    vigencia: 'Vigente',
  },
  {
    id: 'ricms-pr-art542-gnre',
    norma: 'RICMS/PR — Decreto Estadual nº 7.871/2017',
    diploma: 'Decreto PR nº 7.871/2017',
    artigo: 'Art. 542',
    ementa:
      'Exige o recolhimento antecipado do diferencial de alíquotas por operação via GNRE antes da saída da mercadoria (acompanhando o trânsito) quando o sujeito passivo não possuir inscrição regular no CAD/ICMS-PR.',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria'],
    vigencia: 'Vigente',
  },
  {
    id: 'ricms-pr-art545-gia-destda',
    norma: 'RICMS/PR — Decreto Estadual nº 7.871/2017',
    diploma: 'Decreto PR nº 7.871/2017',
    artigo: 'Art. 545',
    ementa:
      'Estabelece a obrigatoriedade de declaração e apuração do diferencial de alíquotas e ICMS-ST em GIA-ST (para substitutos inscritos em outra UF) e DeSTDA / SEDIF-SN (para microempresas e EPP do Simples Nacional).',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria'],
    vigencia: 'Vigente',
  },
  {
    id: 'npf-052-2018-efd',
    norma: 'Norma de Procedimento Fiscal NPF nº 052/2018 (CRE/SEFA-PR)',
    diploma: 'NPF SEFA/PR nº 052/2018',
    artigo: 'Registros E310, E316 e Códigos PR239999 / PR259999',
    ementa:
      'Padroniza os códigos de ajuste e apuração do DIFAL/FECOP na EFD ICMS/IPI do Estado do Paraná, vinculando os lançamentos dos registros E310/E316 aos códigos estaduais PR239999 e PR259999.',
    linkOficial: 'https://www.fazenda.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'efd_sefa_pr',
    abas: ['auditoria'],
    vigencia: 'Vigente',
  },
  {
    id: 'decreto-pr-6048-2024',
    norma: 'Decreto Estadual PR nº 6.048/2024',
    diploma: 'Decreto PR nº 6.048/2024',
    artigo: 'Anexo IX RICMS/PR — Exclusões de ST',
    ementa:
      'Promove a exclusão de segmentos de mercadorias do regime de Substituição Tributária no Paraná, vedando o creditamento ou repasse como substituído quando houver destaque indevido após a vigência.',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria', 'precificacao'],
    vigencia: 'Vigente desde 2024',
  },
  {
    id: 'decreto-pr-12828-2026',
    norma: 'Decreto Estadual PR nº 12.828/2026',
    diploma: 'Decreto PR nº 12.828/2026',
    artigo: 'Anexo IX RICMS/PR — Revogação Ampliada de ST',
    ementa:
      'Institui nova rodada de exclusão de itens da Substituição Tributária no Paraná (incluindo eletrônicos, celulares e materiais específicos), acionando trava preventiva de auditoria sobre XMLs com destaque indevido de ICMS-ST.',
    linkOficial: 'https://www.legislacao.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'vigente',
    categoria: 'ricms_pr',
    abas: ['auditoria', 'precificacao'],
    vigencia: 'Vigente 2026+',
  },
  {
    id: 'sefa-pr-consulta-48-2026',
    norma: 'Consulta de Contribuinte SEFA/PR nº 48/2026',
    diploma: 'Consulta SEFA/PR nº 48/2026',
    artigo: 'Setor Consultivo CRE/PR — Transição 2027',
    ementa:
      'Manifesta o entendimento do fisco paranaense pela inclusão de IBS, CBS e IS na base de cálculo do ICMS ("por dentro") durante a transição de 2027, confrontado pela tese jurídica de exclusão para não incidência de tributos federais/novos sobre a base estadual.',
    linkOficial: 'https://www.fazenda.pr.gov.br/',
    esfera: 'estadual-pr',
    statusVigencia: 'transicao',
    categoria: 'consulta_pr',
    abas: ['auditoria', 'precificacao', 'reforma'],
    vigencia: 'Transição 2026-2032',
  },
  {
    id: 'lc-214-2025',
    norma: 'Lei Complementar nº 214/2025 — Reforma Tributária do Consumo',
    diploma: 'LC nº 214/2025',
    artigo: 'Arts. 4º–15, 28, 47, 68–72 e 393+',
    ementa:
      'Institui o IBS, a CBS e o Imposto Seletivo (IS), definindo os códigos cClassTrib/CST, a não cumulatividade ampla e a apropriação de créditos condicionada à extinção financeira do débito (Split Payment).',
    linkOficial: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm',
    esfera: 'federal',
    statusVigencia: 'transicao',
    categoria: 'reforma_tributaria',
    abas: ['auditoria', 'precificacao', 'reforma'],
    vigencia: 'Transição 2026-2033',
  },
  {
    id: 'lc-227-2026',
    norma: 'Lei Complementar nº 227/2026 — Comitê Gestor do IBS (CG-IBS)',
    diploma: 'LC nº 227/2026',
    artigo: 'Estruturação do CG-IBS, Contencioso e Saldos Credores',
    ementa:
      'Regulamenta o Comitê Gestor do IBS (CG-IBS), a distribuição federativa da arrecadação, o ressarcimento e compensação de créditos acumulados de ICMS e o processo administrativo tributário unificado.',
    linkOficial: 'https://www.planalto.gov.br/',
    esfera: 'federal',
    statusVigencia: 'vigente',
    categoria: 'reforma_tributaria',
    abas: ['precificacao', 'reforma'],
    vigencia: 'Vigente 2026+',
  },
  {
    id: 'nt-2026-008-v101',
    norma: 'Nota Técnica NF-e 2026.008 v1.01 (Ato Conjunto RFB/CGIBS nº 10/2026)',
    diploma: 'NT 2026.008 v1.01',
    artigo: 'Grupos IBSCBS, gTribRegular e cClassTrib',
    ementa:
      'Define o leiaute XML oficial e as regras de validação de IBS, CBS e Imposto Seletivo na NF-e/NFC-e (modelo 55/65), em consonância com o Ato Conjunto RFB/CGIBS nº 10/2026.',
    linkOficial: 'https://www.nfe.fazenda.gov.br/',
    esfera: 'federal',
    statusVigencia: 'vigente',
    categoria: 'nfe_nt',
    abas: ['auditoria', 'precificacao', 'reforma'],
    vigencia: 'Vigente 2026+',
  },
  {
    id: 'cgsn-186-2026',
    norma: 'Resolução CGSN nº 186/2026',
    diploma: 'Resolução CGSN nº 186/2026',
    artigo: 'Regime Híbrido — Opção Semestral IBS/CBS',
    ementa:
      'Regulamenta a opção semestral das empresas do Simples Nacional pelo recolhimento regular de IBS e CBS fora do DAS (Simples Híbrido) a partir de 2027.',
    linkOficial: 'https://www8.receita.fazenda.gov.br/SimplesNacional/',
    esfera: 'federal',
    statusVigencia: 'transicao',
    categoria: 'simples_nacional',
    abas: ['precificacao', 'reforma'],
    vigencia: 'Transição 2027+',
  },
  {
    id: 'cgsn-194-2026',
    norma: 'Resolução CGSN nº 194/2026',
    diploma: 'Resolução CGSN nº 194/2026',
    artigo: 'Transferência de Créditos B2B e Expurgo do DAS',
    ementa:
      'Detalha os procedimentos operacionais de destaque, expurgo das parcelas no PGDAS-D e aproveitamento integral de créditos de IBS/CBS pelos adquirentes de optantes pelo Simples Híbrido.',
    linkOficial: 'https://www8.receita.fazenda.gov.br/SimplesNacional/',
    esfera: 'federal',
    statusVigencia: 'transicao',
    categoria: 'simples_nacional',
    abas: ['precificacao', 'reforma'],
    vigencia: 'Transição 2027+',
  },
  {
    id: 'convenios-icms-127-128-2026',
    norma: 'Convênios ICMS nº 127/2026 e nº 128/2026 (CONFAZ)',
    diploma: 'Convênios ICMS 127/2026 e 128/2026',
    artigo: 'Tributação Monofásica Ad Rem de Combustíveis (01/02/2027)',
    ementa:
      'Atualizam as alíquotas específicas (ad rem) nacionais para tributação monofásica do ICMS sobre Diesel/Biodiesel, Gasolina/EAC e GLP/GLGN com vigência a partir de 01/02/2027 (CST 61 / EFD PR012000).',
    linkOficial: 'https://www.confaz.fazenda.gov.br/',
    esfera: 'federal',
    statusVigencia: 'transicao',
    categoria: 'confaz_combustiveis',
    abas: ['precificacao', 'reforma'],
    vigencia: 'Vigência 01/02/2027',
  },
  {
    id: 'cpc-16-r1',
    norma: 'CPC 16 (R1) / NBC TG 16 — Valoração de Estoques',
    diploma: 'CPC 16 (R1)',
    artigo: 'Item 11',
    ementa:
      'O custo de aquisição dos estoques compreende o preço de compra, os tributos de importação e outros tributos não recuperáveis perante o fisco, além de frete, seguro e gastos diretamente atribuíveis.',
    esfera: 'federal',
    statusVigencia: 'vigente',
    categoria: 'contabilidade_custos',
    abas: ['auditoria', 'precificacao'],
    vigencia: 'Vigente',
  },
];

/**
 * Retorna as citações normativas filtradas para uma aba específica.
 */
export function obterFontesNormativasPorAba(aba: AbaSistemaFontes): NormativeCitation[] {
  return CATALOGO_FONTES_NORMATIVAS.filter((item) => item.abas.includes(aba));
}

/**
 * Retorna as normas específicas aplicáveis ao DIFAL, FECOP, EFD e GNRE no Paraná.
 */
export function obterFontesDifalPR(): NormativeCitation[] {
  const idsDifal = new Set([
    'ricms-pr-art3-base-dupla',
    'ricms-pr-art74-prazos',
    'ricms-pr-art542-gnre',
    'ricms-pr-art545-gia-destda',
    'npf-052-2018-efd',
    'decreto-pr-6048-2024',
    'decreto-pr-12828-2026',
    'sefa-pr-consulta-48-2026',
  ]);
  return CATALOGO_FONTES_NORMATIVAS.filter((item) => idsDifal.has(item.id));
}

/**
 * Localiza uma fonte normativa pelo identificador único.
 */
export function obterFonteNormativaPorId(id: string): FonteNormativa | undefined {
  return CATALOGO_FONTES_NORMATIVAS.find((item) => item.id === id);
}
