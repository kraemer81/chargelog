<script lang="ts">
  import { onDestroy } from 'svelte';
  import ChargingRatesFields from '../lib/components/ChargingRatesFields.svelte';
  import PercentRangeInput from '../lib/components/PercentRangeInput.svelte';
  import {
    formatDecimal,
    formatEditableDecimal,
    formatEuro,
    formatIsoDate,
    formatKwh,
    formatPricePerKwh,
    parseDecimal,
    todayIsoDate,
  } from '../lib/format';
  import { useStore } from '../lib/store/context';
  import {
    calculateCharge,
    chargingLossError,
    defaultRates,
    percentageError,
    priceError,
    ValidationError,
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
  /** How long a just-saved session lights up in the recent list. */
  const HIGHLIGHT_MS = 1500;

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
  let confirmation = $state<string | undefined>();
  let confirmationTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightedId = $state<number | undefined>();
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

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
    clearTimeout(confirmationTimer);
    clearTimeout(highlightTimer);
  });

  const vehicle = $derived(vehicles?.find((v) => v.id === vehicleId));
  const percentageProblem = $derived(percentageError(startPercent, endPercent));
  /** Price and charging loss this session will be saved with. */
  const rates = $derived<ChargingRates | undefined>(
    overriding
      ? {
          pricePerKwh: parseDecimal(rateText.pricePerKwh),
          chargingLossPercent: parseDecimal(rateText.chargingLossPercent),
        }
      : settings && defaultRates(settings),
  );
  const rateProblems = $derived({
    pricePerKwh: rates && priceError(rates.pricePerKwh),
    chargingLossPercent: rates && chargingLossError(rates.chargingLossPercent),
  });
  const formProblem = $derived(
    percentageProblem ?? rateProblems.pricePerKwh ?? rateProblems.chargingLossPercent,
  );
  const preview = $derived(
    vehicle && rates && !formProblem
      ? calculateCharge({
          batteryCapacityKwh: vehicle.batteryCapacityKwh,
          startPercent,
          endPercent,
          ...rates,
        })
      : undefined,
  );
  const vehicleNames = $derived(new Map(vehicles?.map((v) => [v.id, v.name])));

  /** Selects the vehicle and resets start/end to the suggestion. */
  function chooseVehicle(id: number) {
    vehicleId = id;
    ({ startPercent, endPercent } = SUGGESTED);
  }

  /** Starts overriding, prefilled with the defaults. */
  function startOverride() {
    if (!settings) return;
    const { pricePerKwh, chargingLossPercent } = defaultRates(settings);
    rateText = {
      pricePerKwh: formatEditableDecimal(pricePerKwh),
      chargingLossPercent: formatEditableDecimal(chargingLossPercent),
    };
    overriding = true;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (vehicleId === undefined || formProblem) return;
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
      showConfirmation('Ladevorgang gespeichert');
      highlight(saved.id);
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

  function highlight(id: number) {
    highlightedId = id;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlightedId = undefined), HIGHLIGHT_MS);
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

    <label class="field">
      <span>Datum</span>
      <div class="date">
        <input type="date" bind:value={date} required />
        <!-- Material Icons "calendar_today" (Apache License 2.0). -->
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"
          />
        </svg>
      </div>
    </label>

    <PercentRangeInput bind:start={startPercent} bind:end={endPercent} />

    {#if overriding}
      <fieldset class="rates">
        <legend>Nur für diesen Ladevorgang</legend>
        <ChargingRatesFields bind:text={rateText} errors={rateProblems} />
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

    <button type="submit" class="filled" disabled={saving || formProblem !== undefined}>
      Speichern
    </button>
  </form>

  {#if recent.length > 0}
    <section class="card">
      <h2>Letzte Ladevorgänge</h2>
      <ul>
        {#each recent as session (session.id)}
          <li
            class:highlighted={session.id === highlightedId}
            style:--highlight-duration="{HIGHLIGHT_MS}ms"
          >
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

  .date {
    position: relative;
  }

  /*
   * Mobile browsers give date inputs an intrinsic width; make it fill the field.
   * The native indicator (a tiny arrow on some phones) is replaced by our icon,
   * indented like the text on the left.
   */
  .field input[type='date'] {
    position: relative;
    width: 100%;
    min-width: 0;
    padding-right: calc(2 * var(--space-3) + 24px);
    -webkit-appearance: none;
    appearance: none;
  }

  /* Invisible but stretched over the field, so tapping anywhere opens the picker. */
  .field input[type='date']::-webkit-calendar-picker-indicator {
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    margin: 0;
    padding: 0;
    opacity: 0;
    cursor: pointer;
  }

  .date svg {
    position: absolute;
    top: 50%;
    right: var(--space-3);
    width: 24px;
    height: 24px;
    transform: translateY(-50%);
    fill: var(--color-on-surface-variant);
    pointer-events: none;
  }

  /* iOS Safari centres the date value by default. */
  .field input[type='date']::-webkit-date-and-time-value {
    text-align: left;
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

  .field input:focus,
  .field select:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
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

  /* Bleeds a little into the card padding so the highlight doesn't hug the text. */
  li.highlighted {
    margin: 0 calc(-1 * var(--space-2));
    padding-inline: var(--space-2);
    border-radius: var(--radius-s);
    animation: highlight var(--highlight-duration) ease-out;
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
