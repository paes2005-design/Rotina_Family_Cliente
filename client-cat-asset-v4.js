(()=>{
  'use strict';
  const VERSION=6;
  const cache={};
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,catAssetFix:VERSION},nivel);}catch{}};

  async function readBase64(url,label){
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status} imagem ${label}`);
    return (await r.text()).replace(/\s+/g,'');
  }

  async function source(kind){
    const k=kind==='sad'?'sad':'happy';
    if(cache[k])return cache[k];

    let raw='';
    let visual='2d';
    if(k==='sad'){
      try{
        const [p1,p2]=await Promise.all([
          readBase64('./cat-sad-2d-part1.b64?v=6','sad-2d-parte1'),
          readBase64('./cat-sad-2d-part2.b64?v=6','sad-2d-parte2')
        ]);
        raw=p1+p2;
        visual='2d-aprovado-novo';
      }catch(error){
        log('mascote.gato_triste_2d_partes_erro',{mensagem:String(error?.message||error)},'error');
        raw=await readBase64('./cat-sad-tiny.webp.b64?v=6','sad-fallback');
        visual='2d-fallback';
      }
    }else{
      raw=await readBase64('./cat-happy-tiny.webp.b64?v=6','happy');
    }

    if(!raw||raw.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new Error(`Base64 ${k} inválido (${raw.length})`);
    atob(raw);
    const src=`data:image/webp;base64,${raw}`;
    const dims=await new Promise((resolve,reject)=>{
      const p=new Image();
      p.onload=()=>resolve({w:p.naturalWidth,h:p.naturalHeight});
      p.onerror=()=>reject(new Error(`WebP ${k} não decodificou`));
      p.src=src;
    });
    if(dims.w<100||dims.h<100)throw new Error(`Imagem ${k} pequena: ${dims.w}x${dims.h}`);
    cache[k]=src;
    log('mascote.gato_asset_v6_pronto',{tipo:k,naturalW:dims.w,naturalH:dims.h,base64Length:raw.length,visual});
    return src;
  }

  let repairing=false;
  async function repair(){
    if(repairing)return;
    const layer=document.getElementById('rotinaMascotLayerV3');
    const wrap=document.getElementById('rotinaMascotWrapV3');
    if(!layer?.classList.contains('show')||!wrap?.classList.contains('cat'))return;
    const img=wrap.querySelector('#rotinaCatImgV3,img');
    if(!img)return;
    const kind=wrap.classList.contains('sad')?'sad':'happy';
    repairing=true;
    try{
      const src=await source(kind);
      if(img.src!==src)img.src=src;
      try{await img.decode?.();}catch{}
      if(!img.naturalWidth)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
      log('mascote.gato_asset_v6_aplicado',{tipo:kind,naturalW:img.naturalWidth,naturalH:img.naturalHeight,reacao:wrap.classList.contains('day')?'day':wrap.classList.contains('sad')?'sad':'task'});
    }catch(error){
      log('mascote.gato_asset_v6_erro',{tipo:kind,mensagem:String(error?.message||error)},'error');
    }finally{
      repairing=false;
    }
  }

  function attach(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    if(!layer)return false;
    if(layer.dataset.catAssetV6Observed==='1')return true;
    layer.dataset.catAssetV6Observed='1';
    new MutationObserver(()=>queueMicrotask(repair)).observe(layer,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    repair();
    return true;
  }

  function boot(){
    Promise.allSettled([source('happy'),source('sad')]);
    let tries=0;
    const timer=setInterval(()=>{tries++;if(attach()||tries>120)clearInterval(timer);},100);
    log('mascote.gato_asset_v6_fix_pronto',{versao:VERSION,visualFeliz:'2d',visualTriste:'2d-aprovado-novo'});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();