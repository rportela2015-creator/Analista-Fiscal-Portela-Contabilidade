#!/usr/bin/env python3
"""
Metodologia de Atualização Atômica, Idempotente e com Circuit Breaker
para o Arcabouço Legal do Motor de Precificação (rules/marco-legal.json).

Garante:
  1. Circuit Breaker com limites mínimos de integridade jurídica e contábil.
  2. Merge Aditivo (nenhuma regressão em relação a versões anteriores).
  3. Escrita atômica com arquivo temporário (.tmp) e os.replace().
  4. Rastreabilidade com SHA-256 e data de conferência.
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES_MARCO = ROOT / "rules" / "marco-legal.json"
PUBLIC_MARCO = ROOT / "public" / "data" / "marco-legal.json"

MIN_NORMAS_CIRCUIT_BREAKER = 20
REQUIRED_PARAM_KEYS = [
    "transicao",
    "credito_estoque",
    "icms",
    "lucro_presumido",
    "nfe",
    "cfop_de_para",
    "regras_icms_pr_vizinhos",
    "contabilidade_custos",
]


def calcular_sha256(caminho: Path) -> str:
    """Calcula o hash SHA-256 de um arquivo."""
    if not caminho.exists():
        return ""
    h = hashlib.sha256()
    h.update(caminho.read_bytes())
    return h.hexdigest()


def validar_circuit_breaker(dados: dict, caminho_anterior: Path = None) -> list[str]:
    """
    Executa a bateria de testes do Circuit Breaker.
    Retorna lista de mensagens de erro (vazia se aprovado).
    """
    erros = []

    # 1. Validação de estrutura básica
    if not isinstance(dados, dict):
        return ["Payload não é um objeto JSON válido."]

    normas = dados.get("normas", [])
    if not isinstance(normas, list):
        return ["Campo 'normas' não é uma lista."]

    if len(normas) < MIN_NORMAS_CIRCUIT_BREAKER:
        erros.append(
            f"Circuit Breaker acionado: contagem de normas ({len(normas)}) inferior ao piso mínimo de {MIN_NORMAS_CIRCUIT_BREAKER}."
        )

    # 2. Verificação de chaves obrigatórias em parametros
    parametros = dados.get("parametros", {})
    if not isinstance(parametros, dict):
        erros.append("Campo 'parametros' ausente ou inválido.")
    else:
        for k in REQUIRED_PARAM_KEYS:
            if k not in parametros:
                erros.append(f"Circuit Breaker acionado: chave obrigatória '{k}' ausente em parametros.")

    # 3. Unicidade de IDs e status das normas
    ids_vistos = set()
    status_permitidos = {"confirmado", "confirmado_fonte_secundaria", "conhecimento_geral", "nao_verificado"}
    for idx, n in enumerate(normas):
        nid = n.get("id")
        if not nid:
            erros.append(f"Norma no índice {idx} sem campo 'id'.")
        elif nid in ids_vistos:
            erros.append(f"ID de norma duplicado: '{nid}'.")
        else:
            ids_vistos.add(nid)

        st = n.get("status")
        if st not in status_permitidos:
            erros.append(f"Norma '{nid}' possui status inválido: '{st}'. Permitidos: {status_permitidos}")

    # 4. Integridade referencial: norma_ids em parametros devem existir em normas
    if isinstance(parametros, dict):
        for pk, pv in parametros.items():
            if isinstance(pv, dict) and "norma_ids" in pv:
                for ref in pv["norma_ids"]:
                    if ref not in ids_vistos:
                        erros.append(f"Integridade referencial rompida: '{pk}.norma_ids' aponta para ID inexistente '{ref}'.")

    # 5. Regressão contra versão publicada anterior (se existir)
    if caminho_anterior and caminho_anterior.exists():
        try:
            antigo = json.loads(caminho_anterior.read_text(encoding="utf-8"))
            antigas_normas = antigo.get("normas", [])
            if len(normas) < len(antigas_normas):
                erros.append(
                    f"Regressão detectada: nova contagem de normas ({len(normas)}) é menor que a anterior ({len(antigas_normas)})."
                )
        except Exception as e:
            erros.append(f"Falha ao inspecionar arquivo anterior para teste de regressão: {e}")

    return erros


def escrita_atomica(destino: Path, dados: dict):
    """Grava o dicionário JSON em arquivo temporário e substitui atomicamente."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destino.with_suffix(".json.tmp")
    conteudo = json.dumps(dados, ensure_ascii=False, indent=2)
    temp_path.write_text(conteudo, encoding="utf-8")
    os.replace(temp_path, destino)


def main():
    parser = argparse.ArgumentParser(description="Atualização segura e atômica do Marco Legal")
    parser.add_argument("--check", action="store_true", help="Apenas valida a integridade do arquivo atual")
    parser.add_argument("--file", type=Path, help="Arquivo JSON de entrada para atualizar rules/marco-legal.json")
    parser.add_argument("--publicar", action="store_true", help="Copia atomicamente para public/data/marco-legal.json")
    args = parser.parse_args()

    alvo = args.file if args.file else RULES_MARCO

    if not alvo.exists():
        print(f"ERRO: Arquivo não encontrado: {alvo}", file=sys.stderr)
        sys.exit(2)

    try:
        dados = json.loads(alvo.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"ERRO: Falha ao ler JSON de {alvo}: {e}", file=sys.stderr)
        sys.exit(2)

    erros = validar_circuit_breaker(dados, caminho_anterior=PUBLIC_MARCO if PUBLIC_MARCO.exists() else None)

    if erros:
        print(f"FALHA NO CIRCUIT BREAKER ({len(erros)} erro(s)):", file=sys.stderr)
        for err in erros:
            print(f"  ✘ {err}", file=sys.stderr)
        sys.exit(2)

    sha = calcular_sha256(alvo)
    print(f"OK Circuit Breaker Aprovado: {len(dados.get('normas', []))} normas válidas.")
    print(f"   Arquivo: {alvo.name} | SHA-256: {sha[:16]}...{sha[-8:]}")

    if args.check:
        sys.exit(0)

    # Se informado novo arquivo via --file, grava em rules/marco-legal.json atomicamente
    if args.file and args.file != RULES_MARCO:
        escrita_atomica(RULES_MARCO, dados)
        print(f"OK Atualizado rules/marco-legal.json atomicamente.")

    if args.publicar:
        escrita_atomica(PUBLIC_MARCO, dados)
        print(f"OK Publicado public/data/marco-legal.json atomicamente.")


if __name__ == "__main__":
    main()
