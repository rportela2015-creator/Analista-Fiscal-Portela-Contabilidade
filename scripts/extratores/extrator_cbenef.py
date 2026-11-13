# -*- coding: utf-8 -*-
"""
MCM - Extrator Específico: Tabela cBenef (Código de Benefício Fiscal SEFA/PR)
Utiliza Gemini Pro 1.5 e schemas.LoteBeneficios.
"""

import json
import logging
import sys
from pathlib import Path

cur_dir = Path(__file__).resolve().parent
if str(cur_dir) not in sys.path:
    sys.path.insert(0, str(cur_dir))

from gemini_client import GeminiClient
from schemas import LoteBeneficios, RegraBeneficio, FonteLegal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ExtratorCbenef")

PROMPT_CBENEF_SISTEMA = """
Você é um auditor fiscal perito da Receita Estadual do Paraná (SEFA/PR) especialista na Tabela de Código de Benefício Fiscal (cBenef - NT 2019.001).
Sua missão é extrair da documentação fornecida as regras de benefícios fiscais (cBenef), mapeando:
- `codigo_beneficio`: Código oficial no padrão PR (ex: PR800001, PR810002, PR820003).
- `descricao`: Descrição clara e concisa do benefício concedido.
- `vigencia_inicio`: Data inicial em formato YYYY-MM-DD.
- `vigencia_fim`: Data final se houver (ou null se vigente).
- `cst_compativel`: CST do ICMS obrigatório (ex: 20 para redução, 40/41 para isenção, 51 para diferimento).
- `fonte_legal`: Objeto com tipo de ato, número, ano e dispositivo legal (ex: Decreto 7871/2017, Anexo VI).
- `ncm_prefixos`: Lista de prefixos de NCM (4 a 8 dígitos) abrangidos pela hipótese legal.
Retorne estritamente o JSON compatível com o schema LoteBeneficios.
"""


def extrair_cbenef(texto_bruto: str, client: GeminiClient = None) -> dict:
    if client is None:
        client = GeminiClient()

    mock_contingencia = {
        "beneficios": [
            {
                "codigo_beneficio": "PR800001",
                "descricao": "Redução da base de cálculo nas operações com máquinas agrícolas para resultar em carga tributária de 5,6% (Convênio ICMS 52/1991).",
                "vigencia_inicio": "2017-10-01",
                "vigencia_fim": None,
                "cst_compativel": "20",
                "fonte_legal": {
                    "tipo_norma": "decreto",
                    "numero": "7871",
                    "ano": 2017,
                    "dispositivo": "Anexo VI, Item 22",
                    "url": "https://www.fazenda.pr.gov.br"
                },
                "ncm_prefixos": ["8432", "8433", "8701"]
            },
            {
                "codigo_beneficio": "PR810002",
                "descricao": "Isenção do ICMS nas saídas de produtos hortifrutigranjeiros em estado natural.",
                "vigencia_inicio": "2017-10-01",
                "vigencia_fim": None,
                "cst_compativel": "40",
                "fonte_legal": {
                    "tipo_norma": "decreto",
                    "numero": "7871",
                    "ano": 2017,
                    "dispositivo": "Anexo V, Artigo 2º",
                    "url": "https://www.fazenda.pr.gov.br"
                },
                "ncm_prefixos": ["0701", "0702", "0703", "0704", "0705"]
            }
        ]
    }

    return client.extrair_schema_json(
        prompt=PROMPT_CBENEF_SISTEMA,
        context_text=texto_bruto,
        pydantic_schema=LoteBeneficios,
        mock_fallback=mock_contingencia
    )


if __name__ == "__main__":
    exemplo_texto = """
    Tabela cBenef PR - Publicação SEFA/PR
    Código: PR800001 | CST: 20 | Início: 01/10/2017 | Dispositivo: Decreto 7871/2017 Anexo VI Item 22
    Descrição: Redução de BC em máquinas agrícolas posições 8432 e 8433 (Convênio ICMS 52/1991).
    """
    resultado = extrair_cbenef(exemplo_texto)
    print("\n[Extrator cBenef PR] Resultado estruturado:")
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
