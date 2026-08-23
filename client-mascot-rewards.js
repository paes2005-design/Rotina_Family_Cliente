import {TASK_REWARD_SEQUENCES,DAILY_100_SEQUENCE,dailyGoalReached,chooseTaskRewardSequence} from './mascot-reward-core.js';

const pad=n=>String(n).padStart(2,'0');
const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
const mascotPreferenceKey=()=>`rotina_mascote_tipo_${profileKey()}`;
const dailySeenKey=()=>`rotina_mascote_100_${profileKey()}_${todayKey()}`;
const taskSeenKey=id=>`rotina_mascote_tarefa_${profileKey()}_${todayKey()}_${id}`;
const legacyDays=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const legacyCelebrationKey=()=>`parabens_mostrado_${legacyDays[new Date().getDay()]}`;

let lastTaskSequence='';
let queue=Promise.resolve();
let baselineReady=false;
const taskStates=new Map();
let audioContext=null;

const mascotType=()=>localStorage.getItem(mascotPreferenceKey())==='cat'?'cat':'dog';

function dogSvg(){return `<svg id="rotinaMascoteRewardDog" data-kind="dog" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachorro mascote do Rotina Family">
  <defs><linearGradient id="rfWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient><linearGradient id="rfBrown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient></defs>
  <g class="rf-tail"><path d="M245 243 C292 222 302 257 276 267" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M275 267 C286 270 291 264 292 256" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g>
  <ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#rfWhite)"/><path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#rfWhite)"/><path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#rfWhite)"/>
  <g class="rf-ear-l"><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#rfBrown)"/></g><g class="rf-ear-r"><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#rfBrown)"/></g>
  <ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#rfBrown)"/><path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/><path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/>
  <ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/><circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/><path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/>
  <g class="rf-jaw"><path d="M164 167 C170 176 192 176 198 167 C198 184 190 193 181 193 C172 193 164 184 164 167 Z" fill="#f7f1ec"/><path d="M176 182 C180 187 184 187 188 182" fill="#ef7181"/></g>
  <path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/><rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/>
</svg>`;}

function catSvg(){return `<svg id="rotinaMascoteRewardDog" data-kind="cat" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gato mascote do Rotina Family">
  <defs><linearGradient id="rfCat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4a261"/><stop offset="1" stop-color="#d97735"/></linearGradient><linearGradient id="rfCatLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7e8"/><stop offset="1" stop-color="#f2dfca"/></linearGradient></defs>
  <g class="rf-tail"><path d="M245 255 C307 247 308 186 277 181 C252 177 250 205 270 211" fill="none" stroke="url(#rfCat)" stroke-width="20" stroke-linecap="round"/></g>
  <ellipse cx="181" cy="267" rx="72" ry="67" fill="url(#rfCat)"/><ellipse cx="181" cy="276" rx="40" ry="48" fill="url(#rfCatLight)"/>
  <path d="M139 251 C129 279 130 313 145 327 C156 333 170 325 173 313 L174 269 Z" fill="url(#rfCat)"/><path d="M222 251 C233 279 233 313 218 327 C207 333 194 325 191 313 L190 269 Z" fill="url(#rfCat)"/>
  <g class="rf-ear-l"><path d="M119 102 L119 45 L158 83 Z" fill="url(#rfCat)"/><path d="M127 88 L128 62 L148 82 Z" fill="#ef8c98"/></g><g class="rf-ear-r"><path d="M243 102 L243 45 L204 83 Z" fill="url(#rfCat)"/><path d="M235 88 L234 62 L214 82 Z" fill="#ef8c98"/></g>
  <ellipse cx="181" cy="135" rx="70" ry="68" fill="url(#rfCat)"/><path d="M151 149 C159 130 170 122 181 122 C193 122 204 130 211 149 C211 171 200 188 181 190 C162 188 151 171 151 149 Z" fill="url(#rfCatLight)"/>
  <ellipse cx="149" cy="129" rx="13" ry="16" fill="#263238"/><ellipse cx="213" cy="129" rx="13" ry="16" fill="#263238"/><ellipse cx="149" cy="129" rx="4" ry="11" fill="#b6e36c"/><ellipse cx="213" cy="129" rx="4" ry="11" fill="#b6e36c"/><circle cx="145" cy="124" r="3" fill="#fff"/><circle cx="209" cy="124" r="3" fill="#fff"/>
  <path d="M173 151 Q181 145 189 151 Q186 161 181 163 Q176 161 173 151 Z" fill="#e97b89"/><g class="rf-jaw"><path d="M181 163 Q170 174 162 166 M181 163 Q192 174 200 166" fill="none" stroke="#5c3d36" stroke-width="4" stroke-linecap="round"/><path d="M176 174 Q181 181 186 174" fill="none" stroke="#e97b89" stroke-width="4" stroke-linecap="round"/></g>
  <path d="M156 158 L104 151 M157 166 L101 168 M206 158 L258 151 M205 166 L261 168" stroke="#6f554d" stroke-width="3" stroke-linecap="round"/>
  <path d="M125 199 C151 211 211 211 237 199 L232 220 C207 229 155 229 130 220 Z" fill="#5f7ae6"/><circle cx="181" cy="218" r="9" fill="#f2c14e"/>
</svg>`;}

