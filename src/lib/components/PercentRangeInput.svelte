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
    <PercentInput label={labels.start} bind:value={start} />
    <span class="arrow" aria-hidden="true">→</span>
    <PercentInput label={labels.end} bind:value={end} />
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

  .numbers {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: var(--space-4);
  }

  .arrow {
    font-size: 1.5rem;
    color: var(--color-on-surface-variant);
  }

  input[type='range'] {
    width: 100%;
    height: var(--touch-target);
    margin: 0;
    accent-color: var(--color-primary);
  }
</style>
