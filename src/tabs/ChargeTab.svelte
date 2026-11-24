<script lang="ts">
  import { onDestroy } from 'svelte';
  import PercentInput from '../lib/components/PercentInput.svelte';
  import { formatEuro, formatIsoDate, formatKwh, todayIsoDate } from '../lib/format';
  import { useStore } from '../lib/store/context';
  import {
    calculateCharge,
    percentageError,
    ValidationError,
    type ChargingSession,
    type Settings,
    type Vehicle,
  } from '../lib/store/store';

  let { onopensettings }: { onopensettings: () => void } = $props();

  const store = useStore();
  const RECENT_LIMIT = 5;
  /** Suggested start and end when a vehicle has no session yet. */
  const FALLBACK = { startPercent: 20, endPercent: 80 };

  let vehicles = $state<Vehicle[] | undefined>();
  let settings = $state<Settings | undefined>();
  let recent = $state<ChargingSession[]>([]);

  let vehicleId = $state<number | undefined>();
  let date = $state(todayIsoDate());
  let startPercent = $state(FALLBACK.startPercent);
  let endPercent = $state(FALLBACK.endPercent);
  let note = $state('');
  let saving = $state(false);
  let error = $state<string | undefined>();
  let confirmation = $state<string | undefined>();
  let confirmationTimer: ReturnType<typeof setTimeout> | undefined;

  const subscriptions = [
    store.watchVehicles().subscribe((list) => {
      vehicles = list;
      // Keep the chosen vehicle while it exists; otherwise fall back to the default.
      if (!list.some((v) => v.id === vehicleId)) {
        const fallback = list.find((v) => v.isDefault) ?? list[0];
        if (fallback) void chooseVehicle(fallback.id);
        else vehicleId = undefined;
      }
    }),
    store.watchSettings().subscribe((value) => (settings = value)),
    store.watchRecentSessions(RECENT_LIMIT).subscribe((list) => (recent = list)),
  ];
  onDestroy(() => {
    subscriptions.forEach((s) => s.unsubscribe());
    clearTimeout(confirmationTimer);
  });

  const vehicle = $derived(vehicles?.find((v) => v.id === vehicleId));
  const percentageProblem = $derived(percentageError(startPercent, endPercent));
  const preview = $derived(
    vehicle && settings && !percentageProblem
      ? calculateCharge({
          batteryCapacityKwh: vehicle.batteryCapacityKwh,
          startPercent,
          endPercent,
          chargingLossPercent: settings.defaultChargingLossPercent,
          pricePerKwh: settings.defaultPricePerKwh,
        })
      : undefined,
  );
  const vehicleNames = $derived(new Map(vehicles?.map((v) => [v.id, v.name])));

  /** Selects the vehicle and suggests start/end from its latest session. */
  async function chooseVehicle(id: number) {
    vehicleId = id;
    const latest = await store.getLatestSession(id);
    if (vehicleId !== id) return; // another vehicle was chosen meanwhile
    ({ startPercent, endPercent } = latest ?? FALLBACK);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (vehicleId === undefined || percentageProblem) return;
    saving = true;
    error = undefined;
    try {
      await store.addSession({ vehicleId, date, startPercent, endPercent, note });
      // Ready for the next entry; start/end stay as the suggestion for next time.
      date = todayIsoDate();
      note = '';
      showConfirmation('Ladevorgang gespeichert');
    } catch (e) {
      if (e instanceof ValidationError) {
        error = e.message;
      } else {
        console.error(e);
        error = 'Der Ladevorgang konnte nicht gespeichert werden.';
      }
    } finally {
      saving = false;
    }
  }

  function showConfirmation(message: string) {
    confirmation = message;
    clearTimeout(confirmationTimer);
    confirmationTimer = setTimeout(() => (confirmation = undefined), 3000);
  }
</script>

<h1>Laden</h1>

