import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';
import { todayIsoDate } from '../format';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  themePreference: ThemePreference;
  /** Electricity price in € per kWh, snapshotted into each new charging session. */
  defaultPricePerKwh: number;
  /** Share of grid energy lost while charging, in %, snapshotted into each new charging session. */
  defaultChargingLossPercent: number;
}

/** Price and charging loss that together turn charged energy into grid energy and cost. */
export interface ChargingRates {
  /** Electricity price in € per kWh. */
  pricePerKwh: number;
  /** Share of grid energy lost while charging, in %. */
  chargingLossPercent: number;
}

/** The rates a new charging session gets unless they are overridden. */
export function defaultRates(settings: Settings): ChargingRates {
  return {
    pricePerKwh: settings.defaultPricePerKwh,
    chargingLossPercent: settings.defaultChargingLossPercent,
  };
}

const DEFAULT_SETTINGS: Settings = {
  themePreference: 'system',
  defaultPricePerKwh: 0.3,
  defaultChargingLossPercent: 10,
};

export interface Vehicle {
  id: number;
  name: string;
  /** Usable battery capacity in kWh. */
  batteryCapacityKwh: number;
  isDefault: boolean;
}

export interface NewVehicle {
  name: string;
  batteryCapacityKwh: number;
}

/**
 * A rejected store operation. The message is German and meant to be shown to
 * the user as-is.
 */
export class ValidationError extends Error {
  override name = 'ValidationError';
}

/** What the user enters to log a charging session. */
export interface NewChargingSession {
  vehicleId: number;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** State of charge before charging, 0–100. */
  startPercent: number;
  /** State of charge after charging, greater than `startPercent`, at most 100. */
  endPercent: number;
  note?: string;
  /** Overrides the default rates for this session only. */
  rates?: ChargingRates;
}

/**
 * A logged charging session. Price and charging loss are snapshots taken when
 * it was saved, so later changes to the defaults never alter it.
 */
export interface ChargingSession extends Omit<NewChargingSession, 'rates'>, ChargingRates {
  id: number;
  /** Energy drawn from the grid, losses included, rounded to 2 decimals. */
  gridEnergyKwh: number;
  /** `gridEnergyKwh` × `pricePerKwh`, rounded to 2 decimals. */
  costEur: number;
}

/** Everything about a logged session that can be edited; energy and cost follow from it. */
export type SessionChanges = Omit<NewChargingSession, 'rates'> & ChargingRates;

/** The session values grid energy and cost are calculated from. */
const CALCULATION_INPUTS = [
  'vehicleId',
  'startPercent',
  'endPercent',
  'pricePerKwh',
  'chargingLossPercent',
] as const satisfies readonly (keyof SessionChanges)[];

/** Which charging sessions the history shows; unset fields don't restrict. */
export interface SessionFilter {
  vehicleId?: number;
  /** First included date, `YYYY-MM-DD`. */
  from?: string;
  /** Last included date, `YYYY-MM-DD`. */
  to?: string;
}

export interface SessionTotals {
  sessionCount: number;
  gridEnergyKwh: number;
  batteryEnergyKwh: number;
  costEur: number;
}

/** Totals of the sessions in one calendar month. */
export interface MonthTotals extends SessionTotals {
  /** `YYYY-MM` */
  month: string;
}

/** Totals of the sessions in one calendar year. */
export interface YearTotals extends SessionTotals {
  /** `YYYY` */
  year: string;
}

/**
 * The charging sessions matching a filter, newest first, their totals, and
 * their totals per month and per year of the filtered range, oldest first;
 * months and years without sessions are zero. Without a
 * start date the range starts with the first matching session; without an end
 * date it ends with the current month, or a later session.
 */
export interface History {
  sessions: ChargingSession[];
  totals: SessionTotals;
  months: MonthTotals[];
  years: YearTotals[];
}

/**
 * Energy that went into the battery, rounded to 2 decimals. Derived from the
 * session's stored grid energy and charging loss, so it stays consistent with
 * them even after the vehicle's battery capacity changed.
 */
