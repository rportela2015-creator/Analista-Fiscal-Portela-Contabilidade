'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';

export interface DrawerTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ItemDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tabs?: DrawerTabItem[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  children?: React.ReactNode;
  footerActions?: React.ReactNode;
  width?: string;
  className?: string;
}

export default function ItemDetailDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  tabs = [],
  activeTabId,
  onTabChange,
  children,
  footerActions,
  width = '500px',
  className = '',
}: ItemDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const [currentTab, setCurrentTab] = useState<string>(
    activeTabId || (tabs.length > 0 ? tabs[0].id : '')
  );

  const handleTabClick = useCallback(
    (tabId: string) => {
      setCurrentTab(tabId);
      if (onTabChange) {
        onTabChange(tabId);
      }
    },
    [onTabChange]
  );

  // Gerenciamento de foco e tecla Esc
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      // Foca no botão fechar ou no drawer para prender acessibilidade
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previousActiveElementRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (activeTabId) {
      setCurrentTab(activeTabId);
    }
  }, [activeTabId]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      {/* Overlay Backdrop com desfoque suave */}
      <div
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Gaveta Lateral Deslizante */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          className={`w-screen max-w-full sm:max-w-md md:max-w-lg bg-white shadow-2xl flex flex-col z-50 border-l border-slate-200 animate-in slide-in-from-right duration-250 ${className}`}
          style={{ width }}
        >
          {/* Header da Gaveta */}
          <header className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="drawer-title" className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>}
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Fechar gaveta de detalhes (Esc)"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-blue-600 outline-none flex items-center justify-center"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          {/* Abas Internas da Gaveta (se houver) */}
          {tabs.length > 0 && (
            <div
              role="tablist"
              aria-label="Seções do detalhe do item"
              className="flex items-center gap-1 px-4 border-b border-slate-200 bg-white overflow-x-auto"
            >
              {tabs.map((tab) => {
                const isSelected = tab.id === currentTab;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isSelected}
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors select-none outline-none whitespace-nowrap ${
                      isSelected
                        ? 'border-blue-700 text-blue-900 font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                    }`}
                    style={{ minHeight: '44px' }}
                  >
                    {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Conteúdo com rolagem suave */}
          <div className="flex-1 overflow-y-auto p-5 text-xs sm:text-sm text-slate-800">
            {children}
          </div>

          {/* Rodapé de Ações Rápidas da Gaveta */}
          {footerActions && (
            <footer className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              {footerActions}
            </footer>
          )}
        </aside>
      </div>
    </div>
  );
}
