(()=>{
  'use strict';
  const VERSION=4;
  const MOVES=['jump','spin','roll','side','flip'];
  const bags={dog:[],cat:[]};
  const last={dog:'',cat:''};
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,mascoteOverlay:VERSION},nivel);}catch{}};

  function shuffle(list){
    const a=[...list];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  function pick(type){
    let bag=bags[type];
    if(!bag.length){
      bag=shuffle(MOVES);
      if(bag[0]===last[type]&&bag.length>1)[bag[0],bag[1]]=[bag[1],bag[0]];
      bags[type]=bag;
    }
    const move=bag.shift();
    last[type]=move;
    return {move,restantes:bag.length};
  }

  function dogSadSvg(){
    return `<svg id="rotinaMascotDogV3" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachorro triste do Rotina Family">
      <defs>
        <linearGradient id="rfv4White" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient>
        <linearGradient id="rfv4Brown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient>
      </defs>
      <g class="tail"><path d="M245 243 C292 222 302 257 276 267" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M275 267 C286 270 291 264 292 256" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g>
      <ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#rfv4White)"/>
      <path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#rfv4White)"/>
      <path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#rfv4White)"/>
      <g class="head">
        <g class="ear-l"><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#rfv4Brown)"/></g>
        <g class="ear-r"><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#rfv4Brown)"/></g>
        <ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#rfv4Brown)"/>
        <path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/>
        <path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/>
        <ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/>
        <circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/>
        <path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/>
        <path class="sad-mouth" d="M165 188 C174 177 190 177 199 188" fill="none" stroke="#543028" stroke-width="6" stroke-linecap="round"/>
        <path class="sad-brow-l" d="M130 107 Q145 97 158 108" fill="none" stroke="#5e2c1e" stroke-width="5" stroke-linecap="round"/>
        <path class="sad-brow-r" d="M204 108 Q218 97 232 107" fill="none" stroke="#5e2c1e" stroke-width="5" stroke-linecap="round"/>
        <path class="tear" d="M221 141 C226 151 226 158 221 164 C216 158 216 151 221 141 Z" fill="#6ec6ff"/>
      </g>
      <path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/>
      <rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/>
    </svg>`;
  }

  function installStyle(){
    document.getElementById('rotinaMascotLayoutFixV1')?.remove();
    document.getElementById('rotinaMascotOverlayV4')?.remove();
    const style=document.createElement('style');
    style.id='rotinaMascotOverlayV4';
    style.textContent=`
      #rotinaMascotLayerV3{perspective:900px!important}
      #rotinaMascotWrapV3{transform-origin:50% 58%!important;will-change:transform!important}
      #rotinaMascotWrapV3.task,#rotinaMascotWrapV3.day{animation:none!important}
      #rotinaMascotWrapV3.cat{width:min(245px,58vw)!important;min-height:180px}
      #rotinaMascotWrapV3.cat img{max-width:100%!important;max-height:54vh!important;width:auto!important;height:auto!important;object-fit:contain!important}
      #rotinaMascotWrapV3.dog.sad{animation:rfv4Sad 3.05s ease both!important}
      #rotinaMascotWrapV3.dog.sad .tail{animation:none!important;transform:rotate(35deg) translate(-4px,8px)!important;transform-origin:230px 248px}
      #rotinaMascotWrapV3.dog.sad .ear-l{transform:rotate(-18deg);transform-origin:125px 95px}
      #rotinaMascotWrapV3.dog.sad .ear-r{transform:rotate(18deg);transform-origin:236px 95px}
      #rotinaMascotWrapV3.dog.sad .head{transform:translateY(12px);transform-origin:181px 150px}
      #rotinaMascotWrapV3.dog.sad .tear{animation:rfv4Tear .8s ease-in-out 3}
      @keyframes rfv4Jump{
        0%,100%{transform:translateY(0) scale(1)}
        12%{transform:translateY(8px) scale(.96,1.04)}
        27%{transform:translateY(-105px) rotate(-6deg) scale(1.03)}
        43%{transform:translateY(0) rotate(4deg) scale(1,.95)}
        58%{transform:translateY(-62px) rotate(5deg)}
        74%{transform:translateY(0) rotate(-2deg)}
        86%{transform:translateY(-28px)}
      }
      @keyframes rfv4Spin{
        0%,100%{transform:translateY(0) rotate(0)}
        15%{transform:translateY(-78px) rotate(-12deg)}
        32%{transform:translateY(-110px) rotate(110deg)}
        52%{transform:translateY(-88px) rotate(230deg)}
        72%{transform:translateY(-45px) rotate(335deg)}
        88%{transform:translateY(-16px) rotate(365deg)}
      }
      @keyframes rfv4Roll{
        0%,100%{transform:translate(0,0) rotate(0)}
        14%{transform:translate(-45px,-35px) rotate(-55deg)}
        32%{transform:translate(-82px,-64px) rotate(-145deg)}
        52%{transform:translate(0,-90px) rotate(-250deg)}
        72%{transform:translate(82px,-54px) rotate(-345deg)}
        88%{transform:translate(30px,-16px) rotate(-370deg)}
      }
      @keyframes rfv4Side{
        0%,100%{transform:translate(0,0) rotate(0)}
        15%{transform:translate(-95px,-55px) rotate(-10deg)}
        30%{transform:translate(-38px,-15px) rotate(5deg)}
        46%{transform:translate(95px,-75px) rotate(12deg)}
        62%{transform:translate(36px,-15px) rotate(-5deg)}
        78%{transform:translate(-65px,-50px) rotate(-8deg)}
        90%{transform:translate(15px,-12px) rotate(3deg)}
      }
      @keyframes rfv4Flip{
        0%,100%{transform:translateY(0) rotateY(0) rotateZ(0)}
        18%{transform:translateY(-95px) rotateY(80deg) rotateZ(-10deg)}
        38%{transform:translateY(-125px) rotateY(180deg) rotateZ(8deg)}
        58%{transform:translateY(-95px) rotateY(285deg) rotateZ(-7deg)}
        78%{transform:translateY(-38px) rotateY(360deg) rotateZ(5deg)}
        90%{transform:translateY(-15px) rotateY(360deg)}
      }
      @keyframes rfv4Sad{0%,100%{transform:translateY(0)}30%{transform:translateY(9px) scale(.98)}60%{transform:translateY(6px) rotate(-1.5deg) scale(.975)}82%{transform:translateY(10px) rotate(1deg) scale(.98)}}
      @keyframes rfv4Tear{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(30px);opacity:0}}
      @media(max-width:620px){
        #rotinaMascotWrapV3.cat{width:min(215px,55vw)!important;min-height:165px}
        @keyframes rfv4Side{
          0%,100%{transform:translate(0,0)}
          18%{transform:translate(-62px,-48px) rotate(-8deg)}
          38%{transform:translate(54px,-68px) rotate(10deg)}
          58%{transform:translate(-45px,-40px) rotate(-7deg)}
          78%{transform:translate(58px,-52px) rotate(8deg)}
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyReaction(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    const wrap=document.getElementById('rotinaMascotWrapV3');
    if(!layer||!wrap)return;
    if(!layer.classList.contains('show')){
      if(wrap.dataset.v4Applied==='1'){
        wrap.dataset.v4Applied='0';
        wrap.style.removeProperty('animation');
        wrap.style.removeProperty('transform-origin');
      }
      return;
    }
    if(wrap.dataset.v4Applied==='1')return;
    wrap.dataset.v4Applied='1';
    const type=wrap.classList.contains('cat')?'cat':'dog';
    const reaction=wrap.classList.contains('sad')?'sad':wrap.classList.contains('day')?'day':'task';

    if(reaction==='sad'){
      if(type==='dog'){
        wrap.innerHTML=dogSadSvg();
        log('mascote.cachorro_triste_visual_aplicado',{orelhasBaixas:true,cabecaBaixa:true,lagrima:true,bocaTriste:true});
      }
      wrap.style.setProperty('animation','rfv4Sad 3.05s ease both','important');
      log('mascote.movimento_v4',{mascote:type,reacao:reaction,movimento:'sad-fixo',totalMovimentos:5});
      return;
    }

    const chosen=pick(type);
    const duration=chosen.move==='roll'||chosen.move==='flip'?'3.45s':chosen.move==='spin'?'3.35s':'3.2s';
    wrap.style.setProperty('animation',`rfv4${chosen.move[0].toUpperCase()+chosen.move.slice(1)} ${duration} cubic-bezier(.2,.75,.25,1) both`,'important');
    wrap.style.setProperty('transform-origin','50% 58%','important');
    log('mascote.movimento_v4',{mascote:type,reacao:reaction,movimento:chosen.move,restantesNoCiclo:chosen.restantes,totalMovimentos:5,semRepeticaoAteCompletarCiclo:true});
  }

  function attach(){
    const layer=document.getElementById('rotinaMascotLayerV3');
    if(!layer)return false;
    if(layer.dataset.v4Observed==='1')return true;
    layer.dataset.v4Observed='1';
    new MutationObserver(()=>queueMicrotask(applyReaction)).observe(layer,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    applyReaction();
    log('mascote.overlay_v4_observando',{layer:'rotinaMascotLayerV3'});
    return true;
  }

  async function inspectCat(kind){
    const url=kind==='sad'?'./cat-sad-tiny.webp.b64?v=4':'./cat-happy-tiny.webp.b64?v=4';
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status} ${kind}`);
    const raw=(await response.text()).replace(/\s+/g,'');
    if(!raw||raw.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new Error(`base64 ${kind} inválido: ${raw.length}`);
    atob(raw);
    const src=`data:image/webp;base64,${raw}`;
    const dims=await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve({w:img.naturalWidth,h:img.naturalHeight});
      img.onerror=()=>reject(new Error(`WebP ${kind} não decodificou`));
      img.src=src;
    });
    if(dims.w<100||dims.h<100)throw new Error(`WebP ${kind} pequeno: ${dims.w}x${dims.h}`);
    return {ok:true,base64Length:raw.length,...dims};
  }

  async function audit(){
    const sandbox=document.createElement('div');sandbox.innerHTML=dogSadSvg();
    const dogOk=!!(sandbox.querySelector('.head')&&sandbox.querySelector('.ear-l')&&sandbox.querySelector('.ear-r')&&sandbox.querySelector('.tear')&&sandbox.querySelector('.sad-mouth'));
    const cycle=shuffle(MOVES);
    const movementOk=cycle.length===5&&new Set(cycle).size===5&&MOVES.includes('spin')&&MOVES.includes('roll')&&MOVES.includes('flip');
    const result={versao:VERSION,movimentos:[...MOVES],cicloTeste:cycle,movimentosOk:movementOk,cachorroTristeEstruturado:dogOk,gatoHappy:null,gatoSad:null,ok:false};
    try{result.gatoHappy=await inspectCat('happy');}catch(e){result.gatoHappy={ok:false,erro:String(e?.message||e)};}
    try{result.gatoSad=await inspectCat('sad');}catch(e){result.gatoSad={ok:false,erro:String(e?.message||e)};}
    result.ok=movementOk&&dogOk&&result.gatoHappy?.ok===true&&result.gatoSad?.ok===true;
    log('mascote.auditoria_v4',result,result.ok?'info':'error');
    window.__rotinaMascoteAuditV4=result;
    return result;
  }
  window.rotinaAuditarMascotesV4=audit;

  function boot(){
    installStyle();
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(attach()||tries>120)clearInterval(timer);
    },100);
    audit().catch(e=>log('mascote.auditoria_v4_excecao',{erro:String(e?.message||e)},'error'));
    log('mascote.overlay_v4_pronto',{versao:VERSION,movimentos:MOVES,aleatorio:true,semRepeticaoAteCompletarCiclo:true,cachorroTristeRestaurado:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();