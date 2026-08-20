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

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit'
].join(' ');
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ALLOWED_APP_ORIGIN = 'https://paes2005-design.github.io';
const SENSITIVE_LOG_KEY = /senha|password|pin|email|justificativa|token|secret|chave|api/i;
let cachedGoogleToken = { email: '', value: '', expiresAt: 0 };
let cachedFirebaseKeys = { values: [], expiresAt: 0 };

function required(value, name) {
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`);
  return value;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
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
    scope: GOOGLE_SCOPES,
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

async function firebaseJwks(fetchImpl = fetch, now = new Date()) {
  if (cachedFirebaseKeys.values.length && cachedFirebaseKeys.expiresAt > now.getTime()) {
    return cachedFirebaseKeys.values;
  }
  const response = await fetchImpl(FIREBASE_JWKS_URL);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.keys)) {
    throw new Error(`Chaves públicas do Firebase indisponíveis (${response.status}).`);
  }
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 3600);
  cachedFirebaseKeys = {
    values: body.keys,
    expiresAt: now.getTime() + Math.max(300, maxAge) * 1000
  };
  return body.keys;
}

export async function verifyFirebaseIdToken(env, idToken, fetchImpl = fetch, now = new Date()) {
  const token = String(idToken || '').trim();
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('Token de sessão inválido.');
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);
  const projectId = required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID');
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Assinatura de sessão inválida.');
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Sessão emitida para outro projeto.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Identificador da sessão inválido.');
  }
  if (Number(payload.exp) <= nowSeconds || Number(payload.iat) > nowSeconds + 60) {
    throw new Error('Sessão expirada ou emitida no futuro.');
  }
  const jwk = (await firebaseJwks(fetchImpl, now)).find(key => key.kid === header.kid);
  if (!jwk) throw new Error('Chave de assinatura da sessão não encontrada.');
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!verified) throw new Error('Assinatura da sessão não confere.');
  return { uid: payload.sub, email: String(payload.email || '').trim().toLowerCase(), claims: payload };
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

async function queryDocumentsByString(env, collectionId, field, value, fetchImpl = fetch, now = new Date(), limit = 200) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`${firestoreBaseUrl(env)}:runQuery`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: { stringValue: String(value || '') }
          }
        },
        limit
      }
    })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Consulta Firestore recusada (${response.status}).`);
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => ({
    name: row.document.name,
    createTime: row.document.createTime,
    updateTime: row.document.updateTime,
    data: firestoreFieldsToJs(row.document.fields || {})
  }));
}

async function listDocuments(env, collectionId, fetchImpl = fetch, now = new Date(), pageSize = 200) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const url = new URL(`${firestoreBaseUrl(env)}/${encodeURIComponent(collectionId)}`);
  url.searchParams.set('pageSize', String(Math.min(200, Math.max(1, pageSize))));
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Listagem Firestore recusada (${response.status}).`);
  return (body.documents || []).map(document => ({
    name: document.name,
    createTime: document.createTime,
    updateTime: document.updateTime,
    data: firestoreFieldsToJs(document.fields || {})
  }));
}

async function createDocument(env, collectionId, documentId, data, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const url = new URL(`${firestoreBaseUrl(env)}/${encodeURIComponent(collectionId)}`);
  if (documentId) url.searchParams.set('documentId', documentId);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: jsToFirestoreFields(data) })
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 409) return `${firestoreBaseUrl(env)}/${collectionId}/${documentId}`;
  if (!response.ok) throw new Error(`Criação Firestore recusada (${response.status}): ${JSON.stringify(body).slice(0, 200)}`);
  return body.name || '';
}

async function queryExpiredAppLogs(env, collectionId, fetchImpl = fetch, now = new Date()) {
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
  const documentNames = [
    ...(await queryExpiredAppLogs(env, 'appLogs', fetchImpl, now)),
    ...(await queryExpiredAppLogs(env, 'appLogsSecure', fetchImpl, now))
  ];
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

function cleanLogScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return String(value ?? '').replace(/\s+/g, ' ').slice(0, 180);
}

export function sanitizeLogEvent(value = {}) {
  const details = {};
  for (const [key, item] of Object.entries(value.detalhes || {})) {
    if (SENSITIVE_LOG_KEY.test(key) || typeof item === 'object') continue;
    details[String(key).slice(0, 50)] = cleanLogScalar(item);
  }
  return {
    aplicativo: ['cliente', 'adm', 'master'].includes(value.aplicativo) ? value.aplicativo : 'desconhecido',
    versaoMonitor: Number(value.versaoMonitor) || 1,
    evento: String(value.evento || 'evento').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80),
    nivel: ['info', 'warning', 'error'].includes(value.nivel) ? value.nivel : 'info',
    detalhes: details,
    grupoId: String(value.grupoId || '').trim().slice(0, 80),
    perfilId: String(value.perfilId || '').trim().slice(0, 128),
    sessaoId: String(value.sessaoId || '').slice(0, 128),
    clienteEm: String(value.clienteEm || new Date().toISOString()).slice(0, 40),
    pagina: String(value.pagina || '').slice(0, 100),
    navegador: String(value.navegador || '').slice(0, 40),
    online: value.online !== false,
    visibilidade: String(value.visibilidade || '').slice(0, 30),
    instalado: value.instalado === true
  };
}

async function logEncryptionKey(env) {
  const secret = required(env.APP_LOG_ENCRYPTION_KEY, 'APP_LOG_ENCRYPTION_KEY');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function secureGroupHash(env, groupId) {
  const secret = required(env.APP_LOG_ENCRYPTION_KEY, 'APP_LOG_ENCRYPTION_KEY');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}|grupo|${String(groupId || '').trim()}`)
  );
  return base64Url(new Uint8Array(digest));
}

