(()=>{
  const VERSION=1;
  const pulseDelays=[0,90,220,500,900,1500];
  let installed=false;
  let logQueue=[];

  function flushLogs(){
    if(typeof window.rotinaLog!=='function')return;
    const pending=logQueue.splice(0);
    pending.forEach(item=>window.rotinaLog(item.evento,item.detalhes,item.nivel));
  }

  function log(evento,detalhes={},nivel='info'){
    if(typeof window.rotinaLog==='function')window.rotinaLog(evento,detalhes,nivel);
    else logQueue.push({evento,detalhes,nivel});
  }

  function pulseTaskRender(taskId,percentual){
    pulseDelays.forEach((delay,index)=>setTimeout(()=>{
      const row=document.querySelector(`#tabelaCorpo tr[data-family-task-id="${CSS.escape(String(taskId))}"]`);
      const status=String(row?.dataset?.familyTaskStatus||'');
      window.dispatchEvent(new CustomEvent('rotina-family-tasks-rendered',{detail:{origem:'mascote-bridge',tarefaId:String(taskId),tentativa:index+1,status}}));
      if(index===pulseDelays.length-1)log('mascote.bridge_pulso_final',{tarefaId:String(taskId),percentual,status,mascotePronto:window.__rotinaMascoteRewardsReady===true});
    },delay));
  }

  function install(){
    if(installed)return true;
    const original=window.registrarHistoricoLocal;
    if(typeof original!=='function')return false;
    window.registrarHistoricoLocal=function(id,historico){
      const result=original.apply(this,arguments);
      try{
        const percentual=Number(historico?.percentualAplicado)||0;
        const tarefaId=String(historico?.tarefaId||'').trim();
        const faixa=String(historico?.faixaAtraso||'');
        log('mascote.bridge_resultado_local',{tarefaId,percentual,faixa});
        if(percentual===100&&tarefaId)pulseTaskRender(tarefaId,percentual);
      }catch(error){
        log('mascote.bridge_resultado_erro',{mensagem:String(error?.message||error)},'error');
      }
      return result;
    };
    installed=true;
    window.__rotinaMascoteBridgeReady=true;
    log('mascote.bridge_pronto',{versao:VERSION,mascotePronto:window.__rotinaMascoteRewardsReady===true});
    return true;
  }

  function retryInstall(attempt=0){
    if(install())return;
    if(attempt<80)setTimeout(()=>retryInstall(attempt+1),50);
    else log('mascote.bridge_instalacao_falhou',{tentativas:attempt+1},'error');
  }

  window.addEventListener('rotina-mascote-rewards-ready',event=>{
    log('mascote.modulo_pronto',{sequenciasTarefa:event.detail?.taskSequences||0,sequenciaDia:event.detail?.dailySequence||0});
  });

  setTimeout(()=>{
    flushLogs();
    log('mascote.runtime_status',{
      loaderVersion:Number(window.__rotinaMascoteLoaderVersion||0),
      mascotePronto:window.__rotinaMascoteRewardsReady===true,
      bridgePronto:window.__rotinaMascoteBridgeReady===true,
      erroMascote:window.__rotinaMascoteLoadError||'',
      erroBridge:window.__rotinaMascoteBridgeError||''
    },window.__rotinaMascoteRewardsReady===true&&window.__rotinaMascoteBridgeReady===true?'info':'warning');
    flushLogs();
  },1800);

  retryInstall();
})();