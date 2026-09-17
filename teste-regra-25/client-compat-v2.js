import { getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const db=getFirestore(getApp());
let tarefas=[];
let historico=[];
let ut=null;
let uh=null;
let grupo='';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';
const gid=()=>localStorage.getItem('cliente_grupo')||'';
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function inicioSemana(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x;}
const dias=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
function ocorrenciasMes(dia,ano,mes){let c=0;for(let i=1;i<=new Date(ano,mes+1,0).getDate();i++)if(new Date(ano,mes,i).getDay()===dias.indexOf(dia))c++;return c;}
function atualizarPontos(){
  if(!historico.length&&!tarefas.length)return;
  const agora=new Date(),h=iso(agora),sem=iso(inicioSemana(agora)),ano=agora.getFullYear(),mes=agora.getMonth();
  let d=0,s=0,m=0;
  historico.forEach(x=>{const p=Number(x.pontosGanhos)||0;if(x.data===h)d+=p;if(x.data>=sem&&x.data<=h)s+=p;const [a,mo]=(x.data||'0-0').split('-').map(Number);if(a===ano&&mo-1===mes)m+=p;});
  const hojeDia=dias[agora.getDay()];let pd=0,ps=0,pm=0;
  tarefas.forEach(t=>{const p=Number(t.pontosMaximos)||0;if(t.diaSemana===hojeDia)pd+=p;ps+=p;pm+=p*ocorrenciasMes(t.diaSemana,ano,mes);});
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('ptsHoje',d);set('possivelHoje',` / ${pd} pts`);set('ptsSemana',s);set('possivelSemana',` / ${ps} pts`);set('ptsMes',m);set('possivelMes',` / ${pm} pts`);
}
function decorarLinhas(){
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
    const strong=row.children?.[1]?.querySelector('strong');if(!strong)return;
    const n=strong.textContent.trim();const t=tarefas.find(x=>x.nome===n);if(!t)return;
    const ic=row.querySelector('.task-icon-cliente');if(ic&&t.icone)ic.textContent=t.icone;
    const pct=Number(t.percentualRevisado??t.percentualAplicado);
    if(pct>0&&t.faixaAtraso&&t.faixaAtraso!=='dentro-limites'){
      const badge=row.querySelector('.status-badge');if(badge){badge.classList.remove('status-atrasado');badge.classList.add('status-prazo');}
      const acao=row.children?.[3];if(acao&&/⏰/.test(acao.textContent||''))acao.textContent='🎉';
    }
  });
}
function atualizar(){requestAnimationFrame(()=>{atualizarPontos();decorarLinhas();});}
function ouvir(){
  const g=gid(),p=perfil(),n=nome();if(!g||g===grupo)return;
  grupo=g;ut?.();uh?.();
  ut=onSnapshot(query(collection(db,'tarefas'),where('grupoId','==',g)),s=>{tarefas=s.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.perfilId?t.perfilId===p:t.perfilNome===n);atualizar();});
  uh=onSnapshot(query(collection(db,'historico'),where('grupoId','==',g)),s=>{historico=s.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.perfilId?t.perfilId===p:t.perfilNome===n);atualizar();});
}
function boot(){
  ouvir();
  window.addEventListener('storage',ouvir);
  document.addEventListener('click',e=>{if(e.target?.closest('#telaAuth'))setTimeout(ouvir,700);});
  const tbody=document.getElementById('tabelaCorpo');if(tbody)new MutationObserver(()=>requestAnimationFrame(decorarLinhas)).observe(tbody,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
