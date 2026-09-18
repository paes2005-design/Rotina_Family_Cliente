(()=>{
  'use strict';
  const VERSION=2;
  const KEY_STATE='rotina_family_task_alarms_v3';
  const KEY_SYNCED='rotina_family_native_alarm_synced_v2';
  const SCHEME='rotinafamily';
  const HOST='alarm';
  let ultimoEstado='';

  const ler=(k,p)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v==='object'?v:p}catch{return p}};
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{nativeAlarmBridgeVersion:VERSION,...detalhes},nivel)}catch{}};
  const chave=a=>`${a.tarefaId||''}__${a.dataAgendada||''}`;
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function instante(dataISO,hora){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dataISO||'')||!/^\d{1,2}:\d{2}/.test(hora||''))return 0;
    const [ano,mes,dia]=dataISO.split('-').map(Number),[h,m]=hora.split(':').map(Number);
    const d=new Date(ano,mes-1,dia,h,m,0,0);
    return Number.isFinite(d.getTime())?d.getTime():0;
  }

  function comandos(a){
    const base={taskId:a.tarefaId||'',date:a.dataAgendada||'',title:a.nomeTarefa||'Tarefa'};
    if(!a.ativo)return [{action:'cancel',...base,key:`${chave(a)}__inicio`},{action:'cancel',...base,key:`${chave(a)}__fim`}];
    const momentos=Array.isArray(a.momentos)?a.momentos:['inicio'];
    return momentos.map(momento=>({action:'schedule',...base,key:`${chave(a)}__${momento}`,moment:momento,at:instante(a.dataAgendada,momento==='fim'?a.horaSugeridaFim:a.horaSugeridaInicio)})).filter(c=>c.at>Date.now());
  }

  function uri(c){
    const q=new URLSearchParams({key:c.key,taskId:c.taskId,date:c.date,title:c.title,moment:c.moment||'',at:String(c.at||0)});
    return `${SCHEME}://${HOST}/${c.action}?${q}`;
  }

  function abrirNativo(c){
    const destino=uri(c);
    log('alarme.nativo_comando',{action:c.action,key:c.key,at:c.at||0});
    window.location.href=destino;
  }

  function estadoDaTela(){
    const mapa=ler(KEY_STATE,{});
    document.querySelectorAll('tr[data-family-task-id]').forEach(row=>{
      const tarefaId=row.dataset.familyTaskId||'',dataAgendada=row.dataset.familyTaskDate||'';
      if(!tarefaId||!dataAgendada)return;
      const k=tarefaId+'__'+dataAgendada;
      if(mapa[k]||mapa[tarefaId])return;
      mapa[k]={tarefaId,dataAgendada,nomeTarefa:row.dataset.familyTaskName||'Tarefa',horaSugeridaInicio:row.dataset.familyTaskTime||'',horaSugeridaFim:row.dataset.familyTaskEnd||'',momentos:['inicio'],ativo:true,atualizadoEm:'test-bridge-screen'};
    });
    return mapa;
  }

  function pendentes(){
    const mapa=estadoDaTela(),sincronizados=ler(KEY_SYNCED,{}),lista=[];
    Object.values(mapa).forEach(a=>{
      if(!a?.tarefaId||!a?.dataAgendada||a.ativo!==true)return;
      const assinatura=JSON.stringify([a.ativo,a.dataAgendada,a.horaSugeridaInicio,a.horaSugeridaFim,a.momentos,a.atualizadoEm]);
      if(sincronizados[chave(a)]===assinatura)return;
      lista.push({alarme:a,assinatura,comandos:comandos(a)});
    });
    return lista;
  }

  function marcar(item){const s=ler(KEY_SYNCED,{});s[chave(item.alarme)]=item.assinatura;localStorage.setItem(KEY_SYNCED,JSON.stringify(s))}

  function render(){
    const assinatura=localStorage.getItem(KEY_STATE)||'';
    if(assinatura===ultimoEstado&&document.getElementById('rfNativeAlarmBridge'))return;
    ultimoEstado=assinatura;
    const itens=pendentes();
    document.getElementById('rfNativeAlarmBridge')?.remove();
    if(!itens.length)return;
    const box=document.createElement('div');box.id='rfNativeAlarmBridge';
    box.style.cssText='position:fixed;left:12px;right:12px;bottom:82px;z-index:29000;background:#0f172a;color:#fff;padding:12px 14px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:13px';
    const item=itens[0],a=item.alarme;
    box.innerHTML=`<div style="font-weight:900;margin-bottom:7px">⏰ Alarme Android</div><div style="opacity:.9;margin-bottom:10px">Sincronizar <strong>${escapeHtml(a.nomeTarefa||'Tarefa')}</strong> com o despertador nativo deste celular.</div><button type="button" style="width:100%;padding:10px;border:0;border-radius:10px;background:#fff;color:#0f172a;font-weight:900">SINCRONIZAR NO CELULAR</button>`;
    box.querySelector('button').onclick=()=>{
      if(!item.comandos.length){marcar(item);box.remove();render();return}
      const fila=[...item.comandos];
      const executar=()=>{const c=fila.shift();if(!c){marcar(item);setTimeout(render,500);return}abrirNativo(c);if(fila.length)setTimeout(executar,900);else{marcar(item);setTimeout(render,1200)}};
      executar();
    };
    document.body.appendChild(box);
  }

  window.rotinaNativeAlarmBridge={version:VERSION,refresh:render};
  setInterval(render,700);
  window.addEventListener('storage',e=>{if(e.key===KEY_STATE)render()});
  window.addEventListener('rotina-family-alarm-sync',render);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  log('alarme.nativo_bridge_pronto');
})();