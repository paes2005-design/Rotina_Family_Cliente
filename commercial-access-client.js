import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let stopConfig = null;
let blockedNotice = false;

function db() {
  if (!getApps().length) throw new Error('Firebase ainda não foi iniciado.');
  return getFirestore(getApp());
}

function isGroupBlocked(config = {}) {
  return config.grupoBloqueado === true;
}

function blockMessage() {
  return 'Este grupo familiar está temporariamente desativado.';
}

async function groupAllowed(groupId) {
  const snap = await getDoc(doc(db(), 'configGrupos', groupId));
  return !isGroupBlocked(snap.exists() ? snap.data() : {});
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
  const group = String(groupId || '').trim();
  if (!group) return true;
  try {
    if (!(await groupAllowed(group))) {
      logoutWith(blockMessage());
      return false;
    }
  } catch (error) {
    // Comercial não é mecanismo de segurança. Em 429/rede, preserva a sessão válida.
    console.warn('Estado comercial da família indisponível; acesso preservado.', error);
  }
  return true;
}

function watchGroup(groupId) {
  stopConfig?.();
  stopConfig = null;
  const group = String(groupId || '').trim();
  if (!group) return;
  stopConfig = onSnapshot(
    doc(db(), 'configGrupos', group),
    snap => {
      if (isGroupBlocked(snap.exists() ? snap.data() : {})) logoutWith(blockMessage());
    },
    error => console.warn('Listener comercial do grupo indisponível; sessão preservada.', error)
  );
}

function installLoginGuard() {
  const original = window.conectarCliente;
  if (typeof original !== 'function' || original.__commercialGroupGuard) return false;
  const wrapped = async (...args) => {
    const group = String(document.getElementById('authCodigo')?.value || '').trim().toUpperCase();
    if (group) {
      try {
        if (!(await groupAllowed(group))) {
          alert(blockMessage());
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
  const group = String(event.detail?.grupo || '').trim();
  if (await enforce(group)) watchGroup(group);
});

function installHooks() {
  installLoginGuard();
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', installHooks, { once: true });
else installHooks();
setTimeout(installHooks, 300);
setTimeout(installHooks, 1000);
