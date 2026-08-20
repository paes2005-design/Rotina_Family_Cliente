import worker, { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs, jsToFirestoreFields } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const SCOPES = ['https://www.googleapis.com/auth/datastore','https://www.googleapis.com/auth/identitytoolkit'].join(' ');
const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';
let tokenCache = { value:'', expiresAt:0, email:'' };

function required(value, name){ if(!value) throw new Error(`Configuração obrigatória ausente: ${name}`); return value; }
function b64url(bytes){ let s=''; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,''); }
function encode(value){ return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function pemBytes(pem){ const s=String(pem||'').replaceAll('\\n','\n').replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s/g,''); const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }
function credentials(env){ const c=JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON,'GOOGLE_SERVICE_ACCOUNT_JSON')); required(c.client_email,'client_email'); required(c.private_key,'private_key'); return c; }
async function googleToken(env, now=new Date()){
  const c=credentials(env); if(tokenCache.value&&tokenCache.email===c.client_email&&tokenCache.expiresAt>now.getTime()+60000)return tokenCache.value;
  const iat=Math.floor(now.getTime()/1000); const unsigned=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:c.client_email,sub:c.client_email,scope:SCOPES,aud:GOOGLE_TOKEN_URL,iat,exp:iat+3600})}`;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(c.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
  const response=await fetch(GOOGLE_TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${b64url(new Uint8Array(sig))}`})});
  const body=await response.json().catch(()=>({})); if(!response.ok||!body.access_token)throw new Error(`OAuth Google recusado (${response.status}).`);
  tokenCache={value:body.access_token,email:c.client_email,expiresAt:now.getTime()+Number(body.expires_in||3600)*1000}; return tokenCache.value;
}
function base(env){ return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(required(env.FIREBASE_PROJECT_ID,'FIREBASE_PROJECT_ID'))}/databases/(default)/documents`; }
async function listDocs(env, collectionId, now=new Date()){
  const response=await fetch(`${base(env)}/${encodeURIComponent(collectionId)}?pageSize=200`,{headers:{authorization:`Bearer ${await googleToken(env,now)}`}}); const body=await response.json().catch(()=>({})); if(!response.ok)throw new Error(`Listagem Firestore recusada (${response.status}).`);
  return (body.documents||[]).map(d=>({name:d.name,data:firestoreFieldsToJs(d.fields||{}),createTime:d.createTime||''}));
}
async function queryString(env, collectionId, field, value, now=new Date(), limit=200){
  const response=await fetch(`${base(env)}:runQuery`,{method:'POST',headers:{authorization:`Bearer ${await googleToken(env,now)}`,'content-type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:String(value||'')}}},limit}})}); const rows=await response.json().catch(()=>[]); if(!response.ok)throw new Error(`Consulta Firestore recusada (${response.status}).`);
  return (Array.isArray(rows)?rows:[]).filter(r=>r.document).map(r=>({name:r.document.name,data:firestoreFieldsToJs(r.document.fields||{}),createTime:r.document.createTime||''}));
}
async function getDoc(env, name, now=new Date()){
  const response=await fetch(`https://firestore.googleapis.com/v1/${name}`,{headers:{authorization:`Bearer ${await googleToken(env,now)}`}}); if(response.status===404)return null; const body=await response.json().catch(()=>({})); if(!response.ok)throw new Error(`Leitura Firestore recusada (${response.status}).`); return {name:body.name,data:firestoreFieldsToJs(body.fields||{})};
}
async function patchDoc(env,name,patch,now=new Date()){
  const url=new URL(`https://firestore.googleapis.com/v1/${name}`); Object.keys(patch).forEach(k=>url.searchParams.append('updateMask.fieldPaths',k)); const response=await fetch(url,{method:'PATCH',headers:{authorization:`Bearer ${await googleToken(env,now)}`,'content-type':'application/json'},body:JSON.stringify({name,fields:jsToFirestoreFields(patch)})}); if(!response.ok)throw new Error(`Atualização Firestore recusada (${response.status}).`);
}
async function createDoc(env,collectionId,id,data,now=new Date()){
  const url=new URL(`${base(env)}/${collectionId}`); url.searchParams.set('documentId',id); const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${await googleToken(env,now)}`,'content-type':'application/json'},body:JSON.stringify({fields:jsToFirestoreFields(data)})}); if(!response.ok&&response.status!==409)throw new Error(`Criação Firestore recusada (${response.status}).`);
}
async function deleteDoc(env,name,now=new Date()){
  const response=await fetch(`https://firestore.googleapis.com/v1/${name}`,{method:'DELETE',headers:{authorization:`Bearer ${await googleToken(env,now)}`}}); if(!response.ok&&response.status!==404)throw new Error(`Exclusão Firestore recusada (${response.status}).`);
}
async function authAdmin(env,path,body,now=new Date()){
  const response=await fetch(`${IDENTITY_TOOLKIT_URL}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}${path}`,{method:'POST',headers:{authorization:`Bearer ${await googleToken(env,now)}`,'content-type':'application/json'},body:JSON.stringify(body)}); const out=await response.json().catch(()=>({})); if(!response.ok)throw new Error(`Firebase Authentication recusou a operação: ${out.error?.message||response.status}`); return out;
}
function cors(request){ const origin=request.headers.get('origin')||''; return {'access-control-allow-origin':origin===ALLOWED_ORIGIN?origin:ALLOWED_ORIGIN,'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, POST, OPTIONS','cache-control':'no-store',vary:'Origin'}; }
function bearer(request){ return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]||''; }
async function adminByUid(env,uid,now=new Date()){ return (await queryString(env,'administradores','uid',uid,now,2))[0]||null; }
async function requireIdentity(request,env,now=new Date()){ const identity=await verifyFirebaseIdToken(env,bearer(request),fetch,now); const administrator=await adminByUid(env,identity.uid,now); if(!administrator)throw new Error('Cadastro administrativo não encontrado.'); return {...identity,administrator}; }
async function requireMaster(request,env,now=new Date()){ const i=await requireIdentity(request,env,now); if(!isMasterEmail(env,i.email))throw new Error('Acesso exclusivo do ADM Master.'); return i; }
function groupIdOf(data={}){ return String(data.codigoCliente||data.grupoId||'').trim(); }
function state(config={},now=new Date()){ if(config.grupoBloqueado===true)return 'bloqueado'; if(config.grupoConfirmado===true)return 'liberado'; if(config.trialAtivo===true){const end=new Date(config.trialFimEm||'');if(Number.isFinite(end.getTime())&&end<=now)return 'teste-expirado';return 'teste';} return 'legado'; }
async function configDoc(env,groupId,now=new Date()){ return getDoc(env,`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`,now); }
async function upsertConfig(env,groupId,patch,now=new Date()){ const name=`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`; const current=await getDoc(env,name,now); if(current)await patchDoc(env,name,{grupoId:groupId,...patch},now); else await createDoc(env,'configGrupos',groupId,{grupoId:groupId,...patch},now); }
async function groupAdmins(env,groupId,now=new Date()){ const a=await queryString(env,'administradores','codigoCliente',groupId,now); const b=await queryString(env,'administradores','grupoId',groupId,now); return [...new Map([...a,...b].map(x=>[x.name,x])).values()]; }
async function authMap(env,admins,now=new Date()){ const ids=admins.map(a=>String(a.data.uid||'')).filter(Boolean); if(!ids.length)return new Map(); const users=(await authAdmin(env,'/accounts:lookup',{localId:ids},now)).users||[]; return new Map(users.map(u=>[u.localId,u])); }
async function setGroupDisabled(env,groupId,disabled,now=new Date(),{markConfig=true}={}){
  const admins=await groupAdmins(env,groupId,now); if(admins.some(a=>isMasterEmail(env,a.data?.email)))throw new Error('O grupo do ADM Master é protegido.'); const map=await authMap(env,admins,now);
  for(const a of admins){ const uid=String(a.data.uid||''); if(!uid)continue; if(disabled&&String(a.data.tipoAcesso||'')!=='proprietario'&&map.get(uid)?.disabled===true&&a.data.desativadoIndividual!==true)await patchDoc(env,a.name,{desativadoIndividual:true},now); const disableUser=disabled?true:a.data.desativadoIndividual===true; await authAdmin(env,'/accounts:update',{localId:uid,disableUser,validSince:String(Math.floor(now.getTime()/1000))},now); }
  if(markConfig)await upsertConfig(env,groupId,{grupoBloqueado:disabled,bloqueioAtualizadoEm:now.toISOString()},now);
}
async function tree(env,now=new Date()){
  const [admins,profiles,configs]=await Promise.all([listDocs(env,'administradores',now),listDocs(env,'perfis',now),listDocs(env,'configGrupos',now)]); const amap=await authMap(env,admins,now); const cfg=new Map(configs.map(c=>[String(c.data.grupoId||c.name.split('/').at(-1)||''),c.data])); const groups=new Map();
  const ensure=id=>{id=String(id||'').trim();if(!id)return null;if(!groups.has(id))groups.set(id,{grupoId:id,administradores:[],clientes:[]});return groups.get(id)};
  for(const a of admins){const g=ensure(groupIdOf(a.data));if(!g)continue;const uid=String(a.data.uid||'');const au=amap.get(uid)||{};const email=String(au.email||a.data.email||'').toLowerCase();g.administradores.push({id:a.name.split('/').at(-1)||'',uid,email,tipoAcesso:String(a.data.tipoAcesso||'admin'),principal:String(a.data.tipoAcesso||'')==='proprietario',master:isMasterEmail(env,email),desativado:au.disabled===true,desativadoIndividual:a.data.desativadoIndividual===true});}
  for(const p of profiles){const g=ensure(p.data.grupoId);if(!g)continue;g.clientes.push({id:p.name.split('/').at(-1)||'',perfilId:String(p.data.perfilId||p.name.split('/').at(-1)||''),nome:String(p.data.nome||'Integrante'),sexo:String(p.data.sexo||''),desativado:p.data.desativadoMaster===true});}
  return [...groups.values()].map(g=>{const c=cfg.get(g.grupoId)||{};return {...g,estado:state(c,now),grupoBloqueado:c.grupoBloqueado===true,grupoConfirmado:c.grupoConfirmado===true,trialAtivo:c.trialAtivo===true,trialInicioEm:c.trialInicioEm||'',trialFimEm:c.trialFimEm||'',protegido:g.administradores.some(a=>a.master)}}).sort((a,b)=>a.grupoId.localeCompare(b.grupoId));
}
async function registerTrial(request,env,now=new Date()){
  const caller=await requireIdentity(request,env,now); if(String(caller.administrator.data.tipoAcesso||'')!=='proprietario')throw new Error('Somente o administrador principal inicia o teste.'); const groupId=groupIdOf(caller.administrator.data); if(!groupId)throw new Error('Grupo não encontrado.');
  const current=await configDoc(env,groupId,now); if(current?.data?.grupoConfirmado===true||current?.data?.trialAtivo===true)return {success:true,grupoId,estado:state(current.data,now)}; const end=new Date(now.getTime()+15*86400000); await upsertConfig(env,groupId,{trialAtivo:true,trialDias:15,trialInicioEm:now.toISOString(),trialFimEm:end.toISOString(),grupoConfirmado:false,grupoBloqueado:false},now); return {success:true,grupoId,estado:'teste',trialFimEm:end.toISOString()};
}
async function expireTrials(env,now=new Date()){
  const configs=await listDocs(env,'configGrupos',now); let expired=0; for(const c of configs){const d=c.data||{};if(d.trialAtivo!==true||d.grupoConfirmado===true||d.trialExpiradoProcessado===true)continue;const end=new Date(d.trialFimEm||'');if(!Number.isFinite(end.getTime())||end>now)continue;const groupId=String(d.grupoId||c.name.split('/').at(-1)||'');try{await setGroupDisabled(env,groupId,true,now,{markConfig:false});await patchDoc(env,c.name,{trialExpiradoProcessado:true,trialExpiradoEm:now.toISOString(),grupoBloqueado:false},now);expired++;console.log(JSON.stringify({event:'commercial_trial_expired',grupoId}));}catch(error){console.error(JSON.stringify({event:'commercial_trial_expiry_error',grupoId,error:String(error?.message||error)}));}}
  return expired;
}
async function handleCommercialMaster(request,env,now=new Date()){
  const caller=await requireMaster(request,env,now); const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname.endsWith('/tree'))return Response.json({groups:await tree(env,now)},{headers:cors(request)});
  const body=await request.json().catch(()=>({}));
  if(url.pathname.endsWith('/groups')){const groupId=String(body.grupoId||'').trim();if(!groupId)throw new Error('Grupo não informado.');if(body.action==='set-group-disabled')await setGroupDisabled(env,groupId,body.disabled===true,now);else if(body.action==='confirm-group'){await upsertConfig(env,groupId,{grupoConfirmado:true,trialAtivo:false,grupoBloqueado:false,confirmadoEm:now.toISOString(),confirmadoPorMaster:caller.uid},now);await setGroupDisabled(env,groupId,false,now);}else throw new Error('Ação de grupo inválida.');console.log(JSON.stringify({event:'master_commercial_group',action:body.action,grupoId}));return Response.json({success:true},{headers:cors(request)});}
  if(url.pathname.endsWith('/profiles')){const id=String(body.profileId||'').trim();const name=`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/perfis/${id}`;const profile=await getDoc(env,name,now);if(!profile)return Response.json({error:'Cliente não encontrado.'},{status:404,headers:cors(request)});if(body.action==='set-profile-disabled')await patchDoc(env,name,{desativadoMaster:body.disabled===true,desativadoMasterEm:now.toISOString()},now);else if(body.action==='delete-profile')await deleteDoc(env,name,now);else throw new Error('Ação de cliente inválida.');console.log(JSON.stringify({event:'master_profile_action',action:body.action,profileId:id}));return Response.json({success:true},{headers:cors(request)});}
  return Response.json({error:'Operação não encontrada.'},{status:404,headers:cors(request)});
}
async function interceptAdminToggle(request,env,now=new Date()){
  const body=await request.clone().json().catch(()=>({})); if(body.action!=='set-disabled')return null; const caller=await requireMaster(request,env,now); const target=await adminByUid(env,String(body.targetUid||''),now); if(!target)return null; const email=String(target.data.email||'').toLowerCase(); if(String(body.targetUid||'')===caller.uid||isMasterEmail(env,email))return null;
  if(String(target.data.tipoAcesso||'')==='proprietario'){const groupId=groupIdOf(target.data);if(groupId)await setGroupDisabled(env,groupId,body.disabled===true,now);}else await patchDoc(env,target.name,{desativadoIndividual:body.disabled===true,desativadoIndividualEm:now.toISOString()},now); return worker.fetch(request,env);
}

export default {
  async scheduled(controller,env,context){ worker.scheduled(controller,env,context); context.waitUntil(expireTrials(env,new Date(controller.scheduledTime))); },
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS'&&(url.pathname.startsWith('/admin-master/')||url.pathname==='/commercial/trial'))return new Response(null,{status:204,headers:cors(request)});
    try{
      if(url.pathname==='/commercial/trial'&&request.method==='POST')return Response.json(await registerTrial(request,env),{headers:cors(request)});
      if(url.pathname==='/admin-master/tree'||url.pathname==='/admin-master/groups'||url.pathname==='/admin-master/profiles')return await handleCommercialMaster(request,env);
      if(url.pathname==='/admin-master/users'&&request.method==='POST'){const intercepted=await interceptAdminToggle(request,env);if(intercepted)return intercepted;}
    }catch(error){return Response.json({error:String(error?.message||error).replace(/\s+/g,' ').slice(0,500)},{status:400,headers:cors(request)});}
    return worker.fetch(request,env);
  }
};
