from pathlib import Path
import re

p = Path('index-CLIENTE-v6.html')
s = p.read_text(encoding='utf-8')


def rep(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {count}')
    s = s.replace(old, new, 1)


rep(
    "        let cacheTarefasHoje = [];\n        let cacheTarefasTodas = [];\n        let cacheHistorico = [];",
    "        let cacheTarefasHoje = [];\n        let cacheTarefasTodas = [];\n        let cacheTarefasGrupo = [];\n        let cacheHistorico = [];",
    'estado tarefas',
)
rep(
    "        let recompensasCache = [];\n        let resgatesCache = [];",
    "        let recompensasCache = [];\n        let resgatesCache = [];\n        let desafiosCache = [];",
    'estado desafios',
)
rep(
    "                recompensas: recompensasCache.map(x=>({...x})),\n                resgates: resgatesCache.map(x=>({...x})),",
    "                recompensas: recompensasCache.map(x=>({...x})),\n                resgates: resgatesCache.map(x=>({...x})),\n                desafios: desafiosCache.map(x=>({...x})),",
    'snapshot desafios',
)

old = """        window.rotinaAtualizarTarefaLocal = (id, patch={}) => {
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
"""
new = """        function tarefaVisivelParticipante(t){
            return !(t?.ativa===false || t?.ativo===false || t?.active===false || String(t?.status||'').trim().toLowerCase()==='inativa');
        }
        function tarefaDoHistorico(h){
            if(!h)return null;
            const tarefaId=String(h.tarefaId||'').trim();
            if(tarefaId){const encontrada=cacheTarefasGrupo.find(t=>String(t.id||'')===tarefaId);if(encontrada)return encontrada;}
            const tarefaGrupoId=String(h.tarefaGrupoId||'').trim();
            if(tarefaGrupoId)return cacheTarefasGrupo.find(t=>String(t.tarefaGrupoId||'')===tarefaGrupoId)||null;
            return null;
        }
        function historicoContaPontos(h){
            const tarefa=tarefaDoHistorico(h);
            if(!tarefa || tarefaVisivelParticipante(tarefa))return true;
            return String(h?.data||'')!==formatarDataISO(new Date());
        }
        function historicoPontuavel(){return cacheHistorico.filter(historicoContaPontos);}
        window.rotinaAtualizarTarefaLocal = (id, patch={}) => {
            const tarefaId=String(id||'').trim(); if(!tarefaId)return;
            cacheTarefasGrupo=cacheTarefasGrupo.map(t=>t.id===tarefaId?{...t,...patch}:t);
            cacheTarefasTodas=cacheTarefasGrupo.filter(tarefaVisivelParticipante);
            cacheTarefasHoje=cacheTarefasTodas.filter(t=>t.diaSemana===diaAtualTexto).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));
            renderizarTarefasHoje(); atualizarPainelPontos(); atualizarConquistas(); renderizarRecompensasCliente();
            window.dispatchEvent(new CustomEvent('rotina-client-cache-updated',{detail:{origem:'acao-local',servidor:false,colecoes:['tarefas']}}));
        };

        function aplicarTarefasSnapshot(snapshot, origem) {
            if(!snapshot)return;
            cacheTarefasGrupo=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(t=>(t.perfilId ? t.perfilId===clientePerfilId : t.perfilNome===clienteNome));
            cacheTarefasTodas=cacheTarefasGrupo.filter(tarefaVisivelParticipante);
            cacheTarefasHoje=cacheTarefasTodas.filter(t=>t.diaSemana===diaAtualTexto).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));
            renderizarTarefasHoje(); atualizarPainelPontos(); atualizarConquistas(); renderizarRecompensasCliente();
            window.rotinaLog?.('tarefas.inativas_aplicadas',{inativas:cacheTarefasGrupo.length-cacheTarefasTodas.length,ativas:cacheTarefasTodas.length,retiraPontosHoje:true});
            window.dispatchEvent(new CustomEvent('rotina-family-tasks-rendered',{detail:{origem}}));
        }
"""
rep(old, new, 'contrato inativas')

rep(
    "        function aplicarResgatesSnapshot(snapshot){if(snapshot){resgatesCache=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(r=>(r.perfilId?r.perfilId===clientePerfilId:r.perfilNome===clienteNome));renderizarRecompensasCliente();verificarRetornosResgates();}}\n        function aplicarConfigSnapshot(snapshot){if(snapshot){regraAtrasoAtual=normalizarRegraAtraso(snapshot.exists()?snapshot.data():{});const el=document.getElementById('textoRegraAtrasoCliente');if(el)el.innerHTML=textoRegraAtrasoCliente();}}",
    "        function aplicarResgatesSnapshot(snapshot){if(snapshot){resgatesCache=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(r=>(r.perfilId?r.perfilId===clientePerfilId:r.perfilNome===clienteNome));renderizarRecompensasCliente();verificarRetornosResgates();}}\n        function aplicarDesafiosSnapshots(snapshots=[]){const mapa=new Map();snapshots.filter(Boolean).forEach(snapshot=>snapshot.docs.forEach(d=>mapa.set(d.id,{id:d.id,...d.data()})));desafiosCache=[...mapa.values()].filter(c=>c.ativa!==false&&!c.encerrada&&(c.perfilId===clientePerfilId||c.perfilId==='__ALL__'));renderizarRecompensasCliente();}\n        function aplicarConfigSnapshot(snapshot){if(snapshot){regraAtrasoAtual=normalizarRegraAtraso(snapshot.exists()?snapshot.data():{});const el=document.getElementById('textoRegraAtrasoCliente');if(el)el.innerHTML=textoRegraAtrasoCliente();}}",
    'snapshot desafios',
)

old_sync = """                const qRecompensas=query(collection(db,'recompensas'),where('grupoId','==',codigoGrupo));
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
"""
new_sync = """                const qRecompensas=query(collection(db,'recompensas'),where('grupoId','==',codigoGrupo));
                const qResgates=query(collection(db,'resgates'),where('grupoId','==',codigoGrupo),where('perfilId','==',clientePerfilId));
                const qDesafiosPerfil=query(collection(db,'conquistas'),where('grupoId','==',codigoGrupo),where('perfilId','==',clientePerfilId));
                const qDesafiosTodos=query(collection(db,'conquistas'),where('grupoId','==',codigoGrupo),where('perfilId','==','__ALL__'));
                const refConfig=doc(db,'configGrupos',codigoGrupo);
                const lerColecao=servidor?getDocsFromServer:getDocsFromCache;
                const lerDocumento=servidor?getDocFromServer:getDocFromCache;
                const resultados=await Promise.allSettled([
                    lerColecao(qTarefas),lerColecao(qHistorico),lerColecao(qRecompensas),lerColecao(qResgates),lerColecao(qDesafiosPerfil),lerColecao(qDesafiosTodos),lerDocumento(refConfig)
                ]);
                const [tarefas,historico,recompensas,resgates,desafiosPerfil,desafiosTodos,config]=resultados;
                if(tarefas.status==='fulfilled')aplicarTarefasSnapshot(tarefas.value,servidor?'servidor-5min':'cache-persistente');
                if(historico.status==='fulfilled')aplicarHistoricoSnapshot(historico.value);
                if(recompensas.status==='fulfilled')aplicarRecompensasSnapshot(recompensas.value);
                if(resgates.status==='fulfilled')aplicarResgatesSnapshot(resgates.value);
                if(desafiosPerfil.status==='fulfilled'||desafiosTodos.status==='fulfilled')aplicarDesafiosSnapshots([desafiosPerfil.status==='fulfilled'?desafiosPerfil.value:null,desafiosTodos.status==='fulfilled'?desafiosTodos.value:null]);
                if(config.status==='fulfilled')aplicarConfigSnapshot(config.value);
"""
rep(old_sync, new_sync, 'sync desafios')

rep("            cacheHistorico.forEach((h) => {", "            historicoPontuavel().forEach((h) => {", 'painel pontos')

old_local = """        function atualizarConquistas(){ const el=document.getElementById('conquistasCliente');if(!el)return; const datas=[...new Set(cacheHistorico.filter(ehExecucaoPontual).map(h=>h.data))].sort().reverse(); let seq=0,d=new Date();for(let i=0;i<60;i++){const iso=formatarDataISO(d);if(datas.includes(iso))seq++;else if(i>0)break;d.setDate(d.getDate()-1);} const total=cacheHistorico.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0); const conquistas=[];if(seq>=3)conquistas.push('🔥 3 dias seguidos');if(seq>=7)conquistas.push('🏅 Persistente: 7 dias');if(total>=1000)conquistas.push('⭐ Mil pontos');if(cacheHistorico.filter(ehExecucaoPontual).length>=10)conquistas.push('⏱️ Pontual: 10 tarefas'); el.innerHTML=`<strong>🔥 ${seq} dia(s)</strong><br>${conquistas.map(escaparHtml).join('<br>')||'Continue cumprindo metas para desbloquear conquistas.'}`; }
        function saldoPontos(){
            const ganho=cacheHistorico.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0);
"""
new_local = """        function atualizarConquistas(){ const el=document.getElementById('conquistasCliente');if(!el)return; const historico=historicoPontuavel(); const datas=[...new Set(historico.filter(ehExecucaoPontual).map(h=>h.data))].sort().reverse(); let seq=0,d=new Date();for(let i=0;i<60;i++){const iso=formatarDataISO(d);if(datas.includes(iso))seq++;else if(i>0)break;d.setDate(d.getDate()-1);} const total=historico.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0); const conquistas=[];if(seq>=3)conquistas.push('🔥 3 dias seguidos');if(seq>=7)conquistas.push('🏅 Persistente: 7 dias');if(total>=1000)conquistas.push('⭐ Mil pontos');if(historico.filter(ehExecucaoPontual).length>=10)conquistas.push('⏱️ Pontual: 10 tarefas'); el.innerHTML=`<strong>🔥 ${seq} dia(s)</strong><br>${conquistas.map(escaparHtml).join('<br>')||'Continue cumprindo metas para desbloquear conquistas.'}`; }
        function saldoPontos(){
            const ganho=historicoPontuavel().reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0);
"""
rep(old_local, new_local, 'pontos locais')

marker = """        function renderizarRecompensasCliente(){
            const el=document.getElementById('recompensasCliente');if(!el)return; const saldo=saldoPontos();
"""
challenge = """        const REGRAS_DESAFIO={on_time_days:'Dias com todas as tarefas dentro do horário',tasks_100:'Tarefas consecutivas com 100%',no_justification_days:'Dias sem necessidade de justificativa',points:'Pontos atingidos',percent_points:'Percentual dos pontos possíveis'};
        function dataDesafio(x){return String(x?.data||x?.dataExecucao||x?.criadoEmIso||x?.criadoEm||'').slice(0,10);}
        function percentualDesafio(x){for(const v of [x?.percentualRevisado,x?.percentualAplicado])if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Math.min(100,Math.round(Number(v))));const f=String(x?.faixaAtraso||'').toLowerCase(),st=String(x?.status||'').toLowerCase();if(f==='dentro-limites')return 100;if(f==='atraso-leve'||st.includes('75%'))return 75;if(f==='atraso-maior'||st.includes('50%'))return 50;if(f==='estourado'||st.includes('atrasado'))return 0;if(st.includes('prazo'))return 100;return null;}
        function registroFinalDesafio(x){return percentualDesafio(x)!==null||!!(x?.terminoExecutadoEm||x?.horarioTermino);}
        function diaSemanaData(iso){const [a,m,d]=String(iso).split('-').map(Number);return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date(a,m-1,d,12).getDay()];}
        function tarefasEsperadasNoDia(iso){const dia=diaSemanaData(iso);return cacheTarefasGrupo.filter(t=>tarefaVisivelParticipante(t)&&t.diaSemana===dia).length;}
        function limitesPeriodo(tipo){const n=new Date(),a=new Date(n.getFullYear(),n.getMonth(),n.getDate(),12);if(tipo==='month')return{ini:`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}-01`,fim:`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}-31`};const wd=(a.getDay()+6)%7,ini=new Date(a);ini.setDate(a.getDate()-wd);const fim=new Date(ini);fim.setDate(ini.getDate()+6);const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;return{ini:iso(ini),fim:iso(fim)};}
        function progressoDesafio(c){let hs=historicoPontuavel().filter(registroFinalDesafio);const inicio=String(c?.cicloIniciadoEm||c?.criadoEm||'').slice(0,10);if(inicio)hs=hs.filter(h=>!dataDesafio(h)||dataDesafio(h)>=inicio);if(c.tipo==='points')return hs.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0);if(c.tipo==='percent_points'){const b=limitesPeriodo(c.periodoPercentual==='month'?'month':'week'),r=hs.filter(h=>dataDesafio(h)>=b.ini&&dataDesafio(h)<=b.fim),ganho=r.reduce((s,h)=>s+(Number(h.pontosGanhos)||0),0),poss=r.reduce((s,h)=>s+(Number(h.pontosMaximos)||0),0);return poss?Math.round(ganho*100/poss):0;}if(c.tipo==='tasks_100'){const r=hs.slice().sort((a,b)=>`${dataDesafio(b)}${String(b.horarioTermino||b.terminoExecutadoEm||'')}`.localeCompare(`${dataDesafio(a)}${String(a.horarioTermino||a.terminoExecutadoEm||'')}`));let n=0;for(const h of r){if(percentualDesafio(h)===100)n++;else break;}return n;}const grupos={};for(const h of hs){const data=dataDesafio(h);if(data)(grupos[data]||(grupos[data]=[])).push(h);}const dias=Object.keys(grupos).sort(),ok={};for(const data of dias){const r=grupos[data],esperadas=tarefasEsperadasNoDia(data);if(!esperadas||r.length<esperadas){ok[data]=false;continue;}ok[data]=c.tipo==='on_time_days'?r.every(h=>percentualDesafio(h)===100):r.every(h=>!String(h.justificativaAtraso||'').trim()&&h.justificativaRecusada!==true);}if(c.modoContagem==='consecutive'){let n=0;for(const data of dias.slice().sort().reverse()){if(ok[data])n++;else if(tarefasEsperadasNoDia(data))break;}return n;}return dias.filter(data=>ok[data]).length;}
        function metaDesafio(c){const alvo=Number(c.meta)||0;if(c.tipo==='on_time_days'||c.tipo==='no_justification_days')return `${alvo} dia(s) ${c.modoContagem==='consecutive'?'consecutivos':'acumulados'}`;if(c.tipo==='tasks_100')return `${alvo} tarefa(s) consecutiva(s) com 100%`;if(c.tipo==='percent_points')return `${alvo}% dos pontos possíveis no período de ${c.periodoPercentual==='month'?'mês':'semana'}`;return `${alvo} pontos${c.prazo==='with'?` em ${c.prazoValor} ${c.prazoUnidade==='days'?'dia(s)':c.prazoUnidade==='weeks'?'semana(s)':'mês(es)'}`:''}`;}
        function htmlDesafiosCliente(){if(!desafiosCache.length)return '<div style="margin-top:7px"><small>Nenhum desafio ativo.</small></div>';return desafiosCache.map(c=>{const progresso=progressoDesafio(c),meta=Math.max(1,Number(c.meta)||1),pct=Math.max(0,Math.min(100,Math.round(progresso*100/meta))),atingido=c.pendenteValidacao||progresso>=meta;return `<div style="margin-top:9px;padding:9px;border:1px solid #eee;border-radius:10px"><strong>🏆 ${escaparHtml(REGRAS_DESAFIO[c.tipo]||'Desafio')}</strong><br><small>Meta: ${escaparHtml(metaDesafio(c))}</small><br><small>Prêmio: ${escaparHtml(c.premio||'Não informado')}</small><div style="height:7px;background:#eee;border-radius:20px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${pct}%;background:var(--cor-primaria)"></div></div><small>${progresso} / ${meta}${atingido?' · ✅ Meta atingida, aguardando ADM':''}</small></div>`;}).join('');}
        function renderizarRecompensasCliente(){
            const el=document.getElementById('recompensasCliente');if(!el)return; const saldo=saldoPontos();
"""
rep(marker, challenge, 'desafios em recompensas')
rep(
    "            el.innerHTML=`<strong>Saldo disponível: ${saldo} pts</strong><br>${catalogo}<div style=\"margin-top:12px\"><strong>Meus resgates de hoje</strong>${hist||'<br><small>Nenhum resgate solicitado hoje.</small>'}</div>`;",
    "            el.innerHTML=`<strong>Saldo disponível: ${saldo} pts</strong><div style=\"margin-top:12px\"><strong>🏆 Desafios</strong>${htmlDesafiosCliente()}</div><div style=\"margin-top:12px\"><strong>🎁 Catálogo</strong>${catalogo}</div><div style=\"margin-top:12px\"><strong>Meus resgates de hoje</strong>${hist||'<br><small>Nenhum resgate solicitado hoje.</small>'}</div>`;",
    'html recompensas',
)
rep('🎁 Recompensas e Resgates', '🎁 Recompensas, Desafios e Resgates', 'titulo recompensas')
p.write_text(s, encoding='utf-8')

# Regra de leitura dos desafios: só o próprio perfil e desafios destinados a Todos.
r = Path('firestore.rules')
rs = r.read_text(encoding='utf-8')
marker = "    match /despertadores/{id} {\n"
insert = """    match /conquistas/{id} {
      allow read: if isMaster()
        || (isParticipant()
            && resource.data.grupoId == myGroup()
            && (resource.data.perfilId == myProfile() || resource.data.perfilId == '__ALL__'));
      allow create, update, delete: if isMaster();
    }

    match /despertadores/{id} {
"""
if rs.count(marker) != 1:
    raise SystemExit('marcador das regras não encontrado exatamente uma vez')
rs = rs.replace(marker, insert, 1)
r.write_text(rs, encoding='utf-8')

# Build oficial novo; o SW já é network-first/no-store, portanto não precisa ser alterado.
shell = Path('index.html')
sh = shell.read_text(encoding='utf-8')
for old_value, new_value in [
    ("const BUILD='20260827.5';", "const BUILD='20260905.1';"),
    ('./runtime-build-info.js?v=20260827.5', './runtime-build-info.js?v=20260905.1'),
    ("release:'participante-cache-first-v3-telemetria'", "release:'participante-inactive-challenges-v1'"),
]:
    if sh.count(old_value) != 1:
        raise SystemExit(f'marcador de build inesperado: {old_value}')
    sh = sh.replace(old_value, new_value, 1)
shell.write_text(sh, encoding='utf-8')

# Contratos obrigatórios.
final = p.read_text(encoding='utf-8')
checks = {
    'cache bruto': 'let cacheTarefasGrupo = [];' in final,
    'filtro inativo': 'cacheTarefasTodas=cacheTarefasGrupo.filter(tarefaVisivelParticipante);' in final,
    'retira pontos hoje': 'function historicoContaPontos(h)' in final and "return String(h?.data||'')!==formatarDataISO(new Date());" in final,
    'painel filtrado': 'historicoPontuavel().forEach((h) => {' in final,
    'saldo filtrado': 'const ganho=historicoPontuavel().reduce' in final,
    'query desafio perfil': "const qDesafiosPerfil=query(collection(db,'conquistas')" in final,
    'query desafio todos': "const qDesafiosTodos=query(collection(db,'conquistas')" in final,
    'desafio em recompensas': '<strong>🏆 Desafios</strong>${htmlDesafiosCliente()}' in final,
    'sem listener novo': 'onSnapshot(' not in final,
    'regra de perfil': "resource.data.perfilId == myProfile() || resource.data.perfilId == '__ALL__'" in r.read_text(encoding='utf-8'),
    'build novo': "const BUILD='20260905.1';" in shell.read_text(encoding='utf-8'),
}
for name, ok in checks.items():
    if not ok:
        raise SystemExit('Falha contratual: ' + name)
    print('OK:', name)

mods = re.findall(r'<script type="module">(.*?)</script>', final, re.S)
if not mods:
    raise SystemExit('script type=module principal não encontrado')
Path('/tmp/client-main.mjs').write_text(max(mods, key=len), encoding='utf-8')
