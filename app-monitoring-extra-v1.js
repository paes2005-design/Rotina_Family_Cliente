(()=>{
  const V=1;
  const log=(e,d={},level='info')=>{try{window.rotinaLog?.(e,{...d,monitorExtra:V},level);}catch{}};
  const safe=(v,n=100)=>String(v??'').replace(/\s+/g,' ').slice(0,n);
  const rect=(el,p='el')=>{
    if(!el)return {};
    const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    return {
      [`${p}X`]:Math.round(r.x),[`${p}Y`]:Math.round(r.y),[`${p}W`]:Math.round(r.width),[`${p}H`]:Math.round(r.height),
      [`${p}Right`]:Math.round(r.right),[`${p}Bottom`]:Math.round(r.bottom),
      [`${p}Cortado`]:r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight,
      [`${p}Display`]:cs.display,[`${p}Overflow`]:cs.overflow,[`${p}Transform`]:safe(cs.transform,120)
    };
  };
  function mascotSnapshot(origem){
    const catLayer=document.getElementById('rotinaCat3dLayerV2');
    const catWrap=document.getElementById('rotinaCat3dWrapV2');
    const catImg=document.getElementById('rotinaCat3dImgV2');
    const dogLayer=document.getElementById('rotinaDogPreviewV2')||document.getElementById('rotinaDogCelebrationLayer');
    const dogWrap=document.getElementById('rotinaDogPreviewWrapV2')||dogLayer?.firstElementChild;
    const active=document.querySelector('.tab-content.active,[data-tab].active,.aba.active');
    const d={
      origem,viewportW:innerWidth,viewportH:innerHeight,dpr:Number(devicePixelRatio||1).toFixed(2),scrollY:Math.round(scrollY),
      aba:active?.id||active?.dataset?.tab||'',mascote:document.body?.dataset?.rotinaMascote||'',
      gatoShow:!!catLayer?.classList.contains('show'),cachorroShow:!!dogLayer&&(dogLayer.classList.contains('show')||getComputedStyle(dogLayer).display!=='none'),
      gatoNaturalW:catImg?.naturalWidth||0,gatoNaturalH:catImg?.naturalHeight||0,
      gatoComplete:catImg?.complete??false,
      ...rect(catLayer,'gatoLayer'),...rect(catWrap,'gatoWrap'),...rect(catImg,'gatoImg'),...rect(dogLayer,'dogLayer'),...rect(dogWrap,'dogWrap')
    };
    const warning=d.gatoImgCortado||d.gatoWrapCortado||d.dogLayerCortado||d.dogWrapCortado;
    log('mascote.visual_snapshot',d,warning?'warning':'info');
  }
  function mediaName(m){
    const src=String(m?.currentSrc||m?.src||'');
    if(src.includes('latido-cachorro-comemoracao'))return 'cachorro_comemoracao';
    if(src.includes('cachorro-triste-choramingo'))return 'cachorro_triste';
    if(src.startsWith('data:audio/'))return 'gato_audio_embutido';
    return safe(src.split('/').pop()?.split('?')[0]||m?.tagName?.toLowerCase()||'midia',80);
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');if(!el)return;
    const action=el.dataset?.act||el.dataset?.preview||el.dataset?.choose||el.dataset?.action||el.id||el.getAttribute('aria-label')||el.tagName.toLowerCase();
    log('ui.acao_detalhada',{acao:safe(action,80),texto:safe(el.textContent,80),dataAct:el.dataset?.act||'',dataPreview:el.dataset?.preview||'',dataChoose:el.dataset?.choose||''});
    setTimeout(()=>mascotSnapshot('apos_acao_120ms'),120);
    setTimeout(()=>mascotSnapshot('apos_acao_600ms'),600);
  },true);
  for(const ev of ['animationstart','animationend','animationcancel']){
    document.addEventListener(ev,e=>{
      const el=e.target;
      if(!(el instanceof Element))return;
      const id=el.id||'',cl=safe(el.className,100);
      if(!/rotina|cat|gato|dog|cachorro|rpc2/i.test(`${id} ${cl} ${e.animationName||''}`))return;
      log(`animacao.${ev}`,{nome:e.animationName||'',alvo:id||cl,...rect(el,'alvo')});
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
    const dog=document.getElementById('rotinaDogPreviewV2')||document.getElementById('rotinaDogCelebrationLayer');
    const visible=!!cat?.classList.contains('show')||!!dog&&(dog.classList.contains('show')||getComputedStyle(dog).display!=='none');
    if(visible||lastVisible)mascotSnapshot(visible?'durante_reacao':'apos_reacao');
    lastVisible=visible;
  },750);
  log('monitor.extra_pronto',{versao:V});
  setTimeout(()=>mascotSnapshot('boot_extra'),250);
})();