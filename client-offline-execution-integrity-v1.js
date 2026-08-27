import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, getDocFromCache, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const VERSION = 4;
const PREFIX = 'rotina_execucao_concluida_v1';
let stopHistory = null;
let installed = false;
let currentSignature = '';

const clean = value => String(value || '').trim();
const group = () => clean(localStorage.getItem('cliente_grupo')).toUpperCase();
const profile = () => clean(localStorage.getItem('cliente_perfil_id'));
const pad = n => String(n).padStart(2, '0');
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isFinal = status => /Prazo|Atrasado/i.test(clean(status));
const log = (event, details = {}, level = 'info') => { try { window.rotinaLog?.(event, { ...details, offlineIntegrityVersion: VERSION }, level); } catch {} };

function storageKey(taskId, date = isoDate()) {
  return `${PREFIX}__${group()}__${profile()}__${date}__${clean(taskId)}`;
}

function readLock(taskId, date = isoDate()) {
  if (!taskId || !group() || !profile()) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(taskId, date)) || 'null');
    return parsed && parsed.taskId === clean(taskId) && parsed.date === date && isFinal(parsed.status) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeFinal(taskId, data = {}) {
  const date = clean(data.data || data.dataExecucao || isoDate());
  return {
    version: VERSION,
    grupoId: group(),
    perfilId: profile(),
    taskId: clean(taskId),
    date,
    status: clean(data.status),
    horarioInicio: clean(data.horarioInicio),
    horarioTermino: clean(data.horarioTermino),
    pontosGanhos: Number(data.pontosGanhos) || 0,
    percentualAplicado: data.percentualAplicado == null ? null : Number(data.percentualAplicado),
    faixaAtraso: clean(data.faixaAtraso),
    iniciouComAtraso: data.iniciouComAtraso === true,
    iniciouAposLimiteFinal: data.iniciouAposLimiteFinal === true,
    minutosAlemTolerancia: data.minutosAlemTolerancia == null ? null : Number(data.minutosAlemTolerancia),
    faixaLeveMinutos: data.faixaLeveMinutos == null ? null : Number(data.faixaLeveMinutos),
    regraAtrasoAplicada: data.regraAtrasoAplicada && typeof data.regraAtrasoAplicada === 'object' ? data.regraAtrasoAplicada : undefined,
    serverAuthoritative: data.serverAuthoritative === true,
    lockedAt: new Date().toISOString()
  };
}

function writeLock(candidate, source = 'unknown', force = false) {
  if (!candidate?.taskId || !candidate?.grupoId || !candidate?.perfilId || !candidate?.date || !isFinal(candidate.status)) return null;
  const existing = readLock(candidate.taskId, candidate.date);
  if (existing && !force) return existing;
  try {
    localStorage.setItem(storageKey(candidate.taskId, candidate.date), JSON.stringify(candidate));
    log(force ? 'integridade_offline.trava_atualizada_pelo_servidor' : 'integridade_offline.primeira_conclusao_travada', {
      tarefaId: candidate.taskId,
      data: candidate.date,
      status: candidate.status,
      origem: source,
      substituiuLocal: Boolean(existing && force)
    });
  } catch (error) {
    log('integridade_offline.trava_local_erro', { tarefaId: candidate.taskId, mensagem: clean(error?.message || error) }, 'warning');
    return existing || null;
  }
  applyLocksToDom();
  return candidate;
}

function lockFirstCompletion(taskId, data = {}, source = 'unknown', force = false) {
  const candidate = normalizeFinal(taskId, data);
  if (force) candidate.serverAuthoritative = true;
  return writeLock(candidate, source, force);
}

function listLocksToday() {
  const prefix = `${PREFIX}__${group()}__${profile()}__${isoDate()}__`;
  const items = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith(prefix)) continue;
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      if (value && isFinal(value.status)) items.push(value);
    }
  } catch {}
  return items;
}

function badgeClass(lock) {
  if (lock.faixaAtraso === 'atraso-maior' || /50%/.test(lock.status)) return 'status-prazo-50';
  if (lock.faixaAtraso === 'atraso-leve' || /75%/.test(lock.status)) return 'status-prazo-75';
  if (/Prazo/i.test(lock.status)) return 'status-prazo';
  return 'status-atrasado';
}

