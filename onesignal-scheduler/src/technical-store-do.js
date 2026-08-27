const STORE_VERSION = 1;
const MAX_LOGS = 1000;
const MAX_CYCLES = 60;

function clampLimit(value, fallback = 500, max = MAX_LOGS) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : fallback;
}

function cleanEvent(value = {}) {
  return {
    aplicativo: ['cliente','adm','master'].includes(value.aplicativo) ? value.aplicativo : 'desconhecido',
    versaoMonitor: Number(value.versaoMonitor) || 1,
    evento: String(value.evento || 'evento').replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,80),
    nivel: ['info','warning','error'].includes(value.nivel) ? value.nivel : 'info',
    detalhes: value.detalhes && typeof value.detalhes === 'object' ? value.detalhes : {},
    grupoId: String(value.grupoId || '').trim().slice(0,80),
    perfilId: String(value.perfilId || '').trim().slice(0,128),
    sessaoId: String(value.sessaoId || '').slice(0,128),
    clienteEm: String(value.clienteEm || new Date().toISOString()).slice(0,40),
    pagina: String(value.pagina || '').slice(0,100),
    navegador: String(value.navegador || '').slice(0,40),
    online: value.online !== false,
    visibilidade: String(value.visibilidade || '').slice(0,30),
    instalado: value.instalado === true
  };
}

function signature(event) {
  return JSON.stringify([event.aplicativo,event.evento,event.nivel,event.detalhes,event.grupoId,event.perfilId,event.sessaoId,event.clienteEm]);
}

export function technicalStoreStub(env) {
  if (!env?.TECHNICAL_STORE) return null;
  return env.TECHNICAL_STORE.get(env.TECHNICAL_STORE.idFromName('rotina-family-global-v1'));
}

export async function appendTechnicalLogs(env, events = []) {
  const stub = technicalStoreStub(env);
  if (!stub) return null;
  const response = await stub.fetch('https://technical-store/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events })
  });
  if (!response.ok) throw new Error(`Technical store logs HTTP ${response.status}`);
  return response.json();
}

export async function readTechnicalLogs(env, { groupId = '', limit = 500 } = {}) {
  const stub = technicalStoreStub(env);
  if (!stub) return null;
  const url = new URL('https://technical-store/logs');
  if (groupId) url.searchParams.set('groupId', groupId);
  url.searchParams.set('limit', String(limit));
  const response = await stub.fetch(url);
  if (!response.ok) throw new Error(`Technical store read HTTP ${response.status}`);
  return response.json();
}

export async function writeTechnicalHealth(env, cycle = {}) {
  const stub = technicalStoreStub(env);
  if (!stub) return null;
  const response = await stub.fetch('https://technical-store/health', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cycle })
  });
  if (!response.ok) throw new Error(`Technical store health HTTP ${response.status}`);
  return response.json();
}

export async function readTechnicalHealth(env) {
  const stub = technicalStoreStub(env);
  if (!stub) return null;
  const response = await stub.fetch('https://technical-store/health');
  if (!response.ok) throw new Error(`Technical store health read HTTP ${response.status}`);
  return response.json();
}

export class RotinaTechnicalStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/logs' && request.method === 'POST') return this.appendLogs(request);
    if (url.pathname === '/logs' && request.method === 'GET') return this.readLogs(url);
    if (url.pathname === '/health' && request.method === 'POST') return this.writeHealth(request);
    if (url.pathname === '/health' && request.method === 'GET') return this.readHealth();
    return Response.json({ error: 'not-found', storeVersion: STORE_VERSION }, { status: 404 });
  }

  async appendLogs(request) {
    const body = await request.json().catch(() => ({}));
    const incoming = (Array.isArray(body.events) ? body.events : []).slice(0,50).map(cleanEvent).filter(event => event.grupoId);
    if (!incoming.length) return Response.json({ accepted: 0, stored: 0, duplicates: 0, storeVersion: STORE_VERSION });
    return this.state.storage.transaction(async txn => {
      const existing = (await txn.get('logs')) || [];
      const recent = new Set(existing.slice(-300).map(signature));
      let stored = 0;
      let duplicates = 0;
      for (const event of incoming) {
        const sig = signature(event);
        if (recent.has(sig)) { duplicates += 1; continue; }
        recent.add(sig);
        existing.push(event);
        stored += 1;
      }
      await txn.put('logs', existing.slice(-MAX_LOGS));
      await txn.put('lastLogAt', new Date().toISOString());
      return Response.json({ accepted: incoming.length, stored, duplicates, total: Math.min(MAX_LOGS, existing.length), storeVersion: STORE_VERSION });
    });
  }

  async readLogs(url) {
    const groupId = String(url.searchParams.get('groupId') || '').trim();
    const limit = clampLimit(url.searchParams.get('limit'));
    const logs = (await this.state.storage.get('logs')) || [];
    const selected = (groupId && groupId.toUpperCase() !== 'SISTEMA'
      ? logs.filter(event => event.grupoId === groupId)
      : logs).slice(-limit).reverse();
    return Response.json({ logs: selected, totalStored: logs.length, storeVersion: STORE_VERSION, lastLogAt: await this.state.storage.get('lastLogAt') || '' });
  }

  async writeHealth(request) {
    const body = await request.json().catch(() => ({}));
    const cycle = body.cycle && typeof body.cycle === 'object' ? body.cycle : {};
    const stamped = { ...cycle, storedAt: new Date().toISOString() };
    return this.state.storage.transaction(async txn => {
      const history = (await txn.get('cycles')) || [];
      history.push(stamped);
      await txn.put('health', stamped);
      await txn.put('cycles', history.slice(-MAX_CYCLES));
      return Response.json({ ok: true, storeVersion: STORE_VERSION });
    });
  }

  async readHealth() {
    return Response.json({
      health: await this.state.storage.get('health') || null,
      recentCycles: await this.state.storage.get('cycles') || [],
      storeVersion: STORE_VERSION,
      lastLogAt: await this.state.storage.get('lastLogAt') || ''
    });
  }
}
