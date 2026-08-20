import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let stopConfig = null;
let stopProfile = null;
let blockedNotice = false;
let currentGroup = '';
let currentProfile = '';

function db(){ if(!getApps().length) throw new Error('Firebase ainda não foi iniciado.'); return getFirestore(getApp()); }
function state(config={}){
  if(config.grupoBloqueado===true) return 'bloqueado';
  if(config.grupoConfirmado===true) return 'liberado';
  if(config.trialAtivo===true){ const end=new Date(config.trialFimEm||''); if(Number.isFinite(end.getTime())&&end.getTime()<=Date.now()) return 'teste-expirado'; return 'teste'; }
  return 'legado';
}
function message(estado){
  return estado==='teste-expirado'
    ? 'Sua versão teste de 15 dias terminou. Peça ao responsável para entrar em contato e ativar o grupo familiar.'
    : 'Este grupo familiar está temporariamente desativado.';
}
async function groupAccess(groupId){ const snap=await getDoc(doc(db(),'configGrupos',groupId)); const estado=state(snap.exists()?snap.data():{}); return {estado,allowed:!['bloqueado','teste-expirado'].includes(estado)}; }
async function profileAllowed(groupId,profileId,name=''){
  if(profileId){ const snap=await getDoc(doc(db(),'perfis',profileId)); return snap.exists()&&snap.data().desativadoMaster!==true; }
  if(name){ const snap=await getDocs(query(collection(db(),'perfis'),where('grupoId','==',groupId),where('nome','==',name))); return !snap.empty&&snap.docs[0].data().desativadoMaster!==true; }
  return true;
}
function logoutWith(text){
  if(blockedNotice) return;
  blockedNotice=true;
  stopConfig?.(); stopConfig=null; stopProfile?.(); stopProfile=null;
  try{ window.sairCliente?.(); }catch(_){}
  alert(text);
  setTimeout(()=>{ blockedNotice=false; },500);
}
async function enforce(groupId,profileId){
  const access=await groupAccess(groupId);
  if(!access.allowed){ logoutWith(message(access.estado)); return false; }
  if(profileId&&!(await profileAllowed(groupId,profileId))){ logoutWith('Seu acesso a este grupo familiar está desativado.'); return false; }
  return true;
}
function watchSession(groupId,profileId){
  currentGroup=String(groupId||'').trim(); currentProfile=String(profileId||'').trim();
  stopConfig?.(); stopProfile?.();
  if(!currentGroup) return;
  stopConfig=onSnapshot(doc(db(),'configGrupos',currentGroup),snap=>{ const estado=state(snap.exists()?snap.data():{}); if(['bloqueado','teste-expirado'].includes(estado)) logoutWith(message(estado)); });
  if(currentProfile) stopProfile=onSnapshot(doc(db(),'perfis',currentProfile),snap=>{ if(!snap.exists()||snap.data().desativadoMaster===true) logoutWith('Seu acesso a este grupo familiar está desativado.'); });
}
function installLoginGuard(){
  const original=window.conectarCliente;
  if(typeof original!=='function'||original.__commercialGuard) return false;
  const wrapped=async(...args)=>{
    const group=String(document.getElementById('authCodigo')?.value||'').trim().toUpperCase();
    const rawName=String(document.getElementById('authNome')?.value||'').trim();
    const name=rawName?rawName.charAt(0).toUpperCase()+rawName.slice(1):'';
    if(group){
      try{
        const access=await groupAccess(group); if(!access.allowed){ alert(message(access.estado)); return; }
        if(name&&!(await profileAllowed(group,'',name))){ alert('Seu acesso a este grupo familiar está desativado.'); return; }
      }catch(error){ console.warn('Falha na validação comercial do cliente.',error); }
    }
    return original(...args);
  };
  wrapped.__commercialGuard=true; window.conectarCliente=wrapped; return true;
}
window.addEventListener('rotina-client-session-ready',async event=>{
  const group=String(event.detail?.grupo||'').trim(),profile=String(event.detail?.perfilId||'').trim();
  try{ if(await enforce(group,profile)) watchSession(group,profile); }
  catch(error){ console.warn('Falha ao validar sessão do cliente.',error); }
});
let attempts=0;
const timer=setInterval(()=>{ attempts++; if(installLoginGuard()||window.conectarCliente?.__commercialGuard)clearInterval(timer); if(attempts>50)clearInterval(timer); },100);
setInterval(()=>{ if(currentGroup&&!blockedNotice) enforce(currentGroup,currentProfile).catch(()=>{}); },60000);
