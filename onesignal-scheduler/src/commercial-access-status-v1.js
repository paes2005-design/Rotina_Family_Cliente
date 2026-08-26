import { verifyFirebaseIdToken } from './index.js';
import { readCommercialState } from './security-maintenance-v1.js';
import { resolveClientCommercialAccess, isCommercialExemptGroup } from './commercial-policy.js';

const ALLOWED_ORIGIN = 'https://paes2005-design.github.io';

function bearer(request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    vary: 'Origin'
  };
}

export async function handleCommercialAccessStatus(request, env, now = new Date()) {
  const url = new URL(request.url);
  if (url.pathname !== '/commercial/access-status') return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'GET') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: cors(request) });
  try {
    const identity = await verifyFirebaseIdToken(env, bearer(request), fetch, now);
    const papel = String(identity.papel || '').trim().toLowerCase();
    const groupId = String(identity.grupoId || '').trim().toUpperCase();
    if (papel !== 'participante' || !groupId) return Response.json({ error: 'Sessão de participante inválida.' }, { status: 403, headers: cors(request) });
    if (isCommercialExemptGroup(groupId)) return Response.json({ acessoPermitido: true }, { headers: cors(request) });
    const config = await readCommercialState(env, groupId, now);
    const access = resolveClientCommercialAccess({ groupId, config: config || {}, configAvailable: true, now: now.getTime() });
    return Response.json({
      acessoPermitido: access.allowed === true,
      motivoBloqueio: access.allowed ? '' : (access.state === 'teste-expirado' ? 'teste-expirado' : 'grupo-bloqueado')
    }, { headers: cors(request) });
  } catch (error) {
    const message = String(error?.message || error || 'Falha de sessão.').replace(/\s+/g, ' ').slice(0, 220);
    return Response.json({ error: message }, { status: 401, headers: cors(request) });
  }
}
