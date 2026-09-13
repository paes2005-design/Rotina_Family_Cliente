import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,collection,query,where,getDocs,doc,writeBatch} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const pad=n=>String(n).padStart(2,'0');
const dataLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';
const MIGRATION_VERSION=5;
const HISTORY_GAP_VERSION=1;
const GAP_MIN_INTERVAL_MS=5*60*1000;
const MAX_GAP_REPAIRS_PER_RUN=100;
const CAMPOS=[
  'tarefaGrupoId','diaSemana','horaSugeridaInicio','horaSugeridaFim','horarioInicio','horarioTermino',
  'inicioExecutadoEm','terminoExecutadoEm','tempoLimite','pontosMaximos','pontosGanhos','pontosOriginais',
  'percentualAplicado','percentualOriginal','percentualRevisado','pontosDevolvidos','faixaAtraso',
  'toleranciaConsumidaMin','toleranciaConsumidaSeg','atrasoInicioMin','atrasoFimMin','limite75Min','limite50Min',
  'limite75Seg','limite50Seg','icone','inicioAntecipado','antecipacaoMin','motivoInicioAntecipado',
  'tipoMotivoInicioAntecipado','iniciouComAtraso','iniciouAposLimiteFinal','percentualMaximoPrevisto',
  'minutosAlemTolerancia','faixaLeveMinutos','regraAtrasoAplicada','justificativaAtraso','tipoJustificativa',
  'justificativaRecusada','revisaoStatus','revisaoDecisao','revisadoEm','pontuacaoRegraVersao','pontuacaoCorrecao'
];
let executandoHistorico=false,ultimaExecucaoHistorico=0,hookInstalado=false;

function log(evento,detalhes={},nivel='info'){try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}}
function clean(v){return String(v??'').trim();}
function pertence(reg,p,n){return reg?.perfilId?clean(reg.perfilId)===clean(p):clean(reg?.perfilNome)===clean(n);}
function concluida(t){return /Prazo|Atrasado/i.test(String(t?.status||''))||!!(t?.terminoExecutadoEm||t?.horarioTermino)||t?.percentualAplicado!==null&&t?.percentualAplicado!==undefined;}
function tarefaIdDoRegistro(reg={}){const direto=clean(reg.tarefaId);if(direto)return direto;const id=clean(reg.id),partes=id.split('__');return partes.length>1?clean(partes.slice(1).join('__')):'';}
function dataDoRegistro(reg={}){for(const valor of [reg.data,reg.dataExecucao]){const s=clean(valor).slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;}const idDate=clean(reg.id).split('__')[0];if(/^\d{4}-\d{2}-\d{2}$/.test(idDate))return idDate;for(const valor of [reg.terminoExecutadoEm,reg.inicioExecutadoEm]){const d=new Date(valor||'');if(Number.isFinite(d.getTime()))return dataLocal(d);}return '';}
function dataDaTarefa(t){return dataDoRegistro(t);}
function historicoDaTarefa(h,t,p,n,data){return pertence(h,p,n)&&clean(h.tarefaId)===clean(t.id)&&(clean(h.data||h.dataExecucao).slice(0,10)===data);}
function historicoId(p,tarefaId,data){return p&&tarefaId&&data?`${p}_${tarefaId}_${data}`:'';}
function chaveOcorrencia(reg,p){const tarefaId=tarefaIdDoRegistro(reg),data=dataDoRegistro(reg);return historicoId(clean(reg?.perfilId)||clean(p),tarefaId,data);}
function faixaNormalizada(reg={}){const faixa=String(reg.faixaAtraso||'').trim();if(['dentro-limites','atraso-leve','atraso-maior','estourado'].includes(faixa))return faixa;const status=String(reg.status||'');if(/Atrasado|\(0%\)/i.test(status))return'estourado';if(/atraso\s+maior|50%/i.test(status))return'atraso-maior';if(/atraso\s+leve|pequeno\s+atraso|75%/i.test(status))return'atraso-leve';if(/No\s+Prazo/i.test(status))return'dentro-limites';return faixa;}
function percentualDaFaixa(faixa){return faixa==='dentro-limites'?100:faixa==='atraso-leve'?75:faixa==='atraso-maior'?50:0;}
function statusDaFaixa(faixa){return faixa==='dentro-limites'?'No Prazo (100%)':faixa==='atraso-leve'?'No Prazo — atraso leve (75%)':faixa==='atraso-maior'?'No Prazo — atraso maior (50%)':'Atrasado (0%)';}

