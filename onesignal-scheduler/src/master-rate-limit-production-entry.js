import app from './commercial-safe-v2-entry.js';
import { handleMasterUsersFallback } from './master-users-fallback.js';
import { handleMasterLogsFallback } from './master-logs-fallback.js';
import { handleMasterGroupSummary } from './master-group-summary.js';
import { handleMasterGroupsIndex } from './master-groups-index.js';
import { handleFamilyAuthSession } from './family-auth-session.js';
import { runSecurityMaintenance } from './security-maintenance-v1.js';

let masterReadQueue = Promise.resolve();
const responseCache = new Map();
const MIN_SPACING_MS = 1200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function pathOf(request) {
  return new URL(request.url).pathname;
}

function isMasterRead(request) {
  if (request.method !== 'GET') return false;
  const path = pathOf(request);
  return [
    '/admin-master/session',
    '/admin-master/users',
    '/admin-master/groups',
    '/admin-master/group',
    '/admin-master/logs'
  ].some(suffix => path.endsWith(suffix));
}

function isMasterUsersRead(request) {
  return request.method === 'GET' && pathOf(request).endsWith('/admin-master/users');
}

function isMasterGroupsIndexRead(request) {
  return request.method === 'GET' && pathOf(request).endsWith('/admin-master/groups');
}

function isMasterGroupRead(request) {
  return request.method === 'GET' && pathOf(request).endsWith('/admin-master/group');
}

function isMasterLogsRead(request) {
  return request.method === 'GET' && pathOf(request).endsWith('/admin-master/logs');
}

function isMasterGroupMutation(request) {
  return request.method === 'POST' && pathOf(request).endsWith('/admin-master/groups');
}

function ttlFor(path) {
  if (path.endsWith('/session')) return 12_000;
  if (path.endsWith('/users')) return 30_000;
  if (path.endsWith('/groups')) return 5 * 60_000;
  if (path.endsWith('/group')) return 60_000;
  if (path.endsWith('/logs')) return 5_000;
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
  const ttl = ttlFor(pathOf(request));
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

function safeCorsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = origin === 'https://paes2005-design.github.io' ? origin : 'https://paes2005-design.github.io';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

function groupEmergencyResponse(request, error) {
  const url = new URL(request.url);
  const groupId = String(url.searchParams.get('grupoId') || '').trim().toUpperCase();
  const ownerEmail = String(url.searchParams.get('ownerEmail') || '').trim().toLowerCase();
  const reason = String(error?.message || error || 'Falha desconhecida').replace(/\s+/g, ' ').slice(0, 320);
  console.error(JSON.stringify({ event: 'master_group_router_failure', grupoId: groupId, reason }));
  return Response.json({
    grupo: {
      grupoId: groupId,
      estado: 'indisponivel',
      grupoBloqueado: false,
      grupoConfirmado: false,
      trialAtivo: false,
      statusComercialDisponivel: false,
      administradorPrincipal: ownerEmail ? { uid: '', email: ownerEmail } : null,
      administradores: [],
      clientes: [],
      parcial: true,
      avisos: [`Falha na abertura do grupo: ${reason}`]
    },
    diagnostico: { etapa: 'roteamento-ou-autenticacao', motivo: reason }
  }, { status: 200, headers: safeCorsHeaders(request) });
}

async function executeMasterRead(request, env, ctx) {
  if (isMasterUsersRead(request)) {
    try {
      return await handleMasterUsersFallback(request, env);
    } catch (error) {
      console.warn('Fallback Firebase Auth indisponível; usando rota base.', String(error?.message || error));
    }
  }
  if (isMasterGroupsIndexRead(request)) return handleMasterGroupsIndex(request, env);
  if (isMasterGroupRead(request)) {
    try {
      return await handleMasterGroupSummary(request, env);
    } catch (error) {
      return groupEmergencyResponse(request, error);
    }
  }
  if (isMasterLogsRead(request)) {
    try {
      return await handleMasterLogsFallback(request, env);
    } catch (error) {
      console.warn('Leitor global de logs indisponível; usando rota base.', String(error?.message || error));
    }
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
    try {
      return rememberResponse(request, await executeMasterRead(request, env, ctx));
    } catch (error) {
      if (isMasterGroupRead(request)) return groupEmergencyResponse(request, error);
      throw error;
    }
  });
  masterReadQueue = run.then(() => undefined, () => undefined);
  return run;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const authResponse = await handleFamilyAuthSession(request, env);
      if (authResponse) return authResponse;
      if (isMasterGroupMutation(request)) {
        const response = await app.fetch(request, env, ctx);
        if (response.ok) responseCache.clear();
        return response;
      }
      if (isMasterRead(request)) return queuedMasterRead(request, env, ctx);
      return app.fetch(request, env, ctx);
    } catch (error) {
      if (isMasterGroupRead(request)) return groupEmergencyResponse(request, error);
      throw error;
    }
  },
  async scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(runSecurityMaintenance(env, now).catch(error => {
      console.error(JSON.stringify({event:'security.maintenance_error',message:String(error?.message||error)}));
    }));
    return app.scheduled(controller, env, ctx);
  }
};
