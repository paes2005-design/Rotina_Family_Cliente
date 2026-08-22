import worker, { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs, jsToFirestoreFields } from './core.js';
import { commercialState, confirmFamilyPatch, familyBlockPatch, isTrialV2, startFamilyTrialPatch } from './commercial-policy.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';
let tokenCache = { value: '', expiresAt: 0, email: '' };

function required(value, name) { if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`); return value; }
function base64Url(bytes) { let text=''; for(const byte of bytes) text+=String.fromCharCode(byte); return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,''); }
function encodeJson(value) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function pemBytes(pem) { const normalized=String(pem||'').replaceAll('\\n','\n').replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s/g,''); const binary=atob(normalized); return Uint8Array.from(binary,c=>c.charCodeAt(0)); }
function credentials(env) { const value=JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON,'GOOGLE_SERVICE_ACCOUNT_JSON')); required(value.client_email,'client_email'); required(value.private_key,'private_key'); return value; }

async function googleToken(env, now=new Date()) {
  const c=credentials(env);
  if(tokenCache.value&&tokenCache.email===c.client_email&&tokenCache.expiresAt>now.getTime()+60000)return tokenCache.value;
  const iat=Math.floor(now.getTime()/1000);
  const unsigned=`${encodeJson({alg:'RS256',typ:'JWT'})}.${encodeJson({iss:c.client_email,sub:c.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:GOOGLE_TOKEN_URL,iat,exp:iat+3600})}`;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(c.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
  const assertion=`${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response=await fetch(GOOGLE_TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token)throw new Error(`OAuth Google recusado (${response.status}).`);
  tokenCache={value:body.access_token,email:c.client_email,expiresAt:now.getTime()+Number(body.expires_in||3600)*1000};
  return tokenCache.value;
}

function firestoreBase(env){return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(required(env.FIREBASE_PROJECT_ID,'FIREBASE_PROJECT_ID'))}/databases/(default)/documents`;}
async function requestFirestore(env,url,options={},now=new Date()){
  let response=await fetch(url,{...options,headers:{authorization:`Bearer ${await googleToken(env,now)}`,...(options.headers||{})}});
  if(response.status===429){const retryAfter=Number(response.headers.get('retry-after')||0);await new Promise(r=>setTimeout(r,retryAfter>0?retryAfter*1000:1000));response=await fetch(url,{...options,headers:{authorization:`Bearer ${await googleToken(env,now)}`,...(options.headers||{})}});}
  return response;
}
async function queryString(env,collectionId,field,value,now=new Date(),limit=100){
  const response=await requestFirestore(env,`${firestoreBase(env)}:runQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:String(value||'')}}},limit}})},now);
  const rows=await response.json().catch(()=>[]);if(!response.ok)throw new Error(`Consulta ${collectionId}:${field} recusada (${response.status}).`);
  return (Array.isArray(rows)?rows:[]).filter(r=>r.document).map(r=>({name:r.document.name,createTime:r.document.createTime||'',data:firestoreFieldsToJs(r.document.fields||{})||{}}));
}
async function getDoc(env,name,now=new Date()){const response=await requestFirestore(env,`https://firestore.googleapis.com/v1/${name}`,{},now);if(response.status===404)return null;const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Leitura Firestore recusada (${response.status}).`);return{name:body.name,createTime:body.createTime||'',data:firestoreFieldsToJs(body.fields||{})||{}};}
async function patchDoc(env,name,patch,now=new Date()){const url=new URL(`https://firestore.googleapis.com/v1/${name}`);for(const field of Object.keys(patch))url.searchParams.append('updateMask.fieldPaths',field);const response=await requestFirestore(env,url.toString(),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name,fields:jsToFirestoreFields(patch)})},now);if(!response.ok)throw new Error(`Atualização Firestore recusada (${response.status}).`);}
async function createDoc(env,collectionId,id,data,now=new Date()){const url=new URL(`${firestoreBase(env)}/${encodeURIComponent(collectionId)}`);url.searchParams.set('documentId',id);const response=await requestFirestore(env,url.toString(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields:jsToFirestoreFields(data)})},now);if(!response.ok&&response.status!==409)throw new Error(`Criação Firestore recusada (${response.status}).`);}
async function deleteDoc(env,name,now=new Date()){const response=await requestFirestore(env,`https://firestore.googleapis.com/v1/${name}`,{method:'DELETE'},now);if(!response.ok&&response.status!==404)throw new Error(`Exclusão Firestore recusada (${response.status}).`);}
async function upsertConfig(env,groupId,patch,now=new Date()){const name=`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`;const current=await getDoc(env,name,now);if(current)await patchDoc(env,name,{grupoId:groupId,...patch},now);else await createDoc(env,'configGrupos',groupId,{grupoId:groupId,...patch},now);return getDoc(env,name,now);}

