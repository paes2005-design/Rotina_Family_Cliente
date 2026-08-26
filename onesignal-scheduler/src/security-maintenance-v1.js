import { firestoreFieldsToJs, jsToFirestoreFields } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COMMERCIAL_FIELDS = Object.freeze([
  'trialVersao','trialAtivo','trialDias','trialInicioEm','trialFimEm',
  'grupoConfirmado','grupoBloqueado','bloqueioManual','bloqueioAtualizadoEm',
  'confirmadoEm','confirmadoPorMaster','bloqueadoEm','desbloqueadoEm'
]);
let tokenCache = { value: '', expiresAt: 0, email: '' };
let migrationRunning = null;
let resetRunning = null;

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
async function queryString(env, collectionId, field, value, now = new Date()) {
  const response = await fsRequest(env,`${base(env)}:runQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:String(value)}}},limit:500}})},now);
  const rows = await response.json().catch(()=>[]);
  if (!response.ok) throw new Error(`Consulta ${collectionId} recusada (${response.status}).`);
  return (Array.isArray(rows)?rows:[]).filter(row=>row.document).map(row=>({name:row.document.name,data:firestoreFieldsToJs(row.document.fields||{})||{}}));
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
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function sundayKey(now,timeZone) {
  const parts = localParts(now,timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
async function weeklyReset(env, now = new Date()) {
  const timeZone = env.ALARM_TIME_ZONE || 'America/Bahia';
  const parts = localParts(now,timeZone);
  if (parts.weekday !== 'Sun' || Number(parts.hour)!==0 || Number(parts.minute)>10) return {ok:true,skipped:true};
  const key = sundayKey(now,timeZone);
  const marker = await getDoc(env,'systemMaintenance',`weekly-reset-${key}`,now);
  if (marker?.data?.concluida === true) return {ok:true,skipped:true};
  const configs = await listCollection(env,'configGrupos',now);
  let groups = 0, tasks = 0;
  for (const config of configs) {
    const groupId = String(config.data.grupoId || docId(config.name)).trim().toUpperCase();
    if (!groupId) continue;
    const docs = await queryString(env,'tarefas','grupoId',groupId,now);
    const writes = [];
    for (const task of docs) {
      if (!task.data.status || task.data.status === 'Pendente') continue;
      const fields = {
        status:'Pendente',horarioInicio:'',horarioTermino:'',pontosGanhos:0,
        iniciouComAtraso:false,iniciouAposLimiteFinal:false,percentualAplicado:null,
        faixaAtraso:'',minutosAlemTolerancia:null,faixaLeveMinutos:null,
        justificativaAtraso:'',tipoJustificativa:'',justificativaRecusada:false
      };
      writes.push({update:{name:task.name,fields:jsToFirestoreFields(fields)},updateMask:{fieldPaths:Object.keys(fields)}});
    }
    if (writes.length) await commitPatches(env,writes,now);
    await upsert(env,'configGrupos',groupId,{grupoId:groupId,ultimoReset:now.toISOString()},now);
    groups += 1; tasks += writes.length;
  }
  await upsert(env,'systemMaintenance',`weekly-reset-${key}`,{concluida:true,grupos:groups,tarefas:tasks,concluidaEm:now.toISOString()},now);
  console.log(JSON.stringify({event:'security.weekly_reset_server',groups,tasks,key}));
  return {ok:true,groups,tasks,key};
}

export async function runSecurityMaintenance(env, now = new Date()) {
  if (!migrationRunning) migrationRunning = migrateCommercialState(env,now).finally(()=>{migrationRunning=null;});
  const migration = await migrationRunning;
  if (!resetRunning) resetRunning = weeklyReset(env,now).finally(()=>{resetRunning=null;});
  const reset = await resetRunning;
  return {migration,reset};
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
