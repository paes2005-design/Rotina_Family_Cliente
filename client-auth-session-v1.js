// Emergency compatibility rollback — 2026-08-26
// The secure participant-session bridge is temporarily disabled so the
// stable Cliente authentication implemented in index-CLIENTE-v6.html remains authoritative.
// Do not override conectarCliente/rotinaRestaurarSessaoParticipante here.
const VERSION = 4;

try {
  window.__rotinaParticipantAuthVersion = VERSION;
  window.__rotinaParticipantAuthBridgeDisabled = true;
  window.rotinaLog?.('auth.participante_bridge_desativada_emergencia', {
    authVersion: VERSION,
    modo: 'legacy-stable'
  }, 'warning');
  window.dispatchEvent(new CustomEvent('rotina-participant-auth-bridge-disabled', {
    detail: { version: VERSION, mode: 'legacy-stable' }
  }));
} catch (_) {}
