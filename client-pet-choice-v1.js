(()=>{
  const VERSION=1;
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const key=()=>`rotina_mascote_tipo_${profileKey()}`;
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'amigo';
  const selected=()=>localStorage.getItem(key())==='cat'?'cat':'dog';
  const log=(evento,detalhes={})=>{try{window.rotinaLog?.(evento,detalhes);}catch{}};

  function setSelected(type){
    const value=type==='cat'?'cat':'dog';
    localStorage.setItem(key(),value);
    if(document.body)document.body.dataset.rotinaMascote=value;
    update();
    window.dispatchEvent(new CustomEvent('rotina-mascote-alterado',{detail:{mascote:value,perfil:profileKey()}}));
    log('mascote.preferencia_alterada',{mascote:value,perfil:profileKey(),versao:VERSION});
    return value;
  }
  window.obterMascoteRotina=selected;
  window.definirMascoteRotina=setSelected;

  function ensureStyle(){
    if(document.getElementById('rotinaPetChoiceStyleV1'))return;
    const s=document.createElement('style');s.id='rotinaPetChoiceStyleV1';
    s.textContent=`
      #rotinaPetChoiceV1{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 16px}
      .rpc-card{border:2px solid #e6e6e6;background:#fff;border-radius:17px;padding:11px;display:grid;grid-template-columns:auto 1fr;gap:7px 9px;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.05)}
      .rpc-card.active{border-color:var(--cor-primaria,#ff4d6d);box-shadow:0 0 0 2px rgba(255,77,109,.08)}
      .rpc-icon{font-size:2rem;grid-row:1/3}.rpc-name{font-weight:900;color:var(--cor-texto,#590d22);font-size:.96rem}.rpc-status{font-size:.76rem;color:#777}
      .rpc-actions{grid-column:1/3;display:flex;gap:7px}.rpc-actions button{flex:1;border:0;border-radius:999px;padding:8px 9px;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}
      .rpc-choose{background:#f2f4f7;color:#444}.rpc-card.active .rpc-choose{background:var(--cor-primaria,#ff4d6d);color:#fff}.rpc-preview{background:#fff4dc;color:#7a5000;border:1px solid #f4d789!important}
      #rotinaPetPreviewV1{position:fixed;inset:0;z-index:27000;background:rgba(0,0,0,.66);display:none;align-items:center;justify-content:center;padding:14px}
      #rotinaPetPreviewV1.show{display:flex}.rpc-modal{width:min(94vw,500px);background:#fff;border-radius:24px;padding:19px;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
      .rpc-modal h3{margin:0 0 5px;color:#590d22}.rpc-modal p{margin:0 0 14px;color:#666;font-size:.9rem}
      .rpc-preview-actions{display:grid;grid-template-columns:1fr;gap:9px}.rpc-preview-actions button{border:0;border-radius:14px;padding:12px;font:inherit;font-weight:850;cursor:pointer}
      .rpc-task{background:#e9fbef;color:#15663f}.rpc-day{background:#fff0f3;color:#a21439}.rpc-sad{background:#eef3ff;color:#35508f}
      .rpc-footer{display:flex;gap:9px;margin-top:13px}.rpc-footer button{flex:1;border:0;border-radius:13px;padding:10px;font:inherit;font-weight:800;cursor:pointer}.rpc-use{background:#ff4d6d;color:#fff}.rpc-close{background:#eef0f3;color:#444}
      #rotinaDogPreviewLayerV1{position:fixed;inset:0;z-index:27100;display:none;align-items:flex-end;justify-content:center;padding:0 18px 9vh;pointer-events:none;background:rgba(255,255,255,.01);overflow:hidden}
      #rotinaDogPreviewLayerV1.show{display:flex}#rotinaDogPreviewWrapV1{width:min(285px,72vw);transform-origin:50% 85%;position:relative}
      #rotinaDogPreviewLayerV1 svg{width:100%;height:auto;display:block;filter:drop-shadow(0 18px 14px rgba(44,24,18,.2))}
      #rotinaDogPreviewBubbleV1{position:absolute;left:50%;bottom:calc(9vh + 235px);transform:translateX(-50%);width:min(88vw,430px);background:#fff;border:3px solid #590d22;color:#590d22;border-radius:22px;padding:12px 14px;font-weight:900;font-size:1rem;line-height:1.3;box-shadow:0 9px 24px rgba(0,0,0,.12);text-align:center}
      #rotinaDogPreviewWrapV1.task{animation:rpcDogTask 2.8s ease both}#rotinaDogPreviewWrapV1.day{animation:rpcDogDay 4.1s ease both}#rotinaDogPreviewWrapV1.sad{animation:rpcDogSad 3s ease both}
      #rotinaDogPreviewWrapV1.sad .rpc-tail{transform:rotate(30deg);transform-origin:245px 250px}#rotinaDogPreviewWrapV1.sad .rpc-head{transform:translateY(9px);transform-origin:181px 170px}
      @keyframes rpcDogTask{0%{transform:translateY(0)}18%{transform:translateY(-70px) rotate(-4deg)}38%{transform:translateY(0) rotate(3deg)}58%{transform:translateY(-35px) rotate(-2deg)}100%{transform:translateY(0)}}
      @keyframes rpcDogDay{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(-90px) rotate(-8deg)}40%{transform:translateY(-25px) rotate(160deg)}62%{transform:translateY(-70px) rotate(330deg)}100%{transform:translateY(0) rotate(360deg)}}
      @keyframes rpcDogSad{0%,100%{transform:translateY(0)}30%{transform:translateY(7px) scale(.99)}60%{transform:translateY(4px) rotate(-1deg)}}
      @media(max-width:620px){#rotinaPetChoiceV1{grid-template-columns:1fr}.rpc-modal{padding:17px}#rotinaDogPreviewWrapV1{width:min(250px,72vw)}#rotinaDogPreviewBubbleV1{bottom:calc(9vh + 210px)}}
    `;
    document.head.appendChild(s);
  }

  function dogSvg(){
    return `<svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachorro do Rotina Family">
      <defs><linearGradient id="rpcW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient><linearGradient id="rpcB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient></defs>
      <g class="rpc-tail"><path d="M245 243 C292 222 302 257 276 267" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M275 267 C286 270 291 264 292 256" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g>
      <ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#rpcW)"/><path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#rpcW)"/><path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#rpcW)"/>
      <g class="rpc-head"><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#rpcB)"/><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#rpcB)"/>
      <ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#rpcB)"/><path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/><path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/>
      <ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/><circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/><path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/><path d="M164 167 C170 176 192 176 198 167 C198 184 190 193 181 193 C172 193 164 184 164 167 Z" fill="#f7f1ec"/></g>
      <path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/><rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/>
    </svg>`;
  }

  function ensureDogPreview(){
    let l=document.getElementById('rotinaDogPreviewLayerV1');if(l)return l;
    l=document.createElement('div');l.id='rotinaDogPreviewLayerV1';
    l.innerHTML=`<div id="rotinaDogPreviewBubbleV1"></div><div id="rotinaDogPreviewWrapV1">${dogSvg()}</div>`;
    document.body.appendChild(l);return l;
  }

  function dogSound(sad=false){
    try{const a=new Audio(sad?'./cachorro-triste-choramingo.mp3?v=1':'./latido-cachorro-comemoracao.mp3?v=5');a.preload='auto';a.volume=1;a.play().catch(()=>{});}catch{}
  }

  function previewDog(kind){
    const l=ensureDogPreview(),w=l.querySelector('#rotinaDogPreviewWrapV1'),b=l.querySelector('#rotinaDogPreviewBubbleV1'),n=nome();
    w.className='';void w.offsetWidth;w.id='rotinaDogPreviewWrapV1';w.classList.add(kind);
    b.textContent=kind==='day'?`Parabéns, ${n}! Você finalizou bem o dia!`:kind==='sad'?`Poxa, ${n}! Você não conseguiu concluir essa tarefa dentro do seu horário.`:`Parabéns, ${n}! Você completou essa tarefa dentro do seu horário!`;
    l.classList.add('show');
    if(kind==='sad')dogSound(true);else{dogSound(false);setTimeout(()=>dogSound(false),440);if(kind==='day')setTimeout(()=>dogSound(false),900);}
    setTimeout(()=>l.classList.remove('show'),kind==='day'?4300:3300);
  }

  function openPreview(type){
    ensureModal();
    const m=document.getElementById('rotinaPetPreviewV1');m.dataset.pet=type;
    m.querySelector('[data-preview-title]').textContent=type==='cat'?'🐱 Reações do gato 3D':'🐶 Reações do cachorro';
    m.querySelector('[data-use]').textContent=type==='cat'?'Usar o gato':'Usar o cachorro';
    m.classList.add('show');
  }
  function preview(type,kind){
    document.getElementById('rotinaPetPreviewV1')?.classList.remove('show');
    if(type==='cat'){
      if(typeof window.rotinaPreviewGato==='function')window.rotinaPreviewGato(kind);
      else alert('O gato ainda está carregando. Tente novamente em um instante.');
    }else previewDog(kind);
  }

  function ensureModal(){
    if(document.getElementById('rotinaPetPreviewV1'))return;
    const m=document.createElement('div');m.id='rotinaPetPreviewV1';
    m.innerHTML=`<div class="rpc-modal"><h3 data-preview-title></h3><p>Veja as três reações antes de escolher o mascote.</p><div class="rpc-preview-actions"><button class="rpc-task" data-act="task">🐾 Tarefa concluída</button><button class="rpc-day" data-act="day">🎉 Dia concluído</button><button class="rpc-sad" data-act="sad">😢 Não conseguiu</button></div><div class="rpc-footer"><button class="rpc-close" data-close>Voltar</button><button class="rpc-use" data-use>Usar mascote</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click',e=>{
      if(e.target===m||e.target.closest('[data-close]')){m.classList.remove('show');return;}
      const act=e.target.closest('[data-act]');if(act){preview(m.dataset.pet,act.dataset.act);return;}
      if(e.target.closest('[data-use]')){setSelected(m.dataset.pet);m.classList.remove('show');}
    });
  }

  function ensureChooser(){
    ensureStyle();ensureModal();
    const app=document.getElementById('telaApp');if(!app)return;
    let root=document.getElementById('rotinaPetChoiceV1');
    if(!root){
      root=document.createElement('div');root.id='rotinaPetChoiceV1';
      root.innerHTML=`
        <div class="rpc-card" data-card="dog"><div class="rpc-icon">🐶</div><div><div class="rpc-name">Cachorro</div><div class="rpc-status" data-status="dog"></div></div><div class="rpc-actions"><button class="rpc-choose" data-choose="dog">Escolher</button><button class="rpc-preview" data-preview="dog">▶ Ver reações</button></div></div>
        <div class="rpc-card" data-card="cat"><div class="rpc-icon">🐱</div><div><div class="rpc-name">Gato 3D</div><div class="rpc-status" data-status="cat"></div></div><div class="rpc-actions"><button class="rpc-choose" data-choose="cat">Escolher</button><button class="rpc-preview" data-preview="cat">▶ Ver reações</button></div></div>`;
      const anchor=app.querySelector('.dash-cards');if(anchor)anchor.before(root);else app.prepend(root);
      root.addEventListener('click',e=>{
        const choose=e.target.closest('[data-choose]');if(choose){setSelected(choose.dataset.choose);return;}
        const pv=e.target.closest('[data-preview]');if(pv)openPreview(pv.dataset.preview);
      });
    }
    update();
  }

  function update(){
    const type=selected();
    if(document.body)document.body.dataset.rotinaMascote=type;
    document.querySelectorAll('#rotinaPetChoiceV1 [data-card]').forEach(c=>c.classList.toggle('active',c.dataset.card===type));
    document.querySelectorAll('#rotinaPetChoiceV1 [data-status]').forEach(s=>s.textContent=s.dataset.status===type?'Selecionado':'Disponível');
    document.querySelectorAll('#rotinaPetChoiceV1 [data-choose]').forEach(b=>b.textContent=b.dataset.choose===type?'Selecionado ✓':'Escolher');
  }

  function start(){
    if(!localStorage.getItem(key()))localStorage.setItem(key(),'dog');
    ensureChooser();update();
    new MutationObserver(()=>ensureChooser()).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('rotina-client-session-ready',()=>setTimeout(()=>{if(!localStorage.getItem(key()))localStorage.setItem(key(),'dog');ensureChooser();update();},0));
    log('mascote.escolha_cliente_pronta',{versao:VERSION});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();