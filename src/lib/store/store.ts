import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  themePreference: ThemePreference;
  /** Electricity price in € per kWh, snapshotted into each new charging session. */
  defaultPricePerKwh: number;
  /** Share of grid energy lost while charging, in %, snapshotted into each new charging session. */
  defaultChargingLossPercent: number;
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
}

/**
 * A logged charging session. Price and charging loss are snapshots taken when
 * it was saved, so later changes to the defaults never alter it.
 */
export interface ChargingSession extends NewChargingSession {
  id: number;
  pricePerKwh: number;
  chargingLossPercent: number;
  /** Energy drawn from the grid, losses included, rounded to 2 decimals. */
  gridEnergyKwh: number;
  /** `gridEnergyKwh` × `pricePerKwh`, rounded to 2 decimals. */
  costEur: number;
}

export interface ChargeInput {
  batteryCapacityKwh: number;
  startPercent: number;
  endPercent: number;
  chargingLossPercent: number;
  pricePerKwh: number;
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

/**
 * Why a start/end pair of a charging session can't be saved, as a German
 * message for the user, or `undefined` if it is valid.
 */
export function percentageError(startPercent: number, endPercent: number): string | undefined {
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
   * charging loss, and the grid energy and cost calculated from them.
   */
  addSession(session: NewChargingSession): Promise<ChargingSession>;
  /**
   * Emits the `limit` most recent sessions of all vehicles, newest date first
   * (later entries first within a day), and again after every change.
   */
  watchRecentSessions(limit: number): Observable<ChargingSession[]>;
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

  function validateSettings(changes: Partial<Settings>): void {
    const { defaultPricePerKwh: price, defaultChargingLossPercent: loss } = changes;
    if (price !== undefined && !(Number.isFinite(price) && price >= 0)) {
      throw new ValidationError('Bitte gib einen Preis von mindestens 0 € ein.');
    }
    if (loss !== undefined && !(loss >= 0 && loss < 100)) {
      throw new ValidationError('Der Ladeverlust muss zwischen 0 und 100 % liegen.');
    }
  }

  async function readSettings(): Promise<Settings> {
    const rows = await db.settings.toArray();
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return { ...DEFAULT_SETTINGS, ...stored };
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
      const problem = percentageError(session.startPercent, session.endPercent);
      if (problem) throw new ValidationError(problem);
      if (!isIsoDate(session.date)) {
        throw new ValidationError('Bitte gib ein gültiges Datum ein.');
      }
      const note = session.note?.trim();
      return db.transaction('rw', db.vehicles, db.settings, db.sessions, async () => {
        const vehicle = await db.vehicles.get(session.vehicleId);
        if (!vehicle) {
          throw new ValidationError('Bitte wähle ein Fahrzeug aus.');
        }
        const settings = await readSettings();
        const pricePerKwh = settings.defaultPricePerKwh;
        const chargingLossPercent = settings.defaultChargingLossPercent;
        const row = {
          vehicleId: session.vehicleId,
          date: session.date,
          startPercent: session.startPercent,
          endPercent: session.endPercent,
          ...(note ? { note } : {}),
          pricePerKwh,
          chargingLossPercent,
          ...calculateCharge({
            batteryCapacityKwh: vehicle.batteryCapacityKwh,
            startPercent: session.startPercent,
            endPercent: session.endPercent,
            chargingLossPercent,
            pricePerKwh,
          }),
        };
        const id = await db.sessions.add(row as ChargingSession);
        return { ...row, id };
      });
    },

    watchRecentSessions(limit) {
      return liveQuery(() => db.sessions.orderBy('date').reverse().limit(limit).toArray());
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
