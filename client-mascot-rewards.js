import {TASK_REWARD_SEQUENCES,DAILY_100_SEQUENCE,dailyGoalReached,chooseTaskRewardSequence} from './mascot-reward-core.js';

const pad=n=>String(n).padStart(2,'0');
const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const profileKey=()=>`${localStorage.getItem('cliente_grupo')||'sem-grupo'}_${localStorage.getItem('cliente_perfil_id')||localStorage.getItem('cliente_nome')||'sem-perfil'}`;
const dailySeenKey=()=>`rotina_mascote_100_${profileKey()}_${todayKey()}`;
const taskSeenKey=id=>`rotina_mascote_tarefa_${profileKey()}_${todayKey()}_${id}`;
const legacyDays=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const legacyCelebrationKey=()=>`parabens_mostrado_${legacyDays[new Date().getDay()]}`;

let lastTaskSequence='';
let queue=Promise.resolve();
let baselineReady=false;
const taskStates=new Map();
let audioContext=null;

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
  #rotinaMascoteRewardSpeech{position:absolute;left:50%;bottom:calc(8vh + 235px);transform:translateX(70px) rotate(-7deg);background:#fff;border:3px solid #4a1220;border-radius:18px;padding:8px 12px;font-weight:900;color:#4a1220;opacity:0;box-shadow:0 8px 20px rgba(0,0,0,.12)}
  #rotinaMascoteRewardSpeech.show{animation:rfSpeech .85s ease both}
  #rotinaMascoteRewardDog .rf-tail{transform-origin:230px 248px;animation:rfTail .55s ease-in-out infinite alternate}
  #rotinaMascoteRewardDog.bark .rf-ear-l{transform-origin:125px 96px;animation:rfEarL .22s ease-in-out 4}
  #rotinaMascoteRewardDog.bark .rf-ear-r{transform-origin:235px 96px;animation:rfEarR .22s ease-in-out 4}
  #rotinaMascoteRewardDog.bark .rf-jaw{transform-origin:180px 166px;animation:rfJaw .2s ease-in-out 5}
  @keyframes rfDogJump{0%{transform:translateY(0)}18%{transform:translateY(10px) scale(1.05,.94)}52%{transform:translateY(-150px) scale(.96,1.04)}88%{transform:translateY(8px) scale(1.06,.92)}100%{transform:translateY(0)}}
  @keyframes rfDogRoll{0%{transform:translateX(0) rotate(0)}30%{transform:translateX(90px) rotate(120deg)}65%{transform:translateX(120px) rotate(250deg)}100%{transform:translateX(0) rotate(360deg)}}
  @keyframes rfDogFlip{0%{transform:translateY(0) rotate(0)}50%{transform:translateY(-165px) rotate(190deg)}78%{transform:translateY(-60px) rotate(320deg)}100%{transform:translateY(0) rotate(360deg)}}
  @keyframes rfDogBark{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-9px) rotate(-2deg)}65%{transform:translateY(2px) rotate(2deg)}}
  @keyframes rfTail{from{transform:rotate(-14deg)}to{transform:rotate(18deg)}}
  @keyframes rfEarL{50%{transform:rotate(-11deg)}}@keyframes rfEarR{50%{transform:rotate(11deg)}}@keyframes rfJaw{50%{transform:translateY(7px) scaleY(1.14)}}
  @keyframes rfSpeech{0%{opacity:0;transform:translateX(70px) scale(.3) rotate(-7deg)}20%,70%{opacity:1;transform:translateX(70px) scale(1) rotate(-7deg)}100%{opacity:0;transform:translateX(75px) translateY(-8px) scale(.9) rotate(-7deg)}}
  @media(max-width:600px){#rotinaMascoteRewardLayer{padding-bottom:10vh}#rotinaMascoteRewardDog{width:min(250px,72vw)}#rotinaMascoteRewardSpeech{bottom:calc(10vh + 205px)}}`;
  document.head.appendChild(style);
}

