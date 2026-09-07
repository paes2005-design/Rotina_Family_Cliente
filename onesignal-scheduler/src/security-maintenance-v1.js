import { firestoreFieldsToJs, jsToFirestoreFields, weekStartInZone } from './core.js';

export const SECURITY_MAINTENANCE_VERSION = 2;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COMMERCIAL_FIELDS = Object.freeze([
  'trialVersao','trialAtivo','trialDias','trialInicioEm','trialFimEm',
  'grupoConfirmado','grupoBloqueado','bloqueioManual','bloqueioAtualizadoEm',
  'confirmadoEm','confirmadoPorMaster','bloqueadoEm','desbloqueadoEm'
]);
let tokenCache = { value: '', expiresAt: 0, email: '' };
let migrationRunning = null;
let resetRunning = null;
let lastWeeklyResetChecked = '';

const required = (value, name) => { if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`); return value; };
const docId = name => String(name || '').split('/').at(-1) || '';

function base64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,'');
}
function encodeJson(value) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function pemBytes(pem) {
  const normalized = String(pem || '').replaceAll('\\n','\n').replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s/g,'');
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function credentials(env) {
  const value = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON'));
  required(value.client_email, 'client_email'); required(value.private_key, 'private_key');
  return value;
}
async function googleToken(env, now = new Date()) {
  const c = credentials(env);
  if (tokenCache.value && tokenCache.email === c.client_email && tokenCache.expiresAt > now.getTime() + 60_000) return tokenCache.value;
  const iat = Math.floor(now.getTime()/1000);
  const unsigned = `${encodeJson({alg:'RS256',typ:'JWT'})}.${encodeJson({iss:c.client_email,sub:c.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:GOOGLE_TOKEN_URL,iat,exp:iat+3600})}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(c.private_key), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const body = await response.json().catch(()=>({}));
  if (!response.ok || !body.access_token) throw new Error(`OAuth Google recusado (${response.status}).`);
  tokenCache = {value:body.access_token,email:c.client_email,expiresAt:now.getTime()+Number(body.expires_in||3600)*1000};
  return tokenCache.value;
}
function base(env) { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(required(env.FIREBASE_PROJECT_ID,'FIREBASE_PROJECT_ID'))}/databases/(default)/documents`; }
async function fsRequest(env, url, options = {}, now = new Date()) {
  return fetch(url, {...options,headers:{authorization:`Bearer ${await googleToken(env,now)}`,...(options.headers||{})}});
}
async function getDoc(env, collectionId, id, now = new Date()) {
  const response = await fsRequest(env, `${base(env)}/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}`, {}, now);
  if (response.status === 404) return null;
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(`Leitura ${collectionId}/${id} recusada (${response.status}).`);
  return {name:body.name,data:firestoreFieldsToJs(body.fields||{})||{}};
}
async function listCollection(env, collectionId, now = new Date()) {
  const result = [];
  let pageToken = '';
  do {
    const url = new URL(`${base(env)}/${encodeURIComponent(collectionId)}`);
    url.searchParams.set('pageSize','300');
    if (pageToken) url.searchParams.set('pageToken',pageToken);
    const response = await fsRequest(env,url.toString(),{},now);
    const body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(`Listagem ${collectionId} recusada (${response.status}).`);
    for (const doc of body.documents || []) result.push({name:doc.name,data:firestoreFieldsToJs(doc.fields||{})||{}});
    pageToken = String(body.nextPageToken || '');
  } while (pageToken);
  return result;
}
async function upsert(env, collectionId, id, data, now = new Date()) {
  const url = new URL(`${base(env)}/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}`);
  for (const field of Object.keys(data)) url.searchParams.append('updateMask.fieldPaths',field);
  const response = await fsRequest(env,url.toString(),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:jsToFirestoreFields(data)})},now);
  if (!response.ok) throw new Error(`Gravação ${collectionId}/${id} recusada (${response.status}).`);
}
async function deleteFields(env, collectionId, id, fields, now = new Date()) {
  if (!fields.length) return;
  const url = new URL(`${base(env)}/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}`);
  for (const field of fields) url.searchParams.append('updateMask.fieldPaths',field);
  const response = await fsRequest(env,url.toString(),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{}})},now);
  if (!response.ok) throw new Error(`Limpeza ${collectionId}/${id} recusada (${response.status}).`);
}
async function commitPatches(env, writes, now = new Date()) {
  for (let i=0;i<writes.length;i+=400) {
    const chunk = writes.slice(i,i+400);
    const response = await fsRequest(env,`${base(env).replace(/\/documents$/,'')}/documents:commit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({writes:chunk})},now);
    if (!response.ok) throw new Error(`Commit de manutenção recusado (${response.status}).`);
  }
}

