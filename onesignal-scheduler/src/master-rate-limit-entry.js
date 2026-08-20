import app from './commercial-entry.js';
import { handleMasterUsersFallback } from './master-users-fallback.js';

// Protege o Firestore contra rajadas de leitura geradas pela inicialização do ADM Master.
// Session, usuários, árvore e logs podem ser solicitados quase ao mesmo tempo no mobile/PWA.
// A lista de usuários usa Firebase Authentication como fonte principal para não ficar
// indisponível quando o Firestore aplicar limite 429.
let masterReadQueue = Promise.resolve();
const responseCache = new Map();
const MIN_SPACING_MS = 1200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isMasterRead(request) {
  if (request.method !== 'GET') return false;
  const path = new URL(request.url).pathname;
  return [
    '/admin-master/session',
    '/admin-master/users',
    '/admin-master/tree',
    '/admin-master/logs'
  ].some(suffix => path.endsWith(suffix));
}

function isMasterUsersRead(request) {
  return request.method === 'GET' && new URL(request.url).pathname.endsWith('/admin-master/users');
}

function ttlFor(path) {
  if (path.endsWith('/session')) return 12_000;
  if (path.endsWith('/users')) return 30_000;
  if (path.endsWith('/tree')) return 10_000;
  if (path.endsWith('/logs')) return 15_000;
  return 0;
}

function cacheKey(request) {
  const url = new URL(request.url);
  // O sufixo do bearer diferencia sessões sem registrar/expor o token completo.
  const auth = String(request.headers.get('authorization') || '');
  const suffix = auth.slice(-18);
  return `${url.pathname}${url.search}|${suffix}`;
}

function cachedResponse(request) {
  const key = cacheKey(request);
  const item = responseCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return new Response(item.body, {
    status: item.status,
    headers: item.headers
  });
}

async function rememberResponse(request, response) {
  if (!response.ok) return response;
  const ttl = ttlFor(new URL(request.url).pathname);
  if (!ttl) return response;
  const body = await response.clone().arrayBuffer();
  responseCache.set(cacheKey(request), {
    expiresAt: Date.now() + ttl,
    body,
    status: response.status,
    headers: [...response.headers.entries()]
  });
  return response;
}

async function executeMasterRead(request, env, ctx) {
  if (isMasterUsersRead(request)) {
    try {
      return await handleMasterUsersFallback(request, env);
    } catch (error) {
      console.warn('Fallback Firebase Auth indisponível; usando rota legada.', String(error?.message || error));
    }
  }
  return app.fetch(request, env, ctx);
}

async function queuedMasterRead(request, env, ctx) {
  const hit = cachedResponse(request);
  if (hit) return hit;

  const run = masterReadQueue.then(async () => {
    // Um segundo cache check evita duplicidade de chamadas que ficaram aguardando na fila.
    const secondHit = cachedResponse(request);
    if (secondHit) return secondHit;
    await sleep(MIN_SPACING_MS);
    const response = await executeMasterRead(request, env, ctx);
    return rememberResponse(request, response);
  });

  masterReadQueue = run.then(() => undefined, () => undefined);
  return run;
}

export default {
  async fetch(request, env, ctx) {
    if (isMasterRead(request)) return queuedMasterRead(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  }
};
