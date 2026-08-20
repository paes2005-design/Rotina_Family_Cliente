const pad = value => String(value).padStart(2, '0');

export const SCHEDULER_VERSION = 1;
export const DEFAULT_TIME_ZONE = 'America/Bahia';
export const CATCH_UP_WINDOW_MS = 5 * 60 * 1000;

export function firestoreValueToJs(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreValueToJs);
  if ('mapValue' in value) return firestoreFieldsToJs(value.mapValue.fields || {});
  return undefined;
}

export function firestoreFieldsToJs(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)])
  );
}

export function jsToFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'object' && value) {
    return { mapValue: { fields: jsToFirestoreFields(value) } };
  }
  return { stringValue: String(value ?? '') };
}

export function jsToFirestoreFields(object = {}) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, jsToFirestoreValue(value)])
  );
}

export function zonedParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const result = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

export function localDateTimeToEpoch(localDateTime, timeZone = DEFAULT_TIME_ZONE) {
  const match = String(localDateTime || '').match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return NaN;
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0)
  };
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second
  );
  let candidate = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = zonedParts(new Date(candidate), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second
    );
    candidate -= shownAsUtc - desiredAsUtc;
  }
  const confirmed = zonedParts(new Date(candidate), timeZone);
  return Object.keys(desired).every(key => confirmed[key] === desired[key]) ? candidate : NaN;
}

export function weekStartInZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const local = zonedParts(date, timeZone);
  const calendar = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const day = calendar.getUTCDay();
  calendar.setUTCDate(calendar.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return `${calendar.getUTCFullYear()}-${pad(calendar.getUTCMonth() + 1)}-${pad(calendar.getUTCDate())}`;
}

export function isLocalMidnight(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const local = zonedParts(date, timeZone);
  return local.hour === 0 && local.minute === 0;
}

function occurrenceKey(alarm, type, localDateTime) {
  const [date, time = ''] = String(localDateTime).split('T');
  return `${alarm.tarefaId}__${type}__${date}__${time.slice(0, 5)}`;
}

export function alarmScheduleIdentity(alarm = {}) {
  return {
    grupoId: alarm.grupoId || '',
    perfilId: alarm.perfilId || '',
    tarefaId: alarm.tarefaId || '',
    nomeTarefa: alarm.nomeTarefa || '',
    dataAgendada: alarm.dataAgendada || '',
    semanaInicio: alarm.semanaInicio || '',
    inicioEm: alarm.inicioEm || '',
    fimEm: alarm.fimEm || '',
    momentos: [...new Set(Array.isArray(alarm.momentos) ? alarm.momentos : ['inicio'])]
      .filter(value => value === 'inicio' || value === 'fim')
      .sort(),
    acionadoEm: alarm.acionadoEm || ''
  };
}

export function plannedOccurrences(alarm, {
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
  catchUpWindowMs = CATCH_UP_WINDOW_MS
} = {}) {
  const selected = new Set(
    (Array.isArray(alarm?.momentos) ? alarm.momentos : ['inicio'])
      .filter(value => value === 'inicio' || value === 'fim')
  );
  const silenced = new Set(Array.isArray(alarm?.ocorrenciasSilenciadas) ? alarm.ocorrenciasSilenciadas : []);
  const activatedAt = Date.parse(alarm?.acionadoEm || '');
  const currentTime = now.getTime();
  const result = [];
  for (const type of ['inicio', 'fim']) {
    if (!selected.has(type)) continue;
    const localDateTime = type === 'fim' ? alarm?.fimEm : alarm?.inicioEm;
    const epoch = localDateTimeToEpoch(localDateTime, timeZone);
    if (!Number.isFinite(epoch)) continue;
    const key = occurrenceKey(alarm, type, localDateTime);
    if (silenced.has(key)) continue;
    if (Number.isFinite(activatedAt) && activatedAt > epoch) continue;
    if (epoch <= currentTime - catchUpWindowMs) continue;
    result.push({
      key,
      type,
      localDateTime,
      epoch,
      sendAfter: epoch > currentTime ? new Date(epoch).toISOString() : ''
    });
  }
  return result.sort((a, b) => a.epoch - b.epoch);
}

function bytesToHex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

export async function alarmFingerprint(alarm) {
  return sha256Hex(JSON.stringify(alarmScheduleIdentity(alarm)));
}

export async function deterministicUuid(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)))
  ).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = bytesToHex(digest);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatDateBr(dateIso) {
  const [year, month, day] = String(dateIso || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : dateIso || '';
}
