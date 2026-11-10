"""
Extrator Multifonte de Dados Fiscais (Nível 1 - Ingestão Canônica e Quarentena)
Baseado em:
1. Mapeamento semântico por cabeçalho (sinônimos declarativos).
2. Perfil de conteúdo estatístico com validação forte contra a fonte da verdade (10.515 NCMs).
3. Preservação estrita de tipos e zeros à esquerda (dtype=str / sem coerção numérica).
4. Suporte duplo: (A) Validação de documentos fiscais já com NCM; (B) Ingestão de catálogos para classificar.
5. Proveniência granular e cálculo de percentual de confiabilidade (0.0% a 100.0%).
6. Quarentena obrigatória com justificativa técnica para dados inconsistentes.
"""
from __future__ import annotations
import os
import sys
import re
import json
import unicodedata
from dataclasses import dataclass, field, asdict
from typing import Callable, Iterable, Any

# ---------- Esquema Canônico e Tipagem
@dataclass
class OrigemRegistro:
    arquivo: str
    metodo: str                      # "xpath", "cabecalho", "perfil", "catalogo_para_classificar", "regex", "falha-mapeamento"
    confianca: float                 # 0.0 a 100.0%
    linha: int | None = None
    aba: str | None = None
    pagina: int | None = None
    detalhes: str | None = None

@dataclass
class Registro:
    campos: dict[str, str]
    origem: OrigemRegistro
    erros: list[str] = field(default_factory=list)

    @property
    def is_valido(self) -> bool:
        return len(self.erros) == 0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["is_valido"] = self.is_valido
        return d

# ---------- Dicionários de Sinônimos Declarativos
SINONIMOS: dict[str, list[str]] = {
    "ncm": [
        "ncm", "ncm/sh", "cod ncm", "codigo ncm", "cod. ncm", "código ncm",
        "nomenclatura", "classificacao fiscal", "sh", "classif fiscal", "ncm_sh"
    ],
    "cest": [
        "cest", "codigo cest", "cod cest", "cod. cest", "código cest"
    ],
    "descricao": [
        "descricao", "descricao do produto", "produto", "xprod", "mercadoria",
        "item", "discriminacao", "historico", "nome", "detalhe", "denominacao"
    ],
    "aliquota": [
        "aliquota", "aliq", "icms", "% icms", "picms", "aliquota icms", "aliq icms"
    ],
    "cprod": [
        "cprod", "codigo", "cod", "ref", "referencia", "cod produto", "codigo produto"
    ],
    "cfop": [
        "cfop", "natureza", "nat operacao"
    ],
    "quantidade": [
        "qtd", "quantidade", "quant", "qcom", "unidade", "un"
    ],
    "valor": [
        "valor", "valor unitario", "vunit", "vprod", "total", "valor total"
    ]
}

def _normalizar_texto(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9/% ]+", " ", s).strip()

def so_digitos(s: Any) -> str:
    return re.sub(r"\D", "", str(s or ""))

def padronizar_ncm(v: Any) -> str:
    s = str(v or "").strip()
    if re.search(r"[\d.]+[eE][+-]?\d+", s):
        return ""
    d = so_digitos(s)
    if len(d) == 7:  # zero à esquerda suprimido por Excel/CSV
        return d.zfill(8)
    return d

# ---------- Carregador da Fonte da Verdade (Tabela NCM Siscomex)
def carregar_ncms_oficiais(caminho_base: str | None = None) -> set[str]:
    candidatos = [
        caminho_base,
        os.path.join(os.path.dirname(__file__), "..", "data", "tabela_ncm.json"),
        os.path.join(os.path.dirname(__file__), "..", "public", "data", "ncm.json"),
        "F:\\Workspace\\Apps\\Aplicativo_MCM-\\data\\tabela_ncm.json",
        "F:\\IA Apks\\agente-ncm\\workspace-01a08e11-c1d0-7e0b-8e0d-0e46d34513de\\ncm-agent\\data\\tabela_ncm.json"
    ]
    for p in candidatos:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    dados = json.load(f)
                    ncms = set()
                    for item in dados:
                        cod = so_digitos(item.get("ncm") or item.get("codigo") or "")
                        if len(cod) == 8:
                            ncms.add(cod)
                    if ncms:
                        return ncms
            except Exception:
                continue
    return set()

