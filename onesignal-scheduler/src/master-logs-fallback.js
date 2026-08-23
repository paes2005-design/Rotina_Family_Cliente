import { verifyFirebaseIdToken, isMasterEmail, decryptLogEvent } from './index.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_APP_ORIGIN = 'https://paes2005-design.github.io';
const MAX_LOG_LIMIT = 500;
const DEFAULT_LOG_LIMIT = 500;
let cachedToken = { value: '', expiresAt: 0, email: '' };

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

function serviceAccount(env) {
  const parsed = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON'));
  required(parsed.client_email, 'client_email da conta de serviço');
  required(parsed.private_key, 'private_key da conta de serviço');
  return parsed;
}

async function accessToken(env, fetchImpl = fetch, now = new Date()) {
  const credentials = serviceAccount(env);
  if (cachedToken.email === credentials.client_email && cachedToken.value && cachedToken.expiresAt > now.getTime() + 60_000) {
    return cachedToken.value;
  }
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: credentials.client_email,
    sub: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
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
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`OAuth Google recusado (${response.status}).`);
  cachedToken = {
    email: credentials.client_email,
    value: body.access_token,
    expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000
  };
  return cachedToken.value;
}

function bearerToken(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === ALLOWED_APP_ORIGIN ? origin : ALLOWED_APP_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

function firestoreRunQueryUrl(env) {
  const projectId = required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
}

function firestoreError(body, httpStatus) {
  const error = body?.error || (Array.isArray(body) ? body.find(item => item?.error)?.error : null) || {};
  const status = String(error.status || '').trim();
  const message = String(error.message || '').replace(/\s+/g, ' ').trim();
  const category = status || (httpStatus === 429 ? 'RESOURCE_EXHAUSTED' : 'FIRESTORE_ERROR');
  return `${category}${message ? ` — ${message.slice(0, 260)}` : ''}`;
}

function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOG_LIMIT;
  return Math.max(1, Math.min(MAX_LOG_LIMIT, Math.floor(n)));
}

async function recentSecureDocuments(env, fetchImpl = fetch, now = new Date(), limit = DEFAULT_LOG_LIMIT) {
  const token = await accessToken(env, fetchImpl, now);
  const safeLimit = normalizeLimit(limit);
  const requestOptions = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'appLogsSecure' }],
        orderBy: [{ field: { fieldPath: 'criadoEm' }, direction: 'DESCENDING' }],
        limit: safeLimit
      }
    })
  };
  let response = await fetchImpl(firestoreRunQueryUrl(env), requestOptions);
  if (response.status === 429) {
    const firstBody = await response.clone().json().catch(() => ({}));
    const cause = firestoreError(firstBody, response.status);
    if (!/RESOURCE_EXHAUSTED|quota|exhaust/i.test(cause)) {
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 1200));
      response = await fetchImpl(firestoreRunQueryUrl(env), requestOptions);
    }
  }
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const cause = firestoreError(rows, response.status);
    console.warn(JSON.stringify({ event: 'master_logs_read_failure', httpStatus: response.status, cause }));
    throw new Error(`Leitura de logs recusada (${response.status}): ${cause}`);
  }
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => ({
    id: String(row.document.name || '').split('/').at(-1) || '',
    data: row.document.fields || {}
  }));
}

function firestoreFieldsToEnvelope(fields = {}) {
  return {
    grupoHash: fields.grupoHash?.stringValue || '',
    iv: fields.iv?.stringValue || '',
    payload: fields.payload?.stringValue || '',
    versao: Number(fields.versao?.integerValue || fields.versao?.doubleValue || 1)
  };
}

export async function handleMasterLogsFallback(request, env, fetchImpl = fetch, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearerToken(request), fetchImpl, now);
  if (!isMasterEmail(env, identity.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }

  const url = new URL(request.url);
  const requestedGroup = String(url.searchParams.get('grupoId') || '').trim();
  const requestedLimit = normalizeLimit(url.searchParams.get('limit'));
  const globalMode = !requestedGroup || requestedGroup.toUpperCase() === 'SISTEMA' || requestedGroup === 'MASTER-SYSTEM';
  const documents = await recentSecureDocuments(env, fetchImpl, now, requestedLimit);
  const logs = [];
  for (const document of documents) {
    try {
      const event = await decryptLogEvent(env, firestoreFieldsToEnvelope(document.data));
      if (!globalMode && String(event.grupoId || '') !== requestedGroup) continue;
      logs.push({ id: document.id, ...event });
    } catch (_) {}
  }
  logs.sort((a, b) => String(b.clienteEm || '').localeCompare(String(a.clienteEm || '')));
  return Response.json({
    logs: logs.slice(0, requestedLimit),
    escopo: globalMode ? 'todos-os-grupos' : requestedGroup,
    limiteSolicitado: requestedLimit,
    limiteMaximo: MAX_LOG_LIMIT
  }, { headers: cors(request) });
}
