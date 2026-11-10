'use client';

import React, { useState } from 'react';
import {
  ParametrosErpPayload,
  gerarRelatorioErpResumidoTxt,
  gerarRelatorioErpResumidoHtml,
  gerarRelatorioErpDetalhadoTxt,
  gerarRelatorioErpDetalhadoHtml,
} from '@/lib/relatorio-erp';

function baixarArquivo(conteudo: string, nomeArquivo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function abrirEmNovaAba(conteudoHtml: string) {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(conteudoHtml);
    win.document.close();
  }
}

export default function ParametrizacaoERP({ data }: { data: any }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [modoModal, setModoModal] = useState<'resumido' | 'detalhado'>('resumido');
  const [formatoModal, setFormatoModal] = useState<'html' | 'txt'>('html');
  const [copiado, setCopiado] = useState('');

  if (!data || !data.itens || data.itens.length === 0) return null;

  const extrairPayload = (): ParametrosErpPayload => {
    return {
      contexto: {
        emitente: {
          nome: data.nfe?.emitente?.xNome || 'Empresa Emitente',
          cnpj: data.nfe?.emitente?.CNPJ || '',
          ie: data.nfe?.emitente?.IE || 'ISENTO',
          uf: data.nfe?.emitente?.enderEmit?.UF || '',
          regime: data.regime || 'Regime Regular',
          crt: String(data.regime || '').includes('Simples') ? '1' : '3',
        },
        destinatario: {
          nome: data.nfe?.destinatario?.xNome || 'Destinatário',
          cnpjCpf: data.nfe?.destinatario?.CNPJ || data.nfe?.destinatario?.CPF || '',
          uf: data.nfe?.destinatario?.enderDest?.UF || '',
        },
        operacao: {
          tipo: 'entrada',
          finalidade: data.finalidade || 'comercializacao',
          modelo: '55',
          anoReforma: 2026,
        },
      },
      itens: data.itens.map((it: any) => ({
        cProd: it.cProd,
        xProd: it.xProd,
        ncm: typeof it.ncm === 'object' ? (it.ncm?.auditado || it.ncm?.declarado) : it.ncm,
        cest: it.cest || (typeof it.ncm === 'object' ? it.ncm?.cest : undefined),
        cfop: it.cfop?.entradaSugerido || it.cfopEntrada || '1102',
        cstIcms: it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00',
        aliqIcms: it.icms?.aliqIcmsCredito || it.aliqIcms || '18%',
        cstPis: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
        cstCofins: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
        aliqPis: it.aliqPis || '1.65%',
        aliqCofins: it.aliqCofins || '7.6%',
        permiteCredito: it.icms?.permiteCredito ?? it.permiteCredito ?? true,
        cClassTrib: it.reforma?.cClassTrib || it.cClassTrib || '000001',
        aliqIbsUf: it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%',
        aliqCbs: it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%',
        regimeEspecial: it.reforma?.regimeEspecial || it.regimeEspecial || 'Regime Regular (Padrão)',
        instrucao: it.instrucaoCadastroERP || it.instrucaoCadastro || 'Parametrização fiscal',
      })),
    };
  };

  const handleExportCSV = () => {
    if (!data.itens) return;

    // Create CSV content
    const headers = [
      'cProd', 'xProd', 'ncm', 'cest', 'cfopEntrada', 'cstIcmsEntrada', 'aliqIcms',
      'cstPisCofinsEntrada', 'aliqPis', 'aliqCofins', 'permiteCredito',
      'cClassTrib', 'aliqIbsTransitorio', 'aliqCbsTransitorio', 'regimeEspecial'
    ];

    const rows = data.itens.map((item: any) => {
      const flatItem = {
        cProd: item.cProd,
        xProd: item.xProd,
        ncm: typeof item.ncm === 'object' ? (item.ncm?.auditado || item.ncm?.declarado) : item.ncm,
        cest: item.cest || (typeof item.ncm === 'object' ? item.ncm?.cest : ''),
        cfopEntrada: item.cfop?.entradaSugerido || item.cfopEntrada || '1102',
        cstIcmsEntrada: item.icms?.cstIcmsEntradaSugerido || item.cstIcmsEntrada || '00',
        aliqIcms: item.icms?.aliqIcmsCredito || item.aliqIcms || '18%',
        cstPisCofinsEntrada: item.pisCofins?.cstPisCofinsEntradaSugerido || item.cstPisCofinsEntrada || '50',
        aliqPis: item.aliqPis || '1.65%',
        aliqCofins: item.aliqCofins || '7.6%',
        permiteCredito: (item.icms?.permiteCredito ?? item.permiteCredito ?? true) ? 'Sim' : 'Não',
        cClassTrib: item.reforma?.cClassTrib || item.cClassTrib || '000001',
        aliqIbsTransitorio: item.reforma?.aliqIbsTeste2026 || item.aliqIbsTransitorio || '0,1%',
        aliqCbsTransitorio: item.reforma?.aliqCbsTeste2026 || item.aliqCbsTransitorio || '0,9%',
        regimeEspecial: item.reforma?.regimeEspecial || item.regimeEspecial || 'Regime Regular (Padrão)',
      };
      return headers.map(header => {
        const value = (flatItem as any)[header] !== undefined && (flatItem as any)[header] !== null ? String((flatItem as any)[header]) : '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    baixarArquivo(csv, 'parametrizacao_erp.csv', 'text/csv');
  };

  const handleCopy = (item: any) => {
    const text = JSON.stringify(item, null, 2);
    navigator.clipboard.writeText(text);
    alert('Parâmetros copiados!');
  };

  const handleGerarRelatorio = (modo: 'resumido' | 'detalhado') => {
    setModoModal(modo);
    setFormatoModal('html');
    setModalAberto(true);
  };

  const payload = extrairPayload();
  const relatorioHtml = modoModal === 'resumido'
    ? gerarRelatorioErpResumidoHtml(payload)
    : gerarRelatorioErpDetalhadoHtml(payload);
  const relatorioTxt = modoModal === 'resumido'
    ? gerarRelatorioErpResumidoTxt(payload)
    : gerarRelatorioErpDetalhadoTxt(payload);

  const copiarConteudo = async (conteudo: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(conteudo);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(''), 2000);
    } catch {
      setCopiado('use Ctrl+C');
      setTimeout(() => setCopiado(''), 2000);
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3>Parametrização de ERP</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleExportCSV} className="chip" style={{ background: '#333', color: 'white' }}>
            Exportar CSV para ERP
          </button>
          <button
            type="button"
            onClick={() => handleGerarRelatorio('resumido')}
            className="chip"
            style={{ background: '#2980b9', color: 'white', fontWeight: 600 }}
            title="Relatório com campo e código correspondente"
          >
            📋 Gerar Relatório ERP (Modo Resumido)
          </button>
          <button
            type="button"
            onClick={() => handleGerarRelatorio('detalhado')}
            className="chip"
            style={{ background: '#27ae60', color: 'white', fontWeight: 600 }}
            title="Laudo com citação de lei, artigo e dispositivo legal"
          >
            ⚖️ Gerar Relatório ERP (Modo Detalhado com Citação Legal)
          </button>
        </div>
      </div>

      {modalAberto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 8, width: '100%', maxWidth: 960, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <div>
                <strong style={{ fontSize: '1.1rem', color: '#1a365d' }}>
                  {modoModal === 'resumido'
                    ? 'Relatório ERP — Modo Resumido (Campo e Código)'
                    : 'Laudo Pericial ERP — Modo Detalhado com Citação Legal'}
                </strong>
                <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                  Contabilidade Portela (Desde 1970) · Parâmetros Fiscais & Reforma Tributária
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="mini"
                style={{ fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{
              display: 'flex', gap: 10, padding: '10px 20px', borderBottom: '1px solid #edf2f7',
              alignItems: 'center', flexWrap: 'wrap', background: '#ffffff'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Visualização:</span>
              <button
                type="button"
                className={`mini ${formatoModal === 'html' ? 'on' : ''}`}
                style={{ background: formatoModal === 'html' ? '#2b6cb0' : '#edf2f7', color: formatoModal === 'html' ? 'white' : '#2d3748' }}
                onClick={() => setFormatoModal('html')}
              >
                Formatada (HTML)
              </button>
              <button
                type="button"
                className={`mini ${formatoModal === 'txt' ? 'on' : ''}`}
                style={{ background: formatoModal === 'txt' ? '#2b6cb0' : '#edf2f7', color: formatoModal === 'txt' ? 'white' : '#2d3748' }}
                onClick={() => setFormatoModal('txt')}
              >
                Texto Puro (TXT)
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="mini"
                  onClick={() => abrirEmNovaAba(relatorioHtml)}
                  style={{ background: '#4a5568', color: 'white' }}
                >
                  ↗ Abrir em Nova Aba / Imprimir
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => baixarArquivo(
                    relatorioHtml,
                    `relatorio_erp_${modoModal}.html`,
                    'text/html; charset=utf-8'
                  )}
                  style={{ background: '#2b6cb0', color: 'white' }}
                >
                  ⬇ Baixar HTML
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => baixarArquivo(
                    relatorioTxt,
                    `relatorio_erp_${modoModal}.txt`,
                    'text/plain; charset=utf-8'
                  )}
                  style={{ background: '#2d3748', color: 'white' }}
                >
                  ⬇ Baixar TXT
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => copiarConteudo(
                    formatoModal === 'html' ? relatorioHtml : relatorioTxt,
                    'copiado'
                  )}
                >
                  Copiar {copiado ? '✓' : ''}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#f7fafc' }}>
              {formatoModal === 'html' ? (
                <iframe
                  title="Pré-visualização do Relatório"
                  srcDoc={relatorioHtml}
                  style={{ width: '100%', height: '550px', border: 'none', background: 'white', borderRadius: 4 }}
                />
              ) : (
                <pre style={{
                  background: 'white', padding: 16, borderRadius: 4, border: '1px solid #cbd5e0',
                  fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', maxHeight: '550px', overflow: 'auto'
                }}>
                  {relatorioTxt}
                </pre>
              )}
            </div>

            <div style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'right' }}>
              <button type="button" onClick={() => setModalAberto(false)} className="mini">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {data.itens.map((item: any, idx: number) => (
          <div key={idx} className="card" style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <strong>{item.cProd || 'N/A'} - {item.xProd || 'Produto não informado'}</strong>
                <div className="small">NCM: {item.ncm} | CEST: {item.cest}</div>
              </div>
              <button type="button" onClick={() => handleCopy(item)} className="chip">Copiar Parâmetros</button>
            </div>

            <div className="taxgrid" style={{ marginBottom: 16 }}>
              {/* Bloco ICMS/ST */}
              <div className="tax" style={{ borderLeft: '4px solid #4A90E2', paddingLeft: 8 }}>
                <div className="k">Bloco ICMS/ST</div>
                <div className="v">CFOP: {item.cfop?.entradaSugerido || item.cfopEntrada}</div>
                <div className="v">CST: {item.icms?.cstIcmsEntradaSugerido || item.cstIcmsEntrada}</div>
                <div className="v">Alíquota: {item.icms?.aliqIcmsCredito || item.aliqIcms}</div>
                <div className="v">Crédito: {(item.icms?.permiteCredito ?? item.permiteCredito) ? 'Sim' : 'Não'}</div>
              </div>

              {/* Bloco PIS/COFINS */}
              <div className="tax" style={{ borderLeft: '4px solid #F5A623', paddingLeft: 8 }}>
                <div className="k">Bloco PIS/COFINS</div>
                <div className="v">CST: {item.pisCofins?.cstPisCofinsEntradaSugerido || item.cstPisCofinsEntrada}</div>
                <div className="v">Alíquota PIS: {item.aliqPis || '1.65%'}</div>
                <div className="v">Alíquota COFINS: {item.aliqCofins || '7.6%'}</div>
              </div>

              {/* Bloco Reforma Tributária */}
              <div className="tax" style={{ borderLeft: '4px solid #7ED321', paddingLeft: 8 }}>
                <div className="k">Bloco Reforma Tributária</div>
                <div className="v">cClassTrib: {item.reforma?.cClassTrib || item.cClassTrib}</div>
                <div className="v">Alíquota IBS: {item.reforma?.aliqIbsTeste2026 || item.aliqIbsTransitorio}</div>
                <div className="v">Alíquota CBS: {item.reforma?.aliqCbsTeste2026 || item.aliqCbsTransitorio}</div>
                <div className="v">Regime: {item.reforma?.regimeEspecial || item.regimeEspecial || 'Regime Regular (Padrão)'}</div>
              </div>
            </div>

            <div className="note info" style={{ marginTop: 8 }}>
              <strong>Instrução:</strong> {item.instrucaoCadastroERP || item.instrucaoCadastro}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
