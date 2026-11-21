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
  /** Erreurs de lecture par type : une fenêtre peut être partielle. */
  readErrors?: readonly string[];
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
  /** Comptes avant troncature : ce qui a réellement été lu. */
  readCounts: Record<string, number>;
  /** Comptes après troncature : ce qui est réellement envoyé. */
  counts: Record<string, number>;
  /** Types dont la lecture a échoué, avec un code stable. */
  readErrors: string[];
  limits: {
    maxRecordsPerType: number;
    truncatedTypes: string[];
  };
  records: NormalizedRecord[];
}

function recordTime(record: NormalizedRecord): string {
  return record.type === 'RestingHeartRate' || record.type === 'Weight'
    ? record.time
    : record.startTime;
}

function countsOf(records: readonly NormalizedRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Construit le corps JSON envoyé au backend. Fonction pure : aucun appel natif,
 * aucun secret, aucune donnée simulée. Les troncatures et erreurs sont déclarées.
 */
export function buildPayload(input: PayloadInput): HealthPayload {
  const requestedLimit = input.maxRecordsPerType ?? DEFAULT_MAX_RECORDS_PER_TYPE;
  const finiteLimit = Number.isFinite(requestedLimit)
    ? requestedLimit
    : DEFAULT_MAX_RECORDS_PER_TYPE;
  const maxRecordsPerType = Math.max(1, Math.floor(finiteLimit));

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
    readCounts: countsOf(input.records),
    counts: countsOf(kept),
    readErrors: [...(input.readErrors ?? [])],
    limits: {
      maxRecordsPerType,
      truncatedTypes: [...truncatedTypes].sort(),
    },
    records: kept,
  };
}
