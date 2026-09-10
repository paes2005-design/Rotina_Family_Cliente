from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


p = Path('family-alarm-client.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import {arrayUnion,getFirestore,doc,serverTimestamp,setDoc} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';",
    "import {arrayUnion,getFirestore,doc,serverTimestamp,setDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';",
    'firestore import',
)
s = replace_once(
    s,
    "const KEY_PREF='rotina_family_alarm_pref_v2';",
    "const ALARM_RUNTIME_VERSION=15;\nconst KEY_PREF='rotina_family_alarm_pref_v2';",
    'runtime version',
)
s = replace_once(s, "const JANELA_DISPARO_MS=5*60*1000;", "const JANELA_DISPARO_MS=60*1000;", 'local alarm window')
s = replace_once(
    s,
    "let ctx=null,somTimer=null,relogioTimer=null,autoStopTimer=null,unsub=null,sessaoEscutada='',alarmeDisparado='',ocorrenciaDisparada='',notificacaoSolicitada=0,documentosRemotos=[],storeAlarmUnsub=null;",
    "let ctx=null,somTimer=null,relogioTimer=null,autoStopTimer=null,sessaoEscutada='',alarmeDisparado='',ocorrenciaDisparada='',notificacaoSolicitada=0,storeAlarmUnsub=null;",
    'runtime state',
)
s = replace_once(
    s,
    "function salvar(k,v){localStorage.setItem(k,JSON.stringify(v))}",
    "function salvar(k,v){localStorage.setItem(k,JSON.stringify(v))}\nfunction logAlarme(evento,detalhes={},nivel='info'){try{window.rotinaLog?.(evento,{alarmRuntimeVersion:ALARM_RUNTIME_VERSION,...detalhes},nivel)}catch{}}",
    'alarm logger',
)

