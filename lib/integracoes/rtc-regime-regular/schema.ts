import { z } from 'zod';

/**
 * Schemas Zod para o microsserviço oficial da Receita Federal: Calculadora RTC - Regime Regular
 * Inspecionado em: F:\Workspace\Apps\_inspecao_rfb_rtc\calculadora-rtc-regime-regular
 */

export const AliquotasNominaisInputSchema = z.object({
  cbs: z.number().nonnegative(),
  ibsEstadual: z.number().nonnegative(),
  ibsMunicipal: z.number().nonnegative(),
  impostoSeletivo: z
    .object({
      adValorem: z.number().nonnegative().optional(),
      adRem: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const ImpostoSeletivoInputSchema = z.object({
  cst: z.string().regex(/^\d{3}$/, 'CST do IS deve ter 3 dígitos'),
  cClassTrib: z.string().regex(/^\d{6}$/, 'cClassTrib do IS deve ter 6 dígitos'),
  baseCalculo: z.number().nonnegative().optional(),
  quantidade: z.number().positive().optional(),
  unidade: z.string().optional(),
  impostoInformado: z.number().nonnegative().optional(),
});

export const ItemOperacaoInputSchema = z.object({
  numero: z.number().int().min(1),
  ncm: z.string().regex(/^\d{8}$/, 'NCM deve conter 8 dígitos numéricos').optional().nullable(),
  nbs: z.string().regex(/^\d{9}$/, 'NBS deve conter 9 dígitos numéricos').optional().nullable(),
  cst: z.string().regex(/^\d{3}$/, 'CST deve ter 3 dígitos (ex: 000, 200, 400)'),
  cClassTrib: z.string().regex(/^\d{6}$/, 'cClassTrib deve ter 6 dígitos'),
  baseCalculo: z.number().nonnegative(),
  quantidade: z.number().positive().optional(),
  unidade: z.string().optional(),
  impostoSeletivo: ImpostoSeletivoInputSchema.optional().nullable(),
  aliquotasNominais: AliquotasNominaisInputSchema.optional().nullable(),
});

export const OperacaoInputSchema = z.object({
  id: z.string().min(1, 'Identificador da operação obrigatório'),
  versao: z.string().default('1.0.0'),
  dhFatoGerador: z.string().min(10, 'Data/hora do fato gerador obrigatória (ISO)'),
  municipio: z.number().int().min(1000000).max(9999999), // Código IBGE 7 dígitos
  uf: z.string().length(2, 'Sigla da UF deve ter 2 caracteres'),
  tpDoc: z.number().int().min(1).max(999).optional().default(55),
  itens: z.array(ItemOperacaoInputSchema).min(1, 'A operação deve conter ao menos 1 item'),
});

export type OperacaoInputRfb = z.infer<typeof OperacaoInputSchema>;
export type ItemOperacaoInputRfb = z.infer<typeof ItemOperacaoInputSchema>;

// Schemas de Saída do ROC / Observabilidade
export const ErroItemRocSchema = z.object({
  code: z.string().optional(),
  title: z.string().optional(),
  pointer: z.string().optional(),
  detail: z.string(),
});

export const GrupoIbsUfSchema = z.object({
  pIBSUF: z.string().optional(),
  gRed: z
    .object({
      pRedAliq: z.string().optional(),
      pAliqEfet: z.string().optional(),
    })
    .optional(),
  vIBSUF: z.string().optional(),
});

export const GrupoIbsMunSchema = z.object({
  pIBSMun: z.string().optional(),
  gRed: z
    .object({
      pRedAliq: z.string().optional(),
      pAliqEfet: z.string().optional(),
    })
    .optional(),
  vIBSMun: z.string().optional(),
});

export const GrupoCbsSchema = z.object({
  pCBS: z.string().optional(),
  gRed: z
    .object({
      pRedAliq: z.string().optional(),
      pAliqEfet: z.string().optional(),
    })
    .optional(),
  vCBS: z.string().optional(),
});

export const ObjetoCalculadoRocSchema = z.object({
  nObj: z.number(),
  estadoItem: z.enum([
    'CALCULADO',
    'CALCULO_SIMULADO',
    'INCONSISTENCIA_ENTRADA',
    'NAO_IMPLEMENTADO',
    'FALHA_TECNICA',
  ]).optional(),
  erros: z.array(ErroItemRocSchema).optional(),
  tribCalc: z
    .object({
      IS: z.any().optional(),
      IBSCBS: z
        .object({
          CST: z.string().optional(),
          cClassTrib: z.string().optional(),
          gIBSCBS: z
            .object({
              vBC: z.string().optional(),
              gIBSUF: GrupoIbsUfSchema.optional(),
              gIBSMun: GrupoIbsMunSchema.optional(),
              vIBS: z.string().optional(),
              gCBS: GrupoCbsSchema.optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const TotalRocSchema = z.object({
  tribCalc: z
    .object({
      ISTot: z.object({ vIS: z.string().optional() }).optional(),
      IBSCBSTot: z
        .object({
          vBCIBSCBS: z.string().optional(),
          gIBS: z.object({ vIBS: z.string().optional() }).optional(),
          gCBS: z.object({ vCBS: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const ROCDomainSchema = z.object({
  id: z.string().optional(),
  versao: z.string().optional(),
  objetos: z.array(ObjetoCalculadoRocSchema).optional(),
  total: TotalRocSchema.optional(),
});

export type ROCDomainRfb = z.infer<typeof ROCDomainSchema>;
