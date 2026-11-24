<script lang="ts">
  import { moveHandle, nearestHandle, percentAt, type Handle } from './percentRange';

  let { start = $bindable(), end = $bindable() }: { start: number; end: number } = $props();

  let track: HTMLDivElement;
  /** The handle the finger currently drags. */
  let dragging = $state<Handle | undefined>();

  function moveTo(handle: Handle, percent: number) {
    ({ start, end } = moveHandle({ start, end }, handle, percent));
  }

  function percentOf(event: PointerEvent): number {
    return percentAt(event.clientX, track.getBoundingClientRect());
  }

  // Touching anywhere on the bar grabs the nearer handle and moves it there.
  function onpointerdown(event: PointerEvent) {
    const percent = percentOf(event);
    dragging = nearestHandle(percent, { start, end });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    moveTo(dragging, percent);
  }

  function onpointermove(event: PointerEvent) {
    if (dragging) moveTo(dragging, percentOf(event));
  }

  function stopDragging() {
    dragging = undefined;
  }

  function onkeydown(handle: Handle, event: KeyboardEvent) {
    const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    moveTo(handle, (handle === 'start' ? start : end) + delta);
  }
</script>

<!-- Dragging on the bar is a pointer shortcut; the handles are the keyboard-accessible sliders. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="battery"
  {onpointerdown}
  {onpointermove}
  onpointerup={stopDragging}
  onpointercancel={stopDragging}
>
  <div class="track" bind:this={track}>
    <div class="existing" style:width="{start}%"></div>
    <div class="charged" style:left="{start}%" style:width="{Math.max(0, end - start)}%"></div>
    {#each [['start', start, 'Start'], ['end', end, 'Ende']] as const as [handle, percent, label] (handle)}
      <div
        class="handle"
        class:active={dragging === handle}
        style:left="{percent}%"
        role="slider"
        tabindex="0"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext="{percent} %"
        onkeydown={(event) => onkeydown(handle, event)}
      ></div>
    {/each}
  </div>
  <div class="cap" aria-hidden="true"></div>
</div>

<style>
  /* The padding makes room for handles at 0 and 100 % and enlarges the touch area. */
  .battery {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: var(--space-3) var(--space-4);
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    cursor: pointer;
  }

  .track {
    position: relative;
    flex: 1;
    height: 40px;
    border: 2px solid var(--color-outline);
    border-radius: var(--radius-s);
    background: var(--color-surface);
  }

  .existing,
  .charged {
    position: absolute;
    top: 2px;
    bottom: 2px;
  }

  .existing {
    left: 0;
    border-radius: 4px 0 0 4px;
    background: var(--color-outline-variant);
  }

  .charged {
    background: var(--color-primary);
  }

  .cap {
    width: 6px;
    height: 16px;
    border-radius: 0 3px 3px 0;
    background: var(--color-outline);
  }

  .handle {
    position: absolute;
    top: 50%;
    width: 28px;
    height: 52px;
    transform: translate(-50%, -50%);
    border: 3px solid var(--color-primary);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    box-shadow: var(--elevation-2);
    transition: transform 0.1s;
  }

  .handle.active {
    transform: translate(-50%, -50%) scale(1.15);
  }

  .handle:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
</style>
