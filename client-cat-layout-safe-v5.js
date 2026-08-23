(()=>{
  'use strict';
  const VERSION=5;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,catLayoutSafe:VERSION},nivel);}catch{}};

  const SAFE_ANIMATIONS={
    Jump:'rfv5CatJump 3.2s cubic-bezier(.2,.75,.25,1) both',
    Spin:'rfv5CatSpin 3.35s cubic-bezier(.2,.75,.25,1) both',
    Roll:'rfv5CatRoll 3.45s cubic-bezier(.2,.75,.25,1) both',
    Side:'rfv5CatSide 3.2s cubic-bezier(.2,.75,.25,1) both',
    Flip:'rfv5CatFlip 3.45s cubic-bezier(.2,.75,.25,1) both'
  };

  function installStyle(){
    if(document.getElementById('rotinaCatLayoutSafeV5'))return;
    const style=document.createElement('style');
    style.id='rotinaCatLayoutSafeV5';
    style.textContent=`
      #rotinaMascotLayerV3{
        overflow:visible!important;
        padding-bottom:max(8vh,56px)!important;
      }
      #rotinaMascotWrapV3.cat{
        width:min(245px,58vw)!important;
        min-height:180px!important;
        translate:0 -18px;
      }
      #rotinaMascotWrapV3.cat img{
        display:block!important;
        max-width:100%!important;
        max-height:min(54vh,300px)!important;
        width:auto!important;
        height:auto!important;
        object-fit:contain!important;
      }
      @keyframes rfv5CatJump{
        0%,100%{transform:translateY(0) scale(1)}
        12%{transform:translateY(6px) scale(.97,1.03)}
        27%{transform:translateY(-78px) rotate(-5deg) scale(1.02)}
        43%{transform:translateY(0) rotate(3deg) scale(1,.96)}
        58%{transform:translateY(-46px) rotate(4deg)}
        74%{transform:translateY(0) rotate(-2deg)}
        86%{transform:translateY(-22px)}
      }
      @keyframes rfv5CatSpin{
        0%,100%{transform:translateY(0) rotate(0)}
        15%{transform:translateY(-58px) rotate(-10deg)}
        32%{transform:translateY(-78px) rotate(110deg)}
        52%{transform:translateY(-64px) rotate(230deg)}
        72%{transform:translateY(-36px) rotate(335deg)}
        88%{transform:translateY(-12px) rotate(365deg)}
      }
      @keyframes rfv5CatRoll{
        0%,100%{transform:translate(0,0) rotate(0)}
        14%{transform:translate(-38px,-28px) rotate(-55deg)}
        32%{transform:translate(-54px,-48px) rotate(-145deg)}
        52%{transform:translate(0,-66px) rotate(-250deg)}
        72%{transform:translate(54px,-44px) rotate(-345deg)}
        88%{transform:translate(24px,-12px) rotate(-370deg)}
      }
      @keyframes rfv5CatSide{
        0%,100%{transform:translate(0,0) rotate(0)}
        15%{transform:translate(-58px,-42px) rotate(-8deg)}
        30%{transform:translate(-28px,-12px) rotate(4deg)}
        46%{transform:translate(58px,-58px) rotate(9deg)}
        62%{transform:translate(28px,-12px) rotate(-4deg)}
        78%{transform:translate(-45px,-38px) rotate(-7deg)}
        90%{transform:translate(12px,-10px) rotate(2deg)}
      }
      @keyframes rfv5CatFlip{
        0%,100%{transform:translateY(0) rotateY(0) rotateZ(0)}
        18%{transform:translateY(-62px) rotateY(80deg) rotateZ(-8deg)}
        38%{transform:translateY(-84px) rotateY(180deg) rotateZ(6deg)}
        58%{transform:translateY(-64px) rotateY(285deg) rotateZ(-6deg)}
        78%{transform:translateY(-28px) rotateY(360deg) rotateZ(4deg)}
        90%{transform:translateY(-10px) rotateY(360deg)}
      }
      @media(max-height:760px){
        #rotinaMascotWrapV3.cat{translate:0 -28px}
      }
      @media(max-width:620px){
        #rotinaMascotLayerV3{padding-bottom:max(8vh,46px)!important}
        #rotinaMascotWrapV3.cat{
          width:min(215px,55vw)!important;
          min-height:165px!important;
          translate:0 -20px;
        }
        #rotinaMascotWrapV3.cat img{max-height:min(50vh,250px)!important}
      }
      @media(max-width:420px){
        #rotinaMascotWrapV3.cat{translate:0 -24px}
      }
    `;
    document.head.appendChild(style);
    log('mascote.gato_layout_safe_style_pronto',{overflow:'visible',eixo:'50% 50%',semReducaoPrincipal:true});
  }

  function reactionOf(wrap){
    return wrap.classList.contains('sad')?'sad':wrap.classList.contains('day')?'day':'task';
  }

  function forceSafeAnimation(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    const wrap=document.getElementById('rotinaMascotWrapV3');
    if(!layer?.classList.contains('show')||!wrap?.classList.contains('cat'))return;

    wrap.style.setProperty('transform-origin','50% 50%','important');
    const reaction=reactionOf(wrap);
    if(reaction==='sad'){
      wrap.dataset.catSafeV5='sad';
      return;
    }

    const animation=String(wrap.style.getPropertyValue('animation')||getComputedStyle(wrap).animationName||'');
    const match=animation.match(/rfv4(Jump|Spin|Roll|Side|Flip)/i);
    if(!match)return;
    const move=match[1][0].toUpperCase()+match[1].slice(1).toLowerCase();
    const safe=SAFE_ANIMATIONS[move];
    if(!safe)return;
    const key=`${reaction}:${move}`;
    if(wrap.dataset.catSafeV5===key&&String(wrap.style.animation).includes('rfv5Cat'))return;
    wrap.dataset.catSafeV5=key;
    wrap.style.setProperty('animation',safe,'important');
    wrap.style.setProperty('transform-origin','50% 50%','important');
    log('mascote.gato_movimento_safe_v5',{reacao:reaction,movimento:move,animation:safe});
    auditBurst(wrap,reaction,move);
  }

  function auditBounds(wrap,reaction,move,amostra){
    if(!document.documentElement.contains(wrap))return;
    const r=wrap.getBoundingClientRect();
    const img=wrap.querySelector('img');
    const ir=img?.getBoundingClientRect?.();
    const cutWrap=r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight;
    const cutImg=ir?ir.left<0||ir.top<0||ir.right>innerWidth||ir.bottom>innerHeight:false;
    const detalhes={reacao:reaction,movimento:move,amostra,viewportW:innerWidth,viewportH:innerHeight,wrapX:Math.round(r.left),wrapY:Math.round(r.top),wrapR:Math.round(r.right),wrapB:Math.round(r.bottom),wrapCortado:cutWrap,gatoImgCortado:cutImg};
    if(ir)Object.assign(detalhes,{imgX:Math.round(ir.left),imgY:Math.round(ir.top),imgR:Math.round(ir.right),imgB:Math.round(ir.bottom),naturalW:img.naturalWidth,naturalH:img.naturalHeight});
    log('mascote.gato_limite_v5',detalhes,(cutWrap||cutImg)?'warning':'info');
  }

  function auditBurst(wrap,reaction,move){
    [80,260,620,1100,1800,2600,3300].forEach((ms,i)=>setTimeout(()=>auditBounds(wrap,reaction,move,i+1),ms));
  }

  function attach(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    if(!layer)return false;
    if(layer.dataset.catSafeV5Observed==='1')return true;
    layer.dataset.catSafeV5Observed='1';
    const schedule=()=>{queueMicrotask(()=>setTimeout(forceSafeAnimation,0));};
    new MutationObserver(schedule).observe(layer,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    schedule();
    log('mascote.gato_layout_safe_observando',{layer:'rotinaMascotLayerV3'});
    return true;
  }

  function boot(){
    installStyle();
    let tries=0;
    const timer=setInterval(()=>{tries++;if(attach()||tries>120)clearInterval(timer);},100);
    log('mascote.gato_layout_safe_v5_pronto',{versao:VERSION});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();