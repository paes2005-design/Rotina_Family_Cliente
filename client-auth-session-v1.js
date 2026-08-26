import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, enableNetwork, doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const API_ROOT = 'https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev';
const VERSION = 3;
let installed = false;
let authReadyPromise = null;

const clean = value => String(value || '').trim();
const group = value => clean(value).toUpperCase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (event, details = {}, level = 'info') => { try { window.rotinaLog?.(event, { ...details, authVersion: VERSION }, level); } catch {} };

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
    const stop = onAuthStateChanged(instance, user => {
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

async function verifyClaims(user, grupoId, perfilId) {
  const token = await user.getIdTokenResult(true);
  const papel = clean(token.claims?.papel);
  const claimGroup = group(token.claims?.grupoId);
  const claimProfile = clean(token.claims?.perfilId);
  if (papel !== 'participante') throw new Error('A sessão aberta não possui o papel de participante.');
  if (claimGroup !== group(grupoId)) throw new Error('O grupo da sessão autenticada não confere.');
  if (claimProfile !== clean(perfilId)) throw new Error('O perfil da sessão autenticada não confere.');
  return token;
}

async function confirmFirestoreOnline(grupoId) {
  if (navigator.onLine === false) {
    log('auth.firestore_offline_declarado', { grupoId: group(grupoId) }, 'warning');
    return false;
  }
  const app = await waitForFirebaseApp();
  const db = getFirestore(app);
  try {
    await enableNetwork(db);
    const startedAt = performance.now();
    await getDocFromServer(doc(db, 'configGrupos', group(grupoId)));
    log('auth.firestore_online_confirmado', { grupoId: group(grupoId), tempoMs: Math.round(performance.now() - startedAt) });
    window.__rotinaFirestoreOnlineConfirmed = true;
    window.dispatchEvent(new CustomEvent('rotina-firestore-online', { detail: { grupoId: group(grupoId), authVersion: VERSION } }));
    return true;
  } catch (error) {
    window.__rotinaFirestoreOnlineConfirmed = false;
    const code = clean(error?.code || '');
    log('auth.firestore_online_falhou', { grupoId: group(grupoId), codigo: code, mensagem: clean(error?.message || error) }, 'error');
    const explicit = /permission-denied|unauthenticated/i.test(`${code} ${error?.message || ''}`);
    if (explicit) throw new Error('A autenticação foi aceita, mas o Firebase recusou o acesso aos dados deste perfil.');
    throw new Error('Não foi possível confirmar a conexão online com o banco de dados. Tente novamente com a internet ativa.');
  }
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
    await verifyClaims(credential.user, session.grupoId, session.perfilId);
    await confirmFirestoreOnline(session.grupoId);

    authReadyPromise = Promise.resolve(credential.user);
    localStorage.setItem('cliente_nome', session.nome);
    localStorage.setItem('cliente_grupo', session.grupoId);
    localStorage.setItem('cliente_sexo', session.sexo || 'Feminino');
    localStorage.setItem('cliente_perfil_id', session.perfilId);

    if (typeof window.rotinaIniciarSessaoCliente !== 'function') throw new Error('Inicializador do Cliente ainda não está disponível.');
    await window.rotinaIniciarSessaoCliente(session.nome, session.grupoId, session.sexo || 'Feminino', session.perfilId);
    log('auth.participante_sessao_criada', { grupoId: session.grupoId, perfilId: session.perfilId, firestoreOnline: true });
    return true;
  } catch (error) {
    console.warn('Sessão segura do participante:', error);
    log('auth.participante_login_erro', { mensagem: clean(error?.message || error), status: Number(error?.status || 0) }, 'error');
    alert(error.message || 'Não foi possível entrar agora.');
    return false;
  } finally {
    loginButton(false);
  }
}

async function restoreSession(nome, grupoId, sexo, perfilId) {
  try {
    const user = await waitForAuth();
    if (!user || !String(user.uid || '').startsWith('rfp_')) throw new Error('Sessão segura ausente.');
    const token = await user.getIdTokenResult(true);
    const claimGroup = group(token.claims?.grupoId);
    const claimProfile = clean(token.claims?.perfilId);
    const papel = clean(token.claims?.papel);
    if (papel !== 'participante') throw new Error('Sessão de participante inválida.');
    if (claimGroup && claimGroup !== group(grupoId)) throw new Error('Grupo da sessão não confere.');
    if (claimProfile && perfilId && claimProfile !== perfilId) throw new Error('Perfil da sessão não confere.');
    if (navigator.onLine !== false) await confirmFirestoreOnline(grupoId);
    if (typeof window.rotinaIniciarSessaoCliente !== 'function') throw new Error('Inicializador do Cliente indisponível.');

    await window.rotinaIniciarSessaoCliente(nome, grupoId, sexo || 'Feminino', perfilId || claimProfile);
    log('auth.participante_sessao_restaurada', { grupoId: group(grupoId), perfilId: perfilId || claimProfile, firestoreOnline: navigator.onLine !== false });
    return true;
  } catch (error) {
    console.warn('Restauração segura da sessão:', error);
    try { await signOut(await auth()); } catch {}
    ['cliente_nome', 'cliente_grupo', 'cliente_sexo', 'cliente_perfil_id'].forEach(key => localStorage.removeItem(key));
    document.getElementById('telaApp')?.style.setProperty('display', 'none');
    document.getElementById('telaAuth')?.style.setProperty('display', 'block');
    log('auth.participante_restauracao_recusada', { mensagem: clean(error?.message || error) }, 'warning');
    alert(error.message || 'A sessão não pôde ser restaurada. Entre novamente.');
    return false;
  }
}

async function safeLogout(originalLogout, ...args) {
  try { await signOut(await auth()); } catch {}
  authReadyPromise = null;
  window.__rotinaFirestoreOnlineConfirmed = false;
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

  if (originalLogout && !originalLogout.__authSessionV3) {
    const wrapped = (...args) => safeLogout(originalLogout, ...args);
    wrapped.__authSessionV3 = true;
    window.sairCliente = wrapped;
  }

  window.addEventListener('online', () => {
    waitForFirebaseApp().then(app => enableNetwork(getFirestore(app))).catch(error => log('auth.firestore_rede_reativacao_erro', { mensagem: clean(error?.message || error) }, 'warning'));
  });

  window.__rotinaParticipantAuthVersion = VERSION;
  window.__rotinaResolveAuthBridge?.(VERSION);
  window.dispatchEvent(new CustomEvent('rotina-auth-bridge-ready', { detail: { version: VERSION } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
setTimeout(install, 0);
