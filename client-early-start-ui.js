const pad=n=>String(n).padStart(2,'0');
const hojeISO=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
let tarefas=[];
let chaveSessao='';
let unsubscribe=null;
let iniciando=false;

function sessao(){return {grupo:(localStorage.getItem('cliente_grupo')||'').trim(),perfil:(localStorage.getItem('cliente_perfil_id')||'').trim(),nome:(localStorage.getItem('cliente_nome')||'').trim()};}
function horarioLinha(row){
  const txt=row.children?.[0]?.querySelector('.horario-sugerido')?.textContent||'';
  const m=String(txt).match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
  return m?{inicio:m[1],fim:m[2]}:{inicio:'',fim:''};
}
function tarefaDaLinha(row){
  const nome=row.children?.[1]?.querySelector('strong')?.textContent.trim()||'';
  const h=horarioLinha(row);
  return tarefas.find(t=>t.nome===nome&&(!h.inicio||t.horaSugeridaInicio===h.inicio)&&(!h.fim||t.horaSugeridaFim===h.fim))||null;
}
function garantirEstilo(){
  if(document.getElementById('clientEarlyStartStyle'))return;
  const s=document.createElement('style');s.id='clientEarlyStartStyle';
  s.textContent=`.early-start-client-badge{display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 8px;border:1px solid #93c5fd;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:.78rem;font-weight:800;line-height:1.15;white-space:normal}`;
  document.head.appendChild(s);
}
function aplicar(){
  garantirEstilo();
  const hoje=hojeISO();
  document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
    const td=row.children?.[1];if(!td)return;
    const t=tarefaDaLinha(row);
    const mostrar=t?.inicioAntecipado===true&&t?.dataExecucao===hoje;
    let badge=td.querySelector('.early-start-client-badge');
    if(!mostrar){badge?.remove();return;}
    if(!badge){badge=document.createElement('span');badge.className='early-start-client-badge';badge.textContent='🔵 Início antecipado';const ancora=td.querySelector('.task-name-wrap')||td.querySelector('strong');ancora?.insertAdjacentElement('afterend',badge);}
  });
}
function garantirEscuta(){
  if(iniciando)return;
  const s=sessao(),chave=`${s.grupo}|${s.perfil||s.nome}`;
  if(!s.grupo||(!s.perfil&&!s.nome)){chaveSessao='';tarefas=[];return;}
  iniciando=true;
  try{
    chaveSessao=chave;
    const cache=window.rotinaClientCacheSnapshot?.();
    tarefas=(cache?.tarefasTodas||[]).filter(t=>t.perfilId?s.perfil&&t.perfilId===s.perfil:t.perfilNome===s.nome);
  }finally{iniciando=false;}
}
window.aplicarInicioAntecipadoCliente=()=>{garantirEscuta();aplicar();};
window.iniciarInicioAntecipadoCliente=garantirEscuta;
window.addEventListener('rotina-client-cache-updated',()=>{garantirEscuta();aplicar();});
window.addEventListener('rotina-client-session-ready',()=>{garantirEscuta();aplicar();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{garantirEscuta();aplicar();},{once:true});else{garantirEscuta();aplicar();}

