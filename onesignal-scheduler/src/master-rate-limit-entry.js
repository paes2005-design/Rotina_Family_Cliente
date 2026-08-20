import app from './commercial-preview-entry.js';
import { handleMasterUsersFallback } from './master-users-fallback.js';
import { handleMasterLogsFallback } from './master-logs-fallback.js';
import { handleMasterUserActionPreview } from './master-user-actions-preview.js';
import { handleMasterGroupSummary } from './master-group-summary.js';

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
    '/admin-master/group',
    '/admin-master/logs'
  ].some(suffix => path.endsWith(suffix));
}

function isMasterUsersRead(request) {
  return request.method === 'GET' && new URL(request.url).pathname.endsWith('/admin-master/users');
}

function isMasterGroupRead(request) {
  return request.method === 'GET' && new URL(request.url).pathname.endsWith('/admin-master/group');
}

function isMasterLogsRead(request) {
  return request.method === 'GET' && new URL(request.url).pathname.endsWith('/admin-master/logs');
}

function isMasterUsersWrite(request) {
  return request.method === 'POST' && new URL(request.url).pathname.endsWith('/admin-master/users');
}

function ttlFor(path) {
  if (path.endsWith('/session')) return 12_000;
  if (path.endsWith('/users')) return 30_000;
  if (path.endsWith('/group')) return 30_000;
  if (path.endsWith('/tree')) return 10_000;
  if (path.endsWith('/logs')) return 15_000;
  return 0;
}

function cacheKey(request) {
  const url = new URL(request.url);
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
  return new Response(item.body, { status: item.status, headers: item.headers });
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
    try { return await handleMasterUsersFallback(request, env); }
    catch (error) { console.warn('Fallback Firebase Auth indisponível; usando rota base.', String(error?.message || error)); }
  }
  if (isMasterGroupRead(request)) {
    return handleMasterGroupSummary(request, env);
  }
  if (isMasterLogsRead(request)) {
    try { return await handleMasterLogsFallback(request, env); }
    catch (error) { console.warn('Leitor global de logs indisponível; usando rota base.', String(error?.message || error)); }
  }
  return app.fetch(request, env, ctx);
}

async function queuedMasterRead(request, env, ctx) {
  const hit = cachedResponse(request);
  if (hit) return hit;
  const run = masterReadQueue.then(async () => {
    const secondHit = cachedResponse(request);
    if (secondHit) return secondHit;
    await sleep(MIN_SPACING_MS);
    return rememberResponse(request, await executeMasterRead(request, env, ctx));
  });
  masterReadQueue = run.then(() => undefined, () => undefined);
  return run;
}

export default {
  async fetch(request, env, ctx) {
    if (isMasterUsersWrite(request)) return handleMasterUserActionPreview(request, env);
    if (isMasterRead(request)) return queuedMasterRead(request, env, ctx);
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  }
};
