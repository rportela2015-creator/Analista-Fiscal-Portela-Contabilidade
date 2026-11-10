/**
 * Módulo de Acesso e Consulta às Fontes Legais (NESH, COSIT, LC 214/2025, RGI).
 * Funciona de forma isomórfica (Node.js no backend / Fetch no navegador).
 */

export interface DocumentoLegal {
  id: string;
  arquivo: string;
  tipo: 'NESH' | 'COSIT' | 'REFORMA' | 'RGI' | string;
  titulo: string;
  norma: string;
  capitulos: string[];
  posicoes: string[];
  ncms: string[];
  tags: string[];
}

export interface TrechoLegal {
  id: string;
  docId: string;
  tipo: string;
  norma: string;
  tituloDoc: string;
  secao: string;
  capitulos: string[];
  posicoes: string[];
  ncms: string[];
  texto: string;
}

export interface FontesLegaisDataset {
  versao: string;
  totalDocumentos: number;
  totalTrechos: number;
  documentos: DocumentoLegal[];
  porId: Record<string, DocumentoLegal>;
  porCapitulo: Record<string, string[]>;
  porPosicao: Record<string, string[]>;
  porNcm: Record<string, string[]>;
  trechos: TrechoLegal[];
}

let datasetCache: FontesLegaisDataset | null = null;

/**
 * Carrega o índice de fontes legais compilado (isomórfico).
 */
export async function carregarFontesLegais(): Promise<FontesLegaisDataset | null> {
  if (datasetCache) return datasetCache;

  // Ambiente Servidor (Node.js / Next.js API Routes)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const p = path.join(process.cwd(), 'public', 'data', 'fontes-legais.json');
      if (fs.existsSync(p)) {
        datasetCache = JSON.parse(fs.readFileSync(p, 'utf-8')) as FontesLegaisDataset;
        return datasetCache;
      }
    } catch {
      // continua para fallback
    }
  }

  // Ambiente Navegador (Client-side fetch)
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/data/fontes-legais.json');
      if (res.ok) {
        datasetCache = (await res.json()) as FontesLegaisDataset;
        return datasetCache;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Retorna os documentos legais vinculados a um determinado NCM (ou posição de 4 dígitos).
 */
export function buscarFontesPorNcm(
  dataset: FontesLegaisDataset | null | undefined,
  ncm: string
): DocumentoLegal[] {
  if (!dataset) return [];
  const limpo = (ncm || '').replace(/\D/g, '');
  const docsEncontrados = new Set<string>();

  // 1. Busca por código de 8 dígitos
  if (limpo.length >= 8) {
    const ids = dataset.porNcm[limpo] || dataset.porNcm[ncm] || [];
    ids.forEach((id) => docsEncontrados.add(id));
  }

  // 2. Busca por posição de 4 dígitos
  if (limpo.length >= 4) {
    const pos = limpo.slice(0, 4);
    const idsPos = dataset.porPosicao[pos] || [];
    idsPos.forEach((id) => docsEncontrados.add(id));
  }

  // 3. Busca por capítulo (2 dígitos)
  if (limpo.length >= 2) {
    const cap = limpo.slice(0, 2);
    const idsCap = dataset.porCapitulo[cap] || [];
    idsCap.forEach((id) => docsEncontrados.add(id));
  }

  return Array.from(docsEncontrados)
    .map((id) => dataset.porId[id])
    .filter(Boolean);
}

/**
 * Retorna os trechos textuais da NESH e decisões vinculantes para grounded RAG.
 */
export function buscarTrechosRelevantes(
  dataset: FontesLegaisDataset | null | undefined,
  query: string,
  ncms: string[],
  limite = 3
): TrechoLegal[] {
  if (!dataset || !dataset.trechos || dataset.trechos.length === 0) return [];

  const termos = (query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const ncmsLimpos = ncms.map((n) => n.replace(/\D/g, ''));
  const caps = Array.from(new Set(ncmsLimpos.map((n) => n.slice(0, 2)).filter(Boolean)));
  const posicoes = Array.from(new Set(ncmsLimpos.map((n) => n.slice(0, 4)).filter(Boolean)));

  const pontuados = dataset.trechos.map((t) => {
    let score = 0;
    const textoNorm = t.texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Peso alto: pertinência ao NCM ou posição
    for (const d8 of ncmsLimpos) {
      if (t.ncms.some((c) => c.replace(/\D/g, '') === d8)) score += 30;
    }
    for (const pos of posicoes) {
      if (t.posicoes.some((p) => p.replace(/\D/g, '') === pos)) score += 15;
    }
    for (const cap of caps) {
      if (t.capitulos.some((c) => strZero(c) === cap)) score += 5;
    }

    // Termos de busca da descrição da mercadoria
    for (const termo of termos) {
      if (textoNorm.includes(termo)) score += 3;
    }

    return { trecho: t, score };
  });

  pontuados.sort((a, b) => b.score - a.score);
  return pontuados
    .filter((p) => p.score > 0)
    .slice(0, limite)
    .map((p) => p.trecho);
}

function strZero(v: string | number): string {
  return String(v).padStart(2, '0');
}
