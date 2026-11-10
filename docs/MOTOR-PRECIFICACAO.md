# Motor de Precificação pós-Reforma (IBS/CBS/IS/ICMS)

Módulo **desacoplado** do app: funções puras em `lib/precificacao.ts` + resolvedor do arcabouço legal em `lib/marco-legal.ts`
+ normas e parâmetros versionados em `rules/marco-legal.json`. Nenhuma UI foi alterada.

## Arquitetura
| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Dados oficiais | `public/data/reforma.json` (RFB) | alíquotas CBS/IBS-UF por ano, cClassTrib (`tt` traz o % de redução), IS por NCM |
| Marco legal | `rules/marco-legal.json` → `public/data/marco-legal.json` | normas com **status de verificação**, calendário 2029-33, crédito de estoque, ICMS interestadual, presumido, NT 2026.008 |
| Resolução | `lib/marco-legal.ts` | `aliquotasDoAno`, `reducaoDoClassTrib`, `icmsInterestadual`, `irpjCsllPresumidoPct`, `citar` |
| Motor | `lib/precificacao.ts` | `precificar` (resumido/detalhado), `simular`, `trajetoria`, `sensibilidadeMargem`, `cronogramaEstoqueAgregado`, `paramsDoClassificador` |
| Testes | `tests/precificacao.test.mjs` | golden contra o oráculo Python (Decimal), dados oficiais, invariantes em 192 cenários |

## Uso
```ts
const marco = await loadMarcoLegal(); const reforma = await loadReforma();
const ctx = { reforma: reforma!, marco: marco! };
precificar(item, params, ctx);               // resumido (padrão)
precificar(item, params, ctx, 'detalhado');  // + entrada, caixa, cronograma, base legal com status
```
Ponte com o classificador: `paramsDoClassificador(rec, classTrib, marco)` devolve `isSaidaPct`, `pRedCbs`, `pRedIbs` e alertas.

## Modelo
`P = k·vProdLiq + m` (sistema linear) ⇒ margem, despesas sobre preço final e IRPJ/CSLL sobre receita bruta fecham **sem iteração**.
IBS/CBS por fora; ICMS por dentro com IBS/CBS/IS na base (flag `incluirIvaNaBaseIcms`). Crédito de estoque em 3 visões:
custo (nominal CPC 16 | VP CPC 12 | nenhum), caixa (quotas liberadas) e agregado da empresa.

## Governança do marco legal
Cada norma: `confirmado` · `confirmado_fonte_secundaria` · `conhecimento_geral` · `nao_verificado`. O motor **cita** as normas usadas
e transforma `nao_verificado`/`conhecimento_geral` em alerta. Atualizar = editar o JSON + `python3 scripts/pipeline.py`; o teste valida ids e status.

## Limitações conhecidas (explícitas no resultado)
1. IBS **municipal** não existe na tabela oficial carregada; 2027-28 vem do marco legal (0,05%), 2029+ exige `ibsMunicipalRefPct`.
2. Tabela oficial só tem 2026/2027/2029/2033: 2028 usa carry-forward; IBS-UF 2030-32 é derivado (pleno × fração).
3. IS: só ad valorem; `adv/are` vêm do dataset frio (`ds.pronto`).
4. Split Payment, LC 224/2025 e OT CFC 01/2026: `nao_verificado`.
5. Float64 com arredondamento half-up por campo; o oráculo exato é o motor Python. Divergência esperada ≤ R$ 0,01 em lotes grandes.

## Integração futura (checklist)
- [ ] `loadMarcoLegal()` já busca `/data/marco-legal.json` (no-cache); pipeline já publica o arquivo.
- [ ] Aba "Precificação": importar dinamicamente e registrar em `scripts/ui-entry.tsx` (AGENTS.md §3).
- [ ] Alimentar `ItemPreco` pelo XML de entrada (`lib/xml.ts`) e `Lote.tsx`.
- [ ] Trocar o default `ano = 2026` de `sugerirReforma` por parâmetro (2027+).
