import worker, { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { firestoreFieldsToJs, jsToFirestoreFields } from './core.js';
import {
  adminIndividualBlockPatch,
  commercialState,
  confirmFamilyPatch,
  familyBlockPatch,
  profileBlockPatch
} from './commercial-policy.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const SCOPES = ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/identitytoolkit'].join(' ');
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

async function googleToken(env, now = new Date()) {
  const c = credentials(env);
  if (tokenCache.value && tokenCache.email === c.client_email && tokenCache.expiresAt > now.getTime() + 60_000) {
    return tokenCache.value;
  }
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: c.client_email,
    sub: c.client_email,
    scope: SCOPES,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(c.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`OAuth Google recusado (${response.status}).`);
  tokenCache = {
    value: body.access_token,
    email: c.client_email,
    expiresAt: now.getTime() + Number(body.expires_in || 3600) * 1000
  };
  return tokenCache.value;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(required(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID'))}/databases/(default)/documents`;
}

async function fetchWith429Retry(url, options = {}, attempts = 4) {
  let response = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    response = await fetch(url, options);
    if (response.status !== 429 || attempt === attempts) break;
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : attempt * 800));
  }
  return response;
}

async function listDocs(env, collectionId, now = new Date()) {
  const token = await googleToken(env, now);
  const response = await fetchWith429Retry(`${firestoreBase(env)}/${encodeURIComponent(collectionId)}?pageSize=200`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Listagem Firestore recusada (${response.status}).`);
  return (body.documents || []).map(document => ({
    name: document.name,
    createTime: document.createTime || '',
    data: firestoreFieldsToJs(document.fields || {})
  }));
}

async function queryString(env, collectionId, field, value, now = new Date(), limit = 200) {
  const token = await googleToken(env, now);
  const response = await fetchWith429Retry(`${firestoreBase(env)}:runQuery`, {
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
    createTime: row.document.createTime || '',
    data: firestoreFieldsToJs(row.document.fields || {})
  }));
}

async function getDoc(env, name, now = new Date()) {
  const response = await fetchWith429Retry(`https://firestore.googleapis.com/v1/${name}`, {
    headers: { authorization: `Bearer ${await googleToken(env, now)}` }
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Leitura Firestore recusada (${response.status}).`);
  return { name: body.name, data: firestoreFieldsToJs(body.fields || {}) };
}

async function patchDoc(env, name, patch, now = new Date()) {
  const url = new URL(`https://firestore.googleapis.com/v1/${name}`);
  for (const key of Object.keys(patch)) url.searchParams.append('updateMask.fieldPaths', key);
  const response = await fetchWith429Retry(url, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, fields: jsToFirestoreFields(patch) })
  });
  if (!response.ok) throw new Error(`Atualização Firestore recusada (${response.status}).`);
}

async function createDoc(env, collectionId, id, data, now = new Date()) {
  const url = new URL(`${firestoreBase(env)}/${encodeURIComponent(collectionId)}`);
  url.searchParams.set('documentId', id);
  const response = await fetchWith429Retry(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: jsToFirestoreFields(data) })
  });
  if (!response.ok && response.status !== 409) throw new Error(`Criação Firestore recusada (${response.status}).`);
}

async function deleteDoc(env, name, now = new Date()) {
  const response = await fetchWith429Retry(`https://firestore.googleapis.com/v1/${name}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${await googleToken(env, now)}` }
  });
  if (!response.ok && response.status !== 404) throw new Error(`Exclusão Firestore recusada (${response.status}).`);
}

