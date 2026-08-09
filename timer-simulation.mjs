import {calcularEstadoCronometro,formatarDuracaoCronometro} from './tolerance-timer-core.js';
import {classificarConsumoToleranciaSegundos,limitesToleranciaExata} from './scoring-core.js';

const ok=(cond,msg,extra='')=>{if(!cond)throw new Error(`FALHOU: ${msg}${extra?` | ${extra}`:''}`);console.log(`OK - ${msg}${extra?` | ${extra}`:''}`);};
const dt=s=>new Date(s);
const tarefa=(extra={})=>({id:'T1',nome:'Tarefa teste',diaSemana:'Sábado',horaSugeridaInicio:'08:00',horaSugeridaFim:'08:30',tempoLimite:10,status:'Pendente',...extra});
const show=(nome,t,quando)=>{const e=calcularEstadoCronometro(t,dt(quando));console.log(`${nome.padEnd(30)} | ${quando.slice(11,19)} | ${String(e.percentual).padStart(3)}% | seg=${String(e.consumoTotalSeg).padStart(4)} | ${e.texto||'(oculto)'}`);return e;};

console.log('\n=== REGRA EXATA: 100% + 12,5% + 12,5% ===');
const l10=limitesToleranciaExata(10);
ok(l10.limite100Seg===600,'10 min: janela de 100% = 600 s');
ok(l10.faixa75Seg===75&&l10.faixa50Seg===75,'10 min: 75% e 50% recebem 75 s cada');
ok(l10.limite50Seg===750,'10 min: qualquer pontuação termina em 12:30');
ok(classificarConsumoToleranciaSegundos(10,599).percentual===100,'um segundo antes do zero ainda é 100%');
ok(classificarConsumoToleranciaSegundos(10,600).percentual===75,'bateu 00:00 entra imediatamente em 75%');
ok(classificarConsumoToleranciaSegundos(10,674).percentual===75,'75% dura até um segundo antes de 11:15');
ok(classificarConsumoToleranciaSegundos(10,675).percentual===50,'em 11:15 entra imediatamente em 50%');
ok(classificarConsumoToleranciaSegundos(10,749).percentual===50,'50% dura até um segundo antes de 12:30');
ok(classificarConsumoToleranciaSegundos(10,750).percentual===0,'em 12:30 chega imediatamente a 0%');

const l6=limitesToleranciaExata(6);
ok(l6.faixa75Seg===45&&l6.faixa50Seg===45&&l6.limite50Seg===450,'6 min: 45 s em 75%, 45 s em 50%, 0% em 7:30');
const l2=limitesToleranciaExata(2);
ok(l2.faixa75Seg===15&&l2.faixa50Seg===15&&l2.limite50Seg===150,'2 min: 15 s em 75%, 15 s em 50%, 0% em 2:30');

console.log('\n=== SIMULAÇÃO DO CRONÔMETRO ===');
ok(formatarDuracaoCronometro(462)==='07:42','formata 462 segundos como 07:42');

let e=show('Antes do horário',tarefa(),'2026-08-08T07:59:59');
ok(e.visivel===false,'cronômetro fica oculto antes do início previsto');

e=show('Pendente +2m18s',tarefa(),'2026-08-08T08:02:18');
ok(e.visivel&&e.percentual===100&&e.consumoTotalSeg===138&&e.texto==='⏱️ Tolerância 07:42','pendente consome a tolerância em segundos reais');

e=show('Um segundo antes do zero',tarefa(),'2026-08-08T08:09:59');
ok(e.percentual===100&&e.texto==='⏱️ Tolerância 00:01','100% termina exatamente no zero');

e=show('Zero exato',tarefa(),'2026-08-08T08:10:00');
ok(e.percentual===75&&e.texto==='🟡 75% · extra 01:15','zero exato abre a primeira faixa de 12,5%');

e=show('Fim da faixa 75',tarefa(),'2026-08-08T08:11:14');
ok(e.percentual===75&&e.texto==='🟡 75% · extra 00:01','último segundo da faixa 75 é mostrado corretamente');

e=show('Entrada na faixa 50',tarefa(),'2026-08-08T08:11:15');
ok(e.percentual===50&&e.texto==='🟠 50% · extra 01:15','12,5% consumidos mudam imediatamente para 50%');

e=show('Último segundo com pontos',tarefa(),'2026-08-08T08:12:29');
ok(e.percentual===50&&e.texto==='🟠 50% · extra 00:01','último segundo da faixa 50 permanece em 50%');

e=show('25% extra completo',tarefa(),'2026-08-08T08:12:30');
ok(e.percentual===0&&e.texto==='🔴 Tolerância estourada · 0%','25% adicional completo muda imediatamente para 0%');

const emAndamento=tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:05:00.000',horarioInicio:'08:05'});
e=show('Iniciada +5m',emAndamento,'2026-08-08T08:20:00');
ok(e.consumoTotalSeg===300&&e.texto==='⏱️ Tolerância 05:00'&&e.relogioAtivo==='pausado','atraso do início congela enquanto ainda está dentro do horário final');

e=show('Saldo chega a zero no fim',emAndamento,'2026-08-08T08:35:00');
ok(e.consumoTotalSeg===600&&e.percentual===75&&e.texto==='🟡 75% · extra 01:15','atraso de início + término usa o mesmo saldo e vira 75% no zero');