function patchPontuacaoIntegral(reg={}){
  if(reg.revisaoStatus==='revisado'&&reg.revisaoDecisao)return null;
  const max=Math.max(0,Number(reg.pontosMaximos)||0),faixa=faixaNormalizada(reg);
  if(!max||!['dentro-limites','atraso-leve','atraso-maior'].includes(faixa))return null;
  const pct=percentualDaFaixa(faixa),status=statusDaFaixa(faixa),pontos=Math.round(max*(pct/100));
  const precisa=Number(reg.pontosGanhos)!==pontos||Number(reg.pontosOriginais)!==pontos||Number(reg.percentualAplicado)!==pct||String(reg.status||'')!==status||String(reg.faixaAtraso||'')!==faixa;
  if(!precisa&&Number(reg.pontuacaoRegraVersao||0)>=MIGRATION_VERSION)return null;
  return{pontosGanhos:pontos,pontosOriginais:pontos,percentualAplicado:pct,percentualOriginal:pct,faixaAtraso:faixa,status,pontuacaoRegraVersao:MIGRATION_VERSION,pontuacaoCorrecao:'percentual-da-meta',pontuacaoCorrigidaEm:new Date().toISOString()};
}
function normalizarObjetoLocal(reg={}){const patch=patchPontuacaoIntegral(reg);if(!patch)return reg;Object.assign(reg,patch);return reg;}
function payloadHistoricoBase(reg,data,tarefaId,origem){
  const h={grupoId:grupo(),perfilId:reg.perfilId||perfil(),perfilNome:reg.perfilNome||nome(),tarefaId,nomeTarefa:reg.nome||reg.nomeTarefa||'Tarefa',data,dataExecucao:data,status:reg.status||'',reconciliadoEm:new Date().toISOString(),reconciliadoPor:'CLIENTE',origemReconciliacao:origem};
  CAMPOS.forEach(c=>{if(reg[c]!==undefined)h[c]=reg[c];});
  if(h.pontosOriginais===undefined)h.pontosOriginais=Number(h.pontosGanhos)||0;
  if(h.percentualOriginal===undefined&&h.percentualAplicado!==undefined)h.percentualOriginal=h.percentualAplicado;
  if(!h.revisaoStatus)h.revisaoStatus=(clean(h.justificativaAtraso)||h.justificativaRecusada===true)?'aguardando':'sem-revisao';
  normalizarObjetoLocal(h);
  return h;
}
function payloadHistorico(t,data){return payloadHistoricoBase(t,data,clean(t.id),'tarefa-concluida-sem-historico');}
function payloadHistoricoExecucao(e,data){return payloadHistoricoBase(e,data,tarefaIdDoRegistro(e),'execucao-final-sem-historico');}
function avisar(qtd,pontos,tipo='recuperada'){document.getElementById('historyRepairToast')?.remove();const el=document.createElement('div');el.id='historyRepairToast';el.textContent=pontos>0?`✅ Pontuação ${tipo}: +${pontos} ponto${pontos===1?'':'s'}.`:`✅ ${qtd} registro${qtd===1?'':'s'} corrigido${qtd===1?'':'s'}.`;el.style.cssText='position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:32000;background:#166534;color:#fff;padding:12px 17px;border-radius:12px;font-weight:900;box-shadow:0 8px 26px rgba(0,0,0,.24);max-width:90vw;text-align:center';document.body.appendChild(el);setTimeout(()=>el.remove(),5000);}
async function executarOperacoes(banco,operacoes=[]){let feitas=0;for(let i=0;i<operacoes.length;i+=350){const lote=writeBatch(banco);operacoes.slice(i,i+350).forEach(op=>{if(op.set)lote.set(op.ref,op.patch,{merge:true});else lote.update(op.ref,op.patch);});await lote.commit();feitas+=Math.min(350,operacoes.length-i);}return feitas;}
function chaveMigracao(g,p,n){return`rotina_pontuacao_integral_v${MIGRATION_VERSION}_${g}_${p||n}`;}
function chaveAuditoriaHistorico(g,p){return`rotina_history_gap_audit_v${HISTORY_GAP_VERSION}_${g}_${p}_${dataLocal(new Date())}`;}
function consultaPropria(banco,colecao,g,p){return query(collection(banco,colecao),where('grupoId','==',g),where('perfilId','==',p));}
function snapshotCentral(g,p){const central=window.rotinaParticipantStore?.snapshot?.();if(central&&clean(central.grupoId).toUpperCase()===clean(g).toUpperCase()&&clean(central.perfilId)===clean(p)&&Array.isArray(central.historico))return central;return window.rotinaClientCacheSnapshot?.()||{};}