async function upsertConfig(env, groupId, patch, now = new Date()) {
  const name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`;
  const current = await getDoc(env, name, now);
  if (current) await patchDoc(env, name, { grupoId: groupId, ...patch }, now);
  else await createDoc(env, 'configGrupos', groupId, { grupoId: groupId, ...patch }, now);
}

async function authAdmin(env, path, body, now = new Date()) {
  const response = await fetch(`${IDENTITY_TOOLKIT_URL}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const output = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Firebase Authentication recusou a operação: ${output.error?.message || response.status}`);
  return output;
}

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

async function requireMasterSafe(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (!isMasterEmail(env, identity.email)) throw new Error('Acesso exclusivo do ADM Master.');
  return identity;
}

async function adminByUid(env, uid, now = new Date()) {
  return (await queryString(env, 'administradores', 'uid', uid, now, 2))[0] || null;
}

async function requireOrdinaryAdmin(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  if (isMasterEmail(env, identity.email)) return { ...identity, master: true, administrator: null };
  const administrator = await adminByUid(env, identity.uid, now);
  if (!administrator) throw new Error('Cadastro administrativo não encontrado.');
  return { ...identity, master: false, administrator };
}

function groupIdOf(data = {}) {
  return String(data.codigoCliente || data.grupoId || '').trim();
}

async function authMap(env, admins, now = new Date()) {
  const ids = admins.map(admin => String(admin.data.uid || '')).filter(Boolean);
  if (!ids.length) return new Map();
  const users = (await authAdmin(env, '/accounts:lookup', { localId: ids }, now)).users || [];
  return new Map(users.map(user => [user.localId, user]));
}

async function buildTree(env, now = new Date()) {
  const [admins, profiles, configs] = await Promise.all([
    listDocs(env, 'administradores', now),
    listDocs(env, 'perfis', now),
    listDocs(env, 'configGrupos', now)
  ]);
  const authentication = await authMap(env, admins, now).catch(() => new Map());
  const configMap = new Map(configs.map(config => [String(config.data.grupoId || config.name.split('/').at(-1) || ''), config.data]));
  const groups = new Map();
  const ensure = id => {
    const groupId = String(id || '').trim();
    if (!groupId) return null;
    if (!groups.has(groupId)) groups.set(groupId, { grupoId: groupId, administradores: [], clientes: [] });
    return groups.get(groupId);
  };

  for (const admin of admins) {
    const group = ensure(groupIdOf(admin.data));
    if (!group) continue;
    const uid = String(admin.data.uid || '');
    const authUser = authentication.get(uid) || {};
    const email = String(authUser.email || admin.data.email || '').trim().toLowerCase();
    const principal = String(admin.data.tipoAcesso || '') === 'proprietario';
    group.administradores.push({
      id: admin.name.split('/').at(-1) || '',
      uid,
      email,
      tipoAcesso: String(admin.data.tipoAcesso || 'admin'),
      principal,
      master: isMasterEmail(env, email),
      loginDesativado: authUser.disabled === true,
      bloqueadoComercialIndividual: admin.data.bloqueadoComercialIndividual === true
    });
  }

  for (const profile of profiles) {
    const group = ensure(profile.data.grupoId);
    if (!group) continue;
    group.clientes.push({
      id: profile.name.split('/').at(-1) || '',
      perfilId: String(profile.data.perfilId || profile.name.split('/').at(-1) || ''),
      nome: String(profile.data.nome || 'Integrante'),
      sexo: String(profile.data.sexo || ''),
      desativado: profile.data.desativadoMaster === true
    });
  }

  return [...groups.values()].map(group => {
    const config = configMap.get(group.grupoId) || {};
    return {
      ...group,
      estado: commercialState(config, now.getTime()),
      grupoBloqueado: config.grupoBloqueado === true,
      grupoConfirmado: config.grupoConfirmado === true,
      trialAtivo: config.trialAtivo === true,
      trialInicioEm: config.trialInicioEm || '',
      trialFimEm: config.trialFimEm || '',
      contemMasterLegado: group.administradores.some(admin => admin.master)
    };
  }).sort((a, b) => a.grupoId.localeCompare(b.grupoId));
}

async function registerTrial(request, env, now = new Date()) {
  const caller = await requireOrdinaryAdmin(request, env, now);
  if (caller.master) return { success: true, estado: 'master', grupoId: '' };
  if (String(caller.administrator.data.tipoAcesso || '') !== 'proprietario') {
    throw new Error('Somente o administrador principal inicia o teste.');
  }
  const groupId = groupIdOf(caller.administrator.data);
  if (!groupId) throw new Error('Grupo não encontrado.');
  const name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/configGrupos/${groupId}`;
  const current = await getDoc(env, name, now);
  if (current?.data?.grupoConfirmado === true || current?.data?.trialAtivo === true) {
    return { success: true, grupoId, estado: commercialState(current.data, now.getTime()) };
  }
  const end = new Date(now.getTime() + 15 * 86400000);
  await upsertConfig(env, groupId, {
    trialAtivo: true,
    trialDias: 15,
    trialInicioEm: now.toISOString(),
    trialFimEm: end.toISOString(),
    grupoConfirmado: false,
    grupoBloqueado: false
  }, now);
  return { success: true, grupoId, estado: 'teste', trialFimEm: end.toISOString() };
}

