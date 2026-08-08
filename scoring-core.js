export const REGRA_PADRAO={dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0};

export function limitesTolerancia(valor){
  const tolerancia=Math.max(0,Number(valor)||0);
  if(tolerancia===0)return {tolerancia:0,limite100:0,limite75:0,limite50:0,extra75:0,extra50:0};
  // Para tolerâncias pequenas, preserva ao menos 1 minuto útil na faixa de 75%
  // e mais 1 minuto útil na faixa de 50%.
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

export function calcularConsumoAtraso({inicioPrevisto,inicioReal,fimPrevisto,fimReal}){
  const atrasoInicio=Math.max(0,(inicioReal-inicioPrevisto)/60000);
  const atrasoFim=Math.max(0,(fimReal-fimPrevisto)/60000);
  return {atrasoInicio,atrasoFim,consumoTotal:atrasoInicio+atrasoFim};
}
