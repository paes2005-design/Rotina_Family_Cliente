import assert from 'node:assert/strict';
import {
  COMMERCIAL_TRIAL_VERSION,
  commercialState,
  confirmFamilyPatch,
  familyBlockPatch,
  mustMutateFirebaseAuthForFamilyBlock,
  resolveAdminCommercialAccess,
  resolveClientCommercialAccess,
  startFamilyTrialPatch
} from '../src/commercial-policy.js';

const base = Date.parse('2026-08-01T12:00:00.000Z');
const activeTrial = {
  trialVersao: COMMERCIAL_TRIAL_VERSION,
  trialAtivo: true,
  trialFimEm: '2026-08-16T12:00:00.000Z',
  grupoConfirmado: false,
  grupoBloqueado: false
};

assert.equal(commercialState({ grupoBloqueado: true }, base), 'bloqueado');
assert.equal(commercialState({ grupoConfirmado: true }, base), 'confirmado');
assert.equal(commercialState(activeTrial, Date.parse('2026-08-10T12:00:00.000Z')), 'teste');
assert.equal(commercialState(activeTrial, Date.parse('2026-08-16T12:00:00.000Z')), 'teste-expirado');
assert.equal(commercialState({}, base), 'liberado-legado');

const master = resolveAdminCommercialAccess({ isMaster: true, config: { grupoBloqueado: true }, configAvailable: true });
assert.equal(master.allowed, true, 'ADM Master nunca pode ser bloqueado pelo comercial');
assert.equal(master.reason, 'master-sistema');

const adminBlocked = resolveAdminCommercialAccess({ config: { grupoBloqueado: true } });
assert.equal(adminBlocked.allowed, false);
assert.equal(adminBlocked.reason, 'familia-bloqueada');

const expired = resolveClientCommercialAccess({ config: activeTrial, now: Date.parse('2026-08-17T12:00:00.000Z') });
assert.equal(expired.allowed, false);
assert.equal(expired.reason, 'teste-15-dias-expirado');

const duringTrial = resolveClientCommercialAccess({ config: activeTrial, now: Date.parse('2026-08-10T12:00:00.000Z') });
assert.equal(duringTrial.allowed, true);
assert.equal(duringTrial.reason, 'teste-15-dias-ativo');

assert.equal(resolveAdminCommercialAccess({ configAvailable: false }).allowed, true, 'Falha de leitura comercial não deve derrubar ADM');
assert.equal(resolveClientCommercialAccess({ configAvailable: false }).allowed, true, 'Falha de leitura comercial não deve derrubar Cliente');

assert.deepEqual(familyBlockPatch(true, '2026-08-20T22:00:00.000Z'), {
  grupoBloqueado: true,
  bloqueioManual: true,
  bloqueioAtualizadoEm: '2026-08-20T22:00:00.000Z'
});

const trialPatch = startFamilyTrialPatch(new Date('2026-08-01T12:00:00.000Z'));
assert.equal(trialPatch.trialVersao, COMMERCIAL_TRIAL_VERSION);
assert.equal(trialPatch.trialInicioEm, '2026-08-01T12:00:00.000Z');
assert.equal(trialPatch.trialFimEm, '2026-08-16T12:00:00.000Z');
assert.equal(trialPatch.grupoConfirmado, false);

const confirmed = confirmFamilyPatch('2026-08-10T12:00:00.000Z');
assert.equal(confirmed.grupoConfirmado, true);
assert.equal(confirmed.trialAtivo, false);
assert.equal(confirmed.grupoBloqueado, false);

assert.equal(mustMutateFirebaseAuthForFamilyBlock(), false, 'Bloqueio familiar não pode alterar Firebase Auth');
console.log('commercial-safety.test.mjs: OK — grupo + teste de 15 dias + Master protegido');
