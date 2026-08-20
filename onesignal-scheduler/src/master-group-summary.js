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

async function queryByString(env, collectionId, field, value, limit = 100, now = new Date()) {
  const response = await fetchRetry(`${firestoreBase(env)}:runQuery`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: String(value) } } },
      limit
    } })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Consulta do grupo recusada (${response.status}).`);
  return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => ({
    id: String(r.document.name || '').split('/').at(-1) || '',
    data: firestoreFieldsToJs(r.document.fields || {})
  }));
}

async function groupAdmins(env, groupId, now = new Date()) {
  const byGroup = await queryByString(env, 'administradores', 'grupoId', groupId, 50, now);
  const byCode = await queryByString(env, 'administradores', 'codigoCliente', groupId, 50, now);
  const map = new Map();
  for (const item of [...byGroup, ...byCode]) map.set(item.id, item);
  return [...map.values()];
}

async function groupProfiles(env, groupId, now = new Date()) {
  return queryByString(env, 'perfis', 'grupoId', groupId, 100, now);
}

async function groupConfig(env, groupId, now = new Date()) {
  const response = await fetchRetry(`${firestoreBase(env)}/configGrupos/${encodeURIComponent(groupId)}`, {
    headers: { authorization: `Bearer ${await googleToken(env, now)}` }
  });
  if (response.status === 404) return {};
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Leitura do grupo recusada (${response.status}).`);
  return firestoreFieldsToJs(body.fields || {});
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

export async function handleMasterGroupSummary(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (!isMasterEmail(env, identity.email)) return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });

  const groupId = String(new URL(request.url).searchParams.get('grupoId') || '').trim().toUpperCase();
  if (!groupId) return Response.json({ error: 'Informe o código do grupo.' }, { status: 400, headers: cors(request) });

  const [admins, profiles, config] = await Promise.all([
    groupAdmins(env, groupId, now),
    groupProfiles(env, groupId, now),
    groupConfig(env, groupId, now)
  ]);

  const normalizedAdmins = admins.map(item => ({
    id: item.id,
    uid: String(item.data.uid || ''),
    email: String(item.data.email || '').trim().toLowerCase(),
    tipoAcesso: String(item.data.tipoAcesso || 'admin'),
    principal: String(item.data.tipoAcesso || '') === 'proprietario',
    master: isMasterEmail(env, String(item.data.email || '').trim().toLowerCase())
  }));
  const owner = normalizedAdmins.find(a => a.principal && !a.master) || normalizedAdmins.find(a => a.principal) || null;

  const clientes = profiles.map(item => ({
    id: item.id,
    perfilId: String(item.data.perfilId || item.id),
    nome: String(item.data.nome || 'Integrante')
  }));

  return Response.json({
    grupo: {
      grupoId,
      grupoBloqueado: config.grupoBloqueado === true,
      administradorPrincipal: owner ? { uid: owner.uid, email: owner.email } : null,
      administradores: normalizedAdmins,
      clientes
    }
  }, { headers: cors(request) });
}
