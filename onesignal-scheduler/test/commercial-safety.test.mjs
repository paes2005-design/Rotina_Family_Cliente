import assert from 'node:assert/strict';
import {
  commercialState,
  familyBlockPatch,
  mustMutateFirebaseAuthForFamilyBlock,
  resolveAdminCommercialAccess,
  resolveClientCommercialAccess
} from '../src/commercial-policy.js';

assert.equal(commercialState({ grupoBloqueado: true }), 'bloqueado');
assert.equal(commercialState({ grupoBloqueado: false }), 'liberado');
assert.equal(commercialState({ trialAtivo: true, trialFimEm: '2020-01-01T00:00:00Z' }), 'liberado', 'Trial não participa desta fase');

const master = resolveAdminCommercialAccess({
  isMaster: true,
  config: { grupoBloqueado: true },
  configAvailable: true
});
assert.equal(master.allowed, true, 'ADM Master nunca pode ser bloqueado pelo comercial');
assert.equal(master.reason, 'master-sistema');

const adminBlocked = resolveAdminCommercialAccess({ config: { grupoBloqueado: true } });
assert.equal(adminBlocked.allowed, false);
assert.equal(adminBlocked.reason, 'familia-bloqueada');

const adminAllowed = resolveAdminCommercialAccess({ config: { grupoBloqueado: false } });
assert.equal(adminAllowed.allowed, true);

const clientBlocked = resolveClientCommercialAccess({ config: { grupoBloqueado: true } });
assert.equal(clientBlocked.allowed, false);
assert.equal(clientBlocked.reason, 'familia-bloqueada');

const clientAllowed = resolveClientCommercialAccess({ config: {} });
assert.equal(clientAllowed.allowed, true);

assert.equal(resolveAdminCommercialAccess({ configAvailable: false }).allowed, true, 'Falha de leitura comercial não deve derrubar ADM');
assert.equal(resolveClientCommercialAccess({ configAvailable: false }).allowed, true, 'Falha de leitura comercial não deve derrubar Cliente');

assert.deepEqual(familyBlockPatch(true, '2026-08-20T22:00:00.000Z'), {
  grupoBloqueado: true,
  bloqueioAtualizadoEm: '2026-08-20T22:00:00.000Z'
});
assert.equal(mustMutateFirebaseAuthForFamilyBlock(), false, 'Bloqueio familiar não pode alterar Firebase Auth');

console.log('commercial-safety.test.mjs: OK — fase grupo único');
