import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateCharge,
  openChargeLogStore,
  readBackup,
  writeBackup,
  type ChargeLogStore,
  type ChargingRates,
  type ChargingSession,
  type ReadProblem,
  type Settings,
} from './store';

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

  it('offers a default price per kWh and charging loss on a fresh install', async () => {
    const settings = await store.getSettings();

    expect(settings.defaultPricePerKwh).toBe(0.3);
    expect(settings.defaultChargingLossPercent).toBe(10);
  });

  it('keeps a changed default price and charging loss', async () => {
    await store.updateSettings({ defaultPricePerKwh: 0.32, defaultChargingLossPercent: 12 });

    const settings = await store.getSettings();

    expect(settings.defaultPricePerKwh).toBe(0.32);
    expect(settings.defaultChargingLossPercent).toBe(12);
  });

  it.each([
    [{ defaultPricePerKwh: -0.1 }, 'Bitte gib einen Preis von mindestens 0 € ein.'],
    [{ defaultPricePerKwh: Number.NaN }, 'Bitte gib einen Preis von mindestens 0 € ein.'],
    [{ defaultChargingLossPercent: -1 }, 'Der Ladeverlust muss zwischen 0 und 100 % liegen.'],
    [{ defaultChargingLossPercent: 100 }, 'Der Ladeverlust muss zwischen 0 und 100 % liegen.'],
  ])('rejects the invalid default %o', async (changes, message) => {
    await expect(store.updateSettings(changes)).rejects.toThrow(message);

    const settings = await store.getSettings();
    expect(settings.defaultPricePerKwh).toBe(0.3);
    expect(settings.defaultChargingLossPercent).toBe(10);
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

  it("recalculates only that vehicle's sessions with their own rates when asked to", async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });
    const cheap = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-23',
      startPercent: 20,
      endPercent: 80,
      rates: { pricePerKwh: 0.3, chargingLossPercent: 10 },
    });
    const dear = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 50,
      endPercent: 100,
      rates: { pricePerKwh: 0.5, chargingLossPercent: 20 },
    });
    const other = await store.addSession({
      vehicleId: outlander.id,
      date: '2026-11-24',
      startPercent: 0,
      endPercent: 100,
    });
    await store.updateSettings({ defaultPricePerKwh: 0.9, defaultChargingLossPercent: 50 });

    await store.updateVehicle(
      id3.id,
      { name: 'ID.3', batteryCapacityKwh: 62 },
      { recalculateSessions: true },
    );

    // 62 kWh × 60 % × 1.1 = 40.92 kWh; × 0.30 €/kWh = 12.28 €.
    // 62 kWh × 50 % × 1.2 = 37.2 kWh; × 0.50 €/kWh = 18.6 €.
    expect((await store.getHistory({})).sessions).toEqual([
      other,
      { ...dear, gridEnergyKwh: 37.2, costEur: 18.6 },
      { ...cheap, gridEnergyKwh: 40.92, costEur: 12.28 },
    ]);
  });

  it('keeps the sessions unchanged when the capacity changes without recalculation', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
    });

    await store.updateVehicle(
      id3.id,
      { name: 'ID.3', batteryCapacityKwh: 62 },
      { recalculateSessions: false },
    );

    expect((await store.getHistory({})).sessions).toEqual([saved]);
    expect((await store.listVehicles())[0]?.batteryCapacityKwh).toBe(62);
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
    const log = (vehicleId: number, date: string) =>
      store.addSession({ vehicleId, date, startPercent: 20, endPercent: 80 });
    await log(id3.id, '2026-11-01');
    await log(id3.id, '2026-11-08');
    await log(outlander.id, '2026-11-02');
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

