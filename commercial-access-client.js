import './client-dog-only.js?v=1';
import './client-session-integrity.js?v=2';
import './client-tolerance-rule-ui.js?v=1';
import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const API_ROOT = 'https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev';
const COMMERCIAL_EXEMPT_GROUPS = new Set(['CLI-4071']);
let blockedNotice = false;
let currentGroup = '';
let pollTimer = null;
let checking = null;

function normalizeGroupId(value = '') {
  return String(value || '').trim().toUpperCase();
}

function isCommercialExemptGroup(groupId = '') {
  return COMMERCIAL_EXEMPT_GROUPS.has(normalizeGroupId(groupId));
}

function auth() {
  if (!getApps().length) throw new Error('Firebase ainda não foi iniciado.');
  return getAuth(getApp());
}

function blockMessage(reason = '') {
  if (reason === 'teste-expirado') return 'O período de teste deste grupo terminou. Peça ao administrador da família para verificar a liberação do acesso.';
  return 'O acesso deste grupo familiar está temporariamente indisponível.';
}

function logoutWith(text) {
  if (blockedNotice) return;
  blockedNotice = true;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  try { window.sairCliente?.(); } catch (_) {}
  alert(text);
  setTimeout(() => { blockedNotice = false; }, 700);
}

async function accessStatus() {
  const user = auth().currentUser;
  if (!user) return { acessoPermitido: true, sessaoAusente: true };
  const token = await user.getIdToken();
  const response = await fetch(`${API_ROOT}/commercial/access-status`, {
    method: 'GET',
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Falha HTTP ${response.status}`);
  return body;
}

async function enforce() {
  if (!currentGroup || isCommercialExemptGroup(currentGroup)) return true;
  if (checking) return checking;
  checking = (async () => {
    try {
      const result = await accessStatus();
      if (result.acessoPermitido === false) {
        logoutWith(blockMessage(result.motivoBloqueio));
        return false;
      }
      return true;
    } catch (error) {
      // Uma falha de rede não derruba uma sessão válida. O bloqueio continua sendo
      // aplicado pelo backend no próximo login e assim que a verificação voltar.
      console.warn('Verificação de acesso do grupo indisponível; sessão preservada.', error);
      return true;
    } finally {
      checking = null;
    }
  })();
  return checking;
}

function startWatch(groupId) {
  currentGroup = normalizeGroupId(groupId);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (!currentGroup || isCommercialExemptGroup(currentGroup)) return;
  enforce();
  pollTimer = setInterval(enforce, 60_000);
}

window.addEventListener('rotina-client-session-ready', event => {
  startWatch(event.detail?.grupo || '');
});
window.addEventListener('focus', enforce);
window.addEventListener('online', enforce);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') enforce(); });

window.__rotinaCommercialAccessVersion = 3;
