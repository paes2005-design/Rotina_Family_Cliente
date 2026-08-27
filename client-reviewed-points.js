let unsubscribeHistoricoRevisao=null;
let chaveSessao='';
let historicoPerfil=[];
let historicoCarregado=false;

const pad=n=>String(n).padStart(2,'0');
const dataISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const inicioSemana=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x;};

function sessaoAtual(){
  return {
    grupo:(localStorage.getItem('cliente_grupo')||'').trim(),
    perfilId:(localStorage.getItem('cliente_perfil_id')||'').trim(),
    nome:(localStorage.getItem('cliente_nome')||'').trim()
  };
}

function garantirEstilo(){
  if(document.getElementById('reviewPointsClienteStyle'))return;
  const style=document.createElement('style');
  style.id='reviewPointsClienteStyle';
  style.textContent=`.review-points-note{display:block;margin-top:7px;padding:7px 9px;border-radius:10px;background:#eefbf3;border:1px solid #bfe7cc;color:#166534;font-size:.76rem;font-weight:700;line-height:1.3}.review-points-note.maintained{background:#f8fafc;border-color:#d7e0ea;color:#475569}@media(max-width:700px){.review-points-note{font-size:.72rem;padding:7px 8px}}`;
  document.head.appendChild(style);
}

function encerrarEscuta(){
  if(unsubscribeHistoricoRevisao){unsubscribeHistoricoRevisao();unsubscribeHistoricoRevisao=null;}
  chaveSessao='';historicoPerfil=[];historicoCarregado=false;
}

function garantirEscuta(){
  const s=sessaoAtual();
  const novaChave=`${s.grupo}|${s.perfilId}|${s.nome}`;
  if(!s.grupo||!s.perfilId){encerrarEscuta();return;}
  chaveSessao=novaChave;
  historicoPerfil=(window.rotinaClientCacheSnapshot?.().historico||[]).map(x=>({...x}));
  historicoCarregado=true;
  aplicarTudo(false);
}

function somarPeriodo(inicio,fim){
  return historicoPerfil.reduce((s,h)=>{
    const d=String(h.data||'');
    if(d<inicio||d>fim)return s;
    return s+(Number(h.pontosGanhos)||0);
  },0);
}

function aplicarDashboard(){
  if(!historicoCarregado)return;
  const agora=new Date(),hoje=dataISO(agora),iniSemana=dataISO(inicioSemana(agora));
  const iniMes=`${agora.getFullYear()}-${pad(agora.getMonth()+1)}-01`;
  const fimMes=dataISO(new Date(agora.getFullYear(),agora.getMonth()+1,0));
  const valores={ptsHoje:somarPeriodo(hoje,hoje),ptsSemana:somarPeriodo(iniSemana,hoje),ptsMes:somarPeriodo(iniMes,fimMes)};
  Object.entries(valores).forEach(([id,valor])=>{const el=document.getElementById(id);if(el&&el.textContent!==String(valor))el.textContent=String(valor);});
}

function horarioDaLinha(row){
  const inicio=String(row?.dataset?.familyTaskTime||'').trim();
  const fim=String(row?.dataset?.familyTaskEnd||'').trim();
  if(inicio||fim)return{inicio,fim};
  const txt=row.querySelector('.horario-sugerido')?.textContent||row.children?.[0]?.textContent||'';
  const m=txt.match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
  return m?{inicio:m[1],fim:m[2]}:{inicio:'',fim:''};
}

function historicoRevisadoDaLinha(row){
  const hoje=dataISO(new Date());
  const tarefaId=String(row?.dataset?.familyTaskId||'').trim();
  if(tarefaId){
    return historicoPerfil.find(h=>String(h.data||h.dataExecucao||'')===hoje&&String(h.tarefaId||'')===tarefaId&&h.revisaoStatus==='revisado')||null;
  }
  const nome=row.children?.[1]?.querySelector('strong')?.textContent.trim()||'';
  if(!nome)return null;
  const horario=horarioDaLinha(row);
  const candidatos=historicoPerfil.filter(h=>String(h.data||h.dataExecucao||'')===hoje&&h.nomeTarefa===nome&&h.revisaoStatus==='revisado');
  const exato=candidatos.find(h=>(!horario.inicio||h.horaSugeridaInicio===horario.inicio)&&(!horario.fim||h.horaSugeridaFim===horario.fim));
  if(exato)return exato;
  if(!horario.inicio&&!horario.fim&&candidatos.length===1)return candidatos[0];
  return null;
}

function aplicarTarefas(){
  if(!historicoCarregado)return;
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
    const td=row.children?.[1];if(!td)return;
    const h=historicoRevisadoDaLinha(row);
    let note=td.querySelector('.review-points-note');
    if(!h){note?.remove();return;}
    if(!note){note=document.createElement('span');note.className='review-points-note';td.appendChild(note);}
    const devolvidos=Math.max(0,Number(h.pontosDevolvidos)||0);
    if(devolvidos>0){
      note.classList.remove('maintained');
      note.textContent=`↩️ ${devolvidos} ponto${devolvidos===1?'':'s'} devolvido${devolvidos===1?'':'s'} pelo responsável · total ${Number(h.pontosGanhos)||0}/${Number(h.pontosMaximos)||0} pts`;
    }else{
      note.classList.add('maintained');
      note.textContent='👀 Justificativa revisada · pontuação automática mantida';
    }
  });
}

function aplicarTudo(garantir=true){
  garantirEstilo();
  if(garantir)garantirEscuta();
  aplicarDashboard();
  aplicarTarefas();
  window.dispatchEvent(new CustomEvent('rotina-family-points-updated'));
}

window.aplicarPontosRevisadosCliente=()=>aplicarTudo(true);
document.addEventListener('click',e=>{if(e.target.closest?.('[onclick*="sairCliente"],.btn-sair-top'))queueMicrotask(()=>garantirEscuta());});
window.addEventListener('beforeunload',encerrarEscuta);
window.addEventListener('rotina-client-cache-updated',()=>{garantirEscuta();requestAnimationFrame(()=>aplicarTudo(false));});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>aplicarTudo(true),{once:true});
else aplicarTudo(true);