describe('charging sessions', () => {
  it('saves the grid energy and cost calculated from the current defaults', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.updateSettings({ defaultPricePerKwh: 0.32, defaultChargingLossPercent: 10 });

    const session = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
    });

    expect(session).toEqual({
      id: expect.any(Number),
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
      pricePerKwh: 0.32,
      chargingLossPercent: 10,
      gridEnergyKwh: 38.28,
      costEur: 12.25,
    });
  });

  it('saves an overridden price and charging loss without changing the defaults', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.updateSettings({ defaultPricePerKwh: 0.32, defaultChargingLossPercent: 10 });

    const session = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
      rates: { pricePerKwh: 0.59, chargingLossPercent: 15 },
    });

    expect(session).toMatchObject({
      pricePerKwh: 0.59,
      chargingLossPercent: 15,
      gridEnergyKwh: 40.02,
      costEur: 23.61,
    });
    expect(await store.getSettings()).toMatchObject({
      defaultPricePerKwh: 0.32,
      defaultChargingLossPercent: 10,
    });
  });

  it('uses the defaults again for the session after an overridden one', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.updateSettings({ defaultPricePerKwh: 0.32, defaultChargingLossPercent: 10 });
    const log = (rates?: ChargingRates) =>
      store.addSession({
        vehicleId: id3.id,
        date: '2026-11-24',
        startPercent: 20,
        endPercent: 80,
        rates,
      });

    await log({ pricePerKwh: 0.59, chargingLossPercent: 15 });
    const next = await log();

    expect(next).toMatchObject({ pricePerKwh: 0.32, chargingLossPercent: 10, costEur: 12.25 });
  });

  it.each([
    [-0.1, 10, 'Bitte gib einen Preis von mindestens 0 € ein.'],
    [Number.NaN, 10, 'Bitte gib einen Preis von mindestens 0 € ein.'],
    [0.3, 100, 'Der Ladeverlust muss zwischen 0 und 100 % liegen.'],
    [0.3, Number.NaN, 'Der Ladeverlust muss zwischen 0 und 100 % liegen.'],
  ])(
    'rejects an override of %s €/kWh and %s %% loss',
    async (pricePerKwh, chargingLossPercent, message) => {
      const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

      await expect(
        store.addSession({
          vehicleId: id3.id,
          date: '2026-11-24',
          startPercent: 20,
          endPercent: 80,
          rates: { pricePerKwh, chargingLossPercent },
        }),
      ).rejects.toThrow(message);
      expect(await store.countSessions(id3.id)).toBe(0);
    },
  );

  it('saves exactly the grid energy and cost the preview shows', async () => {
    const vehicle = await store.addVehicle({ name: 'EV6', batteryCapacityKwh: 77 });
    await store.updateSettings({ defaultPricePerKwh: 0.35, defaultChargingLossPercent: 12 });
    const preview = calculateCharge({
      batteryCapacityKwh: 77,
      startPercent: 15,
      endPercent: 85,
      chargingLossPercent: 12,
      pricePerKwh: 0.35,
    });

    const saved = await store.addSession({
      vehicleId: vehicle.id,
      date: '2026-11-24',
      startPercent: 15,
      endPercent: 85,
    });

    expect(preview).toEqual({ gridEnergyKwh: 60.37, costEur: 21.13 });
    expect(saved).toMatchObject(preview);
  });

  it('lists the most recent sessions newest first and updates right after saving', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const log = (date: string, startPercent: number) =>
      store.addSession({ vehicleId: id3.id, date, startPercent, endPercent: 90 });
    await log('2026-11-20', 10);
    await log('2026-11-22', 20);
    await log('2026-11-21', 30);

    const seen: number[][] = [];
    const subscription = store.watchRecentSessions(3).subscribe((sessions) => {
      seen.push(sessions.map((session) => session.startPercent));
    });

    await vi.waitFor(() => expect(seen).toEqual([[20, 30, 10]]));
    // Same day as the newest one: the later entry comes first.
    await log('2026-11-22', 40);
    await vi.waitFor(() => expect(seen).toEqual([[20, 30, 10], [40, 20, 30]]));

    subscription.unsubscribe();
  });

  it.each([
    [-1, 80, 'Der Start muss zwischen 0 und 100 % liegen.'],
    [Number.NaN, 80, 'Der Start muss zwischen 0 und 100 % liegen.'],
    [20, 101, 'Das Ende muss zwischen 0 und 100 % liegen.'],
    [80, 80, 'Das Ende muss über dem Start liegen.'],
    [80, 20, 'Das Ende muss über dem Start liegen.'],
  ])('rejects a session from %s to %s percent', async (startPercent, endPercent, message) => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

    await expect(
      store.addSession({ vehicleId: id3.id, date: '2026-11-24', startPercent, endPercent }),
    ).rejects.toThrow(message);
    expect(await store.countSessions(id3.id)).toBe(0);
  });

  it('accepts a full charge from 0 % to 100 %', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

    const session = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 0,
      endPercent: 100,
    });

    expect(session.gridEnergyKwh).toBe(63.8);
  });

  it('rejects a session for a vehicle that does not exist', async () => {
    await expect(
      store.addSession({ vehicleId: 999, date: '2026-11-24', startPercent: 20, endPercent: 80 }),
    ).rejects.toThrow('Bitte wähle ein Fahrzeug aus.');
  });

  it('saves a trimmed note and leaves out a blank one', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const log = (note: string) =>
      store.addSession({ vehicleId: id3.id, date: '2026-11-24', startPercent: 20, endPercent: 80, note });

    const withNote = await log('  Wallbox Garage ');
    const blank = await log('   ');

    expect(withNote.note).toBe('Wallbox Garage');
    expect(blank).not.toHaveProperty('note');
  });

  it.each(['', '24.11.2026', '2026-13-01'])('rejects the date %o', async (date) => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });

    await expect(
      store.addSession({ vehicleId: id3.id, date, startPercent: 20, endPercent: 80 }),
    ).rejects.toThrow('Bitte gib ein gültiges Datum ein.');
  });

  it('keeps the price, charging loss and cost of saved sessions when the defaults change', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.updateSettings({ defaultPricePerKwh: 0.32, defaultChargingLossPercent: 10 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
    });

    await store.updateSettings({ defaultPricePerKwh: 0.45, defaultChargingLossPercent: 15 });

    expect(await recentSessions()).toEqual([saved]);
  });

  it('saves a session with its own rates while the settings are blocked', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const blocker = await blockSettings();

    const saved = await Promise.race([
      store.addSession({
        vehicleId: id3.id,
        date: '2026-11-25',
        startPercent: 20,
        endPercent: 80,
        rates: { pricePerKwh: 0.3, chargingLossPercent: 10 },
      }),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 200)),
    ]);
    await blocker.release();

    expect(saved).toMatchObject({ vehicleId: id3.id, pricePerKwh: 0.3 });
  });
});

