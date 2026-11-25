import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateCharge,
  openChargeLogStore,
  type ChargeLogStore,
  type ChargingRates,
  type ChargingSession,
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
