'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  validarCnpj,
  sanitizarCnpj,
  formatarCnpj,
  Empresa,
  PerfilTributario,
  RegimeTributario,
} from '@/lib/fiscal/perfil-tributario';

export const CHAVE_STORAGE_EMPRESA_ATIVA = 'portela_empresa_ativa_v1';

export default function CadastroEmpresas() {
  // ==========================================================================
  // 1. DECLARAÇÃO DE TODOS OS HOOKS NO TOPO ABSOLUTO (DoD hookcheck.mjs)
  // ==========================================================================
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaAtivaId, setEmpresaAtivaId] = useState<string>('');
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  // Status de Infraestrutura
  const [dbStatus, setDbStatus] = useState<{ conectado: boolean; modo: string; latencia?: number }>({
    conectado: false,
    modo: 'verificando...',
  });
  const [sidecarsStatus, setSidecarsStatus] = useState<{
    simples: boolean;
    regular: boolean;
    danfse: boolean;
  }>({
    simples: false,
    regular: false,
    danfse: false,
  });

  // Formulário de Nova Empresa
  const [formCnpj, setFormCnpj] = useState<string>('');
  const [formRazaoSocial, setFormRazaoSocial] = useState<string>('');
  const [formNomeFantasia, setFormNomeFantasia] = useState<string>('');
  const [formInscricaoEstadual, setFormInscricaoEstadual] = useState<string>('');
  const [formUf, setFormUf] = useState<string>('PR');
  const [formMunicipioIbge, setFormMunicipioIbge] = useState<string>('4106902'); // Curitiba default

  // Formulário de Perfil Tributário
  const [perfilRegime, setPerfilRegime] = useState<RegimeTributario>('SIMPLES_NACIONAL');
  const [perfilVigenciaInicio, setPerfilVigenciaInicio] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [perfilVigenciaFim, setPerfilVigenciaFim] = useState<string>('');
  const [perfilEncerrarAnterior, setPerfilEncerrarAnterior] = useState<boolean>(true);
  const [perfilSimplesHibrido2027, setPerfilSimplesHibrido2027] = useState<boolean>(false);
  const [perfilDiferimentoArt28, setPerfilDiferimentoArt28] = useState<boolean>(true);
  const [perfilRotSt, setPerfilRotSt] = useState<boolean>(false);
  const [perfilRegimeEspecialSefaPr, setPerfilRegimeEspecialSefaPr] = useState<string>('');
  const [perfilSplitPayment, setPerfilSplitPayment] = useState<boolean>(false);
  const [perfilIcmsEfetivo, setPerfilIcmsEfetivo] = useState<string>('3.5');
  const [perfilPisEfetivo, setPerfilPisEfetivo] = useState<string>('0.38');
  const [perfilCofinsEfetivo, setPerfilCofinsEfetivo] = useState<string>('1.60');
  const [perfilFaixaSimples, setPerfilFaixaSimples] = useState<number>(3);
  const [perfilFatorR, setPerfilFatorR] = useState<string>('0.28');

  // Modal / Toggle de Adicionar Perfil à empresa existente
  const [modalNovoPerfil, setModalNovoPerfil] = useState<boolean>(false);

  // Callbacks
  const carregarEmpresas = useCallback(async () => {
    try {
      setCarregando(true);
      const res = await fetch('/api/empresas');
      const data = await res.json();
      if (data.sucesso && Array.isArray(data.empresas)) {
        setEmpresas(data.empresas);

        // Se houver empresa salva no storage, seleciona ela; senão a primeira
        const salvaJson = typeof window !== 'undefined' ? localStorage.getItem(CHAVE_STORAGE_EMPRESA_ATIVA) : null;
        let idParaAtivar = '';
        if (salvaJson) {
          try {
            const parsed = JSON.parse(salvaJson);
            if (data.empresas.some((e: Empresa) => e.id === parsed.id)) {
              idParaAtivar = parsed.id;
            }
          } catch { /* parse error */ }
        }

        if (!idParaAtivar && data.empresas.length > 0) {
          idParaAtivar = data.empresas[0].id;
        }

        if (idParaAtivar) {
          setEmpresaAtivaId(idParaAtivar);
          const selecionada = data.empresas.find((e: Empresa) => e.id === idParaAtivar);
          if (selecionada && typeof window !== 'undefined') {
            localStorage.setItem(CHAVE_STORAGE_EMPRESA_ATIVA, JSON.stringify(selecionada));
            window.dispatchEvent(new CustomEvent('empresa_ativa_changed', { detail: selecionada }));
          }
        }
      }
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível carregar a lista de empresas.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  const checarStatusInfra = useCallback(async () => {
    try {
      const resRtc = await fetch('/api/rtc/status');
      const rtcData = await resRtc.json();
      if (rtcData.circuitBreakers) {
        setSidecarsStatus({
          simples: rtcData.circuitBreakers['rtc-simples']?.online ?? false,
          regular: rtcData.circuitBreakers['rtc-regime-regular']?.online ?? false,
          danfse: rtcData.circuitBreakers['rtc-danfse']?.online ?? false,
        });
      }
    } catch {
      setSidecarsStatus({ simples: false, regular: false, danfse: false });
    }

    // Checar conexão DB
    try {
      const resDb = await fetch('/api/empresas');
      if (resDb.ok) {
        setDbStatus({
          conectado: true,
          modo: 'PostgreSQL 17 / In-Memory Dual-Mode Ativo',
        });
      }
    } catch {
      setDbStatus({ conectado: false, modo: 'Offline' });
    }
  }, []);

  useEffect(() => {
    carregarEmpresas();
    checarStatusInfra();
  }, [carregarEmpresas, checarStatusInfra]);

  const empresaAtiva = useMemo(() => {
    return empresas.find((e) => e.id === empresaAtivaId) || null;
  }, [empresas, empresaAtivaId]);

  const cnpjValido = useMemo(() => {
    if (!formCnpj) return true; // neutro
    return validarCnpj(formCnpj);
  }, [formCnpj]);

  const selecionarEmpresa = useCallback(
    (empresa: Empresa) => {
      setEmpresaAtivaId(empresa.id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CHAVE_STORAGE_EMPRESA_ATIVA, JSON.stringify(empresa));
        window.dispatchEvent(new CustomEvent('empresa_ativa_changed', { detail: empresa }));
      }
    },
    []
  );

  const handleSalvarNovaEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarCnpj(formCnpj)) {
      setMensagem({ tipo: 'erro', texto: 'CNPJ inválido. Verifique os dígitos informados.' });
      return;
    }
    if (!formRazaoSocial.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Informe a Razão Social da empresa.' });
      return;
    }

    try {
      setSalvando(true);
      setMensagem(null);

      const payload = {
        cnpj: sanitizarCnpj(formCnpj),
        razaoSocial: formRazaoSocial.trim(),
        nomeFantasia: formNomeFantasia.trim() || undefined,
        inscricaoEstadual: formInscricaoEstadual.trim() || undefined,
        uf: formUf.toUpperCase(),
        municipioIbge: formMunicipioIbge.trim() || undefined,
        perfilInicial: {
          regimeTributario: perfilRegime,
          vigenciaInicio: perfilVigenciaInicio,
          vigenciaFim: perfilVigenciaFim.trim() || undefined,
          simplesOptanteHibrido2027: perfilSimplesHibrido2027,
          aliquotasEfetivas: {
            icmsEfetivo: parseFloat(perfilIcmsEfetivo) || 0,
            pisEfetivo: parseFloat(perfilPisEfetivo) || 0,
            cofinsEfetivo: parseFloat(perfilCofinsEfetivo) || 0,
            faixaSimples: perfilFaixaSimples,
            fatorR: parseFloat(perfilFatorR) || 0,
          },
          beneficiosParana: {
            diferimentoParcialArt28: perfilDiferimentoArt28,
            optanteRotSt: perfilRotSt,
            regimeEspecialSefaPr: perfilRegimeEspecialSefaPr.trim() || undefined,
            reducoesBcAtivas: [],
          },
          reformaTributaria: {
            optanteSplitPayment2026: perfilSplitPayment,
            creditoPresumidoIbsCbs: false,
          },
        },
      };

      const res = await fetch('/api/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.sucesso) {
        setMensagem({ tipo: 'erro', texto: data.mensagem || 'Falha ao salvar empresa.' });
        return;
      }

      setMensagem({ tipo: 'sucesso', texto: `Empresa "${data.empresa.razaoSocial}" cadastrada com sucesso!` });
      // Limpar form
      setFormCnpj('');
      setFormRazaoSocial('');
      setFormNomeFantasia('');
      setFormInscricaoEstadual('');

      await carregarEmpresas();
      if (data.empresa) {
        selecionarEmpresa(data.empresa);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMensagem({ tipo: 'erro', texto: `Erro de comunicação: ${msg}` });
    } finally {
      setSalvando(false);
    }
  };

  const handleAdicionarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaAtivaId) return;

    try {
      setSalvando(true);
      setMensagem(null);

      const payload = {
        regimeTributario: perfilRegime,
        vigenciaInicio: perfilVigenciaInicio,
        vigenciaFim: perfilVigenciaFim.trim() || undefined,
        encerrarAnteriorAutomaticamente: perfilEncerrarAnterior,
        simplesOptanteHibrido2027: perfilSimplesHibrido2027,
        aliquotasEfetivas: {
          icmsEfetivo: parseFloat(perfilIcmsEfetivo) || 0,
          pisEfetivo: parseFloat(perfilPisEfetivo) || 0,
          cofinsEfetivo: parseFloat(perfilCofinsEfetivo) || 0,
          faixaSimples: perfilFaixaSimples,
          fatorR: parseFloat(perfilFatorR) || 0,
        },
        beneficiosParana: {
          diferimentoParcialArt28: perfilDiferimentoArt28,
          optanteRotSt: perfilRotSt,
          regimeEspecialSefaPr: perfilRegimeEspecialSefaPr.trim() || undefined,
          reducoesBcAtivas: [],
        },
        reformaTributaria: {
          optanteSplitPayment2026: perfilSplitPayment,
          creditoPresumidoIbsCbs: false,
        },
      };

      const res = await fetch(`/api/empresas/${empresaAtivaId}/perfis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.sucesso) {
        setMensagem({ tipo: 'erro', texto: data.mensagem || 'Falha ao adicionar novo perfil.' });
        return;
      }

      setMensagem({ tipo: 'sucesso', texto: 'Novo perfil tributário adicionado com sucesso!' });
      setModalNovoPerfil(false);
      await carregarEmpresas();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMensagem({ tipo: 'erro', texto: `Erro ao adicionar perfil: ${msg}` });
    } finally {
      setSalvando(false);
    }
  };

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="cadastro-empresas-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* BARRA DE STATUS DA INFRAESTRUTURA & MULTI-TENANT */}
      <section
        className="card-infra-status"
        aria-label="Status dos Serviços e Persistência"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏢</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Portela Contabilidade · Gestão Multi-Tenant</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Armazenamento relacional PostgreSQL 17 com fallback in-memory automático
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              background: dbStatus.conectado ? '#1e3a1e' : '#3a2a1e',
              color: dbStatus.conectado ? '#6ee7b7' : '#fcd34d',
              border: `1px solid ${dbStatus.conectado ? '#059669' : '#d97706'}`,
            }}
          >
            DB: {dbStatus.modo}
          </span>

          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              background: sidecarsStatus.simples ? '#1e3a1e' : '#3a1e1e',
              color: sidecarsStatus.simples ? '#6ee7b7' : '#fca5a5',
              border: `1px solid ${sidecarsStatus.simples ? '#059669' : '#dc2626'}`,
            }}
          >
            Sidecar Simples: {sidecarsStatus.simples ? 'Online (8081)' : 'Offline/Fallback'}
          </span>

          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              background: sidecarsStatus.regular ? '#1e3a1e' : '#3a1e1e',
              color: sidecarsStatus.regular ? '#6ee7b7' : '#fca5a5',
              border: `1px solid ${sidecarsStatus.regular ? '#059669' : '#dc2626'}`,
            }}
          >
            Sidecar Regular: {sidecarsStatus.regular ? 'Online (8082)' : 'Offline/Fallback'}
          </span>
        </div>
      </section>

      {/* FEEDBACK DE MENSAGEM */}
      {mensagem && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            fontSize: 13,
            background: mensagem.tipo === 'sucesso' ? '#064e3b' : '#7f1d1d',
            color: mensagem.tipo === 'sucesso' ? '#a7f3d0' : '#fecaca',
            border: `1px solid ${mensagem.tipo === 'sucesso' ? '#059669' : '#dc2626'}`,
          }}
        >
          {mensagem.texto}
        </div>
      )}

      {/* PAINEL PRINCIPAL: SELETOR DE CLIENTE ATIVO E VISUALIZAÇÃO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(450px, 1.6fr)', gap: 20 }}>
        {/* COLUNA ESQUERDA: LISTA DE EMPRESAS & CADASTRO */}
        <section
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Empresas / Clientes ({empresas.length})</h3>
            <button
              type="button"
              onClick={carregarEmpresas}
              disabled={carregando}
              style={{
                background: 'transparent',
                border: '1px solid var(--line)',
                color: 'var(--text)',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {carregando ? 'Atualizando...' : '🔄 Atualizar'}
            </button>
          </div>

          {/* LISTA DE EMPRESAS CADASTRADAS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {empresas.length === 0 && !carregando && (
              <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                Nenhuma empresa cadastrada no momento. Use o formulário abaixo para adicionar a primeira.
              </div>
            )}

            {empresas.map((emp) => {
              const ativa = emp.id === empresaAtivaId;
              return (
                <div
                  key={emp.id}
                  onClick={() => selecionarEmpresa(emp)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: ativa ? 'var(--highlight, rgba(59, 130, 246, 0.15))' : 'var(--bg)',
                    border: `1px solid ${ativa ? '#3b82f6' : 'var(--line)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: ativa ? '#93c5fd' : 'var(--text)' }}>
                      {emp.razaoSocial}
                    </span>
                    {ativa && (
                      <span
                        style={{
                          fontSize: 10,
                          background: '#3b82f6',
                          color: '#fff',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontWeight: 700,
                        }}
                      >
                        ATIVA
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 10 }}>
                    <span>CNPJ: {formatarCnpj(emp.cnpj)}</span>
                    <span>UF: {emp.uf}</span>
                    <span>Perfis: {emp.perfis?.length || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <hr style={{ borderColor: 'var(--line)', margin: '4px 0' }} />

          {/* FORMULÁRIO RÁPIDO DE NOVA EMPRESA */}
          <form onSubmit={handleSalvarNovaEmpresa} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>+ Cadastrar Nova Empresa</h4>

            <div>
              <label htmlFor="formCnpj" style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                CNPJ (14 dígitos) *
              </label>
              <input
                id="formCnpj"
                type="text"
                value={formCnpj}
                onChange={(e) => setFormCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                required
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 4,
                  background: 'var(--bg)',
                  border: `1px solid ${!cnpjValido ? '#dc2626' : 'var(--line)'}`,
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              {!cnpjValido && formCnpj.length > 0 && (
                <span style={{ fontSize: 11, color: '#f87171' }}>Dígitos verificadores do CNPJ inválidos</span>
              )}
            </div>

            <div>
              <label htmlFor="formRazaoSocial" style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                Razão Social *
              </label>
              <input
                id="formRazaoSocial"
                type="text"
                value={formRazaoSocial}
                onChange={(e) => setFormRazaoSocial(e.target.value)}
                placeholder="Ex: Portela & Associados Indústria e Comércio LTDA"
                required
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 4,
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label htmlFor="formNomeFantasia" style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                  Nome Fantasia
                </label>
                <input
                  id="formNomeFantasia"
                  type="text"
                  value={formNomeFantasia}
                  onChange={(e) => setFormNomeFantasia(e.target.value)}
                  placeholder="Nome Fantasia"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label htmlFor="formInscricaoEstadual" style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                  Inscrição Estadual (IE)
                </label>
                <input
                  id="formInscricaoEstadual"
                  type="text"
                  value={formInscricaoEstadual}
                  onChange={(e) => setFormInscricaoEstadual(e.target.value)}
                  placeholder="Ex: 90123456-78"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
              <div>
                <label htmlFor="formUf" style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                  UF
                </label>
                <input
                  id="formUf"
                  type="text"
                  value={formUf}
                  onChange={(e) => setFormUf(e.target.value.toUpperCase())}
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label htmlFor="formMunicipioIbge" style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                  Código IBGE Município
                </label>
                <input
                  id="formMunicipioIbge"
                  type="text"
                  value={formMunicipioIbge}
                  onChange={(e) => setFormMunicipioIbge(e.target.value)}
                  placeholder="4106902 (Curitiba)"
                  maxLength={7}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando || (formCnpj.length > 0 && !cnpjValido)}
              style={{
                marginTop: 6,
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {salvando ? 'Salvando...' : 'Salvar Empresa e Perfil'}
            </button>
          </form>
        </section>

        {/* COLUNA DIREITA: DETALHES DA EMPRESA ATIVA & PERFIS BITEMPORAIS */}
        <section
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {empresaAtiva ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{empresaAtiva.razaoSocial}</h3>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    CNPJ: <b>{formatarCnpj(empresaAtiva.cnpj)}</b> · UF: <b>{empresaAtiva.uf}</b> · IE:{' '}
                    <b>{empresaAtiva.inscricaoEstadual || 'Isento / Não inf.'}</b>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalNovoPerfil(!modalNovoPerfil)}
                  style={{
                    background: modalNovoPerfil ? 'var(--line)' : '#059669',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {modalNovoPerfil ? 'Cancelar Perfil' : '+ Nova Vigência / Perfil'}
                </button>
              </div>

              {/* FORMULÁRIO DE NOVO PERFIL / ATUALIZAÇÃO BITEMPORAL */}
              {modalNovoPerfil && (
                <form
                  onSubmit={handleAdicionarPerfil}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid #3b82f6',
                    borderRadius: 6,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: 14, color: '#93c5fd', fontWeight: 600 }}>
                    Cadastrar Nova Vigência Tributária (Bitemporal)
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <label htmlFor="perfilRegime" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        Regime Tributário *
                      </label>
                      <select
                        id="perfilRegime"
                        value={perfilRegime}
                        onChange={(e) => setPerfilRegime(e.target.value as RegimeTributario)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      >
                        <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                        <option value="SIMPLES_EXCESSO_SUBLIMITE">Simples (Excesso Sublimite)</option>
                        <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                        <option value="LUCRO_REAL">Lucro Real</option>
                        <option value="MEI">Microempreendedor Individual (MEI)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="perfilVigenciaInicio" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        Início da Vigência *
                      </label>
                      <input
                        id="perfilVigenciaInicio"
                        type="date"
                        value={perfilVigenciaInicio}
                        onChange={(e) => setPerfilVigenciaInicio(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      />
                    </div>

                    <div>
                      <label htmlFor="perfilVigenciaFim" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        Fim (ou indeterminado)
                      </label>
                      <input
                        id="perfilVigenciaFim"
                        type="date"
                        value={perfilVigenciaFim}
                        onChange={(e) => setPerfilVigenciaFim(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    <div>
                      <label htmlFor="perfilIcmsEfetivo" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        ICMS Efetivo (%)
                      </label>
                      <input
                        id="perfilIcmsEfetivo"
                        type="number"
                        step="0.01"
                        value={perfilIcmsEfetivo}
                        onChange={(e) => setPerfilIcmsEfetivo(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      />
                    </div>

                    <div>
                      <label htmlFor="perfilPisEfetivo" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        PIS Efetivo (%)
                      </label>
                      <input
                        id="perfilPisEfetivo"
                        type="number"
                        step="0.01"
                        value={perfilPisEfetivo}
                        onChange={(e) => setPerfilPisEfetivo(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      />
                    </div>

                    <div>
                      <label htmlFor="perfilCofinsEfetivo" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        COFINS Efetivo (%)
                      </label>
                      <input
                        id="perfilCofinsEfetivo"
                        type="number"
                        step="0.01"
                        value={perfilCofinsEfetivo}
                        onChange={(e) => setPerfilCofinsEfetivo(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      />
                    </div>

                    <div>
                      <label htmlFor="perfilFaixaSimples" style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
                        Faixa Simples (1-6)
                      </label>
                      <input
                        id="perfilFaixaSimples"
                        type="number"
                        min={1}
                        max={6}
                        value={perfilFaixaSimples}
                        onChange={(e) => setPerfilFaixaSimples(parseInt(e.target.value, 10) || 1)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--panel)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </div>

                  {/* TOGGLES ESPECÍFICOS: PARANÁ E REFORMA TRIBUTÁRIA */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={perfilSimplesHibrido2027}
                        onChange={(e) => setPerfilSimplesHibrido2027(e.target.checked)}
                      />
                      <span>Simples Híbrido 2027 (IBS/CBS fora do DAS)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={perfilDiferimentoArt28}
                        onChange={(e) => setPerfilDiferimentoArt28(e.target.checked)}
                      />
                      <span>Diferimento Parcial Art. 28 Anexo VIII PR</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={perfilRotSt}
                        onChange={(e) => setPerfilRotSt(e.target.checked)}
                      />
                      <span>Optante ROT-ST Paraná (Dispensa Ajuste ST)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={perfilSplitPayment}
                        onChange={(e) => setPerfilSplitPayment(e.target.checked)}
                      />
                      <span>Split Payment Ativo (2026+)</span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      id="encerrarAnterior"
                      type="checkbox"
                      checked={perfilEncerrarAnterior}
                      onChange={(e) => setPerfilEncerrarAnterior(e.target.checked)}
                    />
                    <label htmlFor="encerrarAnterior" style={{ fontSize: 12, color: 'var(--text)' }}>
                      Encerrar vigência do perfil anterior automaticamente no dia anterior ao novo início
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={salvando}
                    style={{
                      background: '#059669',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {salvando ? 'Registrando...' : 'Gravar Perfil Bitemporal'}
                  </button>
                </form>
              )}

              {/* TIMELINE DE PERFIS VIGENTES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  Linha do Tempo de Perfis Tributários ({empresaAtiva.perfis?.length || 0})
                </h4>

                {(!empresaAtiva.perfis || empresaAtiva.perfis.length === 0) && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: 10 }}>
                    Nenhum perfil cadastrado para esta empresa. Adicione um perfil acima.
                  </div>
                )}

                {empresaAtiva.perfis?.map((p) => {
                  const vigenteHoje = p.vigenciaInicio <= hoje && (!p.vigenciaFim || p.vigenciaFim >= hoje);
                  const futuro = p.vigenciaInicio > hoje;
                  const expirado = Boolean(p.vigenciaFim && p.vigenciaFim < hoje);

                  let statusBadge = { bg: '#1e3a1e', cor: '#6ee7b7', border: '#059669', texto: 'VIGENTE HOJE' };
                  if (futuro) {
                    statusBadge = { bg: '#1e293b', cor: '#93c5fd', border: '#3b82f6', texto: 'FUTURO' };
                  } else if (expirado) {
                    statusBadge = { bg: '#27272a', cor: '#a1a1aa', border: '#52525b', texto: 'ENCERRADO' };
                  }

                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 6,
                        background: 'var(--bg)',
                        border: `1px solid ${vigenteHoje ? '#059669' : 'var(--line)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{p.regimeTributario}</span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: statusBadge.bg,
                              color: statusBadge.cor,
                              border: `1px solid ${statusBadge.border}`,
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {statusBadge.texto}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' }}>
                          Vigência: {p.vigenciaInicio} até {p.vigenciaFim || 'indeterminada'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
                        <span>ICMS Efetivo: <b>{p.aliquotasEfetivas?.icmsEfetivo ?? 'N/A'}%</b></span>
                        <span>PIS Efetivo: <b>{p.aliquotasEfetivas?.pisEfetivo ?? 'N/A'}%</b></span>
                        <span>COFINS Efetivo: <b>{p.aliquotasEfetivas?.cofinsEfetivo ?? 'N/A'}%</b></span>
                        <span>Faixa: <b>{p.aliquotasEfetivas?.faixaSimples ?? 'N/A'}</b></span>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        {p.simplesOptanteHibrido2027 && (
                          <span style={{ fontSize: 10, background: '#1e293b', color: '#93c5fd', padding: '1px 6px', borderRadius: 3 }}>
                            ⚡ Simples Híbrido 2027
                          </span>
                        )}
                        {p.beneficiosParana?.diferimentoParcialArt28 && (
                          <span style={{ fontSize: 10, background: '#142f1f', color: '#86efac', padding: '1px 6px', borderRadius: 3 }}>
                            ✓ Art. 28 RICMS/PR
                          </span>
                        )}
                        {p.beneficiosParana?.optanteRotSt && (
                          <span style={{ fontSize: 10, background: '#312e81', color: '#c7d2fe', padding: '1px 6px', borderRadius: 3 }}>
                            ✓ ROT-ST Ativo
                          </span>
                        )}
                        {p.reformaTributaria?.optanteSplitPayment2026 && (
                          <span style={{ fontSize: 10, background: '#451a03', color: '#fcd34d', padding: '1px 6px', borderRadius: 3 }}>
                            ✓ Split Payment
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>
              👈 Selecione uma empresa na lista ao lado para inspecionar seus perfis ou cadastrar um novo cliente.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
