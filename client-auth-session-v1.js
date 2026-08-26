import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const API_ROOT = 'https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev';
const VERSION = 6;
let installed = false;
let authReadyPromise = null;

const clean = value => String(value || '').trim();
const group = value => clean(value).toUpperCase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForFirebaseApp(timeoutMs = 12000) {
  const startedAt = Date.now();
  while (!getApps().length) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('O Firebase não terminou de iniciar. Feche e abra o aplicativo novamente.');
    await sleep(50);
  }
  return getApp();
}

async function auth() {
  return getAuth(await waitForFirebaseApp());
}

async function waitForAuth() {
  if (authReadyPromise) return authReadyPromise;
  const instance = await auth();
  authReadyPromise = new Promise(resolve => {
    let stop = () => {};
    stop = onAuthStateChanged(instance, user => {
      stop();
      resolve(user || null);
    });
  });
  return authReadyPromise;
}

async function callSession(path, body, token = '') {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.token) {
    const error = new Error(result.error || `Falha HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function loginButton(busy = false) {
  const button = document.querySelector('#telaAuth button[onclick*="conectarCliente"]');
  if (!button) return;
  if (!button.dataset.rfOriginalText) button.dataset.rfOriginalText = button.textContent || 'Entrar no Meu Espaço';
  button.disabled = busy;
  button.textContent = busy ? 'Entrando…' : button.dataset.rfOriginalText;
}

async function secureLogin() {
  const nome = clean(document.getElementById('authNome')?.value);
  const grupoId = group(document.getElementById('authCodigo')?.value);
  const pin = clean(document.getElementById('authPin')?.value);
  if (!nome || !grupoId || !pin) return alert('Preencha nome, código do grupo e PIN.');

  loginButton(true);
  try {
    const instance = await auth();
    const session = await callSession('/family-session/participant', { grupoId, nome, pin });
    const credential = await signInWithCustomToken(instance, session.token);
    if (!credential?.user || !String(credential.user.uid || '').startsWith('rfp_')) throw new Error('A sessão segura do participante não foi confirmada.');

    authReadyPromise = Promise.resolve(credential.user);
    localStorage.setItem('cliente_nome', session.nome);
    localStorage.setItem('cliente_grupo', session.grupoId);
    localStorage.setItem('cliente_sexo', session.sexo || 'Feminino');
    localStorage.setItem('cliente_perfil_id', session.perfilId);

    if (typeof window.rotinaIniciarSessaoCliente !== 'function') throw new Error('Inicializador do Cliente ainda não está disponível.');
    await window.rotinaIniciarSessaoCliente(session.nome, session.grupoId, session.sexo || 'Feminino', session.perfilId);
    window.rotinaLog?.('auth.participante_sessao_criada', { grupoId: session.grupoId, perfilId: session.perfilId, authVersion: VERSION });
    window.dispatchEvent(new CustomEvent('rotina-client-auth-confirmed', { detail: { grupoId: session.grupoId, perfilId: session.perfilId, version: VERSION } }));
    return true;
  } catch (error) {
    console.warn('Sessão segura do participante:', error);
    window.rotinaLog?.('auth.participante_login_erro', { mensagem: clean(error?.message || error), status: Number(error?.status || 0), authVersion: VERSION }, 'error');
    alert(error.message || 'Não foi possível entrar agora.');
    return false;
  } finally {
    loginButton(false);
  }
}

function hardRestoreError(message) {
  const error = new Error(message);
  error.hardSessionFailure = true;
  return error;
}

async function restoreSession(nome, grupoId, sexo, perfilId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const user = await waitForAuth();
      if (!user) throw hardRestoreError('Sessão segura ausente.');
      if (!String(user.uid || '').startsWith('rfp_')) throw hardRestoreError('Sessão autenticada não pertence a um participante.');

      const token = await user.getIdTokenResult(attempt === 1);
      const claimGroup = group(token.claims?.grupoId);
      const claimProfile = clean(token.claims?.perfilId);
      if (claimGroup && claimGroup !== group(grupoId)) throw hardRestoreError('Grupo da sessão não confere.');
      if (claimProfile && perfilId && claimProfile !== perfilId) throw hardRestoreError('Perfil da sessão não confere.');
      if (typeof window.rotinaIniciarSessaoCliente !== 'function') throw new Error('Inicializador do Cliente indisponível.');

      await window.rotinaIniciarSessaoCliente(nome, grupoId, sexo || 'Feminino', perfilId || claimProfile);
      window.rotinaLog?.('auth.participante_sessao_restaurada', { grupoId: group(grupoId), perfilId: perfilId || claimProfile, authVersion: VERSION, tentativa: attempt });
      window.dispatchEvent(new CustomEvent('rotina-client-auth-confirmed', { detail: { grupoId: group(grupoId), perfilId: perfilId || claimProfile, version: VERSION } }));
      return true;
    } catch (error) {
      lastError = error;
      if (error?.hardSessionFailure) break;
      window.rotinaLog?.('auth.participante_restauracao_retry', { tentativa: attempt, mensagem: clean(error?.message || error), authVersion: VERSION }, 'warning');
      if (attempt < 3) await sleep(700 * attempt);
    }
  }

  const error = lastError || new Error('Não foi possível restaurar a sessão.');
  console.warn('Restauração segura da sessão:', error);

  if (error?.hardSessionFailure) {
    try { await signOut(await auth()); } catch {}
    authReadyPromise = null;
    ['cliente_nome', 'cliente_grupo', 'cliente_sexo', 'cliente_perfil_id'].forEach(key => localStorage.removeItem(key));
    document.getElementById('telaApp')?.style.setProperty('display', 'none');
    document.getElementById('telaAuth')?.style.setProperty('display', 'block');
    window.rotinaLog?.('auth.participante_restauracao_recusada', { mensagem: clean(error?.message || error), authVersion: VERSION }, 'warning');
  } else {
    // Falha transitória (rede, inicialização lenta, indisponibilidade momentânea):
    // preserva Firebase Auth e os dados locais para uma nova tentativa automática.
    window.rotinaLog?.('auth.participante_restauracao_adiada', { mensagem: clean(error?.message || error), authVersion: VERSION }, 'warning');
    window.dispatchEvent(new CustomEvent('rotina-client-auth-restore-deferred', { detail: { version: VERSION } }));
    setTimeout(() => {
      restoreSession(nome, grupoId, sexo, perfilId).catch(() => {});
    }, 3000);
  }
  return false;
}

async function safeLogout(originalLogout, ...args) {
  try { await signOut(await auth()); } catch {}
  authReadyPromise = null;
  if (typeof originalLogout === 'function') return originalLogout(...args);
}

function install() {
  if (installed) return;
  installed = true;

  const originalLogout = typeof window.sairCliente === 'function' ? window.sairCliente : null;
  window.rotinaLoginParticipanteSeguro = secureLogin;
  window.__rotinaRestaurarSessaoParticipanteReal = restoreSession;
  window.conectarCliente = secureLogin;
  window.rotinaRestaurarSessaoParticipante = restoreSession;

  if (originalLogout && !originalLogout.__authSessionV6) {
    const wrapped = (...args) => safeLogout(originalLogout, ...args);
    wrapped.__authSessionV6 = true;
    window.sairCliente = wrapped;
  }

  window.__rotinaParticipantAuthVersion = VERSION;
  window.__rotinaParticipantAuthBridgeDisabled = false;
  window.__rotinaResolveAuthBridge?.(VERSION);
  window.dispatchEvent(new CustomEvent('rotina-auth-bridge-ready', { detail: { version: VERSION } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
setTimeout(install, 0);
