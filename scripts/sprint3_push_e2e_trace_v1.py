from pathlib import Path

p = Path('onesignal-scheduler/src/index.js')
s = p.read_text()
old = """  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    throw new Error(`Agendamento OneSignal recusado (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    chave: occurrence.key,
    momento: occurrence.type,
    mensagemId: body.id,
    idempotencyKey,
    envioEm: occurrence.sendAfter || new Date().toISOString()
  };
}"""
new = """  const body = await response.json().catch(() => ({}));
  const targetExternalId = participantExternalId(alarm.grupoId, alarm.perfilId);
  await storeSecureLog(env, {
    aplicativo: 'participante',
    evento: response.ok && body.id ? 'push.onesignal_envio_aceito' : 'push.onesignal_envio_recusado',
    nivel: response.ok && body.id ? 'info' : 'warning',
    detalhes: {
      tipo: 'alarme', momento: occurrence.type, tarefaId: alarm.tarefaId || '',
      ocorrencia: occurrence.key, targetExternalId, httpStatus: response.status,
      messageId: body.id || '', recipients: Number(body.recipients || 0),
      externalIdTargetCount: 1, sendAfter: occurrence.sendAfter || '',
      respostaTemErros: Boolean(body.errors)
    },
    grupoId: alarm.grupoId, perfilId: alarm.perfilId, sessaoId: '',
    clienteEm: new Date().toISOString(), pagina: 'worker', navegador: 'onesignal-api',
    online: true, visibilidade: 'servidor-push', instalado: false
  }, fetchImpl, new Date()).catch(error => console.error('Falha ao registrar trace OneSignal:', cleanError(error)));
  if (!response.ok || !body.id) {
    throw new Error(`Agendamento OneSignal recusado (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    chave: occurrence.key, momento: occurrence.type, mensagemId: body.id,
    idempotencyKey, targetExternalId, recipients: Number(body.recipients || 0),
    envioEm: occurrence.sendAfter || new Date().toISOString()
  };
}"""
if 'push.onesignal_envio_aceito' in s:
    print('Telemetria E2E já aplicada.')
elif old not in s:
    raise SystemExit('Bloco createOneSignalMessage esperado não encontrado; abortando.')
else:
    p.write_text(s.replace(old, new, 1))
    print('Telemetria E2E aplicada.')