export function batteryEnergyKwh(session: ChargingSession): number {
  return roundTo2Decimals(session.gridEnergyKwh / (1 + session.chargingLossPercent / 100));
}

function totalsOf(sessions: ChargingSession[]): SessionTotals {
  const sum = (value: (session: ChargingSession) => number) =>
    roundTo2Decimals(sessions.reduce((total, session) => total + value(session), 0));
  return {
    sessionCount: sessions.length,
    gridEnergyKwh: sum((s) => s.gridEnergyKwh),
    batteryEnergyKwh: sum(batteryEnergyKwh),
    costEur: sum((s) => s.costEur),
  };
}

/** Every month from `first` to `last` (both `YYYY-MM`, inclusive). */
function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  let [year, month] = first.split('-').map(Number) as [number, number];
  for (let current = first; current <= last; ) {
    months.push(current);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    current = `${year}-${String(month).padStart(2, '0')}`;
  }
  return months;
}

/** Totals per month and per year from `first` to `last` (`YYYY-MM`); see `History`. */
function periodTotalsBetween(
  sessions: ChargingSession[],
  first: string,
  last: string,
): Pick<History, 'months' | 'years'> {
  const byMonth = Map.groupBy(sessions, (session) => session.date.slice(0, 7));
  const byYear = Map.groupBy(sessions, (session) => session.date.slice(0, 4));
  const months = monthsBetween(first, last);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  return {
    months: months.map((month) => ({ month, ...totalsOf(byMonth.get(month) ?? []) })),
    years: years.map((year) => ({ year, ...totalsOf(byYear.get(year) ?? []) })),
  };
}

export interface ChargeInput extends ChargingRates {
  batteryCapacityKwh: number;
  startPercent: number;
  endPercent: number;
}

/**
 * Grid energy and cost of a charge. The single source for both the live
 * preview and the values stored with a session, so the two always agree.
 */
export function calculateCharge(input: ChargeInput): { gridEnergyKwh: number; costEur: number } {
  const chargedKwh = (input.batteryCapacityKwh * (input.endPercent - input.startPercent)) / 100;
  const gridEnergyKwh = roundTo2Decimals(chargedKwh * (1 + input.chargingLossPercent / 100));
  const costEur = roundTo2Decimals(gridEnergyKwh * input.pricePerKwh);
  return { gridEnergyKwh, costEur };
}

/** The result of checking what the user entered for a charge. */
export interface ChargeCheck {
  /** German message per invalid input; a valid input has none. */
  problems: { percentage?: string; pricePerKwh?: string; chargingLossPercent?: string };
  /** The first of `problems`, if any. */
  problem?: string;
  /** Grid energy and cost, present only when there is no problem. */
  charge?: { gridEnergyKwh: number; costEur: number };
}

/**
 * Validates percentages and rates and, if they are valid, calculates the
 * charge. The single check behind both the live preview and saving.
 */
export function checkCharge(input: ChargeInput): ChargeCheck {
  const problems = {
    percentage: percentageError(input.startPercent, input.endPercent),
    pricePerKwh: priceError(input.pricePerKwh),
    chargingLossPercent: chargingLossError(input.chargingLossPercent),
  };
  const problem = problems.percentage ?? problems.pricePerKwh ?? problems.chargingLossPercent;
  return problem ? { problems, problem } : { problems, charge: calculateCharge(input) };
}

/**
 * Why a start/end pair of a charging session can't be saved, as a German
 * message for the user, or `undefined` if it is valid.
 */
function percentageError(startPercent: number, endPercent: number): string | undefined {
  if (!(startPercent >= 0 && startPercent <= 100)) {
    return 'Der Start muss zwischen 0 und 100 % liegen.';
  }
  if (!(endPercent >= 0 && endPercent <= 100)) {
    return 'Das Ende muss zwischen 0 und 100 % liegen.';
  }
  if (endPercent <= startPercent) {
    return 'Das Ende muss über dem Start liegen.';
  }
  return undefined;
}

