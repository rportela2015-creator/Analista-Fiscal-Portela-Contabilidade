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
import AuditoriaUploadPanel from './auditoria/AuditoriaUploadPanel';
import AuditoriaDifalResumoCard from './auditoria/AuditoriaDifalResumoCard';
import AuditoriaBarraExportacao from './auditoria/AuditoriaBarraExportacao';
import {
  calcularCustoItemCPC16,
  consolidarCustosEntradaCPC16,
  RelatorioCustoEntradaConsolidado,
} from '@/lib/custos';
import { RegimeTributario, DestinacaoMercadoria, loadMarcoLegal, type MarcoLegal } from '@/lib/marco-legal';
import { loadDataset, type Dataset } from '@/lib/data';
import {
  DEFAULT_NORMAS_VIGENTES_SANEAMENTO,
  aplicarSaneamentoNcmNoItem,
  resolverRastreabilidadeSnapshot,
} from '@/lib/fiscal/saneamento-ncm';
import { auditarDifalNotaEntrada } from '@/lib/engine/difal-pr';
import {
  apurarDemonstrativoDifalEntradaPR,
  consolidarMultiplasNotasDifalPR,
  type ItemDemonstrativoDifalPR,
  type DemonstrativoConsolidadoDifalPR,
} from '@/lib/fiscal/difal-pr';
import { obterFontesNormativasPorAba } from '@/lib/fiscal/fontes-normativas';
import type { DiagnosticoDifalEntrada, ResumoDifalNfeEntrada } from '@/lib/types/motor-tributario';
import { useEmpresaAtiva } from '@/lib/hooks/useEmpresaAtiva';
import type { ResultadoOrquestracaoNfe } from '@/lib/engine/orquestrador-fiscal';
import type { StatusExtincaoDebitoFornecedor } from '@/lib/fiscal/credito-tributario';
import { detectarTipoXmlFiscal } from '@/lib/extrator-nfse';
import type { ResultadoAuditoriaNfse } from '@/lib/extrator-nfse-types';
import { useNivelOperacional } from '@/lib/hooks/useNivelOperacional';
import {
  extrairDadosXmlCte,
  type ExtractedCteData,
} from '@/lib/fiscal/extrator-cte';
import {
  resolverContextoEmpresaNaData,
  construirNotaFiscalAuditadaSessao,
  converterAuditadoParaPrecificacao,
  converterAuditadoParaParametrizacao,
  type ItemFiscalAuditado,
  type NotaFiscalAuditadaSessao,
} from '@/lib/types/item-fiscal-auditado';
import {
  KpiStrip,
  StickyActionBar,
  ProgressiveSection,
  LegalCitationBlock,
  type KpiItemData,
} from '@/components/ui';

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

