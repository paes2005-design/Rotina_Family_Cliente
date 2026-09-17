const HISTORY_GAP_VERSION=2;
const GAP_MIN_INTERVAL_MS=5*60*1000;
const MAX_GAP_REPAIRS_PER_RUN=100;
let running=false,lastRunAt=0;

const clean=v=>String(v??'').trim();
const pad=n=>String(n).padStart(2,'0');
const localDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const grupo=()=>clean(localStorage.getItem('cliente_grupo')).toUpperCase();
const perfil=()=>clean(localStorage.getItem('cliente_perfil_id'));
const nome=()=>clean(localStorage.getItem('cliente_nome'));
const log=(event,details={},level='info')=>{try{window.rotinaLog?.(event,{...details,versao:HISTORY_GAP_VERSION},level);}catch{}};
const finalState=reg=>/Prazo|Atrasado/i.test(clean(reg?.status));
const belongs=(reg,p,n)=>reg?.perfilId?clean(reg.perfilId)===p:clean(reg?.perfilNome)===n;

function taskId(reg={}){
  const direct=clean(reg.tarefaId);if(direct)return direct;
  const parts=clean(reg.id).split('__');return parts.length>1?clean(parts.slice(1).join('__')):'';
}
function recordDate(reg={}){
  for(const value of [reg.data,reg.dataExecucao]){const s=clean(value).slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;}
  const fromId=clean(reg.id).split('__')[0];if(/^\d{4}-\d{2}-\d{2}$/.test(fromId))return fromId;
  for(const value of [reg.terminoExecutadoEm,reg.inicioExecutadoEm]){const d=new Date(value||'');if(Number.isFinite(d.getTime()))return localDate(d);}
  return '';
}
const historyId=(p,t,d)=>p&&t&&d?`${p}_${t}_${d}`:'';
const canonical=(reg,p)=>historyId(clean(reg?.perfilId)||p,taskId(reg),recordDate(reg));
const auditKey=(g,p)=>`rotina_history_gap_audit_v${HISTORY_GAP_VERSION}_${g}_${p}_${localDate(new Date())}`;

function addKnown(set,items,p){for(const item of items||[]){const direct=clean(item?.id);if(direct)set.add(direct);const key=canonical(item,p);if(key)set.add(key);}}
function snapshot(g,p){const s=window.rotinaParticipantStore?.snapshot?.()||{};return clean(s.grupoId).toUpperCase()===g&&clean(s.perfilId)===p?s:{};}
function payload(reg,g,p,n,data,tarefaIdValue,origin){const copy={...(reg||{})};delete copy.id;return{...copy,grupoId:g,perfilId:clean(reg?.perfilId)||p,perfilNome:clean(reg?.perfilNome)||n,tarefaId:tarefaIdValue,nomeTarefa:reg?.nomeTarefa||reg?.nome||'Tarefa',data,dataExecucao:data,status:clean(reg?.status),reconciliadoEm:new Date().toISOString(),reconciliadoPor:'CLIENTE',origemReconciliacao:origin};}

export async function reconciliarPontuacaoIntegral(){return{corrigidos:0,pontos:0};}