function ensureLayer(){
  ensureStyle();
  let layer=document.getElementById('rotinaMascoteRewardLayer');
  if(layer)return layer;
  layer=document.createElement('div');
  layer.id='rotinaMascoteRewardLayer';
  layer.setAttribute('aria-hidden','true');
  layer.innerHTML=`<div id="rotinaMascoteRewardSpeech">AU! AU!</div><svg id="rotinaMascoteRewardDog" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mascote do Rotina Family">
    <defs><linearGradient id="rfWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="#eadfd7"/></linearGradient><linearGradient id="rfBrown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b75d2e"/><stop offset="1" stop-color="#7d351d"/></linearGradient></defs>
    <g class="rf-tail"><path d="M245 243 C292 222 302 257 276 267" fill="none" stroke="#f5ece5" stroke-width="24" stroke-linecap="round"/><path d="M275 267 C286 270 291 264 292 256" fill="none" stroke="#8b3b20" stroke-width="14" stroke-linecap="round"/></g>
    <ellipse cx="182" cy="264" rx="78" ry="70" fill="url(#rfWhite)"/><path d="M138 248 C126 275 126 310 140 326 C151 333 168 328 173 315 L174 270 Z" fill="url(#rfWhite)"/><path d="M224 248 C239 277 241 310 229 327 C218 335 201 329 197 316 L194 270 Z" fill="url(#rfWhite)"/>
    <g class="rf-ear-l"><path d="M125 95 C94 74 62 82 61 111 C62 134 84 154 107 145 C121 133 129 113 125 95 Z" fill="url(#rfBrown)"/></g><g class="rf-ear-r"><path d="M236 95 C267 75 298 83 298 111 C296 134 276 153 253 145 C239 133 232 113 236 95 Z" fill="url(#rfBrown)"/></g>
    <ellipse cx="181" cy="130" rx="78" ry="72" fill="url(#rfBrown)"/><path d="M164 61 C174 57 187 57 197 61 L209 116 C204 139 195 155 181 168 C167 154 157 138 153 116 Z" fill="#fffaf6"/><path d="M146 145 C153 127 165 117 181 117 C198 117 210 127 217 145 C220 166 207 186 181 190 C155 186 143 166 146 145 Z" fill="#fffaf6"/>
    <ellipse cx="146" cy="126" rx="15" ry="17" fill="#18151a"/><ellipse cx="216" cy="126" rx="15" ry="17" fill="#18151a"/><circle cx="141" cy="120" r="5" fill="#fff"/><circle cx="211" cy="120" r="5" fill="#fff"/><path d="M166 150 C173 142 190 142 197 150 C196 162 187 168 181 168 C175 168 166 162 166 150 Z" fill="#1b171a"/>
    <g class="rf-jaw"><path d="M164 167 C170 176 192 176 198 167 C198 184 190 193 181 193 C172 193 164 184 164 167 Z" fill="#f7f1ec"/><path d="M176 182 C180 187 184 187 188 182" fill="#ef7181"/></g>
    <path d="M123 192 C147 205 213 205 239 192 L232 219 C207 229 155 229 130 219 Z" fill="#d7264f"/><rect x="172" y="205" width="20" height="20" rx="4" fill="#d2a33c"/>
  </svg>`;
  document.body.appendChild(layer);
  return layer;
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
    const ctx=audioContext,now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    osc.type='sawtooth';osc.frequency.setValueAtTime(190,now);osc.frequency.exponentialRampToValueAtTime(85,now+.18);filter.type='lowpass';filter.frequency.value=950;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.24,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.22);osc.connect(filter).connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+.23);
  }catch{}
}

async function action(name){
  const layer=ensureLayer(),dog=layer.querySelector('#rotinaMascoteRewardDog'),speech=layer.querySelector('#rotinaMascoteRewardSpeech');
  layer.classList.add('show');dog.classList.remove('bark','jump','roll','flip');void dog.getBoundingClientRect();
  if(name==='bark'){speech.classList.remove('show');void speech.getBoundingClientRect();speech.classList.add('show');dog.classList.add('bark');barkSound();setTimeout(barkSound,300);}else dog.classList.add(name);
  await sleep(durations[name]||900);dog.classList.remove(name);await sleep(100);
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
  setTimeout(()=>{scanTaskTransitions();evaluateDailyGoal();},0);
}

window.addEventListener('rotina-family-tasks-rendered',scanTaskTransitions);
window.addEventListener('rotina-family-points-updated',evaluateDailyGoal);
window.addEventListener('rotina-client-session-ready',resetSessionState);

sessionStorage.setItem(legacyCelebrationKey(),'mascote-pontos-v1');
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureLayer();scanTaskTransitions();evaluateDailyGoal();},{once:true});
else{ensureLayer();scanTaskTransitions();evaluateDailyGoal();}

window.__rotinaMascoteRewardsReady=true;
window.dispatchEvent(new CustomEvent('rotina-mascote-rewards-ready',{detail:{taskSequences:TASK_REWARD_SEQUENCES.length,dailySequence:DAILY_100_SEQUENCE.id}}));
