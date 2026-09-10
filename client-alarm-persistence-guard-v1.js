(()=>{
  'use strict';
  const VERSION=1;
  const KEY_STATE='rotina_family_task_alarms_v3';
  const KEY_PENDING='rotina_family_task_alarm_pending_v3';
  const grupo=()=>localStorage.getItem('cliente_grupo')||'';
  const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
  const read=(k,fallback)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v==='object'?v:fallback}catch{return fallback}};
  const localAlarmes=()=>Object.values(read(KEY_STATE,{})).filter(a=>a&&a.grupoId===grupo()&&a.perfilId===perfil());
  const pendentes=()=>{const v=read(KEY_PENDING,[]);return Array.isArray(v)?v.filter(a=>a&&a.grupoId===grupo()&&a.perfilId===perfil()):[]};
  const merge=(remote=[])=>{
    const map=new Map();
    localAlarmes().forEach(a=>a?.tarefaId&&map.set(a.tarefaId,a));
    (Array.isArray(remote)?remote:[]).filter(a=>a?.grupoId===grupo()&&a?.perfilId===perfil()).forEach(a=>a?.tarefaId&&map.set(a.tarefaId,a));
    pendentes().forEach(a=>a?.tarefaId&&map.set(a.tarefaId,a));
    return [...map.values()];
  };
  function install(attempt=0){
    const store=window.rotinaParticipantStore;
    if(!store?.subscribe||!store?.snapshot){if(attempt<160)setTimeout(()=>install(attempt+1),50);return}
    if(store.__alarmPersistenceGuardV1)return;
    const originalSubscribe=store.subscribe.bind(store),originalSnapshot=store.snapshot.bind(store);
    store.snapshot=()=>{const snap=originalSnapshot()||{};return {...snap,despertadores:merge(snap.despertadores)}};
    store.subscribe=(listener)=>originalSubscribe((snap,meta)=>listener({...snap,despertadores:merge(snap?.despertadores)},meta));
    store.__alarmPersistenceGuardV1=true;
    try{window.rotinaLog?.('alarme.persistencia_guard_pronto',{version:VERSION,locais:localAlarmes().length,pendentes:pendentes().length},'info')}catch{}
  }
  install();
})();
