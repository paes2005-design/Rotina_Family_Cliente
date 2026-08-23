(()=>{
  const VERSION=2;
  const pad=n=>String(n).padStart(2,'0');
  const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
  const taskSeenKey=id=>`rotina_cachorro_v2_tarefa_${profileKey()}_${todayKey()}_${id}`;
  const daySeenKey=()=>`rotina_cachorro_v2_dia_${profileKey()}_${todayKey()}`;
  const legacyTaskSeenKey=id=>`rotina_mascote_tarefa_${profileKey()}_${todayKey()}_${id}`;
  const legacyDaySeenKey=()=>`rotina_mascote_100_${profileKey()}_${todayKey()}`;
  const dias=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const legacyCelebrationKey=()=>`parabens_mostrado_${dias[new Date().getDay()]}`;
  const states=new Map();
  let baselineReady=false;
  let currentDay=todayKey();
  let queue=Promise.resolve();
  let lastDailySignature='';

  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}};
  const nome=()=>String(localStorage.getItem('cliente_nome')||'').trim()||'Parabéns';
  const numberFromText=value=>{const n=String(value||'').replace(/\./g,'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return n?Number(n[0]):0;};
  const isSuccess=status=>/No\s+Prazo/i.test(String(status||''));
  const isDone=status=>/No\s+Prazo|Atrasado/i.test(String(status||''));

  function dogSvg(){return `<svg id="rotinaDogCelebrationSvg" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachorro mascote do Rotina Family">
    <defs><linearGradient id="dcWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient><linearGradient id="dcBrown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient></defs>
    <g class="dc-tail"><path d="M245 243 C292 222 302 257 276 267" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M275 267 C286 270 291 264 292 256" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g>
    <ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#dcWhite)"/><path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#dcWhite)"/><path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#dcWhite)"/>
    <g class="dc-ear-l"><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#dcBrown)"/></g><g class="dc-ear-r"><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#dcBrown)"/></g>
    <ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#dcBrown)"/><path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/><path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/>
    <ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/><circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/><path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/>
    <g class="dc-jaw"><path d="M164 167 C170 176 192 176 198 167 C198 184 190 193 181 193 C172 193 164 184 164 167 Z" fill="#f7f1ec"/><path d="M176 182 C180 187 184 187 188 182" fill="#ef7181"/></g>
    <path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/><rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/>
  </svg>`;}

  function ensureStyle(){
    if(document.getElementById('rotinaDogCelebrationStyle'))return;
    const s=document.createElement('style');s.id='rotinaDogCelebrationStyle';
    s.textContent=`
      #modalCelebracao{display:none!important}
      #rotinaMascoteRewardLayer{display:none!important}
      #rotinaDogCelebrationLayer{position:fixed;inset:0;z-index:25500;display:none;align-items:flex-end;justify-content:center;padding:0 18px 8vh;pointer-events:none;overflow:hidden;background:rgba(255,255,255,.01)}
      #rotinaDogCelebrationLayer.show{display:flex}
      #rotinaDogCelebrationWrap{width:min(300px,72vw);transform-origin:50% 84%;position:relative}
      #rotinaDogCelebrationSvg{width:100%;height:auto;display:block;filter:drop-shadow(0 18px 14px rgba(44,24,18,.2))}
      #rotinaDogCelebrationBubble{position:absolute;left:50%;bottom:calc(8vh + 245px);transform:translateX(-50%) scale(.9);width:min(88vw,430px);background:#fff;border:3px solid #590d22;color:#590d22;border-radius:22px;padding:13px 15px;text-align:center;font-weight:900;font-size:1.02rem;line-height:1.3;opacity:0;box-shadow:0 9px 24px rgba(0,0,0,.12);z-index:2}
      #rotinaDogCelebrationBubble:after{content:'';position:absolute;left:50%;bottom:-17px;width:28px;height:28px;background:#fff;border-right:3px solid #590d22;border-bottom:3px solid #590d22;transform:translateX(-50%) rotate(45deg)}
      #rotinaDogCelebrationBubble.show{animation:dcBubble 3.9s ease both}
      #rotinaDogCelebrationWrap.task{animation:dcTask 2.8s ease both}
      #rotinaDogCelebrationWrap.day{animation:dcDay 4.2s ease both}
      #rotinaDogCelebrationSvg .dc-tail{transform-origin:230px 248px;animation:dcTail .45s ease-in-out infinite alternate}
      #rotinaDogCelebrationConfetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
      #rotinaDogCelebrationConfetti i{position:absolute;top:-24px;width:9px;height:14px;border-radius:3px;animation:dcFall 2.8s linear forwards}
      @keyframes dcBubble{0%{opacity:0;transform:translateX(-50%) translateY(10px) scale(.72)}12%,84%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.92)}}
      @keyframes dcTail{from{transform:rotate(-14deg)}to{transform:rotate(18deg)}}
      @keyframes dcTask{0%{transform:translateY(0)}18%{transform:translateY(-70px) rotate(-4deg)}38%{transform:translateY(0) rotate(3deg)}58%{transform:translateY(-35px) rotate(-2deg)}100%{transform:translateY(0)}}
      @keyframes dcDay{0%{transform:translateY(0) rotate(0)}18%{transform:translateY(-90px) rotate(-8deg)}40%{transform:translateY(-25px) rotate(160deg)}62%{transform:translateY(-70px) rotate(330deg)}100%{transform:translateY(0) rotate(360deg)}}
      @keyframes dcFall{to{transform:translateY(110vh) rotate(720deg);opacity:.12}}
      @media(max-width:600px){#rotinaDogCelebrationLayer{padding-bottom:10vh}#rotinaDogCelebrationWrap{width:min(255px,72vw)}#rotinaDogCelebrationBubble{bottom:calc(10vh + 215px);font-size:.96rem}}
    `;
    document.head.appendChild(s);
  }

  function ensureLayer(){
    ensureStyle();
    let layer=document.getElementById('rotinaDogCelebrationLayer');
    if(layer)return layer;
    layer=document.createElement('div');layer.id='rotinaDogCelebrationLayer';
    layer.innerHTML=`<div id="rotinaDogCelebrationConfetti"></div><div id="rotinaDogCelebrationBubble"></div><div id="rotinaDogCelebrationWrap">${dogSvg()}</div>`;
    document.body.appendChild(layer);
    return layer;
  }

  function playBark(times=2){
    for(let i=0;i<times;i++)setTimeout(()=>{
      try{const a=new Audio('./latido-cachorro-comemoracao.mp3?v=5');a.preload='auto';a.volume=1;a.play().catch(()=>{});}catch{}
    },i*440);
  }

  function confetti(count=55){
    const root=ensureLayer().querySelector('#rotinaDogCelebrationConfetti');
    root.innerHTML='';
    const colors=['#ff4d6d','#ffd166','#06d6a0','#118ab2','#8338ec','#fb5607'];
    for(let i=0;i<count;i++){
      const el=document.createElement('i');
      el.style.left=`${Math.random()*100}%`;
      el.style.background=colors[Math.floor(Math.random()*colors.length)];
      el.style.animationDelay=`${Math.random()*.65}s`;
      el.style.animationDuration=`${2.2+Math.random()*1.4}s`;
      root.appendChild(el);
    }
    setTimeout(()=>{root.innerHTML='';},4300);
  }

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function run(kind,message){
    const layer=ensureLayer(),wrap=layer.querySelector('#rotinaDogCelebrationWrap'),bubble=layer.querySelector('#rotinaDogCelebrationBubble');
    layer.classList.remove('show');wrap.classList.remove('task','day');bubble.classList.remove('show');
    void layer.offsetWidth;
    bubble.textContent=message;
    layer.classList.add('show');wrap.classList.add(kind);bubble.classList.add('show');
    confetti(kind==='day'?90:55);playBark(kind==='day'?3:2);
    await sleep(kind==='day'?4300:3000);
    layer.classList.remove('show');wrap.classList.remove(kind);bubble.classList.remove('show');
  }
  function enqueue(kind,message){queue=queue.catch(()=>{}).then(()=>run(kind,message));return queue;}

  function blockLegacy(rows=[]){
    try{
      localStorage.setItem(legacyDaySeenKey(),'dog-v2');
      sessionStorage.setItem(legacyCelebrationKey(),'dog-v2');
      rows.forEach(row=>{const id=String(row.dataset.familyTaskId||'').trim();if(id)localStorage.setItem(legacyTaskSeenKey(id),'dog-v2');});
    }catch{}
    const modal=document.getElementById('modalCelebracao');if(modal)modal.style.display='none';
  }

  function dailySnapshot(){
    const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')];
    const statuses=rows.map(r=>String(r.dataset.familyTaskStatus||'').trim());
    const total=rows.length;
    const pendentes=statuses.filter(s=>s==='Pendente').length;
    const emAndamento=statuses.filter(s=>s==='Em andamento').length;
    const concluidas=statuses.filter(isDone).length;
    const earned=numberFromText(document.getElementById('ptsHoje')?.textContent);
    const possible=numberFromText(document.getElementById('possivelHoje')?.textContent);
    const pontosCompletos=possible>0&&earned>=possible;
    const todasConcluidas=total>0&&pendentes===0&&emAndamento===0&&concluidas===total;
    return {rows,statuses,total,pendentes,emAndamento,concluidas,earned,possible,pontosCompletos,todasConcluidas,reached:todasConcluidas&&pontosCompletos};
  }

  function evaluateDailyGoal(){
    const s=dailySnapshot();blockLegacy(s.rows);
    const signature=[s.total,s.pendentes,s.emAndamento,s.concluidas,s.earned,s.possible,s.reached].join('|');
    if(signature!==lastDailySignature){
      lastDailySignature=signature;
      log('cachorro.dia_avaliado',{totalTarefas:s.total,concluidas:s.concluidas,pendentes:s.pendentes,emAndamento:s.emAndamento,pontosGanhos:s.earned,pontosPossiveis:s.possible,pontosCompletos:s.pontosCompletos,diaConcluido:s.reached,versao:VERSION});
    }
    if(s.reached&&!localStorage.getItem(daySeenKey())){
      localStorage.setItem(daySeenKey(),'1');
      log('cachorro.dia_comemoracao_disparada',{nome:nome(),totalTarefas:s.total,pontosGanhos:s.earned,pontosPossiveis:s.possible,versao:VERSION});
      enqueue('day',`Parabéns, ${nome()}! Você finalizou bem o dia!`);
    }
    return s;
  }
  window.avaliarMetaDiariaMascote=evaluateDailyGoal;

  function scanTransitions(){
    if(todayKey()!==currentDay){currentDay=todayKey();states.clear();baselineReady=false;lastDailySignature='';}
    const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')];
    blockLegacy(rows);
    const current=new Map();
    rows.forEach(row=>{const id=String(row.dataset.familyTaskId||'').trim();const status=String(row.dataset.familyTaskStatus||'').trim();if(id)current.set(id,status);});
    if(baselineReady){
      current.forEach((status,id)=>{
        const previous=states.get(id);
        if(previous&&previous!==status&&!isSuccess(previous)&&isSuccess(status)&&!localStorage.getItem(taskSeenKey(id))){
          localStorage.setItem(taskSeenKey(id),'1');
          log('cachorro.tarefa_comemoracao_disparada',{tarefaId:id,statusAnterior:previous,statusAtual:status,nome:nome(),versao:VERSION});
          enqueue('task',`Parabéns, ${nome()}! Você completou essa tarefa dentro do seu horário!`);
        }
      });
    }
    states.clear();current.forEach((v,k)=>states.set(k,v));baselineReady=true;
    evaluateDailyGoal();
  }

  function reset(){states.clear();baselineReady=false;lastDailySignature='';setTimeout(scanTransitions,0);}
  function start(){
    ensureLayer();
    blockLegacy([...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')]);
    const tbody=document.getElementById('tabelaCorpo');if(tbody)new MutationObserver(()=>setTimeout(scanTransitions,0)).observe(tbody,{childList:true,subtree:true,attributes:true,attributeFilter:['data-family-task-status']});
    scanTransitions();
    log('cachorro.comemoracao_v2_pronta',{versao:VERSION,pessoaDancando:false,regraDia:'todas-concluidas-e-pontos-completos'});
  }

  window.addEventListener('rotina-family-tasks-rendered',scanTransitions);
  window.addEventListener('rotina-family-points-updated',evaluateDailyGoal);
  window.addEventListener('rotina-client-session-ready',reset);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
