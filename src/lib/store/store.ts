import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';

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

/** The charging sessions matching a filter, newest first, and their totals. */
export interface History {
  sessions: ChargingSession[];
  totals: SessionTotals;
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

function roundTo2Decimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface SettingRow {
  key: keyof Settings;
  value: Settings[keyof Settings];
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
  /** Replaces name and battery capacity; existing charging sessions are not recalculated. */
  updateVehicle(id: number, changes: NewVehicle): Promise<void>;
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
  close(): void;
  /** Deletes the underlying database. Intended for tests. */
  destroy(): Promise<void>;
}

export async function openChargeLogStore(name = 'chargelog'): Promise<ChargeLogStore> {
  const db = new ChargeLogDb(name);
  await db.open();

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
    const key = name.toLocaleLowerCase('de');
    const clash = await db.vehicles
      .filter((v) => v.id !== ownId && v.name.toLocaleLowerCase('de') === key)
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
    const note = values.note?.trim();
    return {
      vehicleId: values.vehicleId,
      date: values.date,
      startPercent: values.startPercent,
      endPercent: values.endPercent,
      ...(note ? { note } : {}),
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
    return { sessions, totals: totalsOf(sessions) };
  }

  return {
    getSettings: readSettings,

    watchSettings() {
      return liveQuery(readSettings);
    },

    async updateSettings(changes) {
      validateSettings(changes);
      const rows = Object.entries(changes).map(
        ([key, value]) => ({ key, value }) as SettingRow,
      );
      await db.settings.bulkPut(rows);
    },

    listVehicles() {
      return db.vehicles.toArray();
    },

    watchVehicles() {
      return liveQuery(() => db.vehicles.toArray());
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

    async updateVehicle(id, changes) {
      await db.transaction('rw', db.vehicles, async () => {
        const valid = await validateVehicle(changes, id);
        await db.vehicles.update(id, valid);
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
      return db.transaction('rw', db.vehicles, db.settings, db.sessions, async () => {
        const row = await sessionRow({
          ...values,
          ...(rates ?? defaultRates(await readSettings())),
        });
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
      return liveQuery(() => db.sessions.orderBy('date').reverse().limit(limit).toArray());
    },

    async deleteSession(id) {
      await db.sessions.delete(id);
    },

    getHistory: readHistory,

    watchHistory(filter) {
      return liveQuery(() => readHistory(filter));
    },

    countSessions(vehicleId) {
      return db.sessions.where('vehicleId').equals(vehicleId).count();
    },

    close() {
      db.close();
    },

    async destroy() {
      await db.delete();
    },
  };
}
