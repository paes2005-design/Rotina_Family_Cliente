from pathlib import Path
import re

path = Path('onesignal-scheduler/src/index.js')
text = path.read_text(encoding='utf-8')
original = text

# 1) Migração já aprovada: logs e saúde para o Durable Object técnico.
core_marker = "} from './core.js';\n"
technical_import = "import { appendTechnicalLogs, readTechnicalHealth, writeTechnicalHealth } from './technical-store-do.js';\n"
if technical_import not in text:
    assert core_marker in text, 'Import principal de core.js não encontrado.'
    text = text.replace(core_marker, core_marker + '\n' + technical_import, 1)

store_pattern = re.compile(
    r"async function storeSecureLog\(env, value, fetchImpl = fetch, now = new Date\(\), documentId = ''\) \{.*?\n\}\n\nasync function readSecureLogs",
    re.S,
)
store_replacement = """async function storeSecureLog(env, value, fetchImpl = fetch, now = new Date(), documentId = '') {
  const id = documentId || crypto.randomUUID();
  if (env?.TECHNICAL_STORE) {
    try {
      const result = await appendTechnicalLogs(env, [{ ...sanitizeLogEvent(value), clienteEm: value?.clienteEm || now.toISOString() }]);
      const accounted = Number(result?.stored || 0) + Number(result?.duplicates || 0);
      if (accounted < 1) console.warn(JSON.stringify({ event: 'technical_store_log_unaccounted' }));
    } catch (error) {
      // Telemetria nunca pode derrubar a função de negócio (push, recompensa ou administração).
      console.error(JSON.stringify({ event: 'technical_store_log_failure', message: cleanError(error) }));
    }
    return id;
  }
  const envelope = await encryptLogEvent(env, value);
  await createDocument(env, 'appLogsSecure', id, {
    ...envelope,
    criadoEm: now,
    expiraEm: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  }, fetchImpl, now);
  return id;
}

async function readSecureLogs"""
text, store_count = store_pattern.subn(store_replacement, text, count=1)
assert store_count == 1 or 'technical_store_log_unaccounted' in original, 'storeSecureLog não localizado para migração.'

monitor_pattern = re.compile(
    r"async function recordMonitoringCycle\(env, cycle, fetchImpl = fetch, now = new Date\(\)\) \{.*?\n\}\n\nasync function publicMonitoringStatus\(env, fetchImpl = fetch, now = new Date\(\)\) \{.*?\n\}\n\nfunction appCorsHeaders",
    re.S,
)
monitor_replacement = """async function recordMonitoringCycle(env, cycle, fetchImpl = fetch, now = new Date()) {
  const degraded = Object.keys(cycle.states || {}).some(stateHasFailure);
  const entry = {
    em: now.toISOString(),
    status: degraded ? 'DEGRADADO' : 'SAUDAVEL',
    fullScan: cycle.fullScan === true,
    processed: Number(cycle.processed) || 0,
    alarms: Number(cycle.alarms) || 0,
    alarmWritesSkipped: Number(cycle.alarmWritesSkipped) || 0,
    rewards: Number(cycle.rewards) || 0,
    audits: Number(cycle.audits) || 0,
    alarmAudits: Number(cycle.alarmAudits) || 0,
    rewardAudits: Number(cycle.rewardAudits) || 0,
    logsDeleted: Number(cycle.logsDeleted) || 0,
    logsMigrated: Number(cycle.logsMigrated) || 0,
    states: cycle.states || {},
    versions: {
      scheduler: SCHEDULER_VERSION,
      rewardPush: 1,
      deliveryAudit: 1,
      appLogs: 3,
      masterAdmin: 2,
      technicalStore: 1
    }
  };

  if (env?.TECHNICAL_STORE) {
    try {
      await writeTechnicalHealth(env, entry);
    } catch (error) {
      // O app continua operando mesmo se apenas a telemetria estiver indisponível.
      console.error(JSON.stringify({ event: 'technical_store_health_failure', message: cleanError(error) }));
    }
    return entry;
  }

  // Compatibilidade de desenvolvimento/rollback sem binding do Cloudflare.
  const documentName = monitoringDocumentName(env);
  const current = await getDocument(env, documentName, fetchImpl, now);
  const history = Array.isArray(current?.data?.ultimosCiclos) ? current.data.ultimosCiclos : [];
  await patchDocument(env, documentName, {
    servico: 'rotina-family-onesignal-scheduler',
    status: entry.status,
    ultimaExecucaoEm: now,
    ultimaExecucao: entry,
    ultimosCiclos: [...history, entry].slice(-30),
    schedulerVersion: SCHEDULER_VERSION,
    rewardPushVersion: 1,
    deliveryAuditVersion: 1,
    appLogVersion: 2,
    masterAdminVersion: 2
  }, fetchImpl, now);
  return entry;
}

async function publicMonitoringStatus(env, fetchImpl = fetch, now = new Date()) {
  if (env?.TECHNICAL_STORE) {
    try {
      const stored = await readTechnicalHealth(env);
      const health = stored?.health || null;
      return {
        service: 'rotina-family-onesignal-scheduler',
        status: health?.status || 'INICIALIZANDO',
        lastRunAt: health?.em || health?.storedAt || '',
        lastRun: health || {},
        recentCycles: Array.isArray(stored?.recentCycles) ? stored.recentCycles : [],
        versions: health?.versions || {
          scheduler: SCHEDULER_VERSION,
          rewardPush: 1,
          deliveryAudit: 1,
          appLogs: 3,
          masterAdmin: 2,
          technicalStore: 1
        },
        storage: 'cloudflare-do',
        technicalStoreVersion: Number(stored?.storeVersion) || 1
      };
    } catch (error) {
      return {
        service: 'rotina-family-onesignal-scheduler',
        status: 'ERRO_MONITORAMENTO_TECNICO',
        lastRunAt: '',
        lastRun: {},
        recentCycles: [],
        versions: { scheduler: SCHEDULER_VERSION, technicalStore: 1 },
        storage: 'cloudflare-do',
        technicalStoreVersion: 1,
        error: cleanError(error)
      };
    }
  }

  const document = await getDocument(env, monitoringDocumentName(env), fetchImpl, now);
  const data = document?.data || {};
  return {
    service: 'rotina-family-onesignal-scheduler',
    status: data.status || 'INICIALIZANDO',
    lastRunAt: data.ultimaExecucaoEm || '',
    lastRun: data.ultimaExecucao || {},
    recentCycles: Array.isArray(data.ultimosCiclos) ? data.ultimosCiclos : [],
    versions: {
      scheduler: data.schedulerVersion || SCHEDULER_VERSION,
      rewardPush: data.rewardPushVersion || 1,
      deliveryAudit: data.deliveryAuditVersion || 1,
      appLogs: data.appLogVersion || 2,
      masterAdmin: data.masterAdminVersion || 2
    },
    storage: 'firestore-legacy'
  };
}

function appCorsHeaders"""
text, monitor_count = monitor_pattern.subn(monitor_replacement, text, count=1)
assert monitor_count == 1 or "storage: 'cloudflare-do'" in original, 'Bloco de monitoramento não localizado.'