/** Why a price per kWh can't be used, as a German message, or `undefined` if it is valid. */
function priceError(pricePerKwh: number): string | undefined {
  return Number.isFinite(pricePerKwh) && pricePerKwh >= 0
    ? undefined
    : 'Bitte gib einen Preis von mindestens 0 € ein.';
}

/** Why a charging loss can't be used, as a German message, or `undefined` if it is valid. */
function chargingLossError(chargingLossPercent: number): string | undefined {
  return chargingLossPercent >= 0 && chargingLossPercent < 100
    ? undefined
    : 'Der Ladeverlust muss zwischen 0 und 100 % liegen.';
}

/** Throws a `ValidationError` for the first of `problems` that is set. */
function assertValid(...problems: (string | undefined)[]): void {
  const problem = problems.find((p) => p !== undefined);
  if (problem) throw new ValidationError(problem);
}

/** True for a real calendar date written as `YYYY-MM-DD`. */
function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** Vehicle names are unique regardless of case. */
function vehicleNameKey(name: string): string {
  return name.toLocaleLowerCase('de');
}

/** A note as stored: trimmed, and left out (`{}`) if blank. */
function noteField(note: string | undefined): { note?: string } {
  const trimmed = note?.trim();
  return trimmed ? { note: trimmed } : {};
}

function roundTo2Decimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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

/** The text of a backup file. */
export function writeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Parses and checks the text of a backup file. Throws a `ValidationError`
 * with a German message if it is not a valid ChargeLog backup.
 */
export function readBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ValidationError('Die Datei ist keine gültige Sicherung.');
  }
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

const THEME_PREFERENCES: readonly unknown[] = ['system', 'light', 'dark'] satisfies ThemePreference[];

function backupSettings(data: unknown): Settings {
  assertBackup(isRecord(data));
  const { themePreference, defaultPricePerKwh, defaultChargingLossPercent } = data as Record<
    string,
    unknown
  >;
  assertBackup(
    THEME_PREFERENCES.includes(themePreference),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface SettingRow {
  key: keyof Settings;
  value: Settings[keyof Settings];
}

function settingRows(settings: Partial<Settings>): SettingRow[] {
  return Object.entries(settings).map(([key, value]) => ({ key, value }) as SettingRow);
}

class ChargeLogDb extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>;
  vehicles!: EntityTable<Vehicle, 'id'>;
  sessions!: EntityTable<ChargingSession, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: 'key',
    });
    this.version(2).stores({
      vehicles: '++id',
      sessions: '++id, vehicleId',
    });
    this.version(3).stores({
      sessions: '++id, vehicleId, date, [vehicleId+date]',
    });
  }
}

/**
 * A read that failed or is taking unusually long. Without it, a broken read
 * just leaves the UI empty. `data` names what was being read, in German.
 */
export interface ReadProblem {
  data: string;
  kind: 'failed' | 'slow';
  /** Technical details, e.g. the error name and message. */
  detail: string;
}

export interface StoreOptions {
  /** After how long an unfinished read is reported as slow. */
  slowReadMs?: number;
  /** The current local date, `YYYY-MM-DD`. */
  today?: () => string;
}

/**
 * The ChargeLog store: the single entry point for all domain behaviour and
 * persistence. UI code talks to this module only, never to Dexie directly.
 */
