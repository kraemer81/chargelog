<script lang="ts">
  import { formatDecimal, parseDecimal } from '../format';
  import { ValidationError, type NewVehicle } from '../store/store';

  let {
    initial,
    submitLabel,
    onsubmit,
    oncancel,
  }: {
    /** Values to edit; omitted when adding a new vehicle. */
    initial?: NewVehicle;
    submitLabel: string;
    /** Persists the vehicle; a rejected ValidationError is shown in the form. */
    onsubmit: (vehicle: NewVehicle) => Promise<void>;
    oncancel: () => void;
  } = $props();

  // The form edits its own copy; `initial` only seeds it.
  // svelte-ignore state_referenced_locally
  let name = $state(initial?.name ?? '');
  // svelte-ignore state_referenced_locally
  let capacity = $state(initial ? formatDecimal(initial.batteryCapacityKwh) : '');
  let error = $state<string | undefined>();
  let saving = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = undefined;
    try {
      await onsubmit({ name, batteryCapacityKwh: parseDecimal(capacity) });
    } catch (e) {
      if (e instanceof ValidationError) {
        error = e.message;
      } else {
        console.error(e);
        error = 'Das Fahrzeug konnte nicht gespeichert werden.';
      }
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={submit}>
  <label>
    <span>Name</span>
    <input bind:value={name} autocomplete="off" required />
  </label>
  <label>
    <span>Nutzbare Akkukapazität (kWh)</span>
    <input bind:value={capacity} inputmode="decimal" autocomplete="off" required />
  </label>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="actions">
    <button type="button" class="text" onclick={oncancel}>Abbrechen</button>
    <button type="submit" class="filled" disabled={saving}>{submitLabel}</button>
  </div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  input {
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-s);
    background: var(--color-surface);
    color: var(--color-on-surface);
    font: inherit;
    font-size: var(--font-size-body);
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
  }

  .error {
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-label);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
