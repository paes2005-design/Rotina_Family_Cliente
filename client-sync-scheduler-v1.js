const PARTICIPANT_SYNC_SCHEDULER_VERSION=3;
const DEFAULT_INTERVAL_MS=5*60*1000;
const BOOT_COALESCE_WINDOW_MS=10*1000;

let timer=null;
let running=false;
let started=false;
let lastRunAt=0;
let nextRunAt=0;
let lastReason='';
let pendingReason='';
let onlineHandler=null;
let visibilityHandler=null;
let requestSyncHandler=null;

const clean=value=>String(value||'').trim();
const isBootstrapReason=reason=>['start-initial','session-ready','alarm-store-initial'].includes(clean(reason));
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
  const wait=Math.max(100,Number(delay)||DEFAULT_INTERVAL_MS);
  nextRunAt=Date.now()+wait;
  timer=setTimeout(()=>run(reason),wait);
  log('sync.agendado',{reason,delayMs:wait,nextRunAt,owner:'central'});
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
  try{window.rotinaParticipantApplyStoreToLegacy?.(store.snapshot?.(),reason);}catch(error){log('sync.ui_adapter_erro',{reason,mensagem:String(error?.message||error)},'warning');}
  return true;
}

async function run(reason='timer'){
  if(!started)return false;
  if(running){
    const nextReason=clean(reason)||'coalescido';
    if(isBootstrapReason(nextReason)){
      log('sync.coalescido',{reason:nextReason,satisfeitoPelaExecucaoAtual:true,owner:'central'});
      return false;
    }
    pendingReason=nextReason;
    log('sync.coalescido',{reason:pendingReason,owner:'central'});
    return false;
  }
  if(navigator.onLine===false){log('sync.adiado_offline',{reason},'warning');schedule(DEFAULT_INTERVAL_MS,'offline-retry');return false;}
  const repository=window.rotinaFirebaseRepository;
  const {grupoId,perfilId}=scope();
  if(!repository?.readParticipantBundle||!grupoId||!perfilId){
    log('sync.adiado_sem_contexto',{reason,grupo:!!grupoId,perfil:!!perfilId},'warning');
    schedule(1500,'context-retry');
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
    log('sync.concluido',{reason,failures:bundle.failures||0,tempoMs:Math.round(performance.now()-startedAt),owner:'central'});
    return true;
  }catch(error){
    log('sync.erro',{reason,mensagem:String(error?.message||error)},'error');
    return false;
  }finally{
    running=false;
    const next=pendingReason;pendingReason='';
    if(next)schedule(250,`coalescido:${next}`);
    else schedule(DEFAULT_INTERVAL_MS,'post-sync');
  }
}

function reset(reason='server-activity'){
  if(!started)return false;
  log('sync.reset',{reason,owner:'central'});
  return schedule(DEFAULT_INTERVAL_MS,reason);
}

function start(){
  if(started)return false;
  started=true;
  onlineHandler=()=>schedule(1200,'online');
  visibilityHandler=()=>{if(document.visibilityState==='visible'&&lastRunAt&&Date.now()-lastRunAt>=DEFAULT_INTERVAL_MS)schedule(1200,'visible-stale');};
  requestSyncHandler=event=>{
    const reason=clean(event?.detail?.motivo)||'solicitado';
    if(running){
      if(isBootstrapReason(reason)){log('sync.coalescido',{reason,satisfeitoPelaExecucaoAtual:true,owner:'central'});return;}
      pendingReason=reason;log('sync.coalescido',{reason,owner:'central'});return;
    }
    if(isBootstrapReason(reason)&&lastRunAt&&Date.now()-lastRunAt<BOOT_COALESCE_WINDOW_MS){
      log('sync.ignorado_recente',{reason,idadeMs:Date.now()-lastRunAt,owner:'central'});return;
    }
    run(reason);
  };
  window.addEventListener('online',onlineHandler);
  document.addEventListener('visibilitychange',visibilityHandler);
  window.addEventListener('rotina-request-sync',requestSyncHandler);
  schedule(350,'start-initial');
  log('sync.pronto',{intervalMs:DEFAULT_INTERVAL_MS,modo:'owner-central-unico-cache-first-sem-historico-hot-sync'});
  window.dispatchEvent(new CustomEvent('rotina-participant-sync-ready',{detail:{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,intervalMs:DEFAULT_INTERVAL_MS,owner:'central'}}));
  return true;
}

function stop(){
  started=false;
  clearTimer();
  pendingReason='';
  if(onlineHandler)window.removeEventListener('online',onlineHandler);
  if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);
  if(requestSyncHandler)window.removeEventListener('rotina-request-sync',requestSyncHandler);
  onlineHandler=null;visibilityHandler=null;requestSyncHandler=null;
  log('sync.parado',{});
  return true;
}

function status(){
  return{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,started,running,lastRunAt,nextRunAt,lastReason,pendingReason,intervalMs:DEFAULT_INTERVAL_MS,owner:'central'};
}

const api=Object.freeze({version:PARTICIPANT_SYNC_SCHEDULER_VERSION,start,stop,run,reset,status});
window.rotinaParticipantSyncScheduler=api;
window.__rotinaParticipantSyncSchedulerVersion=PARTICIPANT_SYNC_SCHEDULER_VERSION;

window.addEventListener('rotina-participant-server-activity',event=>reset(event.detail?.reason||'server-activity'));
window.addEventListener('rotina-client-session-ready',()=>{
  if(!started){start();return;}
  if(running){log('sync.coalescido',{reason:'session-ready',satisfeitoPelaExecucaoAtual:true,owner:'central'});return;}
  const idadeMs=lastRunAt?Date.now()-lastRunAt:Number.POSITIVE_INFINITY;
  if(idadeMs<BOOT_COALESCE_WINDOW_MS){log('sync.ignorado_recente',{reason:'session-ready',idadeMs,owner:'central'});return;}
  schedule(350,'session-ready');
});
window.addEventListener('rotina-firebase-repository-ready',()=>{if(!started&&scope().grupoId&&scope().perfilId)start();});

setTimeout(()=>{if(!started&&scope().grupoId&&scope().perfilId)start();},0);