describe('history', () => {
  it('lists all sessions newest first, later entries first within a day', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const log = (date: string, startPercent: number) =>
      store.addSession({ vehicleId: id3.id, date, startPercent, endPercent: 90 });
    await log('2026-11-20', 10);
    await log('2026-11-22', 20);
    await log('2026-11-21', 30);
    await log('2026-11-22', 40);

    const history = await store.getHistory({});

    expect(history.sessions.map((s) => s.startPercent)).toEqual([40, 20, 30, 10]);
  });

  it.each<[{ vehicle?: 'ID.3' | 'EV6'; from?: string; to?: string }, number[]]>([
    [{}, [60, 50, 40, 30, 20, 10]],
    [{ vehicle: 'EV6' }, [50, 20]],
    [{ from: '2026-10-15' }, [60, 50, 40, 30]],
    [{ to: '2026-10-15' }, [30, 20, 10]],
    [{ from: '2026-10-15', to: '2026-11-15' }, [50, 40, 30]],
    [{ vehicle: 'ID.3', from: '2026-10-15', to: '2026-11-15' }, [40, 30]],
    [{ vehicle: 'ID.3', from: '2026-11-15', to: '2026-10-15' }, []],
  ])('filters the history by %o, including both dates', async ({ vehicle, ...dates }, expected) => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const ev6 = await store.addVehicle({ name: 'EV6', batteryCapacityKwh: 77 });
    const vehicles = { 'ID.3': id3.id, EV6: ev6.id };
    const log = (name: keyof typeof vehicles, date: string, startPercent: number) =>
      store.addSession({ vehicleId: vehicles[name], date, startPercent, endPercent: 90 });
    await log('ID.3', '2026-09-30', 10);
    await log('EV6', '2026-10-01', 20);
    await log('ID.3', '2026-10-15', 30);
    await log('ID.3', '2026-10-16', 40);
    await log('EV6', '2026-11-15', 50);
    await log('ID.3', '2026-11-16', 60);

    const history = await store.getHistory({
      ...dates,
      ...(vehicle ? { vehicleId: vehicles[vehicle] } : {}),
    });

    expect(history.sessions.map((s) => s.startPercent)).toEqual(expected);
  });

  it('notifies watchers of a filtered history when a matching session is logged', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const log = (date: string) =>
      store.addSession({ vehicleId: id3.id, date, startPercent: 20, endPercent: 80 });
    await log('2026-11-01');

    const seen: number[] = [];
    const subscription = store
      .watchHistory({ from: '2026-11-01' })
      .subscribe((history) => seen.push(history.totals.sessionCount));

    await vi.waitFor(() => expect(seen).toEqual([1]));
    await log('2026-11-02');
    await vi.waitFor(() => expect(seen).toEqual([1, 2]));

    subscription.unsubscribe();
  });

  it('totals the sessions matching the filter', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const ev6 = await store.addVehicle({ name: 'EV6', batteryCapacityKwh: 77 });
    // 34.8 kWh charged, 38.28 kWh from the grid, 12.25 €.
    await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-01',
      startPercent: 20,
      endPercent: 80,
      rates: { pricePerKwh: 0.32, chargingLossPercent: 10 },
    });
    // 53.9 kWh charged, 60.37 kWh from the grid, 21.13 €.
    await store.addSession({
      vehicleId: ev6.id,
      date: '2026-11-02',
      startPercent: 15,
      endPercent: 85,
      rates: { pricePerKwh: 0.35, chargingLossPercent: 12 },
    });

    const all = await store.getHistory({});
    const onlyEv6 = await store.getHistory({ vehicleId: ev6.id });
    const none = await store.getHistory({ from: '2026-12-01' });

    expect(all.totals).toEqual({
      sessionCount: 2,
      gridEnergyKwh: 98.65,
      batteryEnergyKwh: 88.7,
      costEur: 33.38,
    });
    expect(onlyEv6.totals).toEqual({
      sessionCount: 1,
      gridEnergyKwh: 60.37,
      batteryEnergyKwh: 53.9,
      costEur: 21.13,
    });
    expect(none.totals).toEqual({
      sessionCount: 0,
      gridEnergyKwh: 0,
      batteryEnergyKwh: 0,
      costEur: 0,
    });
  });
});

