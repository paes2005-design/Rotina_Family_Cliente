import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const API_ROOT = 'https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev';
let installed = false;
let authReadyPromise = null;

const clean = value => String(value || '').trim();
const group = value => clean(value).toUpperCase();

function auth() {
  if (!getApps().length) throw new Error('Firebase ainda não foi iniciado.');
  return getAuth(getApp());
}

function waitForAuth() {
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise(resolve => {
    const stop = onAuthStateChanged(auth(), user => {
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

async function secureLogin() {
  const nome = clean(document.getElementById('authNome')?.value);
  const grupoId = group(document.getElementById('authCodigo')?.value);
  const pin = clean(document.getElementById('authPin')?.value);
  if (!nome || !grupoId || !pin) return alert('Preencha nome, código do grupo e PIN.');
  try {
    const session = await callSession('/family-session/participant', { grupoId, nome, pin });
    await signInWithCustomToken(auth(), session.token);
    localStorage.setItem('cliente_nome', session.nome);
    localStorage.setItem('cliente_grupo', session.grupoId);
    localStorage.setItem('cliente_sexo', session.sexo || 'Feminino');
    localStorage.setItem('cliente_perfil_id', session.perfilId);
    if (typeof window.rotinaIniciarSessaoCliente === 'function') {
      await window.rotinaIniciarSessaoCliente(session.nome, session.grupoId, session.sexo || 'Feminino', session.perfilId);
    } else if (typeof window.__rotinaLoginClienteLegado === 'function') {
      await window.__rotinaLoginClienteLegado();
    } else {
      throw new Error('Inicializador do Cliente ainda não está disponível.');
    }
    window.rotinaLog?.('auth.participante_sessao_criada', { grupoId: session.grupoId, perfilId: session.perfilId });
  } catch (error) {
    console.warn('Sessão segura do participante:', error);
    alert(error.message || 'Não foi possível entrar agora.');
  }
}

async function restoreSession(nome, grupoId, sexo, perfilId) {
  const user = await waitForAuth().catch(() => null);
  if (!user || !String(user.uid || '').startsWith('rfp_')) {
    ['cliente_nome', 'cliente_grupo', 'cliente_sexo', 'cliente_perfil_id'].forEach(key => localStorage.removeItem(key));
    document.getElementById('telaApp')?.style.setProperty('display', 'none');
    document.getElementById('telaAuth')?.style.setProperty('display', 'block');
    return false;
  }
  try {
    const token = await user.getIdTokenResult();
    const claimGroup = group(token.claims?.grupoId);
    const claimProfile = clean(token.claims?.perfilId);
    if (claimGroup && claimGroup !== group(grupoId)) throw new Error('Grupo da sessão não confere.');
    if (claimProfile && perfilId && claimProfile !== perfilId) throw new Error('Perfil da sessão não confere.');
    if (typeof window.rotinaIniciarSessaoCliente !== 'function') throw new Error('Inicializador do Cliente indisponível.');
    await window.rotinaIniciarSessaoCliente(nome, grupoId, sexo || 'Feminino', perfilId || claimProfile);
    return true;
  } catch (error) {
    console.warn('Restauração segura da sessão:', error);
    await signOut(auth()).catch(() => {});
    ['cliente_nome', 'cliente_grupo', 'cliente_sexo', 'cliente_perfil_id'].forEach(key => localStorage.removeItem(key));
    document.getElementById('telaApp')?.style.setProperty('display', 'none');
    document.getElementById('telaAuth')?.style.setProperty('display', 'block');
    return false;
  }
}

function install() {
  if (installed) return;
  const originalLogin = window.conectarCliente;
  if (typeof originalLogin !== 'function') {
    setTimeout(install, 100);
    return;
  }
  installed = true;
  window.__rotinaLoginClienteLegado = originalLogin;
  window.conectarCliente = secureLogin;
  window.rotinaRestaurarSessaoParticipante = restoreSession;

  const originalLogout = window.sairCliente;
  if (typeof originalLogout === 'function' && !originalLogout.__authSessionV1) {
    const wrapped = async (...args) => {
      await signOut(auth()).catch(() => {});
      authReadyPromise = null;
      return originalLogout(...args);
    };
    wrapped.__authSessionV1 = true;
    window.sairCliente = wrapped;
  }
  window.__rotinaParticipantAuthVersion = 1;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
setTimeout(install, 250);
