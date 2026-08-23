(()=>{
  'use strict';
  const VERSION=1;
  function install(){
    if(document.getElementById('rotinaMascotLayoutFixV1'))return;
    const style=document.createElement('style');
    style.id='rotinaMascotLayoutFixV1';
    style.textContent=`
      /* Giro em torno do centro: evita que o mascote seja projetado para baixo e cortado. */
      #rotinaMascotWrapV3.day{animation-name:rm3DaySafe!important;transform-origin:50% 50%!important}
      @keyframes rm3DaySafe{
        0%{transform:translateY(0) rotate(0)}
        18%{transform:translateY(-72px) rotate(-6deg)}
        40%{transform:translateY(-92px) rotate(145deg)}
        62%{transform:translateY(-92px) rotate(320deg)}
        100%{transform:translateY(0) rotate(360deg)}
      }
      /* Os novos arquivos do gato têm margem transparente de segurança. */
      #rotinaMascotWrapV3.cat{width:min(255px,62vw)!important}
      @media(max-width:620px){#rotinaMascotWrapV3.cat{width:min(225px,58vw)!important}}
      @media(max-height:760px) and (orientation:landscape){
        #rotinaMascotWrapV3{max-height:52vh!important}
        #rotinaMascotWrapV3 svg,#rotinaMascotWrapV3 img{max-height:52vh!important}
      }
    `;
    document.head.appendChild(style);
    try{window.rotinaLog?.('mascote.layout_seguro_pronto',{versao:VERSION,giroCentral:true,margemAssetGato:true});}catch{}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