function bearer(request){return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]||'';}
function cors(request){const origin=request.headers.get('origin')||'';return{'access-control-allow-origin':origin===ALLOWED_ORIGIN?origin:ALLOWED_ORIGIN,'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, POST, OPTIONS','access-control-max-age':'86400','cache-control':'no-store',vary:'Origin'};}
async function requireMaster(request,env,now=new Date()){const identity=await verifyFirebaseIdToken(env,bearer(request),fetch,now);if(!isMasterEmail(env,identity.email))throw new Error('Acesso exclusivo do ADM Master.');return identity;}
async function adminByUid(env,uid,now=new Date()){return(await queryString(env,'administradores','uid',uid,now,2))[0]||null;}
function groupIdOf(data={}){return String(data.codigoCliente||data.grupoId||'').trim().toUpperCase();}
async function groupAdmins(env,groupId,now=new Date()){const first=await queryString(env,'administradores','codigoCliente',groupId,now,50);const second=await queryString(env,'administradores','grupoId',groupId,now,50);return[...new Map([...first,...second].map(item=>[item.name,item])).values()];}
function dateMs(value,fallback=Number.MAX_SAFE_INTEGER){const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:fallback;}
function chooseOwner(admins,env){const usable=admins.filter(item=>!isMasterEmail(env,item.data?.email));const explicit=usable.find(item=>String(item.data?.tipoAcesso||'').toLowerCase()==='proprietario');if(explicit)return explicit;return[...usable].sort((a,b)=>dateMs(a.data?.criadoEm||a.createTime)-dateMs(b.data?.criadoEm||b.createTime))[0]||null;}

async function registerTrial(request,env,now=new Date()){
  const identity=await verifyFirebaseIdToken(env,bearer(request),fetch,now);
  if(isMasterEmail(env,identity.email))return{success:true,estado:'master',grupoId:''};
  const administrator=await adminByUid(env,identity.uid,now);if(!administrator)throw new Error('Cadastro administrativo não encontrado.');
  const groupId=groupIdOf(administrator.data);if(!groupId)throw new Error('Grupo não encontrado.');
  const name=`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`;
  const current=await getDoc(env,name,now);
  if(current?.data?.grupoConfirmado===true)return{success:true,grupoId:groupId,estado:'confirmado',confirmado:true};
  if(current&&isTrialV2(current.data))return{success:true,grupoId:groupId,estado:commercialState(current.data,now.getTime()),trialFimEm:current.data.trialFimEm||''};
  const admins=await groupAdmins(env,groupId,now);const owner=chooseOwner(admins,env)||administrator;
  const startSource=current?.data?.trialInicioEm||owner?.data?.criadoEm||owner?.createTime||administrator.data?.criadoEm||administrator.createTime||now.toISOString();
  const patch=startFamilyTrialPatch(new Date(dateMs(startSource,now.getTime())));
  if(current?.data?.grupoBloqueado===true){patch.grupoBloqueado=true;patch.bloqueioManual=true;}
  const saved=await upsertConfig(env,groupId,patch,now);
  return{success:true,grupoId:groupId,estado:commercialState(saved?.data||patch,now.getTime()),trialInicioEm:patch.trialInicioEm,trialFimEm:patch.trialFimEm};
}

async function handleMasterGroupMutation(request,env,now=new Date()){
  const caller=await requireMaster(request,env,now);const body=await request.json().catch(()=>({}));const groupId=String(body.grupoId||'').trim().toUpperCase();if(!groupId)throw new Error('Grupo não informado.');
  let saved;
  if(body.action==='set-group-blocked')saved=await upsertConfig(env,groupId,familyBlockPatch(body.disabled===true,now.toISOString()),now);
  else if(body.action==='confirm-group')saved=await upsertConfig(env,groupId,{...confirmFamilyPatch(now.toISOString()),confirmadoPorMaster:caller.uid},now);
  else throw new Error('Ação de grupo inválida.');
  return{success:true,grupoId:groupId,action:body.action,estado:commercialState(saved?.data||{},now.getTime()),grupoBloqueado:saved?.data?.grupoBloqueado===true,grupoConfirmado:saved?.data?.grupoConfirmado===true};
}

export async function commercialStorageSelfTest(env,now=new Date()){
  const groupId=`TESTE-SMOKE-${now.getTime()}`;const name=`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`;
  try{
    let saved=await upsertConfig(env,groupId,startFamilyTrialPatch(new Date(now.getTime()-16*86400000)),now);const expiredState=commercialState(saved?.data||{},now.getTime());if(expiredState!=='teste-expirado')throw new Error(`Esperado teste-expirado; recebido ${expiredState}`);
    saved=await upsertConfig(env,groupId,confirmFamilyPatch(now.toISOString()),now);const confirmedState=commercialState(saved?.data||{},now.getTime());if(confirmedState!=='confirmado')throw new Error(`Esperado confirmado; recebido ${confirmedState}`);
    saved=await upsertConfig(env,groupId,familyBlockPatch(true,now.toISOString()),now);const blockedState=commercialState(saved?.data||{},now.getTime());if(blockedState!=='bloqueado')throw new Error(`Esperado bloqueado; recebido ${blockedState}`);
    return{ok:true,expiredState,confirmedState,blockedState};
  }finally{await deleteDoc(env,name,now).catch(()=>{});}
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='OPTIONS'&&(url.pathname.startsWith('/admin-master/')||url.pathname.startsWith('/commercial/')))return new Response(null,{status:204,headers:cors(request)});
    try{
      if(url.pathname==='/commercial/trial'&&request.method==='POST')return Response.json(await registerTrial(request,env),{headers:cors(request)});
      if(url.pathname==='/admin-master/tree'&&request.method==='GET')return Response.json({error:'Árvore global desativada. Use a lista de grupos e consulte um grupo por vez.'},{status:410,headers:cors(request)});
      if(url.pathname==='/admin-master/groups'&&request.method==='POST')return Response.json(await handleMasterGroupMutation(request,env),{headers:cors(request)});
    }catch(error){const message=String(error?.message||error).replace(/\s+/g,' ').slice(0,320);const status=/Acesso exclusivo/.test(message)?403:400;return Response.json({error:message},{status,headers:cors(request)});}
    return worker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){return worker.scheduled(controller,env,ctx);}
};
