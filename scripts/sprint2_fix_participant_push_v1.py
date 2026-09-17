from pathlib import Path
import re

BUILD_OLD='20260907.2'
BUILD_NEW='20260908.1'


def must_replace(text, old, new, label, count=1):
    if old not in text:
        raise SystemExit(f'Trecho esperado não encontrado: {label}')
    return text.replace(old, new, count)


# 1) OneSignal: preparar identidade + assinatura real antes de confirmar o despertador.
p=Path('index-CLIENTE-v6.html')
s=p.read_text(encoding='utf-8')
pattern=r"        window\.ativarPushRotina = function\(\) \{.*?\n        \};\n        window\.obterStatusPushRotina = function\(callback\) \{.*?\n        \};"
replacement="""        window.ativarPushRotina = function() {
            return new Promise(resolve=>{
                let concluido=false;
                const concluir=estado=>{if(!concluido){concluido=true;resolve(estado)}};
                window.OneSignalDeferred.push(async function(OneSignal) {
                    try{
                        const g=String(localStorage.getItem('cliente_grupo')||'').trim();
                        const p=String(localStorage.getItem('cliente_perfil_id')||'').trim();
                        if(g&&p)await aplicarIdentidadeParticipanteNoPush(OneSignal,g,p);
                        await OneSignal.User.PushSubscription.optIn();
                        if(g&&p)await aplicarIdentidadeParticipanteNoPush(OneSignal,g,p);
                        const estado={
                            optedIn:OneSignal.User.PushSubscription.optedIn===true,
                            id:OneSignal.User.PushSubscription.id||'',
                            externalId:g&&p?`rotina_family__${g}__${p}`:'',
                            erro:''
                        };
                        window.rotinaLog?.('push.onesignal_pronto',{optedIn:estado.optedIn,temSubscriptionId:!!estado.id,identificado:!!estado.externalId});
                        concluir(estado);
                    }catch(e){
                        const erro=String(e?.message||e);
                        window.rotinaLog?.('push.onesignal_preparo_erro',{mensagem:erro},'warning');
                        concluir({optedIn:false,id:'',externalId:'',erro});
                    }
                });
                setTimeout(()=>concluir({optedIn:false,id:'',externalId:'',erro:'tempo-esgotado'}),8000);
            });
        };
        window.obterStatusPushRotina = function(callback) {
            let concluido=false;
            const concluir=estado=>{if(!concluido){concluido=true;callback?.(estado)}};
            window.OneSignalDeferred.push(function(OneSignal) {
                concluir({optedIn:OneSignal.User.PushSubscription.optedIn===true,id:OneSignal.User.PushSubscription.id||'',erro:''});
            });
            setTimeout(()=>concluir({optedIn:false,id:'',erro:'tempo-esgotado'}),4000);
        };"""
s2,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit('Não foi possível substituir ativarPushRotina/obterStatusPushRotina')
p.write_text(s2,encoding='utf-8')


# 2) Alarme: só declarar sucesso com permissão + assinatura OneSignal pronta; esperar a gravação.
p=Path('family-alarm-client.js')
s=p.read_text(encoding='utf-8')
old="async function prepararNotificacoes(){if(!('Notification'in window)||!('serviceWorker'in navigator))return 'indisponivel';let permissao=Notification.permission;if(permissao==='default'){try{permissao=await Notification.requestPermission()}catch{permissao='default'}}if(permissao==='granted')await window.ativarPushRotina?.();return permissao}"
new="""async function prepararNotificacoes(){
  if(!('Notification'in window)||!('serviceWorker'in navigator))return{permissao:'indisponivel',pushAtivo:false,id:'',erro:'api-indisponivel'};
  let permissao=Notification.permission;
  if(permissao==='default'){try{permissao=await Notification.requestPermission()}catch{permissao='default'}}
  if(permissao!=='granted')return{permissao,pushAtivo:false,id:'',erro:'permissao-nao-concedida'};
  const estado=await window.ativarPushRotina?.();
  const pushAtivo=!!estado?.optedIn&&!!estado?.id;
  try{window.rotinaLog?.('alarme.push_pronto',{pushAtivo,temSubscriptionId:!!estado?.id,erro:estado?.erro||''},pushAtivo?'info':'warning')}catch{}
  return{permissao,pushAtivo,id:estado?.id||'',erro:estado?.erro||''};
}"""
s=must_replace(s,old,new,'prepararNotificacoes')
old="m.querySelector('#alarmToggle').onclick=async()=>{const ativar=!a?.ativo,momento=m.querySelector('#alarmMoment').value;if(ativar){const permissao=await prepararNotificacoes();if(permissao!=='granted'){m.querySelector('#alarmTaskMsg').textContent='Autorize as notificações para programar o despertador.';return}}m.remove();toast(ativar?'Alarme desta data programado.':'Alarme desta data retirado.');gravar({...tarefa,momentos:momento==='ambos'?['inicio','fim']:[momento]},ativar,'CLIENTE').then(ok=>{if(!ok)toast('Não foi possível alterar este alarme.')})};"
new="""m.querySelector('#alarmToggle').onclick=async()=>{
    const botao=m.querySelector('#alarmToggle'),msg=m.querySelector('#alarmTaskMsg');
    const ativar=!a?.ativo,momento=m.querySelector('#alarmMoment').value;
    botao.disabled=true;
    if(ativar){
      msg.textContent='Preparando notificações deste aparelho...';
      const push=await prepararNotificacoes();
      if(push.permissao!=='granted'){
        msg.textContent='Autorize as notificações para programar o despertador.';
        botao.disabled=false;return;
      }
      if(!push.pushAtivo){
        msg.textContent='O push deste aparelho ainda não ficou ativo. Tente novamente em alguns segundos.';
        botao.disabled=false;return;
      }
    }
    msg.textContent=ativar?'Programando despertador...':'Retirando despertador...';
    const ok=await gravar({...tarefa,momentos:momento==='ambos'?['inicio','fim']:[momento]},ativar,'CLIENTE',msg);
    if(!ok){botao.disabled=false;return}
    m.remove();
    toast(ativar?'Alarme desta data programado.':'Alarme desta data retirado.');
  };"""