export async function encryptLogEvent(env, value) {
  const event = sanitizeLogEvent(value);
  if (!event.grupoId) throw new Error('Log sem grupo.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await logEncryptionKey(env),
    new TextEncoder().encode(JSON.stringify(event))
  );
  return {
    grupoHash: await secureGroupHash(env, event.grupoId),
    iv: base64Url(iv),
    payload: base64Url(new Uint8Array(encrypted)),
    versao: 1
  };
}

export async function decryptLogEvent(env, envelope) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(envelope.iv) },
    await logEncryptionKey(env),
    decodeBase64Url(envelope.payload)
  );
  return sanitizeLogEvent(JSON.parse(new TextDecoder().decode(decrypted)));
}

async function storeSecureLog(env, value, fetchImpl = fetch, now = new Date(), documentId = '') {
  const envelope = await encryptLogEvent(env, value);
  const id = documentId || crypto.randomUUID();
  await createDocument(env, 'appLogsSecure', id, {
    ...envelope,
    criadoEm: now,
    expiraEm: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }, fetchImpl, now);
  return id;
}

async function readSecureLogs(env, groupId, fetchImpl = fetch, now = new Date()) {
  const documents = await queryDocumentsByString(
    env,
    'appLogsSecure',
    'grupoHash',
    await secureGroupHash(env, groupId),
    fetchImpl,
    now,
    200
  );
  const logs = [];
  for (const document of documents) {
    try {
      logs.push({ id: document.name.split('/').at(-1), ...(await decryptLogEvent(env, document.data)) });
    } catch (_) {}
  }
  return logs.sort((a, b) => String(b.clienteEm || '').localeCompare(String(a.clienteEm || ''))).slice(0, 100);
}

export async function migrateLegacyAppLogs(env, {
  fetchImpl = fetch,
  now = new Date(),
  limit = 100
} = {}) {
  const legacy = await listDocuments(env, 'appLogs', fetchImpl, now, limit);
  let migrated = 0;
  for (const document of legacy) {
    const id = document.name.split('/').at(-1) || crypto.randomUUID();
    const event = sanitizeLogEvent(document.data);
    if (event.grupoId) {
      await storeSecureLog(env, event, fetchImpl, now, `legacy-${id}`);
      migrated += 1;
    }
    await deleteDocument(env, document.name, fetchImpl, now);
  }
  return { state: 'LOGS_MIGRADOS', migrated };
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
    logsMigrated: Number(cycle.logsMigrated) || 0,
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
    appLogVersion: 2,
    masterAdminVersion: 2
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
      appLogs: data.appLogVersion || 2,
      masterAdmin: data.masterAdminVersion || 2
    }
  };
}

function appCorsHeaders(request, extra = {}) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === ALLOWED_APP_ORIGIN ? origin : ALLOWED_APP_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    vary: 'Origin',
    ...extra
  };
}

