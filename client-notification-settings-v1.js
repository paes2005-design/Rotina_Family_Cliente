(()=>{
  'use strict';
  const VERSION=1;
  const log=(evento,detalhes={},nivel='info')=>{try{window.rotinaLog?.(evento,{notificationSettingsVersion:VERSION,...detalhes},nivel)}catch{}};
  const status=()=>new Promise(resolve=>{
    if(typeof window.obterStatusPushRotina!=='function')return resolve({optedIn:false,permission:'indisponivel',erro:'runtime-indisponivel'});
    window.obterStatusPushRotina(resolve);
  });
  const textoEstado=estado=>{
    if(estado.permission==='denied')return 'Bloqueadas no aparelho';
    if(estado.permission!=='granted')return 'Precisam de permissão';
    return estado.optedIn?'Ativas':'Desativadas';
  };
  function estilo(){
    if(document.getElementById('rfNotificationSettingsStyle'))return;
    const s=document.createElement('style');s.id='rfNotificationSettingsStyle';s.textContent=`
      .rf-notification-button{position:absolute;top:20px;right:92px;width:38px;height:38px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#475569;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:19px;padding:0}
      .rf-notification-button[data-state="on"]{color:#15803d;border-color:#bbf7d0;background:#f0fdf4}.rf-notification-button[data-state="off"]{color:#64748b}.rf-notification-button[data-state="warning"]{color:#b45309;border-color:#fde68a;background:#fffbeb}
      .rf-notification-overlay{position:fixed;inset:0;background:rgba(15,23,42,.42);display:none;align-items:center;justify-content:center;padding:16px;z-index:30000}.rf-notification-overlay.is-open{display:flex}
      .rf-notification-panel{width:min(420px,100%);background:#fff;border-radius:18px;padding:20px;box-shadow:0 18px 50px rgba(15,23,42,.22);color:#334155}.rf-notification-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.rf-notification-head h2{font-size:1.15rem;margin:0;color:#334155}.rf-notification-close{border:0;background:transparent;font-size:22px;cursor:pointer;color:#64748b;padding:4px 8px}.rf-notification-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding-top:16px;border-top:1px solid #e2e8f0}.rf-notification-copy strong{display:block;font-size:.95rem}.rf-notification-copy small{display:block;color:#64748b;margin-top:4px;line-height:1.35}.rf-notification-toggle{border:0;border-radius:999px;padding:9px 14px;font-weight:700;cursor:pointer;background:#e2e8f0;color:#475569;min-width:88px}.rf-notification-toggle[data-on="true"]{background:#16a34a;color:#fff}.rf-notification-status{margin-top:14px;font-size:.82rem;color:#64748b}.rf-notification-status.is-error{color:#b91c1c}
      @media(max-width:700px){.rf-notification-button{top:12px;right:78px;width:36px;height:36px;border-radius:11px}.rf-notification-panel{padding:18px}}
    `;document.head.appendChild(s);
  }
  function criar(){
    const host=document.getElementById('telaApp');if(!host||document.getElementById('rfNotificationButton'))return;
    estilo();
    const button=document.createElement('button');button.id='rfNotificationButton';button.className='rf-notification-button';button.type='button';button.setAttribute('aria-label','Configurar notificações');button.textContent='🔔';host.appendChild(button);
    const overlay=document.createElement('div');overlay.id='rfNotificationOverlay';overlay.className='rf-notification-overlay';overlay.innerHTML=`<section class="rf-notification-panel" role="dialog" aria-modal="true" aria-labelledby="rfNotificationTitle"><div class="rf-notification-head"><h2 id="rfNotificationTitle">Notificações</h2><button type="button" class="rf-notification-close" aria-label="Fechar">×</button></div><div class="rf-notification-row"><div class="rf-notification-copy"><strong>Alarmes e avisos</strong><small id="rfNotificationState">Verificando…</small></div><button type="button" id="rfNotificationToggle" class="rf-notification-toggle">Aguarde</button></div><div id="rfNotificationMessage" class="rf-notification-status">Controle das notificações do Rotina Family neste aparelho.</div></section>`;document.body.appendChild(overlay);
    const toggle=overlay.querySelector('#rfNotificationToggle'),state=overlay.querySelector('#rfNotificationState'),message=overlay.querySelector('#rfNotificationMessage');
    async function atualizar(){const e=await status();const on=e.permission==='granted'&&e.optedIn===true;const warning=e.permission!=='granted';button.dataset.state=on?'on':warning?'warning':'off';button.textContent=on?'🔔':'🔕';state.textContent=textoEstado(e);toggle.dataset.on=String(on);toggle.textContent=on?'Desativar':'Ativar';toggle.disabled=false;return e}
    button.addEventListener('click',async()=>{overlay.classList.add('is-open');await atualizar();log('push.configuracao_aberta')});
    overlay.querySelector('.rf-notification-close').addEventListener('click',()=>overlay.classList.remove('is-open'));
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.remove('is-open')});
    toggle.addEventListener('click',async()=>{toggle.disabled=true;message.classList.remove('is-error');const atual=await status();try{const proximo=atual.permission==='granted'&&atual.optedIn?await window.desativarPushRotina():await window.ativarPushRotina();message.textContent=proximo.optedIn?'Notificações ativadas.':'Notificações desativadas.';log('push.configuracao_alterada',{optedIn:proximo.optedIn===true,permission:proximo.permission||Notification.permission});await atualizar()}catch(error){message.textContent='Não foi possível alterar as notificações.';message.classList.add('is-error');log('push.configuracao_erro',{mensagem:String(error?.message||error)},'warning');toggle.disabled=false}});
    atualizar();window.addEventListener('rotina-push-state-changed',atualizar);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',criar,{once:true});else criar();
})();