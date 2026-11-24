import { getContext } from 'svelte';
import type { ChargeLogStore } from './store';

const KEY = Symbol('chargelog-store');

/** Context map to pass to `mount()` so every component can reach the store. */
export function storeContext(store: ChargeLogStore): Map<symbol, ChargeLogStore> {
  return new Map([[KEY, store]]);
}

export function useStore(): ChargeLogStore {
  return getContext<ChargeLogStore>(KEY);
}
