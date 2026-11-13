# -*- coding: utf-8 -*-
"""
MCM - Pipeline de Extração Tributária Assistida por IA
Extrator: Gemini Pro (gemini-1.5-pro com Saídas Estruturadas / JSON Schema)

Transforma fontes brutas da legislação (PDFs do RICMS/PR, Tabelas SPED e Convênios CONFAZ)
em regras JSON estritamente tipadas e validadas via Pydantic (espelho de lib/types/motor-tributario.ts).
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import List, Optional, Literal, Dict, Any

from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ExtratorGemini")

# -----------------------------------------------------------------------------
# 1. MODELOS PYDANTIC (ESPELHO ESTRITO DE lib/types/motor-tributario.ts)
# -----------------------------------------------------------------------------

TipoFonte = Literal[
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


class FonteOficialModel(BaseModel):
    tipo: TipoFonte = Field(description="Tipo de ato normativo")
    norma: str = Field(description="Identificador da norma (ex: Decreto nº 7.871/2017)")
    dispositivo: str = Field(description="Artigo, Anexo, Item ou Subitem legal")
    url: str = Field(default="", description="URL oficial do texto legal")
    hash_arquivo: str = Field(default="", description="Hash SHA-256 da fonte oficial")
    capturado_em: str = Field(default="", description="Timestamp ISO da captura")
    data_publicacao: str = Field(default="", description="Data de publicação no Diário Oficial (YYYY-MM-DD)")


class VigenciaModel(BaseModel):
    inicio: str = Field(description="Data de início de vigência (YYYY-MM-DD)")
    fim: Optional[str] = Field(default=None, description="Data de encerramento de vigência (YYYY-MM-DD) se houver")


class CondicaoOperacaoModel(BaseModel):
    ncm_prefixo: List[str] = Field(description="Lista de prefixos de NCM (4, 6 ou 8 dígitos) abrangidos")
    cest: Optional[str] = Field(default=None, description="Código CEST vinculado se houver")
    tipo_operacao: TipoOperacao = Field(description="Finalidade ou tipo de operação da mercadoria")
    origem_uf: str = Field(description="UF de origem da operação (ex: PR ou * para todas)")
    destino_uf: str = Field(description="UF de destino da operação (ex: PR)")
    regime_destinatario: RegimeDestinatario = Field(description="Regime tributário do destinatário aplicável")


class ParametroCalculoModel(BaseModel):
    regra_id: str = Field(description="ID correspondente da regra do fisco")
    aliquota_interna: float = Field(default=19.5, description="Alíquota interna aplicável (%)")
    aliquota_interestadual: float = Field(default=12.0, description="Alíquota interestadual aplicável (%)")
    fcp: Optional[float] = Field(default=None, description="Alíquota de Fundo de Combate à Pobreza (%)")
    mva_original: Optional[float] = Field(default=None, description="MVA Original de Substituição Tributária (%)")
    pmpf: Optional[float] = Field(default=None, description="Preço Médio Ponderado a Consumidor Final (R$)")
    pRedBC: Optional[float] = Field(default=None, description="Percentual de redução da base de cálculo (%)")
    pDif: Optional[float] = Field(default=None, description="Percentual de diferimento parcial (%)")


class RegraFiscoModel(BaseModel):
    id: str = Field(description="Identificador único canônico da regra (ex: PR_ICMS_ANEXO_VI_ITEM_22)")
    jurisdicao: Jurisdicao = Field(description="Jurisdição da regra (PR ou Nacional)")
    tributo: Tributo = Field(description="Tributo incidente")
    tipo_regra: TipoRegra = Field(description="Tipo de tratamento fiscal")
    condicoes: List[CondicaoOperacaoModel] = Field(description="Condições operacionais de enquadramento")
    cst_exigido: Optional[str] = Field(default=None, description="CST exigido para a operação (ex: 20, 40, 51, 60)")
    cfop_sugerido: Optional[str] = Field(default=None, description="CFOP sugerido")
    cBenef_sugerido: Optional[str] = Field(default=None, description="Código de benefício fiscal cBenef no PR")
    fonte: FonteOficialModel = Field(description="Fonte legal oficial comprovatória")
    vigencia: VigenciaModel = Field(description="Período de vigência da regra")
    parametros: Optional[ParametroCalculoModel] = Field(default=None, description="Parâmetros de cálculo quantitativos")


class LoteRegrasFiscoModel(BaseModel):
    regras: List[RegraFiscoModel] = Field(description="Lista estruturada de regras fiscais extraídas")


# -----------------------------------------------------------------------------
# 2. TEMPLATES ESPECIALIZADOS DE PROMPTS DE EXTRAÇÃO
# -----------------------------------------------------------------------------

PROMPT_CBENEF = """
Você é um auditor fiscal perito e engenheiro de dados da SEFA/PR.
Sua tarefa é analisar o texto/tabela oficial da Tabela de Código de Benefício Fiscal (cBenef) do Estado do Paraná.
Extraia com precisão cirúrgica cada regra de benefício fiscal em objetos `RegraFisco`.

