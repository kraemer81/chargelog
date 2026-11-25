<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatDecimal } from '../format';
  import { useStore } from '../store/context';
  import type { NewVehicle, Vehicle } from '../store/store';
  import VehicleForm from './VehicleForm.svelte';

  const store = useStore();

  let vehicles = $state<Vehicle[]>([]);
  /** 'new' while adding, a vehicle id while editing that vehicle. */
  let editing = $state<'new' | number | undefined>();
  let pendingDelete = $state<{ vehicle: Vehicle; sessionCount: number } | undefined>();
  let dialog = $state<HTMLDialogElement>();

  const subscription = store.watchVehicles().subscribe((list) => {
    vehicles = list;
  });
  onDestroy(() => subscription.unsubscribe());

  async function add(vehicle: NewVehicle) {
    await store.addVehicle(vehicle);
    editing = undefined;
  }

  async function update(id: number, vehicle: NewVehicle) {
    await store.updateVehicle(id, vehicle);
    editing = undefined;
  }

  async function askDelete(vehicle: Vehicle) {
    pendingDelete = { vehicle, sessionCount: await store.countSessions(vehicle.id) };
    dialog?.showModal();
  }

  async function confirmDelete() {
    try {
      if (pendingDelete) await store.deleteVehicle(pendingDelete.vehicle.id);
    } finally {
      dialog?.close();
    }
  }

  function sessionsNotice(count: number): string {
    if (count === 0) return 'Für dieses Fahrzeug sind keine Ladevorgänge gespeichert.';
    if (count === 1) return 'Sein Ladevorgang wird ebenfalls gelöscht.';
    return `Seine ${count} Ladevorgänge werden ebenfalls gelöscht.`;
  }
</script>

<section class="card">
  <h2>Fahrzeuge</h2>

  {#if vehicles.length === 0 && editing !== 'new'}
    <p class="hint">Lege dein erstes Fahrzeug an, um Ladevorgänge zu erfassen.</p>
  {/if}

  <ul>
    {#each vehicles as vehicle (vehicle.id)}
      <li>
        {#if editing === vehicle.id}
          <VehicleForm
            initial={vehicle}
            submitLabel="Speichern"
            onsubmit={(changes) => update(vehicle.id, changes)}
            oncancel={() => (editing = undefined)}
          />
        {:else}
          <div class="vehicle">
            <div class="details">
              <span class="name">{vehicle.name}</span>
              <span class="capacity">
                {formatDecimal(vehicle.batteryCapacityKwh)} kWh
              </span>
            </div>
            {#if vehicle.isDefault}
              <span class="chip">Standard</span>
            {/if}
          </div>
          <div class="actions">
            {#if !vehicle.isDefault}
              <button
                type="button"
                class="text"
                onclick={() => void store.setDefaultVehicle(vehicle.id)}
              >
                Als Standard
              </button>
            {/if}
            <button type="button" class="text" onclick={() => (editing = vehicle.id)}>
              Bearbeiten
            </button>
            <button type="button" class="text danger" onclick={() => void askDelete(vehicle)}>
              Löschen
            </button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if editing === 'new'}
    <VehicleForm submitLabel="Hinzufügen" onsubmit={add} oncancel={() => (editing = undefined)} />
  {:else}
    <button type="button" class="tonal" onclick={() => (editing = 'new')}>
      Fahrzeug hinzufügen
    </button>
  {/if}

  <dialog
    bind:this={dialog}
    onclose={() => (pendingDelete = undefined)}
    aria-labelledby="delete-heading"
  >
    {#if pendingDelete}
      <h2 id="delete-heading">„{pendingDelete.vehicle.name}“ löschen?</h2>
      <p>{sessionsNotice(pendingDelete.sessionCount)} Das lässt sich nicht rückgängig machen.</p>
      <div class="dialog-actions">
        <button type="button" class="text" onclick={() => dialog?.close()}>Abbrechen</button>
        <button type="button" class="filled danger" onclick={() => void confirmDelete()}>
          Löschen
        </button>
      </div>
    {/if}
  </dialog>
</section>

<style>
  .hint {
    margin: 0 0 var(--space-3);
    color: var(--color-on-surface-variant);
  }

  ul {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
  }

  li {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-outline-variant);
  }

  li:first-child {
    padding-top: 0;
  }

  .vehicle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .details {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .capacity {
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .chip {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-s);
    background: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
    font-size: var(--font-size-label);
    font-weight: 500;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-right: calc(-1 * var(--space-3));
  }

  dialog p {
    margin: 0 0 var(--space-5);
    color: var(--color-on-surface-variant);
  }
</style>
