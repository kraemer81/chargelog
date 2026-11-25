/** The ChargeLog backup file: its format, and the check of a file read back. */
import {
  chargingLossError,
  isIsoDate,
  isRecord,
  noteField,
  percentageError,
  priceError,
  THEME_PREFERENCES,
  ValidationError,
  vehicleNameKey,
  type ThemePreference,
} from './rules';
import { fromLegacyExport, isLegacyExport } from './legacyBackup';
import type { ChargingSession, Settings, Vehicle } from './store';

/** Identifies a ChargeLog backup file. */
const BACKUP_FORMAT = 'chargelog-backup';
/** Version of the backup's structure; raised whenever it changes incompatibly. */
const BACKUP_SCHEMA_VERSION = 1;

/** Everything the store holds, as written to and read from a backup file. */
export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  /** When the backup was made, ISO 8601. */
  exportedAt: string;
  settings: Settings;
  vehicles: Vehicle[];
  sessions: ChargingSession[];
}

/** A backup of the given data, made now. */
export function createBackup(data: Pick<Backup, 'settings' | 'vehicles' | 'sessions'>): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
  };
}

/** The text of a backup file. */
export function writeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Parses and checks the text of a backup file: a ChargeLog backup, or an
 * export of the old EV-Charter app, which is converted first. Throws a
 * `ValidationError` with a German message if it is neither, or not valid.
 */
export function readBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError('Die Datei ist keine gültige Sicherung.');
  }
  const data = isLegacyExport(parsed)
    ? { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, ...fromLegacyExport(parsed) }
    : parsed;
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) {
    throw new ValidationError('Die Datei ist keine ChargeLog-Sicherung.');
  }
  if (typeof data.schemaVersion === 'number' && data.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new ValidationError(
      'Die Sicherung stammt aus einer neueren Version von ChargeLog. Bitte aktualisiere die App.',
    );
  }
  if (
    data.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    typeof data.exportedAt !== 'string' ||
    Number.isNaN(Date.parse(data.exportedAt))
  ) {
    throw corruptBackup();
  }
  const vehicles = backupVehicles(data.vehicles);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: data.exportedAt,
    settings: backupSettings(data.settings),
    vehicles,
    sessions: backupSessions(data.sessions, vehicles),
  };
}

function corruptBackup(): ValidationError {
  return new ValidationError('Die Sicherung ist beschädigt oder unvollständig.');
}

/** Throws a corrupt-backup error unless every condition holds. */
function assertBackup(...conditions: boolean[]): void {
  if (!conditions.every(Boolean)) throw corruptBackup();
}

function backupSettings(data: unknown): Settings {
  assertBackup(isRecord(data));
  const { themePreference, defaultPricePerKwh, defaultChargingLossPercent } = data as Record<
    string,
    unknown
  >;
  assertBackup(
    (THEME_PREFERENCES as readonly unknown[]).includes(themePreference),
    isNumber(defaultPricePerKwh) && !priceError(defaultPricePerKwh),
    isNumber(defaultChargingLossPercent) && !chargingLossError(defaultChargingLossPercent),
  );
  return {
    themePreference: themePreference as ThemePreference,
    defaultPricePerKwh: defaultPricePerKwh as number,
    defaultChargingLossPercent: defaultChargingLossPercent as number,
  };
}

/** The backup's vehicles: unique ids and names, and exactly one default if there are any. */
function backupVehicles(data: unknown): Vehicle[] {
  assertBackup(Array.isArray(data));
  const vehicles = (data as unknown[]).map((item): Vehicle => {
    assertBackup(isRecord(item));
    const { id, name, batteryCapacityKwh, isDefault } = item as Record<string, unknown>;
    assertBackup(
      isId(id),
      typeof name === 'string' && name.trim() !== '',
      isNumber(batteryCapacityKwh) && batteryCapacityKwh > 0,
      typeof isDefault === 'boolean',
    );
    return {
      id: id as number,
      name: (name as string).trim(),
      batteryCapacityKwh: batteryCapacityKwh as number,
      isDefault: isDefault as boolean,
    };
  });
  assertBackup(
    isUnique(vehicles.map((v) => v.id)),
    isUnique(vehicles.map((v) => vehicleNameKey(v.name))),
    vehicles.length === 0 || vehicles.filter((v) => v.isDefault).length === 1,
  );
  return vehicles;
}

/** The backup's sessions: unique ids, each of one of `vehicles`. */
function backupSessions(data: unknown, vehicles: Vehicle[]): ChargingSession[] {
  assertBackup(Array.isArray(data));
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const sessions = (data as unknown[]).map((item): ChargingSession => {
    assertBackup(isRecord(item));
    const s = item as Record<string, unknown>;
    const { startPercent, endPercent, pricePerKwh, chargingLossPercent } = s;
    const { gridEnergyKwh, costEur, note } = s;
    assertBackup(
      isId(s.id),
      vehicleIds.has(s.vehicleId as number),
      typeof s.date === 'string' && isIsoDate(s.date),
      isNumber(startPercent) && isNumber(endPercent) && !percentageError(startPercent, endPercent),
      isNumber(pricePerKwh) && !priceError(pricePerKwh),
      isNumber(chargingLossPercent) && !chargingLossError(chargingLossPercent),
      isNumber(gridEnergyKwh) && gridEnergyKwh >= 0,
      isNumber(costEur) && costEur >= 0,
      note === undefined || typeof note === 'string',
    );
    return {
      id: s.id as number,
      vehicleId: s.vehicleId as number,
      date: s.date as string,
      startPercent: startPercent as number,
      endPercent: endPercent as number,
      ...noteField(note as string | undefined),
      pricePerKwh: pricePerKwh as number,
      chargingLossPercent: chargingLossPercent as number,
      gridEnergyKwh: gridEnergyKwh as number,
      costEur: costEur as number,
    };
  });
  assertBackup(isUnique(sessions.map((session) => session.id)));
  return sessions;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isUnique(values: unknown[]): boolean {
  return new Set(values).size === values.length;
}
