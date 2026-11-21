import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  type Permission,
  type RecordResult,
  type RecordType,
} from 'react-native-health-connect';

import {
  HEALTH_READ_PERMISSIONS,
  type HealthPermission,
  type NormalizedRecord,
  type TimeWindow,
} from './model';

export type SdkState = 'available' | 'unavailable' | 'update-required';

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

export async function checkHealthConnect(): Promise<{
  state: SdkState;
  initialized: boolean;
}> {
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) {
    return { state: 'available', initialized: await initialize() };
  }
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return { state: 'update-required', initialized: false };
  }
  return { state: 'unavailable', initialized: false };
}

export async function requestHealthPermissions(): Promise<HealthPermission[]> {
  const granted = await requestPermission([...HEALTH_READ_PERMISSIONS]);
  return toHealthPermissions(granted);
}

export async function currentHealthPermissions(): Promise<HealthPermission[]> {
  return toHealthPermissions(await getGrantedPermissions());
}

function toHealthPermissions(
  permissions: ReadonlyArray<Permission | { accessType: string; recordType: string }>,
): HealthPermission[] {
  return permissions
    .filter((permission) => permission.accessType === 'read')
    .map((permission) => ({
      accessType: 'read' as const,
      recordType: permission.recordType,
    }))
    .sort((a, b) => a.recordType.localeCompare(b.recordType));
}

export interface HealthSnapshot {
  window: TimeWindow;
  records: NormalizedRecord[];
  /** Erreurs par type de données ; les autres types restent exploitables. */
  errors: string[];
}

interface BetweenTimeRangeFilter {
  operator: 'between';
  startTime: string;
  endTime: string;
}

async function readAllPages<T extends RecordType>(
  recordType: T,
  timeRangeFilter: BetweenTimeRangeFilter,
): Promise<Array<RecordResult<T>>> {
  const records: Array<RecordResult<T>> = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await readRecords<T>(recordType, {
      timeRangeFilter,
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    });
    records.push(...result.records);
    if (!result.pageToken) {
      break;
    }
    pageToken = result.pageToken;
  }

  return records;
}

/** Lit les données réelles de Health Connect. Aucune donnée n'est générée ni simulée. */
export async function readHealthSnapshot(window: TimeWindow): Promise<HealthSnapshot> {
  const timeRangeFilter: BetweenTimeRangeFilter = {
    operator: 'between',
    startTime: window.from,
    endTime: window.to,
  };

  const steps = readAllPages('Steps', timeRangeFilter).then((records) =>
    records.map(
      (record): NormalizedRecord => ({
        type: 'Steps',
        startTime: record.startTime,
        endTime: record.endTime,
        count: record.count,
        ...(record.metadata?.dataOrigin ? { source: record.metadata.dataOrigin } : {}),
      }),
    ),
  );

  const heartRate = readAllPages('HeartRate', timeRangeFilter).then((records) =>
    records.map(
      (record): NormalizedRecord => ({
        type: 'HeartRate',
        startTime: record.startTime,
        endTime: record.endTime,
        samples: record.samples.map((sample) => ({
          time: sample.time,
          beatsPerMinute: sample.beatsPerMinute,
        })),
        ...(record.metadata?.dataOrigin ? { source: record.metadata.dataOrigin } : {}),
      }),
    ),
  );

  const restingHeartRate = readAllPages('RestingHeartRate', timeRangeFilter).then((records) =>
    records.map(
      (record): NormalizedRecord => ({
        type: 'RestingHeartRate',
        time: record.time,
        beatsPerMinute: record.beatsPerMinute,
        ...(record.metadata?.dataOrigin ? { source: record.metadata.dataOrigin } : {}),
      }),
    ),
  );

  const sleep = readAllPages('SleepSession', timeRangeFilter).then((records) =>
    records.map(
      (record): NormalizedRecord => ({
        type: 'SleepSession',
        startTime: record.startTime,
        endTime: record.endTime,
        ...(record.stages
          ? {
              stages: record.stages.map((stage) => ({
                startTime: stage.startTime,
                endTime: stage.endTime,
                stage: stage.stage,
              })),
            }
          : {}),
        ...(record.metadata?.dataOrigin ? { source: record.metadata.dataOrigin } : {}),
      }),
    ),
  );

  const weight = readAllPages('Weight', timeRangeFilter).then((records) =>
    records.map(
      (record): NormalizedRecord => ({
        type: 'Weight',
        time: record.time,
        weightKg: record.weight.inKilograms,
        ...(record.metadata?.dataOrigin ? { source: record.metadata.dataOrigin } : {}),
      }),
    ),
  );

  const activeCalories = readAllPages('ActiveCaloriesBurned', timeRangeFilter).then((records) =>
    records.map(
      (record): NormalizedRecord => ({
        type: 'ActiveCaloriesBurned',
        startTime: record.startTime,
        endTime: record.endTime,
        energyKcal: record.energy.inKilocalories,
        ...(record.metadata?.dataOrigin ? { source: record.metadata.dataOrigin } : {}),
      }),
    ),
  );

  const tasks: Array<{ type: string; promise: Promise<NormalizedRecord[]> }> = [
    { type: 'Steps', promise: steps },
    { type: 'HeartRate', promise: heartRate },
    { type: 'RestingHeartRate', promise: restingHeartRate },
    { type: 'SleepSession', promise: sleep },
    { type: 'Weight', promise: weight },
    { type: 'ActiveCaloriesBurned', promise: activeCalories },
  ];

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  const records: NormalizedRecord[] = [];
  const errors: string[] = [];

  settled.forEach((result, index) => {
    const type = tasks[index]?.type ?? 'inconnu';
    if (result.status === 'fulfilled') {
      records.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${type} : ${message}`);
    }
  });

  return { window, records, errors };
}

export function openHealthConnectSettingsScreen(): void {
  openHealthConnectSettings();
}
