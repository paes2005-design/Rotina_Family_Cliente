const APP_KIND = 'cliente';
const MONITOR_VERSION = 3;
const LOG_ENDPOINT = 'https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev/app-log';
const QUEUE_KEY = `rotinaFamily.monitorQueue.${APP_KIND}`;
const SESSION_KEY = `rotinaFamily.monitorSession.${APP_KIND}`;
const SENSITIVE = /senha|password|pin|email|justificativa|token|secret|chave|api/i;
const sessionId = sessionStorage.getItem(SESSION_KEY) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
sessionStorage.setItem(SESSION_KEY, sessionId);
let flushing = false;
let sentInSession = 0;
let lastSignature = '';
let lastSignatureAt = 0;
let flushTimer = 0;
let persistTimer = 0;

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(-120) : [];
  } catch (_) {
    return [];
  }
}
let queue = readQueue();

function persistQueueNow() {
  clearTimeout(persistTimer);persistTimer=0;
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-120))); } catch (_) {}
}
function schedulePersist(delay=350) {
  if (persistTimer) return;
  persistTimer = setTimeout(persistQueueNow, delay);
}
function scheduleFlush(delay=4000) {
  if (!navigator.onLine) return;
  if (flushTimer) {
    if (delay > 0) return;
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => { flushTimer=0; flush(); }, Math.max(0,delay));
}

function cleanValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return String(value).replace(/\s+/g, ' ').slice(0, 180);
}
function cleanDetails(details = {}) {
  const result = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (SENSITIVE.test(key) || typeof value === 'object') continue;
    result[key.slice(0, 50)] = cleanValue(value);
  }
  return result;
}
function context() {
  return {
    grupoId: String(localStorage.getItem('cliente_grupo') || '').trim(),
    perfilId: String(localStorage.getItem('cliente_perfil_id') || '').trim()
  };
}
function browserFamily() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Outro';
}

async function flush() {
  if (flushing || !navigator.onLine || !queue.length || sentInSession >= 300) return;
  const ctx = context();
  if (!ctx.grupoId) return;
  flushing = true;
  const amount = Math.min(25, queue.length, 300 - sentInSession);
  const batch = queue.slice(0, amount).map(item => ({
    ...item,
    grupoId: item.grupoId || ctx.grupoId,
    perfilId: item.perfilId || ctx.perfilId
  }));
  try {
    const response = await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true
    });
    if (!response.ok) throw new Error(`Log HTTP ${response.status}`);
    const result = await response.json().catch(() => ({}));
    if (Number(result.accepted) !== batch.length) throw new Error('Worker ainda não confirmou o lote de logs.');
    queue.splice(0, batch.length);
    sentInSession += batch.length;
    persistQueueNow();
  } catch (_) {
    persistQueueNow();
  } finally {
    flushing = false;
    if (queue.length && navigator.onLine && sentInSession < 300) scheduleFlush(2500);
  }
}

window.rotinaLog = function (eventName, details = {}, level = 'info') {
  const event = String(eventName || 'evento').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
  const safeDetails = cleanDetails(details);
  const normalizedLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info';
  const signature = JSON.stringify([event, safeDetails, normalizedLevel]);
  const now = Date.now();
  if (signature === lastSignature && now - lastSignatureAt < 1500) return;
  lastSignature = signature;lastSignatureAt = now;
  const ctx = context();
  queue.push({
    aplicativo: APP_KIND,
    versaoMonitor: MONITOR_VERSION,
    evento: event,
    nivel: normalizedLevel,
    detalhes: safeDetails,
    grupoId: ctx.grupoId,
    perfilId: ctx.perfilId,
    sessaoId: sessionId,
    clienteEm: new Date().toISOString(),
    pagina: location.pathname.split('/').filter(Boolean).at(-1) || 'inicio',
    navegador: browserFamily(),
    online: navigator.onLine,
    visibilidade: document.visibilityState,
    instalado: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  });
  if (queue.length > 120) queue = queue.slice(-120);
  schedulePersist();
  scheduleFlush(normalizedLevel === 'error' ? 0 : 4000);
};

function actionName(element) {
  const inline = element.getAttribute('onclick') || '';
  const match = inline.match(/^\s*(?:window\.)?([a-zA-Z_$][\w$]*)/);
  if (match) return match[1];
  return element.id || element.dataset.nav || element.dataset.action || element.getAttribute('aria-label') || element.tagName.toLowerCase();
}
document.addEventListener('click', event => {
  const element = event.target.closest('button,a,[role="button"]');
  if (!element) return;
  window.rotinaLog('ui.acao', {
    acao: actionName(element),
    elemento: element.tagName.toLowerCase(),
    aba: document.querySelector('.tab-content.active')?.id || ''
  });
}, true);
window.addEventListener('error', event => window.rotinaLog('app.erro_javascript', {
  mensagem: event.message || 'erro',
  arquivo: String(event.filename || '').split('/').at(-1) || '',
  linha: event.lineno || 0,
  coluna: event.colno || 0
}, 'error'));
window.addEventListener('unhandledrejection', event => window.rotinaLog('app.promessa_rejeitada', {
  mensagem: event.reason?.message || String(event.reason || 'erro')
}, 'error'));
window.addEventListener('online', () => { window.rotinaLog('rede.online'); scheduleFlush(0); });
window.addEventListener('offline', () => window.rotinaLog('rede.offline', {}, 'warning'));
document.addEventListener('visibilitychange', () => {
  window.rotinaLog('app.visibilidade', { estado: document.visibilityState });
  if (document.visibilityState === 'hidden') { persistQueueNow(); scheduleFlush(0); }
});
for (const eventName of [
  'rotina-client-session-ready',
  'rotina-admin-session-ready',
  'rotina-family-alarm-sync',
  'rotina-family-alarm-stop-sync',
  'rotina-family-tasks-rendered'
]) {
  window.addEventListener(eventName, event => window.rotinaLog(`evento.${eventName}`, event.detail || {}));
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => window.rotinaLog('app.iniciado'), { once: true });
else window.rotinaLog('app.iniciado');
setInterval(flush, 15000);
scheduleFlush(2500);
