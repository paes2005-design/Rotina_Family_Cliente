import app from './commercial-safe-entry.js';
import { verifyFirebaseIdToken, isMasterEmail } from './index.js';

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dryRun = String(env.COMMERCIAL_TEST_DRY_RUN || '') === '1';
    if (dryRun && request.method === 'GET' && url.pathname === '/preview-health') {
      return Response.json(previewHealth(env), { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
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
