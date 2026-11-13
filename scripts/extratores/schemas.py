# -*- coding: utf-8 -*-
"""
MCM - Schemas Pydantic para Extração Tributária Estruturada (Gemini Pro)
Espelho estrito das interfaces TypeScript (lib/types/motor-tributario.ts).
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field

TipoNorma = Literal[
    "decreto",
    "resolucao",
    "convenio",
    "lei_complementar",
    "lei_ordinaria",
    "instrucao_normativa",
    "solucao_consulta"
]

Jurisdicao = Literal["PR", "Nacional"]
Tributo = Literal["ICMS", "IBS", "CBS", "IS", "IPI", "PIS", "COFINS"]
TipoRegra = Literal[
    "ST",
    "isencao",
    "reducao_bc",
    "diferimento",
    "aliquota_normal",
    "credito_presumido",
    "suspensao"
]
TipoOperacao = Literal[
    "uso_consumo",
    "revenda",
    "industrializacao",
    "ativo_imobilizado",
    "comercializacao"
]
RegimeDestinatario = Literal["simples", "presumido", "real", "todos"]


class FonteLegal(BaseModel):
    tipo_norma: TipoNorma = Field(description="Tipo de ato normativo oficial")
    numero: str = Field(description="Número identificador da norma (ex: 7871 ou 142)")
    ano: int = Field(description="Ano de publicação da norma (ex: 2017 ou 2018)")
    dispositivo: str = Field(description="Artigo, Anexo, Item ou Subitem legal citado")
    url: Optional[str] = Field(default="", description="Link oficial da legislação")


class RegraBeneficio(BaseModel):
    codigo_beneficio: str = Field(description="Código cBenef oficial (ex: PR800001, PR810002)")
    descricao: str = Field(description="Descrição da hipótese de benefício fiscal")
    vigencia_inicio: str = Field(description="Data de início de vigência no formato YYYY-MM-DD")
    vigencia_fim: Optional[str] = Field(default=None, description="Data de fim de vigência (YYYY-MM-DD)")
    cst_compativel: str = Field(description="CST ou lista de CSTs compatíveis (ex: 20, 40, 51)")
    fonte_legal: FonteLegal = Field(description="Norma legal de fundamentação")
    ncm_prefixos: List[str] = Field(default_factory=list, description="Lista de prefixos de NCM abrangidos")


class RegraSubstituicao(BaseModel):
    ncm_prefixo: List[str] = Field(description="Lista de códigos NCM (4, 6 ou 8 dígitos) abrangidos pela ST")
    cest: str = Field(description="Código CEST com 7 dígitos (ex: 0100100)")
    segmento: str = Field(description="Nome do segmento de mercadorias (ex: Autopeças, Materiais de Construção)")
    mva_original: float = Field(description="Margem de Valor Agregado Original em percentual (%)")
    mva_ajustada_12: Optional[float] = Field(default=None, description="MVA Ajustada para alíquota interestadual de 12% (%)")
    mva_ajustada_4: Optional[float] = Field(default=None, description="MVA Ajustada para alíquota interestadual de 4% (%)")
    aliquota_interna: float = Field(default=19.5, description="Alíquota interna do ICMS no destino (%)")
    fonte_legal: FonteLegal = Field(description="Norma de instituição da Substituição Tributária")


class RegraAnexoPr(BaseModel):
    id_regra: str = Field(description="Identificador único (ex: PR_RICMS_ANEXO_VI_ITEM_22)")
    anexo: Literal["V", "VI", "VIII", "IX", "X"] = Field(description="Anexo do RICMS/PR de origem")
    tipo_regra: TipoRegra = Field(description="Tipo de regra tributária")
    ncm_prefixos: List[str] = Field(description="Códigos NCM abrangidos")
    cst_sugerido: str = Field(description="CST sugerido pelo enquadramento (ex: 20, 40, 51, 60)")
    cBenef: Optional[str] = Field(default=None, description="Código de benefício cBenef correlato")
    aliquota_efetiva: Optional[float] = Field(default=None, description="Carga tributária efetiva final (%)")
    pRedBC: Optional[float] = Field(default=None, description="Percentual de redução da base de cálculo (%)")
    pDif: Optional[float] = Field(default=None, description="Percentual de diferimento parcial ou total (%)")
    mva_original: Optional[float] = Field(default=None, description="MVA original de ST se aplicável (%)")
    dispensa_estorno: bool = Field(default=False, description="Dispensa legal expressa de estorno na entrada")
    fonte_legal: FonteLegal = Field(description="Dispositivo exato do RICMS/PR")


# Modelos de Lote para Saída Estruturada
class LoteBeneficios(BaseModel):
    beneficios: List[RegraBeneficio] = Field(description="Lista de regras de benefícios fiscais extraídas")


class LoteSubstituicoes(BaseModel):
    substituicoes: List[RegraSubstituicao] = Field(description="Lista de correlações de Substituição Tributária extraídas")


class LoteAnexosPr(BaseModel):
    regras: List[RegraAnexoPr] = Field(description="Lista de regras do RICMS/PR extraídas")
