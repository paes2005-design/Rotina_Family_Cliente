from pathlib import Path
import re

ROOT=Path('.')

def must_replace(text, old, new, label, count=1):
    if old not in text:
        raise SystemExit(f'Marcador ausente: {label}')
    return text.replace(old,new,count)

def must_regex(text, pattern, repl, label, flags=re.S):
    new,n=re.subn(pattern,repl,text,count=1,flags=flags)
    if n!=1:
        raise SystemExit(f'Regex {label}: esperado 1, encontrado {n}')
    return new

# -----------------------------------------------------------------------------
# 1) Cliente base: uma carga de cache + uma sincronização de servidor a cada 5 min.
#    Remove os 5 listeners permanentes da tela principal.
# -----------------------------------------------------------------------------
p=ROOT/'index-CLIENTE-v6.html'
s=p.read_text(encoding='utf-8')
s=must_replace(
    s,
    'collection, query, where, onSnapshot, updateDoc, doc, getDocs, addDoc, writeBatch, getDoc, setDoc, deleteField',
    'collection, query, where, updateDoc, doc, getDocs, getDocsFromCache, getDocsFromServer, addDoc, writeBatch, getDoc, getDocFromCache, getDocFromServer, setDoc, deleteField',
    'import firestore cache-first'
)
s=must_replace(
    s,
    '        let unsubscribeConfigGrupo = null;\n        const REGRA_ATRASO_PADRAO',
    '''        let unsubscribeConfigGrupo = null;\n        const SINCRONIZACAO_CLIENTE_MS = 5 * 60 * 1000;\n        let sincronizacaoClienteTimer = null;\n        let sincronizacaoClienteEmCurso = false;\n        let ultimaSincronizacaoClienteServidor = 0;\n        let eventosSincronizacaoInstalados = false;\n        const REGRA_ATRASO_PADRAO''',
    'estado sincronizacao cliente'
)

