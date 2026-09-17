import { appendTechnicalLogs } from './technical-store-do.js';

const ALLOWED_APP_ORIGIN = 'https://paes2005-design.github.io';
const FIRESTORE_STATUS_CODES = ['INVALID_ARGUMENT','FAILED_PRECONDITION','PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAUTHENTICATED','NOT_FOUND','ALREADY_EXISTS','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED'];

function firestoreStatus(text = '') {
  const upper = String(text || '').toUpperCase();
  return FIRESTORE_STATUS_CODES.find(code => upper.includes(code)) || '';
}

function failureHint(text = '') {
  const s = String(text || '').toLowerCase();
  if (/timestamp|rfc3339|date|time/.test(s)) return 'TIMESTAMP';
  if (/document.?id|document name|resource name/.test(s)) return 'DOCUMENT_ID';
  if (/field|property|unknown name/.test(s)) return 'FIELD';
  if (/payload|json|parse|invalid json/.test(s)) return 'PAYLOAD';
  if (/permission|insufficient|denied/.test(s)) return 'PERMISSION';
  if (/quota|resource exhausted|rate limit|too many/.test(s)) return 'QUOTA';
  if (/oauth|credential|token|authentic/.test(s)) return 'AUTH';
  return '';
}

function classifyFailure(status, text = '') {
  const s = String(text || '');
  let family = 'INTERNAL';
  if (/Configuração obrigatória ausente/i.test(s)) family = 'CONFIG';
  else if (/Criação Firestore recusada/i.test(s)) family = 'FIRESTORE_CREATE';
  else if (/OAuth Google recusado/i.test(s)) family = 'GOOGLE_OAUTH';
  else if (/Log sem grupo/i.test(s)) family = 'VALIDATION';
  else if (status >= 500) family = 'HTTP_5XX';
  else if (status >= 400) family = 'HTTP_4XX';
  const code = firestoreStatus(s);
  const hint = failureHint(s);
  return [family, status || 0, code, hint].filter(value => value !== '' && value !== undefined).join(':');
}

function cors(origin = '') {
  return {
    'access-control-allow-origin': origin || ALLOWED_APP_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

function deduplicate(events) {
  const unique = [];
  const signatures = new Set();
  for (const event of events) {
    const signature = JSON.stringify(event);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    unique.push(event);
  }
  return { unique, duplicates: events.length - unique.length };
}

async function firestoreFallback(request, env, ctx, baseApp, unique, origin) {
  let stored = 0;
  let dropped = 0;
  const dropReasons = {};
  for (const event of unique) {
    let ok = false;
    let lastStatus = 0;
    let lastText = '';
    for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
      const headers = new Headers({ 'content-type': 'application/json' });
      if (origin) headers.set('origin', origin);
      const subrequest = new Request(request.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: [event] })
      });
      try {
        const response = await baseApp.fetch(subrequest, env, ctx);
        lastStatus = response.status;
        const result = await response.clone().json().catch(() => ({}));
        lastText = String(result?.error || '');
        ok = response.ok && Number(result.accepted) === 1;
      } catch (error) {
        lastStatus = 0;
        lastText = String(error?.message || error || '');
      }
      if (!ok && attempt === 0) await new Promise(resolve => setTimeout(resolve, 120));
    }
    if (ok) stored += 1;
    else {
      dropped += 1;
      const reason = classifyFailure(lastStatus, lastText);
      dropReasons[reason] = (dropReasons[reason] || 0) + 1;
    }
  }
  return { stored, dropped, dropReasons, storage: 'firestore-fallback' };
}

export async function handleReliableAppLogV2(request, env, ctx, baseApp) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/app-log') return null;
  const origin = request.headers.get('origin') || '';
  if (origin && origin !== ALLOWED_APP_ORIGIN) return baseApp.fetch(request, env, ctx);

  const body = await request.clone().json().catch(() => ({}));
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 25);
  if (!events.length) return baseApp.fetch(request, env, ctx);
  const { unique, duplicates: inputDuplicates } = deduplicate(events);

  if (env?.TECHNICAL_STORE) {
    try {
      const result = await appendTechnicalLogs(env, unique);
      const stored = Number(result?.stored) || 0;
      const storeDuplicates = Number(result?.duplicates) || 0;
      const accounted = stored + storeDuplicates;
      const dropped = Math.max(0, unique.length - accounted);
      return Response.json({
        accepted: events.length,
        stored,
        duplicates: inputDuplicates + storeDuplicates,
        dropped,
        dropReasons: dropped ? { TECHNICAL_STORE_UNACCOUNTED: dropped } : {},
        pipelineVersion: 6,
        storage: 'cloudflare-do',
        storeVersion: Number(result?.storeVersion) || 1
      }, {
        status: dropped ? 503 : 200,
        headers: cors(origin)
      });
    } catch (error) {
      const reason = String(error?.message || error || 'TECHNICAL_STORE_ERROR').replace(/\s+/g, ' ').slice(0, 120);
      console.error(JSON.stringify({ event: 'technical_store_log_failure', reason }));
      return Response.json({
        accepted: events.length,
        stored: 0,
        duplicates: inputDuplicates,
        dropped: unique.length,
        dropReasons: { TECHNICAL_STORE_ERROR: unique.length },
        pipelineVersion: 6,
        storage: 'cloudflare-do'
      }, { status: 503, headers: cors(origin) });
    }
  }

  const fallback = await firestoreFallback(request, env, ctx, baseApp, unique, origin);
  if (fallback.dropped) {
    console.error(JSON.stringify({ event: 'app_log_partial_drop', received: events.length, ...fallback }));
  }
  return Response.json({
    accepted: events.length,
    stored: fallback.stored,
    duplicates: inputDuplicates,
    dropped: fallback.dropped,
    dropReasons: fallback.dropReasons,
    pipelineVersion: 6,
    storage: fallback.storage
  }, { status: fallback.dropped ? 503 : 200, headers: cors(origin) });
}
