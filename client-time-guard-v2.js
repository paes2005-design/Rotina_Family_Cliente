import {getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getFirestore,doc,getDoc,updateDoc,setDoc,collection,query,where,getDocs} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {REGRA_PADRAO,classificarConsumoToleranciaSegundos,calcularConsumoAtraso,minutosCompletosAtrasoHorarioSugerido,horarioSugeridoEstourado} from './scoring-core.js';

const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const pad=n=>String(n).padStart(2,'0');
const dataISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const horaHM=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const grupo=()=>localStorage.getItem('cliente_grupo')||'';
const perfil=()=>localStorage.getItem('cliente_perfil_id')||'';
const nome=()=>localStorage.getItem('cliente_nome')||'';
let instalado=false;

function horarioNaData(base,hhmm){const [h,m]=String(hhmm||'00:00').split(':').map(Number);const d=new Date(base);d.setHours(h||0,m||0,0,0);return d;}
function dataOcorrencia(t,agora=new Date()){
  // dataExecucao só é confiável enquanto a execução atual está em andamento.
  // Ao voltar para Pendente em uma nova semana, ignora qualquer data antiga remanescente.
  if(t.status==='Em andamento'&&t.dataExecucao){const [a,m,d]=String(t.dataExecucao).split('-').map(Number);if(a&&m&&d)return new Date(a,m-1,d);}
  const alvo=DIAS.indexOf(t.diaSemana),d=new Date(agora);d.setHours(0,0,0,0);
  if(alvo>=0)d.setDate(d.getDate()-((d.getDay()-alvo+7)%7));
  return d;
}
function janela(t,agora=new Date()){
  const ocorr=dataOcorrencia(t,agora),inicio=horarioNaData(ocorr,t.horaSugeridaInicio),fim=horarioNaData(ocorr,t.horaSugeridaFim);
  if(fim<=inicio)fim.setDate(fim.getDate()+1);
  return {ocorr,inicio,fim};
}
const aposMinutoSugerido=d=>new Date(d.getTime()+60000);
function inicioReal(t,j,agora){
  if(t.inicioExecutadoEm){const d=new Date(t.inicioExecutadoEm);if(!Number.isNaN(d.getTime()))return d;}
  if(!t.horarioInicio)return agora;
  const d=horarioNaData(j.ocorr,t.horarioInicio);
  if(d<j.inicio&&(j.inicio-d)>12*60*60*1000)d.setDate(d.getDate()+1);
  return d;
}
async function db(){if(!getApps().length)throw new Error('Firebase ainda não inicializado');return getFirestore(getApp());}
async function buscarTarefa(id){const banco=await db(),s=await getDoc(doc(banco,'tarefas',id));return s.exists()?{id:s.id,...s.data()}:null;}
async function regraAtual(){
  try{const g=grupo();if(!g)return REGRA_PADRAO;const banco=await db(),s=await getDoc(doc(banco,'configGrupos',g));const r=s.exists()?(s.data().regraAtraso||{}):{};return {dentroLimites:Number(r.dentroLimites??100),atrasoLeve:Number(r.atrasoLeve??75),atrasoMaior:Number(r.atrasoMaior??50),estourado:0};}catch{return REGRA_PADRAO;}
}
function avaliarOrdemLista(lista,t){
  const outra=lista.find(x=>x.id!==t.id&&x.status==='Em andamento');
  if(outra)return {permitida:false,motivo:'outra-em-andamento',tarefa:outra};
  const i=lista.findIndex(x=>x.id===t.id);
  if(i<0)return {permitida:true};
  const anterior=lista.slice(0,i).find(x=>(x.status||'Pendente')==='Pendente');
  if(anterior)return {permitida:false,motivo:'anterior-pendente',tarefa:anterior};
  return {permitida:true};
}
function verificarOrdemRenderizada(t){
  const rows=[...document.querySelectorAll('#tabelaCorpo tr[data-family-task-id]')];
  if(!rows.length)return null;
  const lista=rows.map(row=>({
    id:String(row.dataset.familyTaskId||'').trim(),
    status:String(row.dataset.familyTaskStatus||'Pendente').trim()||'Pendente',
    nome:row.children?.[1]?.querySelector('strong')?.textContent?.trim()||''
  })).filter(x=>x.id);
  if(!lista.some(x=>x.id===t.id))return null;
  return avaliarOrdemLista(lista,t);
}
async function verificarOrdem(t){
  const local=verificarOrdemRenderizada(t);
  if(local)return local;
  const banco=await db(),g=grupo();if(!g)return {permitida:true};
  const s=await getDocs(query(collection(banco,'tarefas'),where('grupoId','==',g)));
  const lista=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>(x.perfilId?x.perfilId===perfil():x.perfilNome===nome())&&x.diaSemana===t.diaSemana).sort((a,b)=>(a.horaSugeridaInicio||'').localeCompare(b.horaSugeridaInicio||''));
  return avaliarOrdemLista(lista,t);
}
function avisar(msg){const m=document.getElementById('modalTrava');if(m){const p=m.querySelector('p');if(p)p.innerHTML=msg;m.style.display='flex';}else alert(msg.replace(/<[^>]*>/g,' '));}
function avisarBloqueioOrdem(r){
  if(r?.motivo==='outra-em-andamento')avisar(`<strong>Outra tarefa ainda está em andamento.</strong><br><br>Finalize “${r.tarefa?.nome||'a tarefa atual'}” antes de iniciar esta.`);
  else avisar(`<strong>Não é permitido pular uma tarefa.</strong><br><br>Conclua primeiro “${r?.tarefa?.nome||'a tarefa anterior'}”.`);
}
async function registrarInicio(t,agora,j,antecipacao=null){
  const atrasoInicio=minutosCompletosAtrasoHorarioSugerido(agora,j.inicio),banco=await db();
  const antecipado=Boolean(antecipacao);
  const antecipacaoMin=antecipado?Math.max(0,Math.floor((j.inicio-agora)/60000)):0;
  const dados={status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),dataExecucao:dataISO(j.ocorr),iniciouComAtraso:atrasoInicio>0,atrasoInicioMin:atrasoInicio,inicioAntecipado:antecipado,antecipacaoMin,motivoInicioAntecipado:antecipado?(antecipacao.motivo||''):'',tipoMotivoInicioAntecipado:antecipado?(antecipacao.tipo||''):''};
  await Promise.all([
    updateDoc(doc(banco,'tarefas',t.id),dados),
    setDoc(doc(banco,'execucoes',`${dataISO(j.ocorr)}__${t.id}`),{grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:t.id,nomeTarefa:t.nome,data:dataISO(j.ocorr),...dados},{merge:true})
  ]);
}
function pedirMotivoAntecipacao(t,agora,j){
  document.getElementById('guardEarlyModalV2')?.remove();
  const m=document.createElement('div');m.id='guardEarlyModalV2';m.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
  m.innerHTML=`<div style="width:min(92vw,460px);background:#fff;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.25)"><h2 style="margin-top:0">⏰ Esta tarefa está adiantada</h2><p>Ela está programada para começar às <strong>${t.horaSugeridaInicio}</strong>. Você pode começar mais cedo, mas informe o motivo.</p><div id="guardEarlyOptions" style="display:grid;gap:8px;margin:14px 0"><button type="button" class="btn" data-early-reason="anterior-finalizada">✅ Terminei a tarefa anterior mais cedo</button><button type="button" class="btn" data-early-reason="responsavel-autorizou">👤 Meu responsável autorizou</button><button type="button" class="btn" data-early-reason="mudanca-rotina">🔄 Mudança na rotina</button><button type="button" class="btn" data-early-reason="outro">✏️ Outro motivo</button></div><textarea id="guardEarlyOther" rows="3" style="display:none;width:100%;box-sizing:border-box;padding:11px;border:2px solid #ddd;border-radius:12px;font:inherit" placeholder="Conte brevemente o motivo..."></textarea><div id="guardEarlyErr" style="display:none;color:#b91c1c;margin-top:8px"></div><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px"><button type="button" id="guardEarlyCancel" class="btn">Esperar o horário</button><button type="button" id="guardEarlyConfirm" class="btn" disabled style="background:var(--cor-primaria,#2563eb);color:#fff">Justificar e iniciar</button></div></div>`;
  document.body.appendChild(m);
  const confirm=m.querySelector('#guardEarlyConfirm'),cancel=m.querySelector('#guardEarlyCancel'),other=m.querySelector('#guardEarlyOther'),err=m.querySelector('#guardEarlyErr');
  let selecionado='';
  const rotulos={'anterior-finalizada':'Terminei a tarefa anterior mais cedo.','responsavel-autorizou':'Meu responsável autorizou o início antecipado.','mudanca-rotina':'Houve uma mudança na rotina.'};
  m.querySelector('#guardEarlyOptions').addEventListener('click',e=>{
    const b=e.target.closest('button[data-early-reason]');if(!b)return;
    selecionado=b.dataset.earlyReason||'';confirm.disabled=false;err.style.display='none';
    m.querySelectorAll('button[data-early-reason]').forEach(x=>{x.style.outline=x===b?'3px solid rgba(37,99,235,.28)':'none';});
    other.style.display=selecionado==='outro'?'block':'none';if(selecionado==='outro')setTimeout(()=>other.focus(),0);
  });
  cancel.onclick=()=>m.remove();
  confirm.onclick=async()=>{
    let motivo=rotulos[selecionado]||'';
    if(selecionado==='outro'){
      motivo=other.value.trim();
      if(motivo.split(/\s+/).filter(Boolean).length<3){err.textContent='Conte o motivo em pelo menos 3 palavras.';err.style.display='block';other.focus();return;}
    }
    if(!motivo)return;
    if(confirm.dataset.busy==='1')return;
    confirm.dataset.busy='1';confirm.disabled=true;cancel.disabled=true;err.style.display='none';confirm.textContent='Iniciando...';
    const iniciadoEm=performance.now();
    try{
      const agora2=new Date(),j2=janela(t,agora2);
      await registrarInicio(t,agora2,j2,agora2<j2.inicio?{tipo:selecionado,motivo}:null);
      window.rotinaLog?.('tarefa.inicio_antecipado_ok',{tarefaId:t.id,tempoMs:Math.round(performance.now()-iniciadoEm),motivoTipo:selecionado});
      m.remove();
    }catch(e){console.error('Início antecipado:',e);delete confirm.dataset.busy;confirm.disabled=false;cancel.disabled=false;confirm.textContent='Justificar e iniciar';err.textContent='Não foi possível iniciar agora. Tente novamente.';err.style.display='block';window.rotinaLog?.('tarefa.inicio_antecipado_erro',{tarefaId:t.id,mensagem:String(e?.message||e)},'error');}
  };
}
async function iniciar(id){
  const t=await buscarTarefa(id);if(!t)return;
  if((t.status||'Pendente')!=='Pendente')return;
  const ordem=await verificarOrdem(t);if(!ordem.permitida){avisarBloqueioOrdem(ordem);return;}
  const agora=new Date(),j=janela(t,agora);
  if(agora<j.inicio){pedirMotivoAntecipacao(t,agora,j);return;}
  await registrarInicio(t,agora,j,null);
}

