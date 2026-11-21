import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPayload } from './payload';

const window = {
  from: '2026-11-20T12:00:00.000Z',
  to: '2026-11-21T12:00:00.000Z',
};

test('construit un payload daté, trié et sans permission d’écriture', () => {
  const payload = buildPayload({
    window,
    generatedAt: '2026-11-21T12:00:01.000Z',
    records: [
      {
        type: 'Steps',
        startTime: '2026-11-21T09:00:00.000Z',
        endTime: '2026-11-21T09:10:00.000Z',
        count: 900,
        source: 'com.example.watch',
      },
      {
        type: 'Weight',
        time: '2026-11-20T18:00:00.000Z',
        weightKg: 68.2,
      },
    ],
    grantedPermissions: [
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'write', recordType: 'Steps' },
    ],
  });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.source, 'google-health-connect');
  assert.equal(payload.platform, 'android');
  assert.equal(payload.generatedAt, '2026-11-21T12:00:01.000Z');
  assert.deepEqual(payload.records.map((record) => record.type), ['Weight', 'Steps']);
  assert.deepEqual(payload.counts, { Steps: 1, Weight: 1 });
  assert.deepEqual(payload.grantedPermissions, [
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'Weight' },
  ]);
  assert.deepEqual(payload.limits, { maxRecordsPerType: 1000, truncatedTypes: [] });
});

test('tronque par type et déclare explicitement les troncatures', () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    type: 'Steps' as const,
    startTime: `2026-11-21T0${index}:00:00.000Z`,
    endTime: `2026-11-21T0${index}:05:00.000Z`,
    count: index + 1,
  }));

  const payload = buildPayload({
    window,
    generatedAt: '2026-11-21T12:00:01.000Z',
    records,
    grantedPermissions: [{ accessType: 'read', recordType: 'Steps' }],
    maxRecordsPerType: 2,
  });

  assert.equal(payload.records.length, 2);
  assert.deepEqual(payload.counts, { Steps: 2 });
  assert.deepEqual(payload.limits, { maxRecordsPerType: 2, truncatedTypes: ['Steps'] });
});

test('ne fabrique aucune donnée quand aucune lecture n’a retourné d’enregistrement', () => {
  const payload = buildPayload({
    window,
    generatedAt: '2026-11-21T12:00:01.000Z',
    records: [],
    grantedPermissions: [],
  });

  assert.deepEqual(payload.records, []);
  assert.deepEqual(payload.counts, {});
});