async function handleMasterCommercial(request, env, now = new Date()) {
  const caller = await requireMasterSafe(request, env, now);
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname.endsWith('/tree')) {
    return Response.json({ groups: await buildTree(env, now) }, { headers: cors(request) });
  }

  const body = await request.json().catch(() => ({}));

  if (request.method === 'POST' && url.pathname.endsWith('/groups')) {
    const groupId = String(body.grupoId || '').trim();
    if (!groupId) throw new Error('Grupo não informado.');
    if (body.action === 'set-group-blocked') {
      // REGRA DE SEGURANÇA: apenas configGrupos. Nenhuma conta Auth é alterada.
      await upsertConfig(env, groupId, familyBlockPatch(body.disabled === true, now.toISOString()), now);
    } else if (body.action === 'confirm-group') {
      await upsertConfig(env, groupId, { ...confirmFamilyPatch(now.toISOString()), confirmadoPorMaster: caller.uid }, now);
    } else {
      throw new Error('Ação de grupo inválida.');
    }
    return Response.json({ success: true, grupoId }, { headers: cors(request) });
  }

  if (request.method === 'POST' && url.pathname.endsWith('/admin-access')) {
    const targetUid = String(body.targetUid || '').trim();
    const target = targetUid ? await adminByUid(env, targetUid, now) : null;
    if (!target) return Response.json({ error: 'Administrador não encontrado.' }, { status: 404, headers: cors(request) });
    const authUser = (await authAdmin(env, '/accounts:lookup', { localId: [targetUid] }, now)).users?.[0] || {};
    const email = String(authUser.email || target.data.email || '').trim().toLowerCase();
    if (isMasterEmail(env, email) || targetUid === caller.uid) {
      return Response.json({ error: 'O login Master não participa do bloqueio comercial.' }, { status: 409, headers: cors(request) });
    }
    if (String(target.data.tipoAcesso || '') === 'proprietario') {
      return Response.json({ error: 'O administrador principal deve ser controlado pelo bloqueio da família.' }, { status: 409, headers: cors(request) });
    }
    if (body.action !== 'set-admin-commercial-block') throw new Error('Ação administrativa comercial inválida.');
    await patchDoc(env, target.name, adminIndividualBlockPatch(body.disabled === true, now.toISOString()), now);
    return Response.json({ success: true }, { headers: cors(request) });
  }

  if (request.method === 'POST' && url.pathname.endsWith('/profiles')) {
    const id = String(body.profileId || '').trim();
    const name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/perfis/${id}`;
    const profile = id ? await getDoc(env, name, now) : null;
    if (!profile) return Response.json({ error: 'Cliente não encontrado.' }, { status: 404, headers: cors(request) });
    if (body.action === 'set-profile-disabled') {
      await patchDoc(env, name, profileBlockPatch(body.disabled === true, now.toISOString()), now);
    } else if (body.action === 'delete-profile') {
      await deleteDoc(env, name, now);
    } else {
      throw new Error('Ação de cliente inválida.');
    }
    return Response.json({ success: true }, { headers: cors(request) });
  }

  return Response.json({ error: 'Operação não encontrada.' }, { status: 404, headers: cors(request) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/admin-master/') || url.pathname.startsWith('/commercial/'))) {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    try {
      if (url.pathname === '/commercial/trial' && request.method === 'POST') {
        return Response.json(await registerTrial(request, env), { headers: cors(request) });
      }
      if (
        url.pathname === '/admin-master/tree' ||
        url.pathname === '/admin-master/groups' ||
        url.pathname === '/admin-master/admin-access' ||
        url.pathname === '/admin-master/profiles'
      ) {
        return await handleMasterCommercial(request, env);
      }
    } catch (error) {
      const status = /Acesso exclusivo/.test(String(error?.message || '')) ? 403 : 400;
      return Response.json({ error: String(error?.message || error).slice(0, 220) }, { status, headers: cors(request) });
    }
    return worker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    // O comercial não faz varredura de grupos nem desativa Auth em cron.
    // Trial expirado é calculado pela data em configGrupos no momento da validação.
    return worker.scheduled(controller, env, ctx);
  }
};
