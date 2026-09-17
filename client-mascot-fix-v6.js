(()=>{
  'use strict';
  const VERSION=6;
  const CAT_SCALE=.85;
  const DOG_SAD_GAIN=1.35;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,mascoteFix:VERSION},nivel);}catch{}};

  function installStyle(){
    if(document.getElementById('rotinaMascotFixV6Style'))return;
    const style=document.createElement('style');
    style.id='rotinaMascotFixV6Style';
    style.textContent=`
      #rotinaMascotWrapV3.cat img{
        transform:scale(${CAT_SCALE})!important;
        transform-origin:50% 50%!important;
      }
    `;
    document.head.appendChild(style);
    log('mascote.gato_escala_v6_pronta',{escala:CAT_SCALE,reducaoPercentual:15,aplicaEm:['task','day','sad']});
  }

  const audioState={visible:false,catDayBuffer:null,catDayStarts:0,dogSadBoosts:0};

  function currentReaction(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    const wrap=document.getElementById('rotinaMascotWrapV3');
    const active=!!(layer?.classList.contains('show')&&wrap);
    if(!active)return {active:false,type:'',kind:''};
    return {
      active:true,
      type:wrap.classList.contains('cat')?'cat':'dog',
      kind:wrap.classList.contains('sad')?'sad':wrap.classList.contains('day')?'day':'task'
    };
  }

  function syncReactionState(){
    const r=currentReaction();
    if(r.active&&!audioState.visible){
      audioState.catDayBuffer=null;
      audioState.catDayStarts=0;
      audioState.dogSadBoosts=0;
    }
    if(!r.active&&audioState.visible){
      audioState.catDayBuffer=null;
      audioState.catDayStarts=0;
      audioState.dogSadBoosts=0;
    }
    audioState.visible=r.active;
    return r;
  }

  function attachLayerObserver(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    if(!layer)return false;
    if(layer.dataset.mascotFixV6Observed==='1')return true;
    layer.dataset.mascotFixV6Observed='1';
    new MutationObserver(syncReactionState).observe(layer,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    syncReactionState();
    return true;
  }

  function patchWebAudio(){
    const Source=window.AudioBufferSourceNode;
    if(!Source?.prototype)return false;
    if(Source.prototype.__rotinaMascotFixV6)return true;

    const originalStart=Source.prototype.start;
    const originalConnect=Source.prototype.connect;

    Source.prototype.connect=function(destination,...args){
      const r=syncReactionState();
      if(r.active&&r.type==='dog'&&r.kind==='sad'&&destination?.gain){
        try{
          destination.gain.value=DOG_SAD_GAIN;
          audioState.dogSadBoosts++;
          if(audioState.dogSadBoosts===1)log('mascote.cachorro_triste_audio_reforcado_v6',{gain:DOG_SAD_GAIN});
        }catch{}
      }
      return originalConnect.call(this,destination,...args);
    };

    Source.prototype.start=function(...args){
      const r=syncReactionState();
      if(r.active&&r.type==='cat'&&r.kind==='day'&&this.buffer){
        if(!audioState.catDayBuffer)audioState.catDayBuffer=this.buffer;
        if(this.buffer===audioState.catDayBuffer){
          audioState.catDayStarts++;
          if(audioState.catDayStarts>1){
            log('mascote.gato_miado_extra_bloqueado_v6',{reacao:'day',reproducaoBloqueada:audioState.catDayStarts,duracao:Number(this.buffer.duration?.toFixed?.(3)||0)});
            return;
          }
        }
      }
      return originalStart.apply(this,args);
    };

    try{Object.defineProperty(Source.prototype,'__rotinaMascotFixV6',{value:true,configurable:true});}catch{Source.prototype.__rotinaMascotFixV6=true;}
    log('mascote.audio_patch_v6_pronto',{catDayRepeticoesMax:1,dogSadGain:DOG_SAD_GAIN});
    return true;
  }

  function boot(){
    installStyle();
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const layerOk=attachLayerObserver();
      const audioOk=patchWebAudio();
      if((layerOk&&audioOk)||tries>120)clearInterval(timer);
    },100);
    log('mascote.fix_v6_pronto',{versao:VERSION,catScale:CAT_SCALE,dogSadGain:DOG_SAD_GAIN});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();