import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,collection,doc,onSnapshot,query,serverTimestamp,setDoc,where} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const KEY_PREF='rotina_family_alarm_pref_v2';
const KEY_STATE='rotina_family_task_alarms_v2';
const KEY_PENDING='rotina_family_task_alarm_pending_v2';
const TONES={
  classico:{label:'Alarme clássico',seq:[[880,.18],[660,.18],[880,.18],[660,.38]]},
  digital:{label:'Digital',seq:[[1046,.10],[1318,.10],[1568,.10],[1318,.30]]},
  campainha:{label:'Campainha',seq:[[784,.22],[1046,.45]]},
  suave:{label:'Suave',seq:[[523,.28],[659,.28],[784,.45]]},
  musica:{label:'Música',seq:[[523,.16],[659,.16],[784,.16],[1046,.24],[784,.16],[659,.32]]}
};
const DIAS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
let ctx=null,somTimer=null,relogioTimer=null,unsub=null,alarmeDisparado='';
let pref=ler(KEY_PREF,{tone:'classico',volume:.75});
let alarmes=ler(KEY_STATE,{});
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nomePerfil=()=>localStorage.getItem('cliente_nome')||'';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ler(k,p){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v==='object'?v:p}catch{return p}}
function salvar(k,v){localStorage.setItem(k,JSON.stringify(v))}
function chaveDoc(g,p,t){return [g,p,t].map(v=>String(v||'').replaceAll('/','_')).join('__')}
function tarefaDaLinha(row){return {tarefaId:row.dataset.familyTaskId||'',tarefaGrupoId:row.dataset.familyTaskGroup||'',nomeTarefa:row.dataset.familyTaskName||'Tarefa',diaSemana:row.dataset.familyTaskDay||'',horaSugeridaInicio:row.dataset.familyTaskTime||'',status:row.dataset.familyTaskStatus||''}}
function alarmeDaTarefa(id){return alarmes[id]||null}
function travado(a){return !!a&&(a.origem==='ADM'||a.bloqueado===true)}

function audio(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();return ctx}
async function tocarUmaVez(tone=pref.tone){const a=audio();try{await a.resume()}catch{}const seq=(TONES[tone]||TONES.classico).seq;let at=a.currentTime;for(const [hz,dur] of seq){const o=a.createOscillator(),g=a.createGain();o.frequency.value=hz;o.type=tone==='suave'?'sine':'square';g.gain.setValueAtTime(Math.max(.02,Number(pref.volume)||.75)*.16,at);g.gain.exponentialRampToValueAtTime(.001,at+dur);o.connect(g);g.connect(a.destination);o.start(at);o.stop(at+dur);at+=dur+.035}}
function iniciarSom(){pararSom();tocarUmaVez().catch(()=>{});somTimer=setInterval(()=>tocarUmaVez().catch(()=>{}),2200)}
function pararSom(){if(somTimer){clearInterval(somTimer);somTimer=null}}

function decorarTarefas(){
  document.querySelectorAll('tr[data-family-task-id]').forEach(row=>{
    const tarefa=tarefaDaLinha(row),celula=row.lastElementChild;
    if(!tarefa.tarefaId||!celula)return;
    let btn=celula.querySelector('.family-task-alarm-client');
    if(!btn){btn=document.createElement('button');btn.type='button';btn.className='family-task-alarm-client';btn.style.cssText='margin-left:6px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-size:17px;line-height:1;cursor:pointer;vertical-align:middle';btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();abrirPainel(tarefaDaLinha(row))});celula.appendChild(btn)}
    atualizarBotao(btn,tarefa.tarefaId);
  });
}
function atualizarBotao(btn,id){const a=alarmeDaTarefa(id),icone=!a?.ativo?'🔕':travado(a)?'🔒':'🔔',titulo=!a?.ativo?'Ativar despertador desta tarefa':travado(a)?'Despertador ativado pelo responsável':'Despertador ativado por você';if(btn.textContent!==icone)btn.textContent=icone;if(btn.title!==titulo)btn.title=titulo;btn.style.background=a?.ativo?(travado(a)?'#fee2e2':'#fff7ed'):'#fff'}
function atualizarBotoes(){document.querySelectorAll('.family-task-alarm-client').forEach(btn=>{const row=btn.closest('tr[data-family-task-id]');if(row)atualizarBotao(btn,row.dataset.familyTaskId)});if(alarmeDisparado&&!alarmes[alarmeDisparado]?.ativo)encerrarDisparo();else verificarDisparo()}

