const DOG_SAD_URL='./cachorro-triste-choramingo.mp3?v=1';
const SAD_GAP_SECONDS=0.16;
const SAD_REPEATS=3;

let audioContext=null;
let sadBuffer=null;
let sadLoading=null;
let playingUntil=0;

function log(evento,detalhes={},nivel='info'){
  try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}
}

function getAudioContext(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!audioContext)audioContext=new AC();
  return audioContext;
}

async function loadSad(){
  if(sadBuffer)return sadBuffer;
  if(sadLoading)return sadLoading;
  sadLoading=(async()=>{
    const ctx=getAudioContext();
    if(!ctx)throw new Error('Web Audio indisponível neste navegador');
    const response=await fetch(DOG_SAD_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`Falha ao carregar choramingo (HTTP ${response.status})`);
    const bytes=await response.arrayBuffer();
    sadBuffer=await ctx.decodeAudioData(bytes.slice(0));
    log('cachorro.triste_buffer_pronto',{duracao:Number(sadBuffer.duration.toFixed(3)),estadoAudio:ctx.state});
    return sadBuffer;
  })().catch(error=>{
    sadLoading=null;
    log('cachorro.triste_carga_erro',{mensagem:String(error?.message||error)},'error');
    throw error;
  });
  return sadLoading;
}

function unlockAudio(){
  try{
    const ctx=getAudioContext();
    if(!ctx)return;
    if(ctx.state==='suspended')ctx.resume().catch(error=>log('cachorro.triste_resume_erro',{mensagem:String(error?.message||error)},'warning'));
    loadSad().catch(()=>{});
  }catch(error){
    log('cachorro.triste_unlock_erro',{mensagem:String(error?.message||error)},'warning');
  }
}

function selectedMascot(){
  try{return window.obterMascoteRotina?.()||'dog';}catch{return 'dog';}
}

function playAt(when){
  const source=audioContext.createBufferSource();
  const gain=audioContext.createGain();
  source.buffer=sadBuffer;
  gain.gain.value=1;
  source.connect(gain).connect(audioContext.destination);
  source.start(when);
}

async function playSadTriple(taskId=''){
  if(selectedMascot()!=='dog'){
    log('cachorro.triste_ignorado_mascote_gato',{tarefaId:String(taskId||'')});
    return false;
  }
  try{
    const ctx=getAudioContext();
    if(!ctx)throw new Error('Web Audio indisponível');
    const buffer=await loadSad();
    if(ctx.state==='suspended')await ctx.resume();
    if(ctx.state!=='running')throw new Error(`Contexto de áudio em estado ${ctx.state}`);
    const now=ctx.currentTime;
    if(now<playingUntil)return true;
    const start=now+0.04;
    const step=buffer.duration+SAD_GAP_SECONDS;
    for(let i=0;i<SAD_REPEATS;i++)playAt(start+(step*i));
    playingUntil=start+(step*SAD_REPEATS);
    log('cachorro.triste_triplo_tocado',{tarefaId:String(taskId||''),repeticoes:SAD_REPEATS,intervaloMs:160,duracao:Number(buffer.duration.toFixed(3))});
    return true;
  }catch(error){
    log('cachorro.triste_reproducao_erro',{tarefaId:String(taskId||''),mensagem:String(error?.message||error),estadoAudio:audioContext?.state||'sem-contexto'},'error');
    return false;
  }
}

for(const eventName of ['pointerdown','touchstart','click']){
  document.addEventListener(eventName,unlockAudio,{passive:true,capture:true});
}

window.addEventListener('rotina-task-zero',event=>playSadTriple(event.detail?.tarefaId||''));
window.tocarCachorroTristeRotina=playSadTriple;

log('cachorro.modulo_triste_pronto',{versao:1,repeticoes:SAD_REPEATS});
