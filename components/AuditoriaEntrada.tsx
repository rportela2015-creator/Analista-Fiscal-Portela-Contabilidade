'use client';

import React, { useState } from 'react';
import type {
  ExtractedInvoiceData,
  ExtractedItem,
  MotorAuditoria,
  ContextoAdquirente,
  DocumentoContexto,
  AuditRequestPayload,
} from '@/lib/extrator-nfe-types';
import {
  montarAuditRequestPayload,
  converterItemExtracaoParaPrecificacao,
  converterItemExtracaoParaParametrizacao,
} from '@/lib/extrator-nfe-types';
import TabelaItensExtracao from './TabelaItensExtracao';
import ParametrizacaoERP from './ParametrizacaoERP';
import {
  calcularCustoItemCPC16,
  consolidarCustosEntradaCPC16,
  gerarRelatorioCustosHtml,
  RelatorioCustoEntradaConsolidado,
} from '@/lib/custos';
import { RegimeTributario, DestinacaoMercadoria } from '@/lib/marco-legal';
import { auditarDifalNotaEntrada } from '@/lib/engine/difal-pr';
import type { DiagnosticoDifalEntrada, ResumoDifalNfeEntrada } from '@/lib/types/motor-tributario';
import { useEmpresaAtiva } from '@/lib/hooks/useEmpresaAtiva';
import { formatarCnpj } from '@/lib/fiscal/perfil-tributario';
import type { ResultadoOrquestracaoNfe } from '@/lib/engine/orquestrador-fiscal';
import type { StatusExtincaoDebitoFornecedor } from '@/lib/fiscal/credito-tributario';
import { detectarTipoXmlFiscal } from '@/lib/extrator-nfse';
import type { ResultadoAuditoriaNfse } from '@/lib/extrator-nfse-types';
import { PainelNfseDanfse } from './PainelNfseDanfse';

/* =========================================================================
 * CONTRATOS DE TIPOS PARA A ETAPA 2 (M2 ↔ M3)
 * ========================================================================= */

export type {
  MotorAuditoria,
  ContextoAdquirente,
  DocumentoContexto,
  AuditRequestPayload,
};

export { montarAuditRequestPayload };



/**
 * Adaptador puro para compatibilidade entre a resposta pericial e o componente ParametrizacaoERP
 */
export function adaptAuditResultForERP(
  result: any,
  invoice: ExtractedInvoiceData,
  motor: string,
  regime: string,
  finalidade: string
) {
  return {
    statusGlobal: result.statusGlobal || 'Regular',
    motor: result.motorUtilizado || (motor === 'ollama' ? 'Ollama Local (RX 580)' : 'Gemini Cloud (Google AI)'),
    parecerTecnicoXml: result.parecerTecnicoGeral || result.parecerTecnicoXml || 'Parecer técnico disponível.',
    parecerConformidade: result.parecerConformidadeCreditos || result.parecerConformidade || 'Parecer de conformidade disponível.',
    regime,
    finalidade,
    nfe: {
      emitente: {
        xNome: invoice.emitente?.nome,
        CNPJ: invoice.emitente?.cnpj,
        IE: invoice.emitente?.ie || 'ISENTO',
        enderEmit: { UF: invoice.emitente?.uf },
      },
      destinatario: {
        xNome: invoice.destinatario?.nome,
        CNPJ: invoice.destinatario?.cnpj,
        CPF: invoice.destinatario?.cpf,
        enderDest: { UF: invoice.destinatario?.uf },
      },
    },
    itens: (result.itens || []).map((it: any) => ({
      ...it,
      cProd: it.cProd,
      xProd: it.xProd,
      ncm: typeof it.ncm === 'object' ? (it.ncm.auditado || it.ncm.declarado) : it.ncm,
      cest: it.cest || (typeof it.ncm === 'object' ? it.ncm.cest : undefined),
      cfopEntrada: it.cfop?.entradaSugerido || it.cfopEntrada || '1102',
      cstIcmsEntrada: it.icms?.cstIcmsEntradaSugerido || it.cstIcmsEntrada || '00',
      aliqIcms: it.icms?.aliqIcmsCredito || it.aliqIcms || '18%',
      permiteCredito: it.icms?.permiteCredito ?? it.permiteCredito ?? true,
      cstPisCofinsEntrada: it.pisCofins?.cstPisCofinsEntradaSugerido || it.cstPisCofinsEntrada || '50',
      aliqPis: it.aliqPis || '1.65%',
      aliqCofins: it.aliqCofins || '7.6%',
      cClassTrib: it.reforma?.cClassTrib || it.cClassTrib || '000001',
      aliqIbsTransitorio: it.reforma?.aliqIbsTeste2026 || it.aliqIbsTransitorio || '0,1%',
      aliqCbsTransitorio: it.reforma?.aliqCbsTeste2026 || it.aliqCbsTransitorio || '0,9%',
      regimeEspecial: it.reforma?.regimeEspecial || it.regimeEspecial || 'Regime Regular (Padrão)',
      instrucaoCadastro: it.instrucaoCadastroERP || it.instrucaoCadastro || 'Instrução de parametrização fiscal',
    })),
  };
}

/* =========================================================================
 * COMPONENTE AUDITORIA DE ENTRADA (FLUXO EM DUAS ETAPAS)
 * ========================================================================= */