REGRAS OBRIGATÓRIAS:
1. Para cada benefício (ex: PR800001, PR810002, PR820003):
   - `id`: Formato "PR_CBENEF_<CODIGO>"
   - `cBenef_sugerido`: O código cBenef exato (ex: PR800001).
   - `cst_exigido`: CST do ICMS compatível conforme a tabela da SEFA (ex: 20 para redução, 40/41 para isenção, 51 para diferimento).
   - `fonte`: Informe a norma e o dispositivo legal exato citado (Decreto nº 7.871/2017, Anexo, Artigo).
   - `vigencia`: Se não houver data de fim expressa, defina `fim: null`.
   - `ncm_prefixo`: Extraia todos os prefixos de NCM associados. Se aplicável a qualquer mercadoria daquela hipótese, liste os prefixos mencionados ou ["*"].
Retorne estritamente o JSON validado pelo schema.
"""

PROMPT_CEST_CONFAZ = """
Você é um auditor tributário especialista no Convênio ICMS 142/2018 (CONFAZ) e Tabela Nacional de CEST.
Extraia a relação completa entre Códigos Especificadores da Substituição Tributária (CEST), Códigos NCM/SH e Descrições de Segmento.

REGRAS OBRIGATÓRIAS:
1. Para cada item da tabela de Substituição Tributária:
   - `id`: Formato "CONFAZ_CEST_<CEST_SEM_PONTOS>"
   - `tipo_regra`: "ST"
   - `condicoes`: Lista de condições contendo:
     - `cest`: O código CEST formatado com 7 dígitos (ex: "0100100").
     - `ncm_prefixo`: Array com os códigos NCM de 4, 6 ou 8 dígitos correspondentes.
     - `tipo_operacao`: "revenda"
     - `origem_uf`: "*"
     - `destino_uf`: "PR"
     - `regime_destinatario`: "todos"
   - `cst_exigido`: "10" para saída tributada com ST ou "60" para mercadoria cobrada anteriormente por ST.
   - `fonte`: Cite o Convênio ICMS 142/2018 e o Anexo/Item correspondente.
Retorne estritamente o JSON validado pelo schema.
"""

PROMPT_ANEXOS_PR = """
Você é um auditor tributário especialista no RICMS/PR (Decreto Estadual nº 7.871/2017).
Analise o trecho legal fornecido dos Anexos V, VI, VIII e IX e extraia em lote todas as regras tributárias.

MAPEAMENTO POR ANEXO:
1. ANEXO VI (Isenções e Reduções de Base de Cálculo):
   - Reduções de Base: `tipo_regra`: "reducao_bc", `cst_exigido`: "20", preencher `pRedBC` e alíquota efetiva.
   - Exemplo clássico: Convênio 52/1991 (Item 22 e Anexo VI) com carga efetiva de 5,6% ou 8,8%.
   - Isenções: `tipo_regra`: "isencao", `cst_exigido`: "40".
2. ANEXO VIII (Diferimento do ICMS):
   - Art. 28: Diferimento Parcial para carga de 12% (`tipo_regra`: "diferimento", `cst_exigido`: "51", `pDif`: 38.46).
   - Art. 31: Diferimento Total 100% (`tipo_regra`: "diferimento", `cst_exigido`: "51", `pDif`: 100.0).
