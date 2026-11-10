# Dispatch Log — Orchestrator Generation 2

## 2026-11-09T19:10:22Z
Implementar a arquitetura e fluxo de auditoria de entrada de NF-e em duas etapas para produção: extração determinística imediata com apresentação tabular de produtos e tributos, seguida pela seleção de itens e códigos fiscais sensíveis para auditoria via IA Local (Ollama) em lotes/itens individuais ou IA Externa via API (Google Gemini), eliminando estouros de timeout na GPU RX 580.

Working directory: F:\Workspace\Apps\Aplicativo_MCM-
Integrity mode: development

## Requirements
- R1. Extração determinística imediata e exibição tabular
- R2. Seleção de itens e códigos fiscais sensíveis
- R3. Auditoria seletiva com suporte a IA Local e IA Externa
- R4. Foco estrito em dados fiscais sensíveis de entrada

## Acceptance Criteria
- Extração Determinística e Visualização (upload XML/PDF imediato, tabela completa)
- Seleção de Itens e Controle de Auditoria (checkboxes, selecionar todos/sensíveis/nenhum, toggle Ollama/Gemini)
- Performance e Resolução de Timeout na IA Local (particionamento item a item / micro-lotes, sem timeout 180s na RX 580, Gemini API funcional)
- Qualidade e Foco Pericial (foco estrito em dados sensíveis de entrada, ausência de alucinações, testes automatizados)

## Succession Context
- Resumption point:
  * Milestone 1 SIGNED-OFF and PASSED
  * Milestone 2 implemented; requires remediation on M2 Iteration 2 (search filter, tri-state master checkbox count, test typecheck)
  * Verify & close M2 Gate
  * Proceed to Milestone 3 (Selective Partitioned AI Audit Engine)
  * Proceed to Milestone 4 (Final E2E Suite & Adversarial Hardening)