describe('statistics', () => {
  /** Reopens the store with `today` as the current date. */
  async function reopenOn(today: string) {
    store.close();
    store = await openChargeLogStore(dbName, { today: () => today });
  }

  /** Logs a session of 38.28 kWh from the grid for 12.25 € (ID.3, 20 → 80 %, 0.32 €/kWh, 10 %). */
  async function logStandardCharge(vehicleId: number, date: string) {
    await store.addSession({
      vehicleId,
      date,
      startPercent: 20,
      endPercent: 80,
      rates: { pricePerKwh: 0.32, chargingLossPercent: 10 },
    });
  }

  const ZERO = { sessionCount: 0, gridEnergyKwh: 0, batteryEnergyKwh: 0, costEur: 0 };
  const ONE = { sessionCount: 1, gridEnergyKwh: 38.28, batteryEnergyKwh: 34.8, costEur: 12.25 };
  const TWO = { sessionCount: 2, gridEnergyKwh: 76.56, batteryEnergyKwh: 69.6, costEur: 24.5 };

  it('totals each month of the filtered range, months without sessions as zero', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await logStandardCharge(id3.id, '2026-08-31');
    await logStandardCharge(id3.id, '2026-09-01');
    await logStandardCharge(id3.id, '2026-09-30');
    await logStandardCharge(id3.id, '2026-11-15');

    const history = await store.getHistory({ from: '2026-08-15', to: '2026-12-10' });

    expect(history.months).toEqual([
      { month: '2026-08', ...ONE },
      { month: '2026-09', ...TWO },
      { month: '2026-10', ...ZERO },
      { month: '2026-11', ...ONE },
      { month: '2026-12', ...ZERO },
    ]);
  });

  it('without dates, covers the months from the first session up to the current month', async () => {
    await reopenOn('2026-11-25');
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await logStandardCharge(id3.id, '2026-09-10');

    const history = await store.getHistory({});

    expect(history.months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('without an end date, reaches a session logged after the current month', async () => {
    await reopenOn('2026-11-25');
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await logStandardCharge(id3.id, '2027-01-02');

    const history = await store.getHistory({ from: '2026-11-01' });

    expect(history.months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('totals each year of the filtered range, years without sessions as zero', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await logStandardCharge(id3.id, '2024-12-31');
    await logStandardCharge(id3.id, '2026-01-01');
    await logStandardCharge(id3.id, '2026-12-31');

    const history = await store.getHistory({ from: '2024-12-01', to: '2027-01-31' });

    expect(history.years).toEqual([
      { year: '2024', ...ONE },
      { year: '2025', ...ZERO },
      { year: '2026', ...TWO },
      { year: '2027', ...ZERO },
    ]);
  });

  it('counts only the filtered vehicle in months and years', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const ev6 = await store.addVehicle({ name: 'EV6', batteryCapacityKwh: 77 });
    await logStandardCharge(id3.id, '2026-10-05');
    await logStandardCharge(ev6.id, '2026-10-06');

    const history = await store.getHistory({
      vehicleId: id3.id,
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(history.months).toEqual([{ month: '2026-10', ...ONE }]);
    expect(history.years).toEqual([{ year: '2026', ...ONE }]);
  });

  it('has no months while there is nothing to cover', async () => {
    await reopenOn('2026-11-25');

    expect((await store.getHistory({})).months).toEqual([]);
    expect((await store.getHistory({ to: '2026-11-30' })).months).toEqual([]);
  });

  it('has no months or years when the end date is before the start date', async () => {
    const history = await store.getHistory({ from: '2026-10-20', to: '2026-10-05' });

    expect(history.months).toEqual([]);
    expect(history.years).toEqual([]);
  });
});

describe('editing and deleting sessions', () => {
  it('recalculates grid energy and cost from the edited values', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const ev6 = await store.addVehicle({ name: 'EV6', batteryCapacityKwh: 77 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
      note: 'Garage',
    });

    const edited = await store.updateSession(saved.id, {
      vehicleId: ev6.id,
      date: '2026-11-23',
      startPercent: 15,
      endPercent: 85,
      pricePerKwh: 0.35,
      chargingLossPercent: 12,
      note: ' Schnelllader ',
    });

    const expected = {
      id: saved.id,
      vehicleId: ev6.id,
      date: '2026-11-23',
      startPercent: 15,
      endPercent: 85,
      pricePerKwh: 0.35,
      chargingLossPercent: 12,
      gridEnergyKwh: 60.37,
      costEur: 21.13,
      note: 'Schnelllader',
    };
    expect(edited).toEqual(expected);
    expect((await store.getHistory({})).sessions).toEqual([expected]);
  });

  it("recalculates with the vehicle's current battery capacity and the session's own rates", async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.updateSettings({ defaultPricePerKwh: 0.32, defaultChargingLossPercent: 10 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
    });
    await store.updateVehicle(id3.id, { name: 'ID.3', batteryCapacityKwh: 62 });
    await store.updateSettings({ defaultPricePerKwh: 0.5, defaultChargingLossPercent: 20 });

    const edited = await store.updateSession(saved.id, { ...saved, startPercent: 30 });

    // 62 kWh × 50 % × 1.1 = 34.1 kWh; × 0.32 €/kWh = 10.91 €.
    expect(edited).toMatchObject({ gridEnergyKwh: 34.1, costEur: 10.91 });
  });

  it('keeps the stored energy and cost when only the date and note change', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
    });
    await store.updateVehicle(id3.id, { name: 'ID.3', batteryCapacityKwh: 62 });

    const edited = await store.updateSession(saved.id, {
      ...saved,
      date: '2026-11-23',
      note: 'Garage',
    });

    expect(edited).toEqual({ ...saved, date: '2026-11-23', note: 'Garage' });
  });

  it('rejects an invalid edit and keeps the session unchanged', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
    });

    await expect(
      store.updateSession(saved.id, {
        vehicleId: id3.id,
        date: '2026-11-24',
        startPercent: 80,
        endPercent: 20,
        pricePerKwh: 0.3,
        chargingLossPercent: 10,
      }),
    ).rejects.toThrow('Das Ende muss über dem Start liegen.');
    expect((await store.getHistory({})).sessions).toEqual([saved]);
  });

  it('removes the note when it is cleared', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const saved = await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-24',
      startPercent: 20,
      endPercent: 80,
      note: 'Garage',
    });

    const edited = await store.updateSession(saved.id, { ...saved, note: '  ' });

    expect(edited).not.toHaveProperty('note');
    expect((await store.getHistory({})).sessions[0]).not.toHaveProperty('note');
  });

  it('deletes a session, and only that one', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const log = (date: string) =>
      store.addSession({ vehicleId: id3.id, date, startPercent: 20, endPercent: 80 });
    const kept = await log('2026-11-23');
    const removed = await log('2026-11-24');

    await store.deleteSession(removed.id);

    expect((await store.getHistory({})).sessions).toEqual([kept]);
  });
});