export async function reconciliarPontuacaoIntegral(forcar=false){if(navigator.onLine===false||!getApps().length)return{corrigidos:0,pontos:0};const g=grupo(),p=perfil(),n=nome();if(!g||!p)return{corrigidos:0,pontos:0};const chave=chaveMigracao(g,p,n);if(!forcar&&localStorage.getItem(chave)==='1')return{corrigidos:0,pontos:0};const banco=getFirestore(getApp()),[tarefasSnap,historicoSnap,execSnap]=await Promise.all([getDocs(consultaPropria(banco,'tarefas',g,p)),getDocs(consultaPropria(banco,'historico',g,p)),getDocs(consultaPropria(banco,'execucoes',g,p))]);const operacoes=[];let pontos=0,corrigidos=0;const adicionar=(snap,contarPontos=false)=>{snap.docs.forEach(d=>{const reg={id:d.id,...d.data()};if(!pertence(reg,p,n))return;const patch=patchPontuacaoIntegral(reg);if(!patch)return;if(contarPontos)pontos+=Math.max(0,(Number(patch.pontosGanhos)||0)-(Number(reg.pontosGanhos)||0));operacoes.push({ref:d.ref,patch});corrigidos++;});};adicionar(historicoSnap,true);adicionar(execSnap,false);adicionar(tarefasSnap,false);if(operacoes.length)await executarOperacoes(banco,operacoes);localStorage.setItem(chave,'1');log('pontuacao.integral_reconciliada',{grupoId:g,perfilId:p,corrigidos,pontosRecuperados:pontos,versao:MIGRATION_VERSION});if(pontos>0)avisar(corrigidos,pontos,'corrigida');window.dispatchEvent(new CustomEvent('rotina-family-points-updated'));return{corrigidos,pontos};}
function corrigirTarefaDepoisDoResultado(historico){return;}
function instalarHookHistoricoLocal(tentativa=0){if(hookInstalado)return true;const original=window.registrarHistoricoLocal;if(typeof original!=='function'){if(tentativa<120)setTimeout(()=>instalarHookHistoricoLocal(tentativa+1),50);return false;}const wrapped=function(id,historico){try{normalizarObjetoLocal(historico);}catch(e){log('pontuacao.normalizacao_local_erro',{mensagem:String(e?.message||e)},'warning');}const result=original.apply(this,arguments);try{corrigirTarefaDepoisDoResultado(historico);}catch{}return result;};wrapped.__rotinaPontuacaoIntegral=true;wrapped.__rotinaOriginal=original;window.registrarHistoricoLocal=wrapped;hookInstalado=true;log('pontuacao.hook_integral_pronto',{versao:MIGRATION_VERSION});return true;}

