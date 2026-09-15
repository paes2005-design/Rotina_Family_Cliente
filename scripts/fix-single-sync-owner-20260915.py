from pathlib import Path

BUILD = "20260915.1"
SW_VERSION = "86"


def replace_once(text, old, new, label):
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 ocorrência, encontrado {count}")
    return text.replace(old, new, 1)


# 1) Tela principal: legado vira apenas cache local; toda leitura de servidor delega ao Scheduler central.
p = Path("index-CLIENTE-v6.html")
s = p.read_text(encoding="utf-8")

old_sig = """        async function sincronizarDadosCliente(origem='intervalo-5min', servidor=true) {\n            if(sincronizacaoClienteEmCurso || !codigoGrupo || !clientePerfilId)return false;"""
new_sig = """        async function sincronizarDadosCliente(origem='cache-local', servidor=false) {\n            if(servidor){\n                const scheduler=window.rotinaParticipantSyncScheduler;\n                if(scheduler?.run){\n                    window.rotinaLog?.('sync.cliente_delegado_central',{origem,owner:'participant-sync-scheduler-v2'});\n                    return scheduler.run(origem);\n                }\n                window.rotinaLog?.('sync.cliente_central_indisponivel',{origem},'warning');\n                return false;\n            }\n            if(sincronizacaoClienteEmCurso || !codigoGrupo || !clientePerfilId)return false;"""
s = replace_once(s, old_sig, new_sig, "guard central do sincronizador legado")
s = s.replace("window.rotinaLog?.('sync.cliente_ciclo',{origem,servidor,tempoMs:Math.round(performance.now()-inicio),falhas,intervaloMin:5},falhas?'warning':'info');",
              "window.rotinaLog?.('sync.cliente_cache_local',{origem,servidor:false,tempoMs:Math.round(performance.now()-inicio),falhas},falhas?'warning':'info');")

anchor = "        window.rotinaClientCacheSnapshot = snapshotClienteCompartilhado;\n"
adapter = """        window.rotinaClientCacheSnapshot = snapshotClienteCompartilhado;\n        window.rotinaParticipantApplyStoreToLegacy=function(snapshot,origem='store-central'){\n            const estado=snapshot||window.rotinaParticipantStore?.snapshot?.();\n            if(!estado||typeof estado!=='object')return false;\n            const grupoStore=String(estado.grupoId||'').trim().toUpperCase();\n            const perfilStore=String(estado.perfilId||'').trim();\n            if(grupoStore&&codigoGrupo&&grupoStore!==String(codigoGrupo).trim().toUpperCase())return false;\n            if(perfilStore&&clientePerfilId&&perfilStore!==String(clientePerfilId).trim())return false;\n            if(Array.isArray(estado.tarefasTodas)){\n                cacheTarefasGrupo=estado.tarefasTodas.map(x=>({...x}));\n                cacheTarefasTodas=cacheTarefasGrupo.filter(tarefaVisivelParticipante);\n                cacheTarefasHoje=cacheTarefasTodas.filter(t=>t.diaSemana===diaAtualTexto).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));\n            }\n            if(Array.isArray(estado.historico))cacheHistorico=estado.historico.map(x=>({...x})).filter(h=>(h.perfilId?h.perfilId===clientePerfilId:h.perfilNome===clienteNome));\n            if(Array.isArray(estado.recompensas))recompensasCache=estado.recompensas.map(x=>({...x})).filter(r=>r.ativa!==false);\n            if(Array.isArray(estado.resgates))resgatesCache=estado.resgates.map(x=>({...x})).filter(r=>(r.perfilId?r.perfilId===clientePerfilId:r.perfilNome===clienteNome));\n            if(Array.isArray(estado.desafios))desafiosCache=estado.desafios.map(x=>({...x})).filter(c=>c.ativa!==false&&!c.encerrada&&(c.perfilId===clientePerfilId||c.perfilId==='__ALL__'));\n            if(estado.regraAtraso)regraAtrasoAtual=normalizarRegraAtraso(estado.regraAtraso);\n            ultimaSincronizacaoClienteServidor=Math.max(Number(ultimaSincronizacaoClienteServidor)||0,Number(estado.ultimaSincronizacaoServidor)||0);\n            renderizarTarefasHoje();\n            atualizarPainelPontos();\n            atualizarConquistas();\n            renderizarRecompensasCliente();\n            renderizarJustificativasCliente();\n            verificarRetornosResgates();\n            const regraEl=document.getElementById('textoRegraAtrasoCliente');if(regraEl)regraEl.innerHTML=textoRegraAtrasoCliente();\n            window.dispatchEvent(new CustomEvent('rotina-family-tasks-rendered',{detail:{origem}}));\n            window.rotinaLog?.('sync.store_central_aplicado_ui',{origem,owner:'participant-sync-scheduler-v2',tarefas:cacheTarefasTodas.length,historico:cacheHistorico.length,recompensas:recompensasCache.length,resgates:resgatesCache.length});\n            return true;\n        };\n"""
s = replace_once(s, anchor, adapter, "adaptador Store -> UI legada")

