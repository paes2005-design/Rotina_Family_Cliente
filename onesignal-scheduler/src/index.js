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

async function queryAlarmDocuments(env, field, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`${firestoreBaseUrl(env)}:runQuery`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'despertadores' }],
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

async function patchAlarmDocument(env, documentName, patch, fetchImpl = fetch, now = new Date()) {
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

async function createOneSignalMessage(env, documentName, alarm, fingerprint, occurrence, fetchImpl = fetch) {
  const appId = required(env.ONESIGNAL_APP_ID, 'ONESIGNAL_APP_ID');
  const clientUrl = required(env.CLIENT_APP_URL, 'CLIENT_APP_URL').replace(/\/+$/, '/') ;
  const idempotencyKey = await deterministicUuid(
    `${documentName}|${fingerprint}|${occurrence.key}`
  );
  const text = notificationText(alarm, occurrence);
  const payload = {
    app_id: appId,
    include_aliases: {
      external_id: [`rotina_family__${alarm.grupoId}__${alarm.perfilId}`]
    },
    target_channel: 'push',
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
    await patchAlarmDocument(env, document.name, {
      ativo: expired ? false : alarm.ativo === true,
      bloqueado: expired ? false : alarm.bloqueado === true,
      expirado: expired || alarm.expirado === true,
      expiradoEm: expired ? now.toISOString() : alarm.expiradoEm || '',
      expiradoPor: expired ? 'SCHEDULER_VIRADA_SEMANA' : alarm.expiradoPor || '',
      schedulerPendente: false,
      schedulerVersao: SCHEDULER_VERSION,
      oneSignalEstado: expired ? 'EXPIRADO' : 'CANCELADO',
      oneSignalAgendamentos: [],
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
  await patchAlarmDocument(env, document.name, {
    schedulerPendente: false,
    schedulerVersao: SCHEDULER_VERSION,
    oneSignalEstado: state,
    oneSignalAgendamentos: records,
    oneSignalFingerprint: fingerprint,
    oneSignalErro: '',
    oneSignalAtualizadoEm: now
  }, fetchImpl, now);
  return { state, created };
}

export async function runScheduler(env, {
  fetchImpl = fetch,
  now = new Date(),
  fullScan = false
} = {}) {
  const pending = await queryAlarmDocuments(env, 'schedulerPendente', fetchImpl, now);
  const active = fullScan
    ? await queryAlarmDocuments(env, 'ativo', fetchImpl, now)
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
        await patchAlarmDocument(env, document.name, {
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
    context.waitUntil(runScheduler(env, { now, fullScan }));
  },

  async fetch() {
    return Response.json({
      service: 'rotina-family-onesignal-scheduler',
      status: 'ok',
      schedulerVersion: SCHEDULER_VERSION
    });
  }
};
