import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  themePreference: ThemePreference;
}

const DEFAULT_SETTINGS: Settings = {
  themePreference: 'system',
};

interface SettingRow {
  key: keyof Settings;
  value: Settings[keyof Settings];
}

class ChargeLogDb extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: 'key',
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
  close(): void;
  /** Deletes the underlying database. Intended for tests. */
  destroy(): Promise<void>;
}

export async function openChargeLogStore(name = 'chargelog'): Promise<ChargeLogStore> {
  const db = new ChargeLogDb(name);
  await db.open();

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

    close() {
      db.close();
    },

    async destroy() {
      await db.delete();
    },
  };
}
