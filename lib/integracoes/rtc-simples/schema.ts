import { z } from 'zod';

/**
 * Schemas Zod para o microsserviço oficial da Receita Federal: Calculadora RTC - Simples Nacional
 * Inspecionado em: F:\Workspace\Apps\_inspecao_rfb_rtc\calculadora-rtc-simples-nacional
 */

export const ParAliquotasInputSchema = z.object({
  pCBSSN: z.string().optional().nullable(),
  pIBSSN: z.string().optional().nullable(),
});

export const AnexoComIssInputSchema = z.object({
  pCBSSN: z.string().optional().nullable(),
  pIBSSN: z.string().optional().nullable(),
  semRedistribuicaoISS: ParAliquotasInputSchema.optional().nullable(),
});

export const AliquotasEfetivasInputSchema = z.object({
  fatorR: z.boolean().optional().nullable(),
  impedimentoSublimite: z.boolean().optional().nullable(),
  anexoI: ParAliquotasInputSchema.optional().nullable(),
  anexoII: ParAliquotasInputSchema.optional().nullable(),
  anexoIII: AnexoComIssInputSchema.optional().nullable(),
  anexoIV: AnexoComIssInputSchema.optional().nullable(),
  anexoV: AnexoComIssInputSchema.optional().nullable(),
});

export const ItemSimplesUnificadoInputSchema = z.object({
  numero: z.number().int().min(1),
  cAtivSN: z.string().optional().nullable(), // Ex: "12", "01"
  cClassTrib: z.string().regex(/^\d{6}$/, 'cClassTrib deve ter 6 dígitos'),
  nbs: z.string().optional().nullable(),
  ncm: z.string().optional().nullable(),
  baseCalculo: z.string().min(1, 'Base de cálculo obrigatória em formato texto 13v2'),
  valorImpostoSeletivo: z.string().optional().default('0.00'),
  tribISSQN: z.string().optional().nullable(),
  tpRetISSQN: z.string().optional().nullable(),
  tpBM: z.string().optional().nullable(),
});

export const OperacaoSimplesNaoAssistidaInputSchema = z.object({
  id: z.string().min(1, 'Identificador da operação obrigatório'),
  versao: z.string().default('3.0.0'),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do fato gerador deve ser YYYY-MM-DD'),
  tpDoc: z.string().default('55'), // 55 = NF-e, 65 = NFC-e, 91 = NFS-e
  CRT: z.string().optional().nullable(), // 1=Simples, 2=Excesso sublimite, 3=Normal, 4=MEI
  tpRegimeIBSCBS: z.string().optional().nullable(),
  opSimpNac: z.string().optional().nullable(), // Usado na NFS-e
  regApIBSCBSSN: z.string().optional().nullable(),
  regApTribSN: z.string().optional().nullable(),
  tpEnteGov: z.string().optional().nullable(),
  aliquotasEfetivas: AliquotasEfetivasInputSchema.optional().nullable(),
  itens: z.array(ItemSimplesUnificadoInputSchema).min(1, 'Ao menos 1 item deve ser fornecido'),
});

export type OperacaoSimplesNaoAssistidaInputRfb = z.infer<typeof OperacaoSimplesNaoAssistidaInputSchema>;
export type ItemSimplesUnificadoInputRfb = z.infer<typeof ItemSimplesUnificadoInputSchema>;
export type AliquotasEfetivasInputRfb = z.infer<typeof AliquotasEfetivasInputSchema>;

// Schema de Atividades do Simples Nacional
export const AtividadeSimplesDomainSchema = z.object({
  codigo: z.string(),
  descricao: z.string(),
  anexo: z.string().optional(),
  sujeitoFatorR: z.boolean().optional(),
  permiteIBSCBS: z.boolean().optional(),
  disponivel: z.boolean().optional(),
  compativelComClassTrib: z.boolean().optional(),
  admissivelNoDocumento: z.boolean().optional(),
});

export type AtividadeSimplesDomainRfb = z.infer<typeof AtividadeSimplesDomainSchema>;
