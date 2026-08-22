import { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs, jsToFirestoreFields } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
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
  const normalized = String(pem || '')
    .replaceAll('\\n', '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(normalized);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function credentials(env) {
  const value = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON'));
  required(value.client_email, 'client_email');
  required(value.private_key, 'private_key');
  return value;
}

async function accessToken(env, now = new Date()) {
  const c = credentials(env);
  if (tokenCache.value && tokenCache.email === c.client_email && tokenCache.expiresAt > now.getTime() + 60_000) return tokenCache.value;
  const iat = Math.floor(now.getTime() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: c.client_email,
    sub: c.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(c.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}` })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`OAuth Google recusado (${response.status}).`);
  tokenCache = { value: body.access_token, email: c.client_email, expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

async function authAdmin(env, path, body, now = new Date()) {
  const response = await fetch(`${IDENTITY_TOOLKIT_URL}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `Firebase Authentication HTTP ${response.status}`);
  return result;
}

async function queryAdministratorByUid(env, uid, now = new Date()) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
  let response = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    response = await fetch(`${base}:runQuery`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken(env, now)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'administradores' }],
          where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
          limit: 1
        }
      })
    });
    if (response.status !== 429 || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 600 * attempt));
  }
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []);
  const document = (Array.isArray(rows) ? rows : []).find(row => row.document)?.document;
  return document ? { name: document.name, data: firestoreFieldsToJs(document.fields || {}) } : null;
}

async function bestEffortPatchAdministrator(env, uid, patch, now = new Date()) {
  try {
    const document = await queryAdministratorByUid(env, uid, now);
    if (!document) return;
    const url = new URL(`https://firestore.googleapis.com/v1/${document.name}`);
    for (const key of Object.keys(patch)) url.searchParams.append('updateMask.fieldPaths', key);
    await fetch(url, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${await accessToken(env, now)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: document.name, fields: jsToFirestoreFields(patch) })
    });
  } catch (_) {
    // A ação principal no Firebase Authentication não falha por indisponibilidade do Firestore.
  }
}

async function bestEffortDeleteAdministrator(env, uid, now = new Date()) {
  try {
    const document = await queryAdministratorByUid(env, uid, now);
    if (!document) return;
    await fetch(`https://firestore.googleapis.com/v1/${document.name}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await accessToken(env, now)}` }
    });
  } catch (_) {}
}

export async function handleMasterUserActionFallback(request, env, now = new Date()) {
  const caller = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (!isMasterEmail(env, caller.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const targetUid = String(body.targetUid || '').trim();
  if (!targetUid) return Response.json({ error: 'Usuário não informado.' }, { status: 400, headers: cors(request) });

  const target = (await authAdmin(env, '/accounts:lookup', { localId: [targetUid] }, now)).users?.[0];
  if (!target) return Response.json({ error: 'Usuário não encontrado no Firebase Authentication.' }, { status: 404, headers: cors(request) });
  const targetEmail = String(target.email || '').trim().toLowerCase();
  if (targetUid === caller.uid || isMasterEmail(env, targetEmail)) {
    return Response.json({ error: 'O login Master não pode ser alterado por este painel.' }, { status: 409, headers: cors(request) });
  }

  if (action === 'update-email') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400, headers: cors(request) });
    }
    await authAdmin(env, '/accounts:update', { localId: targetUid, email }, now);
    await bestEffortPatchAdministrator(env, targetUid, { email, atualizadoPorMasterEm: now }, now);
  } else if (action === 'send-password-reset') {
    if (!targetEmail) return Response.json({ error: 'Usuário sem e-mail para redefinição.' }, { status: 409, headers: cors(request) });
    await authAdmin(env, '/accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email: targetEmail,
      userIp: request.headers.get('cf-connecting-ip') || '127.0.0.1'
    }, now);
  } else if (action === 'set-disabled') {
    await authAdmin(env, '/accounts:update', {
      localId: targetUid,
      disableUser: body.disabled === true,
      validSince: String(Math.floor(now.getTime() / 1000))
    }, now);
  } else if (action === 'delete-user') {
    await authAdmin(env, '/accounts:delete', { localId: targetUid }, now);
    await bestEffortDeleteAdministrator(env, targetUid, now);
  } else {
    return Response.json({ error: 'Ação administrativa inválida.' }, { status: 400, headers: cors(request) });
  }

  return Response.json({ success: true, fonte: 'firebase-auth', firestoreComplementar: true }, { headers: cors(request) });
}
