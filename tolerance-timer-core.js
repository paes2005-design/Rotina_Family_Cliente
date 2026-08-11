import {classificarConsumoToleranciaSegundos} from './scoring-core.js';

const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MINUTO=60000;
const pad=n=>String(n).padStart(2,'0');

function horarioNaData(base,hhmm){
  const [h,m]=String(hhmm||'00:00').split(':').map(Number);
  const d=new Date(base);
  d.setHours(h||0,m||0,0,0);
  return d;
}

function dataDeExecucao(valor){
  const [a,m,d]=String(valor||'').split('-').map(Number);
  return a&&m&&d?new Date(a,m-1,d):null;
}

export function dataOcorrenciaCronometro(t,agora=new Date()){
  if(t?.status==='Em andamento'&&t?.dataExecucao){
    const d=dataDeExecucao(t.dataExecucao);
    if(d)return d;
  }
  const alvo=DIAS.indexOf(t?.diaSemana);
  const d=new Date(agora);d.setHours(0,0,0,0);
  if(alvo>=0)d.setDate(d.getDate()-((d.getDay()-alvo+7)%7));
  return d;
}

export function janelaCronometro(t,agora=new Date()){
  const ocorr=dataOcorrenciaCronometro(t,agora);
  const inicio=horarioNaData(ocorr,t?.horaSugeridaInicio);
  const fim=horarioNaData(ocorr,t?.horaSugeridaFim);
  if(fim<=inicio)fim.setDate(fim.getDate()+1);
  return {ocorr,inicio,fim};
}

function dataValida(valor){
  if(!valor)return null;
  const d=new Date(valor);
  return Number.isNaN(d.getTime())?null:d;
}

function inicioReal(t,j,agora){
  const iso=dataValida(t?.inicioExecutadoEm);
  if(iso)return iso;
  if(!t?.horarioInicio)return agora;
  const d=horarioNaData(j.ocorr,t.horarioInicio);
  if(d<j.inicio&&(j.inicio-d)>12*60*MINUTO)d.setDate(d.getDate()+1);
  return d;
}

function terminoReal(t,j,agora){
  const iso=dataValida(t?.terminoExecutadoEm);
  if(iso)return iso;
  if(!t?.horarioTermino)return agora;
  const d=horarioNaData(j.ocorr,t.horarioTermino);
  if(d<j.inicio)d.setDate(d.getDate()+1);
  return d;
}

const atrasoMs=(real,previsto)=>Math.max(0,real-previsto);
const minutosCompletos=ms=>Math.max(0,Math.floor(ms/MINUTO));
const aposMinutoSugerido=previsto=>new Date(previsto.getTime()+MINUTO);

export function formatarDuracaoCronometro(segundos){
  const s=Math.max(0,Math.floor(Number(segundos)||0));
  const min=Math.floor(s/60),sec=s%60;
  return `${pad(min)}:${pad(sec)}`;
}

export function calcularEstadoCronometro(t,agora=new Date()){
  const status=String(t?.status||'Pendente');
  const pendente=status==='Pendente';
  const andamento=status==='Em andamento';
  const concluida=!pendente&&!andamento;
  const j=janelaCronometro(t,agora);
  const tolerancia=Math.max(0,Number(t?.tempoLimite)||0);

  let atrasoInicioMs=0,atrasoFimMs=0,relogioAtivo='nenhum';
  const limiteInicio=aposMinutoSugerido(j.inicio),limiteFim=aposMinutoSugerido(j.fim);
  if(pendente){
    atrasoInicioMs=atrasoMs(agora,limiteInicio);
    if(agora>=limiteInicio)relogioAtivo='inicio';
  }else{
    const ini=inicioReal(t,j,agora);
    atrasoInicioMs=atrasoMs(ini,limiteInicio);
    if(andamento){
      atrasoFimMs=atrasoMs(agora,limiteFim);
      relogioAtivo=agora>=limiteFim?'fim':'pausado';
    }else{
      const fim=terminoReal(t,j,agora);
      atrasoFimMs=atrasoMs(fim,limiteFim);
      relogioAtivo='finalizado';
    }
  }

  const atrasoInicioMin=minutosCompletos(atrasoInicioMs);
  const atrasoFimMin=minutosCompletos(atrasoFimMs);
  const consumoTotal=atrasoInicioMin+atrasoFimMin;
  const consumoTotalSeg=Math.max(0,Math.floor((atrasoInicioMs+atrasoFimMs)/1000));
  const faixa=classificarConsumoToleranciaSegundos(tolerancia,consumoTotalSeg);
  const restanteNormalSeg=Math.max(0,Math.ceil(faixa.limite100Seg-consumoTotalSeg));
  const restanteFaixaSeg=faixa.faixa==='atraso-leve'
    ?Math.max(0,Math.ceil(faixa.limite75Seg-consumoTotalSeg))
    :faixa.faixa==='atraso-maior'
      ?Math.max(0,Math.ceil(faixa.limite50Seg-consumoTotalSeg))
      :0;

  let texto='',tom='normal';
  if(faixa.percentual===100){
    texto=`⏱️ Tolerância ${formatarDuracaoCronometro(restanteNormalSeg)}`;
    tom='normal';
  }else if(faixa.percentual===75){
    texto=`🟡 75% · extra ${formatarDuracaoCronometro(restanteFaixaSeg)}`;tom='leve';
  }else if(faixa.percentual===50){
    texto=`🟠 50% · extra ${formatarDuracaoCronometro(restanteFaixaSeg)}`;tom='maior';
  }else{
    texto='🔴 Tolerância estourada · 0%';tom='estourado';
  }

  const visivel=tolerancia>0&&!concluida&&(andamento||(pendente&&agora>=limiteInicio));
  return {
    visivel,texto,tom,status,relogioAtivo,tolerancia,
    atrasoInicioMin,atrasoFimMin,consumoTotal,consumoTotalSeg,
    percentual:faixa.percentual,faixa:faixa.faixa,
    restanteNormalSeg,restanteFaixaSeg,
    limite100Seg:faixa.limite100Seg,limite75Seg:faixa.limite75Seg,limite50Seg:faixa.limite50Seg,
    faixa75Seg:faixa.faixa75Seg,faixa50Seg:faixa.faixa50Seg,
    inicioPrevisto:j.inicio,fimPrevisto:j.fim,
    inicioToleranciaPrevisto:limiteInicio,fimToleranciaPrevisto:limiteFim
  };
}
