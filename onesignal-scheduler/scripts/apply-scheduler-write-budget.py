from pathlib import Path

index_path = Path('onesignal-scheduler/src/index.js')
text = index_path.read_text(encoding='utf-8')

helper_marker = "export async function reconcileAlarm(env, document, {\n"
helper = """function alarmRecordAuditComplete(record = {}) {
  return Boolean(record?.auditoria?.completedAt) && Number(record?.auditoria?.remaining || 0) === 0;
}

function alarmAuditPending(records = []) {
  return records.some(record => !alarmRecordAuditComplete(record));
}

"""
if 'function alarmRecordAuditComplete' not in text:
    assert helper_marker in text, 'reconcileAlarm não encontrado para inserir helper.'
    text = text.replace(helper_marker, helper + helper_marker, 1)

old = """  const fingerprint = await alarmFingerprint(alarm);
  let records = previousRecords;
  if (alarm.oneSignalFingerprint && alarm.oneSignalFingerprint !== fingerprint) {
    await cancelRecords(env, records, fetchImpl);
    records = [];
  }
  const occurrences = plannedOccurrences(alarm, { now, timeZone });
  const existingKeys = new Set(records.map(record => record.chave));
  let created = 0;
  for (const occurrence of occurrences) {
    if (existingKeys.has(occurrence.key)) continue;
    const record = await createOneSignalMessage(
      env,
      document.name,
      alarm,
      fingerprint,
      occurrence,
      fetchImpl
    );
    records.push(record);
    existingKeys.add(record.chave);
    created += 1;
  }
  const state = records.length ? 'AGENDADO' : 'SEM_OCORRENCIA_FUTURA';
  await patchDocument(env, document.name, {
    schedulerPendente: false,
    schedulerVersao: SCHEDULER_VERSION,
    oneSignalEstado: state,
    oneSignalAgendamentos: records,
    oneSignalAuditoriaPendente: records.length > 0,
    oneSignalFingerprint: fingerprint,
    oneSignalErro: '',
    oneSignalAtualizadoEm: now
  }, fetchImpl, now);
  return { state, created };
}"""
new = """  const fingerprint = await alarmFingerprint(alarm);
  let records = previousRecords;
  let recordsChanged = false;
  if (alarm.oneSignalFingerprint && alarm.oneSignalFingerprint !== fingerprint) {
    await cancelRecords(env, records, fetchImpl);
    records = [];
    recordsChanged = true;
  }
  const occurrences = plannedOccurrences(alarm, { now, timeZone });
  const existingKeys = new Set(records.map(record => record.chave));
  let created = 0;
  for (const occurrence of occurrences) {
    if (existingKeys.has(occurrence.key)) continue;
    const record = await createOneSignalMessage(
      env,
      document.name,
      alarm,
      fingerprint,
      occurrence,
      fetchImpl
    );
    records.push(record);
    existingKeys.add(record.chave);
    created += 1;
    recordsChanged = true;
  }
  const state = records.length ? 'AGENDADO' : 'SEM_OCORRENCIA_FUTURA';
  const auditPending = alarmAuditPending(records);
  const needsPatch = recordsChanged
    || alarm.schedulerPendente === true
    || Number(alarm.schedulerVersao || 0) !== SCHEDULER_VERSION
    || String(alarm.oneSignalEstado || '') !== state
    || String(alarm.oneSignalFingerprint || '') !== fingerprint
    || String(alarm.oneSignalErro || '') !== ''
    || alarm.oneSignalAuditoriaPendente !== auditPending;

  // Full scans são de reconciliação. Se nada mudou, não consumir uma gravação do Firestore.
  if (!needsPatch) return { state, created, writeSkipped: true };

  await patchDocument(env, document.name, {
    schedulerPendente: false,
    schedulerVersao: SCHEDULER_VERSION,
    oneSignalEstado: state,
    oneSignalAgendamentos: records,
    oneSignalAuditoriaPendente: auditPending,
    oneSignalFingerprint: fingerprint,
    oneSignalErro: '',
    oneSignalAtualizadoEm: now
  }, fetchImpl, now);
  return { state, created };
}"""
if old in text:
    text = text.replace(old, new, 1)
elif 'writeSkipped: true' not in text:
    raise AssertionError('Bloco de reconcileAlarm não encontrado.')

assert 'function alarmRecordAuditComplete' in text
assert 'const auditPending = alarmAuditPending(records);' in text
assert 'writeSkipped: true' in text
assert 'oneSignalAuditoriaPendente: records.length > 0' not in text
index_path.write_text(text, encoding='utf-8')
print('Scheduler otimizado: full scan sem mudança não grava; auditoria concluída não é reativada.')