function ensureStyle(){
  if(document.getElementById('rotinaMascoteRewardStyle'))return;
  const style=document.createElement('style');
  style.id='rotinaMascoteRewardStyle';
  style.textContent=`
  #rotinaMascoteRewardLayer{position:fixed;inset:0;z-index:25000;pointer-events:none;display:none;align-items:flex-end;justify-content:center;padding:0 18px 8vh;overflow:hidden}
  #rotinaMascoteRewardLayer.show{display:flex}
  #rotinaMascoteRewardDog{width:min(290px,70vw);height:auto;transform-origin:50% 82%;filter:drop-shadow(0 18px 14px rgba(44,24,18,.2));will-change:transform}
  #rotinaMascoteRewardDog.jump{animation:rfDogJump .9s cubic-bezier(.3,.75,.25,1) both}
  #rotinaMascoteRewardDog.roll{animation:rfDogRoll 1.15s ease-in-out both}
  #rotinaMascoteRewardDog.flip{animation:rfDogFlip 1.05s cubic-bezier(.3,.65,.25,1) both}
  #rotinaMascoteRewardDog.bark{animation:rfDogBark .5s ease-in-out 2}
  #rotinaMascoteRewardSpeech{position:absolute;left:50%;bottom:calc(8vh + 235px);transform:translateX(70px) rotate(-7deg);background:#fff;border:3px solid #4a1220;border-radius:18px;padding:8px 12px;font-weight:1000;font-size:1.18rem;color:#4a1220;opacity:0;box-shadow:0 8px 20px rgba(0,0,0,.12)}
  #rotinaMascoteRewardSpeech.show{animation:rfSpeech .85s ease both}
  #rotinaMascoteRewardDog .rf-tail{transform-origin:230px 248px;animation:rfTail .55s ease-in-out infinite alternate}
  #rotinaMascoteRewardDog.bark .rf-ear-l{transform-origin:125px 96px;animation:rfEarL .22s ease-in-out 4}
  #rotinaMascoteRewardDog.bark .rf-ear-r{transform-origin:235px 96px;animation:rfEarR .22s ease-in-out 4}
  #rotinaMascoteRewardDog.bark .rf-jaw{transform-origin:180px 166px;animation:rfJaw .2s ease-in-out 5}
  #rotinaMascoteChooser{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin:-4px 0 14px;font-size:.83rem;color:#666}
  #rotinaMascoteChooser strong{margin-right:2px;color:var(--cor-texto,#590d22)}
  #rotinaMascoteChooser button{border:1px solid #ddd;background:#fff;border-radius:999px;padding:7px 10px;cursor:pointer;font:inherit;font-weight:700;color:#555}
  #rotinaMascoteChooser button.active{background:var(--cor-fundo,#fff0f3);border-color:var(--cor-primaria,#ff4d6d);color:var(--cor-primaria,#ff4d6d);box-shadow:0 0 0 1px var(--cor-primaria,#ff4d6d) inset}
  @keyframes rfDogJump{0%{transform:translateY(0)}18%{transform:translateY(10px) scale(1.05,.94)}52%{transform:translateY(-150px) scale(.96,1.04)}88%{transform:translateY(8px) scale(1.06,.92)}100%{transform:translateY(0)}}
  @keyframes rfDogRoll{0%{transform:translateX(0) rotate(0)}30%{transform:translateX(90px) rotate(120deg)}65%{transform:translateX(120px) rotate(250deg)}100%{transform:translateX(0) rotate(360deg)}}
  @keyframes rfDogFlip{0%{transform:translateY(0) rotate(0)}50%{transform:translateY(-165px) rotate(190deg)}78%{transform:translateY(-60px) rotate(320deg)}100%{transform:translateY(0) rotate(360deg)}}
  @keyframes rfDogBark{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-9px) rotate(-2deg)}65%{transform:translateY(2px) rotate(2deg)}}
  @keyframes rfTail{from{transform:rotate(-14deg)}to{transform:rotate(18deg)}}
  @keyframes rfEarL{50%{transform:rotate(-11deg)}}@keyframes rfEarR{50%{transform:rotate(11deg)}}@keyframes rfJaw{50%{transform:translateY(7px) scaleY(1.14)}}
  @keyframes rfSpeech{0%{opacity:0;transform:translateX(70px) scale(.3) rotate(-7deg)}20%,70%{opacity:1;transform:translateX(70px) scale(1) rotate(-7deg)}100%{opacity:0;transform:translateX(75px) translateY(-8px) scale(.9) rotate(-7deg)}}
  @media(max-width:600px){#rotinaMascoteRewardLayer{padding-bottom:10vh}#rotinaMascoteRewardDog{width:min(250px,72vw)}#rotinaMascoteRewardSpeech{bottom:calc(10vh + 205px)}#rotinaMascoteChooser{justify-content:center;margin-top:2px}}`;
  document.head.appendChild(style);
}

