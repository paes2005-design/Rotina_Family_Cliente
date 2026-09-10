import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {arrayUnion,getFirestore,doc,serverTimestamp,setDoc} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const VERSION=1;
const KEY_STOP_PENDING='rotina_family_task_alarm_stop_pending_v1';
let busy=false;
let queued=false;

const readQueue=()=>{
  try{
    const value=JSON.parse(localStorage.getItem(KEY_STOP_PENDING)||'[]');
    return Array.isArray(value)?value:[];
  }catch{return []}
};
const saveQueue=value=>localStorage.setItem(KEY_STOP_PENDING,JSON.stringify(value));
const docKey=(g,p,t)=>[g,p,t].map(v=>String(v||'').replaceAll('/','_')).join('__');
const profileName=()=>localStorage.getItem('cliente_nome')||'Cliente';
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{alarmStopRetryVersion:VERSION,...details},level)}catch{}};

function valid(item){
  return !!(item&&item.grupoId&&item.perfilId&&item.tarefaId&&item.ocorrencia);
}

async function flush(reason='manual'){
  if(busy){queued=true;return false}
  if(!navigator.onLine||!getApps().length)return false;
  const queue=readQueue();
  if(!queue.length){
    log('alarme.stop_retry_ok',{reason,processados:0,pendentes:0});
    return true;
  }
  busy=true;
  const rest=[];
  let processed=0;
  try{
    const db=getFirestore(getApp());
    for(const item of queue){
      if(!valid(item)){
        log('alarme.stop_retry_descartado',{reason,motivo:'item-invalido'},'warning');
        continue;
      }
      try{
        await setDoc(doc(db,'despertadores',docKey(item.grupoId,item.perfilId,item.tarefaId)),{
          grupoId:item.grupoId,
          perfilId:item.perfilId,
          tarefaId:item.tarefaId,
          dataAgendada:item.dataAgendada||'',
          semanaInicio:item.semanaInicio||'',
          ocorrenciasSilenciadas:arrayUnion(item.ocorrencia),
          ultimoSilenciadoEm:serverTimestamp(),
          ultimoSilenciadoPor:profileName()
        },{merge:true});
        processed++;
      }catch(error){
        rest.push(item);
        log('alarme.stop_retry_falha',{reason,tarefaId:item.tarefaId,mensagem:String(error?.message||error)},'warning');
      }
    }
    saveQueue(rest);
    const level=rest.length?'warning':'info';
    log('alarme.stop_retry_concluido',{reason,processados:processed,pendentes:rest.length},level);
    window.dispatchEvent(new CustomEvent('rotina-family-alarm-stop-retry',{detail:{reason,processados:processed,pendentes:rest.length}}));
    return rest.length===0;
  }finally{
    busy=false;
    if(queued){queued=false;queueMicrotask(()=>flush('queued'))}
  }
}

window.rotinaAlarmStopRetry={version:VERSION,flush,pending:()=>readQueue().length};
window.addEventListener('rotina-family-alarm-sync',()=>flush('central-sync'));
window.addEventListener('rotina-client-session-ready',()=>flush('session-ready'));
window.addEventListener('online',()=>flush('online'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush('visible')});

flush('module-load');
