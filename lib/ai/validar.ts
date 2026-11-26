import type { Record8 } from '@/lib/data';
import { validarClassTribOficial } from '@/lib/fiscal/reforma-tabela-oficial';
import { consultarMvaStPr, resolverCbenefPr } from '@/lib/engine/tabelas-pr';

export interface ValidacaoIAOutput {
  ncm: string;
  valido: boolean;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  descricaoNcm?: string;
  aviso?: string;
}

export interface ValidacaoClassTribIA {
  valido: boolean;
  cClassTrib: string;
  cstOficial: string;
  reducaoOficialPct: number;
  enquadramentoPendente: boolean;
  descricaoOficial?: string;
  aviso?: string;
}

export interface ValidacaoCstCsosnIA {
  valido: boolean;
  cstOuCsosn: string;
  aviso?: string;
}

export interface ValidacaoCbenefIA {
  valido: boolean;
  cBenef: string;
  norma?: string;
  bloqueadoRejeicao928?: boolean;
  aviso?: string;
}

export interface ValidacaoMvaIA {
  valido: boolean;
  mvaOriginalPct: number;
  sujeitoSt: boolean;
  aviso?: string;
}

export function validarNcmIA(
  r: { ncm?: string | null; confianca?: 'ALTA' | 'MEDIA' | 'BAIXA' },
  mapaD8: Map<string, Record8> | Record<string, any>
): ValidacaoIAOutput {
  const raw = String(r.ncm ?? '').trim();
  let d8 = '';
  if (!/[\d.]+[eE][+-]?\d+/.test(raw)) {
    const d = raw.replace(/\D/g, '');
    d8 = d.length === 7 ? d.padStart(8, '0') : d;
  }
  const rec = mapaD8 instanceof Map ? mapaD8.get(d8) : (mapaD8 as any)[d8];

  if (!rec || d8.length !== 8) {
    return {
      ncm: d8,
      valido: false,
      confianca: 'BAIXA',
      aviso: 'NCM não localizado na tabela oficial do Siscomex; descartado.',
    };
  }

  return {
    ncm: rec.ncm || d8,
    valido: true,
    confianca: r.confianca || 'MEDIA',
    descricaoNcm: rec.desc || rec.descricao,
  };
}

export function validarClassTribIA(
  cClassTrib?: string | null,
  reducaoInformadaPct?: number
): ValidacaoClassTribIA {
  const bruto = String(cClassTrib ?? '').trim();
  if (!bruto) {
    return {
      valido: false,
      cClassTrib: '',
      cstOficial: '',
      reducaoOficialPct: 0,
      enquadramentoPendente: true,
      aviso: 'cClassTrib não informado pela IA; enquadramento IBS/CBS pendente de conferência na tabela oficial.',
    };
  }

  const check = validarClassTribOficial(bruto, reducaoInformadaPct);
  if (!check.valido) {
    return {
      valido: false,
      cClassTrib: '',
      cstOficial: '',
      reducaoOficialPct: 0,
      enquadramentoPendente: true,
      aviso: check.motivo || 'cClassTrib rejeitado por não constar ou divergir da tabela oficial (reforma.json).',
    };
  }

  return {
    valido: true,
    cClassTrib: check.codigo,
    cstOficial: check.cstOficial,
    reducaoOficialPct: check.reducaoOficialPct,
    enquadramentoPendente: false,
    descricaoOficial: check.descricaoOficial,
  };
}

const CSTS_NORMAIS_VALIDOS = new Set(['00', '10', '20', '30', '40', '41', '50', '51', '60', '61', '70', '90']);
const CSOSNS_SIMPLES_VALIDOS = new Set(['101', '102', '103', '201', '202', '203', '300', '400', '500', '900']);