function formatarBrl(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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

  // 0. Nível Operacional e Empresa Ativa
  const { nivel, isGerencial, isOperacional, isSenior } = useNivelOperacional();
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
  const [relatorioBloqueadoHardcoded, setRelatorioBloqueadoHardcoded] = useState<{ mensagem: string; format: 'html' | 'txt' } | null>(null);

  // 5. Estados do Modal de Custo Individualizado por Produto (CPC 16)
  const [modalCusto, setModalCusto] = useState<{
    aberto: boolean;
    modo: 'resumido' | 'detalhado';
  }>({ aberto: false, modo: 'resumido' });

  // 6. Estados de Apuração Bitemporal de DIFAL, FECOP & Antecipação PR (Sub-Etapa 18.3 + Marco 2)
  const [crtDestinatario, setCrtDestinatario] = useState<'1' | '2' | '3' | '4'>('3');
  const [destinacaoPadrao, setDestinacaoPadrao] = useState<'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'>('comercializacao');
  const [incluirIbsCbsBcIcms, setIncluirIbsCbsBcIcms] = useState<boolean>(true);
  const [destinacaoPorItem, setDestinacaoPorItem] = useState<Record<string | number, 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado'>>({});
  const [contribuinteInscritoPR, setContribuinteInscritoPR] = useState<boolean>(true);
  const [expandirDemonstrativoDifal, setExpandirDemonstrativoDifal] = useState<boolean>(true);
  const [itemDifalSelecionado, setItemDifalSelecionado] = useState<ItemDemonstrativoDifalPR | null>(null);
  const [notasDifalSessao, setNotasDifalSessao] = useState<DemonstrativoConsolidadoDifalPR[]>([]);

  // 7. Estado de CT-e FOB (Modelo 57 XML) para rateio CPC 16 por item
  const [cteFobData, setCteFobData] = useState<ExtractedCteData | null>(null);
  const [cteFobError, setCteFobError] = useState<string | null>(null);
  const [cteFobNomeArquivo, setCteFobNomeArquivo] = useState<string>('');

  // 8. Saneamento Assistido xProd x NCM (Dual-Track Entrada XML vs. Saída/ERP/Precificação)
  const [datasetSaneamento, setDatasetSaneamento] = useState<Dataset | null>(null);
  const [marcoSaneamento, setMarcoSaneamento] = useState<MarcoLegal | null>(null);
  const [saneamentoOverrides, setSaneamentoOverrides] = useState<
    Record<number, { ncmSaneado: string; justificativaPericial: string; aplicadoEmIso: string }>
  >({});

  React.useEffect(() => {
    let ativo = true;
    loadDataset()
      .then(async (ds) => {
        await ds.pronto.catch(() => null);
        if (ativo) setDatasetSaneamento(ds);
      })
      .catch(() => null);
    loadMarcoLegal()
      .then((m) => {
        if (ativo) setMarcoSaneamento(m);
      })
      .catch(() => null);
    return () => {
      ativo = false;
    };
  }, []);

  React.useEffect(() => {
    const novoCrt = regime.toLowerCase().includes('simples') ? '1' : regime.toLowerCase().includes('mei') ? '4' : '3';
    setCrtDestinatario((prev) => (prev === novoCrt ? prev : novoCrt));
  }, [regime]);

  React.useEffect(() => {
    let novaDest: 'comercializacao' | 'industrializacao' | 'uso_consumo' | 'ativo_imobilizado' = 'comercializacao';
    if (finalidade.toLowerCase().includes('ind')) novaDest = 'industrializacao';
    else if (finalidade.toLowerCase().includes('ativo')) novaDest = 'ativo_imobilizado';
    else if (finalidade.toLowerCase().includes('consumo') || finalidade.toLowerCase().includes('uso')) novaDest = 'uso_consumo';
    setDestinacaoPadrao((prev) => (prev === novaDest ? prev : novaDest));
  }, [finalidade]);

  // Sincronização automática do Regime e Parâmetros com a Empresa Ativa via escalares
  const perfilRegimeTributario = perfilAtivo?.regimeTributario;
  const perfilDiferimentoArt28 = perfilAtivo?.beneficiosParana?.diferimentoParcialArt28;

  React.useEffect(() => {
    if (perfilRegimeTributario) {
      let novoRegime = '';
      if (perfilRegimeTributario === 'SIMPLES_NACIONAL' || perfilRegimeTributario === 'MEI') {
        novoRegime = 'Simples Nacional';
      } else if (perfilRegimeTributario === 'LUCRO_PRESUMIDO' || perfilRegimeTributario === 'LUCRO_REAL') {
        novoRegime = 'Regime Regular';
      }
      if (novoRegime) {
        setRegime((prev) => (prev === novoRegime ? prev : novoRegime));
      }
    }

    if (perfilDiferimentoArt28 !== undefined) {
      const novoIncluir = Boolean(perfilDiferimentoArt28);
      setIncluirIbsCbsBcIcms((prev) => (prev === novoIncluir ? prev : novoIncluir));
    }
  }, [perfilRegimeTributario, perfilDiferimentoArt28]);

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

      // Sincronização automática silenciosa pós-extração (se habilitada) via contrato canônico ItemFiscalAuditado
      if (autoSync && result.itens && result.itens.length > 0) {
        const contextoEmpresa = resolverContextoEmpresaNaData({
          empresaAtiva,
          perfilFallback: perfilAtivo,
          dataEmissao: result.identificacao?.dataEmissao,
          regimeFallback: regime,
          ufFallback: result.destinatario?.uf || 'PR',
          inscritoEstadualPR: contribuinteInscritoPR,
        });
        const sessaoSync = construirNotaFiscalAuditadaSessao({
          invoice: result,
          contextoEmpresa,
          destinacaoPadrao,
          destinacaoPorItem,
          cteFob: cteFobData,
          marco: marcoSaneamento,
          ds: datasetSaneamento,
          statusExtincaoRtc,
        });
        const itensPrec = sessaoSync.itens.map((aud) => converterAuditadoParaPrecificacao(aud));
        const itensErp = sessaoSync.itens.map((aud) => converterAuditadoParaParametrizacao(aud));

        try {
          sessionStorage.setItem('ncm-precificar-itens', JSON.stringify(itensPrec));
          sessionStorage.setItem('ncm-parametrizar-itens', JSON.stringify(itensErp));
          sessionStorage.setItem('ncm-itens-auditados', JSON.stringify(sessaoSync.itens));
        } catch {
          /* fallback */
        }

        window.dispatchEvent(
          new CustomEvent('navegar-aba', {
            detail: {
              tab: 'parametrizar',
              itens: itensPrec,
              itensErp,
              itensAuditados: sessaoSync.itens,
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
    setCteFobData(null);
    setCteFobError(null);
    setCteFobNomeArquivo('');
    setSaneamentoOverrides({});
  };

  const handleAplicarSaneamentoNcm = (nItem: number, ncmSaneado: string, justificativa: string) => {
    setSaneamentoOverrides((prev) => ({
      ...prev,
      [nItem]: {
        ncmSaneado,
        justificativaPericial: justificativa,
        aplicadoEmIso: new Date().toISOString(),
      },
    }));
  };

  const handleReverterSaneamentoNcm = (nItem: number) => {
    setSaneamentoOverrides((prev) => {
      const next = { ...prev };
      delete next[nItem];
      return next;
    });
  };

  const handleUploadCteFob = async (cteFile: File | null) => {
    if (!cteFile) {
      setCteFobData(null);
      setCteFobError(null);
      setCteFobNomeArquivo('');
      return;
    }
    try {
      setCteFobError(null);
      const xmlText = await cteFile.text();
      const extraido = extrairDadosXmlCte(xmlText);
      setCteFobData(extraido);
      setCteFobNomeArquivo(cteFile.name);
    } catch (err: unknown) {
      setCteFobData(null);
      setCteFobNomeArquivo(cteFile.name);
      setCteFobError(err instanceof Error ? err.message : 'Falha ao ler XML do CT-e FOB.');
    }
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
      const aud = auditadosPorMap[it.index];
      const precItem = aud
        ? converterAuditadoParaPrecificacao(aud)
        : converterItemExtracaoParaPrecificacao(it);
      const itemCredito = resultadoOrquestracao.etapas.creditos.itensCredito[idx];
      if (itemCredito && !aud) {
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
        itensAuditados: notaAuditadaSessao?.itens || [],
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
  const handleDownloadReport = async (format: 'html' | 'txt' = 'html', opts?: { permitirSimulacaoHardcoded?: boolean }) => {
    if (!auditResult) return;
    setPdfLoading(true);
    setPdfError(null);
    setRelatorioBloqueadoHardcoded(null);
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

      const shaReport = (extractedInvoice as any)?.sha256 || resultadoOrquestracao?.sha256Xml || datasetSaneamento?.meta?.versao || undefined;
      const payloadRelatorio = {
        ...auditResult,
        itens: itensEnriquecidos,
        itensAuditados: notaAuditadaSessao?.itens || undefined,
        totaisCpc16: notaAuditadaSessao?.totaisCpc16 || undefined,
        cteFobResumo: notaAuditadaSessao?.cteFob
          ? {
              chaveAcesso: notaAuditadaSessao.cteFob.chaveAcesso,
              numero: notaAuditadaSessao.cteFob.numero,
              vTPrest: notaAuditadaSessao.cteFob.valores.vTPrest,
              vICMS: notaAuditadaSessao.cteFob.icms.vICMS,
              aplicado: Boolean(notaAuditadaSessao.rateioCte?.aplicado),
              motivoBloqueio: notaAuditadaSessao.rateioCte?.motivoBloqueio,
            }
          : undefined,
        resumoDifalEntrada: apuracaoDifalNota?.resumoDifalNota,
        orquestracaoDag: resultadoOrquestracao || undefined,
        sha256: shaReport,
        rastreabilidadeSnapshot: resolverRastreabilidadeSnapshot({
          mode: resultadoOrquestracao ? 'orquestrador-local-dag' : 'deterministico-local',
          snapshotSha256: shaReport || datasetSaneamento?.meta?.versao || 'N/A',
          normasVigentes: [
            ...DEFAULT_NORMAS_VIGENTES_SANEAMENTO,
            ...(datasetSaneamento?.meta?.ncm_ato &&
            !DEFAULT_NORMAS_VIGENTES_SANEAMENTO.some((n) => n.includes(datasetSaneamento.meta.ncm_ato))
              ? [datasetSaneamento.meta.ncm_ato]
              : []),
          ],
        }),
        format,
        permitirSimulacaoHardcoded: Boolean(opts?.permitirSimulacaoHardcoded),
      };

      const res = await fetch('/api/auditoria-relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadRelatorio),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        if (res.status === 503 && errBody?.codigo === 'RTC_HARDCODED_BLOQUEADO') {
          setRelatorioBloqueadoHardcoded({
            mensagem:
              errBody.error ||
              'Snapshot oficial RFB/Reforma indisponível (modo hardcoded). Execute npm run rfb:refresh antes de gerar laudos oficiais.',
            format,
          });
        }
        throw new Error(errBody?.error || `Erro HTTP ${res.status} ao gerar relatório.`);
      }

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

  // ─── Marco 2: Demonstrativo Produto a Produto, Somatório e Prazo DIFAL PR ───
  const demonstrativoDifalPR = React.useMemo<DemonstrativoConsolidadoDifalPR | null>(() => {
    if (!extractedInvoice || !extractedInvoice.itens || extractedInvoice.itens.length === 0) return null;
    return apurarDemonstrativoDifalEntradaPR(extractedInvoice, {
      crtDestinatario: Number(crtDestinatario) as any,
      inscritoEstadualPR: contribuinteInscritoPR,
      destinacaoPadrao,
      destinacaoPorItem,
      incluirIbsCbsBcIcms,
    });
  }, [extractedInvoice, crtDestinatario, contribuinteInscritoPR, destinacaoPadrao, destinacaoPorItem, incluirIbsCbsBcIcms]);

  React.useEffect(() => {
    if (!demonstrativoDifalPR) return;
    const chave =
      demonstrativoDifalPR.chaveNota ||
      `${demonstrativoDifalPR.numeroNota || 'SN'}-${demonstrativoDifalPR.dataEmissao}-${demonstrativoDifalPR.somatorio.qtdItensAnalisados}`;
    setNotasDifalSessao((prev) => {
      const idx = prev.findIndex((n) => {
        const k = n.chaveNota || `${n.numeroNota || 'SN'}-${n.dataEmissao}-${n.somatorio.qtdItensAnalisados}`;
        return k === chave;
      });
      if (idx >= 0) {
        const atual = prev[idx];
        if (
          atual.somatorio.totalDifalGeral === demonstrativoDifalPR.somatorio.totalDifalGeral &&
          atual.perfilContribuinte === demonstrativoDifalPR.perfilContribuinte &&
          atual.prazoRecolhimento.dataVencimento === demonstrativoDifalPR.prazoRecolhimento.dataVencimento
        ) {
          return prev;
        }
        const copia = [...prev];
        copia[idx] = demonstrativoDifalPR;
        return copia;
      }
      return [...prev, demonstrativoDifalPR];
    });
  }, [demonstrativoDifalPR]);

  const somatorioConsolidadoNotas = React.useMemo(() => {
    return consolidarMultiplasNotasDifalPR(notasDifalSessao);
  }, [notasDifalSessao]);

  // ─── Sessão Canônica Unificada (Empresa Bitemporal dhEmi + CT-e FOB + CPC 16 R1 + Saneamento Dual-Track) ───
  const notaAuditadaSessao = React.useMemo<NotaFiscalAuditadaSessao | null>(() => {
    if (!extractedInvoice || !extractedInvoice.itens || extractedInvoice.itens.length === 0) return null;
    const ctxEmpresa = resolverContextoEmpresaNaData({
      empresaAtiva,
      perfilFallback: perfilAtivo,
      dataEmissao: extractedInvoice.identificacao?.dataEmissao,
      regimeFallback: regime,
      ufFallback: extractedInvoice.destinatario?.uf || 'PR',
      inscritoEstadualPR: contribuinteInscritoPR,
    });
    const sessaoBase = construirNotaFiscalAuditadaSessao({
      invoice: extractedInvoice,
      contextoEmpresa: ctxEmpresa,
      destinacaoPadrao,
      destinacaoPorItem,
      cteFob: cteFobData,
      marco: marcoSaneamento,
      ds: datasetSaneamento,
      statusExtincaoRtc,
    });

    const temOverrides = Object.keys(saneamentoOverrides).length > 0;
    if (!temOverrides) return sessaoBase;

    return {
      ...sessaoBase,
      itens: sessaoBase.itens.map((aud) => {
        const ov = saneamentoOverrides[aud.nItem];
        if (!ov) return aud;
        return aplicarSaneamentoNcmNoItem(aud, {
          ncmSaneado: ov.ncmSaneado,
          justificativaPericial: ov.justificativaPericial,
          ds: datasetSaneamento,
          marco: marcoSaneamento,
          agoraIso: ov.aplicadoEmIso,
        });
      }),
    };
  }, [
    extractedInvoice,
    empresaAtiva,
    perfilAtivo,
    regime,
    contribuinteInscritoPR,
    destinacaoPadrao,
    destinacaoPorItem,
    cteFobData,
    marcoSaneamento,
    datasetSaneamento,
    saneamentoOverrides,
    statusExtincaoRtc,
  ]);

  const auditadosPorMap = React.useMemo<Record<number, ItemFiscalAuditado>>(() => {
    const mapa: Record<number, ItemFiscalAuditado> = {};
    for (const aud of notaAuditadaSessao?.itens || []) {
      mapa[aud.nItem] = aud;
    }
    return mapa;
  }, [notaAuditadaSessao]);

  const citacoesNormativasAuditoria = React.useMemo(() => {
    return obterFontesNormativasPorAba('auditoria');
  }, []);

  // ─── 4 KPIs Executivos e Operacionais para KpiStrip (Design System) ──────
  const kpiItems = React.useMemo<KpiItemData[]>(() => {
    const totalItens = extractedInvoice?.itens?.length || 0;
    const itensSens = extractedInvoice?.itens?.filter((i) => i.sensivelParaAuditoria)?.length || 0;
    const confPct = totalItens > 0 ? (((totalItens - itensSens) / totalItens) * 100).toFixed(1) : '100.0';
    const difalTotal =
      (apuracaoDifalNota?.resumoDifalNota?.totalDifalGeral || 0) +
      (apuracaoDifalNota?.resumoDifalNota?.totalFecopGeral || 0);
    const creditoTotal =
      resultadoOrquestracao?.etapas?.creditos?.camadas?.totalCreditoEfetivadoCusto?.total || 0;

    return [
      {
        id: 'kpi-conf',
        label: 'Conformidade Geral',
        value: `${confPct}%`,
        subValue: `${totalItens - itensSens} de ${totalItens} itens regulares`,
        trafficLight: itensSens > 0 ? 'warning' : 'success',
        statusLabel: itensSens > 0 ? 'Atenção' : 'Conforme',
      },
      {
        id: 'kpi-difal',
        label: 'Débito DIFAL + FECOP PR',
        value: formatarBrl(difalTotal),
        subValue: 'Dec. 7.871/17 (Base Dupla)',
        trafficLight: difalTotal > 0 ? 'danger' : 'info',
        statusLabel: difalTotal > 0 ? 'Recolhimento' : 'Isento',
      },
      {
        id: 'kpi-alertas',
        label: 'Itens com Glosa / Risco',
        value: itensSens,
        subValue: itensSens === 1 ? '1 item com ressalva' : `${itensSens} itens com ressalva`,
        trafficLight: itensSens > 0 ? 'danger' : 'success',
        statusLabel: itensSens > 0 ? 'Trava ST' : 'Regular',
      },
      {
        id: 'kpi-credito',
        label: 'Crédito Efetivado CMV',
        value: formatarBrl(creditoTotal),
        subValue: 'CPC 16 / Split Payment',
        trafficLight: 'info',
        statusLabel: 'Aproveitável',
      },
    ];
  }, [extractedInvoice, apuracaoDifalNota, resultadoOrquestracao]);

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
    const auditadosSelecionados = itensParaEnviar
      .map((it) => auditadosPorMap[it.index])
      .filter((x): x is ItemFiscalAuditado => Boolean(x));

    const convertidos = itensParaEnviar.map((it) => {
      const aud = auditadosPorMap[it.index];
      if (aud) return converterAuditadoParaPrecificacao(aud);
      const destItem =
        destinacaoPorItem[it.index] || destinacaoPorItem[it.cProd] || destinacaoPadrao;
      return converterItemExtracaoParaPrecificacao(it, {
        destinacao: destItem,
        ufOrigem: extractedInvoice?.emitente?.uf,
        ufDestino: extractedInvoice?.destinatario?.uf || empresaAtiva?.uf || 'PR',
        crtEmitente: it.crtEmitente || extractedInvoice?.emitente?.crt,
      });
    });
    try {
      sessionStorage.setItem('ncm-precificar-itens', JSON.stringify(convertidos));
      if (auditadosSelecionados.length > 0) {
        sessionStorage.setItem('ncm-itens-auditados', JSON.stringify(auditadosSelecionados));
      }
    } catch {
      /* fallback */
    }

    window.dispatchEvent(
      new CustomEvent('navegar-aba', {
        detail: {
          tab: 'precificar',
          itens: convertidos,
          itensAuditados: auditadosSelecionados,
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
      : finalidade.toLowerCase().includes('consumo') || finalidade.toLowerCase().includes('uso')
      ? 'uso_consumo'
      : 'comercializacao';

    const auditadosSelecionados = itensParaEnviar
      .map((it) => auditadosPorMap[it.index])
      .filter((x): x is ItemFiscalAuditado => Boolean(x));

    const convertidos = itensParaEnviar.map((it) => {
      const aud = auditadosPorMap[it.index];
      if (aud) return converterAuditadoParaParametrizacao(aud);
      return converterItemExtracaoParaParametrizacao(it, {
        ufOrigem: extractedInvoice?.emitente?.uf,
        ufDestino: extractedInvoice?.destinatario?.uf || empresaAtiva?.uf || 'PR',
        regimeDestinatario,
        destinacao: destinacaoPorItem[it.index] || destinacaoPorItem[it.cProd] || destinacao,
      });
    });

    try {
      sessionStorage.setItem('ncm-parametrizar-itens', JSON.stringify(convertidos));
      if (auditadosSelecionados.length > 0) {
        sessionStorage.setItem('ncm-itens-auditados', JSON.stringify(auditadosSelecionados));
      }
    } catch {
      /* fallback */
    }

    window.dispatchEvent(
      new CustomEvent('navegar-aba', {
        detail: {
          tab: 'parametrizar',
          itensErp: convertidos,
          itensAuditados: auditadosSelecionados,
          manterNaAbaAtual,
        },
      })
    );
  };

  return (
    <div>
      <div className="st-page-header">
        <div>
          <div className="st-page-title-row">
            <h2 className="st-page-title">Auditoria de Entrada</h2>
            <span className="st-badge-norma">CPC 16</span>
            <span className="st-badge-norma">DIFAL PR</span>
            <span className="st-badge-norma">IA Local · RX 580</span>
          </div>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Upload de NF-e/DANFE ou NFS-e com extração determinística, apuração DIFAL produto a produto e análise pericial.
          </p>
        </div>
        <span className="badge green mono">Soberania Local-First</span>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, textTransform: 'none', fontSize: 16, color: 'var(--ink)' }}>Documento Fiscal de Entrada</h3>
        </div>
        <p className="hint">
          Faça o upload da nota fiscal (.xml da NF-e ou .pdf do DANFE) para auditar documento fiscal com extração determinística imediata e análise pericial por IA.
        </p>

      {/* =========================================================================
       * ETAPA 1: Formulário de Upload e Extração Determinística Imediata
       * ========================================================================= */}
      <AuditoriaUploadPanel
        section="upload"
        empresaAtiva={empresaAtiva}
        perfilAtivo={perfilAtivo}
        notaAuditadaSessao={notaAuditadaSessao}
        resultadoNfse={resultadoNfse}
        setResultadoNfse={setResultadoNfse}
        extractedInvoice={extractedInvoice}
        file={file}
        setFile={setFile}
        cteFobData={cteFobData}
        cteFobError={cteFobError}
        cteFobNomeArquivo={cteFobNomeArquivo}
        handleUploadCteFob={handleUploadCteFob}
        regime={regime}
        setRegime={setRegime}
        finalidade={finalidade}
        setFinalidade={setFinalidade}
        statusExtincaoRtc={statusExtincaoRtc}
        setStatusExtincaoRtc={setStatusExtincaoRtc}
        autoSync={autoSync}
        setAutoSync={setAutoSync}
        isExtracting={isExtracting}
        isOrquestrando={isOrquestrando}
        orquestracaoErro={orquestracaoErro}
        extractionError={extractionError}
        handleFileUpload={handleFileUpload}
        handleExecutarOrquestracaoCompleta={handleExecutarOrquestracaoCompleta}
      />
      {/* =========================================================================
       * ETAPA 2: Apresentação Tabular, Seleção e Disparo da Auditoria
       * ========================================================================= */}
      {extractedInvoice && !auditResult && (
        <div style={{ marginTop: 20 }}>
          {/* Cabeçalho Resumo da NF-e */}
          <div className="card" style={{ background: 'var(--bg-card-subtle)', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
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

          {/* Faixa de KPIs Executivos e Operacionais (Design System Portela) */}
          <div style={{ marginTop: 14 }}>
            <KpiStrip
              items={kpiItems}
              level={nivel}
              density={isGerencial ? 'spacious' : 'compact'}
              showConsolidatedTrafficLightBar
              proportions={{
                regularPct: extractedInvoice.itens.length > 0
                  ? Math.round(((extractedInvoice.itens.length - (extractedInvoice.itens.filter((i) => i.sensivelParaAuditoria).length)) / extractedInvoice.itens.length) * 100)
                  : 100,
                warningPct: extractedInvoice.itens.length > 0
                  ? Math.round(((extractedInvoice.itens.filter((i) => i.sensivelParaAuditoria).length) / extractedInvoice.itens.length) * 100)
                  : 0,
                riskPct: 0,
              }}
            />
          </div>

          {/* =========================================================================
           * PAINEL INTEGRADO DA ORQUESTRAÇÃO FISCAL DAG (SUB-ETAPA 19.5 & 20.4)
           * ========================================================================= */}
          {resultadoOrquestracao && (
            <ProgressiveSection
              id="sec-orquestracao-dag"
              title="Orquestrador Fiscal DAG & Paridade RFB RTC"
              subtitle="Validação de schema XML, motor oficial RFB RTC, créditos em 3 camadas e comparativo 4 regimes"
              currentLevel={nivel}
              minLevel="operacional"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AuditoriaBarraExportacao
                section="dag_body"
                resultadoOrquestracao={resultadoOrquestracao}
                handleEnviarCustoEfetivoParaPrecificacao={handleEnviarCustoEfetivoParaPrecificacao}
              />
            </div>
          </ProgressiveSection>
        )}

          {/* Resumo Analítico de Custo e Tributos da NF-e (Etapa 3 / CPC 16 R1) */}
          <AuditoriaBarraExportacao
            section="cpc16_card"
            extractedInvoice={extractedInvoice}
            consolidadoCPC16={consolidadoCPC16}
            regime={regime}
            setModalCusto={setModalCusto}
            handleEnviarParaPrecificacao={handleEnviarParaPrecificacao}
            handleEnviarParaErp={handleEnviarParaErp}
            selectedIndices={selectedIndices}
            notaAuditadaSessao={notaAuditadaSessao}
            cteFobData={cteFobData}
            handleUploadCteFob={handleUploadCteFob}
          />

          {/* Barra de Contexto da Entrada no Estado do Paraná (RICMS/PR) */}
          <AuditoriaUploadPanel
            section="contexto_pr"
            extractedInvoice={extractedInvoice}
            crtDestinatario={crtDestinatario}
            setCrtDestinatario={setCrtDestinatario}
            destinacaoPadrao={destinacaoPadrao}
            setDestinacaoPadrao={setDestinacaoPadrao}
            incluirIbsCbsBcIcms={incluirIbsCbsBcIcms}
            setIncluirIbsCbsBcIcms={setIncluirIbsCbsBcIcms}
            contribuinteInscritoPR={contribuinteInscritoPR}
            setContribuinteInscritoPR={setContribuinteInscritoPR}
          />

          {/* Card Executivo: Apuração de DIFAL, FECOP & Antecipação na Entrada (RICMS/PR) */}
          <AuditoriaDifalResumoCard
            apuracaoDifalNota={apuracaoDifalNota}
            demonstrativoDifalPR={demonstrativoDifalPR}
            expandirDemonstrativoDifal={expandirDemonstrativoDifal}
            setExpandirDemonstrativoDifal={setExpandirDemonstrativoDifal}
            notasDifalSessao={notasDifalSessao}
            somatorioConsolidadoNotas={somatorioConsolidadoNotas}
            itemDifalSelecionado={itemDifalSelecionado}
            setItemDifalSelecionado={setItemDifalSelecionado}
          />

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
            itensAuditadosMap={auditadosPorMap}
            dataset={datasetSaneamento}
            marco={marcoSaneamento}
            onAplicarSaneamentoNcm={handleAplicarSaneamentoNcm}
            onReverterSaneamentoNcm={handleReverterSaneamentoNcm}
          />

          <AuditoriaBarraExportacao
            section="motor_ia"
            extractedInvoice={extractedInvoice}
            selectedIndices={selectedIndices}
            motor={motor}
            setMotor={setMotor}
            modeloOllama={modeloOllama}
            setModeloOllama={setModeloOllama}
            isAuditing={isAuditing}
            auditElapsedTime={auditElapsedTime}
            auditError={auditError}
            setAuditError={setAuditError}
            handleAuditSubmit={handleAuditSubmit}
          />
        </div>
      )}

      {/* =========================================================================
       * ETAPA FINAL: Apresentação dos Resultados Auditados e ERP
       * ========================================================================= */}
      <AuditoriaBarraExportacao
        section="resultado_e_modal"
        auditResult={auditResult}
        handleReturnToSelection={handleReturnToSelection}
        handleResetToUpload={handleResetToUpload}
        handleDownloadReport={handleDownloadReport}
        pdfLoading={pdfLoading}
        pdfError={pdfError}
        relatorioBloqueadoHardcoded={relatorioBloqueadoHardcoded}
        modalCusto={modalCusto}
        setModalCusto={setModalCusto}
        consolidadoCPC16={consolidadoCPC16}
        regime={regime}
        finalidade={finalidade}
      />

      {/* Fundamentação Normativa Consolidada da Auditoria de Entrada (Marco 1) */}
      <div style={{ marginTop: 20 }}>
        <LegalCitationBlock
          citations={citacoesNormativasAuditoria}
          currentLevel={nivel}
          title="Fundamentação Normativa — Auditoria de Entrada (RICMS/PR, NPF 052/2018, SEFA/PR 48/2026 & LC 214/2025)"
          defaultCollapsed={!isSenior}
        />
      </div>

      {/* Drawer Lateral de Detalhe Pericial do DIFAL por Produto (Marco 2) */}

      {/* ---------------- STICKY ACTION BAR PERSISTENTE (WCAG AA) ---------------- */}
      {extractedInvoice && (
        <StickyActionBar
          visible={Boolean(extractedInvoice)}
          screenState={resultadoOrquestracao || auditResult ? 'audited' : 'staged'}
          summary={{
            itemCount: extractedInvoice.itens?.length || 0,
            selectedCount: selectedIndices.size,
            totalValueBrl: extractedInvoice.resumoFinanceiro?.vNF || (extractedInvoice as any).totais?.vNF || 0,
            riskCount: extractedInvoice.itens?.filter((i) => selectedIndices.has(i.index) && i.sensivelParaAuditoria).length || 0,
          }}
          primaryAction={
            resultadoOrquestracao || auditResult
              ? {
                  label: 'Exportar Laudo Pericial (HTML)',
                  onClick: () => handleDownloadReport('html'),
                  loading: pdfLoading,
                  loadingText: 'Gerando Laudo...',
                }
              : {
                  label: 'Executar Orquestração Completa',
                  onClick: handleExecutarOrquestracaoCompleta,
                  loading: isOrquestrando,
                  loadingText: 'Orquestrando DAG...',
                  disabled: !file,
                }
          }
          secondaryActions={
            resultadoOrquestracao || auditResult
              ? [
                  {
                    id: 'laudo-txt',
                    label: 'Laudo TXT',
                    onClick: () => handleDownloadReport('txt'),
                    variant: 'outline',
                  },
                  {
                    id: 'enviar-precificacao',
                    label: 'Enviar p/ Precificação',
                    onClick: handleEnviarCustoEfetivoParaPrecificacao,
                    variant: 'outline',
                  },
                  {
                    id: 'novo-arquivo',
                    label: 'Novo Arquivo',
                    onClick: handleResetToUpload,
                    variant: 'ghost',
                  },
                ]
              : [
                  {
                    id: 'auditar-ia-selecionados',
                    label: 'Auditar Selecionados (IA)',
                    onClick: handleAuditSubmit,
                    disabled: isAuditing || selectedIndices.size === 0,
                    variant: 'outline',
                  },
                  {
                    id: 'novo-arquivo-staged',
                    label: 'Novo Arquivo',
                    onClick: handleResetToUpload,
                    variant: 'ghost',
                  },
                ]
          }
          statusMessage={
            isOrquestrando
              ? 'Executando Orquestrador DAG RFB...'
              : isAuditing
              ? 'Executando auditoria pericial por IA...'
              : undefined
          }
        />
      )}
      </div>
    </div>
  );
}
