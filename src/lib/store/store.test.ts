import 'fake-indexeddb/auto';
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