old_start = """            const cargaInicial=sincronizarDadosCliente('cache-inicial',false)\n                .then(()=>sincronizarDadosCliente('servidor-inicial',true))\n                .catch(e=>{window.rotinaLog?.('sync.cliente_inicial_erro',{mensagem:String(e?.message||e)},'warning');return false;});\n            sincronizacaoClienteTimer=setInterval(()=>{if(!document.hidden)sincronizarDadosCliente('intervalo-5min',true);},SINCRONIZACAO_CLIENTE_MS);\n            if(!eventosSincronizacaoInstalados){\n                eventosSincronizacaoInstalados=true;\n                document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-ultimaSincronizacaoClienteServidor>=SINCRONIZACAO_CLIENTE_MS)sincronizarDadosCliente('retorno-visivel-stale',true);});\n                window.addEventListener('online',()=>{if(Date.now()-ultimaSincronizacaoClienteServidor>=SINCRONIZACAO_CLIENTE_MS)sincronizarDadosCliente('reconectado-stale',true);});\n                window.addEventListener('rotina-request-sync',e=>sincronizarDadosCliente(e.detail?.motivo||'solicitado',true));\n            }\n            return cargaInicial;"""
new_start = """            // O legado restaura somente o cache local. Toda leitura de servidor pertence ao Scheduler central.\n            const cargaInicial=sincronizarDadosCliente('cache-inicial',false)\n                .catch(e=>{window.rotinaLog?.('sync.cliente_inicial_erro',{mensagem:String(e?.message||e)},'warning');return false;});\n            window.rotinaLog?.('sync.cliente_owner_central',{owner:'participant-sync-scheduler-v2',legacyTimer:false,legacyServerReads:false});\n            return cargaInicial;"""
s = replace_once(s, old_start, new_start, "remoção do timer/handlers legados")
p.write_text(s, encoding="utf-8")