def criar_validadores(ncms_validos: set[str]) -> dict[str, Callable[[str], bool]]:
    return {
        "ncm": lambda v: padronizar_ncm(v) in ncms_validos,
        "cest": lambda v: len(so_digitos(v)) == 7,
        "aliquota": lambda v: bool(re.fullmatch(r"\d{1,2}([.,]\d{1,4})?", str(v).strip())),
        "cfop": lambda v: len(so_digitos(v)) == 4 and so_digitos(v)[0] in "123567",
    }

# ---------- Tabelas (CSV / XLSX / HTML): Cabeçalho Semântico -> Perfil de Conteúdo
PERFILAR = {"ncm"}

def mapear_colunas(linhas: list[list[Any]], vals: dict[str, Callable[[str], bool]], scan: int = 25, minimo: float = 0.50, margem: float = 0.25):
    mapa = {}
    ini = 0
    metodo = "perfil"
    score_perfil = 0.0

    # a) Varredura de Cabeçalho: procura linha com >= 1 sinônimo relevante
    for i, l in enumerate(linhas[:scan]):
        achou = {}
        for j, cel in enumerate(l):
            norm = _normalizar_texto(cel)
            for c, sins in SINONIMOS.items():
                if norm in sins:
                    achou[c] = j
                    break
        if "ncm" in achou or "descricao" in achou:
            mapa = achou
            ini = i + 1
            metodo = "cabecalho"
            return ini, mapa, metodo, 1.0

    # b) Perfil de Conteúdo Estatístico: se não achou cabeçalho, busca coluna com densidade de NCMs válidos
    dados = linhas[ini:]
    if dados and "ncm" not in mapa:
        n_cols = max(len(r) for r in dados)
        validador_ncm = vals.get("ncm", lambda v: False)

        pont = []
        for j in range(n_cols):
            preenchidos = sum(1 for r in dados if j < len(r) and str(r[j]).strip())
            if preenchidos == 0:
                pont.append((0.0, j))
                continue
            validos = sum(1 for r in dados if j < len(r) and validador_ncm(padronizar_ncm(r[j])))
            taxa = validos / preenchidos
            pont.append((taxa, j))

        pont.sort(reverse=True, key=lambda x: x[0])
        melhor_taxa, col_melhor = pont[0]
        segunda_taxa = pont[1][0] if len(pont) > 1 else 0.0

        if melhor_taxa >= minimo and (melhor_taxa - segunda_taxa) >= margem:
            mapa["ncm"] = col_melhor
            metodo = "perfil"
            score_perfil = melhor_taxa

    return ini, mapa, metodo, score_perfil

def de_tabela(linhas: list[list[Any]], vals: dict[str, Callable[[str], bool]], origem_info: dict) -> Iterable[Registro]:
    ini, mapa, metodo, score_perfil = mapear_colunas(linhas, vals)

    tem_ncm = "ncm" in mapa
    tem_desc = "descricao" in mapa

    if not tem_ncm and not tem_desc:
        yield Registro(
            campos={},
            origem=OrigemRegistro(
                arquivo=origem_info.get("arquivo", "tabela"),
                metodo="falha-mapeamento",
                confianca=0.0,
                aba=origem_info.get("aba"),
                pagina=origem_info.get("pagina"),
                detalhes="Nenhuma coluna identificada como NCM ou Descrição do Produto"
            ),
            erros=["Formato não reconhecido: NCM e Descrição ausentes"]
        )
        return

    if tem_ncm:
        metodo_final = metodo
        confianca_base = 98.0 if metodo == "cabecalho" else round(max(50.0, score_perfil * 95.0), 1)
    else:
        metodo_final = "catalogo_para_classificar"
        confianca_base = 95.0

    for k, linha in enumerate(linhas[ini:], ini + 1):
        if not any(str(cel).strip() for cel in linha):
            continue

        campos = {}
        for campo, idx in mapa.items():
            if idx < len(linha):
                val = str(linha[idx]).strip()
                if campo == "ncm":
                    val = padronizar_ncm(val)
                campos[campo] = val

        erros = []
        if tem_ncm:
            ncm_val = campos.get("ncm", "")
            if not ncm_val:
                erros.append("NCM ausente na linha")
            elif "ncm" in vals and not vals["ncm"](ncm_val):
                erros.append(f"NCM {ncm_val!r} não localizado na Tabela Oficial vigente")
        else:
            if not campos.get("descricao"):
                erros.append("Descrição do produto ausente na linha do catálogo")

        for f, v in campos.items():
            if f != "ncm" and f in vals and v and not vals[f](v):
                erros.append(f"{f.upper()} inválido: {v!r}")

        conf = confianca_base if not erros else 0.0

        yield Registro(
            campos=campos,
            origem=OrigemRegistro(
                arquivo=origem_info.get("arquivo", "tabela"),
                metodo=metodo_final,
                confianca=conf,
                linha=k,
                aba=origem_info.get("aba"),
                pagina=origem_info.get("pagina"),
                detalhes="Catálogo para classificação no Nível 2" if metodo_final == "catalogo_para_classificar" else f"Mapeamento via {metodo_final}"
            ),
            erros=erros
        )