export function validarCstCsosnIA(
  codigo?: string | null,
  regime?: string,
  opcoes?: { redBcIcmsPct?: number; ehMonofasico?: boolean }
): ValidacaoCstCsosnIA {
  const limpo = String(codigo ?? '').replace(/\D/g, '');
  const ehSimples = regime === 'simples' || regime === 'simples_hibrido';

  if (ehSimples) {
    if (CSOSNS_SIMPLES_VALIDOS.has(limpo)) {
      return { valido: true, cstOuCsosn: limpo };
    }
    return {
      valido: false,
      cstOuCsosn: '102',
      aviso: `CSOSN "${codigo ?? ''}" inválido para Simples Nacional; saneado para CSOSN 102.`,
    };
  }

  const cst2 = limpo.length === 1 ? `0${limpo}` : limpo.slice(-2);
  if (opcoes?.ehMonofasico && cst2 !== '61') {
    return {
      valido: false,
      cstOuCsosn: '61',
      aviso: `Combustível monofásico ad rem exige CST 61; CST "${codigo ?? ''}" da IA substituído por 61.`,
    };
  }

  if (cst2 === '20' && (opcoes?.redBcIcmsPct ?? 0) >= 100) {
    return {
      valido: false,
      cstOuCsosn: '40',
      aviso: 'CST 20 incompatível com redução de 100% na base de cálculo; saneado para CST 40 (Isenta).',
    };
  }

  if (CSTS_NORMAIS_VALIDOS.has(cst2)) {
    return { valido: true, cstOuCsosn: cst2 };
  }

  return {
    valido: false,
    cstOuCsosn: '00',
    aviso: `CST ICMS "${codigo ?? ''}" inválido para Regime Normal; saneado para CST 00.`,
  };
}

export function validarCbenefIA(
  cBenef?: string | null,
  cst?: string | null,
  ncm?: string | null,
  dataFatoGerador?: string | null
): ValidacaoCbenefIA {
  const bruto = String(cBenef ?? '').trim().toUpperCase();
  if (!bruto || bruto === 'SEM_CBENEF') {
    return { valido: true, cBenef: 'SEM_CBENEF' };
  }

  const res = resolverCbenefPr({
    codigo: bruto,
    cst,
    ncm,
    dataFatoGerador,
  });

  if (!res.valido) {
    return {
      valido: false,
      cBenef: 'SEM_CBENEF',
      bloqueadoRejeicao928: res.bloqueadoRejeicao928,
      aviso: res.observacaoConferencia,
    };
  }

  return {
    valido: true,
    cBenef: res.cBenef,
    norma: res.norma,
  };
}

export function validarMvaIA(
  mvaInformada: unknown,
  ncm?: string | null,
  cest?: string | null,
  dataFatoGerador?: string | null
): ValidacaoMvaIA {
  const mvaNum = Number(mvaInformada);
  const tab = consultarMvaStPr({
    ncm: ncm || '',
    cest,
    dataFatoGerador,
  });

  if (tab.ehMonofasico || tab.excluidoDaSt) {
    const teveMva = Number.isFinite(mvaNum) && mvaNum > 0;
    return {
      valido: !teveMva,
      mvaOriginalPct: 0,
      sujeitoSt: false,
      ...(teveMva ? { aviso: tab.motivo } : {}),
    };
  }

  if (!tab.encontradoNaTabela) {
    if (Number.isFinite(mvaNum) && mvaNum > 0) {
      return {
        valido: false,
        mvaOriginalPct: 0,
        sujeitoSt: false,
        aviso: `MVA ${mvaNum}% sugerida pela IA rejeitada: ${tab.motivo}`,
      };
    }
    return { valido: true, mvaOriginalPct: 0, sujeitoSt: false };
  }

  if (!Number.isFinite(mvaNum) || mvaNum < 0 || Math.abs(mvaNum - tab.mvaOriginalPct) > 0.05) {
    return {
      valido: false,
      mvaOriginalPct: tab.mvaOriginalPct,
      sujeitoSt: true,
      aviso: `MVA ${mvaInformada}% sugerida pela IA substituída pela MVA oficial da tabela Anexo IX PR (${tab.mvaOriginalPct}%).`,
    };
  }

  return {
    valido: true,
    mvaOriginalPct: tab.mvaOriginalPct,
    sujeitoSt: true,
  };
}
