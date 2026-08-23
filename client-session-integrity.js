import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,doc,updateDoc,collection,query,where,getDocs} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const LOG=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}};
const grupo=()=>String(localStorage.getItem('cliente_grupo')||'').trim();
const perfil=()=>String(localStorage.getItem('cliente_perfil_id')||'').trim();
const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim();
const db=()=>getApps().length?getFirestore(getApp()):null;
const limpezasCamposFinais=new Set();

// -----------------------------------------------------------------------------
// 1) Integridade da execução: tarefa Pendente/Em andamento nunca mostra término
//    herdado de uma execução anterior. Ao iniciar, também limpa os campos finais.
// -----------------------------------------------------------------------------
function esconderTerminoAntigo(){
  document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]').forEach(row=>{
    const status=String(row.dataset.familyTaskStatus||'Pendente').trim();
    if(status!=='Pendente'&&status!=='Em andamento')return;
    const real=row.querySelector('.horario-real');
    if(!real)return;
    const antes=real.textContent||'';
    const depois=antes.replace(/\s*\/\s*⏹️.*$/u,'').trim();
    if(depois!==antes.trim()){
      const tarefaId=String(row.dataset.familyTaskId||'').trim();
      real.textContent=depois;
      LOG('integridade.termino_antigo_ocultado',{tarefaId,status});
      if(status==='Em andamento'&&tarefaId)limparCamposFinaisDaTarefa(tarefaId);
    }
  });
}

async function limparCamposFinaisDaTarefa(id){
  const tarefaId=String(id||'').trim();
  const banco=db();
  if(!banco||!tarefaId||limpezasCamposFinais.has(tarefaId))return;
  limpezasCamposFinais.add(tarefaId);
  const dados={
    horarioTermino:'',
    terminoExecutadoEm:'',
    pontosGanhos:0,
    pontosOriginais:0,
    percentualAplicado:null,
    percentualOriginal:null,
    faixaAtraso:'',
    toleranciaConsumidaMin:0,
    toleranciaConsumidaSeg:0,
    atrasoFimMin:0,
    limite75Min:null,
    limite50Min:null,
    limite75Seg:null,
    limite50Seg:null,
    justificativaAtraso:'',
    revisaoStatus:'sem-revisao',
    tipoJustificativa:'',
    justificativaRecusada:false
  };
  try{
    await updateDoc(doc(banco,'tarefas',tarefaId),dados);
    LOG('integridade.inicio_campos_finais_limpos',{tarefaId});
  }catch(e){
    LOG('integridade.inicio_limpeza_erro',{tarefaId,mensagem:String(e?.message||e)},'warning');
  }finally{
    setTimeout(()=>limpezasCamposFinais.delete(tarefaId),1500);
  }
}

function instalarWrapperInicio(){
  const original=window.iniciarTarefa;
  if(typeof original!=='function'||original.__rotinaIntegridadeInicio)return false;
  const wrapped=async id=>{
    const resultado=await original(id);
    // Não segura a interface. O SDK do Firestore mantém a ordem das gravações deste
    // cliente, portanto esta limpeza entra logo depois do comando de início.
    limparCamposFinaisDaTarefa(id);
    esconderTerminoAntigo();
    return resultado;
  };
  wrapped.__rotinaIntegridadeInicio=true;
  wrapped.__rotinaOriginal=original;
  window.iniciarTarefa=wrapped;
  return true;
}

function instalarIntegridadeTarefas(){
  esconderTerminoAntigo();
  instalarWrapperInicio();
  window.addEventListener('rotina-time-guard-ready',()=>{instalarWrapperInicio();esconderTerminoAntigo();});
  window.addEventListener('rotina-family-tasks-rendered',esconderTerminoAntigo);
  const tbody=document.getElementById('tabelaCorpo');
  if(tbody)new MutationObserver(esconderTerminoAntigo).observe(tbody,{childList:true,subtree:true});
  let tentativas=0;
  const timer=setInterval(()=>{
    instalarWrapperInicio();
    esconderTerminoAntigo();
    if(++tentativas>=30)clearInterval(timer);
  },200);
}

