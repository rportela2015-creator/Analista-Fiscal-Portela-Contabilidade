/**
 * Módulo de Perfil Tributário Bitemporal e Validação Cadastral
 * Analista Fiscal Portela Contabilidade
 */

import { z } from 'zod';

// ============================================================================
// VALIDADOR ALGORÍTMICO REAL DE CNPJ (14 dígitos + 2 Dígitos Verificadores)
// ============================================================================

export function sanitizarCnpj(cnpj: string): string {
  if (!cnpj) return '';
  return cnpj.replace(/\D/g, '');
}

export function formatarCnpj(cnpj: string): string {
  const digits = sanitizarCnpj(cnpj);
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function validarCnpj(cnpj: string): boolean {
  const clean = sanitizarCnpj(cnpj);
  if (clean.length !== 14) return false;

  // Rejeitar dígitos todos iguais (00000000000000, 11111111111111, etc.)
  if (/^(\d)\1{13}$/.test(clean)) return false;

  // Primeiro Dígito Verificador
  const peso1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma1 = 0;
  for (let i = 0; i < 12; i++) {
    soma1 += parseInt(clean[i], 10) * peso1[i];
  }
  const resto1 = soma1 % 11;
  const dv1 = resto1 < 2 ? 0 : 11 - resto1;
  if (parseInt(clean[12], 10) !== dv1) return false;

  // Segundo Dígito Verificador
  const peso2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma2 = 0;
  for (let i = 0; i < 13; i++) {
    soma2 += parseInt(clean[i], 10) * peso2[i];
  }
  const resto2 = soma2 % 11;
  const dv2 = resto2 < 2 ? 0 : 11 - resto2;
  return parseInt(clean[13], 10) === dv2;
}

// ============================================================================
// SCHEMAS ZOD DE VALIDAÇÃO
// ============================================================================

export const RegimeTributarioEnum = z.enum([
  'SIMPLES_NACIONAL',
  'SIMPLES_EXCESSO_SUBLIMITE',
  'LUCRO_PRESUMIDO',
  'LUCRO_REAL',
  'MEI',
]);
export type RegimeTributario = z.infer<typeof RegimeTributarioEnum>;

export const AliquotasEfetivasSchema = z.object({
  icmsEfetivo: z.number().nonnegative().optional(),
  issEfetivo: z.number().nonnegative().optional(),
  pisEfetivo: z.number().nonnegative().optional(),
  cofinsEfetivo: z.number().nonnegative().optional(),
  faixaSimples: z.number().int().min(1).max(6).optional(),
  fatorR: z.number().nonnegative().optional(),
  anexoSimples: z.enum(['I', 'II', 'III', 'IV', 'V']).optional(),
});
export type AliquotasEfetivas = z.infer<typeof AliquotasEfetivasSchema>;

export const BeneficiosParanaSchema = z.object({
  diferimentoParcialArt28: z.boolean().default(true),
  optanteRotSt: z.boolean().default(false),
  regimeEspecialSefaPr: z.string().optional(),
  reducoesBcAtivas: z.array(z.string()).default([]),
});
export type BeneficiosParana = z.infer<typeof BeneficiosParanaSchema>;

export const ReformaTributariaPerfilSchema = z.object({
  optanteSplitPayment2026: z.boolean().default(false),
  creditoPresumidoIbsCbs: z.boolean().default(false),
});
export type ReformaTributariaPerfil = z.infer<typeof ReformaTributariaPerfilSchema>;

export const PerfilTributarioInputSchema = z.object({
  regimeTributario: RegimeTributarioEnum,
  vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  vigenciaFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').nullable().optional(),
  aliquotasEfetivas: AliquotasEfetivasSchema.optional().default({}),
  simplesOptanteHibrido2027: z.boolean().default(false),
  beneficiosParana: BeneficiosParanaSchema.default({
    diferimentoParcialArt28: true,
    optanteRotSt: false,
    reducoesBcAtivas: [],
  }),
  reformaTributaria: ReformaTributariaPerfilSchema.default({
    optanteSplitPayment2026: false,
    creditoPresumidoIbsCbs: false,
  }),
  encerrarAnteriorAutomaticamente: z.boolean().optional().default(false),
  observacoes: z.string().optional(),
});
export type PerfilTributarioInput = z.infer<typeof PerfilTributarioInputSchema>;

export const EmpresaInputSchema = z.object({
  escritorioId: z.string().uuid().optional(),
  cnpj: z.string().refine(validarCnpj, { message: 'CNPJ inválido (deve conter 14 dígitos e dígitos verificadores corretos)' }),
  razaoSocial: z.string().min(2, 'Razão Social deve ter pelo menos 2 caracteres'),
  nomeFantasia: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  uf: z.string().length(2, 'UF deve ter 2 caracteres').default('PR'),
  municipioIbge: z.string().regex(/^\d{7}$/, 'Código IBGE deve ter 7 dígitos').optional(),
  ativo: z.boolean().default(true),
  perfilInicial: PerfilTributarioInputSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type EmpresaInput = z.infer<typeof EmpresaInputSchema>;

// ============================================================================
// MODELOS DE DADOS DA ENTIDADE
// ============================================================================

export interface PerfilTributario {
  id: string;
  empresaId: string;
  escritorioId: string;
  regimeTributario: RegimeTributario;
  vigenciaInicio: string; // YYYY-MM-DD
  vigenciaFim: string | null; // YYYY-MM-DD ou null se indeterminado
  aliquotasEfetivas: AliquotasEfetivas;
  simplesOptanteHibrido2027: boolean;
  beneficiosParana: BeneficiosParana;
  reformaTributaria: ReformaTributariaPerfil;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Empresa {
  id: string;
  escritorioId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  inscricaoEstadual?: string | null;
  uf: string;
  municipioIbge?: string | null;
  ativo: boolean;
  metadata?: Record<string, unknown> | null;
  criadoEm: string;
  atualizadoEm: string;
  perfis?: PerfilTributario[];
}

export interface ContextoAuditoriaFiscal {
  regime: RegimeTributario;
  isSimplesNacional: boolean;
  isSimplesHibrido2027: boolean;
  aplicaDiferimentoArt28: boolean;
  aplicaRotSt: boolean;
  splitPayment2026: boolean;
  icmsEfetivoSimples?: number;
  aliquotasEfetivas: AliquotasEfetivas;
  regimeEspecialSefaPr?: string;
  reducoesBcAtivas: string[];
}

// ============================================================================
// FUNÇÕES PURAS DE GESTÃO BITEMPORAL
// ============================================================================

/**
 * Valida sobreposição temporal de vigências para perfis de uma empresa.
 * Se `encerrarAnterior` for true e o novo perfil começar após o início do perfil anterior
 * aberto ou conflitante, encerra o anterior no dia anterior (YYYY-MM-DD).
 */
export function validarSobreposicaoVigencias(
  perfisExistentes: PerfilTributario[],
  novo: { vigenciaInicio: string; vigenciaFim?: string | null },
  encerrarAnterior: boolean = false
): {
  valido: boolean;
  conflito?: PerfilTributario;
  perfisAjustados?: PerfilTributario[];
  erro?: string;
} {
  const nInicio = novo.vigenciaInicio;
  const nFim = novo.vigenciaFim || '9999-12-31';

  if (novo.vigenciaFim && novo.vigenciaInicio > novo.vigenciaFim) {
    return {
      valido: false,
      erro: 'Data de início de vigência não pode ser superior à data de término.',
    };
  }

  const perfisCopia: PerfilTributario[] = JSON.parse(JSON.stringify(perfisExistentes));

  for (let i = 0; i < perfisCopia.length; i++) {
    const p = perfisCopia[i];
    const pInicio = p.vigenciaInicio;
    const pFim = p.vigenciaFim || '9999-12-31';

    // Checagem de interseção de intervalos [nInicio, nFim] e [pInicio, pFim]
    const temIntersecao = nInicio <= pFim && nFim >= pInicio;

    if (temIntersecao) {
      if (encerrarAnterior && nInicio > pInicio) {
        // Encerra p no dia anterior ao nInicio
        const dataAnt = new Date(nInicio + 'T00:00:00Z');
        dataAnt.setUTCDate(dataAnt.getUTCDate() - 1);
        p.vigenciaFim = dataAnt.toISOString().slice(0, 10);
      } else {
        return {
          valido: false,
          conflito: p,
          erro: `Conflito de vigência com perfil existente (Início: ${p.vigenciaInicio}, Fim: ${p.vigenciaFim || 'indeterminado'}).`,
        };
      }
    }
  }

  return {
    valido: true,
    perfisAjustados: perfisCopia,
  };
}

/**
 * Resolve o perfil fiscal ativo em determinada data de fato gerador (YYYY-MM-DD ou ISO).
 */
export function resolverPerfilVigenteNaData(
  perfis: PerfilTributario[],
  dataFatoGeradorISO: string
): PerfilTributario | null {
  if (!perfis || perfis.length === 0) return null;

  const dataAlvo = dataFatoGeradorISO.slice(0, 10);

  // Procura perfil onde vigenciaInicio <= dataAlvo e (vigenciaFim == null || vigenciaFim >= dataAlvo)
  const candidatos = perfis.filter((p) => {
    if (p.vigenciaInicio > dataAlvo) return false;
    if (p.vigenciaFim && p.vigenciaFim < dataAlvo) return false;
    return true;
  });

  if (candidatos.length === 0) return null;

  // Se houver mais de um, escolhe o com vigenciaInicio mais recente
  candidatos.sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio));
  return candidatos[0];
}

/**
 * Converte um PerfilTributario cadastrado para o contexto de auditoria consumido pelos motores.
 */
export function mapearPerfilParaContextoAuditoria(perfil: PerfilTributario): ContextoAuditoriaFiscal {
  const isSimples =
    perfil.regimeTributario === 'SIMPLES_NACIONAL' ||
    perfil.regimeTributario === 'SIMPLES_EXCESSO_SUBLIMITE' ||
    perfil.regimeTributario === 'MEI';

  return {
    regime: perfil.regimeTributario,
    isSimplesNacional: isSimples,
    isSimplesHibrido2027: isSimples && Boolean(perfil.simplesOptanteHibrido2027),
    aplicaDiferimentoArt28: Boolean(perfil.beneficiosParana?.diferimentoParcialArt28),
    aplicaRotSt: Boolean(perfil.beneficiosParana?.optanteRotSt),
    splitPayment2026: Boolean(perfil.reformaTributaria?.optanteSplitPayment2026),
    icmsEfetivoSimples: perfil.aliquotasEfetivas?.icmsEfetivo,
    aliquotasEfetivas: perfil.aliquotasEfetivas || {},
    regimeEspecialSefaPr: perfil.beneficiosParana?.regimeEspecialSefaPr,
    reducoesBcAtivas: perfil.beneficiosParana?.reducoesBcAtivas || [],
  };
}
