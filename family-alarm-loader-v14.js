import './client-alarm-persistence-guard-v1.js?v=1';

const esperarGuard=async()=>{
  for(let i=0;i<160;i++){
    if(window.rotinaParticipantStore?.__alarmPersistenceGuardV1)return true;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return false;
};

const guardOk=await esperarGuard();
try{window.rotinaLog?.('alarme.loader_v14',{guardOk},guardOk?'info':'warning')}catch{}
await import('./family-alarm-client.js?v=14');