{#if vehicles === undefined}
  <!-- Loading: render nothing to avoid flashing the empty state. -->
{:else if vehicles.length === 0}
  <section class="card">
    <h2>Noch kein Fahrzeug</h2>
    <p class="hint">Lege in den Einstellungen dein Fahrzeug an, um Ladevorgänge zu erfassen.</p>
    <button type="button" class="filled" onclick={onopensettings}>Zu den Einstellungen</button>
  </section>
{:else}
  <form class="card" onsubmit={submit}>
    {#if vehicles.length > 1}
      <label class="field">
        <span>Fahrzeug</span>
        <select
          value={vehicleId}
          onchange={(e) => void chooseVehicle(Number(e.currentTarget.value))}
        >
          {#each vehicles as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <p class="single-vehicle">{vehicle?.name}</p>
    {/if}

    <label class="field">
      <span>Datum</span>
      <input type="date" bind:value={date} required />
    </label>

    <div class="percentages">
      <PercentInput label="Start" bind:value={startPercent} />
      <PercentInput label="Ende" bind:value={endPercent} />
    </div>

    <div class="preview" aria-live="polite">
      {#if preview}
        <div>
          <span class="preview-value">{formatKwh(preview.gridEnergyKwh)}</span>
          <span class="preview-label">aus dem Netz</span>
        </div>
        <div>
          <span class="preview-value">{formatEuro(preview.costEur)}</span>
          <span class="preview-label">Kosten</span>
        </div>
      {:else if percentageProblem}
        <p class="error">{percentageProblem}</p>
      {/if}
    </div>

    <label class="field">
      <span>Notiz (optional)</span>
      <input bind:value={note} autocomplete="off" />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button type="submit" class="filled" disabled={saving || percentageProblem !== undefined}>
      Speichern
    </button>
  </form>

  {#if recent.length > 0}
    <section class="card">
      <h2>Letzte Ladevorgänge</h2>
      <ul>
        {#each recent as session (session.id)}
          <li>
            <div class="session-main">
              <span>{formatIsoDate(session.date)}</span>
              <span class="cost">{formatEuro(session.costEur)}</span>
            </div>
            <div class="session-details">
              {#if vehicles.length > 1}
                <span>{vehicleNames.get(session.vehicleId)}</span> ·
              {/if}
              <span>{session.startPercent} → {session.endPercent} %</span> ·
              <span>{formatKwh(session.gridEnergyKwh)}</span>
            </div>
            {#if session.note}
              <div class="session-details note">{session.note}</div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

{#if confirmation}
  <div class="snackbar" role="status">{confirmation}</div>
{/if}

<style>
  h1 {
    font-size: var(--font-size-title);
    margin-bottom: var(--space-4);
  }

  .hint {
    margin: 0 0 var(--space-3);
    color: var(--color-on-surface-variant);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .single-vehicle {
    margin: 0;
    font-weight: 500;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .field input,
  .field select {
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-s);
    background: var(--color-surface);
    color: var(--color-on-surface);
    font: inherit;
    font-size: var(--font-size-body);
  }

  .field input:focus,
  .field select:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
  }

  .percentages {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .preview {
    display: flex;
    justify-content: space-around;
    min-height: 3.5rem;
    padding: var(--space-2);
    border-radius: var(--radius-m);
    background: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
    text-align: center;
  }

  .preview div {
    display: flex;
    flex-direction: column;
  }

  .preview-value {
    font-size: 1.25rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .preview-label {
    font-size: var(--font-size-label);
  }

  .preview .error {
    align-self: center;
  }

  .error {
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-label);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-outline-variant);
  }

  li:last-child {
    border-bottom: none;
  }

  .session-main {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .cost {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .session-details {
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .note {
    overflow-wrap: anywhere;
  }

  .snackbar {
    position: fixed;
    left: 50%;
    bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-4));
    transform: translateX(-50%);
    max-width: calc(100vw - 2 * var(--space-4));
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-s);
    background: var(--color-inverse-surface);
    color: var(--color-inverse-on-surface);
    box-shadow: var(--elevation-2);
    font-size: var(--font-size-label);
  }
</style>
