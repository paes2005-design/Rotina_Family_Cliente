(()=>{
  window.__rotinaTimeGuardReady=false;
  window.addEventListener('rotina-time-guard-ready',()=>{window.__rotinaTimeGuardReady=true;},{once:true});
  import('./client-time-guard-v2.js').catch(e=>console.error('Validação temporal v2:',e));
  import('./client-reviewed-points.js').catch(e=>console.error('Pontos revisados:',e));
  import('./client-early-start-ui.js').catch(e=>console.error('Início antecipado Cliente:',e));
  import('./client-tolerance-timer.js').catch(e=>console.error('Cronômetro de tolerância:',e));
  import('./client-week-nav.js?v=3').catch(e=>console.error('Navegação semanal:',e));
  import('./family-alarm-client.js?v=9').catch(e=>console.error('Despertador programado por tarefa:',e));
  import('./client-history-reconciler.js?v=1').catch(e=>console.error('Reconciliação de pontuação:',e));

  // Enquanto a regra temporal nova ainda está inicializando, impede que um toque
  // muito rápido caia nas funções legadas do HTML.
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('.btn-iniciar,.btn-finalizar');
    if(!btn||window.__rotinaTimeGuardReady===true)return;
    e.preventDefault();
    e.stopImmediatePropagation();
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
  function decorar(){
    const tabela=document.querySelector('#telaApp table');if(tabela)tabela.classList.add('cliente-task-table');
    document.querySelectorAll('#tabelaCorpo tr').forEach(row=>{
      const td=row.children?.[1];if(!td||td.querySelector('.task-icon-cliente'))return;
      const strong=td.querySelector('strong');if(!strong)return;
      const wrap=document.createElement('div');wrap.className='task-name-wrap';
      const icon=document.createElement('span');icon.className='task-icon-cliente';icon.setAttribute('aria-hidden','true');icon.textContent=(strong.dataset.taskIcon||'').trim()||iconeTarefa(strong.textContent||'');
      strong.parentNode.insertBefore(wrap,strong);wrap.appendChild(icon);wrap.appendChild(strong);
    });
    window.aplicarPontosRevisadosCliente?.();
    window.aplicarInicioAntecipadoCliente?.();
    window.prepararCronometrosTolerancia?.();
  }
  function iniciar(){
    decorar();
    const tbody=document.getElementById('tabelaCorpo');
    if(tbody)new MutationObserver(decorar).observe(tbody,{childList:true,subtree:false});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();
