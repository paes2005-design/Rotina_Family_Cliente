import app from './commercial-safe-entry.js';
import { verifyFirebaseIdToken, isMasterEmail } from './index.js';
import { testConsoleHtml } from './test-console.js';
import { loadMasterGroupSummaryData } from './master-group-summary.js';

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === 'https://paes2005-design.github.io' ? origin : 'https://paes2005-design.github.io',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

function previewHealth(env) {
  return {
    preview: true,
    dryRun: String(env.COMMERCIAL_TEST_DRY_RUN || '') === '1',
    bindings: {
      firebaseProjectId: Boolean(env.FIREBASE_PROJECT_ID),
      masterAdminEmails: Boolean(env.MASTER_ADMIN_EMAILS),
      googleServiceAccount: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON),
      appLogEncryptionKey: Boolean(env.APP_LOG_ENCRYPTION_KEY),
      oneSignalRestApiKey: Boolean(env.ONESIGNAL_REST_API_KEY),
      oneSignalAppId: Boolean(env.ONESIGNAL_APP_ID)
    }
  };
}

async function dryRunMasterMutation(request, env) {
  const identity = await verifyFirebaseIdToken(env, bearer(request));
  if (!isMasterEmail(env, identity.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }
  const body = await request.clone().json().catch(() => ({}));
  return Response.json({
    success: true,
    dryRun: true,
    preview: true,
    action: String(body.action || ''),
    grupoId: String(body.grupoId || ''),
    targetUid: String(body.targetUid || ''),
    profileId: String(body.profileId || ''),
    message: 'Simulação concluída. Nenhum dado foi alterado.'
  }, { headers: cors(request) });
}

async function dryRunTrial(request, env) {
  await verifyFirebaseIdToken(env, bearer(request));
  return Response.json({
    success: true,
    dryRun: true,
    preview: true,
    estado: 'simulacao',
    message: 'Teste comercial simulado. Nenhum configGrupos foi alterado.'
  }, { headers: cors(request) });
}

async function liveGroupSelfTest(request, env) {
  if (String(env.COMMERCIAL_TEST_DRY_RUN || '') !== '1') {
    return new Response('Not found', { status: 404 });
  }
  const url = new URL(request.url);
  const groupId = String(url.searchParams.get('grupoId') || '').trim().toUpperCase();
  if (!groupId) return Response.json({ ok: false, selfTestVersion: 3, error: 'grupoId ausente' }, { status: 200 });
  const startedAt = Date.now();
  try {
    const grupo = await loadMasterGroupSummaryData(env, groupId, '', new Date());
    return Response.json({
      ok: true,
      selfTestVersion: 3,
      groupId: grupo.grupoId,
      elapsedMs: Date.now() - startedAt,
      principalFound: Boolean(grupo.administradorPrincipal?.email),
      administratorCount: Array.isArray(grupo.administradores) ? grupo.administradores.length : 0,
      clientCount: Array.isArray(grupo.clientes) ? grupo.clientes.length : 0,
      commercialStateReadable: grupo.statusComercialDisponivel === true,
      partial: grupo.parcial === true,
      warningStages: (grupo.avisos || []).map(item => String(item).split(':', 1)[0]).slice(0, 10)
    }, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-rotina-selftest': 'group-v3' } });
  } catch (error) {
    const reason = String(error?.stack || error?.message || error).replace(/\s+/g, ' ').slice(0, 700);
    console.error(JSON.stringify({ event: 'group_selftest_failure', groupId, reason }));
    return Response.json({
      ok: false,
      selfTestVersion: 3,
      groupId,
      elapsedMs: Date.now() - startedAt,
      reason
    }, { status: 200, headers: { 'cache-control': 'no-store', 'x-rotina-selftest': 'group-v3-failure' } });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dryRun = String(env.COMMERCIAL_TEST_DRY_RUN || '') === '1';
    if (dryRun && request.method === 'GET' && (url.pathname === '/test-console' || url.pathname === '/test-console/')) {
      return new Response(testConsoleHtml(), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex, nofollow'
        }
      });
    }
    if (dryRun && request.method === 'GET' && url.pathname === '/preview-health') {
      return Response.json(previewHealth(env), { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    }
    if (dryRun && request.method === 'GET' && url.pathname === '/preview-selftest/group') {
      return liveGroupSelfTest(request, env);
    }
    if (dryRun && request.method === 'POST') {
      if ([
        '/admin-master/groups',
        '/admin-master/admin-access',
        '/admin-master/profiles'
      ].includes(url.pathname)) {
        return dryRunMasterMutation(request, env);
      }
      if (url.pathname === '/commercial/trial') return dryRunTrial(request, env);
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  }
};
