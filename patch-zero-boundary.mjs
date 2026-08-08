import fs from 'fs';
const f='client-time-guard-v2.js';
let s=fs.readFileSync(f,'utf8');
const replaceOnce=(from,to,label)=>{
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 occurrence, found ${n}`);
  s=s.replace(from,to);
};
replaceOnce(
  "import {REGRA_PADRAO,classificarConsumoTolerancia,calcularConsumoAtraso,minutosCompletosAtraso} from './scoring-core.js';",
  "import {REGRA_PADRAO,classificarConsumoToleranciaSegundos,calcularConsumoAtraso,minutosCompletosAtraso} from './scoring-core.js';",
  'exact classifier import'
);
replaceOnce(
  "toleranciaConsumidaMin:calc.consumoTotal,atrasoInicioMin:calc.atrasoInicio,atrasoFimMin:calc.atrasoFim,limite75Min:faixa.limite75,limite50Min:faixa.limite50,",
  "toleranciaConsumidaMin:calc.consumoTotal,toleranciaConsumidaSeg:calc.consumoTotalSeg,atrasoInicioMin:calc.atrasoInicio,atrasoFimMin:calc.atrasoFim,limite75Min:faixa.limite75,limite50Min:faixa.limite50,limite75Seg:faixa.limite75Seg,limite50Seg:faixa.limite50Seg,",
  'exact audit fields'
);
replaceOnce(
  "const agora=new Date(),j=janela(t,agora),ini=inicioReal(t,j,agora),calc=calcularConsumoAtraso({inicioPrevisto:j.inicio,inicioReal:ini,fimPrevisto:j.fim,fimReal:agora}),regra=await regraAtual(),faixa=classificarConsumoTolerancia(t.tempoLimite,calc.consumoTotal,regra);",
  "const agora=new Date(),j=janela(t,agora),ini=inicioReal(t,j,agora),calc=calcularConsumoAtraso({inicioPrevisto:j.inicio,inicioReal:ini,fimPrevisto:j.fim,fimReal:agora}),regra=await regraAtual(),faixa=classificarConsumoToleranciaSegundos(t.tempoLimite,calc.consumoTotalSeg,regra);",
  'final exact scoring'
);
fs.writeFileSync(f,s);
console.log('Exact tolerance boundary patch applied.');
