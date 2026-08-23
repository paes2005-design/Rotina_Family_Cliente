import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,collection,query,where,getDocs,doc,writeBatch,updateDoc} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const pad=n=>String(n).padStart(2,'0');
const dataLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';
const MIGRATION_VERSION=2;
const CAMPOS=[
  'tarefaGrupoId','diaSemana','horaSugeridaInicio','horaSugeridaFim','horarioInicio','horarioTermino',
  'inicioExecutadoEm','terminoExecutadoEm','tempoLimite','pontosMaximos','pontosGanhos','pontosOriginais',
  'percentualAplicado','percentualOriginal','faixaAtraso','toleranciaConsumidaMin','toleranciaConsumidaSeg',
  'atrasoInicioMin','atrasoFimMin','limite75Min','limite50Min','limite75Seg','limite50Seg','icone',
  'inicioAntecipado','antecipacaoMin','motivoInicioAntecipado','tipoMotivoInicioAntecipado','iniciouComAtraso',
  'justificativaAtraso','tipoJustificativa','justificativaRecusada','revisaoStatus'
];
let executando=false,ultimaExecucao=0,hookInstalado=false;

function log(evento,detalhes={},nivel='info'){try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}}
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

function faixaNormalizada(reg={}){
  const faixa=String(reg.faixaAtraso||'').trim();
  if(['dentro-limites','atraso-leve','atraso-maior','estourado'].includes(faixa))return faixa;
  const status=String(reg.status||'');
  if(/Atrasado|\(0%\)/i.test(status))return 'estourado';
  if(/atraso\s+maior|50%/i.test(status))return 'atraso-maior';
  if(/atraso\s+leve|pequeno\s+atraso|75%/i.test(status))return 'atraso-leve';
  if(/No\s+Prazo/i.test(status))return 'dentro-limites';
  return faixa;
}
function faixaValida(reg={}){return ['dentro-limites','atraso-leve','atraso-maior'].includes(faixaNormalizada(reg));}
function percentualDaFaixa(faixa){return faixa==='dentro-limites'?100:faixa==='atraso-leve'?75:faixa==='atraso-maior'?50:0;}
function statusDaFaixa(faixa){return faixa==='dentro-limites'?'No Prazo (100%)':faixa==='atraso-leve'?'No Prazo — atraso leve (75%)':faixa==='atraso-maior'?'No Prazo — atraso maior (50%)':'Atrasado (0%)';}

function patchPontuacaoIntegral(reg={}){
  const max=Math.max(0,Number(reg.pontosMaximos)||0);
  const faixa=faixaNormalizada(reg);
  if(!max||!['dentro-limites','atraso-leve','atraso-maior'].includes(faixa))return null;
  const pct=percentualDaFaixa(faixa);
  const status=statusDaFaixa(faixa);
  const precisa=Number(reg.pontosGanhos)!==max||Number(reg.pontosOriginais)!==max||Number(reg.percentualAplicado)!==pct||String(reg.status||'')!==status||String(reg.faixaAtraso||'')!==faixa;
  if(!precisa&&Number(reg.pontuacaoRegraVersao||0)>=MIGRATION_VERSION)return null;
  return {
    pontosGanhos:max,
    pontosOriginais:max,
    percentualAplicado:pct,
    percentualOriginal:pct,
    faixaAtraso:faixa,
    status,
    pontuacaoRegraVersao:MIGRATION_VERSION,
    pontuacaoCorrecao:'percentual-apenas-tempo',
    pontuacaoCorrigidaEm:new Date().toISOString()
  };
}

function normalizarObjetoLocal(reg={}){
  const patch=patchPontuacaoIntegral(reg);if(!patch)return reg;
  Object.assign(reg,patch);
  return reg;
}

function payloadHistorico(t,data){
  const h={grupoId:grupo(),perfilId:t.perfilId||perfil(),perfilNome:t.perfilNome||nome(),tarefaId:t.id,nomeTarefa:t.nome||t.nomeTarefa||'Tarefa',data,dataExecucao:data,status:t.status||'',reconciliadoEm:new Date().toISOString(),reconciliadoPor:'CLIENTE',origemReconciliacao:'tarefa-concluida-sem-historico'};
  CAMPOS.forEach(c=>{if(t[c]!==undefined)h[c]=t[c];});
  if(h.pontosOriginais===undefined)h.pontosOriginais=Number(h.pontosGanhos)||0;
  if(h.percentualOriginal===undefined&&h.percentualAplicado!==undefined)h.percentualOriginal=h.percentualAplicado;
  if(!h.revisaoStatus)h.revisaoStatus=h.justificativaAtraso?'aguardando':'sem-revisao';
  normalizarObjetoLocal(h);
  return h;
}

function avisar(qtd,pontos,tipo='recuperada'){
  document.getElementById('historyRepairToast')?.remove();
  const el=document.createElement('div');el.id='historyRepairToast';
  el.textContent=pontos>0?`✅ Pontuação ${tipo}: +${pontos} ponto${pontos===1?'':'s'}.`:`✅ ${qtd} registro${qtd===1?'':'s'} corrigido${qtd===1?'':'s'}.`;
  el.style.cssText='position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:32000;background:#166534;color:#fff;padding:12px 17px;border-radius:12px;font-weight:900;box-shadow:0 8px 26px rgba(0,0,0,.24);max-width:90vw;text-align:center';
  document.body.appendChild(el);setTimeout(()=>el.remove(),5000);
}

