(()=>{
  const VERSION=2;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}};
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'amigo';

  function ensureStyle(){
    if(document.getElementById('rotinaSadBubbleV2Style'))return;
    const s=document.createElement('style');s.id='rotinaSadBubbleV2Style';
    s.textContent=`
      #guardZeroFeedbackV2>div{position:relative!important;padding-top:112px!important}
      #guardZeroFeedbackV2 .rotina-sad-approved-bubble{position:absolute;left:50%;top:18px;transform:translateX(-50%);width:min(88%,390px);background:#fff;border:3px solid #590d22;color:#590d22;border-radius:22px;padding:12px 14px;text-align:center;font-weight:900;font-size:1rem;line-height:1.3;box-shadow:0 9px 24px rgba(0,0,0,.12);animation:rsbEnter .35s ease both}
      #guardZeroFeedbackV2 .rotina-sad-approved-bubble:after{content:'';position:absolute;left:50%;bottom:-16px;width:26px;height:26px;background:#fff;border-right:3px solid #590d22;border-bottom:3px solid #590d22;transform:translateX(-50%) rotate(45deg)}
      #guardZeroFeedbackV2 h2,#guardZeroFeedbackV2 p{display:none!important}
      @keyframes rsbEnter{from{opacity:0;transform:translateX(-50%) translateY(8px) scale(.9)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
    `;
    document.head.appendChild(s);
  }

  function apply(){
    const modal=document.getElementById('guardZeroFeedbackV2');if(!modal)return;
    ensureStyle();
    const card=modal.firstElementChild;if(!card||card.querySelector('.rotina-sad-approved-bubble'))return;
    const bubble=document.createElement('div');bubble.className='rotina-sad-approved-bubble';
    bubble.textContent=`Poxa, ${nome()}! Você não conseguiu concluir essa tarefa dentro do seu horário.`;
    card.prepend(bubble);
    log('cachorro.triste_balao_aprovado_exibido',{nome:nome(),versao:VERSION,aposJustificativa:true});
  }

  function start(){apply();new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});log('cachorro.triste_balao_aprovado_pronto',{versao:VERSION});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
