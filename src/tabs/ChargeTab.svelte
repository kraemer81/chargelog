<script lang="ts">
  import { onDestroy } from 'svelte';
  import ChargingRatesFields, {
    parseRatesText,
    ratesText,
  } from '../lib/components/ChargingRatesFields.svelte';
  import DateInput from '../lib/components/DateInput.svelte';
  import PercentRangeInput from '../lib/components/PercentRangeInput.svelte';
  import SessionSummary from '../lib/components/SessionSummary.svelte';
  import {
    formatDecimal,
    formatEuro,
    formatKwh,
    formatPricePerKwh,
    todayIsoDate,
  } from '../lib/format';
  import { errorMessage } from '../lib/errorMessage';
  import { useStore } from '../lib/store/context';
  import {
    checkCharge,
    defaultRates,
    type ChargingRates,
    type ChargingSession,
    type Settings,
    type Vehicle,
  } from '../lib/store/store';

  let { onopensettings }: { onopensettings: () => void } = $props();

  const store = useStore();
  const RECENT_LIMIT = 5;
  /** Start and end preselected for every new entry. */
  const SUGGESTED = { startPercent: 20, endPercent: 80 };
  /** How long the save button confirms and the saved session lights up in the recent list. */
  const CONFIRMATION_MS = 1500;

  let vehicles = $state<Vehicle[] | undefined>();
  let settings = $state<Settings | undefined>();
  let recent = $state<ChargingSession[]>([]);

  let vehicleId = $state<number | undefined>();
  let date = $state(todayIsoDate());
  let startPercent = $state(SUGGESTED.startPercent);
  let endPercent = $state(SUGGESTED.endPercent);
  let note = $state('');
  /** Whether price and charging loss are overridden for this session only. */
  let overriding = $state(false);
  let rateText = $state<Record<keyof ChargingRates, string>>({
    pricePerKwh: '',
    chargingLossPercent: '',
  });
  let saving = $state(false);
  let error = $state<string | undefined>();
  /** The just-saved session, while the form confirms it and the recent list highlights it. */
  let savedId = $state<number | undefined>();
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const confirming = $derived(savedId !== undefined);

  const subscriptions = [
    store.watchVehicles().subscribe((list) => {
      vehicles = list;
      // Keep the chosen vehicle while it exists; otherwise fall back to the default.
      if (!list.some((v) => v.id === vehicleId)) {
        const fallback = list.find((v) => v.isDefault) ?? list[0];
        if (fallback) chooseVehicle(fallback.id);
        else vehicleId = undefined;
      }
    }),
    store.watchSettings().subscribe((value) => (settings = value)),
    store.watchRecentSessions(RECENT_LIMIT).subscribe((list) => (recent = list)),
  ];
  onDestroy(() => {
    subscriptions.forEach((s) => s.unsubscribe());
    clearTimeout(savedTimer);
  });

  const vehicle = $derived(vehicles?.find((v) => v.id === vehicleId));
  /** Price and charging loss this session will be saved with. */
  const rates = $derived<ChargingRates | undefined>(
    overriding ? parseRatesText(rateText) : settings && defaultRates(settings),
  );
  const check = $derived(
    vehicle && rates
      ? checkCharge({
          batteryCapacityKwh: vehicle.batteryCapacityKwh,
          startPercent,
          endPercent,
          ...rates,
        })
      : undefined,
  );
  /** Energy and cost to show and save; absent while anything entered is invalid. */
  const preview = $derived(check?.charge);
  const vehicleNames = $derived(new Map(vehicles?.map((v) => [v.id, v.name])));

  /** Selects the vehicle and resets start/end to the suggestion. */
  function chooseVehicle(id: number) {
    vehicleId = id;
    ({ startPercent, endPercent } = SUGGESTED);
  }

  /** Starts overriding, prefilled with the defaults. */
  function startOverride() {
    if (!settings) return;
    rateText = ratesText(defaultRates(settings));
    overriding = true;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    // While confirming, a second tap must not log the reset form as a duplicate.
    if (vehicleId === undefined || !preview || confirming) return;
    saving = true;
    error = undefined;
    try {
      const saved = await store.addSession({
        vehicleId,
        date,
        startPercent,
        endPercent,
        note,
        rates: overriding ? rates : undefined,
      });
      // Visibly reset the form so it is clear the entry was taken.
      date = todayIsoDate();
      ({ startPercent, endPercent } = SUGGESTED);
      note = '';
      overriding = false;
      confirmSaved(saved.id);
    } catch (e) {
      error = errorMessage(e, 'Der Ladevorgang konnte nicht gespeichert werden.');
    } finally {
      saving = false;
    }
  }

  /** Confirms the save on the button itself, where the user's attention is. */
  function confirmSaved(id: number) {
    savedId = id;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (savedId = undefined), CONFIRMATION_MS);
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
          onchange={(e) => chooseVehicle(Number(e.currentTarget.value))}
        >
          {#each vehicles as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <p class="single-vehicle">{vehicle?.name}</p>
    {/if}

    <DateInput label="Datum" bind:value={date} required />

    <PercentRangeInput bind:start={startPercent} bind:end={endPercent} />

    {#if overriding}
      <fieldset class="rates">
        <legend>Nur für diesen Ladevorgang</legend>
        <ChargingRatesFields bind:text={rateText} errors={check?.problems} />
        <button type="button" class="text reset" onclick={() => (overriding = false)}>
          Standardwerte verwenden
        </button>
      </fieldset>
    {:else if settings}
      <button
        type="button"
        class="rates-summary"
        aria-label="Preis und Ladeverlust für diesen Ladevorgang ändern"
        onclick={startOverride}
      >
        {formatPricePerKwh(settings.defaultPricePerKwh)} · {formatDecimal(
          settings.defaultChargingLossPercent,
        )} % Verlust
        <!-- Material Icons "edit" (Apache License 2.0). -->
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
          />
        </svg>
      </button>
    {/if}

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
      {:else if check?.problems.percentage}
        <p class="error">{check.problems.percentage}</p>
      {/if}
    </div>

    <label class="field">
      <span>Notiz (optional)</span>
      <input bind:value={note} autocomplete="off" />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button
      type="submit"
      class="filled save"
      class:saved={confirming}
      style:--confirmation-duration="{CONFIRMATION_MS}ms"
      disabled={saving || (!confirming && !preview)}
    >
      {#if confirming}
        <!-- Material Icons "check" (Apache License 2.0). -->
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        Gespeichert
      {:else}
        Speichern
      {/if}
    </button>
    <p class="visually-hidden" role="status">
      {confirming ? 'Ladevorgang gespeichert' : ''}
    </p>
  </form>

  {#if recent.length > 0}
    <section class="card">
      <h2>Letzte Ladevorgänge</h2>
      <ul>
        {#each recent as session (session.id)}
          <li
            class:highlighted={session.id === savedId}
            style:--confirmation-duration="{CONFIRMATION_MS}ms"
          >
            <SessionSummary
              {session}
              vehicleName={vehicles.length > 1 ? vehicleNames.get(session.vehicleId) : undefined}
            />
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  h1 {
    font-size: var(--font-size-title);
    margin-bottom: var(--space-4);
  }

  form {
    /* Anchors the visually hidden save status. */
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .single-vehicle {
    margin: 0;
    font-weight: 500;
  }

  .rates-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    min-height: var(--touch-target);
    margin: calc(-1 * var(--space-2)) 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-on-surface-variant);
    font: inherit;
    font-size: var(--font-size-label);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .rates-summary svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }

  .rates {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
    padding: var(--space-3);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-m);
  }

  .rates legend {
    padding: 0 var(--space-1);
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .rates .reset {
    align-self: flex-start;
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

  /* Bleeds a little into the card padding so the highlight doesn't hug the text. */
  li.highlighted {
    margin: 0 calc(-1 * var(--space-2));
    padding-inline: var(--space-2);
    border-radius: var(--radius-s);
    animation: highlight var(--confirmation-duration) ease-out;
  }

  @keyframes highlight {
    0%,
    40% {
      background: var(--color-primary-container);
    }
    100% {
      background: transparent;
    }
  }

  .save {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .save svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }

  .save.saved {
    background: var(--color-primary-container);
    color: var(--color-on-primary-container);
    cursor: default;
    animation: confirm var(--confirmation-duration) ease-out;
  }

  @keyframes confirm {
    0% {
      transform: scale(1);
    }
    15% {
      transform: scale(1.04);
    }
    30%,
    100% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .save.saved {
      animation: none;
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
