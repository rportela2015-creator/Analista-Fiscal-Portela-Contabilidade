/**
 * Extrator Multifonte de Dados Fiscais (Nível 1 - Ingestão Canônica e Quarentena)
 * Módulo TypeScript nativo para Next.js / Node.js
 */

export interface OrigemRegistro {
  arquivo: string;
  metodo: 'xpath' | 'cabecalho' | 'perfil' | 'catalogo_para_classificar' | 'regex' | 'falha-mapeamento';
  confianca: number; // 0.0 a 100.0%
  linha?: number;
  aba?: string;
  pagina?: number;
  detalhes?: string;
}

export interface RegistroCanonico {
  campos: {
    ncm?: string;
    cest?: string;
    descricao?: string;
    aliquota?: string;
    cprod?: string;
    cfop?: string;
    quantidade?: string;
    valor?: string;
    [key: string]: string | undefined;
  };
  origem: OrigemRegistro;
  erros: string[];
  isValido: boolean;
}

export interface ResultadoConsolidado {
  validos: RegistroCanonico[];
  quarentena: RegistroCanonico[];
  stats: {
    totalRegistros: number;
    validosAprovados: number;
    quarentenaRejeitados: number;
    taxaAprovacaoPercentual: number;
    confiancaMediaValidos: number;
  };
}

export const SINONIMOS: Record<string, string[]> = {
  ncm: [
    'ncm', 'ncm/sh', 'cod ncm', 'codigo ncm', 'cod. ncm', 'código ncm',
    'nomenclatura', 'classificacao fiscal', 'sh', 'classif fiscal', 'ncm_sh'
  ],
  cest: [
    'cest', 'codigo cest', 'cod cest', 'cod. cest', 'código cest'
  ],
  descricao: [
    'descricao', 'descricao do produto', 'produto', 'xprod', 'mercadoria',
    'item', 'discriminacao', 'historico', 'nome', 'detalhe', 'denominacao'
  ],
  aliquota: [
    'aliquota', 'aliq', 'icms', '% icms', 'picms', 'aliquota icms', 'aliq icms'
  ],
  cprod: [
    'cprod', 'codigo', 'cod', 'ref', 'referencia', 'cod produto', 'codigo produto'
  ],
  cfop: [
    'cfop', 'natureza', 'nat operacao'
  ],
  quantidade: [
    'qtd', 'quantidade', 'quant', 'qcom', 'unidade', 'un'
  ],
  valor: [
    'valor', 'valor unitario', 'vunit', 'vprod', 'total', 'valor total'
  ]
};

export function normalizarTexto(s: any): string {
  if (!s) return '';
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/% ]+/g, ' ')
    .trim();
}

export function soDigitos(s: any): string {
  if (!s) return '';
  return String(s).replace(/\D/g, '');
}

export function padronizarNcm(v: any): string {
  if (!v) return '';
  const s = String(v).trim();
  if (/[\d.]+[eE][+-]?\d+/.test(s)) return '';
  const d = soDigitos(s);
  if (d.length === 7) return d.padStart(8, '0');
  return d;
}

export function mapearColunas(
  linhas: string[][],
  ncmsValidos: Set<string>,
  scan = 25,
  minimo = 0.50,
  margem = 0.25
) {
  let mapa: Record<string, number> = {};
  let ini = 0;
  let metodo: OrigemRegistro['metodo'] = 'perfil';
  let scorePerfil = 0.0;

  // 1. Cabeçalho semântico
  for (let i = 0; i < Math.min(linhas.length, scan); i++) {
    const l = linhas[i];
    const achou: Record<string, number> = {};
    for (let j = 0; j < l.length; j++) {
      const norm = normalizarTexto(l[j]);
      for (const [campo, sins] of Object.entries(SINONIMOS)) {
        if (sins.includes(norm)) {
          achou[campo] = j;
          break;
        }
      }
    }
    if ('ncm' in achou || 'descricao' in achou) {
      mapa = achou;
      ini = i + 1;
      metodo = 'cabecalho';
      return { ini, mapa, metodo, scorePerfil: 1.0 };
    }
  }

  // 2. Perfil de conteúdo estatístico
  const dados = linhas.slice(ini);
  if (dados.length > 0 && !('ncm' in mapa)) {
    const nCols = Math.max(...dados.map((r) => r.length), 0);
    const pont: Array<{ taxa: number; col: number }> = [];

    for (let j = 0; j < nCols; j++) {
      let preenchidos = 0;
      let validos = 0;
      for (const r of dados) {
        if (j < r.length && String(r[j]).trim()) {
          preenchidos++;
          if (ncmsValidos.has(padronizarNcm(r[j]))) {
            validos++;
          }
        }
      }
      const taxa = preenchidos > 0 ? validos / preenchidos : 0.0;
      pont.push({ taxa, col: j });
    }

    pont.sort((a, b) => b.taxa - a.taxa);
    if (pont.length > 0) {
      const melhor = pont[0];
      const segunda = pont.length > 1 ? pont[1].taxa : 0.0;
      if (melhor.taxa >= minimo && melhor.taxa - segunda >= margem) {
        mapa.ncm = melhor.col;
        metodo = 'perfil';
        scorePerfil = melhor.taxa;
      }
    }
  }

  return { ini, mapa, metodo, scorePerfil };
}

