/** Types de données réellement lus dans Health Connect (API Google Health sur Android). */
export const HEALTH_RECORD_TYPES = [
  'Steps',
  'HeartRate',
  'RestingHeartRate',
  'SleepSession',
  'Weight',
  'ActiveCaloriesBurned',
] as const;

export type HealthRecordType = (typeof HEALTH_RECORD_TYPES)[number];

export interface HealthPermission {
  accessType: 'read' | 'write';
  recordType: string;
}

export const HEALTH_READ_PERMISSIONS: ReadonlyArray<{
  accessType: 'read';
  recordType: HealthRecordType;
}> = HEALTH_RECORD_TYPES.map((recordType) => ({
  accessType: 'read',
  recordType,
}));

export interface HeartRateSample {
  time: string;
  beatsPerMinute: number;
}

export interface SleepStage {
  startTime: string;
  endTime: string;
  stage: number;
}

/** Représentation normalisée, sans objet natif, prête à être sérialisée en JSON. */
export type NormalizedRecord =
  | {
      type: 'Steps';
      startTime: string;
      endTime: string;
      count: number;
      source?: string;
    }
  | {
      type: 'HeartRate';
      startTime: string;
      endTime: string;
      samples: HeartRateSample[];
      source?: string;
    }
  | {
      type: 'RestingHeartRate';
      time: string;
      beatsPerMinute: number;
      source?: string;
    }
  | {
      type: 'SleepSession';
      startTime: string;
      endTime: string;
      stages?: SleepStage[];
      source?: string;
    }
  | {
      type: 'Weight';
      time: string;
      weightKg: number;
      source?: string;
    }
  | {
      type: 'ActiveCaloriesBurned';
      startTime: string;
      endTime: string;
      energyKcal: number;
      source?: string;
    };

export interface TimeWindow {
  from: string;
  to: string;
}

/** Fenêtre par défaut : dernières 24 heures, ancrée sur l'heure de lecture. */
export function makeTimeWindow(now: Date = new Date()): TimeWindow {
  return {
    from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  };
}

export function countByType(records: readonly NormalizedRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }
  return counts;
}
