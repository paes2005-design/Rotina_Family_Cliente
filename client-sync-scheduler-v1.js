const PARTICIPANT_SYNC_SCHEDULER_VERSION=1;
const DEFAULT_INTERVAL_MS=5*60*1000;

let timer=null;
let running=false;
let started=false;
let lastRunAt=0;
let nextRunAt=0;
let lastReason='';
let onlineHandler=null;
let visibilityHandler=null;

const clean=value=>String(value||'').trim();
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,syncSchedulerVersion:PARTICIPANT_SYNC_SCHEDULER_VERSION},level);}catch{}};

function scope(){
  const snap=window.rotinaParticipantStore?.snapshot?.()||{};
  return{
    grupoId:clean(snap.grupoId||localStorage.getItem('cliente_grupo')),
    perfilId:clean(snap.perfilId||localStorage.getItem('cliente_perfil_id'))
  };
}

function clearTimer(){
  if(timer){clearTimeout(timer);timer=null;}
  nextRunAt=0;
}

function schedule(delay=DEFAULT_INTERVAL_MS,reason='schedule'){
  clearTimer();
  if(!started)return false;
  const wait=Math.max(1000,Number(delay)||DEFAULT_INTERVAL_MS);
  nextRunAt=Date.now()+wait;
  timer=setTimeout(()=>run(reason),wait);
  log('sync.agendado',{reason,delayMs:wait,nextRunAt});
  return true;
}

function applyBundle(bundle,reason){
  const store=window.rotinaParticipantStore;
  if(!store||!bundle)return false;
  const current=store.snapshot?.()||{};
  const tarefas=Array.isArray(bundle.tarefas)?bundle.tarefas:current.tarefasTodas;
  const desafios=[
    ...(Array.isArray(bundle.desafiosPerfil)?bundle.desafiosPerfil:[]),
    ...(Array.isArray(bundle.desafiosTodos)?bundle.desafiosTodos:[])
  ];
  const next={
    ...current,
    grupoId:bundle.grupoId||current.grupoId,
    perfilId:bundle.perfilId||current.perfilId,
    tarefasTodas:tarefas,
    tarefasHoje:current.tarefasHoje,
    historico:Array.isArray(bundle.historico)?bundle.historico:current.historico,
    recompensas:Array.isArray(bundle.recompensas)?bundle.recompensas:current.recompensas,
    resgates:Array.isArray(bundle.resgates)?bundle.resgates:current.resgates,
    desafios:desafios.length?desafios:current.desafios,
    despertadores:Array.isArray(bundle.despertadores)?bundle.despertadores:current.despertadores,
    regraAtraso:bundle.config?.regraAtraso||current.regraAtraso,
    ultimaSincronizacaoServidor:Date.now()
  };
  store.replace?.(next,{source:reason,server:true,failures:bundle.failures||0,reason});
  return true;
}

async function run(reason='timer'){
  if(!started)return false;
  if(running){schedule(DEFAULT_INTERVAL_MS,'busy-reset');return false;}
  if(navigator.onLine===false){log('sync.adiado_offline',{reason},'warning');schedule(DEFAULT_INTERVAL_MS,'offline-retry');return false;}
  const repository=window.rotinaFirebaseRepository;
  const {grupoId,perfilId}=scope();
  if(!repository?.readParticipantBundle||!grupoId||!perfilId){
    log('sync.adiado_sem_contexto',{reason,grupo:!!grupoId,perfil:!!perfilId},'warning');
    schedule(DEFAULT_INTERVAL_MS,'context-retry');
    return false;
  }
  running=true;
  clearTimer();
  const startedAt=performance.now();
  try{
    const bundle=await repository.readParticipantBundle({
      grupoId,perfilId,source:'server',includeHistory:false,includeAlarms:true
    });
    applyBundle(bundle,'scheduler-server-sync');
    lastRunAt=Date.now();
    lastReason=reason;
    log('sync.concluido',{reason,failures:bundle.failures||0,tempoMs:Math.round(performance.now()-startedAt)});
    return true;
  }catch(error){
    log('sync.erro',{reason,mensagem:String(error?.message||error)},'error');
    return false;
  }finally{
    running=false;
    schedule(DEFAULT_INTERVAL_MS,'post-sync');
  }
}

function reset(reason='server-activity'){
  if(!started)return false;
  log('sync.reset',{reason});
  return schedule(DEFAULT_INTERVAL_MS,reason);
}

function start(){
  if(started)return false;
  started=true;
  onlineHandler=()=>schedule(1500,'online');
  visibilityHandler=()=>{if(document.visibilityState==='visible'&&lastRunAt&&Date.now()-lastRunAt>=DEFAULT_INTERVAL_MS)schedule(1500,'visible-stale');};
  window.addEventListener('online',onlineHandler);
  document.addEventListener('visibilitychange',visibilityHandler);
  schedule(DEFAULT_INTERVAL_MS,'start');
  log('sync.pronto',{intervalMs:DEFAULT_INTERVAL_MS,modo:'unico-cache-first-sem-historico-hot-sync'});
  window.dispatchEvent(new CustomEvent('rotina-participant-sync-ready',{detail:{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,intervalMs:DEFAULT_INTERVAL_MS}}));
  return true;
}

function stop(){
  started=false;
  clearTimer();
  if(onlineHandler)window.removeEventListener('online',onlineHandler);
  if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);
  onlineHandler=null;visibilityHandler=null;
  log('sync.parado',{});
  return true;
}

function status(){
  return{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,started,running,lastRunAt,nextRunAt,lastReason,intervalMs:DEFAULT_INTERVAL_MS};
}

const api=Object.freeze({version:PARTICIPANT_SYNC_SCHEDULER_VERSION,start,stop,run,reset,status});
window.rotinaParticipantSyncScheduler=api;
window.__rotinaParticipantSyncSchedulerVersion=PARTICIPANT_SYNC_SCHEDULER_VERSION;

window.addEventListener('rotina-participant-server-activity',event=>reset(event.detail?.reason||'server-activity'));
window.addEventListener('rotina-client-session-ready',()=>{if(!started)start();else reset('session-ready');});
window.addEventListener('rotina-firebase-repository-ready',()=>{if(!started&&scope().grupoId&&scope().perfilId)start();});

setTimeout(()=>{if(!started&&scope().grupoId&&scope().perfilId)start();},0);
