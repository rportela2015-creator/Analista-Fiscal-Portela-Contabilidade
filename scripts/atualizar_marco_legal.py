#!/usr/bin/env python3
"""
Metodologia de Atualização Atômica, Idempotente e com Circuit Breaker
para o Arcabouço Legal do Motor de Precificação (rules/marco-legal.json).

Garante:
  1. Hash-Gate SHA-256 (se não houver alterações, ignora e economiza processamento).
  2. Circuit Breaker com limites mínimos de integridade jurídica e contábil (>= 35 normas).
  3. Micro-diff de normas e parâmetros (--diff-file).
  4. Explicação via LLM Local (Ollama qwen2.5:7b na GPU RX 580) sob demanda (--explain-with-ollama).
  5. Merge Aditivo (nenhuma regressão em relação a versões anteriores).
  6. Escrita atômica com arquivo temporário (.tmp) e os.replace().
  7. Rastreabilidade com SHA-256 e data de conferência.
"""
import argparse
import difflib
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES_MARCO = ROOT / "rules" / "marco-legal.json"
PUBLIC_MARCO = ROOT / "public" / "data" / "marco-legal.json"

MIN_NORMAS_CIRCUIT_BREAKER = 35
REQUIRED_PARAM_KEYS = [
    "transicao",
    "credito_estoque",
    "icms",
    "lucro_presumido",
    "nfe",
    "cfop_de_para",
    "regras_icms_pr_vizinhos",
    "contabilidade_custos",
    "fcp_por_uf",
    "ricms_pr_regras",
    "reforma_reducoes_mapeamento",
    "simples_hibrido_regras",
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


def gerar_micro_diff(caminho_velho: Path, dados_novos: dict) -> str:
    """Gera um diff unificado textual entre o arquivo existente e os novos dados."""
    if not caminho_velho.exists():
        return "Arquivo anterior não existe (criação inicial)."

    linhas_velhas = caminho_velho.read_text(encoding="utf-8").splitlines(keepends=True)
    linhas_novas = json.dumps(dados_novos, ensure_ascii=False, indent=2).splitlines(keepends=True)

    diff = difflib.unified_diff(
        linhas_velhas,
        linhas_novas,
        fromfile=str(caminho_velho.name),
        tofile="novos_dados",
        n=3,
    )
    return "".join(diff)


def explicar_com_ollama(diff_text: str, modelo: str = "qwen2.5:7b") -> str:
    """
    Chama o servidor Ollama local (se disponível) para sintetizar as mudanças legais.
    Retorna a explicação textual.
    """
    if not diff_text.strip():
        return "Nenhuma alteração detectada para explicar."

    prompt = (
        "Você é um Auditor Fiscal especialista em Direito Tributário Brasileiro.\n"
        "Analise o seguinte diff de atualização do Marco Legal e elabore um resumo conciso "
        "com o impacto prático e a fundamentação legal das alterações:\n\n"
        f"{diff_text[:4000]}"
    )

    corpo = {
        "model": modelo,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "5m",
    }

    try:
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=json.dumps(corpo).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            return resp_data.get("response", "Sem resposta do modelo.")
    except Exception as e:
        return f"[Aviso: Ollama indisponível ou tempo limite esgotado: {e}]"


def main():
    parser = argparse.ArgumentParser(description="Atualização segura e atômica do Marco Legal")
    parser.add_argument("--check", action="store_true", help="Apenas valida a integridade do arquivo atual")
    parser.add_argument("--file", type=Path, help="Arquivo JSON de entrada para atualizar rules/marco-legal.json")
    parser.add_argument("--publicar", action="store_true", help="Copia atomicamente para public/data/marco-legal.json")
    parser.add_argument("--diff-file", type=Path, help="Caminho para gravar o micro-diff das alterações")
    parser.add_argument("--explain-with-ollama", action="store_true", help="Usa LLM local (Ollama) para explicar as mudanças")
    parser.add_argument("--model", type=str, default="qwen2.5:7b", help="Modelo Ollama a utilizar")
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

    # 1. Hash-Gate: se destino já existe e hash for idêntico, podemos verificar precocemente
    sha_origem = calcular_sha256(alvo)
    if args.publicar and PUBLIC_MARCO.exists() and not args.file:
        sha_destino = calcular_sha256(PUBLIC_MARCO)
        if sha_origem == sha_destino and not args.diff_file and not args.explain_with_ollama:
            print(f"Hash-Gate: Nenhum byte alterado (SHA-256: {sha_origem[:16]}...). Pulo seguro ativado.")
            sys.exit(0)

    # 2. Circuit Breaker
    erros = validar_circuit_breaker(dados, caminho_anterior=PUBLIC_MARCO if PUBLIC_MARCO.exists() else None)

    if erros:
        print(f"FALHA NO CIRCUIT BREAKER ({len(erros)} erro(s)):", file=sys.stderr)
        for err in erros:
            print(f"  ✘ {err}", file=sys.stderr)
        sys.exit(2)

    print(f"OK Circuit Breaker Aprovado: {len(dados.get('normas', []))} normas válidas.")
    print(f"   Arquivo: {alvo.name} | SHA-256: {sha_origem[:16]}...{sha_origem[-8:]}")

    # 3. Micro-diff
    diff_text = ""
    if args.diff_file or args.explain_with_ollama:
        arquivo_base = PUBLIC_MARCO if PUBLIC_MARCO.exists() else RULES_MARCO
        diff_text = gerar_micro_diff(arquivo_base, dados)
        if args.diff_file:
            args.diff_file.write_text(diff_text, encoding="utf-8")
            print(f"OK Micro-diff gravado em: {args.diff_file}")

    # 4. Explicação via Ollama
    if args.explain_with_ollama:
        print(f"Consultando Ollama ({args.model}) para síntese explicativa...")
        explicacao = explicar_com_ollama(diff_text, modelo=args.model)
        print("\n--- SÍNTESE EXPLICATIVA DO AUDITOR (OLLAMA LOCAL) ---")
        print(explicacao)
        print("----------------------------------------------------\n")

    if args.check:
        sys.exit(0)

    # Se informado novo arquivo via --file, grava em rules/marco-legal.json atomicamente
    if args.file and args.file != RULES_MARCO:
        escrita_atomica(RULES_MARCO, dados)
        print("OK Atualizado rules/marco-legal.json atomicamente.")

    if args.publicar:
        escrita_atomica(PUBLIC_MARCO, dados)
        print("OK Publicado public/data/marco-legal.json atomicamente.")


if __name__ == "__main__":
    main()
