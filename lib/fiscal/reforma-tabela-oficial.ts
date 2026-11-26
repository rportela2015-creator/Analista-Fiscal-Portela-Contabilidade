/**
 * Consulta e Validação Determinística de cClassTrib na Tabela Oficial (public/data/reforma.json).
 * Fonte única da verdade para classificações IBS/CBS da Reforma Tributária (LC 214/2025).
 */

import reformaOficial from '../../public/data/reforma.json';

export interface ClassTribOficialEntry {
  c: string;
  cst: string;
  cn: string;
  d: string;
  ta?: string;
  tt: string;
  red?: boolean;
}

export interface ValidacaoClassTribResultado {
  valido: boolean;
  codigo: string;
  cstOficial: string;
  reducaoOficialPct: number;
  tipoTributacao: string;
  descricaoOficial: string;
  motivo?: string;
}

export interface MapeamentoNcmReformaOficial {
  ncmPrefixo: string;
  tema: string;
  cClassTrib: string;
  cstIbsCbs: string;
  reducaoIbsCbsPct: number;
  convenioIcmsCorrelato?: string;
  normaId: string;
}

const TABELA_CLASSTRIB = new Map<string, ClassTribOficialEntry>();
for (const entry of (reformaOficial as { classificacoes: ClassTribOficialEntry[] }).classificacoes || []) {
  if (entry?.c) {
    TABELA_CLASSTRIB.set(String(entry.c).padStart(6, '0'), entry);
  }
}

/**
 * Mapeamento determinístico por prefixo de NCM com códigos exclusivamente validados em reforma.json.
 * - 3101/3105/3808 (Insumos Agropecuários Anexo IX) -> 200038 (-60%)
 * - 8432/8433/8436/8437/8701 (Máquinas/Tratores Agrícolas Anexo IX) -> 200038 (-60%)
 * - 3003/3004 (Medicamentos Anvisa) -> 200032 (-60%)
 * - 1006/0713/0901 (Arroz/Feijão/Café — Cesta Básica Nacional Anexo I) -> 200003 (Alíquota Zero = 100%)
 */
const MAPA_NCM_OFICIAL: Record<string, Omit<MapeamentoNcmReformaOficial, 'ncmPrefixo'>> = {
  '3105': {
    tema: 'Fertilizantes e Adubos Minerais ou Químicos (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-100-1997',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '3101': {
    tema: 'Adubos de Origem Animal ou Vegetal (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-100-1997',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '3808': {
    tema: 'Defensivos Agrícolas e Insumos Agropecuários (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-100-1997',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '8432': {
    tema: 'Máquinas e Aparelhos de Uso Agrícola (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-52-1991',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '8433': {
    tema: 'Máquinas de Colheita e Debulha (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-52-1991',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '8436': {
    tema: 'Outras Máquinas Agrícolas (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-52-1991',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '8437': {
    tema: 'Máquinas para Seleção de Grãos (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-52-1991',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '8701': {
    tema: 'Tratores Agrícolas (Anexo IX LC 214/2025)',
    cClassTrib: '200038',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    convenioIcmsCorrelato: 'CONV-ICMS-52-1991',
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '3004': {
    tema: 'Medicamentos Registrados na Anvisa (LC 214/2025)',
    cClassTrib: '200032',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '3003': {
    tema: 'Medicamentos Compostos Registrados na Anvisa (LC 214/2025)',
    cClassTrib: '200032',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 60.0,
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '1006': {
    tema: 'Arroz para Alimentação Humana — Cesta Básica Nacional (Anexo I LC 214/2025)',
    cClassTrib: '200003',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 100.0,
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '0713': {
    tema: 'Feijão e Leguminosas — Cesta Básica Nacional (Anexo I LC 214/2025)',
    cClassTrib: '200003',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 100.0,
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
  '0901': {
    tema: 'Café — Cesta Básica Nacional (Anexo I LC 214/2025)',
    cClassTrib: '200003',
    cstIbsCbs: '200',
    reducaoIbsCbsPct: 100.0,
    normaId: 'LC214-ANEXOS-REDUCOES',
  },
};

export function obterClassTribOficial(codigo: string | null | undefined): ClassTribOficialEntry | null {
  const digits = String(codigo ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const padded = digits.length <= 6 ? digits.padStart(6, '0') : digits.slice(0, 6);
  return TABELA_CLASSTRIB.get(padded) ?? null;
}

export function extrairReducaoOficialClassTrib(ct: ClassTribOficialEntry): number {
  const tt = String(ct.tt || '');
  const m = tt.match(/reduzid[ao]s?\s+em\s+(\d+(?:[.,]\d+)?)\s*%/i);
  if (/al[ií]quota zero/i.test(tt) && !m) return 100;
  if (/isen[çc][ãa]o|imunidade e n[ãa]o incid[êe]ncia/i.test(tt)) return 100;
  if (m) return Number(m[1].replace(',', '.'));
  return 0;
}

export function validarClassTribOficial(
  codigo: string | null | undefined,
  reducaoEsperadaPct?: number
): ValidacaoClassTribResultado {
  const digits = String(codigo ?? '').replace(/\D/g, '');
  if (digits.length !== 6) {
    return {
      valido: false,
      codigo: digits,
      cstOficial: '',
      reducaoOficialPct: 0,
      tipoTributacao: '',
      descricaoOficial: '',
      motivo: `Código cClassTrib "${codigo ?? ''}" inválido (deve conter 6 dígitos).`,
    };
  }

  const entry = TABELA_CLASSTRIB.get(digits);
  if (!entry) {
    return {
      valido: false,
      codigo: digits,
      cstOficial: '',
      reducaoOficialPct: 0,
      tipoTributacao: '',
      descricaoOficial: '',
      motivo: `Código cClassTrib ${digits} não existe na tabela oficial (reforma.json).`,
    };
  }

  const reducaoOficialPct = extrairReducaoOficialClassTrib(entry);
  if (reducaoEsperadaPct !== undefined && Number.isFinite(reducaoEsperadaPct)) {
    const espera = Number(reducaoEsperadaPct);
    const compativel = Math.abs(reducaoOficialPct - espera) <= 0.01;
    if (!compativel) {
      return {
        valido: false,
        codigo: entry.c,
        cstOficial: entry.cst,
        reducaoOficialPct,
        tipoTributacao: entry.tt,
        descricaoOficial: entry.d,
        motivo: `cClassTrib ${entry.c} ("${entry.tt}", redução oficial ${reducaoOficialPct}%) é incompatível com a redução de ${espera}%.`,
      };
    }
  }

  return {
    valido: true,
    codigo: entry.c,
    cstOficial: entry.cst,
    reducaoOficialPct,
    tipoTributacao: entry.tt,
    descricaoOficial: entry.d,
  };
}

export function buscarClassTribPorNcmOficial(ncmRaw: string): MapeamentoNcmReformaOficial | null {
  const ncm = String(ncmRaw || '').replace(/\D/g, '');
  if (ncm.length < 4) return null;
  const p4 = ncm.substring(0, 4);
  const regra = MAPA_NCM_OFICIAL[p4];
  if (!regra) return null;

  const check = validarClassTribOficial(regra.cClassTrib, regra.reducaoIbsCbsPct);
  if (!check.valido) return null;

  return {
    ncmPrefixo: p4,
    ...regra,
  };
}
