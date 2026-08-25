export const REGRA_TOLERANCIA_PADRAO=Object.freeze({
  versao:4,
  janelaAdicionalMaximaPct:25,
  usoJanelaAdicionalPct:100
});

export const REGRA_PONTUACAO=Object.freeze({
  dentroLimites:100,
  atrasoLeve:75,
  atrasoMaior:50,
  estourado:0
});

// Alias temporário para módulos que ainda importam REGRA_PADRAO.
// O objeto contém somente configuração temporal, nunca percentuais de pontos.
export const REGRA_PADRAO=REGRA_TOLERANCIA_PADRAO;

const clampPct=valor=>Math.max(0,Math.min(100,Number.isFinite(Number(valor))?Number(valor):100));

export function normalizarRegraTolerancia(regra=REGRA_TOLERANCIA_PADRAO){
  const r=regra?.regraTolerancia||regra||{};
  return {
    versao:4,
    janelaAdicionalMaximaPct:25,
    usoJanelaAdicionalPct:clampPct(r.usoJanelaAdicionalPct ?? r.janelaAdicionalPct ?? r.percentualJanelaAdicional ?? 100)
  };
}

export function percentualJanelaAdicional(regra=REGRA_TOLERANCIA_PADRAO){
  return normalizarRegraTolerancia(regra).usoJanelaAdicionalPct;
}

// Regra temporal definitiva:
// 1) HH:MM representa o minuto inteiro, do segundo 00 ao 59.
// 2) A tolerância começa no minuto seguinte.
// 3) A tolerância-base é medida rigorosamente em segundos.
// 4) A janela adicional máxima é 25% da tolerância-base.
// 5) O ADM escolhe apenas quanto desses 25% será usado.
// 6) A janela adicional efetiva é dividida igualmente entre as faixas 75 e 50.
export function limitesToleranciaExata(valor,regra=REGRA_TOLERANCIA_PADRAO){
  const tolerancia=Math.max(0,Number(valor)||0);
  const cfg=normalizarRegraTolerancia(regra);
  const limite100Seg=tolerancia*60;
  const janelaPadraoSeg=limite100Seg*(cfg.janelaAdicionalMaximaPct/100);
  const janelaParcialSeg=janelaPadraoSeg*(cfg.usoJanelaAdicionalPct/100);
  const faixa75Seg=janelaParcialSeg/2;
  const faixa50Seg=janelaParcialSeg-faixa75Seg;
  const limite75Seg=limite100Seg+faixa75Seg;
  const limite50Seg=limite100Seg+janelaParcialSeg;
  return {
    tolerancia,
    janelaAdicionalMaximaPct:cfg.janelaAdicionalMaximaPct,
    usoJanelaAdicionalPct:cfg.usoJanelaAdicionalPct,
    janelaAdicionalPct:cfg.usoJanelaAdicionalPct,
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

export function limitesTolerancia(valor,regra=REGRA_TOLERANCIA_PADRAO){
  const l=limitesToleranciaExata(valor,regra);
  return {
    tolerancia:l.tolerancia,
    janelaAdicionalMaximaPct:l.janelaAdicionalMaximaPct,
    usoJanelaAdicionalPct:l.usoJanelaAdicionalPct,
    janelaAdicionalPct:l.usoJanelaAdicionalPct,
    limite100:l.limite100,
    limite75:l.limite75,
    limite50:l.limite50,
    extra75:l.extra75,
    extra50:l.extra50
  };
}

function resultadoFaixa(nome,limites,extras={}){
  const percentual=REGRA_PONTUACAO[nome] ?? 0;
  const faixa=nome==='dentroLimites'?'dentro-limites':nome==='atrasoLeve'?'atraso-leve':nome==='atrasoMaior'?'atraso-maior':'estourado';
  return {percentual,faixa,...extras,...limites};
}

export function classificarConsumoTolerancia(tolerancia,consumo,regra=REGRA_TOLERANCIA_PADRAO){
  const c=Math.max(0,Number(consumo)||0);
  const l=limitesTolerancia(tolerancia,regra);
  if(l.tolerancia===0)return resultadoFaixa('estourado',l,{consumo:c});
  if(c<l.limite100)return resultadoFaixa('dentroLimites',l,{consumo:c});
  if(l.limite75>l.limite100&&c<l.limite75)return resultadoFaixa('atrasoLeve',l,{consumo:c});
  if(l.limite50>l.limite75&&c<l.limite50)return resultadoFaixa('atrasoMaior',l,{consumo:c});
  return resultadoFaixa('estourado',l,{consumo:c});
}

export function classificarConsumoToleranciaSegundos(tolerancia,consumoSeg,regra=REGRA_TOLERANCIA_PADRAO){
  const c=Math.max(0,Number(consumoSeg)||0);
  const l=limitesToleranciaExata(tolerancia,regra);
  if(l.tolerancia===0)return resultadoFaixa('estourado',l,{consumoSeg:c});
  if(c<l.limite100Seg)return resultadoFaixa('dentroLimites',l,{consumoSeg:c});
  if(l.limite75Seg>l.limite100Seg&&c<l.limite75Seg)return resultadoFaixa('atrasoLeve',l,{consumoSeg:c});
  if(l.limite50Seg>l.limite75Seg&&c<l.limite50Seg)return resultadoFaixa('atrasoMaior',l,{consumoSeg:c});
  return resultadoFaixa('estourado',l,{consumoSeg:c});
}

export function calcularPontuacao(pontosMaximos,faixaOuPercentual){
  const max=Math.max(0,Number(pontosMaximos)||0);
  const pct=typeof faixaOuPercentual==='number'
    ? faixaOuPercentual
    : Number(faixaOuPercentual?.percentual ?? 0);
  return Math.round(max*(Math.max(0,Math.min(100,pct))/100));
}

const MINUTO_MS=60000;

// O horário sugerido HH:MM vale durante o minuto inteiro, inclusive o segundo 59.
// Ex.: 07:00 vale até 07:00:59.999; 07:01:00 já está fora do horário sugerido.
export function horarioSugeridoEstourado(real,previsto){
  const atraso=real-previsto;
  return Number.isFinite(atraso)&&atraso>=MINUTO_MS;
}

export function minutosCompletosAtrasoHorarioSugerido(real,previsto){
  const atraso=real-previsto;
  if(!Number.isFinite(atraso)||atraso<MINUTO_MS)return 0;
  return Math.max(1,Math.floor((atraso-MINUTO_MS)/MINUTO_MS)+1);
}

export function minutosCompletosAtraso(real,previsto){
  return Math.max(0,Math.floor((real-previsto)/60000));
}

// Início e término consomem o mesmo saldo. Antecipação nunca gera crédito.
// O cálculo interno usa segundos exatos, sem arredondar para minutos para classificar.
export function calcularConsumoAtraso({inicioPrevisto,inicioReal,fimPrevisto,fimReal}){
  const atrasoInicioMs=Math.max(0,inicioReal-inicioPrevisto);
  const atrasoFimMs=Math.max(0,fimReal-fimPrevisto);
  const atrasoInicio=Math.floor(atrasoInicioMs/60000);
  const atrasoFim=Math.floor(atrasoFimMs/60000);
  const consumoTotal=atrasoInicio+atrasoFim;
  const consumoTotalSeg=Math.floor((atrasoInicioMs+atrasoFimMs)/1000);
  return {atrasoInicio,atrasoFim,consumoTotal,consumoTotalSeg};
}
