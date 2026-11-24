import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openChargeLogStore, type ChargeLogStore } from './store';

let dbName: string;
let store: ChargeLogStore;

beforeEach(async () => {
  dbName = `chargelog-test-${crypto.randomUUID()}`;
  store = await openChargeLogStore(dbName);
});

afterEach(async () => {
  await store.destroy();
});

describe('settings', () => {
  it('follows the system theme on a fresh install', async () => {
    const settings = await store.getSettings();

    expect(settings.themePreference).toBe('system');
  });

  it('keeps the chosen theme after the app is reopened', async () => {
    await store.updateSettings({ themePreference: 'dark' });
    store.close();

    store = await openChargeLogStore(dbName);
    const settings = await store.getSettings();

    expect(settings.themePreference).toBe('dark');
  });

  it('notifies watchers when the theme changes', async () => {
    const seen: string[] = [];
    const subscription = store.watchSettings().subscribe((settings) => {
      seen.push(settings.themePreference);
    });

    await vi.waitFor(() => expect(seen).toEqual(['system']));
    await store.updateSettings({ themePreference: 'light' });
    await vi.waitFor(() => expect(seen).toEqual(['system', 'light']));

    subscription.unsubscribe();
  });
});

describe('vehicles', () => {
  it('lists an added vehicle and makes the first one the default', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

    const vehicles = await store.listVehicles();

    expect(vehicles).toEqual([
      expect.objectContaining({ name: 'ID.3', batteryCapacityKwh: 58, isDefault: true }),
    ]);
  });

  it('keeps the existing default when another vehicle is added', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });

    expect(await defaultVehicleNames()).toEqual(['ID.3']);
  });

  it('rejects a vehicle whose name is already taken, ignoring case and spaces', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

    await expect(store.addVehicle({ name: ' id.3 ', batteryCapacityKwh: 77 })).rejects.toThrow(
      'Es gibt bereits ein Fahrzeug mit dem Namen „ID.3“.',
    );
    expect(await store.listVehicles()).toHaveLength(1);
  });

  it.each([
    [{ name: '  ', batteryCapacityKwh: 58 }, 'Bitte gib einen Namen ein.'],
    [{ name: 'ID.3', batteryCapacityKwh: 0 }, 'Die Akkukapazität muss größer als 0 kWh sein.'],
    [{ name: 'ID.3', batteryCapacityKwh: Number.NaN }, 'Die Akkukapazität muss größer als 0 kWh sein.'],
  ])('rejects an incomplete vehicle %o', async (vehicle, message) => {
    await expect(store.addVehicle(vehicle)).rejects.toThrow(message);
    expect(await store.listVehicles()).toHaveLength(0);
  });

  it('changes the name and battery capacity of a vehicle', async () => {
    const vehicle = await store.addVehicle({ name: 'ID3', batteryCapacityKwh: 58 });

    await store.updateVehicle(vehicle.id, { name: 'ID.3 Pro', batteryCapacityKwh: 59 });

    expect(await store.listVehicles()).toEqual([
      { id: vehicle.id, name: 'ID.3 Pro', batteryCapacityKwh: 59, isDefault: true },
    ]);
  });

  it('rejects renaming a vehicle to the name of another one', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });

    await expect(
      store.updateVehicle(outlander.id, { name: 'ID.3', batteryCapacityKwh: 20 }),
    ).rejects.toThrow('Es gibt bereits ein Fahrzeug mit dem Namen „ID.3“.');
  });

  it('lets a vehicle keep its own name with different capitalisation', async () => {
    const vehicle = await store.addVehicle({ name: 'id.3', batteryCapacityKwh: 58 });

    await store.updateVehicle(vehicle.id, { name: 'ID.3', batteryCapacityKwh: 58 });

    expect((await store.listVehicles())[0]?.name).toBe('ID.3');
  });

  it('moves the default to the chosen vehicle', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });

    await store.setDefaultVehicle(outlander.id);

    expect(await defaultVehicleNames()).toEqual(['Outlander']);
  });

  it('keeps the default when asked to make a vanished vehicle the default', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

    await store.setDefaultVehicle(999);

    expect(await defaultVehicleNames()).toEqual(['ID.3']);
  });

  it('removes a deleted vehicle', async () => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });

    await store.deleteVehicle(outlander.id);

    expect((await store.listVehicles()).map((v) => v.name)).toEqual(['ID.3']);
    expect(await defaultVehicleNames()).toEqual(['ID.3']);
  });

  it('promotes another vehicle when the default vehicle is deleted', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });

    await store.deleteVehicle(id3.id);

    expect(await defaultVehicleNames()).toEqual(['Outlander']);
  });

  it('deletes the charging sessions of a deleted vehicle, and only those', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });
    await insertSessionFixtures([
      { vehicleId: id3.id, date: '2026-11-01' },
      { vehicleId: id3.id, date: '2026-11-08' },
      { vehicleId: outlander.id, date: '2026-11-02' },
    ]);
    expect(await store.countSessions(id3.id)).toBe(2);

    await store.deleteVehicle(id3.id);

    expect(await store.countSessions(id3.id)).toBe(0);
    expect(await store.countSessions(outlander.id)).toBe(1);
  });

  it('notifies watchers when vehicles change', async () => {
    const seen: string[][] = [];
    const subscription = store.watchVehicles().subscribe((vehicles) => {
      seen.push(vehicles.map((vehicle) => vehicle.name));
    });

    await vi.waitFor(() => expect(seen).toEqual([[]]));
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await vi.waitFor(() => expect(seen).toEqual([[], ['ID.3']]));

    subscription.unsubscribe();
  });
});

/**
 * Writes charging sessions straight into the database, because the store has
 * no API to log sessions yet. Replace with `store.addSession` once it exists
 * (kraemer81/chargelog#4).
 */
async function insertSessionFixtures(sessions: { vehicleId: number; date: string }[]) {
  const raw = new Dexie(dbName);
  await raw.open();
  await raw.table('sessions').bulkAdd(sessions);
  raw.close();
}

async function defaultVehicleNames(): Promise<string[]> {
  const vehicles = await store.listVehicles();
  return vehicles.filter((vehicle) => vehicle.isDefault).map((vehicle) => vehicle.name);
}
