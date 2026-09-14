(()=>{
  'use strict';
  const UI_PRO_VERSION=51;
  window.__rotinaUiProVersion=UI_PRO_VERSION;
  window.__rotinaTimeGuardReady=false;
  window.__rotinaMascoteLoaderVersion=13;
  window.addEventListener('rotina-time-guard-ready',()=>{window.__rotinaTimeGuardReady=true;},{once:true});

  // Impede a comemoração legada. As reações de cachorro/gato são controladas
  // exclusivamente por client-mascot-v3.js, carregado pelo bootstrap central.
  const diasLegado=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const chave100Legado=`parabens_mostrado_${diasLegado[new Date().getDay()]}`;
  sessionStorage.setItem(chave100Legado,'mascote-v3');

  let guardNoticeTimer=null;
  function mostrarPreparacaoGuard(){
    let el=document.getElementById('rotinaGuardPreparingToast');
    if(!el){
      el=document.createElement('div');el.id='rotinaGuardPreparingToast';
      el.style.cssText='position:fixed;left:16px;right:16px;bottom:88px;z-index:25000;background:#173a5e;color:#fff;padding:11px 14px;border-radius:12px;font-weight:700;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.18)';
      document.body.appendChild(el);
    }
    el.textContent='Preparando as tarefas… tente novamente em um instante.';
    clearTimeout(guardNoticeTimer);guardNoticeTimer=setTimeout(()=>el?.remove(),2600);
  }

  // Enquanto a regra temporal nova ainda está inicializando, impede que um toque
  // muito rápido caia nas funções legadas do HTML. O primeiro toque é repetido
  // automaticamente quando o guardião fica pronto, em vez de desaparecer sem resposta.
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('.btn-iniciar,.btn-finalizar');
    if(!btn||window.__rotinaTimeGuardReady===true)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(btn.dataset.rfGuardQueued==='1')return;
    btn.dataset.rfGuardQueued='1';
    mostrarPreparacaoGuard();
    let finished=false;
    const release=()=>{
      if(finished)return;finished=true;delete btn.dataset.rfGuardQueued;
      if(window.__rotinaTimeGuardReady===true&&btn.isConnected)setTimeout(()=>btn.click(),0);
    };
    window.addEventListener('rotina-time-guard-ready',release,{once:true});
    setTimeout(()=>{
      if(finished)return;
      finished=true;delete btn.dataset.rfGuardQueued;
      window.rotinaLog?.('perf.time_guard_inicio_demorado',{limiteMs:8000},'warning');
      mostrarPreparacaoGuard();
    },8000);
  },true);

  const iconeTarefa=(nome='')=>{
    const n=String(nome).toLowerCase();
    const regras=[
      [/videogame|video game|jogar game|jogar jogo|game/, '🎮'],
      [/televis[aã]o|assistir tv|ver tv|tv/, '📺'],
      [/brincar|brincadeira|brinquedo/, '🧸'],
      [/celular|smartphone|telefone|mexer no celular|ficar no celular/, '📱'],
      [/computador|notebook|pc/, '💻'],
      [/cama|dormir|quarto/, '🛏️'],
      [/dente|escovar|higiene bucal/, '🪥'],
      [/banho|chuveiro/, '🚿'],
      [/leitura|ler|livro/, '📖'],
      [/mochila|material escolar/, '🎒'],
      [/estud|dever|lição|licao|prova|escola|ingl[eê]s/, '📚'],
      [/limp|varrer|arrumar|organizar|faxina/, '🧹'],
      [/louça|louca|prato|cozinha/, '🍽️'],
      [/roupa|uniforme|lavar roupa/, '👕'],
      [/lixo/, '🗑️'],
      [/pet|cachorro|gato|ração|racao/, '🐾'],
      [/rem[eé]dio|medica/, '💊'],
      [/exerc|treino|correr|caminhar|academia/, '🏃'],
      [/comer|almo|jantar|caf[eé]|lanche|aliment/, '🍴'],
      [/oração|oracao|rezar/, '🙏']
    ];
    return regras.find(([r])=>r.test(n))?.[1]||'✅';
  };
  window.iconeTarefaRotina=iconeTarefa;

  const clean=value=>String(value??'').trim();
  function participantSnapshot(){
    try{return window.rotinaParticipantStoreSnapshot?.()||window.rotinaParticipantStore?.snapshot?.()||null}catch{return null}
  }
  function observacaoDaTarefa(tarefa){
    for(const campo of ['observacao','observacoes','observações','nota','descricao']){
      const valor=clean(tarefa?.[campo]);
      if(valor)return valor;
    }
    return'';
  }
  function tarefaNoStore(id){
    const taskId=clean(id),snap=participantSnapshot();
    if(!taskId||!snap)return null;
    return [...(snap.tarefasHoje||[]),...(snap.tarefasTodas||[])].find(t=>clean(t?.id)===taskId)||null;
  }
  function garantirModalObservacao(){
    let overlay=document.getElementById('modalObservacaoTarefa');
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='modalObservacaoTarefa';
    overlay.className='overlay observacao-tarefa-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','tituloModalObservacaoTarefa');
    overlay.innerHTML='<div class="modal-box observacao-tarefa-modal"><div class="observacao-tarefa-icone" aria-hidden="true">📝</div><h3 id="tituloModalObservacaoTarefa">Observação da tarefa</h3><strong id="tituloObservacaoTarefa" class="observacao-tarefa-titulo"></strong><div id="textoObservacaoTarefa" class="observacao-tarefa-texto"></div><button type="button" class="btn btn-observacao-fechar">Fechar</button></div>';
    overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.style.display='none'});
    overlay.querySelector('.btn-observacao-fechar')?.addEventListener('click',()=>{overlay.style.display='none'});
    document.body.appendChild(overlay);
    return overlay;
  }
  function abrirObservacao(tarefa){
    const texto=observacaoDaTarefa(tarefa);if(!texto)return;
    const modal=garantirModalObservacao();
    modal.querySelector('#tituloObservacaoTarefa').textContent=clean(tarefa?.nome)||'Tarefa';
    modal.querySelector('#textoObservacaoTarefa').textContent=texto;
    modal.style.display='flex';
    modal.querySelector('.btn-observacao-fechar')?.focus({preventScroll:true});
    try{window.rotinaLog?.('tarefa.observacao_aberta',{tarefaId:clean(tarefa?.id),temObservacao:true,uiProVersion:UI_PRO_VERSION})}catch{}
  }
  function aplicarAcessoObservacao(row,td){
    const tarefa=tarefaNoStore(row?.dataset?.familyTaskId);
    const texto=observacaoDaTarefa(tarefa);
    const existente=td.querySelector('.btn-observacao-tarefa');
    if(!texto){existente?.remove();return}
    let line=td.querySelector(':scope > .task-name-line');
    const wrap=td.querySelector(':scope > .task-name-wrap');
    if(!line&&wrap){
      line=document.createElement('div');line.className='task-name-line';
      wrap.parentNode.insertBefore(line,wrap);line.appendChild(wrap);
    }
    if(!line)return;
    let btn=existente;
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';btn.className='btn-observacao-tarefa';btn.textContent='📝';btn.title='Ver observação';
      btn.setAttribute('aria-label',`Ver observação da tarefa ${clean(tarefa?.nome)||'selecionada'}`);
      line.appendChild(btn);
    }
    btn.onclick=event=>{event.preventDefault();event.stopPropagation();abrirObservacao(tarefa)};
  }

  function decorar(){
    const tabela=document.querySelector('#telaApp table');if(tabela)tabela.classList.add('cliente-task-table');
    document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
      const td=row.children?.[1];if(!td)return;
      let wrap=td.querySelector(':scope > .task-name-wrap');
      if(!wrap){
        const strong=td.querySelector('strong');if(!strong)return;
        wrap=document.createElement('div');wrap.className='task-name-wrap';
        const icon=document.createElement('span');icon.className='task-icon-cliente';icon.setAttribute('aria-hidden','true');icon.textContent=(strong.dataset.taskIcon||'').trim()||iconeTarefa(strong.textContent||'');
        strong.parentNode.insertBefore(wrap,strong);wrap.appendChild(icon);wrap.appendChild(strong);
      }
      aplicarAcessoObservacao(row,td);
    });
    window.aplicarPontosRevisadosCliente?.();
    window.aplicarInicioAntecipadoCliente?.();
    window.prepararCronometrosTolerancia?.();
    window.avaliarMetaDiariaMascote?.();
  }
  function iniciar(){
    decorar();
    const tbody=document.getElementById('tabelaCorpo');
    if(tbody)new MutationObserver(decorar).observe(tbody,{childList:true,subtree:false});
    window.addEventListener('rotina-participant-store-updated',decorar);
    window.addEventListener('rotina-participant-store-ready',decorar);
    try{window.rotinaLog?.('ui.observacao_tarefa_pronta',{uiProVersion:UI_PRO_VERSION,fonte:'participant-store'})}catch{}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();
