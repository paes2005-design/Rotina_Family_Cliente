const DOG_SAD_URL='./cachorro-triste-choramingo.mp3?v=2';
const SAD_CHORAMINGOS=3;

let audioContext=null;
let sadUnitBuffer=null;
let sadCombinedBuffer=null;
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

function combineThree(buffer,ctx){
  const totalFrames=buffer.length*SAD_CHORAMINGOS;
  const combined=ctx.createBuffer(buffer.numberOfChannels,totalFrames,buffer.sampleRate);
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
    const source=buffer.getChannelData(channel);
    const target=combined.getChannelData(channel);
    for(let i=0;i<SAD_CHORAMINGOS;i++)target.set(source,i*buffer.length);
  }
  return combined;
}

async function loadSad(){
  if(sadCombinedBuffer)return sadCombinedBuffer;
  if(sadLoading)return sadLoading;
  sadLoading=(async()=>{
    const ctx=getAudioContext();
    if(!ctx)throw new Error('Web Audio indisponível neste navegador');
    const response=await fetch(DOG_SAD_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`Falha ao carregar choramingo (HTTP ${response.status})`);
    const bytes=await response.arrayBuffer();
    sadUnitBuffer=await ctx.decodeAudioData(bytes.slice(0));
    sadCombinedBuffer=combineThree(sadUnitBuffer,ctx);
    log('cachorro.triste_buffer_pronto',{
      duracaoUnitaria:Number(sadUnitBuffer.duration.toFixed(3)),
      duracaoTotal:Number(sadCombinedBuffer.duration.toFixed(3)),
      choramingos:SAD_CHORAMINGOS,
      audioUnico:true,
      estadoAudio:ctx.state,
      versao:6
    });
    return sadCombinedBuffer;
  })().catch(error=>{
    sadLoading=null;
    log('cachorro.triste_carga_erro',{mensagem:String(error?.message||error),versao:6},'error');
    throw error;
  });
  return sadLoading;
}

function unlockAudio(){
  try{
    const ctx=getAudioContext();
    if(!ctx)return;
    if(ctx.state==='suspended')ctx.resume().catch(error=>log('cachorro.triste_resume_erro',{mensagem:String(error?.message||error),versao:6},'warning'));
    loadSad().catch(()=>{});
  }catch(error){
    log('cachorro.triste_unlock_erro',{mensagem:String(error?.message||error),versao:6},'warning');
  }
}

function selectedMascot(){
  try{return window.obterMascoteRotina?.()||'dog';}catch{return 'dog';}
}

async function playSadTriple(taskId=''){
  if(selectedMascot()!=='dog'){
    log('cachorro.triste_ignorado_mascote_gato',{tarefaId:String(taskId||''),versao:6});
    return false;
  }
  try{
    const ctx=getAudioContext();
    if(!ctx)throw new Error('Web Audio indisponível');
    const buffer=await loadSad();
    if(ctx.state==='suspended')await ctx.resume();
    if(ctx.state!=='running')throw new Error(`Contexto de áudio em estado ${ctx.state}`);
    const now=ctx.currentTime;
    if(now<playingUntil){
      log('cachorro.triste_duplicado_ignorado',{tarefaId:String(taskId||''),versao:6});
      return true;
    }
    const source=ctx.createBufferSource();
    const gain=ctx.createGain();
    source.buffer=buffer;
    gain.gain.value=1;
    source.connect(gain).connect(ctx.destination);
    const start=now+0.04;
    source.start(start);
    playingUntil=start+buffer.duration;
    log('cachorro.triste_audio_unico_tocado',{
      tarefaId:String(taskId||''),
      choramingos:SAD_CHORAMINGOS,
      intervaloMs:0,
      duracao:Number(buffer.duration.toFixed(3)),
      audioUnico:true,
      aposJustificativa:true,
      versao:6
    });
    return true;
  }catch(error){
    log('cachorro.triste_reproducao_erro',{tarefaId:String(taskId||''),mensagem:String(error?.message||error),estadoAudio:audioContext?.state||'sem-contexto',versao:6},'error');
    return false;
  }
}

for(const eventName of ['pointerdown','touchstart','click']){
  document.addEventListener(eventName,unlockAudio,{passive:true,capture:true});
}

window.addEventListener('rotina-task-zero',event=>{
  if(event.detail?.audioHandled===true)return;
  playSadTriple(event.detail?.tarefaId||'');
});
window.tocarCachorroTristeRotina=playSadTriple;

log('cachorro.modulo_triste_pronto',{versao:6,choramingos:SAD_CHORAMINGOS,audioUnico:true,disparo:'apos-justificativa'});
