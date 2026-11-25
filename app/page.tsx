'use client';

import { useEffect, useState, useCallback, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import { useEmpresaAtiva } from '@/lib/hooks/useEmpresaAtiva';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import NivelOperacionalSwitcher from '@/components/ui/NivelOperacionalSwitcher';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
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

type TabId = (typeof TABS)[number]['id'];

interface InfraStatus {
  dbOnline: boolean;
  totalEmpresas: number;
  sidecarsOnline: number;
  sidecarsTotal: number;
  modo: string;
  carregado: boolean;
}

interface QuickJumpItem {
  id: string;
  tab: TabId;
  codigo: string;
  label: string;
  hint: string;
  storageKey?: string;
  queryText?: string;
}

const CHAVE_SIDEBAR_STORAGE = 'portela_sidebar_expanded_v1';
const CHAVE_TEMA_STORAGE = 'portela_theme_v1';

export default function Home() {
  // 1. TODOS OS HOOKS DECLARADOS NO TOPO ABSOLUTO (scripts/hookcheck.mjs)
  const [tab, setTab] = useState<TabId>('empresas');
  const [itensPrecificacao, setItensPrecificacao] = useState<PrecificacaoItemInput[]>([]);
  const [itensParametrizacao, setItensParametrizacao] = useState<ParametrizacaoItemInput[]>([]);
  const [statusAnuncio, setStatusAnuncio] = useState<string>('');
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [quickSearchOpen, setQuickSearchOpen] = useState<boolean>(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState<string>('');
  const [infraStatus, setInfraStatus] = useState<InfraStatus>({
    dbOnline: true,
    totalEmpresas: 0,
    sidecarsOnline: 0,
    sidecarsTotal: 3,
    modo: 'hybrid_fallback',
    carregado: false,
  });

  const headerRef = useRef<HTMLElement>(null);
  const quickSearchInputRef = useRef<HTMLInputElement>(null);
  const quickSearchListRef = useRef<HTMLDivElement>(null);
  const quickSearchPrevFocusRef = useRef<HTMLElement | null>(null);
  const wasQuickSearchOpenRef = useRef<boolean>(false);
  const tablistRef = useRef<HTMLElement>(null);

  const { empresaAtiva } = useEmpresaAtiva();
  const { nivel, setNivel } = useNivelOperacional();

  const activeTabMeta = useMemo(
    () => TABS.find((t) => t.id === tab) ?? TABS[0],
    [tab]
  );

  const quickSearchMatches = useMemo<QuickJumpItem[]>(() => {
    const q = quickSearchQuery.trim();
    const qLower = q.toLowerCase();

    const filteredTabs: QuickJumpItem[] = TABS.filter((t) => {
      if (!qLower) return true;
      return (
        t.nome.toLowerCase().includes(qLower) ||
        t.shortNome.toLowerCase().includes(qLower) ||
        t.hint.toLowerCase().includes(qLower) ||
        t.codigo.includes(qLower)
      );
    }).map((t) => ({
      id: `tab-${t.id}`,
      tab: t.id,
      codigo: t.codigo,
      label: t.nome,
      hint: t.hint,
    }));

    if (!q) return filteredTabs;

    const smartActions: QuickJumpItem[] = [
      {
        id: 'jump-ncm',
        tab: 'consultar',
        codigo: 'NCM',
        label: `Consultar NCM "${q}" na Tabela Oficial`,
        hint: 'Abre a aba 3 · Consultar NCM e preserva a chave de pesquisa',
        storageKey: 'portela_quick_search_ncm',
        queryText: q,
      },
      {
        id: 'jump-classificar',
        tab: 'classificar',
        codigo: 'IA',
        label: `Classificar produto "${q}"`,
        hint: 'Abre a aba 1 · Classificar produto com o termo informado',
        storageKey: 'portela_quick_search_classificar',
        queryText: q,
      },
      {
        id: 'jump-cnpj',
        tab: 'empresas',
        codigo: 'CNPJ',
        label: `Buscar / cadastrar CNPJ "${q}"`,
        hint: 'Abre a aba 0 · Clientes & Perfis para consulta RFB',
        storageKey: 'portela_quick_search_cnpj',
        queryText: q,
      },
      {
        id: 'jump-auditoria',
        tab: 'auditoria-entrada',
        codigo: 'NF-e',
        label: `Auditar entrada / chave "${q}"`,
        hint: 'Abre a aba 5 · Auditoria (Entrada) preservando o termo',
        storageKey: 'portela_quick_search_auditoria',
        queryText: q,
      },
    ];

    return [...smartActions, ...filteredTabs];
  }, [quickSearchQuery]);

  const refreshInfraStatus = useCallback(async () => {
    try {
      const [empRes, rtcRes] = await Promise.allSettled([
        fetch('/api/empresas', { cache: 'no-store' }),
        fetch('/api/rtc/status', { cache: 'no-store' }),
      ]);

      let dbOnline = false;
      let totalEmpresas = 0;
      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        try {
          const empData = await empRes.value.json();
          if (empData?.sucesso) {
            dbOnline = true;
            totalEmpresas = typeof empData.total === 'number' ? empData.total : 0;
          }
        } catch { /* resposta JSON inválida */ }
      }

      let sidecarsOnline = 0;
      const sidecarsTotal = 3;
      let modo = 'hybrid_fallback';
      if (rtcRes.status === 'fulfilled' && rtcRes.value.ok) {
        try {
          const rtcData = await rtcRes.value.json();
          const servicos = rtcData?.servicos;
          if (servicos) {
            sidecarsOnline = [
              Boolean(servicos.regimeRegular?.online),
              Boolean(servicos.simplesNacional?.online),
              Boolean(servicos.danfse?.online),
            ].filter(Boolean).length;
          }
          if (typeof rtcData?.modoOperacao === 'string') {
            modo = rtcData.modoOperacao;
          }
        } catch { /* resposta JSON inválida */ }
      }

      setInfraStatus({
        dbOnline,
        totalEmpresas,
        sidecarsOnline,
        sidecarsTotal,
        modo,
        carregado: true,
      });
    } catch {
      setInfraStatus((prev) => ({
        ...prev,
        dbOnline: false,
        carregado: true,
      }));
    }
  }, []);

  const handleMudarAba = useCallback((novaAba: TabId) => {
    setTab(novaAba);
    setMobileMenuOpen(false);
    const abaObj = TABS.find((t) => t.id === novaAba);
    setStatusAnuncio(`Navegou para a aba ${abaObj?.nome || novaAba}`);
    if (typeof window !== 'undefined') {
      try {
        if (window.location.hash !== `#${novaAba}`) {
          window.history.replaceState(null, '', `#${novaAba}`);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch { /* sem window */ }
    }
  }, []);

  const handleMudarNivel = useCallback((novoNivel: typeof nivel) => {
    setNivel(novoNivel);
    setStatusAnuncio(`Nível operacional alterado para ${novoNivel}`);
  }, [setNivel]);

  const handleToggleSidebar = useCallback(() => {
    const mobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : isMobileViewport;
    if (mobile) {
      const nextMobile = !mobileMenuOpen;
      setMobileMenuOpen(nextMobile);
      setStatusAnuncio(nextMobile ? 'Menu lateral aberto' : 'Menu lateral fechado');
      return;
    }

    const nextExpanded = !sidebarExpanded;
    setSidebarExpanded(nextExpanded);
    setMobileMenuOpen(false);
    try {
      localStorage.setItem(CHAVE_SIDEBAR_STORAGE, nextExpanded ? '1' : '0');
    } catch { /* sem storage */ }
    setStatusAnuncio(nextExpanded ? 'Menu lateral expandido' : 'Menu lateral recolhido');
  }, [isMobileViewport, mobileMenuOpen, sidebarExpanded]);

  const handleToggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem(CHAVE_TEMA_STORAGE, nextTheme);
    } catch { /* sem storage */ }
    setStatusAnuncio(
      nextTheme === 'dark'
        ? 'Tema Fiscal Intelligence (Dark Cockpit) ativado'
        : 'Tema Heritage Fiscal (Claro) ativado'
    );
  }, [theme]);

  const handleQuickSearchSelect = useCallback((item: QuickJumpItem) => {
    if (item.storageKey && item.queryText) {
      try {
        sessionStorage.setItem(item.storageKey, item.queryText);
      } catch { /* sem storage */ }
    }
    if (typeof window !== 'undefined' && item.queryText) {
      window.dispatchEvent(
        new CustomEvent('navegar-aba', {
          detail: { tab: item.tab, query: item.queryText, manterNaAbaAtual: false },
        })
      );
    }
    handleMudarAba(item.tab);
    setQuickSearchOpen(false);
    setQuickSearchQuery('');
  }, [handleMudarAba]);

  const handleQuickSearchModalKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setQuickSearchOpen(false);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    const items = Array.from(
      quickSearchListRef.current?.querySelectorAll<HTMLButtonElement>('.st-cmdk-item') ?? []
    );
    if (items.length === 0) return;

    e.preventDefault();
    const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const currentIndex = items.findIndex((el) => el === activeEl);

    if (e.key === 'ArrowDown') {
      if (activeEl === quickSearchInputRef.current || currentIndex === -1) {
        items[0].focus();
      } else if (currentIndex < items.length - 1) {
        items[currentIndex + 1].focus();
      } else {
        quickSearchInputRef.current?.focus();
      }
      return;
    }

    if (activeEl === quickSearchInputRef.current || currentIndex === -1) {
      items[items.length - 1].focus();
    } else if (currentIndex > 0) {
      items[currentIndex - 1].focus();
    } else {
      quickSearchInputRef.current?.focus();
    }
  }, []);

  const handleTabListKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    const currentIndex = TABS.findIndex((t) => t.id === tab);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = TABS.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const targetTab = TABS[nextIndex];
      if (targetTab) {
        handleMudarAba(targetTab.id);
        const tabButtons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabButtons?.[nextIndex]?.focus();
      }
    }
  }, [tab, handleMudarAba]);

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
    if (typeof window === 'undefined' || !headerRef.current) return;
    const el = headerRef.current;
    const syncHeaderHeight = () => {
      const rect = el.getBoundingClientRect();
      const h = Math.max(56, Math.round(rect.height));
      document.documentElement.style.setProperty('--header-height', `${h}px`);
    };
    syncHeaderHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobileViewport(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setQuickSearchOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (quickSearchOpen) {
      if (!wasQuickSearchOpenRef.current && typeof document !== 'undefined') {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl && !activeEl.closest('.st-cmdk-modal')) {
          quickSearchPrevFocusRef.current = activeEl;
        }
      }
      wasQuickSearchOpenRef.current = true;
      const timer = setTimeout(() => {
        quickSearchInputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }

    if (wasQuickSearchOpenRef.current) {
      wasQuickSearchOpenRef.current = false;
      const prev = quickSearchPrevFocusRef.current;
      quickSearchPrevFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    }
  }, [quickSearchOpen]);

  useEffect(() => {
    refreshInfraStatus();
    const onEmpresaChanged = () => {
      refreshInfraStatus();
    };
    window.addEventListener('empresa_ativa_changed', onEmpresaChanged);
    return () => window.removeEventListener('empresa_ativa_changed', onEmpresaChanged);
  }, [refreshInfraStatus]);

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem('ncm-abas');
      if (salvo && TABS.some((t) => t.id === salvo)) {
        setTab(salvo as TabId);
        sessionStorage.removeItem('ncm-abas');
      } else if (typeof window !== 'undefined' && window.location.hash) {
        const hashId = window.location.hash.replace(/^#/, '');
        if (TABS.some((t) => t.id === hashId)) {
          setTab(hashId as TabId);
        }
      }
    } catch { /* sem storage */ }

    const onHashChange = () => {
      const hashId = window.location.hash.replace(/^#/, '');
      if (TABS.some((t) => t.id === hashId)) {
        setTab(hashId as TabId);
      }
    };

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
          try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } catch { /* sem window */ }
        }
      }
    };

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('navegar-aba', onNavegar);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('navegar-aba', onNavegar);
    };
  }, []);

  const infraVariant = !infraStatus.carregado
    ? 'is-warn'
    : !infraStatus.dbOnline
      ? 'is-err'
      : infraStatus.sidecarsOnline === infraStatus.sidecarsTotal
        ? 'is-ok'
        : 'is-warn';

  const infraLabel = !infraStatus.carregado
    ? 'Verificando...'
    : !infraStatus.dbOnline
      ? 'Base Offline'
      : `Base OK · RFB ${infraStatus.sidecarsOnline}/${infraStatus.sidecarsTotal}`;

  const isSidebarControlExpanded = isMobileViewport ? mobileMenuOpen : sidebarExpanded;

  return (
    <div
      className="st-shell"
      style={{ ['--sidebar-width' as string]: sidebarExpanded ? '248px' : '64px' }}
    >
      {/* Região aria-live global para anúncios de acessibilidade */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnuncio}
      </div>

      {/* HEADER STICKY COMPACTO EM LINHA ÚNICA (DESIGN LOCK STITCH) */}
      <header ref={headerRef} className="st-topbar" style={{ minHeight: '56px' }}>
        <div className="st-topbar-row">
          {/* Toggle Sidebar + Identidade Corporativa Portela */}
          <div className="st-topbar-brand">
            <button
              id="headerSidebarToggleBtn"
              type="button"
              onClick={handleToggleSidebar}
              aria-expanded={isSidebarControlExpanded}
              aria-label={isSidebarControlExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              title={isSidebarControlExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              className="st-sidebar-toggle-btn st-touch-target"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                {isSidebarControlExpanded ? (
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

            <div className="st-brand-copy">
              <div className="st-brand-title-line">
                <span className="st-brand-name">MargemReal Portela</span>
                <span className="st-brand-badge">INTELIGÊNCIA FISCAL</span>
              </div>
              <p className="st-brand-sub">
                NCM, Auditoria &amp; Precificação • Desde 1970
              </p>
            </div>
          </div>

          {/* Atalho Global [CTRL + K] */}
          <button
            type="button"
            onClick={() => setQuickSearchOpen(true)}
            aria-label="Abrir busca rápida (Ctrl+K)"
            title="Busca rápida de NCM, CNPJ ou módulo (Ctrl+K)"
            className="st-quick-search-btn st-touch-target"
            style={{ minHeight: '44px' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="st-quick-search-text">Buscar NCM, CNPJ, aba...</span>
            </span>
            <kbd className="st-quick-search-kbd">CTRL + K</kbd>
          </button>

          {/* Controles Direitos: Empresa Ativa + Status Sidecar/DB + Switcher 3 Níveis + Tema + Crédito */}
          <div className="st-topbar-controls">
            <button
              type="button"
              onClick={() => handleMudarAba('empresas')}
              title={empresaAtiva ? `Empresa Ativa: ${empresaAtiva.razaoSocial} (${empresaAtiva.cnpj})` : 'Clique para selecionar uma empresa'}
              className="st-company-chip st-touch-target"
              style={{ minHeight: '44px' }}
            >
              <span className="st-company-dot" aria-hidden="true" />
              <span className="st-company-name">
                {empresaAtiva ? empresaAtiva.razaoSocial : 'Selecionar Empresa'}
              </span>
              {empresaAtiva && (
                <span className="st-company-cnpj">• {empresaAtiva.cnpj}</span>
              )}
            </button>

            <button
              type="button"
              onClick={refreshInfraStatus}
              title={`Persistência local (${infraStatus.totalEmpresas} empresas) e sidecars RFB (${infraStatus.modo}). Clique para atualizar.`}
              aria-label={`Status de infraestrutura: ${infraLabel}`}
              className={`st-infra-pill st-touch-target ${infraVariant}`}
              style={{ minHeight: '44px' }}
            >
              <span className="st-infra-dot" aria-hidden="true" />
              <span>{infraLabel}</span>
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
              className="st-theme-btn st-touch-target"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
              <span className="st-theme-label">{theme === 'dark' ? 'Heritage' : 'Cockpit'}</span>
            </button>

            <div className="st-topbar-credit">
              <span className="st-topbar-credit-main">Desenvolvido por Contabilidade Portela</span>
              <span className="st-topbar-credit-sub">TODOS OS DIREITOS RESERVADOS</span>
            </div>
          </div>
        </div>
      </header>

      <div className="st-body-layout">
        {mobileMenuOpen && (
          <button
            type="button"
            aria-label="Fechar menu lateral"
            className="st-sidebar-backdrop"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* SIDEBAR CANÔNICA RECOLHÍVEL DE 9 ABAS (64px <-> 248px) */}
        <aside
          id="appSidebar"
          aria-label="Navegação lateral de módulos fiscais"
          className={`st-sidebar ${sidebarExpanded ? 'is-expanded' : 'is-collapsed'} ${mobileMenuOpen ? 'is-mobile-open' : ''}`}
        >
          <nav
            ref={tablistRef}
            role="tablist"
            aria-orientation="vertical"
            aria-label="Abas de operações fiscais"
            onKeyDown={handleTabListKeyDown}
            className="st-sidebar-nav tabs"
          >
            {TABS.map((t) => {
              const isSelected = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={isSelected}
                  aria-controls={t.id}
                  tabIndex={isSelected ? 0 : -1}
                  title={t.nome}
                  onClick={() => handleMudarAba(t.id)}
                  className={`st-sidebar-item st-touch-target ${isSelected ? 'is-active' : ''}`}
                  style={{ minHeight: '44px' }}
                >
                  <span className="st-sidebar-icon" aria-hidden="true">
                    {t.codigo}
                  </span>
                  <span className={sidebarExpanded || mobileMenuOpen ? 'st-sidebar-label' : 'st-sidebar-label sr-only'}>
                    {t.nome}
                  </span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleToggleSidebar}
            aria-expanded={isSidebarControlExpanded}
            title={isSidebarControlExpanded ? 'Recolher Menu' : 'Expandir Menu'}
            className="st-sidebar-collapse-btn st-touch-target"
            style={{ minHeight: '44px' }}
          >
            <span aria-hidden="true">{isSidebarControlExpanded ? '«' : '»'}</span>
            {isSidebarControlExpanded && <span>Recolher Menu</span>}
          </button>
        </aside>

        {/* CONTAINER PRINCIPAL COM ID DINÂMICO E ERROR BOUNDARY POR MÓDULO */}
        <main className="st-main-wrap" id={tab} style={{ minHeight: '600px' }}>
          <div className="wrap">
            {/* Faixa Contextual da Aba Ativa */}
            <div className="st-context-bar">
              <div className="st-context-pill">
                <span className="st-context-code">{activeTabMeta.codigo}</span>
                <span>{activeTabMeta.nome}</span>
              </div>
              <span className="st-context-hint">{activeTabMeta.hint}</span>
            </div>

            {/* Aviso Legal Conciso */}
            <div className="disclaimer">
              <span style={{ fontSize: 16 }} aria-hidden="true">⚖️</span>
              <div className="small">
                <b>Apoio à decisão técnica, não parecer fiscal vinculante.</b> Classificação e apuração exigem
                conferência com as Notas da NESH, Resoluções Gecex, RICMS/PR (Dec. 7.871/17) e legislação da Reforma (LC 214/2025).
              </div>
            </div>

            {/* Renderização Condicional de Abas protegida por ErrorBoundary */}
            <ErrorBoundary key={tab} fallbackTitle={`Falha no módulo ${activeTabMeta.nome}`}>
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
            </ErrorBoundary>

            <footer className="small muted" style={{ marginTop: 26, borderTop: '1px solid var(--border-muted)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <span>
                Motor Local-First, sem envio de dados sensíveis a terceiros: processamento seguro no navegador com persistência atômica e auditoria pericial.
              </span>
              <strong style={{ color: 'var(--ink)' }}>
                Desenvolvido por Contabilidade Portela — TODOS OS DIREITOS RESERVADOS
              </strong>
            </footer>
          </div>
        </main>
      </div>

      {/* MODAL DE BUSCA RÁPIDA [CTRL + K] */}
      {quickSearchOpen && (
        <div
          role="presentation"
          className="st-cmdk-backdrop"
          onClick={() => setQuickSearchOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Busca rápida e navegação entre módulos"
            className="st-cmdk-modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleQuickSearchModalKeyDown}
          >
            <div className="st-cmdk-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={quickSearchInputRef}
                type="search"
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickSearchMatches.length > 0) {
                    e.preventDefault();
                    handleQuickSearchSelect(quickSearchMatches[0]);
                  }
                }}
                placeholder="Digite NCM, descrição, CNPJ, chave ou nome da aba..."
                aria-label="Termo de busca rápida"
                className="st-cmdk-input"
              />
              <button
                type="button"
                onClick={() => setQuickSearchOpen(false)}
                aria-label="Fechar busca rápida (Esc)"
                className="st-btn-secondary st-touch-target"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                ESC
              </button>
            </div>

            <div ref={quickSearchListRef} className="st-cmdk-list">
              <div className="st-cmdk-section-lbl">
                {quickSearchQuery.trim() ? 'Ações fiscais e módulos encontrados' : 'Módulos fiscais (0 a 8)'}
              </div>
              {quickSearchMatches.length === 0 ? (
                <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Nenhum módulo correspondente encontrado.
                </div>
              ) : (
                quickSearchMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleQuickSearchSelect(item)}
                    className="st-cmdk-item st-touch-target"
                    style={{ minHeight: '44px' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span className="st-context-code">{item.codigo}</span>
                      <span>{item.label}</span>
                    </span>
                    <span className="st-cmdk-item-hint">{item.hint}</span>
                  </button>
                ))
              )}
            </div>

            <div className="st-cmdk-footer">
              <span>Enter para abrir o primeiro resultado · Esc para fechar</span>
              <span className="mono">MargemReal Portela</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
