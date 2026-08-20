import {
  SCHEDULER_VERSION,
  DEFAULT_TIME_ZONE,
  alarmFingerprint,
  deterministicUuid,
  firestoreFieldsToJs,
  formatDateBr,
  isLocalMidnight,
  jsToFirestoreFields,
  plannedOccurrences,
  weekStartInZone,
  zonedParts
} from './core.js';

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
let cachedGoogleToken = { email: '', value: '', expiresAt: 0 };

function required(value, name) {
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`);
  return value;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function encodeJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToBytes(pem) {
  const normalized = String(pem || '').replaceAll('\\n', '\n');
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function serviceAccountAssertion(credentials, now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: credentials.client_email,
    sub: credentials.client_email,
    scope: FIRESTORE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(credentials.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function serviceAccount(env) {
  let parsed;
  try {
    parsed = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON'));
  } catch (error) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON inválido: ${error.message}`);
  }
  required(parsed.client_email, 'client_email da conta de serviço');
  required(parsed.private_key, 'private_key da conta de serviço');
  return parsed;
}

async function googleAccessToken(env, fetchImpl = fetch, now = new Date()) {
  const credentials = serviceAccount(env);
  if (
    cachedGoogleToken.email === credentials.client_email &&
    cachedGoogleToken.value &&
    cachedGoogleToken.expiresAt > now.getTime() + 60_000
  ) return cachedGoogleToken.value;
  const assertion = await serviceAccountAssertion(credentials, now);
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`OAuth Google recusado (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  cachedGoogleToken = {
    email: credentials.client_email,
    value: body.access_token,
    expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000
  };
  return cachedGoogleToken.value;
}

function firestoreBaseUrl(env) {
  const projectId = required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

async function queryDocuments(env, collectionId, field, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`${firestoreBaseUrl(env)}:runQuery`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: { booleanValue: true }
          }
        },
        limit: 200
      }
    })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(`Consulta Firestore recusada (${response.status}): ${JSON.stringify(rows).slice(0, 300)}`);
  }
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row.document)
    .map(row => ({
      name: row.document.name,
      createTime: row.document.createTime,
      updateTime: row.document.updateTime,
      data: firestoreFieldsToJs(row.document.fields || {})
    }));
}

async function queryExpiredAppLogs(env, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`${firestoreBaseUrl(env)}:runQuery`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'appLogs' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'expiraEm' },
            op: 'LESS_THAN',
            value: { timestampValue: now.toISOString() }
          }
        },
        limit: 200
      }
    })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(`Limpeza de logs recusada (${response.status}): ${JSON.stringify(rows).slice(0, 300)}`);
  }
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => row.document.name);
}

async function deleteDocument(env, documentName, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`https://firestore.googleapis.com/v1/${documentName}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` }
  });
  if (response.ok || response.status === 404) return;
  const body = await response.text();
  throw new Error(`Exclusão Firestore recusada (${response.status}): ${body.slice(0, 300)}`);
}

export async function cleanupExpiredAppLogs(env, {
  fetchImpl = fetch,
  now = new Date()
} = {}) {
  const documentNames = await queryExpiredAppLogs(env, fetchImpl, now);
  for (const documentName of documentNames) {
    await deleteDocument(env, documentName, fetchImpl, now);
  }
  return { state: 'LOGS_LIMPOS', deleted: documentNames.length };
}

async function patchDocument(env, documentName, patch, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const url = new URL(`https://firestore.googleapis.com/v1/${documentName}`);
  for (const field of Object.keys(patch)) url.searchParams.append('updateMask.fieldPaths', field);
  const response = await fetchImpl(url, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ name: documentName, fields: jsToFirestoreFields(patch) })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Atualização Firestore recusada (${response.status}): ${body.slice(0, 300)}`);
  }
}

async function getDocument(env, documentName, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`https://firestore.googleapis.com/v1/${documentName}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Leitura Firestore recusada (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return {
    name: body.name,
    data: firestoreFieldsToJs(body.fields || {})
  };
}

function monitoringDocumentName(env) {
  const projectId = required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID');
  return `projects/${projectId}/databases/(default)/documents/monitoramento/rotina-family-runtime`;
}