function applyLockToRow(row, lock) {
  if (!row || !lock) return;
  row.dataset.familyTaskStatus = lock.status;
  row.dataset.rfCompletionLocked = '1';
  row.dataset.rfCompletionSource = lock.serverAuthoritative ? 'servidor' : 'local';
  const badge = row.querySelector('.status-badge');
  if (badge) {
    badge.classList.remove('status-pendente', 'status-andamento', 'status-prazo', 'status-prazo-75', 'status-prazo-50', 'status-atrasado');
    badge.classList.add(badgeClass(lock));
    badge.textContent = lock.status;
  }
  const cells = row.querySelectorAll('td');
  const action = cells[cells.length - 1];
  if (action) action.textContent = /Prazo/i.test(lock.status) ? '🎉' : '⏰';
  const timeBox = row.querySelector('.horario-container');
  if (timeBox && (lock.horarioInicio || lock.horarioTermino)) {
    let real = timeBox.querySelector('.horario-real');
    if (!real) {
      real = document.createElement('span');
      real.className = 'horario-real';
      timeBox.appendChild(real);
    }
    real.textContent = `▶️ ${lock.horarioInicio || '--:--'}${lock.horarioTermino ? ` / ⏹️ ${lock.horarioTermino}` : ''}`;
  }
}

function applyLocksToDom() {
  const today = isoDate();
  document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]').forEach(row => {
    const taskId = clean(row.dataset.familyTaskId);
    const date = clean(row.dataset.familyTaskDate || today);
    const lock = readLock(taskId, date);
    if (lock) applyLockToRow(row, lock);
  });
}

async function authoritativeHistory(taskId, date = isoDate(), allowServer = false) {
  const compartilhado=(window.rotinaClientCacheSnapshot?.().historico||[]).find(h=>clean(h.tarefaId)===clean(taskId)&&clean(h.data||h.dataExecucao)===date);
  if(compartilhado)return { ...compartilhado, __source:'shared-cache' };
  if (!allowServer || !getApps().length || !group() || !profile()) return null;
  const ref = doc(getFirestore(getApp()), 'historico', `${profile()}_${clean(taskId)}_${date}`);
  try { const snap=await getDocFromCache(ref); return snap.exists()?{id:snap.id,...snap.data(),__source:'cache'}:null; } catch { return null; }
}

async function captureCompletion(taskId, source, allowServer = true) {
  const history = await authoritativeHistory(taskId, isoDate(), allowServer);
  if (history && isFinal(history.status)) {
    return lockFirstCompletion(taskId, history, `${source}-${history.__source}`, history.__source === 'shared-cache');
  }
  return readLock(taskId);
}

async function blockIfAlreadyDone(taskId) {
  let lock = null;
  lock = await captureCompletion(taskId, 'pre-start-cache-central', false);
  if (!lock) lock = readLock(taskId);
  if (!lock) lock = await captureCompletion(taskId, 'pre-start-cache', false);
  if (!lock) return false;
  applyLocksToDom();
  log('integridade_offline.reexecucao_bloqueada', { tarefaId: clean(taskId), data: lock.date, statusOriginal: lock.status }, 'warning');
  alert('Esta tarefa já foi concluída hoje. A primeira execução foi preservada.');
  return true;
}

function wrapActions() {
  const start = window.iniciarTarefa;
  if (typeof start === 'function' && !start.__rfOfflineIntegrity) {
    const wrappedStart = async id => {
      if (await blockIfAlreadyDone(id)) return;
      return start(id);
    };
    wrappedStart.__rfOfflineIntegrity = true;
    wrappedStart.__rfOriginal = start;
    window.iniciarTarefa = wrappedStart;
  }

  const finish = window.finalizarTarefa;
  if (typeof finish === 'function' && !finish.__rfOfflineIntegrity) {
    const wrappedFinish = async id => {
      const serverHistory = await authoritativeHistory(id, isoDate(), false);
      if (serverHistory && isFinal(serverHistory.status)) {
        lockFirstCompletion(id, serverHistory, 'finalizacao-bloqueada-servidor', true);
        applyLocksToDom();
        return;
      }
      if (readLock(id)) {
        applyLocksToDom();
        log('integridade_offline.finalizacao_duplicada_bloqueada', { tarefaId: clean(id) }, 'warning');
        return;
      }
      const result = await finish(id);
      await captureCompletion(id, 'finalizar-tarefa', false);
      setTimeout(() => captureCompletion(id, 'finalizar-tarefa-800ms', false), 800);
      return result;
    };
    wrappedFinish.__rfOfflineIntegrity = true;
    wrappedFinish.__rfOriginal = finish;
    window.finalizarTarefa = wrappedFinish;
  }

  for (const name of ['confirmarJustificativaAtraso', 'optarJustificarAtraso']) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__rfOfflineIntegrity) continue;
    const wrapped = async (...args) => {
      const result = await fn(...args);
      setTimeout(() => {
        document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]').forEach(row => captureCompletion(row.dataset.familyTaskId, name));
      }, 100);
      return result;
    };
    wrapped.__rfOfflineIntegrity = true;
    wrapped.__rfOriginal = fn;
    window[name] = wrapped;
  }
}