// -----------------------------------------------------------------------------
// 2) Retorno de resgate: cria uma linha de corte por perfil. Resgates históricos
//    anteriores ao primeiro acesso desta versão são marcados como vistos. Depois,
//    apenas decisões posteriores ao último acesso podem aparecer como novidade.
// -----------------------------------------------------------------------------
const cutoffKey=(g,p,n)=>`rotina_resgates_ultima_verificacao_${g}_${p||n||'perfil'}`;
const seenKey=r=>`resgate_visto_${r.id}_${r.status}`;
let sessaoResgateProcessada='';

function criarBloqueioTemporarioModal(){
  let style=document.getElementById('rotinaResgateBaselineGuard');
  if(style)return style;
  style=document.createElement('style');
  style.id='rotinaResgateBaselineGuard';
  style.textContent='#modalRecompensaStatus{display:none!important}';
  document.head.appendChild(style);
  return style;
}

async function prepararRetornosResgate(detail={}){
  const g=String(detail.grupo||grupo()||'').trim();
  const p=String(detail.perfilId||perfil()||'').trim();
  const n=nome();
  if(!g)return;
  const assinatura=`${g}__${p||n}`;
  if(sessaoResgateProcessada===assinatura)return;
  sessaoResgateProcessada=assinatura;

  const guard=criarBloqueioTemporarioModal();
  const chave=cutoffKey(g,p,n);
  const ultimoTexto=localStorage.getItem(chave)||'';
  const ultimoMs=Date.parse(ultimoTexto);
  const primeiraExecucao=!Number.isFinite(ultimoMs);
  const agora=new Date();
  let totalResolvidos=0,totalHistoricos=0,totalNovos=0;

  try{
    const banco=db();
    if(!banco)throw new Error('Firebase ainda não inicializado');
    const snap=await getDocs(query(collection(banco,'resgates'),where('grupoId','==',g)));
    const lista=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>{
      if(r.perfilId)return String(r.perfilId)===p;
      return String(r.perfilNome||'')===n;
    });

    for(const r of lista){
      if(r.status!=='Aprovado'&&r.status!=='Recusado')continue;
      totalResolvidos++;
      const decididoMs=Date.parse(String(r.decididoEm||''));
      const ehHistorico=primeiraExecucao||!Number.isFinite(decididoMs)||decididoMs<=ultimoMs;
      if(ehHistorico){
        totalHistoricos++;
        try{localStorage.setItem(seenKey(r),'1');}catch{}
        // Também neutraliza qualquer flag antiga de push que tenha ficado presa.
        updateDoc(doc(banco,'resgates',r.id),{
          pushClientePendente:false,
          clienteRetornoVistoEm:r.clienteRetornoVistoEm||agora.toISOString()
        }).catch(e=>LOG('resgate.baseline_servidor_erro',{resgateId:r.id,mensagem:String(e?.message||e)},'warning'));
      }else{
        totalNovos++;
      }
    }

    localStorage.setItem(chave,agora.toISOString());

    // Se só havia registros antigos, remove qualquer modal que o listener legado
    // tenha tentado abrir durante a leitura inicial do cache.
    if(totalNovos===0){
      const modal=document.getElementById('modalRecompensaStatus');
      if(modal)modal.style.display='none';
    }

    LOG('resgate.baseline_processado',{
      primeiraExecucao,
      totalResolvidos,
      totalHistoricos,
      totalNovos
    });
  }catch(e){
    // Em falha de rede não inventa aviso nem apaga estado. Apenas libera a UI.
    sessaoResgateProcessada='';
    LOG('resgate.baseline_erro',{mensagem:String(e?.message||e)},'warning');
  }finally{
    guard?.remove();
  }
}

function instalarIntegridadeResgates(){
  criarBloqueioTemporarioModal();
  window.addEventListener('rotina-client-session-ready',e=>prepararRetornosResgate(e.detail||{}));
  const g=grupo(),p=perfil();
  if(g)setTimeout(()=>prepararRetornosResgate({grupo:g,perfilId:p}),0);
}

function instalar(){
  instalarIntegridadeTarefas();
  instalarIntegridadeResgates();
  window.__rotinaSessionIntegrity=true;
  LOG('integridade.cliente_pronta',{versao:2});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
