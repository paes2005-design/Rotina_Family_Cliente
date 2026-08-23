(()=>{
  window.__rotinaTimeGuardReady=false;
  window.__rotinaMascoteLoaderVersion=10;
  window.addEventListener('rotina-time-guard-ready',()=>{window.__rotinaTimeGuardReady=true;},{once:true});

  // Bloqueia o modal legado de comemoração. A versão aprovada usa somente o cachorro.
  const diasLegado=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const chave100Legado=`parabens_mostrado_${diasLegado[new Date().getDay()]}`;
  sessionStorage.setItem(chave100Legado,'cachorro-v2');

  import('./client-time-guard-v3.js?v=1').catch(e=>{
    window.rotinaLog?.('perf.time_guard_v3_erro',{mensagem:String(e?.message||e)},'error');
    console.error('Validação temporal v3:',e);
  });
  import('./client-session-integrity.js?v=2').catch(e=>{
    window.rotinaLog?.('integridade.cliente_modulo_erro',{mensagem:String(e?.message||e)},'error');
    console.error('Integridade de sessão do Cliente:',e);
  });
  import('./client-reviewed-points.js').catch(e=>console.error('Pontos revisados:',e));
  import('./client-early-start-ui.js').catch(e=>console.error('Início antecipado Cliente:',e));
  import('./client-tolerance-timer.js?v=2').catch(e=>console.error('Cronômetro de tolerância:',e));
  import('./client-week-nav.js?v=3').catch(e=>console.error('Navegação semanal:',e));
  import('./family-alarm-client.js?v=10').catch(e=>console.error('Despertador programado por tarefa:',e));
  import('./client-history-reconciler.js?v=3').catch(e=>console.error('Reconciliação de pontuação:',e));

  // Som triste aprovado: um único áudio contendo os 3 choramingos.
  import('./client-dog-sad-audio.js?v=6').catch(e=>{
    window.rotinaLog?.('cachorro.modulo_triste_erro',{mensagem:String(e?.message||e)},'error');
    console.error('Som triste do cachorro:',e);
  });
  import('./client-zero-feedback-after-justification.js?v=3').catch(e=>{
    window.rotinaLog?.('tarefa.zero_feedback_modulo_erro',{mensagem:String(e?.message||e)},'error');
    console.error('Feedback de 0% após justificativa:',e);
  });
  import('./client-dog-sad-bubble-v2.js?v=1').catch(e=>{
    window.rotinaLog?.('cachorro.triste_balao_modulo_erro',{mensagem:String(e?.message||e)},'error');
    console.error('Balão triste do cachorro:',e);
  });

  // Única comemoração positiva ativa: cachorro + balão personalizado.
  // Substitui o mascote legado, o personagem dançando e o gatilho de dia apenas por pontos.
  import('./client-dog-celebration-v2.js?v=1').catch(e=>{
    window.__rotinaMascoteLoadError=String(e?.message||e);
    window.rotinaLog?.('cachorro.comemoracao_v2_erro',{mensagem:window.__rotinaMascoteLoadError},'error');
    console.error('Comemoração aprovada do cachorro:',e);
  });

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
    window.avaliarMetaDiariaMascote?.();
  }
  function iniciar(){
    decorar();
    const tbody=document.getElementById('tabelaCorpo');
    if(tbody)new MutationObserver(decorar).observe(tbody,{childList:true,subtree:false});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});else iniciar();
})();