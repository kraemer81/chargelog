<script lang="ts">
  import { formatEuro, formatKwh, sessionsLabel } from '../format';
  import type { SessionTotals } from '../store/store';

  let {
    totals,
    showBatteryEnergy = false,
  }: {
    totals: SessionTotals;
    /** Adds the energy that went into the battery, laid out as two rows of two. */
    showBatteryEnergy?: boolean;
  } = $props();
</script>

<dl class:compact={!showBatteryEnergy}>
  <div>
    <dt>{sessionsLabel(totals.sessionCount)}</dt>
    <dd>{totals.sessionCount}</dd>
  </div>
  <div>
    <dt>Kosten</dt>
    <dd>{formatEuro(totals.costEur)}</dd>
  </div>
  <div>
    <dt>Aus dem Netz</dt>
    <dd>{formatKwh(totals.gridEnergyKwh)}</dd>
  </div>
  {#if showBatteryEnergy}
    <div>
      <dt>In den Akku</dt>
      <dd>{formatKwh(totals.batteryEnergyKwh)}</dd>
    </div>
  {/if}
</dl>

<style>
  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  /* Three values in one row: smaller, so four-digit kWh still fit on a phone. */
  dl.compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  div {
    display: flex;
    flex-direction: column;
  }

  dt {
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .compact dd {
    font-size: var(--font-size-body);
  }
</style>
