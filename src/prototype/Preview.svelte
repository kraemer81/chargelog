<script lang="ts">
  import { formatEuro, formatKwh } from '../lib/format';
  import { calculateCharge, percentageError } from '../lib/store/store';

  let { start, end }: { start: number; end: number } = $props();

  /** Fixed example values so all variants preview the same numbers. */
  const EXAMPLE = { batteryCapacityKwh: 77, chargingLossPercent: 10, pricePerKwh: 0.3 };

  const problem = $derived(percentageError(start, end));
  const preview = $derived(
    problem ? undefined : calculateCharge({ ...EXAMPLE, startPercent: start, endPercent: end }),
  );
</script>

<div class="preview" aria-live="polite">
  {#if preview}
    <div>
      <span class="value">{formatKwh(preview.gridEnergyKwh)}</span>
      <span class="label">aus dem Netz</span>
    </div>
    <div>
      <span class="value">{formatEuro(preview.costEur)}</span>
      <span class="label">Kosten</span>
    </div>
  {:else}
    <p class="error">{problem}</p>
  {/if}
</div>

<style>
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

  .value {
    font-size: 1.25rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .label {
    font-size: var(--font-size-label);
  }

  .error {
    align-self: center;
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-label);
  }
</style>
