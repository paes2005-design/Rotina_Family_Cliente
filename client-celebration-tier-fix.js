(()=>{
  const VERSION=1;
  const pad=n=>String(n).padStart(2,'0');
  const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const taskSeenKey=id=>`rotina_mascote_tarefa_${profileKey()}_${todayKey()}_${id}`;
  const durations={bark:1050,jump:950,roll:1200,flip:1100};
  const sequences=[['bark','jump'],['bark','roll'],['bark','flip']];
  const pending=new Set();
  let lastSequence=-1;
  let installed=false;
  let queue=Promise.resolve();

  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function waitLayer(timeoutMs=4000){
    const start=Date.now();
    while(Date.now()-start<timeoutMs){
      const layer=document.getElementById('rotinaMascoteRewardLayer');
      const animal=layer?.querySelector('#rotinaMascoteRewardDog');
      const speech=layer?.querySelector('#rotinaMascoteRewardSpeech');
      if(layer&&animal&&speech)return {layer,animal,speech};
      await sleep(50);
    }
    return null;
  }

  function chooseSequence(){
    const pool=sequences.map((steps,index)=>({steps,index})).filter(x=>x.index!==lastSequence);
    const chosen=pool[Math.floor(Math.random()*pool.length)]||pool[0]||{steps:sequences[0],index:0};
    lastSequence=chosen.index;
    return chosen.steps;
  }

  async function action(parts,name){
    const {layer,animal,speech}=parts;
    layer.classList.add('show');
    animal.classList.remove('bark','jump','roll','flip');
    void animal.getBoundingClientRect();
    if(name==='bark'){
      speech.textContent='AU! AU!';
      speech.classList.remove('show');
      void speech.getBoundingClientRect();
      speech.classList.add('show');
      animal.classList.add('bark');
    }else{
      animal.classList.add(name);
    }
    await sleep(durations[name]||900);
    animal.classList.remove(name);
    await sleep(100);
  }

  async function celebrateCustomTopTier(taskId,percentual){
    const id=String(taskId||'').trim();
    if(!id||pending.has(id)||localStorage.getItem(taskSeenKey(id)))return;
    pending.add(id);
    try{
      const parts=await waitLayer();
      if(!parts)throw new Error('Camada do mascote não ficou disponível');
      if(localStorage.getItem(taskSeenKey(id)))return;
      localStorage.setItem(taskSeenKey(id),'1');
      try{window.confetti?.({particleCount:70,spread:78,origin:{y:.72}});}catch{}
      for(const step of chooseSequence())await action(parts,step);
      await sleep(120);
      parts.layer.classList.remove('show');
      log('mascote.faixa_maxima_custom_comemorada',{tarefaId:id,percentual,grupoId:localStorage.getItem('cliente_grupo')||''});
    }catch(error){
      log('mascote.faixa_maxima_custom_erro',{tarefaId:id,percentual,mensagem:String(error?.message||error)},'error');
    }finally{
      pending.delete(id);
    }
  }

  function enqueueCustom(taskId,percentual){
    queue=queue.catch(()=>{}).then(()=>celebrateCustomTopTier(taskId,percentual));
    return queue;
  }

  function install(){
    if(installed)return true;
    const original=window.registrarHistoricoLocal;
    if(typeof original!=='function')return false;
    const wrapped=function(id,historico){
      const result=original.apply(this,arguments);
      try{
        const faixa=String(historico?.faixaAtraso||'');
        const percentual=Number(historico?.percentualAplicado)||0;
        const tarefaId=String(historico?.tarefaId||'').trim();
        // 100% continua no fluxo original. Este complemento cobre qualquer grupo cuja
        // melhor faixa configurada seja diferente de 100%, sem exceções por grupo.
        if(tarefaId&&faixa==='dentro-limites'&&percentual>0&&percentual!==100){
          enqueueCustom(tarefaId,percentual);
        }
      }catch(error){
        log('mascote.faixa_maxima_custom_captura_erro',{mensagem:String(error?.message||error)},'error');
      }
      return result;
    };
    wrapped.__rotinaCelebrationTierFix=true;
    wrapped.__rotinaOriginal=original;
    window.registrarHistoricoLocal=wrapped;
    installed=true;
    window.__rotinaCelebrationTierFixReady=true;
    log('mascote.faixa_maxima_global_pronta',{versao:VERSION});
    return true;
  }

  function retry(attempt=0){
    if(install())return;
    if(attempt<120)setTimeout(()=>retry(attempt+1),50);
    else log('mascote.faixa_maxima_global_instalacao_erro',{tentativas:attempt+1},'error');
  }

  retry();
})();
