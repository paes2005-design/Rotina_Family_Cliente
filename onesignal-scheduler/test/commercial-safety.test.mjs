import assert from 'node:assert/strict';
import {
  COMMERCIAL_TRIAL_VERSION,
  commercialState,
  confirmFamilyPatch,
  familyBlockPatch,
  isCommercialExemptGroup,
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

assert.equal(isCommercialExemptGroup('CLI-4071'), true);
assert.equal(isCommercialExemptGroup(' cli-4071 '), true);
assert.equal(isCommercialExemptGroup('CLI-6143'), false);

assert.equal(commercialState({ grupoBloqueado: true }, base), 'bloqueado');
assert.equal(commercialState({ grupoConfirmado: true }, base), 'confirmado');
assert.equal(commercialState(activeTrial, Date.parse('2026-08-10T12:00:00.000Z')), 'teste');
assert.equal(commercialState(activeTrial, Date.parse('2026-08-16T12:00:00.000Z')), 'teste-expirado');
assert.equal(commercialState({}, base), 'liberado-legado');

const master = resolveAdminCommercialAccess({ isMaster: true, config: { grupoBloqueado: true }, configAvailable: true });
assert.equal(master.allowed, true);
assert.equal(master.reason, 'master-sistema');

const exemptAdmin = resolveAdminCommercialAccess({ groupId: 'CLI-4071', config: { grupoBloqueado: true } });
assert.equal(exemptAdmin.allowed, true);
assert.equal(exemptAdmin.state, 'isento');
assert.equal(exemptAdmin.reason, 'grupo-isento-comercial');

const exemptClient = resolveClientCommercialAccess({ groupId: 'CLI-4071', config: activeTrial, now: Date.parse('2026-08-17T12:00:00.000Z') });
assert.equal(exemptClient.allowed, true);
assert.equal(exemptClient.state, 'isento');

const adminBlocked = resolveAdminCommercialAccess({ groupId: 'CLI-6143', config: { grupoBloqueado: true } });
assert.equal(adminBlocked.allowed, false);
assert.equal(adminBlocked.reason, 'familia-bloqueada');

const expired = resolveClientCommercialAccess({ groupId: 'CLI-6143', config: activeTrial, now: Date.parse('2026-08-17T12:00:00.000Z') });
assert.equal(expired.allowed, false);
assert.equal(expired.reason, 'teste-15-dias-expirado');

const duringTrial = resolveClientCommercialAccess({ groupId: 'CLI-6143', config: activeTrial, now: Date.parse('2026-08-10T12:00:00.000Z') });
assert.equal(duringTrial.allowed, true);
assert.equal(duringTrial.reason, 'teste-15-dias-ativo');

assert.equal(resolveAdminCommercialAccess({ configAvailable: false }).allowed, true);
assert.equal(resolveClientCommercialAccess({ configAvailable: false }).allowed, true);

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

assert.equal(mustMutateFirebaseAuthForFamilyBlock(), false);
console.log('commercial-safety.test.mjs: OK — trial 15d + Master protegido + CLI-4071 isento');
