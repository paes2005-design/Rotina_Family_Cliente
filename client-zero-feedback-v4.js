(()=>{
  'use strict';
  const VERSION=4;
  const attached=new WeakSet();
  let feedbackOpen=false;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,zeroFeedback:VERSION},nivel);}catch{}};
  const currentTaskId=()=>String((document.querySelector('#tabelaCorpo tr[data-family-task-status="Em andamento"]')||[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')].find(r=>/em andamento/i.test(r.textContent||'')))?.dataset?.familyTaskId||'');
  const selectedMascot=()=>{try{return window.obterMascoteRotina?.()||'dog';}catch{return 'dog';}};

  function showFeedback(taskId=''){
    if(feedbackOpen)return;
    feedbackOpen=true;
    const type=selectedMascot();
    log('tarefa.zero_feedback_exibido',{tarefaId:String(taskId||''),percentual:0,aposJustificativa:true,mascote:type,modo:'mascote-unico'});
    window.dispatchEvent(new CustomEvent('rotina-task-zero',{detail:{tarefaId:String(taskId||''),percentual:0,origem:'apos-justificativa',audioHandled:false,mascote:type,versao:VERSION}}));
    setTimeout(()=>{feedbackOpen=false;},3800);
  }

  function waitForSuccessfulClose(modal,taskId,action){
    const started=performance.now();
    const tick=()=>{
      if(!document.body.contains(modal)){
        setTimeout(()=>showFeedback(taskId),80);
        log('tarefa.zero_feedback_justificativa_concluida',{tarefaId:String(taskId||''),acao:action,tempoMs:Math.round(performance.now()-started)});
        return;
      }
      if(performance.now()-started<60000){setTimeout(tick,100);return;}
      log('tarefa.zero_feedback_timeout',{tarefaId:String(taskId||''),acao:action},'warning');
    };
    setTimeout(tick,80);
  }

  function attach(modal){
    if(!modal||attached.has(modal))return;
    attached.add(modal);
    log('tarefa.zero_feedback_modal_detectado',{tarefaId:currentTaskId()});
    modal.addEventListener('click',event=>{
      const btn=event.target.closest?.('#guardEnviarV2,#guardSemV2');if(!btn)return;
      const taskId=currentTaskId();const action=btn.id==='guardSemV2'?'sem-justificar':'enviar-justificativa';
      log('tarefa.zero_feedback_aguardando_salvamento',{tarefaId:taskId,acao:action});
      waitForSuccessfulClose(modal,taskId,action);
    },true);
  }
  function scan(){attach(document.getElementById('guardJustModalV2'));}
  function start(){scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});log('tarefa.zero_feedback_v4_pronto',{versao:VERSION,unificadoComMascote:true});}
  window.rotinaMostrarZeroPosJustificativa=showFeedback;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();