new_sync=r'''        function snapshotClienteCompartilhado() {
            return {
                grupoId: codigoGrupo,
                perfilId: clientePerfilId,
                tarefasTodas: cacheTarefasTodas.map(x=>({...x})),
                tarefasHoje: cacheTarefasHoje.map(x=>({...x})),
                historico: cacheHistorico.map(x=>({...x})),
                recompensas: recompensasCache.map(x=>({...x})),
                resgates: resgatesCache.map(x=>({...x})),
                regraAtraso: {...regraAtrasoAtual},
                ultimaSincronizacaoServidor: ultimaSincronizacaoClienteServidor
            };
        }
        window.rotinaClientCacheSnapshot = snapshotClienteCompartilhado;
        window.rotinaAtualizarTarefaLocal = (id, patch={}) => {
            const tarefaId=String(id||'').trim(); if(!tarefaId)return;
            cacheTarefasTodas=cacheTarefasTodas.map(t=>t.id===tarefaId?{...t,...patch}:t);
            cacheTarefasHoje=cacheTarefasHoje.map(t=>t.id===tarefaId?{...t,...patch}:t);
            renderizarTarefasHoje(); atualizarPainelPontos(); atualizarConquistas();
            window.dispatchEvent(new CustomEvent('rotina-client-cache-updated',{detail:{origem:'acao-local',servidor:false,colecoes:['tarefas']}}));
        };

        function aplicarTarefasSnapshot(snapshot, origem) {
            if(!snapshot)return;
            const lista=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(t=>(t.perfilId ? t.perfilId===clientePerfilId : t.perfilNome===clienteNome));
            cacheTarefasTodas=lista;
            cacheTarefasHoje=lista.filter(t=>t.diaSemana===diaAtualTexto).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));
            renderizarTarefasHoje(); atualizarPainelPontos(); atualizarConquistas();
            window.dispatchEvent(new CustomEvent('rotina-family-tasks-rendered',{detail:{origem}}));
        }
        function aplicarHistoricoSnapshot(snapshot){
            if(!snapshot)return;
            cacheHistorico=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(h=>(h.perfilId ? h.perfilId===clientePerfilId : h.perfilNome===clienteNome));
            atualizarPainelPontos(); atualizarConquistas(); renderizarRecompensasCliente(); renderizarJustificativasCliente();
        }
        function aplicarRecompensasSnapshot(snapshot){if(snapshot){recompensasCache=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.ativa!==false);renderizarRecompensasCliente();}}
        function aplicarResgatesSnapshot(snapshot){if(snapshot){resgatesCache=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(r=>(r.perfilId?r.perfilId===clientePerfilId:r.perfilNome===clienteNome));renderizarRecompensasCliente();verificarRetornosResgates();}}
        function aplicarConfigSnapshot(snapshot){if(snapshot){regraAtrasoAtual=normalizarRegraAtraso(snapshot.exists()?snapshot.data():{});const el=document.getElementById('textoRegraAtrasoCliente');if(el)el.innerHTML=textoRegraAtrasoCliente();}}

        async function sincronizarDadosCliente(origem='intervalo-5min', servidor=true) {
            if(sincronizacaoClienteEmCurso || !codigoGrupo || !clientePerfilId)return false;
            sincronizacaoClienteEmCurso=true;
            const inicio=performance.now();
            try{
                const qTarefas=query(collection(db,'tarefas'),where('grupoId','==',codigoGrupo),where('perfilId','==',clientePerfilId));
                const qHistorico=query(collection(db,'historico'),where('grupoId','==',codigoGrupo),where('perfilId','==',clientePerfilId));
                const qRecompensas=query(collection(db,'recompensas'),where('grupoId','==',codigoGrupo));
                const qResgates=query(collection(db,'resgates'),where('grupoId','==',codigoGrupo),where('perfilId','==',clientePerfilId));
                const refConfig=doc(db,'configGrupos',codigoGrupo);
                const lerColecao=servidor?getDocsFromServer:getDocsFromCache;
                const lerDocumento=servidor?getDocFromServer:getDocFromCache;
                const resultados=await Promise.allSettled([
                    lerColecao(qTarefas),lerColecao(qHistorico),lerColecao(qRecompensas),lerColecao(qResgates),lerDocumento(refConfig)
                ]);
                const [tarefas,historico,recompensas,resgates,config]=resultados;
                if(tarefas.status==='fulfilled')aplicarTarefasSnapshot(tarefas.value,servidor?'servidor-5min':'cache-persistente');
                if(historico.status==='fulfilled')aplicarHistoricoSnapshot(historico.value);
                if(recompensas.status==='fulfilled')aplicarRecompensasSnapshot(recompensas.value);
                if(resgates.status==='fulfilled')aplicarResgatesSnapshot(resgates.value);
                if(config.status==='fulfilled')aplicarConfigSnapshot(config.value);
                const falhas=resultados.filter(x=>x.status==='rejected').length;
                if(servidor && falhas<resultados.length)ultimaSincronizacaoClienteServidor=Date.now();
                window.rotinaLog?.('sync.cliente_ciclo',{origem,servidor,tempoMs:Math.round(performance.now()-inicio),falhas,intervaloMin:5},falhas?'warning':'info');
                window.dispatchEvent(new CustomEvent('rotina-client-cache-updated',{detail:{origem,servidor,falhas,intervaloMs:SINCRONIZACAO_CLIENTE_MS}}));
                return falhas<resultados.length;
            }catch(e){
                window.rotinaLog?.('sync.cliente_erro',{origem,servidor,mensagem:String(e?.message||e)},'warning');
                return false;
            }finally{sincronizacaoClienteEmCurso=false;}
        }
        window.rotinaSincronizarClienteAgora=(motivo='manual')=>sincronizarDadosCliente(motivo,true);

        function encerrarSincronizacaoCliente(){
            if(sincronizacaoClienteTimer){clearInterval(sincronizacaoClienteTimer);sincronizacaoClienteTimer=null;}
        }
        function iniciarEscutasFirebase() {
            // Arquitetura cache-first: nenhuma coleção funcional fica em onSnapshot permanente.
            [unsubscribeTarefas,unsubscribeTarefasTodas,unsubscribeHistorico,unsubscribeRecompensas,unsubscribeResgates,unsubscribeConfigGrupo].forEach(u=>u&&u());
            encerrarSincronizacaoCliente();
            unsubscribeTarefas=encerrarSincronizacaoCliente;unsubscribeTarefasTodas=null;unsubscribeHistorico=null;unsubscribeRecompensas=null;unsubscribeResgates=null;unsubscribeConfigGrupo=null;
            sincronizarDadosCliente('cache-inicial',false).finally(()=>sincronizarDadosCliente('servidor-inicial',true));
            sincronizacaoClienteTimer=setInterval(()=>{if(!document.hidden)sincronizarDadosCliente('intervalo-5min',true);},SINCRONIZACAO_CLIENTE_MS);
            if(!eventosSincronizacaoInstalados){
                eventosSincronizacaoInstalados=true;
                document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-ultimaSincronizacaoClienteServidor>=SINCRONIZACAO_CLIENTE_MS)sincronizarDadosCliente('retorno-visivel-stale',true);});
                window.addEventListener('online',()=>{if(Date.now()-ultimaSincronizacaoClienteServidor>=SINCRONIZACAO_CLIENTE_MS)sincronizarDadosCliente('reconectado-stale',true);});
                window.addEventListener('rotina-request-sync',e=>sincronizarDadosCliente(e.detail?.motivo||'solicitado',true));
            }
        }

        function horaSugeridaComSegundos'''
