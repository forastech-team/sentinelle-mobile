import assert from 'node:assert/strict';
import test from 'node:test';

import { BackendConfigurationError, healthEndpoint, validateBackendUrl } from './url';

Object.assign(globalThis, { __DEV__: true });

test('accepte HTTPS et les hôtes locaux en HTTP en développement', () => {
  assert.equal(validateBackendUrl('https://backend.example.com/'), 'https://backend.example.com');
  assert.equal(validateBackendUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(validateBackendUrl('  http://10.0.2.2:3000/  '), 'http://10.0.2.2:3000');
  assert.equal(validateBackendUrl('http://[::1]:3000'), 'http://[::1]:3000');
});

test('refuse une URL vide, invalide ou non chiffrée', () => {
  assert.throws(() => validateBackendUrl(''), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('pas-une-url'), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('http://backend.example.com'), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('ftp://backend.example.com'), BackendConfigurationError);
});

test('refuse HTTP local en production', () => {
  Object.assign(globalThis, { __DEV__: false });
  try {
    assert.throws(() => validateBackendUrl('http://localhost:3000'), BackendConfigurationError);
    assert.equal(validateBackendUrl('https://backend.example.com'), 'https://backend.example.com');
  } finally {
    Object.assign(globalThis, { __DEV__: true });
  }
});

test('refuse les identifiants, query, fragment, chemin et IDN', () => {
  assert.throws(
    () => validateBackendUrl('https://backend.example.com@evil.net'),
    BackendConfigurationError,
  );
  assert.throws(
    () => validateBackendUrl('https://user:secret@backend.example.com'),
    BackendConfigurationError,
  );
  assert.throws(() => validateBackendUrl('https://backend.example.com/?x=1'), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('https://backend.example.com/#frag'), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('https://backend.example.com/api'), BackendConfigurationError);
  assert.throws(() => validateBackendUrl('https://еxample.com'), BackendConfigurationError);
});

test('construit l’endpoint de santé sans double slash', () => {
  assert.equal(
    healthEndpoint('https://backend.example.com/'),
    'https://backend.example.com/api/health/records',
  );
});
