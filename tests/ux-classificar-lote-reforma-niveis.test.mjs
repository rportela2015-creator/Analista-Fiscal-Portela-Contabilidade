import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

test('Suíte 46 - UX Classificar, Lote e Reforma em 3 Níveis & Acessibilidade WCAG AA (Sub-etapa 20.6)', async (t) => {

  // --------------------------------------------------------------------------
  // 1. Classificar.tsx: 3 Níveis Operacionais, KpiStrip, StickyActionBar e Citações
  // --------------------------------------------------------------------------
  await t.test('1. Classificar.tsx: Integração de 3 Níveis Operacionais, KpiStrip e StickyActionBar', () => {
    const filePath = path.join(rootDir, 'components', 'Classificar.tsx');
    assert.ok(fs.existsSync(filePath), 'Classificar.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Nível Operacional, Empresa Ativa e Componentes UI
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('useEmpresaAtiva'), 'Deve importar e usar useEmpresaAtiva');
    assert.ok(src.includes('KpiStrip'), 'Deve importar e usar KpiStrip');
    assert.ok(src.includes('StickyActionBar'), 'Deve importar e usar StickyActionBar');
    assert.ok(src.includes('ProgressiveSection'), 'Deve importar e usar ProgressiveSection');
    assert.ok(src.includes('LegalCitationBlock'), 'Deve importar e usar LegalCitationBlock');

    // KPIs calculados
    assert.ok(src.includes('NCM Sugerido / Validado'), 'KPI de NCM sugerido');
    assert.ok(src.includes('Confiança da Classificação'), 'KPI de confiança da classificação');
    assert.ok(src.includes('Alíquotas & Regras (RTC / PR)'), 'KPI de alíquotas e regras');
    assert.ok(src.includes('Status de Consistência Fiscal'), 'KPI de status de consistência');

    // Seção progressiva e citações normativas
    assert.ok(src.includes('sec-classificacao-legal'), 'Deve conter seção progressiva para fundamentação legal');
    assert.ok(src.includes('Regras Gerais de Interpretação'), 'Deve referenciar as RGIs');
    assert.ok(src.includes('Lei Complementar nº 214/2025'), 'Deve referenciar a LC 214/2025');

    // Alvos táteis >= 44px
    assert.ok(src.includes("minHeight: '44px'"), 'Deve conter alvos táteis mínimos de 44px');
  });

  // --------------------------------------------------------------------------
  // 2. Lote.tsx: KpiStrip, Contexto Progressivo e 1 CTA Primário
  // --------------------------------------------------------------------------
  await t.test('2. Lote.tsx: KpiStrip, ProgressiveSection e StickyActionBar Persistente', () => {
    const filePath = path.join(rootDir, 'components', 'Lote.tsx');
    assert.ok(fs.existsSync(filePath), 'Lote.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Nível Operacional e Componentes do Design System Portela
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('useEmpresaAtiva'), 'Deve importar e usar useEmpresaAtiva');
    assert.ok(src.includes('KpiStrip'), 'Deve importar e usar KpiStrip');
    assert.ok(src.includes('StickyActionBar'), 'Deve importar e usar StickyActionBar');
    assert.ok(src.includes('ProgressiveSection'), 'Deve importar e usar ProgressiveSection');
    assert.ok(src.includes('LegalCitationBlock'), 'Deve importar e usar LegalCitationBlock');

    // KPIs de resumo do lote
    assert.ok(src.includes('Total de Itens do Lote'), 'KPI de total de itens');
    assert.ok(src.includes('Classificados / NCM Validado'), 'KPI de classificados');
    assert.ok(src.includes('Divergências / Requer IA'), 'KPI de divergências');
    assert.ok(src.includes('Taxa de Prontidão ERP'), 'KPI de prontidão para ERP');

    // Seções progressivas e acessibilidade
    assert.ok(src.includes('sec-lote-contexto-saida'), 'Deve conter seção progressiva para contexto de saída');
    assert.ok(src.includes('sec-lote-fundamentacao'), 'Deve conter seção progressiva para fundamentação do lote');
    assert.ok(src.includes('role="status"'), 'Deve conter role="status" para mensagens');
    assert.ok(src.includes('aria-live="polite"'), 'Deve conter aria-live="polite"');
    assert.ok(src.includes("minHeight: '44px'"), 'Deve conter alvos de toque mínimos de 44px');
  });

  // --------------------------------------------------------------------------
  // 3. Reforma.tsx: Paginação, KpiStrip e Controle Estrito do DOM
  // --------------------------------------------------------------------------
  await t.test('3. Reforma.tsx: Paginação com Alvos >= 44px, KpiStrip e StickyActionBar', () => {
    const filePath = path.join(rootDir, 'components', 'Reforma.tsx');
    assert.ok(fs.existsSync(filePath), 'Reforma.tsx deve existir');

    const src = fs.readFileSync(filePath, 'utf8');

    // Nível Operacional e Componentes do Design System Portela
    assert.ok(src.includes('useNivelOperacional'), 'Deve importar e usar useNivelOperacional');
    assert.ok(src.includes('KpiStrip'), 'Deve importar e usar KpiStrip');
    assert.ok(src.includes('StickyActionBar'), 'Deve importar e usar StickyActionBar');
    assert.ok(src.includes('ProgressiveSection'), 'Deve importar e usar ProgressiveSection');
    assert.ok(src.includes('LegalCitationBlock'), 'Deve importar e usar LegalCitationBlock');

    // KPIs de Reforma Tributária
    assert.ok(src.includes('Classificações cClassTrib (IBS/CBS)'), 'KPI de classificações cClassTrib');
    assert.ok(src.includes('Situações Tributárias (CST IBS/CBS)'), 'KPI de situações CST');
    assert.ok(src.includes('Imposto Seletivo (Art. 393+)'), 'KPI de imposto seletivo');

    // Paginação acessível para controle de DOM
    assert.ok(src.includes('itensPaginados'), 'Deve utilizar fatiamento paginado');
    assert.ok(src.includes('linhasPorPagina'), 'Deve permitir configurar linhas por página');
    assert.ok(src.includes('Página anterior'), 'Deve conter botão acessível de página anterior');
    assert.ok(src.includes('Próxima página'), 'Deve conter botão acessível de próxima página');
    assert.ok(src.includes("minHeight: '44px'"), 'Controles de paginação devem possuir alvos mínimos de 44px');
  });
});