# 2) Scheduler central v2: único proprietário das leituras de servidor e dos gatilhos de atualização.
p = Path("client-sync-scheduler-v1.js")
p.write_text("""const PARTICIPANT_SYNC_SCHEDULER_VERSION=2;\nconst DEFAULT_INTERVAL_MS=5*60*1000;\n\nlet timer=null;\nlet running=false;\nlet started=false;\nlet lastRunAt=0;\nlet nextRunAt=0;\nlet lastReason='';\nlet pendingReason='';\nlet onlineHandler=null;\nlet visibilityHandler=null;\nlet requestSyncHandler=null;\n\nconst clean=value=>String(value||'').trim();\nconst log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,syncSchedulerVersion:PARTICIPANT_SYNC_SCHEDULER_VERSION},level);}catch{}};\n\nfunction scope(){\n  const snap=window.rotinaParticipantStore?.snapshot?.()||{};\n  return{\n    grupoId:clean(snap.grupoId||localStorage.getItem('cliente_grupo')),\n    perfilId:clean(snap.perfilId||localStorage.getItem('cliente_perfil_id'))\n  };\n}\n\nfunction clearTimer(){\n  if(timer){clearTimeout(timer);timer=null;}\n  nextRunAt=0;\n}\n\nfunction schedule(delay=DEFAULT_INTERVAL_MS,reason='schedule'){\n  clearTimer();\n  if(!started)return false;\n  const wait=Math.max(100,Number(delay)||DEFAULT_INTERVAL_MS);\n  nextRunAt=Date.now()+wait;\n  timer=setTimeout(()=>run(reason),wait);\n  log('sync.agendado',{reason,delayMs:wait,nextRunAt,owner:'central'});\n  return true;\n}\n\nfunction applyBundle(bundle,reason){\n  const store=window.rotinaParticipantStore;\n  if(!store||!bundle)return false;\n  const current=store.snapshot?.()||{};\n  const tarefas=Array.isArray(bundle.tarefas)?bundle.tarefas:current.tarefasTodas;\n  const desafios=[\n    ...(Array.isArray(bundle.desafiosPerfil)?bundle.desafiosPerfil:[]),\n    ...(Array.isArray(bundle.desafiosTodos)?bundle.desafiosTodos:[])\n  ];\n  const next={\n    ...current,\n    grupoId:bundle.grupoId||current.grupoId,\n    perfilId:bundle.perfilId||current.perfilId,\n    tarefasTodas:tarefas,\n    tarefasHoje:current.tarefasHoje,\n    historico:Array.isArray(bundle.historico)?bundle.historico:current.historico,\n    recompensas:Array.isArray(bundle.recompensas)?bundle.recompensas:current.recompensas,\n    resgates:Array.isArray(bundle.resgates)?bundle.resgates:current.resgates,\n    desafios:desafios.length?desafios:current.desafios,\n    despertadores:Array.isArray(bundle.despertadores)?bundle.despertadores:current.despertadores,\n    regraAtraso:bundle.config?.regraAtraso||current.regraAtraso,\n    ultimaSincronizacaoServidor:Date.now()\n  };\n  store.replace?.(next,{source:reason,server:true,failures:bundle.failures||0,reason});\n  try{window.rotinaParticipantApplyStoreToLegacy?.(store.snapshot?.(),reason);}catch(error){log('sync.ui_adapter_erro',{reason,mensagem:String(error?.message||error)},'warning');}\n  return true;\n}\n\nasync function run(reason='timer'){\n  if(!started)return false;\n  if(running){\n    pendingReason=clean(reason)||'coalescido';\n    log('sync.coalescido',{reason:pendingReason});\n    return false;\n  }\n  if(navigator.onLine===false){log('sync.adiado_offline',{reason},'warning');schedule(DEFAULT_INTERVAL_MS,'offline-retry');return false;}\n  const repository=window.rotinaFirebaseRepository;\n  const {grupoId,perfilId}=scope();\n  if(!repository?.readParticipantBundle||!grupoId||!perfilId){\n    log('sync.adiado_sem_contexto',{reason,grupo:!!grupoId,perfil:!!perfilId},'warning');\n    schedule(1500,'context-retry');\n    return false;\n  }\n  running=true;\n  clearTimer();\n  const startedAt=performance.now();\n  try{\n    const bundle=await repository.readParticipantBundle({\n      grupoId,perfilId,source:'server',includeHistory:false,includeAlarms:true\n    });\n    applyBundle(bundle,'scheduler-server-sync');\n    lastRunAt=Date.now();\n    lastReason=reason;\n    log('sync.concluido',{reason,failures:bundle.failures||0,tempoMs:Math.round(performance.now()-startedAt),owner:'central'});\n    return true;\n  }catch(error){\n    log('sync.erro',{reason,mensagem:String(error?.message||error)},'error');\n    return false;\n  }finally{\n    running=false;\n    const next=pendingReason;pendingReason='';\n    if(next)schedule(250,`coalescido:${next}`);\n    else schedule(DEFAULT_INTERVAL_MS,'post-sync');\n  }\n}\n\nfunction reset(reason='server-activity'){\n  if(!started)return false;\n  log('sync.reset',{reason,owner:'central'});\n  return schedule(DEFAULT_INTERVAL_MS,reason);\n}\n\nfunction start(){\n  if(started)return false;\n  started=true;\n  onlineHandler=()=>schedule(1200,'online');\n  visibilityHandler=()=>{if(document.visibilityState==='visible'&&lastRunAt&&Date.now()-lastRunAt>=DEFAULT_INTERVAL_MS)schedule(1200,'visible-stale');};\n  requestSyncHandler=event=>{\n    const reason=clean(event?.detail?.motivo)||'solicitado';\n    if(running){pendingReason=reason;log('sync.coalescido',{reason});return;}\n    run(reason);\n  };\n  window.addEventListener('online',onlineHandler);\n  document.addEventListener('visibilitychange',visibilityHandler);\n  window.addEventListener('rotina-request-sync',requestSyncHandler);\n  schedule(350,'start-initial');\n  log('sync.pronto',{intervalMs:DEFAULT_INTERVAL_MS,modo:'owner-central-unico-cache-first-sem-historico-hot-sync'});\n  window.dispatchEvent(new CustomEvent('rotina-participant-sync-ready',{detail:{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,intervalMs:DEFAULT_INTERVAL_MS,owner:'central'}}));\n  return true;\n}\n\nfunction stop(){\n  started=false;\n  clearTimer();\n  pendingReason='';\n  if(onlineHandler)window.removeEventListener('online',onlineHandler);\n  if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);\n  if(requestSyncHandler)window.removeEventListener('rotina-request-sync',requestSyncHandler);\n  onlineHandler=null;visibilityHandler=null;requestSyncHandler=null;\n  log('sync.parado',{});\n  return true;\n}\n\nfunction status(){\n  return{version:PARTICIPANT_SYNC_SCHEDULER_VERSION,started,running,lastRunAt,nextRunAt,lastReason,pendingReason,intervalMs:DEFAULT_INTERVAL_MS,owner:'central'};\n}\n\nconst api=Object.freeze({version:PARTICIPANT_SYNC_SCHEDULER_VERSION,start,stop,run,reset,status});\nwindow.rotinaParticipantSyncScheduler=api;\nwindow.__rotinaParticipantSyncSchedulerVersion=PARTICIPANT_SYNC_SCHEDULER_VERSION;\n\nwindow.addEventListener('rotina-participant-server-activity',event=>reset(event.detail?.reason||'server-activity'));\nwindow.addEventListener('rotina-client-session-ready',()=>{if(!started)start();else schedule(350,'session-ready');});\nwindow.addEventListener('rotina-firebase-repository-ready',()=>{if(!started&&scope().grupoId&&scope().perfilId)start();});\n\nsetTimeout(()=>{if(!started&&scope().grupoId&&scope().perfilId)start();},0);\n""", encoding="utf-8")