describe('backup', () => {
  it('restores identical data after export, delete all and import', async () => {
    await store.updateSettings({ themePreference: 'dark', defaultPricePerKwh: 0.32 });
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });
    await store.setDefaultVehicle(outlander.id);
    await store.addSession({ vehicleId: id3.id, date: '2026-11-01', startPercent: 20, endPercent: 80, note: 'Wallbox' });
    await store.addSession({
      vehicleId: outlander.id,
      date: '2026-11-02',
      startPercent: 10,
      endPercent: 100,
      rates: { pricePerKwh: 0.25, chargingLossPercent: 12 },
    });
    const before = await snapshot();

    const file = writeBackup(await store.exportBackup());
    await store.deleteAllData();
    await store.restoreBackup(readBackup(file));

    expect(await snapshot()).toEqual(before);
  });

  it('keeps logging sessions after a restore', async () => {
    const vehicle = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.addSession({ vehicleId: vehicle.id, date: '2026-11-01', startPercent: 20, endPercent: 80 });
    const file = writeBackup(await store.exportBackup());

    await restore(file);
    await store.addSession({ vehicleId: vehicle.id, date: '2026-11-02', startPercent: 30, endPercent: 90 });

    expect((await store.getHistory({})).totals.sessionCount).toBe(2);
  });

  it.each([
    ['text that is not JSON', 'kein json', 'Die Datei ist keine gültige Sicherung.'],
    ['JSON of another kind', '{"foo": 1}', 'Die Datei ist keine ChargeLog-Sicherung.'],
    ['JSON that is no object', '[1, 2]', 'Die Datei ist keine ChargeLog-Sicherung.'],
    [
      'a backup of a newer app version',
      '{"format": "chargelog-backup", "schemaVersion": 2}',
      'Die Sicherung stammt aus einer neueren Version von ChargeLog. Bitte aktualisiere die App.',
    ],
  ])('rejects %s and keeps the existing data', async (_, text, message) => {
    await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const before = await snapshot();

    await expect(restore(text)).rejects.toThrow(message);
    expect(await snapshot()).toEqual(before);
  });

  type BackupData = Record<string, any>;
  it.each<[string, (backup: BackupData) => void]>([
    ['no schema version', (b) => delete b.schemaVersion],
    ['an invalid export time', (b) => (b.exportedAt = 'gestern')],
    ['no vehicle list', (b) => delete b.vehicles],
    ['no session list', (b) => (b.sessions = 'none')],
    ['no settings', (b) => delete b.settings],
    ['an unknown theme', (b) => (b.settings.themePreference = 'pink')],
    ['a negative default price', (b) => (b.settings.defaultPricePerKwh = -1)],
    ['a vehicle without a name', (b) => (b.vehicles[0].name = ' ')],
    ['a vehicle without capacity', (b) => (b.vehicles[0].batteryCapacityKwh = 0)],
    ['a vehicle without id', (b) => delete b.vehicles[0].id],
    ['two vehicles with the same id', (b) => (b.vehicles[1].id = b.vehicles[0].id)],
    ['two vehicles with the same name', (b) => (b.vehicles[1].name = b.vehicles[0].name)],
    ['two default vehicles', (b) => b.vehicles.forEach((v: BackupData) => (v.isDefault = true))],
    ['no default vehicle', (b) => b.vehicles.forEach((v: BackupData) => (v.isDefault = false))],
    ['a session of an unknown vehicle', (b) => (b.sessions[0].vehicleId = 999)],
    ['a session with an invalid date', (b) => (b.sessions[0].date = '2026-02-30')],
    ['a session ending below its start', (b) => (b.sessions[0].endPercent = 10)],
    ['a session with an invalid charging loss', (b) => (b.sessions[0].chargingLossPercent = 100)],
    ['a session with negative cost', (b) => (b.sessions[0].costEur = -1)],
    ['a session without grid energy', (b) => delete b.sessions[0].gridEnergyKwh],
    ['a session with a non-text note', (b) => (b.sessions[0].note = 5)],
    ['two sessions with the same id', (b) => (b.sessions[1].id = b.sessions[0].id)],
  ])('rejects a backup with %s and keeps the existing data', async (_, corrupt) => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });
    await store.addSession({ vehicleId: id3.id, date: '2026-11-01', startPercent: 20, endPercent: 80 });
    await store.addSession({ vehicleId: id3.id, date: '2026-11-02', startPercent: 30, endPercent: 90 });
    const backup = JSON.parse(writeBackup(await store.exportBackup())) as BackupData;
    corrupt(backup);
    const before = await snapshot();

    await expect(restore(JSON.stringify(backup))).rejects.toThrow(
      'Die Sicherung ist beschädigt oder unvollständig.',
    );
    expect(await snapshot()).toEqual(before);
  });
});

