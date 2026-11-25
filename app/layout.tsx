import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MargemReal Portela — Inteligência Fiscal & Precificação',
  description:
    'Classificação de produtos por NCM sobre a Tabela NCM vigente do Portal Único Siscomex, Auditoria de Entrada (CPC 16 / DIFAL PR), Precificação e Reforma Tributária (LC 214/2025).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="fiscal-dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
