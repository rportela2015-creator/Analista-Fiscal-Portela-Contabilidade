# Diretrizes Globais do Projeto (Agents & Skills)

Este arquivo contém o contexto e regras gerais para agentes IA executarem tarefas neste repositório.

## 1. Arquitetura e Regras de Negócio

- O motor de classificação (`lib/engine.ts`) utiliza um sistema de pontuação em múltiplas camadas baseado em pesquisa de dicionários com stemmers.
- As regras de classificação devem ser sempre estritamente baseadas em dados orientados via o dicionário (`rules/rules.json`). Não codifique textos específicos ou códigos NCM de forma explícita (hardcoded) no algoritmo genérico do motor.

## 2. Tech Stack

- Utilizamos `@google/genai` (SDK nativo do Gemini, atualmente `gemini-3.8-flash`) para geração de IA forçando saídas em JSON via `responseSchema`.
- Relatórios server-side são gerados com texto puro/markdown (substituindo o pdfkit para evitar problemas de compilação no Windows).
- Parser de XML: `fast-xml-parser`.
- Extração de texto em PDFs: `pdf-parse`.
- Validação de entrada e esquema de API: `zod`.

## 3. Diretrizes de UI

- Ao adicionar novos componentes de UI/abas, eles devem ser importados dinamicamente e adicionados no array de testes no arquivo `scripts/ui-entry.tsx` no formato `[Component, 'Tab Name', /regex/i]` para que os testes de fumaça de UI (custom UI smoke tests) os executem adequadamente.

## 4. Testes e Validações

- O projeto usa um test runner customizado e leve usando a sintaxe `t(name, fn)` e `node:assert/strict` para asserções (em vez de frameworks padrão como Jest).
- Módulos internos são acessados nos testes via `import { mods } from 'ncm:libs'`.
- Para executar a suíte de testes: `npm run test` ou `node scripts/test.mjs`.
- Para verificação de tipos TypeScript estática em todo o projeto: `npm run typecheck`.
- **Importante:** Quando um novo arquivo de teste é criado, o caminho dele deve ser explicitamente adicionado no array `entries` do arquivo `scripts/test.mjs` para o test runner customizado conseguir localizá-lo e executá-lo.

## 5. Fluxo de Dados (Pipeline)

- Para reconstruir os datasets de JSON (ex: após modificar `rules/rules.json`), execute `python3 scripts/pipeline.py`. Isso é mandatório antes de rodar os testes se as regras de dados foram alteradas.

## 6. Precedência de Instruções

- Solicitações do usuário sempre substituem instruções das memórias.
- O código atual é a fonte verdadeira do estado do repositório (source of truth). O que está neste arquivo/memória serve de apoio para o contexto histórico.

## 7. Fluxos de Operação dos Agentes Locais (Terminal & IA Local)

### Fluxo 1 — Agente Autônomo de Código (omp):
- **Como acionar**: Digite omp no terminal do Antigravity.
- **Ambiente**: Abre a interface v1.5.0 já conectada ao qwen3.5:4b ou qwen2.5:7b (via Ollama local em http://127.0.0.1:11434/v1).
- **Ferramentas de Busca**: Utiliza nativamente o d.exe e g.exe do disco F: para ler e editar os arquivos do Aplicativo_MCM- diretamente, sem consumir a cota do Google AI Pro.
- **Alternância de Modelos**: Para alternar entre o qwen3.5:4b (rápido) e o qwen2.5:7b (mais preciso para TypeScript) dentro do omp, basta digitar /model na caixa de texto dele.

### Fluxo 2 — Consulta Rápida e Isolada (hermes chat):
- **Como acionar**: Quando quiser apenas tirar uma dúvida rápida de sintaxe, regex ou regra tributária sem que o agente vasculhe as pastas do projeto, abra uma segunda aba no terminal (Ctrl + Shift + 5) e digite hermes chat.

## 8. Protocolo Obrigatório de Correção de Bugs e Regressão (DoD)

Toda vez que qualquer agente ou desenvolvedor corrigir um bug, vulnerabilidade ou inconsistência de dados neste repositório, é mandatório cumprir rigorosamente os 4 passos do Definition of Done:

1. **Reprodução Antes da Correção:**
   - Escreva ou ajuste um teste automatizado em `tests/` (registrado em `scripts/test.mjs`) que reproduza a falha e **confirme que ele falha antes de aplicar o fix**.
2. **Proibição de Código Morto:**
   - Nunca crie funções utilitárias, validadores ou sanitizadores (ex: `lib/ai/validar.ts`, `lib/html.ts`) sem importá-los e utilizá-los obrigatoriamente na rota/consumidor final e sem testar a rota integrada.
3. **Asserções de Estado e Invalidação:**
   - Correções envolvendo cache, mutação de arquivos JSON ou pipelines (`pipeline.py`, `rules.json`) exigem testes de regressão cobrindo:
     - Pisos mínimos de integridade de dados (`floors.json` / `rules-integrity`).
     - Expiração/invalidação de cache (`mtimeMs` / `?v=versao`) e fallback sem cachear erros.
     - Isolamento em diretório temporário (nunca mutar arquivos reais versionados durante o `npm test`).
4. **Verificação de Saída Crua:**
   - Nenhuma tarefa está concluída sem executar `npm run typecheck && npm test` e confirmar 100% das suítes verdes com a saída crua do terminal colada no relatório.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