describe('legacy EV-Charter backup', () => {
  /** Mirrors an export of the old EV-Charter app, with gaps in its ids. */
  function legacyExport(settings: unknown = legacySettingList()) {
    return {
      version: 2,
      exportDate: '2025-03-14T18:30:00.000Z',
      vehicles: [
        { id: 3, name: 'ID.3', batterySize: 58, isDefault: false },
        { id: 7, name: 'Outlander', batterySize: 20, isDefault: true },
      ],
      sessions: [
        {
          id: 4,
          vehicleId: 7,
          date: '2025-03-01',
          startPercentage: 10,
          endPercentage: 90,
          energy: 17.6,
          cost: 5.28,
        },
        {
          id: 9,
          vehicleId: 3,
          date: '2025-03-02',
          startPercentage: 20,
          endPercentage: 80,
          energy: 38.28,
          cost: 11.48,
        },
        {
          id: 12,
          vehicleId: 3,
          date: '2025-03-05',
          startPercentage: 30,
          endPercentage: 70,
          energy: 25.52,
          cost: 7.66,
        },
      ],
      settings,
    };
  }

  function legacySettingList() {
    return [
      { name: 'electricityPrice', value: 0.3 },
      { name: 'chargingLoss', value: 10 },
      { name: 'darkMode', value: true },
      { name: 'language', value: 'de' },
    ];
  }

  it('imports vehicles with their capacity and default', async () => {
    await restore(JSON.stringify(legacyExport()));

    const vehicles = await store.listVehicles();
    expect(
      vehicles.map(({ name, batteryCapacityKwh, isDefault }) => ({
        name,
        batteryCapacityKwh,
        isDefault,
      })),
    ).toEqual([
      { name: 'ID.3', batteryCapacityKwh: 58, isDefault: false },
      { name: 'Outlander', batteryCapacityKwh: 20, isDefault: true },
    ]);
  });

  it("keeps each session's energy and cost and gives it the legacy price and loss", async () => {
    const legacy = legacyExport([
      { name: 'electricityPrice', value: 0.28 },
      { name: 'chargingLoss', value: 12 },
    ]);

    await restore(JSON.stringify(legacy));

    const { sessions } = await store.getHistory({});
    expect(
      sessions.map(
        ({
          date,
          startPercent,
          endPercent,
          gridEnergyKwh,
          costEur,
          pricePerKwh,
          chargingLossPercent,
        }) => ({
          date,
          startPercent,
          endPercent,
          gridEnergyKwh,
          costEur,
          pricePerKwh,
          chargingLossPercent,
        }),
      ),
    ).toEqual([
      {
        date: '2025-03-05',
        startPercent: 30,
        endPercent: 70,
        gridEnergyKwh: 25.52,
        costEur: 7.66,
        pricePerKwh: 0.28,
        chargingLossPercent: 12,
      },
      {
        date: '2025-03-02',
        startPercent: 20,
        endPercent: 80,
        gridEnergyKwh: 38.28,
        costEur: 11.48,
        pricePerKwh: 0.28,
        chargingLossPercent: 12,
      },
      {
        date: '2025-03-01',
        startPercent: 10,
        endPercent: 90,
        gridEnergyKwh: 17.6,
        costEur: 5.28,
        pricePerKwh: 0.28,
        chargingLossPercent: 12,
      },
    ]);
  });

  it.each([
    [
      'a list',
      [
        { name: 'electricityPrice', value: 0.28 },
        { name: 'chargingLoss', value: 12 },
        { name: 'darkMode', value: true },
      ],
    ],
    [
      'an object map',
      {
        electricityPrice: 0.28,
        chargingLoss: 12,
        darkMode: true,
        language: 'en',
      },
    ],
  ])(
    'makes the legacy price and loss the new defaults, from settings as %s',
    async (_, settings) => {
      await store.updateSettings({ themePreference: 'light' });

      await restore(JSON.stringify(legacyExport(settings)));

      expect(await store.getSettings()).toEqual({
        themePreference: 'system',
        defaultPricePerKwh: 0.28,
        defaultChargingLossPercent: 12,
      });
    },
  );

  it('falls back to 10 % charging loss when the export has none', async () => {
    await restore(JSON.stringify(legacyExport({ electricityPrice: 0.28 })));

    const { sessions } = await store.getHistory({});
    expect(sessions.map((s) => s.chargingLossPercent)).toEqual([10, 10, 10]);
    expect((await store.getSettings()).defaultChargingLossPercent).toBe(10);
  });

  it('replaces all existing data, and logging continues afterwards', async () => {
    const egolf = await store.addVehicle({
      name: 'e-Golf',
      batteryCapacityKwh: 32,
    });
    await store.addSession({
      vehicleId: egolf.id,
      date: '2026-11-01',
      startPercent: 20,
      endPercent: 80,
    });

    await restore(JSON.stringify(legacyExport()));
    const id3 = (await store.listVehicles()).find((v) => v.name === 'ID.3')!;
    await store.addSession({
      vehicleId: id3.id,
      date: '2026-11-02',
      startPercent: 30,
      endPercent: 90,
    });

    expect((await store.listVehicles()).map((v) => v.name)).toEqual(['ID.3', 'Outlander']);
    expect((await store.getHistory({})).totals.sessionCount).toBe(4);
  });

  it('makes the first vehicle the default when the export has none', async () => {
    const legacy = legacyExport();
    legacy.vehicles.forEach((v) => (v.isDefault = false));

    await restore(JSON.stringify(legacy));

    expect((await store.listVehicles()).map((v) => v.isDefault)).toEqual([true, false]);
  });

  type LegacyData = Record<string, any>;
  it.each<[string, (legacy: LegacyData) => void]>([
    ['a session of an unknown vehicle', (l) => (l.sessions[0].vehicleId = 999)],
    ['a session without energy', (l) => delete l.sessions[0].energy],
    ['a vehicle without battery size', (l) => delete l.vehicles[0].batterySize],
    ['a negative electricity price', (l) => (l.settings = { electricityPrice: -1 })],
    ['an invalid export date', (l) => (l.exportDate = 'gestern')],
  ])('rejects an export with %s and keeps the existing data', async (_, corrupt) => {
    await store.addVehicle({ name: 'e-Golf', batteryCapacityKwh: 32 });
    const legacy = legacyExport() as LegacyData;
    corrupt(legacy);
    const before = await snapshot();

    await expect(restore(JSON.stringify(legacy))).rejects.toThrow(
      'Die Sicherung ist beschädigt oder unvollständig.',
    );
    expect(await snapshot()).toEqual(before);
  });

  it('keeps each session with its vehicle', async () => {
    await restore(JSON.stringify(legacyExport()));

    const vehicles = await store.listVehicles();
    const datesOf = async (name: string) => {
      const vehicleId = vehicles.find((v) => v.name === name)!.id;
      return (await store.getHistory({ vehicleId })).sessions.map((s) => s.date);
    };
    expect(await datesOf('ID.3')).toEqual(['2025-03-05', '2025-03-02']);
    expect(await datesOf('Outlander')).toEqual(['2025-03-01']);
  });
});