export default function AuditoriaEntrada() {
  // ---- Hooks chamados estritamente no topo para cumprir scripts/hookcheck.mjs ----

  // 0. Sincronização com Empresa Ativa
  const { empresaAtiva, perfilAtivo } = useEmpresaAtiva();

  // 1. Configuração e Arquivo de Entrada
  const [file, setFile] = useState<File | null>(null);
  const [regime, setRegime] = useState('Simples Nacional');
  const [finalidade, setFinalidade] = useState('Revenda/Comercialização');
  const [autoSync, setAutoSync] = useState(true);

  // 1.0 Estado da NFS-e / DPS Padrão Nacional (Sub-Etapa 19.6)
  const [resultadoNfse, setResultadoNfse] = useState<ResultadoAuditoriaNfse | null>(null);

  // 1.1 Estados da Orquestração Fiscal Unificada (DAG - Sub-etapa 19.5)
  const [statusExtincaoRtc, setStatusExtincaoRtc] = useState<StatusExtincaoDebitoFornecedor>('EXTINTO_SPLIT');
  const [isOrquestrando, setIsOrquestrando] = useState(false);
  const [resultadoOrquestracao, setResultadoOrquestracao] = useState<ResultadoOrquestracaoNfe | null>(null);
  const [orquestracaoErro, setOrquestracaoErro] = useState<string | null>(null);

  // 2. Estados da Etapa 1 (Extração Determinística Imediata)
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractedInvoice, setExtractedInvoice] = useState<ExtractedInvoiceData | null>(null);

  // 3. Estados da Etapa 2 (Seleção de Itens e Motor Duplo de IA)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [motor, setMotor] = useState<MotorAuditoria>('ollama');
  const [modeloOllama, setModeloOllama] = useState<string>('qwen2.5:7b');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditElapsedTime, setAuditElapsedTime] = useState(0);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<any | null>(null);

  // 4. Estados de Exportação de Relatórios
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // 5. Estados do Modal de Custo Individualizado por Produto (CPC 16)
  const [modalCusto, setModalCusto] = useState<{
    aberto: boolean;
    modo: 'resumido' | 'detalhado';
  }>({ aberto: false, modo: 'resumido' });

  // 6. Estados de Apuração Bitemporal de DIFAL, FECOP & Antecipação PR (Sub-Etapa 18.3)
  const [crtDestinatario, setCrtDestinatario] = useState<'1' | '2' | '3' | '4'>('3');
  const [destinacaoPadrao, setDestinacaoPadrao] = useState<'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'>('comercializacao');
  const [incluirIbsCbsBcIcms, setIncluirIbsCbsBcIcms] = useState<boolean>(true);
  const [destinacaoPorItem, setDestinacaoPorItem] = useState<Record<string | number, 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'>>({});

  React.useEffect(() => {
    if (regime.toLowerCase().includes('simples')) setCrtDestinatario('1');
    else if (regime.toLowerCase().includes('mei')) setCrtDestinatario('4');
    else setCrtDestinatario('3');
  }, [regime]);

  React.useEffect(() => {
    if (finalidade.toLowerCase().includes('ind')) setDestinacaoPadrao('industrializacao');
    else if (finalidade.toLowerCase().includes('ativo')) setDestinacaoPadrao('ativo_imobilizado');
    else if (finalidade.toLowerCase().includes('consumo') || finalidade.toLowerCase().includes('uso')) setDestinacaoPadrao('uso_consumo');
    else setDestinacaoPadrao('comercializacao');
  }, [finalidade]);

  // Sincronização automática do Regime e Parâmetros com a Empresa Ativa
  React.useEffect(() => {
    if (perfilAtivo) {
      if (perfilAtivo.regimeTributario === 'SIMPLES_NACIONAL') {
        setRegime('Simples Nacional');
      } else if (perfilAtivo.regimeTributario === 'LUCRO_PRESUMIDO' || perfilAtivo.regimeTributario === 'LUCRO_REAL') {
        setRegime('Regime Regular');
      } else if (perfilAtivo.regimeTributario === 'MEI') {
        setRegime('Simples Nacional');
      }

      if (perfilAtivo.beneficiosParana?.diferimentoParcialArt28 !== undefined) {
        setIncluirIbsCbsBcIcms(Boolean(perfilAtivo.beneficiosParana.diferimentoParcialArt28));
      }
    }
  }, [perfilAtivo]);

  // ─── Handlers da Etapa 1 (Extração Determinística) ──────────────────────────
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setExtractionError('Selecione um arquivo XML ou PDF da NF-e / NFS-e.');
      return;
    }

    setIsExtracting(true);
    setExtractionError(null);
    setExtractedInvoice(null);
    setAuditResult(null);
    setResultadoNfse(null);

    // Auto-detecção de tipo de documento para arquivos XML (NF-e vs NFS-e / DPS Nacional)
    if (file.name.toLowerCase().endsWith('.xml')) {
      try {
        const textContent = await file.text();
        const tipoXml = detectarTipoXmlFiscal(textContent);

        if (tipoXml === 'NFSE_NACIONAL' || tipoXml === 'DPS_NACIONAL') {
          const respNfse = await fetch('/api/fiscal/auditar-nfse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              xml: textContent,
              empresaId: empresaAtiva?.id,
              statusExtincaoRtc,
              persistir: true,
            }),
          });

          if (!respNfse.ok) {
            const errNfseJson = await respNfse.json().catch(() => ({}));
            throw new Error(errNfseJson.mensagem || `Erro HTTP ${respNfse.status} ao processar NFS-e.`);
          }

          const resultadoNfseAudit: ResultadoAuditoriaNfse = await respNfse.json();
          setResultadoNfse(resultadoNfseAudit);
          setIsExtracting(false);
          return;
        }
      } catch (errNfse: any) {
        setExtractionError(errNfse.message || 'Falha ao processar NFS-e Padrão Nacional.');
        setIsExtracting(false);
        return;
      }
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('regime', regime);
    formData.append('finalidade', finalidade);

    try {
      const res = await fetch('/api/auditoria-entrada/extrair', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status} ao extrair dados.`);
      }

      const result: ExtractedInvoiceData = await res.json();
      setExtractedInvoice(result);

      // Pré-seleciona todos os itens da nota para permitir fluxo com 1 clique
      const todosIndices = new Set(result.itens.map((it) => it.index));
      setSelectedIndices(todosIndices);

      // Sincronização automática silenciosa pós-extração (se habilitada)
      if (autoSync && result.itens && result.itens.length > 0) {
        const itensPrec = result.itens.map((it) => converterItemExtracaoParaPrecificacao(it));
        const regimeDest = regime.toLowerCase().includes('simples')
          ? 'simples'
          : regime.toLowerCase().includes('real')
          ? 'real'
          : 'presumido';
        const dest = finalidade.toLowerCase().includes('ind')
          ? 'industrializacao'
          : finalidade.toLowerCase().includes('ativo')
          ? 'ativo_imobilizado'
          : finalidade.toLowerCase().includes('consumo')
          ? 'uso_consumo'
          : 'comercializacao';

        const itensErp = result.itens.map((it) =>
          converterItemExtracaoParaParametrizacao(it, {
            ufOrigem: result.emitente?.uf,
            ufDestino: result.destinatario?.uf || 'PR',
            regimeDestinatario: regimeDest as any,
            destinacao: dest as any,
          })
        );

        try {
          sessionStorage.setItem('ncm-precificar-itens', JSON.stringify(itensPrec));
          sessionStorage.setItem('ncm-parametrizar-itens', JSON.stringify(itensErp));
        } catch {
          /* fallback */
        }

        window.dispatchEvent(
          new CustomEvent('navegar-aba', {
            detail: {
              tab: 'parametrizar',
              itens: itensPrec,
              itensErp,
              manterNaAbaAtual: true,
            },
          })
        );
      }
    } catch (err: any) {
      setExtractionError(err.message || 'Falha ao processar a extração determinística.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ─── Handlers de Seleção de Itens (Etapa 2) ─────────────────────────────────
  const handleToggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!extractedInvoice) return;
    setSelectedIndices(new Set(extractedInvoice.itens.map((it) => it.index)));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleSelectOnlySensitive = () => {
    if (!extractedInvoice) return;
    const sensiveis = extractedInvoice.itens
      .filter((it) => it.sensivelParaAuditoria)
      .map((it) => it.index);
    setSelectedIndices(new Set(sensiveis));
  };

  const handleResetToUpload = () => {
    setExtractedInvoice(null);
    setAuditResult(null);
    setResultadoOrquestracao(null);
    setSelectedIndices(new Set());
    setExtractionError(null);
    setAuditError(null);
    setOrquestracaoErro(null);
    setFile(null);
  };

  const handleExecutarOrquestracaoCompleta = async () => {
    if (!file) {
      setExtractionError('Selecione um arquivo XML da NF-e para a orquestração completa.');
      return;
    }

    setIsOrquestrando(true);
    setOrquestracaoErro(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (empresaAtiva?.id) formData.append('empresaId', empresaAtiva.id);
      formData.append('statusExtincaoRtc', statusExtincaoRtc);
      formData.append('destinacaoPadrao', destinacaoPadrao);
      formData.append('persistir', 'true');
      formData.append('validarGruposXmlRtc', 'true');

      const res = await fetch('/api/fiscal/orquestrar-nfe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.sucesso) {
        throw new Error(data.mensagem || 'Falha ao orquestrar auditoria da NF-e.');
      }

      setResultadoOrquestracao(data.resultado);

      // Se a extração já estiver pronta, sincroniza o extrato
      if (!extractedInvoice) {
        await handleFileUpload({ preventDefault: () => {} } as any);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setOrquestracaoErro(msg);
    } finally {
      setIsOrquestrando(false);
    }
  };

  const handleEnviarCustoEfetivoParaPrecificacao = () => {
    if (!resultadoOrquestracao || !extractedInvoice || !extractedInvoice.itens) return;
    const itensParaEnviar = extractedInvoice.itens.map((it, idx) => {
      const precItem = converterItemExtracaoParaPrecificacao(it);
      const itemCredito = resultadoOrquestracao.etapas.creditos.itensCredito[idx];
      if (itemCredito) {
        const creditoEfetivado = itemCredito.classificacao.creditoEfetivadoCusto.total;
        const cmvLiquidoItem = Math.max(0.01, precItem.valorBrutoEntrada - creditoEfetivado);
        precItem.valorBrutoEntrada = cmvLiquidoItem;
      }
      return precItem;
    });

    const evt = new CustomEvent('navegar-aba', {
      detail: {
        tab: 'precificar',
        itens: itensParaEnviar,
      },
    });
    window.dispatchEvent(evt);
  };

  const handleReturnToSelection = () => {
    setAuditResult(null);
    setAuditError(null);
  };

  // ─── Handler de Submissão de Auditoria Seletiva (Etapa 2) ───────────────────
  const handleAuditSubmit = async () => {
    if (!extractedInvoice) return;
    if (selectedIndices.size === 0) {
      setAuditError('Selecione pelo menos um item para submeter à auditoria pericial.');
      return;
    }

    setIsAuditing(true);
    setAuditElapsedTime(0);
    setAuditError(null);
    setAuditResult(null);

    const timer = setInterval(() => {
      setAuditElapsedTime((prev) => prev + 1);
    }, 1000);

    let payload: AuditRequestPayload;
    try {
      payload = montarAuditRequestPayload({
        motor,
        modelo: modeloOllama,
        regime,
        finalidade,
        ufDestino: extractedInvoice.destinatario?.uf || 'SP',
        extracao: extractedInvoice,
        selectedIndices,
      });
    } catch (err: any) {
      clearInterval(timer);
      setAuditError(err.message || 'Falha ao montar payload de auditoria.');
      setIsAuditing(false);
      return;
    }

    try {
      // Dispara para o endpoint de auditoria M2 ↔ M3
      let res = await fetch('/api/auditoria-entrada/auditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Suporte a fallback de rota se /auditar ainda for roteado via query param action=auditar
      if (res.status === 404) {
        res = await fetch('/api/auditoria-entrada?action=auditar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.detalhe || `Erro HTTP ${res.status} na auditoria pericial.`);
      }

      const rawResult = await res.json();
      const adapted = adaptAuditResultForERP(rawResult, extractedInvoice, motor, regime, finalidade);
      setAuditResult(adapted);
    } catch (err: any) {
      setAuditError(err.message || 'Falha ao executar auditoria pericial dos itens.');
    } finally {
      clearInterval(timer);
      setIsAuditing(false);
    }
  };

  // ─── Handler de Download de Relatório ──────────────────────────────────────
  const handleDownloadReport = async (format: 'html' | 'txt' = 'html') => {
    if (!auditResult) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const itensEnriquecidos = (auditResult.itens || []).map((it: any) => {
        const diag =
          apuracaoDifalNota?.itensDiagnostico[String(it.index)] ||
          apuracaoDifalNota?.itensDiagnostico[String(it.cProd)];
        const dest =
          destinacaoPorItem[it.index] ||
          destinacaoPorItem[it.cProd] ||
          destinacaoPadrao;
        return {
          ...it,
          destinacao: dest,
          diagnosticoDifal: diag,
        };
      });

      const payloadRelatorio = {
        ...auditResult,
        itens: itensEnriquecidos,
        resumoDifalEntrada: apuracaoDifalNota?.resumoDifalNota,
        orquestracaoDag: resultadoOrquestracao || undefined,
        sha256: (extractedInvoice as any)?.sha256 || resultadoOrquestracao?.sha256Xml || undefined,
        format,
      };

      const res = await fetch('/api/auditoria-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadRelatorio),
      });

      if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao gerar relatório.`);

      const blob = await res.blob();
      if (typeof window !== 'undefined' && window.URL && typeof window.URL.createObjectURL === 'function') {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_executivo.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setPdfError(err.message || 'Falha ao baixar o relatório.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ─── Consolidação CPC 16 (R1) / NBC TG 16 de Custos por Item ────────────
  const consolidadoCPC16 = React.useMemo(() => {
    if (!extractedInvoice || !extractedInvoice.itens || extractedInvoice.itens.length === 0) return null;
    const regimeDest: RegimeTributario = regime.toLowerCase().includes('simples')
      ? 'simples'
      : regime.toLowerCase().includes('real')
      ? 'real'
      : 'presumido';
    const dest: DestinacaoMercadoria = finalidade.toLowerCase().includes('ind')
      ? 'industrializacao'
      : finalidade.toLowerCase().includes('ativo')
      ? 'ativo_imobilizado'
      : finalidade.toLowerCase().includes('consumo') || finalidade.toLowerCase().includes('uso')
      ? 'uso_consumo'
      : 'comercializacao';

    return consolidarCustosEntradaCPC16(extractedInvoice.itens, {
      regime: regimeDest,
      destinacao: dest,
      ufOrigem: extractedInvoice.emitente?.uf,
      ufDestino: extractedInvoice.destinatario?.uf || 'PR',
    });
  }, [extractedInvoice, regime, finalidade]);

  // ─── Apuração Bitemporal Instantânea de DIFAL, FECOP & Antecipação PR ───
  const apuracaoDifalNota = React.useMemo(() => {
    if (!extractedInvoice || !extractedInvoice.itens || extractedInvoice.itens.length === 0) return null;
    return auditarDifalNotaEntrada(extractedInvoice, {
      crtDestinatario: Number(crtDestinatario) as any,
      destinacaoPadrao,
      destinacaoPorItem,
      incluirIbsCbsBcIcms,
    });
  }, [extractedInvoice, crtDestinatario, destinacaoPadrao, destinacaoPorItem, incluirIbsCbsBcIcms]);

  const handleAlterarDestinacaoItem = (
    index: number,
    novaDestinacao: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'
  ) => {
    setDestinacaoPorItem((prev) => ({
      ...prev,
      [index]: novaDestinacao,
    }));
  };

  // ─── Transferência Direta para a Aba de Precificação (Etapa 3) ────────────
  const handleEnviarParaPrecificacao = (itensParaEnviar: ExtractedItem[]) => {
    if (!itensParaEnviar || itensParaEnviar.length === 0) return;
    const convertidos = itensParaEnviar.map((it) => converterItemExtracaoParaPrecificacao(it));
    try {
      sessionStorage.setItem('ncm-precificar-itens', JSON.stringify(convertidos));
    } catch {
      /* fallback */
    }

    window.dispatchEvent(
      new CustomEvent('navegar-aba', {
        detail: {
          tab: 'precificar',
          itens: convertidos,
        },
      })
    );
  };

  // ─── Transferência Direta para a Aba de Parametrização ERP ────────────────
  const handleEnviarParaErp = (itensParaEnviar: ExtractedItem[], manterNaAbaAtual = false) => {
    if (!itensParaEnviar || itensParaEnviar.length === 0) return;
    const regimeDestinatario = regime.toLowerCase().includes('simples')
      ? 'simples'
      : regime.toLowerCase().includes('real')
      ? 'real'
      : 'presumido';
    const destinacao = finalidade.toLowerCase().includes('ind')
      ? 'industrializacao'
      : finalidade.toLowerCase().includes('ativo')
      ? 'ativo_imobilizado'
      : finalidade.toLowerCase().includes('consumo')
      ? 'uso_consumo'
      : 'comercializacao';

    const convertidos = itensParaEnviar.map((it) =>
      converterItemExtracaoParaParametrizacao(it, {
        ufOrigem: extractedInvoice?.emitente?.uf,
        ufDestino: extractedInvoice?.destinatario?.uf || 'PR',
        regimeDestinatario,
        destinacao,
      })
    );

    try {
      sessionStorage.setItem('ncm-parametrizar-itens', JSON.stringify(convertidos));
    } catch {
      /* fallback */
    }

    window.dispatchEvent(
      new CustomEvent('navegar-aba', {
        detail: {
          tab: 'parametrizar',
          itensErp: convertidos,
          manterNaAbaAtual,
        },
      })
    );
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2>Auditoria de Entrada (IA Local · RX 580)</h2>
        <span className="badge success mono">Soberania Local-First</span>
      </div>
      <p className="hint">
        Faça o upload da nota fiscal (.xml da NF-e ou .pdf do DANFE) para auditar documento fiscal com extração determinística imediata e análise pericial por IA.
      </p>

      {/* =========================================================================
       * ETAPA 1: Formulário de Upload e Extração Determinística Imediata
       * ========================================================================= */}
      {empresaAtiva && (
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid #3b82f6',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            🏢 <b>Empresa Ativa:</b> {empresaAtiva.razaoSocial} &middot; CNPJ:{' '}
            <span className="mono">{formatarCnpj(empresaAtiva.cnpj)}</span> &middot; UF: <b>{empresaAtiva.uf}</b> &middot; Regime:{' '}
            <b>{perfilAtivo?.regimeTributario || 'Não configurado'}</b>
          </div>
          <span style={{ fontSize: 11, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
            Perfil Bitemporal Sincronizado
          </span>
        </div>
      )}

      {resultadoNfse && (
        <PainelNfseDanfse
          resultado={resultadoNfse}
          onVoltarParaUpload={() => {
            setResultadoNfse(null);
            setFile(null);
          }}
          empresaAtivaNome={empresaAtiva?.razaoSocial}
        />
      )}

      {!extractedInvoice && !resultadoNfse && (
        <form onSubmit={handleFileUpload}>
          <label className="field">
            <span>Arquivo da Nota Fiscal (.xml, .pdf)</span>
            <input
              type="file"
              accept=".xml,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <label className="field">
            <span>Regime da Empresa Adquirente</span>
            <select value={regime} onChange={(e) => setRegime(e.target.value)}>
              <option value="Simples Nacional">Simples Nacional</option>
              <option value="Regime Regular">Regime Regular</option>
            </select>
          </label>

          <label className="field">
            <span>Finalidade da Aquisição</span>
            <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
              <option value="Revenda/Comercialização">Revenda/Comercialização</option>
              <option value="Industrialização">Industrialização</option>
              <option value="Uso/Consumo">Uso/Consumo</option>
              <option value="Ativo Imobilizado">Ativo Imobilizado</option>
            </select>
          </label>

          <label className="field">
            <span>Status de Extinção no Fornecedor (LC 214/2025 Art. 47)</span>
            <select
              value={statusExtincaoRtc}
              onChange={(e) => setStatusExtincaoRtc(e.target.value as StatusExtincaoDebitoFornecedor)}
            >
              <option value="EXTINTO_SPLIT">Split Payment Extinto (Apropriação Imediata de Crédito)</option>
              <option value="EXTINTO_PAGAMENTO">Extinto por Pagamento Regular (Débito Liquidado)</option>
              <option value="AGUARDANDO_EXTINCAO">Aguardando Extinção (Crédito Retido pelo Art. 47)</option>
              <option value="SIMULACAO_PROJETADA">Simulação Projetada (Projeção Ampla de Cenário)</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            <span>⚡ Sincronizar Automaticamente com Precificação e ERP ao Auditar XML</span>
          </label>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={isExtracting || isOrquestrando || !file} className="btn primary">
              {isExtracting ? 'Extraindo Itens (< 200ms)...' : 'Auditar Documento (Extrair Itens)'}
            </button>
            <button
              type="button"
              onClick={handleExecutarOrquestracaoCompleta}
              disabled={isExtracting || isOrquestrando || !file}
              className="btn primary"
              style={{ background: '#2563eb', borderColor: '#2563eb', fontWeight: 600 }}
              title="Executa em DAG: Extração + Motor Oficial RFB RTC + ICMS/PR v5.0.0 + Créditos 3 Camadas + 4 Regimes + Persistência"
            >
              {isOrquestrando ? '⚡ Executando Orquestrador DAG...' : '⚡ Executar Orquestração Completa (RFB RTC + ICMS/PR + Créditos + 4 Regimes)'}
            </button>
          </div>
        </form>
      )}

      {orquestracaoErro && (
        <div className="note error" style={{ marginTop: 20 }}>
          <div className="t">Erro na orquestração fiscal da NF-e</div>
          <div className="x">{orquestracaoErro}</div>
        </div>
      )}

      {isExtracting && (
        <div className="note info" style={{ marginTop: 20 }}>
          <div className="t">Extração Determinística em Andamento...</div>
          <div className="x">
            Processamento determinístico imediato (&lt;200ms) sem invocação de LLMs. Validando 100% dos NCMs contra o catálogo oficial do Siscomex.
          </div>
        </div>
      )}

      {extractionError && (
        <div className="note error" style={{ marginTop: 20 }}>
          <div className="t">Erro na extração do documento fiscal</div>
          <div className="x">{extractionError}</div>
        </div>
      )}

      {/* =========================================================================
       * ETAPA 2: Apresentação Tabular, Seleção e Disparo da Auditoria
       * ========================================================================= */}
      {extractedInvoice && !auditResult && (
        <div style={{ marginTop: 20 }}>
          {/* Cabeçalho Resumo da NF-e */}
          <div className="card" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>NF-e: {extractedInvoice.identificacao?.numero || 'S/N'} (Série {extractedInvoice.identificacao?.serie || '1'})</strong>
                <span className="badge blue mono" style={{ marginLeft: 8 }}>{extractedInvoice.tipoDocumento}</span>
                {extractedInvoice.tempoExtracaoMs !== undefined && (
                  <span className="badge success mono" style={{ marginLeft: 6 }}>{extractedInvoice.tempoExtracaoMs}ms</span>
                )}
              </div>
              <button type="button" onClick={handleResetToUpload} className="mini" title="Carregar outro arquivo de nota fiscal">
                ↺ Carregar Outro Arquivo
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10, fontSize: '13px' }}>
              <div><strong>Emitente:</strong> {extractedInvoice.emitente?.nome || 'N/A'} (CNPJ: {extractedInvoice.emitente?.cnpj || 'N/A'}) - {extractedInvoice.emitente?.uf}</div>
              <div><strong>Regime Emitente:</strong> {extractedInvoice.emitente?.regimeDescricao || 'N/A'}</div>
              <div><strong>Destinatário:</strong> {extractedInvoice.destinatario?.nome || 'N/A'} ({extractedInvoice.destinatario?.uf})</div>
              <div><strong>Valor Total NF:</strong> {extractedInvoice.resumoFinanceiro?.vNF?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>

          {/* =========================================================================
           * PAINEL INTEGRADO DA ORQUESTRAÇÃO FISCAL DAG (SUB-ETAPA 19.5)
           * ========================================================================= */}
          {resultadoOrquestracao && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* BLOCO 1: STATUS RFB RTC & VALIDAÇÃO XML */}
              <div
                className="card"
                style={{
                  background: 'var(--panel)',
                  border: '1px solid #3b82f6',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🏛️</span>
                    <strong style={{ fontSize: 14 }}>Motor Oficial RFB RTC & Reforma Tributária</strong>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background:
                          resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                            ? '#1e3a1e'
                            : '#3a2a1e',
                        color:
                          resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                            ? '#6ee7b7'
                            : '#fcd34d',
                        border: `1px solid ${
                          resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                            ? '#059669'
                            : '#d97706'
                        }`,
                      }}
                    >
                      {resultadoOrquestracao.etapas.rtc.origemCalculoRtc === 'OFICIAL_RFB'
                        ? 'OFICIAL RFB'
                        : 'FALLBACK LOCAL ESTIMADO'}
                    </span>
                    {resultadoOrquestracao.etapas.rtc.validacaoXml?.executada && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'VALIDO'
                              ? '#1e3a1e'
                              : resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'INVALIDO'
                              ? '#3a1e1e'
                              : '#3a2a1e',
                          color:
                            resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'VALIDO'
                              ? '#6ee7b7'
                              : resultadoOrquestracao.etapas.rtc.validacaoXml.status === 'INVALIDO'
                              ? '#fca5a5'
                              : '#fcd34d',
                        }}
                      >
                        XML: {resultadoOrquestracao.etapas.rtc.validacaoXml.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Motor: <b>{resultadoOrquestracao.etapas.rtc.motorRtcUtilizado}</b> · Latência:{' '}
                    <b>{resultadoOrquestracao.etapas.rtc.duracaoRtcMs}ms</b>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                    marginTop: 10,
                    fontSize: 12,
                  }}
                >
                  <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
                    <div style={{ color: 'var(--muted)' }}>IBS Estadual (UF)</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIbsUf.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
                    <div style={{ color: 'var(--muted)' }}>IBS Municipal</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIbsMun.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
                    <div style={{ color: 'var(--muted)' }}>CBS Federal</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vCbs.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
                    <div style={{ color: 'var(--muted)' }}>Imposto Seletivo (IS)</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIs.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4 }}>
                    <div style={{ color: 'var(--muted)' }}>Total IVA Dual</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#3b82f6' }}>
                      R$ {resultadoOrquestracao.etapas.rtc.totaisRtc.vIvaTotal.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOCO 2: AUDITORIA DE CRÉDITOS EM 3 CAMADAS */}
              <div
                className="card"
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>⚖️ Auditoria Tripartida de Créditos de Entrada</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Status Extinção: <b>{resultadoOrquestracao.etapas.creditos.statusExtincaoFornecedor}</b>
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>Tributo</th>
                        <th style={{ padding: '6px 8px' }}>Camada 1: Destacado no XML</th>
                        <th style={{ padding: '6px 8px' }}>Camada 2: Admitido pela Regra</th>
                        <th style={{ padding: '6px 8px' }}>Camada 3: Efetivado no CMV (CPC 16)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px' }}>ICMS Próprio</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.icms.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.icms.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.icms.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px' }}>PIS / PASEP</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.pis.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.pis.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.pis.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px' }}>COFINS</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.cofins.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.cofins.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.cofins.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px' }}>IPI</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.ipi.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.ipi.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.ipi.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px' }}>IBS</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.ibs.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.ibs.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.ibs.toFixed(2)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px' }}>CBS</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.cbs.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.cbs.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.cbs.toFixed(2)}</td>
                      </tr>
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                        <td style={{ textAlign: 'left', padding: '8px' }}>TOTAL DE CRÉDITOS</td>
                        <td style={{ padding: '8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalDestacadoXml.total.toFixed(2)}</td>
                        <td style={{ padding: '8px' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoAdmitidoRegra.total.toFixed(2)}</td>
                        <td style={{ padding: '8px', color: '#10b981' }}>R$ {resultadoOrquestracao.etapas.creditos.camadas.totalCreditoEfetivadoCusto.total.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {resultadoOrquestracao.etapas.creditos.retidoAguardandoExtincaoIbsCbs.total > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 4,
                      background: '#451a03',
                      color: '#fcd34d',
                      fontSize: 12,
                      border: '1px solid #b45309',
                    }}
                  >
                    ⚠️ <b>Atenção (Art. 47 LC 214/2025):</b> R${' '}
                    {resultadoOrquestracao.etapas.creditos.retidoAguardandoExtincaoIbsCbs.total.toFixed(2)} em créditos de IBS/CBS foram retidos
                    e NÃO abatem o CMV de imediato por estarem com status <b>AGUARDANDO_EXTINCAO</b> do débito pelo fornecedor.
                  </div>
                )}
              </div>

              {/* BLOCO 3: COMPARATIVO DOS 4 REGIMES TRIBUTÁRIOS */}
              <div
                className="card"
                style={{
                  background: 'var(--panel)',
                  border: '1px solid #10b981',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>📊 Comparativo Tributário dos 4 Regimes (Custo Aterrissado & Preço)</strong>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Calculado com precisão numérica ADR003 HALF_EVEN e mark-up divisor considerando desembolsos e créditos efetivos.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnviarCustoEfetivoParaPrecificacao}
                    className="btn primary"
                    style={{ background: '#059669', borderColor: '#059669', fontSize: 12, fontWeight: 700 }}
                  >
                    💰 Enviar Custo Efetivo para Precificação (Camada 3 CPC 16)
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {(
                    ['SIMPLES_TRADICIONAL', 'SIMPLES_HIBRIDO_2027', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const
                  ).map((key) => {
                    const c = resultadoOrquestracao.etapas.custosEPrecificacao.comparativoRegimes[key];
                    if (!c) return null;
                    return (
                      <div
                        key={key}
                        style={{
                          background: 'var(--bg)',
                          border: `1px solid ${c.melhorCenario ? '#10b981' : 'var(--line)'}`,
                          borderRadius: 6,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: c.melhorCenario ? '#6ee7b7' : 'var(--text)' }}>
                            {c.nomeExibicao}
                          </span>
                          {c.melhorCenario && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                background: '#064e3b',
                                color: '#a7f3d0',
                                border: '1px solid #059669',
                                padding: '1px 6px',
                                borderRadius: 3,
                              }}
                            >
                              MAIS ECONÔMICO
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.justificativa}</div>

                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--muted)' }}>CMV Líquido:</span>
                            <b>R$ {c.cmvLiquidoTotal.toFixed(2)}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--muted)' }}>Créditos Entrada:</span>
                            <span style={{ color: '#10b981' }}>R$ {c.creditosAproveitados.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--muted)' }}>Tributos Saída:</span>
                            <span>R$ {c.tributosSaidaEstimados.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 4, marginTop: 2 }}>
                            <span>Preço Sugerido:</span>
                            <b style={{ color: c.melhorCenario ? '#6ee7b7' : '#3b82f6', fontSize: 13 }}>
                              R$ {c.precoVendaSugerido.toFixed(2)}
                            </b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                            <span>Carga Efetiva:</span>
                            <span>{c.cargaTributariaEfetivaPct.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Resumo Analítico de Custo e Tributos da NF-e (Etapa 3 / CPC 16 R1) */}
          {consolidadoCPC16 && (
            <div
              className="card"
              style={{
                marginTop: 14,
                marginBottom: 14,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                padding: 14,
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ margin: 0, color: '#166534', fontSize: '14px' }}>
                    📊 Resumo Analítico de Custo de Entrada & Tributos (NBC TG 16 / CPC 16 R1)
                  </h4>
                  <p className="hint" style={{ margin: '3px 0 0', color: '#15803d', fontSize: '12px' }}>
                    Custo de aquisição apurado segundo o Item 11 do CPC 16 (R1) e créditos admitidos no regime <b>{regime}</b>.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ background: '#2e7d32', borderColor: '#2e7d32', fontSize: '12.5px', padding: '6px 12px', fontWeight: 600 }}
                    onClick={() => setModalCusto({ aberto: true, modo: 'resumido' })}
                    title="Visualizar a tabela de composição de custo de aquisição individualizado por produto"
                  >
                    📊 Custo Individualizado por Produto
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ background: '#107c41', borderColor: '#107c41', fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => handleEnviarParaPrecificacao(extractedInvoice.itens)}
                    title="Transferir todos os itens da nota fiscal diretamente para a aba de Precificação"
                  >
                    💰 Enviar Todos para Precificação
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ background: '#0b3d91', borderColor: '#0b3d91', fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => handleEnviarParaErp(extractedInvoice.itens, false)}
                    title="Transferir todos os itens da nota fiscal diretamente para a aba de Parametrização ERP"
                  >
                    ⚙️ Enviar Todos para Parametrização ERP
                  </button>
                  {selectedIndices.size > 0 && selectedIndices.size < extractedInvoice.itens.length && (
                    <>
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ fontSize: '12.5px', padding: '6px 12px' }}
                        onClick={() => {
                          const selecionados = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));
                          handleEnviarParaPrecificacao(selecionados);
                        }}
                        title="Transferir apenas os itens selecionados para a Precificação"
                      >
                        💰 Enviar {selectedIndices.size} Itens Selecionados
                      </button>
                      <button
                        type="button"
                        className="btn-secundario"
                        style={{ fontSize: '12.5px', padding: '6px 12px' }}
                        onClick={() => {
                          const selecionados = extractedInvoice.itens.filter((it) => selectedIndices.has(it.index));
                          handleEnviarParaErp(selecionados, false);
                        }}
                        title="Transferir apenas os itens selecionados para a Parametrização ERP"
                      >
                        ⚙️ Enviar {selectedIndices.size} Selecionados p/ ERP
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: 10,
                  marginTop: 12,
                  fontSize: '12.5px',
                }}
              >
                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Produtos (vProd):</span>
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                    {consolidadoCPC16.valorTotalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Frete/Seg/Outros:</span>
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                    + {consolidadoCPC16.freteSeguroTotais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #fee2e2' }}>
                  <span style={{ color: '#991b1b', fontSize: '11px', display: 'block' }}>Tributos s/ Crédito (IPI/ST):</span>
                  <strong style={{ fontSize: '13px', color: '#b91c1c' }}>
                    + {consolidadoCPC16.tributosNaoRecuperaveisTotais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #dbeafe' }}>
                  <span style={{ color: '#1e40af', fontSize: '11px', display: 'block' }}>Impostos a Recuperar:</span>
                  <strong style={{ fontSize: '13px', color: '#2563eb' }}>
                    - {consolidadoCPC16.impostosRecuperaveisTotais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>

                <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: 6, border: '1px solid #86efac' }}>
                  <span style={{ color: '#14532d', fontSize: '11px', display: 'block', fontWeight: 600 }}>Custo Real Líquido:</span>
                  <strong style={{ fontSize: '14px', color: '#166534' }}>
                    {consolidadoCPC16.custoTotalRealConsolidado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Contexto da Entrada no Estado do Paraná (RICMS/PR) */}
          <div
            className="card"
            style={{
              marginTop: 14,
              marginBottom: 14,
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              padding: 14,
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '16px' }}>⚖️</span>
                <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>
                  Parâmetros de Entrada no Paraná (RICMS/PR · Decreto nº 7.871/2017)
                </strong>
              </div>
              <span className="badge blue mono" style={{ fontSize: '11px' }}>
                UF Origem: {extractedInvoice.emitente?.uf || 'ND'} ➔ Destino: {extractedInvoice.destinatario?.uf || 'PR'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', color: '#334155' }}>
                <strong>Regime do Destinatário (CRT):</strong>
                <select
                  value={crtDestinatario}
                  onChange={(e) => setCrtDestinatario(e.target.value as any)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    background: '#ffffff',
                  }}
                >
                  <option value="3">CRT 3 - Regime Normal (Lucro Real / Presumido)</option>
                  <option value="1">CRT 1 - Simples Nacional (ME / EPP)</option>
                  <option value="2">CRT 2 - Simples Nacional (Excesso Sublimite)</option>
                  <option value="4">CRT 4 - MEI (Microempreendedor Individual)</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', color: '#334155' }}>
                <strong>Destinação Predominante:</strong>
                <select
                  value={destinacaoPadrao}
                  onChange={(e) => setDestinacaoPadrao(e.target.value as any)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    background: '#ffffff',
                  }}
                >
                  <option value="comercializacao">Revenda / Comercialização</option>
                  <option value="industrializacao">Industrialização / Insumo</option>
                  <option value="uso_consumo">Uso e Consumo (DIFAL Base Dupla)</option>
                  <option value="ativo_imobilizado">Ativo Imobilizado (DIFAL Base Dupla / CIAP)</option>
                </select>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '11.5px',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                }}
                title="Conforme Consulta Tributária SEFA/PR nº 48/2026, opta-se por incluir ou não os novos tributos (IBS/CBS/IS) na Base de Cálculo do ICMS durante a transição 2026."
              >
                <input
                  type="checkbox"
                  checked={incluirIbsCbsBcIcms}
                  onChange={(e) => setIncluirIbsCbsBcIcms(e.target.checked)}
                />
                <span>
                  <strong>Consulta SEFA/PR nº 48/2026:</strong> Incluir IBS/CBS/IS na BC do ICMS
                </span>
              </label>
            </div>
          </div>

          {/* Card Executivo: Apuração de DIFAL, FECOP & Antecipação na Entrada (RICMS/PR) */}
          {apuracaoDifalNota && (
            <div
              className="card"
              style={{
                marginBottom: 14,
                padding: 14,
                borderRadius: 8,
                background: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#fff7ed' : '#f0fdf4',
                border: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                  ? '2px solid #ea580c'
                  : '1px solid #86efac',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '18px' }}>
                    {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '⚠️' : '✅'}
                  </span>
                  <div>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#9a3412' : '#166534',
                      }}
                    >
                      {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                        ? 'APURAÇÃO DE DIFAL, FECOP & ANTECIPAÇÃO TRIBUTÁRIA (RICMS/PR)'
                        : 'DISPENSA DE DIFAL / ANTECIPAÇÃO NA ENTRADA (PR)'}
                    </h4>
                    <p
                      className="hint"
                      style={{
                        margin: '2px 0 0',
                        fontSize: '11.5px',
                        color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#c2410c' : '#15803d',
                      }}
                    >
                      {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota
                        ? 'Foram identificadas obrigações estaduais e impacto no fluxo de caixa na entrada das mercadorias no Paraná.'
                        : 'Nenhuma mercadoria desta nota exige recolhimento de DIFAL ou Antecipação tributária estadual na entrada.'}
                    </p>
                  </div>
                </div>

                {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota && (
                  <span
                    className="badge mono"
                    style={{ background: '#ea580c', color: '#ffffff', fontWeight: 700, fontSize: '12px' }}
                  >
                    Guia: {(apuracaoDifalNota.resumoDifalNota.guiasNecessarias || []).join(', ') || 'GR-PR'}
                  </span>
                )}
              </div>

              {/* Grid com 4 Métricas Executivas */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7aa' }}>
                  <span style={{ color: '#9a3412', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                    1. DIFAL Base Dupla (Consumo/Ativo):
                  </span>
                  <strong style={{ fontSize: '14px', color: '#c2410c' }}>
                    {((apuracaoDifalNota.resumoDifalNota.totalDebitoDifal || 0)).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>

                <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7aa' }}>
                  <span style={{ color: '#9a3412', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                    2. FECOP 2% (Art. 14-A da Lei nº 11.580/1996 e Anexo XII do RICMS/PR):
                  </span>
                  <strong style={{ fontSize: '14px', color: '#c2410c' }}>
                    {((apuracaoDifalNota.resumoDifalNota.totalDebitoFecop || 0)).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>

                <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7aa' }}>
                  <span style={{ color: '#9a3412', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                    3. Antecipação Tributária (Simples):
                  </span>
                  <strong style={{ fontSize: '14px', color: '#c2410c' }}>
                    {((apuracaoDifalNota.resumoDifalNota.totalAntecipacaoArt16 || 0)).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>

                <div
                  style={{
                    background: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#ffedd5' : '#dcfce7',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '1.5px solid #f97316' : '1px solid #86efac',
                  }}
                >
                  <span
                    style={{
                      color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#7c2d12' : '#14532d',
                      fontSize: '11px',
                      display: 'block',
                      fontWeight: 700,
                    }}
                  >
                    4. Total Débito Estadual / Caixa:
                  </span>
                  <strong
                    style={{
                      fontSize: '15px',
                      color: apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota ? '#c2410c' : '#166534',
                    }}
                  >
                    {((apuracaoDifalNota.resumoDifalNota.totalGeralRecolher ?? apuracaoDifalNota.resumoDifalNota.totalDebitoDifal ?? 0)).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </div>
              </div>

              {/* Obrigações Acessórias e Prazos */}
              {apuracaoDifalNota.resumoDifalNota.exigeRecolhimentoNaNota && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#ffffff',
                    border: '1px solid #fed7aa',
                    fontSize: '11.5px',
                    color: '#7c2d12',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 14,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>Vencimento Legal:</strong> {apuracaoDifalNota.resumoDifalNota.prazoPrincipal || 'Até o dia 12 do mês subsequente'}
                  </div>
                  <div>
                    <strong>Obrigações / EFD:</strong> {(apuracaoDifalNota.resumoDifalNota.obrigacoesAcessorias || []).join(' · ') || 'Outros Débitos — Reg. E111'}
                  </div>
                  <div>
                    <strong>Guia Oficial:</strong> {(apuracaoDifalNota.resumoDifalNota.guiasNecessarias || []).join(', ') || 'GR-PR'}
                  </div>
                </div>
              )}

              {/* Alertas Periciais Normativos */}
              {apuracaoDifalNota.resumoDifalNota.alertasConsolidados && apuracaoDifalNota.resumoDifalNota.alertasConsolidados.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {apuracaoDifalNota.resumoDifalNota.alertasConsolidados.map((alerta: string, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: '11.5px',
                        background: alerta.includes('revogação') || alerta.includes('indevido') ? '#fee2e2' : '#fffbeb',
                        border: alerta.includes('revogação') || alerta.includes('indevido') ? '1px solid #fca5a5' : '1px solid #fde68a',
                        color: alerta.includes('revogação') || alerta.includes('indevido') ? '#991b1b' : '#92400e',
                      }}
                    >
                      {alerta}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabela Interativa de Itens */}
          <TabelaItensExtracao
            itens={extractedInvoice.itens}
            selectedIndices={selectedIndices}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onSelectSensitivesOnly={handleSelectOnlySensitive}
            onSelectOnlySensitive={handleSelectOnlySensitive}
            disabled={isAuditing}
            onPrecificarItem={(item) => handleEnviarParaPrecificacao([item])}
            onParametrizarItem={(item) => handleEnviarParaErp([item], false)}
            onParametrizarSelecionados={(itens) => handleEnviarParaErp(itens, false)}
            destinacaoPorItem={destinacaoPorItem}
            onAlterarDestinacaoItem={handleAlterarDestinacaoItem}
            destinacaoPadrao={destinacaoPadrao}
            diagnosticosDifal={apuracaoDifalNota?.itensDiagnostico}
          />

          {/* Painel Dual Engine Selector (Seletor de Motor Duplo) */}
          <div className="card" style={{ marginTop: 20, marginBottom: 20, background: '#fcfdfe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--ink)' }}>
                  Motor de Inteligência Fiscal para Auditoria
                </h3>
                <p className="hint" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
                  Escolha o ambiente de processamento dos {selectedIndices.size} itens selecionados:
                </p>
              </div>
              <span className="badge blue mono" style={{ fontSize: '11px' }}>
                {motor === 'ollama' ? 'Soberania Local Ativa' : 'Modo Nuvem Selecionado'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              {/* Card 1: Ollama Local (GPU RX 580) */}
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 16,
                  borderRadius: 12,
                  cursor: isAuditing ? 'not-allowed' : 'pointer',
                  border: motor === 'ollama' ? '2px solid var(--brand)' : '1px solid var(--line)',
                  background: motor === 'ollama' ? '#f4f8fe' : '#ffffff',
                  boxShadow: motor === 'ollama' ? '0 2px 8px rgba(11,61,145,0.08)' : 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="radio"
                      name="motor_auditoria"
                      value="ollama"
                      checked={motor === 'ollama'}
                      onChange={() => setMotor('ollama')}
                      disabled={isAuditing}
                      style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                      IA Local (GPU AMD RX 580)
                    </strong>
                  </div>
                  <span className="badge alta mono" style={{ fontSize: '10.5px' }}>100% Privado</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.45, paddingLeft: 28 }}>
                  <div>• <strong>Processamento Particionado:</strong> Item a item (ou micro-lotes de 1-2 itens).</div>
                  <div>• <strong>Zero Timeout:</strong> Limite de 35s por item, eliminando estouros de 180s na RX 580.</div>
                  <div>• <strong>Soberania Tributária:</strong> Zero tráfego externo; dados fiscais confidenciais não saem do servidor.</div>
                </div>

                {motor === 'ollama' && (
                  <div style={{ marginTop: 12, paddingLeft: 28 }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                      Modelo Local:
                    </label>
                    <select
                      value={modeloOllama}
                      onChange={(e) => setModeloOllama(e.target.value)}
                      disabled={isAuditing}
                      style={{ fontSize: '12px', padding: '6px 8px', borderRadius: 6, width: '100%', maxWidth: 280 }}
                    >
                      <option value="qwen2.5:7b">qwen2.5:7b (Perícia Tributária Profunda & Arbitragem NCM)</option>
                      <option value="qwen3.5:4b">qwen3.5:4b (Triagem Rápida & Alto Rendimento 16k)</option>
                      <option value="qwen2.5:7b-16k">qwen2.5:7b-16k (Contexto Estendido 16k)</option>
                    </select>
                  </div>
                )}

                <div style={{ marginTop: 12, paddingLeft: 28, fontSize: '11px', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
                  <span>Endpoint local 127.0.0.1:11434 pronto · Vulkan/DirectML ativo</span>
                </div>
              </label>

              {/* Card 2: Google Gemini API (Nuvem) */}
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 16,
                  borderRadius: 12,
                  cursor: isAuditing ? 'not-allowed' : 'pointer',
                  border: motor === 'gemini' ? '2px solid var(--brand)' : '1px solid var(--line)',
                  background: motor === 'gemini' ? '#f4f8fe' : '#ffffff',
                  boxShadow: motor === 'gemini' ? '0 2px 8px rgba(11,61,145,0.08)' : 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="radio"
                      name="motor_auditoria"
                      value="gemini"
                      checked={motor === 'gemini'}
                      onChange={() => setMotor('gemini')}
                      disabled={isAuditing}
                      style={{ width: 18, height: 18, accentColor: 'var(--brand)', cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                      Google Gemini API (Nuvem)
                    </strong>
                  </div>
                  <span className="badge blue mono" style={{ fontSize: '10.5px' }}>Alta Velocidade</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.45, paddingLeft: 28 }}>
                  <div>• <strong>Modelo Cloud:</strong> gemini-3.8-flash via SDK oficial (@google/genai).</div>
                  <div>• <strong>Execução Paralela:</strong> Auditoria em nuvem com resposta estruturada em JSON Schema.</div>
                  <div>• <strong>Ideal para Lotes:</strong> Elevada vazão para notas fiscais com dezenas de itens.</div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: 12, paddingLeft: 28 }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0e5cc4', display: 'inline-block' }} />
                    <span>Utiliza chave de API configurada no ambiente (GEMINI_API_KEY)</span>
                  </div>
                </div>
              </label>
            </div>

            {/* Ação de Disparo da Auditoria */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAuditSubmit}
                disabled={isAuditing || selectedIndices.size === 0}
                className="btn primary"
                style={{ fontWeight: 650, padding: '10px 20px' }}
              >
                {isAuditing
                  ? `Auditando ${selectedIndices.size} item(ns) via ${motor === 'ollama' ? 'IA Local (RX 580)' : 'Google Gemini'}...`
                  : `Auditar ${selectedIndices.size} Item(ns) Selecionado(s)`}
              </button>

              {selectedIndices.size === 0 && (
                <span className="small" style={{ color: 'var(--bad)', fontWeight: 600 }}>
                  Selecione ao menos 1 item na tabela acima para iniciar a auditoria.
                </span>
              )}
            </div>
          </div>

          {isAuditing && (
            <div className="note info" style={{ marginTop: 20 }}>
              <div className="t">
                Executando Auditoria Pericial via {motor === 'ollama' ? 'IA Local Ollama (GPU RX 580)' : 'Google Gemini Cloud API'}...
              </div>
              <div className="x" style={{ marginTop: 6 }}>
                Auditando <strong>{selectedIndices.size}</strong> item(ns) de {extractedInvoice.itens.length} · Tempo decorrido: <strong>{auditElapsedTime}s</strong>
              </div>
              <div className="x" style={{ marginTop: 4, fontSize: '0.88rem', opacity: 0.85 }}>
                {motor === 'ollama'
                  ? 'Os itens selecionados estão sendo particionados item a item com timeout de 35s e num_ctx: 4096 para eliminar sobrecargas de VRAM e timeouts de 180s na GPU RX 580.'
                  : 'Os itens selecionados estão sendo processados via Google Gemini API (gemini-3.8-flash) com schema estruturado e saneamento determinístico Siscomex.'}
              </div>
            </div>
          )}

          {auditError && (
            <div className="note error" style={{ marginTop: 20 }}>
              <div className="t">Erro na auditoria pericial</div>
              <div className="x">{auditError}</div>
              {motor === 'ollama' && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMotor('gemini');
                      setAuditError(null);
                    }}
                    className="chip"
                    style={{ cursor: 'pointer' }}
                  >
                    Alternar para Google Gemini Cloud API
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
       * ETAPA FINAL: Apresentação dos Resultados Auditados e ERP
       * ========================================================================= */}
      {auditResult && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Resultados da Auditoria</h3>
              {auditResult.statusGlobal === 'Inconsistente' ? (
                <span className="badge error">{auditResult.statusGlobal}</span>
              ) : auditResult.statusGlobal === 'Atenção' ? (
                <span className="badge media">{auditResult.statusGlobal}</span>
              ) : (
                <span className="badge blue">{auditResult.statusGlobal || 'Regular'}</span>
              )}
              <span className="badge grey mono">{auditResult.motor}</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={handleReturnToSelection} className="mini" title="Modificar seleção de itens ou motor">
                ← Voltar para Seleção de Itens
              </button>
              <button type="button" onClick={handleResetToUpload} className="mini">
                ↺ Nova Auditoria
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14, marginBottom: 16, background: '#f9f9f9', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Técnico do Documento</h4>
            <p className="small">{auditResult.parecerTecnicoXml || 'Nenhum parecer técnico disponível.'}</p>
          </div>

          <div className="card" style={{ marginBottom: 16, background: '#f0f4f8', padding: 16, borderRadius: 8 }}>
            <h4>Parecer Breve de Conformidade e Créditos</h4>
            <p className="small">{auditResult.parecerConformidade || 'Nenhum parecer de conformidade disponível.'}</p>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleDownloadReport('html')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: 'var(--brand)', color: 'white' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório HTML'}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadReport('txt')}
              disabled={pdfLoading}
              className="chip"
              style={{ padding: '8px 16px', background: '#34495e', color: 'white' }}
            >
              {pdfLoading ? 'Gerando...' : 'Baixar Relatório TXT'}
            </button>
            {pdfError && <div className="note error" style={{ marginTop: 8 }}>{pdfError}</div>}
          </div>

          <ParametrizacaoERP data={auditResult} />
        </div>
      )}

      {/* Modal de Custo Individualizado por Produto (CPC 16 / NBC TG 16) */}
      {modalCusto.aberto && consolidadoCPC16 && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 10,
              width: '100%',
              maxWidth: 1100,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Topo do Modal */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1.5px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#3A4A1E', fontSize: '1.15rem' }}>
                  📊 Custo de Aquisição Individualizado por Produto — CPC 16 (R1)
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Regime tributário: <b>{regime}</b> · Finalidade: <b>{finalidade}</b>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalCusto({ aberto: false, modo: 'resumido' })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  color: '#64748b',
                  lineHeight: 1,
                  padding: '4px 8px',
                }}
                title="Fechar modal"
              >
                ✕
              </button>
            </div>

            {/* Barra de Ações e Alternância de Modo */}
            <div
              style={{
                padding: '10px 20px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setModalCusto((prev) => ({ ...prev, modo: 'resumido' }))}
                  style={{
                    backgroundColor: modalCusto.modo === 'resumido' ? '#3A4A1E' : '#f1f5f9',
                    color: modalCusto.modo === 'resumido' ? '#ffffff' : '#334155',
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  📋 Visão Resumida (Somente Tabela de Custos)
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setModalCusto((prev) => ({ ...prev, modo: 'detalhado' }))}
                  style={{
                    backgroundColor: modalCusto.modo === 'detalhado' ? '#3A4A1E' : '#f1f5f9',
                    color: modalCusto.modo === 'detalhado' ? '#ffffff' : '#334155',
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  ⚖️ Visão Detalhada (com Citação Legal)
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="mini"
                  onClick={() => {
                    const html = gerarRelatorioCustosHtml(consolidadoCPC16, modalCusto.modo);
                    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `relatorio_custo_cpc16_${modalCusto.modo}.html`;
                    a.click();
                    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                  }}
                  style={{ backgroundColor: '#2563eb', color: '#fff', fontWeight: 600, padding: '6px 12px' }}
                >
                  📥 Baixar HTML
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setModalCusto({ aberto: false, modo: 'resumido' })}
                  style={{ padding: '6px 12px' }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Conteúdo Renderizado com Scroll */}
            <div
              style={{
                padding: '16px 20px',
                overflowY: 'auto',
                flex: 1,
                backgroundColor: '#f8fafc',
              }}
              dangerouslySetInnerHTML={{
                __html: gerarRelatorioCustosHtml(consolidadoCPC16, modalCusto.modo),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
