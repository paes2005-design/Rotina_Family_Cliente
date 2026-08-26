import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const ACTIVE_DATE='2026-08-26';
const TIME_ZONE='America/Bahia';
const API_ROOT='https://rotina-family-onesignal-scheduler.rotina-family-onesignal-scheduler.workers.dev';
const VERSION=2;
let running=false;
let installed=false;

const clean=value=>String(value||'').trim();
const group=()=>clean(localStorage.getItem('cliente_grupo')).toUpperCase();
const profile=()=>clean(localStorage.getItem('cliente_perfil_id'));
const key=()=>`rotina_emergencia_compensada_${ACTIVE_DATE}_${group()}_${profile()}`;
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,emergencyVersion:VERSION},level);}catch{}};

function localDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const map={};parts.forEach(p=>{if(p.type!=='literal')map[p.type]=p.value;});
  return `${map.year}-${map.month}-${map.day}`;
}

function alreadyDone(){
  if(!group()||!profile())return false;
  try{return localStorage.getItem(key())==='1';}catch{return false;}
}

function markDone(){
  try{localStorage.setItem(key(),'1');}catch{}
}

function showOverlay(text){
  let el=document.getElementById('rotinaEmergencyCompensationOverlay');
  if(!el){
    el=document.createElement('div');
    el.id='rotinaEmergencyCompensationOverlay';
    el.style.cssText='position:fixed;inset:0;z-index:40000;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML='<div style="width:min(92vw,430px);background:#fff;border-radius:18px;padding:22px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.28);font-family:system-ui"><div style="font-size:34px">🛠️</div><strong id="rotinaEmergencyCompensationText" style="display:block;margin-top:8px;font-size:17px;color:#334155"></strong></div>';
    document.body.appendChild(el);
  }
  const textEl=el.querySelector('#rotinaEmergencyCompensationText');
  if(textEl)textEl.textContent=text;
  return el;
}

async function runCompensation(){
  if(running||alreadyDone()||localDate()!==ACTIVE_DATE)return false;
  if(navigator.onLine===false){
    log('emergencia.compensacao_aguardando_rede',{data:ACTIVE_DATE},'warning');
    return false;
  }
  if(!getApps().length)return false;
  const user=getAuth(getApp()).currentUser;
  if(!user||!String(user.uid||'').startsWith('rfp_'))return false;
  running=true;
  showOverlay('Corrigindo as tarefas afetadas pela indisponibilidade…');
  try{
    const token=await user.getIdToken(true);
    const response=await fetch(`${API_ROOT}/emergency/compensate-2026-08-26`,{
      method:'POST',cache:'no-store',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:'{}'
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||`Falha HTTP ${response.status}`);
    markDone();
    log('emergencia.compensacao_aplicada',{quantidade:Number(result.compensated)||0,data:ACTIVE_DATE});
    showOverlay(result.compensated>0?`${result.compensated} tarefa(s) compensada(s). Atualizando sua rotina…`:'Rotina conferida. Atualizando…');
    setTimeout(()=>location.reload(),1000);
    return true;
  }catch(error){
    running=false;
    log('emergencia.compensacao_erro',{mensagem:clean(error?.message||error)},'error');
    showOverlay('Não consegui aplicar a compensação agora. Vou tentar novamente quando a conexão estiver confirmada.');
    setTimeout(()=>document.getElementById('rotinaEmergencyCompensationOverlay')?.remove(),3000);
    return false;
  }
}

function scheduleRun(delay=350){
  if(alreadyDone()||localDate()!==ACTIVE_DATE)return;
  setTimeout(()=>runCompensation(),delay);
}

function install(){
  if(installed)return;installed=true;
  window.rotinaExecutarCompensacaoHoje=runCompensation;
  window.addEventListener('rotina-client-session-ready',()=>scheduleRun(450));
  window.addEventListener('rotina-firestore-online',()=>scheduleRun(250));
  window.addEventListener('online',()=>scheduleRun(700));
  if(group()&&profile())scheduleRun(1200);
  log('emergencia.gatilho_pronto',{data:ACTIVE_DATE,modo:'automatico-pos-sessao'});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
