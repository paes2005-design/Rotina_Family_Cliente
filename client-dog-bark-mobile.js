const DOG_BARK_URL='./latido-cachorro-comemoracao.mp3?v=5';
const GAP_SECONDS=0.08;

let audioContext=null;
let barkBuffer=null;
let barkLoading=null;
let baselineReady=false;
const taskStates=new Map();

function log(evento,detalhes={},nivel='info'){
  try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}
}

function getAudioContext(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!audioContext)audioContext=new AC();
  return audioContext;
}

async function loadBark(){
  if(barkBuffer)return barkBuffer;
  if(barkLoading)return barkLoading;
  barkLoading=(async()=>{
    const ctx=getAudioContext();
    if(!ctx)throw new Error('Web Audio indisponível neste navegador');
    const response=await fetch(DOG_BARK_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`Falha ao carregar latido (HTTP ${response.status})`);
    const bytes=await response.arrayBuffer();
    barkBuffer=await ctx.decodeAudioData(bytes.slice(0));
    log('cachorro.latido_buffer_pronto',{duracao:Number(barkBuffer.duration.toFixed(3)),estadoAudio:ctx.state});
    return barkBuffer;
  })().catch(error=>{
    barkLoading=null;
    log('cachorro.latido_carga_erro',{mensagem:String(error?.message||error)},'error');
    throw error;
  });
  return barkLoading;
}

function unlockAudio(){
  try{
    const ctx=getAudioContext();
    if(!ctx)return;
    if(ctx.state==='suspended')ctx.resume().catch(error=>log('cachorro.audio_resume_erro',{mensagem:String(error?.message||error)},'warning'));
    loadBark().catch(()=>{});
  }catch(error){
    log('cachorro.audio_unlock_erro',{mensagem:String(error?.message||error)},'warning');
  }
}

function playAt(when){
  const source=audioContext.createBufferSource();
  const gain=audioContext.createGain();
  source.buffer=barkBuffer;
  gain.gain.value=1;
  source.connect(gain).connect(audioContext.destination);
  source.start(when);
}

async function playDoubleBark(taskId=''){
  try{
    const ctx=getAudioContext();
    if(!ctx)throw new Error('Web Audio indisponível');
    const buffer=await loadBark();
    if(ctx.state==='suspended')await ctx.resume();
    if(ctx.state!=='running')throw new Error(`Contexto de áudio em estado ${ctx.state}`);
    const start=ctx.currentTime+0.05;
    playAt(start);
    playAt(start+buffer.duration+GAP_SECONDS);
    log('cachorro.latido_duplo_tocado',{tarefaId:String(taskId||''),duracao:Number(buffer.duration.toFixed(3)),intervaloMs:80,estadoAudio:ctx.state});
    return true;
  }catch(error){
    log('cachorro.latido_reproducao_erro',{tarefaId:String(taskId||''),mensagem:String(error?.message||error),estadoAudio:audioContext?.state||'sem-contexto'},'error');
    return false;
  }
}

function selectedMascot(){
  try{return window.obterMascoteRotina?.()||'dog';}catch{return 'dog';}
}

function ensureTestButton(){
  if(document.getElementById('testeLatidoCachorroApp'))return;
  const chooser=document.getElementById('rotinaMascoteChooser');
  const app=document.getElementById('telaApp');
  if(!app)return;
  const button=document.createElement('button');
  button.id='testeLatidoCachorroApp';
  button.type='button';
  button.textContent='🔊 Testar latido';
  button.style.cssText='display:block;margin:0 auto 12px;border:1px solid #ff4d6d;background:#fff;color:#ff4d6d;border-radius:999px;padding:7px 12px;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer';
  button.addEventListener('click',async()=>{
    unlockAudio();
    button.disabled=true;
    const ok=await playDoubleBark('botao-teste-app');
    button.textContent=ok?'✅ Latido tocado':'⚠️ Falhou — ver logs';
    setTimeout(()=>{button.disabled=false;button.textContent='🔊 Testar latido';},1800);
  });
  if(chooser)chooser.after(button);
  else{
    const anchor=app.querySelector('.dash-cards');
    if(anchor)anchor.before(button);else app.prepend(button);
  }
}

function scanTaskTransitions(){
  ensureTestButton();
  const current=new Map();
  document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]').forEach(row=>{
    const id=String(row.dataset.familyTaskId||'').trim();
    const status=String(row.dataset.familyTaskStatus||'').trim();
    if(id)current.set(id,status);
  });

  if(baselineReady){
    current.forEach((status,id)=>{
      const previous=taskStates.get(id);
      if(previous&&previous!==status&&/No Prazo\s*\(100%\)/i.test(status)){
        if(selectedMascot()==='dog')playDoubleBark(id);
        else log('cachorro.latido_ignorado_mascote_gato',{tarefaId:id});
      }
    });
  }

  taskStates.clear();
  current.forEach((status,id)=>taskStates.set(id,status));
  baselineReady=true;
}

function resetBaseline(){
  taskStates.clear();
  baselineReady=false;
  setTimeout(()=>{ensureTestButton();scanTaskTransitions();},0);
}

for(const eventName of ['pointerdown','touchstart','click']){
  document.addEventListener(eventName,unlockAudio,{passive:true,capture:true});
}

window.addEventListener('rotina-family-tasks-rendered',scanTaskTransitions);
window.addEventListener('rotina-client-session-ready',resetBaseline);
window.testarLatidoCachorroNoApp=()=>playDoubleBark('teste-manual-app');

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureTestButton();scanTaskTransitions();},{once:true});
else{ensureTestButton();scanTaskTransitions();}

log('cachorro.modulo_latido_mobile_pronto',{versao:2});