function syncLayerMascot(layer= document.getElementById('rotinaMascoteRewardLayer')){
  if(!layer)return;
  const type=mascotType();
  const current=layer.querySelector('#rotinaMascoteRewardDog');
  if(!current||current.dataset.kind!==type){
    const holder=document.createElement('div');holder.innerHTML=type==='cat'?catSvg():dogSvg();
    const next=holder.firstElementChild;
    if(current)current.replaceWith(next);else layer.appendChild(next);
  }
  const speech=layer.querySelector('#rotinaMascoteRewardSpeech');
  if(speech)speech.textContent=type==='cat'?'MIAU! MIAU!':'AU! AU!';
}

function updateChooser(){
  const chooser=document.getElementById('rotinaMascoteChooser');if(!chooser)return;
  const type=mascotType();
  chooser.querySelectorAll('button[data-mascot]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mascot===type));
}

function ensureChooser(){
  ensureStyle();
  const app=document.getElementById('telaApp');if(!app)return null;
  let chooser=document.getElementById('rotinaMascoteChooser');
  if(!chooser){
    chooser=document.createElement('div');chooser.id='rotinaMascoteChooser';
    chooser.innerHTML='<strong>Meu mascote:</strong><button type="button" data-mascot="dog">🐶 Cachorro</button><button type="button" data-mascot="cat">🐱 Gato</button>';
    const anchor=app.querySelector('.dash-cards');
    if(anchor)anchor.before(chooser);else app.prepend(chooser);
    chooser.addEventListener('click',e=>{
      const btn=e.target.closest('button[data-mascot]');if(!btn)return;
      localStorage.setItem(mascotPreferenceKey(),btn.dataset.mascot==='cat'?'cat':'dog');
      syncLayerMascot();updateChooser();
      window.rotinaLog?.('mascote.preferencia_alterada',{mascote:mascotType(),perfil:profileKey()});
    });
  }
  updateChooser();return chooser;
}

function ensureLayer(){
  ensureStyle();
  let layer=document.getElementById('rotinaMascoteRewardLayer');
  if(!layer){
    layer=document.createElement('div');
    layer.id='rotinaMascoteRewardLayer';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML='<div id="rotinaMascoteRewardSpeech">AU! AU!</div>';
    document.body.appendChild(layer);
  }
  syncLayerMascot(layer);return layer;
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const durations={bark:1050,jump:950,roll:1200,flip:1100};

function unlockAudio(){
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioContext)audioContext=new AC();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
}
document.addEventListener('pointerdown',unlockAudio,{passive:true});

function barkSound(){
  try{
    unlockAudio();if(!audioContext)return;
    const ctx=audioContext,now=ctx.currentTime;
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=10;compressor.ratio.value=8;compressor.attack.value=.002;compressor.release.value=.18;compressor.connect(ctx.destination);
    const master=ctx.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.82,now+.008);master.gain.exponentialRampToValueAtTime(.0001,now+.31);master.connect(compressor);
    const osc=ctx.createOscillator(),og=ctx.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(165,now);osc.frequency.exponentialRampToValueAtTime(68,now+.24);og.gain.value=.55;osc.connect(og).connect(master);osc.start(now);osc.stop(now+.31);
    const sub=ctx.createOscillator(),sg=ctx.createGain();sub.type='square';sub.frequency.setValueAtTime(92,now);sub.frequency.exponentialRampToValueAtTime(54,now+.22);sg.gain.value=.22;sub.connect(sg).connect(master);sub.start(now);sub.stop(now+.28);
    const len=Math.floor(ctx.sampleRate*.3),buffer=ctx.createBuffer(1,len,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);
    const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),ng=ctx.createGain();noise.buffer=buffer;filter.type='bandpass';filter.frequency.value=330;filter.Q.value=.65;ng.gain.value=.62;noise.connect(filter).connect(ng).connect(master);noise.start(now);
  }catch{}
}

