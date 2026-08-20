import assert from 'node:assert/strict';
import {
  adminIndividualBlockPatch,
  commercialState,
  familyBlockPatch,
  mustMutateFirebaseAuthForFamilyBlock,
  resolveAdminCommercialAccess,
  resolveClientCommercialAccess
} from '../src/commercial-policy.js';

const now = Date.parse('2026-08-20T22:00:00Z');

assert.equal(commercialState({ grupoBloqueado: true }, now), 'bloqueado');
assert.equal(commercialState({ grupoConfirmado: true }, now), 'liberado');
assert.equal(commercialState({ trialAtivo: true, trialFimEm: '2026-08-20T21:59:59Z' }, now), 'teste-expirado');

for (const config of [
  { grupoBloqueado: true },
  { trialAtivo: true, trialFimEm: '2026-08-20T21:59:59Z' },
  { grupoConfirmado: false }
]) {
  const master = resolveAdminCommercialAccess({
    isMaster: true,
    config,
    individualBlocked: true,
    configAvailable: true,
    nowMs: now
  });
  assert.equal(master.allowed, true, 'ADM Master nunca pode ser bloqueado pelo comercial');
  assert.equal(master.reason, 'master-sistema');
}

const ownerBlocked = resolveAdminCommercialAccess({ config: { grupoBloqueado: true }, nowMs: now });
assert.equal(ownerBlocked.allowed, false);
assert.equal(ownerBlocked.reason, 'familia-bloqueada');

const additionalBlocked = resolveAdminCommercialAccess({
  config: { grupoConfirmado: true },
  individualBlocked: true,
  nowMs: now
});
assert.equal(additionalBlocked.allowed, false);
assert.equal(additionalBlocked.reason, 'admin-bloqueado-individualmente');

const clientBlocked = resolveClientCommercialAccess({ config: { grupoBloqueado: true }, nowMs: now });
assert.equal(clientBlocked.allowed, false);
assert.equal(clientBlocked.reason, 'familia-bloqueada');

assert.equal(resolveAdminCommercialAccess({ configAvailable: false }).allowed, true, 'Falha de leitura comercial não deve derrubar ADM');
assert.equal(resolveClientCommercialAccess({ configAvailable: false }).allowed, true, 'Falha de leitura comercial não deve derrubar Cliente');

assert.deepEqual(familyBlockPatch(true, '2026-08-20T22:00:00.000Z'), {
  grupoBloqueado: true,
  bloqueioAtualizadoEm: '2026-08-20T22:00:00.000Z'
});
assert.deepEqual(adminIndividualBlockPatch(true, '2026-08-20T22:00:00.000Z'), {
  bloqueadoComercialIndividual: true,
  bloqueioComercialIndividualEm: '2026-08-20T22:00:00.000Z'
});
assert.equal(mustMutateFirebaseAuthForFamilyBlock(), false, 'Bloqueio familiar não pode alterar Firebase Auth');

console.log('commercial-safety.test.mjs: OK');
