import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/family-auth-session.js', import.meta.url), 'utf8');

assert.match(source, /resolveClientCommercialAccess/);
assert.match(source, /isCommercialExemptGroup/);
assert.doesNotMatch(source, /function commercialState\(/);
assert.match(source, /configAvailable = false/);
assert.match(source, /auth\.commercial_state_unavailable/);
assert.match(source, /auth\.commercial_access_resolved/);

console.log('family-auth-policy-bridge.test.mjs: OK');
