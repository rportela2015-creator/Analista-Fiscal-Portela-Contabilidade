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
  { id: 'empresas', nome: '0 · Clientes & Perfis', hint: 'gestão de empresas, CNPJs, perfis tributários bitemporais e status dos sidecars' },
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
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('empresas');
  const [itensPrecificacao, setItensPrecificacao] = useState<PrecificacaoItemInput[]>([]);
  const [itensParametrizacao, setItensParametrizacao] = useState<ParametrizacaoItemInput[]>([]);
  const [statusAnuncio, setStatusAnuncio] = useState<string>('');

  const { empresaAtiva } = useEmpresaAtiva();
  const { nivel, setNivel } = useNivelOperacional();

  const handleMudarAba = useCallback((novaAba: (typeof TABS)[number]['id']) => {
    setTab(novaAba);
    const abaObj = TABS.find((t) => t.id === novaAba);
    setStatusAnuncio(`Navegou para a aba ${abaObj?.nome || novaAba}`);
  }, []);

  const handleMudarNivel = useCallback((novoNivel: typeof nivel) => {
    setNivel(novoNivel);
    setStatusAnuncio(`Nível operacional alterado para ${novoNivel}`);
  }, [setNivel]);

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
    <>
      {/* Região aria-live global para anúncios de acessibilidade */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnuncio}
      </div>

      {/* HEADER COMPACTO (~56px) - Eliminação de Dead Space */}
      <header
        className="w-full bg-[#0e291b] text-white border-b border-[#0d2b1a] sticky top-0 z-30 shadow-md"
        style={{ minHeight: '56px' }}
      >
        <div className="max-w-[1440px] mx-auto px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
          {/* Identidade Corporativa Portela */}
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-md shadow-xs flex items-center justify-center">
              <img
                src="/logo-portela.jpg"
                alt="Contabilidade Portela - Desde 1970"
                className="h-8 w-auto object-contain block"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-xs sm:text-sm tracking-wider text-[#c9e6d4] uppercase">
                  Portela Fiscal
                </span>
                <span className="text-[10px] font-mono bg-white/15 text-white/90 px-1.5 py-0.5 rounded border border-white/20 uppercase">
                  v7.0
                </span>
              </div>
              <p className="text-[10.5px] text-white/70 hidden sm:block">
                Auditoria NCM & Reforma Tributária • Desde 1970
              </p>
            </div>
          </div>

          {/* Empresa Ativa Chip & Seletor de Nível */}
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {/* Chip de Empresa Ativa (clique leva à aba de empresas) */}
            <button
              type="button"
              onClick={() => handleMudarAba('empresas')}
              title={empresaAtiva ? `Empresa Ativa: ${empresaAtiva.razaoSocial} (${empresaAtiva.cnpj})` : 'Clique para selecionar uma empresa'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-black/25 hover:bg-black/40 border border-white/20 text-white/90 transition-colors"
              style={{ minHeight: '38px' }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              <span className="truncate max-w-[180px] sm:max-w-[240px]">
                {empresaAtiva ? empresaAtiva.razaoSocial : 'Selecionar Empresa'}
              </span>
              {empresaAtiva && (
                <span className="text-[10px] font-mono text-emerald-200 hidden md:inline">
                  • {empresaAtiva.cnpj}
                </span>
              )}
            </button>

            {/* Seletor Unificado de 3 Níveis Operacionais */}
            <NivelOperacionalSwitcher
              currentLevel={nivel}
              onLevelChange={handleMudarNivel}
              size="sm"
            />
          </div>
        </div>

        {/* NAVEGAÇÃO COMPACTA POR ABAS (~44px) */}
        <nav
          role="tablist"
          aria-label="Abas de operações fiscais"
          className="max-w-[1440px] mx-auto px-4 flex items-center gap-1 overflow-x-auto border-t border-white/10"
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
                className={`flex items-center px-3 py-2 text-xs font-semibold rounded-t-md transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-white select-none ${
                  isSelected
                    ? 'bg-[#f5f7fb] text-[#0b3d91] shadow-xs'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                style={{ minHeight: '40px' }}
              >
                {t.nome}
              </button>
            );
          })}
        </nav>
      </header>

      {/* CONTAINER PRINCIPAL COM RESERVA DE ALTURA (ANTI-CLS) */}
      <main className="wrap" id="parametrizar" style={{ minHeight: '600px' }}>
        {/* Aviso Legal Conciso */}
        <div className="disclaimer" style={{ marginTop: '14px', marginBottom: '14px' }}>
          <span style={{ fontSize: 18 }} aria-hidden="true">⚖️</span>
          <div className="text-xs">
            <b>Apoio à decisão técnica, não parecer fiscal vinculante.</b> Classificação de mercadorias exige
            conferência com as Notas da NESH, Resoluções Gecex, RICMS/PR (Dec. 7.871/17) e legislação da Reforma (LC 214/2025).
          </div>
        </div>

        {/* Renderização Condicional de Abas com Reserva de Espaço */}
        <div className="w-full">
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

        <footer className="small muted" style={{ marginTop: 26, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          Motor local, sem envio de dados a terceiros: processamento seguro no navegador com persistência local e auditoria pericial.
        </footer>
      </main>
    </>
  );
}