describe('CSV export', () => {
  const BOM = '\uFEFF';
  const HEADER =
    'Datum;Fahrzeug;Akkukapazität (kWh);Start (%);Ende (%);Geladen (%);' +
    'Aus dem Netz (kWh);In den Akku (kWh);Preis (€/kWh);Ladeverlust (%);Kosten (€);Notiz';

  it('lists the sessions newest first in a German Excel format', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });
    await store.addSession({ vehicleId: id3.id, date: '2026-11-01', startPercent: 20, endPercent: 80, note: 'Wallbox' });
    await store.addSession({
      vehicleId: outlander.id,
      date: '2026-11-02',
      startPercent: 10,
      endPercent: 100,
      rates: { pricePerKwh: 0.25, chargingLossPercent: 12 },
    });

    expect(await store.exportCsv({})).toBe(
      BOM +
        `${HEADER}\r\n` +
        '02.11.2026;Outlander;20;10;100;90;20,16;18;0,25;12;5,04;\r\n' +
        '01.11.2026;ID.3;58;20;80;60;38,28;34,8;0,3;10;11,48;Wallbox\r\n',
    );
  });

  it('contains only the sessions matching the filter', async () => {
    const id3 = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    const outlander = await store.addVehicle({ name: 'Outlander', batteryCapacityKwh: 20 });
    await store.addSession({ vehicleId: id3.id, date: '2026-10-31', startPercent: 20, endPercent: 80 });
    await store.addSession({ vehicleId: id3.id, date: '2026-11-01', startPercent: 20, endPercent: 80 });
    await store.addSession({ vehicleId: outlander.id, date: '2026-11-02', startPercent: 10, endPercent: 100 });

    const csv = await store.exportCsv({ vehicleId: id3.id, from: '2026-11-01' });

    expect(csv.split('\r\n').slice(1, -1).map((row) => row.split(';')[0])).toEqual(['01.11.2026']);
  });

  it('quotes notes and vehicle names containing semicolons, quotes or line breaks', async () => {
    const vehicle = await store.addVehicle({ name: 'Kona; "Elektro"', batteryCapacityKwh: 64 });
    await store.addSession({
      vehicleId: vehicle.id,
      date: '2026-11-01',
      startPercent: 20,
      endPercent: 80,
      note: 'Wallbox\r\nbei Oma',
    });

    const [, row] = (await store.exportCsv({})).split(/\r\n(?=\d)/);

    expect(row).toBe(
      '01.11.2026;"Kona; ""Elektro""";64;20;80;60;42,24;38,4;0,3;10;12,67;"Wallbox\r\nbei Oma"\r\n',
    );
  });
});

