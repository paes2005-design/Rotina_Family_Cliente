(()=>{
  const seen=new WeakSet();

  function log(evento,detalhes={},nivel='info'){
    try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}
  }

  function currentTaskId(){
    const row=document.querySelector('#tabelaCorpo tr[data-family-task-status="Em andamento"]')||
      [...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')].find(r=>/em andamento/i.test(r.textContent||''));
    return String(row?.dataset?.familyTaskId||'');
  }

  function showFeedback(taskId=''){
    if(document.getElementById('guardZeroFeedbackV2'))return;
    const m=document.createElement('div');
    m.id='guardZeroFeedbackV2';
    m.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
    m.innerHTML=`<div style="width:min(92vw,430px);background:#fff;border-radius:22px;padding:24px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.25)"><div style="font-size:3.8rem;line-height:1">😢</div><h2 style="margin:12px 0 8px;color:#9f1239">Você não conseguiu</h2><p style="font-size:1.05rem;color:#555;margin:0 0 18px">Não foi dessa vez. Esta tarefa ficou em <strong>0%</strong>.</p><button type="button" id="guardZeroCloseV2" class="btn" style="background:var(--cor-primaria,#ff4d6d);color:#fff;padding:11px 22px">OK</button></div>`;
    document.body.appendChild(m);
    m.querySelector('#guardZeroCloseV2').onclick=()=>m.remove();
    window.dispatchEvent(new CustomEvent('rotina-task-zero',{detail:{tarefaId:taskId,percentual:0,origem:'apos-justificativa'}}));
    log('tarefa.zero_feedback_exibido',{tarefaId:taskId,percentual:0,aposJustificativa:true});
  }

  function attach(modal){
    if(!modal||seen.has(modal))return;
    seen.add(modal);
    let armed=false;
    let taskId=currentTaskId();

    modal.addEventListener('click',event=>{
      const btn=event.target.closest?.('#guardEnviarV2,#guardSemV2');
      if(!btn)return;
      armed=true;
      taskId=taskId||currentTaskId();
      log('tarefa.zero_feedback_aguardando_justificativa',{tarefaId:taskId,acao:btn.id});
    },true);

    const observer=new MutationObserver(()=>{
      if(document.body.contains(modal))return;
      observer.disconnect();
      if(!armed)return;
      queueMicrotask(()=>showFeedback(taskId));
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  const scan=()=>attach(document.getElementById('guardJustModalV2'));
  const bodyObserver=new MutationObserver(scan);
  const start=()=>{scan();bodyObserver.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  log('tarefa.zero_feedback_pos_justificativa_pronto',{versao:1});
})();
