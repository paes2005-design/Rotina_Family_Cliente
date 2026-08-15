const DIAS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

function partesHorario(valor){
  const match=String(valor||'').trim().match(/^(\d{1,2}):(\d{2})/);
  if(!match)return null;
  const hora=Number(match[1]),minuto=Number(match[2]);
  return hora>=0&&hora<=23&&minuto>=0&&minuto<=59?{hora,minuto}:null;
}

function indiceDia(valor){return DIAS.indexOf(String(valor||'').trim())}

export function proximaOcorrencia(alarme,agora=new Date()){
  const horario=partesHorario(alarme?.horaSugeridaInicio),dia=indiceDia(alarme?.diaSemana);
  if(!horario||dia<0)return null;
  const proxima=new Date(agora);
  proxima.setHours(horario.hora,horario.minuto,0,0);
  let diasAte=(dia-agora.getDay()+7)%7;
  if(diasAte===0&&proxima<=agora)diasAte=7;
  proxima.setDate(proxima.getDate()+diasAte);
  return proxima;
}

export function deveDispararAgora(alarme,agora=new Date(),janelaMs=60000){
  if(!alarme?.ativo||!alarme.tarefaId)return false;
  const horario=partesHorario(alarme.horaSugeridaInicio),dia=indiceDia(alarme.diaSemana);
  if(!horario||dia<0||agora.getDay()!==dia)return false;
  const programado=new Date(agora);
  programado.setHours(horario.hora,horario.minuto,0,0);
  const ativadoEm=Date.parse(alarme.acionadoEm||'');
  if(Number.isFinite(ativadoEm)&&ativadoEm>programado.getTime())return false;
  const atraso=agora.getTime()-programado.getTime();
  return atraso>=0&&atraso<janelaMs;
}

export function descreverProximaOcorrencia(alarme,agora=new Date()){
  const proxima=proximaOcorrencia(alarme,agora);
  if(!proxima)return 'horário ainda não definido';
  return proxima.toLocaleString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}
