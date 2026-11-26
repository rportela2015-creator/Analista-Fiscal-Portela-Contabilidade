/**
 * Boot check de governança RFB / Reforma Tributária (Next.js Instrumentation).
 * Executa apenas no runtime Node.js do servidor sem bloquear o boot offline.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { getRtcMode } = await import('./lib/integracoes/rfb-health');
    const status = await getRtcMode();

    if (status.mode !== 'live' && status.stale) {
      console.warn(
        JSON.stringify({
          nivel: 'WARN',
          evento: 'RTC_SNAPSHOT_STALE_OU_HARDCODED',
          mode: status.mode,
          stale: status.stale,
          ageDays: status.ageDays,
          updatedAt: status.updatedAt,
          snapshotSha256: status.snapshotSha256,
          bloqueioOperacional: status.bloqueioOperacional,
          acaoRecomendada: 'Execute `npm run rfb:refresh` para atualizar e validar o snapshot oficial em public/data/.',
        })
      );
    }
  } catch (err: unknown) {
    console.warn('[instrumentation] Falha ao verificar status inicial do snapshot RFB:', err);
  }
}