function stateHasFailure(state = '') {
  return /ERRO|FALHOU|SEM_ASSINANTE/.test(String(state));
}

async function recordMonitoringCycle(env, cycle, fetchImpl = fetch, now = new Date()) {
  const documentName = monitoringDocumentName(env);
  const current = await getDocument(env, documentName, fetchImpl, now);
  const history = Array.isArray(current?.data?.ultimosCiclos) ? current.data.ultimosCiclos : [];
  const degraded = Object.keys(cycle.states || {}).some(stateHasFailure);
  const entry = {
    em: now.toISOString(),
    status: degraded ? 'DEGRADADO' : 'SAUDAVEL',
    fullScan: cycle.fullScan === true,
    processed: Number(cycle.processed) || 0,
    alarms: Number(cycle.alarms) || 0,
    rewards: Number(cycle.rewards) || 0,
    audits: Number(cycle.audits) || 0,
    alarmAudits: Number(cycle.alarmAudits) || 0,
    rewardAudits: Number(cycle.rewardAudits) || 0,
    logsDeleted: Number(cycle.logsDeleted) || 0,
    states: cycle.states || {}
  };
  await patchDocument(env, documentName, {
    servico: 'rotina-family-onesignal-scheduler',
    status: entry.status,
    ultimaExecucaoEm: now,
    ultimaExecucao: entry,
    ultimosCiclos: [...history, entry].slice(-30),
    schedulerVersion: SCHEDULER_VERSION,
    rewardPushVersion: 1,
    deliveryAuditVersion: 1,
    appLogVersion: 1
  }, fetchImpl, now);
  return entry;
}

async function publicMonitoringStatus(env, fetchImpl = fetch, now = new Date()) {
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
      appLogs: data.appLogVersion || 1
    }
  };
}

function oneSignalHeaders(env) {
  return {
    authorization: `Key ${required(env.ONESIGNAL_REST_API_KEY, 'ONESIGNAL_REST_API_KEY')}`,
    'content-type': 'application/json'
  };
}

async function cancelOneSignalMessage(env, messageId, fetchImpl = fetch) {
  if (!messageId) return;
  const url = new URL(`${ONESIGNAL_API_URL}/${encodeURIComponent(messageId)}`);
  url.searchParams.set('app_id', required(env.ONESIGNAL_APP_ID, 'ONESIGNAL_APP_ID'));
  const response = await fetchImpl(url, { method: 'DELETE', headers: oneSignalHeaders(env) });
  if (response.ok || [400, 404, 409].includes(response.status)) return;
  const body = await response.text();
  throw new Error(`Cancelamento OneSignal recusado (${response.status}): ${body.slice(0, 300)}`);
}