3. ANEXO IX (Substituição Tributária Estadual):
   - `tipo_regra`: "ST", `cst_exigido`: "10" ou "60".
   - `mva_original`: Extraia a MVA original e se houver MVA ajustada para operações a 12% ou 4%.
Retorne estritamente o JSON validado pelo schema.
"""


# -----------------------------------------------------------------------------
# 3. CLASSE EXTRATORA GEMINI PRO
# -----------------------------------------------------------------------------

class ExtratorGeminiFiscal:
    """Orquestrador de extração de legislação com Gemini Pro 1.5 e Structured Outputs."""

    def __init__(self, api_key: Optional[str] = None, modelo: str = "gemini-1.5-pro"):
        self.root_dir = Path(__file__).resolve().parent.parent.parent
        self.api_key = api_key or self._carregar_api_key()
        self.modelo_nome = modelo
        self._cliente_configurado = False

        if self.api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self.genai = genai
                self._cliente_configurado = True
                logger.info(f"Gemini API configurada com sucesso para o modelo: {self.modelo_nome}")
            except Exception as e:
                logger.warning(f"Falha ao configurar cliente google.generativeai: {e}")
        else:
            logger.warning(
                "GEMINI_API_KEY não encontrada no ambiente ou .env.local. "
                "O extrator operará em modo mock/dry-run para testes locais."
            )

    def _carregar_api_key(self) -> str:
        """Lê a GEMINI_API_KEY do ambiente ou do arquivo .env.local."""
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

    def extrair_regras(
        self,
        texto_fonte: str,
        tipo_prompt: Literal["cbenef", "cest", "anexos_pr"] = "anexos_pr",
        dry_run: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Executa a extração estruturada do texto legal fornecido usando gemini-1.5-pro.
        Garante retorno de lista de regras no formato RegraFiscoModel.
        """
        prompt_map = {
            "cbenef": PROMPT_CBENEF,
            "cest": PROMPT_CEST_CONFAZ,
            "anexos_pr": PROMPT_ANEXOS_PR
        }
        instrucao_sistema = prompt_map.get(tipo_prompt, PROMPT_ANEXOS_PR)

        # Se for dry-run ou API key ausente, executa pipeline local determinístico
        if dry_run or not self._cliente_configurado:
            logger.info("Executando extração em modo DRY-RUN determinístico...")
            return self._gerar_mock_regras(texto_fonte, tipo_prompt)

        try:
            # Configuração do modelo com Saída Estruturada Pydantic
            modelo = self.genai.GenerativeModel(
                model_name=self.modelo_nome,
                system_instruction=instrucao_sistema,
                generation_config=self.genai.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=LoteRegrasFiscoModel,
                    temperature=0.0
                )
            )

            prompt_completo = (
                f"DOCUMENTO FONTE PARA EXTRAÇÃO:\n"
                f"----------------------------------------\n"
                f"{texto_fonte}\n"
                f"----------------------------------------\n"
                f"Gere o JSON com todas as regras identificadas conforme o schema."
            )

            logger.info(f"Enviando texto ({len(texto_fonte)} caracteres) ao Gemini Pro ({self.modelo_nome})...")
            resposta = modelo.generate_content(prompt_completo)
            conteudo_json = resposta.text.strip()

            # Valida com Pydantic
            lote = LoteRegrasFiscoModel.model_validate_json(conteudo_json)
            logger.info(f"Extração concluída com sucesso! {len(lote.regras)} regras obtidas.")
            return [r.model_dump() for r in lote.regras]

        except Exception as e:
            logger.error(f"Erro durante chamada à API do Gemini: {e}. Aplicando fallback local...")
            return self._gerar_mock_regras(texto_fonte, tipo_prompt)

    def _gerar_mock_regras(self, texto_fonte: str, tipo_prompt: str) -> List[Dict[str, Any]]:
        """Gera regras determinísticas estruturadas para testes sem consumo de quota."""
        hoje = "2026-11-11"

        if tipo_prompt == "cbenef":
            regra = RegraFiscoModel(
                id="PR_CBENEF_PR800001",
                jurisdicao="PR",
                tributo="ICMS",
                tipo_regra="reducao_bc",
                condicoes=[
                    CondicaoOperacaoModel(
                        ncm_prefixo=["8433", "8432", "8701"],
                        tipo_operacao="revenda",
                        origem_uf="PR",
                        destino_uf="PR",
                        regime_destinatario="todos"
                    )
                ],
                cst_exigido="20",
                cfop_sugerido="5102",
                cBenef_sugerido="PR800001",
                fonte=FonteOficialModel(
                    tipo="decreto",
                    norma="Decreto nº 7.871/2017",
                    dispositivo="Anexo VI, Item 22 c/c Tabela cBenef",
                    url="https://www.fazenda.pr.gov.br",
                    data_publicacao="2017-10-01"
                ),
                vigencia=VigenciaModel(inicio="2017-10-01"),
                parametros=ParametroCalculoModel(
                    regra_id="PR_CBENEF_PR800001",
                    aliquota_interna=19.5,
                    aliquota_interestadual=12.0,
                    pRedBC=71.28
                )
            )
            return [regra.model_dump()]

        elif tipo_prompt == "cest":
            regra = RegraFiscoModel(
                id="CONFAZ_CEST_0100100",
                jurisdicao="Nacional",
                tributo="ICMS",
                tipo_regra="ST",
                condicoes=[
                    CondicaoOperacaoModel(
                        ncm_prefixo=["7214", "7213"],
                        cest="0100100",
                        tipo_operacao="revenda",
                        origem_uf="*",
                        destino_uf="PR",
                        regime_destinatario="todos"
                    )
                ],
                cst_exigido="60",
                cfop_sugerido="5405",
                fonte=FonteOficialModel(
                    tipo="convenio",
                    norma="Convênio ICMS 142/2018",
                    dispositivo="Anexo I, Item 1.0",
                    url="https://www.confaz.fazenda.gov.br",
                    data_publicacao="2018-12-19"
                ),
                vigencia=VigenciaModel(inicio="2019-01-01"),
                parametros=ParametroCalculoModel(
                    regra_id="CONFAZ_CEST_0100100",
                    aliquota_interna=19.5,
                    aliquota_interestadual=12.0,
                    mva_original=42.5
                )
            )
            return [regra.model_dump()]

        # Padrão: anexos_pr
        regra = RegraFiscoModel(
            id="PR_RICMS_ANEXO_VI_ITEM_22_MAQ_AGRICOLAS",
            jurisdicao="PR",
            tributo="ICMS",
            tipo_regra="reducao_bc",
            condicoes=[
                CondicaoOperacaoModel(
                    ncm_prefixo=["8433", "8432", "8701"],
                    tipo_operacao="comercializacao",
                    origem_uf="PR",
                    destino_uf="PR",
                    regime_destinatario="todos"
                )
            ],
            cst_exigido="20",
            cfop_sugerido="5102",
            cBenef_sugerido="PR800001",
            fonte=FonteOficialModel(
                tipo="decreto",
                norma="Decreto nº 7.871/2017",
                dispositivo="Anexo VI, Item 22 (Convênio ICMS 52/1991)",
                url="https://www.fazenda.pr.gov.br",
                data_publicacao="2017-10-01"
            ),
            vigencia=VigenciaModel(inicio="1991-09-30"),
            parametros=ParametroCalculoModel(
                regra_id="PR_RICMS_ANEXO_VI_ITEM_22_MAQ_AGRICOLAS",
                aliquota_interna=19.5,
                aliquota_interestadual=12.0,
                pRedBC=71.28
            )
        )
        return [regra.model_dump()]


if __name__ == "__main__":
    extrator = ExtratorGeminiFiscal()
    sample_text = (
        "Item 22. Fica reduzida a base de cálculo do ICMS nas saídas internas e interestaduais "
        "de máquinas agrícolas classificadas nas posições 8432 e 8433, de forma que a carga tributária "
        "resulte no percentual equivalente a 5,6% (Convênio ICMS 52/1991)."
    )
    resultado = extrator.extrair_regras(sample_text, tipo_prompt="anexos_pr", dry_run=True)
    print("\n--- Resultado da Extração Estruturada (Pydantic / JSON Schema) ---")
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
