const PARTICIPANT_STORE_VERSION=1;

const DEFAULT_RULE=Object.freeze({dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0});
const EMPTY_STATE=()=>({
  grupoId:'',
  perfilId:'',
  tarefasTodas:[],
  tarefasHoje:[],
  historico:[],
  recompensas:[],
  resgates:[],
  desafios:[],
  despertadores:[],
  regraAtraso:{...DEFAULT_RULE},
  ultimaSincronizacaoServidor:0,
  metadata:{source:'boot',updatedAt:0,server:false}
});

let state=EMPTY_STATE();
let legacyReader=null;
let adopting=false;
const listeners=new Set();

const clean=value=>String(value||'').trim();
const clone=value=>{
  if(value===undefined)return undefined;
  if(typeof structuredClone==='function'){
    try{return structuredClone(value);}catch{}
  }
  try{return JSON.parse(JSON.stringify(value));}catch{return value;}
};
const array=value=>Array.isArray(value)?value.map(item=>clone(item)):[];
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,participantStoreVersion:PARTICIPANT_STORE_VERSION},level);}catch{}};

function normalizeSnapshot(input={},metadata={}){
  const source=input&&typeof input==='object'?input:{};
  return {
    grupoId:clean(source.grupoId||state.grupoId),
    perfilId:clean(source.perfilId||state.perfilId),
    tarefasTodas:array(source.tarefasTodas),
    tarefasHoje:array(source.tarefasHoje),
    historico:array(source.historico),
    recompensas:array(source.recompensas),
    resgates:array(source.resgates),
    desafios:array(source.desafios),
    despertadores:array(source.despertadores),
    regraAtraso:{...DEFAULT_RULE,...clone(source.regraAtraso||{})},
    ultimaSincronizacaoServidor:Number(source.ultimaSincronizacaoServidor)||0,
    metadata:{
      source:clean(metadata.source||source.metadata?.source||'replace'),
      updatedAt:Date.now(),
      server:metadata.server===true||source.metadata?.server===true,
      failures:Number(metadata.failures??source.metadata?.failures??0)||0
    }
  };
}

function snapshot(){return clone(state);}

function notify(reason='update',detail={}){
  const snap=snapshot();
  for(const listener of [...listeners]){
    try{listener(snap,{reason,...detail});}catch(error){log('store.listener_erro',{reason,mensagem:String(error?.message||error)},'warning');}
  }
  window.dispatchEvent(new CustomEvent('rotina-participant-store-updated',{detail:{reason,storeVersion:PARTICIPANT_STORE_VERSION,...detail}}));
}

function replace(next={},options={}){
  state=normalizeSnapshot(next,{source:options.source||'replace',server:options.server===true,failures:options.failures||0});
  if(options.emit!==false)notify(options.reason||options.source||'replace',{server:options.server===true,failures:Number(options.failures)||0});
  return snapshot();
}

function setSession({grupoId='',perfilId=''}={}){
  const g=clean(grupoId),p=clean(perfilId);
  if(g===state.grupoId&&p===state.perfilId)return snapshot();
  state={...state,grupoId:g,perfilId:p,metadata:{...state.metadata,source:'session',updatedAt:Date.now()}};
  notify('session',{grupoId:g,perfilId:p});
  return snapshot();
}

function patchTask(id,patch={},options={}){
  const taskId=clean(id);if(!taskId)return false;
  const apply=list=>list.map(item=>clean(item?.id)===taskId?{...item,...clone(patch)}:item);
  state={...state,tarefasTodas:apply(state.tarefasTodas),tarefasHoje:apply(state.tarefasHoje),metadata:{...state.metadata,source:options.source||'task-patch',updatedAt:Date.now(),server:options.server===true}};
  notify(options.reason||'task-patch',{taskId,server:options.server===true});
  return true;
}

