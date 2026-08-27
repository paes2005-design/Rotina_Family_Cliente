from pathlib import Path
import re

p=Path('family-alarm-client.js')
s=p.read_text(encoding='utf-8')
old="import {arrayUnion,getFirestore,collection,doc,onSnapshot,query,serverTimestamp,setDoc,where} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';"
new="import {arrayUnion,getFirestore,collection,doc,getDocsFromCache,getDocsFromServer,query,serverTimestamp,setDoc,where} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';"
if old not in s: raise SystemExit('import alarm client ausente')
s=s.replace(old,new,1)
old="let ctx=null,somTimer=null,relogioTimer=null,autoStopTimer=null,unsub=null,sessaoEscutada='',alarmeDisparado='',ocorrenciaDisparada='',notificacaoSolicitada=0,documentosRemotos=[];"
new="let ctx=null,somTimer=null,relogioTimer=null,autoStopTimer=null,unsub=null,sessaoEscutada='',alarmeDisparado='',ocorrenciaDisparada='',notificacaoSolicitada=0,documentosRemotos=[],alarmSyncTimer=null,alarmSyncBusy=false,lastAlarmServerSync=0;\nconst ALARM_SYNC_MS=5*60*1000;"
if old not in s: raise SystemExit('state alarm client ausente')
s=s.replace(old,new,1)

replacement="""function aplicarAlarmesSnapshot(s,origem){const g=grupo(),p=perfil(),proximos={};documentosRemotos=s.docs.map(d=>({ref:d.ref,dados:{id:d.id,...d.data()}})).filter(item=>item.dados.perfilId===p);documentosRemotos.forEach(item=>{const a=item.dados;if(a.tarefaId&&naSemanaAtual(a))proximos[a.tarefaId]=a});ler(KEY_PENDING,[]).filter(a=>a.grupoId===g&&a.perfilId===p&&naSemanaAtual(a)).forEach(a=>{proximos[a.tarefaId]=a});alarmes=proximos;salvar(KEY_STATE,alarmes);expirarAlarmesRemotos();atualizarBotoes();window.dispatchEvent(new CustomEvent('rotina-family-alarm-sync',{detail:{origem}}));}\nasync function sincronizarAlarmes(servidor=true,origem='intervalo-5min'){const g=grupo(),p=perfil();if(!g||!p||!getApps().length||alarmSyncBusy)return false;alarmSyncBusy=true;try{const q=query(collection(getFirestore(getApp()),'despertadores'),where('grupoId','==',g),where('perfilId','==',p));const snap=await (servidor?getDocsFromServer(q):getDocsFromCache(q));aplicarAlarmesSnapshot(snap,origem);if(servidor)lastAlarmServerSync=Date.now();return true}catch(e){try{window.rotinaLog?.('alarme.sync_erro',{origem,mensagem:String(e?.message||e)},'warning')}catch{}return false}finally{alarmSyncBusy=false;}}\nfunction escutar(tentativa=0){const g=grupo(),p=perfil(),sessao=`${g}__${p}`;if(!g||!p||!getApps().length){if(tentativa<120)setTimeout(()=>escutar(tentativa+1),100);return}if(sessaoEscutada===sessao&&alarmSyncTimer)return;if(alarmSyncTimer)clearInterval(alarmSyncTimer);sessaoEscutada=sessao;unsub=()=>{if(alarmSyncTimer){clearInterval(alarmSyncTimer);alarmSyncTimer=null;}};sincronizarAlarmes(false,'cache-persistente').finally(()=>sincronizarAlarmes(true,'servidor-inicial'));alarmSyncTimer=setInterval(()=>{if(!document.hidden)sincronizarAlarmes(true,'intervalo-5min');},ALARM_SYNC_MS);sincronizarTudo()}\n\nfunction tarefaConcluida"""
pat=r"function escutar\(tentativa=0\)\{.*?\}\n\nfunction tarefaConcluida"
s,n=re.subn(pat,replacement,s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'escutar alarm client regex={n}')
# Ao reconectar/voltar, só consulta se o ciclo de 5 min venceu.
s=s.replace("window.addEventListener('online',()=>{sincronizarTudo();expirarAlarmesRemotos()});document.addEventListener('visibilitychange',()=>{if(!document.hidden){zerarViradaSemana();expirarAlarmesRemotos();decorarTarefas()}});",
"window.addEventListener('online',()=>{sincronizarTudo();if(Date.now()-lastAlarmServerSync>=ALARM_SYNC_MS)sincronizarAlarmes(true,'reconectado-stale');expirarAlarmesRemotos()});document.addEventListener('visibilitychange',()=>{if(!document.hidden){zerarViradaSemana();if(Date.now()-lastAlarmServerSync>=ALARM_SYNC_MS)sincronizarAlarmes(true,'retorno-visivel-stale');expirarAlarmesRemotos();decorarTarefas()}});")
p.write_text(s,encoding='utf-8')

p=Path('client-ui-pro.js');s=p.read_text(encoding='utf-8');s=s.replace("import('./family-alarm-client.js?v=10')","import('./family-alarm-client.js?v=11')");p.write_text(s,encoding='utf-8')
p=Path('index.html');s=p.read_text(encoding='utf-8');s=s.replace("const BUILD='20260827.1';","const BUILD='20260827.2';").replace("navigator.serviceWorker.register('./sw.js?v=73',{updateViaCache:'none'})","navigator.serviceWorker.register('./sw.js?v=74',{updateViaCache:'none'})").replace("runtime-build-info.js?v=20260827.1","runtime-build-info.js?v=20260827.2");p.write_text(s,encoding='utf-8')
p=Path('sw.js');s=p.read_text(encoding='utf-8');s=s.replace("rotina-family-cliente-v73","rotina-family-cliente-v74").replace("ROTINA_SW_VERSION='73'","ROTINA_SW_VERSION='74'").replace("ROTINA_BUILD_ID='20260827.1'","ROTINA_BUILD_ID='20260827.2'").replace("runtime-build-info.js?v=20260827.1","runtime-build-info.js?v=20260827.2");p.write_text(s,encoding='utf-8')
print('CLIENT_ALARM_CACHE_SYNC_V1_APLICADO')
