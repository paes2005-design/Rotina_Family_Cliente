import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,doc,getDoc,updateDoc,setDoc,collection,query,where,getDocs} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {REGRA_PADRAO,classificarConsumoTolerancia,calcularConsumoAtraso} from './scoring-core.js';

const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const pad=n=>String(n).padStart(2,'0');
const dataISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const horaHM=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';
let instalado=false;

function horarioNaData(base,hhmm){const [h,m]=String(hhmm||'00:00').split(':').map(Number);const d=new Date(base);d.setHours(h||0,m||0,0,0);return d;}
function dataOcorrencia(t,agora=new Date()){
  if(t.dataExecucao){const [a,m,d]=String(t.dataExecucao).split('-').map(Number);if(a&&m&&d)return new Date(a,m-1,d);}
  const alvo=DIAS.indexOf(t.diaSemana),d=new Date(agora);d.setHours(0,0,0,0);
  if(alvo>=0)d.setDate(d.getDate()-((d.getDay()-alvo+7)%7));
  return d;
}
function janela(t,agora=new Date()){
  const ocorr=dataOcorrencia(t,agora),inicio=horarioNaData(ocorr,t.horaSugeridaInicio),fim=horarioNaData(ocorr,t.horaSugeridaFim);
  if(fim<=inicio)fim.setDate(fim.getDate()+1);
  return {ocorr,inicio,fim};
}
function inicioReal(t,j,agora){
  if(t.inicioExecutadoEm){const d=new Date(t.inicioExecutadoEm);if(!Number.isNaN(d.getTime()))return d;}
  if(!t.horarioInicio)return agora;
  const d=horarioNaData(j.ocorr,t.horarioInicio);
  if(d<j.inicio&&(j.inicio-d)>12*60*60*1000)d.setDate(d.getDate()+1);
  return d;
}
async function db(){if(!getApps().length)throw new Error('Firebase ainda não inicializado');return getFirestore(getApp());}
async function buscarTarefa(id){const banco=await db(),s=await getDoc(doc(banco,'tarefas',id));return s.exists()?{id:s.id,...s.data()}:null;}
async function regraAtual(){
  try{const g=grupo();if(!g)return REGRA_PADRAO;const banco=await db(),s=await getDoc(doc(banco,'configGrupos',g));const r=s.exists()?(s.data().regraAtraso||{}):{};return {dentroLimites:Number(r.dentroLimites??100),atrasoLeve:Number(r.atrasoLeve??75),atrasoMaior:Number(r.atrasoMaior??50),estourado:0};}catch{return REGRA_PADRAO;}
}
async function ordemPermitida(t){
  const banco=await db(),g=grupo();if(!g)return true;
  const s=await getDocs(query(collection(banco,'tarefas'),where('grupoId','==',g)));
  const lista=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>(x.perfilId?x.perfilId===perfil():x.perfilNome===nome())&&x.diaSemana===t.diaSemana).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));
  const i=lista.findIndex(x=>x.id===t.id);return i<0||!lista.slice(0,i).some(x=>['Pendente','Em andamento'].includes(x.status||'Pendente'));
}
function avisar(msg){const m=document.getElementById('modalTrava');if(m){const p=m.querySelector('p');if(p)p.innerHTML=msg;m.style.display='flex';}else alert(msg.replace(/<[^>]*>/g,' '));}
async function iniciar(id){
  const t=await buscarTarefa(id);if(!t)return;
  const agora=new Date(),j=janela(t,agora);
  if(agora<j.inicio){avisar(`<strong>Ainda não chegou o horário desta tarefa.</strong><br><br>Ela começa às ${t.horaSugeridaInicio}.`);return;}
  if(!(await ordemPermitida(t))){avisar('<strong>Tarefa anterior ainda não terminada.</strong><br><br>Finalize a tarefa anterior antes de iniciar esta.');return;}
  const atrasoInicio=Math.max(0,(agora-j.inicio)/60000),banco=await db();
  await updateDoc(doc(banco,'tarefas',id),{status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),dataExecucao:dataISO(j.ocorr),iniciouComAtraso:atrasoInicio>0,atrasoInicioMin:Number(atrasoInicio.toFixed(2))});
  await setDoc(doc(banco,'execucoes',`${dataISO(j.ocorr)}__${id}`),{grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:id,nomeTarefa:t.nome,data:dataISO(j.ocorr),status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),atrasoInicioMin:Number(atrasoInicio.toFixed(2))},{merge:true});
}
async function salvarResultado(t,agora,j,ini,calc,faixa,justificativa=''){
  const banco=await db(),pontos=Math.round((Number(t.pontosMaximos)||0)*(faixa.percentual/100));
  const status=faixa.faixa==='dentro-limites'?`No Prazo (${faixa.percentual}%)`:faixa.faixa==='atraso-leve'?`No Prazo — atraso leve (${faixa.percentual}%)`:faixa.faixa==='atraso-maior'?`No Prazo — atraso maior (${faixa.percentual}%)`:'Atrasado (0%)';
  const base={horarioTermino:horaHM(agora),terminoExecutadoEm:agora.toISOString(),status,pontosGanhos:pontos,pontosOriginais:pontos,percentualAplicado:faixa.percentual,percentualOriginal:faixa.percentual,faixaAtraso:faixa.faixa,toleranciaConsumidaMin:Number(calc.consumoTotal.toFixed(2)),atrasoInicioMin:Number(calc.atrasoInicio.toFixed(2)),atrasoFimMin:Number(calc.atrasoFim.toFixed(2)),limite75Min:faixa.limite75,limite50Min:faixa.limite50,justificativaAtraso:justificativa,revisaoStatus:justificativa?'aguardando':'sem-revisao'};
  await updateDoc(doc(banco,'tarefas',t.id),base);
  const hist={grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:t.id,tarefaGrupoId:t.tarefaGrupoId||'',nomeTarefa:t.nome,diaSemana:t.diaSemana,data:dataISO(j.ocorr),dataExecucao:dataISO(j.ocorr),horaSugeridaInicio:t.horaSugeridaInicio,horaSugeridaFim:t.horaSugeridaFim,horarioInicio:t.horarioInicio||horaHM(ini),inicioExecutadoEm:t.inicioExecutadoEm||ini.toISOString(),tempoLimite:Number(t.tempoLimite)||0,pontosMaximos:Number(t.pontosMaximos)||0,icone:t.icone||'',...base};
  await setDoc(doc(banco,'historico',`${perfil()}_${t.id}_${dataISO(j.ocorr)}`),hist,{merge:true});
  await setDoc(doc(banco,'execucoes',`${dataISO(j.ocorr)}__${t.id}`),hist,{merge:true});
}
function pedirJustificativa(t,agora,j,ini,calc,faixa){
  document.getElementById('guardJustModalV2')?.remove();
  const m=document.createElement('div');m.id='guardJustModalV2';m.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
  m.innerHTML=`<div style="width:min(92vw,460px);background:#fff;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.25)"><h2 style="margin-top:0">💬 Tolerância estourada</h2><p>Você passou do saldo de tolerância desta tarefa. Se aconteceu algo importante, conte o motivo. Seu responsável poderá analisar depois.</p><textarea id="guardJustTxtV2" rows="4" style="width:100%;box-sizing:border-box;padding:12px;border:2px solid #ddd;border-radius:12px;font:inherit" placeholder="Conte o que aconteceu..."></textarea><div id="guardJustErrV2" style="display:none;color:#b91c1c;margin-top:6px">Escreva pelo menos 5 palavras.</div><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px"><button id="guardSemV2" class="btn">Concluir sem justificar</button><button id="guardEnviarV2" class="btn" style="background:var(--cor-primaria);color:#fff">Enviar justificativa</button></div></div>`;document.body.appendChild(m);
  m.querySelector('#guardSemV2').onclick=async()=>{m.querySelectorAll('button').forEach(b=>b.disabled=true);await salvarResultado(t,agora,j,ini,calc,faixa,'');m.remove();};
  m.querySelector('#guardEnviarV2').onclick=async()=>{const tx=m.querySelector('#guardJustTxtV2').value.trim();if(tx.split(/\s+/).filter(Boolean).length<5){m.querySelector('#guardJustErrV2').style.display='block';return;}m.querySelectorAll('button').forEach(b=>b.disabled=true);await salvarResultado(t,agora,j,ini,calc,faixa,tx);m.remove();};
}
async function finalizar(id){
  const t=await buscarTarefa(id);if(!t)return;
  const agora=new Date(),j=janela(t,agora),ini=inicioReal(t,j,agora),calc=calcularConsumoAtraso({inicioPrevisto:j.inicio,inicioReal:ini,fimPrevisto:j.fim,fimReal:agora}),regra=await regraAtual(),faixa=classificarConsumoTolerancia(t.tempoLimite,calc.consumoTotal,regra);
  if(faixa.percentual===0){pedirJustificativa(t,agora,j,ini,calc,faixa);return;}
  await salvarResultado(t,agora,j,ini,calc,faixa,'');
  try{window.confetti?.({particleCount:45,spread:60,origin:{y:.75}});}catch{}
}
function instalar(tentativa=0){
  if(instalado)return;
  if(typeof window.iniciarTarefa!=='function'||typeof window.finalizarTarefa!=='function'||!getApps().length){if(tentativa<120)setTimeout(()=>instalar(tentativa+1),50);return;}
  window.iniciarTarefa=id=>iniciar(id).catch(e=>{console.error('Validação de início:',e);alert('Não foi possível iniciar a tarefa agora. Tente novamente.');});
  window.finalizarTarefa=id=>finalizar(id).catch(e=>{console.error('Validação de término:',e);alert('Não foi possível finalizar a tarefa agora. Tente novamente.');});
  instalado=true;
  const diaBoot=dataISO(new Date());
  const checarVirada=()=>{if(dataISO(new Date())!==diaBoot)location.reload();};
  window.addEventListener('focus',checarVirada);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checarVirada();});
}
instalar();
