import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  themePreference: ThemePreference;
}

const DEFAULT_SETTINGS: Settings = {
  themePreference: 'system',
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

/** Charging session row; fields beyond the vehicle link arrive with session logging. */
interface SessionRow {
  id: number;
  vehicleId: number;
}

interface SettingRow {
  key: keyof Settings;
  value: Settings[keyof Settings];
}

class ChargeLogDb extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>;
  vehicles!: EntityTable<Vehicle, 'id'>;
  sessions!: EntityTable<SessionRow, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: 'key',
    });
    this.version(2).stores({
      vehicles: '++id',
      sessions: '++id, vehicleId',
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
