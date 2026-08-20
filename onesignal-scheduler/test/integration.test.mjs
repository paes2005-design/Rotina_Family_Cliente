import assert from 'node:assert/strict';
import { firestoreFieldsToJs } from '../src/core.js';
import { reconcileAlarm } from '../src/index.js';

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
assert.deepEqual(creates[0].include_aliases.external_id, ['rotina_family__familia__perfil']);
assert.notEqual(creates[0].idempotency_key, creates[1].idempotency_key);
assert.equal(patches.at(-1).schedulerPendente, false);
assert.equal(patches.at(-1).oneSignalEstado, 'AGENDADO');
assert.equal(patches.at(-1).oneSignalAgendamentos.length, 2);

const inactiveDocument = {
  ...activeDocument,
  data: {
    ...activeDocument.data,
    ativo: false,
    oneSignalAgendamentos: patches.at(-1).oneSignalAgendamentos,
    oneSignalFingerprint: patches.at(-1).oneSignalFingerprint
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

console.log('ALL ONESIGNAL SCHEDULER INTEGRATION CHECKS PASSED');
