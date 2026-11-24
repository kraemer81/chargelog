<script lang="ts">
  import PercentInput from '../lib/components/PercentInput.svelte';
  import BatteryBar from './BatteryBar.svelte';
  import Preview from './Preview.svelte';
  import { moveHandle, type Handle } from './percentRange';

  const SUGGESTED = { start: 20, end: 80 };

  let stepper = $state({ ...SUGGESTED });
  let sliders = $state({ ...SUGGESTED });
  let battery = $state({ ...SUGGESTED });

  // A clamped value doesn't change the state, so the thumb is put back by hand.
  function slide(handle: Handle, event: Event & { currentTarget: HTMLInputElement }) {
    sliders = moveHandle(sliders, handle, Number(event.currentTarget.value));
    event.currentTarget.value = String(sliders[handle]);
  }
</script>

<main>
  <h1>Prozent-Eingabe</h1>
  <p class="hint">
    Drei Varianten zum Ausprobieren, Beispielauto mit 77 kWh, 10 % Ladeverlust, 0,30 €/kWh.
    Welche gefällt dir?
  </p>

  <section class="card">
    <h2>1 · Zahl mit − / +</h2>
    <div class="percentages">
      <PercentInput label="Start" bind:value={stepper.start} />
      <PercentInput label="Ende" bind:value={stepper.end} />
    </div>
    <Preview {...stepper} />
  </section>

  <section class="card">
    <h2>2 · Zahl mit zwei Schiebereglern</h2>
    <div class="percentages">
      <PercentInput label="Start" bind:value={sliders.start} steps={false} />
      <PercentInput label="Ende" bind:value={sliders.end} steps={false} />
    </div>
    <label class="slider">
      <span>Start</span>
      <input
        type="range"
        min="0"
        max="100"
        value={sliders.start}
        oninput={(e) => slide('start', e)}
      />
    </label>
    <label class="slider">
      <span>Ende</span>
      <input type="range" min="0" max="100" value={sliders.end} oninput={(e) => slide('end', e)} />
    </label>
    <Preview {...sliders} />
  </section>

  <section class="card">
    <h2>3 · Akku-Balken mit zwei Griffen</h2>
    <div class="percentages">
      <PercentInput label="Start" bind:value={battery.start} steps={false} />
      <PercentInput label="Ende" bind:value={battery.end} steps={false} />
    </div>
    <BatteryBar bind:start={battery.start} bind:end={battery.end} />
    <Preview {...battery} />
  </section>
</main>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--space-4);
  }

  h1 {
    font-size: var(--font-size-title);
  }

  .hint {
    margin: var(--space-1) 0 var(--space-4);
    color: var(--color-on-surface-variant);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Overrides the global h2 margin; the section gap spaces it already. */
  section h2 {
    margin: 0;
  }

  .percentages {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .slider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .slider span {
    width: 3em;
  }

  .slider input {
    flex: 1;
    height: var(--touch-target);
    margin: 0;
    accent-color: var(--color-primary);
  }
</style>
