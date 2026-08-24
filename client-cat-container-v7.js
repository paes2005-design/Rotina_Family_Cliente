(()=>{
  'use strict';
  const VERSION=7;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,catContainer:VERSION},nivel);}catch{}};

  function installStyle(){
    if(document.getElementById('rotinaCatContainerV7Style'))return;
    const style=document.createElement('style');
    style.id='rotinaCatContainerV7Style';
    style.textContent=`
      #rotinaMascotWrapV3.cat{
        width:min(282px,66.7vw)!important;
        min-height:263px!important;
        max-height:66vh!important;
        padding:0 0 17px 0!important;
        box-sizing:border-box!important;
        overflow:visible!important;
      }
      #rotinaMascotWrapV3.cat img{
        transform:scale(.425)!important;
        transform-origin:50% 50%!important;
        overflow:visible!important;
      }
      @media(max-width:620px){
        #rotinaMascotWrapV3.cat{
          width:min(247px,63.25vw)!important;
          min-height:263px!important;
          max-height:60vh!important;
          padding-bottom:17px!important;
        }
      }
    `;
    document.head.appendChild(style);
    log('mascote.gato_container_v7_pronto',{
      aumentoPercentual:15,
      escalaImagem:.425,
      reducaoImagemAtualPercentual:50,
      tamanhoImagemMantido:false,
      larguraDesktopPx:282,
      larguraMobilePx:247,
      alturaMinimaPx:263,
      folgaInferiorPx:17
    });
  }

  function audit(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    const wrap=document.getElementById('rotinaMascotWrapV3');
    const img=wrap?.querySelector('#rotinaCatImgV3,img');
    if(!layer?.classList.contains('show')||!wrap?.classList.contains('cat')||!img)return;
    const r=wrap.getBoundingClientRect();
    const ir=img.getBoundingClientRect();
    log('mascote.gato_container_v7_medicao',{
      viewportW:innerWidth,
      viewportH:innerHeight,
      wrapW:Math.round(r.width),
      wrapH:Math.round(r.height),
      wrapX:Math.round(r.left),
      wrapY:Math.round(r.top),
      imgW:Math.round(ir.width),
      imgH:Math.round(ir.height),
      imgX:Math.round(ir.left),
      imgY:Math.round(ir.top),
      imgCortado:ir.left<0||ir.top<0||ir.right>innerWidth||ir.bottom>innerHeight,
      naturalW:img.naturalWidth||0,
      naturalH:img.naturalHeight||0
    });
  }

  function attach(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    if(!layer)return false;
    if(layer.dataset.catContainerV7Observed==='1')return true;
    layer.dataset.catContainerV7Observed='1';
    new MutationObserver(()=>{
      if(layer.classList.contains('show'))[120,600,1400,2600].forEach(ms=>setTimeout(audit,ms));
    }).observe(layer,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    return true;
  }

  function boot(){
    installStyle();
    let tries=0;
    const timer=setInterval(()=>{tries++;if(attach()||tries>120)clearInterval(timer);},100);
    log('mascote.gato_container_v7_fix_pronto',{versao:VERSION,escalaImagem:.425,reducaoImagemAtualPercentual:50});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();