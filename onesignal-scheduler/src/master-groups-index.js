import { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';
let tokenCache = { value: '', expiresAt: 0, email: '' };
let groupsCache = { value: null, expiresAt: 0 };

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
  if (tokenCache.value && tokenCache.email === c.client_email && tokenCache.expiresAt > now.getTime() + 60_000) {
    return tokenCache.value;
  }
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

async function fetchQuery(url, options = {}) {
  let response = await fetch(url, options);
  if (response.status !== 429) return response;
  const firstBody = await response.clone().json().catch(() => ({}));
  const summary = firestoreError(firstBody, response.status);
  if (/RESOURCE_EXHAUSTED|quota|exhaust/i.test(summary)) return response;
  const retryAfter = Number(response.headers.get('retry-after') || 0);
  await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 1200));
  return fetch(url, options);
}

function createdTime(data = {}, fallback = '') {
  const raw = data.criadoEm || data.createdAt || data.dataCriacao || fallback || '';
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function normalizeAdmin(row, env) {
  const data = firestoreFieldsToJs(row.document?.fields || {});
  const email = String(data.email || '').trim().toLowerCase();
  const grupoId = String(data.codigoCliente || data.grupoId || '').trim().toUpperCase();
  return {
    grupoId,
    email,
    uid: String(data.uid || ''),
    tipoAcesso: String(data.tipoAcesso || '').trim().toLowerCase(),
    criadoEmMs: createdTime(data, row.document?.createTime || ''),
    master: isMasterEmail(env, email)
  };
}

function chooseOwner(records = []) {
  const nonMaster = records.filter(item => !item.master);
  const explicit = nonMaster.find(item => item.tipoAcesso === 'proprietario');
  if (explicit) return { ...explicit, origemPrincipal: 'tipoAcesso' };
  const legacy = [...nonMaster].sort((a, b) => a.criadoEmMs - b.criadoEmMs)[0] || null;
  return legacy ? { ...legacy, origemPrincipal: 'legado-mais-antigo' } : null;
}

async function loadOwnerGroups(env, now = new Date()) {
  if (groupsCache.value && groupsCache.expiresAt > now.getTime()) return groupsCache.value;

  const response = await fetchQuery(firestoreRunQueryUrl(env), {
    method: 'POST',
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'administradores' }], limit: 200 } })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const cause = firestoreError(rows, response.status);
    console.warn(JSON.stringify({ event: 'master_groups_read_failure', httpStatus: response.status, cause }));
    if (groupsCache.value) return { ...groupsCache.value, aviso: `Lista em cache; Firestore respondeu ${response.status} (${cause}).` };
    throw new Error(`Lista de grupos recusada (${response.status}): ${cause}`);
  }

  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row.document) continue;
    const admin = normalizeAdmin(row, env);
    if (!admin.grupoId) continue;
    if (!grouped.has(admin.grupoId)) grouped.set(admin.grupoId, []);
    grouped.get(admin.grupoId).push(admin);
  }

  const groups = [];
  for (const [grupoId, records] of grouped.entries()) {
    const owner = chooseOwner(records);
    if (!owner) continue;
    groups.push({
      grupoId,
      proprietarioEmail: owner.email,
      proprietarioUid: owner.uid,
      origemPrincipal: owner.origemPrincipal,
      totalAdministradores: records.filter(item => !item.master).length
    });
  }
  groups.sort((a, b) => a.grupoId.localeCompare(b.grupoId));

  console.log(JSON.stringify({
    event: 'master_groups_index_loaded',
    groups: groups.length,
    adminsRead: Array.isArray(rows) ? rows.filter(row => row.document).length : 0,
    legacyOwners: groups.filter(group => group.origemPrincipal === 'legado-mais-antigo').length
  }));

  const value = { groups, aviso: groups.length ? '' : 'Nenhum grupo foi identificado nos registros administrativos disponíveis.' };
  groupsCache = { value, expiresAt: now.getTime() + 10 * 60 * 1000 };
  return value;
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

export async function handleMasterGroupsIndex(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (!isMasterEmail(env, identity.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }
  try {
    const result = await loadOwnerGroups(env, now);
    return Response.json(result, { headers: cors(request) });
  } catch (error) {
    return Response.json({ error: String(error?.message || error).slice(0, 420) }, { status: 503, headers: cors(request) });
  }
}
