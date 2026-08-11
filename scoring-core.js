export const REGRA_PADRAO={dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0};

export function limitesTolerancia(valor){
  const tolerancia=Math.max(0,Number(valor)||0);
  if(tolerancia===0)return {tolerancia:0,limite100:0,limite75:0,limite50:0,extra75:0,extra50:0};
  // Compatibilidade com registros/relatórios antigos baseados em minutos inteiros.
  const extra75=Math.max(1,Math.ceil(tolerancia*0.25));
  const extra50=Math.max(extra75+1,Math.ceil(tolerancia*0.50));
  return {
    tolerancia,
    limite100:tolerancia,
    limite75:tolerancia+extra75,
    limite50:tolerancia+extra50,
    extra75,
    extra50
  };
}

export function classificarConsumoTolerancia(tolerancia,consumo,regra=REGRA_PADRAO){
  const c=Math.max(0,Number(consumo)||0);
  const l=limitesTolerancia(tolerancia);
  if(c<=l.limite100)return {percentual:Number(regra.dentroLimites??100),faixa:'dentro-limites',consumo:c,...l};
  if(c<=l.limite75)return {percentual:Number(regra.atrasoLeve??75),faixa:'atraso-leve',consumo:c,...l};
  if(c<=l.limite50)return {percentual:Number(regra.atrasoMaior??50),faixa:'atraso-maior',consumo:c,...l};
  return {percentual:0,faixa:'estourado',consumo:c,...l};
}

// Regra exata usada pelo cronômetro e pelo fechamento da ocorrência.
// A tolerância configurada é toda a janela de 100%. Ao chegar exatamente a zero,
// entra em 75%. Depois do zero existe somente mais 25% da tolerância como janela
// de recuperação, dividida igualmente entre 75% e 50%.
export function limitesToleranciaExata(valor){
  const tolerancia=Math.max(0,Number(valor)||0);
  const limite100Seg=tolerancia*60;
  const janelaParcialSeg=limite100Seg*0.25;
  const faixa75Seg=janelaParcialSeg/2;
  const faixa50Seg=janelaParcialSeg-faixa75Seg;
  const limite75Seg=limite100Seg+faixa75Seg;
  const limite50Seg=limite100Seg+janelaParcialSeg;
  return {
    tolerancia,
    limite100Seg,
    limite75Seg,
    limite50Seg,
    faixa75Seg,
    faixa50Seg,
    janelaParcialSeg,
    limite100:tolerancia,
    limite75:limite75Seg/60,
    limite50:limite50Seg/60,
    extra75:faixa75Seg/60,
    extra50:janelaParcialSeg/60
  };
}

export function classificarConsumoToleranciaSegundos(tolerancia,consumoSeg,regra=REGRA_PADRAO){
  const c=Math.max(0,Number(consumoSeg)||0);
  const l=limitesToleranciaExata(tolerancia);
  if(l.tolerancia===0){
    if(c===0)return {percentual:Number(regra.dentroLimites??100),faixa:'dentro-limites',consumoSeg:c,...l};
    return {percentual:0,faixa:'estourado',consumoSeg:c,...l};
  }
  if(c<l.limite100Seg)return {percentual:Number(regra.dentroLimites??100),faixa:'dentro-limites',consumoSeg:c,...l};
  if(c<l.limite75Seg)return {percentual:Number(regra.atrasoLeve??75),faixa:'atraso-leve',consumoSeg:c,...l};
  if(c<l.limite50Seg)return {percentual:Number(regra.atrasoMaior??50),faixa:'atraso-maior',consumoSeg:c,...l};
  return {percentual:0,faixa:'estourado',consumoSeg:c,...l};
}

const MINUTO_MS=60000;

// Regra educativa do horário sugerido, independente do cronômetro de tolerância.
// O cadastro HH:MM representa o minuto inteiro: 07:00:00 até 07:00:59.
// Às 07:01:00 termina o horário sugerido e, se houver tolerância, ela começa daí.
export function horarioSugeridoEstourado(real,previsto){
  const atraso=real-previsto;
  return Number.isFinite(atraso)&&atraso>=MINUTO_MS;
}

export function minutosCompletosAtrasoHorarioSugerido(real,previsto){
  const atraso=real-previsto;
  if(!Number.isFinite(atraso)||atraso<MINUTO_MS)return 0;
  return Math.max(1,Math.floor((atraso-MINUTO_MS)/MINUTO_MS)+1);
}

// Mantém os campos históricos em minutos completos, mas também entrega o consumo
// exato em segundos para a classificação rígida do cronômetro.
export function minutosCompletosAtraso(real,previsto){
  return Math.max(0,Math.floor((real-previsto)/60000));
}

export function calcularConsumoAtraso({inicioPrevisto,inicioReal,fimPrevisto,fimReal}){
  const atrasoInicioMs=Math.max(0,inicioReal-inicioPrevisto);
  const atrasoFimMs=Math.max(0,fimReal-fimPrevisto);
  const atrasoInicio=Math.floor(atrasoInicioMs/60000);
  const atrasoFim=Math.floor(atrasoFimMs/60000);
  const consumoTotal=atrasoInicio+atrasoFim;
  const consumoTotalSeg=Math.floor((atrasoInicioMs+atrasoFimMs)/1000);
  return {atrasoInicio,atrasoFim,consumoTotal,consumoTotalSeg};
}
