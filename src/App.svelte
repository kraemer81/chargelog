<script lang="ts">
  import { onDestroy } from 'svelte';
  import BottomNav, { type Tab } from './lib/components/BottomNav.svelte';
  import UpdatePrompt from './lib/components/UpdatePrompt.svelte';
  import { useStore } from './lib/store/context';
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
</script>

<div class="shell">
  <main>
    {#if activeTab === 'charge'}
      <ChargeTab />
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
</style>
