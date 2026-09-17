import assert from 'node:assert/strict';
import {
  alarmFingerprint,
  deterministicUuid,
  firestoreFieldsToJs,
  isLocalMidnight,
  jsToFirestoreFields,
  localDateTimeToEpoch,
  plannedOccurrences,
  weekStartInZone
} from '../src/core.js';

const timeZone = 'America/Bahia';
const baseAlarm = {
  ativo: true,
  grupoId: 'familia-1',
  perfilId: 'perfil-1',
  tarefaId: 'tarefa-1',
  nomeTarefa: 'Arrumar a cama',
  dataAgendada: '2026-08-20',
  semanaInicio: '2026-08-17',
  inicioEm: '2026-08-20T06:00:00',
  fimEm: '2026-08-20T06:10:00',
  momentos: ['inicio', 'fim'],
  acionadoEm: '2026-08-19T20:00:00-03:00',
  ocorrenciasSilenciadas: []
};

assert.equal(
  new Date(localDateTimeToEpoch('2026-08-20T06:00:00', timeZone)).toISOString(),
  '2026-08-20T09:00:00.000Z',
  'horário local é convertido para UTC antes do send_after'
);
assert.equal(weekStartInZone(new Date('2026-08-20T15:00:00Z'), timeZone), '2026-08-17');
assert.equal(weekStartInZone(new Date('2026-08-24T03:00:00Z'), timeZone), '2026-08-24');
assert.equal(isLocalMidnight(new Date('2026-08-24T03:00:00Z'), timeZone), true);

const weekDays = [
  ['Segunda', '2026-08-17'],
  ['Terça', '2026-08-18'],
  ['Quarta', '2026-08-19'],
  ['Quinta', '2026-08-20'],
  ['Sexta', '2026-08-21'],
  ['Sábado', '2026-08-22'],
  ['Domingo', '2026-08-23']
];
for (const [dayName, date] of weekDays) {
  const occurrences = plannedOccurrences({
    ...baseAlarm,
    diaSemana: dayName,
    dataAgendada: date,
    inicioEm: `${date}T06:00:00`,
    fimEm: `${date}T06:10:00`,
    acionadoEm: `${date}T08:00:00Z`,
    momentos: ['inicio']
  }, {
    now: new Date(`${date}T08:55:00Z`),
    timeZone
  });
  assert.equal(occurrences.length, 1, `${dayName} gera exatamente um alarme`);
  assert.equal(occurrences[0].sendAfter, `${date}T09:00:00.000Z`, `${dayName} conserva data e fuso`);
}

const future = plannedOccurrences(baseAlarm, {
  now: new Date('2026-08-20T08:55:00Z'),
  timeZone
});
assert.deepEqual(future.map(item => item.type), ['inicio', 'fim']);
assert.deepEqual(future.map(item => item.sendAfter), [
  '2026-08-20T09:00:00.000Z',
  '2026-08-20T09:10:00.000Z'
]);

const stoppedStart = `${baseAlarm.tarefaId}__inicio__2026-08-20__06:00`;
const onlyFinish = plannedOccurrences({
  ...baseAlarm,
  ocorrenciasSilenciadas: [stoppedStart]
}, {
  now: new Date('2026-08-20T08:59:00Z'),
  timeZone
});
assert.deepEqual(onlyFinish.map(item => item.type), ['fim'], 'parar início não remove o fim');

const caughtUp = plannedOccurrences(baseAlarm, {
  now: new Date('2026-08-20T09:04:59Z'),
  timeZone
});
assert.equal(caughtUp[0].type, 'inicio');
assert.equal(caughtUp[0].sendAfter, '', 'atraso inferior a cinco minutos envia imediatamente');

const tooLate = plannedOccurrences(baseAlarm, {
  now: new Date('2026-08-20T09:05:00Z'),
  timeZone
});
assert.deepEqual(tooLate.map(item => item.type), ['fim'], 'início vencido não volta insistentemente');

const activatedAfterStart = plannedOccurrences({
  ...baseAlarm,
  acionadoEm: '2026-08-20T09:00:30Z'
}, {
  now: new Date('2026-08-20T09:01:00Z'),
  timeZone
});
assert.deepEqual(activatedAfterStart.map(item => item.type), ['fim'], 'ativação tardia não toca retroativamente');

const midnightFinish = {
  ...baseAlarm,
  inicioEm: '2026-08-20T23:50:00',
  fimEm: '2026-08-21T00:10:00',
  momentos: ['fim']
};
assert.equal(
  plannedOccurrences(midnightFinish, {
    now: new Date('2026-08-21T03:00:00Z'),
    timeZone
  })[0].sendAfter,
  '2026-08-21T03:10:00.000Z',
  'fim após meia-noite conserva a data correta'
);

const fingerprints = await Promise.all([
  alarmFingerprint(baseAlarm),
  alarmFingerprint({ ...baseAlarm }),
  alarmFingerprint({ ...baseAlarm, momentos: ['fim'] })
]);
assert.equal(fingerprints[0], fingerprints[1]);
assert.notEqual(fingerprints[0], fingerprints[2]);

const uuidA = await deterministicUuid('alarme|inicio');
const uuidB = await deterministicUuid('alarme|inicio');
assert.equal(uuidA, uuidB, 'repetição segura reutiliza a mesma chave idempotente');
assert.match(uuidA, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

const firestore = jsToFirestoreFields({
  ativo: true,
  contador: 2,
  momentos: ['inicio', 'fim'],
  agendamentos: [{ chave: 'a', mensagemId: 'm' }]
});
assert.deepEqual(firestoreFieldsToJs(firestore), {
  ativo: true,
  contador: 2,
  momentos: ['inicio', 'fim'],
  agendamentos: [{ chave: 'a', mensagemId: 'm' }]
});

console.log('ALL ONESIGNAL SCHEDULER CORE CHECKS PASSED');
