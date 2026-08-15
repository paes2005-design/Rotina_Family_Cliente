const DIAS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

function partesHorario(valor){
  const match=String(valor||'').trim().match(/^(\d{1,2}):(\d{2})/);
  if(!match)return null;
  const hora=Number(match[1]),minuto=Number(match[2]);
  return hora>=0&&hora<=23&&minuto>=0&&minuto<=59?{hora,minuto}:null;
}

function indiceDia(valor){return DIAS.indexOf(String(valor||'').trim())}

function tiposSelecionados(alarme){
  const lista=Array.isArray(alarme?.momentos)?alarme.momentos:[alarme?.momento||'inicio'];
  return [...new Set(lista.filter(x=>x==='inicio'||x==='fim'))];
}

function programacoes(alarme){
  const diaInicio=indiceDia(alarme?.diaSemana),inicio=partesHorario(alarme?.horaSugeridaInicio),fim=partesHorario(alarme?.horaSugeridaFim);
  if(diaInicio<0)return [];
  return tiposSelecionados(alarme).flatMap(tipo=>{
    const horario=tipo==='fim'?fim:inicio;
    if(!horario)return [];
    const cruzaMeiaNoite=tipo==='fim'&&inicio&&(horario.hora*60+horario.minuto)<=(inicio.hora*60+inicio.minuto);
    return [{tipo,horario,dia:(diaInicio+(cruzaMeiaNoite?1:0))%7}];
  });
}

function dataLocal(data){
  const ano=data.getFullYear(),mes=String(data.getMonth()+1).padStart(2,'0'),dia=String(data.getDate()).padStart(2,'0');
  return `${ano}-${mes}-${dia}`;
}

export function chaveOcorrencia(alarme,agora=new Date()){
  if(!alarme?.tarefaId)return '';
  const atual=programacoes(alarme).find(p=>p.dia===agora.getDay()&&p.horario.hora===agora.getHours()&&p.horario.minuto===agora.getMinutes());
  if(!atual)return '';
  return `${alarme.tarefaId}__${atual.tipo}__${dataLocal(agora)}__${String(atual.horario.hora).padStart(2,'0')}:${String(atual.horario.minuto).padStart(2,'0')}`;
}

export function proximaOcorrencia(alarme,agora=new Date()){
  const proximas=programacoes(alarme).map(p=>{
    const data=new Date(agora);data.setHours(p.horario.hora,p.horario.minuto,0,0);
    let diasAte=(p.dia-agora.getDay()+7)%7;
    if(diasAte===0&&data<=agora)diasAte=7;
    data.setDate(data.getDate()+diasAte);
    return {data,tipo:p.tipo};
  }).sort((a,b)=>a.data-b.data);
  return proximas[0]||null;
}

export function deveDispararAgora(alarme,agora=new Date(),janelaMs=60000,ocorrenciaSilenciada=''){
  if(!alarme?.ativo||!alarme.tarefaId)return false;
  return programacoes(alarme).some(p=>{
    if(agora.getDay()!==p.dia)return false;
    const programado=new Date(agora);programado.setHours(p.horario.hora,p.horario.minuto,0,0);
    const ativadoEm=Date.parse(alarme.acionadoEm||'');
    if(Number.isFinite(ativadoEm)&&ativadoEm>programado.getTime())return false;
    const atraso=agora.getTime()-programado.getTime();
    const chave=`${alarme.tarefaId}__${p.tipo}__${dataLocal(agora)}__${String(p.horario.hora).padStart(2,'0')}:${String(p.horario.minuto).padStart(2,'0')}`;
    return atraso>=0&&atraso<janelaMs&&ocorrenciaSilenciada!==chave;
  });
}

export function momentoDaOcorrenciaAtual(alarme,agora=new Date()){
  const atual=programacoes(alarme).find(p=>p.dia===agora.getDay()&&p.horario.hora===agora.getHours()&&p.horario.minuto===agora.getMinutes());
  return atual?.tipo||'inicio';
}

export function descreverProximaOcorrencia(alarme,agora=new Date()){
  const proxima=proximaOcorrencia(alarme,agora);
  if(!proxima)return 'horário ainda não definido';
  const rotulo=proxima.tipo==='fim'?'fim':'início';
  return `${rotulo}: ${proxima.data.toLocaleString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`;
}
