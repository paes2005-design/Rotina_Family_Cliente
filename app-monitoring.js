const APP_KIND = 'cliente';
const MONITOR_VERSION = 4;
const LOG_ENDPOINT = 'https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev/app-log';
const QUEUE_KEY = `rotinaFamily.monitorQueue.${APP_KIND}`;
const SESSION_KEY = `rotinaFamily.monitorSession.${APP_KIND}`;
const SENSITIVE = /senha|password|pin|email|justificativa|token|secret|chave|api|cpf|documento/i;
const sessionId = sessionStorage.getItem(SESSION_KEY) || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
sessionStorage.setItem(SESSION_KEY, sessionId);
let flushing = false;
let sentInSession = 0;
let lastSignature = '';
let lastSignatureAt = 0;
let flushTimer = 0;
let persistTimer = 0;
let lastScreenSignature = '';
let lastScreenAt = 0;

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(-300) : [];
  } catch (_) {
    return [];
  }
}
let queue = readQueue();

function persistQueueNow() {
  clearTimeout(persistTimer);persistTimer=0;
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-300))); } catch (_) {}
}
function schedulePersist(delay=250) {
  if (persistTimer) return;
  persistTimer = setTimeout(persistQueueNow, delay);
}
function scheduleFlush(delay=2500) {
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
  return String(value).replace(/\s+/g, ' ').slice(0, 220);
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
function mediaName(media) {
  const src=String(media?.currentSrc||media?.src||'');
  if(src.includes('latido-cachorro-comemoracao')) return 'cachorro_comemoracao';
  if(src.includes('cachorro-triste-choramingo')) return 'cachorro_triste';
  if(src.startsWith('data:audio/')) return 'audio_embutido_mascote';
  if(src.startsWith('blob:')) return 'audio_blob';
  return src.split('/').pop()?.split('?')[0] || media?.tagName?.toLowerCase() || 'midia';
}
function rectInfo(el,prefix) {
  if(!el) return {};
  const r=el.getBoundingClientRect();
  const clipped=r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight;
  const visible=r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
  return {
    [`${prefix}X`]:Math.round(r.x),[`${prefix}Y`]:Math.round(r.y),
    [`${prefix}W`]:Math.round(r.width),[`${prefix}H`]:Math.round(r.height),
    [`${prefix}Visivel`]:visible,[`${prefix}Cortado`]:clipped
  };
}
function screenDetails(origem='periodico') {
  const catLayer=document.getElementById('rotinaCat3dLayerV2');
  const catImg=document.getElementById('rotinaCat3dImgV2');
  const dogLayer=document.getElementById('rotinaDogPreviewV2')||document.getElementById('rotinaDogCelebrationLayer');
  const catShow=!!catLayer?.classList.contains('show');
  const dogShow=!!dogLayer&&(dogLayer.classList.contains('show')||getComputedStyle(dogLayer).display!=='none');
  const active=document.querySelector('.tab-content.active,[data-tab].active,.aba.active');
  const modal=[...document.querySelectorAll('[role="dialog"],.modal,.popup,.overlay')].find(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.getBoundingClientRect().width>0;});
  return {
    origem,
    largura:innerWidth,altura:innerHeight,dpr:Number(devicePixelRatio||1).toFixed(2),
    scrollY:Math.round(scrollY),orientacao:screen?.orientation?.type||'',
    aba:active?.id||active?.dataset?.tab||'',
    modal:modal?.id||modal?.className?.toString().slice(0,70)||'',
    mascote:document.body?.getAttribute('data-rotina-mascote')||'',
    gatoVisivel:catShow,cachorroVisivel:dogShow,
    gatoNaturalW:catImg?.naturalWidth||0,gatoNaturalH:catImg?.naturalHeight||0,
    ...rectInfo(catImg,'gato'),...rectInfo(dogLayer,'cachorro')
  };
}
function logScreen(origem='periodico',force=false){
  try{
    const d=screenDetails(origem);
    const sig=JSON.stringify(d);
    const now=Date.now();
    if(!force&&sig===lastScreenSignature&&now-lastScreenAt<30000)return;
    lastScreenSignature=sig;lastScreenAt=now;
    window.rotinaLog?.('tela.estado',d,(d.gatoCortado||d.cachorroCortado)?'warning':'info');
  }catch{}
}

