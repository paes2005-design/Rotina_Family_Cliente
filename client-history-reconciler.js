import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,collection,query,where,getDocs,doc,writeBatch} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const pad=n=>String(n).padStart(2,'0');
const dataLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';
const CAMPOS=[
  'tarefaGrupoId','diaSemana','horaSugeridaInicio','horaSugeridaFim','horarioInicio','horarioTermino',
  'inicioExecutadoEm','terminoExecutadoEm','tempoLimite','pontosMaximos','pontosGanhos','pontosOriginais',
  'percentualAplicado','percentualOriginal','faixaAtraso','toleranciaConsumidaMin','toleranciaConsumidaSeg',
  'atrasoInicioMin','atrasoFimMin','limite75Min','limite50Min','limite75Seg','limite50Seg','icone',
  'inicioAntecipado','antecipacaoMin','motivoInicioAntecipado','tipoMotivoInicioAntecipado','iniciouComAtraso',
  'justificativaAtraso','tipoJustificativa','justificativaRecusada','revisaoStatus'
];
let executando=false,ultimaExecucao=0;

function pertence(reg,p,n){return reg.perfilId?reg.perfilId===p:reg.perfilNome===n;}
function concluida(t){return /Prazo|Atrasado/i.test(String(t.status||''));}
function dataDaTarefa(t){
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(t.dataExecucao||'')))return t.dataExecucao;
  for(const valor of [t.terminoExecutadoEm,t.inicioExecutadoEm]){
    const d=new Date(valor||'');if(Number.isFinite(d.getTime()))return dataLocal(d);
  }
  return '';
}
function historicoDaTarefa(h,t,p,n,data){return pertence(h,p,n)&&h.tarefaId===t.id&&(h.data||h.dataExecucao)===data;}
function payloadHistorico(t,data){
  const h={grupoId:grupo(),perfilId:t.perfilId||perfil(),perfilNome:t.perfilNome||nome(),tarefaId:t.id,nomeTarefa:t.nome||t.nomeTarefa||'Tarefa',data,dataExecucao:data,status:t.status||'',reconciliadoEm:new Date().toISOString(),reconciliadoPor:'CLIENTE',origemReconciliacao:'tarefa-concluida-sem-historico'};
  CAMPOS.forEach(c=>{if(t[c]!==undefined)h[c]=t[c];});
  if(h.pontosOriginais===undefined)h.pontosOriginais=Number(h.pontosGanhos)||0;
  if(h.percentualOriginal===undefined&&h.percentualAplicado!==undefined)h.percentualOriginal=h.percentualAplicado;
  if(!h.revisaoStatus)h.revisaoStatus=h.justificativaAtraso?'aguardando':'sem-revisao';
  return h;
}
function avisar(qtd,pontos){
  document.getElementById('historyRepairToast')?.remove();
  const el=document.createElement('div');el.id='historyRepairToast';
  el.textContent=pontos>0?`✅ Pontuação recuperada: ${pontos} ponto${pontos===1?'':'s'}.`:`✅ ${qtd} registro${qtd===1?'':'s'} recuperado${qtd===1?'':'s'}.`;
  el.style.cssText='position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:32000;background:#166534;color:#fff;padding:12px 17px;border-radius:12px;font-weight:900;box-shadow:0 8px 26px rgba(0,0,0,.24);max-width:90vw;text-align:center';
  document.body.appendChild(el);setTimeout(()=>el.remove(),5000);
}

export async function reconciliarHistoricoHoje(forcar=false){
  if(executando||navigator.onLine===false||!getApps().length)return {reparados:0,pontos:0};
  if(!forcar&&Date.now()-ultimaExecucao<30000)return {reparados:0,pontos:0};
  const g=grupo(),p=perfil(),n=nome();if(!g||(!p&&!n))return {reparados:0,pontos:0};
  executando=true;
  try{
    const banco=getFirestore(getApp());
    const [tarefasSnap,historicoSnap]=await Promise.all([
      getDocs(query(collection(banco,'tarefas'),where('grupoId','==',g))),
      getDocs(query(collection(banco,'historico'),where('grupoId','==',g)))
    ]);
    const hoje=dataLocal(new Date());
    const historicos=historicoSnap.docs.map(d=>d.data());
    const faltantes=tarefasSnap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>pertence(t,p,n)&&concluida(t)&&dataDaTarefa(t)===hoje&&!historicos.some(h=>historicoDaTarefa(h,t,p,n,hoje))).map(t=>payloadHistorico(t,hoje));
    ultimaExecucao=Date.now();
    if(!faltantes.length)return {reparados:0,pontos:0};
    const lote=writeBatch(banco);
    faltantes.forEach(h=>{
      const historicoId=`${h.perfilId||p}_${h.tarefaId}_${h.data}`;
      lote.set(doc(banco,'historico',historicoId),h,{merge:true});
      lote.set(doc(banco,'execucoes',`${h.data}__${h.tarefaId}`),h,{merge:true});
      window.registrarHistoricoLocal?.(historicoId,h);
    });
    await lote.commit();
    const pontos=faltantes.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0);
    avisar(faltantes.length,pontos);
    window.dispatchEvent(new CustomEvent('rotina-history-reconciled',{detail:{reparados:faltantes.length,pontos}}));
    return {reparados:faltantes.length,pontos};
  }finally{executando=false;}
}

function iniciar(tentativa=0){
  if(!getApps().length||!grupo()){if(tentativa<120)setTimeout(()=>iniciar(tentativa+1),100);return;}
  setTimeout(()=>reconciliarHistoricoHoje(true).catch(e=>console.warn('Reconciliação do histórico:',e)),400);
}
window.addEventListener('online',()=>reconciliarHistoricoHoje(true).catch(e=>console.warn('Reconciliação ao reconectar:',e)));
window.addEventListener('focus',()=>reconciliarHistoricoHoje().catch(e=>console.warn('Reconciliação ao retornar:',e)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconciliarHistoricoHoje().catch(e=>console.warn('Reconciliação visível:',e));});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>iniciar(),{once:true});else iniciar();
