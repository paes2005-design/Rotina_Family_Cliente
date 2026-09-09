import assert from 'node:assert/strict';
import { participantClaims } from '../src/commercial-access-status-v1.js';

const nested = participantClaims({
  uid: 'rfp_profile',
  claims: {
    papel: ' participante ',
    grupoId: 'cli-6143',
    perfilId: 'profile'
  }
});

assert.deepEqual(nested, {
  papel: 'participante',
  groupId: 'CLI-6143'
});

const topLevelOnly = participantClaims({
  papel: 'participante',
  grupoId: 'CLI-6143'
});

assert.deepEqual(topLevelOnly, {
  papel: '',
  groupId: ''
});

console.log('commercial-access-status claims: OK');
