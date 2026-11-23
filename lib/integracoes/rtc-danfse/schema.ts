import { z } from 'zod';

const MAX_XML_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validação rigorosa de segurança para entrada XML de NFS-e / DPS.
 * Aplica proteção contra XXE (rejeitando DOCTYPE/ENTITY) e limite de 5MB.
 */
export const DanfseXmlInputSchema = z
  .string()
  .min(1, 'Conteúdo XML é obrigatório')
  .max(MAX_XML_SIZE_BYTES, 'O arquivo XML excede o limite máximo permitido de 5 MB')
  .refine(
    (xml) => !/<!DOCTYPE/i.test(xml) && !/<!ENTITY/i.test(xml),
    {
      message: 'Segurança Fiscal: XML contém declaração DOCTYPE ou ENTITY potencialmente vulnerável a XXE',
    }
  )
  .refine(
    (xml) => {
      const trimmed = xml.trim();
      return (
        trimmed.startsWith('<') &&
        (trimmed.includes('<NFSe') ||
          trimmed.includes('<DPS') ||
          trimmed.includes('<infDPS') ||
          trimmed.includes('<tcCompNfse') ||
          trimmed.includes('<?xml'))
      );
    },
    {
      message: 'Conteúdo informado não possui estrutura XML válida de documento fiscal NFS-e/DPS',
    }
  );

export const DanfseOpcoesSchema = z.object({
  stc: z
    .union([
      z.enum(['0', '1', '2']),
      z.number().int().min(0).max(2).transform((n) => String(n) as '0' | '1' | '2'),
    ])
    .optional()
    .default('0'), // 0=Válida, 1=Substituída, 2=Cancelada
  canhoto: z.boolean().optional().default(true),
});

export type DanfseOpcoes = z.infer<typeof DanfseOpcoesSchema>;
