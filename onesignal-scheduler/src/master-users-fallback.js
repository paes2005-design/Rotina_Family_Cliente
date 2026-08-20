import { verifyFirebaseIdToken, isMasterEmail } from './index.js';

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
    scope: 'https://www.googleapis.com/auth/identitytoolkit',
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

  const users = (body.users || []).map(user => {
    const email = String(user.email || '').trim().toLowerCase();
    return {
      uid: String(user.localId || ''),
      email,
      codigoAdmin: '',
      grupoId: '',
      papel: isMasterEmail(env, email) ? 'master' : 'usuario',
      desativado: user.disabled === true,
      criadoEm: user.createdAt ? new Date(Number(user.createdAt)).toISOString() : '',
      ultimoLoginEm: user.lastLoginAt ? new Date(Number(user.lastLoginAt)).toISOString() : ''
    };
  }).sort((a, b) => a.email.localeCompare(b.email));

  return Response.json({ users, fonte: 'firebase-auth', firestoreDisponivel: false }, { headers: cors(request) });
}
