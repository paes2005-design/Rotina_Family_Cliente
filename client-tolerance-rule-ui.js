import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,doc,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let fatorAtual=100;
let unsubscribe=null;

const clamp=v=>Math.max(0,Math.min(100,Number.isFinite(Number(v))?Number(v):100));
const fmt=v=>Number(Number(v).toFixed(2)).toLocaleString('pt-BR');
const grupoAtual=()=>String(localStorage.getItem('cliente_grupo')||'').trim();
const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,detalhes,nivel);}catch{}};

function fatorDaConfig(config={}){
  const r=config.regraAtraso||config||{};
  return clamp(r.janelaAdicionalPct ?? r.percentualJanelaAdicional ?? r.dentroLimites ?? 100);
}

function textoRegra(){
  const extra=25*fatorAtual/100;
  const metade=extra/2;
  return `<strong>Como funciona o saldo de tolerância</strong><br><br>`+
    `Cada tarefa possui uma tolerância-base em minutos. O atraso no início e o atraso no término consomem o mesmo saldo.<br><br>`+
    `✅ <strong>Faixa 100%</strong>: dentro da tolerância-base.<br>`+
    `🟡 <strong>Faixa 75%</strong>: primeira metade da janela adicional (${fmt(metade)}% da tolerância-base).<br>`+
    `🟠 <strong>Faixa 50%</strong>: segunda metade da janela adicional (${fmt(metade)}% da tolerância-base).<br>`+
    `🔴 <strong>Faixa 0%</strong>: toda a tolerância válida foi consumida.<br><br>`+
    `Este grupo usa <strong>${fmt(fatorAtual)}%</strong> da janela adicional padrão de 25%. Isso equivale a até <strong>${fmt(extra)}%</strong> da tolerância-base além do saldo principal.<br><br>`+
    `<strong>Pontos:</strong> os percentuais acima representam <strong>tempo</strong>, não pontuação. Se a tarefa for concluída nas faixas 100%, 75% ou 50%, ela recebe <strong>todos os pontos cadastrados</strong>. Somente a faixa 0% zera a pontuação automática.`;
}

function instalarInterface(){
  const botao=[...document.querySelectorAll('button')].find(b=>/Como funciona a pontua/i.test(b.textContent||''));
  if(botao)botao.textContent='ℹ️ Como funciona a tolerância e os pontos';
  window.abrirInfoRegraAtraso=()=>{
    const el=document.getElementById('textoRegraAtrasoCliente');
    if(el)el.innerHTML=textoRegra();
    const modal=document.getElementById('modalInfoRegraAtraso');
    if(modal)modal.style.display='flex';
  };
}

function observarGrupo(grupoId=''){
  unsubscribe?.();unsubscribe=null;
  const g=String(grupoId||grupoAtual()).trim();
  if(!g||!getApps().length)return;
  const db=getFirestore(getApp());
  unsubscribe=onSnapshot(doc(db,'configGrupos',g),snap=>{
    fatorAtual=fatorDaConfig(snap.exists()?snap.data():{});
    instalarInterface();
    log('tolerancia.regra_tempo_carregada',{grupoId:g,janelaAdicionalPct:fatorAtual,janelaExtraEfetivaPct:Number((25*fatorAtual/100).toFixed(2)),versao:3});
  },erro=>log('tolerancia.regra_tempo_erro',{grupoId:g,mensagem:String(erro?.message||erro)},'warning'));
}

function iniciar(tentativa=0){
  instalarInterface();
  const g=grupoAtual();
  if(!getApps().length){if(tentativa<120)setTimeout(()=>iniciar(tentativa+1),50);return;}
  if(g)observarGrupo(g);
}
window.addEventListener('rotina-client-session-ready',e=>observarGrupo(e.detail?.grupo||''));
window.addEventListener('beforeunload',()=>unsubscribe?.());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>iniciar(),{once:true});else iniciar();
