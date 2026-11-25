/**
 * @file tests/challenger-ux-audit.test.mjs
 * Teste Adversarial Automatizado - Challenger da Sub-etapa 20.1
 * Analista Fiscal Portela v6.0.0
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DOCS_DIR = path.resolve('docs/ux-audit');
const DOC_01 = path.join(DOCS_DIR, '01-inventario-backend-vs-ui.md');
const DOC_02 = path.join(DOCS_DIR, '02-auditoria-visual-a11y.md');
const DOC_03 = path.join(DOCS_DIR, '03-design-system-portela.md');
const SCREENSHOTS_DIR = path.join(DOCS_DIR, 'screenshots');

describe('Empirical Challenger: Validação Cruzada Sub-etapa 20.1', () => {

  test('1. Existência e Integridade Física dos 3 Documentos e Screenshots', () => {
    assert.ok(fs.existsSync(DOC_01), '01-inventario-backend-vs-ui.md deve existir');
    assert.ok(fs.existsSync(DOC_02), '02-auditoria-visual-a11y.md deve existir');
    assert.ok(fs.existsSync(DOC_03), '03-design-system-portela.md deve existir');

    const content01 = fs.readFileSync(DOC_01, 'utf-8');
    const content02 = fs.readFileSync(DOC_02, 'utf-8');
    const content03 = fs.readFileSync(DOC_03, 'utf-8');

    assert.ok(content01.length > 20000, `01 deve ser robusto (tamanho: ${content01.length})`);
    assert.ok(content02.length > 15000, `02 deve ser robusto (tamanho: ${content02.length})`);
    assert.ok(content03.length > 25000, `03 deve ser robusto (tamanho: ${content03.length})`);

    // Validar screenshots obrigatórios em 1920x1080 e 1366x768
    const requiredScreenshots = [
      '1920x1080_01_clientes_perfis.png',
      '1920x1080_02_auditoria_entrada.png',
      '1920x1080_03_precificacao.png',
      '1920x1080_04_classificar.png',
      '1920x1080_05_lote.png',
      '1920x1080_06_reforma.png',
      '1366x768_01_clientes_perfis.png',
      '1366x768_02_auditoria_entrada.png',
      '1366x768_03_precificacao.png',
      '1366x768_04_classificar.png',
      '1366x768_05_lote.png',
      '1366x768_06_reforma.png'
    ];

    for (const shot of requiredScreenshots) {
      const shotPath = path.join(SCREENSHOTS_DIR, shot);
      assert.ok(fs.existsSync(shotPath), `Screenshot obrigatório não encontrado: ${shot}`);
      const stats = fs.statSync(shotPath);
      assert.ok(stats.size > 50000, `Screenshot ${shot} deve ser um PNG real (>50KB), tamanho atual: ${stats.size}`);
    }
  });

  test('2. Consistência Cruzada Frente A -> Frente C: Cobertura das Capacidades Fiscais Críticas', () => {
    const c01 = fs.readFileSync(DOC_01, 'utf-8');
    const c03 = fs.readFileSync(DOC_03, 'utf-8');

    // 4 especificidades fiscais mandatórias do orquestrador
    const coreTaxSpecifics = [
      { id: 'Base Dupla (DIFAL PR)', pattern: /Base Dupla/i },
      { id: 'Créditos 3 Camadas (Art. 47 LC 214)', pattern: /3 Camadas|Split Payment|Art\.?\s*47/i },
      { id: 'Paridade RFB Centavo a Centavo (HALF_EVEN)', pattern: /Paridade RFB|HALF_EVEN/i },
      { id: 'Hashes SHA-256 de Custódia Pericial', pattern: /SHA-256/i }
    ];

    for (const spec of coreTaxSpecifics) {
      assert.ok(spec.pattern.test(c01), `Frente A deve documentar: ${spec.id}`);
      assert.ok(spec.pattern.test(c03), `Frente C (Design System) deve contemplar explicitamente: ${spec.id}`);
    }

    // Demais capacidades fiscais complementares
    const complementaryCapabilities = [
      { id: 'FECOP Guia Apartada', pattern: /FECOP/i },
      { id: 'Trava Decreto 12.828/2026', pattern: /12\.828/i },
      { id: 'Diferimento Parcial Art. 28', pattern: /Art\.?\s*28/i },
      { id: 'Estorno Anexo VI', pattern: /Anexo VI/i },
      { id: 'Orquestrador Fiscal DAG', pattern: /Orquestrador.*DAG|DAG/i },
      { id: 'Comparativo 4 Regimes', pattern: /4 Regimes/i },
      { id: 'Mesa de Compras PR', pattern: /Mesa de Compras/i },
      { id: 'Consulta SEFA/PR 48/2026 Dual-Stack', pattern: /48\/2026/i },
      { id: 'Radar Combustíveis Ad Rem', pattern: /Ad Rem|Combustíveis/i },
      { id: 'Auditoria NFS-e / DANFSe', pattern: /NFS-e|DANFSe/i }
    ];

    for (const cap of complementaryCapabilities) {
      assert.ok(cap.pattern.test(c01), `Frente A deve documentar: ${cap.id}`);
      assert.ok(cap.pattern.test(c03), `Frente C deve contemplar: ${cap.id}`);
    }
  });

  test('3. Consistência Cruzada: Tratamento Conceitual dos Campos Calculados e Descartados', () => {
    const c03 = fs.readFileSync(DOC_03, 'utf-8');

    // Validação de que os conceitos fundamentais estão contemplados na arquitetura
    const coreDiscardedConcepts = [
      { field: 'memória de cálculo passo a passo', pattern: /memória de cálculo/i },
      { field: 'base de cálculo reconstituída', pattern: /base.*reconstituída|base dupla/i },
      { field: 'código de ajuste EFD', pattern: /código de ajuste.*EFD|EFD/i },
      { field: 'diferimento e redução', pattern: /diferimento|redução/i },
      { field: 'divergências de paridade RTC', pattern: /paridade.*RFB|divergência/i },
      { field: 'hash criptográfico SHA-256', pattern: /SHA-256/i },
      { field: 'créditos retidos LC 214', pattern: /split payment|retid/i }
    ];

    for (const item of coreDiscardedConcepts) {
      assert.ok(
        item.pattern.test(c03),
        `Conceito de campo descartado '${item.field}' identificado na Frente A DEVE ter proposta no Design System`
      );
    }
  });

  test('4. Consistência Cruzada Frente B -> Frente C: Remediação dos Gargalos de UX e A11y', () => {
    const c02 = fs.readFileSync(DOC_02, 'utf-8');
    const c03 = fs.readFileSync(DOC_03, 'utf-8');

    // 1. Dead Space (465px em 1366x768)
    assert.ok(/dead space|465px/i.test(c02), 'Frente B identificou dead space');
    assert.ok(/NivelOperacionalSwitcher|StickyActionBar|compact/i.test(c03), 'Frente C oferece componentes para compactar topo e fixar ações');

    // 2. Competição de CTAs na Auditoria de Entrada
    assert.ok(/Executar Orquestração Completa.*Auditar Documento|concorrentes/i.test(c02), 'Frente B apontou CTAs concorrentes');
    assert.ok(/StickyActionBar/i.test(c03), 'Frente C define StickyActionBar');
    assert.ok(/CTA Primário Sólido.*Único|Exatamente 1/i.test(c03), 'Frente C estipula exatamente 1 CTA primário sólido por estado');

    // 3. Ausência de aria-live e role="alert"
    assert.ok(/aria-live/i.test(c02), 'Frente B alertou ausência de aria-live');
    assert.ok(/aria-live|role="status"|role="alert"/i.test(c03), 'Frente C obriga uso de aria-live e role="alert"');

    // 4. Semáforo Triplo (A11y: Cor + Ícone + Texto)
    assert.ok(/Semáforo Fiscal Triplo/i.test(c03), 'Frente C especifica Semáforo Fiscal Triplo');
    assert.ok(/Lucide|Phosphor/i.test(c03), 'Frente C exige ícone SVG vetorial');
    assert.ok(/Rótulo Textual/i.test(c03), 'Frente C exige rótulo textual explícito');

    // 5. Tabular numbers e alinhamento decimal
    assert.ok(/tabular-nums/i.test(c02), 'Frente B apontou falta de tabular-nums');
    assert.ok(/font-variant-numeric:\s*tabular-nums/i.test(c03), 'Frente C formalizou regra CSS de tabular-nums');
  });

  test('5. Rigor e Validade Sintática dos Contratos TypeScript em 03-design-system-portela.md', () => {
    const c03 = fs.readFileSync(DOC_03, 'utf-8');

    // Extrair o bloco de código TypeScript da Seção 6
    const tsCodeMatch = c03.match(/```typescript([\s\S]*?)```/);
    assert.ok(tsCodeMatch && tsCodeMatch[1], '03-design-system-portela.md deve conter bloco TypeScript de contratos');

    const tsCode = tsCodeMatch[1];

    // Verificar se todos os 6 componentes foram tipados
    const requiredTypes = [
      'NivelOperacional',
      'FiscalTrafficLightStatus',
      'NivelOperacionalSwitcherProps',
      'StickyActionBarProps',
      'ProgressiveSectionProps',
      'KpiStripProps',
      'ItemDetailDrawerProps',
      'LegalCitationBlockProps'
    ];

    for (const typeName of requiredTypes) {
      assert.ok(tsCode.includes(typeName), `Contrato TypeScript deve conter a interface/tipo: ${typeName}`);
    }

    // Criar um arquivo temporário para validar compilação via TSC com o tsconfig do projeto
    const tempTsPath = path.resolve('tests/temp-design-system-test.ts');
    const tsFileContent = `import type React from 'react';\n${tsCode}\n
// Instanciações de teste para validação de tipos
export const testSwitcher: NivelOperacionalSwitcherProps = {
  currentLevel: 'operacional',
  onLevelChange: (_lvl) => {}
};

export const testActionBar: StickyActionBarProps = {
  screenState: 'staged',
  primaryAction: {
    label: 'Auditar 18 Itens',
    onClick: () => {}
  }
};

export const testSection: ProgressiveSectionProps = {
  id: 'sec-1',
  minLevel: 'senior',
  currentLevel: 'operacional',
  title: 'Memória Pericial',
  children: null
};

export const testKpi: KpiStripProps = {
  items: [
    { id: 'kpi-1', label: 'Total', value: 'R$ 10.000,00', trafficLight: 'success' }
  ]
};

export const testDrawer: ItemDetailDrawerProps = {
  isOpen: true,
  onClose: () => {},
  item: { ncm: '8471.30.12' },
  title: 'Item #1',
  fiscalStatus: { status: 'danger', label: 'Glosa Fiscal' }
};

export const testCitation: LegalCitationBlockProps = {
  citations: [
    {
      id: 'cit-1',
      norma: 'RICMS/PR',
      artigo: 'Art. 28',
      ementa: 'Diferimento parcial...',
      esfera: 'estadual-pr',
      statusVigencia: 'vigente'
    }
  ]
};
`;

    try {
      fs.writeFileSync(tempTsPath, tsFileContent, 'utf-8');
      // Compilar usando o tsc local com o tsconfig.json do projeto
      execSync('node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json', {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      assert.ok(true, 'TypeScript compilou os contratos sem nenhum erro!');
    } catch (err) {
      assert.fail(`Erro de compilação nos contratos TypeScript do Design System: ${err.message}\n${err.stdout || ''}\n${err.stderr || ''}`);
    } finally {
      if (fs.existsSync(tempTsPath)) {
        fs.unlinkSync(tempTsPath);
      }
    }
  });

  test('6. Viabilidade de Prototipação Google Stitch MCP na Sub-etapa 20.2', () => {
    const c03 = fs.readFileSync(DOC_03, 'utf-8');

    // Para o Stitch MCP gerar protótipos de alta fidelidade, precisamos de:
    // A. Tokens de cores hexadecimais explícitos (não apenas variáveis abstratas)
    assert.ok(/#0F172A/.test(c03), 'Cor Navy #0F172A declarada');
    assert.ok(/#0B3D91/.test(c03), 'Cor Blue #0B3D91 declarada');
    assert.ok(/#0369A1/.test(c03), 'Cor CTA #0369A1 declarada');
    assert.ok(/#FEF2F2/.test(c03), 'Cor Danger BG declarada');
    assert.ok(/#ECFDF5/.test(c03), 'Cor Success BG declarada');

    // B. Dimensões de tela explícitas para 1920x1080 e 1366x768
    assert.ok(/1366x768/i.test(c03), 'Regras para 1366x768 especificadas');
    assert.ok(/1920x1080/i.test(c03), 'Regras para 1920x1080 especificadas');

    // C. Definição explícita de colunas e larguras de Drawer
    assert.ok(/440px/.test(c03), 'Largura do Drawer para 1366x768 especificada (440px)');
    assert.ok(/540px/.test(c03), 'Largura do Drawer para 1920x1080 especificada (540px)');
    assert.ok(/6 a 7 colunas/i.test(c03), 'Teto de 6 a 7 colunas visíveis especificado');

    // D. Estados da Sticky Action Bar detalhados
    assert.ok(/Empty State|Vazio/i.test(c03), 'Estado Vazio coberto');
    assert.ok(/Extraído|Staged/i.test(c03), 'Estado Extraído coberto');
    assert.ok(/Auditado|Concluído/i.test(c03), 'Estado Auditado coberto');
    assert.ok(/NFS-e|Serviços/i.test(c03), 'Estado NFS-e coberto');
  });

});
