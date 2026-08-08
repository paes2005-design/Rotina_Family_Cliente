from pathlib import Path

p=Path('client-time-guard-v2.js')
s=p.read_text(encoding='utf-8')
start=s.index('async function ordemPermitida(t){')
end=s.index('\nasync function salvarResultado',start)
novo=r'''function avaliarOrdemLista(lista,t){
  const outra=lista.find(x=>x.id!==t.id&&x.status==='Em andamento');
  if(outra)return {permitida:false,motivo:'outra-em-andamento',tarefa:outra};
  const i=lista.findIndex(x=>x.id===t.id);
  if(i<0)return {permitida:true};
  const anterior=lista.slice(0,i).find(x=>(x.status||'Pendente')==='Pendente');
  if(anterior)return {permitida:false,motivo:'anterior-pendente',tarefa:anterior};
  return {permitida:true};
}
async function verificarOrdem(t){
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
  const atrasoInicio=minutosCompletosAtraso(j.inicio,agora),banco=await db();
  const antecipado=Boolean(antecipacao);
  const antecipacaoMin=antecipado?Math.max(0,Math.floor((j.inicio-agora)/60000)):0;
  const dados={status:'Em andamento',horarioInicio:horaHM(agora),inicioExecutadoEm:agora.toISOString(),dataExecucao:dataISO(j.ocorr),iniciouComAtraso:atrasoInicio>0,atrasoInicioMin:atrasoInicio,inicioAntecipado:antecipado,antecipacaoMin,motivoInicioAntecipado:antecipado?(antecipacao.motivo||''):'',tipoMotivoInicioAntecipado:antecipado?(antecipacao.tipo||''):''};
  await updateDoc(doc(banco,'tarefas',t.id),dados);
  await setDoc(doc(banco,'execucoes',`${dataISO(j.ocorr)}__${t.id}`),{grupoId:grupo(),perfilId:perfil(),perfilNome:nome(),tarefaId:t.id,nomeTarefa:t.nome,data:dataISO(j.ocorr),...dados},{merge:true});
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
    confirm.disabled=true;cancel.disabled=true;err.style.display='none';confirm.textContent='Verificando...';
    try{
      const atual=await buscarTarefa(t.id);if(!atual||(atual.status||'Pendente')!=='Pendente'){m.remove();return;}
      const ordem=await verificarOrdem(atual);if(!ordem.permitida){m.remove();avisarBloqueioOrdem(ordem);return;}
      const agora2=new Date(),j2=janela(atual,agora2);
      confirm.textContent='Iniciando...';
      await registrarInicio(atual,agora2,j2,agora2<j2.inicio?{tipo:selecionado,motivo}:null);
      m.remove();
    }catch(e){console.error('Início antecipado:',e);confirm.disabled=false;cancel.disabled=false;confirm.textContent='Justificar e iniciar';err.textContent='Não foi possível iniciar agora. Tente novamente.';err.style.display='block';}
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
'''
s=s[:start]+novo+s[end:]
needle="icone:t.icone||'',...base};"
replacement="icone:t.icone||'',inicioAntecipado:t.inicioAntecipado===true,antecipacaoMin:Number(t.antecipacaoMin)||0,motivoInicioAntecipado:t.motivoInicioAntecipado||'',tipoMotivoInicioAntecipado:t.tipoMotivoInicioAntecipado||'',...base};"
if s.count(needle)!=1: raise SystemExit('campo de histórico esperado não encontrado exatamente uma vez')
s=s.replace(needle,replacement,1)
p.write_text(s,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
if "const CACHE_NAME='rotina-family-cliente-v19';" not in w: raise SystemExit('cache Cliente v19 não encontrado')
w=w.replace("const CACHE_NAME='rotina-family-cliente-v19';","const CACHE_NAME='rotina-family-cliente-v20';",1)
sw.write_text(w,encoding='utf-8')