function upsert(collectionName,id,value={},options={}){
  const allowed=new Set(['historico','recompensas','resgates','desafios','despertadores']);
  if(!allowed.has(collectionName))throw new Error(`Coleção não suportada pelo Store: ${collectionName}`);
  const itemId=clean(id||value?.id);if(!itemId)return false;
  const list=state[collectionName]||[];
  const index=list.findIndex(item=>clean(item?.id)===itemId);
  const next=[...list];
  const normalized={...(index>=0?next[index]:{}),...clone(value),id:itemId};
  if(index>=0)next[index]=normalized;else next.push(normalized);
  state={...state,[collectionName]:next,metadata:{...state.metadata,source:options.source||`${collectionName}-upsert`,updatedAt:Date.now(),server:options.server===true}};
  notify(options.reason||`${collectionName}-upsert`,{collection:collectionName,id:itemId,server:options.server===true});
  return true;
}

function setCollection(collectionName,items=[],options={}){
  const allowed=new Set(['tarefasTodas','tarefasHoje','historico','recompensas','resgates','desafios','despertadores']);
  if(!allowed.has(collectionName))throw new Error(`Coleção não suportada pelo Store: ${collectionName}`);
  state={...state,[collectionName]:array(items),metadata:{...state.metadata,source:options.source||`${collectionName}-replace`,updatedAt:Date.now(),server:options.server===true}};
  notify(options.reason||`${collectionName}-replace`,{collection:collectionName,server:options.server===true});
  return snapshot();
}

function markServerActivity(at=Date.now(),reason='server-activity'){
  const timestamp=Number(at)||Date.now();
  state={...state,ultimaSincronizacaoServidor:timestamp,metadata:{...state.metadata,source:reason,updatedAt:Date.now(),server:true}};
  notify(reason,{server:true,serverAt:timestamp});
  return timestamp;
}

function subscribe(listener,{immediate=false}={}){
  if(typeof listener!=='function')throw new TypeError('Listener do ParticipantStore precisa ser função.');
  listeners.add(listener);
  if(immediate){try{listener(snapshot(),{reason:'subscribe'});}catch{}}
  return()=>listeners.delete(listener);
}

function captureLegacyReader(){
  const candidate=window.rotinaClientCacheSnapshot;
  if(typeof candidate==='function'&&candidate!==snapshot&&candidate!==window.rotinaParticipantStoreSnapshot)legacyReader=candidate;
  return legacyReader;
}

function adoptLegacy(reason='legacy-cache',detail={}){
  if(adopting)return false;
  const reader=captureLegacyReader();
  if(typeof reader!=='function')return false;
  adopting=true;
  try{
    const legacy=reader();
    if(!legacy||typeof legacy!=='object')return false;
    replace(legacy,{source:reason,server:detail?.servidor===true,failures:detail?.falhas||0,reason,emit:true});
    return true;
  }catch(error){
    log('store.legacy_adocao_erro',{reason,mensagem:String(error?.message||error)},'warning');
    return false;
  }finally{adopting=false;}
}

const api=Object.freeze({
  version:PARTICIPANT_STORE_VERSION,
  snapshot,
  replace,
  setSession,
  patchTask,
  upsert,
  setCollection,
  markServerActivity,
  subscribe,
  adoptLegacy
});

window.rotinaParticipantStore=api;
window.rotinaParticipantStoreSnapshot=snapshot;
window.rotinaParticipantStorePatchTask=patchTask;
window.rotinaParticipantStoreMarkServerActivity=markServerActivity;

window.addEventListener('rotina-client-session-ready',event=>{
  setSession({grupoId:event.detail?.grupo||localStorage.getItem('cliente_grupo'),perfilId:event.detail?.perfilId||localStorage.getItem('cliente_perfil_id')});
  queueMicrotask(()=>adoptLegacy('session-ready',{}));
});
window.addEventListener('rotina-client-cache-updated',event=>adoptLegacy(event.detail?.origem||'legacy-cache',event.detail||{}));
window.addEventListener('rotina-participant-server-activity',event=>markServerActivity(event.detail?.at||Date.now(),event.detail?.reason||'repository-write'));

setTimeout(()=>{
  setSession({grupoId:localStorage.getItem('cliente_grupo'),perfilId:localStorage.getItem('cliente_perfil_id')});
  adoptLegacy('boot-adopt',{});
},0);

log('store.pronto',{modo:'compatibilidade-sem-novas-leituras'});
window.dispatchEvent(new CustomEvent('rotina-participant-store-ready',{detail:{version:PARTICIPANT_STORE_VERSION}}));
