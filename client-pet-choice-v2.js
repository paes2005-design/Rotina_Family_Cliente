(()=>{
  const VERSION=2;
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const prefKey=()=>`rotina_mascote_tipo_${profileKey()}`;
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'amigo';
  const selected=()=>localStorage.getItem(prefKey())==='cat'?'cat':'dog';
  const log=(evento,detalhes={})=>{try{window.rotinaLog?.(evento,detalhes);}catch{}};

  function updateUI(){
    const type=selected();
    document.body?.setAttribute('data-rotina-mascote',type);
    const root=document.getElementById('rotinaPetChoiceV2');
    if(!root)return;
    root.querySelectorAll('[data-card]').forEach(c=>c.classList.toggle('active',c.dataset.card===type));
    root.querySelectorAll('[data-status]').forEach(s=>{const next=s.dataset.status===type?'Selecionado':'Disponível';if(s.textContent!==next)s.textContent=next;});
    root.querySelectorAll('[data-choose]').forEach(b=>{const next=b.dataset.choose===type?'Selecionado ✓':'Escolher';if(b.textContent!==next)b.textContent=next;});
  }

  function setSelected(type){
    const value=type==='cat'?'cat':'dog';
    localStorage.setItem(prefKey(),value);
    updateUI();
    window.dispatchEvent(new CustomEvent('rotina-mascote-alterado',{detail:{mascote:value,perfil:profileKey()}}));
    log('mascote.preferencia_alterada',{mascote:value,perfil:profileKey(),versao:VERSION});
    return value;
  }
  window.obterMascoteRotina=selected;
  window.definirMascoteRotina=setSelected;

  function style(){
    if(document.getElementById('rotinaPetChoiceStyleV2'))return;
    const s=document.createElement('style');s.id='rotinaPetChoiceStyleV2';s.textContent=`
      #rotinaPetChoiceV2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 16px}
      .rpc2-card{border:2px solid #e6e6e6;background:#fff;border-radius:17px;padding:11px;display:grid;grid-template-columns:auto 1fr;gap:7px 9px;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.05)}
      .rpc2-card.active{border-color:var(--cor-primaria,#ff4d6d);box-shadow:0 0 0 2px rgba(255,77,109,.08)}
      .rpc2-icon{font-size:2rem;grid-row:1/3}.rpc2-name{font-weight:900;color:var(--cor-texto,#590d22);font-size:.96rem}.rpc2-status{font-size:.76rem;color:#777}
      .rpc2-actions{grid-column:1/3;display:flex;gap:7px}.rpc2-actions button{flex:1;border:0;border-radius:999px;padding:8px 9px;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}
      .rpc2-choose{background:#f2f4f7;color:#444}.rpc2-card.active .rpc2-choose{background:var(--cor-primaria,#ff4d6d);color:#fff}.rpc2-preview{background:#fff4dc;color:#7a5000;border:1px solid #f4d789!important}
      #rotinaPetPreviewV2{position:fixed;inset:0;z-index:27000;background:rgba(0,0,0,.66);display:none;align-items:center;justify-content:center;padding:14px}
      #rotinaPetPreviewV2.show{display:flex}.rpc2-modal{width:min(94vw,500px);background:#fff;border-radius:24px;padding:19px;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
      .rpc2-modal h3{margin:0 0 5px;color:#590d22}.rpc2-modal p{margin:0 0 14px;color:#666;font-size:.9rem}.rpc2-preview-actions{display:grid;gap:9px}
      .rpc2-preview-actions button{border:0;border-radius:14px;padding:12px;font:inherit;font-weight:850;cursor:pointer}.rpc2-task{background:#e9fbef;color:#15663f}.rpc2-day{background:#fff0f3;color:#a21439}.rpc2-sad{background:#eef3ff;color:#35508f}
      .rpc2-footer{display:flex;gap:9px;margin-top:13px}.rpc2-footer button{flex:1;border:0;border-radius:13px;padding:10px;font:inherit;font-weight:800;cursor:pointer}.rpc2-use{background:#ff4d6d;color:#fff}.rpc2-close{background:#eef0f3;color:#444}
      #rotinaDogPreviewV2{position:fixed;inset:0;z-index:27100;display:none;align-items:flex-end;justify-content:center;padding:0 18px 9vh;pointer-events:none;background:rgba(255,255,255,.01)}
      #rotinaDogPreviewV2.show{display:flex}#rotinaDogPreviewWrapV2{width:min(285px,72vw);transform-origin:50% 85%}#rotinaDogPreviewV2 svg{width:100%;height:auto;display:block;filter:drop-shadow(0 18px 14px rgba(44,24,18,.2))}
      #rotinaDogPreviewBubbleV2{position:absolute;left:50%;bottom:calc(9vh + 235px);transform:translateX(-50%);width:min(88vw,430px);background:#fff;border:3px solid #590d22;color:#590d22;border-radius:22px;padding:12px 14px;font-weight:900;line-height:1.3;text-align:center}
      #rotinaDogPreviewWrapV2.task{animation:rpc2Task 2.8s ease both}#rotinaDogPreviewWrapV2.day{animation:rpc2Day 4.1s ease both}#rotinaDogPreviewWrapV2.sad{animation:rpc2Sad 3s ease both}
      @keyframes rpc2Task{0%{transform:translateY(0)}18%{transform:translateY(-70px) rotate(-4deg)}38%{transform:translateY(0) rotate(3deg)}58%{transform:translateY(-35px) rotate(-2deg)}100%{transform:translateY(0)}}
      @keyframes rpc2Day{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(-90px) rotate(-8deg)}40%{transform:translateY(-25px) rotate(160deg)}62%{transform:translateY(-70px) rotate(330deg)}100%{transform:translateY(0) rotate(360deg)}}
      @keyframes rpc2Sad{0%,100%{transform:translateY(0)}30%{transform:translateY(7px) scale(.99)}60%{transform:translateY(4px) rotate(-1deg)}}
      @media(max-width:620px){#rotinaPetChoiceV2{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function dogSvg(){return `<svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg"><ellipse cx="182" cy="264" rx="78" ry="70" fill="#f5ece5"/><ellipse cx="181" cy="130" rx="78" ry="72" fill="#9a4727"/><path d="M125 95C94 74 62 82 61 111c2 23 23 43 46 34 14-12 22-32 18-50Z" fill="#7d351d"/><path d="M236 95c31-20 62-12 62 16-2 23-22 42-45 34-14-12-21-32-17-50Z" fill="#7d351d"/><path d="M164 61c10-4 23-4 33 0l12 55c-5 23-14 39-28 52-14-14-24-30-28-52Z" fill="#fffaf6"/><ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/><circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/><path d="M166 150c7-8 24-8 31 0-1 12-10 18-16 18s-15-6-15-18Z" fill="#1b171a"/><path d="M123 192c24 13 90 13 116 0l-7 27c-25 10-77 10-102 0Z" fill="#d7264f"/></svg>`;}
  function ensureDogPreview(){let l=document.getElementById('rotinaDogPreviewV2');if(l)return l;l=document.createElement('div');l.id='rotinaDogPreviewV2';l.innerHTML=`<div id="rotinaDogPreviewBubbleV2"></div><div id="rotinaDogPreviewWrapV2">${dogSvg()}</div>`;document.body.appendChild(l);return l;}
  function dogSound(sad=false){try{const a=new Audio(sad?'./cachorro-triste-choramingo.mp3?v=1':'./latido-cachorro-comemoracao.mp3?v=5');a.volume=1;a.play().catch(()=>{});}catch{}}
  function previewDog(kind){const l=ensureDogPreview(),w=l.querySelector('#rotinaDogPreviewWrapV2'),b=l.querySelector('#rotinaDogPreviewBubbleV2'),n=nome();w.className='';void w.offsetWidth;w.classList.add(kind);b.textContent=kind==='day'?`Parabéns, ${n}! Você finalizou bem o dia!`:kind==='sad'?`Poxa, ${n}! Você não conseguiu concluir essa tarefa dentro do seu horário.`:`Parabéns, ${n}! Você completou essa tarefa dentro do seu horário!`;l.classList.add('show');if(kind==='sad')dogSound(true);else{dogSound(false);setTimeout(()=>dogSound(false),440);if(kind==='day')setTimeout(()=>dogSound(false),900);}setTimeout(()=>l.classList.remove('show'),kind==='day'?4300:3300);}

  function modal(){
    let m=document.getElementById('rotinaPetPreviewV2');if(m)return m;
    m=document.createElement('div');m.id='rotinaPetPreviewV2';m.innerHTML=`<div class="rpc2-modal"><h3 data-title></h3><p>Veja as três reações antes de escolher.</p><div class="rpc2-preview-actions"><button class="rpc2-task" data-act="task">🐾 Tarefa concluída</button><button class="rpc2-day" data-act="day">🎉 Dia concluído</button><button class="rpc2-sad" data-act="sad">😢 Não conseguiu</button></div><div class="rpc2-footer"><button class="rpc2-close" data-close>Voltar</button><button class="rpc2-use" data-use>Usar mascote</button></div></div>`;document.body.appendChild(m);
    m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]')){m.classList.remove('show');return;}const act=e.target.closest('[data-act]');if(act){m.classList.remove('show');const type=m.dataset.pet;if(type==='cat')window.rotinaPreviewGatoV2?.(act.dataset.act);else previewDog(act.dataset.act);return;}if(e.target.closest('[data-use]')){setSelected(m.dataset.pet);m.classList.remove('show');}});return m;
  }
  function openPreview(type){const m=modal();m.dataset.pet=type;m.querySelector('[data-title]').textContent=type==='cat'?'🐱 Reações do gato 3D':'🐶 Reações do cachorro';m.querySelector('[data-use]').textContent=type==='cat'?'Usar o gato':'Usar o cachorro';m.classList.add('show');}

  function mount(){
    style();modal();const app=document.getElementById('telaApp');if(!app||document.getElementById('rotinaPetChoiceV2')){updateUI();return !!app;}
    const root=document.createElement('div');root.id='rotinaPetChoiceV2';root.innerHTML=`<div class="rpc2-card" data-card="dog"><div class="rpc2-icon">🐶</div><div><div class="rpc2-name">Cachorro</div><div class="rpc2-status" data-status="dog"></div></div><div class="rpc2-actions"><button class="rpc2-choose" data-choose="dog">Escolher</button><button class="rpc2-preview" data-preview="dog">▶ Ver reações</button></div></div><div class="rpc2-card" data-card="cat"><div class="rpc2-icon">🐱</div><div><div class="rpc2-name">Gato 3D</div><div class="rpc2-status" data-status="cat"></div></div><div class="rpc2-actions"><button class="rpc2-choose" data-choose="cat">Escolher</button><button class="rpc2-preview" data-preview="cat">▶ Ver reações</button></div></div>`;
    const anchor=app.querySelector('.dash-cards');if(anchor)anchor.before(root);else app.prepend(root);
    root.addEventListener('click',e=>{const c=e.target.closest('[data-choose]');if(c){setSelected(c.dataset.choose);return;}const p=e.target.closest('[data-preview]');if(p)openPreview(p.dataset.preview);});
    updateUI();log('mascote.escolha_cliente_pronta',{versao:VERSION});return true;
  }

  function boot(){if(!localStorage.getItem(prefKey()))localStorage.setItem(prefKey(),'dog');if(mount())return;let tries=0;const timer=setInterval(()=>{tries++;if(mount()||tries>=20)clearInterval(timer);},250);}
  window.addEventListener('rotina-client-session-ready',()=>{if(!localStorage.getItem(prefKey()))localStorage.setItem(prefKey(),'dog');mount();updateUI();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