s=must_regex(
    s,
    r'        function inicializarEscutasFirebase\(\) \{.*?\n        \}\n\n        function horaSugeridaComSegundos',
    new_sync,
    'substituir listeners base'
)

# Garante que logout encerre o timer único.
s=must_replace(
    s,
    "window.sairCliente=()=>{ [unsubscribeTarefas,unsubscribeTarefasTodas,unsubscribeHistorico,unsubscribeRecompensas,unsubscribeResgates,unsubscribeConfigGrupo].forEach(u=>u&&u());",
    "window.sairCliente=()=>{ encerrarSincronizacaoCliente(); [unsubscribeTarefas,unsubscribeTarefasTodas,unsubscribeHistorico,unsubscribeRecompensas,unsubscribeResgates,unsubscribeConfigGrupo].forEach(u=>u&&u());",
    'logout encerra sync'
)
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 2) Guard temporal: cache/DOM primeiro, servidor só como fallback real.
#    A UI deixa de aguardar confirmação de rede para Iniciar/Finalizar.
# -----------------------------------------------------------------------------
p=ROOT/'client-time-guard-v3.js'
s=p.read_text(encoding='utf-8')
s=must_replace(s,'getDocs,getDocsFromServer','getDocs,getDocsFromCache,getDocsFromServer','import getDocsFromCache')
new_buscar="""async function buscarTarefa(id){const inicio=performance.now();const compartilhada=window.rotinaClientCacheSnapshot?.().tarefasTodas?.find?.(x=>x.id===id);if(compartilhada){taskCache.set(id,{at:Date.now(),value:compartilhada});log('perf.tarefa_busca',{tarefaId:id,origem:'cache-compartilhado',tempoMs:Math.round(performance.now()-inicio)});return{...compartilhada};}const cached=taskCache.get(id);if(cached&&Date.now()-cached.at<TASK_CACHE_MS){log('perf.tarefa_busca',{tarefaId:id,origem:'memoria',tempoMs:Math.round(performance.now()-inicio)});return{...cached.value};}const banco=await db(),ref=doc(banco,'tarefas',id);try{const snap=await getDocFromCache(ref),value=snap.exists()?{id:snap.id,...snap.data()}:null;if(value){taskCache.set(id,{at:Date.now(),value});log('perf.tarefa_busca',{tarefaId:id,origem:'cache-firestore',tempoMs:Math.round(performance.now()-inicio)});return value;}}catch{}if(navigator.onLine!==false){try{const snap=await getDocFromServer(ref),value=snap.exists()?{id:snap.id,...snap.data()}:null;if(value)taskCache.set(id,{at:Date.now(),value});log('perf.tarefa_busca',{tarefaId:id,origem:'servidor-fallback',tempoMs:Math.round(performance.now()-inicio)});return value;}catch(e){const texto=String(e?.code||e?.message||e);log('perf.tarefa_busca_servidor_erro',{tarefaId:id,mensagem:texto},'warning');if(/permission-denied|unauthenticated/i.test(texto))throw e;}}return null;}\nasync function regraAtual"""
s=must_regex(s,r'async function buscarTarefa\(id\)\{.*?\}\nasync function regraAtual',new_buscar,'buscar tarefa cache-first')