e=show('Combinado chega a 50%',emAndamento,'2026-08-08T08:36:15');
ok(e.consumoTotalSeg===675&&e.percentual===50,'atrasos de início e fim somados cruzam a faixa em segundos exatos');

e=show('Combinado chega a 0%',emAndamento,'2026-08-08T08:37:30');
ok(e.consumoTotalSeg===750&&e.percentual===0,'saldo combinado zera pontuação após somente 25% adicional');

const t2=tarefa({tempoLimite:2});
ok(show('Tol2 01:59',t2,'2026-08-08T08:01:59').percentual===100,'tolerância 2: um segundo antes do zero = 100%');
ok(show('Tol2 02:00',t2,'2026-08-08T08:02:00').percentual===75,'tolerância 2: zero = 75%');
ok(show('Tol2 02:15',t2,'2026-08-08T08:02:15').percentual===50,'tolerância 2: +12,5% = 50%');
ok(show('Tol2 02:30',t2,'2026-08-08T08:02:30').percentual===0,'tolerância 2: +25% = 0%');

const A=tarefa({id:'A',nome:'A',status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:00:00.000'});
const B=tarefa({id:'B',nome:'B',horaSugeridaInicio:'08:35',horaSugeridaFim:'09:00',status:'Pendente'});
const ea=show('A continua rodando',A,'2026-08-08T08:36:42');
const eb=show('B relógio independente',B,'2026-08-08T08:36:42');
ok(ea.relogioAtivo==='fim'&&eb.relogioAtivo==='inicio'&&eb.texto==='⏱️ Tolerância 08:18','B consome sua própria tolerância mesmo com A ainda rodando');

const ebDepois=show('B após suspensão 7min',B,'2026-08-08T08:43:42');
ok(ebDepois.consumoTotalSeg===522&&ebDepois.texto==='⏱️ Tolerância 01:18','retorno do background recalcula pelo relógio absoluto, sem depender de ticks');

e=show('Início antecipado',tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T07:55:00.000',inicioAntecipado:true,antecipacaoMin:5}),'2026-08-08T08:10:00');
ok(e.atrasoInicioMin===0&&e.consumoTotalSeg===0&&e.texto==='⏱️ Tolerância 10:00','início antecipado não consome tolerância');

const meiaNoite=tarefa({diaSemana:'Sábado',horaSugeridaInicio:'23:55',horaSugeridaFim:'00:10',status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T23:57:00.000',horarioInicio:'23:57'});
e=show('Virada da meia-noite',meiaNoite,'2026-08-09T00:12:30');
ok(e.consumoTotalSeg===270&&e.texto==='⏱️ Tolerância 05:30','virada da meia-noite preserva a data e segundos da execução');

e=show('Tarefa concluída',tarefa({status:'No Prazo (100%)',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:02:00.000',terminoExecutadoEm:'2026-08-08T08:31:00.000',horarioInicio:'08:02',horarioTermino:'08:31'}),'2026-08-08T09:00:00');
ok(e.visivel===false&&e.consumoTotalSeg===180,'cronômetro some ao concluir, preservando o cálculo final');

console.log('\n=== STRESS / REGRESSÃO TEMPORAL ===');
const stress=tarefa({tempoLimite:10});
const snapshot=JSON.stringify(stress);
let anterior=-1,ultimoPct=100;
for(let s=0;s<=24*60*60;s++){
  const agora=new Date(dt('2026-08-08T08:00:00').getTime()+s*1000);
  const x=calcularEstadoCronometro(stress,agora);
  if(!Number.isFinite(x.consumoTotalSeg)||!Number.isFinite(x.restanteNormalSeg)||!Number.isFinite(x.restanteFaixaSeg))throw new Error(`FALHOU: estado numérico inválido no segundo ${s}`);
  if(x.consumoTotalSeg<anterior)throw new Error(`FALHOU: consumo regrediu no segundo ${s}`);
  if(x.percentual>ultimoPct)throw new Error(`FALHOU: percentual melhorou sozinho no segundo ${s}`);
  anterior=x.consumoTotalSeg;ultimoPct=x.percentual;
}
ok(JSON.stringify(stress)===snapshot,'86.401 cálculos não alteram o objeto da tarefa');
ok(anterior===86400,'24 horas pendente calculam 86.400 segundos sem deriva');
ok(ultimoPct===0,'stress de 24 horas termina corretamente em 0%');

const matriz=[];
for(let i=0;i<50;i++)matriz.push(tarefa({id:`M${i}`,nome:`T${i}`,horaSugeridaInicio:`${String(8+Math.floor(i/10)).padStart(2,'0')}:${String((i%10)*5).padStart(2,'0')}`,horaSugeridaFim:`${String(9+Math.floor(i/10)).padStart(2,'0')}:${String((i%10)*5).padStart(2,'0')}`,tempoLimite:(i%5)+1}));
let checksum=0;
for(let passo=0;passo<3600;passo+=5){
  const agora=new Date(dt('2026-08-08T08:00:00').getTime()+passo*1000);
  for(const t of matriz){const x=calcularEstadoCronometro(t,agora);checksum+=x.consumoTotalSeg+x.percentual;}
}
ok(Number.isFinite(checksum)&&checksum>0,'36.000 estados de 50 tarefas são calculados sem erro/NaN');

console.log('\nTODAS AS SIMULAÇÕES DA REGRA 25% E O STRESS PASSARAM');
// integrated full-regression trigger v1
// official v23 regression trigger