function abrirPainel(tarefa){
  document.getElementById('familyAlarmTaskPanel')?.remove();
  const a=alarmeDaTarefa(tarefa.tarefaId),bloqueado=travado(a);
  const m=document.createElement('div');m.id='familyAlarmTaskPanel';m.style.cssText='position:fixed;inset:0;z-index:22000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:16px';
  m.innerHTML=`<div style="width:min(92vw,440px);background:#fff;border-radius:22px;padding:20px;color:#1f2937"><h2 style="margin:0 0 5px">⏰ ${esc(tarefa.nomeTarefa)}</h2><p style="margin:0 0 15px;color:#64748b"><strong>${esc(tarefa.diaSemana)}</strong> às <strong>${esc(tarefa.horaSugeridaInicio)}</strong></p>${bloqueado?'<div style="padding:12px;border-radius:12px;background:#fee2e2;color:#991b1b;font-weight:800;margin-bottom:14px">🔒 Ativado pelo responsável. Você não pode retirar este despertador.</div>':''}<label style="font-weight:800">Toque</label><select id="alarmTone" style="width:100%;padding:11px;margin:6px 0 12px;border:1px solid #cbd5e1;border-radius:10px">${Object.entries(TONES).map(([k,v])=>`<option value="${k}" ${pref.tone===k?'selected':''}>${esc(v.label)}</option>`).join('')}</select><label style="font-weight:800">Volume <span id="alarmVolLabel">${Math.round(pref.volume*100)}%</span></label><input id="alarmVol" type="range" min="10" max="100" value="${Math.round(pref.volume*100)}" style="width:100%;margin:8px 0 14px"><div style="display:flex;gap:8px"><button id="alarmTest" type="button" style="flex:1;padding:12px;border-radius:11px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:800">▶ Testar</button><button id="alarmToggle" type="button" ${bloqueado?'disabled':''} style="flex:1;padding:12px;border-radius:11px;border:0;background:${a?.ativo?'#64748b':'#ef4444'};color:#fff;font-weight:900;opacity:${bloqueado?'.55':'1'}">${a?.ativo?'Retirar alarme':'Ativar na tarefa'}</button></div><div id="alarmTaskMsg" style="min-height:18px;margin-top:10px;font-size:12px;color:#64748b"></div><button id="alarmClose" type="button" style="width:100%;margin-top:8px;padding:10px;border:0;background:transparent;color:#475569">Fechar</button></div>`;
  document.body.appendChild(m);const tone=m.querySelector('#alarmTone'),vol=m.querySelector('#alarmVol'),lab=m.querySelector('#alarmVolLabel');
  tone.onchange=()=>{pref.tone=tone.value;salvar(KEY_PREF,pref)};vol.oninput=()=>{pref.volume=Number(vol.value)/100;lab.textContent=vol.value+'%';salvar(KEY_PREF,pref)};m.querySelector('#alarmTest').onclick=()=>tocarUmaVez();
  m.querySelector('#alarmToggle').onclick=()=>gravar(tarefa,!a?.ativo,'CLIENTE',m.querySelector('#alarmTaskMsg')).then(ok=>{if(ok)m.remove()});
  m.querySelector('#alarmClose').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};
}

function payloadDaTarefa(tarefa,ativo,origem){const agora=new Date().toISOString();return {grupoId:grupo(),perfilId:perfil(),perfilNome:nomePerfil(),tarefaId:tarefa.tarefaId,tarefaGrupoId:tarefa.tarefaGrupoId||'',nomeTarefa:tarefa.nomeTarefa,diaSemana:tarefa.diaSemana,horaSugeridaInicio:tarefa.horaSugeridaInicio,ativo,origem,bloqueado:origem==='ADM'&&ativo,atualizadoEm:agora,...(ativo?{acionadoEm:agora,acionadoPor:nomePerfil()||'Cliente'}:{encerradoEm:agora,encerradoPor:nomePerfil()||'Cliente'})}}
function enfileirar(payload){const fila=ler(KEY_PENDING,[]);fila.push(payload);salvar(KEY_PENDING,fila.slice(-60))}
async function gravar(tarefa,ativo,origem='CLIENTE',msg=null){const atual=alarmeDaTarefa(tarefa.tarefaId);if(origem==='CLIENTE'&&travado(atual)){if(msg)msg.textContent='Somente o responsável pode retirar este despertador.';return false}const payload=payloadDaTarefa(tarefa,ativo,origem);alarmes[tarefa.tarefaId]=payload;salvar(KEY_STATE,alarmes);atualizarBotoes();if(!navigator.onLine||!getApps().length){enfileirar(payload);if(msg)msg.textContent='Alteração guardada e será sincronizada quando a internet voltar.';return true}try{await setDoc(doc(getFirestore(getApp()),'despertadores',chaveDoc(payload.grupoId,payload.perfilId,payload.tarefaId)),{...payload,servidorEm:serverTimestamp()},{merge:true});if(msg)msg.textContent=ativo?'Despertador ativado nesta tarefa.':'Despertador retirado.';return true}catch{enfileirar(payload);if(msg)msg.textContent='Alteração guardada para sincronizar depois.';return true}}