new_ordem="""async function verificarOrdem(t){const inicio=performance.now();const local=verificarOrdemRenderizada(t);if(local){log('perf.ordem_busca',{origem:'dom-cache',tempoMs:Math.round(performance.now()-inicio)});return local;}const compartilhadas=window.rotinaClientCacheSnapshot?.().tarefasTodas||[];if(compartilhadas.length){const lista=compartilhadas.filter(x=>x.diaSemana===t.diaSemana).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));log('perf.ordem_busca',{origem:'cache-compartilhado',tempoMs:Math.round(performance.now()-inicio),quantidade:lista.length});return avaliarOrdemLista(lista,t);}const banco=await db(),g=grupo(),p=perfil();if(!g||!p)return{permitida:true};const q=query(collection(banco,'tarefas'),where('grupoId','==',g),where('perfilId','==',p));try{const snap=await getDocsFromCache(q),lista=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.diaSemana===t.diaSemana).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));if(lista.length){log('perf.ordem_busca',{origem:'cache-firestore',tempoMs:Math.round(performance.now()-inicio),quantidade:lista.length});return avaliarOrdemLista(lista,t);}}catch{}if(navigator.onLine!==false){const snap=await getDocsFromServer(q),lista=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.diaSemana===t.diaSemana).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));log('perf.ordem_busca',{origem:'servidor-fallback',tempoMs:Math.round(performance.now()-inicio),quantidade:lista.length});return avaliarOrdemLista(lista,t);}return{permitida:true};}\nasync function registrarInicio"""
s=must_regex(s,r'async function verificarOrdem\(t\)\{.*?\}\nasync function registrarInicio',new_ordem,'ordem cache-first')

