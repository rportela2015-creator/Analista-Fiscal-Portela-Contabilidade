'use client';

/**
 * Painel Interativo de Auditoria de NFS-e / DPS Padrão Nacional e Gerador de DANFSe
 * Analista Fiscal Portela Contabilidade — Ciclo 6 (Sub-Etapa 19.6)
 *
 * Cumpre 100% das diretrizes de WCAG AA e a Ordem Estrita de React Hooks (hookcheck OK).
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { ResultadoAuditoriaNfse } from '@/lib/extrator-nfse-types';

interface PainelNfseDanfseProps {
  resultado: ResultadoAuditoriaNfse;
  onVoltarParaUpload?: () => void;
  empresaAtivaNome?: string;
}

export function PainelNfseDanfse({
  resultado,
  onVoltarParaUpload,
  empresaAtivaNome,
}: PainelNfseDanfseProps) {
  // --------------------------------------------------------------------------
  // HOOKS NO TOPO ABSOLUTO (OBRIGATÓRIO PARA @scripts/hookcheck.mjs)
  // --------------------------------------------------------------------------
  const [stc, setStc] = useState<'0' | '1' | '2'>('0');
  const [canhoto, setCanhoto] = useState<boolean>(true);
  const [gerandoPdf, setGerandoPdf] = useState<boolean>(false);
  const [erroDanfse, setErroDanfse] = useState<string | null>(null);
  const [orientacaoDanfse, setOrientacaoDanfse] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filtroAlertas, setFiltroAlertas] = useState<'TODOS' | 'CRITICO' | 'ATENCAO' | 'INFO'>('TODOS');
  const [baixandoRelatorio, setBaixandoRelatorio] = useState<boolean>(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);

  // Limpeza de Blob URL para evitar vazamento de memória (Memory Leak Guard)
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Handler de geração do DANFSe PDF
  const handleGerarDanfse = useCallback(async () => {
    setGerandoPdf(true);
    setErroDanfse(null);
    setOrientacaoDanfse(null);

    try {
      const resp = await fetch(`/api/rtc/danfse?stc=${stc}&canhoto=${canhoto}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/pdf, application/json',
        },
        body: resultado.extracao.rawXml,
      });

      if (!resp.ok) {
        let errJson: any;
        try {
          errJson = await resp.json();
        } catch {
          errJson = { mensagem: `Falha na requisição (Status HTTP ${resp.status})` };
        }

        setErroDanfse(errJson.mensagem || errJson.error || 'Não foi possível gerar o DANFSe em PDF.');
        if (errJson.orientacao) {
          setOrientacaoDanfse(errJson.orientacao);
        } else if (resp.status === 503) {
          setOrientacaoDanfse('Suba o container rtc-danfse via docker compose up -d rtc-danfse');
        }
        return;
      }

      const blob = await resp.blob();
      const novoBlobUrl = URL.createObjectURL(blob);

      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(novoBlobUrl);
    } catch (err: any) {
      setErroDanfse(err.message || 'Erro de rede ao conectar ao gerador de DANFSe.');
      setOrientacaoDanfse('Verifique se o container docker "rtc-danfse" está ativo na porta 8084.');
    } finally {
      setGerandoPdf(false);
    }
  }, [stc, canhoto, resultado.extracao.rawXml, pdfUrl]);

  // Handler de emissão de Laudo Pericial de NFS-e (HTML / TXT)
  const handleBaixarLaudoNfse = useCallback(async (formato: 'html' | 'txt') => {
    setBaixandoRelatorio(true);
    setErroRelatorio(null);
    try {
      const resp = await fetch('/api/auditoria-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: formato,
          auditoriaNfse: resultado,
          sha256: resultado.extracao.sha256,
          tituloDocumento: `Laudo Pericial — NFS-e ${resultado.extracao.identificacao?.nNFSe || resultado.extracao.identificacao?.nDPS || 'Nacional'}`,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Falha HTTP ${resp.status} ao gerar laudo da NFS-e.`);
      }

      const blob = await resp.blob();
      if (typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laudo_nfse_${resultado.extracao.identificacao?.nNFSe || resultado.extracao.identificacao?.nDPS || 'nacional'}.${formato}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setErroRelatorio(err.message || 'Erro ao exportar laudo pericial.');
    } finally {
      setBaixandoRelatorio(false);
    }
  }, [resultado]);

  // --------------------------------------------------------------------------
  // DERIVAÇÕES E RENDERIZAÇÃO
  // --------------------------------------------------------------------------
  const extracao = resultado.extracao;
  const ident = extracao.identificacao;
  const prest = extracao.prestador;
  const toma = extracao.tomador;
  const serv = extracao.servico;
  const val = extracao.valores;
  const ref = extracao.reformaTributaria;

  const alertasFiltrados = (resultado.alertas || []).filter((a) => {
    if (filtroAlertas === 'TODOS') return true;
    return a.severidade === filtroAlertas;
  });

  const totalCriticos = (resultado.alertas || []).filter((a) => a.severidade === 'CRITICO').length;
  const totalAtencao = (resultado.alertas || []).filter((a) => a.severidade === 'ATENCAO').length;

  return (
    <div className="space-y-6">
      {/* Banner de Identificação do Documento */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 rounded-xl shadow-lg border border-blue-700/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-blue-500/30 text-blue-200 text-xs px-2.5 py-1 rounded font-mono font-semibold border border-blue-400/40">
              {extracao.tipoDocumento === 'NFSE_NACIONAL' ? 'NFS-e Padrão Nacional' : 'DPS Nacional'}
            </span>
            {ident.temNt004 && (
              <span className="bg-emerald-500/30 text-emerald-200 text-xs px-2 py-0.5 rounded font-mono border border-emerald-400/40">
                NT 004 (IBS/CBS)
              </span>
            )}
            {ident.temNt007 && (
              <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded font-mono border border-purple-400/40">
                NT 007 (tpRetPisCofins)
              </span>
            )}
            {ident.temNt009 && (
              <span className="bg-amber-500/30 text-amber-200 text-xs px-2 py-0.5 rounded font-mono border border-amber-400/40">
                NT 009 (Imobiliário/CIB)
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold mt-2">
            NFS-e Nº {ident.nNFSe || ident.nDPS || 'S/N'} • Série {ident.serie || '1'}
          </h2>
          <p className="text-slate-300 text-xs mt-1 font-mono">
            Chave / ID: {ident.chNFSe || ident.idDps || extracao.sha256.slice(0, 32)}
          </p>
          {empresaAtivaNome && (
            <p className="text-blue-300 text-xs mt-1">
              Tomador Ativo no Sistema: <span className="font-semibold">{empresaAtivaNome}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleBaixarLaudoNfse('html')}
            disabled={baixandoRelatorio}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg border border-emerald-500 shadow-sm transition flex items-center gap-1.5"
            title="Exportar Laudo Pericial completo em HTML com governança e visual corporativo"
          >
            {baixandoRelatorio ? 'Gerando...' : '📄 Laudo HTML'}
          </button>
          <button
            type="button"
            onClick={() => handleBaixarLaudoNfse('txt')}
            disabled={baixandoRelatorio}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-100 text-xs font-semibold rounded-lg border border-slate-500 shadow-sm transition flex items-center gap-1.5"
            title="Exportar Laudo Pericial em TXT estruturado para arquivamento contábil"
          >
            {baixandoRelatorio ? 'Gerando...' : '📝 Laudo TXT'}
          </button>

          {onVoltarParaUpload && (
            <button
              type="button"
              onClick={onVoltarParaUpload}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-600 transition"
            >
              ← Voltar / Novo Arquivo
            </button>
          )}
        </div>
      </div>

      {erroRelatorio && (
        <div className="bg-red-950/50 border border-red-700 text-red-200 text-xs p-3 rounded-lg flex items-center justify-between">
          <span>⚠️ {erroRelatorio}</span>
          <button
            type="button"
            onClick={() => setErroRelatorio(null)}
            className="text-red-300 hover:text-white font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Grid de Partes: Prestador e Tomador */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card Prestador */}
        <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 shadow-sm">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-2">
            Prestador do Serviço (Emitente)
          </span>
          <p className="font-semibold text-slate-100 text-sm">{prest.xNome || 'Nome não informado'}</p>
          <p className="text-xs text-slate-300 font-mono mt-0.5">CNPJ/CPF: {prest.cnpj || prest.cpf || '-'}</p>
          {prest.im && <p className="text-xs text-slate-300 font-mono">Inscrição Municipal: {prest.im}</p>}
          <div className="mt-2 text-xs text-slate-400 border-t border-slate-700/60 pt-2">
            <p>
              {prest.endereco?.xLgr || 'Logradouro não informado'}, {prest.endereco?.nro || 'S/N'}
            </p>
            <p>
              {prest.endereco?.xBairro ? `${prest.endereco.xBairro} • ` : ''}
              {prest.endereco?.xMun || prest.endereco?.cMun || 'Município'} - {prest.endereco?.uf || 'UF'}
            </p>
          </div>
        </div>

        {/* Card Tomador */}
        <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 shadow-sm">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-2">
            Tomador do Serviço (Adquirente)
          </span>
          {toma ? (
            <>
              <p className="font-semibold text-slate-100 text-sm">{toma.xNome || 'Nome não informado'}</p>
              <p className="text-xs text-slate-300 font-mono mt-0.5">CNPJ/CPF: {toma.cnpj || toma.cpf || '-'}</p>
              <div className="mt-2 text-xs text-slate-400 border-t border-slate-700/60 pt-2">
                <p>
                  {toma.endereco?.xLgr ? (
                    `${toma.endereco.xLgr}, ${toma.endereco.nro || 'S/N'}`
                  ) : (
                    <span className="text-red-400 font-semibold">⚠ Logradouro ausente ou vazio</span>
                  )}
                </p>
                <p>
                  {toma.endereco?.xMun || toma.endereco?.cMun || 'Município'} - {toma.endereco?.uf || 'UF'}
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-amber-300 italic">Tomador não identificado nesta operação (Consumidor Final não identificado).</p>
          )}
        </div>
      </div>

      {/* Detalhes do Serviço e Classificação */}
      <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
        <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-2">
          Discriminação do Serviço e Classificação Tributária
        </span>
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-mono">
            cTribNac: <strong className="text-blue-300">{serv.cTribNac}</strong>
          </span>
          {serv.cNBS && (
            <span className="bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-mono">
              cNBS: <strong className="text-indigo-300">{serv.cNBS}</strong>
            </span>
          )}
          {ref?.cClassTrib && (
            <span className="bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-mono">
              cClassTrib: <strong className="text-emerald-300">{ref.cClassTrib}</strong>
            </span>
          )}
          {ref?.cst && (
            <span className="bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded font-mono">
              CST IBS/CBS: <strong className="text-amber-300">{ref.cst}</strong>
            </span>
          )}
          {ref?.cib && (
            <span className="bg-emerald-900/60 text-emerald-200 text-xs px-2.5 py-1 rounded font-mono border border-emerald-600/40">
              CIB: <strong>{ref.cib}</strong>
            </span>
          )}
        </div>
        <p className="text-slate-300 text-xs bg-slate-900/60 p-3 rounded-lg border border-slate-700/60 whitespace-pre-wrap leading-relaxed">
          {serv.xDescServ || 'Sem descrição informada.'}
        </p>
      </div>

      {/* Cards Financeiros e Tributários */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
          <span className="text-xs text-slate-400 block">Valor dos Serviços</span>
          <span className="text-base font-bold text-slate-100 font-mono">
            R$ {val.vServ.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
          <span className="text-xs text-slate-400 block">ISSQN Municipal</span>
          <span className="text-base font-bold text-blue-400 font-mono">
            R$ {val.vISSQN.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
          <span className="text-xs text-slate-400 block">Retenções Federais</span>
          <span className="text-base font-bold text-purple-400 font-mono">
            R$ {(val.vPIS + val.vCOFINS + val.vRetIRRF + val.vRetCSLL).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          {val.tpRetPisCofins !== undefined && (
            <span className="text-[10px] text-purple-300 block">tpRet: {val.tpRetPisCofins}</span>
          )}
        </div>

        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
          <span className="text-xs text-slate-400 block">IBS + CBS (Reforma)</span>
          <span className="text-base font-bold text-emerald-400 font-mono">
            R$ {((ref?.vIBS || 0) + (ref?.vCBS || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          {ref?.vBC !== undefined && (
            <span className="text-[10px] text-emerald-300 block">BC R$ {ref.vBC.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* Painel de Alertas de Auditoria Pericial */}
      <div className="bg-slate-800/90 rounded-xl p-5 border border-slate-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-700 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wide">
              Auditoria Pericial & Validação Preventiva DF-e
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                resultado.validoParaEmissao
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}
            >
              {resultado.validoParaEmissao ? '✓ Emissão Válida' : '✗ Inconsistências Críticas'}
            </span>
          </div>

          {/* Filtros de Alerta */}
          <div className="flex gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-700/80 text-xs">
            <button
              type="button"
              onClick={() => setFiltroAlertas('TODOS')}
              className={`px-2.5 py-1 rounded transition ${
                filtroAlertas === 'TODOS' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({resultado.alertas.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAlertas('CRITICO')}
              className={`px-2.5 py-1 rounded transition ${
                filtroAlertas === 'CRITICO' ? 'bg-red-900/60 text-red-200 font-semibold' : 'text-red-400 hover:text-red-300'
              }`}
            >
              Críticos ({totalCriticos})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAlertas('ATENCAO')}
              className={`px-2.5 py-1 rounded transition ${
                filtroAlertas === 'ATENCAO' ? 'bg-amber-900/60 text-amber-200 font-semibold' : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              Atenção ({totalAtencao})
            </button>
          </div>
        </div>

        {alertasFiltrados.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            Nenhum alerta apontado com o filtro selecionado.
          </div>
        ) : (
          <div className="space-y-3">
            {alertasFiltrados.map((alerta, idx) => {
              const ehCritico = alerta.severidade === 'CRITICO';
              const ehAtencao = alerta.severidade === 'ATENCAO';
              const borderClass = ehCritico ? 'border-red-500/40 bg-red-950/20' : ehAtencao ? 'border-amber-500/40 bg-amber-950/20' : 'border-blue-500/40 bg-blue-950/20';
              const textBadge = ehCritico ? 'bg-red-500/30 text-red-200' : ehAtencao ? 'bg-amber-500/30 text-amber-200' : 'bg-blue-500/30 text-blue-200';

              return (
                <div key={idx} className={`p-3.5 rounded-lg border ${borderClass} text-xs space-y-1`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${textBadge}`}>
                      {alerta.severidade}
                    </span>
                    <span className="font-mono text-slate-400 text-[11px]">{alerta.codigo}</span>
                    <strong className="text-slate-100 text-xs">{alerta.titulo}</strong>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{alerta.detalhe}</p>
                  {alerta.baseLegal && (
                    <p className="text-slate-400 text-[11px] font-mono pt-1">
                      ⚖ Base Legal: <span className="text-slate-300">{alerta.baseLegal}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Card de Geração e Pré-Visualização do DANFSe Oficial (RFB em Go) */}
      <div className="bg-slate-800/90 rounded-xl p-5 border border-slate-700 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-700 pb-3">
          <div>
            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wide">
              Gerador Oficial DANFSe em PDF (RFB Go)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Renderizado diretamente pelo microsserviço oficial da Receita Federal (rtc-danfse:8084).
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <label htmlFor="select-stc" className="font-medium">Situação:</label>
              <select
                id="select-stc"
                value={stc}
                onChange={(e) => setStc(e.target.value as '0' | '1' | '2')}
                className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="0">0 - Válida (Normal)</option>
                <option value="1">1 - Substituída</option>
                <option value="2">2 - Cancelada</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={canhoto}
                onChange={(e) => setCanhoto(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
              />
              Exibir Canhoto
            </label>

            <button
              type="button"
              disabled={gerandoPdf}
              onClick={handleGerarDanfse}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold shadow transition flex items-center gap-2 ${
                gerandoPdf
                  ? 'bg-blue-800 text-blue-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {gerandoPdf ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Renderizando DANFSe...
                </>
              ) : (
                '📄 Gerar DANFSe Oficial (PDF RFB)'
              )}
            </button>
          </div>
        </div>

        {/* Mensagem de Erro / Orientação se o container Go estiver offline */}
        {erroDanfse && (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-700/50 text-xs text-red-200 space-y-1">
            <p className="font-semibold text-red-300">Falha ao emitir DANFSe:</p>
            <p>{erroDanfse}</p>
            {orientacaoDanfse && (
              <p className="font-mono text-amber-300 text-[11px] pt-1">
                💡 Orientação: {orientacaoDanfse}
              </p>
            )}
          </div>
        )}

        {/* Preview do PDF renderizado via Blob URL segura */}
        {pdfUrl && (
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-700">
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                ✓ DANFSe gerado com sucesso via rtc-danfse
              </span>
              <a
                href={pdfUrl}
                download={`danfse-${ident.nNFSe || ident.nDPS || 'nacional'}.pdf`}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition"
              >
                💾 Baixar PDF
              </a>
            </div>

            <div className="w-full h-[550px] bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-inner">
              <iframe
                src={pdfUrl}
                title="Pré-visualização Oficial do DANFSe"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
