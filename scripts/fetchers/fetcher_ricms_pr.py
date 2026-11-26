# -*- coding: utf-8 -*-
"""
MCM - Coletor Especializado: RICMS/PR (Regulamento do ICMS do Estado do Paraná)
Fetcher: FetcherRicmsPr

Baixa a versão oficial e consolidada da legislação tributária do Paraná
disponibilizada no portal da Secretaria da Fazenda (SEFA/PR), exige Content-Type
compatível, assinatura binária `%PDF-` e tamanho mínimo configurável (>= 50 KB).
Nunca sobrescreve o artefato válido anterior com resposta HTML ou stub corrompido.
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

# Adiciona o diretório scripts/fetchers ao sys.path se necessário
fetchers_dir = Path(__file__).resolve().parent
if str(fetchers_dir) not in sys.path:
    sys.path.insert(0, str(fetchers_dir))

from base_coletor import BaseFetcher


class FetcherRicmsPr(BaseFetcher):
    """Coletor do Regulamento do ICMS do Estado do Paraná (Decreto nº 7.871/2017 e alterações)."""

    MIN_BYTES_PDF = int(os.environ.get("RICMS_PR_MIN_BYTES", str(50 * 1024)))
    MAGIC_BYTES_PDF = b"%PDF-"
    CONTENT_TYPES_PDF = ("application/pdf", "application/octet-stream")

    # URL oficial PDF da SEFA/PR (sem espelhos HTML que induziam gravação de erro como PDF)
    URLS_RICMS_PR = [
        "https://www.fazenda.pr.gov.br/sites/default/arquivos_restritos/files/documento/2024-01/ricms_pr_consolidado.pdf",
    ]

    # Estrutura de anexos-alvo para parsing no pipeline tributário
    ANEXOS_ALVO = [
        {"anexo": "V", "descricao": "Alíquotas e Produtos com Alíquota Seletiva"},
        {"anexo": "VI", "descricao": "Isenções e Reduções de Base de Cálculo (Convênios CONFAZ)"},
        {"anexo": "VIII", "descricao": "Diferimento do ICMS (Parcial e Total)"},
        {"anexo": "IX", "descricao": "Substituição Tributária (ST) e MVAs"},
        {"anexo": "X", "descricao": "Créditos Presumidos e Incentivos Setoriais"},
    ]

    def __init__(self, base_dir: Path = None, min_bytes: int = None):
        super().__init__(nome_coletor="ricms_pr", base_dir=base_dir, timeout_segundos=45)
        if min_bytes is not None:
            self.MIN_BYTES_PDF = int(min_bytes)

    def _pdf_local_valido(self, caminho: Path) -> bool:
        if not caminho.exists() or not caminho.is_file():
            return False
        if caminho.stat().st_size < self.MIN_BYTES_PDF:
            return False
        with open(caminho, "rb") as f:
            return f.read(len(self.MAGIC_BYTES_PDF)) == self.MAGIC_BYTES_PDF

    def executar(self) -> Dict[str, Any]:
        """
        Executa o download blindado, validação (%PDF- + >= min_bytes) e versionamento do RICMS/PR.
        Em falha/bloqueio HTTP da SEFA/PR, preserva intacto o artefato válido anterior e registra erro
        claro em `ricms_pr_state.json` sem criar stub corrompido.
        """
        self.logger.info("=== Iniciando Coleta Oficial: RICMS/PR (Decreto Estadual PR) ===")
        nome_arquivo_canonico = "ricms_pr_oficial.pdf"
        sucesso = False
        registro: Dict[str, Any] = {}
        erros_por_url: List[Dict[str, str]] = []

        for url in self.URLS_RICMS_PR:
            try:
                self.logger.info(f"Tentando coletar PDF oficial de: {url}")
                caminho_baixado = self.baixar_arquivo(
                    url=url,
                    nome_arquivo_destino="ricms_pr_download.tmp",
                    content_types_aceitos=self.CONTENT_TYPES_PDF,
                    magic_bytes=self.MAGIC_BYTES_PDF,
                    min_bytes=self.MIN_BYTES_PDF,
                )

                metadados = {
                    "jurisdicao": "PR",
                    "tributo": "ICMS",
                    "decreto_base": "Decreto nº 7.871/2017",
                    "url_origem": url,
                    "anexos_alvo": self.ANEXOS_ALVO,
                }

                registro = self.registrar_versao_com_hash(
                    caminho_baixado=caminho_baixado,
                    nome_canônico=nome_arquivo_canonico,
                    metadados=metadados,
                )
                registro["status"] = "ok"
                self.salvar_estado(registro)
                sucesso = True
                break
            except Exception as e:
                msg = f"{type(e).__name__}: {e}"
                self.logger.warning(f"Coleta bloqueada/inválida em {url}: {msg}")
                erros_por_url.append({"url": url, "erro": msg})

        if not sucesso:
            caminho_existente = self.dir_raw / nome_arquivo_canonico
            estado_anterior = self.carregar_estado_anterior()
            valido_anterior = self._pdf_local_valido(caminho_existente)
            tentado_em = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            if valido_anterior:
                hash_atual = self.calcular_hash_sha256(caminho_existente)
                tam_atual = caminho_existente.stat().st_size
                self.logger.warning(
                    f"Coleta falhou; preservando PDF válido anterior ({tam_atual} bytes, sha256={hash_atual})."
                )
                registro = {
                    **estado_anterior,
                    "coletor": self.nome,
                    "status": "erro_coleta_preservado_anterior",
                    "arquivo_canonico": str(caminho_existente.relative_to(self.root_dir)),
                    "nome_canônico": nome_arquivo_canonico,
                    "hash_sha256": hash_atual,
                    "tamanho_bytes": tam_atual,
                    "alterado": False,
                    "tentado_em": tentado_em,
                    "ultimo_erro": erros_por_url[-1]["erro"] if erros_por_url else "Falha desconhecida",
                    "erros_por_url": erros_por_url,
                    "metadados": {"anexos_alvo": self.ANEXOS_ALVO},
                }
            else:
                self.logger.error(
                    "Coleta oficial do RICMS/PR falhou e não há PDF válido local. "
                    "Nenhum arquivo stub/corrompido será gravado."
                )
                registro = {
                    "coletor": self.nome,
                    "status": "erro_coleta",
                    "arquivo_canonico": None,
                    "nome_canônico": nome_arquivo_canonico,
                    "hash_sha256": None,
                    "tamanho_bytes": 0,
                    "alterado": False,
                    "tentado_em": tentado_em,
                    "ultimo_erro": erros_por_url[-1]["erro"] if erros_por_url else "Falha desconhecida",
                    "erros_por_url": erros_por_url,
                    "metadados": {"anexos_alvo": self.ANEXOS_ALVO},
                }

            self.salvar_estado(registro)

        return registro


if __name__ == "__main__":
    coletor = FetcherRicmsPr()
    res = coletor.executar()
    print("\n--- Resultado da Coleta (JSON) ---")
    import json
    print(json.dumps(res, indent=2, ensure_ascii=False))
