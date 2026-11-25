<script lang="ts">
  import { onDestroy } from 'svelte';
  import BottomNav, { type Tab } from './lib/components/BottomNav.svelte';
  import UpdatePrompt from './lib/components/UpdatePrompt.svelte';
  import { useStore } from './lib/store/context';
  import type { ReadProblem } from './lib/store/store';
  import { applyTheme } from './lib/theme';
  import ChargeTab from './tabs/ChargeTab.svelte';
  import HistoryTab from './tabs/HistoryTab.svelte';
  import SettingsTab from './tabs/SettingsTab.svelte';

  const store = useStore();

  let activeTab = $state<Tab>('charge');

  const themeSubscription = store
    .watchSettings()
    .subscribe((settings) => applyTheme(settings.themePreference));
  onDestroy(() => themeSubscription.unsubscribe());

  /** The latest problem per kind of data, so a broken read shows up instead of an empty screen. */
  let readProblems = $state<Record<string, ReadProblem>>({});
  onDestroy(store.onReadProblem((problem) => (readProblems[problem.data] = problem)));
</script>

<div class="shell">
  <main>
    {#if Object.keys(readProblems).length > 0}
      <section class="card read-problems" role="alert">
        <h2>Daten konnten nicht geladen werden</h2>
        <ul>
          {#each Object.values(readProblems) as problem (problem.data)}
            <li>
              {problem.data}: {problem.kind === 'failed' ? 'Fehler' : 'lädt sehr lange'}
              <code>{problem.detail}</code>
            </li>
          {/each}
        </ul>
        <button type="button" class="text" onclick={() => (readProblems = {})}>Ausblenden</button>
      </section>
    {/if}
    {#if activeTab === 'charge'}
      <ChargeTab onopensettings={() => (activeTab = 'settings')} />
    {:else if activeTab === 'history'}
      <HistoryTab />
    {:else}
      <SettingsTab />
    {/if}
  </main>

  <UpdatePrompt />
  <BottomNav bind:active={activeTab} />
</div>

<style>
  .shell {
    min-height: 100%;
    padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom));
  }

  main {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--space-4);
  }

  .read-problems {
    margin-bottom: var(--space-4);
    border-color: var(--color-error);
    color: var(--color-error);
    font-size: var(--font-size-label);
  }

  .read-problems ul {
    margin: 0;
    padding-left: var(--space-4);
  }

  .read-problems code {
    display: block;
    overflow-wrap: anywhere;
    color: var(--color-on-surface-variant);
  }
</style>
