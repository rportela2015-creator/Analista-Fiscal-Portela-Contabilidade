'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useEmpresaAtiva } from '@/lib/hooks/useEmpresaAtiva';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import NivelOperacionalSwitcher from '@/components/ui/NivelOperacionalSwitcher';
import type { PrecificacaoItemInput, ParametrizacaoItemInput } from '@/lib/extrator-nfe-types';

const CadastroEmpresas = dynamic(() => import('@/components/CadastroEmpresas'), { ssr: false });
const Classificar = dynamic(() => import('@/components/Classificar'), { ssr: false });
const Lote = dynamic(() => import('@/components/Lote'), { ssr: false });
const Consultar = dynamic(() => import('@/components/Consultar'), { ssr: false });
const Parametrizar = dynamic(() => import('@/components/Parametrizar'), { ssr: false });
const AuditoriaEntrada = dynamic(() => import('@/components/AuditoriaEntrada'), { ssr: false });
const Precificar = dynamic(() => import('@/components/Precificar'), { ssr: false });
const ReformaTab = dynamic(() => import('@/components/Reforma'), { ssr: false });
const Regras = dynamic(() => import('@/components/Regras'), { ssr: false });

const TABS = [
  { id: 'empresas', codigo: '00', shortNome: 'Clientes & Perfis', nome: '0 · Clientes & Perfis', hint: 'gestão de empresas, CNPJs, perfis tributários bitemporais e status dos sidecars' },
  { id: 'classificar', codigo: '01', shortNome: 'Classificar Produto', nome: '1 · Classificar produto', hint: 'descrição → candidatos de NCM com RGI, tributos e parametrização' },
  { id: 'lote', codigo: '02', shortNome: 'Lote (CSV)', nome: '2 · Lote (CSV)', hint: 'centenas de itens de uma vez, com triagem por confiança' },
  { id: 'consultar', codigo: '03', shortNome: 'Consultar NCM', nome: '3 · Consultar NCM', hint: 'busca na tabela oficial por código, palavra ou capítulo' },
  { id: 'parametrizar', codigo: '04', shortNome: 'Parametrização ERP', nome: '4 · Parametrização de ERP', hint: 'cadastro + cenário → códigos e maqueta de XML da NF-e/NFS-e' },
  { id: 'auditoria-entrada', codigo: '05', shortNome: 'Auditoria (Entrada)', nome: '5 · Auditoria (Entrada)', hint: 'upload de nota fiscal para análise via IA e extração de parâmetros' },
  { id: 'precificar', codigo: '06', shortNome: 'Precificação & Margens', nome: '6 · Precificação & Margens', hint: 'composição de custo real, alíquotas nos 4 regimes e formação de preço' },
  { id: 'reforma', codigo: '07', shortNome: 'Reforma (IBS/CBS/IS)', nome: '7 · Reforma (IBS/CBS/IS)', hint: 'tabela cClassTrib, CST-IBS/CBS, IS e alíquotas da transição' },
  { id: 'regras', codigo: '08', shortNome: 'Regras e Fontes', nome: '8 · Regras e fontes', hint: 'RGI, Notas Legais, armadilhas, vigência e atualização' },
] as const;

const CHAVE_SIDEBAR_STORAGE = 'portela_sidebar_expanded_v1';
const CHAVE_TEMA_STORAGE = 'portela_theme_v1';

