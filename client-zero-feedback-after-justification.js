(()=>{
  const attached=new WeakSet();
  let feedbackOpen=false;

  function log(evento,detalhes={},nivel='info'){
    try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}
  }

  function currentTaskId(){
    const row=document.querySelector('#tabelaCorpo tr[data-family-task-status="Em andamento"]')||
      [...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')].find(r=>/em andamento/i.test(r.textContent||''));
    return String(row?.dataset?.familyTaskId||'');
  }

  function selectedMascot(){
    try{return window.obterMascoteRotina?.()||'dog';}catch{return 'dog';}
  }

  function sadDogSvg(){return `<svg class="guard-zero-mascot guard-zero-dog" data-kind="dog" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachorro triste do Rotina Family">
    <defs><linearGradient id="gzWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient><linearGradient id="gzBrown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient></defs>
    <g class="gz-tail"><path d="M245 250 C278 273 295 268 302 286" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M299 285 C303 292 299 299 291 300" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g>
    <ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#gzWhite)"/><path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#gzWhite)"/><path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#gzWhite)"/>
    <g class="gz-head"><g class="gz-ear-l"><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#gzBrown)"/></g><g class="gz-ear-r"><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#gzBrown)"/></g>
    <ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#gzBrown)"/><path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/><path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/>
    <ellipse cx="146" cy="130" rx="13" ry="15" fill="#18151a"/><ellipse cx="216" cy="130" rx="13" ry="15" fill="#18151a"/><circle cx="142" cy="125" r="4" fill="#fff"/><circle cx="212" cy="125" r="4" fill="#fff"/><path d="M132 112 Q145 103 158 113" fill="none" stroke="#40261c" stroke-width="5" stroke-linecap="round"/><path d="M203 113 Q216 103 229 112" fill="none" stroke="#40261c" stroke-width="5" stroke-linecap="round"/>
    <path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/><path d="M165 184 Q181 168 197 184" fill="none" stroke="#5d3a35" stroke-width="5" stroke-linecap="round"/>
    <path class="gz-tear" d="M225 145 C236 160 237 170 228 176 C219 171 218 160 225 145 Z" fill="#4db7e5" opacity=".92"/></g>
    <path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/><rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/>
  </svg>`;}

  function sadCatFallback(){return `<div class="guard-zero-cat-fallback" role="img" aria-label="Gato triste">🐱</div>`;}

  function ensureStyle(){
    if(document.getElementById('guardZeroFeedbackStyleV3'))return;
    const style=document.createElement('style');
    style.id='guardZeroFeedbackStyleV3';
    style.textContent=`
      #guardZeroFeedbackV2 .guard-zero-mascot{width:min(170px,44vw);height:auto;display:block;margin:-12px auto -4px;filter:drop-shadow(0 10px 10px rgba(44,24,18,.16));overflow:visible}
      #guardZeroFeedbackV2 .guard-zero-dog{animation:gzSadBody 2.2s ease-in-out infinite}
      #guardZeroFeedbackV2 .guard-zero-dog .gz-head{transform-origin:181px 170px;animation:gzSadHead 2.2s ease-in-out infinite}
      #guardZeroFeedbackV2 .guard-zero-dog .gz-ear-l{transform-origin:125px 96px;transform:rotate(12deg)}
      #guardZeroFeedbackV2 .guard-zero-dog .gz-ear-r{transform-origin:236px 96px;transform:rotate(-12deg)}
      #guardZeroFeedbackV2 .guard-zero-dog .gz-tail{transform-origin:245px 250px;animation:gzSadTail 2.6s ease-in-out infinite}
      #guardZeroFeedbackV2 .guard-zero-dog .gz-tear{animation:gzTear 1.8s ease-in infinite}
      #guardZeroFeedbackV2 .guard-zero-cat-fallback{font-size:5rem;line-height:1;margin:2px 0 8px;filter:grayscale(.15)}
      @keyframes gzSadBody{0%,100%{transform:translateY(2px)}50%{transform:translateY(7px)}}
      @keyframes gzSadHead{0%,100%{transform:rotate(0deg) translateY(4px)}50%{transform:rotate(-2deg) translateY(10px)}}
      @keyframes gzSadTail{0%,100%{transform:rotate(3deg)}50%{transform:rotate(-5deg)}}
      @keyframes gzTear{0%{opacity:0;transform:translateY(-4px)}20%,65%{opacity:.95}100%{opacity:0;transform:translateY(13px)}}`;
    document.head.appendChild(style);
  }

  async function ensureSadAudio(taskId=''){
    if(selectedMascot()!=='dog')return;
    try{
      if(typeof window.tocarCachorroTristeRotina!=='function'){
        log('tarefa.zero_feedback_audio_carregando',{tarefaId:String(taskId||''),versao:3});
        await import('./client-dog-sad-audio.js?v=5');
      }
      if(typeof window.tocarCachorroTristeRotina==='function'){
        const ok=await window.tocarCachorroTristeRotina(String(taskId||''));
        log('tarefa.zero_feedback_audio_resultado',{tarefaId:String(taskId||''),ok:ok===true,versao:3},ok===true?'info':'warning');
      }else{
        log('tarefa.zero_feedback_audio_indisponivel',{tarefaId:String(taskId||''),versao:3},'error');
      }
    }catch(error){
      log('tarefa.zero_feedback_audio_erro',{tarefaId:String(taskId||''),mensagem:String(error?.message||error),versao:3},'error');
    }
  }

  function showFeedback(taskId=''){
    if(feedbackOpen||document.getElementById('guardZeroFeedbackV2'))return;
    feedbackOpen=true;
    ensureStyle();
    const type=selectedMascot();
    const mascot=type==='cat'?sadCatFallback():sadDogSvg();
    const m=document.createElement('div');
    m.id='guardZeroFeedbackV2';
    m.style.cssText='position:fixed;inset:0;z-index:21000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
    m.innerHTML=`<div style="width:min(92vw,430px);background:#fff;border-radius:22px;padding:20px 24px 24px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.25)">${mascot}<h2 style="margin:5px 0 8px;color:#9f1239">Você não conseguiu</h2><p style="font-size:1.05rem;color:#555;margin:0 0 18px">Não foi dessa vez. Esta tarefa ficou em <strong>0%</strong>.</p><button type="button" id="guardZeroCloseV2" class="btn" style="background:var(--cor-primaria,#ff4d6d);color:#fff;padding:11px 22px">OK</button></div>`;
    document.body.appendChild(m);
    m.querySelector('#guardZeroCloseV2').onclick=()=>{m.remove();feedbackOpen=false;};
    log('tarefa.zero_feedback_exibido',{tarefaId:String(taskId||''),percentual:0,aposJustificativa:true,mascote:type,versao:3});
    ensureSadAudio(taskId);
    window.dispatchEvent(new CustomEvent('rotina-task-zero',{detail:{tarefaId:String(taskId||''),percentual:0,origem:'apos-justificativa',audioHandled:true,versao:3}}));
  }

  function waitForSuccessfulClose(modal,taskId,action){
    const started=performance.now();
    const tick=()=>{
      if(!document.body.contains(modal)){
        setTimeout(()=>showFeedback(taskId),80);
        log('tarefa.zero_feedback_justificativa_concluida',{tarefaId:String(taskId||''),acao:action,tempoMs:Math.round(performance.now()-started),versao:3});
        return;
      }
      if(performance.now()-started<60000){setTimeout(tick,100);return;}
      log('tarefa.zero_feedback_timeout',{tarefaId:String(taskId||''),acao:action,versao:3},'warning');
    };
    setTimeout(tick,80);
  }

  function attach(modal){
    if(!modal||attached.has(modal))return;
    attached.add(modal);
    log('tarefa.zero_feedback_modal_detectado',{tarefaId:currentTaskId(),versao:3});
    modal.addEventListener('click',event=>{
      const btn=event.target.closest?.('#guardEnviarV2,#guardSemV2');
      if(!btn)return;
      const taskId=currentTaskId();
      const action=btn.id==='guardSemV2'?'sem-justificar':'enviar-justificativa';
      log('tarefa.zero_feedback_aguardando_salvamento',{tarefaId:taskId,acao:action,versao:3});
      waitForSuccessfulClose(modal,taskId,action);
    },true);
  }

  function scan(){attach(document.getElementById('guardJustModalV2'));}
  function start(){
    scan();
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
    log('tarefa.zero_feedback_pos_justificativa_pronto',{versao:3});
  }

  window.rotinaMostrarZeroPosJustificativa=showFeedback;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();