new_inicio="""async function registrarInicio(t,agora,j,antecipacao=null){const inicio=performance.now(),atrasoInicio=minutosCompletosAtrasoHorarioSugerido(agora,j.inicio),banco=await db(),antecipado=Boolean(antecipacao),antecipacaoMin=antecipado?Math.max(0,Math.floor((j.inicio-agora)/60000)):0,dados={status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),dataExecucao:dataISO(j.ocorr),iniciouComAtraso:atrasoInicio>0,atrasoInicioMin:atrasoInicio,inicioAntecipado:antecipado,antecipacaoMin,motivoInicioAntecipado:antecipado?(antecipacao.motivo||''):'',tipoMotivoInicioAntecipado:antecipado?(antecipacao.tipo||''):'',horarioTermino:'',terminoExecutadoEm:'',pontosGanhos:0,pontosOriginais:0,percentualAplicado:null,percentualOriginal:null,faixaAtraso:'',toleranciaConsumidaMin:0,toleranciaConsumidaSeg:0,atrasoFimMin:0,limite75Min:null,limite50Min:null,limite75Seg:null,limite50Seg:null,justificativaAtraso:'',revisaoStatus:'sem-revisao',tipoJustificativa:'',justificativaRecusada:false};const batch=writeBatch(banco);batch.update(doc(banco,'tarefas',t.id),dados);batch.set(doc(banco,'execucoes',`${dataISO(j.ocorr)}__${t.id}`),{grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:t.id,tarefaGrupoId:t.tarefaGrupoId||'',nomeTarefa:t.nome,data:dataISO(j.ocorr),...dados},{merge:true});atualizarCacheTarefa(t,dados);window.rotinaAtualizarTarefaLocal?.(t.id,dados);const resultado=await aguardarCommitAteLimite(batch.commit(),{acao:'inicio',tarefaId:t.id});log('perf.inicio_total',{tarefaId:t.id,tempoMs:Math.round(performance.now()-inicio),segundoPlano:resultado.emSegundoPlano===true});}\nfunction pedirMotivoAntecipacao"""
s=must_regex(s,r'async function registrarInicio\(t,agora,j,antecipacao=null\)\{.*?\}\nfunction pedirMotivoAntecipacao',new_inicio,'inicio local-first')
s=must_replace(s,'atualizarCacheTarefa(t,base);const batch','atualizarCacheTarefa(t,base);window.rotinaAtualizarTarefaLocal?.(t.id,base);const batch','resultado atualiza cache compartilhado')
s=s.replace("versao:6,commitWaitMs", "versao:7,commitWaitMs")
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 3) UI: carrega a versão cache-first do guard temporal.
# -----------------------------------------------------------------------------
p=ROOT/'client-ui-pro.js'
s=p.read_text(encoding='utf-8')
s=must_replace(s,"import('./client-time-guard-v3.js?v=6')","import('./client-time-guard-v3.js?v=7')",'bump time guard')
s=s.replace('window.__rotinaMascoteLoaderVersion=11','window.__rotinaMascoteLoaderVersion=12')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 4) Integridade de sessão: limpeza dos campos finais foi incorporada ao mesmo batch
#    de início. Não faz mais um updateDoc extra por início. Resgates usam cache central.
# -----------------------------------------------------------------------------
p=ROOT/'client-session-integrity.js'
s=p.read_text(encoding='utf-8')
s=must_replace(
    s,
    '''    const resultado=await original(id);\n    // Não segura a interface. O SDK do Firestore mantém a ordem das gravações deste\n    // cliente, portanto esta limpeza entra logo depois do comando de início.\n    limparCamposFinaisDaTarefa(id);\n    esconderTerminoAntigo();\n    return resultado;''',
    '''    const resultado=await original(id);\n    // Os campos finais agora são limpos no mesmo batch do início pelo guard temporal.\n    // Aqui resta somente a correção visual local, sem uma segunda gravação no Firestore.\n    esconderTerminoAntigo();\n    return resultado;''',
    'remover write extra no inicio'
)
# Quando detectar texto antigo em andamento, apenas oculta; não grava de novo.
s=must_replace(s,"      if(status==='Em andamento'&&tarefaId)limparCamposFinaisDaTarefa(tarefaId);","      // limpeza persistente já faz parte do batch de início v7","sem limpeza reativa extra")
# Troca consulta de resgates por snapshot compartilhado.
old="""    const banco=db();\n    if(!banco)throw new Error('Firebase ainda não inicializado');\n    const snap=await getDocs(query(collection(banco,'resgates'),where('grupoId','==',g),where('perfilId','==',p)));\n    const lista=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>{\n      if(r.perfilId)return String(r.perfilId)===p;\n      return String(r.perfilNome||'')===n;\n    });"""
new="""    const banco=db();\n    if(!banco)throw new Error('Firebase ainda não inicializado');\n    const lista=(window.rotinaClientCacheSnapshot?.().resgates||[]).filter(r=>{\n      if(r.perfilId)return String(r.perfilId)===p;\n      return String(r.perfilNome||'')===n;\n    });"""
s=must_replace(s,old,new,'resgates por cache')
# Executa baseline após atualização do cache, não cria leitura própria.
s=must_replace(s,"window.addEventListener('rotina-client-session-ready',e=>prepararRetornosResgate(e.detail||{}));","window.addEventListener('rotina-client-session-ready',e=>setTimeout(()=>prepararRetornosResgate(e.detail||{}),250));\n  window.addEventListener('rotina-client-cache-updated',()=>prepararRetornosResgate({grupo:grupo(),perfilId:perfil()}));",'baseline por evento cache')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 5) Pontos revisados: usa o histórico central. Zero listener Firestore adicional.
# -----------------------------------------------------------------------------
p=ROOT/'client-reviewed-points.js'
s=p.read_text(encoding='utf-8')
s=must_replace(s,"import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';\nimport { getFirestore, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';\n\n",'', 'remover imports listener reviewed')
new_garantir="""function garantirEscuta(){\n  const s=sessaoAtual();\n  const novaChave=`${s.grupo}|${s.perfilId}|${s.nome}`;\n  if(!s.grupo||!s.perfilId){encerrarEscuta();return;}\n  chaveSessao=novaChave;\n  historicoPerfil=(window.rotinaClientCacheSnapshot?.().historico||[]).map(x=>({...x}));\n  historicoCarregado=true;\n  aplicarTudo(false);\n}\n\nfunction somarPeriodo"""
s=must_regex(s,r'function garantirEscuta\(\)\{.*?\}\n\nfunction somarPeriodo',new_garantir,'reviewed cache')
s=must_replace(s,"window.addEventListener('beforeunload',encerrarEscuta);","window.addEventListener('beforeunload',encerrarEscuta);\nwindow.addEventListener('rotina-client-cache-updated',()=>{garantirEscuta();requestAnimationFrame(()=>aplicarTudo(false));});",'reviewed escuta cache event')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 6) Fonte de execução: histórico central compartilhado; nenhum onSnapshot próprio.
# -----------------------------------------------------------------------------
p=ROOT/'client-execution-source-unifier-v1.js'
s=p.read_text(encoding='utf-8')
s=must_replace(s,"import { getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';\nimport { getFirestore, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';\n\n",'', 'remover imports unifier')
new_start="""function start(){\n  if(!group()||!profile())return false;\n  const date=todayISO();\n  historyByTask=new Map();\n  for(const h of (window.rotinaClientCacheSnapshot?.().historico||[])){\n    if(clean(h.data||h.dataExecucao)!==date)continue;\n    if(h.tarefaId)historyByTask.set(clean(h.tarefaId),h);\n  }\n  apply();\n  return true;\n}\n\nfunction install"""
s=must_regex(s,r'function start\(\)\{.*?\}\n\nfunction install',new_start,'unifier shared cache')
s=must_replace(s,"window.addEventListener('rotina-client-session-ready',()=>setTimeout(start,50));","window.addEventListener('rotina-client-session-ready',()=>setTimeout(start,50));\n  window.addEventListener('rotina-client-cache-updated',start);",'unifier cache event')
s=s.replace("window.__rotinaExecutionSource='historico-final/tarefas-andamento-v2'","window.__rotinaExecutionSource='cache-central-historico-final/tarefas-andamento-v3'")
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 7) Integridade offline: remove quarta escuta do histórico e leituras de servidor
#    antes/depois do clique. Usa cache central + trava local; reconcilia só após um
#    ciclo de servidor de 5 minutos.
# -----------------------------------------------------------------------------
p=ROOT/'client-offline-execution-integrity-v1.js'
s=p.read_text(encoding='utf-8')
s=s.replace('const VERSION = 3;','const VERSION = 4;')
# Fonte compartilhada primeiro.
new_auth="""async function authoritativeHistory(taskId, date = isoDate(), allowServer = false) {\n  const compartilhado=(window.rotinaClientCacheSnapshot?.().historico||[]).find(h=>clean(h.tarefaId)===clean(taskId)&&clean(h.data||h.dataExecucao)===date);\n  if(compartilhado)return { ...compartilhado, __source:'shared-cache' };\n  if (!allowServer || !getApps().length || !group() || !profile()) return null;\n  const ref = doc(getFirestore(getApp()), 'historico', `${profile()}_${clean(taskId)}_${date}`);\n  try { const snap=await getDocFromCache(ref); return snap.exists()?{id:snap.id,...snap.data(),__source:'cache'}:null; } catch { return null; }\n}\n\nasync function captureCompletion"""
s=must_regex(s,r'async function authoritativeHistory\(taskId, date = isoDate\(\), allowServer = true\) \{.*?\}\n\nasync function captureCompletion',new_auth,'offline history cache')
s=s.replace("history.__source === 'server'","history.__source === 'shared-cache'")
# Nunca faz leitura de servidor no hot path.
s=s.replace("if (navigator.onLine !== false) lock = await captureCompletion(taskId, 'pre-start', true);","lock = await captureCompletion(taskId, 'pre-start-cache-central', false);")
s=s.replace("const serverHistory = navigator.onLine !== false ? await authoritativeHistory(id, isoDate(), true) : null;","const serverHistory = await authoritativeHistory(id, isoDate(), false);")
s=s.replace("await captureCompletion(id, 'finalizar-tarefa');","await captureCompletion(id, 'finalizar-tarefa', false);")
s=s.replace("setTimeout(() => captureCompletion(id, 'finalizar-tarefa-800ms'), 800);","setTimeout(() => captureCompletion(id, 'finalizar-tarefa-800ms', false), 800);")
# Listener histórico vira consumidor do cache central.
new_watch="""function watchHistory(detail = {}) {\n  const g = clean(detail.grupo || group()).toUpperCase();\n  const p = clean(detail.perfilId || profile());\n  if (!g || !p) return;\n  currentSignature = `${g}__${p}`;\n  const today=isoDate();\n  for(const data of (window.rotinaClientCacheSnapshot?.().historico||[])){\n    if(clean(data.data||data.dataExecucao)!==today||!isFinal(data.status))continue;\n    lockFirstCompletion(clean(data.tarefaId),data,'historico-cache-central',true);\n  }\n  applyLocksToDom();\n}\n\nfunction taskPatch"""
s=must_regex(s,r'function watchHistory\(detail = \{\}\) \{.*?\}\n\nfunction taskPatch',new_watch,'offline remove snapshot')
# Reconciliação usa histórico já baixado, sem getDoc por trava.
new_reconcile="""async function reconcileLocks() {\n  if (navigator.onLine === false || !getApps().length) return;\n  const db = getFirestore(getApp());\n  const historico=(window.rotinaClientCacheSnapshot?.().historico||[]);\n  for (const lock of listLocksToday()) {\n    try {\n      const existente=historico.find(h=>clean(h.tarefaId)===lock.taskId&&clean(h.data||h.dataExecucao)===lock.date&&isFinal(h.status));\n      if (existente) {\n        lockFirstCompletion(lock.taskId, existente, 'reconciliacao-cache-servidor', true);\n        continue;\n      }\n      const historyRef = doc(db, 'historico', `${lock.perfilId}_${lock.taskId}_${lock.date}`);\n      await setDoc(historyRef,{grupoId:lock.grupoId,perfilId:lock.perfilId,tarefaId:lock.taskId,data:lock.date,...taskPatch(lock),recuperadoDaTravaLocal:true,recuperadoEm:new Date().toISOString()},{merge:true});\n      await updateDoc(doc(db,'tarefas',lock.taskId),taskPatch(lock));\n      log('integridade_offline.trava_reconciliada',{tarefaId:lock.taskId,data:lock.date});\n    } catch(error){log('integridade_offline.reconciliacao_erro',{tarefaId:lock.taskId,mensagem:clean(error?.message||error)},'warning');}\n  }\n  applyLocksToDom();\n}\n\nfunction install"""
s=must_regex(s,r'async function reconcileLocks\(\) \{.*?\}\n\nfunction install',new_reconcile,'offline reconcile cache')
# Remove reconciliações em focus/visibility/online; roda após refresh servidor central.
s=s.replace("      if (navigator.onLine !== false) setTimeout(reconcileLocks, 400);","")
s=must_replace(s,"    window.addEventListener('rotina-family-tasks-rendered', () => setTimeout(applyLocksToDom, 0));\n    window.addEventListener('online', () => setTimeout(reconcileLocks, 250));\n    document.addEventListener('visibilitychange', () => {\n      if (!document.hidden) {\n        if (navigator.onLine !== false) reconcileLocks();\n        else applyLocksToDom();\n      }", "    window.addEventListener('rotina-family-tasks-rendered', () => setTimeout(applyLocksToDom, 0));\n    window.addEventListener('rotina-client-cache-updated', event => {\n      watchHistory({grupo:group(),perfilId:profile()});\n      if(event.detail?.servidor===true)setTimeout(reconcileLocks,50);\n    });\n    document.addEventListener('visibilitychange', () => {\n      if (!document.hidden) {\n        applyLocksToDom();\n      }", 'offline trigger central')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 8) Reconciliador: não lê coleções em focus/visibility. Usa snapshot central para
#    reparo do dia e não faz mais update extra de pontuação depois de cada conclusão.
# -----------------------------------------------------------------------------
p=ROOT/'client-history-reconciler.js'
s=p.read_text(encoding='utf-8')
s=must_replace(s,"const MIGRATION_VERSION=4;","const MIGRATION_VERSION=5;",'bump reconciler')
# desativa update redundante pós-conclusão
s=must_regex(s,r'function corrigirTarefaDepoisDoResultado\(historico\)\{.*?\}\nfunction instalarHookHistoricoLocal',"function corrigirTarefaDepoisDoResultado(historico){return;}\nfunction instalarHookHistoricoLocal",'sem write extra pos resultado')
new_hist="""export async function reconciliarHistoricoHoje(forcar=false){if(executando||navigator.onLine===false||!getApps().length)return{reparados:0,pontos:0};if(!forcar&&Date.now()-ultimaExecucao<300000)return{reparados:0,pontos:0};const g=grupo(),p=perfil(),n=nome();if(!g||!p)return{reparados:0,pontos:0};executando=true;try{const banco=getFirestore(getApp()),snapshot=window.rotinaClientCacheSnapshot?.()||{},tarefas=(snapshot.tarefasTodas||[]),historicos=(snapshot.historico||[]),hoje=dataLocal(new Date()),faltantes=tarefas.filter(t=>pertence(t,p,n)&&concluida(t)&&dataDaTarefa(t)===hoje&&!historicos.some(h=>historicoDaTarefa(h,t,p,n,hoje))).map(t=>payloadHistorico(t,hoje));ultimaExecucao=Date.now();if(!faltantes.length)return{reparados:0,pontos:0};const lote=writeBatch(banco);faltantes.forEach(h=>{const historicoId=`${h.perfilId||p}_${h.tarefaId}_${h.data}`;lote.set(doc(banco,'historico',historicoId),h,{merge:true});lote.set(doc(banco,'execucoes',`${h.data}__${h.tarefaId}`),h,{merge:true});window.registrarHistoricoLocal?.(historicoId,h);});await lote.commit();const pontos=faltantes.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0);avisar(faltantes.length,pontos,'recuperada');window.dispatchEvent(new CustomEvent('rotina-history-reconciled',{detail:{reparados:faltantes.length,pontos}}));return{reparados:faltantes.length,pontos};}finally{executando=false;}}\nfunction iniciar"""
s=must_regex(s,r'export async function reconciliarHistoricoHoje\(forcar=false\)\{.*?\}\nfunction iniciar',new_hist,'historico cache central')
# Inicialização leve: migração antiga somente uma vez e fora do hot path; reparo após sync central.
new_tail="""function iniciar(tentativa=0){instalarHookHistoricoLocal();if(!getApps().length||!grupo()||!perfil()){if(tentativa<120)setTimeout(()=>iniciar(tentativa+1),100);return;}setTimeout(()=>reconciliarPontuacaoIntegral(false).catch(e=>console.warn('Reconciliação integral de pontos:',e)),12000);}\nwindow.addEventListener('rotina-client-cache-updated',e=>{if(e.detail?.servidor===true)reconciliarHistoricoHoje(false).catch(err=>console.warn('Reconciliação após sync:',err));});\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>iniciar(),{once:true});else iniciar();"""
s=must_regex(s,r'function iniciar\(tentativa=0\)\{.*?if\(document.readyState===\'loading\'\).*?else iniciar\(\);',new_tail,'reconciler triggers')
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 9) Despertadores: mantém sua função, mas tira includeMetadataChanges para evitar
#    callback cache+servidor duplicado enquanto a fase 2 centraliza esta coleção.
# -----------------------------------------------------------------------------
p=ROOT/'family-alarm-client.js'
s=p.read_text(encoding='utf-8')
s=s.replace("unsub=onSnapshot(q,{includeMetadataChanges:true},s=>","unsub=onSnapshot(q,s=>")
p.write_text(s,encoding='utf-8')

