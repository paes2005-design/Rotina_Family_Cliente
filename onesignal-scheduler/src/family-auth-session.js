import { firestoreFieldsToJs, jsToFirestoreFields, sha256Hex } from './core.js';
import { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { readCommercialState } from './security-maintenance-v1.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CUSTOM_TOKEN_AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';
const failures = new Map();
let tokenCache = { value: '', expiresAt: 0, email: '' };

const normalizeGroup = value => String(value || '').trim().toUpperCase();
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ');
const docId = name => String(name || '').split('/').at(-1) || '';

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
  let value;
  try { value = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON')); }
  catch (error) { throw new Error(`Conta de serviço inválida: ${error.message}`); }
  required(value.client_email, 'client_email');
  required(value.private_key, 'private_key');
  return value;
}

async function signJwt(env, payload) {
  const c = credentials(env);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson(payload)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemBytes(c.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function customToken(env, uid, claims = {}, now = new Date()) {
  const c = credentials(env);
  const iat = Math.floor(now.getTime() / 1000);
  return signJwt(env, {
    iss: c.client_email,
    sub: c.client_email,
    aud: CUSTOM_TOKEN_AUD,
    iat,
    exp: iat + 3600,
    uid: String(uid),
    claims
  });
}

async function googleToken(env, now = new Date()) {
  const c = credentials(env);
  if (tokenCache.value && tokenCache.email === c.client_email && tokenCache.expiresAt > now.getTime() + 60_000) return tokenCache.value;
  const iat = Math.floor(now.getTime() / 1000);
  const assertion = await signJwt(env, {
    iss: c.client_email,
    sub: c.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + 3600
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  // Compatibility with the OAuth JWT bearer grant spelling used by Google.
  if (!response.ok) {
    const retry = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    });
    const body = await retry.json().catch(() => ({}));
    if (!retry.ok || !body.access_token) throw new Error(`OAuth Google recusado (${retry.status}).`);
    tokenCache = { value: body.access_token, email: c.client_email, expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000 };
    return tokenCache.value;
  }
  const body = await response.json().catch(() => ({}));
  if (!body.access_token) throw new Error('OAuth Google não retornou token.');
  tokenCache = { value: body.access_token, email: c.client_email, expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID'))}/databases/(default)/documents`;
}

async function firestoreRequest(env, url, options = {}, now = new Date()) {
  const response = await fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, ...(options.headers || {}) }
  });
  return response;
}

async function queryString(env, collectionId, field, value, now = new Date(), limit = 100) {
  const response = await firestoreRequest(env, `${firestoreBase(env)}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: String(value || '') } } },
      limit
    } })
  }, now);
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Consulta ${collectionId} recusada (${response.status}).`);
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => ({
    name: row.document.name,
    createTime: row.document.createTime || '',
    data: firestoreFieldsToJs(row.document.fields || {}) || {}
  }));
}

