(()=>{
  'use strict';
  const VERSION=3;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{...detalhes,mascoteModulo:VERSION},nivel);}catch{}};
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'amigo';
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const prefKey=()=>`rotina_mascote_tipo_${profileKey()}`;
  const selected=()=>localStorage.getItem(prefKey())==='cat'?'cat':'dog';
  const pad=n=>String(n).padStart(2,'0');
  const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const taskSeenKey=id=>`rotina_mascote_v3_tarefa_${profileKey()}_${todayKey()}_${id}`;
  const daySeenKey=()=>`rotina_mascote_v3_dia_${profileKey()}_${todayKey()}`;
  const safeText=v=>String(v??'').replace(/\s+/g,' ').slice(0,160);
  const isSuccess=s=>/No\s+Prazo/i.test(String(s||''));
  const isDone=s=>/No\s+Prazo|Atrasado/i.test(String(s||''));
  const numberFromText=v=>{const m=String(v||'').replace(/\./g,'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0;};

  function setSelected(type){
    const value=type==='cat'?'cat':'dog';
    try{localStorage.setItem(prefKey(),value);}catch{}
    document.body?.setAttribute('data-rotina-mascote',value);
    updateChoiceUI();
    previous.clear();baseline=false;lastDay=false;
    window.dispatchEvent(new CustomEvent('rotina-mascote-alterado',{detail:{mascote:value,perfil:profileKey(),versao:VERSION}}));
    log('mascote.preferencia_alterada',{mascote:value,perfil:profileKey()});
    return value;
  }
  window.obterMascoteRotina=selected;
  window.definirMascoteRotina=setSelected;

  /* ---------- audio: um unico caminho, Web Audio ---------- */
  let audioCtx=null;
  const buffers=new Map();
  const loading=new Map();
  const AUDIO={
    dogHappy:{url:'./latido-cachorro-comemoracao.mp3?v=6',kind:'binary'},
    dogSad:{url:'./cachorro-triste-choramingo.mp3?v=3',kind:'binary'},
    catHappy:{url:'./cat-happy-tiny.mp3.b64?v=2',kind:'b64'},
    catSad:{url:'./cat-sad-tiny.mp3.b64?v=2',kind:'b64'}
  };
  function context(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    if(!audioCtx)audioCtx=new AC();
    return audioCtx;
  }
  function b64ToBytes(text){
    const raw=atob(String(text||'').trim());
    const out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out.buffer;
  }
  async function loadAudio(key){
    if(buffers.has(key))return buffers.get(key);
    if(loading.has(key))return loading.get(key);
    const meta=AUDIO[key];
    const p=(async()=>{
      const ctx=context();if(!ctx)throw new Error('Web Audio indisponivel');
      log('mascote.audio_carga_inicio',{audio:key,url:meta.url});
      const r=await fetch(meta.url,{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status} ao carregar ${key}`);
      const bytes=meta.kind==='b64'?b64ToBytes(await r.text()):await r.arrayBuffer();
      const buffer=await ctx.decodeAudioData(bytes.slice(0));
      buffers.set(key,buffer);
      log('mascote.audio_buffer_pronto',{audio:key,duracao:Number(buffer.duration.toFixed(3)),sampleRate:buffer.sampleRate});
      return buffer;
    })().catch(err=>{loading.delete(key);log('mascote.audio_carga_erro',{audio:key,mensagem:String(err?.message||err)},'error');throw err;});
    loading.set(key,p);return p;
  }
  function startBuffer(buffer,when,gainValue=1){
    const ctx=context();const source=ctx.createBufferSource();const gain=ctx.createGain();source.buffer=buffer;gain.gain.value=gainValue;source.connect(gain).connect(ctx.destination);source.start(when);return source;
  }
  async function playPattern(key,count=1,gap=.08){
    const started=performance.now();
    try{
      const ctx=context();if(!ctx)throw new Error('Web Audio indisponivel');
      if(ctx.state==='suspended')await ctx.resume();
      const buffer=await loadAudio(key);
      if(ctx.state==='suspended')await ctx.resume();
      if(ctx.state!=='running')throw new Error(`AudioContext ${ctx.state}`);
      let when=ctx.currentTime+.03;
      for(let i=0;i<count;i++){startBuffer(buffer,when,.98);when+=buffer.duration+gap;}
      log('mascote.audio_tocado',{audio:key,repeticoes:count,estado:ctx.state,tempoPreparacaoMs:Math.round(performance.now()-started)});
      return true;
    }catch(err){log('mascote.audio_reproducao_erro',{audio:key,mensagem:String(err?.message||err),estado:audioCtx?.state||'sem-contexto'},'error');return false;}
  }
  function unlock(){
    try{const ctx=context();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});Promise.allSettled(Object.keys(AUDIO).map(loadAudio));}catch{}
  }
  ['pointerdown','touchstart','click'].forEach(ev=>document.addEventListener(ev,unlock,{capture:true,passive:true}));
  window.tocarLatidoCachorroRotina=(taskId='',times=2)=>playPattern('dogHappy',Math.max(1,Number(times)||2),.08).then(ok=>{log('cachorro.latido_resultado',{tarefaId:String(taskId||''),ok});return ok;});
  window.tocarCachorroTristeRotina=(taskId='')=>playPattern('dogSad',3,0).then(ok=>{log('cachorro.triste_resultado',{tarefaId:String(taskId||''),ok});return ok;});

  /* ---------- assets do gato ---------- */
  const CAT_IMG={happy:'./cat-happy-tiny.webp.b64?v=2',sad:'./cat-sad-tiny.webp.b64?v=2'};
  const catImageCache={};
  async function catImage(kind){
    const k=kind==='sad'?'sad':'happy';if(catImageCache[k])return catImageCache[k];
    const r=await fetch(CAT_IMG[k],{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status} imagem gato ${k}`);
    const src=`data:image/webp;base64,${(await r.text()).trim()}`;catImageCache[k]=src;return src;
  }

  function dogSvg(){return `<svg id="rotinaMascotDogV3" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachorro mascote do Rotina Family"><defs><linearGradient id="m3w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient><linearGradient id="m3b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient></defs><g class="m3-tail"><path d="M245 243 C292 222 302 257 276 267" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M275 267 C286 270 291 264 292 256" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g><ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#m3w)"/><path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#m3w)"/><path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#m3w)"/><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#m3b)"/><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#m3b)"/><ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#m3b)"/><path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/><path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/><ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/><circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/><path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/><path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/><rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/></svg>`;}

  function ensureStyle(){
    if(document.getElementById('rotinaMascotStyleV3'))return;
    const s=document.createElement('style');s.id='rotinaMascotStyleV3';s.textContent=`
      #modalCelebracao,#rotinaMascoteRewardLayer,#rotinaDogCelebrationLayer,#rotinaCat3dLayerV2,#rotinaDogPreviewV2{display:none!important}
      #rotinaMascotLayerV3{position:fixed;inset:0;z-index:27500;display:none;align-items:flex-end;justify-content:center;padding:0 16px 8vh;pointer-events:none;background:rgba(255,255,255,.01);overflow:hidden}
      #rotinaMascotLayerV3.show{display:flex}.rm3-wrap{width:min(260px,62vw);max-height:58vh;transform-origin:50% 82%;display:flex;align-items:flex-end;justify-content:center}.rm3-wrap svg,.rm3-wrap img{display:block;max-width:100%;max-height:58vh;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 16px 13px rgba(44,24,18,.2))}
      .rm3-wrap.cat{width:min(235px,58vw)}.rm3-bubble{position:absolute;left:50%;bottom:calc(8vh + 225px);transform:translateX(-50%);width:min(88vw,430px);background:#fff;border:3px solid #590d22;color:#590d22;border-radius:22px;padding:12px 14px;text-align:center;font-weight:900;font-size:1rem;line-height:1.3;box-shadow:0 9px 24px rgba(0,0,0,.12)}
      .rm3-wrap.task{animation:rm3Task 2.8s ease both}.rm3-wrap.day{animation:rm3Day 4.1s ease both}.rm3-wrap.sad{animation:rm3Sad 3.1s ease both}.m3-tail{transform-origin:230px 248px;animation:rm3Tail .45s ease-in-out infinite alternate}
      @keyframes rm3Tail{from{transform:rotate(-14deg)}to{transform:rotate(18deg)}}@keyframes rm3Task{0%{transform:translateY(0)}18%{transform:translateY(-58px) rotate(-3deg)}38%{transform:translateY(0) rotate(2deg)}58%{transform:translateY(-26px) rotate(-1deg)}100%{transform:translateY(0)}}
      @keyframes rm3Day{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(-66px) rotate(-6deg)}40%{transform:translateY(-20px) rotate(145deg)}62%{transform:translateY(-52px) rotate(320deg)}100%{transform:translateY(0) rotate(360deg)}}@keyframes rm3Sad{0%,100%{transform:translateY(0)}35%{transform:translateY(8px) scale(.98)}65%{transform:translateY(5px) rotate(-1deg)}}
      #rotinaPetChoiceV3{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 16px}.rm3-card{border:2px solid #e6e6e6;background:#fff;border-radius:17px;padding:11px;display:grid;grid-template-columns:auto 1fr;gap:7px 9px;align-items:center}.rm3-card.active{border-color:var(--cor-primaria,#ff4d6d);box-shadow:0 0 0 2px rgba(255,77,109,.08)}.rm3-icon{font-size:2rem;grid-row:1/3}.rm3-name{font-weight:900}.rm3-status{font-size:.76rem;color:#777}.rm3-actions{grid-column:1/3;display:flex;gap:7px}.rm3-actions button{flex:1;border:0;border-radius:999px;padding:8px 9px;font:inherit;font-size:.8rem;font-weight:800}.rm3-choose{background:#f2f4f7}.rm3-card.active .rm3-choose{background:var(--cor-primaria,#ff4d6d);color:#fff}.rm3-preview{background:#fff4dc;color:#7a5000;border:1px solid #f4d789!important}
      #rotinaPetPreviewV3{position:fixed;inset:0;z-index:27400;background:rgba(0,0,0,.66);display:none;align-items:center;justify-content:center;padding:14px}#rotinaPetPreviewV3.show{display:flex}.rm3-modal{width:min(94vw,500px);background:#fff;border-radius:24px;padding:19px;text-align:center}.rm3-preview-actions{display:grid;gap:9px}.rm3-preview-actions button,.rm3-footer button{border:0;border-radius:14px;padding:11px;font:inherit;font-weight:850}.rm3-footer{display:flex;gap:9px;margin-top:13px}.rm3-footer button{flex:1}.rm3-use{background:#ff4d6d;color:#fff}.rm3-close{background:#eef0f3;color:#444}
      @media(max-width:620px){#rotinaPetChoiceV3{grid-template-columns:1fr}.rm3-wrap{width:min(225px,58vw);max-height:52vh}.rm3-wrap.cat{width:min(205px,54vw)}.rm3-wrap svg,.rm3-wrap img{max-height:52vh}.rm3-bubble{bottom:calc(8vh + 195px);font-size:.94rem}}
    `;document.head.appendChild(s);
  }
  function layer(){
    ensureStyle();let l=document.getElementById('rotinaMascotLayerV3');if(l)return l;
    l=document.createElement('div');l.id='rotinaMascotLayerV3';l.innerHTML='<div class="rm3-bubble" id="rotinaMascotBubbleV3"></div><div class="rm3-wrap" id="rotinaMascotWrapV3"></div>';document.body.appendChild(l);return l;
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));let queue=Promise.resolve();
  async function renderPet(type,kind){
    const wrap=layer().querySelector('#rotinaMascotWrapV3');wrap.innerHTML='';wrap.className=`rm3-wrap ${type} ${kind}`;
    if(type==='dog')wrap.innerHTML=dogSvg();
    else{const img=document.createElement('img');img.id='rotinaCatImgV3';img.alt='Gato 3D do Rotina Family';img.src=await catImage(kind==='sad'?'sad':'happy');wrap.appendChild(img);}
    return wrap;
  }
  async function playReactionAudio(type,kind){
    if(type==='dog')return kind==='sad'?playPattern('dogSad',3,0):playPattern('dogHappy',kind==='day'?3:2,.08);
    return kind==='sad'?playPattern('catSad',1,0):playPattern('catHappy',kind==='day'?2:1,.18);
  }
  async function runReaction(type,kind,message,{force=false,audio=true}={}){
    if(!force&&selected()!==type)return false;
    const l=layer(),bubble=l.querySelector('#rotinaMascotBubbleV3');
    l.classList.remove('show');await renderPet(type,kind);bubble.textContent=message;void l.offsetWidth;l.classList.add('show');
    log('mascote.reacao_inicio',{mascote:type,reacao:kind,mensagem:safeText(message),viewportW:innerWidth,viewportH:innerHeight});
    if(audio)playReactionAudio(type,kind);
    await sleep(kind==='day'?4300:3400);l.classList.remove('show');
    log('mascote.reacao_fim',{mascote:type,reacao:kind});return true;
  }
  function enqueue(type,kind,message,opts){queue=queue.catch(()=>{}).then(()=>runReaction(type,kind,message,opts));return queue;}

  function phrase(kind){const n=nome();return kind==='day'?`Parabéns, ${n}! Você finalizou bem o dia!`:kind==='sad'?`${n}, dessa vez você não conseguiu. Sua pontuação é 0%.`:`Parabéns, ${n}! Você completou essa tarefa dentro do seu horário!`;}
  window.rotinaPreviewMascoteV3=(type,kind)=>enqueue(type==='cat'?'cat':'dog',kind,phrase(kind),{force:true,audio:true});

  /* ---------- escolha e preview ---------- */
  function updateChoiceUI(){
    const type=selected();document.body?.setAttribute('data-rotina-mascote',type);
    const root=document.getElementById('rotinaPetChoiceV3');if(!root)return;
    root.querySelectorAll('[data-card]').forEach(c=>c.classList.toggle('active',c.dataset.card===type));
    root.querySelectorAll('[data-status]').forEach(s=>s.textContent=s.dataset.status===type?'Selecionado':'Disponível');
    root.querySelectorAll('[data-choose]').forEach(b=>b.textContent=b.dataset.choose===type?'Selecionado ✓':'Escolher');
  }
  function previewModal(){
    let m=document.getElementById('rotinaPetPreviewV3');if(m)return m;
    m=document.createElement('div');m.id='rotinaPetPreviewV3';m.innerHTML='<div class="rm3-modal"><h3 data-title></h3><p>Veja as três reações antes de escolher.</p><div class="rm3-preview-actions"><button data-act="task">🐾 Tarefa concluída</button><button data-act="day">🎉 Dia concluído</button><button data-act="sad">😢 Não conseguiu</button></div><div class="rm3-footer"><button class="rm3-close" data-close>Voltar</button><button class="rm3-use" data-use>Usar mascote</button></div></div>';document.body.appendChild(m);
    m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]')){m.classList.remove('show');return;}const act=e.target.closest('[data-act]');if(act){const pet=m.dataset.pet;m.classList.remove('show');window.rotinaPreviewMascoteV3(pet,act.dataset.act);return;}if(e.target.closest('[data-use]')){setSelected(m.dataset.pet);m.classList.remove('show');}});return m;
  }
  function mountChoice(){
    ensureStyle();previewModal();const app=document.getElementById('telaApp');if(!app)return false;
    document.getElementById('rotinaPetChoiceV2')?.remove();
    if(document.getElementById('rotinaPetChoiceV3')){updateChoiceUI();return true;}
    const root=document.createElement('div');root.id='rotinaPetChoiceV3';root.innerHTML='<div class="rm3-card" data-card="dog"><div class="rm3-icon">🐶</div><div><div class="rm3-name">Cachorro</div><div class="rm3-status" data-status="dog"></div></div><div class="rm3-actions"><button class="rm3-choose" data-choose="dog">Escolher</button><button class="rm3-preview" data-preview="dog">▶ Ver reações</button></div></div><div class="rm3-card" data-card="cat"><div class="rm3-icon">🐱</div><div><div class="rm3-name">Gato 3D</div><div class="rm3-status" data-status="cat"></div></div><div class="rm3-actions"><button class="rm3-choose" data-choose="cat">Escolher</button><button class="rm3-preview" data-preview="cat">▶ Ver reações</button></div></div>';
    const anchor=app.querySelector('.dash-cards');if(anchor)anchor.before(root);else app.prepend(root);
    root.addEventListener('click',e=>{const c=e.target.closest('[data-choose]');if(c){setSelected(c.dataset.choose);return;}const p=e.target.closest('[data-preview]');if(p){const m=previewModal();m.dataset.pet=p.dataset.preview;m.querySelector('[data-title]').textContent=p.dataset.preview==='cat'?'🐱 Reações do gato 3D':'🐶 Reações do cachorro';m.querySelector('[data-use]').textContent=p.dataset.preview==='cat'?'Usar o gato':'Usar o cachorro';m.classList.add('show');}});
    updateChoiceUI();log('mascote.escolha_cliente_pronta',{versao:VERSION});return true;
  }

  /* ---------- gatilhos reais ---------- */
  const previous=new Map();let baseline=false,lastDay=false,currentDay=todayKey(),lastSignature='';
  function blockLegacy(rows){
    try{const dias=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];sessionStorage.setItem(`parabens_mostrado_${dias[new Date().getDay()]}`,'mascote-v3');localStorage.setItem(`rotina_mascote_100_${profileKey()}_${todayKey()}`,'mascote-v3');rows.forEach(r=>{const id=String(r.dataset.familyTaskId||'');if(id)localStorage.setItem(`rotina_mascote_tarefa_${profileKey()}_${todayKey()}_${id}`,'mascote-v3');});}catch{}
    document.getElementById('modalCelebracao')?.style.setProperty('display','none','important');
  }
  function dailySnapshot(){
    const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')],statuses=rows.map(r=>String(r.dataset.familyTaskStatus||''));const total=rows.length,pendentes=statuses.filter(s=>s==='Pendente').length,emAndamento=statuses.filter(s=>s==='Em andamento').length,concluidas=statuses.filter(isDone).length,earned=numberFromText(document.getElementById('ptsHoje')?.textContent),possible=numberFromText(document.getElementById('possivelHoje')?.textContent),reached=total>0&&pendentes===0&&emAndamento===0&&concluidas===total&&possible>0&&earned>=possible;return{rows,total,pendentes,emAndamento,concluidas,earned,possible,reached};
  }
  function evaluateDay(){
    const s=dailySnapshot();blockLegacy(s.rows);const sig=[s.total,s.pendentes,s.emAndamento,s.concluidas,s.earned,s.possible,s.reached,selected()].join('|');if(sig!==lastSignature){lastSignature=sig;log('mascote.dia_avaliado',{...s,rows:undefined,mascote:selected()});}
    if(s.reached&&!localStorage.getItem(daySeenKey())){localStorage.setItem(daySeenKey(),'1');const type=selected();log('mascote.dia_comemoracao_disparada',{mascote:type});enqueue(type,'day',phrase('day'),{audio:true});}lastDay=s.reached;return s;
  }
  function scan(){
    if(todayKey()!==currentDay){currentDay=todayKey();previous.clear();baseline=false;lastDay=false;lastSignature='';}
    const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')];blockLegacy(rows);const cur=new Map();rows.forEach(r=>{const id=String(r.dataset.familyTaskId||'').trim();if(id)cur.set(id,String(r.dataset.familyTaskStatus||''));});
    if(baseline)cur.forEach((status,id)=>{const prev=previous.get(id);if(prev&&prev!==status&&!isSuccess(prev)&&isSuccess(status)&&!localStorage.getItem(taskSeenKey(id))){localStorage.setItem(taskSeenKey(id),'1');const type=selected();log('mascote.tarefa_comemoracao_disparada',{mascote:type,tarefaId:id,statusAnterior:prev,statusAtual:status});enqueue(type,'task',phrase('task'),{audio:true});}});
    previous.clear();cur.forEach((v,k)=>previous.set(k,v));baseline=true;evaluateDay();
  }
  function reset(){previous.clear();baseline=false;lastDay=false;lastSignature='';setTimeout(scan,0);}
  window.avaliarMetaDiariaMascote=evaluateDay;
  window.addEventListener('rotina-family-tasks-rendered',scan);window.addEventListener('rotina-family-points-updated',evaluateDay);window.addEventListener('rotina-client-session-ready',()=>{mountChoice();reset();});window.addEventListener('rotina-mascote-alterado',reset);
  window.addEventListener('rotina-task-zero',e=>{const type=selected();const audio=type==='cat'||e.detail?.audioHandled!==true;enqueue(type,'sad',phrase('sad'),{audio});});

  function boot(){
    if(!localStorage.getItem(prefKey()))localStorage.setItem(prefKey(),'dog');document.body?.setAttribute('data-rotina-mascote',selected());ensureStyle();layer();mountChoice();
    const tbody=document.getElementById('tabelaCorpo');if(tbody&&!tbody.dataset.mascotV3Observed){tbody.dataset.mascotV3Observed='1';new MutationObserver(()=>setTimeout(scan,0)).observe(tbody,{childList:true,subtree:true,attributes:true,attributeFilter:['data-family-task-status']});}
    scan();Promise.allSettled([catImage('happy'),catImage('sad'),...Object.keys(AUDIO).map(loadAudio)]);log('mascote.modulo_v3_pronto',{versao:VERSION,semObservadorGlobal:true,moduloUnico:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
