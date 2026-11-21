import type {
  HealthPermission,
  NormalizedRecord,
  TimeWindow,
} from './model';

export const PAYLOAD_SCHEMA_VERSION = 1;

/** Nombre maximum d'enregistrements envoyés par type, pour éviter un payload démesuré. */
export const DEFAULT_MAX_RECORDS_PER_TYPE = 1000;

export interface PayloadInput {
  window: TimeWindow;
  records: readonly NormalizedRecord[];
  grantedPermissions: readonly HealthPermission[];
  generatedAt?: string;
  maxRecordsPerType?: number;
}

export interface HealthPayload {
  schemaVersion: 1;
  source: 'google-health-connect';
  platform: 'android';
  generatedAt: string;
  window: TimeWindow;
  grantedPermissions: HealthPermission[];
  limits: {
    maxRecordsPerType: number;
    truncatedTypes: string[];
  };
  counts: Record<string, number>;
  records: NormalizedRecord[];
}

function recordTime(record: NormalizedRecord): string {
  return record.type === 'RestingHeartRate' || record.type === 'Weight'
    ? record.time
    : record.startTime;
}

/**
 * Construit le corps JSON envoyé au backend. Fonction pure : aucun appel natif,
 * aucun secret, aucune donnée simulée. Les troncatures sont explicitement déclarées.
 */
export function buildPayload(input: PayloadInput): HealthPayload {
  const maxRecordsPerType = Math.max(1, Math.floor(input.maxRecordsPerType ?? DEFAULT_MAX_RECORDS_PER_TYPE));
  const sorted = [...input.records].sort((a, b) =>
    recordTime(a).localeCompare(recordTime(b)),
  );

  const kept: NormalizedRecord[] = [];
  const seenByType = new Map<string, number>();
  const truncatedTypes = new Set<string>();

  for (const record of sorted) {
    const seen = seenByType.get(record.type) ?? 0;
    if (seen >= maxRecordsPerType) {
      truncatedTypes.add(record.type);
      continue;
    }
    seenByType.set(record.type, seen + 1);
    kept.push(record);
  }

  const counts: Record<string, number> = {};
  for (const record of kept) {
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }

  const grantedPermissions = input.grantedPermissions
    .filter((permission) => permission.accessType === 'read')
    .map((permission) => ({
      accessType: 'read' as const,
      recordType: permission.recordType,
    }))
    .sort((a, b) => a.recordType.localeCompare(b.recordType));

  return {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    source: 'google-health-connect',
    platform: 'android',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    window: input.window,
    grantedPermissions,
    limits: {
      maxRecordsPerType,
      truncatedTypes: [...truncatedTypes].sort(),
    },
    counts,
    records: kept,
  };
}
