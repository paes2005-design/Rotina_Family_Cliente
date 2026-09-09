import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,collection,query,where,doc,
  getDocsFromCache,getDocsFromServer,getDocFromCache,getDocFromServer,
  updateDoc,setDoc,writeBatch,serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const REPOSITORY_VERSION=1;
const clean=value=>String(value||'').trim();
const group=value=>clean(value).toUpperCase();
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,firebaseRepositoryVersion:REPOSITORY_VERSION},level);}catch{}};

function database(){
  if(!getApps().length)throw new Error('Firebase ainda não foi iniciado.');
  return getFirestore(getApp());
}

function sourceReaders(source='cache'){
  if(source==='server')return{collection:getDocsFromServer,document:getDocFromServer,server:true};
  if(source==='cache')return{collection:getDocsFromCache,document:getDocFromCache,server:false};
  throw new Error(`Fonte inválida do Repository: ${source}`);
}

function docsToItems(snapshot){
  if(!snapshot?.docs)return[];
  return snapshot.docs.map(item=>({id:item.id,...item.data()}));
}

async function settle(label,promise){
  try{return{label,status:'fulfilled',value:await promise,error:null};}
  catch(error){return{label,status:'rejected',value:null,error};}
}

function participantQueries(db,grupoId,perfilId){
  return{
    tarefas:query(collection(db,'tarefas'),where('grupoId','==',grupoId),where('perfilId','==',perfilId)),
    historico:query(collection(db,'historico'),where('grupoId','==',grupoId),where('perfilId','==',perfilId)),
    recompensas:query(collection(db,'recompensas'),where('grupoId','==',grupoId)),
    resgates:query(collection(db,'resgates'),where('grupoId','==',grupoId),where('perfilId','==',perfilId)),
    desafiosPerfil:query(collection(db,'conquistas'),where('grupoId','==',grupoId),where('perfilId','==',perfilId)),
    desafiosTodos:query(collection(db,'conquistas'),where('grupoId','==',grupoId),where('perfilId','==','__ALL__')),
    despertadores:query(collection(db,'despertadores'),where('grupoId','==',grupoId),where('perfilId','==',perfilId)),
    config:doc(db,'configGrupos',grupoId)
  };
}

async function readParticipantBundle({grupoId,perfilId,source='cache',includeHistory=true,includeAlarms=false}={}){
  const g=group(grupoId),p=clean(perfilId);
  if(!g||!p)throw new Error('grupoId e perfilId são obrigatórios para ler os dados do participante.');
  const db=database(),readers=sourceReaders(source),q=participantQueries(db,g,p),started=performance.now();
  const jobs=[
    ['tarefas',readers.collection(q.tarefas)],
    ...(includeHistory?[['historico',readers.collection(q.historico)]]:[]),
    ['recompensas',readers.collection(q.recompensas)],
    ['resgates',readers.collection(q.resgates)],
    ['desafiosPerfil',readers.collection(q.desafiosPerfil)],
    ['desafiosTodos',readers.collection(q.desafiosTodos)],
    ['config',readers.document(q.config)],
    ...(includeAlarms?[['despertadores',readers.collection(q.despertadores)]]:[])
  ];
  const results=await Promise.all(jobs.map(([label,promise])=>settle(label,promise)));
  const byLabel=Object.fromEntries(results.map(result=>[result.label,result]));
  const failures=results.filter(result=>result.status==='rejected').length;
  const bundle={
    grupoId:g,
    perfilId:p,
    source,
    server:readers.server,
    failures,
    tarefas:byLabel.tarefas?.status==='fulfilled'?docsToItems(byLabel.tarefas.value):null,
    historico:byLabel.historico?.status==='fulfilled'?docsToItems(byLabel.historico.value):null,
    recompensas:byLabel.recompensas?.status==='fulfilled'?docsToItems(byLabel.recompensas.value):null,
    resgates:byLabel.resgates?.status==='fulfilled'?docsToItems(byLabel.resgates.value):null,
    desafiosPerfil:byLabel.desafiosPerfil?.status==='fulfilled'?docsToItems(byLabel.desafiosPerfil.value):null,
    desafiosTodos:byLabel.desafiosTodos?.status==='fulfilled'?docsToItems(byLabel.desafiosTodos.value):null,
    config:byLabel.config?.status==='fulfilled'?(byLabel.config.value.exists()?{id:byLabel.config.value.id,...byLabel.config.value.data()}:null):null,
    despertadores:byLabel.despertadores?.status==='fulfilled'?docsToItems(byLabel.despertadores.value):null,
    results,
    elapsedMs:Math.round(performance.now()-started)
  };
  log('repository.bundle_lido',{source,server:readers.server,includeHistory,includeAlarms,failures,tempoMs:bundle.elapsedMs});
  return bundle;
}

