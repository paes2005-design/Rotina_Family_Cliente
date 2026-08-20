export function commercialState(config = {}) {
  return config.grupoBloqueado === true ? 'bloqueado' : 'liberado';
}

export function resolveAdminCommercialAccess({
  isMaster = false,
  config = {},
  configAvailable = true
} = {}) {
  if (isMaster) return { allowed: true, reason: 'master-sistema', state: 'master' };
  if (!configAvailable) return { allowed: true, reason: 'fail-open-config-indisponivel', state: 'indisponivel' };
  if (config.grupoBloqueado === true) return { allowed: false, reason: 'familia-bloqueada', state: 'bloqueado' };
  return { allowed: true, reason: 'familia-liberada', state: 'liberado' };
}

export function resolveClientCommercialAccess({
  config = {},
  configAvailable = true
} = {}) {
  if (!configAvailable) return { allowed: true, reason: 'fail-open-config-indisponivel', state: 'indisponivel' };
  if (config.grupoBloqueado === true) return { allowed: false, reason: 'familia-bloqueada', state: 'bloqueado' };
  return { allowed: true, reason: 'familia-liberada', state: 'liberado' };
}

export function familyBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return {
    grupoBloqueado: disabled === true,
    bloqueioAtualizadoEm: nowIso
  };
}

// Mantidos apenas por compatibilidade com código experimental antigo.
// A fase atual NÃO usa bloqueio comercial individual.
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

export function confirmFamilyPatch(nowIso = new Date().toISOString()) {
  return {
    grupoConfirmado: true,
    grupoBloqueado: false,
    confirmadoEm: nowIso
  };
}

// Invariante principal: bloquear uma família muda somente configGrupos/<grupoId>.
// Nunca desativa contas no Firebase Authentication.
export function mustMutateFirebaseAuthForFamilyBlock() {
  return false;
}