describe('deleting all data', () => {
  it('removes vehicles and sessions and resets the settings to their defaults', async () => {
    await store.updateSettings({ themePreference: 'dark', defaultPricePerKwh: 0.32 });
    const vehicle = await store.addVehicle({ name: 'ID.3', batteryCapacityKwh: 58 });
    await store.addSession({ vehicleId: vehicle.id, date: '2026-11-01', startPercent: 20, endPercent: 80 });

    await store.deleteAllData();

    expect(await store.listVehicles()).toEqual([]);
    expect((await store.getHistory({})).sessions).toEqual([]);
    expect(await store.getSettings()).toEqual({
      themePreference: 'system',
      defaultPricePerKwh: 0.3,
      defaultChargingLossPercent: 10,
    });
  });
});

describe('read problems', () => {
  it('reports a read that fails, naming what could not be read', async () => {
    const problems: ReadProblem[] = [];
    store.onReadProblem((problem) => problems.push(problem));
    store.close();

    const subscription = store.watchSettings().subscribe({ error: () => {} });

    await vi.waitFor(() =>
      expect(problems).toEqual([
        expect.objectContaining({ data: 'Einstellungen', kind: 'failed' }),
      ]),
    );
    subscription.unsubscribe();
  });

  it('reports a read that hangs, and does not report it as failed', async () => {
    store.close();
    store = await openChargeLogStore(dbName, { slowReadMs: 20 });
    const problems: ReadProblem[] = [];
    store.onReadProblem((problem) => problems.push(problem));
    const blocker = await blockSettings();

    const settings = await new Promise<Settings>((resolve) => {
      store.watchSettings().subscribe(resolve);
      setTimeout(() => void blocker.release(), 100);
    });

    expect(settings.themePreference).toBe('system');
    expect(problems).toEqual([expect.objectContaining({ data: 'Einstellungen', kind: 'slow' })]);
  });
});

/**
 * Holds a never-ending write on the settings from another connection, like a
 * frozen tab would, blocking every other access to them until released.
 */
async function blockSettings() {
  let writing = true;
  const other = await new Dexie(dbName).open();
  const transaction = other.transaction('rw', 'settings', async () => {
    while (writing) await other.table('settings').get('themePreference');
  });
  return {
    async release() {
      writing = false;
      await transaction;
      other.close();
    },
  };
}

/** Current value of the recent-sessions watch. */
async function recentSessions(limit = 10) {
  return new Promise<ChargingSession[]>((resolve, reject) => {
    const subscription = store.watchRecentSessions(limit).subscribe({
      next(sessions) {
        resolve(sessions);
        queueMicrotask(() => subscription.unsubscribe());
      },
      error: reject,
    });
  });
}

async function defaultVehicleNames(): Promise<string[]> {
  const vehicles = await store.listVehicles();
  return vehicles.filter((vehicle) => vehicle.isDefault).map((vehicle) => vehicle.name);
}

/** Everything the store holds, for comparing before and after. */
async function snapshot() {
  return {
    settings: await store.getSettings(),
    vehicles: await store.listVehicles(),
    history: await store.getHistory({}),
  };
}

/** Reads and restores a backup file's text, like the import in the settings does. */
async function restore(text: string) {
  await store.restoreBackup(readBackup(text));
}
