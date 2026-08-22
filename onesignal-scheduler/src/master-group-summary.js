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

function firestoreError(body, httpStatus) {
  const error = body?.error || (Array.isArray(body) ? body.find(item => item?.error)?.error : null) || {};
  const status = String(error.status || '').trim();
  const message = String(error.message || '').replace(/\s+/g, ' ').trim();
  return `${status || `HTTP_${httpStatus}`}${message ? ` — ${message.slice(0, 220)}` : ''}`;
}

async function fetchRetry(url, options = {}, attempts = 2) {
  let response;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    response = await fetch(url, options);
    if (response.status !== 429 || attempt === attempts) break;
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 1000));
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
  if (!response.ok) throw new Error(`${collectionId}:${field} recusado (${response.status}): ${firestoreError(rows, response.status)}`);

  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.document) continue;
    try {
      result.push({
        id: String(row.document.name || '').split('/').at(-1) || '',
        data: firestoreFieldsToJs(row.document.fields || {}) || {}
      });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'master_group_document_parse_skipped', collectionId, field, reason: String(error?.message || error).slice(0, 180) }));
    }
  }
  return result;
}

// Somente para diagnóstico em preview: leituras sem mutação.
export async function loadHistoryByGroupForPreview(env, groupIdInput, now = new Date()) {
  const groupId = String(groupIdInput || '').trim().toUpperCase();
  if (!groupId) throw new Error('grupoId ausente');
  return queryByString(env, 'historico', 'grupoId', groupId, 300, now);
}

export async function loadHistoryByTaskNameForPreview(env, taskNameInput, now = new Date()) {
  const taskName = String(taskNameInput || '').trim();
  if (!taskName) throw new Error('nome da tarefa ausente');
  return queryByString(env, 'historico', 'nomeTarefa', taskName, 500, now);
}

export async function loadTasksByNameForPreview(env, taskNameInput, now = new Date()) {
  const taskName = String(taskNameInput || '').trim();
  if (!taskName) throw new Error('nome da tarefa ausente');
  return queryByString(env, 'tarefas', 'nome', taskName, 500, now);
}

async function groupAdmins(env, groupId, now = new Date()) {
  const byCode = await queryByString(env, 'administradores', 'codigoCliente', groupId, 50, now);
  if (byCode.length) return byCode;
  return queryByString(env, 'administradores', 'grupoId', groupId, 50, now);
}

async function groupProfiles(env, groupId, now = new Date()) {
  const byGroup = await queryByString(env, 'perfis', 'grupoId', groupId, 100, now);
  if (byGroup.length) return byGroup;
  return queryByString(env, 'perfis', 'codigoCliente', groupId, 100, now);
}

async function groupConfig(env, groupId, now = new Date()) {
  const response = await fetchRetry(`${firestoreBase(env)}/configGrupos/${encodeURIComponent(groupId)}`, {
    headers: { authorization: `Bearer ${await googleToken(env, now)}` }
  });
  if (response.status === 404) return {};
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`configGrupos recusado (${response.status}): ${firestoreError(body, response.status)}`);
  return firestoreFieldsToJs(body.fields || {}) || {};
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

function safeData(item) {
  return item?.data && typeof item.data === 'object' ? item.data : {};
}

function normalizeAdmins(admins, env) {
  const result = [];
  for (const item of Array.isArray(admins) ? admins : []) {
    try {
      const data = safeData(item);
      const email = String(data.email || '').trim().toLowerCase();
      result.push({
        id: String(item?.id || ''),
        uid: String(data.uid || ''),
        email,
        tipoAcesso: String(data.tipoAcesso || 'admin'),
        principal: String(data.tipoAcesso || '').trim().toLowerCase() === 'proprietario',
        master: isMasterEmail(env, email)
      });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'master_group_admin_normalize_skipped', reason: String(error?.message || error).slice(0, 180) }));
    }
  }
  return result;
}

function normalizeProfiles(profiles) {
  const result = [];
  for (const item of Array.isArray(profiles) ? profiles : []) {
    try {
      const data = safeData(item);
      result.push({
        id: String(item?.id || ''),
        perfilId: String(data.perfilId || item?.id || ''),
        nome: String(data.nome || data.apelido || 'Integrante')
      });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'master_group_profile_normalize_skipped', reason: String(error?.message || error).slice(0, 180) }));
    }
  }
  return result;
}

async function safeRead(label, operation, fallback, avisos) {
  try {
    return await operation();
  } catch (error) {
    const message = String(error?.message || error).slice(0, 320);
    avisos.push(`${label}: ${message}`);
    console.warn(JSON.stringify({ event: 'master_group_partial_read', stage: label, reason: message }));
    return fallback;
  }
}

export async function loadMasterGroupSummaryData(env, groupIdInput, ownerHintInput = '', now = new Date()) {
  const groupId = String(groupIdInput || '').trim().toUpperCase();
  const ownerHint = String(ownerHintInput || '').trim().toLowerCase();
  if (!groupId) throw new Error('Informe o código do grupo.');

  const avisos = [];
  const admins = await safeRead('Administradores', () => groupAdmins(env, groupId, now), [], avisos);
  const profiles = await safeRead('Integrantes', () => groupProfiles(env, groupId, now), [], avisos);
  const config = await safeRead('Estado comercial', () => groupConfig(env, groupId, now), {}, avisos);

  const normalizedAdmins = normalizeAdmins(admins, env);
  const clientes = normalizeProfiles(profiles);
  const owner = normalizedAdmins.find(a => a.principal && !a.master)
    || (ownerHint ? { uid: '', email: ownerHint } : null)
    || normalizedAdmins.find(a => !a.master)
    || null;

  const grupo = {
    grupoId: groupId,
    grupoBloqueado: config?.grupoBloqueado === true,
    statusComercialDisponivel: !avisos.some(item => item.startsWith('Estado comercial:')),
    administradorPrincipal: owner ? { uid: owner.uid || '', email: owner.email || '' } : null,
    administradores: normalizedAdmins,
    clientes,
    parcial: avisos.length > 0,
    avisos
  };

  console.log(JSON.stringify({
    event: 'master_group_summary_loaded',
    grupoId: groupId,
    administradores: normalizedAdmins.length,
    integrantes: clientes.length,
    parcial: grupo.parcial
  }));
  return grupo;
}

export async function handleMasterGroupSummary(request, env, now = new Date()) {
  const url = new URL(request.url);
  const groupId = String(url.searchParams.get('grupoId') || '').trim().toUpperCase();
  const ownerHint = String(url.searchParams.get('ownerEmail') || '').trim().toLowerCase();
  if (!groupId) return Response.json({ error: 'Informe o código do grupo.' }, { status: 400, headers: cors(request) });

  try {
    const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
    if (!isMasterEmail(env, identity.email)) {
      return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
    }
    const grupo = await loadMasterGroupSummaryData(env, groupId, ownerHint, now);
    return Response.json({ grupo }, { status: 200, headers: cors(request) });
  } catch (error) {
    const message = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 320);
    console.error(JSON.stringify({ event: 'master_group_summary_failure', grupoId: groupId, reason: message }));
    return Response.json({
      grupo: {
        grupoId: groupId,
        grupoBloqueado: false,
        statusComercialDisponivel: false,
        administradorPrincipal: ownerHint ? { uid: '', email: ownerHint } : null,
        administradores: [],
        clientes: [],
        parcial: true,
        avisos: [`Detalhe do grupo indisponível: ${message}`]
      },
      diagnostico: { etapa: 'autenticacao-ou-detalhe', motivo: message }
    }, { status: 200, headers: cors(request) });
  }
}
