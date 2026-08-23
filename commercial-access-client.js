import './client-dog-only.js?v=1';
import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const COMMERCIAL_EXEMPT_GROUPS = new Set(['CLI-4071']);
let stopConfig = null;
let blockedNotice = false;

function normalizeGroupId(value = '') {
  return String(value || '').trim().toUpperCase();
}

function isCommercialExemptGroup(groupId = '') {
  return COMMERCIAL_EXEMPT_GROUPS.has(normalizeGroupId(groupId));
}

function db() {
  if (!getApps().length) throw new Error('Firebase ainda não foi iniciado.');
  return getFirestore(getApp());
}

function commercialState(config = {}, now = Date.now()) {
  if (config.grupoBloqueado === true) return 'bloqueado';
  if (config.grupoConfirmado === true) return 'confirmado';
  if (Number(config.trialVersao || 0) === 2 && config.trialAtivo === true) {
    const expires = Date.parse(String(config.trialFimEm || ''));
    if (Number.isFinite(expires) && now >= expires) return 'teste-expirado';
    return 'teste';
  }
  return 'liberado-legado';
}

function blockedState(state) {
  return state === 'bloqueado' || state === 'teste-expirado';
}

function blockMessage(state) {
  if (state === 'teste-expirado') return 'O período de teste de 15 dias deste grupo terminou. O administrador principal precisa da liberação do ADM Master.';
  return 'Este grupo familiar está temporariamente desativado.';
}

async function groupState(groupId) {
  const group = normalizeGroupId(groupId);
  if (isCommercialExemptGroup(group)) return 'isento';
  const snap = await getDoc(doc(db(), 'configGrupos', group));
  return commercialState(snap.exists() ? snap.data() : {});
}

function logoutWith(text) {
  if (blockedNotice) return;
  blockedNotice = true;
  stopConfig?.();
  stopConfig = null;
  try { window.sairCliente?.(); } catch (_) {}
  alert(text);
  setTimeout(() => { blockedNotice = false; }, 700);
}

async function enforce(groupId) {
  const group = normalizeGroupId(groupId);
  if (!group || isCommercialExemptGroup(group)) return true;
  try {
    const state = await groupState(group);
    if (blockedState(state)) {
      logoutWith(blockMessage(state));
      return false;
    }
  } catch (error) {
    // Em 429/rede, preserva a sessão válida; o comercial não deve gerar indisponibilidade técnica.
    console.warn('Estado comercial da família indisponível; acesso preservado.', error);
  }
  return true;
}

function watchGroup(groupId) {
  stopConfig?.();
  stopConfig = null;
  const group = normalizeGroupId(groupId);
  if (!group || isCommercialExemptGroup(group)) return;
  stopConfig = onSnapshot(
    doc(db(), 'configGrupos', group),
    snap => {
      const state = commercialState(snap.exists() ? snap.data() : {});
      if (blockedState(state)) logoutWith(blockMessage(state));
    },
    error => console.warn('Listener comercial do grupo indisponível; sessão preservada.', error)
  );
}

function installLoginGuard() {
  const original = window.conectarCliente;
  if (typeof original !== 'function' || original.__commercialGroupGuard) return false;
  const wrapped = async (...args) => {
    const group = normalizeGroupId(document.getElementById('authCodigo')?.value || '');
    if (group && !isCommercialExemptGroup(group)) {
      try {
        const state = await groupState(group);
        if (blockedState(state)) {
          alert(blockMessage(state));
          return;
        }
      } catch (error) {
        console.warn('Validação comercial pré-login indisponível; login normal continuará.', error);
      }
    }
    return original(...args);
  };
  wrapped.__commercialGroupGuard = true;
  window.conectarCliente = wrapped;
  return true;
}

window.addEventListener('rotina-client-session-ready', async event => {
  const group = normalizeGroupId(event.detail?.grupo || '');
  if (await enforce(group)) watchGroup(group);
});

function installHooks() {
  installLoginGuard();
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', installHooks, { once: true });
else installHooks();
setTimeout(installHooks, 300);
setTimeout(installHooks, 1000);