async function sincronizarPendente(){if(!navigator.onLine||!getApps().length)return;const fila=ler(KEY_PENDING,[]);if(!fila.length)return;const db=getFirestore(getApp()),rest=[];for(const p of fila){try{await setDoc(doc(db,'despertadores',chaveDoc(p.grupoId,p.perfilId,p.tarefaId)),{...p,servidorEm:serverTimestamp()},{merge:true})}catch{rest.push(p)}}salvar(KEY_PENDING,rest)}
function escutar(tentativa=0){if(unsub)return;const g=grupo(),p=perfil();if(!g||!p||!getApps().length){if(tentativa<120)setTimeout(()=>escutar(tentativa+1),100);return}const q=query(collection(getFirestore(getApp()),'despertadores'),where('grupoId','==',g));unsub=onSnapshot(q,s=>{const proximos={...alarmes};s.docs.forEach(d=>{const a={id:d.id,...d.data()};if(a.perfilId===p&&a.tarefaId)proximos[a.tarefaId]=a});alarmes=proximos;salvar(KEY_STATE,alarmes);atualizarBotoes()},()=>{atualizarBotoes()});sincronizarPendente()}

function tarefaConcluida(id){const row=document.querySelector(`tr[data-family-task-id="${CSS.escape(id)}"]`);return row?/Prazo|Atrasado/i.test(row.dataset.familyTaskStatus||''):false}
function estaNaHora(a,agora){if(!a?.ativo||!a.tarefaId||tarefaConcluida(a.tarefaId))return false;if(a.diaSemana&&a.diaSemana!==DIAS[agora.getDay()])return false;const alvo=String(a.horaSugeridaInicio||'').slice(0,5);if(!/^\d{1,2}:\d{2}$/.test(alvo))return false;const atual=agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false});return atual>=alvo}
function verificarDisparo(){if(alarmeDisparado)return;const agora=new Date();const a=Object.values(alarmes).filter(x=>estaNaHora(x,agora)).sort((x,y)=>String(x.horaSugeridaInicio).localeCompare(String(y.horaSugeridaInicio)))[0];if(a)mostrarDisparo(a)}
function mostrarDisparo(a){alarmeDisparado=a.tarefaId;let o=document.getElementById('familyAlarmOverlay');if(!o){o=document.createElement('div');o.id='familyAlarmOverlay';o.style.cssText='position:fixed;inset:0;z-index:30000;background:radial-gradient(circle at top,#ef4444,#7f1d1d);color:#fff;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center';document.body.appendChild(o)}const bloqueado=travado(a);o.innerHTML=`<div><div style="font-size:72px">⏰</div><div style="font-size:16px;font-weight:800;letter-spacing:.12em">HORA DA TAREFA</div><h1 style="font-size:clamp(34px,9vw,58px);margin:10px 0">${esc(a.nomeTarefa||'Tarefa')}</h1><p style="font-size:24px;font-weight:800;margin:0 0 8px">${esc(a.horaSugeridaInicio||'')}</p><p id="familyAlarmClock" style="font-size:18px;margin:0 0 24px"></p>${bloqueado?'<div style="background:rgba(255,255,255,.16);padding:14px 18px;border-radius:14px;font-weight:800">🔒 Este despertador foi ativado pelo responsável e só ele pode retirar.</div>':'<button id="familyAlarmStop" type="button" style="padding:15px 28px;border-radius:14px;border:0;background:#fff;color:#991b1b;font-size:18px;font-weight:900">Parar e retirar alarme</button>'}</div>`;const clock=()=>{const e=document.getElementById('familyAlarmClock');if(e)e.textContent=new Date().toLocaleTimeString('pt-BR')};clock();relogioTimer=setInterval(clock,1000);if(!bloqueado)o.querySelector('#familyAlarmStop').onclick=()=>gravar(a,false,'CLIENTE').then(()=>encerrarDisparo());iniciarSom()}
function encerrarDisparo(){document.getElementById('familyAlarmOverlay')?.remove();alarmeDisparado='';pararSom();if(relogioTimer){clearInterval(relogioTimer);relogioTimer=null}setTimeout(verificarDisparo,200)}

function boot(){decorarTarefas();const tbody=document.getElementById('tabelaCorpo');if(tbody)new MutationObserver(decorarTarefas).observe(tbody,{childList:true,subtree:true});document.addEventListener('pointerdown',()=>{const a=audio();a.resume?.().catch(()=>{})},{once:true});escutar();setInterval(verificarDisparo,1000)}
window.addEventListener('online',sincronizarPendente);document.addEventListener('visibilitychange',()=>{if(!document.hidden){decorarTarefas();verificarDisparo()}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