function meowSound(){
  try{
    unlockAudio();if(!audioContext)return;
    const ctx=audioContext,now=ctx.currentTime,master=ctx.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.48,now+.035);master.gain.setValueAtTime(.42,now+.18);master.gain.exponentialRampToValueAtTime(.0001,now+.48);master.connect(ctx.destination);
    const osc=ctx.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(520,now);osc.frequency.exponentialRampToValueAtTime(760,now+.17);osc.frequency.exponentialRampToValueAtTime(430,now+.46);osc.connect(master);osc.start(now);osc.stop(now+.5);
    const harm=ctx.createOscillator(),hg=ctx.createGain();harm.type='triangle';harm.frequency.setValueAtTime(1040,now);harm.frequency.exponentialRampToValueAtTime(1500,now+.17);harm.frequency.exponentialRampToValueAtTime(860,now+.46);hg.gain.value=.16;harm.connect(hg).connect(master);harm.start(now);harm.stop(now+.5);
  }catch{}
}

function mascotSound(){if(mascotType()==='cat')meowSound();else barkSound();}

async function action(name){
  const layer=ensureLayer(),animal=layer.querySelector('#rotinaMascoteRewardDog'),speech=layer.querySelector('#rotinaMascoteRewardSpeech');
  layer.classList.add('show');animal.classList.remove('bark','jump','roll','flip');void animal.getBoundingClientRect();
  if(name==='bark'){speech.classList.remove('show');void speech.getBoundingClientRect();speech.classList.add('show');animal.classList.add('bark');mascotSound();setTimeout(mascotSound,330);}else animal.classList.add(name);
  await sleep(durations[name]||900);animal.classList.remove(name);await sleep(100);
}

async function runSequence(sequence){
  const layer=ensureLayer();
  for(const step of sequence.steps)await action(step);
  await sleep(120);layer.classList.remove('show');
}

function enqueue(sequence){
  queue=queue.catch(()=>{}).then(()=>runSequence(sequence)).catch(e=>console.error('Mascote Rotina Family:',e));
  return queue;
}

function celebrateTask(taskId){
  if(!taskId||localStorage.getItem(taskSeenKey(taskId)))return;
  localStorage.setItem(taskSeenKey(taskId),'1');
  const seq=chooseTaskRewardSequence(lastTaskSequence);
  lastTaskSequence=String(seq.id);
  enqueue(seq);
}

