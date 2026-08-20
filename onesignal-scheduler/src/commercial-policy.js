export function commercialState(config = {}, nowMs = Date.now()) {
  if (config.grupoBloqueado === true) return 'bloqueado';
  if (config.grupoConfirmado === true) return 'liberado';
  if (config.trialAtivo === true) {
    const end = new Date(config.trialFimEm || '');
    if (Number.isFinite(end.getTime()) && end.getTime() <= nowMs) return 'teste-expirado';
    return 'teste';
  }
  return 'legado';
}

export function resolveAdminCommercialAccess({
  isMaster = false,
  config = {},
  individualBlocked = false,
  configAvailable = true,
  nowMs = Date.now()
} = {}) {
  if (isMaster) return { allowed: true, reason: 'master-sistema', state: 'master' };
  if (!configAvailable) return { allowed: true, reason: 'fail-open-config-indisponivel', state: 'indisponivel' };
  if (individualBlocked) return { allowed: false, reason: 'admin-bloqueado-individualmente', state: 'individual' };
  const state = commercialState(config, nowMs);
  if (state === 'bloqueado') return { allowed: false, reason: 'familia-bloqueada', state };
  if (state === 'teste-expirado') return { allowed: false, reason: 'teste-expirado', state };
  return { allowed: true, reason: state, state };
}

export function resolveClientCommercialAccess({
  config = {},
  profileBlocked = false,
  configAvailable = true,
  profileAvailable = true,
  nowMs = Date.now()
} = {}) {
  if (!configAvailable || !profileAvailable) {
    return { allowed: true, reason: 'fail-open-leitura-indisponivel', state: 'indisponivel' };
  }
  if (profileBlocked) return { allowed: false, reason: 'cliente-bloqueado-individualmente', state: 'individual' };
  const state = commercialState(config, nowMs);
  if (state === 'bloqueado') return { allowed: false, reason: 'familia-bloqueada', state };
  if (state === 'teste-expirado') return { allowed: false, reason: 'teste-expirado', state };
  return { allowed: true, reason: state, state };
}

export function familyBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return {
    grupoBloqueado: disabled === true,
    bloqueioAtualizadoEm: nowIso
  };
}

export function confirmFamilyPatch(nowIso = new Date().toISOString()) {
  return {
    grupoConfirmado: true,
    trialAtivo: false,
    grupoBloqueado: false,
    confirmadoEm: nowIso
  };
}

export function adminIndividualBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return {
    bloqueadoComercialIndividual: disabled === true,
    bloqueioComercialIndividualEm: nowIso
  };
}

export function profileBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return {
    desativadoMaster: disabled === true,
    desativadoMasterEm: nowIso
  };
}

// Invariante principal: bloquear uma família é uma decisão comercial no configGrupos.
// Nunca deve desativar contas no Firebase Authentication.
export function mustMutateFirebaseAuthForFamilyBlock() {
  return false;
}
