const PARTICIPANT_SYNC_SCHEDULER_VERSION=4;
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
let sessionGeneration=0;

const clean=value=>String(value||'').trim();
const normalizedGroup=value=>clean(value).toUpperCase();
const scopeKey=({grupoId='',perfilId=''}={})=>`${normalizedGroup(grupoId)}::${clean(perfilId)}`;
const isBootstrapReason=reason=>['start-initial','session-ready','alarm-store-initial','session-authoritative'].includes(clean(reason));
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,syncSchedulerVersion:PARTICIPANT_SYNC_SCHEDULER_VERSION},level);}catch{}};

function scope(){
  const snap=window.rotinaParticipantStore?.snapshot?.()||{};
  return{
    grupoId:normalizedGroup(snap.grupoId||localStorage.getItem('cliente_grupo')),
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

function applyBundle(bundle,reason,expectedScope,expectedGeneration){
  const store=window.rotinaParticipantStore;
  if(!store||!bundle)return false;
  const currentScope=scope();
  if(expectedGeneration!==sessionGeneration||scopeKey(currentScope)!==scopeKey(expectedScope)){
    log('sync.resposta_descartada_sessao_antiga',{reason,esperado:scopeKey(expectedScope),atual:scopeKey(currentScope)},'warning');
    return false;
  }
  const current=store.snapshot?.()||{};
  const tarefas=Array.isArray(bundle.tarefas)?bundle.tarefas:[];
  const desafios=[...(Array.isArray(bundle.desafiosPerfil)?bundle.desafiosPerfil:[]),...(Array.isArray(bundle.desafiosTodos)?bundle.desafiosTodos:[])];
  const next={
    ...current,
    grupoId:expectedScope.grupoId,
    perfilId:expectedScope.perfilId,
    tarefasTodas:tarefas,
    tarefasHoje:[],
    historico:Array.isArray(bundle.historico)?bundle.historico:[],
    recompensas:Array.isArray(bundle.recompensas)?bundle.recompensas:[],
    resgates:Array.isArray(bundle.resgates)?bundle.resgates:[],
    desafios,
    despertadores:Array.isArray(bundle.despertadores)?bundle.despertadores:[],
    regraAtraso:bundle.config?.regraAtraso||current.regraAtraso,
    ultimaSincronizacaoServidor:Date.now()
  };
  store.replace?.(next,{source:reason,server:true,failures:bundle.failures||0,reason});
  try{window.rotinaParticipantApplyStoreToLegacy?.(store.snapshot?.(),reason);}catch(error){log('sync.ui_adapter_erro',{reason,mensagem:String(error?.message||error)},'warning');}
  return true;
}

async function executeServerRead(reason,runScope,generation){
  const repository=window.rotinaFirebaseRepository;
  if(!repository?.readParticipantBundle||!runScope.grupoId||!runScope.perfilId){
    log('sync.adiado_sem_contexto',{reason,grupo:!!runScope.grupoId,perfil:!!runScope.perfilId},'warning');
    return false;
  }
  const startedAt=performance.now();
  const bundle=await repository.readParticipantBundle({grupoId:runScope.grupoId,perfilId:runScope.perfilId,source:'server',includeHistory:true,includeAlarms:true});
  const applied=applyBundle(bundle,'scheduler-server-sync',runScope,generation);
  if(!applied)return false;
  lastRunAt=Date.now();
  lastReason=reason;
  log('sync.concluido',{reason,failures:bundle.failures||0,tempoMs:Math.round(performance.now()-startedAt),owner:'central',scope:scopeKey(runScope)});
  return true;
}

async function run(reason='timer'){
  if(!started)return false;
  if(running){
    const nextReason=clean(reason)||'coalescido';
    if(isBootstrapReason(nextReason)){log('sync.coalescido',{reason:nextReason,satisfeitoPelaExecucaoAtual:true,owner:'central'});return false;}
    pendingReason=nextReason;log('sync.coalescido',{reason:pendingReason,owner:'central'});return false;
  }
  if(navigator.onLine===false){log('sync.adiado_offline',{reason},'warning');schedule(DEFAULT_INTERVAL_MS,'offline-retry');return false;}
  const runScope=scope();
  const generation=sessionGeneration;
  running=true;clearTimer();
  try{return await executeServerRead(reason,runScope,generation)}
  catch(error){log('sync.erro',{reason,mensagem:String(error?.message||error),scope:scopeKey(runScope)},'error');return false;}
  finally{running=false;const next=pendingReason;pendingReason='';if(next)schedule(250,`coalescido:${next}`);else schedule(DEFAULT_INTERVAL_MS,'post-sync');}
}

async function prepareSession({grupoId='',perfilId=''}={}){
  const nextScope={grupoId:normalizedGroup(grupoId),perfilId:clean(perfilId)};
  if(!nextScope.grupoId||!nextScope.perfilId)throw new Error('Sessão do participante sem grupo ou perfil.');
  sessionGeneration+=1;
  pendingReason='';
  clearTimer();
  window.rotinaParticipantStore?.setSession?.(nextScope,{hydrateAlarmCache:false});
  log('sync.sessao_preparada',{scope:scopeKey(nextScope),generation:sessionGeneration,serverFirst:true});
  if(!started)start({initialSchedule:false});
  while(running)await new Promise(resolve=>setTimeout(resolve,25));
  const generation=sessionGeneration;
  running=true;
  try{
    const ok=await executeServerRead('session-authoritative',nextScope,generation);
    if(!ok)throw new Error('Não foi possível carregar os dados atuais do participante.');
    return true;
  }finally{
    running=false;
    schedule(DEFAULT_INTERVAL_MS,'post-session-authoritative');
  }
}

function reset(reason='server-activity'){if(!started)return false;log('sync.reset',{reason,owner:'central'});return schedule(DEFAULT_INTERVAL_MS,reason);}

function start(options={}){
  if(started)return false;
  started=true;
  onlineHandler=()=>schedule(1200,'online');
  visibilityHandler=()=>{if(document.visibilityState==='visible'&&lastRunAt&&Date.now()-lastRunAt>=DEFAULT_INTERVAL_MS)schedule(1200,'visible-stale');};
  requestSyncHandler=event=>{const reason=clean(event?.detail?.motivo)||'solicitado';if(running){if(isBootstrapReason(reason)){log('sync.coalescido',{reason,satisfeitoPelaExecucaoAtual:true,owner:'central'});return;}pendingReason=reason;return;}if(isBootstrapReason(reason)&&lastRunAt&&Date.now()-lastRunAt<BOOT_COALESCE_WINDOW_MS)return;run(reason);};
  window.addEventListener('online',onlineHandler);document.addEventListener('visibilitychange',visibilityHandler);window.addEventListener('rotina-request-sync',requestSyncHandler);
  if(options.initialSchedule!==false)schedule(350,'start-initial');
  log('sync.pronto',{intervalMs:DEFAULT_INTERVAL_MS,modo:'server-first-session-isolated'});
  window.dispatchEvent(new CustomEvent('rotina-participant-sync-ready',{detail:{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,intervalMs:DEFAULT_INTERVAL_MS,owner:'central'}}));
  return true;
}

function stop(){started=false;sessionGeneration+=1;clearTimer();pendingReason='';if(onlineHandler)window.removeEventListener('online',onlineHandler);if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);if(requestSyncHandler)window.removeEventListener('rotina-request-sync',requestSyncHandler);onlineHandler=null;visibilityHandler=null;requestSyncHandler=null;log('sync.parado',{});return true;}
function status(){return{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,started,running,lastRunAt,nextRunAt,lastReason,pendingReason,intervalMs:DEFAULT_INTERVAL_MS,owner:'central',sessionGeneration,scope:scopeKey(scope())};}

const api=Object.freeze({version:PARTICIPANT_SYNC_SCHEDULER_VERSION,start,stop,run,reset,prepareSession,status});
window.rotinaParticipantSyncScheduler=api;window.__rotinaParticipantSyncSchedulerVersion=PARTICIPANT_SYNC_SCHEDULER_VERSION;
window.addEventListener('rotina-participant-server-activity',event=>reset(event.detail?.reason||'server-activity'));
window.addEventListener('rotina-client-session-ready',()=>{if(!started)start({initialSchedule:false});});
window.addEventListener('rotina-firebase-repository-ready',()=>{});
log('sync.modulo_pronto',{modo:'aguarda-sessao-autoritativa'});