export async function reconciliarLacunasHistorico(forcar=false){
  if(running||navigator.onLine===false)return{reparados:0,auditados:0,faltantes:0};
  if(!forcar&&Date.now()-lastRunAt<GAP_MIN_INTERVAL_MS)return{reparados:0,auditados:0,faltantes:0};
  const g=grupo(),p=perfil(),n=nome();if(!g||!p)return{reparados:0,auditados:0,faltantes:0};
  const repo=window.rotinaFirebaseRepository;
  if(!repo?.commit||!repo?.readParticipantExecutions||!repo?.readParticipantHistory){log('historico.lacunas_adiadas',{motivo:'repository-indisponivel'},'warning');return{reparados:0,auditados:0,faltantes:0};}
  const key=auditKey(g,p),serverAudit=forcar||localStorage.getItem(key)!=='1';running=true;
  try{
    const s=snapshot(g,p),tasks=Array.isArray(s.tarefasTodas)?s.tarefasTodas:[],storeHistory=Array.isArray(s.historico)?s.historico:[],known=new Set();addKnown(known,storeHistory,p);
    let executions=[],serverHistory=[];
    if(serverAudit){
      const [e,h]=await Promise.all([repo.readParticipantExecutions({grupoId:g,perfilId:p,source:'server'}),repo.readParticipantHistory({grupoId:g,perfilId:p,source:'server'})]);
      executions=Array.isArray(e?.items)?e.items:[];serverHistory=Array.isArray(h?.items)?h.items:[];addKnown(known,serverHistory,p);
    }
    const repairs=new Map(),today=localDate(new Date());
    for(const t of tasks){if(!belongs(t,p,n)||!finalState(t)||recordDate(t)!==today)continue;const id=historyId(p,clean(t.id),today);if(id&&!known.has(id))repairs.set(id,payload(t,g,p,n,today,clean(t.id),'tarefa-final-sem-historico'));}
    for(const e of executions){if(!belongs(e,p,n)||!finalState(e))continue;const tid=taskId(e),data=recordDate(e),id=historyId(p,tid,data);if(id&&/^\d{4}-\d{2}-\d{2}$/.test(data)&&!known.has(id)&&!repairs.has(id))repairs.set(id,payload(e,g,p,n,data,tid,'execucao-final-sem-historico'));}
    lastRunAt=Date.now();const total=repairs.size,selected=[...repairs.entries()].slice(0,MAX_GAP_REPAIRS_PER_RUN);
    if(!selected.length){if(serverAudit)localStorage.setItem(key,'1');log('historico.lacunas_auditadas',{auditados:executions.length,faltantes:0,reparados:0,origemExecucoes:serverAudit?'repository-server':'nao-necessaria',origemHistorico:serverAudit?'repository-server':'store-central',historicosServidor:serverHistory.length,storeHistorico:storeHistory.length,leituraDiretaFirebase:false});return{reparados:0,auditados:executions.length,faltantes:0};}
    await repo.commit(selected.map(([id,data])=>({action:'set',collection:'historico',id,data})),'history-gap-repair-v2');
    if(serverAudit&&total<=MAX_GAP_REPAIRS_PER_RUN)localStorage.setItem(key,'1');
    let pontos=0;for(const [id,data] of selected){pontos+=Number(data.pontosGanhos)||0;try{window.registrarHistoricoLocal?.(id,data);}catch{}}
    log('historico.lacunas_reconciliadas',{auditados:executions.length,faltantes:total,reparados:selected.length,origemExecucoes:serverAudit?'repository-server':'nao-necessaria',origemHistorico:serverAudit?'repository-server':'store-central',historicosServidor:serverHistory.length,storeHistorico:storeHistory.length,leituraDiretaFirebase:false});
    window.dispatchEvent(new CustomEvent('rotina-history-reconciled',{detail:{reparados:selected.length,pontos,faltantes:total,auditados:executions.length,versao:HISTORY_GAP_VERSION}}));
    return{reparados:selected.length,auditados:executions.length,faltantes:total};
  }catch(error){log('historico.lacunas_erro',{mensagem:String(error?.message||error).slice(0,160)},'error');return{reparados:0,auditados:0,faltantes:0,erro:String(error?.message||error)};}finally{running=false;}
}
export async function reconciliarHistoricoHoje(forcar=false){return reconciliarLacunasHistorico(forcar);}

function start(attempt=0){if(!grupo()||!perfil()||!window.rotinaFirebaseRepository){if(attempt<120)setTimeout(()=>start(attempt+1),100);return;}setTimeout(()=>reconciliarLacunasHistorico(false),14000);}
window.addEventListener('rotina-client-cache-updated',e=>{if(e.detail?.servidor===true)reconciliarLacunasHistorico(false);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start(),{once:true});else start();
