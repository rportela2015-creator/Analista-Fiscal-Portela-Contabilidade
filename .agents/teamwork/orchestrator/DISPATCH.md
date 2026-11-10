# Dispatch Log

## 2026-11-09T14:24:22Z
Sender: a9ae1605-76bb-463b-826e-cff0614be367
Message:
Implementar a arquitetura e fluxo de auditoria de entrada de NF-e em duas etapas para produção: extração determinística imediata com apresentação tabular de produtos e tributos, seguida pela seleção de itens e códigos fiscais sensíveis para auditoria via IA Local (Ollama) em lotes/itens individuais ou IA Externa via API (Google Gemini), eliminando estouros de timeout na GPU RX 580.

Working directory: F:\Workspace\Apps\Aplicativo_MCM-
Integrity mode: development

## Requirements

### R1. Extração determinística imediata e exibição tabular
Extrair dados da nota fiscal (XML/PDF) de forma determinística imediata sem invocação prévia de modelos de linguagem (LLM). Apresentar na interface de auditoria uma tabela interativa contendo todos os produtos, tributos e códigos fiscais sensíveis (NCM, CFOP, CST/CSOSN, alíquotas e valores) extraídos da nota.

### R2. Seleção de itens e códigos fiscais sensíveis
Permitir ao usuário inspecionar os dados extraídos e selecionar individualmente ou em lote quais itens, produtos e códigos fiscais sensíveis que impactam a entrada da nota fiscal serão submetidos à auditoria pericial.

### R3. Auditoria seletiva com suporte a IA Local e IA Externa
Implementar a execução da auditoria para os itens selecionados com suporte a dois motores:
1. IA Local: Envio dos itens selecionados para o Ollama local (GPU RX 580) processados item a item ou em pequenos lotes para evitar estouro de timeout (180s) e sobrecarga de VRAM.
2. IA Externa via API: Opção de direcionar a auditoria dos itens selecionados para a Google Gemini API como alternativa/fallback externo configurável.

### R4. Foco estrito em dados fiscais sensíveis de entrada
Restringir o escopo pericial da auditoria aos dados sensíveis que afetam diretamente a escrituração e conformidade de entrada: códigos de produtos, correlação NCM/descrição, CST/CSOSN, CFOP, alíquotas e bases de cálculo de impostos (ICMS, IPI, PIS, COFINS, IBS/CBS), descartando processamento de dados não-tributários.

## Acceptance Criteria

### Extração Determinística e Visualização
- [ ] O upload de NF-e (XML/PDF) extrai e renderiza imediatamente a lista completa de produtos e tributos sem acionar o Ollama ou APIs externas de LLM.
- [ ] A interface exibe claramente em tabela os dados fiscais de cada item: código, descrição, NCM, CFOP, CST/CSOSN, valores e tributos.

### Seleção de Itens e Controle de Auditoria
- [ ] A interface disponibiliza seletores (checkboxes ou equivalente) para seleção individual e ações para selecionar todos ou desmarcar todos os itens.
- [ ] O usuário pode alternar a modalidade de auditoria entre IA Local (Ollama) e IA Externa (Google Gemini API) antes de disparar a análise.

### Performance e Resolução de Timeout na IA Local
- [ ] Notas fiscais com múltiplos itens não causam timeout de 180s na GPU RX 580; o processamento local particiona os itens selecionados (individualmente ou em pequenos lotes) e agrega as respostas.
- [ ] A auditoria com IA Externa (Google Gemini API) processa os itens selecionados com sucesso utilizando a chave configurada no ambiente.

### Qualidade e Foco Pericial
- [ ] Os laudos ou apontamentos de auditoria cobrem exclusivamente dados sensíveis de entrada (NCM, CFOP, impostos, divergências cadastrais e fiscais) sem alucinações sobre campos não selecionados.
- [ ] A equipe fornece testes automatizados ou scripts de validação para simular o fluxo com notas de múltiplos itens e atestar a ausência de timeout.