start = s.index('function enfileirar(payload)')
end = s.index('function escutar(tentativa=0){', start)
clean_block = r'''function enfileirar(payload){
  const fila=ler(KEY_PENDING,[]).filter(p=>naSemanaAtual(p)&&p.tarefaId!==payload.tarefaId);
  fila.push(payload);
  salvar(KEY_PENDING,fila.slice(-60));
}
function removerPendenteConfig(tarefaId){
  salvar(KEY_PENDING,ler(KEY_PENDING,[]).filter(p=>naSemanaAtual(p)&&p.tarefaId!==tarefaId));
}
async function escreverConfig(payload){
  await setDoc(
    doc(getFirestore(getApp()),'despertadores',chaveDoc(payload.grupoId,payload.perfilId,payload.tarefaId)),
    {...payload,servidorEm:serverTimestamp()},
    {merge:true}
  );
}
async function gravar(tarefa,ativo,origem='CLIENTE',msg=null){
  const atual=alarmeDaTarefa(tarefa.tarefaId,tarefa.dataAgendada);
  if(origem==='CLIENTE'&&travado(atual)){
    if(msg)msg.textContent='Somente o responsável pode retirar este despertador.';
    return false;
  }
  const reativando=ativo&&atual?.ativo!==true;
  const ocorrencias=reativando?[]:(atual?.ocorrenciasSilenciadas||[]);
  const payload=payloadDaTarefa({...tarefa,ocorrenciasSilenciadas:ocorrencias},ativo,origem);
  if(!payload.dataAgendada||!payload.semanaInicio){
    if(msg)msg.textContent='Não foi possível definir a data desta tarefa.';
    return false;
  }
  if(reativando)limparSilenciosLocais(payload.tarefaId);
  alarmes[payload.tarefaId]=payload;
  salvar(KEY_STATE,alarmes);
  atualizarBotoes();
  enfileirar(payload);
  if(!navigator.onLine||!getApps().length){
    if(msg)msg.textContent='Alteração guardada e será sincronizada quando a internet voltar.';
    return true;
  }
  try{
    await escreverConfig(payload);
    removerPendenteConfig(payload.tarefaId);
    logAlarme('alarme.config_gravada',{tarefaId:payload.tarefaId,ativo});
    if(msg)msg.textContent=ativo?'Despertador ativado nesta data.':'Despertador retirado desta data.';
    window.rotinaParticipantSyncScheduler?.run?.('alarm-config-saved');
    return true;
  }catch(error){
    logAlarme('alarme.config_pendente',{tarefaId:payload.tarefaId,ativo,mensagem:String(error?.message||error)},'warning');
    if(msg)msg.textContent='Alteração guardada para sincronizar depois.';
    return true;
  }
}

async function sincronizarPendente(){
  if(!navigator.onLine||!getApps().length)return;
  const fila=ler(KEY_PENDING,[]).filter(p=>naSemanaAtual(p));
  if(!fila.length){salvar(KEY_PENDING,[]);return}
  const rest=[];
  let processados=0;
  for(const p of fila){
    try{await escreverConfig(p);processados++}
    catch(error){rest.push(p);logAlarme('alarme.config_sync_falha',{tarefaId:p.tarefaId,mensagem:String(error?.message||error)},'warning')}
  }
  salvar(KEY_PENDING,rest);
  logAlarme('alarme.config_sync_concluido',{processados,pendentes:rest.length},rest.length?'warning':'info');
  window.dispatchEvent(new CustomEvent('rotina-family-alarm-sync',{detail:{pendentes:rest.length,origem:'config-pending'}}));
  if(processados)window.rotinaParticipantSyncScheduler?.run?.('alarm-config-flushed');
}
function enfileirarSilencio(a,ocorrencia){
  if(!ocorrencia)return;
  const item={grupoId:a?.grupoId||grupo(),perfilId:a?.perfilId||perfil(),tarefaId:a?.tarefaId||'',dataAgendada:a?.dataAgendada||'',semanaInicio:a?.semanaInicio||semanaInicioISO(new Date()),ocorrencia};
  const fila=ler(KEY_STOP_PENDING,[]).filter(p=>naSemanaAtual(p));
  if(!fila.some(p=>p.grupoId===item.grupoId&&p.perfilId===item.perfilId&&p.tarefaId===item.tarefaId&&p.ocorrencia===item.ocorrencia))fila.push(item);
  salvar(KEY_STOP_PENDING,fila.slice(-120));
}
function reconciliarSilenciosServidor(remotos){
  const fila=ler(KEY_STOP_PENDING,[]).filter(p=>naSemanaAtual(p));
  if(!fila.length)return;
  const rest=fila.filter(p=>!Array.isArray(remotos[p.tarefaId]?.ocorrenciasSilenciadas)||!remotos[p.tarefaId].ocorrenciasSilenciadas.includes(p.ocorrencia));
  if(rest.length!==fila.length){
    salvar(KEY_STOP_PENDING,rest);
    logAlarme('alarme.stop_reconciliado',{removidos:fila.length-rest.length,pendentes:rest.length});
  }
}
async function sincronizarSilenciosPendentes(){
  if(!navigator.onLine||!getApps().length)return;
  const fila=ler(KEY_STOP_PENDING,[]).filter(p=>naSemanaAtual(p)),rest=[];
  if(!fila.length){salvar(KEY_STOP_PENDING,[]);return}
  const db=getFirestore(getApp());
  let processados=0;
  for(const p of fila){
    try{
      await updateDoc(doc(db,'despertadores',chaveDoc(p.grupoId,p.perfilId,p.tarefaId)),{
        ocorrenciasSilenciadas:arrayUnion(p.ocorrencia),
        ultimoSilenciadoEm:serverTimestamp(),
        ultimoSilenciadoPor:nomePerfil()||'Cliente'
      });
      processados++;
    }catch(error){
      rest.push(p);
      logAlarme('alarme.stop_sync_falha',{tarefaId:p.tarefaId,mensagem:String(error?.message||error)},'warning');
    }
  }
  salvar(KEY_STOP_PENDING,rest);
  logAlarme('alarme.stop_sync_concluido',{processados,pendentes:rest.length},rest.length?'warning':'info');
  window.dispatchEvent(new CustomEvent('rotina-family-alarm-stop-sync',{detail:{processados,pendentes:rest.length}}));
  if(processados)window.rotinaParticipantSyncScheduler?.run?.('alarm-stop-saved');
}
function sincronizarSilencioCompartilhado(a,ocorrencia){enfileirarSilencio(a,ocorrencia);sincronizarSilenciosPendentes()}
async function sincronizarTudo(){await sincronizarPendente();await sincronizarSilenciosPendentes()}
function aplicarAlarmesStore(items=[],origem='participant-store'){
  const g=grupo(),p=perfil(),remotos={},pendentes={};
  (Array.isArray(items)?items:[]).filter(a=>a?.grupoId===g&&a?.perfilId===p).forEach(a=>{if(a.tarefaId&&naSemanaAtual(a))remotos[a.tarefaId]=a});
  ler(KEY_PENDING,[]).filter(a=>a.grupoId===g&&a.perfilId===p&&naSemanaAtual(a)).forEach(a=>{pendentes[a.tarefaId]=a});
  const origemServidor=/server|servidor/i.test(String(origem||''));
  const proximos=origemServidor?{}:filtrarSemana(alarmes);
  for(const [id,a] of Object.entries(remotos)){
    if(origemServidor||!proximos[id])proximos[id]=a;
  }
  for(const [id,a] of Object.entries(pendentes))proximos[id]=a;
  alarmes=proximos;
  salvar(KEY_STATE,alarmes);
  atualizarBotoes();
  logAlarme('alarme.estado_composto',{origem,origemServidor,remotos:Object.keys(remotos).length,efetivos:Object.keys(alarmes).length,configPendentes:Object.keys(pendentes).length,stopPendentes:ler(KEY_STOP_PENDING,[]).filter(p=>naSemanaAtual(p)).length});
  window.dispatchEvent(new CustomEvent('rotina-family-alarm-sync',{detail:{origem}}));
  if(origemServidor){
    reconciliarSilenciosServidor(remotos);
    queueMicrotask(()=>sincronizarTudo());
  }
}
'''
s = s[:start] + clean_block + s[end:]
s = s.replace("  unsub=()=>{if(storeAlarmUnsub){try{storeAlarmUnsub()}catch{}storeAlarmUnsub=null}};\n", '', 1)
s = replace_once(
    s,
    "function verificarDisparo(){if(alarmeDisparado)return;const agora=new Date();const a=Object.values(alarmes).filter(x=>estaNaHora(x,agora)).sort((x,y)=>String(x.inicioEm||'').localeCompare(String(y.inicioEm||'')))[0];if(a)mostrarDisparo(a)}",
    "function verificarDisparo(){if(alarmeDisparado||document.hidden)return;const agora=new Date();const a=Object.values(alarmes).filter(x=>estaNaHora(x,agora)).sort((x,y)=>String(x.inicioEm||'').localeCompare(String(y.inicioEm||'')))[0];if(a)mostrarDisparo(a)}",
    'visible-only firing',
)
s = replace_once(
    s,
    "notificarTarefa(a,ocorrencia,token)}\nfunction silenciarOcorrencia(a,ocorrencia=ocorrenciaDisparada||chaveOcorrencia(a,new Date(),JANELA_DISPARO_MS,ocorrenciasSilenciadas(a)),origem='app'){if(ocorrencia){marcarSilencioLocal(a,ocorrencia);sincronizarSilencioCompartilhado(a,ocorrencia)}fecharNotificacao(a,ocorrencia);encerrarDisparo(false);toast(origem==='automatico'?'Despertador encerrado automaticamente.':'Toque parado também nos outros aparelhos conectados.')}\n",
    "notificarTarefa(a,ocorrencia,token);logAlarme('alarme.disparado',{tarefaId:a.tarefaId,ocorrencia,previstoEm:momento==='fim'?a.fimEm:a.inicioEm,disparadoEm:new Date().toISOString()})}\nfunction silenciarOcorrencia(a,ocorrencia=ocorrenciaDisparada||chaveOcorrencia(a,new Date(),JANELA_DISPARO_MS,ocorrenciasSilenciadas(a)),origem='app'){if(ocorrencia){marcarSilencioLocal(a,ocorrencia);sincronizarSilencioCompartilhado(a,ocorrencia)}fecharNotificacao(a,ocorrencia);encerrarDisparo(false);atualizarBotoes();logAlarme('alarme.toque_parado',{tarefaId:a?.tarefaId||'',ocorrencia:ocorrencia||'',origem,ativoPermanece:a?.ativo===true});toast(origem==='automatico'?'Despertador encerrado automaticamente.':'Toque parado. O alarme continua programado.')}\n",
    'stop semantics/logging',
)
old_reset = "function zerarViradaSemana(){const semana=semanaInicioISO(new Date());if(localStorage.getItem(KEY_WEEK)===semana)return false;alarmes=filtrarSemana(alarmes);silenciados={};salvar(KEY_STATE,alarmes);salvar(KEY_SILENCED,silenciados);salvar(KEY_PENDING,ler(KEY_PENDING,[]).filter(p=>naSemanaAtual(p)));salvar(KEY_STOP_PENDING,ler(KEY_STOP_PENDING,[]).filter(p=>naSemanaAtual(p)));localStorage.setItem(KEY_WEEK,semana);expirarAlarmesRemotos();encerrarDisparo();atualizarBotoes();window.dispatchEvent(new CustomEvent('rotina-family-alarm-week-reset',{detail:{semanaInicio:semana}}));return true}"
new_reset = "function zerarViradaSemana(){const semana=semanaInicioISO(new Date());if(localStorage.getItem(KEY_WEEK)===semana)return false;alarmes=filtrarSemana(alarmes);silenciados={};salvar(KEY_STATE,alarmes);salvar(KEY_SILENCED,silenciados);salvar(KEY_PENDING,ler(KEY_PENDING,[]).filter(p=>naSemanaAtual(p)));salvar(KEY_STOP_PENDING,ler(KEY_STOP_PENDING,[]).filter(p=>naSemanaAtual(p)));localStorage.setItem(KEY_WEEK,semana);encerrarDisparo(false);atualizarBotoes();window.dispatchEvent(new CustomEvent('rotina-family-alarm-week-reset',{detail:{semanaInicio:semana}}));window.rotinaParticipantSyncScheduler?.run?.('alarm-week-reset');return true}"
s = replace_once(s, old_reset, new_reset, 'week reset')
s = replace_once(s, 'setInterval(verificarDisparo,1000);', 'setInterval(verificarDisparo,500);', 'firing cadence')
s = replace_once(
    s,
    "window.addEventListener('online',()=>{sincronizarTudo();expirarAlarmesRemotos()});document.addEventListener('visibilitychange',()=>{if(!document.hidden){zerarViradaSemana();sincronizarTudo();expirarAlarmesRemotos();decorarTarefas();verificarDisparo()}});",
    "window.addEventListener('online',()=>sincronizarTudo());document.addEventListener('visibilitychange',()=>{if(!document.hidden){zerarViradaSemana();sincronizarTudo();decorarTarefas();verificarDisparo()}});",
    'lifecycle sync',
)
s = replace_once(
    s,
    "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();",
    "logAlarme('alarme.runtime_carregado',{arquitetura:'repository-store-alarm-single-owner',janelaLocalMs:JANELA_DISPARO_MS});\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();",
    'runtime ready log',
)
p.write_text(s, encoding='utf-8')