def de_csv_ou_planilha(path: str, vals: dict[str, Callable[[str], bool]]) -> Iterable[Registro]:
    try:
        import pandas as pd
        if path.lower().endswith((".xlsx", ".xls")):
            xl = pd.read_excel(path, header=None, dtype=str, sheet_name=None)
            for aba, df in xl.items():
                yield from de_tabela(df.fillna("").values.tolist(), vals, {"arquivo": path, "aba": aba})
            return
        else:
            df = pd.read_csv(path, header=None, dtype=str, sep=None, engine="python")
            yield from de_tabela(df.fillna("").values.tolist(), vals, {"arquivo": path, "aba": "csv"})
            return
    except ImportError:
        pass

    import csv
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        amostra = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(amostra, delimiters=";,\t|")
            reader = csv.reader(f, dialect)
        except Exception:
            reader = csv.reader(f, delimiter=";")
        linhas = [row for row in reader]
        yield from de_tabela(linhas, vals, {"arquivo": path, "aba": "csv-nativo"})

# ---------- XML: XPath Agnóstico a Namespace
def de_xml(path: str, vals: dict[str, Callable[[str], bool]]) -> Iterable[Registro]:
    try:
        from lxml import etree
        raiz = etree.parse(path)
        itens = raiz.xpath(".//*[local-name()='det']")
        usou_lxml = True
    except ImportError:
        import xml.etree.ElementTree as ET
        tree = ET.parse(path)
        raiz = tree.getroot()
        itens = [el for el in raiz.iter() if el.tag.split("}")[-1] == "det"]
        usou_lxml = False

    for i, item in enumerate(itens, 1):
        campos = {}
        if usou_lxml:
            def _get(xp):
                res = item.xpath(xp + "/text()")
                return str(res[0]).strip() if res else ""
            campos["ncm"] = padronizar_ncm(_get(".//*[local-name()='NCM']"))
            campos["cest"] = so_digitos(_get(".//*[local-name()='CEST']"))
            campos["descricao"] = _get(".//*[local-name()='xProd']")
            campos["cprod"] = _get(".//*[local-name()='cProd']")
            campos["cfop"] = _get(".//*[local-name()='CFOP']")
            campos["aliquota"] = _get(".//*[local-name()='pICMS']")
            campos["valor"] = _get(".//*[local-name()='vProd']")
        else:
            def _find(tag_nome):
                for el in item.iter():
                    if el.tag.split("}")[-1] == tag_nome:
                        return (el.text or "").strip()
                return ""
            campos["ncm"] = padronizar_ncm(_find("NCM"))
            campos["cest"] = so_digitos(_find("CEST"))
            campos["descricao"] = _find("xProd")
            campos["cprod"] = _find("cProd")
            campos["cfop"] = _find("CFOP")
            campos["aliquota"] = _find("pICMS")
            campos["valor"] = _find("vProd")

        erros = []
        ncm_val = campos.get("ncm", "")
        if not ncm_val:
            erros.append("Tag <NCM> ausente ou vazia no item")
        elif "ncm" in vals and not vals["ncm"](ncm_val):
            erros.append(f"NCM {ncm_val!r} não localizado na Tabela Oficial vigente")

        if campos.get("cest") and "cest" in vals and not vals["cest"](campos["cest"]):
            erros.append(f"CEST inválido: {campos['cest']!r}")

        conf = 100.0 if not erros else 0.0

        yield Registro(
            campos=campos,
            origem=OrigemRegistro(
                arquivo=path,
                metodo="xpath",
                confianca=conf,
                linha=i,
                detalhes="Extração estruturada de NF-e oficial"
            ),
            erros=erros
        )

