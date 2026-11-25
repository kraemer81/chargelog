<script lang="ts">
  import { onDestroy } from 'svelte';
  import BackupCard from '../lib/components/BackupCard.svelte';
  import ChargingDefaultsCard from '../lib/components/ChargingDefaultsCard.svelte';
  import VehiclesCard from '../lib/components/VehiclesCard.svelte';
  import { useStore } from '../lib/store/context';
  import { THEME_PREFERENCES, type ThemePreference } from '../lib/store/store';

  const store = useStore();

  const themeLabels: Record<ThemePreference, string> = {
    system: 'System',
    light: 'Hell',
    dark: 'Dunkel',
  };

  let themePreference = $state<ThemePreference | undefined>();

  const subscription = store.watchSettings().subscribe((settings) => {
    themePreference = settings.themePreference;
  });
  onDestroy(() => subscription.unsubscribe());

  function chooseTheme(value: ThemePreference) {
    void store.updateSettings({ themePreference: value });
  }
</script>

<h1>Einstellungen</h1>

<VehiclesCard />

<ChargingDefaultsCard />

<section class="card">
  <h2 id="theme-heading">Design</h2>
  <div class="segmented" role="radiogroup" aria-labelledby="theme-heading">
    {#each THEME_PREFERENCES as value (value)}
      <button
        type="button"
        role="radio"
        aria-checked={themePreference === value}
        onclick={() => chooseTheme(value)}
      >
        {themeLabels[value]}
      </button>
    {/each}
  </div>
</section>

<BackupCard />

<style>
  h1 {
    font-size: var(--font-size-title);
    margin-bottom: var(--space-4);
  }

  .segmented {
    display: flex;
    border: 1px solid var(--color-outline);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .segmented button {
    flex: 1;
    min-height: var(--touch-target);
    border: none;
    background: none;
    font-size: var(--font-size-label);
    font-weight: 500;
    cursor: pointer;
  }

  .segmented button + button {
    border-left: 1px solid var(--color-outline);
  }

  .segmented button[aria-checked='true'] {
    background: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
  }
</style>
