import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

test('Suíte 44 - UX Auditoria de Entrada em 3 Níveis & Acessibilidade WCAG AA (Sub-etapa 20.4)', async (t) => {

  // --------------------------------------------------------------------------
  // 1. TabelaItensExtracao: 7 Colunas, ItemDetailDrawer e Tabular-Nums
  // --------------------------------------------------------------------------
  await t.test('1. TabelaItensExtracao: Tabela Enxuta (7 Colunas), Drawer e Tabular-Nums', () => {
    const filePath = path.join(rootDir, 'components', 'TabelaItensExtracao.tsx');
    assert.ok(fs.existsSync(filePath), 'TabelaItensExtracao.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Integração com Nível Operacional e Componentes UI
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('ItemDetailDrawer'), 'Deve importar e usar ItemDetailDrawer');
    assert.ok(src.includes('LegalCitationBlock'), 'Deve importar e usar LegalCitationBlock');

    // Estrutura de 7 colunas da tabela
    assert.ok(src.includes('Item / Cód.'), 'Coluna 1: Item / Cód.');
    assert.ok(src.includes('Descrição / NCM (Siscomex)'), 'Coluna 2: Descrição / NCM');
    assert.ok(src.includes('CFOP / Destinação'), 'Coluna 3: CFOP / Destinação');
    assert.ok(src.includes('Vlr. Operação'), 'Coluna 4: Vlr. Operação');
    assert.ok(src.includes('ICMS / ST / DIFAL'), 'Coluna 5: ICMS / ST / DIFAL');
    assert.ok(src.includes('Crédito Efetivo'), 'Coluna 6: Crédito Efetivo');
    assert.ok(src.includes('Ações'), 'Coluna 7: Ações');

    // Presença de tabular-nums e alvos confortáveis
    assert.ok(src.includes('tabular-nums'), 'Deve conter tabular-nums para alinhamento decimal');
    assert.ok(src.includes('btn-inspect'), 'Deve conter botão de inspeção');
    assert.ok(src.includes('44px'), 'Alvo do botão Inspecionar deve atender ao critério de acessibilidade');
    assert.ok(src.includes('aria-expanded'), 'Botão Inspecionar deve possuir aria-expanded');
  });

  // --------------------------------------------------------------------------
  // 2. AuditoriaEntrada: 1 CTA Primário Sólido, KpiStrip e StickyActionBar
  // --------------------------------------------------------------------------
  await t.test('2. AuditoriaEntrada: Hierarquia de 1 CTA Primário, KpiStrip e StickyActionBar', () => {
    const filePath = path.join(rootDir, 'components', 'AuditoriaEntrada.tsx');
    assert.ok(fs.existsSync(filePath), 'AuditoriaEntrada.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Componentes UI do Design System Portela
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('KpiStrip'), 'Deve utilizar KpiStrip para resumo executivo/operacional');
    assert.ok(src.includes('StickyActionBar'), 'Deve utilizar StickyActionBar persistente');
    assert.ok(src.includes('ProgressiveSection'), 'Deve utilizar ProgressiveSection para orquestração DAG e créditos');

    // Hierarquia de 1 CTA Primário Sólido
    assert.ok(src.includes('Executar Orquestração Completa'), 'CTA primário antes da auditoria');
    assert.ok(src.includes('Exportar Laudo Pericial'), 'CTA primário após a auditoria');

    // 4 KPIs calculados
    assert.ok(src.includes('Conformidade Geral'), 'KPI de conformidade geral');
    assert.ok(src.includes('Débito DIFAL + FECOP PR'), 'KPI de débito DIFAL/FECOP');
    assert.ok(src.includes('Crédito Efetivado CMV'), 'KPI de crédito efetivado CMV');
  });

  // --------------------------------------------------------------------------
  // 3. PainelNfseDanfse: Destaque de Ação Primária e 3 Níveis Operacionais
  // --------------------------------------------------------------------------
  await t.test('3. PainelNfseDanfse: Botão Principal DANFSe Oficial e Acessibilidade', () => {
    const filePath = path.join(rootDir, 'components', 'PainelNfseDanfse.tsx');
    assert.ok(fs.existsSync(filePath), 'PainelNfseDanfse.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Nível Operacional e ProgressiveSection
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('ProgressiveSection'), 'Deve usar ProgressiveSection');

    // Ação principal destacada
    assert.ok(src.includes('Gerar DANFSe Oficial (PDF)'), 'Deve destacar o botão principal de DANFSe');
    assert.ok(src.includes('44px'), 'Botão principal deve possuir altura mínima de 44px');
    assert.ok(src.includes('aria-busy'), 'Botão principal deve informar aria-busy');
  });
});
