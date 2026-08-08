import {calcularEstadoCronometro,formatarDuracaoCronometro} from './tolerance-timer-core.js';

const ok=(cond,msg,extra='')=>{if(!cond)throw new Error(`FALHOU: ${msg}${extra?` | ${extra}`:''}`);console.log(`OK - ${msg}${extra?` | ${extra}`:''}`);};
const dt=s=>new Date(s);
const tarefa=(extra={})=>({id:'T1',nome:'Tarefa teste',diaSemana:'Sábado',horaSugeridaInicio:'08:00',horaSugeridaFim:'08:30',tempoLimite:10,status:'Pendente',...extra});
const show=(nome,t,quando)=>{const e=calcularEstadoCronometro(t,dt(quando));console.log(`${nome.padEnd(28)} | ${quando.slice(11,19)} | ${String(e.percentual).padStart(3)}% | consumo=${String(e.consumoTotal).padStart(2)} | ${e.texto||'(oculto)'}`);return e;};

console.log('\n=== SIMULAÇÃO DO CRONÔMETRO DE TOLERÂNCIA ===');
ok(formatarDuracaoCronometro(462)==='07:42','formata 462 segundos como 07:42');

let e=show('Antes do horário',tarefa(),'2026-08-08T07:59:59');
ok(e.visivel===false,'cronômetro fica oculto antes do início previsto');

e=show('Pendente +2m18s',tarefa(),'2026-08-08T08:02:18');
ok(e.visivel&&e.percentual===100&&e.consumoTotal===2&&e.texto==='⏱️ Tolerância 07:42','pendente consome tolerância em tempo real e exibe segundos');

