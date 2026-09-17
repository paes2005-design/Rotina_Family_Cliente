export const TASK_REWARD_SEQUENCES=Object.freeze([
  Object.freeze({id:1,name:'Festa rápida',steps:Object.freeze(['bark','jump'])}),
  Object.freeze({id:2,name:'Giro feliz',steps:Object.freeze(['bark','roll'])}),
  Object.freeze({id:3,name:'Show do mascote',steps:Object.freeze(['bark','flip'])})
]);

export const DAILY_100_SEQUENCE=Object.freeze({
  id:4,
  name:'Super comemoração',
  steps:Object.freeze(['bark','jump','roll','flip'])
});

export function dailyGoalReached(pointsEarned,pointsPossible){
  const earned=Number(pointsEarned)||0;
  const possible=Number(pointsPossible)||0;
  return possible>0&&earned>=possible;
}

export function chooseTaskRewardSequence(lastId='',random=Math.random){
  const available=TASK_REWARD_SEQUENCES.filter(s=>String(s.id)!==String(lastId));
  const pool=available.length?available:TASK_REWARD_SEQUENCES;
  const raw=Number(random());
  const safe=Number.isFinite(raw)?Math.min(.999999999,Math.max(0,raw)):0;
  return pool[Math.floor(safe*pool.length)];
}
