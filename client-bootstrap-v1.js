(()=>{
  'use strict';

  const BOOTSTRAP_VERSION=1;
  const BUILD='20260909.1';
  if(window.__rotinaBootstrapV1)return;

  const runtime={
    version:BOOTSTRAP_VERSION,
    build:BUILD,
    startedAt:Date.now(),
    modules:{},
    errors:[]
  };
  window.__rotinaBootstrapV1=runtime;

  const log=(event,details={},level='info')=>{
    try{window.rotinaLog?.(event,{bootstrapVersion:BOOTSTRAP_VERSION,build:BUILD,...details},level);}catch{}
  };

  let resolveReady;
  const ready=window.__rotinaAuthBridgeReady||new Promise(resolve=>{resolveReady=resolve;});
  if(!window.__rotinaAuthBridgeReady)window.__rotinaAuthBridgeReady=ready;
  if(!window.__rotinaResolveAuthBridge){
    window.__rotinaResolveAuthBridge=value=>{try{resolveReady?.(value||true);}catch{}};
  }
  const authTimeout=()=>new Promise((_,reject)=>setTimeout(()=>reject(new Error('A autenticação segura não carregou. Feche e abra o aplicativo novamente.')),12000));
  window.conectarCliente=async function(){
    try{
      await Promise.race([window.__rotinaAuthBridgeReady,authTimeout()]);
      if(typeof window.rotinaLoginParticipanteSeguro!=='function')throw new Error('Login seguro indisponível.');
      return window.rotinaLoginParticipanteSeguro();
    }catch(error){
      alert(error?.message||'Não foi possível preparar o acesso.');
      return false;
    }
  };
  window.rotinaRestaurarSessaoParticipante=async function(){
    const args=arguments;
    try{
      await Promise.race([window.__rotinaAuthBridgeReady,authTimeout()]);
      if(typeof window.__rotinaRestaurarSessaoParticipanteReal!=='function')throw new Error('Restauração segura indisponível.');
      return window.__rotinaRestaurarSessaoParticipanteReal.apply(window,args);
    }catch(error){
      console.warn('Ponte de autenticação não ficou pronta.',error);
      document.getElementById('telaApp')?.style.setProperty('display','none');
      document.getElementById('telaAuth')?.style.setProperty('display','block');
      return false;
    }
  };
  window.__rotinaAuthGateVersion=1;

  const MODULES=Object.freeze([
    {name:'participant-store',src:'./client-participant-store-v1.js?v=1',type:'module',owner:'Participant Data / Store',critical:true},
    {name:'firebase-repository',src:'./client-firebase-repository-v1.js?v=1',type:'module',owner:'Participant Data / Firebase Repository',critical:true},
    {name:'auth-session',src:'./client-auth-session-v1.js?v=6',type:'module',owner:'Session/Auth',critical:true},
    {name:'time-guard',src:'./client-time-guard-v3.js?v=7',type:'module',owner:'Task Engine / Tempo',critical:true},
    {name:'session-integrity',src:'./client-session-integrity.js?v=2',type:'module',owner:'Session Integrity',critical:false},
    {name:'reviewed-points',src:'./client-reviewed-points.js',type:'module',owner:'Points UI',critical:false},
    {name:'early-start-ui',src:'./client-early-start-ui.js?v=2',type:'module',owner:'Task UI',critical:false},
    {name:'tolerance-timer',src:'./client-tolerance-timer.js?v=5',type:'module',owner:'Task UI / Tolerância',critical:false},
    {name:'week-nav',src:'./client-week-nav.js?v=4',type:'module',owner:'Week UI',critical:false},
    {name:'task-alarm',src:'./family-alarm-client.js?v=13',type:'module',owner:'Alarm',critical:false},
    {name:'history-reconciler',src:'./client-history-reconciler.js?v=3',type:'module',owner:'History Repair',critical:false},
    {name:'mascot-v3',src:'./client-mascot-v3.js?v=1',type:'module',owner:'Mascot',critical:false},
    {name:'zero-feedback',src:'./client-zero-feedback-v4.js?v=1',type:'module',owner:'Mascot Feedback',critical:false},
    {name:'emergency-compensation',src:'./client-emergency-compensation-20260826.js?v=3',type:'module',owner:'Compatibilidade',critical:false},
    {name:'execution-source',src:'./client-execution-source-unifier-v1.js?v=2',type:'module',owner:'Task/Execution',critical:false},
    {name:'offline-integrity',src:'./client-offline-execution-integrity-v1.js?v=4',type:'module',owner:'Offline',critical:true},
    {name:'commercial-access',src:'./commercial-access-client.js?v=4',type:'module',owner:'Commercial Access',critical:false},
    {name:'monitoring-extra',src:'./app-monitoring-extra-v1.js?v=3',type:'classic',owner:'Telemetry',critical:false},
    {name:'mascot-layout',src:'./client-mascot-layout-v1.js?v=4',type:'classic',owner:'Mascot UI',critical:false},
    {name:'cat-asset',src:'./client-cat-asset-v4.js?v=6',type:'classic',owner:'Mascot UI',critical:false},
    {name:'cat-layout-safe',src:'./client-cat-layout-safe-v5.js?v=5',type:'classic',owner:'Mascot UI',critical:false},
    {name:'mascot-fix',src:'./client-mascot-fix-v6.js?v=6',type:'classic',owner:'Mascot UI',critical:false},
    {name:'cat-container',src:'./client-cat-container-v7.js?v=9',type:'classic',owner:'Mascot UI',critical:false},
    {name:'runtime-build-info',src:'./runtime-build-info.js?v=20260909.1',type:'classic',owner:'Runtime/Version',critical:false}
  ]);

  window.__ROTINA_RUNTIME_MANIFEST=Object.freeze({
    bootstrapVersion:BOOTSTRAP_VERSION,
    build:BUILD,
    uiOrchestrator:'./client-ui-pro.js?v=50',
    dataInfrastructure:{store:'client-participant-store-v1.js',repository:'client-firebase-repository-v1.js'},
    modules:MODULES.map(({name,src,type,owner,critical})=>({name,src,type,owner,critical}))
  });

  function alreadyLoaded(src){
    const wanted=new URL(src,location.href).href;
    return [...document.scripts].some(script=>{
      if(!script.src)return false;
      try{return new URL(script.src,location.href).href===wanted;}catch{return false;}
    });
  }

  function loadScript(module){
    if(alreadyLoaded(module.src)){
      runtime.modules[module.name]={status:'already-loaded',at:Date.now()};
      return Promise.resolve(true);
    }
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=module.src;
      if(module.type==='module')script.type='module';
      else script.async=false;
      script.dataset.rotinaBootstrap=String(BOOTSTRAP_VERSION);
      script.dataset.rotinaModule=module.name;
      script.onload=()=>{
        runtime.modules[module.name]={status:'loaded',at:Date.now()};
        log('bootstrap.modulo_carregado',{modulo:module.name,owner:module.owner,tipo:module.type});
        resolve(true);
      };
      script.onerror=()=>{
        const error=new Error(`Falha ao carregar ${module.name}`);
        runtime.modules[module.name]={status:'error',at:Date.now(),critical:module.critical};
        runtime.errors.push({module:module.name,critical:module.critical});
        log('bootstrap.modulo_erro',{modulo:module.name,owner:module.owner,critical:module.critical},module.critical?'error':'warning');
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  async function start(){
    log('bootstrap.inicio',{modulos:MODULES.length});
    const results=await Promise.allSettled(MODULES.map(loadScript));
    const falhas=results.filter(result=>result.status==='rejected').length;
    runtime.finishedAt=Date.now();
    runtime.ready=falhas===0;
    log('bootstrap.pronto',{falhas,tempoMs:runtime.finishedAt-runtime.startedAt},falhas?'warning':'info');
    window.dispatchEvent(new CustomEvent('rotina-client-bootstrap-ready',{detail:{version:BOOTSTRAP_VERSION,build:BUILD,falhas}}));
  }

  start().catch(error=>{
    runtime.errors.push({module:'bootstrap',critical:true,message:String(error?.message||error)});
    log('bootstrap.erro',{mensagem:String(error?.message||error)},'error');
  });
})();