async function getDocument(env, collectionId, id, now = new Date()) {
  const response = await firestoreRequest(env, `${firestoreBase(env)}/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}`, {}, now);
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Leitura ${collectionId} recusada (${response.status}).`);
  return { name: body.name, createTime: body.createTime || '', data: firestoreFieldsToJs(body.fields || {}) || {} };
}

async function upsertDocument(env, collectionId, id, data, now = new Date()) {
  const url = new URL(`${firestoreBase(env)}/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}`);
  for (const field of Object.keys(data)) url.searchParams.append('updateMask.fieldPaths', field);
  const response = await firestoreRequest(env, url.toString(), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: jsToFirestoreFields(data) })
  }, now);
  if (!response.ok) throw new Error(`Gravação ${collectionId} recusada (${response.status}).`);
}

async function createDocument(env, collectionId, id, data, now = new Date()) {
  const url = new URL(`${firestoreBase(env)}/${encodeURIComponent(collectionId)}`);
  if (id) url.searchParams.set('documentId', id);
  const response = await firestoreRequest(env, url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: jsToFirestoreFields(data) })
  }, now);
  if (!response.ok) throw new Error(`Criação ${collectionId} recusada (${response.status}).`);
  const body = await response.json().catch(() => ({}));
  return body.name || '';
}

function commercialState(config = {}, now = Date.now()) {
  if (config.grupoBloqueado === true) return 'bloqueado';
  if (config.grupoConfirmado === true) return 'confirmado';
  if (Number(config.trialVersao || 0) === 2 && config.trialAtivo === true) {
    const expires = Date.parse(String(config.trialFimEm || ''));
    if (Number.isFinite(expires) && now >= expires) return 'teste-expirado';
    return 'teste';
  }
  return 'liberado-legado';
}

function blockedCommercialState(state) {
  return state === 'bloqueado' || state === 'teste-expirado';
}

async function assertCommercialAccess(env, groupId, now = new Date()) {
  if (groupId === 'CLI-4071') return 'isento';
  const config = await readCommercialState(env, groupId, now);
  const state = commercialState(config || {}, now.getTime());
  if (blockedCommercialState(state)) {
    const error = new Error(state === 'teste-expirado' ? 'O período de teste deste grupo terminou.' : 'Este grupo está temporariamente bloqueado.');
    error.status = 403;
    throw error;
  }
  return state;
}

function roleDefaults(papel) {
  if (papel !== 'adm_convidado') return {};
  return {
    tarefasGerenciar: true,
    recompensasGerenciar: true,
    resgatesDecidir: true,
    monitorLer: true,
    relatoriosLer: true,
    participantesGerenciar: false
  };
}

async function saveRole(env, { uid, papel, grupoId = '', perfilId = '', now = new Date() }) {
  const current = await getDocument(env, 'authRoles', uid, now).catch(() => null);
  const permissions = current?.data?.permissoes && typeof current.data.permissoes === 'object'
    ? current.data.permissoes
    : roleDefaults(papel);
  await upsertDocument(env, 'authRoles', uid, {
    uid,
    papel,
    grupoId,
    perfilId,
    ativo: true,
    permissoes: permissions,
    atualizadoEm: now.toISOString()
  }, now);
}

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function requestKey(request, groupId, name) {
  const ip = String(request.headers.get('cf-connecting-ip') || 'ip').slice(0, 64);
  return `${ip}|${groupId}|${normalizeName(name).toLowerCase()}`;
}

function assertNotRateLimited(key) {
  const now = Date.now();
  const current = failures.get(key);
  if (!current || current.expiresAt <= now) {
    failures.delete(key);
    return;
  }
  if (current.count >= 8) {
    const error = new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    error.status = 429;
    throw error;
  }
}

function registerFailure(key) {
  const now = Date.now();
  const current = failures.get(key);
  const next = !current || current.expiresAt <= now ? { count: 1, expiresAt: now + 10 * 60_000 } : { ...current, count: current.count + 1 };
  failures.set(key, next);
}

function clearFailures(key) { failures.delete(key); }

async function participantSession(request, env, now = new Date()) {
  const body = await request.json().catch(() => ({}));
  const groupId = normalizeGroup(body.grupoId);
  const name = normalizeName(body.nome);
  const pin = String(body.pin || '').trim();
  if (!/^[A-Z0-9-]{3,40}$/.test(groupId) || !name || !/^\d{4,6}$/.test(pin)) {
    const error = new Error('Dados de acesso inválidos.'); error.status = 400; throw error;
  }
  const key = requestKey(request, groupId, name);
  assertNotRateLimited(key);
  const profiles = await queryString(env, 'perfis', 'grupoId', groupId, now, 100);
  const profile = profiles.find(item => normalizeName(item.data.nome).toLowerCase() === name.toLowerCase());
  if (!profile) {
    registerFailure(key);
    await new Promise(resolve => setTimeout(resolve, 350));
    const error = new Error('Nome, grupo ou PIN não conferem.'); error.status = 401; throw error;
  }
  const expectedHash = String(profile.data.pinHash || '').trim().toLowerCase();
  const legacyPin = String(profile.data.pin || '').trim();
  const valid = expectedHash ? (await sha256Hex(pin)) === expectedHash : legacyPin && legacyPin === pin;
  if (!valid) {
    registerFailure(key);
    await new Promise(resolve => setTimeout(resolve, 350));
    const error = new Error('Nome, grupo ou PIN não conferem.'); error.status = 401; throw error;
  }
  clearFailures(key);
  const state = await assertCommercialAccess(env, groupId, now);
  const perfilId = String(profile.data.perfilId || docId(profile.name));
  const uid = `rfp_${perfilId}`.slice(0, 128);
  await saveRole(env, { uid, papel: 'participante', grupoId, perfilId, now });
  return {
    success: true,
    token: await customToken(env, uid, { papel: 'participante', grupoId, perfilId }, now),
    papel: 'participante',
    grupoId,
    perfilId,
    nome: String(profile.data.nome || name),
    sexo: String(profile.data.sexo || 'Feminino'),
  };
}

async function adminRecord(env, identity, now = new Date()) {
  const byUid = await queryString(env, 'administradores', 'uid', identity.uid, now, 5);
  if (byUid.length) return byUid[0];
  if (identity.email) {
    const byEmail = await queryString(env, 'administradores', 'email', normalizeEmail(identity.email), now, 5);
    if (byEmail.length) return byEmail[0];
  }
  return null;
}

function roleFromAdmin(data = {}) {
  return String(data.tipoAcesso || '').toLowerCase() === 'proprietario' ? 'adm_familia' : 'adm_convidado';
}

async function adminSession(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (isMasterEmail(env, identity.email)) {
    await saveRole(env, { uid: identity.uid, papel: 'master', now });
    return { success: true, token: await customToken(env, identity.uid, { papel: 'master' }, now), papel: 'master', grupoId: '' };
  }
  const record = await adminRecord(env, identity, now);
  if (!record) { const error = new Error('Cadastro administrativo não encontrado.'); error.status = 403; throw error; }
  const grupoId = normalizeGroup(record.data.codigoCliente || record.data.grupoId);
  const papel = roleFromAdmin(record.data);
  await saveRole(env, { uid: identity.uid, papel, grupoId, now });
  return { success: true, token: await customToken(env, identity.uid, { papel, grupoId }, now), papel, grupoId };
}

async function uniqueCode(env, field, prefix, now = new Date()) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await queryString(env, 'administradores', field, value, now, 1)).length) return value;
  }
  throw new Error('Não foi possível gerar um código único agora.');
}

async function registerAdmin(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  const email = normalizeEmail(identity.email);
  if (!email) throw new Error('A conta autenticada não possui e-mail.');
  if (await adminRecord(env, identity, now)) { const error = new Error('Este administrador já está cadastrado.'); error.status = 409; throw error; }
  const body = await request.json().catch(() => ({}));
  const invite = normalizeGroup(body.codigoConvite);
  let codigoAdmin, codigoCliente, grupoId, tipoAcesso;
  if (invite) {
    const invitedBy = (await queryString(env, 'administradores', 'codigoAdmin', invite, now, 20))
      .find(item => String(item.data.tipoAcesso || '').toLowerCase() === 'proprietario') ||
      (await queryString(env, 'administradores', 'codigoAdmin', invite, now, 20))[0];
    if (!invitedBy) { const error = new Error('Código de convite não encontrado.'); error.status = 404; throw error; }
    codigoAdmin = String(invitedBy.data.codigoAdmin || invite);
    codigoCliente = normalizeGroup(invitedBy.data.codigoCliente || invitedBy.data.grupoId);
    grupoId = codigoCliente;
    tipoAcesso = 'admin';
  } else {
    codigoAdmin = await uniqueCode(env, 'codigoAdmin', 'ADM', now);
    codigoCliente = await uniqueCode(env, 'codigoCliente', 'CLI', now);
    grupoId = codigoCliente;
    tipoAcesso = 'proprietario';
  }
  const data = {
    email,
    uid: identity.uid,
    codigoAdmin,
    codigoCliente,
    grupoId,
    authVersion: 3,
    tipoAcesso,
    criadoEm: now.toISOString()
  };
  await createDocument(env, 'administradores', `adm_${identity.uid}`, data, now);
  const papel = roleFromAdmin(data);
  await saveRole(env, { uid: identity.uid, papel, grupoId, now });
  return {
    success: true,
    token: await customToken(env, identity.uid, { papel, grupoId }, now),
    papel,
    grupoId,
    codigoAdmin,
    codigoCliente
  };
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

export async function handleFamilyAuthSession(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/family-session/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: cors(request) });
  try {
    let body;
    if (url.pathname.endsWith('/participant')) body = await participantSession(request, env);
    else if (url.pathname.endsWith('/admin')) body = await adminSession(request, env);
    else if (url.pathname.endsWith('/admin-register')) body = await registerAdmin(request, env);
    else return Response.json({ error: 'Rota de sessão não encontrada.' }, { status: 404, headers: cors(request) });
    return Response.json(body, { status: 200, headers: cors(request) });
  } catch (error) {
    const message = String(error?.message || error || 'Falha de autenticação.').replace(/\s+/g, ' ').slice(0, 240);
    const status = Number(error?.status || 0) || (/Token|sessão/i.test(message) ? 401 : 400);
    return Response.json({ error: message }, { status, headers: cors(request) });
  }
}
