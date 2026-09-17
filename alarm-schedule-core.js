const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const pad=valor=>String(valor).padStart(2,'0');

export function normalizarDia(valor){
  const procurado=String(valor||'').trim().replace(/-feira$/i,'').toLocaleLowerCase('pt-BR');
  return DIAS.find(dia=>dia.toLocaleLowerCase('pt-BR')===procurado)||'';
}

export function dataLocal(data){
  return `${data.getFullYear()}-${pad(data.getMonth()+1)}-${pad(data.getDate())}`;
}

export function inicioSemana(data=new Date()){
  const inicio=new Date(data);
  inicio.setHours(0,0,0,0);
  inicio.setDate(inicio.getDate()+(inicio.getDay()===0?-6:1-inicio.getDay()));
  return inicio;
}

export function semanaInicioISO(data=new Date()){
  return dataLocal(inicioSemana(data));
}

export function dataDaSemana(diaSemana,referencia=new Date()){
  const dia=normalizarDia(diaSemana),indice=DIAS.indexOf(dia);
  if(indice<0)return '';
  const data=inicioSemana(referencia);
  data.setDate(data.getDate()+(indice===0?6:indice-1));
  return dataLocal(data);
}

function dataValida(valor){
  const match=String(valor||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const data=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),0,0,0,0);
  return dataLocal(data)===valor?data:null;
}

function partesHorario(valor){
  const match=String(valor||'').trim().match(/^(\d{1,2}):(\d{2})/);
  if(!match)return null;
  const hora=Number(match[1]),minuto=Number(match[2]);
  return hora>=0&&hora<=23&&minuto>=0&&minuto<=59?{hora,minuto}:null;
}

function tiposSelecionados(alarme){
  const lista=Array.isArray(alarme?.momentos)?alarme.momentos:[alarme?.momento||'inicio'];
  return [...new Set(lista.filter(x=>x==='inicio'||x==='fim'))];
}

function dataHorario(dataISO,horario){
  const data=dataValida(dataISO);
  if(!data||!horario)return null;
  data.setHours(horario.hora,horario.minuto,0,0);
  return data;
}

function isoLocal(data){
  if(!(data instanceof Date)||!Number.isFinite(data.getTime()))return '';
  return `${dataLocal(data)}T${pad(data.getHours())}:${pad(data.getMinutes())}:00`;
}

export function agendaDaTarefa(tarefa,referencia=new Date()){
  const dataAgendada=dataValida(tarefa?.dataAgendada)?tarefa.dataAgendada:dataDaSemana(tarefa?.diaSemana,referencia);
  const dataBase=dataValida(dataAgendada);
  if(!dataBase)return {dataAgendada:'',semanaInicio:'',inicioEm:'',fimEm:''};
  const inicio=partesHorario(tarefa?.horaSugeridaInicio),fim=partesHorario(tarefa?.horaSugeridaFim);
  const inicioData=dataHorario(dataAgendada,inicio),fimData=dataHorario(dataAgendada,fim);
  if(inicioData&&fimData&&fimData<=inicioData)fimData.setDate(fimData.getDate()+1);
  return {
    dataAgendada,
    semanaInicio:semanaInicioISO(dataBase),
    inicioEm:isoLocal(inicioData),
    fimEm:isoLocal(fimData)
  };
}

export function alarmeVigente(alarme,agora=new Date()){
  const data=dataValida(alarme?.dataAgendada);
  if(!alarme?.ativo||!data)return false;
  return alarme.semanaInicio===semanaInicioISO(agora)&&alarme.semanaInicio===semanaInicioISO(data);
}

function programacoes(alarme){
  const dataAgendada=dataValida(alarme?.dataAgendada)?alarme.dataAgendada:'';
  const inicio=partesHorario(alarme?.horaSugeridaInicio),fim=partesHorario(alarme?.horaSugeridaFim);
  if(!dataAgendada)return [];
  const inicioData=dataHorario(dataAgendada,inicio),fimData=dataHorario(dataAgendada,fim);
  if(inicioData&&fimData&&fimData<=inicioData)fimData.setDate(fimData.getDate()+1);
  return tiposSelecionados(alarme).flatMap(tipo=>{
    const data=tipo==='fim'?fimData:inicioData;
    return data?[{tipo,data}]:[];
  });
}

function chaveProgramacao(alarme,programacao){
  return `${alarme.tarefaId}__${programacao.tipo}__${dataLocal(programacao.data)}__${pad(programacao.data.getHours())}:${pad(programacao.data.getMinutes())}`;
}

function foiSilenciada(ocorrenciasSilenciadas,chave){
  if(!ocorrenciasSilenciadas||!chave)return false;
  if(typeof ocorrenciasSilenciadas==='string')return ocorrenciasSilenciadas===chave;
  if(Array.isArray(ocorrenciasSilenciadas))return ocorrenciasSilenciadas.includes(chave);
  if(ocorrenciasSilenciadas instanceof Set)return ocorrenciasSilenciadas.has(chave);
  return typeof ocorrenciasSilenciadas==='object'&&ocorrenciasSilenciadas[chave]===true;
}

export function chaveOcorrencia(alarme,agora=new Date(),janelaMs=300000,ocorrenciasSilenciadas=''){
  if(!alarme?.tarefaId)return '';
  const atual=programacoes(alarme)
    .filter(p=>agora.getTime()>=p.data.getTime()&&agora.getTime()-p.data.getTime()<janelaMs)
    .filter(p=>!foiSilenciada(ocorrenciasSilenciadas,chaveProgramacao(alarme,p)))
    .sort((a,b)=>b.data-a.data)[0];
  return atual?chaveProgramacao(alarme,atual):'';
}

export function proximaOcorrencia(alarme,agora=new Date()){
  return programacoes(alarme)
    .filter(p=>p.data.getTime()+60000>agora.getTime())
    .sort((a,b)=>a.data-b.data)[0]||null;
}

export function deveDispararAgora(alarme,agora=new Date(),janelaMs=300000,ocorrenciasSilenciadas=''){
  if(!alarmeVigente(alarme,agora)||!alarme.tarefaId)return false;
  return programacoes(alarme).some(p=>{
    const ativadoEm=Date.parse(alarme.acionadoEm||'');
    if(Number.isFinite(ativadoEm)&&ativadoEm>p.data.getTime())return false;
    const atraso=agora.getTime()-p.data.getTime();
    return atraso>=0&&atraso<janelaMs&&!foiSilenciada(ocorrenciasSilenciadas,chaveProgramacao(alarme,p));
  });
}

export function momentoDaOcorrenciaAtual(alarme,agora=new Date(),janelaMs=300000,ocorrenciasSilenciadas=''){
  const atual=programacoes(alarme)
    .filter(p=>agora.getTime()>=p.data.getTime()&&agora.getTime()-p.data.getTime()<janelaMs)
    .filter(p=>!foiSilenciada(ocorrenciasSilenciadas,chaveProgramacao(alarme,p)))
    .sort((a,b)=>b.data-a.data)[0];
  return atual?.tipo||'inicio';
}

export function descreverProximaOcorrencia(alarme,agora=new Date()){
  const proxima=proximaOcorrencia(alarme,agora);
  if(!proxima)return 'nenhum toque restante nesta data';
  const rotulo=proxima.tipo==='fim'?'fim':'início';
  return `${rotulo}: ${proxima.data.toLocaleString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`;
}
