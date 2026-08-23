(()=>{
  const VERSION=1;
  const ASSETS={happyImg:'./cat-happy-tiny.webp.b64',sadImg:'./cat-sad-tiny.webp.b64',happyAudio:'./cat-happy-tiny.mp3.b64',sadAudio:'./cat-sad-tiny.mp3.b64'};
  const loaded={};
  const pad=n=>String(n).padStart(2,'0');
  const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const preferenceKey=()=>`rotina_mascote_tipo_${profileKey()}`;
  const taskKey=id=>`rotina_gato3d_v1_tarefa_${profileKey()}_${todayKey()}_${id}`;
  const dayKey=()=>`rotina_gato3d_v1_dia_${profileKey()}_${todayKey()}`;
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'amigo';
  const selected=()=>{try{return window.obterMascoteRotina?.()||localStorage.getItem(preferenceKey())||'dog';}catch{return 'dog';}};
  const isSuccess=s=>/No\s+Prazo/i.test(String(s||''));
  const isDone=s=>/No\s+Prazo|Atrasado/i.test(String(s||''));
  const numberFromText=value=>{const m=String(value||'').replace(/\./g,'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0;};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const states=new Map();let baseline=false,currentDay=todayKey(),queue=Promise.resolve(),lastDaily='';

  function log(evento,detalhes={},nivel='info'){try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}}
  async function asset(name,mime){
    if(loaded[name])return loaded[name];
    const b64=(await fetch(ASSETS[name],{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error(`asset ${name}: ${r.status}`);return r.text();})).trim();
    const bin=atob(b64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    loaded[name]=URL.createObjectURL(new Blob([bytes],{type:mime}));return loaded[name];
  }
  async function preload(){try{await Promise.all([asset('happyImg','image/webp'),asset('sadImg','image/webp'),asset('happyAudio','audio/mpeg'),asset('sadAudio','audio/mpeg')]);}catch(e){log('gato3d.asset_erro',{mensagem:String(e?.message||e),versao:VERSION},'error');}}

  function ensureStyle(){
    if(document.getElementById('rotinaCat3dStyleV1'))return;
    const s=document.createElement('style');s.id='rotinaCat3dStyleV1';s.textContent=`
      body[data-rotina-mascote="cat"] #rotinaDogCelebrationLayer{display:none!important}
      #rotinaCat3dLayer{position:fixed;inset:0;z-index:25620;display:none;align-items:flex-end;justify-content:center;padding:0 18px 8vh;pointer-events:none;overflow:hidden;background:rgba(255,255,255,.01)}
      #rotinaCat3dLayer.show{display:flex}#rotinaCat3dWrap{position:relative;width:min(315px,76vw);transform-origin:50% 88%;will-change:transform}
      #rotinaCat3dImg{display:block;width:100%;height:auto;filter:drop-shadow(0 19px 13px rgba(50,24,12,.28));user-select:none;-webkit-user-drag:none}
      #rotinaCat3dShadow{position:absolute;left:50%;bottom:-1px;width:68%;height:24px;border-radius:50%;background:rgba(45,22,14,.28);filter:blur(8px);transform:translateX(-50%);z-index:-1}
      #rotinaCat3dBubble{position:absolute;left:50%;bottom:calc(8vh + 290px);transform:translateX(-50%) scale(.9);width:min(90vw,450px);background:#fffaf5;border:3px solid #ff9f1c;color:#4a2a1d;border-radius:22px;padding:13px 15px;text-align:center;font-weight:900;font-size:1.02rem;line-height:1.32;opacity:0;box-shadow:0 10px 26px rgba(0,0,0,.14);z-index:2}
      #rotinaCat3dBubble:after{content:'';position:absolute;left:50%;bottom:-17px;width:28px;height:28px;background:#fffaf5;border-right:3px solid #ff9f1c;border-bottom:3px solid #ff9f1c;transform:translateX(-50%) rotate(45deg)}
      #rotinaCat3dBubble.show{animation:catBubbleV1 3.9s ease both}#rotinaCat3dWrap.task{animation:catTaskV1 2.9s cubic-bezier(.2,.72,.22,1) both}#rotinaCat3dWrap.day{animation:catDayV1 4.15s cubic-bezier(.2,.68,.2,1) both}#rotinaCat3dWrap.sad{animation:catSadV1 3.2s ease-in-out both}
      #rotinaCat3dConfetti{position:absolute;inset:0;pointer-events:none;overflow:hidden}#rotinaCat3dConfetti i{position:absolute;top:-25px;width:9px;height:14px;border-radius:3px;animation:catFallV1 3s linear forwards}
      #guardZeroFeedbackV2 .guard-zero-cat-fallback{font-size:0!important;line-height:0!important}#guardZeroFeedbackV2 .rotina-cat3d-sad-inline{display:block;width:min(210px,52vw);height:auto;margin:-8px auto 2px;filter:drop-shadow(0 12px 10px rgba(44,24,18,.18));animation:catSadInlineV1 2.4s ease-in-out infinite}
      @keyframes catBubbleV1{0%{opacity:0;transform:translateX(-50%) translateY(10px) scale(.75)}12%,84%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.92)}}
      @keyframes catTaskV1{0%{transform:translateY(0) rotate(0) scale(1)}9%{transform:translateY(8px) rotate(-1deg) scale(1.045,.93)}28%{transform:translateY(-112px) rotate(-5deg) scale(.98,1.035)}46%{transform:translateY(-45px) rotate(3deg)}60%{transform:translateY(6px) rotate(0) scale(1.055,.92)}74%{transform:translateY(-26px) rotate(-2deg)}100%{transform:translateY(0) rotate(0) scale(1)}}
      @keyframes catDayV1{0%{transform:translateY(0) rotate(0) scale(1)}8%{transform:translateY(8px) rotate(-2deg) scale(1.05,.92)}24%{transform:translateY(-125px) rotate(-12deg)}44%{transform:translate(34px,-92px) rotate(118deg)}63%{transform:translate(-26px,-66px) rotate(248deg)}79%{transform:translateY(-20px) rotate(358deg)}88%{transform:translateY(7px) rotate(360deg) scale(1.065,.91)}100%{transform:translateY(0) rotate(360deg) scale(1)}}
      @keyframes catSadV1{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(8px) rotate(-1.5deg) scaleY(.985)}60%{transform:translateY(5px) rotate(1deg)}}@keyframes catSadInlineV1{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(6px) rotate(-1deg)}}@keyframes catFallV1{to{transform:translateY(110vh) rotate(720deg);opacity:.12}}
      @media(max-width:600px){#rotinaCat3dLayer{padding-bottom:10vh}#rotinaCat3dWrap{width:min(275px,78vw)}#rotinaCat3dBubble{bottom:calc(10vh + 255px);font-size:.96rem}}`;
    document.head.appendChild(s);
  }

  function ensureLayer(){ensureStyle();let layer=document.getElementById('rotinaCat3dLayer');if(layer)return layer;layer=document.createElement('div');layer.id='rotinaCat3dLayer';layer.innerHTML='<div id="rotinaCat3dConfetti"></div><div id="rotinaCat3dBubble"></div><div id="rotinaCat3dWrap"><div id="rotinaCat3dShadow"></div><img id="rotinaCat3dImg" alt="Gato 3D do Rotina Family"></div>';document.body.appendChild(layer);return layer;}
  async function playAsset(name,volume=1,delay=0){setTimeout(async()=>{try{const a=new Audio(await asset(name,'audio/mpeg'));a.preload='auto';a.volume=volume;a.play().catch(()=>{});}catch{}},delay);}
  function confetti(count=60){const root=ensureLayer().querySelector('#rotinaCat3dConfetti');root.innerHTML='';const colors=['#ff4d6d','#ffd166','#06d6a0','#118ab2','#8338ec','#fb5607','#fff0a8'];for(let i=0;i<count;i++){const el=document.createElement('i');el.style.left=`${Math.random()*100}%`;el.style.background=colors[Math.floor(Math.random()*colors.length)];el.style.animationDelay=`${Math.random()*.65}s`;el.style.animationDuration=`${2.2+Math.random()*1.5}s`;root.appendChild(el);}setTimeout(()=>root.innerHTML='',4300);}

  async function run(kind,message){
    const layer=ensureLayer(),wrap=layer.querySelector('#rotinaCat3dWrap'),img=layer.querySelector('#rotinaCat3dImg'),bubble=layer.querySelector('#rotinaCat3dBubble');
    layer.classList.remove('show');wrap.classList.remove('task','day','sad');bubble.classList.remove('show');void layer.offsetWidth;
    img.src=await asset(kind==='sad'?'sadImg':'happyImg','image/webp');img.alt=kind==='sad'?'Gato 3D triste do Rotina Family':'Gato 3D feliz do Rotina Family';bubble.textContent=message;layer.classList.add('show');wrap.classList.add(kind);bubble.classList.add('show');
    if(kind==='sad')playAsset('sadAudio',.95);else{confetti(kind==='day'?105:65);playAsset('happyAudio',kind==='day'?1:.95);if(kind==='day')playAsset('happyAudio',.82,1150);}
    await sleep(kind==='day'?4300:kind==='sad'?3450:3100);layer.classList.remove('show');wrap.classList.remove(kind);bubble.classList.remove('show');
  }
  function enqueue(kind,message){queue=queue.catch(()=>{}).then(()=>run(kind,message));return queue;}

  function dailySnapshot(){const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')],statuses=rows.map(r=>String(r.dataset.familyTaskStatus||'').trim());const total=rows.length,pendentes=statuses.filter(s=>s==='Pendente').length,emAndamento=statuses.filter(s=>s==='Em andamento').length,concluidas=statuses.filter(isDone).length;const earned=numberFromText(document.getElementById('ptsHoje')?.textContent),possible=numberFromText(document.getElementById('possivelHoje')?.textContent);return {rows,total,pendentes,emAndamento,concluidas,earned,possible,reached:total>0&&pendentes===0&&emAndamento===0&&concluidas===total&&possible>0&&earned>=possible};}
  function evaluateDaily(){const s=dailySnapshot(),sig=[s.total,s.pendentes,s.emAndamento,s.concluidas,s.earned,s.possible,s.reached].join('|');if(sig!==lastDaily){lastDaily=sig;if(selected()==='cat')log('gato3d.dia_avaliado',{total:s.total,concluidas:s.concluidas,earned:s.earned,possible:s.possible,reached:s.reached,versao:VERSION});}if(selected()==='cat'&&s.reached&&!localStorage.getItem(dayKey())){localStorage.setItem(dayKey(),'1');enqueue('day',`Parabéns, ${nome()}! Você finalizou bem o dia!`);log('gato3d.dia_comemoracao_disparada',{nome:nome(),versao:VERSION});}return s;}
  function scan(){if(todayKey()!==currentDay){currentDay=todayKey();states.clear();baseline=false;lastDaily='';}const current=new Map();document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]').forEach(row=>{const id=String(row.dataset.familyTaskId||'').trim(),status=String(row.dataset.familyTaskStatus||'').trim();if(id)current.set(id,status);});if(baseline&&selected()==='cat')current.forEach((status,id)=>{const prev=states.get(id);if(prev&&prev!==status&&!isSuccess(prev)&&isSuccess(status)&&!localStorage.getItem(taskKey(id))){localStorage.setItem(taskKey(id),'1');enqueue('task',`Parabéns, ${nome()}! Você completou essa tarefa dentro do seu horário!`);log('gato3d.tarefa_comemoracao_disparada',{tarefaId:id,nome:nome(),versao:VERSION});}});states.clear();current.forEach((v,k)=>states.set(k,v));baseline=true;evaluateDaily();}

  async function replaceSadFallback(){if(selected()!=='cat')return;const fallback=document.querySelector('#guardZeroFeedbackV2 .guard-zero-cat-fallback');if(!fallback||fallback.querySelector('img'))return;const src=await asset('sadImg','image/webp');fallback.innerHTML=`<img class="rotina-cat3d-sad-inline" src="${src}" alt="Gato 3D triste">`;}
  function syncSelected(){ensureStyle();if(document.body)document.body.dataset.rotinaMascote=selected()==='cat'?'cat':'dog';replaceSadFallback();}

  const originalPlay=HTMLMediaElement.prototype.play;
  if(!HTMLMediaElement.prototype.__rotinaCatMutePatched){HTMLMediaElement.prototype.play=function(){const src=String(this.currentSrc||this.src||'');const previewDog=document.getElementById('rotinaDogPreviewLayerV1')?.classList.contains('show')===true;if(selected()==='cat'&&!previewDog&&(src.includes('latido-cachorro-comemoracao.mp3')||src.includes('cachorro-triste-choramingo.mp3')))return Promise.resolve();return originalPlay.call(this);};HTMLMediaElement.prototype.__rotinaCatMutePatched=true;}

  window.tocarGatoTristeRotina=async()=>{if(selected()!=='cat')return false;playAsset('sadAudio',.95);return true;};
  window.rotinaPreviewGato=kind=>{const n=nome();if(kind==='day')return enqueue('day',`Parabéns, ${n}! Você finalizou bem o dia!`);if(kind==='sad')return enqueue('sad',`Poxa, ${n}! Você não conseguiu concluir essa tarefa dentro do seu horário.`);return enqueue('task',`Parabéns, ${n}! Você completou essa tarefa dentro do seu horário!`);};

  window.addEventListener('rotina-mascote-alterado',()=>{syncSelected();scan();});window.addEventListener('rotina-family-tasks-rendered',scan);window.addEventListener('rotina-family-points-updated',evaluateDaily);window.addEventListener('rotina-client-session-ready',()=>{states.clear();baseline=false;lastDaily='';setTimeout(()=>{syncSelected();scan();},0);});window.addEventListener('rotina-task-zero',()=>{if(selected()==='cat'){replaceSadFallback();playAsset('sadAudio',.95);}});
  function start(){ensureLayer();preload();syncSelected();scan();new MutationObserver(()=>{syncSelected();replaceSadFallback();}).observe(document.body,{childList:true,subtree:true});setInterval(scan,900);log('gato3d.modulo_pronto',{versao:VERSION});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();