function playExistingDailyCelebration(){
  const modal=document.getElementById('modalCelebracao');
  const avatar=document.getElementById('avatarCelebracaoContainer');
  const texto=document.getElementById('txtParabens100');
  const nome=localStorage.getItem('cliente_nome')||'Parabéns';
  const sexo=localStorage.getItem('cliente_sexo')||'Feminino';
  if(avatar){
    avatar.innerHTML=sexo==='Masculino'
      ?'<div class="boneca-container"><div class="boneca-emoji">🕺</div><div class="status-texto" style="color:#2563eb">Meta Diária Atingida!</div></div>'
      :'<div class="boneca-container"><div class="boneca-emoji">💃</div><div class="status-texto">Meta Diária Atingida!</div></div>';
  }
  if(texto)texto.innerText=`${nome}, você completou 100% das suas metas hoje! 🎉`;
  try{new Audio('https://assets.mixkit.co/active_storage/sfx/123/123-84.wav').play().catch(()=>{});new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-84.wav').play().catch(()=>{});}catch{}
  try{window.confetti?.({particleCount:160,spread:110,origin:{y:.5}});}catch{}
  if(modal)modal.style.display='flex';
}

function celebrateDaily100(){
  if(localStorage.getItem(dailySeenKey()))return;
  localStorage.setItem(dailySeenKey(),'1');
  sessionStorage.setItem(legacyCelebrationKey(),'true');
  playExistingDailyCelebration();
  enqueue(DAILY_100_SEQUENCE);
}

function numberFromText(value){
  const normalized=String(value||'').replace(/\./g,'').replace(',','.');
  const match=normalized.match(/-?\d+(?:\.\d+)?/);
  return match?Number(match[0]):0;
}

export function evaluateDailyGoal(){
  const earned=numberFromText(document.getElementById('ptsHoje')?.textContent);
  const possible=numberFromText(document.getElementById('possivelHoje')?.textContent);
  const reached=dailyGoalReached(earned,possible);
  if(reached)celebrateDaily100();
  return {earned,possible,reached};
}
window.avaliarMetaDiariaMascote=evaluateDailyGoal;
window.definirMascoteRotina=tipo=>{localStorage.setItem(mascotPreferenceKey(),tipo==='cat'?'cat':'dog');syncLayerMascot();updateChooser();};
window.obterMascoteRotina=mascotType;

function scanTaskTransitions(){
  const current=new Map();
  document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]').forEach(row=>{
    const id=String(row.dataset.familyTaskId||'').trim();
    const status=String(row.dataset.familyTaskStatus||'').trim();
    if(id)current.set(id,status);
  });
  if(baselineReady){
    current.forEach((status,id)=>{
      const previous=taskStates.get(id);
      if(previous&&previous!==status&&/No Prazo\s*\(100%\)/i.test(status))celebrateTask(id);
    });
  }
  taskStates.clear();current.forEach((v,k)=>taskStates.set(k,v));baselineReady=true;
  evaluateDailyGoal();
}

function resetSessionState(){
  taskStates.clear();
  baselineReady=false;
  lastTaskSequence='';
  ensureChooser();syncLayerMascot();updateChooser();
  setTimeout(()=>{scanTaskTransitions();evaluateDailyGoal();},0);
}

window.addEventListener('rotina-family-tasks-rendered',scanTaskTransitions);
window.addEventListener('rotina-family-points-updated',evaluateDailyGoal);
window.addEventListener('rotina-client-session-ready',resetSessionState);

sessionStorage.setItem(legacyCelebrationKey(),'mascote-pontos-v2');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureLayer();ensureChooser();scanTaskTransitions();evaluateDailyGoal();},{once:true});
else{ensureLayer();ensureChooser();scanTaskTransitions();evaluateDailyGoal();}

window.__rotinaMascoteRewardsReady=true;
window.dispatchEvent(new CustomEvent('rotina-mascote-rewards-ready',{detail:{taskSequences:TASK_REWARD_SEQUENCES.length,dailySequence:DAILY_100_SEQUENCE.id,mascote:mascotType()}}));