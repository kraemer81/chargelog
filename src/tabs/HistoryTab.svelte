<script lang="ts">
  import { untrack } from 'svelte';
  import DateInput from '../lib/components/DateInput.svelte';
  import MonthlyChart from '../lib/components/MonthlyChart.svelte';
  import SessionEditDialog from '../lib/components/SessionEditDialog.svelte';
  import SessionSummary from '../lib/components/SessionSummary.svelte';
  import {
    formatEuro,
    formatIsoDate,
    formatKwh,
    sessionsLabel,
  } from '../lib/format';
  import { useStore } from '../lib/store/context';
  import type { ChargingSession, History, SessionFilter, Vehicle } from '../lib/store/store';

  const store = useStore();

  let vehicles = $state<Vehicle[]>([]);
  /** `''` for all vehicles, otherwise a vehicle id. */
  let vehicleFilter = $state<number | ''>('');
  let from = $state('');
  let to = $state('');
  let history = $state<History | undefined>();
  let editing = $state<ChargingSession | undefined>();

  $effect(() => {
    const subscription = store.watchVehicles().subscribe((list) => {
      vehicles = list;
      // A deleted vehicle can't stay selected. Untracked, so changing the
      // filter doesn't resubscribe.
      untrack(() => {
        if (vehicleFilter !== '' && !list.some((v) => v.id === vehicleFilter)) vehicleFilter = '';
      });
    });
    return () => subscription.unsubscribe();
  });

  const filter = $derived<SessionFilter>({
    ...(vehicleFilter !== '' ? { vehicleId: vehicleFilter } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const hasFilter = $derived(vehicleFilter !== '' || from !== '' || to !== '');
  const vehicleNames = $derived(new Map(vehicles.map((v) => [v.id, v.name])));

  $effect(() => {
    const subscription = store.watchHistory(filter).subscribe((value) => (history = value));
    return () => subscription.unsubscribe();
  });

  function resetFilter() {
    vehicleFilter = '';
    from = '';
    to = '';
  }
</script>

<h1>Verlauf</h1>

<section class="card filter" aria-label="Filter">
  {#if vehicles.length > 1}
    <label class="field vehicle">
      <span>Fahrzeug</span>
      <select bind:value={vehicleFilter}>
        <option value="">Alle Fahrzeuge</option>
        {#each vehicles as option (option.id)}
          <option value={option.id}>{option.name}</option>
        {/each}
      </select>
    </label>
  {/if}
  <DateInput label="Von" bind:value={from} />
  <DateInput label="Bis" bind:value={to} />
  {#if hasFilter}
    <button type="button" class="text reset" onclick={resetFilter}>Filter zurücksetzen</button>
  {/if}
</section>

{#if history}
  <section class="card" aria-label="Summen">
    <dl class="totals">
      <div>
        <dt>{sessionsLabel(history.totals.sessionCount)}</dt>
        <dd>{history.totals.sessionCount}</dd>
      </div>
      <div>
        <dt>Kosten</dt>
        <dd>{formatEuro(history.totals.costEur)}</dd>
      </div>
      <div>
        <dt>Aus dem Netz</dt>
        <dd>{formatKwh(history.totals.gridEnergyKwh)}</dd>
      </div>
      <div>
        <dt>In den Akku</dt>
        <dd>{formatKwh(history.totals.batteryEnergyKwh)}</dd>
      </div>
    </dl>
  </section>

  {#if history.months.length > 0}
    <MonthlyChart months={history.months} />

    <section class="card" aria-label="Pro Jahr">
      <h2>Pro Jahr</h2>
      <table class="years">
        <thead>
          <tr>
            <th scope="col">Jahr</th>
            <th scope="col">Ladevorgänge</th>
            <th scope="col">Aus dem Netz</th>
            <th scope="col">Kosten</th>
          </tr>
        </thead>
        <tbody>
          {#each history.years.toReversed() as row (row.year)}
            <tr>
              <th scope="row">{row.year}</th>
              <td>{row.sessionCount}</td>
              <td>{formatKwh(row.gridEnergyKwh)}</td>
              <td>{formatEuro(row.costEur)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section class="card">
    {#if history.sessions.length === 0}
      <p class="hint">
        {hasFilter ? 'Keine Ladevorgänge für diesen Filter.' : 'Noch keine Ladevorgänge erfasst.'}
      </p>
    {:else}
      <ul>
        {#each history.sessions as session (session.id)}
          <li>
            <button
              type="button"
              class="session"
              aria-label="Ladevorgang vom {formatIsoDate(session.date)} bearbeiten"
              onclick={() => (editing = session)}
            >
              <SessionSummary
                {session}
                vehicleName={vehicles.length > 1 ? vehicleNames.get(session.vehicleId) : undefined}
                showPrice
              />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if editing}
  <SessionEditDialog session={editing} {vehicles} onclose={() => (editing = undefined)} />
{/if}

<style>
  h1 {
    font-size: var(--font-size-title);
    margin-bottom: var(--space-4);
  }

  /* minmax(0, …): date inputs have an intrinsic width that would widen the columns. */
  .filter {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
  }

  .filter .vehicle,
  .filter .reset {
    grid-column: 1 / -1;
  }

  .filter .reset {
    justify-self: end;
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)) calc(-1 * var(--space-2)) 0;
  }

  .totals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin: 0;
  }

  .totals div {
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

  .hint {
    margin: 0;
  }

  .years {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-label);
    font-variant-numeric: tabular-nums;
  }

  .years th,
  .years td {
    padding: var(--space-2) 0;
    text-align: right;
  }

  .years th:first-child {
    text-align: left;
  }

  .years thead th {
    padding-top: 0;
    font-weight: 400;
    color: var(--color-on-surface-variant);
  }

  .years tbody tr {
    border-top: 1px solid var(--color-outline-variant);
  }

  .years tbody th {
    font-weight: 500;
  }

  ul {
    list-style: none;
    margin: calc(-1 * var(--space-2)) 0;
    padding: 0;
  }

  li {
    border-bottom: 1px solid var(--color-outline-variant);
  }

  li:last-child {
    border-bottom: none;
  }

  .session {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
  }

</style>