async function salvarResultado(t,agora,j,ini,calc,faixa,justificativa='',opcoes={}){
  const banco=await db(),pontos=Math.round((Number(t.pontosMaximos)||0)*(faixa.percentual/100));
  const status=faixa.faixa==='dentro-limites'?`No Prazo (${faixa.percentual}%)`:faixa.faixa==='atraso-leve'?`No Prazo — atraso leve (${faixa.percentual}%)`:faixa.faixa==='atraso-maior'?`No Prazo — atraso maior (${faixa.percentual}%)`:'Atrasado (0%)';
  const temJustificativa=Boolean(justificativa.trim());
  const base={horarioTermino:horaHM(agora),terminoExecutadoEm:agora.toISOString(),status,pontosGanhos:pontos,pontosOriginais:pontos,percentualAplicado:faixa.percentual,percentualOriginal:faixa.percentual,faixaAtraso:faixa.faixa,toleranciaConsumidaMin:calc.consumoTotal,toleranciaConsumidaSeg:calc.consumoTotalSeg,atrasoInicioMin:calc.atrasoInicio,atrasoFimMin:calc.atrasoFim,limite75Min:faixa.limite75,limite50Min:faixa.limite50,limite75Seg:faixa.limite75Seg,limite50Seg:faixa.limite50Seg,justificativaAtraso:justificativa,revisaoStatus:temJustificativa?'aguardando':'sem-revisao',iniciouComAtraso:t.iniciouComAtraso===true,tipoJustificativa:temJustificativa?(opcoes.vozUsada?'voz-transcrita':'texto'):'',justificativaRecusada:!temJustificativa&&opcoes.recusou===true};
  const hist={grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:t.id,tarefaGrupoId:t.tarefaGrupoId||'',nomeTarefa:t.nome,diaSemana:t.diaSemana,data:dataISO(j.ocorr),dataExecucao:dataISO(j.ocorr),horaSugeridaInicio:t.horaSugeridaInicio,horaSugeridaFim:t.horaSugeridaFim,horarioInicio:t.horarioInicio||horaHM(ini),inicioExecutadoEm:t.inicioExecutadoEm||ini.toISOString(),tempoLimite:Number(t.tempoLimite)||0,pontosMaximos:Number(t.pontosMaximos)||0,icone:t.icone||'',inicioAntecipado:t.inicioAntecipado===true,antecipacaoMin:Number(t.antecipacaoMin)||0,motivoInicioAntecipado:t.motivoInicioAntecipado||'',tipoMotivoInicioAntecipado:t.tipoMotivoInicioAntecipado||'',...base};
  const historicoId=`${perfil()}_${t.id}_${dataISO(j.ocorr)}`;
  window.registrarHistoricoLocal?.(historicoId,hist);
  const sincronizacao=Promise.all([
    updateDoc(doc(banco,'tarefas',t.id),base),
    setDoc(doc(banco,'historico',historicoId),hist,{merge:true}),
    setDoc(doc(banco,'execucoes',`${dataISO(j.ocorr)}__${t.id}`),hist,{merge:true})
  ]);
  if(navigator.onLine===false){
    sincronizacao.catch(e=>console.warn('Resultado offline aguardando sincronização:',e));
    return;
  }
  await sincronizacao;
}
function pedirJustificativa(t,agora,j,ini,calc,faixa){
  document.getElementById('guardJustModalV2')?.remove();
  const obrigatoria=t.justificativaObrigatoria!==false;
  let vozUsada=false;
  let reconhecimento=null;
  const m=document.createElement('div');m.id='guardJustModalV2';m.style.cssText='position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px';
  const textoObrigatoriedade=obrigatoria?'<p style="margin:8px 0;color:#8a4b08;font-weight:700">⚠️ Nesta tarefa, a justificativa é obrigatória para concluir.</p>':'<p style="margin:8px 0;color:#64748b">Nesta tarefa, você pode justificar ou concluir sem justificar.</p>';
  const botaoSem=obrigatoria?'':`<button type="button" id="guardSemV2" class="btn">Concluir sem justificar</button>`;
  m.innerHTML=`<div style="width:min(92vw,460px);background:#fff;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.25)"><h2 style="margin-top:0">💬 Tolerância estourada</h2><p>Você passou do saldo de tolerância desta tarefa. Se aconteceu algo importante, conte o motivo. Seu responsável poderá analisar depois.</p>${textoObrigatoriedade}<div style="position:relative"><textarea id="guardJustTxtV2" rows="4" style="width:100%;box-sizing:border-box;padding:12px;border:2px solid #ddd;border-radius:12px;font:inherit" placeholder="Conte o que aconteceu..."></textarea><button type="button" id="guardVozV2" aria-label="Digitar por voz" title="Digitar por voz" style="margin-top:8px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer">🎙️ Digitar por voz</button><span id="guardVozStatusV2" style="display:inline-block;margin-left:8px;color:#64748b;font-size:12px"></span></div><div id="guardJustErrV2" style="display:none;color:#b91c1c;margin-top:8px"></div><div id="guardJustStatusV2" style="display:none;color:#2563eb;margin-top:8px;font-size:13px;font-weight:700"></div><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">${botaoSem}<button type="button" id="guardEnviarV2" class="btn" style="background:var(--cor-primaria,#2563eb);color:#fff">Enviar justificativa</button></div></div>`;document.body.appendChild(m);
  const txt=m.querySelector('#guardJustTxtV2'),err=m.querySelector('#guardJustErrV2'),status=m.querySelector('#guardJustStatusV2'),btnEnviar=m.querySelector('#guardEnviarV2'),btnVoz=m.querySelector('#guardVozV2'),vozStatus=m.querySelector('#guardVozStatusV2');
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SpeechRecognition){
    reconhecimento=new SpeechRecognition();reconhecimento.lang='pt-BR';reconhecimento.interimResults=false;reconhecimento.continuous=false;
    reconhecimento.onstart=()=>{btnVoz.disabled=true;btnVoz.textContent='🎙️ Ouvindo...';vozStatus.textContent='Pode falar.';};
    reconhecimento.onresult=e=>{const fala=Array.from(e.results).map(r=>r[0]?.transcript||'').join(' ').trim();if(fala){txt.value=[txt.value.trim(),fala].filter(Boolean).join(' ');vozUsada=true;err.style.display='none';}};
    reconhecimento.onerror=e=>{console.warn('Reconhecimento de voz:',e.error);vozStatus.textContent=e.error==='not-allowed'?'Permita o uso do microfone no navegador.':'Não consegui ouvir. Tente novamente.';};
    reconhecimento.onend=()=>{btnVoz.disabled=false;btnVoz.textContent='🎙️ Digitar por voz';if(!vozStatus.textContent.includes('Permita')&&!vozStatus.textContent.includes('Não consegui'))vozStatus.textContent=vozUsada?'Texto adicionado.':'';};
    btnVoz.onclick=()=>{try{vozStatus.textContent='';reconhecimento.start();}catch(e){console.warn(e);}};
  }else{btnVoz.style.display='none';vozStatus.textContent='Digitação por voz não disponível neste navegador.';}
  const definirEnviando=ativo=>{m.querySelectorAll('button').forEach(b=>b.disabled=ativo);btnEnviar.textContent=ativo?'Enviando...':'Enviar justificativa';status.style.display=ativo?'block':'none';status.textContent=ativo?'Salvando sua justificativa...':'';};
  const btnSem=m.querySelector('#guardSemV2');
  if(btnSem)btnSem.onclick=async()=>{definirEnviando(true);err.style.display='none';try{await salvarResultado(t,agora,j,ini,calc,faixa,'',{recusou:true});m.remove();}catch(e){console.error('Falha ao concluir sem justificativa:',e);definirEnviando(false);err.textContent='Não foi possível concluir agora. Verifique sua conexão e tente novamente.';err.style.display='block';}};
  btnEnviar.onclick=async()=>{
    const tx=txt.value.trim(),palavras=tx.split(/\s+/).filter(Boolean);
    if(palavras.length<5){err.textContent='Conte um pouco mais: escreva pelo menos 5 palavras.';err.style.display='block';txt.focus();return;}
    err.style.display='none';definirEnviando(true);
    try{await salvarResultado(t,agora,j,ini,calc,faixa,tx,{vozUsada});m.remove();}
    catch(e){console.error('Falha ao enviar justificativa:',e);definirEnviando(false);err.textContent='Não foi possível enviar a justificativa agora. Verifique sua conexão e tente novamente.';err.style.display='block';}
  };
  setTimeout(()=>txt.focus(),0);
}
async function finalizar(id){
  const t=await buscarTarefa(id);if(!t)return;
  if(t.status!=='Em andamento')return;
  const agora=new Date(),j=janela(t,agora),ini=inicioReal(t,j,agora);
  const regra=await regraAtual(),tolerancia=Math.max(0,Number(t.tempoLimite)||0);
  const calc=tolerancia===0
    ?calcularConsumoAtraso({inicioPrevisto:j.inicio,inicioReal:ini,fimPrevisto:j.fim,fimReal:agora})
    :calcularConsumoAtraso({inicioPrevisto:aposMinutoSugerido(j.inicio),inicioReal:ini,fimPrevisto:aposMinutoSugerido(j.fim),fimReal:agora});
  const semTolBase={tolerancia:0,limite100:0,limite75:0,limite50:0,extra75:0,extra50:0,limite100Seg:0,limite75Seg:0,limite50Seg:0,faixa75Seg:0,faixa50Seg:0,janelaParcialSeg:0};
  const horarioEstourado=horarioSugeridoEstourado(ini,j.inicio)||horarioSugeridoEstourado(agora,j.fim);
  const faixa=tolerancia===0
    ?{percentual:horarioEstourado?0:Number(regra.dentroLimites??100),faixa:horarioEstourado?'estourado':'dentro-limites',consumoSeg:0,...semTolBase}
    :classificarConsumoToleranciaSegundos(tolerancia,calc.consumoTotalSeg,regra);
  if(faixa.percentual===0){pedirJustificativa(t,agora,j,ini,calc,faixa);return;}
  await salvarResultado(t,agora,j,ini,calc,faixa,'');
  try{window.confetti?.({particleCount:45,spread:60,origin:{y:.75}});}catch{}
}
function instalar(tentativa=0){
  if(instalado)return;
  if(typeof window.iniciarTarefa!=='function'||typeof window.finalizarTarefa!=='function'||!getApps().length){if(tentativa<120)setTimeout(()=>instalar(tentativa+1),50);return;}
  window.iniciarTarefa=id=>iniciar(id).catch(e=>{console.error('Validação de início:',e);alert('Não foi possível iniciar a tarefa agora. Tente novamente.');});
  window.finalizarTarefa=id=>finalizar(id).catch(e=>{console.error('Validação de término:',e);alert('Não foi possível finalizar a tarefa agora. Tente novamente.');});
  instalado=true;
  window.dispatchEvent(new CustomEvent('rotina-time-guard-ready'));
  const diaBoot=dataISO(new Date());
  const checarVirada=()=>{if(dataISO(new Date())!==diaBoot)location.reload();};
  window.addEventListener('focus',checarVirada);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checarVirada();});
}
instalar();