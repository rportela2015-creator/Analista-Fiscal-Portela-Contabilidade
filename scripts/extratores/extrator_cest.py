# -*- coding: utf-8 -*-
"""
MCM - Extrator Específico: Tabela CEST e Substituição Tributária (Convênio ICMS 142/2018 / Anexo IX RICMS/PR)
Utiliza Gemini Pro 1.5 e schemas.LoteSubstituicoes.
"""

import json
import logging
import sys
from pathlib import Path

cur_dir = Path(__file__).resolve().parent
if str(cur_dir) not in sys.path:
    sys.path.insert(0, str(cur_dir))

from gemini_client import GeminiClient
from schemas import LoteSubstituicoes, RegraSubstituicao, FonteLegal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ExtratorCest")

PROMPT_CEST_SISTEMA = """
Você é um auditor fiscal perito da Receita Estadual especialista no Convênio ICMS 142/2018 e no Anexo IX do RICMS/PR (Substituição Tributária).
Sua missão é extrair dos textos legais ou tabelas oficiais as regras de Substituição Tributária por CEST/NCM, mapeando:
- `ncm_prefixo`: Lista com os códigos ou prefixos de NCM (4, 6 ou 8 dígitos) aos quais a mercadoria se enquadra.
- `cest`: Código Especificador da Substituição Tributária oficial de 7 dígitos numéricos sem pontos (ex: 0100100).
- `segmento`: Descrição canônica do segmento econômico (ex: "Autopeças", "Materiais de Construção", "Bebidas Quentes").
- `mva_original`: Margem de Valor Agregado Original em percentual numérico (ex: 40.0 para 40%).
- `mva_ajustada_12`: Margem de Valor Agregado ajustada para operações interestaduais com alíquota de 12% (ou null).
- `mva_ajustada_4`: Margem de Valor Agregado ajustada para mercadorias importadas (alíquota interestadual de 4%) (ou null).
- `aliquota_interna`: Alíquota interna do ICMS no destino (padrão 19.5% no PR).
- `fonte_legal`: Objeto com o tipo_norma (convenio, decreto), número, ano e dispositivo legal.
Retorne estritamente o JSON compatível com o schema LoteSubstituicoes.
"""


def extrair_cest(texto_bruto: str, client: GeminiClient = None) -> dict:
    if client is None:
        client = GeminiClient()

    mock_contingencia = {
        "substituicoes": [
            {
                "ncm_prefixo": ["87082999", "8708"],
                "cest": "0100100",
                "segmento": "Autopeças",
                "mva_original": 40.0,
                "mva_ajustada_12": 53.03,
                "mva_ajustada_4": 67.24,
                "aliquota_interna": 19.5,
                "fonte_legal": {
                    "tipo_norma": "convenio",
                    "numero": "142",
                    "ano": 2018,
                    "dispositivo": "Anexo II, Item 1.0",
                    "url": "https://www.confaz.fazenda.gov.br"
                }
            },
            {
                "ncm_prefixo": ["68101900", "6810"],
                "cest": "1000100",
                "segmento": "Materiais de Construção, Acabamento, Bricolagem ou Adorno",
                "mva_original": 38.0,
                "mva_ajustada_12": 50.84,
                "mva_ajustada_4": 64.85,
                "aliquota_interna": 19.5,
                "fonte_legal": {
                    "tipo_norma": "convenio",
                    "numero": "142",
                    "ano": 2018,
                    "dispositivo": "Anexo XI, Item 1.0",
                    "url": "https://www.confaz.fazenda.gov.br"
                }
            }
        ]
    }

    return client.extrair_schema_json(
        prompt=PROMPT_CEST_SISTEMA,
        context_text=texto_bruto,
        pydantic_schema=LoteSubstituicoes,
        mock_fallback=mock_contingencia
    )


if __name__ == "__main__":
    exemplo_texto = """
    CONVÊNIO ICMS 142/2018 - ANEXO II (AUTOPEÇAS)
    Item: 1.0 | CEST: 01.001.00 | NCM/SH: 8708.29.99
    Descrição: Outras partes e acessórios de carroçarias para veículos automóveis.
    MVA Original: 40% | MVA Ajustada 12%: 53,03% | MVA Ajustada 4%: 67,24% | Alíquota interna: 19,5%
    """
    resultado = extrair_cest(exemplo_texto)
    print("\n[Extrator CEST/ST] Resultado estruturado:")
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
