(()=>{
  'use strict';
  const V=3;
  const log=(e,d={},level='info')=>{try{window.rotinaLog?.(e,{...d,monitorExtra:V},level);}catch{}};
  const safe=(v,n=120)=>String(v??'').replace(/\s+/g,' ').slice(0,n);
  const shown=el=>!!el&&(el.classList.contains('show')||getComputedStyle(el).display!=='none');
  const rect=(el,p='el')=>{
    if(!el)return {};
    const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    return {[`${p}X`]:Math.round(r.x),[`${p}Y`]:Math.round(r.y),[`${p}W`]:Math.round(r.width),[`${p}H`]:Math.round(r.height),[`${p}Right`]:Math.round(r.right),[`${p}Bottom`]:Math.round(r.bottom),[`${p}Cortado`]:r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight,[`${p}Display`]:cs.display,[`${p}Visibility`]:cs.visibility,[`${p}Opacity`]:cs.opacity,[`${p}Overflow`]:cs.overflow,[`${p}Transform`]:safe(cs.transform,140)};
  };
  function mascotSnapshot(origem){
    const layer=document.getElementById('rotinaMascotLayerV3')||document.getElementById('rotinaCat3dLayerV2')||document.getElementById('rotinaDogCelebrationLayer');
    const wrap=document.getElementById('rotinaMascotWrapV3')||document.getElementById('rotinaCat3dWrapV2')||document.getElementById('rotinaDogCelebrationWrap');
    const catImg=document.getElementById('rotinaCatImgV3')||document.getElementById('rotinaCat3dImgV2');
    const dogPreviewLayer=document.getElementById('rotinaDogPreviewV2');
    const dogPreviewWrap=document.getElementById('rotinaDogPreviewWrapV2');
    const active=document.querySelector('.tab-content.active,[data-tab].active,.aba.active');
    const d={origem,viewportW:innerWidth,viewportH:innerHeight,dpr:Number(devicePixelRatio||1).toFixed(2),scrollY:Math.round(scrollY),orientation:screen?.orientation?.type||'',aba:active?.id||active?.dataset?.tab||'',mascote:document.body?.dataset?.rotinaMascote||'',layerShow:shown(layer),dogPreviewShow:shown(dogPreviewLayer),gatoNaturalW:catImg?.naturalWidth||0,gatoNaturalH:catImg?.naturalHeight||0,gatoComplete:catImg?.complete??false,...rect(layer,'mascoteLayer'),...rect(wrap,'mascoteWrap'),...rect(catImg,'gatoImg'),...rect(dogPreviewLayer,'dogPreviewLayer'),...rect(dogPreviewWrap,'dogPreviewWrap')};
    const warning=d.mascoteWrapCortado||d.gatoImgCortado||d.dogPreviewWrapCortado;
    log('mascote.visual_snapshot',d,warning?'warning':'info');
  }
  function analyzeAlpha(img){
    if(!img?.naturalWidth||!img?.naturalHeight)return;
    try{
      const max=260,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
      const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);const data=x.getImageData(0,0,w,h).data;let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){if(data[(yy*w+xx)*4+3]>24){count++;if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(yy<minY)minY=yy;if(yy>maxY)maxY=yy;}}
      if(!count){log('imagem_extra.alpha_vazio',{id:img.id||'',w,h},'warning');return;}
      const margin=2,touch={top:minY<=margin,left:minX<=margin,right:maxX>=w-1-margin,bottom:maxY>=h-1-margin};
      const detalhes={id:img.id||'',naturalW:img.naturalWidth,naturalH:img.naturalHeight,alphaX:minX,alphaY:minY,alphaW:maxX-minX+1,alphaH:maxY-minY+1,...touch};
      log('imagem_extra.alpha_bbox',detalhes,Object.values(touch).some(Boolean)?'warning':'info');
      if(Object.values(touch).some(Boolean))log('imagem_extra.possivel_recorte',detalhes,'warning');
    }catch(err){log('imagem_extra.alpha_erro',{id:img.id||'',mensagem:String(err?.message||err)},'warning');}
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');if(!el)return;
    const action=el.dataset?.act||el.dataset?.preview||el.dataset?.choose||el.dataset?.action||el.dataset?.nav||el.id||el.getAttribute('aria-label')||el.tagName.toLowerCase();
    log('ui.acao_detalhada',{acao:safe(action,80),texto:safe(el.textContent,80),dataAct:el.dataset?.act||'',dataPreview:el.dataset?.preview||'',dataChoose:el.dataset?.choose||'',dataNav:el.dataset?.nav||''});
    setTimeout(()=>mascotSnapshot('apos_acao_120ms'),120);setTimeout(()=>mascotSnapshot('apos_acao_600ms'),600);
  },true);
  for(const ev of ['animationstart','animationend','animationcancel'])document.addEventListener(ev,e=>{
    const el=e.target;if(!(el instanceof Element))return;const id=el.id||'',cl=safe(el.className,100);if(!/rotina|mascot|cat|gato|dog|cachorro|rm3/i.test(`${id} ${cl} ${e.animationName||''}`))return;log(`animacao.${ev}`,{nome:e.animationName||'',alvo:id||cl,elapsed:Number(e.elapsedTime||0).toFixed(3),...rect(el,'alvo')});mascotSnapshot(ev);
  },true);
  for(const ev of ['loadstart','loadedmetadata','canplay','playing','waiting','stalled','pause','ended','abort','error'])document.addEventListener(ev,e=>{
    const m=e.target;if(!(m instanceof HTMLMediaElement))return;const src=String(m.currentSrc||m.src||'');const name=src.includes('latido-cachorro')?'cachorro_comemoracao':src.includes('cachorro-triste')?'cachorro_triste':src.startsWith('data:audio/')?'audio_embutido':safe(src.split('/').pop()?.split('?')[0]||m.tagName.toLowerCase(),80);log(`midia_extra.${ev}`,{midia:name,currentTime:Number(m.currentTime||0).toFixed(2),duration:Number.isFinite(m.duration)?Number(m.duration).toFixed(2):0,readyState:m.readyState,networkState:m.networkState,volume:Number(m.volume||0).toFixed(2),muted:!!m.muted},(ev==='error'||ev==='stalled')?'warning':'info');
  },true);
  document.addEventListener('load',e=>{
    const img=e.target;if(!(img instanceof HTMLImageElement))return;if(!/gato|cat|cachorro|dog|rotina/i.test(`${img.id} ${img.alt}`))return;log('imagem_extra.carregada',{id:img.id||'',alt:safe(img.alt,80),naturalW:img.naturalWidth,naturalH:img.naturalHeight,...rect(img,'img')});analyzeAlpha(img);mascotSnapshot('imagem_carregada');
  },true);
  document.addEventListener('error',e=>{const img=e.target;if(img instanceof HTMLImageElement)log('imagem_extra.falhou',{id:img.id||'',alt:safe(img.alt,80)},'error');},true);
  ['rotina-client-session-ready','rotina-family-tasks-rendered','rotina-family-points-updated','rotina-task-zero','rotina-mascote-alterado'].forEach(ev=>window.addEventListener(ev,e=>{log(`evento_extra.${ev}`,e.detail||{});setTimeout(()=>mascotSnapshot(`evento_${ev}`),100);}));
  window.addEventListener('resize',()=>mascotSnapshot('resize'));window.addEventListener('orientationchange',()=>setTimeout(()=>mascotSnapshot('orientationchange'),250));document.addEventListener('visibilitychange',()=>mascotSnapshot(`visibility_${document.visibilityState}`));
  let lastVisible=false;setInterval(()=>{const visible=shown(document.getElementById('rotinaMascotLayerV3'))||shown(document.getElementById('rotinaDogPreviewV2'))||shown(document.getElementById('rotinaCat3dLayerV2'))||shown(document.getElementById('rotinaDogCelebrationLayer'));if(visible||lastVisible)mascotSnapshot(visible?'durante_reacao':'apos_reacao');lastVisible=visible;},500);
  log('monitor.extra_pronto',{versao:V,mascoteV3:true,alphaBBox:true});setTimeout(()=>mascotSnapshot('boot_extra'),250);
})();