async function viewOneSignalMessage(env, messageId, fetchImpl = fetch) {
  const url = new URL(`${ONESIGNAL_API_URL}/${encodeURIComponent(messageId)}`);
  url.searchParams.set('app_id', required(env.ONESIGNAL_APP_ID, 'ONESIGNAL_APP_ID'));
  const response = await fetchImpl(url, { headers: oneSignalHeaders(env) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Consulta OneSignal recusada (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function cancelRecords(env, records, fetchImpl = fetch) {
  for (const record of records) await cancelOneSignalMessage(env, record.mensagemId, fetchImpl);
}

function notificationText(alarm, occurrence) {
  const label = occurrence.type === 'fim' ? 'Fim' : 'Início';
  const time = occurrence.localDateTime.split('T')[1]?.slice(0, 5) || '';
  return {
    title: `⏰ ${label} da tarefa: ${alarm.nomeTarefa || 'Tarefa'}`,
    body: `Programada para ${formatDateBr(alarm.dataAgendada)} às ${time}. Toque para abrir o Rotina Family.`
  };
}

function clientPushFilters(groupId, profileId) {
  return [
    { field: 'tag', key: 'grupoId', relation: '=', value: String(groupId || '') },
    { operator: 'AND' },
    { field: 'tag', key: 'perfilId', relation: '=', value: String(profileId || '') },
    { operator: 'AND' },
    { field: 'tag', key: 'aplicativo', relation: '=', value: 'cliente' }
  ];
}

function adminPushFilters(groupId) {
  return [
    { field: 'tag', key: 'admAtivo', relation: '=', value: '1' },
    { operator: 'AND' },
    { field: 'tag', key: 'admGrupoId', relation: '=', value: String(groupId || '') }
  ];
}

async function createOneSignalMessage(env, documentName, alarm, fingerprint, occurrence, fetchImpl = fetch) {
  const appId = required(env.ONESIGNAL_APP_ID, 'ONESIGNAL_APP_ID');
  const clientUrl = required(env.CLIENT_APP_URL, 'CLIENT_APP_URL').replace(/\/+$/, '/') ;
  const idempotencyKey = await deterministicUuid(
    `${documentName}|${fingerprint}|${occurrence.key}`
  );
  const text = notificationText(alarm, occurrence);
  const payload = {
    app_id: appId,
    filters: clientPushFilters(alarm.grupoId, alarm.perfilId),
    headings: { en: text.title, pt: text.title },
    contents: { en: text.body, pt: text.body },
    name: `Rotina Family · ${occurrence.key}`.slice(0, 128),
    idempotency_key: idempotencyKey,
    web_url: clientUrl,
    chrome_web_icon: `${clientUrl}icon-cliente-192.png`,
    firefox_icon: `${clientUrl}icon-cliente-192.png`,
    chrome_web_badge: `${clientUrl}icon-cliente-192.png`,
    web_push_topic: idempotencyKey,
    ttl: 300,
    data: {
      tipo: 'alarme-tarefa',
      tarefaId: alarm.tarefaId,
      dataAgendada: alarm.dataAgendada,
      ocorrencia: occurrence.key,
      momento: occurrence.type
    }
  };
  if (occurrence.sendAfter) payload.send_after = occurrence.sendAfter;
  const response = await fetchImpl(ONESIGNAL_API_URL, {
    method: 'POST',
    headers: oneSignalHeaders(env),
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
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
}

function cleanError(error) {
  return String(error?.message || error || 'erro desconhecido').replace(/\s+/g, ' ').slice(0, 500);
}

export async function reconcileAlarm(env, document, {
  fetchImpl = fetch,
  now = new Date()
} = {}) {
  const alarm = document.data || {};
  const timeZone = env.ALARM_TIME_ZONE || DEFAULT_TIME_ZONE;
  const previousRecords = Array.isArray(alarm.oneSignalAgendamentos)
    ? alarm.oneSignalAgendamentos.filter(record => record && record.mensagemId)
    : [];
  const currentWeek = weekStartInZone(now, timeZone);
  const expired = alarm.ativo === true && alarm.semanaInicio !== currentWeek;

  if (alarm.ativo !== true || expired) {
    await cancelRecords(env, previousRecords, fetchImpl);
    await patchDocument(env, document.name, {
      ativo: expired ? false : alarm.ativo === true,
      bloqueado: expired ? false : alarm.bloqueado === true,
      expirado: expired || alarm.expirado === true,
      expiradoEm: expired ? now.toISOString() : alarm.expiradoEm || '',
      expiradoPor: expired ? 'SCHEDULER_VIRADA_SEMANA' : alarm.expiradoPor || '',
      schedulerPendente: false,
      schedulerVersao: SCHEDULER_VERSION,
      oneSignalEstado: expired ? 'EXPIRADO' : 'CANCELADO',
      oneSignalAgendamentos: [],
      oneSignalAuditoriaPendente: false,
      oneSignalFingerprint: '',
      oneSignalErro: '',
      oneSignalAtualizadoEm: now
    }, fetchImpl, now);
    return { state: expired ? 'EXPIRADO' : 'CANCELADO', created: 0 };
  }

  const fingerprint = await alarmFingerprint(alarm);
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
}

function deliveryNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function deliverySummary(message = {}) {
  return {
    successful: deliveryNumber(message.successful),
    received: deliveryNumber(message.received),
    failed: deliveryNumber(message.failed),
    errored: deliveryNumber(message.errored),
    remaining: message.remaining === null || message.remaining === undefined
      ? null
      : deliveryNumber(message.remaining),
    completedAt: message.completed_at ? new Date(Number(message.completed_at) * 1000).toISOString() : '',
    platformDeliveryStats: message.platform_delivery_stats || {}
  };
}

function deliveryState(summary) {
  if (summary.received > 0) return 'RECEBIDO_NO_APARELHO';
  if (summary.successful > 0) return 'ENTREGUE_AO_SERVICO_PUSH';
  if (summary.failed > 0 || summary.errored > 0) return 'FALHOU';
  return 'AGUARDANDO_ENVIO';
}

export async function auditAlarmDelivery(env, document, {
  fetchImpl = fetch,
  now = new Date(),
  minimumDelayMs = 30_000
} = {}) {
  const alarm = document.data || {};
  const records = Array.isArray(alarm.oneSignalAgendamentos)
    ? alarm.oneSignalAgendamentos.filter(record => record?.mensagemId)
    : [];
  const audited = [];
  let pending = false;
  for (const record of records) {
    const sendAt = Date.parse(record.envioEm || '');
    if (!Number.isFinite(sendAt) || sendAt > now.getTime() - minimumDelayMs) {
      pending = true;
      audited.push(record);
      continue;
    }
    const message = await viewOneSignalMessage(env, record.mensagemId, fetchImpl);
    const summary = deliverySummary(message);
    if (summary.remaining === null || summary.remaining > 0 || !summary.completedAt) pending = true;
    audited.push({
      ...record,
      auditoria: {
        ...summary,
        estado: deliveryState(summary),
        auditadoEm: now.toISOString()
      }
    });
  }
  const totals = audited.reduce((result, record) => {
    const audit = record.auditoria || {};
    for (const field of ['successful', 'received', 'failed', 'errored']) {
      result[field] += deliveryNumber(audit[field]);
    }
    return result;
  }, { successful: 0, received: 0, failed: 0, errored: 0 });
  const state = deliveryState(totals);
  await patchDocument(env, document.name, {
    oneSignalAgendamentos: audited,
    oneSignalAuditoriaPendente: pending,
    oneSignalEntregaEstado: records.length ? state : 'SEM_MENSAGEM',
    oneSignalEntregaResumo: totals,
    oneSignalAuditadoEm: now,
    oneSignalEntregaErro: ''
  }, fetchImpl, now);
  return { state, pending, ...totals };
}

export async function runAlarmDeliveryAudits(env, {
  fetchImpl = fetch,
  now = new Date()
} = {}) {
  const documents = await queryDocuments(
    env,
    'despertadores',
    'oneSignalAuditoriaPendente',
    fetchImpl,
    now
  );
  const results = [];
  for (const document of documents) {
    try {
      results.push({ document: document.name, ...(await auditAlarmDelivery(env, document, { fetchImpl, now })) });
    } catch (error) {
      const message = cleanError(error);
      results.push({ document: document.name, state: 'ERRO_AUDITORIA', error: message });
      try {
        await patchDocument(env, document.name, {
          oneSignalAuditoriaPendente: true,
          oneSignalEntregaEstado: 'ERRO_AUDITORIA',
          oneSignalEntregaErro: message,
          oneSignalAuditadoEm: now
        }, fetchImpl, now);
      } catch (patchError) {
        console.error('Falha ao registrar erro da auditoria:', cleanError(patchError));
      }
    }
  }
  return results;
}

function rewardNotificationContent(reward, audience) {
  const points = Number(reward.pontos) || 0;
  const name = reward.recompensaNome || 'uma recompensa';
  if (audience === 'admin') {
    return {
      title: '🎁 Nova solicitação de recompensa',
      body: `${reward.perfilNome || 'Integrante'} solicitou ${name} (${points} pontos).`,
      type: 'recompensa-solicitada'
    };
  }
  const approved = reward.status === 'Aprovado';
  return {
    title: approved ? '✅ Recompensa aprovada!' : '❌ Recompensa não aprovada',
    body: approved
      ? `${name} foi aprovada. Aproveite sua conquista!`
      : `${name} não foi aprovada. Converse com seu responsável.`,
    type: approved ? 'recompensa-aprovada' : 'recompensa-recusada'
  };
}

async function createRewardMessage(env, documentName, reward, audience, fetchImpl = fetch) {
  const appId = required(env.ONESIGNAL_APP_ID, 'ONESIGNAL_APP_ID');
  const isAdmin = audience === 'admin';
  const appUrl = required(
    isAdmin ? env.ADMIN_APP_URL : env.CLIENT_APP_URL,
    isAdmin ? 'ADMIN_APP_URL' : 'CLIENT_APP_URL'
  ).replace(/\/+$/, '/');
  const target = isAdmin
    ? `adm:${reward.grupoId}`
    : `cliente:${reward.grupoId}:${reward.perfilId}`;
  const content = rewardNotificationContent(reward, audience);
  const identity = isAdmin
    ? reward.criadoEm || reward.pushAdminSolicitadoEm || ''
    : reward.decididoEm || reward.pushClienteSolicitadoEm || '';
  const idempotencyKey = await deterministicUuid(`${documentName}|reward|${audience}|${identity}`);
  const iconName = isAdmin ? 'icon-administrador-192.png' : 'icon-cliente-192.png';
  const payload = {
    app_id: appId,
    filters: isAdmin
      ? adminPushFilters(reward.grupoId)
      : clientPushFilters(reward.grupoId, reward.perfilId),
    headings: { en: content.title, pt: content.title },
    contents: { en: content.body, pt: content.body },
    name: `Rotina Family · ${content.type}`.slice(0, 128),
    idempotency_key: idempotencyKey,
    web_url: `${appUrl}?abrir=resgates`,
    chrome_web_icon: `${appUrl}${iconName}`,
    firefox_icon: `${appUrl}${iconName}`,
    chrome_web_badge: `${appUrl}${iconName}`,
    web_push_topic: idempotencyKey,
    ttl: 86_400,
    data: {
      tipo: content.type,
      resgateId: documentName.split('/').at(-1) || '',
      grupoId: reward.grupoId || '',
      perfilId: reward.perfilId || '',
      status: reward.status || 'Pendente'
    }
  };
  const response = await fetchImpl(ONESIGNAL_API_URL, {
    method: 'POST',
    headers: oneSignalHeaders(env),
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    throw new Error(`Push de recompensa recusado (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { messageId: body.id, idempotencyKey, target };
}

export async function reconcileRewardNotification(env, document, audience, {
  fetchImpl = fetch,
  now = new Date()
} = {}) {
  const reward = document.data || {};
  const isAdmin = audience === 'admin';
  const pendingField = isAdmin ? 'pushAdminPendente' : 'pushClientePendente';
  const prefix = isAdmin ? 'pushAdmin' : 'pushCliente';
  if (reward[pendingField] !== true) return { state: 'IGNORADO', audience };
  const valid = isAdmin
    ? String(reward.status || 'Pendente') === 'Pendente'
    : ['Aprovado', 'Recusado'].includes(reward.status);
  if (!valid) {
    await patchDocument(env, document.name, {
      [pendingField]: false,
      [`${prefix}Estado`]: 'CANCELADO_POR_ESTADO',
      [`${prefix}AtualizadoEm`]: now
    }, fetchImpl, now);
    return { state: 'CANCELADO_POR_ESTADO', audience };
  }
  const sent = await createRewardMessage(env, document.name, reward, audience, fetchImpl);
  await patchDocument(env, document.name, {
    [pendingField]: false,
    [`${prefix}Estado`]: 'ENVIADO',
    [`${prefix}MensagemId`]: sent.messageId,
    [`${prefix}IdempotencyKey`]: sent.idempotencyKey,
    [`${prefix}Destino`]: sent.target,
    [`${prefix}AuditoriaPendente`]: true,
    [`${prefix}Erro`]: '',
    [`${prefix}EnviadoEm`]: now,
    [`${prefix}AtualizadoEm`]: now
  }, fetchImpl, now);
  return { state: 'ENVIADO', audience, messageId: sent.messageId };
}

export async function runRewardNotifications(env, {
  fetchImpl = fetch,
  now = new Date()
} = {}) {
  const [adminDocuments, clientDocuments] = await Promise.all([
    queryDocuments(env, 'resgates', 'pushAdminPendente', fetchImpl, now),
    queryDocuments(env, 'resgates', 'pushClientePendente', fetchImpl, now)
  ]);
  const work = [
    ...adminDocuments.map(document => ({ document, audience: 'admin' })),
    ...clientDocuments.map(document => ({ document, audience: 'client' }))
  ];
  const results = [];
  for (const item of work) {
    const prefix = item.audience === 'admin' ? 'pushAdmin' : 'pushCliente';
    const pendingField = `${prefix}Pendente`;
    try {
      results.push({
        document: item.document.name,
        ...(await reconcileRewardNotification(env, item.document, item.audience, { fetchImpl, now }))
      });
    } catch (error) {
      const message = cleanError(error);
      const attempts = Number(item.document.data?.[`${prefix}Tentativas`] || 0) + 1;
      const noSubscriber = /not subscribed|no valid subscriptions|included players/i.test(message);
      const retry = !noSubscriber && attempts < 5;
      results.push({
        document: item.document.name,
        state: noSubscriber ? 'SEM_ASSINANTE' : 'ERRO',
        audience: item.audience,
        error: message
      });
      try {
        await patchDocument(env, item.document.name, {
          [pendingField]: retry,
          [`${prefix}Estado`]: noSubscriber ? 'SEM_ASSINANTE' : 'ERRO',
          [`${prefix}Erro`]: message,
          [`${prefix}Tentativas`]: attempts,
          [`${prefix}AtualizadoEm`]: now
        }, fetchImpl, now);
      } catch (patchError) {
        console.error('Falha ao registrar erro do push de recompensa:', cleanError(patchError));
      }
    }
  }
  return results;
}

export async function auditRewardDelivery(env, document, audience, {
  fetchImpl = fetch,
  now = new Date(),
  minimumDelayMs = 30_000
} = {}) {
  const reward = document.data || {};
  const prefix = audience === 'admin' ? 'pushAdmin' : 'pushCliente';
  const pendingField = `${prefix}AuditoriaPendente`;
  const messageId = reward[`${prefix}MensagemId`];
  if (reward[pendingField] !== true || !messageId) return { state: 'IGNORADO', audience };
  const sentAt = Date.parse(reward[`${prefix}EnviadoEm`] || '');
  if (Number.isFinite(sentAt) && sentAt > now.getTime() - minimumDelayMs) {
    return { state: 'AGUARDANDO_AUDITORIA', audience, pending: true };
  }
  const summary = deliverySummary(await viewOneSignalMessage(env, messageId, fetchImpl));
  const pending = summary.remaining === null || summary.remaining > 0 || !summary.completedAt;
  const state = deliveryState(summary);
  await patchDocument(env, document.name, {
    [pendingField]: pending,
    [`${prefix}EntregaEstado`]: state,
    [`${prefix}EntregaResumo`]: summary,
    [`${prefix}AuditadoEm`]: now,
    [`${prefix}AuditoriaErro`]: ''
  }, fetchImpl, now);
  return { state, audience, pending, ...summary };
}

export async function runRewardDeliveryAudits(env, {
  fetchImpl = fetch,
  now = new Date()
} = {}) {
  const [adminDocuments, clientDocuments] = await Promise.all([
    queryDocuments(env, 'resgates', 'pushAdminAuditoriaPendente', fetchImpl, now),
    queryDocuments(env, 'resgates', 'pushClienteAuditoriaPendente', fetchImpl, now)
  ]);
  const work = [
    ...adminDocuments.map(document => ({ document, audience: 'admin' })),
    ...clientDocuments.map(document => ({ document, audience: 'client' }))
  ];
  const results = [];
  for (const item of work) {
    const prefix = item.audience === 'admin' ? 'pushAdmin' : 'pushCliente';
    try {
      results.push({
        document: item.document.name,
        ...(await auditRewardDelivery(env, item.document, item.audience, { fetchImpl, now }))
      });
    } catch (error) {
      const message = cleanError(error);
      results.push({
        document: item.document.name,
        state: 'ERRO_AUDITORIA_RECOMPENSA',
        audience: item.audience,
        error: message
      });
      try {
        await patchDocument(env, item.document.name, {
          [`${prefix}AuditoriaPendente`]: true,
          [`${prefix}EntregaEstado`]: 'ERRO_AUDITORIA',
          [`${prefix}AuditoriaErro`]: message,
          [`${prefix}AuditadoEm`]: now
        }, fetchImpl, now);
      } catch (patchError) {
        console.error('Falha ao registrar auditoria de recompensa:', cleanError(patchError));
      }
    }
  }
  return results;
}

export async function runScheduler(env, {
  fetchImpl = fetch,
  now = new Date(),
  fullScan = false
} = {}) {
  const pending = await queryDocuments(env, 'despertadores', 'schedulerPendente', fetchImpl, now);
  const active = fullScan
    ? await queryDocuments(env, 'despertadores', 'ativo', fetchImpl, now)
    : [];
  const documents = [...new Map([...pending, ...active].map(document => [document.name, document])).values()];
  const results = [];
  for (const document of documents) {
    try {
      results.push({ document: document.name, ...(await reconcileAlarm(env, document, { fetchImpl, now })) });
    } catch (error) {
      const message = cleanError(error);
      results.push({ document: document.name, state: 'ERRO', error: message });
      try {
        await patchDocument(env, document.name, {
          schedulerPendente: true,
          schedulerVersao: SCHEDULER_VERSION,
          oneSignalEstado: 'ERRO',
          oneSignalErro: message,
          oneSignalAtualizadoEm: now
        }, fetchImpl, now);
      } catch (patchError) {
        console.error('Falha ao registrar erro do agendador:', cleanError(patchError));
      }
    }
  }
  return results;
}

export default {
  async scheduled(controller, env, context) {
    const now = new Date(controller.scheduledTime);
    const timeZone = env.ALARM_TIME_ZONE || DEFAULT_TIME_ZONE;
    const minute = zonedParts(now, timeZone).minute;
    const fullScan = isLocalMidnight(now, timeZone) || minute % 5 === 0;
    context.waitUntil((async () => {
      try {
        const [alarmResults, rewardResults, alarmAuditResults, rewardAuditResults, logCleanup] = await Promise.all([
          runScheduler(env, { now, fullScan }),
          runRewardNotifications(env, { now }),
          runAlarmDeliveryAudits(env, { now }),
          runRewardDeliveryAudits(env, { now }),
          minute === 0 ? cleanupExpiredAppLogs(env, { now }) : Promise.resolve(null)
        ]);
        const results = [
          ...alarmResults,
          ...rewardResults,
          ...alarmAuditResults,
          ...rewardAuditResults,
          ...(logCleanup ? [logCleanup] : [])
        ];
        const summary = results.reduce((counts, result) => {
          counts[result.state] = (counts[result.state] || 0) + 1;
          return counts;
        }, {});
        const cycle = {
          event: 'rotina_family_scheduler_run',
          scheduledTime: now.toISOString(),
          fullScan,
          processed: results.length,
          alarms: alarmResults.length,
          rewards: rewardResults.length,
          audits: alarmAuditResults.length + rewardAuditResults.length,
          alarmAudits: alarmAuditResults.length,
          rewardAudits: rewardAuditResults.length,
          logsDeleted: logCleanup?.deleted || 0,
          states: summary
        };
        await recordMonitoringCycle(env, cycle, fetch, now);
        console.log(JSON.stringify(cycle));
      } catch (error) {
        console.error(JSON.stringify({
          event: 'rotina_family_scheduler_failure',
          scheduledTime: now.toISOString(),
          fullScan,
          error: cleanError(error)
        }));
        throw error;
      }
    })());
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/monitoramento' || url.pathname === '/health') {
      try {
        return Response.json(await publicMonitoringStatus(env), {
          headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
        });
      } catch (error) {
        return Response.json({
          service: 'rotina-family-onesignal-scheduler',
          status: 'ERRO_MONITORAMENTO',
          error: cleanError(error)
        }, {
          status: 503,
          headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }
        });
      }
    }
    return Response.json({
      service: 'rotina-family-onesignal-scheduler',
      status: 'ok',
      schedulerVersion: SCHEDULER_VERSION,
      rewardPushVersion: 1,
      deliveryAuditVersion: 1,
      monitoringUrl: `${url.origin}/monitoramento`
    });
  }
};
