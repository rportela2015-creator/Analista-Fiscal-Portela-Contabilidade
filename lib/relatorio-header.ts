import { esc } from './html';

export const PORTELA_HEADER_CSS = `
:root { --verde-escuro: #3A4A1E; --verde-claro: #5B7B35; }
.rel-header { border-bottom: 1.5px solid var(--verde-claro); padding-bottom: 6mm; margin-bottom: 8mm; }
.rel-header__top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.rel-header__brand { display: flex; align-items: center; gap: 14px; }
.rel-header__logo { width: 40mm; max-width: 155px; height: auto; display: block; flex-shrink: 0; }
.rel-header__headline { font: 700 13.5pt/1.25 "EB Garamond", Georgia, serif; color: var(--verde-escuro); letter-spacing: -0.01em; }
.rel-header__meta { text-align: right; font: 9pt/1.5 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #333; }
.rel-header__meta strong { display: block; font-size: 12pt; color: var(--verde-escuro); }
.rel-header__meta span { display: block; }
.rel-header__tagline { margin: 4mm 0 0; font: italic 9pt "EB Garamond", Georgia, serif; letter-spacing: .04em; color: var(--verde-claro); }
@page { margin: 18mm 15mm; }
@page :not(:first) {
  @top-left { content: "Contabilidade Portela"; font: 8pt "Inter", sans-serif; color: #5B7B35; }
  @top-right { content: "Página " counter(page) " de " counter(pages); font: 8pt "Inter", sans-serif; }
}
`;

/**
 * Logomarca SVG da Contabilidade Portela embutida como elemento inline.
 * Ideal para relatórios com CSP rígido (default-src 'none') onde <img> com src externo ou data: é bloqueado.
 */
export const PORTELA_LOGO_SVG_INLINE = `
<svg class="rel-header__logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" aria-label="Contabilidade Portela - Desde 1970">
  <defs>
    <filter id="subtle-shadow-hdr" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.12"/>
    </filter>
  </defs>
  <g filter="url(#subtle-shadow-hdr)">
    <path d="M 172 38 C 168 31 160 26 148 26 C 131 26 116 39 116 58 C 116 78 131 90 149 90 C 161 90 169 85 174 78 L 165 72 C 161 77 155 81 148 81 C 137 81 127 72 127 58 C 127 44 137 35 148 35 C 156 35 162 39 165 44 Z" fill="#5B7B35" />
    <path d="M 148 30 L 170 30 C 182 30 191 37 191 48 C 191 59 182 66 170 66 L 157 66 L 157 88 L 148 88 Z M 157 37 L 157 59 L 169 59 C 176 59 181 55 181 48 C 181 41 176 37 169 37 Z" fill="#3A4A1E" opacity="0.95" />
  </g>
  <text x="160" y="112" text-anchor="middle" fill="#5B7B35" font-family="'EB Garamond', Georgia, serif" font-size="10.5" font-weight="600" letter-spacing="0.32em">CONTABILIDADE</text>
  <text x="160" y="140" text-anchor="middle" fill="#3A4A1E" font-family="'EB Garamond', Georgia, serif" font-size="28" font-weight="700" letter-spacing="0.08em">PORTELA</text>
  <g>
    <line x1="42" y1="158" x2="114" y2="158" stroke="#5B7B35" stroke-width="1.2" stroke-linecap="round" />
    <text x="160" y="161.5" text-anchor="middle" fill="#5B7B35" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="8.5" font-weight="600" letter-spacing="0.22em">DESDE 1970</text>
    <line x1="206" y1="158" x2="278" y2="158" stroke="#5B7B35" stroke-width="1.2" stroke-linecap="round" />
  </g>
</svg>
`;

export interface HeaderPortelaOptions {
  titulo: string;
  subtitulo?: string;
  dataHora?: string;
  documentoRef?: string;
  tagline?: string;
}

/**
 * Renderiza o cabeçalho institucional unificado da Contabilidade Portela em HTML.
 * Produz estrutura em conformidade com PORTELA_HEADER_CSS e sanitiza entradas dinâmicas.
 */
export function renderHeaderPortela(opts: HeaderPortelaOptions): string {
  const dataFormatada = opts.dataHora || new Date().toLocaleString('pt-BR');
  const tagline = opts.tagline || 'Tradição, Auditoria Contábil e Engenharia Tributária · Desde 1970';

  return `
  <header class="rel-header">
    <div class="rel-header__top">
      <div class="rel-header__brand">
        ${PORTELA_LOGO_SVG_INLINE}
        <div>
          <div class="rel-header__headline">${esc(opts.titulo)}</div>
          ${opts.subtitulo ? `<div style="font-size: 10pt; color: #475569; margin-top: 2px;">${esc(opts.subtitulo)}</div>` : ''}
        </div>
      </div>
      <div class="rel-header__meta">
        <strong>CONTABILIDADE PORTELA</strong>
        <span>Emissão: ${esc(dataFormatada)}</span>
        ${opts.documentoRef ? `<span>Ref: ${esc(opts.documentoRef)}</span>` : ''}
      </div>
    </div>
    <div class="rel-header__tagline">${esc(tagline)}</div>
  </header>
  `.trim();
}