export interface ChargeLogStore {
  getSettings(): Promise<Settings>;
  /** Emits the current settings and again after every change. */
  watchSettings(): Observable<Settings>;
  updateSettings(changes: Partial<Settings>): Promise<void>;
  listVehicles(): Promise<Vehicle[]>;
  /** Emits the current vehicles and again after every change. */
  watchVehicles(): Observable<Vehicle[]>;
  addVehicle(vehicle: NewVehicle): Promise<Vehicle>;
  /**
   * Replaces name and battery capacity. Existing charging sessions keep their
   * grid energy and cost unless `recalculateSessions` is set: then this
   * vehicle's sessions are recalculated with the new capacity and each
   * session's own price and charging loss.
   */
  updateVehicle(
    id: number,
    changes: NewVehicle,
    options?: { recalculateSessions?: boolean },
  ): Promise<void>;
  /** Makes this vehicle the only default vehicle. */
  setDefaultVehicle(id: number): Promise<void>;
  /** Deletes the vehicle together with all of its charging sessions. */
  deleteVehicle(id: number): Promise<void>;
  /**
   * Logs a charging session with a snapshot of the current default price and
   * charging loss (unless overridden for this session), and the grid energy
   * and cost calculated from them. The defaults themselves are not changed.
   */
  addSession(session: NewChargingSession): Promise<ChargingSession>;
  /**
   * Emits the `limit` most recent sessions of all vehicles, newest date first
   * (later entries first within a day), and again after every change.
   */
  watchRecentSessions(limit: number): Observable<ChargingSession[]>;
  /**
   * Replaces the session's values. If the vehicle, percentages, price or
   * charging loss changed, grid energy and cost are recalculated from the
   * session's own price and charging loss and its vehicle's current battery
   * capacity; otherwise they are kept as stored.
   */
  updateSession(id: number, changes: SessionChanges): Promise<ChargingSession>;
  deleteSession(id: number): Promise<void>;
  /** Sessions matching the filter, newest date first (later entries first within a day). */
  getHistory(filter: SessionFilter): Promise<History>;
  /** Emits the history for the filter and again after every change. */
  watchHistory(filter: SessionFilter): Observable<History>;
  /** Number of charging sessions logged for this vehicle. */
  countSessions(vehicleId: number): Promise<number>;
  /** A backup of all settings, vehicles and charging sessions. */
  exportBackup(): Promise<Backup>;
  /** Replaces all data with the backup's, in a single transaction. */
  restoreBackup(backup: Backup): Promise<void>;
  /** Deletes all vehicles and charging sessions and resets the settings to their defaults. */
  deleteAllData(): Promise<void>;
  /** Calls `listener` for every watched read that fails or hangs; returns an unsubscribe function. */
  onReadProblem(listener: (problem: ReadProblem) => void): () => void;
  close(): void;
  /** Deletes the underlying database. Intended for tests. */
  destroy(): Promise<void>;
}

