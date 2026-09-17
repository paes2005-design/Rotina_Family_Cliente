import assert from 'node:assert/strict';
import { alarmFingerprint } from '../src/core.js';
import { reconcileAlarm } from '../src/index.js';

const env = {
  FIREBASE_PROJECT_ID: 'projeto-teste',
  ALARM_TIME_ZONE: 'America/Bahia',
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'nao-usado@example.com',
    private_key: 'nao-usada'
  })
};

const base = {
  ativo: true,
  grupoId: 'familia',
  perfilId: 'perfil',
  tarefaId: 'tarefa',
  nomeTarefa: 'Arrumar a cama',
  dataAgendada: '2026-08-20',
  semanaInicio: '2026-08-17',
  inicioEm: '2026-08-20T06:00:00',
  fimEm: '2026-08-20T06:10:00',
  momentos: ['inicio'],
  acionadoEm: '2026-08-19T20:00:00-03:00',
  schedulerPendente: false,
  schedulerVersao: 1,
  oneSignalEstado: 'AGENDADO',
  oneSignalErro: ''
};
const fingerprint = await alarmFingerprint(base);
const completedRecord = {
  chave: 'tarefa__inicio__2026-08-20__06:00',
  momento: 'inicio',
  mensagemId: 'message-1',
  idempotencyKey: 'idem-1',
  envioEm: '2026-08-20T09:00:00.000Z',
  auditoria: {
    successful: 1,
    received: 1,
    failed: 0,
    errored: 0,
    remaining: 0,
    completedAt: '2026-08-20T09:00:30.000Z',
    estado: 'RECEBIDO_NO_APARELHO',
    auditadoEm: '2026-08-20T09:01:00.000Z'
  }
};

const stable = {
  name: 'projects/projeto-teste/databases/(default)/documents/despertadores/a',
  data: {
    ...base,
    oneSignalFingerprint: fingerprint,
    oneSignalAgendamentos: [completedRecord],
    oneSignalAuditoriaPendente: false
  }
};
let unexpectedCalls = 0;
const stableResult = await reconcileAlarm(env, stable, {
  now: new Date('2026-08-20T09:12:00Z'),
  fetchImpl: async () => { unexpectedCalls += 1; throw new Error('Documento estável não deve gravar nem chamar OneSignal.'); }
});
assert.equal(stableResult.state, 'AGENDADO');
assert.equal(stableResult.created, 0);
assert.equal(stableResult.writeSkipped, true);
assert.equal(unexpectedCalls, 0, 'full scan estável não consome gravação Firestore');

// Documento legado que ficou com auditoria marcada como pendente, embora todas as mensagens já estejam concluídas.
// O reconciliador deve corrigir o flag UMA vez e não reativá-lo em toda varredura.
const legacyPending = {
  ...stable,
  data: { ...stable.data, schedulerPendente: true, oneSignalAuditoriaPendente: true }
};
let patchCalls = 0;
let patchBody = null;
const fakePem = `-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEAu0Z6uBqG8o6vGOeV\nWcU2p7t0iwdM6qPIlY8lEJdNw13xsM6fVyrGOx0q2mV7SYwE5oP3zM9xVdwD7WfY\nNwIDAQABAkA9j3G2nXEHl6zTFv7JwR2zBSt0SCYB0VDv9gKXqEOIuJ2w9cnXg5gR\nYgLvmhBvUqmXhK1Q3yLf1oYmpsdZAiEA8c1k8Rpl8O5l9MCBqGiGp2M8E9zHz9G4\nqD4m2fUCIQDG9D7gCwk1xzzYfJ95GNRzqMKRyQiRTuFwvAoBawIhAJi1c4tYgQmS\nP1+u54VnxuI9o2C8uT4Y0uN8jlTtAiAZeA8sJPPZg8mzL9EVzy78CbPuNQbQ9v1F\nU5VnAQIhANqckzr+x62a5tBv1HpmA6Q7hE2SI8UQd2M4cQAB\n-----END PRIVATE KEY-----`;
env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'worker@example.com', private_key: fakePem });
const fetchMock = async (input, init = {}) => {
  const url = String(input);
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'token', expires_in: 3600 });
  if (url.startsWith('https://firestore.googleapis.com/v1/') && init.method === 'PATCH') {
    patchCalls += 1;
    patchBody = JSON.parse(init.body);
    return Response.json({ updateTime: new Date().toISOString() });
  }
  throw new Error(`Requisição inesperada: ${init.method || 'GET'} ${url}`);
};

// A chave do teste acima não precisa ser importável porque a função pode reutilizar cache OAuth de outros testes somente no processo separado.
// Para manter este teste autocontido e sem criptografia, substituímos apenas o global crypto.sign caso a autenticação seja realmente solicitada.
const originalImportKey = crypto.subtle.importKey.bind(crypto.subtle);
try {
  // Se o PEM simplificado não for aceito, este ramo fornece uma chave efêmera válida apenas para formar o JWT de teste.
  const pair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:1024,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const b64 = Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g).join('\n');
  env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({client_email:'worker@example.com',private_key:`-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`});
  const corrected = await reconcileAlarm(env, legacyPending, { now: new Date('2026-08-20T09:12:00Z'), fetchImpl: fetchMock });
  assert.equal(corrected.state, 'AGENDADO');
  assert.equal(corrected.created, 0);
  assert.equal(patchCalls, 1, 'flag legado é corrigido com uma única gravação');
  const fields = patchBody.fields;
  assert.equal(fields.oneSignalAuditoriaPendente.booleanValue, false, 'auditoria concluída não volta a ficar pendente');
} finally {
  void originalImportKey;
}

console.log('scheduler-write-budget: OK');
