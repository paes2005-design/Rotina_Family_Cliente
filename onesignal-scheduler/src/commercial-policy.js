export const COMMERCIAL_TRIAL_VERSION = 2;
export const COMMERCIAL_TRIAL_DAYS = 15;
export const COMMERCIAL_TRIAL_MS = COMMERCIAL_TRIAL_DAYS * 24 * 60 * 60 * 1000;
export const COMMERCIAL_EXEMPT_GROUPS = Object.freeze(['CLI-4071']);

function normalizeGroupId(value = '') {
  return String(value || '').trim().toUpperCase();
}

export function isCommercialExemptGroup(groupId = '') {
  return COMMERCIAL_EXEMPT_GROUPS.includes(normalizeGroupId(groupId));
}

function nowMs(value = Date.now()) {
  if (value instanceof Date) return value.getTime();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function isTrialV2(config = {}) {
  return Number(config.trialVersao || 0) === COMMERCIAL_TRIAL_VERSION && config.trialAtivo === true;
}

export function trialExpiryMs(config = {}) {
  const parsed = Date.parse(String(config.trialFimEm || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function commercialState(config = {}, at = Date.now()) {
  if (config.grupoBloqueado === true) return 'bloqueado';
  if (config.grupoConfirmado === true) return 'confirmado';
  if (isTrialV2(config)) {
    const expiresAt = trialExpiryMs(config);
    if (Number.isFinite(expiresAt) && nowMs(at) >= expiresAt) return 'teste-expirado';
    return 'teste';
  }
  return 'liberado-legado';
}

function accessFromState(state) {
  if (state === 'bloqueado') return { allowed: false, reason: 'familia-bloqueada', state };
  if (state === 'teste-expirado') return { allowed: false, reason: 'teste-15-dias-expirado', state };
  if (state === 'confirmado') return { allowed: true, reason: 'familia-confirmada', state };
  if (state === 'teste') return { allowed: true, reason: 'teste-15-dias-ativo', state };
  return { allowed: true, reason: 'familia-legada-liberada', state };
}

export function resolveAdminCommercialAccess({ isMaster = false, groupId = '', config = {}, configAvailable = true, now = Date.now() } = {}) {
  if (isMaster) return { allowed: true, reason: 'master-sistema', state: 'master' };
  if (isCommercialExemptGroup(groupId)) return { allowed: true, reason: 'grupo-isento-comercial', state: 'isento' };
  if (!configAvailable) return { allowed: true, reason: 'fail-open-config-indisponivel', state: 'indisponivel' };
  return accessFromState(commercialState(config, now));
}

export function resolveClientCommercialAccess({ groupId = '', config = {}, configAvailable = true, now = Date.now() } = {}) {
  if (isCommercialExemptGroup(groupId)) return { allowed: true, reason: 'grupo-isento-comercial', state: 'isento' };
  if (!configAvailable) return { allowed: true, reason: 'fail-open-config-indisponivel', state: 'indisponivel' };
  return accessFromState(commercialState(config, now));
}

export function familyBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return { grupoBloqueado: disabled === true, bloqueioManual: disabled === true, bloqueioAtualizadoEm: nowIso };
}

export function startFamilyTrialPatch(now = new Date()) {
  const start = now instanceof Date ? now : new Date(now);
  const end = new Date(start.getTime() + COMMERCIAL_TRIAL_MS);
  return {
    trialVersao: COMMERCIAL_TRIAL_VERSION,
    trialAtivo: true,
    trialDias: COMMERCIAL_TRIAL_DAYS,
    trialInicioEm: start.toISOString(),
    trialFimEm: end.toISOString(),
    grupoConfirmado: false,
    grupoBloqueado: false,
    bloqueioManual: false
  };
}

export function confirmFamilyPatch(nowIso = new Date().toISOString()) {
  return {
    trialVersao: COMMERCIAL_TRIAL_VERSION,
    trialAtivo: false,
    grupoConfirmado: true,
    grupoBloqueado: false,
    bloqueioManual: false,
    confirmadoEm: nowIso
  };
}

export function adminIndividualBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return { bloqueadoComercialIndividual: disabled === true, bloqueioComercialIndividualEm: nowIso };
}

export function profileBlockPatch(disabled, nowIso = new Date().toISOString()) {
  return { desativadoMaster: disabled === true, desativadoMasterEm: nowIso };
}

export function mustMutateFirebaseAuthForFamilyBlock() {
  return false;
}