async function migrateCommercialState(env, now = new Date()) {
  const marker = await getDoc(env,'systemMigrations','commercial-state-v1',now);
  if (marker?.data?.concluida === true) return {ok:true,skipped:true,migrated:Number(marker.data.migrados||0)};
  const configs = await listCollection(env,'configGrupos',now);
  let migrated = 0;
  for (const config of configs) {
    const groupId = String(config.data.grupoId || docId(config.name)).trim().toUpperCase();
    if (!groupId) continue;
    const present = COMMERCIAL_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(config.data,field));
    if (!present.length) continue;
    const commercial = {grupoId:groupId, atualizadoEmMigracao:now.toISOString()};
    for (const field of present) commercial[field] = config.data[field];
    await upsert(env,'estadoComercial',groupId,commercial,now);
    await deleteFields(env,'configGrupos',groupId,present,now);
    migrated += 1;
  }
  await upsert(env,'systemMigrations','commercial-state-v1',{concluida:true,migrados:migrated,concluidaEm:now.toISOString()},now);
  console.log(JSON.stringify({event:'security.commercial_state_migrated',migrated}));
  return {ok:true,migrated};
}

function localParts(date,timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function localDateKey(date,timeZone) {
  const parts = localParts(date,timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function taskExecutionDate(task,timeZone) {
  const direct = String(task?.dataExecucao || '').slice(0,10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  for (const raw of [task?.inicioExecutadoEm,task?.terminoExecutadoEm]) {
    const parsed = new Date(String(raw || ''));
    if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed,timeZone);
  }
  return '';
}
function taskNeedsWeeklyReset(task,weekKey,timeZone) {
  const executionDate = taskExecutionDate(task,timeZone);
  if (executionDate && executionDate >= weekKey) return false;
  const status = String(task?.status || '').trim();
  if (status && status !== 'Pendente') return true;
  return Boolean(
    task?.horarioInicio || task?.horarioTermino || task?.inicioExecutadoEm || task?.terminoExecutadoEm ||
    task?.dataExecucao || Number(task?.pontosGanhos||0) || Number(task?.pontosOriginais||0) ||
    task?.faixaAtraso || task?.justificativaAtraso || task?.tipoJustificativa ||
    task?.iniciouComAtraso === true || task?.iniciouAposLimiteFinal === true || task?.inicioAntecipado === true
  );
}
function weeklyResetFields() {
  return {
    status:'Pendente',
    horarioInicio:'',horarioTermino:'',inicioExecutadoEm:'',terminoExecutadoEm:'',dataExecucao:'',
    pontosGanhos:0,pontosOriginais:0,percentualAplicado:null,percentualOriginal:null,
    faixaAtraso:'',toleranciaConsumidaMin:0,toleranciaConsumidaSeg:0,atrasoInicioMin:0,atrasoFimMin:0,
    minutosAlemTolerancia:null,faixaLeveMinutos:null,limite75Min:null,limite50Min:null,limite75Seg:null,limite50Seg:null,
    iniciouComAtraso:false,iniciouAposLimiteFinal:false,inicioAntecipado:false,antecipacaoMin:0,
    motivoInicioAntecipado:'',tipoMotivoInicioAntecipado:'',justificativaAtraso:'',tipoJustificativa:'',justificativaRecusada:false,
    revisaoStatus:'sem-revisao'
  };
}
async function weeklyReset(env, now = new Date()) {
  const timeZone = env.ALARM_TIME_ZONE || 'America/Bahia';
  const weekKey = weekStartInZone(now,timeZone);
  if (lastWeeklyResetChecked === weekKey) return {ok:true,skipped:true,reason:'memory',weekKey};

  const parts = localParts(now,timeZone);
  const minute = Number(parts.minute);
  const normalWindow = parts.weekday === 'Mon' && Number(parts.hour) === 0 && minute <= 10;
  const catchUpSlot = minute % 5 === 0;
  if (!normalWindow && !catchUpSlot) return {ok:true,skipped:true,reason:'schedule',weekKey};

  const markerId = `weekly-reset-${weekKey}`;
  const marker = await getDoc(env,'systemMaintenance',markerId,now);
  if (marker?.data?.concluida === true) {
    lastWeeklyResetChecked = weekKey;
    return {ok:true,skipped:true,reason:'marker',weekKey};
  }

  const docs = await listCollection(env,'tarefas',now);
  const fields = weeklyResetFields();
  const writes = [];
  let preservedCurrentWeek = 0;
  for (const task of docs) {
    if (!taskNeedsWeeklyReset(task.data,weekKey,timeZone)) {
      if (taskExecutionDate(task.data,timeZone) >= weekKey) preservedCurrentWeek += 1;
      continue;
    }
    writes.push({
      update:{name:task.name,fields:jsToFirestoreFields(fields)},
      updateMask:{fieldPaths:Object.keys(fields)}
    });
  }
  if (writes.length) await commitPatches(env,writes,now);
  await upsert(env,'systemMaintenance',markerId,{
    concluida:true,
    versao:SECURITY_MAINTENANCE_VERSION,
    semanaInicio:weekKey,
    tarefasLidas:docs.length,
    tarefasResetadas:writes.length,
    tarefasSemanaAtualPreservadas:preservedCurrentWeek,
    concluidaEm:now.toISOString()
  },now);
  lastWeeklyResetChecked = weekKey;
  console.log(JSON.stringify({event:'security.weekly_reset_server',version:SECURITY_MAINTENANCE_VERSION,weekKey,tasksRead:docs.length,tasksReset:writes.length,preservedCurrentWeek}));
  return {ok:true,weekKey,tasksRead:docs.length,tasksReset:writes.length,preservedCurrentWeek};
}

export async function runSecurityMaintenance(env, now = new Date()) {
  if (!migrationRunning) migrationRunning = migrateCommercialState(env,now).finally(()=>{migrationRunning=null;});
  const migration = await migrationRunning;
  if (!resetRunning) resetRunning = weeklyReset(env,now).finally(()=>{resetRunning=null;});
  const reset = await resetRunning;
  return {version:SECURITY_MAINTENANCE_VERSION,migration,reset};
}

export async function auditCommercialMigration(env, now = new Date()) {
  const markerDoc = await getDoc(env,'systemMigrations','commercial-state-v1',now);
  const configs = await listCollection(env,'configGrupos',now);
  let remainingLegacy = 0;
  for (const config of configs) {
    if (COMMERCIAL_FIELDS.some(field => Object.prototype.hasOwnProperty.call(config.data,field))) remainingLegacy += 1;
  }
  const markerComplete = markerDoc?.data?.concluida === true;
  return {
    ready: markerComplete && remainingLegacy === 0,
    markerComplete,
    remainingLegacy,
    migrated: Number(markerDoc?.data?.migrados || 0)
  };
}

export async function readCommercialState(env, groupId, now = new Date()) {
  const id = String(groupId || '').trim().toUpperCase();
  if (!id) return null;
  const direct = await getDoc(env,'estadoComercial',id,now);
  if (direct) return direct.data;
  const legacy = await getDoc(env,'configGrupos',id,now);
  if (!legacy) return null;
  const present = COMMERCIAL_FIELDS.filter(field=>Object.prototype.hasOwnProperty.call(legacy.data,field));
  if (!present.length) return null;
  const commercial = {grupoId:id};
  for (const field of present) commercial[field]=legacy.data[field];
  await upsert(env,'estadoComercial',id,commercial,now);
  return commercial;
}

export async function writeCommercialState(env, groupId, patch, now = new Date()) {
  const id = String(groupId || '').trim().toUpperCase();
  if (!id) throw new Error('Grupo comercial não informado.');
  await upsert(env,'estadoComercial',id,{grupoId:id,...patch},now);
  return (await getDoc(env,'estadoComercial',id,now))?.data || {grupoId:id,...patch};
}
