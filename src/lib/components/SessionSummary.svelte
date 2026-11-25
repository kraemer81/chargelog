<script lang="ts">
  import { formatEuro, formatIsoDate, formatKwh, formatPricePerKwh } from '../format';
  import type { ChargingSession } from '../store/store';

  let {
    session,
    vehicleName,
    showPrice = false,
  }: {
    session: ChargingSession;
    /** Shown before the details; left out when there is only one vehicle. */
    vehicleName?: string;
    showPrice?: boolean;
  } = $props();
</script>

<!-- Spans only, so the summary may sit inside a button. -->
<span class="main">
  <span>{formatIsoDate(session.date)}</span>
  <span class="cost">{formatEuro(session.costEur)}</span>
</span>
<span class="details">
  {#if vehicleName}
    {vehicleName} ·
  {/if}
  {session.startPercent} → {session.endPercent} % ·
  {formatKwh(session.gridEnergyKwh)}
  {#if showPrice}
    · {formatPricePerKwh(session.pricePerKwh)}
  {/if}
</span>
{#if session.note}
  <span class="details note">{session.note}</span>
{/if}

<style>
  .main {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .cost {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .details {
    display: block;
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .note {
    overflow-wrap: anywhere;
  }
</style>