e=show('Iniciada +5m exatos',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:00.000',horarioInicio:'08:05'}),'2026-08-08T08:20:00');
ok(e.consumoTotal===5&&e.texto==='⏱️ Tolerância 05:00'&&e.relogioAtivo==='pausado','atraso de início fica congelado até o fim previsto');

e=show('Iniciada +5m59s',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:59.000',horarioInicio:'08:05'}),'2026-08-08T08:20:00');
ok(e.atrasoInicioMin===5&&e.texto==='⏱️ Tolerância 05:00','segundos do início não mudam pontuação nem saldo congelado');

e=show('Fim +2m18s após +5m',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:00.000',horarioInicio:'08:05'}),'2026-08-08T08:32:18');
ok(e.atrasoInicioMin===5&&e.atrasoFimMin===2&&e.consumoTotal===7&&e.texto==='⏱️ Tolerância 02:42','após o fim previsto o saldo volta a consumir');

e=show('Faixa 75%',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:00.000'}),'2026-08-08T08:36:00');
ok(e.consumoTotal===11&&e.percentual===75&&e.faixa==='atraso-leve','transição 100 -> 75 segue scoring-core');

e=show('Faixa 50%',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:00.000'}),'2026-08-08T08:40:00');
ok(e.consumoTotal===15&&e.percentual===50&&e.faixa==='atraso-maior','transição 75 -> 50 segue scoring-core');

e=show('Faixa 0%',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:00.000'}),'2026-08-08T08:41:00');
ok(e.consumoTotal===16&&e.percentual===0&&e.faixa==='estourado','acima do limite 50 chega a 0%');

const t2=tarefa({tempoLimite:2});
ok(show('Tol2 +2m59s',t2,'2026-08-08T08:02:59').percentual===100,'tolerância 2 mantém 100% durante minuto completo 2');
ok(show('Tol2 +3m',t2,'2026-08-08T08:03:00').percentual===75,'tolerância 2: minuto 3 = 75%');
ok(show('Tol2 +4m',t2,'2026-08-08T08:04:00').percentual===50,'tolerância 2: minuto 4 = 50%');
ok(show('Tol2 +5m',t2,'2026-08-08T08:05:00').percentual===0,'tolerância 2: minuto 5 = 0%');

const A=tarefa({id:'A',nome:'A',status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:00:00.000'});
const B=tarefa({id:'B',nome:'B',horaSugeridaInicio:'08:35',horaSugeridaFim:'09:00',status:'Pendente'});
const ea=show('A continua rodando',A,'2026-08-08T08:36:42');
const eb=show('B relógio independente',B,'2026-08-08T08:36:42');
ok(ea.relogioAtivo==='fim'&&eb.relogioAtivo==='inicio'&&eb.texto==='⏱️ Tolerância 08:18','B consome sua própria tolerância mesmo com A ainda rodando');

const ebDepois=show('B após suspensão 7min',B,'2026-08-08T08:43:42');
ok(ebDepois.consumoTotal===8&&ebDepois.texto==='⏱️ Tolerância 01:18','retorno do background recalcula pelo relógio absoluto, sem depender de ticks');

e=show('Início antecipado',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T07:55:00.000',inicioAntecipado:true,antecipacaoMin:5}),'2026-08-08T08:10:00');
ok(e.atrasoInicioMin===0&&e.consumoTotal===0&&e.texto==='⏱️ Tolerância 10:00','início antecipado não consome tolerância');

const meiaNoite=tarefa({diaSemana:'Sábado',horaSugeridaInicio:'23:55',horaSugeridaFim:'00:10',status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T23:57:00.000',horarioInicio:'23:57'});
e=show('Virada da meia-noite',meiaNoite,'2026-08-09T00:12:30');
ok(e.atrasoInicioMin===2&&e.atrasoFimMin===2&&e.consumoTotal===4&&e.texto==='⏱️ Tolerância 05:30','virada da meia-noite preserva a data da execução');

e=show('Tarefa concluída',tarefa({status:'No Prazo (100%)',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:02:00.000',terminoExecutadoEm:'2026-08-08T08:31:00.000',horarioInicio:'08:02',horarioTermino:'08:31'}),'2026-08-08T09:00:00');
ok(e.visivel===false&&e.consumoTotal===3,'cronômetro some ao concluir, preservando cálculo final');

console.log('\n=== STRESS / REGRESSÃO TEMPORAL ===');
const stress=tarefa({tempoLimite:10});
const snapshot=JSON.stringify(stress);
let anterior=-1,ultimoPct=100;
for(let s=0;s<=24*60*60;s++){
  const agora=new Date(dt('2026-08-08T08:00:00').getTime()+s*1000);
  const x=calcularEstadoCronometro(stress,agora);
  if(!Number.isFinite(x.consumoTotal)||!Number.isFinite(x.restanteNormalSeg))throw new Error(`FALHOU: estado numérico inválido no segundo ${s}`);
  if(x.consumoTotal<anterior)throw new Error(`FALHOU: consumo regrediu no segundo ${s}`);
  if(x.percentual>ultimoPct)throw new Error(`FALHOU: percentual melhorou sozinho no segundo ${s}`);
  anterior=x.consumoTotal;ultimoPct=x.percentual;
}
ok(JSON.stringify(stress)===snapshot,'86.401 cálculos não alteram o objeto da tarefa');
ok(anterior===1440,'24 horas pendente calculam 1.440 minutos sem deriva');
ok(ultimoPct===0,'stress de 24 horas termina corretamente em 0%');

const matriz=[];
for(let i=0;i<50;i++)matriz.push(tarefa({id:`M${i}`,nome:`T${i}`,horaSugeridaInicio:`${String(8+Math.floor(i/10)).padStart(2,'0')}:${String((i%10)*5).padStart(2,'0')}`,horaSugeridaFim:`${String(9+Math.floor(i/10)).padStart(2,'0')}:${String((i%10)*5).padStart(2,'0')}`,tempoLimite:(i%5)+1}));
let checksum=0;
for(let passo=0;passo<3600;passo+=5){
  const agora=new Date(dt('2026-08-08T08:00:00').getTime()+passo*1000);
  for(const t of matriz){const x=calcularEstadoCronometro(t,agora);checksum+=x.consumoTotal+x.percentual;}
}
ok(Number.isFinite(checksum)&&checksum>0,'36.000 estados de 50 tarefas são calculados sem erro/NaN');

console.log('\nTODAS AS SIMULAÇÕES E O STRESS DO CRONÔMETRO PASSARAM');
