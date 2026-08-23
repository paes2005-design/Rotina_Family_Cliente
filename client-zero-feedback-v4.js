(()=>{
  'use strict';
  const VERSION=4;
  const attached=new WeakSet();
  let feedbackOpen=false;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,zeroFeedback:VERSION},nivel);}catch{}};
  const currentTaskId=()=>String((document.querySelector('#tabelaCorpo tr[data-family-task-status="Em andamento"]')||[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')].find(r=>/em andamento/i.test(r.textContent||'')))?.dataset?.familyTaskId||'');
  const selectedMascot=()=>{try{return window.obterMascoteRotina?.()||'dog';}catch{return 'dog';}};

  function showFeedback(taskId=''){
    if(feedbackOpen||document.getElementById('guardZeroFeedbackV4'))return;
    feedbackOpen=true;
    const type=selectedMascot();
    const m=document.createElement('div');m.id='guardZeroFeedbackV4';m.style.cssText='position:fixed;inset:0;z-index:21000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
    m.innerHTML=`<div style="width:min(92vw,430px);background:#fff;border-radius:22px;padding:24px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.25)"><div style="font-size:3rem">${type==='cat'?'🐱':'🐶'}</div><h2 style="margin:5px 0 8px;color:#9f1239">Você não conseguiu</h2><p style="font-size:1.05rem;color:#555;margin:0 0 18px">Não foi dessa vez. Esta tarefa ficou em <strong>0%</strong>.</p><button type="button" id="guardZeroCloseV4" class="btn" style="background:var(--cor-primaria,#ff4d6d);color:#fff;padding:11px 22px">OK</button></div>`;
    document.body.appendChild(m);
    m.querySelector('#guardZeroCloseV4').onclick=()=>{m.remove();feedbackOpen=false;};
    log('tarefa.zero_feedback_exibido',{tarefaId:String(taskId||''),percentual:0,aposJustificativa:true,mascote:type});
    window.dispatchEvent(new CustomEvent('rotina-task-zero',{detail:{tarefaId:String(taskId||''),percentual:0,origem:'apos-justificativa',audioHandled:false,mascote:type,versao:VERSION}}));
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