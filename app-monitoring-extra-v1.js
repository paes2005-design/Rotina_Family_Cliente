(()=>{
  const V=2;
  const log=(e,d={},level='info')=>{try{window.rotinaLog?.(e,{...d,monitorExtra:V},level);}catch{}};
  const safe=(v,n=100)=>String(v??'').replace(/\s+/g,' ').slice(0,n);
  const shown=el=>!!el&&(el.classList.contains('show')||getComputedStyle(el).display!=='none');
  const rect=(el,p='el')=>{
    if(!el)return {};
    const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    return {
      [`${p}X`]:Math.round(r.x),[`${p}Y`]:Math.round(r.y),[`${p}W`]:Math.round(r.width),[`${p}H`]:Math.round(r.height),
      [`${p}Right`]:Math.round(r.right),[`${p}Bottom`]:Math.round(r.bottom),
      [`${p}Cortado`]:r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight,
      [`${p}Display`]:cs.display,[`${p}Visibility`]:cs.visibility,[`${p}Opacity`]:cs.opacity,
      [`${p}Overflow`]:cs.overflow,[`${p}Transform`]:safe(cs.transform,120)
    };
  };
  function mascotSnapshot(origem){
    const catLayer=document.getElementById('rotinaCat3dLayerV2');
    const catWrap=document.getElementById('rotinaCat3dWrapV2');
    const catImg=document.getElementById('rotinaCat3dImgV2');
    const dogPreviewLayer=document.getElementById('rotinaDogPreviewV2');
    const dogPreviewWrap=document.getElementById('rotinaDogPreviewWrapV2');
    const dogCelebrationLayer=document.getElementById('rotinaDogCelebrationLayer');
    const dogCelebrationWrap=document.getElementById('rotinaDogCelebrationWrap');
    const active=document.querySelector('.tab-content.active,[data-tab].active,.aba.active');
    const d={
      origem,viewportW:innerWidth,viewportH:innerHeight,dpr:Number(devicePixelRatio||1).toFixed(2),scrollY:Math.round(scrollY),
      orientation:screen?.orientation?.type||'',aba:active?.id||active?.dataset?.tab||'',mascote:document.body?.dataset?.rotinaMascote||'',
      gatoShow:shown(catLayer),dogPreviewShow:shown(dogPreviewLayer),dogCelebrationShow:shown(dogCelebrationLayer),
      gatoNaturalW:catImg?.naturalWidth||0,gatoNaturalH:catImg?.naturalHeight||0,gatoComplete:catImg?.complete??false,
      ...rect(catLayer,'gatoLayer'),...rect(catWrap,'gatoWrap'),...rect(catImg,'gatoImg'),
      ...rect(dogPreviewLayer,'dogPreviewLayer'),...rect(dogPreviewWrap,'dogPreviewWrap'),
      ...rect(dogCelebrationLayer,'dogCelebrationLayer'),...rect(dogCelebrationWrap,'dogCelebrationWrap')
    };
    const warning=d.gatoImgCortado||d.gatoWrapCortado||d.dogPreviewWrapCortado||d.dogCelebrationWrapCortado;
    log('mascote.visual_snapshot',d,warning?'warning':'info');
  }
  function mediaName(m){
    const src=String(m?.currentSrc||m?.src||'');
    if(src.includes('latido-cachorro-comemoracao'))return 'cachorro_comemoracao';
    if(src.includes('cachorro-triste-choramingo'))return 'cachorro_triste';
    if(src.startsWith('data:audio/'))return 'gato_audio_embutido';
    if(src.startsWith('blob:'))return 'audio_blob';
    return safe(src.split('/').pop()?.split('?')[0]||m?.tagName?.toLowerCase()||'midia',80);
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');if(!el)return;
    const action=el.dataset?.act||el.dataset?.preview||el.dataset?.choose||el.dataset?.action||el.dataset?.nav||el.id||el.getAttribute('aria-label')||el.tagName.toLowerCase();
    log('ui.acao_detalhada',{acao:safe(action,80),texto:safe(el.textContent,80),dataAct:el.dataset?.act||'',dataPreview:el.dataset?.preview||'',dataChoose:el.dataset?.choose||'',dataNav:el.dataset?.nav||''});
    setTimeout(()=>mascotSnapshot('apos_acao_120ms'),120);
    setTimeout(()=>mascotSnapshot('apos_acao_600ms'),600);
  },true);
  for(const ev of ['animationstart','animationend','animationcancel']){
    document.addEventListener(ev,e=>{
      const el=e.target;if(!(el instanceof Element))return;
      const id=el.id||'',cl=safe(el.className,100);
      if(!/rotina|cat|gato|dog|cachorro|rpc2|dcTask|dcDay|cat2/i.test(`${id} ${cl} ${e.animationName||''}`))return;
      log(`animacao.${ev}`,{nome:e.animationName||'',alvo:id||cl,elapsed:Number(e.elapsedTime||0).toFixed(3),...rect(el,'alvo')});
      mascotSnapshot(ev);
    },true);
  }
  for(const ev of ['loadstart','loadedmetadata','canplay','playing','waiting','stalled','pause','ended','abort','error']){
    document.addEventListener(ev,e=>{
      const m=e.target;if(!(m instanceof HTMLMediaElement))return;
      log(`midia_extra.${ev}`,{midia:mediaName(m),currentTime:Number(m.currentTime||0).toFixed(2),duration:Number.isFinite(m.duration)?Number(m.duration).toFixed(2):0,readyState:m.readyState,networkState:m.networkState,volume:Number(m.volume||0).toFixed(2),muted:!!m.muted},(ev==='error'||ev==='stalled')?'warning':'info');
    },true);
  }
  document.addEventListener('load',e=>{
    const img=e.target;if(!(img instanceof HTMLImageElement))return;
    if(!/gato|cat|cachorro|dog|rotina/i.test(`${img.id} ${img.alt}`))return;
    log('imagem_extra.carregada',{id:img.id||'',alt:safe(img.alt,80),naturalW:img.naturalWidth,naturalH:img.naturalHeight,...rect(img,'img')});
    mascotSnapshot('imagem_carregada');
  },true);
  document.addEventListener('error',e=>{
    const img=e.target;if(!(img instanceof HTMLImageElement))return;
    log('imagem_extra.falhou',{id:img.id||'',alt:safe(img.alt,80)},'error');
  },true);
  ['rotina-client-session-ready','rotina-family-tasks-rendered','rotina-family-points-updated','rotina-task-zero','rotina-mascote-alterado'].forEach(ev=>window.addEventListener(ev,e=>{
    log(`evento_extra.${ev}`,e.detail||{});setTimeout(()=>mascotSnapshot(`evento_${ev}`),100);
  }));
  window.addEventListener('resize',()=>mascotSnapshot('resize'));
  window.addEventListener('orientationchange',()=>setTimeout(()=>mascotSnapshot('orientationchange'),250));
  document.addEventListener('visibilitychange',()=>mascotSnapshot(`visibility_${document.visibilityState}`));
  let lastVisible=false;
  setInterval(()=>{
    const cat=document.getElementById('rotinaCat3dLayerV2');
    const dp=document.getElementById('rotinaDogPreviewV2');
    const dc=document.getElementById('rotinaDogCelebrationLayer');
    const visible=shown(cat)||shown(dp)||shown(dc);
    if(visible||lastVisible)mascotSnapshot(visible?'durante_reacao':'apos_reacao');
    lastVisible=visible;
  },750);
  log('monitor.extra_pronto',{versao:V});
  setTimeout(()=>mascotSnapshot('boot_extra'),250);
})();