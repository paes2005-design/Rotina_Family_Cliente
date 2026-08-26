import { firestoreFieldsToJs, jsToFirestoreFields, localDateTimeToEpoch, zonedParts } from './core.js';
import { verifyFirebaseIdToken } from './index.js';

const ACTIVE_DATE = '2026-08-26';
const TIME_ZONE = 'America/Bahia';
const PATH = '/emergency/compensate-2026-08-26';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';
let tokenCache = { value: '', expiresAt: 0, email: '' };

const clean = value => String(value || '').trim();
const pad = value => String(value).padStart(2, '0');
const documentId = name => clean(name).split('/').at(-1) || '';
const isFinal = status => /Prazo|Atrasado/i.test(clean(status));

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

async function firestoreRequest(env, url, options = {}, now = new Date()) {
  return fetch(url, {
    ...options,
    headers: { authorization: `Bearer ${await googleToken(env, now)}`, ...(options.headers || {}) }
  });
}

async function queryProfileTasks(env, perfilId, now = new Date()) {
  const response = await firestoreRequest(env, `${firestoreBase(env)}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'tarefas' }],
      where: { fieldFilter: { field: { fieldPath: 'perfilId' }, op: 'EQUAL', value: { stringValue: perfilId } } },
      limit: 200
    } })
  }, now);
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Consulta de tarefas recusada (${response.status}).`);
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => ({
    name: row.document.name,
    data: firestoreFieldsToJs(row.document.fields || {}) || {}
  }));
}

async function upsert(env, collectionId, id, data, now = new Date()) {
  const url = new URL(`${firestoreBase(env)}/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}`);
  for (const field of Object.keys(data)) url.searchParams.append('updateMask.fieldPaths', field);
  const response = await firestoreRequest(env, url.toString(), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: jsToFirestoreFields(data) })
  }, now);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gravação ${collectionId} recusada (${response.status}): ${body.slice(0, 180)}`);
  }
}

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function localDate(now) {
  const p = zonedParts(now, TIME_ZONE);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function localDayName(now) {
  const p = zonedParts(now, TIME_ZONE);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][day];
}

function hmMinutes(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localIso(date, hm, seconds = 0) {
  const match = clean(hm).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const local = `${date}T${pad(match[1])}:${pad(match[2])}:${pad(seconds)}`;
  const epoch = localDateTimeToEpoch(local, TIME_ZONE);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : '';
}

function compensationRecord(task, { groupId, perfilId, taskId, now }) {
  const start = clean(task.horaSugeridaInicio);
  const end = clean(task.horaSugeridaFim);
  const points = Number(task.pontosMaximos) || 0;
  const startedAt = localIso(ACTIVE_DATE, start, 0);
  const finishedAt = localIso(ACTIVE_DATE, end, 59);
  return {
    grupoId: groupId,
    perfilId,
    perfilNome: clean(task.perfilNome),
    tarefaId: taskId,
    tarefaGrupoId: clean(task.tarefaGrupoId),
    nomeTarefa: clean(task.nome),
    diaSemana: clean(task.diaSemana),
    data: ACTIVE_DATE,
    dataExecucao: ACTIVE_DATE,
    horaSugeridaInicio: start,
    horaSugeridaFim: end,
    horarioInicio: start,
    horarioTermino: end,
    inicioExecutadoEm: startedAt,
    terminoExecutadoEm: finishedAt,
    tempoLimite: Number(task.tempoLimite) || 0,
    pontosMaximos: points,
    pontosGanhos: points,
    pontosOriginais: points,
    percentualAplicado: 100,
    percentualOriginal: 100,
    faixaAtraso: 'dentro-limites',
    status: 'No Prazo (100%)',
    toleranciaConsumidaMin: 0,
    toleranciaConsumidaSeg: 0,
    atrasoInicioMin: 0,
    atrasoFimMin: 0,
    iniciouComAtraso: false,
    iniciouAposLimiteFinal: false,
    inicioAntecipado: false,
    justificativaAtraso: '',
    revisaoStatus: 'sem-revisao',
    justificativaRecusada: false,
    compensacaoTecnica: true,
    compensacaoTecnicaMotivo: 'indisponibilidade_app_2026-08-26',
    compensacaoTecnicaEm: now.toISOString(),
    compensacaoTecnicaVersao: 1
  };
}

async function compensate(request, env, now = new Date()) {
  const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
  const papel = clean(identity.claims?.papel);
  const groupId = clean(identity.claims?.grupoId).toUpperCase();
  const perfilId = clean(identity.claims?.perfilId);
  if (papel !== 'participante' || !groupId || !perfilId) {
    const error = new Error('Sessão de participante não autorizada.');
    error.status = 403;
    throw error;
  }
  if (localDate(now) !== ACTIVE_DATE) {
    return { success: true, active: false, compensated: 0, date: ACTIVE_DATE };
  }
  const current = zonedParts(now, TIME_ZONE);
  const nowMinute = current.hour * 60 + current.minute;
  const dayName = localDayName(now);
  const tasks = await queryProfileTasks(env, perfilId, now);
  const eligible = tasks.filter(item => {
    const task = item.data || {};
    if (clean(task.grupoId).toUpperCase() !== groupId) return false;
    if (clean(task.diaSemana) !== dayName) return false;
    if (isFinal(task.status)) return false;
    if (!['Pendente', 'Em andamento', ''].includes(clean(task.status))) return false;
    const startMinute = hmMinutes(task.horaSugeridaInicio);
    let endMinute = hmMinutes(task.horaSugeridaFim);
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) return false;
    if (endMinute <= startMinute) endMinute += 1440;
    return nowMinute > endMinute;
  });

  const results = [];
  for (const item of eligible) {
    const taskId = documentId(item.name);
    const record = compensationRecord(item.data, { groupId, perfilId, taskId, now });
    await upsert(env, 'tarefas', taskId, record, now);
    await upsert(env, 'historico', `${perfilId}_${taskId}_${ACTIVE_DATE}`, record, now);
    await upsert(env, 'execucoes', `${ACTIVE_DATE}__${taskId}`, record, now);
    results.push({ taskId, status: record.status, points: record.pontosGanhos });
  }

  return {
    success: true,
    active: true,
    date: ACTIVE_DATE,
    compensated: results.length,
    results
  };
}

export async function handleEmergencyCompensation(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith(PATH)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: cors(request) });
  try {
    return Response.json(await compensate(request, env), { headers: cors(request) });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: Number(error?.status) || 500, headers: cors(request) });
  }
}
