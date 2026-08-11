import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,collection,query,where,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {calcularEstadoCronometro,formatarDuracaoCronometro} from './tolerance-timer-core.js';

const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const pad=n=>String(n).padStart(2,'0');
const horaHMS=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
function campoHMS(valor){
  const m=String(valor||'').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m?`${pad(Number(m[1]))}:${m[2]}:${m[3]||'00'}`:String(valor||'');
}
function dataValida(valor){if(!valor)return null;const d=new Date(valor);return Number.isNaN(d.getTime())?null:d;}
function aplicarSegundosHorario(row,t){
  const sugerido=row.children?.[0]?.querySelector('.horario-sugerido');
  if(sugerido)sugerido.textContent=`⏰ ${campoHMS(t.horaSugeridaInicio)} - ${campoHMS(t.horaSugeridaFim)}`;
  const real=row.children?.[0]?.querySelector('.horario-real');
  if(!real)return;
  const inicio=dataValida(t.inicioExecutadoEm),fim=dataValida(t.terminoExecutadoEm);
  const hi=inicio?horaHMS(inicio):campoHMS(t.horarioInicio);
  const hf=fim?horaHMS(fim):campoHMS(t.horarioTermino);
  real.textContent=`▶️ ${hi}${hf?` / ⏹️ ${hf}`:''}`;
}
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
  s.textContent=`.client-tolerance-timer{display:inline-flex;align-items:center;margin-top:6px;padding:4px 8px;border-radius:999px;font-size:.78rem;font-weight:800;line-height:1.15;white-space:nowrap;background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;cursor:pointer}.client-tolerance-timer:focus{outline:3px solid rgba(37,99,235,.25);outline-offset:2px}.client-tolerance-timer[data-band="leve"]{background:#fef9c3;color:#854d0e;border-color:#fde047}.client-tolerance-timer[data-band="maior"]{background:#ffedd5;color:#9a3412;border-color:#fdba74}.client-tolerance-timer[data-band="estourado"]{background:#fee2e2;color:#991b1b;border-color:#fca5a5}`;
  document.head.appendChild(s);
}

function abrirAjudaRegra(t){
  document.getElementById('clientToleranceHelp')?.remove();
  const e=calcularEstadoCronometro(t,new Date());
  const normal=formatarDuracaoCronometro(e.limite100Seg);
  const faixa75=formatarDuracaoCronometro(e.faixa75Seg);
  const faixa50=formatarDuracaoCronometro(e.faixa50Seg);
  const maximo=formatarDuracaoCronometro(e.limite50Seg);
  const m=document.createElement('div');
  m.id='clientToleranceHelp';
  m.style.cssText='position:fixed;inset:0;z-index:21000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML=`<div style="width:min(92vw,430px);background:#fff;border-radius:20px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.25);color:#1f2937"><h2 style="margin:0 0 10px">⏱️ Como funciona sua tolerância?</h2><p style="margin:0 0 12px;line-height:1.45">Nesta tarefa você tem <strong>${normal}</strong> de tolerância valendo <strong>100%</strong>.</p><div style="display:grid;gap:8px"><div style="padding:10px 12px;border-radius:12px;background:#fef9c3">🟡 Quando chegar a <strong>00:00</strong>, começa a faixa de <strong>75%</strong> por mais <strong>${faixa75}</strong> (12,5%).</div><div style="padding:10px 12px;border-radius:12px;background:#ffedd5">🟠 Depois, a faixa de <strong>50%</strong> dura mais <strong>${faixa50}</strong> (12,5%).</div><div style="padding:10px 12px;border-radius:12px;background:#fee2e2">🔴 Depois de <strong>${maximo}</strong> de atraso total, a tarefa fica em <strong>0%</strong>.</div></div><p style="margin:12px 0 0;color:#64748b;font-size:13px;line-height:1.4">A tolerância é um saldo único: atraso no início + atraso no término. Começar antes não gasta esse saldo.</p><div style="display:flex;justify-content:flex-end;margin-top:14px"><button type="button" id="clientToleranceHelpClose" class="btn">Entendi</button></div></div>`;
  document.body.appendChild(m);
  const fechar=()=>m.remove();
  m.querySelector('#clientToleranceHelpClose').onclick=fechar;
  m.addEventListener('click',ev=>{if(ev.target===m)fechar();});
}

export function prepararLinhasCronometro(){
  garantirEstilo();
  const agora=new Date();
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
    const td=row.children?.[1];if(!td)return;
    const t=tarefaDaLinha(row,agora);
    let el=td.querySelector('.client-tolerance-timer');
    if(!t){el?.remove();return;}
    aplicarSegundosHorario(row,t);
    if(!el){
      el=document.createElement('span');
      el.className='client-tolerance-timer';
      el.hidden=true;
      el.tabIndex=0;
      el.setAttribute('role','button');
      el.setAttribute('aria-label','Ver como funciona a tolerância desta tarefa');
      el.addEventListener('click',()=>{const atual=tarefas.find(x=>x.id===el.dataset.taskTimerId);if(atual)abrirAjudaRegra(atual);});
      el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();el.click();}});
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