# ---------- PDF: Tabelas com Grade -> Fallback Texto Corrido
def de_pdf(path: str, vals: dict[str, Callable[[str], bool]]) -> Iterable[Registro]:
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            achou_tabela = False
            for p, pag in enumerate(pdf.pages, 1):
                tabs = pag.extract_tables() or pag.extract_tables({"vertical_strategy": "text", "horizontal_strategy": "text"})
                if tabs:
                    achou_tabela = True
                    for t in tabs:
                        yield from de_tabela([[c or "" for c in l] for l in t], vals, {"arquivo": path, "pagina": p})
            if achou_tabela:
                return
    except ImportError:
        pass

    try:
        import pypdf
        reader = pypdf.PdfReader(path)
        txt = "\n".join([page.extract_text() or "" for page in reader.pages])
    except Exception:
        txt = ""

    yield from de_texto(txt, vals, {"arquivo": path})

# ---------- Texto Simples: Âncora Regex + Validação
RX_NCM = re.compile(r"(?<!\d)(\d{4}\.\d{2}\.\d{2}|\d{8})(?!\d)")

def de_texto(txt: str, vals: dict[str, Callable[[str], bool]], origem_info: dict) -> Iterable[Registro]:
    for i, linha in enumerate(txt.splitlines(), 1):
        linha_limpa = linha.strip()
        if not linha_limpa:
            continue
        for m in RX_NCM.finditer(linha_limpa):
            v = padronizar_ncm(m.group(1))
            valido = vals.get("ncm", lambda x: False)(v)
            conf = 85.0 if "." in m.group(1) else 75.0
            if not valido:
                conf = 0.0

            descricao = linha_limpa.replace(m.group(1), "").strip(" -;:|/[]()")
            yield Registro(
                campos={"ncm": v, "descricao": descricao},
                origem=OrigemRegistro(
                    arquivo=origem_info.get("arquivo", "texto"),
                    metodo="regex",
                    confianca=conf,
                    linha=i,
                    pagina=origem_info.get("pagina"),
                    detalhes="Extração via regex âncora"
                ),
                erros=[] if valido else [f"NCM {v!r} não localizado na Tabela Oficial vigente"]
            )

# ---------- Consolidação com Estatísticas e Métricas
def consolidar(regs: Iterable[Registro]) -> tuple[list[Registro], list[Registro], dict[str, Any]]:
    validos: list[Registro] = []
    quarentena: list[Registro] = []

    for r in regs:
        if r.is_valido:
            validos.append(r)
        else:
            quarentena.append(r)

    total = len(validos) + len(quarentena)
    confianca_media = (
        round(sum(r.origem.confianca for r in validos) / max(1, len(validos)), 1)
        if validos else 0.0
    )

    stats = {
        "total_registros": total,
        "validos_aprovados": len(validos),
        "quarentena_rejeitados": len(quarentena),
        "taxa_aprovacao_percentual": round((len(validos) / max(1, total)) * 100, 1),
        "confianca_media_validos": confianca_media,
    }

    return validos, quarentena, stats

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python extrator_multifonte.py <arquivo.xml|.csv|.xlsx|.pdf|.txt>")
        sys.exit(1)

    caminho = sys.argv[1]
    ncms = carregar_ncms_oficiais()
    vals = criar_validadores(ncms)
    print(f"[*] Base carregada: {len(ncms)} códigos NCM vigentes.")

    ext = os.path.splitext(caminho)[1].lower()
    if ext == ".xml":
        gerador = de_xml(caminho, vals)
    elif ext in [".xlsx", ".xls", ".csv"]:
        gerador = de_csv_ou_planilha(caminho, vals)
    elif ext == ".pdf":
        gerador = de_pdf(caminho, vals)
    else:
        with open(caminho, "r", encoding="utf-8", errors="replace") as f:
            gerador = de_texto(f.read(), vals, {"arquivo": caminho})

    validos, quarentena, stats = consolidar(gerador)

    print("\n" + "=" * 60)
    print("      RELATÓRIO DO EXTRATOR MULTIFONTE (NÍVEL 1)")
    print("=" * 60)
    for k, v in stats.items():
        print(f"  {k:30}: {v}")
    print("-" * 60)

    if quarentena:
        print(f"\n[!] ITENS EM QUARENTENA ({len(quarentena)}):")
        for q in quarentena[:5]:
            print(f"  - Linha {q.origem.linha}: Erros={q.erros} | Campos={q.campos}")

    if validos:
        print(f"\n[OK] EXEMPLOS DE ITENS VALIDOS ({len(validos)}):")
        for v in validos[:3]:
            print(f"  - NCM: {v.campos.get('ncm') or '(Pendente Nivel 2)'} | Desc: {v.campos.get('descricao', '')[:40]} | Confianca: {v.origem.confianca}% ({v.origem.metodo})")
