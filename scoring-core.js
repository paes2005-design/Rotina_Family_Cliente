export const REGRA_PADRAO=Object.freeze({
  dentroLimites:100,
  atrasoLeve:75,
  atrasoMaior:50,
  estourado:0,
  janelaAdicionalPct:100
});

const clampPct=valor=>Math.max(0,Math.min(100,Number.isFinite(Number(valor))?Number(valor):100));

// Compatibilidade: durante um período o campo dentroLimites foi usado, por engano,
// como percentual de pontos. Se ainda não existir janelaAdicionalPct, o valor antigo
// passa a ser interpretado como o percentual da JANELA ADICIONAL de tolerância.
export function percentualJanelaAdicional(regra=REGRA_PADRAO){
  return clampPct(regra?.janelaAdicionalPct ?? regra?.percentualJanelaAdicional ?? regra?.dentroLimites ?? 100);
}

// Regra temporal definitiva:
// - a tolerância-base da tarefa é 100% da janela principal;
// - existe uma janela adicional padrão de 25% da tolerância-base;
// - o administrador escolhe quanto dessa janela adicional será utilizado (0..100%);
// - a janela adicional efetiva é dividida ao meio: faixa 75 e faixa 50;
// - os rótulos 100/75/50/0 representam FAIXAS DE TEMPO, nunca percentual dos pontos.
export function limitesToleranciaExata(valor,regra=REGRA_PADRAO){
  const tolerancia=Math.max(0,Number(valor)||0);
  const limite100Seg=tolerancia*60;
  const janelaAdicionalPct=percentualJanelaAdicional(regra);
  const janelaPadraoSeg=limite100Seg*0.25;
  const janelaParcialSeg=janelaPadraoSeg*(janelaAdicionalPct/100);
  const faixa75Seg=janelaParcialSeg/2;
  const faixa50Seg=janelaParcialSeg-faixa75Seg;
  const limite75Seg=limite100Seg+faixa75Seg;
  const limite50Seg=limite100Seg+janelaParcialSeg;
  return {
    tolerancia,
    janelaAdicionalPct,
    janelaPadraoSeg,
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

// Compatibilidade com telas/relatórios que ainda trabalham em minutos.
export function limitesTolerancia(valor,regra=REGRA_PADRAO){
  const l=limitesToleranciaExata(valor,regra);
  return {
    tolerancia:l.tolerancia,
    janelaAdicionalPct:l.janelaAdicionalPct,
    limite100:l.limite100,
    limite75:l.limite75,
    limite50:l.limite50,
    extra75:l.extra75,
    extra50:l.extra50
  };
}

export function classificarConsumoTolerancia(tolerancia,consumo,regra=REGRA_PADRAO){
  const c=Math.max(0,Number(consumo)||0);
  const l=limitesTolerancia(tolerancia,regra);
  if(l.tolerancia===0){
    if(c===0)return {percentual:100,faixa:'dentro-limites',consumo:c,...l};
    return {percentual:0,faixa:'estourado',consumo:c,...l};
  }
  if(c<l.limite100)return {percentual:100,faixa:'dentro-limites',consumo:c,...l};
  if(l.limite75>l.limite100&&c<l.limite75)return {percentual:75,faixa:'atraso-leve',consumo:c,...l};
  if(l.limite50>l.limite75&&c<l.limite50)return {percentual:50,faixa:'atraso-maior',consumo:c,...l};
  return {percentual:0,faixa:'estourado',consumo:c,...l};
}

export function classificarConsumoToleranciaSegundos(tolerancia,consumoSeg,regra=REGRA_PADRAO){
  const c=Math.max(0,Number(consumoSeg)||0);
  const l=limitesToleranciaExata(tolerancia,regra);
  if(l.tolerancia===0){
    if(c===0)return {percentual:100,faixa:'dentro-limites',consumoSeg:c,...l};
    return {percentual:0,faixa:'estourado',consumoSeg:c,...l};
  }
  if(c<l.limite100Seg)return {percentual:100,faixa:'dentro-limites',consumoSeg:c,...l};
  if(l.limite75Seg>l.limite100Seg&&c<l.limite75Seg)return {percentual:75,faixa:'atraso-leve',consumoSeg:c,...l};
  if(l.limite50Seg>l.limite75Seg&&c<l.limite50Seg)return {percentual:50,faixa:'atraso-maior',consumoSeg:c,...l};
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