async function executarOperacoes(banco,operacoes=[]){
  let feitas=0;
  for(let i=0;i<operacoes.length;i+=350){
    const lote=writeBatch(banco);
    operacoes.slice(i,i+350).forEach(op=>{if(op.set)lote.set(op.ref,op.patch,{merge:true});else lote.update(op.ref,op.patch);});
    await lote.commit();feitas+=Math.min(350,operacoes.length-i);
  }
  return feitas;
}

function chaveMigracao(g,p,n){return `rotina_pontuacao_integral_v${MIGRATION_VERSION}_${g}_${p||n}`;}

export async function reconciliarPontuacaoIntegral(forcar=false){
  if(navigator.onLine===false||!getApps().length)return {corrigidos:0,pontos:0};
  const g=grupo(),p=perfil(),n=nome();if(!g||(!p&&!n))return {corrigidos:0,pontos:0};
  const chave=chaveMigracao(g,p,n);
  if(!forcar&&localStorage.getItem(chave)==='1')return {corrigidos:0,pontos:0};
  const banco=getFirestore(getApp());
  const [tarefasSnap,historicoSnap,execSnap]=await Promise.all([
    getDocs(query(collection(banco,'tarefas'),where('grupoId','==',g))),
    getDocs(query(collection(banco,'historico'),where('grupoId','==',g))),
    getDocs(query(collection(banco,'execucoes'),where('grupoId','==',g)))
  ]);
  const operacoes=[];let pontos=0,corrigidos=0;
  const adicionar=(snap,contarPontos=false)=>{
    snap.docs.forEach(d=>{
      const reg={id:d.id,...d.data()};if(!pertence(reg,p,n))return;
      const patch=patchPontuacaoIntegral(reg);if(!patch)return;
      if(contarPontos)pontos+=Math.max(0,(Number(patch.pontosGanhos)||0)-(Number(reg.pontosGanhos)||0));
      operacoes.push({ref:d.ref,patch});corrigidos++;
    });
  };
  adicionar(historicoSnap,true);adicionar(execSnap,false);adicionar(tarefasSnap,false);
  if(operacoes.length)await executarOperacoes(banco,operacoes);
  localStorage.setItem(chave,'1');
  log('pontuacao.integral_reconciliada',{grupoId:g,perfilId:p,corrigidos,pontosRecuperados:pontos,versao:MIGRATION_VERSION});
  if(pontos>0)avisar(corrigidos,pontos,'corrigida');
  window.dispatchEvent(new CustomEvent('rotina-family-points-updated'));
  return {corrigidos,pontos};
}

function corrigirTarefaDepoisDoResultado(historico){
  const patch=patchPontuacaoIntegral(historico);if(!patch||!historico?.tarefaId||!getApps().length)return;
  setTimeout(()=>{
    const banco=getFirestore(getApp());
    updateDoc(doc(banco,'tarefas',String(historico.tarefaId)),patch).then(()=>{
      log('pontuacao.tarefa_integral_confirmada',{tarefaId:String(historico.tarefaId),pontos:patch.pontosGanhos});
    }).catch(e=>log('pontuacao.tarefa_integral_erro',{tarefaId:String(historico.tarefaId),mensagem:String(e?.message||e)},'warning'));
  },900);
}

function instalarHookHistoricoLocal(tentativa=0){
  if(hookInstalado)return true;
  const original=window.registrarHistoricoLocal;
  if(typeof original!=='function'){if(tentativa<120)setTimeout(()=>instalarHookHistoricoLocal(tentativa+1),50);return false;}
  const wrapped=function(id,historico){
    try{normalizarObjetoLocal(historico);}catch(e){log('pontuacao.normalizacao_local_erro',{mensagem:String(e?.message||e)},'warning');}
    const result=original.apply(this,arguments);
    try{corrigirTarefaDepoisDoResultado(historico);}catch{}
    return result;
  };
  wrapped.__rotinaPontuacaoIntegral=true;wrapped.__rotinaOriginal=original;
  window.registrarHistoricoLocal=wrapped;hookInstalado=true;
  log('pontuacao.hook_integral_pronto',{versao:MIGRATION_VERSION});
  return true;
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
    avisar(faltantes.length,pontos,'recuperada');
    window.dispatchEvent(new CustomEvent('rotina-history-reconciled',{detail:{reparados:faltantes.length,pontos}}));
    return {reparados:faltantes.length,pontos};
  }finally{executando=false;}
}

function iniciar(tentativa=0){
  instalarHookHistoricoLocal();
  if(!getApps().length||!grupo()){if(tentativa<120)setTimeout(()=>iniciar(tentativa+1),100);return;}
  setTimeout(()=>reconciliarPontuacaoIntegral(false).catch(e=>console.warn('Reconciliação integral de pontos:',e)),250);
  setTimeout(()=>reconciliarHistoricoHoje(true).catch(e=>console.warn('Reconciliação do histórico:',e)),500);
}
window.addEventListener('rotina-client-session-ready',()=>{setTimeout(()=>{reconciliarPontuacaoIntegral(false).catch(e=>console.warn('Reconciliação integral:',e));reconciliarHistoricoHoje(true).catch(e=>console.warn('Reconciliação da sessão:',e));},250);});
window.addEventListener('online',()=>{reconciliarPontuacaoIntegral(false).catch(e=>console.warn('Reconciliação integral ao reconectar:',e));reconciliarHistoricoHoje(true).catch(e=>console.warn('Reconciliação ao reconectar:',e));});
window.addEventListener('focus',()=>reconciliarHistoricoHoje().catch(e=>console.warn('Reconciliação ao retornar:',e)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconciliarHistoricoHoje().catch(e=>console.warn('Reconciliação visível:',e));});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>iniciar(),{once:true});else iniciar();
