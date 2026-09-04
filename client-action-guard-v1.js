const ACTION_GUARD_VERSION = 2;
const DEFAULT_SLOW_MS = 1500;

export function createSingleFlightAction(original, {
  name = original?.name || 'acao',
  keyOf = () => name,
  onStart = () => {},
  onIgnored = () => {},
  onSuccess = () => {},
  onSlow = () => {},
  onError = () => {},
  onFinally = () => {},
  now = () => (globalThis.performance?.now?.() ?? Date.now()),
  slowMs = DEFAULT_SLOW_MS
} = {}) {
  if (typeof original !== 'function') throw new TypeError('A ação original precisa ser uma função.');
  const locks = new Map();
  const guarded = async function (...args) {
    const key = String(keyOf(args) || name);
    if (locks.has(key)) {
      onIgnored({ name, key, args });
      return { ignored: true, reason: 'already-running' };
    }
    const startedAt = now();
    locks.set(key, true);
    onStart({ name, key, args });
    try {
      const value = await original.apply(this, args);
      const durationMs = Math.max(0, Math.round(now() - startedAt));
      onSuccess({ name, key, args, durationMs, value });
      if (durationMs >= slowMs) onSlow({ name, key, args, durationMs, value });
      return value;
    } catch (error) {
      const durationMs = Math.max(0, Math.round(now() - startedAt));
      onError({ name, key, args, durationMs, error });
      throw error;
    } finally {
      locks.delete(key);
      onFinally({ name, key, args });
    }
  };
  Object.defineProperty(guarded, '__rotinaActionGuardV1', { value: true });
  return guarded;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__rotinaActionGuardV1Installed) {
  window.__rotinaActionGuardV1Installed = true;
  const lastActionElement = { name: '', element: null, at: 0 };
  const originalButtonState = new WeakMap();
  const wrappedNames = new Set();
  let statusTimer = 0;
  const configs = {
    iniciarTarefa: { label: 'Iniciando…', key: args => `tarefa:iniciar:${args[0] || ''}` },
    finalizarTarefa: { label: 'Finalizando…', key: args => `tarefa:finalizar:${args[0] || ''}` },
    confirmarJustificativaAtraso: { label: 'Salvando…', key: () => 'tarefa:justificativa' },
    resgatarRecompensa: { label: 'Enviando…', key: args => `recompensa:${args[0] || ''}` },
    editarJustificativa: { label: 'Salvando…', key: args => `justificativa:editar:${args[0] || ''}` }
  };
  function safeLog(event, details = {}, level = 'info') { try { window.rotinaLog?.(event, { ...details, actionGuardVersion: ACTION_GUARD_VERSION }, level); } catch (_) {} }
  function statusElement() {
    let el = document.getElementById('rotinaActionStatusV1');
    if (el) return el;
    el = document.createElement('div'); el.id = 'rotinaActionStatusV1'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, { position:'fixed',left:'50%',bottom:'86px',transform:'translateX(-50%)',zIndex:'60000',padding:'10px 14px',borderRadius:'999px',background:'rgba(30,41,59,.94)',color:'#fff',fontWeight:'700',fontSize:'14px',boxShadow:'0 8px 24px rgba(15,23,42,.22)',pointerEvents:'none',display:'none',maxWidth:'88vw',textAlign:'center' });
    document.body.appendChild(el); return el;
  }
  function showStatus(text,{error=false,holdMs=0}={}) { const el=statusElement(); clearTimeout(statusTimer); el.textContent=text; el.style.background=error?'rgba(185,28,28,.96)':'rgba(30,41,59,.94)'; el.style.display='block'; if(holdMs>0)statusTimer=setTimeout(()=>{el.style.display='none';},holdMs); }
  function hideStatusSoon(){clearTimeout(statusTimer);statusTimer=setTimeout(()=>{const el=document.getElementById('rotinaActionStatusV1');if(el)el.style.display='none';},450);}
  function actionNameFromElement(element){const inline=element?.getAttribute?.('onclick')||'';return inline.match(/^\s*(?:window\.)?([a-zA-Z_$][\w$]*)\s*\(/)?.[1]||'';}
  document.addEventListener('click',event=>{const element=event.target?.closest?.('button,a,[role="button"]');if(!element)return;const name=actionNameFromElement(element);if(!name)return;lastActionElement.name=name;lastActionElement.element=element;lastActionElement.at=Date.now();},true);
  function currentButton(name){if(lastActionElement.name===name&&Date.now()-lastActionElement.at<1800&&lastActionElement.element?.isConnected)return lastActionElement.element;return[...document.querySelectorAll('button,a,[role="button"]')].find(el=>actionNameFromElement(el)===name)||null;}
  function setButtonBusy(button,label){if(!button)return;if(!originalButtonState.has(button))originalButtonState.set(button,{html:button.innerHTML,disabled:!!button.disabled,ariaBusy:button.getAttribute('aria-busy')});button.setAttribute('aria-busy','true');if('disabled'in button)button.disabled=true;button.classList.add('rotina-action-busy');button.textContent=label;}
  function restoreButton(button){if(!button)return;const state=originalButtonState.get(button);if(!state)return;if(button.isConnected){button.innerHTML=state.html;if('disabled'in button)button.disabled=state.disabled;if(state.ariaBusy===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',state.ariaBusy);button.classList.remove('rotina-action-busy');}originalButtonState.delete(button);}
  function wrapAction(name,config){if(wrappedNames.has(name))return true;const original=window[name];if(typeof original!=='function'||original.__rotinaActionGuardV1)return false;let activeButton=null;window[name]=createSingleFlightAction(original,{name,keyOf:config.key,onStart:()=>{activeButton=currentButton(name);setButtonBusy(activeButton,config.label);showStatus(config.label);safeLog('operacao.inicio',{operacao:name});},onIgnored:()=>{showStatus('Aguarde, esta ação já está sendo processada.',{holdMs:1400});safeLog('operacao.clique_ignorado',{operacao:name,motivo:'ja-em-processamento'},'warning');},onSuccess:({durationMs})=>safeLog('operacao.sucesso',{operacao:name,duracaoMs:durationMs}),onSlow:({durationMs})=>safeLog('operacao.lenta',{operacao:name,duracaoMs:durationMs},'warning'),onError:({durationMs,error})=>{showStatus('Não foi possível concluir. Tente novamente.',{error:true,holdMs:2800});safeLog('operacao.erro',{operacao:name,duracaoMs:durationMs,erroTipo:String(error?.name||'Error').slice(0,50)},'error');},onFinally:()=>{restoreButton(activeButton);activeButton=null;hideStatusSoon();}});wrappedNames.add(name);return true;}
  function ensureWrapped(){for(const[name,config]of Object.entries(configs))wrapAction(name,config);}
  ensureWrapped();let attempts=0;const timer=setInterval(()=>{ensureWrapped();attempts+=1;if(attempts>=30)clearInterval(timer);},500);window.addEventListener('rotina-client-session-ready',ensureWrapped);window.addEventListener('pageshow',ensureWrapped);safeLog('operacao.guard_pronto',{versao:ACTION_GUARD_VERSION});
}
