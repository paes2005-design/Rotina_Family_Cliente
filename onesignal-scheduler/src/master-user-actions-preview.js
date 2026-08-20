import { handleMasterUserActionFallback } from './master-user-actions-fallback.js';
import { verifyFirebaseIdToken, isMasterEmail } from './index.js';

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === 'https://paes2005-design.github.io' ? origin : 'https://paes2005-design.github.io',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

export async function handleMasterUserActionPreview(request, env) {
  if (String(env.COMMERCIAL_TEST_DRY_RUN || '') !== '1') {
    return handleMasterUserActionFallback(request, env);
  }

  const caller = await verifyFirebaseIdToken(env, bearer(request));
  if (!isMasterEmail(env, caller.email)) {
    return Response.json({ error: 'Acesso exclusivo do ADM Master.' }, { status: 403, headers: cors(request) });
  }
  const body = await request.clone().json().catch(() => ({}));
  const action = String(body.action || '');
  const targetUid = String(body.targetUid || '').trim();
  if (!['update-email', 'send-password-reset', 'set-disabled', 'delete-user'].includes(action)) {
    return Response.json({ error: 'Ação administrativa inválida.' }, { status: 400, headers: cors(request) });
  }
  if (!targetUid) return Response.json({ error: 'Usuário não informado.' }, { status: 400, headers: cors(request) });
  if (targetUid === caller.uid) {
    return Response.json({ error: 'O login Master não pode ser alterado por este painel.' }, { status: 409, headers: cors(request) });
  }
  if (action === 'update-email') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: 'Informe um e-mail válido.' }, { status: 400, headers: cors(request) });
    }
  }
  return Response.json({
    success: true,
    dryRun: true,
    preview: true,
    action,
    targetUid,
    message: 'Simulação concluída. Nenhum login foi alterado.'
  }, { headers: cors(request) });
}
