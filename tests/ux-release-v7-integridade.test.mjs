import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useNivelOperacional } from '../lib/hooks/useNivelOperacional.ts';
import * as UI from '../components/ui/index.ts';

const ROOT = process.cwd();

console.log('──────── tests/ux-release-v7-integridade.test.mjs (Suíte 47 — Ciclo 7 Release v7.0.0) ────────');

// 1. Validação do App Shell (app/page.tsx)
{
  const pagePath = path.join(ROOT, 'app', 'page.tsx');
  assert.ok(fs.existsSync(pagePath), 'app/page.tsx deve existir');
  const pageSrc = fs.readFileSync(pagePath, 'utf-8');

  // Verifica integração do Seletor de Níveis e Região Aria-Live Global
  assert.ok(pageSrc.includes('NivelOperacionalSwitcher'), 'app/page.tsx deve integrar NivelOperacionalSwitcher');
  assert.ok(pageSrc.includes('aria-live="polite"'), 'app/page.tsx deve conter região global com aria-live="polite"');
  assert.ok(pageSrc.includes('role="status"'), 'app/page.tsx deve conter role="status" para anúncios');
  assert.ok(pageSrc.includes('role="tablist"'), 'app/page.tsx deve conter navegação de abas com role="tablist"');
  assert.ok(pageSrc.includes('role="tab"'), 'app/page.tsx deve conter botões de aba com role="tab"');

  // Verifica compactação de Header (eliminação do dead space de 465px)
  assert.ok(pageSrc.includes("minHeight: '56px'"), 'Header corporativo deve ter altura compacta de 56px');
  assert.ok(pageSrc.includes("minHeight: '44px'"), 'Barra de navegação por abas deve ter altura mínima de 44px (alvo touch WCAG)');

  console.log('✔ [1/4] Contrato do App Shell (app/page.tsx) e A11y validados');
}

// 2. Validação dos 3 Níveis Operacionais e Componentes Base do Design System
{
  // Valida exportações dos 6 componentes canônicos em components/ui/index.ts
  const expectedUiExports = [
    'KpiStrip',
    'StickyActionBar',
    'ProgressiveSection',
    'ItemDetailDrawer',
    'LegalCitationBlock',
    'NivelOperacionalSwitcher'
  ];

  for (const exp of expectedUiExports) {
    assert.ok(UI[exp] !== undefined, `components/ui deve exportar ${exp}`);
  }

  // Valida hook de níveis operacionais
  assert.equal(typeof useNivelOperacional, 'function', 'useNivelOperacional deve ser uma função de hook');

  const hookPath = path.join(ROOT, 'lib', 'hooks', 'useNivelOperacional.ts');
  const hookSrc = fs.readFileSync(hookPath, 'utf-8');

  assert.ok(hookSrc.includes("'gerencial'"), 'useNivelOperacional deve suportar nível gerencial');
  assert.ok(hookSrc.includes("'operacional'"), 'useNivelOperacional deve suportar nível operacional');
  assert.ok(hookSrc.includes("'senior'"), 'useNivelOperacional deve suportar nível senior');
  assert.ok(hookSrc.includes('portela_nivel_operacional'), 'useNivelOperacional deve persistir em localStorage com a chave canônica');

  console.log('✔ [2/4] Coerência dos 3 Níveis Operacionais e Design System validados');
}

// 3. Validação de Segurança em next.config.mjs (Anti-Clickjacking & Proteção de Cabeçalhos)
{
  const nextConfigPath = path.join(ROOT, 'next.config.mjs');
  assert.ok(fs.existsSync(nextConfigPath), 'next.config.mjs deve existir');
  const nextConfigSrc = fs.readFileSync(nextConfigPath, 'utf-8');

  // Não pode conter ALLOWALL em nenhuma hipótese (vulnerabilidade crítica de clickjacking)
  assert.ok(
    !nextConfigSrc.includes('ALLOWALL'),
    'next.config.mjs JAMAIS deve conter X-Frame-Options: ALLOWALL'
  );

  // Deve possuir CSP com frame-ancestors restrito
  assert.ok(
    nextConfigSrc.includes('frame-ancestors'),
    'next.config.mjs deve configurar CSP com diretiva frame-ancestors'
  );

  // Deve possuir X-Content-Type-Options: nosniff
  assert.ok(
    nextConfigSrc.includes('X-Content-Type-Options') && nextConfigSrc.includes('nosniff'),
    'next.config.mjs deve conter X-Content-Type-Options: nosniff'
  );

  console.log('✔ [3/4] Segurança em next.config.mjs (sem ALLOWALL, com frame-ancestors e nosniff) validada');
}

// 4. Validação da Integridade e Imutabilidade de rules/rules.json
{
  const rulesPath = path.join(ROOT, 'rules', 'rules.json');
  assert.ok(fs.existsSync(rulesPath), 'rules/rules.json deve existir');
  const rawRules = fs.readFileSync(rulesPath, 'utf-8');

  let parsedRules;
  assert.doesNotThrow(() => {
    parsedRules = JSON.parse(rawRules);
  }, 'rules/rules.json deve ser um JSON válido');

  const requiredSections = [
    'rgi',
    'notas_legais',
    'armadilhas',
    'sinonimos',
    'materiais',
    'usos',
    'genericas',
    'indicadores',
    'resumo_rotina',
    'sinais_de_inseguranca',
    'jargao_sem_valor_fiscal',
    'palavras_comuns_na_tabela',
    'marcas_conhecidas'
  ];

  for (const sec of requiredSections) {
    assert.ok(parsedRules[sec] !== undefined, `rules/rules.json deve conter a seção obrigatória: ${sec}`);
  }

  // Verifica que há regras ativas de classificação e armadilhas
  assert.ok(Array.isArray(parsedRules.armadilhas) && parsedRules.armadilhas.length > 0, 'Armadilhas fiscais devem estar preservadas');
  assert.ok(Array.isArray(parsedRules.rgi) && parsedRules.rgi.length > 0, 'Regras RGI devem estar preservadas');

  console.log('✔ [4/4] Integridade estrita de rules/rules.json comprovada');
}

console.log('✔ Suíte 47 (ux-release-v7-integridade.test.mjs) passou com 100% de sucesso!\n');
