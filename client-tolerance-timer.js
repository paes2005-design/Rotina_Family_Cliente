import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,collection,query,where,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {calcularEstadoCronometro} from './tolerance-timer-core.js';

const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
let tarefas=[];
let unsubscribe=null;
let chaveSessao='';
let timerId=null;

function sessao(){
  return {
    grupo:(localStorage.getItem('cliente_grupo')||'').trim(),
    perfil:(localStorage.getItem('cliente_perfil_id')||'').trim(),
    nome:(localStorage.getItem('cliente_nome')||'').trim()
  };
}

function horarioLinha(row){
  const txt=row.children?.[0]?.querySelector('.horario-sugerido')?.textContent||row.children?.[0]?.textContent||'';
  const m=String(txt).match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
  return m?{inicio:m[1],fim:m[2]}:{inicio:'',fim:''};
}

function tarefaDaLinha(row,agora=new Date()){
  const nome=row.children?.[1]?.querySelector('strong')?.textContent.trim()||'';
  const h=horarioLinha(row),dia=DIAS[agora.getDay()];
  return tarefas.find(t=>t.diaSemana===dia&&t.nome===nome&&(!h.inicio||t.horaSugeridaInicio===h.inicio)&&(!h.fim||t.horaSugeridaFim===h.fim))||null;
}

function garantirEstilo(){
  if(document.getElementById('clientToleranceTimerStyle'))return;
  const s=document.createElement('style');s.id='clientToleranceTimerStyle';
  s.textContent=`.client-tolerance-timer{display:inline-flex;align-items:center;margin-top:6px;padding:4px 8px;border-radius:999px;font-size:.78rem;font-weight:800;line-height:1.15;white-space:nowrap;background:#e0f2fe;color:#075985;border:1px solid #7dd3fc}.client-tolerance-timer[data-band="limite"]{background:#f0f9ff;color:#0369a1;border-color:#38bdf8}.client-tolerance-timer[data-band="leve"]{background:#fef9c3;color:#854d0e;border-color:#fde047}.client-tolerance-timer[data-band="maior"]{background:#ffedd5;color:#9a3412;border-color:#fdba74}.client-tolerance-timer[data-band="estourado"]{background:#fee2e2;color:#991b1b;border-color:#fca5a5}`;
  document.head.appendChild(s);
}

export function prepararLinhasCronometro(){
  garantirEstilo();
  const agora=new Date();
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
    const td=row.children?.[1];if(!td)return;
    const t=tarefaDaLinha(row,agora);
    let el=td.querySelector('.client-tolerance-timer');
    if(!t){el?.remove();return;}
    if(!el){
      el=document.createElement('span');
      el.className='client-tolerance-timer';
      el.hidden=true;
      const ancora=td.querySelector('.early-start-client-badge')||td.querySelector('.task-name-wrap')||td.querySelector('strong');
      ancora?.insertAdjacentElement('afterend',el);
    }
    el.dataset.taskTimerId=t.id;
  });
  atualizarSomenteTextoCronometro(agora);
}

export function atualizarSomenteTextoCronometro(agora=new Date()){
  document.querySelectorAll('.client-tolerance-timer[data-task-timer-id]').forEach(el=>{
    const t=tarefas.find(x=>x.id===el.dataset.taskTimerId);
    if(!t){el.hidden=true;return;}
    const estado=calcularEstadoCronometro(t,agora);
    el.hidden=!estado.visivel;
    if(!estado.visivel)return;
    if(el.textContent!==estado.texto)el.textContent=estado.texto;
    if(el.dataset.band!==estado.tom)el.dataset.band=estado.tom;
  });
}

function garantirEscuta(){
  const s=sessao(),chave=`${s.grupo}|${s.perfil||s.nome}`;
  if(!s.grupo||(!s.perfil&&!s.nome)){
    if(unsubscribe){unsubscribe();unsubscribe=null;}
    chaveSessao='';tarefas=[];return;
  }
  if(chave===chaveSessao&&unsubscribe)return;
  if(!getApps().length)return;
  unsubscribe?.();
  const banco=getFirestore(getApp());
  chaveSessao=chave;
  unsubscribe=onSnapshot(query(collection(banco,'tarefas'),where('grupoId','==',s.grupo)),snap=>{
    tarefas=snap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.perfilId?s.perfil&&t.perfilId===s.perfil:t.perfilNome===s.nome);
    prepararLinhasCronometro();
  },e=>console.warn('Cronômetro de tolerância:',e));
}

function tick(){
  garantirEscuta();
  atualizarSomenteTextoCronometro(new Date());
}

function iniciarTimerUnico(){
  if(timerId!==null)return;
  timerId=setInterval(tick,1000);
  tick();
}

window.prepararCronometrosTolerancia=prepararLinhasCronometro;
window.atualizarCronometrosTolerancia=atualizarSomenteTextoCronometro;
window.__rotinaToleranceTimerDebug={getTimerId:()=>timerId,getTaskCount:()=>tarefas.length};

document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciarTimerUnico,{once:true});else iniciarTimerUnico();
