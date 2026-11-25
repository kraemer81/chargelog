<script lang="ts" module>
  import { formatEditableDecimal, parseDecimal } from '../format';
  import type { ChargingRates } from '../store/store';

  type Field = keyof ChargingRates;

  /** What the fields show for `rates`, as editable German decimals. */
  export function ratesText(rates: ChargingRates): Record<Field, string> {
    return {
      pricePerKwh: formatEditableDecimal(rates.pricePerKwh),
      chargingLossPercent: formatEditableDecimal(rates.chargingLossPercent),
    };
  }

  /** The rates typed into the fields; unparsable text becomes NaN. */
  export function parseRatesText(text: Record<Field, string>): ChargingRates {
    return {
      pricePerKwh: parseDecimal(text.pricePerKwh),
      chargingLossPercent: parseDecimal(text.chargingLossPercent),
    };
  }
</script>

<script lang="ts">

  let {
    text = $bindable(),
    errors = {},
    onchange,
  }: {
    /** What is typed into each input, as German decimal text. */
    text: Record<Field, string>;
    errors?: Partial<Record<Field, string | undefined>>;
    /** Called when an input is left after its text changed. */
    onchange?: (field: Field) => void;
  } = $props();

  const fields: { field: Field; label: string }[] = [
    { field: 'pricePerKwh', label: 'Preis pro kWh (€)' },
    { field: 'chargingLossPercent', label: 'Ladeverlust (%)' },
  ];
</script>

<div class="fields">
  {#each fields as { field, label } (field)}
    <label>
      <span>{label}</span>
      <input
        bind:value={text[field]}
        onchange={() => onchange?.(field)}
        inputmode="decimal"
        autocomplete="off"
        aria-invalid={errors[field] !== undefined}
      />
      {#if errors[field]}
        <span class="error" role="alert">{errors[field]}</span>
      {/if}
    </label>
  {/each}
</div>

<style>
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
