import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig={apiKey:'AIzaSyCP9odEV8TJGOM4lflHk64BbPyXXVjGcYg',authDomain:'sistema-de-metas-diarias.firebaseapp.com',projectId:'sistema-de-metas-diarias',storageBucket:'sistema-de-metas-diarias.firebasestorage.app',messagingSenderId:'576624564310',appId:'1:576624564310:web:fb2115a0c21659fefb83f7'};
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const db=getFirestore(app);
const REGRA={dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0};
let tarefas=[];
let historico=[];
let regra={...REGRA};
let unsubTarefas=null,unsubHistorico=null,unsubConfig=null;
let pendente=null;
let timerId=null;

const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtData=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const minHora=h=>{if(!h)return 0;const [a,b]=h.split(':').map(Number);return a*60+b;};
const agoraMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;};
const perfilId=()=>localStorage.getItem('cliente_perfil_id')||'';
const grupoId=()=>localStorage.getItem('cliente_grupo')||'';
const nomeCliente=()=>localStorage.getItem('cliente_nome')||'';

function limites(tol){
  tol=Math.max(0,Number(tol)||0);
  if(tol===0)return {base:0,l75:0,l50:0};
  const extra75=Math.max(1,Math.ceil(tol*.25));
  const extra50=Math.max(extra75+1,Math.ceil(tol*.50));
  return {base:tol,l75:tol+extra75,l50:tol+extra50};
}
function atrasoInicio(t,agora=agoraMin()){
  const previsto=minHora(t.horaSugeridaInicio);
  if(t.horarioInicio)return Math.max(0,minHora(t.horarioInicio)-previsto);
  if((t.status||'Pendente')==='Pendente')return Math.max(0,agora-previsto);
  return 0;
}
function atrasoFim(t,agora=agoraMin()){
  const previsto=minHora(t.horaSugeridaFim);
  if(t.horarioTermino)return Math.max(0,minHora(t.horarioTermino)-previsto);
  if(t.status==='Em andamento')return Math.max(0,agora-previsto);
  return 0;
}
function consumo(t,agora=agoraMin()){return atrasoInicio(t,agora)+atrasoFim(t,agora);}
function faixaPorConsumo(t,c){
  const L=limites(t.tempoLimite);
  if(c<=L.base)return {pct:regra.dentroLimites,faixa:'dentro-limites'};
  if(c<=L.l75)return {pct:regra.atrasoLeve,faixa:'atraso-leve'};
  if(c<=L.l50)return {pct:regra.atrasoMaior,faixa:'atraso-maior'};
  return {pct:regra.estourado,faixa:'estourado'};
}
function textoRegra(){
  return `<strong>Como funciona seu saldo de tolerância</strong><br><br>`+
  `Cada tarefa tem <strong>um único saldo de tolerância</strong>. Se você começar depois do horário, usa uma parte desse saldo. Se terminar depois do horário, usa o que ainda restou.<br><br>`+
  `🟢 <strong>${regra.dentroLimites}% dos pontos</strong>: usou até todo o saldo normal.<br>`+
  `🟡 <strong>${regra.atrasoLeve}%</strong>: passou um pouco do saldo, até mais 25%.<br>`+
  `🟠 <strong>${regra.atrasoMaior}%</strong>: passou mais, mas ficou até 50% além do saldo.<br>`+
  `🔴 <strong>${regra.estourado}%</strong>: passou de 50% além da tolerância.<br><br>`+
  `<strong>Exemplo:</strong> se a tolerância for 10 minutos, até 10 min = ${regra.dentroLimites}%; até 13 min = ${regra.atrasoLeve}%; até 15 min = ${regra.atrasoMaior}%; acima disso = ${regra.estourado}%.<br><br>`+
  `⏱️ Quando você começar a usar a tolerância, o relógio mostra quanto ainda resta. A próxima tarefa tem seu próprio relógio, mesmo se a anterior ainda estiver acontecendo.<br><br>`+
  `💬 <strong>Justificativa também conta:</strong> se algo aconteceu e você explicar o motivo, seu responsável pode analisar a situação. Ele pode manter a pontuação ou devolver parte ou todos os pontos. O resultado automático continua registrado, junto com a decisão do responsável.`;
}
function instalarExplicacao(){
  window.abrirInfoRegraAtraso=()=>{const el=document.getElementById('textoRegraAtrasoCliente');if(el)el.innerHTML=textoRegra();const m=document.getElementById('modalInfoRegraAtraso');if(m)m.style.display='flex';};
}
function garantirEstilo(){
  if(document.getElementById('clientRulesV2Style'))return;
  const s=document.createElement('style');s.id='clientRulesV2Style';s.textContent=`
  .tol-badge{display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:5px 8px;border-radius:999px;font-size:.72rem;font-weight:800;background:#eef2ff;color:#334155;border:1px solid #c7d2fe}.tol-badge.warn{background:#fff7ed;color:#b45309;border-color:#fed7aa}.tol-badge.danger{background:#fef2f2;color:#b91c1c;border-color:#fecaca}.review-client-card{margin:0 0 18px;padding:14px;border:1px solid var(--cor-clara);background:linear-gradient(135deg,#fff,#fff8fa);border-radius:16px;text-align:left}.review-client-item{padding:10px 0;border-bottom:1px solid #eee}.review-client-item:last-child{border-bottom:0}.review-client-pill{display:inline-block;margin-top:5px;padding:4px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:.75rem;font-weight:800}.just-modal-v2{position:fixed;inset:0;z-index:15000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px}.just-modal-v2>div{width:min(92vw,460px);background:white;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.25)}.just-modal-v2 textarea{width:100%;min-height:100px;box-sizing:border-box;padding:12px;border:2px solid #ddd;border-radius:12px;font:inherit}.just-actions-v2{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}.just-actions-v2 button{border:0;border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer}.task-icon-cliente{font-size:20px}`;document.head.appendChild(s);
}
function garantirPainelRevisoes(){
  if(document.getElementById('revisoesClienteV2'))return;
  const tabela=document.querySelector('#telaApp table');if(!tabela)return;
  const d=document.createElement('div');d.id='revisoesClienteV2';d.className='review-client-card';
  d.innerHTML='<strong>💬 Respostas do responsável</strong><div id="revisoesClienteLista" style="margin-top:7px"><small>Quando uma justificativa for analisada, a resposta aparece aqui.</small></div>';
  tabela.parentNode.insertBefore(d,tabela);
}
function renderRevisoes(){
  garantirPainelRevisoes();const el=document.getElementById('revisoesClienteLista');if(!el)return;
  const lista=historico.filter(h=>h.revisaoStatus==='revisada').sort((a,b)=>(b.revisadoEm||'').localeCompare(a.revisadoEm||'')).slice(0,6);
  if(!lista.length){el.innerHTML='<small>Quando uma justificativa for analisada, a resposta aparece aqui.</small>';return;}
  el.innerHTML=lista.map(h=>{const orig=Number(h.pontosOriginais??h.pontosGanhos??0),novo=Number(h.pontosGanhos||0);const devolvidos=Math.max(0,novo-orig);const msg=devolvidos>0?`Seu responsável analisou sua justificativa e devolveu <strong>${devolvidos} ponto(s)</strong>.`:`Seu responsável analisou sua justificativa e manteve a pontuação.`;return `<div class="review-client-item"><strong>${esc(h.nomeTarefa||'Tarefa')}</strong><br><span>${msg}</span><br><span class="review-client-pill">Resultado: ${novo} / ${Number(h.pontosMaximos)||0} pts</span></div>`}).join('');
}
function decorarIconesEscolhidos(){
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{const nome=row.children?.[1]?.querySelector('strong')?.textContent?.trim();if(!nome)return;const t=tarefas.find(x=>x.nome===nome);const ic=t?.icone;if(!ic)return;const span=row.querySelector('.task-icon-cliente');if(span)span.textContent=ic;});
}
function atualizarTimers(){
  const now=agoraMin();
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
    const nome=row.children?.[1]?.querySelector('strong')?.textContent?.trim();if(!nome)return;
    const t=tarefas.find(x=>x.nome===nome);if(!t)return;
    row.querySelectorAll('.tol-badge').forEach(x=>x.remove());
    if((t.status||'Pendente').includes('Prazo')||(t.status||'').includes('Atrasado'))return;
    const c=consumo(t,now),tol=Number(t.tempoLimite)||0;
    if(c<=0)return;
    const rest=tol-c;const badge=document.createElement('span');badge.className='tol-badge';
    if(rest>0){const sec=Math.max(0,Math.round(rest*60));badge.textContent=`⏱️ Tolerância: ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} restante`;}
    else{const extra=Math.abs(rest);const f=faixaPorConsumo(t,c);badge.classList.add(f.pct===0?'danger':'warn');badge.textContent=f.pct===0?`🔴 Tolerância estourada · +${Math.ceil(extra)} min · 0%`:`⚠️ Tolerância estourada · +${Math.ceil(extra)} min · faixa ${f.pct}%`;}
    const host=row.children?.[1];host?.appendChild(document.createElement('br'));host?.appendChild(badge);
  });
}
async function salvarResultado(t,hora,data,c,pct,faixa,justificativa='',tipo=''){
  const pts=Math.round((Number(t.pontosMaximos)||0)*(pct/100));
  const base={horarioTermino:hora,status:pct===0?'Atrasado (0%)':pct===regra.dentroLimites?`No Prazo (${pct}%)`:`Concluída com tolerância estourada (${pct}%)`,pontosGanhos:pts,pontosOriginais:pts,percentualAplicado:pct,percentualOriginal:pct,faixaAtraso:faixa,toleranciaConsumidaMin:Number(c.toFixed(2)),limite75Min:limites(t.tempoLimite).l75,limite50Min:limites(t.tempoLimite).l50,regraAtrasoAplicada:{...regra},justificativaAtraso:justificativa,tipoJustificativa:tipo||'',justificativaRecusada:!justificativa&&pct===0,revisaoStatus:justificativa?'aguardando':'sem-revisao'};
  await updateDoc(doc(db,'tarefas',t.id),base);
  const hist={grupoId:grupoId(),perfilId:perfilId(),perfilNome:nomeCliente(),tarefaId:t.id,tarefaGrupoId:t.tarefaGrupoId||'',nomeTarefa:t.nome,diaSemana:t.diaSemana,data,horaSugeridaInicio:t.horaSugeridaInicio,horaSugeridaFim:t.horaSugeridaFim,horarioInicio:t.horarioInicio||'',tempoLimite:Number(t.tempoLimite)||0,pontosMaximos:Number(t.pontosMaximos)||0,icone:t.icone||'',atrasoInicioMin:Number(atrasoInicio(t).toFixed(2)),atrasoFimMin:Number(atrasoFim({...t,horarioTermino:hora,status:'concluida'}).toFixed(2)),...base};
  await setDoc(doc(db,'historico',`${perfilId()}_${t.id}_${data}`),hist,{merge:true});
  await setDoc(doc(db,'execucoes',`${data}__${t.id}`),hist,{merge:true});
}
function modalJustificativa(t,hora,data,c){
  pendente={t,hora,data,c};document.getElementById('justModalV2')?.remove();
  const m=document.createElement('div');m.id='justModalV2';m.className='just-modal-v2';m.innerHTML=`<div><h2 style="margin-top:0">💬 Conte o que aconteceu</h2><p>Seu saldo de tolerância passou do limite. Se aconteceu algo importante, explique com suas palavras. Seu responsável poderá analisar a situação e decidir se devolve parte ou todos os pontos.</p><textarea id="justTextoV2" placeholder="Explique o motivo em pelo menos 5 palavras..."></textarea><div id="justErroV2" style="display:none;color:#b91c1c;font-size:.85rem;margin-top:6px">Escreva pelo menos 5 palavras.</div><div class="just-actions-v2"><button id="justSemV2">Concluir sem justificar</button><button id="justVozV2">🎙️ Falar</button><button id="justEnviarV2" style="background:var(--cor-primaria);color:#fff">Enviar justificativa</button></div></div>`;document.body.appendChild(m);
  m.querySelector('#justSemV2').onclick=async()=>{await salvarResultado(t,hora,data,c,0,'estourado','','nao-informada');m.remove();pendente=null;};
  m.querySelector('#justEnviarV2').onclick=async()=>{const tx=m.querySelector('#justTextoV2').value.trim();if(tx.split(/\s+/).filter(Boolean).length<5){m.querySelector('#justErroV2').style.display='block';return;}await salvarResultado(t,hora,data,c,0,'estourado',tx,'texto');m.remove();pendente=null;};
  m.querySelector('#justVozV2').onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return alert('O reconhecimento de voz não está disponível neste navegador. Você pode escrever normalmente.');const r=new SR();r.lang='pt-BR';r.onresult=e=>{const tx=e.results?.[0]?.[0]?.transcript||'';m.querySelector('#justTextoV2').value=(m.querySelector('#justTextoV2').value+' '+tx).trim();};r.start();};
}
function instalarFinalizacao(){
  window.finalizarTarefa=async id=>{
    const t=tarefas.find(x=>x.id===id);if(!t)return;
    const d=new Date(),hora=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),data=fmtData(d);
    const c=consumo({...t,horarioTermino:hora,status:'concluida'},agoraMin());const f=faixaPorConsumo(t,c);
    if(f.pct===0){modalJustificativa(t,hora,data,c);return;}
    await salvarResultado(t,hora,data,c,f.pct,f.faixa);
    if(window.confetti)window.confetti({particleCount:45,spread:60,origin:{y:.75}});
  };
}
function iniciarEscutas(){
  const g=grupoId(),p=perfilId(),n=nomeCliente();if(!g)return;
  unsubTarefas?.();unsubHistorico?.();unsubConfig?.();
  unsubTarefas=onSnapshot(query(collection(db,'tarefas'),where('grupoId','==',g)),s=>{tarefas=s.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.perfilId?t.perfilId===p:t.perfilNome===n);setTimeout(()=>{decorarIconesEscolhidos();atualizarTimers();},60);});
  unsubHistorico=onSnapshot(query(collection(db,'historico'),where('grupoId','==',g)),s=>{historico=s.docs.map(d=>({id:d.id,...d.data()})).filter(h=>h.perfilId?h.perfilId===p:h.perfilNome===n);renderRevisoes();});
  unsubConfig=onSnapshot(doc(db,'configGrupos',g),s=>{const r=s.exists()?(s.data().regraAtraso||{}):{};regra={dentroLimites:Number(r.dentroLimites??100),atrasoLeve:Number(r.atrasoLeve??75),atrasoMaior:Number(r.atrasoMaior??50),estourado:0};});
  if(timerId)clearInterval(timerId);timerId=setInterval(()=>{decorarIconesEscolhidos();atualizarTimers();},1000);
}
function boot(){garantirEstilo();instalarExplicacao();instalarFinalizacao();garantirPainelRevisoes();iniciarEscutas();window.addEventListener('storage',iniciarEscutas);document.addEventListener('click',e=>{if(e.target?.id==='authNome'||e.target?.closest('#telaAuth'))setTimeout(iniciarEscutas,700);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
