from pathlib import Path
import re


def replace_once(s, old, new, label):
    if old not in s:
        raise SystemExit(f'Marcador ausente: {label}')
    return s.replace(old, new, 1)


def regex_once(s, pattern, repl, label):
    out, n = re.subn(pattern, repl, s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit(f'Regex {label}: {n}')
    return out

# 1) Início antecipado: somente cache central.
p=Path('client-early-start-ui.js')
s=p.read_text(encoding='utf-8')
s=replace_once(s,
"import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';\nimport {getFirestore,collection,query,where,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';\n\n",
'', 'imports early-start')
new_guard="""function garantirEscuta(){
  if(iniciando)return;
  const s=sessao(),chave=`${s.grupo}|${s.perfil||s.nome}`;
  if(!s.grupo||(!s.perfil&&!s.nome)){chaveSessao='';tarefas=[];return;}
  iniciando=true;
  try{
    chaveSessao=chave;
    const cache=window.rotinaClientCacheSnapshot?.();
    tarefas=(cache?.tarefasTodas||[]).filter(t=>t.perfilId?s.perfil&&t.perfilId===s.perfil:t.perfilNome===s.nome);
  }finally{iniciando=false;}
}
window.aplicarInicioAntecipadoCliente=()=>{garantirEscuta();aplicar();};
window.iniciarInicioAntecipadoCliente=garantirEscuta;
window.addEventListener('rotina-client-cache-updated',()=>{garantirEscuta();aplicar();});
window.addEventListener('rotina-client-session-ready',()=>{garantirEscuta();aplicar();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{garantirEscuta();aplicar();},{once:true});else{garantirEscuta();aplicar();}
"""
s=regex_once(s,r"function garantirEscuta\(\)\{.*?window\.aplicarInicioAntecipadoCliente=aplicar;.*?if\(document\.readyState==='loading'\).*?else aplicar\(\);",new_guard,'early-start central cache')
# aplicar() não deve tentar reabrir uma fonte externa.
s=s.replace('  garantirEscuta();garantirEstilo();','  garantirEstilo();',1)
p.write_text(s,encoding='utf-8')

# 2) Cronômetro: tarefa vem do cache central; timer de 1s só calcula texto local.
p=Path('client-tolerance-timer.js')
s=p.read_text(encoding='utf-8')
s=replace_once(s,
"import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';\nimport {getFirestore,collection,query,where,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';\n",
'', 'imports tolerance timer')
s=replace_once(s,'  garantirEscuta();garantirEstilo();','  garantirEstilo();','timer render sem leitura')
new_guard="""function garantirEscuta(){
  const s=sessao(),chave=`${s.grupo}|${s.perfil||s.nome}`;
  if(!s.grupo||(!s.perfil&&!s.nome)){chaveSessao='';tarefas=[];prepararLinhasCronometro();return;}
  chaveSessao=chave;
  const cache=window.rotinaClientCacheSnapshot?.();
  tarefas=(cache?.tarefasTodas||[]).filter(t=>t.perfilId?s.perfil&&t.perfilId===s.perfil:t.perfilNome===s.nome);
  prepararLinhasCronometro();
}

function tick(){
  atualizarSomenteTextoCronometro(new Date());
}

function iniciarTimerUnico(){
  if(timerId!==null)return;
  garantirEscuta();
  timerId=setInterval(tick,1000);
  tick();
}
"""
s=regex_once(s,r"function garantirEscuta\(\)\{.*?function iniciarTimerUnico\(\)\{.*?\n\}",new_guard,'timer central cache')
s=replace_once(s,
"window.addEventListener('rotina-tolerance-rule-updated',()=>{prepararLinhasCronometro();atualizarSomenteTextoCronometro(new Date());});",
"window.addEventListener('rotina-tolerance-rule-updated',()=>{prepararLinhasCronometro();atualizarSomenteTextoCronometro(new Date());});\nwindow.addEventListener('rotina-client-cache-updated',garantirEscuta);\nwindow.addEventListener('rotina-client-session-ready',garantirEscuta);",
'timer cache events')
p.write_text(s,encoding='utf-8')

# 3) Navegação semanal: tarefas/histórico vêm da mesma cópia central.
p=Path('client-week-nav.js')
s=p.read_text(encoding='utf-8')
s=replace_once(s,
'import { getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";\nimport { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";\n\n',
'', 'imports week nav')
new_week="""function encerrarEscutas(){chaveSessao='';tarefasSemana=[];historicoSemana=[];historicoCarregado=false;}
function conectarCacheSemanal(){
  const grupo=(localStorage.getItem('cliente_grupo')||'').trim(),perfilId=(localStorage.getItem('cliente_perfil_id')||'').trim(),nome=(localStorage.getItem('cliente_nome')||'').trim(),novaChave=`${grupo}|${perfilId}|${nome}`;
  if(!grupo||!perfilId){encerrarEscutas();atualizarPontuacaoDia();return;}
  chaveSessao=novaChave;
  const cache=window.rotinaClientCacheSnapshot?.();
  tarefasSemana=(cache?.tarefasTodas||[]).filter(t=>t.perfilId?t.perfilId===perfilId:t.perfilNome===nome);
  historicoSemana=(cache?.historico||[]).filter(h=>h.perfilId?h.perfilId===perfilId:h.perfilNome===nome);
  historicoCarregado=true;
  const badge=document.getElementById('semanaCacheStatus');
  if(badge)badge.textContent=cache?.ultimaSincronizacaoServidor?'☁️ Semana atualizada e em cache':'☁️ Semana disponível offline';
  atualizarPontuacaoDia();
  if(diaSelecionado!==hojeTexto())renderizarDiaConsulta();
}
"""
s=regex_once(s,r"function encerrarEscutas\(\)\{.*?\nfunction conectarCacheSemanal\(\)\{.*?\n\}",new_week,'week central cache')
s=replace_once(s,
"window.addEventListener('rotina-client-session-ready',conectarCacheSemanal);window.addEventListener('storage',conectarCacheSemanal);window.addEventListener('beforeunload',encerrarEscutas);",
"window.addEventListener('rotina-client-session-ready',conectarCacheSemanal);window.addEventListener('rotina-client-cache-updated',conectarCacheSemanal);window.addEventListener('storage',conectarCacheSemanal);window.addEventListener('beforeunload',encerrarEscutas);",
'week cache event')
p.write_text(s,encoding='utf-8')

# 4) Loader/build/SW.
p=Path('client-ui-pro.js')
s=p.read_text(encoding='utf-8')
s=s.replace("import('./client-early-start-ui.js')","import('./client-early-start-ui.js?v=2')")
s=s.replace("import('./client-tolerance-timer.js?v=4')","import('./client-tolerance-timer.js?v=5')")
s=s.replace("import('./client-week-nav.js?v=3')","import('./client-week-nav.js?v=4')")
s=s.replace('window.__rotinaMascoteLoaderVersion=12','window.__rotinaMascoteLoaderVersion=13')
p.write_text(s,encoding='utf-8')

p=Path('index.html');s=p.read_text(encoding='utf-8')
s=s.replace("const BUILD='20260827.2';","const BUILD='20260827.3';")
s=s.replace("./client-ui-pro.js?v=47","./client-ui-pro.js?v=48")
s=s.replace("navigator.serviceWorker.register('./sw.js?v=74',{updateViaCache:'none'})","navigator.serviceWorker.register('./sw.js?v=75',{updateViaCache:'none'})")
s=s.replace("runtime-build-info.js?v=20260827.2","runtime-build-info.js?v=20260827.3")
s=s.replace("release:'cliente-cache-first-v1'","release:'cliente-cache-first-v2'")
s=s.replace('uiPro:47,serviceWorkerExpected:74','uiPro:48,serviceWorkerExpected:75')
p.write_text(s,encoding='utf-8')

p=Path('sw.js');s=p.read_text(encoding='utf-8')
s=s.replace('rotina-family-cliente-v74','rotina-family-cliente-v75')
s=s.replace("ROTINA_SW_VERSION='74'","ROTINA_SW_VERSION='75'")
s=s.replace("ROTINA_BUILD_ID='20260827.2'","ROTINA_BUILD_ID='20260827.3'")
s=s.replace('runtime-build-info.js?v=20260827.2','runtime-build-info.js?v=20260827.3')
p.write_text(s,encoding='utf-8')
print('CLIENT_CACHE_CENTRALIZATION_V2=OK')
