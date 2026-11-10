#!/usr/bin/env python3
"""Compila o Repositório de Fontes Legais (docs/legal/*.md) em public/data/fontes-legais.json.

Extrai frontmatter YAML, divide o texto em seções normativas, valida os NCMs
contra a Tabela NCM oficial (public/data/ncm.json) e constrói índices O(1)
por Capítulo, Posição e NCM para consumo direto pelo motor (Nível 2) e IA (Nível 3).
"""

from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGAL_DIR = ROOT / "docs" / "legal"
NCM_JSON = ROOT / "public" / "data" / "ncm.json"
OUT_JSON = ROOT / "public" / "data" / "fontes-legais.json"


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extrai cabeçalho YAML delimitado por --- e retorna (dados, corpo)."""
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    yaml_text = parts[1].strip()
    body = parts[2].strip()

    meta = {}
    for line in yaml_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            k, v = line.split(":", 1)
            k = k.strip()
            v = v.strip()
            # arrays simples inline: ["a", "b"]
            if v.startswith("[") and v.endswith("]"):
                inner = v[1:-1].strip()
                items = [item.strip().strip('"').strip("'") for item in inner.split(",") if item.strip()]
                meta[k] = items
            elif (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                meta[k] = v[1:-1]
            else:
                meta[k] = v
    return meta, body


def extrair_secoes(body: str) -> list[dict[str, str]]:
    """Divide o corpo do Markdown em seções a partir de cabeçalhos ##."""
    linhas = body.splitlines()
    secoes = []
    titulo_atual = "Geral"
    buffer: list[str] = []

    for linha in linhas:
        m = re.match(r"^##\s+(.+)$", linha)
        if m:
            if buffer:
                texto = "\n".join(buffer).strip()
                if texto:
                    secoes.append({"titulo": titulo_atual, "texto": texto})
                buffer = []
            titulo_atual = m.group(1).strip()
        else:
            buffer.append(linha)

    if buffer:
        texto = "\n".join(buffer).strip()
        if texto:
            secoes.append({"titulo": titulo_atual, "texto": texto})

    return secoes


def main() -> int:
    print("Compilador de Fontes Legais (.md -> fontes-legais.json)...")
    if not LEGAL_DIR.exists():
        print(f"ERRO: Diretório {LEGAL_DIR} não encontrado.", file=sys.stderr)
        return 1

    # Carrega tabela de NCMs válidos para conferência de integridade
    ncms_validos = set()
    if NCM_JSON.exists():
        try:
            lista_ncm = json.loads(NCM_JSON.read_text(encoding="utf-8"))
            for r in lista_ncm:
                if "ncm" in r:
                    ncms_validos.add(r["ncm"].strip())
                if "d8" in r:
                    ncms_validos.add(r["d8"].strip())
        except Exception as e:
            print(f"AVISO: Não foi possível ler {NCM_JSON}: {e}")

    documentos = []
    por_id = {}
    por_capitulo: dict[str, list[str]] = {}
    por_posicao: dict[str, list[str]] = {}
    por_ncm: dict[str, list[str]] = {}
    trechos = []

    arquivos_md = sorted(LEGAL_DIR.rglob("*.md"))
    for arquivo in arquivos_md:
        if arquivo.name.upper() == "README.MD":
            continue

        rel_path = arquivo.relative_to(ROOT).as_posix()
        conteudo = arquivo.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(conteudo)

        doc_id = meta.get("id") or arquivo.stem
        tipo = meta.get("tipo", "GERAL")
        titulo = meta.get("titulo", arquivo.stem)
        norma = meta.get("norma", "")
        capitulos = meta.get("capitulos", [])
        posicoes = meta.get("posicoes", [])
        ncms = meta.get("ncms_relevantes", [])
        tags = meta.get("tags", [])

        # Validação de integridade dos NCMs citados
        if ncms_validos:
            for cod in ncms:
                cod_limpo = cod.replace(".", "").strip()
                if cod not in ncms_validos and cod_limpo not in ncms_validos:
                    print(f"  [AVISO] {rel_path}: NCM '{cod}' não localizado na tabela oficial de 10.515 códigos.")

        doc_info = {
            "id": doc_id,
            "arquivo": rel_path,
            "tipo": tipo,
            "titulo": titulo,
            "norma": norma,
            "capitulos": capitulos,
            "posicoes": posicoes,
            "ncms": ncms,
            "tags": tags,
        }
        documentos.append(doc_info)
        por_id[doc_id] = doc_info

        # Índices por Capítulo
        for cap in capitulos:
            cap_norm = str(cap).zfill(2)
            por_capitulo.setdefault(cap_norm, []).append(doc_id)

        # Índices por Posição (4 dígitos)
        for pos in posicoes:
            pos_norm = pos.replace(".", "").strip()
            por_posicao.setdefault(pos_norm, []).append(doc_id)

        # Índices por NCM (8 dígitos)
        for ncm in ncms:
            d8 = ncm.replace(".", "").strip()
            por_ncm.setdefault(d8, []).append(doc_id)
            por_ncm.setdefault(ncm, []).append(doc_id)

        # Segmentação em trechos para RAG
        secoes = extrair_secoes(body)
        for idx, sec in enumerate(secoes):
            trecho_id = f"{doc_id}-s{idx + 1}"
            trechos.append({
                "id": trecho_id,
                "docId": doc_id,
                "tipo": tipo,
                "norma": norma,
                "tituloDoc": titulo,
                "secao": sec["titulo"],
                "capitulos": capitulos,
                "posicoes": posicoes,
                "ncms": ncms,
                "texto": sec["texto"],
            })

    output_data = {
        "versao": "1.0",
        "totalDocumentos": len(documentos),
        "totalTrechos": len(trechos),
        "documentos": documentos,
        "porId": por_id,
        "porCapitulo": por_capitulo,
        "porPosicao": por_posicao,
        "porNcm": por_ncm,
        "trechos": trechos,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(documentos)} documentos e {len(trechos)} trechos compilados em {OUT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
