/**
 * Family Chat ↔ Rotina Family: contrato isolado e testável.
 * NÃO é uma rota pública. A integração só pode ser ligada por um Worker
 * após validar os tokens dos DOIS projetos e as permissões no Firestore.
 */
export function normalizeFamilyCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^CLI-[0-9]{4}$/.test(code) ? code : '';
}

/**
 * @param {{chatIdentity:object, rotinaIdentity:object, chatUser:object,
 *   rotinaAdmin:object}} context - Todos os objetos devem ser obtidos no
 *   servidor, NUNCA do corpo da requisição.
 */
export function authorizeFamilyLink({ chatIdentity, rotinaIdentity, chatUser, rotinaAdmin }) {
  if (!chatIdentity?.uid || !rotinaIdentity?.uid) throw new Error('Autenticação dos dois aplicativos obrigatória.');
  if (chatIdentity.email_verified !== true || rotinaIdentity.email_verified !== true) {
    throw new Error('Confirme o e-mail nos dois aplicativos antes de vincular.');
  }
  const chatEmail = String(chatIdentity.email || '').trim().toLowerCase();
  const rotinaEmail = String(rotinaIdentity.email || '').trim().toLowerCase();
  if (!chatEmail || chatEmail !== rotinaEmail) throw new Error('Os e-mails autenticados não correspondem.');
  if (chatUser?.status !== 'approved' || chatUser?.role !== 'admin') {
    throw new Error('Somente administradores aprovados podem vincular famílias.');
  }
  if (String(rotinaAdmin?.uid || '') !== String(rotinaIdentity.uid)) {
    throw new Error('Administrador do Rotina Family não corresponde à sessão.');
  }
  if (String(rotinaAdmin?.email || '').trim().toLowerCase() !== rotinaEmail) {
    throw new Error('Cadastro administrativo não corresponde ao e-mail autenticado.');
  }
  if (String(rotinaAdmin?.tipoAcesso || '').toLowerCase() !== 'proprietario') {
    throw new Error('Somente o proprietário da família pode realizar o vínculo inicial.');
  }
  const grupoId = normalizeFamilyCode(rotinaAdmin.codigoCliente || rotinaAdmin.grupoId);
  if (!grupoId || (rotinaAdmin.grupoId && String(rotinaAdmin.grupoId).toUpperCase() !== grupoId)) {
    throw new Error('Código familiar inconsistente.');
  }
  return Object.freeze({ grupoId, rotinaUid: rotinaIdentity.uid, chatUid: chatIdentity.uid });
}