s=must_replace(s,old,new,'alarmToggle')
p.write_text(s,encoding='utf-8')


# 3) Worker: mensagem individual usa External ID como identidade, não tags.
p=Path('onesignal-scheduler/src/index.js')
s=p.read_text(encoding='utf-8')
pattern=r"function clientPushFilters\(groupId, profileId\) \{.*?\n\}\n\n(?=function adminPushFilters)"
helper="""function participantExternalId(groupId, profileId) {
  return `rotina_family__${String(groupId || '').trim()}__${String(profileId || '').trim()}`;
}

"""
s2,n=re.subn(pattern,helper,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit('clientPushFilters não encontrado')
s=s2
s=must_replace(
    s,
    "    filters: clientPushFilters(alarm.grupoId, alarm.perfilId),",
    "    include_aliases: { external_id: [participantExternalId(alarm.grupoId, alarm.perfilId)] },\n    target_channel: 'push',",
    'target do alarme'
)
s=must_replace(
    s,
    "    filters: isAdmin\n      ? adminPushFilters(reward.grupoId)\n      : clientPushFilters(reward.grupoId, reward.perfilId),",
    "    ...(isAdmin\n      ? { filters: adminPushFilters(reward.grupoId) }\n      : { include_aliases: { external_id: [participantExternalId(reward.grupoId, reward.perfilId)] }, target_channel: 'push' }),",
    'target da recompensa do Participante'
)
p.write_text(s,encoding='utf-8')


# 4) Integração: exigir alias individual e manter ADM por tags.
p=Path('onesignal-scheduler/test/integration.test.mjs')
s=p.read_text(encoding='utf-8')
old="""assert.deepEqual(creates[0].filters, [
  { field: 'tag', key: 'grupoId', relation: '=', value: 'familia' },
  { operator: 'AND' },
  { field: 'tag', key: 'perfilId', relation: '=', value: 'perfil' },
  { operator: 'AND' },
  { field: 'tag', key: 'aplicativo', relation: '=', value: 'participante' }
]);"""
new="""assert.deepEqual(creates[0].include_aliases, { external_id: ['rotina_family__familia__perfil'] });
assert.equal(creates[0].target_channel, 'push');
assert.equal(creates[0].filters, undefined, 'alarme individual não depende mais de tags');"""
s=must_replace(s,old,new,'teste target de alarme')
s=must_replace(
    s,
    "assert.equal(creates.at(-1).filters.at(-1).value, 'participante');",
    "assert.deepEqual(creates.at(-1).include_aliases, { external_id: ['rotina_family__familia__perfil'] });\nassert.equal(creates.at(-1).target_channel, 'push');\nassert.equal(creates.at(-1).filters, undefined, 'push individual de recompensa usa external_id');",
    'teste target recompensa cliente'
)
p.write_text(s,encoding='utf-8')


# 5) Auditoria oficial: ownership agora é bootstrap e o push individual é por alias.
p=Path('.github/workflows/family-alarm-audit.yml')
s=p.read_text(encoding='utf-8')
if "      - 'client-bootstrap-v1.js'" not in s:
    s=s.replace("      - 'client-ui-pro.js'\n", "      - 'client-ui-pro.js'\n      - 'client-bootstrap-v1.js'\n", 1)
s=must_replace(
    s,
    "          const ui=fs.readFileSync('client-ui-pro.js','utf8');\n          const sw=fs.readFileSync('sw.js','utf8');",
    "          const ui=fs.readFileSync('client-ui-pro.js','utf8');\n          const bootstrap=fs.readFileSync('client-bootstrap-v1.js','utf8');\n          const scheduler=fs.readFileSync('onesignal-scheduler/src/index.js','utf8');\n          const sw=fs.readFileSync('sw.js','utf8');",
    'arquivos da auditoria'
)
s=must_replace(
    s,
    "          ok(ui.includes(\"import('./family-alarm-client.js?v=10')\"),'Client loads server-scheduled cross-device date alarm v10');\n          ok(ui.includes(\"import('./client-week-nav.js?v=3')\"),'Client loads weekly navigation with dated rows');",
    "          ok(bootstrap.includes(\"{name:'task-alarm',src:'./family-alarm-client.js?v=12'\"),'Bootstrap loads reliable task alarm v12');\n          ok(bootstrap.includes(\"{name:'week-nav',src:'./client-week-nav.js?v=4'\"),'Bootstrap loads weekly navigation v4');",
    'ownership no bootstrap'
)
s=must_replace(
    s,
    "          ok(index.includes('OneSignal.User.PushSubscription.optIn()')&&index.includes('OneSignal.login(`rotina_family__'),'OneSignal subscription is enabled and linked to the Client profile');",
    "          ok(index.includes('OneSignal.User.PushSubscription.optIn()')&&index.includes('OneSignal.login(externalId)')&&index.includes('OneSignal.User.addTags'),'OneSignal subscription is enabled and linked to the Participante profile');\n          ok(scheduler.includes('include_aliases')&&scheduler.includes('participantExternalId')&&!scheduler.includes('clientPushFilters'),'individual Participante push targets the registered external_id');\n          ok(alarm.includes('pushAtivo')&&alarm.includes('alarme.push_pronto'),'alarm activation waits for a real OneSignal subscription');",
    'contrato OneSignal na auditoria'
)
p.write_text(s,encoding='utf-8')


# 6) Build/cache do Participante.
p=Path('client-bootstrap-v1.js')
s=p.read_text(encoding='utf-8')
s=s.replace(BUILD_OLD,BUILD_NEW)
s=must_replace(s,"{name:'task-alarm',src:'./family-alarm-client.js?v=11'","{name:'task-alarm',src:'./family-alarm-client.js?v=12'",'alarm v12')
p.write_text(s,encoding='utf-8')

p=Path('index.html')
s=p.read_text(encoding='utf-8').replace(BUILD_OLD,BUILD_NEW)
s=s.replace("sw.js?v=79","sw.js?v=80")
s=s.replace("serviceWorkerExpected:79","serviceWorkerExpected:80")
s=s.replace("release:'sprint2.1-bootstrap-v1'","release:'sprint2.1-alarm-push-v1'")
p.write_text(s,encoding='utf-8')

p=Path('sw.js')
s=p.read_text(encoding='utf-8')
s=s.replace("rotina-family-participante-v79","rotina-family-participante-v80")
s=s.replace("const ROTINA_SW_VERSION='79'","const ROTINA_SW_VERSION='80'")
s=s.replace("const ROTINA_BUILD_ID='20260907.2'","const ROTINA_BUILD_ID='20260908.1'")
s=s.replace("sw.js?v=79","sw.js?v=80")
p.write_text(s,encoding='utf-8')


# 7) Checkpoint do Bloco 1 continua pendente até o teste real com o app fechado.
p=Path('docs/SPRINT2_1_BLOCO1_BOOTSTRAP.md')
s=p.read_text(encoding='utf-8')
s=s.replace('Status: **implementado — aguardando teste funcional**','Status: **implementado — aguardando teste funcional do despertador/push em segundo plano**')
s=s.replace('Build do Participante: **20260907.2**','Build do Participante: **20260908.1**')
s=s.replace('Service Worker esperado: **v79**','Service Worker esperado: **v80**')
s=s.replace('- O Participante abre na build `20260907.2`.','- O Participante abre na build `20260908.1`.')
s=s.replace('- Service Worker reporta `79`.','- Service Worker reporta `80`.')
marker='## Próximo passo\n'
note="""## Correção de fechamento do Bloco 1 — Push do Participante

- Ao programar um despertador, o Participante só confirma sucesso depois de a permissão do navegador e a assinatura OneSignal (`optedIn` + `subscription id`) estarem prontas.
- A identidade `rotina_family__<grupo>__<perfil>` é reaplicada antes do agendamento.
- O Worker endereça push individual pelo `external_id` do OneSignal, em vez de usar tags como identificador individual.
- O ADM continua usando tags para audiência de grupo; apenas mensagens individuais do Participante usam alias.
- O teste final continua sendo real: aplicativo fechado/segundo plano no aparelho do Participante.

"""
if note.strip() not in s:
    if marker not in s:
        raise SystemExit('Marcador de próximo passo não encontrado no checkpoint')
    s=s.replace(marker,note+marker,1)
p.write_text(s,encoding='utf-8')

print('PATCH PARTICIPANTE PUSH OK')
