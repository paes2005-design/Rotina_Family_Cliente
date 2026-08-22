import { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const ALLOWED_APP_ORIGIN = 'https://paes2005-design.github.io';
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
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth-type:jwt-bearer'.replace('oauth-type', 'oauth:grant-type'), assertion })
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

async function administratorLinks(env, token, fetchImpl = fetch) {
  const response = await fetchImpl(firestoreRunQueryUrl(env), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'administradores' }], limit: 1000 } })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Firestore recusou administradores (${response.status}).`);

  const byUid = new Map();
  const byEmail = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row.document) continue;
    const data = firestoreFieldsToJs(row.document.fields || {});
    const uid = String(data.uid || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const record = {
      uid,
      email,
      grupoId: String(data.codigoCliente || data.grupoId || '').trim().toUpperCase(),
      codigoAdmin: String(data.codigoAdmin || '').trim(),
      tipoAcesso: String(data.tipoAcesso || '').trim().toLowerCase()
    };
    if (uid) byUid.set(uid, record);
    if (email) byEmail.set(email, record);
  }
  return { byUid, byEmail };
}

export async function handleMasterUsersFallback(request, env, fetchImpl = fetch, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearerToken(request), fetchImpl, now);
  if (!isMasterEmail(env, identity.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }

  const token = await accessToken(env, fetchImpl, now);
  const projectId = required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID');
  const url = new URL(`${IDENTITY_TOOLKIT_URL}/projects/${encodeURIComponent(projectId)}/accounts:batchGet`);
  url.searchParams.set('maxResults', '1000');
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error?.message || body.error?.status || `HTTP ${response.status}`;
    return Response.json({ error: `Firebase Authentication recusou a listagem: ${String(message).slice(0, 160)}` }, { status: response.status, headers: cors(request) });
  }

  let links = { byUid: new Map(), byEmail: new Map() };
  let firestoreDisponivel = true;
  let aviso = '';
  try {
    links = await administratorLinks(env, token, fetchImpl);
  } catch (error) {
    firestoreDisponivel = false;
    aviso = String(error?.message || error).slice(0, 180);
    console.warn(JSON.stringify({ event: 'master_users_family_join_failure', aviso }));
  }

  const users = (body.users || []).map(user => {
    const uid = String(user.localId || '');
    const email = String(user.email || '').trim().toLowerCase();
    const admin = links.byUid.get(uid) || links.byEmail.get(email) || null;
    const master = isMasterEmail(env, email);
    return {
      uid,
      email,
      codigoAdmin: master ? 'MASTER' : String(admin?.codigoAdmin || ''),
      grupoId: master ? '' : String(admin?.grupoId || ''),
      tipoAcesso: master ? 'master' : String(admin?.tipoAcesso || ''),
      papel: master ? 'master' : 'administrador',
      desativado: user.disabled === true,
      criadoEm: user.createdAt ? new Date(Number(user.createdAt)).toISOString() : '',
      ultimoLoginEm: user.lastLoginAt ? new Date(Number(user.lastLoginAt)).toISOString() : ''
    };
  }).sort((a, b) => a.email.localeCompare(b.email));

  const vinculados = users.filter(user => user.papel !== 'master' && user.grupoId).length;
  console.log(JSON.stringify({ event: 'master_users_loaded', total: users.length, vinculados, firestoreDisponivel }));

  return Response.json({
    users,
    fonte: firestoreDisponivel ? 'firebase-auth+firestore' : 'firebase-auth',
    firestoreDisponivel,
    vinculados,
    aviso
  }, { headers: cors(request) });
}