function watchHistory(detail = {}) {
  const g = clean(detail.grupo || group()).toUpperCase();
  const p = clean(detail.perfilId || profile());
  if (!g || !p) return;
  currentSignature = `${g}__${p}`;
  const today=isoDate();
  for(const data of (window.rotinaClientCacheSnapshot?.().historico||[])){
    if(clean(data.data||data.dataExecucao)!==today||!isFinal(data.status))continue;
    lockFirstCompletion(clean(data.tarefaId),data,'historico-cache-central',true);
  }
  applyLocksToDom();
}

function taskPatch(lock) {
  return {
    status: lock.status,
    horarioInicio: lock.horarioInicio,
    horarioTermino: lock.horarioTermino,
    pontosGanhos: lock.pontosGanhos,
    percentualAplicado: lock.percentualAplicado,
    faixaAtraso: lock.faixaAtraso,
    iniciouComAtraso: lock.iniciouComAtraso,
    iniciouAposLimiteFinal: lock.iniciouAposLimiteFinal,
    minutosAlemTolerancia: lock.minutosAlemTolerancia,
    faixaLeveMinutos: lock.faixaLeveMinutos,
    ...(lock.regraAtrasoAplicada ? { regraAtrasoAplicada: lock.regraAtrasoAplicada } : {})
  };
}

async function reconcileLocks() {
  if (navigator.onLine === false || !getApps().length) return;
  const db = getFirestore(getApp());
  const historico=(window.rotinaClientCacheSnapshot?.().historico||[]);
  for (const lock of listLocksToday()) {
    try {
      const existente=historico.find(h=>clean(h.tarefaId)===lock.taskId&&clean(h.data||h.dataExecucao)===lock.date&&isFinal(h.status));
      if (existente) {
        lockFirstCompletion(lock.taskId, existente, 'reconciliacao-cache-servidor', true);
        continue;
      }
      const historyRef = doc(db, 'historico', `${lock.perfilId}_${lock.taskId}_${lock.date}`);
      await setDoc(historyRef,{grupoId:lock.grupoId,perfilId:lock.perfilId,tarefaId:lock.taskId,data:lock.date,...taskPatch(lock),recuperadoDaTravaLocal:true,recuperadoEm:new Date().toISOString()},{merge:true});
      await updateDoc(doc(db,'tarefas',lock.taskId),taskPatch(lock));
      log('integridade_offline.trava_reconciliada',{tarefaId:lock.taskId,data:lock.date});
    } catch(error){log('integridade_offline.reconciliacao_erro',{tarefaId:lock.taskId,mensagem:clean(error?.message||error)},'warning');}
  }
  applyLocksToDom();
}

function install() {
  wrapActions();
  applyLocksToDom();
  if (!installed) {
    installed = true;
    window.addEventListener('rotina-client-session-ready', event => {
      watchHistory(event.detail || {});
      setTimeout(wrapActions, 50);
      setTimeout(applyLocksToDom, 80);

    });
    window.addEventListener('rotina-family-tasks-rendered', () => setTimeout(applyLocksToDom, 0));
    window.addEventListener('rotina-client-cache-updated', event => {
      watchHistory({grupo:group(),perfilId:profile()});
      if(event.detail?.servidor===true)setTimeout(reconcileLocks,50);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        applyLocksToDom();
      }
    });
    log('integridade_offline.modulo_pronto', { versao: VERSION, prioridade: 'historico-servidor' });
  }
  if (group() && profile()) watchHistory({ grupo: group(), perfilId: profile() });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
let attempts = 0;
const timer = setInterval(() => {
  install();
  if (++attempts >= 40 && typeof window.iniciarTarefa === 'function' && typeof window.finalizarTarefa === 'function') clearInterval(timer);
}, 150);