old_cleanup = """          minute === 0 ? cleanupExpiredAppLogs(env, { now }) : Promise.resolve(null),
          dailyMaintenance ? migrateLegacyAppLogs(env, { now }) : Promise.resolve(null),"""
new_cleanup = """          // Logs e saúde saíram do Firestore. Não gastar cota diária limpando/migrando telemetria legada.
          Promise.resolve(null),
          Promise.resolve(null),"""
if old_cleanup in text:
    text = text.replace(old_cleanup, new_cleanup, 1)
elif 'Não gastar cota diária limpando/migrando telemetria legada.' not in text:
    raise AssertionError('Chamadas de manutenção de logs legados não encontradas.')

# 2) Orçamento de gravações do scheduler: não gravar em full scan quando nada mudou
# e não reativar auditoria de mensagens que já foram concluídas.
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

old_reconcile = """  const fingerprint = await alarmFingerprint(alarm);
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
new_reconcile = """  const fingerprint = await alarmFingerprint(alarm);
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
if old_reconcile in text:
    text = text.replace(old_reconcile, new_reconcile, 1)
elif 'writeSkipped: true' not in text:
    raise AssertionError('Bloco de reconcileAlarm não encontrado.')

cycle_anchor = """          alarms: alarmResults.length,
          rewards: rewardResults.length,"""
cycle_replacement = """          alarms: alarmResults.length,
          alarmWritesSkipped: alarmResults.filter(result => result.writeSkipped === true).length,
          rewards: rewardResults.length,"""
if cycle_anchor in text:
    text = text.replace(cycle_anchor, cycle_replacement, 1)
elif 'alarmWritesSkipped:' not in text:
    raise AssertionError('Métrica de ciclo do scheduler não encontrada.')

assert technical_import in text
assert "await writeTechnicalHealth(env, entry);" in text
assert "appendTechnicalLogs(env" in text
assert "storage: 'cloudflare-do'" in text
assert 'minute === 0 ? cleanupExpiredAppLogs' not in text
assert 'dailyMaintenance ? migrateLegacyAppLogs' not in text
assert 'function alarmRecordAuditComplete' in text
assert 'const auditPending = alarmAuditPending(records);' in text
assert 'writeSkipped: true' in text
assert 'oneSignalAuditoriaPendente: records.length > 0' not in text
assert 'alarmWritesSkipped:' in text

path.write_text(text, encoding='utf-8')
print('Migração aplicada: telemetria no Cloudflare + scheduler sem gravações redundantes.')
