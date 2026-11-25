import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

test('Suíte 45 - UX Precificação & Gestão de Empresas em 3 Níveis Operacionais (Sub-etapa 20.5)', async (t) => {

  // --------------------------------------------------------------------------
  // 1. Precificar.tsx: KpiStrip, StickyActionBar, ProgressiveSection e Citações
  // --------------------------------------------------------------------------
  await t.test('1. Precificar.tsx: 3 Níveis Operacionais, KpiStrip, StickyActionBar e Citações', () => {
    const filePath = path.join(rootDir, 'components', 'Precificar.tsx');
    assert.ok(fs.existsSync(filePath), 'Precificar.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Nível Operacional e Componentes do Design System Portela
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('KpiStrip'), 'Deve importar e usar KpiStrip');
    assert.ok(src.includes('StickyActionBar'), 'Deve importar e usar StickyActionBar');
    assert.ok(src.includes('ProgressiveSection'), 'Deve importar e usar ProgressiveSection');
    assert.ok(src.includes('LegalCitationBlock'), 'Deve importar e usar LegalCitationBlock');

    // KPIs calculados (Preço Sugerido, Margem Líquida, Carga Tributária, Regime Vantajoso)
    assert.ok(src.includes('Preço de Venda Sugerido'), 'KPI de preço sugerido');
    assert.ok(src.includes('Margem Líquida Realizada'), 'KPI de margem líquida');
    assert.ok(src.includes('Carga Tributária Efetiva'), 'KPI de carga tributária');
    assert.ok(src.includes('Regime Mais Vantajoso'), 'KPI de regime tributário mais vantajoso');

    // Alinhamento numérico e acessibilidade
    assert.ok(src.includes('tabular-nums'), 'Deve utilizar tabular-nums para alinhamento decimal');
    assert.ok(src.includes('minHeight: \'44px\''), 'Botões principais devem possuir altura mínima de 44px');

    // Divulgação progressiva: Card 2 (Operacional) e Seção Avançada (Sênior)
    assert.ok(src.includes('sec-premissas-rastreabilidade'), 'Deve possuir seção progressiva de rastreabilidade');
    assert.ok(src.includes('sec-dual-stack-mesa-compras'), 'Deve possuir seção progressiva avançada de Simples Híbrido / 2027');

    // Citações legais
    assert.ok(src.includes('CPC 16 (R1)'), 'Deve citar CPC 16 (R1) - Valoração de Estoques e Custos');
    assert.ok(src.includes('LC 214/2025'), 'Deve citar LC 214/2025 - Reforma Tributária');
  });

  // --------------------------------------------------------------------------
  // 2. CadastroEmpresas.tsx: ProgressiveSection, Acessibilidade e Alvos >= 44px
  // --------------------------------------------------------------------------
  await t.test('2. CadastroEmpresas.tsx: ProgressiveSection e Acessibilidade WCAG AA', () => {
    const filePath = path.join(rootDir, 'components', 'CadastroEmpresas.tsx');
    assert.ok(fs.existsSync(filePath), 'CadastroEmpresas.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Nível Operacional e Componentes do Design System Portela
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('ProgressiveSection'), 'Deve importar e usar ProgressiveSection');

    // Seção de infraestrutura e parâmetros avançados bitemporais
    assert.ok(src.includes('sec-infra-sidecars'), 'Deve conter seção progressiva para monitor de sidecars');
    assert.ok(src.includes('sec-perfil-avancado'), 'Deve conter seção progressiva para parâmetros avançados de perfil');

    // Acessibilidade: live region e status
    assert.ok(src.includes('role="status"'), 'Deve conter role="status" para feedback');
    assert.ok(src.includes('aria-live="polite"'), 'Deve conter aria-live="polite"');

    // Alvos táteis e acessíveis
    assert.ok(src.includes('minHeight: \'44px\''), 'Botões de ação devem possuir altura mínima de 44px');
    assert.ok(src.includes('minHeight: \'48px\''), 'Cards de empresa devem possuir altura mínima de 48px');
  });
});