# -----------------------------------------------------------------------------
# 10) Entrada e service worker: cache bust seguro.
# -----------------------------------------------------------------------------
p=ROOT/'index.html'
s=p.read_text(encoding='utf-8')
s=s.replace("const BUILD='20260826.8';","const BUILD='20260827.1';")
s=s.replace("./client-ui-pro.js?v=46","./client-ui-pro.js?v=47")
s=s.replace("navigator.serviceWorker.register('./sw.js?v=72',{updateViaCache:'none'})","navigator.serviceWorker.register('./sw.js?v=73',{updateViaCache:'none'})")
s=s.replace("client-offline-execution-integrity-v1.js?v=3","client-offline-execution-integrity-v1.js?v=4")
s=s.replace("runtime-build-info.js?v=20260826.8","runtime-build-info.js?v=20260827.1")
s=s.replace("window.__ROTINA_BUILD='${BUILD}';window.rotinaLog?.('app.build_ativo',{build:'${BUILD}',release:'cliente-recovery-v83'","window.__ROTINA_BUILD='${BUILD}';window.rotinaLog?.('app.build_ativo',{build:'${BUILD}',release:'cliente-cache-first-v1'")
s=s.replace('offlineIntegrity:3,uiPro:46,serviceWorkerExpected:72','offlineIntegrity:4,uiPro:47,serviceWorkerExpected:73')
p.write_text(s,encoding='utf-8')

p=ROOT/'sw.js'
s=p.read_text(encoding='utf-8')
s=s.replace("const CACHE_NAME='rotina-family-cliente-v72';","const CACHE_NAME='rotina-family-cliente-v73';")
s=s.replace("const ROTINA_SW_VERSION='72';","const ROTINA_SW_VERSION='73';")
s=s.replace("const ROTINA_BUILD_ID='20260826.1';","const ROTINA_BUILD_ID='20260827.1';")
s=s.replace("client-offline-execution-integrity-v1.js?v=2","client-offline-execution-integrity-v1.js?v=4")
s=s.replace("runtime-build-info.js?v=20260826.1","runtime-build-info.js?v=20260827.1")
p.write_text(s,encoding='utf-8')

print('CLIENT_CACHE_SYNC_V1_APLICADO')
