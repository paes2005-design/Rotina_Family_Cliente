(()=>{
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const preferenceKey=()=>`rotina_mascote_tipo_${profileKey()}`;

  function forceDogOnly(){
    try{localStorage.setItem(preferenceKey(),'dog');}catch{}

    const chooser=document.getElementById('rotinaMascoteChooser');
    if(chooser)chooser.remove();

    window.definirMascoteRotina=()=>{
      try{localStorage.setItem(preferenceKey(),'dog');}catch{}
      document.getElementById('rotinaMascoteChooser')?.remove();
      return 'dog';
    };
    window.obterMascoteRotina=()=> 'dog';
  }

  forceDogOnly();

  let tentativas=0;
  const timer=setInterval(()=>{
    forceDogOnly();
    tentativas+=1;
    if(tentativas>=30)clearInterval(timer);
  },200);

  const observer=new MutationObserver(()=>{
    if(document.getElementById('rotinaMascoteChooser'))forceDogOnly();
  });
  const observar=()=>{
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observar,{once:true});else observar();

  window.addEventListener('rotina-client-session-ready',forceDogOnly);
  window.addEventListener('rotina-family-tasks-rendered',forceDogOnly);
  window.addEventListener('rotina-time-guard-ready',forceDogOnly);

  window.__rotinaDogOnly=true;
  window.rotinaLog?.('mascote.cachorro_unico_ativo',{gatoOculto:true});
})();
