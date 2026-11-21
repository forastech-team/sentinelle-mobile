import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BackendConfigurationError,
  checkSendTarget,
  healthEndpoint,
  isTokenRebind,
  tokenMatchesHost,
  validateBackendUrl,
} from './url';

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

test('un jeton sans hôte enregistré ou lié à un autre hôte est refusé', () => {
  assert.equal(tokenMatchesHost('jeton', 'backend.example.com', 'backend.example.com'), true);
  assert.equal(tokenMatchesHost('jeton', null, 'backend.example.com'), false);
  assert.equal(tokenMatchesHost('jeton', 'evil.net', 'backend.example.com'), false);
  assert.equal(tokenMatchesHost(null, 'backend.example.com', 'backend.example.com'), false);
});

test('envoi : URL et jeton cohérents', () => {
  const stored = {
    baseUrl: 'https://backend.example.com',
    token: 'SECRET',
    tokenHost: 'backend.example.com',
  };
  assert.deepEqual(checkSendTarget('https://backend.example.com', stored), {
    ok: true,
    target: { baseUrl: 'https://backend.example.com', token: 'SECRET' },
  });
  assert.deepEqual(checkSendTarget('https://backend.example.com', { baseUrl: stored.baseUrl }), {
    ok: true,
    target: { baseUrl: 'https://backend.example.com' },
  });
});

test('enregistrement : un jeton existant ne peut pas être réassigné à un autre hôte', () => {
  const existing = {
    baseUrl: 'https://backend.example.com',
    token: 'SECRET',
    tokenHost: 'backend.example.com',
  };
  assert.equal(isTokenRebind(existing, 'SECRET', 'evil.example.net'), true);
  assert.equal(isTokenRebind(existing, 'SECRET', 'backend.example.com'), false);
  assert.equal(isTokenRebind(existing, 'AUTRE_JETON', 'evil.example.net'), false);
  assert.equal(isTokenRebind({ baseUrl: existing.baseUrl }, '', 'evil.example.net'), false);
});

test('envoi : une URL modifiée à l’écran ne reçoit jamais le jeton', () => {
  const stored = {
    baseUrl: 'https://backend.example.com',
    token: 'SECRET',
    tokenHost: 'backend.example.com',
  };
  const checked = checkSendTarget('https://evil.example.net', stored);
  assert.equal(checked.ok, false);
  if (!checked.ok) {
    assert.match(checked.message, /Enregistrez la configuration/);
  }
  const lookalike = checkSendTarget('https://backend.example.com@evil.example.net', stored);
  assert.equal(lookalike.ok, false);
});

test('envoi : un jeton orphelin ou lié à un autre hôte est refusé', () => {
  const url = 'https://backend.example.com';
  for (const stored of [
    { baseUrl: url, token: 'SECRET' },
    { baseUrl: url, token: 'SECRET', tokenHost: 'evil.example.net' },
    { baseUrl: url, token: 'SECRET', tokenHost: null },
  ]) {
    const checked = checkSendTarget(url, stored as { baseUrl: string; token?: string; tokenHost?: string });
    assert.equal(checked.ok, false);
  }
});

test('construit l’endpoint de santé sans double slash', () => {
  assert.equal(
    healthEndpoint('https://backend.example.com/'),
    'https://backend.example.com/api/health/records',
  );
});