async function readTask(id,{source='cache',grupoId='',perfilId=''}={}){
  const taskId=clean(id);if(!taskId)throw new Error('ID da tarefa é obrigatório.');
  const db=database(),readers=sourceReaders(source),snap=await readers.document(doc(db,'tarefas',taskId));
  if(!snap.exists())return null;
  const value={id:snap.id,...snap.data()};
  const g=group(grupoId),p=clean(perfilId);
  if(g&&group(value.grupoId)!==g)return null;
  if(p&&clean(value.perfilId)!==p)return null;
  return value;
}

async function readTaskCacheThenServer(id,scope={}){
  try{
    const cached=await readTask(id,{...scope,source:'cache'});
    if(cached)return{value:cached,source:'cache'};
  }catch{}
  if(navigator.onLine===false)return{value:null,source:'offline'};
  const value=await readTask(id,{...scope,source:'server'});
  return{value,source:'server'};
}

async function readGroupConfig(grupoId,{source='cache'}={}){
  const g=group(grupoId);if(!g)throw new Error('grupoId é obrigatório.');
  const db=database(),readers=sourceReaders(source),snap=await readers.document(doc(db,'configGrupos',g));
  return snap.exists()?{id:snap.id,...snap.data()}:null;
}

function serverActivity(reason='repository-write'){
  const detail={reason,at:Date.now(),repositoryVersion:REPOSITORY_VERSION};
  window.dispatchEvent(new CustomEvent('rotina-participant-server-activity',{detail}));
  return detail.at;
}

async function patchTask(id,patch,reason='task-patch'){
  const taskId=clean(id);if(!taskId)throw new Error('ID da tarefa é obrigatório.');
  await updateDoc(doc(database(),'tarefas',taskId),patch||{});
  window.rotinaParticipantStorePatchTask?.(taskId,patch||{},{source:reason,server:true});
  serverActivity(reason);
  return true;
}

async function mergeDocument(collectionName,id,value,reason='document-merge'){
  const name=clean(collectionName),documentId=clean(id);
  if(!name||!documentId)throw new Error('Coleção e ID são obrigatórios.');
  await setDoc(doc(database(),name,documentId),value||{},{merge:true});
  if(['historico','recompensas','resgates','desafios','despertadores'].includes(name))window.rotinaParticipantStore?.upsert?.(name,documentId,value||{},{source:reason,server:true});
  serverActivity(reason);
  return true;
}

async function replaceDocument(collectionName,id,value,reason='document-set'){
  const name=clean(collectionName),documentId=clean(id);
  if(!name||!documentId)throw new Error('Coleção e ID são obrigatórios.');
  await setDoc(doc(database(),name,documentId),value||{});
  if(['historico','recompensas','resgates','desafios','despertadores'].includes(name))window.rotinaParticipantStore?.upsert?.(name,documentId,value||{},{source:reason,server:true});
  serverActivity(reason);
  return true;
}

async function commit(operations=[],reason='batch-write'){
  if(!Array.isArray(operations)||!operations.length)return true;
  const db=database(),batch=writeBatch(db);
  for(const operation of operations){
    const action=clean(operation?.action||'set'),collectionName=clean(operation?.collection),id=clean(operation?.id);
    if(!collectionName||!id)throw new Error('Toda operação do batch precisa de collection e id.');
    const ref=doc(db,collectionName,id),data=operation?.data||{};
    if(action==='update')batch.update(ref,data);
    else if(action==='set')batch.set(ref,data,operation?.merge===true?{merge:true}:undefined);
    else throw new Error(`Ação de batch não suportada: ${action}`);
  }
  await batch.commit();
  serverActivity(reason);
  return true;
}

async function touchAlarm(id,value,reason='alarm-write'){
  return mergeDocument('despertadores',id,{...(value||{}),servidorEm:serverTimestamp()},reason);
}

const api=Object.freeze({
  version:REPOSITORY_VERSION,
  readParticipantBundle,
  readTask,
  readTaskCacheThenServer,
  readGroupConfig,
  patchTask,
  mergeDocument,
  replaceDocument,
  commit,
  touchAlarm,
  markServerActivity:serverActivity
});

window.rotinaFirebaseRepository=api;
window.__rotinaFirebaseRepositoryVersion=REPOSITORY_VERSION;
log('repository.pronto',{modo:'infraestrutura-passiva-sem-consultas-no-boot'});
window.dispatchEvent(new CustomEvent('rotina-firebase-repository-ready',{detail:{version:REPOSITORY_VERSION}}));
