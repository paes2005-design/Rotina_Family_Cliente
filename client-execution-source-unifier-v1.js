import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const TIME_ZONE='America/Bahia';
const VERSION=2;
let unsubscribe=null;
let installed=false;
let historyByTask=new Map();

const clean=v=>String(v||'').trim();
const group=()=>clean(localStorage.getItem('cliente_grupo')).toUpperCase();
const profile=()=>clean(localStorage.getItem('cliente_perfil_id'));

function todayISO(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const m={};for(const p of parts){if(p.type!=='literal')m[p.type]=p.value;}
  return `${m.year}-${m.month}-${m.day}`;
}

function hour(value,fallback=''){
  if(value){
    const d=new Date(value);
    if(Number.isFinite(d.getTime()))return new Intl.DateTimeFormat('pt-BR',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }
  return clean(fallback);
}

function finalState(status=''){
  const s=String(status);
  return s.includes('Prazo')||s.includes('Atrasado');
}

function isLiveInProgress(row){
  const dataStatus=clean(row?.dataset?.familyTaskStatus).toLowerCase();
  const badgeStatus=clean(row?.querySelector?.('.status-badge')?.textContent).toLowerCase();
  return dataStatus.includes('andamento')||badgeStatus.includes('andamento');
}

function badgeClass(status='',faixa=''){
  if(String(status).includes('Atrasado'))return 'status-badge status-atrasado';
  if(faixa==='atraso-maior'||String(status).includes('50%'))return 'status-badge status-prazo-50';
  if(faixa==='atraso-leve'||String(status).includes('75%'))return 'status-badge status-prazo-75';
  if(String(status).includes('Prazo'))return 'status-badge status-prazo';
  if(String(status).toLowerCase().includes('andamento'))return 'status-badge status-andamento';
  return 'status-badge status-pendente';
}

function apply(){
  const date=todayISO();
  document.querySelectorAll('tr[data-family-task-id]').forEach(row=>{
    const taskId=clean(row.dataset.familyTaskId);
    if(!taskId)return;

    // Regra de precedência: enquanto a tarefa de hoje está Em andamento,
    // o documento vivo de tarefas é a fonte oficial. Um histórico final antigo
    // do mesmo dia nunca pode sobrescrever uma execução que está acontecendo agora.
    if(isLiveInProgress(row)){
      row.dataset.executionSource='tarefas-andamento';
      return;
    }

    const h=historyByTask.get(taskId);
    if(!h||!finalState(h.status))return;
    const hDate=clean(h.data||h.dataExecucao);
    if(hDate&&hDate!==date)return;

    const inicio=hour(h.inicioExecutadoEm,h.horarioInicio);
    const fim=hour(h.terminoExecutadoEm,h.horarioTermino);
    const cell=row.children?.[0];
    if(cell){
      let real=cell.querySelector('.horario-real');
      if(!real){real=document.createElement('span');real.className='horario-real';cell.querySelector('.horario-container')?.appendChild(real);}
      if(real)real.textContent=`▶️ ${inicio||'--:--'}${fim?` / ⏹️ ${fim}`:''}`;
    }

    const badge=row.querySelector('.status-badge');
    if(badge){badge.className=badgeClass(h.status,h.faixaAtraso);badge.textContent=String(h.status||'Pendente');}
    row.dataset.familyTaskStatus=String(h.status||'');
    row.dataset.executionSource='historico-final';
  });
}

function start(){
  if(!getApps().length||!group()||!profile())return false;
  try{unsubscribe?.();}catch{}
  const db=getFirestore(getApp());
  const q=query(collection(db,'historico'),where('grupoId','==',group()),where('perfilId','==',profile()));
  unsubscribe=onSnapshot(q,{includeMetadataChanges:true},snap=>{
    const date=todayISO();
    historyByTask=new Map();
    for(const d of snap.docs){
      const h={id:d.id,...d.data()};
      if(clean(h.data||h.dataExecucao)!==date)continue;
      if(h.tarefaId)historyByTask.set(clean(h.tarefaId),h);
    }
    apply();
  },err=>{try{window.rotinaLog?.('execucao.fonte_historico_erro',{mensagem:String(err?.message||err),version:VERSION},'warning');}catch{}});
  return true;
}

function install(){
  if(installed)return;installed=true;
  window.addEventListener('rotina-family-tasks-rendered',apply);
  window.addEventListener('rotina-client-session-ready',()=>setTimeout(start,50));
  window.addEventListener('storage',e=>{if(['cliente_grupo','cliente_perfil_id'].includes(e.key))setTimeout(start,50);});
  setTimeout(()=>{if(!start())setTimeout(start,800);},250);
  window.__rotinaExecutionSource='historico-final/tarefas-andamento-v2';
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
