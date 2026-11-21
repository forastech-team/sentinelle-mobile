import assert from 'node:assert/strict';
import test from 'node:test';

import { sendHealthPayload } from './client';
import { buildPayload } from '../health/payload';

const originalFetch = globalThis.fetch;

const payload = buildPayload({
  window: { from: '2026-11-20T12:00:00.000Z', to: '2026-11-21T12:00:00.000Z' },
  generatedAt: '2026-11-21T12:00:01.000Z',
  records: [
    {
      type: 'Steps',
      startTime: '2026-11-21T09:00:00.000Z',
      endTime: '2026-11-21T09:10:00.000Z',
      count: 900,
    },
  ],
  grantedPermissions: [],
});

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  });
}

test('une URL invalide retourne un SendResult sans appel réseau', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('ne devrait pas être appelé');
  }) as typeof fetch;
  try {
    const result = await sendHealthPayload({ baseUrl: 'pas-une-url' }, payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('réessaie sur 500 avec la même clé d’idempotence et le jeton Bearer', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (calls.length === 1) {
      return jsonResponse({ message: 'temporaire' }, 500, { 'Retry-After': '0' });
    }
    return jsonResponse({ ok: true, received: 1 }, 200);
  }) as typeof fetch;
  try {
    const result = await sendHealthPayload(
      { baseUrl: 'https://backend.example.com', token: ' jeton-secret ' },
      payload,
    );
    assert.deepEqual(result, { ok: true, status: 200, message: 'Données envoyées au backend.' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, 'https://backend.example.com/api/health/records');
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer jeton-secret');
    assert.match(headers['Idempotency-Key'] ?? '', /^google-health-connect:/);
    assert.equal(
      (calls[1]?.init.headers as Record<string, string>)['Idempotency-Key'],
      headers['Idempotency-Key'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('une erreur réseau ne déclenche pas de second envoi', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;
  try {
    const result = await sendHealthPayload({ baseUrl: 'https://backend.example.com' }, payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.match(result.message, /Connexion impossible/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('un 200 avec ok:false est un échec', async () => {
  globalThis.fetch = (async () => jsonResponse({ ok: false, message: 'refusé' }, 200)) as typeof fetch;
  try {
    const result = await sendHealthPayload({ baseUrl: 'https://backend.example.com' }, payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, 200);
    assert.equal(result.message, 'refusé');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
