import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let stopConfig = null;
let stopProfile = null;
let blockedNotice = false;

function db() {
  if (!getApps().length) throw new Error('Firebase ainda não foi iniciado.');
  return getFirestore(getApp());
}

function state(config = {}) {
  if (config.grupoBloqueado === true) return 'bloqueado';
  if (config.grupoConfirmado === true) return 'liberado';
  if (config.trialAtivo === true) {
    const end = new Date(config.trialFimEm || '');
    if (Number.isFinite(end.getTime()) && end.getTime() <= Date.now()) return 'teste-expirado';
    return 'teste';
  }
  return 'legado';
}

function message(estado) {
  return estado === 'teste-expirado'
    ? 'Sua versão teste de 15 dias terminou. Peça ao responsável para entrar em contato e ativar o grupo familiar.'
    : 'Este grupo familiar está temporariamente desativado.';
}

async function groupAccess(groupId) {
  const snap = await getDoc(doc(db(), 'configGrupos', groupId));
  const estado = state(snap.exists() ? snap.data() : {});
  return { estado, allowed: !['bloqueado', 'teste-expirado'].includes(estado) };
}

async function profileAllowed(groupId, profileId, name = '') {
  if (profileId) {
    const snap = await getDoc(doc(db(), 'perfis', profileId));
    return snap.exists() && snap.data().desativadoMaster !== true;
  }
  if (name) {
    const snap = await getDocs(query(collection(db(), 'perfis'), where('grupoId', '==', groupId), where('nome', '==', name)));
    return !snap.empty && snap.docs[0].data().desativadoMaster !== true;
  }
  return true;
}

function logoutWith(text) {
  if (blockedNotice) return;
  blockedNotice = true;
  stopConfig?.(); stopConfig = null;
  stopProfile?.(); stopProfile = null;
  try { window.sairCliente?.(); } catch (_) {}
  alert(text);
  setTimeout(() => { blockedNotice = false; }, 700);
}

async function enforce(groupId, profileId) {
  if (!groupId) return true;
  try {
    const access = await groupAccess(groupId);
    if (!access.allowed) {
      logoutWith(message(access.estado));
      return false;
    }
  } catch (error) {
    // Comercial não é mecanismo de segurança. Em 429/rede, preserva sessão válida.
    console.warn('Estado comercial da família indisponível; acesso preservado.', error);
    return true;
  }

  if (profileId) {
    try {
      if (!(await profileAllowed(groupId, profileId))) {
        logoutWith('Seu acesso a este grupo familiar está desativado.');
        return false;
      }
    } catch (error) {
      console.warn('Estado comercial do perfil indisponível; acesso preservado.', error);
    }
  }
  return true;
}

function watchSession(groupId, profileId) {
  stopConfig?.(); stopConfig = null;
  stopProfile?.(); stopProfile = null;
  const group = String(groupId || '').trim();
  const profile = String(profileId || '').trim();
  if (!group) return;

  stopConfig = onSnapshot(
    doc(db(), 'configGrupos', group),
    snap => {
      const estado = state(snap.exists() ? snap.data() : {});
      if (['bloqueado', 'teste-expirado'].includes(estado)) logoutWith(message(estado));
    },
    error => console.warn('Listener comercial do grupo indisponível; sessão preservada.', error)
  );

  if (profile) {
    stopProfile = onSnapshot(
      doc(db(), 'perfis', profile),
      snap => {
        if (snap.exists() && snap.data().desativadoMaster === true) {
          logoutWith('Seu acesso a este grupo familiar está desativado.');
        }
      },
      error => console.warn('Listener comercial do perfil indisponível; sessão preservada.', error)
    );
  }
}

function installLoginGuard() {
  const original = window.conectarCliente;
  if (typeof original !== 'function' || original.__commercialGuardSafe) return false;
  const wrapped = async (...args) => {
    const group = String(document.getElementById('authCodigo')?.value || '').trim().toUpperCase();
    const rawName = String(document.getElementById('authNome')?.value || '').trim();
    const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '';
    if (group) {
      try {
        const access = await groupAccess(group);
        if (!access.allowed) { alert(message(access.estado)); return; }
      } catch (error) {
        console.warn('Validação comercial pré-login indisponível; login normal continuará.', error);
      }
      if (name) {
        try {
          if (!(await profileAllowed(group, '', name))) {
            alert('Seu acesso a este grupo familiar está desativado.');
            return;
          }
        } catch (error) {
          console.warn('Validação comercial do perfil indisponível; login normal continuará.', error);
        }
      }
    }
    return original(...args);
  };
  wrapped.__commercialGuardSafe = true;
  window.conectarCliente = wrapped;
  return true;
}

window.addEventListener('rotina-client-session-ready', async event => {
  const group = String(event.detail?.grupo || '').trim();
  const profile = String(event.detail?.perfilId || '').trim();
  if (await enforce(group, profile)) watchSession(group, profile);
});

function installHooks() {
  installLoginGuard();
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', installHooks, { once: true });
else installHooks();
setTimeout(installHooks, 300);
setTimeout(installHooks, 1000);
