# -*- coding: utf-8 -*-
"""
MCM - Framework de Coletores Fiscais Oficiais (Fetchers)
Classe Base: BaseFetcher

Provê utilitários para download resiliente de legislação (PDF, HTML, CSV, XLSX),
cálculo de hash criptográfico SHA-256 para auditoria pericial, versionamento
histórico em data/raw/historico/ e detecção de idempotência (evitando extrações redundantes).
"""

import hashlib
import json
import logging
import os
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
import urllib.request
import urllib.error

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)


class BaseFetcher:
    """Classe base para coletores de fontes legais e normativas."""

    def __init__(
        self,
        nome_coletor: str,
        base_dir: Optional[Path] = None,
        timeout_segundos: int = 60
    ):
        self.nome = nome_coletor
        self.logger = logging.getLogger(f"Fetcher.{nome_coletor}")
        self.timeout = timeout_segundos

        if base_dir is None:
            # Raiz do projeto a partir de scripts/fetchers/
            self.root_dir = Path(__file__).resolve().parent.parent.parent
        else:
            self.root_dir = Path(base_dir).resolve()

        self.dir_raw = self.root_dir / "data" / "raw"
        self.dir_historico = self.dir_raw / "historico"
        self.dir_controle = self.dir_raw / ".fetcher_state"

        self.dir_raw.mkdir(parents=True, exist_ok=True)
        self.dir_historico.mkdir(parents=True, exist_ok=True)
        self.dir_controle.mkdir(parents=True, exist_ok=True)

        self.arquivo_estado = self.dir_controle / f"{self.nome}_state.json"

    def calcular_hash_sha256(self, caminho_arquivo: Path) -> str:
        """Calcula o hash SHA-256 de um arquivo em disco via streaming de blocos."""
        sha256 = hashlib.sha256()
        with open(caminho_arquivo, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    def carregar_estado_anterior(self) -> Dict[str, Any]:
        """Recupera o registro da última execução e hash armazenado."""
        if self.arquivo_estado.exists():
            try:
                with open(self.arquivo_estado, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                self.logger.warning(f"Falha ao ler estado anterior ({e}). Reiniciando registro.")
        return {}

    def salvar_estado(self, info: Dict[str, Any]) -> None:
        """Persiste o estado atual da coleta para comparações subsequentes."""
        try:
            with open(self.arquivo_estado, "w", encoding="utf-8") as f:
                json.dump(info, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.logger.error(f"Erro ao salvar estado do coletor: {e}")

    def baixar_arquivo(
        self,
        url: str,
        nome_arquivo_destino: str,
        headers: Optional[Dict[str, str]] = None
    ) -> Path:
        """
        Efetua o download do arquivo a partir da URL oficial com User-Agent customizado.
        Salva temporariamente e retorna o caminho local.
        """
        headers_req = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36 MCM-Fetcher/1.0"
            ),
            "Accept": "*/*"
        }
        if headers:
            headers_req.update(headers)

        caminho_temp = self.dir_raw / f"temp_{nome_arquivo_destino}"
        self.logger.info(f"Iniciando download de {url} -> {nome_arquivo_destino}")

        req = urllib.request.Request(url, headers=headers_req)
        inicio = time.time()
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            with open(caminho_temp, "wb") as out_f:
                shutil.copyfileobj(resp, out_f)

        duracao = time.time() - inicio
        tamanho_bytes = caminho_temp.stat().st_size
        self.logger.info(
            f"Download concluído em {duracao:.2f}s ({tamanho_bytes / 1024:.1f} KB)"
        )
        return caminho_temp

    def registrar_versao_com_hash(
        self,
        caminho_baixado: Path,
        nome_canônico: str,
        metadados: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Calcula o hash SHA-256 do arquivo baixado.
        Se houve alteração em relação ao hash anterior:
          - Arquiva uma cópia carimbada com timestamp em data/raw/historico/
          - Atualiza o arquivo canônico em data/raw/
          - Atualiza o arquivo de estado
        Se não houve alteração, descarta o arquivo temporário (idempotente).
        """
        hash_atual = self.calcular_hash_sha256(caminho_baixado)
        estado_anterior = self.carregar_estado_anterior()
        hash_anterior = estado_anterior.get("hash_sha256")

        timestamp_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        timestamp_slug = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        caminho_canonico = self.dir_raw / nome_canônico
        houve_alteracao = hash_atual != hash_anterior or not caminho_canonico.exists()

        if houve_alteracao:
            self.logger.info(
                f"Novo conteúdo detectado para {nome_canônico}! "
                f"Hash anterior: {hash_anterior or 'NENHUM'} -> Novo: {hash_atual}"
            )

            # Salva cópia histórica imutável
            extensao = caminho_baixado.suffix
            stem = Path(nome_canônico).stem
            nome_historico = f"{stem}_{timestamp_slug}_{hash_atual[:8]}{extensao}"
            caminho_historico = self.dir_historico / nome_historico
            shutil.copy2(caminho_baixado, caminho_historico)
            self.logger.info(f"Versão histórica arquivada em: {caminho_historico.relative_to(self.root_dir)}")

            # Atualiza arquivo canônico
            shutil.move(str(caminho_baixado), str(caminho_canonico))
        else:
            self.logger.info(
                f"Conteúdo idêntico (Hash SHA-256: {hash_atual}). "
                "Nenhuma extração redundante necessária."
            )
            # Remove arquivo temporário
            if caminho_baixado.exists() and caminho_baixado != caminho_canonico:
                caminho_baixado.unlink()

        registro = {
            "coletor": self.nome,
            "arquivo_canonico": str(caminho_canonico.relative_to(self.root_dir)),
            "nome_canônico": nome_canônico,
            "hash_sha256": hash_atual,
            "alterado": houve_alteracao,
            "capturado_em": timestamp_iso,
            "tamanho_bytes": caminho_canonico.stat().st_size if caminho_canonico.exists() else 0,
            "metadados": metadados or {}
        }

        self.salvar_estado(registro)
        return registro