export async function reconciliarLacunasHistorico(forcar=false){
  if(executandoHistorico||navigator.onLine===false||!getApps().length)return{reparados:0,auditados:0,faltantes:0};
  if(!forcar&&Date.now()-ultimaExecucaoHistorico<GAP_MIN_INTERVAL_MS)return{reparados:0,auditados:0,faltantes:0};
  const g=grupo(),p=perfil(),n=nome();if(!g||!p)return{reparados:0,auditados:0,faltantes:0};
  const repository=window.rotinaFirebaseRepository;
  if(!repository?.commit||!repository?.readParticipantExecutions){log('historico.lacunas_adiadas',{motivo:'repository-indisponivel',versao:HISTORY_GAP_VERSION},'warning');return{reparados:0,auditados:0,faltantes:0};}
  executandoHistorico=true;
  try{
    const snapshot=snapshotCentral(g,p),tarefas=Array.isArray(snapshot.tarefasTodas)?snapshot.tarefasTodas:[],historicos=Array.isArray(snapshot.historico)?snapshot.historico:[];
    const conhecidas=new Set();
    for(const h of historicos){const id=clean(h.id)||chaveOcorrencia(h,p);if(id)conhecidas.add(id);const canonica=chaveOcorrencia(h,p);if(canonica)conhecidas.add(canonica);}
    const reparos=new Map(),hoje=dataLocal(new Date());
    for(const t of tarefas){
      if(!pertence(t,p,n)||!concluida(t)||dataDaTarefa(t)!==hoje)continue;
      const id=historicoId(p,clean(t.id),hoje);if(!id||conhecidas.has(id)||reparos.has(id))continue;
      reparos.set(id,payloadHistorico(t,hoje));
    }
    const auditKey=chaveAuditoriaHistorico(g,p),executarAuditoriaServidor=forcar||localStorage.getItem(auditKey)!=='1';
    let auditados=0,origemExecucoes='nao-necessaria';
    if(executarAuditoriaServidor){
      const bundle=await repository.readParticipantExecutions({grupoId:g,perfilId:p,source:'server'});
      const execucoes=Array.isArray(bundle?.items)?bundle.items:[];auditados=execucoes.length;origemExecucoes='repository-server';
      for(const e of execucoes){
        if(!pertence(e,p,n)||!concluida(e))continue;
        const tarefaId=tarefaIdDoRegistro(e),data=dataDoRegistro(e),id=historicoId(p,tarefaId,data);
        if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(data)||conhecidas.has(id)||reparos.has(id))continue;
        reparos.set(id,payloadHistoricoExecucao(e,data));
      }
      localStorage.setItem(auditKey,'1');
    }
    ultimaExecucaoHistorico=Date.now();
    const totalFaltantes=reparos.size,itens=[...reparos.entries()].slice(0,MAX_GAP_REPAIRS_PER_RUN);
    if(!itens.length){log('historico.lacunas_auditadas',{versao:HISTORY_GAP_VERSION,auditados,faltantes:0,reparados:0,origemExecucoes,storeHistorico:historicos.length,leituraDiretaFirebase:false});return{reparados:0,auditados,faltantes:0};}
    const operacoes=itens.map(([id,payload])=>({action:'set',collection:'historico',id,data:payload,merge:true}));
    await repository.commit(operacoes,'history-gap-repair');
    let pontos=0;
    for(const [id,payload] of itens){pontos+=Number(payload.pontosGanhos)||0;window.registrarHistoricoLocal?.(id,payload);conhecidas.add(id);}
    const reparados=itens.length;
    log('historico.lacunas_reconciliadas',{versao:HISTORY_GAP_VERSION,auditados,faltantes:totalFaltantes,reparados,origemExecucoes,storeHistorico:historicos.length,leituraDiretaFirebase:false});
    if(reparados)avisar(reparados,pontos,'recuperada');
    window.dispatchEvent(new CustomEvent('rotina-history-reconciled',{detail:{reparados,pontos,faltantes:totalFaltantes,auditados,versao:HISTORY_GAP_VERSION}}));
    return{reparados,auditados,faltantes:totalFaltantes};
  }catch(error){
    log('historico.lacunas_erro',{versao:HISTORY_GAP_VERSION,mensagem:String(error?.message||error).slice(0,120)},'error');
    return{reparados:0,auditados:0,faltantes:0,erro:String(error?.message||error)};
  }finally{executandoHistorico=false;}
}

export async function reconciliarHistoricoHoje(forcar=false){return reconciliarLacunasHistorico(forcar);}

function iniciar(tentativa=0){
  instalarHookHistoricoLocal();
  if(!getApps().length||!grupo()||!perfil()){if(tentativa<120)setTimeout(()=>iniciar(tentativa+1),100);return;}
  setTimeout(()=>reconciliarPontuacaoIntegral(false).catch(e=>console.warn('Reconciliação integral de pontos:',e)),12000);
  setTimeout(()=>reconciliarLacunasHistorico(false).catch(e=>console.warn('Reconciliação de lacunas de histórico:',e)),14000);
}
window.addEventListener('rotina-client-cache-updated',e=>{if(e.detail?.servidor===true)reconciliarLacunasHistorico(false).catch(err=>console.warn('Reconciliação após sync:',err));});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>iniciar(),{once:true});else iniciar();