p = Path('client-bootstrap-v1.js')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "const BUILD='20260910.2';", "const BUILD='20260910.3';", 'bootstrap build')
s = replace_once(
    s,
    "    {name:'task-alarm',src:'./family-alarm-loader-v14.js?v=1',type:'module',owner:'Alarm',critical:false},\n    {name:'alarm-stop-retry',src:'./client-alarm-stop-retry-v1.js?v=1',type:'module',owner:'Alarm / Pending Stop Retry',critical:false},",
    "    {name:'task-alarm',src:'./family-alarm-client.js?v=15',type:'module',owner:'Alarm / Single State Owner',critical:false},",
    'bootstrap alarm modules',
)
s = replace_once(s, "{name:'runtime-build-info',src:'./runtime-build-info.js?v=20260909.2'", "{name:'runtime-build-info',src:'./runtime-build-info.js?v=20260910.3'", 'runtime cachebuster')
p.write_text(s, encoding='utf-8')

p = Path('runtime-build-info.js')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "build:'20260909.2',", "build:'20260910.3',", 'badge build')
s = replace_once(s, "firebaseRepositoryVersion:'1'", "firebaseRepositoryVersion:'1',\n    alarmRuntimeVersion:'15'", 'badge alarm version')
p.write_text(s, encoding='utf-8')

