import assert from 'node:assert/strict';
import test from 'node:test';

import { BackendConfigurationError, healthEndpoint, validateBackendUrl } from './url';

test('accepte HTTPS et les hôtes locaux en HTTP', () => {
  assert.equal(validateBackendUrl('https://backend.example.com/'), 'https://backend.example.com');
  assert.equal(validateBackendUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(validateBackendUrl('  http://10.0.2.2:3000/  '), 'http://10.0.2.2:3000');
});

test('refuse une URL vide, invalide ou non chiffrée', () => {
  assert.throws(() => validateBackendUrl(''), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('pas-une-url'), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('http://backend.example.com'), BackendConfigurationError);
});

test('construit l’endpoint de santé sans double slash', () => {
  assert.equal(
    healthEndpoint('https://backend.example.com/'),
    'https://backend.example.com/api/health/records',
  );
});
