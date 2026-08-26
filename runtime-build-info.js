(()=>{
  'use strict';
  const INFO=Object.freeze({
    app:'CLIENTE',
    appVersion:'1.0.0',
    build:'20260826.2',
    htmlVersion:'index-CLIENTE-v6',
    rulesModuleVersion:'4',
    expectedServiceWorkerVersion:'72'
  });
  window.ROTINA_BUILD_INFO=INFO;
  const emit=(event,details={})=>{try{window.rotinaLog?.(event,{...INFO,...details});}catch{}};
  function badge(){
    if(document.getElementById('rotinaBuildBadge'))return;
    const el=document.createElement('button');
    el.id='rotinaBuildBadge';el.type='button';
    el.textContent=`Cliente v${INFO.appVersion} • ${INFO.build}`;
    el.title='Toque para ver a versão em execução';
    el.style.cssText='position:fixed;right:8px;bottom:82px;z-index:9998;border:1px solid rgba(100,116,139,.35);background:rgba(255,255,255,.94);color:#64748b;border-radius:999px;padding:4px 8px;font:600 10px/1.2 system-ui;box-shadow:0 2px 8px rgba(0,0,0,.08);opacity:.86';
    el.onclick=()=>alert(`Rotina Family Cliente\nVersão: ${INFO.appVersion}\nBuild: ${INFO.build}\nHTML: ${INFO.htmlVersion}\nRegras: v${INFO.rulesModuleVersion}\nService Worker esperado: v${INFO.expectedServiceWorkerVersion}\nService Worker ativo: ${window.ROTINA_SW_VERSION||'sem resposta'}`);
    document.body.appendChild(el);
  }
  async function checkSw(){
    try{
      if(!('serviceWorker' in navigator)){emit('build.sw_indisponivel');return;}
      const reg=await navigator.serviceWorker.ready;
      const worker=navigator.serviceWorker.controller||reg.active;
      if(!worker){emit('build.sw_sem_controlador');return;}
      const token=Math.random().toString(36).slice(2);
      const listener=e=>{
        if(e.data?.type!=='ROTINA_BUILD_INFO'||e.data?.token!==token)return;
        navigator.serviceWorker.removeEventListener('message',listener);
        window.ROTINA_SW_VERSION=String(e.data.swVersion||'');
        emit('build.runtime',{serviceWorkerVersion:window.ROTINA_SW_VERSION,serviceWorkerCache:e.data.cacheName||'',serviceWorkerBuild:e.data.build||'',swMatchesExpected:String(e.data.swVersion)===INFO.expectedServiceWorkerVersion});
      };
      navigator.serviceWorker.addEventListener('message',listener);
      worker.postMessage({type:'ROTINA_GET_BUILD_INFO',token});
      setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',listener);if(!window.ROTINA_SW_VERSION)emit('build.sw_sem_resposta');},1800);
    }catch(e){emit('build.sw_erro',{mensagem:String(e?.message||e)});}
  }
  const boot=()=>{
    badge();
    emit('build.html_carregado',{href:location.href,userAgent:navigator.userAgent});
    setTimeout(checkSw,150);
    if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>setTimeout(checkSw,120));
    setTimeout(()=>emit('build.regra_modulo_esperado',{rulesModuleVersion:INFO.rulesModuleVersion}),400);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
