(()=>{
  const VERSION=2;
  const A={happyImg:'./cat-happy-tiny.webp.b64?v=1',sadImg:'./cat-sad-tiny.webp.b64?v=1',happyAudio:'./cat-happy-tiny.mp3.b64?v=1',sadAudio:'./cat-sad-tiny.mp3.b64?v=1'};
  const cache={};let queue=Promise.resolve();
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'amigo';
  const selected=()=>{try{return window.obterMascoteRotina?.()==='cat';}catch{return false;}};
  const log=(e,d={})=>{try{window.rotinaLog?.(e,d);}catch{}};
  async function asset(k,mime){if(cache[k])return cache[k];const r=await fetch(A[k],{cache:'force-cache'});if(!r.ok)throw new Error(`asset ${k}`);const b64=(await r.text()).trim();cache[k]=`data:${mime};base64,${b64}`;return cache[k];}
  async function play(k){try{const src=await asset(k,'audio/mpeg');const a=new Audio(src);a.volume=.95;await a.play().catch(()=>{});}catch(e){log('gato3d.audio_erro',{mensagem:String(e?.message||e)});}}
  function style(){if(document.getElementById('rotinaCat3dStyleV2'))return;const s=document.createElement('style');s.id='rotinaCat3dStyleV2';s.textContent=`
    [data-rotina-mascote="cat"] #rotinaDogCelebrationLayer{display:none!important}
    #rotinaCat3dLayerV2{position:fixed;inset:0;z-index:26900;display:none;align-items:flex-end;justify-content:center;padding:0 18px 8vh;pointer-events:none;background:rgba(255,255,255,.01)}#rotinaCat3dLayerV2.show{display:flex}
    #rotinaCat3dWrapV2{width:min(300px,74vw);transform-origin:50% 85%;position:relative}#rotinaCat3dImgV2{width:100%;height:auto;display:block;filter:drop-shadow(0 18px 14px rgba(44,24,18,.22))}
    #rotinaCat3dBubbleV2{position:absolute;left:50%;bottom:calc(8vh + 245px);transform:translateX(-50%);width:min(88vw,430px);background:#fff;border:3px solid #8a4b2e;color:#60331f;border-radius:22px;padding:13px 15px;text-align:center;font-weight:900;line-height:1.3;box-shadow:0 9px 24px rgba(0,0,0,.12)}
    #rotinaCat3dWrapV2.task{animation:cat2Task 2.8s ease both}#rotinaCat3dWrapV2.day{animation:cat2Day 4.2s ease both}#rotinaCat3dWrapV2.sad{animation:cat2Sad 3.2s ease both}
    @keyframes cat2Task{0%{transform:translateY(0) scale(1)}18%{transform:translateY(-68px) rotate(-3deg) scale(1.02)}38%{transform:translateY(4px) rotate(2deg) scale(.99)}58%{transform:translateY(-30px) rotate(-1deg)}100%{transform:translateY(0)}}
    @keyframes cat2Day{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(-88px) rotate(-7deg)}40%{transform:translateY(-24px) rotate(150deg)}62%{transform:translateY(-68px) rotate(325deg)}100%{transform:translateY(0) rotate(360deg)}}
    @keyframes cat2Sad{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(8px) rotate(-1.5deg) scale(.99)}60%{transform:translateY(5px) rotate(1deg)}}
    @media(max-width:600px){#rotinaCat3dWrapV2{width:min(255px,72vw)}#rotinaCat3dBubbleV2{bottom:calc(8vh + 215px);font-size:.96rem}}
  `;document.head.appendChild(s);}
  function layer(){style();let l=document.getElementById('rotinaCat3dLayerV2');if(l)return l;l=document.createElement('div');l.id='rotinaCat3dLayerV2';l.innerHTML='<div id="rotinaCat3dBubbleV2"></div><div id="rotinaCat3dWrapV2"><img id="rotinaCat3dImgV2" alt="Gato 3D do Rotina Family"></div>';document.body.appendChild(l);return l;}
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function run(kind,msg,force=false){if(!force&&!selected())return;const l=layer(),w=l.querySelector('#rotinaCat3dWrapV2'),b=l.querySelector('#rotinaCat3dBubbleV2'),img=l.querySelector('#rotinaCat3dImgV2');img.src=await asset(kind==='sad'?'sadImg':'happyImg','image/webp');b.textContent=msg;w.className='';void w.offsetWidth;w.classList.add(kind);l.classList.add('show');play(kind==='sad'?'sadAudio':'happyAudio');if(kind==='day')setTimeout(()=>play('happyAudio'),900);await sleep(kind==='day'?4300:3400);l.classList.remove('show');w.className='';}
  function enqueue(kind,msg,force=false){queue=queue.catch(()=>{}).then(()=>run(kind,msg,force));return queue;}
  window.rotinaPreviewGatoV2=kind=>{const n=nome();return enqueue(kind,kind==='day'?`Parabéns, ${n}! Você finalizou bem o dia!`:kind==='sad'?`Poxa, ${n}! Você não conseguiu concluir essa tarefa dentro do seu horário.`:`Parabéns, ${n}! Você completou essa tarefa dentro do seu horário!`,true);};
  window.tocarGatoTristeRotina=async()=>{if(!selected())return false;play('sadAudio');return true;};

  let previous=new Map(),baseline=false,lastDay=false;
  function isSuccess(s){return /No\s+Prazo/i.test(String(s||''));}
  function scan(){if(!selected())return;const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')],cur=new Map();rows.forEach(r=>{const id=String(r.dataset.familyTaskId||'');if(id)cur.set(id,String(r.dataset.familyTaskStatus||''));});if(baseline){cur.forEach((s,id)=>{const p=previous.get(id);if(p&&p!==s&&!isSuccess(p)&&isSuccess(s))enqueue('task',`Parabéns, ${nome()}! Você completou essa tarefa dentro do seu horário!`);});}previous=cur;baseline=true;
    const statuses=[...cur.values()],total=statuses.length,done=statuses.filter(s=>/No\s+Prazo|Atrasado/i.test(s)).length,pending=statuses.filter(s=>s==='Pendente'||s==='Em andamento').length;const txt=n=>Number(String(document.getElementById(n)?.textContent||'0').replace(/\D+/g,''))||0;const reached=total>0&&done===total&&pending===0&&txt('possivelHoje')>0&&txt('ptsHoje')>=txt('possivelHoje');if(reached&&!lastDay)enqueue('day',`Parabéns, ${nome()}! Você finalizou bem o dia!`);lastDay=reached;}
  window.addEventListener('rotina-family-tasks-rendered',scan);window.addEventListener('rotina-family-points-updated',scan);window.addEventListener('rotina-client-session-ready',()=>{previous.clear();baseline=false;lastDay=false;setTimeout(scan,0);});window.addEventListener('rotina-mascote-alterado',()=>{previous.clear();baseline=false;lastDay=false;setTimeout(scan,0);});
  window.addEventListener('rotina-task-zero',()=>{if(selected())enqueue('sad',`Poxa, ${nome()}! Você não conseguiu concluir essa tarefa dentro do seu horário!`);});
  function boot(){style();layer();Promise.allSettled([asset('happyImg','image/webp'),asset('sadImg','image/webp'),asset('happyAudio','audio/mpeg'),asset('sadAudio','audio/mpeg')]);log('gato3d.modulo_pronto',{versao:VERSION,semMutationObserver:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