function bearerToken(request) {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function masterEmailSet(env) {
  return new Set(
    String(env.MASTER_ADMIN_EMAILS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isMasterEmail(env, email) {
  return masterEmailSet(env).has(String(email || '').trim().toLowerCase());
}

async function administratorByUid(env, uid, fetchImpl = fetch, now = new Date()) {
  return (await queryDocumentsByString(env, 'administradores', 'uid', uid, fetchImpl, now, 2))[0] || null;
}

async function requireMaster(request, env, fetchImpl = fetch, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearerToken(request), fetchImpl, now);
  if (!isMasterEmail(env, identity.email)) throw new Error('Acesso exclusivo do ADM Master.');

  // A autoridade Master pertence à identidade autenticada e ao Secret privado
  // MASTER_ADMIN_EMAILS. O documento em `administradores` é apenas compatibilidade
  // legada do painel e nunca pode decidir se o Master continua autorizado.
  const administrator = await administratorByUid(env, identity.uid, fetchImpl, now).catch(() => null);
  return { ...identity, administrator };
}

async function identityToolkitAdminRequest(env, path, body, fetchImpl = fetch, now = new Date()) {
  const token = await googleAccessToken(env, fetchImpl, now);
  const response = await fetchImpl(`${IDENTITY_TOOLKIT_URL}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error?.message || result.error?.status || `HTTP ${response.status}`;
    throw new Error(`Firebase Authentication recusou a operação: ${String(message).slice(0, 180)}`);
  }
  return result;
}

async function listAdministratorUsers(env, fetchImpl = fetch, now = new Date()) {
  const documents = await listDocuments(env, 'administradores', fetchImpl, now, 200);
  const uids = documents.map(item => String(item.data.uid || '')).filter(Boolean);
  const authUsers = uids.length
    ? (await identityToolkitAdminRequest(env, '/accounts:lookup', { localId: uids }, fetchImpl, now)).users || []
    : [];
  const byUid = new Map(authUsers.map(user => [user.localId, user]));
  return documents.map(document => {
    const uid = String(document.data.uid || '');
    const authUser = byUid.get(uid) || {};
    const email = String(authUser.email || document.data.email || '').trim().toLowerCase();
    return {
      uid,
      email,
      codigoAdmin: String(document.data.codigoAdmin || ''),
      grupoId: String(document.data.codigoCliente || document.data.grupoId || ''),
      papel: isMasterEmail(env, email) ? 'master' : 'admin',
      desativado: authUser.disabled === true,
      criadoEm: authUser.createdAt ? new Date(Number(authUser.createdAt)).toISOString() : document.createTime || '',
      ultimoLoginEm: authUser.lastLoginAt ? new Date(Number(authUser.lastLoginAt)).toISOString() : ''
    };
  }).sort((a, b) => a.email.localeCompare(b.email));
}

async function auditMasterAction(env, caller, action, targetUid, status, fetchImpl = fetch, now = new Date()) {
  const groupId = 'MASTER-SYSTEM';
  await storeSecureLog(env, {
    aplicativo: 'master',
    evento: `master.${action}`,
    nivel: status === 'sucesso' ? 'info' : 'error',
    detalhes: { alvoUid: String(targetUid || '').slice(0, 128), resultado: status },
    grupoId: groupId,
    perfilId: '',
    sessaoId: '',
    clienteEm: now.toISOString(),
    pagina: 'adm-master',
    navegador: 'servidor',
    online: true,
    visibilidade: 'servidor',
    instalado: false
  }, fetchImpl, now);
}

async function handleAppLogRequest(request, env, fetchImpl = fetch, now = new Date()) {
  if (request.headers.get('origin') && request.headers.get('origin') !== ALLOWED_APP_ORIGIN) {
    return Response.json({ error: 'Origem não permitida.' }, { status: 403, headers: appCorsHeaders(request) });
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 64_000) return Response.json({ error: 'Lote muito grande.' }, { status: 413, headers: appCorsHeaders(request) });
  const body = await request.json().catch(() => ({}));
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 25).map(sanitizeLogEvent).filter(item => item.grupoId);
  for (const event of events) await storeSecureLog(env, event, fetchImpl, now);
  return Response.json({ accepted: events.length }, { headers: appCorsHeaders(request) });
}

async function handleAdminMasterRequest(request, env, fetchImpl = fetch, now = new Date()) {
  let caller;
  try {
    caller = await requireMaster(request, env, fetchImpl, now);
  } catch (error) {
    return Response.json({ error: cleanError(error) }, { status: 403, headers: appCorsHeaders(request) });
  }
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/session')) {
    return Response.json({
      master: true,
      uid: caller.uid,
      email: caller.email,
      grupoId: '',
      autoridade: 'MASTER-SYSTEM'
    }, { headers: appCorsHeaders(request) });
  }
  if (request.method === 'GET' && url.pathname.endsWith('/users')) {
    return Response.json({ users: await listAdministratorUsers(env, fetchImpl, now) }, { headers: appCorsHeaders(request) });
  }
  if (request.method === 'GET' && url.pathname.endsWith('/logs')) {
    const groupId = String(url.searchParams.get('grupoId') || '').trim();
    return Response.json({ logs: await readSecureLogs(env, groupId, fetchImpl, now) }, { headers: appCorsHeaders(request) });
  }
  if (request.method !== 'POST' || !url.pathname.endsWith('/users')) {
    return Response.json({ error: 'Operação não encontrada.' }, { status: 404, headers: appCorsHeaders(request) });
  }
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const targetUid = String(body.targetUid || '').trim();
  const target = targetUid ? await administratorByUid(env, targetUid, fetchImpl, now) : null;
  if (!target) return Response.json({ error: 'Administrador não encontrado.' }, { status: 404, headers: appCorsHeaders(request) });
  const targetEmail = String(target.data.email || '').trim().toLowerCase();
  if (targetUid === caller.uid || isMasterEmail(env, targetEmail)) {
    return Response.json({ error: 'O login Master não pode ser alterado por este painel.' }, { status: 409, headers: appCorsHeaders(request) });
  }
  try {
    if (action === 'update-email') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Informe um e-mail válido.');
      await identityToolkitAdminRequest(env, '/accounts:update', { localId: targetUid, email }, fetchImpl, now);
      await patchDocument(env, target.name, { email, atualizadoPorMasterEm: now }, fetchImpl, now);
    } else if (action === 'send-password-reset') {
      await identityToolkitAdminRequest(env, '/accounts:sendOobCode', {
        requestType: 'PASSWORD_RESET',
        email: targetEmail,
        userIp: request.headers.get('cf-connecting-ip') || '127.0.0.1'
      }, fetchImpl, now);
    } else if (action === 'set-disabled') {
      await identityToolkitAdminRequest(env, '/accounts:update', {
        localId: targetUid,
        disableUser: body.disabled === true,
        validSince: String(Math.floor(now.getTime() / 1000))
      }, fetchImpl, now);
    } else if (action === 'delete-user') {
      await identityToolkitAdminRequest(env, '/accounts:delete', { localId: targetUid }, fetchImpl, now);
      await deleteDocument(env, target.name, fetchImpl, now);
    } else {
      throw new Error('Ação administrativa inválida.');
    }
    await auditMasterAction(env, caller, action, targetUid, 'sucesso', fetchImpl, now);
    return Response.json({ success: true }, { headers: appCorsHeaders(request) });
  } catch (error) {
    await auditMasterAction(env, caller, action || 'desconhecida', targetUid, 'erro', fetchImpl, now).catch(() => {});
    return Response.json({ error: cleanError(error) }, { status: 400, headers: appCorsHeaders(request) });
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
      grupoId: alarm.grupoId,
      perfilId: alarm.perfilId,
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
    if (record.auditoria?.completedAt && Number(record.auditoria?.remaining || 0) === 0) {
      audited.push(record);
      continue;
    }
    const sendAt = Date.parse(record.envioEm || '');
    if (!Number.isFinite(sendAt) || sendAt > now.getTime() - minimumDelayMs) {
      pending = true;
      audited.push(record);
      continue;
    }
    const message = await viewOneSignalMessage(env, record.mensagemId, fetchImpl);
    const summary = deliverySummary(message);
    if (summary.remaining === null || summary.remaining > 0 || !summary.completedAt) pending = true;
    if (summary.completedAt) {
      await storeSecureLog(env, {
        aplicativo: 'cliente',
        evento: 'push.onesignal_auditado',
        nivel: summary.failed || summary.errored ? 'warning' : 'info',
        detalhes: {
          tipo: 'alarme',
          momento: record.momento || '',
          estado: deliveryState(summary),
          successful: summary.successful,
          received: summary.received,
          failed: summary.failed,
          errored: summary.errored
        },
        grupoId: alarm.grupoId,
        perfilId: alarm.perfilId,
        sessaoId: '',
        clienteEm: summary.completedAt || record.envioEm || now.toISOString(),
        pagina: 'worker',
        navegador: Object.keys(summary.platformDeliveryStats || {}).join(',').slice(0, 40),
        online: true,
        visibilidade: 'servidor-push',
        instalado: false
      }, fetchImpl, now, `push-${await deterministicUuid(`alarm|${record.mensagemId}`)}`);
    }
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
  if (summary.completedAt) {
    await storeSecureLog(env, {
      aplicativo: audience === 'admin' ? 'adm' : 'cliente',
      evento: 'push.onesignal_auditado',
      nivel: summary.failed || summary.errored ? 'warning' : 'info',
      detalhes: {
        tipo: audience === 'admin' ? 'recompensa_solicitada' : 'recompensa_decidida',
        estado: state,
        successful: summary.successful,
        received: summary.received,
        failed: summary.failed,
        errored: summary.errored
      },
      grupoId: reward.grupoId,
      perfilId: reward.perfilId || '',
      sessaoId: '',
      clienteEm: summary.completedAt || reward[`${prefix}EnviadoEm`] || now.toISOString(),
      pagina: 'worker',
      navegador: Object.keys(summary.platformDeliveryStats || {}).join(',').slice(0, 40),
      online: true,
      visibilidade: 'servidor-push',
      instalado: false
    }, fetchImpl, now, `push-${await deterministicUuid(`reward|${audience}|${messageId}`)}`);
  }
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

async function cleanupKnownOrphanTestAdmin(env, fetchImpl = fetch, now = new Date()) {
  const documents = await listDocuments(env, 'administradores', fetchImpl, now, 200);
  const candidates = documents.filter(document => {
    const data = document.data || {};
    const uid = String(data.uid || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const grupoId = String(data.codigoCliente || data.grupoId || '').trim();
    const codigoAdmin = String(data.codigoAdmin || '').trim();
    return !uid && email === 'teste' && grupoId === 'CLI-7335' && codigoAdmin === 'ADM-8609';
  });
  for (const document of candidates) await deleteDocument(env, document.name, fetchImpl, now);
  return { state: candidates.length ? 'ADMIN_TESTE_ORFAO_REMOVIDO' : 'ADMIN_TESTE_ORFAO_AUSENTE', deleted: candidates.length };
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
        const [alarmResults, rewardResults, alarmAuditResults, rewardAuditResults, logCleanup, logMigration, orphanCleanup] = await Promise.all([
          runScheduler(env, { now, fullScan }),
          runRewardNotifications(env, { now }),
          runAlarmDeliveryAudits(env, { now }),
          runRewardDeliveryAudits(env, { now }),
          minute === 0 ? cleanupExpiredAppLogs(env, { now }) : Promise.resolve(null),
          fullScan ? migrateLegacyAppLogs(env, { now }) : Promise.resolve(null),
          cleanupKnownOrphanTestAdmin(env, fetch, now)
        ]);
        const results = [
          ...alarmResults,
          ...rewardResults,
          ...alarmAuditResults,
          ...rewardAuditResults,
          ...(logCleanup ? [logCleanup] : []),
          ...(logMigration ? [logMigration] : []),
          ...(orphanCleanup ? [orphanCleanup] : [])
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
          logsMigrated: logMigration?.migrated || 0,
          orphanAdminsDeleted: orphanCleanup?.deleted || 0,
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
    if (request.method === 'OPTIONS' && (url.pathname === '/app-log' || url.pathname.startsWith('/admin-master/'))) {
      return new Response(null, { status: 204, headers: appCorsHeaders(request) });
    }
    if (url.pathname === '/app-log' && request.method === 'POST') {
      try {
        return await handleAppLogRequest(request, env);
      } catch (error) {
        return Response.json({ error: cleanError(error) }, { status: 400, headers: appCorsHeaders(request) });
      }
    }
    if (url.pathname.startsWith('/admin-master/')) {
      try {
        return await handleAdminMasterRequest(request, env);
      } catch (error) {
        return Response.json({ error: cleanError(error) }, { status: 500, headers: appCorsHeaders(request) });
      }
    }
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
      masterAdminVersion: 2,
      secureLogsVersion: 1,
      monitoringUrl: `${url.origin}/monitoramento`
    });
  }
};