# 3) Bootstrap/build/cache busting.
p = Path("client-bootstrap-v1.js")
s = p.read_text(encoding="utf-8")
s = s.replace("const BUILD='20260913.2';", f"const BUILD='{BUILD}';")
s = s.replace("./client-sync-scheduler-v1.js?v=20260909.3", f"./client-sync-scheduler-v1.js?v={BUILD}")
s = s.replace("./runtime-build-info.js?v=20260913.2", f"./runtime-build-info.js?v={BUILD}")
p.write_text(s, encoding="utf-8")

p = Path("index.html")
s = p.read_text(encoding="utf-8")
s = s.replace("const BUILD='20260913.2';", f"const BUILD='{BUILD}';")
s = s.replace("sw.js?v=85", f"sw.js?v={SW_VERSION}")
s = s.replace("client-bootstrap-v1.js?v=20260913.2", f"client-bootstrap-v1.js?v={BUILD}")
s = s.replace("release:'sprint2.1-participant-observation-icon-v1'", "release:'sprint2.0-single-sync-owner-v1'")
s = s.replace("serviceWorkerExpected:85", f"serviceWorkerExpected:{SW_VERSION}")
s = s.replace("participantStore:2,firebaseRepository:2", "participantStore:2,firebaseRepository:2,syncScheduler:2")
p.write_text(s, encoding="utf-8")

p = Path("runtime-build-info.js")
s = p.read_text(encoding="utf-8")
s = s.replace("build:'20260913.2'", f"build:'{BUILD}'")
s = s.replace("expectedServiceWorkerVersion:'85'", f"expectedServiceWorkerVersion:'{SW_VERSION}'")
s = s.replace("firebaseRepositoryVersion:'2',historyGapReconcilerVersion", "firebaseRepositoryVersion:'2',syncSchedulerVersion:'2',historyGapReconcilerVersion")
p.write_text(s, encoding="utf-8")

p = Path("sw.js")
s = p.read_text(encoding="utf-8")
s = s.replace("rotina-family-participante-v85", f"rotina-family-participante-v{SW_VERSION}")
s = s.replace("const ROTINA_SW_VERSION='85';", f"const ROTINA_SW_VERSION='{SW_VERSION}';")
s = s.replace("const ROTINA_BUILD_ID='20260913.2';", f"const ROTINA_BUILD_ID='{BUILD}';")
s = s.replace("'./client-firebase-repository-v1.js','./commercial-access-client.js'", "'./client-firebase-repository-v1.js','./client-sync-scheduler-v1.js','./commercial-access-client.js'")
s = s.replace("sw.js?v=85", f"sw.js?v={SW_VERSION}")
s = s.replace("client-bootstrap-v1.js?v=1", f"client-bootstrap-v1.js?v={BUILD}")
p.write_text(s, encoding="utf-8")

# Auditoria estática obrigatória.
main = Path("index-CLIENTE-v6.html").read_text(encoding="utf-8")
scheduler = Path("client-sync-scheduler-v1.js").read_text(encoding="utf-8")
assert "sincronizarDadosCliente('intervalo-5min',true)" not in main
assert "sincronizarDadosCliente('retorno-visivel-stale',true)" not in main
assert "sincronizarDadosCliente('reconectado-stale',true)" not in main
assert "sync.cliente_ciclo" not in main
assert "sync.cliente_delegado_central" in main
assert "rotinaParticipantApplyStoreToLegacy" in main
assert "PARTICIPANT_SYNC_SCHEDULER_VERSION=2" in scheduler
assert "rotina-request-sync" in scheduler
assert "source:'server',includeHistory:false,includeAlarms:true" in scheduler
assert "schedule(350,'start-initial')" in scheduler
print('OK: sincronização de servidor centralizada no Participant Sync Scheduler v2')
