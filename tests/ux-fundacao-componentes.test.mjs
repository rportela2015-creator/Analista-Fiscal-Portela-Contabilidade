import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CHAVE_STORAGE_NIVEL_OPERACIONAL,
  EVENTO_NIVEL_OPERACIONAL,
  NIVEIS_OPERACIONAIS,
  isNivelOperacionalValido,
} from '../lib/hooks/useNivelOperacional.ts';

const rootDir = process.cwd();

test('Suíte 43 - UX Fundação de Componentes & 3 Níveis Operacionais (Sub-etapa 20.3)', async (t) => {

  // --------------------------------------------------------------------------
  // 1. Hook useNivelOperacional & Validações de Nível
  // --------------------------------------------------------------------------
  await t.test('1. useNivelOperacional: Constantes, Tipos e Validador de Nível', () => {
    assert.equal(
      CHAVE_STORAGE_NIVEL_OPERACIONAL,
      'portela_nivel_operacional_v1',
      'Chave de storage deve ser portela_nivel_operacional_v1'
    );

    assert.equal(
      EVENTO_NIVEL_OPERACIONAL,
      'nivel_operacional_changed',
      'Evento customizado deve ser nivel_operacional_changed'
    );

    assert.deepEqual(
      [...NIVEIS_OPERACIONAIS],
      ['gerencial', 'operacional', 'senior'],
      'Deve conter exatamente os 3 níveis operacionais suportados'
    );

    // Validador de tipo
    assert.equal(isNivelOperacionalValido('gerencial'), true);
    assert.equal(isNivelOperacionalValido('operacional'), true);
    assert.equal(isNivelOperacionalValido('senior'), true);
    assert.equal(isNivelOperacionalValido('invalido'), false);
    assert.equal(isNivelOperacionalValido(''), false);
    assert.equal(isNivelOperacionalValido(null), false);
    assert.equal(isNivelOperacionalValido(undefined), false);
    assert.equal(isNivelOperacionalValido(123), false);
  });

  // --------------------------------------------------------------------------
  // 2. Existência Física e Exportações dos 6 Componentes Base em components/ui
  // --------------------------------------------------------------------------
  await t.test('2. Componentes UI: Existência de Arquivos e Index Barrel', () => {
    const uiDir = path.join(rootDir, 'components', 'ui');
    assert.ok(fs.existsSync(uiDir), 'Diretório components/ui deve existir');

    const componentesEsperados = [
      'NivelOperacionalSwitcher.tsx',
      'KpiStrip.tsx',
      'StickyActionBar.tsx',
      'ProgressiveSection.tsx',
      'ItemDetailDrawer.tsx',
      'LegalCitationBlock.tsx',
      'index.ts',
    ];

    for (const comp of componentesEsperados) {
      const arq = path.join(uiDir, comp);
      assert.ok(fs.existsSync(arq), `Arquivo ${comp} deve existir em components/ui/`);
    }

    const indexContent = fs.readFileSync(path.join(uiDir, 'index.ts'), 'utf8');
    assert.ok(indexContent.includes('NivelOperacionalSwitcher'), 'index.ts deve re-exportar NivelOperacionalSwitcher');
    assert.ok(indexContent.includes('KpiStrip'), 'index.ts deve re-exportar KpiStrip');
    assert.ok(indexContent.includes('StickyActionBar'), 'index.ts deve re-exportar StickyActionBar');
    assert.ok(indexContent.includes('ProgressiveSection'), 'index.ts deve re-exportar ProgressiveSection');
    assert.ok(indexContent.includes('ItemDetailDrawer'), 'index.ts deve re-exportar ItemDetailDrawer');
    assert.ok(indexContent.includes('LegalCitationBlock'), 'index.ts deve re-exportar LegalCitationBlock');
  });

  // --------------------------------------------------------------------------
  // 3. Acessibilidade WCAG AA & Contratos dos Componentes UI
  // --------------------------------------------------------------------------
  await t.test('3. Contratos de Acessibilidade WCAG AA nos Componentes UI', () => {
    const uiDir = path.join(rootDir, 'components', 'ui');

    // 3.1 NivelOperacionalSwitcher
    const switcherSrc = fs.readFileSync(path.join(uiDir, 'NivelOperacionalSwitcher.tsx'), 'utf8');
    assert.ok(switcherSrc.includes('role="radiogroup"'), 'Switcher deve possuir role="radiogroup"');
    assert.ok(switcherSrc.includes('role="radio"'), 'Opções do Switcher devem possuir role="radio"');
    assert.ok(switcherSrc.includes('aria-checked'), 'Opções do Switcher devem possuir aria-checked');
    assert.ok(switcherSrc.includes('44px'), 'Alvos devem atender requisito de tamanho mínimo >= 44px');

    // 3.2 KpiStrip
    const kpiSrc = fs.readFileSync(path.join(uiDir, 'KpiStrip.tsx'), 'utf8');
    assert.ok(kpiSrc.includes('tabular-nums'), 'KpiStrip deve aplicar tabular-nums para valores');
    assert.ok(kpiSrc.includes('role="region"'), 'KpiStrip deve possuir role="region"');
    assert.ok(kpiSrc.includes('StatusIcon'), 'KpiStrip deve combinar cor + ícone SVG + rótulo textual');

    // 3.3 StickyActionBar
    const actionBarSrc = fs.readFileSync(path.join(uiDir, 'StickyActionBar.tsx'), 'utf8');
    assert.ok(actionBarSrc.includes('role="toolbar"'), 'StickyActionBar deve possuir role="toolbar"');
    assert.ok(actionBarSrc.includes('aria-live="polite"'), 'StickyActionBar deve possuir região aria-live="polite"');
    assert.ok(actionBarSrc.includes('aria-busy'), 'CTA primário deve suportar aria-busy durante carregamento');
    assert.ok(actionBarSrc.includes('44px'), 'CTA primário e ações secundárias devem ter alvo >= 44px');

    // 3.4 ProgressiveSection
    const progressiveSrc = fs.readFileSync(path.join(uiDir, 'ProgressiveSection.tsx'), 'utf8');
    assert.ok(progressiveSrc.includes('aria-expanded'), 'ProgressiveSection deve possuir aria-expanded');
    assert.ok(progressiveSrc.includes('aria-controls'), 'ProgressiveSection deve vincular trigger via aria-controls');
    assert.ok(progressiveSrc.includes('Ver detalhes periciais'), 'Deve suportar expansão sob demanda pontual');

    // 3.5 ItemDetailDrawer
    const drawerSrc = fs.readFileSync(path.join(uiDir, 'ItemDetailDrawer.tsx'), 'utf8');
    assert.ok(drawerSrc.includes('role="dialog"'), 'ItemDetailDrawer deve possuir role="dialog"');
    assert.ok(drawerSrc.includes('aria-modal="true"'), 'ItemDetailDrawer deve possuir aria-modal="true"');
    assert.ok(drawerSrc.includes("'Escape'"), 'ItemDetailDrawer deve suportar fechamento via tecla Escape');
    assert.ok(drawerSrc.includes('44px'), 'Botão fechar e abas devem ter alvo >= 44px');

    // 3.6 LegalCitationBlock
    const legalSrc = fs.readFileSync(path.join(uiDir, 'LegalCitationBlock.tsx'), 'utf8');
    assert.ok(legalSrc.includes('aria-expanded'), 'LegalCitationBlock deve possuir aria-expanded');
    assert.ok(legalSrc.includes('auditHashSha256'), 'LegalCitationBlock deve suportar hash de custódia SHA-256');
    assert.ok(legalSrc.includes('Decimal Half-Even'), 'LegalCitationBlock deve suportar memória de cálculo pericial');
  });

  // --------------------------------------------------------------------------
  // 4. Refatoração do App Shell (app/page.tsx)
  // --------------------------------------------------------------------------
  await t.test('4. App Shell (app/page.tsx): Redução de Dead Space e A11y', () => {
    const pageSrc = fs.readFileSync(path.join(rootDir, 'app', 'page.tsx'), 'utf8');

    // Eliminação do banner gigante inflado
    assert.ok(
      !pageSrc.includes('three-tier-banner'),
      'app/page.tsx não deve mais conter o inflado three-tier-banner'
    );

    // Inclusão do switcher e hooks modernos
    assert.ok(pageSrc.includes('useEmpresaAtiva'), 'Deve importar useEmpresaAtiva');
    assert.ok(pageSrc.includes('useNivelOperacional'), 'Deve importar useNivelOperacional');
    assert.ok(pageSrc.includes('NivelOperacionalSwitcher'), 'Deve utilizar NivelOperacionalSwitcher');

    // Altura controlada do cabeçalho
    assert.ok(pageSrc.includes('56px'), 'Header compacto deve ter altura alvo de ~56px');

    // Região de anúncios de acessibilidade
    assert.ok(pageSrc.includes('role="status"'), 'Deve conter região role="status"');
    assert.ok(pageSrc.includes('aria-live="polite"'), 'Deve conter região aria-live="polite"');

    // Reserva de altura anti-CLS
    assert.ok(pageSrc.includes('minHeight'), 'Deve reservar minHeight para prevenir Cumulative Layout Shift (CLS)');
  });

  // --------------------------------------------------------------------------
  // 5. Ausência de Regressão em Watchers (next.config.mjs e tsconfig.json)
  // --------------------------------------------------------------------------
  await t.test('5. Blindagem dos Watchers: next.config.mjs e tsconfig.json', () => {
    const nextConfigSrc = fs.readFileSync(path.join(rootDir, 'next.config.mjs'), 'utf8');
    assert.ok(nextConfigSrc.includes('outputFileTracingExcludes'), 'next.config.mjs deve configurar outputFileTracingExcludes');
    assert.ok(nextConfigSrc.includes('services/**'), 'services/** deve ser excluído de tracing');
    assert.ok(nextConfigSrc.includes('watchOptions'), 'next.config.mjs deve configurar watchOptions');

    const tsConfigSrc = fs.readFileSync(path.join(rootDir, 'tsconfig.json'), 'utf8');
    assert.ok(tsConfigSrc.includes('"exclude"'), 'tsconfig.json deve possuir seção exclude');
    assert.ok(tsConfigSrc.includes('services'), 'tsconfig.json deve excluir diretórios pesados');
  });
});
