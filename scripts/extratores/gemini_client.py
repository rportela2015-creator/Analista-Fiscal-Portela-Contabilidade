# -*- coding: utf-8 -*-
"""
MCM - Cliente Unificado da API Gemini Pro (gemini-1.5-pro)
Reutilizável para Saídas Estruturadas (Structured Outputs via Pydantic).
"""

import json
import logging
import os
from pathlib import Path
from typing import Type, TypeVar, Optional, Dict, Any

from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("GeminiClient")

T = TypeVar("T", bound=BaseModel)


class GeminiClient:
    """Cliente wrapper para Google Generative AI focado em Saídas Estruturadas JSON."""

    def __init__(self, api_key: Optional[str] = None, modelo: str = "gemini-1.5-pro"):
        self.root_dir = Path(__file__).resolve().parent.parent.parent
        self.api_key = api_key or self._carregar_api_key()
        self.modelo_nome = modelo
        self._configurado = False

        if self.api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self.genai = genai
                self._configurado = True
                logger.info(f"Cliente Gemini Pro configurado com sucesso (Modelo: {self.modelo_nome}).")
            except Exception as e:
                logger.warning(f"Erro ao inicializar SDK google.generativeai: {e}")
        else:
            logger.warning(
                "GEMINI_API_KEY não localizada em os.environ ou .env.local. "
                "Operando em modo dry-run para testes locais."
            )

    def _carregar_api_key(self) -> str:
        """Carrega GEMINI_API_KEY do ambiente ou do arquivo .env.local."""
        key = os.getenv("GEMINI_API_KEY", "")
        if key.strip():
            return key.strip()

        env_local = self.root_dir / ".env.local"
        if env_local.exists():
            try:
                with open(env_local, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY="):
                            parts = line.split("=", 1)
                            if len(parts) == 2 and parts[1].strip():
                                return parts[1].strip().strip('"').strip("'")
            except Exception as e:
                logger.warning(f"Erro ao ler .env.local: {e}")
        return ""

    def extrair_schema_json(
        self,
        prompt: str,
        context_text: str,
        pydantic_schema: Type[T],
        mock_fallback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Envia o contexto e o prompt para o Gemini Pro forçando retorno estrito validado pelo schema Pydantic.
        Retorna dicionário validado.
        """
        if not self._configurado:
            logger.info("Modo Dry-Run ativo (sem chave de API ativa). Retornando estrutura validada pelo schema...")
            if mock_fallback is not None:
                # Valida o mock contra o schema
                instancia = pydantic_schema.model_validate(mock_fallback)
                return instancia.model_dump()
            # Retorna instância padrão do modelo
            return pydantic_schema.model_construct().model_dump()

        try:
            modelo = self.genai.GenerativeModel(
                model_name=self.modelo_nome,
                system_instruction=prompt,
                generation_config=self.genai.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=pydantic_schema,
                    temperature=0.0
                )
            )

            prompt_usuario = (
                f"DOCUMENTO FONTE PARA EXTRAÇÃO:\n"
                f"----------------------------------------\n"
                f"{context_text}\n"
                f"----------------------------------------\n"
                f"Extraia e estruture os dados rigorosamente no schema JSON definido."
            )

            logger.info(f"Enviando requisição de extração ({len(context_text)} chars) para {self.modelo_nome}...")
            resposta = modelo.generate_content(prompt_usuario)
            json_texto = resposta.text.strip()

            instancia_validada = pydantic_schema.model_validate_json(json_texto)
            return instancia_validada.model_dump()

        except Exception as e:
            logger.error(f"Falha na extração estruturada do Gemini: {e}")
            if mock_fallback is not None:
                logger.info("Aplicando dados de contingência fornecidos...")
                return pydantic_schema.model_validate(mock_fallback).model_dump()
            raise
