<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatDecimal, parseDecimal } from '../format';
  import { useStore } from '../store/context';
  import { ValidationError, type Settings } from '../store/store';

  type Field = 'defaultPricePerKwh' | 'defaultChargingLossPercent';

  const store = useStore();

  /** The text in each input; seeded from the store, saved when the input is left. */
  let text = $state<Record<Field, string>>({ defaultPricePerKwh: '', defaultChargingLossPercent: '' });
  let errors = $state<Partial<Record<Field, string>>>({});
  let saved: Settings | undefined;

  const subscription = store.watchSettings().subscribe((settings) => {
    // Only overwrite what the user hasn't changed, so a save of one field
    // doesn't wipe an unsaved edit in the other.
    for (const field of ['defaultPricePerKwh', 'defaultChargingLossPercent'] as const) {
      if (!saved || parseDecimal(text[field]) === saved[field]) {
        text[field] = formatDecimal(settings[field]);
      }
    }
    saved = settings;
  });
  onDestroy(() => subscription.unsubscribe());

  async function save(field: Field) {
    errors[field] = undefined;
    try {
      await store.updateSettings({ [field]: parseDecimal(text[field]) });
    } catch (e) {
      if (e instanceof ValidationError) {
        errors[field] = e.message;
      } else {
        console.error(e);
        errors[field] = 'Der Wert konnte nicht gespeichert werden.';
      }
    }
  }
</script>

<section class="card">
  <h2>Strompreis und Ladeverlust</h2>
  <p class="hint">Gelten für neue Ladevorgänge. Bereits gespeicherte bleiben unverändert.</p>

  <div class="fields">
    <label>
      <span>Preis pro kWh (€)</span>
      <input
        bind:value={text.defaultPricePerKwh}
        onchange={() => void save('defaultPricePerKwh')}
        inputmode="decimal"
        autocomplete="off"
        aria-invalid={errors.defaultPricePerKwh !== undefined}
      />
      {#if errors.defaultPricePerKwh}
        <span class="error" role="alert">{errors.defaultPricePerKwh}</span>
      {/if}
    </label>
    <label>
      <span>Ladeverlust (%)</span>
      <input
        bind:value={text.defaultChargingLossPercent}
        onchange={() => void save('defaultChargingLossPercent')}
        inputmode="decimal"
        autocomplete="off"
        aria-invalid={errors.defaultChargingLossPercent !== undefined}
      />
      {#if errors.defaultChargingLossPercent}
        <span class="error" role="alert">{errors.defaultChargingLossPercent}</span>
      {/if}
    </label>
  </div>
</section>

<style>
  .hint {
    margin: 0 0 var(--space-3);
    color: var(--color-on-surface-variant);
    font-size: var(--font-size-label);
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  input {
    min-height: var(--touch-target);
    min-width: 0;
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

  input[aria-invalid='true'] {
    border-color: var(--color-error);
  }

  .error {
    color: var(--color-error);
  }
</style>
