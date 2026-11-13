# -*- coding: utf-8 -*-
"""
MCM - Extrator Específico: Anexos do RICMS/PR (Decreto Estadual 7.871/2017)
Anexo V (Isenção), Anexo VI (Redução de BC), Anexo VIII (Diferimento) e Anexo IX (ST).
Utiliza Gemini Pro 1.5 e schemas.LoteAnexosPr.
"""

import json
import logging
import sys
from pathlib import Path

cur_dir = Path(__file__).resolve().parent
if str(cur_dir) not in sys.path:
    sys.path.insert(0, str(cur_dir))

from gemini_client import GeminiClient
from schemas import LoteAnexosPr, RegraAnexoPr, FonteLegal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ExtratorAnexosPr")

PROMPT_ANEXOS_PR_SISTEMA = """
Você é um auditor fiscal perito da Receita Estadual do Paraná (SEFA/PR), especialista no Regulamento do ICMS do Paraná (RICMS/PR - Decreto 7.871/2017).
Sua missão é extrair dos textos legais os dispositivos tributários dos Anexos (V - Isenções, VI - Redução de BC, VIII - Diferimento e IX - Substituição Tributária), mapeando:
- `id_regra`: Identificador único padronizado (ex: PR_RICMS_ANEXO_VI_ITEM_22, PR_RICMS_ANEXO_VIII_ART_28).
- `anexo`: Um de "V", "VI", "VIII", "IX", "X".
- `tipo_regra`: Tipo tributário ("isencao", "reducao_bc", "diferimento", "ST", "suspensao").
- `ncm_prefixos`: Lista de códigos NCM ou capítulos/posições abrangidos.
- `cst_sugerido`: CST ou CSOSN aplicável (ex: "20" para redução, "40" para isenção, "51" para diferimento, "60" para ST).
- `cBenef`: Código de benefício fiscal correspondente se houver (ex: PR800001).
- `aliquota_efetiva`: Carga tributária efetiva em % (ex: 5.6 para máquinas agrícolas).
- `pRedBC`: Percentual de redução de base de cálculo em % (ex: 71.28).
- `pDif`: Percentual de diferimento em % (ex: 33.33 para diferimento parcial do ICMS no PR).
- `mva_original`: Margem de agregação original se for ST (ou null).
- `dispensa_estorno`: Booleano indicando se o dispositivo expressamente dispensa o estorno do crédito na entrada.
- `fonte_legal`: Objeto com tipo_norma, número, ano, dispositivo e url oficial.
Retorne estritamente o JSON compatível com o schema LoteAnexosPr.
"""


def extrair_anexos_pr(texto_bruto: str, client: GeminiClient = None) -> dict:
    if client is None:
        client = GeminiClient()

    mock_contingencia = {
        "regras": [
            {
                "id_regra": "PR_RICMS_ANEXO_VI_ITEM_22",
                "anexo": "VI",
                "tipo_regra": "reducao_bc",
                "ncm_prefixos": ["8432", "8433", "8701"],
                "cst_sugerido": "20",
                "cBenef": "PR800001",
                "aliquota_efetiva": 5.6,
                "pRedBC": 71.28,
                "pDif": None,
                "mva_original": None,
                "dispensa_estorno": True,
                "fonte_legal": {
                    "tipo_norma": "decreto",
                    "numero": "7871",
                    "ano": 2017,
                    "dispositivo": "Anexo VI, Item 22 (Máquinas Agrícolas)",
                    "url": "https://www.fazenda.pr.gov.br"
                }
            },
            {
                "id_regra": "PR_RICMS_ANEXO_VIII_ART_28",
                "anexo": "VIII",
                "tipo_regra": "diferimento",
                "ncm_prefixos": ["8432", "8433", "8708"],
                "cst_sugerido": "51",
                "cBenef": "PR820003",
                "aliquota_efetiva": 13.0,
                "pRedBC": None,
                "pDif": 33.33,
                "mva_original": None,
                "dispensa_estorno": False,
                "fonte_legal": {
                    "tipo_norma": "decreto",
                    "numero": "7871",
                    "ano": 2017,
                    "dispositivo": "Anexo VIII, Art. 28 (Diferimento Parcial)",
                    "url": "https://www.fazenda.pr.gov.br"
                }
            },
            {
                "id_regra": "PR_RICMS_ANEXO_V_ART_2",
                "anexo": "V",
                "tipo_regra": "isencao",
                "ncm_prefixos": ["0701", "0702", "0703", "0704"],
                "cst_sugerido": "40",
                "cBenef": "PR810002",
                "aliquota_efetiva": 0.0,
                "pRedBC": None,
                "pDif": None,
                "mva_original": None,
                "dispensa_estorno": True,
                "fonte_legal": {
                    "tipo_norma": "decreto",
                    "numero": "7871",
                    "ano": 2017,
                    "dispositivo": "Anexo V, Artigo 2º (Hortifrutícolas)",
                    "url": "https://www.fazenda.pr.gov.br"
                }
            }
        ]
    }

    return client.extrair_schema_json(
        prompt=PROMPT_ANEXOS_PR_SISTEMA,
        context_text=texto_bruto,
        pydantic_schema=LoteAnexosPr,
        mock_fallback=mock_contingencia
    )


if __name__ == "__main__":
    exemplo_texto = """
    DECRETO Nº 7.871/2017 - RICMS/PR
    ANEXO VI - DA REDUÇÃO NA BASE DE CÁLCULO
    Item 22. Fica reduzida a base de cálculo nas operações com máquinas e implementos agrícolas
    relacionados no Convênio ICMS 52/1991 (posições NCM 8432, 8433, 8701), de forma que a carga
    tributária resulte no percentual equivalente a 5,6% (cinco inteiros e seis décimos por cento).
    Não se exigirá o estorno do crédito do imposto relativo às entradas (dispensa de estorno).
    """
    resultado = extrair_anexos_pr(exemplo_texto)
    print("\n[Extrator Anexos RICMS/PR] Resultado estruturado:")
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
