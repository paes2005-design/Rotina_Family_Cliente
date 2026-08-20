import assert from 'node:assert/strict';
import { firestoreFieldsToJs } from '../src/core.js';
import {
  auditAlarmDelivery,
  auditRewardDelivery,
  reconcileAlarm,
  reconcileRewardNotification
} from '../src/index.js';

function pem(bytes) {
  const base64 = Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`;
}

const keyPair = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256'
}, true, ['sign', 'verify']);
const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
const env = {
  FIREBASE_PROJECT_ID: 'projeto-teste',
  ONESIGNAL_APP_ID: 'app-teste',
  ONESIGNAL_REST_API_KEY: 'segredo-teste',
  CLIENT_APP_URL: 'https://example.com/cliente/',
  ADMIN_APP_URL: 'https://example.com/adm/',
  ALARM_TIME_ZONE: 'America/Bahia',
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'worker-test@projeto-teste.iam.gserviceaccount.com',
    private_key: pem(privateKey)
  })
};

const creates = [];
const cancels = [];
const patches = [];
let messageSequence = 0;
async function fetchMock(input, init = {}) {
  const url = String(input);
  if (url === 'https://oauth2.googleapis.com/token') {
    assert.equal(init.method, 'POST');
    assert.match(String(init.body), /assertion=/);
    return Response.json({ access_token: 'google-token', expires_in: 3600 });
  }
  if (url === 'https://api.onesignal.com/notifications' && init.method === 'POST') {
    assert.equal(init.headers.authorization, 'Key segredo-teste');
    const payload = JSON.parse(init.body);
    creates.push(payload);
    messageSequence += 1;
    return Response.json({ id: `message-${messageSequence}` });
  }
  if (url.startsWith('https://api.onesignal.com/notifications/') && init.method === 'DELETE') {
    cancels.push(url);
    return Response.json({ success: true });
  }
  if (url.startsWith('https://api.onesignal.com/notifications/') && !init.method) {
    assert.equal(init.headers.authorization, 'Key segredo-teste');
    return Response.json({
      id: 'message-audit',
      successful: 2,
      received: 1,
      failed: 0,
      errored: 0,
      remaining: 0,
      completed_at: 1787213220,
      platform_delivery_stats: { chrome_web_push: { successful: 2, received: 1 } }
    });
  }
  if (url.startsWith('https://firestore.googleapis.com/v1/projects/') && init.method === 'PATCH') {
    assert.equal(init.headers.authorization, 'Bearer google-token');
    patches.push(firestoreFieldsToJs(JSON.parse(init.body).fields));
    return Response.json({ updateTime: new Date().toISOString() });
  }
  throw new Error(`Requisição inesperada no teste: ${init.method || 'GET'} ${url}`);
}

const now = new Date('2026-08-20T08:55:00Z');
const activeDocument = {
  name: 'projects/projeto-teste/databases/(default)/documents/despertadores/familia__perfil__tarefa',
  data: {
    ativo: true,
    grupoId: 'familia',
    perfilId: 'perfil',
    tarefaId: 'tarefa',
    nomeTarefa: 'Arrumar a cama',
    dataAgendada: '2026-08-20',
    semanaInicio: '2026-08-17',
    inicioEm: '2026-08-20T06:00:00',
    fimEm: '2026-08-20T06:10:00',
    momentos: ['inicio', 'fim'],
    acionadoEm: '2026-08-19T20:00:00-03:00',
    schedulerPendente: true,
    schedulerVersao: 1
  }
};

const scheduled = await reconcileAlarm(env, activeDocument, { fetchImpl: fetchMock, now });
assert.deepEqual(scheduled, { state: 'AGENDADO', created: 2 });
assert.equal(creates.length, 2, 'a opção ambos cria duas mensagens independentes');
assert.deepEqual(creates.map(payload => payload.send_after), [
  '2026-08-20T09:00:00.000Z',
  '2026-08-20T09:10:00.000Z'
]);
assert.deepEqual(creates[0].filters, [
  { field: 'tag', key: 'grupoId', relation: '=', value: 'familia' },
  { operator: 'AND' },
  { field: 'tag', key: 'perfilId', relation: '=', value: 'perfil' },
  { operator: 'AND' },
  { field: 'tag', key: 'aplicativo', relation: '=', value: 'cliente' }
]);
assert.notEqual(creates[0].idempotency_key, creates[1].idempotency_key);
assert.equal(patches.at(-1).schedulerPendente, false);
assert.equal(patches.at(-1).oneSignalEstado, 'AGENDADO');
assert.equal(patches.at(-1).oneSignalAgendamentos.length, 2);
assert.equal(patches.at(-1).oneSignalAuditoriaPendente, true);
const scheduledPatch = patches.at(-1);

const audited = await auditAlarmDelivery(env, {
  ...activeDocument,
  data: {
    ...activeDocument.data,
    oneSignalAgendamentos: scheduledPatch.oneSignalAgendamentos
  }
}, {
  fetchImpl: fetchMock,
  now: new Date('2026-08-20T09:12:00Z'),
  minimumDelayMs: 0
});
assert.equal(audited.state, 'RECEBIDO_NO_APARELHO');
assert.equal(audited.successful, 4);
assert.equal(audited.received, 2);
assert.equal(audited.pending, false);
assert.equal(patches.at(-1).oneSignalEntregaEstado, 'RECEBIDO_NO_APARELHO');

const inactiveDocument = {
  ...activeDocument,
  data: {
    ...activeDocument.data,
    ativo: false,
    oneSignalAgendamentos: scheduledPatch.oneSignalAgendamentos,
    oneSignalFingerprint: scheduledPatch.oneSignalFingerprint
  }
};
const cancelled = await reconcileAlarm(env, inactiveDocument, {
  fetchImpl: fetchMock,
  now: new Date('2026-08-20T08:56:00Z')
});
assert.deepEqual(cancelled, { state: 'CANCELADO', created: 0 });
assert.equal(cancels.length, 2, 'retirar o alarme cancela início e fim ainda agendados');
assert.equal(patches.at(-1).oneSignalEstado, 'CANCELADO');
assert.deepEqual(patches.at(-1).oneSignalAgendamentos, []);

const expiredDocument = {
  ...activeDocument,
  data: {
    ...activeDocument.data,
    dataAgendada: '2026-08-23',
    semanaInicio: '2026-08-17',
    inicioEm: '2026-08-23T23:50:00',
    fimEm: '2026-08-24T00:10:00',
    oneSignalAgendamentos: [{ chave: 'domingo__fim', mensagemId: 'message-old' }]
  }
};
const expired = await reconcileAlarm(env, expiredDocument, {
  fetchImpl: fetchMock,
  now: new Date('2026-08-24T03:00:00Z')
});
assert.deepEqual(expired, { state: 'EXPIRADO', created: 0 });
assert.equal(patches.at(-1).ativo, false);
assert.equal(patches.at(-1).expiradoPor, 'SCHEDULER_VIRADA_SEMANA');

const rewardDocument = {
  name: 'projects/projeto-teste/databases/(default)/documents/resgates/resgate-1',
  data: {
    grupoId: 'familia',
    perfilId: 'perfil',
    perfilNome: 'Lara',
    recompensaNome: 'Escolher o filme',
    pontos: 150,
    status: 'Pendente',
    criadoEm: '2026-08-20T09:00:00Z',
    pushAdminPendente: true
  }
};
const adminPush = await reconcileRewardNotification(env, rewardDocument, 'admin', {
  fetchImpl: fetchMock,
  now: new Date('2026-08-20T09:01:00Z')
});
assert.equal(adminPush.state, 'ENVIADO');
assert.deepEqual(creates.at(-1).filters, [
  { field: 'tag', key: 'admAtivo', relation: '=', value: '1' },
  { operator: 'AND' },
  { field: 'tag', key: 'admGrupoId', relation: '=', value: 'familia' }
]);
assert.equal(creates.at(-1).ttl, 86400);
assert.equal(creates.at(-1).web_url, 'https://example.com/adm/?abrir=resgates');
assert.equal(patches.at(-1).pushAdminPendente, false);
assert.equal(patches.at(-1).pushAdminEstado, 'ENVIADO');
assert.equal(patches.at(-1).pushAdminAuditoriaPendente, true);

const clientPush = await reconcileRewardNotification(env, {
  ...rewardDocument,
  data: {
    ...rewardDocument.data,
    status: 'Aprovado',
    decididoEm: '2026-08-20T09:02:00Z',
    pushClientePendente: true
  }
}, 'client', {
  fetchImpl: fetchMock,
  now: new Date('2026-08-20T09:02:01Z')
});
assert.equal(clientPush.state, 'ENVIADO');
assert.equal(creates.at(-1).filters.at(-1).value, 'cliente');
assert.equal(creates.at(-1).headings.pt, '✅ Recompensa aprovada!');
assert.equal(creates.at(-1).web_url, 'https://example.com/cliente/?abrir=resgates');
assert.equal(patches.at(-1).pushClientePendente, false);
assert.equal(patches.at(-1).pushClienteEstado, 'ENVIADO');
assert.equal(patches.at(-1).pushClienteAuditoriaPendente, true);
const clientPushPatch = patches.at(-1);

const clientRewardAudit = await auditRewardDelivery(env, {
  ...rewardDocument,
  data: {
    ...rewardDocument.data,
    ...clientPushPatch
  }
}, 'client', {
  fetchImpl: fetchMock,
  now: new Date('2026-08-20T09:03:00Z'),
  minimumDelayMs: 0
});
assert.equal(clientRewardAudit.state, 'RECEBIDO_NO_APARELHO');
assert.equal(clientRewardAudit.successful, 2);
assert.equal(clientRewardAudit.received, 1);
assert.equal(patches.at(-1).pushClienteAuditoriaPendente, false);
assert.equal(patches.at(-1).pushClienteEntregaEstado, 'RECEBIDO_NO_APARELHO');

const refusedPush = await reconcileRewardNotification(env, {
  ...rewardDocument,
  data: {
    ...rewardDocument.data,
    status: 'Recusado',
    decididoEm: '2026-08-20T09:03:00Z',
    pushClientePendente: true
  }
}, 'client', {
  fetchImpl: fetchMock,
  now: new Date('2026-08-20T09:03:01Z')
});
assert.equal(refusedPush.state, 'ENVIADO');
assert.equal(creates.at(-1).headings.pt, '❌ Recompensa não aprovada');

console.log('ALL ONESIGNAL SCHEDULER INTEGRATION CHECKS PASSED');