export default function Home() {
  // 1. TODOS OS HOOKS DECLARADOS NO TOPO ABSOLUTO (scripts/hookcheck.mjs)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('empresas');
  const [itensPrecificacao, setItensPrecificacao] = useState<PrecificacaoItemInput[]>([]);
  const [itensParametrizacao, setItensParametrizacao] = useState<ParametrizacaoItemInput[]>([]);
  const [statusAnuncio, setStatusAnuncio] = useState<string>('');
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { empresaAtiva } = useEmpresaAtiva();
  const { nivel, setNivel } = useNivelOperacional();

  const handleMudarAba = useCallback((novaAba: (typeof TABS)[number]['id']) => {
    setTab(novaAba);
    setMobileMenuOpen(false);
    const abaObj = TABS.find((t) => t.id === novaAba);
    setStatusAnuncio(`Navegou para a aba ${abaObj?.nome || novaAba}`);
  }, []);

  const handleMudarNivel = useCallback((novoNivel: typeof nivel) => {
    setNivel(novoNivel);
    setStatusAnuncio(`Nível operacional alterado para ${novoNivel}`);
  }, [setNivel]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CHAVE_SIDEBAR_STORAGE, next ? '1' : '0');
      } catch { /* sem storage */ }
      setMobileMenuOpen(next);
      setStatusAnuncio(next ? 'Menu lateral expandido' : 'Menu lateral recolhido');
      return next;
    });
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(CHAVE_TEMA_STORAGE, next);
      } catch { /* sem storage */ }
      setStatusAnuncio(
        next === 'dark'
          ? 'Tema Fiscal Intelligence (Dark Cockpit) ativado'
          : 'Tema Heritage Fiscal (Claro) ativado'
      );
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const savedSidebar = localStorage.getItem(CHAVE_SIDEBAR_STORAGE);
      if (savedSidebar === '1') setSidebarExpanded(true);
      const savedTheme = localStorage.getItem(CHAVE_TEMA_STORAGE);
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    } catch { /* sem storage */ }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme === 'light' ? 'heritage-light' : 'fiscal-dark');
      document.documentElement.style.setProperty('--sidebar-width', sidebarExpanded ? '248px' : '64px');
    }
  }, [theme, sidebarExpanded]);

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
        if (detail.itensErp && Array.isArray(detail.itensErp)) {
          setItensParametrizacao(detail.itensErp);
        }
        if (!detail.manterNaAbaAtual) {
          setTab(detail.tab);
        }
      }
    };
    window.addEventListener('navegar-aba', onNavegar);
    return () => window.removeEventListener('navegar-aba', onNavegar);
  }, []);

  return (
    <div
      className="st-shell"
      style={{ ['--sidebar-width' as string]: sidebarExpanded ? '248px' : '64px' }}
    >
      {/* Região aria-live global para anúncios de acessibilidade */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnuncio}
      </div>

      {/* HEADER COMPACTO STITCH (~56px + Tabbar 44px) */}
      <header className="st-topbar" style={{ minHeight: '56px' }}>
        <div className="st-topbar-row">
          {/* Toggle Sidebar + Identidade Corporativa Portela */}
          <div className="st-topbar-brand">
            <button
              id="headerSidebarToggleBtn"
              type="button"
              onClick={handleToggleSidebar}
              aria-expanded={sidebarExpanded}
              aria-label={sidebarExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              title={sidebarExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              className="st-sidebar-toggle-btn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                {sidebarExpanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <div className="st-logo-frame">
              <img
                src="/logo-portela.jpg"
                alt="Contabilidade Portela - Desde 1970"
                className="st-logo-img"
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="st-brand-name">MargemReal Portela</span>
                <span className="st-brand-version">v7.2</span>
              </div>
              <p className="st-brand-sub">
                Inteligência Fiscal, NCM &amp; Precificação • Desde 1970
              </p>
            </div>
          </div>

          {/* Controles Direitos: Empresa Ativa + Switcher 3 Níveis + Alternador de Tema */}
          <div className="st-topbar-controls">
            <button
              type="button"
              onClick={() => handleMudarAba('empresas')}
              title={empresaAtiva ? `Empresa Ativa: ${empresaAtiva.razaoSocial} (${empresaAtiva.cnpj})` : 'Clique para selecionar uma empresa'}
              className="st-company-chip"
            >
              <span className="st-company-dot" aria-hidden="true" />
              <span className="st-company-name">
                {empresaAtiva ? empresaAtiva.razaoSocial : 'Selecionar Empresa'}
              </span>
              {empresaAtiva && (
                <span className="st-company-cnpj">• {empresaAtiva.cnpj}</span>
              )}
            </button>

            <NivelOperacionalSwitcher
              currentLevel={nivel}
              onLevelChange={handleMudarNivel}
              size="sm"
            />

            <button
              type="button"
              onClick={handleToggleTheme}
              title={theme === 'dark' ? 'Alternar para Heritage Fiscal (Claro)' : 'Alternar para Fiscal Intelligence (Dark Cockpit)'}
              aria-label="Alternar tema visual"
              className="st-theme-btn"
            >
              <span>{theme === 'dark' ? '☀ Heritage' : '☾ Cockpit'}</span>
            </button>
          </div>
        </div>

        {/* NAVEGAÇÃO COMPACTA POR ABAS (~44px) */}
        <nav
          role="tablist"
          aria-label="Abas de operações fiscais"
          className="st-tabbar tabs"
          style={{ minHeight: '44px' }}
        >
          {TABS.map((t) => {
            const isSelected = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                title={t.hint}
                onClick={() => handleMudarAba(t.id)}
                className="st-tabbar-btn"
                style={{ minHeight: '40px' }}
              >
                {t.nome}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="st-body-layout">
        {/* SIDEBAR LATERAL RECOLHÍVEL (PADRÃO STITCH: 64px / 248px) */}
        <aside
          id="appSidebar"
          aria-label="Navegação lateral de módulos fiscais"
          className={`st-sidebar ${mobileMenuOpen ? 'is-mobile-open' : ''}`}
        >
          <div className="st-sidebar-nav">
            {TABS.map((t) => {
              const isSelected = tab === t.id;
              return (
                <button
                  key={`side-${t.id}`}
                  type="button"
                  title={t.nome}
                  aria-current={isSelected ? 'page' : undefined}
                  onClick={() => handleMudarAba(t.id)}
                  className={`st-sidebar-item ${isSelected ? 'is-active' : ''}`}
                >
                  <span className="st-sidebar-icon" aria-hidden="true">
                    {t.codigo}
                  </span>
                  {sidebarExpanded && (
                    <span className="st-sidebar-label">{t.shortNome}</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleToggleSidebar}
            title={sidebarExpanded ? 'Recolher Menu' : 'Expandir Menu'}
            className="st-sidebar-collapse-btn"
          >
            <span aria-hidden="true">{sidebarExpanded ? '«' : '»'}</span>
            {sidebarExpanded && <span>Recolher Menu</span>}
          </button>
        </aside>

        {/* CONTAINER PRINCIPAL COM RESERVA DE ALTURA (ANTI-CLS) */}
        <main className="st-main-wrap" id="parametrizar" style={{ minHeight: '600px' }}>
          <div className="wrap">
            {/* Aviso Legal Conciso */}
            <div className="disclaimer">
              <span style={{ fontSize: 16 }} aria-hidden="true">⚖️</span>
              <div className="small">
                <b>Apoio à decisão técnica, não parecer fiscal vinculante.</b> Classificação e apuração exigem
                conferência com as Notas da NESH, Resoluções Gecex, RICMS/PR (Dec. 7.871/17) e legislação da Reforma (LC 214/2025).
              </div>
            </div>

            {/* Renderização Condicional de Abas */}
            <div>
              {tab === 'empresas' && <CadastroEmpresas />}
              {tab === 'classificar' && <Classificar />}
              {tab === 'lote' && <Lote />}
              {tab === 'consultar' && <Consultar />}
              {tab === 'parametrizar' && <Parametrizar itensImportados={itensParametrizacao} />}
              {tab === 'auditoria-entrada' && <AuditoriaEntrada />}
              {tab === 'precificar' && <Precificar itensIniciais={itensPrecificacao} />}
              {tab === 'reforma' && <ReformaTab />}
              {tab === 'regras' && <Regras />}
            </div>

            <footer className="small muted" style={{ marginTop: 26, borderTop: '1px solid var(--border-muted)', paddingTop: 14 }}>
              Motor Local-First, sem envio de dados sensíveis a terceiros: processamento seguro no navegador com persistência atômica e auditoria pericial.
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