export function extrairDeTabela(
  linhas: string[][],
  ncmsValidos: Set<string>,
  origemInfo: { arquivo: string; aba?: string; pagina?: number }
): RegistroCanonico[] {
  const { ini, mapa, metodo, scorePerfil } = mapearColunas(linhas, ncmsValidos);
  const registros: RegistroCanonico[] = [];

  const temNcm = 'ncm' in mapa;
  const temDesc = 'descricao' in mapa;

  if (!temNcm && !temDesc) {
    registros.push({
      campos: {},
      origem: {
        arquivo: origemInfo.arquivo,
        metodo: 'falha-mapeamento',
        confianca: 0.0,
        aba: origemInfo.aba,
        pagina: origemInfo.pagina,
        detalhes: 'Nenhuma coluna identificada como NCM ou Descrição do Produto',
      },
      erros: ['Formato não reconhecido: NCM e Descrição ausentes'],
      isValido: false,
    });
    return registros;
  }

  const metodoFinal: OrigemRegistro['metodo'] = temNcm
    ? metodo
    : 'catalogo_para_classificar';

  const confiancaBase = temNcm
    ? (metodo === 'cabecalho' ? 98.0 : Math.round(Math.max(50.0, scorePerfil * 95.0)))
    : 95.0;

  for (let k = ini; k < linhas.length; k++) {
    const linha = linhas[k];
    if (!linha || !linha.some((c) => String(c).trim())) continue;

    const campos: RegistroCanonico['campos'] = {};
    for (const [campo, idx] of Object.entries(mapa)) {
      if (idx < linha.length) {
        let val = String(linha[idx]).trim();
        if (campo === 'ncm') val = padronizarNcm(val);
        campos[campo] = val;
      }
    }

    const erros: string[] = [];
    if (temNcm) {
      const ncm = campos.ncm || '';
      if (!ncm) {
        erros.push('NCM ausente na linha');
      } else if (!ncmsValidos.has(ncm)) {
        erros.push(`NCM "${ncm}" não localizado na Tabela Oficial vigente`);
      }
    } else {
      if (!campos.descricao) {
        erros.push('Descrição do produto ausente na linha do catálogo');
      }
    }

    if (campos.cest && soDigitos(campos.cest).length !== 7) {
      erros.push(`CEST inválido: "${campos.cest}"`);
    }

    const isValido = erros.length === 0;
    const confianca = isValido ? confiancaBase : 0.0;

    registros.push({
      campos,
      origem: {
        arquivo: origemInfo.arquivo,
        metodo: metodoFinal,
        confianca,
        linha: k + 1,
        aba: origemInfo.aba,
        pagina: origemInfo.pagina,
        detalhes: metodoFinal === 'catalogo_para_classificar'
          ? 'Catálogo para classificação no Nível 2'
          : `Mapeamento via ${metodoFinal}`,
      },
      erros,
      isValido,
    });
  }

  return registros;
}

export function consolidarRegistros(regs: RegistroCanonico[]): ResultadoConsolidado {
  const validos = regs.filter((r) => r.isValido);
  const quarentena = regs.filter((r) => !r.isValido);
  const total = regs.length;

  const confiancaMedia = validos.length > 0
    ? Math.round((validos.reduce((acc, r) => acc + r.origem.confianca, 0) / validos.length) * 10) / 10
    : 0.0;

  return {
    validos,
    quarentena,
    stats: {
      totalRegistros: total,
      validosAprovados: validos.length,
      quarentenaRejeitados: quarentena.length,
      taxaAprovacaoPercentual: total > 0 ? Math.round((validos.length / total) * 1000) / 10 : 0.0,
      confiancaMediaValidos: confiancaMedia,
    },
  };
}