p = Path('index.html')
s = p.read_text(encoding='utf-8')
s = replace_once(s, "const BUILD='20260910.2';", "const BUILD='20260910.3';", 'wrapper build')
s = replace_once(s, 'client-bootstrap-v1.js?v=20260910.2', 'client-bootstrap-v1.js?v=20260910.3', 'bootstrap cachebuster')
s = replace_once(
    s,
    "release:'sprint2.1-alarm-persistence-guard-v1',bootstrap:1,participantStore:1,firebaseRepository:1,alarmPersistenceGuard:1,alarmStopRetry:1",
    "release:'sprint2.1-alarm-single-owner-v15',bootstrap:1,participantStore:1,firebaseRepository:1,alarmRuntime:15",
    'release metadata',
)
p.write_text(s, encoding='utf-8')

for name in ['client-alarm-persistence-guard-v1.js', 'client-alarm-stop-retry-v1.js', 'family-alarm-loader-v14.js']:
    Path(name).unlink(missing_ok=True)

p = Path('security-tests/firestore-rules.test.mjs')
s = p.read_text(encoding='utf-8')
marker = "await assertFails(updateDoc(doc(participantDb,'despertadores','adm-lock'),{ativo:false}));\n"
addition = marker + "await assertSucceeds(updateDoc(doc(participantDb,'despertadores','adm-lock'),{ocorrenciasSilenciadas:['t1__inicio__2026-09-10__09:00'],ultimoSilenciadoEm:new Date().toISOString(),ultimoSilenciadoPor:'Filho'}));\nawait assertFails(updateDoc(doc(participantDb,'despertadores','adm-lock'),{ativo:false,ocorrenciasSilenciadas:['t1__inicio__2026-09-10__09:00']}));\n"
s = replace_once(s, marker, addition, 'alarm silence security tests')
p.write_text(s, encoding='utf-8')