export async function openChargeLogStore(
  name = 'chargelog',
  { slowReadMs = 5000, today = () => todayIsoDate() }: StoreOptions = {},
): Promise<ChargeLogStore> {
  const db = new ChargeLogDb(name);
  await db.open();

  const readProblemListeners = new Set<(problem: ReadProblem) => void>();
  function reportReadProblem(problem: ReadProblem) {
    readProblemListeners.forEach((listener) => listener(problem));
  }

  /** `liveQuery` that reports a failing or hanging `read` of `data`. */
  function watch<T>(data: string, read: () => Promise<T>): Observable<T> {
    return liveQuery(async () => {
      const slowTimer = setTimeout(
        () => reportReadProblem({ data, kind: 'slow', detail: `> ${slowReadMs} ms` }),
        slowReadMs,
      );
      try {
        return await read();
      } catch (e) {
        reportReadProblem({ data, kind: 'failed', detail: String(e) });
        throw e;
      } finally {
        clearTimeout(slowTimer);
      }
    });
  }

  /** Trims the name and rejects values the user has to correct. */
  async function validateVehicle(vehicle: NewVehicle, ownId?: number): Promise<NewVehicle> {
    const name = vehicle.name.trim();
    if (name === '') {
      throw new ValidationError('Bitte gib einen Namen ein.');
    }
    if (!(vehicle.batteryCapacityKwh > 0)) {
      throw new ValidationError('Die Akkukapazität muss größer als 0 kWh sein.');
    }
    await assertNameAvailable(name, ownId);
    return { name, batteryCapacityKwh: vehicle.batteryCapacityKwh };
  }

  /** Rejects `name` if another vehicle (other than `ownId`) already uses it. */
  async function assertNameAvailable(name: string, ownId?: number): Promise<void> {
    const key = vehicleNameKey(name);
    const clash = await db.vehicles
      .filter((v) => v.id !== ownId && vehicleNameKey(v.name) === key)
      .first();
    if (clash) {
      throw new ValidationError(`Es gibt bereits ein Fahrzeug mit dem Namen „${clash.name}“.`);
    }
  }

  /**
   * Validates a session's values and adds the grid energy and cost calculated
   * from them; a blank note is left out. Must run inside a transaction that
   * includes the vehicles table.
   */
  async function sessionRow(values: SessionChanges): Promise<Omit<ChargingSession, 'id'>> {
    assertValid(isIsoDate(values.date) ? undefined : 'Bitte gib ein gültiges Datum ein.');
    const vehicle = await db.vehicles.get(values.vehicleId);
    if (!vehicle) {
      throw new ValidationError('Bitte wähle ein Fahrzeug aus.');
    }
    const rates: ChargingRates = {
      pricePerKwh: values.pricePerKwh,
      chargingLossPercent: values.chargingLossPercent,
    };
    const { problem, charge } = checkCharge({
      batteryCapacityKwh: vehicle.batteryCapacityKwh,
      startPercent: values.startPercent,
      endPercent: values.endPercent,
      ...rates,
    });
    if (!charge) throw new ValidationError(problem);
    return {
      vehicleId: values.vehicleId,
      date: values.date,
      startPercent: values.startPercent,
      endPercent: values.endPercent,
      ...noteField(values.note),
      ...rates,
      ...charge,
    };
  }

  function validateSettings(changes: Partial<Settings>): void {
    const { defaultPricePerKwh: price, defaultChargingLossPercent: loss } = changes;
    assertValid(
      price === undefined ? undefined : priceError(price),
      loss === undefined ? undefined : chargingLossError(loss),
    );
  }

  async function clearAll(): Promise<void> {
    await Promise.all([db.settings.clear(), db.vehicles.clear(), db.sessions.clear()]);
  }

  async function readSettings(): Promise<Settings> {
    const rows = await db.settings.toArray();
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async function readHistory(filter: SessionFilter): Promise<History> {
    const from = filter.from ?? Dexie.minKey;
    const to = filter.to ?? Dexie.maxKey;
    // Both indexes order entries of the same date by id, i.e. by when they were logged.
    const matching =
      filter.vehicleId === undefined
        ? db.sessions.where('date').between(from, to, true, true)
        : db.sessions
            .where('[vehicleId+date]')
            .between([filter.vehicleId, from], [filter.vehicleId, to], true, true);
    const sessions = await matching.reverse().toArray();
    return { sessions, totals: totalsOf(sessions), ...periodTotalsInFilter(sessions, filter) };
  }

  /** Totals per month and per year of the filter's range; see `History`. */
  function periodTotalsInFilter(
    sessions: ChargingSession[],
    filter: SessionFilter,
  ): Pick<History, 'months' | 'years'> {
    const monthOf = (date: string) => date.slice(0, 7);
    const first = filter.from ?? sessions.at(-1)?.date;
    const newest = sessions[0]?.date ?? '';
    const last = filter.to ?? (newest > today() ? newest : today());
    if (!first || last < first) return { months: [], years: [] };
    return periodTotalsBetween(sessions, monthOf(first), monthOf(last));
  }

  return {
    getSettings: readSettings,

    watchSettings() {
      return watch('Einstellungen', readSettings);
    },

    async updateSettings(changes) {
      validateSettings(changes);
      await db.settings.bulkPut(settingRows(changes));
    },

    listVehicles() {
      return db.vehicles.toArray();
    },

    watchVehicles() {
      return watch('Fahrzeuge', () => db.vehicles.toArray());
    },

    async addVehicle(vehicle) {
      return db.transaction('rw', db.vehicles, async () => {
        const valid = await validateVehicle(vehicle);
        const isFirst = (await db.vehicles.count()) === 0;
        const row = { ...valid, isDefault: isFirst };
        const id = await db.vehicles.add(row as Vehicle);
        return { ...row, id };
      });
    },

    async updateVehicle(id, changes, { recalculateSessions = false } = {}) {
      await db.transaction('rw', db.vehicles, db.sessions, async () => {
        const valid = await validateVehicle(changes, id);
        await db.vehicles.update(id, valid);
        if (!recalculateSessions) return;
        await db.sessions
          .where('vehicleId')
          .equals(id)
          .modify((session) => {
            Object.assign(
              session,
              calculateCharge({ ...session, batteryCapacityKwh: valid.batteryCapacityKwh }),
            );
          });
      });
    },

    async setDefaultVehicle(id) {
      await db.transaction('rw', db.vehicles, async () => {
        if (!(await db.vehicles.get(id))) return;
        await db.vehicles.toCollection().modify((vehicle) => {
          vehicle.isDefault = vehicle.id === id;
        });
      });
    },

    async deleteVehicle(id) {
      await db.transaction('rw', db.vehicles, db.sessions, async () => {
        const vehicle = await db.vehicles.get(id);
        if (!vehicle) return;
        await db.sessions.where('vehicleId').equals(id).delete();
        await db.vehicles.delete(id);
        if (vehicle.isDefault) {
          const successor = await db.vehicles.orderBy('id').first();
          if (successor) await db.vehicles.update(successor.id, { isDefault: true });
        }
      });
    },

    async addSession(session) {
      const { rates, ...values } = session;
      // Read the defaults beforehand, so the write doesn't lock the settings:
      // a stuck settings transaction elsewhere must not block saving.
      const sessionRates = rates ?? defaultRates(await readSettings());
      return db.transaction('rw', db.vehicles, db.sessions, async () => {
        const row = await sessionRow({ ...values, ...sessionRates });
        const id = await db.sessions.add(row as ChargingSession);
        return { ...row, id };
      });
    },

    async updateSession(id, changes) {
      return db.transaction('rw', db.vehicles, db.sessions, async () => {
        const stored = await db.sessions.get(id);
        if (!stored) {
          throw new ValidationError('Diesen Ladevorgang gibt es nicht mehr.');
        }
        const row = await sessionRow(changes);
        // Only a change to what the calculation uses recalculates; otherwise the
        // stored values stay, e.g. those from before a capacity change.
        const recalculate = CALCULATION_INPUTS.some((key) => row[key] !== stored[key]);
        const session = recalculate
          ? { ...row, id }
          : { ...row, id, gridEnergyKwh: stored.gridEnergyKwh, costEur: stored.costEur };
        // `put` rather than `update`, so a removed note is dropped from the row.
        await db.sessions.put(session);
        return session;
      });
    },

    watchRecentSessions(limit) {
      return watch('Letzte Ladevorgänge', () =>
        db.sessions.orderBy('date').reverse().limit(limit).toArray(),
      );
    },

    async deleteSession(id) {
      await db.sessions.delete(id);
    },

    getHistory: readHistory,

    watchHistory(filter) {
      return watch('Verlauf', () => readHistory(filter));
    },

    countSessions(vehicleId) {
      return db.sessions.where('vehicleId').equals(vehicleId).count();
    },

    async exportBackup() {
      return db.transaction('r', db.settings, db.vehicles, db.sessions, async () => ({
        format: BACKUP_FORMAT,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: await readSettings(),
        vehicles: await db.vehicles.toArray(),
        sessions: await db.sessions.toArray(),
      }));
    },

    async restoreBackup(backup) {
      await db.transaction('rw', db.settings, db.vehicles, db.sessions, async () => {
        await clearAll();
        await db.settings.bulkAdd(settingRows(backup.settings));
        await db.vehicles.bulkAdd(backup.vehicles);
        await db.sessions.bulkAdd(backup.sessions);
      });
    },

    async deleteAllData() {
      await db.transaction('rw', db.settings, db.vehicles, db.sessions, clearAll);
    },

    onReadProblem(listener) {
      readProblemListeners.add(listener);
      return () => readProblemListeners.delete(listener);
    },

    close() {
      db.close();
    },

    async destroy() {
      await db.delete();
    },
  };
}
