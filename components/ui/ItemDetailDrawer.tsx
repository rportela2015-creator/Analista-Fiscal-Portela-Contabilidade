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
  width = '540px',
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

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
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
    <div role="presentation" className="st-drawer-root">
      <div
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
        className="st-drawer-backdrop"
      />

      <div className="st-drawer-container">
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          className={`st-drawer-panel ${className}`}
          style={{ width }}
        >
          <header className="st-drawer-header">
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <h2 id="drawer-title" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                {title}
              </h2>
              {subtitle && (
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {subtitle}
                </p>
              )}
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Fechar gaveta de detalhes (Esc)"
              className="st-drawer-close"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          {tabs.length > 0 && (
            <div role="tablist" aria-label="Seções do detalhe do item" className="st-drawer-tabs">
              {tabs.map((tab) => {
                const isSelected = tab.id === currentTab;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isSelected}
                    onClick={() => handleTabClick(tab.id)}
                    className={`st-drawer-tab ${isSelected ? 'is-active' : ''}`}
                    style={{ minHeight: '44px' }}
                  >
                    {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="st-drawer-body">{children}</div>

          {footerActions && (
            <footer className="st-drawer-footer">{footerActions}</footer>
          )}
        </aside>
      </div>
    </div>
  );
}