async function flush() {
  if (flushing || !navigator.onLine || !queue.length || sentInSession >= 1200) return;
  const ctx = context();
  if (!ctx.grupoId) return;
  flushing = true;
  const amount = Math.min(25, queue.length, 1200 - sentInSession);
  const batch = queue.slice(0, amount).map(item => ({
    ...item,
    grupoId: item.grupoId || ctx.grupoId,
    perfilId: item.perfilId || ctx.perfilId
  }));
  try {
    const response = await fetch(LOG_ENDPOINT, {
      method: 'POST',headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),keepalive: true
    });
    if (!response.ok) throw new Error(`Log HTTP ${response.status}`);
    const result = await response.json().catch(() => ({}));
    if (Number(result.accepted) !== batch.length) throw new Error('Worker ainda não confirmou o lote de logs.');
    queue.splice(0, batch.length);sentInSession += batch.length;persistQueueNow();
  } catch (_) { persistQueueNow(); }
  finally { flushing = false;if (queue.length && navigator.onLine && sentInSession < 1200) scheduleFlush(1800); }
}

window.rotinaLog = function (eventName, details = {}, level = 'info') {
  const event = String(eventName || 'evento').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
  const safeDetails = cleanDetails(details);
  const normalizedLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info';
  const signature = JSON.stringify([event, safeDetails, normalizedLevel]);
  const now = Date.now();
  if (signature === lastSignature && now - lastSignatureAt < 700) return;
  lastSignature = signature;lastSignatureAt = now;
  const ctx = context();
  queue.push({
    aplicativo: APP_KIND,versaoMonitor: MONITOR_VERSION,evento: event,nivel: normalizedLevel,
    detalhes: safeDetails,grupoId: ctx.grupoId,perfilId: ctx.perfilId,sessaoId: sessionId,
    clienteEm: new Date().toISOString(),pagina: location.pathname.split('/').filter(Boolean).at(-1) || 'inicio',
    navegador: browserFamily(),online: navigator.onLine,visibilidade: document.visibilityState,
    instalado: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  });
  if (queue.length > 300) queue = queue.slice(-300);
  schedulePersist();scheduleFlush(normalizedLevel === 'error' ? 0 : 1800);
};

function actionName(element) {
  const inline = element.getAttribute('onclick') || '';
  const match = inline.match(/^\s*(?:window\.)?([a-zA-Z_$][\w$]*)/);
  if (match) return match[1];
  return element.id || element.dataset.nav || element.dataset.action || element.getAttribute('aria-label') || element.tagName.toLowerCase();
}
function safeControl(el){
  const name=el?.name||el?.id||el?.getAttribute?.('aria-label')||el?.type||el?.tagName?.toLowerCase()||'';
  return SENSITIVE.test(name)?'campo_sensivel':String(name).slice(0,80);
}

document.addEventListener('click', event => {
  const element = event.target.closest('button,a,[role="button"]');if (!element) return;
  window.rotinaLog('ui.acao', {acao: actionName(element),elemento: element.tagName.toLowerCase(),aba: document.querySelector('.tab-content.active')?.id || ''});
  setTimeout(()=>logScreen('apos_clique',true),80);
}, true);
document.addEventListener('change',event=>{const el=event.target;if(!el)return;window.rotinaLog('ui.campo_alterado',{campo:safeControl(el),tipo:el.type||el.tagName?.toLowerCase()||'',marcado:typeof el.checked==='boolean'?el.checked:''});},true);
document.addEventListener('submit',event=>window.rotinaLog('ui.formulario_enviado',{formulario:event.target?.id||event.target?.name||'form'}),true);

window.addEventListener('error', event => window.rotinaLog('app.erro_javascript', {mensagem: event.message || 'erro',arquivo: String(event.filename || '').split('/').at(-1) || '',linha: event.lineno || 0,coluna: event.colno || 0}, 'error'));
window.addEventListener('unhandledrejection', event => window.rotinaLog('app.promessa_rejeitada', {mensagem: event.reason?.message || String(event.reason || 'erro')}, 'error'));
window.addEventListener('online', () => { window.rotinaLog('rede.online'); scheduleFlush(0); });
window.addEventListener('offline', () => window.rotinaLog('rede.offline', {}, 'warning'));
window.addEventListener('focus',()=>window.rotinaLog('app.foco',{estado:'focus'}));
window.addEventListener('blur',()=>window.rotinaLog('app.foco',{estado:'blur'}));
window.addEventListener('pageshow',e=>{window.rotinaLog('app.pageshow',{persistido:!!e.persisted});setTimeout(()=>logScreen('pageshow',true),100);});
window.addEventListener('pagehide',e=>{window.rotinaLog('app.pagehide',{persistido:!!e.persisted});persistQueueNow();scheduleFlush(0);});
window.addEventListener('resize',()=>logScreen('resize'));
window.addEventListener('orientationchange',()=>setTimeout(()=>logScreen('orientacao',true),200));
window.addEventListener('popstate',()=>window.rotinaLog('navegacao.popstate',{hash:location.hash||''}));
window.addEventListener('hashchange',()=>window.rotinaLog('navegacao.hashchange',{hash:location.hash||''}));
document.addEventListener('visibilitychange', () => {window.rotinaLog('app.visibilidade', { estado: document.visibilityState });logScreen('visibilidade',true);if (document.visibilityState === 'hidden') { persistQueueNow(); scheduleFlush(0); }});

