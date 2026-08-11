import {calcularEstadoCronometro,formatarDuracaoCronometro} from './tolerance-timer-core.js';
import {classificarConsumoToleranciaSegundos,limitesToleranciaExata,horarioSugeridoEstourado,minutosCompletosAtrasoHorarioSugerido} from './scoring-core.js';

const ok=(cond,msg,extra='')=>{if(!cond)throw new Error(`FALHOU: ${msg}${extra?` | ${extra}`:''}`);console.log(`OK - ${msg}${extra?` | ${extra}`:''}`);};
const dt=s=>new Date(s);
const tarefa=(extra={})=>({id:'T1',nome:'Tarefa teste',diaSemana:'Sábado',horaSugeridaInicio:'08:00',horaSugeridaFim:'08:30',tempoLimite:10,status:'Pendente',...extra});
const show=(nome,t,quando)=>{const e=calcularEstadoCronometro(t,dt(quando));console.log(`${nome.padEnd(34)} | ${quando.slice(11,19)} | ${String(e.percentual).padStart(3)}% | seg=${String(e.consumoTotalSeg).padStart(5)} | ${e.texto||'(oculto)'}`);return e;};

console.log('\n=== CLASSIFICADOR RÍGIDO DO CRONÔMETRO ===');
const l10=limitesToleranciaExata(10);
ok(l10.limite100Seg===600,'10 min = 600 s de faixa 100%');
ok(l10.faixa75Seg===75&&l10.faixa50Seg===75,'faixas 75% e 50% recebem 75 s cada');
ok(classificarConsumoToleranciaSegundos(10,599).percentual===100,'09:59 = 100%');
ok(classificarConsumoToleranciaSegundos(10,600).percentual===75,'10:00 = 75%');
ok(classificarConsumoToleranciaSegundos(10,675).percentual===50,'11:15 = 50%');
ok(classificarConsumoToleranciaSegundos(10,750).percentual===0,'12:30 = 0%');

console.log('\n=== MINUTO SUGERIDO COMPLETO ===');
const hs=dt('2026-08-08T07:00:00');
ok(!horarioSugeridoEstourado(dt('2026-08-08T07:00:59'),hs),'07:00:59 ainda pertence ao horário 07:00');
ok(horarioSugeridoEstourado(dt('2026-08-08T07:01:00'),hs),'07:01:00 é o primeiro instante fora do horário 07:00');
ok(minutosCompletosAtrasoHorarioSugerido(dt('2026-08-08T07:00:59'),hs)===0,'até :59 não registra atraso');
ok(minutosCompletosAtrasoHorarioSugerido(dt('2026-08-08T07:01:00'),hs)===1,'no minuto seguinte registra o primeiro atraso');

console.log('\n=== INÍCIO: TOLERÂNCIA SÓ APÓS :59 ===');
let e=show('08:00:59 ainda é horário sugerido',tarefa(),'2026-08-08T08:00:59');
ok(e.visivel===false&&e.consumoTotalSeg===0,'cronômetro não roda em 08:00:59');
e=show('08:01:00 inicia tolerância',tarefa(),'2026-08-08T08:01:00');
ok(e.visivel&&e.consumoTotalSeg===0&&e.texto==='⏱️ Tolerância 10:00','cronômetro inicia cheio em 08:01:00');
e=show('08:01:01 primeiro segundo',tarefa(),'2026-08-08T08:01:01');
ok(e.consumoTotalSeg===1&&e.texto==='⏱️ Tolerância 09:59','primeiro segundo é consumido após 08:01:00');

const t2=tarefa({tempoLimite:2});
ok(show('Tol2 último segundo 100%',t2,'2026-08-08T08:02:59').texto==='⏱️ Tolerância 00:01','2 min: 08:02:59 ainda tem 1 s');
ok(show('Tol2 zero exato',t2,'2026-08-08T08:03:00').percentual===75,'2 min: zero somente em 08:03:00');

