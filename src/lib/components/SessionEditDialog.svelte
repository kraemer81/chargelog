<script lang="ts">
  import { onMount } from 'svelte';
  import { formatEuro, formatIsoDate, formatKwh } from '../format';
  import { errorMessage } from '../errorMessage';
  import { useStore } from '../store/context';
  import {
    checkCharge,
    type ChargingRates,
    type ChargingSession,
    type Vehicle,
  } from '../store/store';
  import ChargingRatesFields, { parseRatesText, ratesText } from './ChargingRatesFields.svelte';
  import DateInput from './DateInput.svelte';
  import PercentRangeInput from './PercentRangeInput.svelte';

  let {
    session,
    vehicles,
    onclose,
  }: {
    session: ChargingSession;
    vehicles: Vehicle[];
    /** Called once the dialog has closed, whether saved, deleted or cancelled. */
    onclose: () => void;
  } = $props();

  const store = useStore();

  // The form edits its own copy; `session` only seeds it.
  // svelte-ignore state_referenced_locally
  const initial = session;
  let vehicleId = $state(initial.vehicleId);
  let date = $state(initial.date);
  let startPercent = $state(initial.startPercent);
  let endPercent = $state(initial.endPercent);
  let rateText = $state<Record<keyof ChargingRates, string>>(ratesText(initial));
  let note = $state(initial.note ?? '');
  let busy = $state(false);
  let error = $state<string | undefined>();
  /** Whether the dialog asks to confirm deleting instead of showing the form. */
  let confirmingDelete = $state(false);
  let dialog = $state<HTMLDialogElement>();

  onMount(() => dialog?.showModal());

  const vehicle = $derived(vehicles.find((v) => v.id === vehicleId));
  const rates = $derived(parseRatesText(rateText));
  const check = $derived(
    vehicle &&
      checkCharge({
        batteryCapacityKwh: vehicle.batteryCapacityKwh,
        startPercent,
        endPercent,
        ...rates,
      }),
  );

  /** Runs a store write, shows a rejection in the dialog and closes it on success. */
  async function writeOrShowError(write: () => Promise<unknown>, failureMessage: string) {
    busy = true;
    error = undefined;
    try {
      await write();
      dialog?.close();
    } catch (e) {
      error = errorMessage(e, failureMessage);
    } finally {
      busy = false;
    }
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!check?.charge) return;
    void writeOrShowError(
      () =>
        store.updateSession(session.id, {
          vehicleId,
          date,
          startPercent,
          endPercent,
          note,
          ...rates,
        }),
      'Der Ladevorgang konnte nicht gespeichert werden.',
    );
  }

  function remove() {
    void writeOrShowError(
      () => store.deleteSession(session.id),
      'Der Ladevorgang konnte nicht gelöscht werden.',
    );
  }
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="session-edit-heading">
  {#if confirmingDelete}
    <h2 id="session-edit-heading">Ladevorgang löschen?</h2>
    <p>
      Der Ladevorgang vom {formatIsoDate(session.date)} wird gelöscht. Das lässt sich nicht
      rückgängig machen.
    </p>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <div class="dialog-actions">
      <button type="button" class="text" onclick={() => (confirmingDelete = false)}>
        Abbrechen
      </button>
      <button type="button" class="filled danger" disabled={busy} onclick={remove}>
        Löschen
      </button>
    </div>
  {:else}
    <h2 id="session-edit-heading">Ladevorgang bearbeiten</h2>
    <form onsubmit={save}>
      <label class="field">
        <span>Fahrzeug</span>
        <select bind:value={vehicleId}>
          {#each vehicles as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      </label>

      <DateInput label="Datum" bind:value={date} required />

      <PercentRangeInput bind:start={startPercent} bind:end={endPercent} />

      <ChargingRatesFields bind:text={rateText} errors={check?.problems} />

      <div class="preview" aria-live="polite">
        {#if check?.charge}
          {formatKwh(check.charge.gridEnergyKwh)} · {formatEuro(check.charge.costEur)}
        {:else if check?.problems.percentage}
          <span class="error">{check.problems.percentage}</span>
        {/if}
      </div>

      <label class="field">
        <span>Notiz (optional)</span>
        <input bind:value={note} autocomplete="off" />
      </label>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="actions">
        <button
          type="button"
          class="text danger"
          onclick={() => {
            error = undefined;
            confirmingDelete = true;
          }}
        >
          Löschen
        </button>
        <span class="spacer"></span>
        <button type="button" class="text" onclick={() => dialog?.close()}>Abbrechen</button>
        <button type="submit" class="filled" disabled={busy || !check?.charge}>
          Speichern
        </button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 2 * var(--space-4)));
    max-width: none;
  }

  h2 {
    margin-bottom: var(--space-4);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .preview {
    min-height: 1.5rem;
    color: var(--color-on-surface-variant);
    font-size: var(--font-size-label);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .actions .danger {
    margin-left: calc(-1 * var(--space-3));
  }

  .spacer {
    flex: 1;
  }
</style>
