import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeFamilyLink, normalizeFamilyCode } from '../src/family-chat-link-contract.js';

const context = {
  chatIdentity: { uid: 'chat-1', email: 'familia@example.com', email_verified: true },
  rotinaIdentity: { uid: 'rotina-1', email: 'familia@example.com', email_verified: true },
  chatUser: { status: 'approved', role: 'admin' },
  rotinaAdmin: { uid: 'rotina-1', email: 'familia@example.com', tipoAcesso: 'proprietario', grupoId: 'CLI-1234', codigoCliente: 'CLI-1234' }
};
test('autoriza apenas proprietário com sessões e cadastros compatíveis', () => {
  assert.deepEqual(authorizeFamilyLink(context), { grupoId: 'CLI-1234', rotinaUid: 'rotina-1', chatUid: 'chat-1' });
});
test('normaliza código e recusa formato inválido', () => {
  assert.equal(normalizeFamilyCode(' cli-1234 '), 'CLI-1234');
  assert.equal(normalizeFamilyCode('ADM-1234'), '');
});
for (const [name, patch] of [
  ['e-mails diferentes', { rotinaIdentity: { ...context.rotinaIdentity, email: 'outra@example.com' } }],
  ['e-mail não verificado', { chatIdentity: { ...context.chatIdentity, email_verified: false } }],
  ['usuário pendente', { chatUser: { status: 'pending', role: 'admin' } }],
  ['usuário comum', { chatUser: { status: 'approved', role: 'member' } }],
  ['administrador convidado', { rotinaAdmin: { ...context.rotinaAdmin, tipoAcesso: 'admin' } }],
  ['UID divergente', { rotinaAdmin: { ...context.rotinaAdmin, uid: 'outra' } }],
  ['código inconsistente', { rotinaAdmin: { ...context.rotinaAdmin, codigoCliente: 'CLI-9999' } }]
]) test('bloqueia '+name, () => assert.throws(() => authorizeFamilyLink({ ...context, ...patch })));