console.log('\n=== TÉRMINO: CENÁRIO 11:21 -> 11:21:59 -> 11:22 ===');
const arrumar={id:'A',nome:'Arrumar casa',diaSemana:'Sábado',horaSugeridaInicio:'10:20',horaSugeridaFim:'11:21',tempoLimite:5,status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T10:20:02.000'};
e=show('Fim 11:21:59',arrumar,'2026-08-08T11:21:59');
ok(e.consumoTotalSeg===0&&e.texto==='⏱️ Tolerância 05:00'&&e.relogioAtivo==='pausado','11:21:59 não consome tolerância');
e=show('Fim 11:22:00',arrumar,'2026-08-08T11:22:00');
ok(e.consumoTotalSeg===0&&e.texto==='⏱️ Tolerância 05:00'&&e.relogioAtivo==='fim','11:22:00 inicia o cronômetro cheio');
e=show('Fim 11:22:01',arrumar,'2026-08-08T11:22:01');
ok(e.consumoTotalSeg===1&&e.texto==='⏱️ Tolerância 04:59','11:22:01 consumiu exatamente 1 s');

console.log('\n=== SALDO ÚNICO INÍCIO + TÉRMINO ===');
const combinado=tarefa({status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:01:15.000'});
e=show('Atraso início 15 s',combinado,'2026-08-08T08:20:00');
ok(e.consumoTotalSeg===15&&e.texto==='⏱️ Tolerância 09:45','início após 08:01 consome 15 s');
e=show('Mais 45 s no término',combinado,'2026-08-08T08:31:45');
ok(e.consumoTotalSeg===60&&e.texto==='⏱️ Tolerância 09:00','15 s de início + 45 s de término = 60 s');

const semTol=tarefa({tempoLimite:0});
e=show('Tolerância zero',semTol,'2026-08-08T08:05:00');
ok(e.visivel===false,'tolerância 0 continua sem cronômetro');

console.log('\n=== RELÓGIOS INDEPENDENTES ===');
const A=tarefa({id:'A',nome:'A',status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:00:00.000'});
const B=tarefa({id:'B',nome:'B',horaSugeridaInicio:'08:35',horaSugeridaFim:'09:00',status:'Pendente'});
const ea=show('A continua independente',A,'2026-08-08T08:36:42');
const eb=show('B começa após 08:35:59',B,'2026-08-08T08:36:42');
ok(ea.relogioAtivo==='fim'&&eb.relogioAtivo==='inicio'&&eb.consumoTotalSeg===42&&eb.texto==='⏱️ Tolerância 09:18','B usa seu próprio relógio a partir de 08:36:00');
const eb2=show('B após suspensão',B,'2026-08-08T08:43:42');
ok(eb2.consumoTotalSeg===462&&eb2.texto==='⏱️ Tolerância 02:18','retorno recalcula pelo relógio absoluto');

console.log('\n=== VIRADA DA MEIA-NOITE ===');
const meiaNoite=tarefa({diaSemana:'Sábado',horaSugeridaInicio:'23:55',horaSugeridaFim:'00:10',status:'Em andamento',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T23:57:00.000'});
e=show('Virada meia-noite',meiaNoite,'2026-08-09T00:12:30');
ok(e.consumoTotalSeg===150&&e.texto==='⏱️ Tolerância 07:30','fronteiras de minuto funcionam atravessando meia-noite');

console.log('\n=== CONCLUÍDA ===');
e=show('Tarefa concluída',tarefa({status:'No Prazo (100%)',dataExecucao:'2026-08-08',inicioExecutadoEm:'2026-08-08T08:02:00.000',terminoExecutadoEm:'2026-08-08T08:31:00.000'}),'2026-08-08T09:00:00');
ok(e.visivel===false&&e.consumoTotalSeg===60,'concluída some e preserva 60 s consumidos');

console.log('\n=== STRESS / REGRESSÃO TEMPORAL ===');
const stress=tarefa({tempoLimite:10});
const snapshot=JSON.stringify(stress);
let anterior=-1,ultimoPct=100;
for(let s=0;s<=24*60*60;s++){
  const agora=new Date(dt('2026-08-08T08:00:00').getTime()+s*1000);
  const x=calcularEstadoCronometro(stress,agora);
  if(!Number.isFinite(x.consumoTotalSeg)||!Number.isFinite(x.restanteNormalSeg)||!Number.isFinite(x.restanteFaixaSeg))throw new Error(`FALHOU: estado inválido no segundo ${s}`);
  if(x.consumoTotalSeg<anterior)throw new Error(`FALHOU: consumo regrediu no segundo ${s}`);
  if(x.percentual>ultimoPct)throw new Error(`FALHOU: percentual melhorou sozinho no segundo ${s}`);
  anterior=x.consumoTotalSeg;ultimoPct=x.percentual;
}
ok(JSON.stringify(stress)===snapshot,'86.401 cálculos não alteram a tarefa');
ok(anterior===86340,'24 h preservam o minuto sugerido antes do consumo');
ok(ultimoPct===0,'stress termina em 0%');

const matriz=[];
for(let i=0;i<50;i++)matriz.push(tarefa({id:`M${i}`,nome:`T${i}`,horaSugeridaInicio:`${String(8+Math.floor(i/10)).padStart(2,'0')}:${String((i%10)*5).padStart(2,'0')}`,horaSugeridaFim:`${String(9+Math.floor(i/10)).padStart(2,'0')}:${String((i%10)*5).padStart(2,'0')}`,tempoLimite:(i%5)+1}));
let checksum=0;
for(let passo=0;passo<3600;passo+=5){
  const agora=new Date(dt('2026-08-08T08:00:00').getTime()+passo*1000);
  for(const t of matriz){const x=calcularEstadoCronometro(t,agora);checksum+=x.consumoTotalSeg+x.percentual;}
}
ok(Number.isFinite(checksum)&&checksum>0,'36.000 estados de 50 tarefas sem NaN/erro');

console.log('\nTODAS AS SIMULAÇÕES DO MINUTO SUGERIDO + TOLERÂNCIA PASSARAM');
