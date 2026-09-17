import {TASK_REWARD_SEQUENCES,DAILY_100_SEQUENCE,dailyGoalReached,chooseTaskRewardSequence} from './mascot-reward-core.js';

const ok=(cond,msg)=>{if(!cond)throw new Error(`FALHOU: ${msg}`);console.log(`OK - ${msg}`);};

ok(TASK_REWARD_SEQUENCES.length===3,'existem três sequências para tarefa pontual');
for(const seq of TASK_REWARD_SEQUENCES){
  ok(seq.steps[0]==='bark',`sequência ${seq.id} começa com latido`);
  ok(seq.steps.length===2,`sequência ${seq.id} usa latido + um movimento`);
}
ok(JSON.stringify(DAILY_100_SEQUENCE.steps)===JSON.stringify(['bark','jump','roll','flip']),'100% diário executa todos os movimentos');

ok(dailyGoalReached(100,100),'100/100 atinge 100%');
ok(!dailyGoalReached(99,100),'99/100 não atinge 100%');
ok(dailyGoalReached(125,100),'pontuação igual ou superior ao máximo atinge 100%');
ok(!dailyGoalReached(0,0),'dia sem pontos possíveis não dispara 100%');
ok(!dailyGoalReached(25,0),'pontuação com máximo zero não dispara 100%');

let last='';
for(let i=0;i<20000;i++){
  const seq=chooseTaskRewardSequence(last,Math.random);
  if(!TASK_REWARD_SEQUENCES.some(x=>x.id===seq.id))throw new Error(`FALHOU: sorteio ${i+1} saiu das sequências permitidas`);
  if(last&&String(seq.id)===String(last))throw new Error(`FALHOU: sorteio ${i+1} repetiu imediatamente a sequência anterior`);
  last=String(seq.id);
}
ok(true,'20.000 sorteios válidos sem repetição imediata');

console.log('TODAS AS SIMULAÇÕES DO MASCOTE E DO 100% POR PONTOS PASSARAM');