// Telemetria real de áudio/vídeo: registra tentativa, sucesso, término e falha de play().
const originalPlay=HTMLMediaElement.prototype.play;
if(!HTMLMediaElement.prototype.__rotinaMonitorPlayV4){
  HTMLMediaElement.prototype.play=function(){
    const m=this,nome=mediaName(m),inicio=performance.now();
    window.rotinaLog?.('midia.play_tentativa',{midia:nome,tipo:m.tagName.toLowerCase(),volume:Number(m.volume||0).toFixed(2),mutado:!!m.muted,readyState:m.readyState});
    let result;
    try{result=originalPlay.call(m);}catch(e){window.rotinaLog?.('midia.play_falhou',{midia:nome,mensagem:e?.message||String(e)},'error');throw e;}
    if(result&&typeof result.then==='function'){
      return result.then(v=>{window.rotinaLog?.('midia.play_ok',{midia:nome,tempoMs:Math.round(performance.now()-inicio),duracao:Number.isFinite(m.duration)?Number(m.duration).toFixed(2):0});return v;}).catch(e=>{window.rotinaLog?.('midia.play_falhou',{midia:nome,tempoMs:Math.round(performance.now()-inicio),mensagem:e?.message||String(e),readyState:m.readyState},'error');throw e;});
    }
    return result;
  };
  HTMLMediaElement.prototype.__rotinaMonitorPlayV4=true;
}
for(const ev of ['playing','pause','ended','stalled','waiting','abort','error']){
  document.addEventListener(ev,e=>{const m=e.target;if(!(m instanceof HTMLMediaElement))return;const level=(ev==='error'||ev==='stalled')?'warning':'info';window.rotinaLog(`midia.${ev}`,{midia:mediaName(m),tempo:Number(m.currentTime||0).toFixed(2),duracao:Number.isFinite(m.duration)?Number(m.duration).toFixed(2):0,readyState:m.readyState},level);},true);
}
document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;window.rotinaLog('imagem.falha',{imagem:img.id||img.alt||'img',src:String(img.currentSrc||img.src||'').split('/').pop()?.slice(0,100)||''},'error');},true);
document.addEventListener('load',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;if(!/rotinaCat3d|gato|cachorro|dog/i.test(`${img.id} ${img.alt}`))return;window.rotinaLog('imagem.carregada',{imagem:img.id||img.alt||'img',naturalW:img.naturalWidth,naturalH:img.naturalHeight});setTimeout(()=>logScreen('imagem_mascote_carregada',true),60);},true);

// Falhas e lentidão de rede, sem registrar corpo de requisição ou dados pessoais.
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const start=performance.now();const url=typeof input==='string'?input:input?.url||'';const short=String(url).split('?')[0].split('/').slice(-2).join('/').slice(0,120);
  try{const r=await originalFetch(input,init);const ms=Math.round(performance.now()-start);if(!r.ok)window.rotinaLog('rede.http_erro',{recurso:short,status:r.status,tempoMs:ms},'warning');else if(ms>1800&&!String(url).includes('/app-log'))window.rotinaLog('rede.http_lento',{recurso:short,status:r.status,tempoMs:ms},'warning');return r;}catch(e){if(!String(url).includes('/app-log'))window.rotinaLog('rede.fetch_falhou',{recurso:short,mensagem:e?.message||String(e),tempoMs:Math.round(performance.now()-start)},'error');throw e;}
};

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>window.rotinaLog('service_worker.controllerchange',{controlado:!!navigator.serviceWorker.controller}));
  navigator.serviceWorker.ready.then(reg=>window.rotinaLog('service_worker.pronto',{ativo:!!reg.active,waiting:!!reg.waiting,installing:!!reg.installing})).catch(()=>{});
}
for (const eventName of ['rotina-client-session-ready','rotina-admin-session-ready','rotina-family-alarm-sync','rotina-family-alarm-stop-sync','rotina-family-tasks-rendered','rotina-family-points-updated','rotina-task-zero','rotina-mascote-alterado']) {
  window.addEventListener(eventName, event => {window.rotinaLog(`evento.${eventName}`, event.detail || {});setTimeout(()=>logScreen(`evento_${eventName}`,true),60);});
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => {window.rotinaLog('app.iniciado');setTimeout(()=>logScreen('inicio',true),120);}, { once: true });
else {window.rotinaLog('app.iniciado');setTimeout(()=>logScreen('inicio',true),120);}
setInterval(()=>{logScreen('periodico');flush();},5000);
scheduleFlush(1800);
