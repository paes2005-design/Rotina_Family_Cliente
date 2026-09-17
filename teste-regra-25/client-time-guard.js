import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const db=getFirestore(getApp());
const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
let legacyStart=null, legacyFinish=null, instalado=false;

const pad=n=>String(n).padStart(2,'0');
const dataISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const horaHM=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';

function limites(tol){
  tol=Math.max(0,Number(tol)||0);
  if(!tol)return {base:0,l75:0,l50:0};
  const e75=Math.max(1,Math.ceil(tol*.25));
  const e50=Math.max(e75+1,Math.ceil(tol*.50));
  return {base:tol,l75:tol+e75,l50:tol+e50};
}
function faixa(tol,consumo,regra={dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0}){
  const l=limites(tol);
  if(consumo<=l.base)return {pct:Number(regra.dentroLimites??100),faixa:'dentro-limites'};
  if(consumo<=l.l75)return {pct:Number(regra.atrasoLeve??75),faixa:'atraso-leve'};
  if(consumo<=l.l50)return {pct:Number(regra.atrasoMaior??50),faixa:'atraso-maior'};
  return {pct:0,faixa:'estourado'};
}
function dataOcorrencia(t,agora=new Date()){
  if(t.dataExecucao){const [a,m,d]=t.dataExecucao.split('-').map(Number);if(a&&m&&d)return new Date(a,m-1,d);}
  const alvo=DIAS.indexOf(t.diaSemana);
  const d=new Date(agora);d.setHours(0,0,0,0);
  if(alvo>=0){let dif=(d.getDay()-alvo+7)%7;d.setDate(d.getDate()-dif);}
  return d;
}
function horarioNaData(base,hhmm){
  const [h,m]=String(hhmm||'00:00').split(':').map(Number);const d=new Date(base);d.setHours(h||0,m||0,0,0);return d;
}
function janela(t,agora=new Date()){
  const ocorr=dataOcorrencia(t,agora);
  const ini=horarioNaData(ocorr,t.horaSugeridaInicio);
  const fim=horarioNaData(ocorr,t.horaSugeridaFim);
  if(fim<=ini)fim.setDate(fim.getDate()+1);
  return {ocorr,ini,fim};
}
function inicioReal(t,j,agora){
  if(t.inicioExecutadoEm){const d=new Date(t.inicioExecutadoEm);if(!isNaN(d))return d;}
  if(!t.horarioInicio)return agora;
  let d=horarioNaData(j.ocorr,t.horarioInicio);
  // Compatibilidade com execuções antigas que atravessaram meia-noite.
  if(d<j.ini && (j.ini-d)>12*60*60*1000)d.setDate(d.getDate()+1);
  return d;
}
async function regraGrupo(){
  try{const g=grupo();if(!g)return {dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0};const s=await getDoc(doc(db,'configGrupos',g));const r=s.exists()?(s.data().regraAtraso||{}):{};return {dentroLimites:Number(r.dentroLimites??100),atrasoLeve:Number(r.atrasoLeve??75),atrasoMaior:Number(r.atrasoMaior??50),estourado:0};}catch{return {dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0};}
}
async function tarefa(id){const s=await getDoc(doc(db,'tarefas',id));return s.exists()?{id:s.id,...s.data()}:null;}
async function ordemPermitida(t){
  const g=grupo();if(!g)return true;
  const s=await getDocs(query(collection(db,'tarefas'),where('grupoId','==',g)));
  const lista=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>(x.perfilId?x.perfilId===perfil():x.perfilNome===nome())&&x.diaSemana===t.diaSemana).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));
  const i=lista.findIndex(x=>x.id===t.id);return i<0||!lista.slice(0,i).some(x=>['Pendente','Em andamento'].includes(x.status||'Pendente'));
}
function modalTrava(msg){const m=document.getElementById('modalTrava');if(m){const p=m.querySelector('p');if(p)p.innerHTML=msg;m.style.display='flex';}else alert(msg.replace(/<[^>]*>/g,' '));}
async function salvar(t,agora,consumo,f,justificativa=''){
  const regra=await regraGrupo(), pts=Math.round((Number(t.pontosMaximos)||0)*(f.pct/100));
  const j=janela(t,agora), ini=inicioReal(t,j,agora);
  const atrasoIni=Math.max(0,(ini-j.ini)/60000), atrasoFim=Math.max(0,(agora-j.fim)/60000);
  const status=f.pct===0?'Atrasado (0%)':f.faixa==='dentro-limites'?`No Prazo (${f.pct}%)`:`Concluída com tolerância estourada (${f.pct}%)`;
  const base={horarioTermino:horaHM(agora),terminoExecutadoEm:agora.toISOString(),status,pontosGanhos:pts,pontosOriginais:pts,percentualAplicado:f.pct,percentualOriginal:f.pct,faixaAtraso:f.faixa,toleranciaConsumidaMin:Number(consumo.toFixed(2)),atrasoInicioMin:Number(atrasoIni.toFixed(2)),atrasoFimMin:Number(atrasoFim.toFixed(2)),limite75Min:limites(t.tempoLimite).l75,limite50Min:limites(t.tempoLimite).l50,regraAtrasoAplicada:regra,justificativaAtraso:justificativa,revisaoStatus:justificativa?'aguardando':'sem-revisao'};
  await updateDoc(doc(db,'tarefas',t.id),base);
  const hist={grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:t.id,tarefaGrupoId:t.tarefaGrupoId||'',nomeTarefa:t.nome,diaSemana:t.diaSemana,data:dataISO(j.ocorr),dataExecucao:dataISO(j.ocorr),horaSugeridaInicio:t.horaSugeridaInicio,horaSugeridaFim:t.horaSugeridaFim,horarioInicio:t.horarioInicio||horaHM(ini),inicioExecutadoEm:t.inicioExecutadoEm||ini.toISOString(),tempoLimite:Number(t.tempoLimite)||0,pontosMaximos:Number(t.pontosMaximos)||0,icone:t.icone||'',...base};
  const hid=`${perfil()}_${t.id}_${dataISO(j.ocorr)}`;
  await setDoc(doc(db,'historico',hid),hist,{merge:true});
  await setDoc(doc(db,'execucoes',`${dataISO(j.ocorr)}__${t.id}`),hist,{merge:true});
}
function pedirJustificativa(t,agora,consumo,f){
  document.getElementById('guardJustModal')?.remove();
  const m=document.createElement('div');m.id='guardJustModal';m.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
  m.innerHTML=`<div style="width:min(92vw,460px);background:#fff;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.25)"><h2 style="margin-top:0">💬 Tolerância estourada</h2><p>Você passou do saldo de tolerância desta tarefa. Se aconteceu algo importante, conte o motivo. Seu responsável poderá analisar depois.</p><textarea id="guardJustTxt" rows="4" style="width:100%;box-sizing:border-box;padding:12px;border:2px solid #ddd;border-radius:12px;font:inherit" placeholder="Conte o que aconteceu..."></textarea><div id="guardJustErr" style="display:none;color:#b91c1c;margin-top:6px">Escreva pelo menos 5 palavras.</div><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px"><button id="guardSem" class="btn">Concluir sem justificar</button><button id="guardEnviar" class="btn" style="background:var(--cor-primaria);color:#fff">Enviar justificativa</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector('#guardSem').onclick=async()=>{m.querySelectorAll('button').forEach(b=>b.disabled=true);await salvar(t,agora,consumo,f,'');m.remove();};
  m.querySelector('#guardEnviar').onclick=async()=>{const tx=m.querySelector('#guardJustTxt').value.trim();if(tx.split(/\s+/).filter(Boolean).length<5){m.querySelector('#guardJustErr').style.display='block';return;}m.querySelectorAll('button').forEach(b=>b.disabled=true);await salvar(t,agora,consumo,f,tx);m.remove();};
}
async function iniciar(id){
  const t=await tarefa(id);if(!t)return;
  const agora=new Date(),j=janela(t,agora);
  if(agora<j.ini){modalTrava(`<strong>Ainda não chegou o horário desta tarefa.</strong><br><br>Ela começa às ${t.horaSugeridaInicio}.`);return;}
  if(!(await ordemPermitida(t))){modalTrava('<strong>Tarefa anterior ainda não terminada.</strong><br><br>Finalize a tarefa anterior antes de iniciar esta.');return;}
  const atraso=Math.max(0,(agora-j.ini)/60000), l=limites(t.tempoLimite);
  await updateDoc(doc(db,'tarefas',id),{status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),dataExecucao:dataISO(j.ocorr),iniciouComAtraso:atraso>Number(t.tempoLimite||0),iniciouAposLimiteFinal:atraso>l.l50,toleranciaConsumidaInicioMin:Number(atraso.toFixed(2))});
  await setDoc(doc(db,'execucoes',`${dataISO(j.ocorr)}__${id}`),{grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:id,nomeTarefa:t.nome,data:dataISO(j.ocorr),status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),atrasoInicioMin:Number(atraso.toFixed(2))},{merge:true});
}
async function finalizar(id){
  const t=await tarefa(id);if(!t)return;
  const agora=new Date(),j=janela(t,agora),ini=inicioReal(t,j,agora);
  const atrasoIni=Math.max(0,(ini-j.ini)/60000), atrasoFim=Math.max(0,(agora-j.fim)/60000), consumo=atrasoIni+atrasoFim;
  const r=await regraGrupo(), f=faixa(t.tempoLimite,consumo,r);
  if(f.pct===0){pedirJustificativa(t,agora,consumo,f);return;}
  await salvar(t,agora,consumo,f,'');
  try{window.confetti?.({particleCount:45,spread:60,origin:{y:.75}});}catch{}
}
function instalar(){
  if(instalado)return;
  if(typeof window.iniciarTarefa!=='function'||typeof window.finalizarTarefa!=='function'){setTimeout(instalar,100);return;}
  legacyStart=window.iniciarTarefa;legacyFinish=window.finalizarTarefa;
  window.iniciarTarefa=id=>iniciar(id).catch(e=>{console.error('Falha na validação temporal do início',e);alert('Não foi possível iniciar a tarefa agora. Tente novamente.');});
  window.finalizarTarefa=id=>finalizar(id).catch(e=>{console.error('Falha na validação temporal do término',e);alert('Não foi possível finalizar a tarefa agora. Tente novamente.');});
  instalado=true;
  const boot=dataISO(new Date());
  const checarVirada=()=>{if(dataISO(new Date())!==boot)location.reload();};
  window.addEventListener('focus',checarVirada);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checarVirada();});
}
instalar();
