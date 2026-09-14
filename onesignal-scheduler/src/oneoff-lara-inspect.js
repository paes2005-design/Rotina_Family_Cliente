import { firestoreFieldsToJs } from './core.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GROUP_ID = 'CLI-4071';
const TARGET_NAME = 'lara';
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

function credentials(env) {
  const value = JSON.parse(required(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'GOOGLE_SERVICE_ACCOUNT_JSON'));
  required(value.client_email, 'client_email');
  required(value.private_key, 'private_key');
  return value;
}

async function googleToken(env, now = new Date()) {
  const c = credentials(env);
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

async function runQuery(env, collectionId, field, value, limit = 500) {
  const response = await fetch(`${firestoreBase(env)}:runQuery`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await googleToken(env)}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: String(value) } } },
        limit
      }
    })
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Consulta ${collectionId}:${field} recusada (${response.status}).`);
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => ({
    id: String(row.document.name || '').split('/').at(-1) || '',
    data: firestoreFieldsToJs(row.document.fields || {}) || {}
  }));
}

function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

async function inspect(env) {
  let profiles = await runQuery(env, 'perfis', 'grupoId', GROUP_ID, 100);
  if (!profiles.length) profiles = await runQuery(env, 'perfis', 'codigoCliente', GROUP_ID, 100);
  const laraCandidates = profiles.filter(item => norm(item.data?.nome) === TARGET_NAME);
  if (laraCandidates.length !== 1) {
    return {
      ok: false,
      groupId: GROUP_ID,
      reason: laraCandidates.length ? 'mais-de-uma-lara' : 'lara-nao-encontrada',
      profiles: profiles.map(item => ({ id: item.id, nome: item.data?.nome || '', perfilId: item.data?.perfilId || item.id }))
    };
  }

  const lara = laraCandidates[0];
  const tasks = await runQuery(env, 'tarefas', 'grupoId', GROUP_ID, 500);
  const laraTasks = tasks.filter(item => {
    const d = item.data || {};
    return String(d.perfilId || '') === String(lara.data?.perfilId || lara.id) || norm(d.perfilNome) === TARGET_NAME;
  }).map(item => ({
    id: item.id,
    nome: item.data?.nome || '',
    diaSemana: item.data?.diaSemana || '',
    horaInicio: item.data?.horaSugeridaInicio || '',
    horaFim: item.data?.horaSugeridaFim || '',
    perfilId: item.data?.perfilId || '',
    perfilNome: item.data?.perfilNome || '',
    status: item.data?.status || '',
    pontosMaximos: Number(item.data?.pontosMaximos || 0),
    tolerancia: Number(item.data?.tempoLimite || 0),
    tarefaGrupoId: item.data?.tarefaGrupoId || ''
  })).sort((a, b) => `${a.diaSemana}|${a.horaInicio}`.localeCompare(`${b.diaSemana}|${b.horaInicio}`));

  return {
    ok: true,
    groupId: GROUP_ID,
    lara: {
      documentId: lara.id,
      perfilId: lara.data?.perfilId || lara.id,
      nome: lara.data?.nome || '',
      sexo: lara.data?.sexo || ''
    },
    tasks: laraTasks
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/__oneoff/inspect-lara-4071') return new Response('not found', { status: 404 });
    try {
      const result = await inspect(env);
      return Response.json(result, { status: result.ok ? 200 : 409, headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return Response.json({ ok: false, error: String(error?.message || error).slice(0, 400) }, { status: 500, headers: { 'cache-control': 'no-store' } });
    }
  }
};
