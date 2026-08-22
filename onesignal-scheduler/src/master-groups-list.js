import { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';
let tokenCache = { value: '', expiresAt: 0, email: '' };

function required(value, name) {
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`);
  return value;
}

function base64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function encodeJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem) {
  const normalized = String(pem || '').replaceAll('\\n', '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function serviceAccount(env) {
  const value = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON'));
  required(value.client_email, 'client_email');
  required(value.private_key, 'private_key');
  return value;
}

async function googleToken(env, now = new Date()) {
  const c = serviceAccount(env);
  if (tokenCache.value && tokenCache.email === c.client_email && tokenCache.expiresAt > now.getTime() + 60_000) return tokenCache.value;
  const iat = Math.floor(now.getTime() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: c.client_email,
    sub: c.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(c.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`OAuth Google recusado (${response.status}).`);
  tokenCache = { value: body.access_token, email: c.client_email, expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID'))}/databases/(default)/documents`;
}

async function fetchRetry(url, options = {}, attempts = 4) {
  let response;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    response = await fetch(url, options);
    if (response.status !== 429 || attempt === attempts) break;
    await new Promise(resolve => setTimeout(resolve, attempt * 900));
  }
  return response;
}

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

export async function handleMasterGroupsList(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (!isMasterEmail(env, identity.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }

  const response = await fetchRetry(`${firestoreBase(env)}:runQuery`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'administradores' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'tipoAcesso' },
            op: 'EQUAL',
            value: { stringValue: 'proprietario' }
          }
        },
        limit: 100
      }
    })
  });

  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Lista de grupos recusada (${response.status}).`);

  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row.document) continue;
    const data = firestoreFieldsToJs(row.document.fields || {});
    const grupoId = String(data.codigoCliente || data.grupoId || '').trim().toUpperCase();
    if (!grupoId) continue;
    const email = String(data.email || '').trim().toLowerCase();
    if (isMasterEmail(env, email)) continue;
    map.set(grupoId, { grupoId, email, uid: String(data.uid || '') });
  }

  const groups = [...map.values()].sort((a, b) => a.grupoId.localeCompare(b.grupoId));
  return Response.json({ groups, fonte: 'administradores.proprietario' }, { headers: cors(request) });
}
