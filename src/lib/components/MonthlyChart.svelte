<script lang="ts">
  import {
    formatDecimal,
    formatEuro,
    formatKwh,
    formatMonth,
    formatShortMonth,
    sessionsLabel,
  } from '../format';
  import type { MonthTotals } from '../store/store';

  let { months }: { months: MonthTotals[] } = $props();

  /** The values the chart can show, one at a time. */
  const MEASURES = [
    { key: 'gridEnergyKwh', unit: 'kWh', name: 'Energie aus dem Netz', format: formatKwh },
    { key: 'costEur', unit: '€', name: 'Kosten', format: formatEuro },
  ] as const;

  // Raw, so the selection stays identical to its MEASURES entry.
  let measure = $state.raw<(typeof MEASURES)[number]>(MEASURES[0]);
  /** The tapped month; the latest month while none is tapped or it left the range. */
  let chosen = $state<string | undefined>();
  let scroller = $state<HTMLElement | undefined>();

  const selected = $derived(months.find((m) => m.month === chosen) ?? months.at(-1));
  const axis = $derived(niceAxis(Math.max(...months.map((m) => m[measure.key]))));

  // Start scrolled to the latest months whenever the range changes.
  $effect(() => {
    void months.length;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });

  /** Three or four round ticks from 0 up to at least `max`. */
  function niceAxis(max: number): { top: number; ticks: number[] } {
    if (!(max > 0)) return { top: 1, ticks: [0, 1] };
    const rough = max / 3;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= rough)!;
    const top = Math.ceil(max / step) * step;
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    return { top, ticks };
  }

</script>

<section class="card" aria-label="Monatsübersicht">
  <div class="header">
    <h2>Pro Monat</h2>
    <div class="toggle" role="radiogroup" aria-label="Wert">
      {#each MEASURES as option (option.key)}
        <button
          type="button"
          role="radio"
          aria-checked={measure === option}
          aria-label={option.name}
          onclick={() => (measure = option)}
        >
          {option.unit}
        </button>
      {/each}
    </div>
  </div>

  {#if selected}
    <p class="selected" aria-live="polite">
      <span class="selected-month">{formatMonth(selected.month)}</span>
      <span class="selected-values">
        {formatKwh(selected.gridEnergyKwh)} · {formatEuro(selected.costEur)} ·
        {selected.sessionCount} {sessionsLabel(selected.sessionCount)}
      </span>
    </p>
  {/if}

  <div class="chart">
    <div class="y-axis" aria-hidden="true">
      {#each axis.ticks as tick (tick)}
        <span style:bottom="{(tick / axis.top) * 100}%">{formatDecimal(tick)}</span>
      {/each}
    </div>
    <div class="scroller" bind:this={scroller}>
      <div class="plot">
        <div class="grid" aria-hidden="true">
          {#each axis.ticks as tick (tick)}
            <div class="gridline" style:bottom="{(tick / axis.top) * 100}%"></div>
          {/each}
        </div>
        {#each months as month, i (month.month)}
          <button
            type="button"
            class="column"
            class:selected={month.month === selected?.month}
            aria-label="{formatMonth(month.month)}: {measure.format(month[measure.key])}"
            aria-pressed={month.month === selected?.month}
            onclick={() => (chosen = month.month)}
          >
            <span class="bar-area">
              <span class="bar" style:height="{(month[measure.key] / axis.top) * 100}%"></span>
            </span>
            <span class="label" aria-hidden="true">
              {formatShortMonth(month.month)}
              <span class="year">
                {i === 0 || month.month.endsWith('-01') ? month.month.slice(0, 4) : ''}
              </span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  h2 {
    margin: 0;
  }

  .toggle {
    display: flex;
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .toggle button {
    min-width: 3rem;
    min-height: 32px;
    padding: 0 var(--space-3);
    border: none;
    background: none;
    font-size: var(--font-size-label);
    font-weight: 500;
    cursor: pointer;
  }

  .toggle button + button {
    border-left: 1px solid var(--color-outline);
  }

  .toggle button[aria-checked='true'] {
    background: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
  }

  .selected {
    display: flex;
    flex-direction: column;
    margin: 0 0 var(--space-3);
  }

  .selected-month {
    font-weight: 500;
  }

  .selected-values {
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
    font-variant-numeric: tabular-nums;
  }

  /* Plot height excludes the month labels below it; the y-axis mirrors that. */
  .chart {
    --plot-height: 160px;
    --label-height: 2.5rem;
    display: flex;
    gap: var(--space-2);
  }

  .y-axis {
    position: relative;
    flex: none;
    width: 2.75rem;
    height: var(--plot-height);
    margin-top: var(--space-2);
    font-size: 0.6875rem;
    color: var(--color-on-surface-variant);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .y-axis span {
    position: absolute;
    right: 0;
    transform: translateY(50%);
    line-height: 1;
  }

  .scroller {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    padding-top: var(--space-2);
  }

  .plot {
    position: relative;
    display: flex;
    min-width: 100%;
    width: max-content;
  }

  .grid {
    position: absolute;
    inset: 0 0 auto;
    height: var(--plot-height);
    pointer-events: none;
  }

  .gridline {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--color-outline-variant);
  }

  .column {
    display: flex;
    flex: 1 0 28px;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    border: none;
    border-radius: var(--radius-s);
    background: none;
    cursor: pointer;
  }

  .column.selected {
    background: var(--color-surface-container);
  }

  .bar-area {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: var(--plot-height);
  }

  .bar {
    width: min(24px, calc(100% - 4px));
    border-radius: 4px 4px 0 0;
    background: var(--color-primary);
  }

  .column:not(.selected) .bar {
    opacity: 0.6;
  }

  .label {
    display: flex;
    flex-direction: column;
    height: var(--label-height);
    padding-top: var(--space-1);
    font-size: 0.6875rem;
    line-height: 1.3;
    color: var(--color-on-surface-variant);
    text-align: center;
  }

  .year {
    min-height: 1em;
  }
</style>
