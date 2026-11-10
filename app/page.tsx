'use client';

import { useEffect, useState } from 'react';
import Classificar from '@/components/Classificar';
import Lote from '@/components/Lote';
import Consultar from '@/components/Consultar';
import Regras from '@/components/Regras';
import Parametrizar from '@/components/Parametrizar';
import ReformaTab from '@/components/Reforma';
import AuditoriaEntrada from '@/components/AuditoriaEntrada';
import Precificar from '@/components/Precificar';
import type { PrecificacaoItemInput } from '@/lib/extrator-nfe-types';

const TABS = [
  { id: 'classificar', nome: '1 · Classificar produto', hint: 'descrição → candidatos de NCM com RGI, tributos e parametrização' },
  { id: 'lote', nome: '2 · Lote (CSV)', hint: 'centenas de itens de uma vez, com triagem por confiança' },
  { id: 'consultar', nome: '3 · Consultar NCM', hint: 'busca na tabela oficial por código, palavra ou capítulo' },
  { id: 'parametrizar', nome: '4 · Parametrização de ERP', hint: 'cadastro + cenário → códigos e maqueta de XML da NF-e/NFS-e' },
  { id: 'auditoria-entrada', nome: '5 · Auditoria (Entrada)', hint: 'upload de nota fiscal para análise via IA e extração de parâmetros' },
  { id: 'precificar', nome: '6 · Precificação & Margens', hint: 'composição de custo real, alíquotas nos 4 regimes e formação de preço' },
  { id: 'reforma', nome: '7 · Reforma (IBS/CBS/IS)', hint: 'tabela cClassTrib, CST-IBS/CBS, IS e alíquotas da transição' },
  { id: 'regras', nome: '8 · Regras e fontes', hint: 'RGI, Notas Legais, armadilhas, vigência e atualização' },
] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('classificar');
  const [itensPrecificacao, setItensPrecificacao] = useState<PrecificacaoItemInput[]>([]);

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem('ncm-abas');
      if (salvo && TABS.some((t) => t.id === salvo)) {
        setTab(salvo as typeof tab);
        sessionStorage.removeItem('ncm-abas');
      }
    } catch { /* sem storage */ }

    const onNavegar = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab && TABS.some((t) => t.id === detail.tab)) {
        if (detail.itens && Array.isArray(detail.itens)) {
          setItensPrecificacao(detail.itens);
        }
        setTab(detail.tab);
      }
    };
    window.addEventListener('navegar-aba', onNavegar);
    return () => window.removeEventListener('navegar-aba', onNavegar);
  }, []);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="header-brand-row">
            <div className="logo-container">
              <img
                src="/logo-portela.jpg"
                alt="Contabilidade Portela - Desde 1970"
                className="office-logo"
              />
            </div>
            <div className="brand-titles">
              <div className="office-header-meta">
                <span className="office-title">CONTABILIDADE PORTELA</span>
                <span className="office-sub">AUDITORIA FISCAL & TRIBUTÁRIA · DESDE 1970</span>
              </div>
              <div className="brand">
                <h1>Sistema de Classificação Fiscal NCM & Reforma Tributária</h1>
                <span className="tag">Portal Único Siscomex</span>
                <span className="tag">10.515 códigos</span>
                <span className="tag tag-highlight">Arquitetura em 3 Níveis</span>
              </div>
            </div>
          </div>

          <div className="three-tier-banner">
            <div className="tier-card tier-1">
              <div className="tier-header">
                <span className="tier-num">NÍVEL 1</span>
                <span className="tier-mode">Automático</span>
              </div>
              <div className="tier-title">Extrator Multifonte & Quarentena</div>
              <div className="tier-desc">XML/PDF/CSV sem perda de zeros · Validação contra 10.515 NCMs · % de Confiabilidade da Ingestão</div>
            </div>

            <div className="tier-arrow">➔</div>

            <div className="tier-card tier-2">
              <div className="tier-header">
                <span className="tier-num">NÍVEL 2</span>
                <span className="tier-mode">Automático</span>
              </div>
              <div className="tier-title">Motor Siscomex + RGI 1-6</div>
              <div className="tier-desc">Decodificação da árvore fiscal · Reforma LC 214/2025 (IBS/CBS/IS) · % de Confiabilidade do Enquadramento</div>
            </div>

            <div className="tier-arrow">➔</div>

            <div className="tier-card tier-3">
              <div className="tier-header">
                <span className="tier-num">NÍVEL 3</span>
                <span className="tier-mode user-demand">Sob Demanda</span>
              </div>
              <div className="tier-title">Auditoria Pericial & Laudo</div>
              <div className="tier-desc">IA Especialista (Ollama Local / Nuvem) · Pareceres NESH/COSIT · Emissão de Laudo Técnico Formal</div>
            </div>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} title={t.hint}
                onClick={() => setTab(t.id)}>{t.nome}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap" id="parametrizar">
        <div className="disclaimer">
          <span style={{ fontSize: 18 }}>⚖️</span>
          <div>
            <b>Isto é apoio à decisão, não parecer fiscal.</b> Classificação de mercadoria é ato complexo e exige
            conferência do texto legal (Notas de Seção/Capítulo, Notas Explicativas do Sistema Harmonizado, Resoluções
            Gecex, convênios CONFAZ) e, quando houver dúvida relevante, consulta formal à RFB ou solução de consulta.
            Alíquotas de PIS/COFINS, ICMS e regimes especiais <b>não</b> são declaradas aqui como definitivas.
          </div>
        </div>

        {tab === 'classificar' && <Classificar />}
        {tab === 'lote' && <Lote />}
        {tab === 'consultar' && <Consultar />}
        {tab === 'parametrizar' && <Parametrizar />}
        {tab === 'auditoria-entrada' && <AuditoriaEntrada />}
        {tab === 'precificar' && <Precificar itensIniciais={itensPrecificacao} />}
        {tab === 'reforma' && <ReformaTab />}
        {tab === 'regras' && <Regras />}

        <footer className="small muted" style={{ marginTop: 26, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          Motor local, sem envio de dados a terceiros: a descrição que você digita é processada no seu navegador
          contra o dataset estático gerado das fontes oficiais. Pipeline: <code className="mono">scripts/baixar_fontes.py</code>{' '}
          → <code className="mono">scripts/pipeline.py</code> → <code className="mono">public/data/</code>.
        </footer>
      </main>
    </>
  );
}
