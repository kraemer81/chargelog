<script lang="ts">
  import { moveHandle, type Handle } from '../percentRange';
  import PercentInput from './PercentInput.svelte';

  let {
    start = $bindable(),
    end = $bindable(),
  }: {
    /** Whole percent the charge started at. */
    start: number;
    /** Whole percent the charge ended at. */
    end: number;
  } = $props();

  const labels: Record<Handle, string> = { start: 'Start', end: 'Ende' };

  const valueOf = (handle: Handle) => ({ start, end })[handle];

  // A clamped value leaves the state unchanged, so Svelte wouldn't move the
  // slider's handle back; that is done by hand.
  function slide(handle: Handle, event: Event & { currentTarget: HTMLInputElement }) {
    ({ start, end } = moveHandle({ start, end }, handle, Number(event.currentTarget.value)));
    event.currentTarget.value = String(valueOf(handle));
  }
</script>

<div class="range" role="group" aria-label="Ladestand">
  <div class="numbers">
    <!-- The inputs carry these labels for screen readers already. -->
    <span class="label start" aria-hidden="true">{labels.start}</span>
    <span class="label end" aria-hidden="true">{labels.end}</span>
    <div class="start"><PercentInput label={labels.start} bind:value={start} /></div>
    <!-- Material Icons "arrow_forward" (Apache License 2.0). -->
    <svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
    </svg>
    <div class="end"><PercentInput label={labels.end} bind:value={end} /></div>
  </div>
  {#each ['start', 'end'] as const as handle (handle)}
    <input
      type="range"
      min="0"
      max="100"
      value={valueOf(handle)}
      oninput={(event) => slide(handle, event)}
      aria-label={labels[handle]}
      aria-valuetext="{valueOf(handle)} %"
    />
  {/each}
</div>

<style>
  .range {
    display: flex;
    flex-direction: column;
  }

  /* Labels in the first row, numbers in the second, the arrow between the numbers. */
  .numbers {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    justify-items: center;
    align-items: center;
    column-gap: var(--space-2);
  }

  .start {
    grid-column: 1;
  }

  .end {
    grid-column: 3;
  }

  .label {
    grid-row: 1;
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .arrow {
    grid-row: 2;
    grid-column: 2;
    width: 32px;
    height: 32px;
    fill: var(--color-on-surface-variant);
  }

  input[type='range'] {
    width: 100%;
    height: var(--touch-target);
    margin: 0;
    accent-color: var(--color-primary);
  }
</style>
