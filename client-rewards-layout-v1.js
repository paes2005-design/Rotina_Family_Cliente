(()=>{
  'use strict';

  const STYLE_ID='rotinaRewardsLayoutStyleV1';
  const HISTORY_CARD_ID='historicoRecompensasCard';
  const HISTORY_BODY_ID='historicoRecompensasCliente';
  let reorganizando=false;

  function instalarEstilo(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .rf-benefits-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:15px!important;margin-bottom:12px!important;align-items:stretch}
      .rf-benefits-grid>.card{height:100%;margin:0!important}
      .rf-history-card{width:100%;text-align:left!important;margin:0 0 20px!important}
      .rf-history-card>span{display:block}
      #historicoRecompensasCliente{margin-top:8px}
      #historicoRecompensasCliente>div{margin-top:0!important;padding-top:0!important;border-top:0!important}
      @media(max-width:700px){
        .rf-benefits-grid{grid-template-columns:1fr!important;gap:10px!important;margin-bottom:10px!important}
        .rf-benefits-grid>.card{width:100%;min-width:0}
        .rf-history-card{margin-bottom:14px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function tituloCard(card,texto){
    if(!card)return;
    const span=Array.from(card.children).find(el=>el.tagName==='SPAN');
    if(span)span.textContent=texto;
  }

  function garantirHistorico(grid){
    let card=document.getElementById(HISTORY_CARD_ID);
    if(!card){
      card=document.createElement('div');
      card.id=HISTORY_CARD_ID;
      card.className='card rf-history-card';
      card.innerHTML=`<span>📋 Histórico</span><div id="${HISTORY_BODY_ID}" style="margin-top:8px"><small>Nenhum resgate solicitado hoje.</small></div>`;
    }
    if(card.previousElementSibling!==grid)grid.insertAdjacentElement('afterend',card);
    return card;
  }

  function moverHistorico(){
    if(reorganizando)return;
    const recompensas=document.getElementById('recompensasCliente');
    const destino=document.getElementById(HISTORY_BODY_ID);
    if(!recompensas||!destino)return;

    const bloco=Array.from(recompensas.children).find(el=>/meus resgates de hoje/i.test(el.textContent||''));
    if(!bloco)return;

    reorganizando=true;
    try{
      const titulo=Array.from(bloco.querySelectorAll('strong')).find(el=>/meus resgates de hoje/i.test(el.textContent||''));
      if(titulo)titulo.textContent='Resgates de hoje';
      bloco.style.marginTop='0';
      destino.replaceChildren(bloco);
    }finally{
      reorganizando=false;
    }
  }

  function aplicarLayout(){
    const recompensas=document.getElementById('recompensasCliente');
    const conquistas=document.getElementById('conquistasCliente');
    if(!recompensas||!conquistas)return false;

    instalarEstilo();
    const cardRecompensas=recompensas.closest('.card');
    const cardConquistas=conquistas.closest('.card');
    if(!cardRecompensas||!cardConquistas||cardRecompensas.parentElement!==cardConquistas.parentElement)return false;

    const grid=cardRecompensas.parentElement;
    grid.classList.add('rf-benefits-grid');
    grid.style.removeProperty('grid-template-columns');
    cardRecompensas.classList.add('rf-rewards-card');
    cardConquistas.classList.add('rf-achievements-card');

    tituloCard(cardRecompensas,'🎁 Recompensas');
    tituloCard(cardConquistas,'🏆 Conquistas');

    if(grid.firstElementChild!==cardRecompensas)grid.insertBefore(cardRecompensas,cardConquistas);
    garantirHistorico(grid);
    moverHistorico();
    return true;
  }

  function iniciar(){
    let tentativas=0;
    const timer=setInterval(()=>{
      tentativas++;
      if(aplicarLayout()||tentativas>=40)clearInterval(timer);
    },100);

    const observer=new MutationObserver(()=>{
      if(reorganizando)return;
      requestAnimationFrame(()=>{
        aplicarLayout();
        moverHistorico();
      });
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});

    window.rotinaAplicarLayoutRecompensas=aplicarLayout;
    window.rotinaLog?.('ui.recompensas_layout',{versao:1,desktop:'recompensas-esquerda-conquistas-direita-historico-abaixo',mobile:'recompensas-conquistas-historico'});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  else iniciar();
})();
