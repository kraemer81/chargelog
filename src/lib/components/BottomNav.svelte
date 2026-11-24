<script lang="ts" module>
  export type Tab = 'charge' | 'history' | 'settings';
</script>

<script lang="ts">
  let { active = $bindable() }: { active: Tab } = $props();

  // Icon paths: Material Icons (Apache License 2.0).
  const tabs: { id: Tab; label: string; icon: string }[] = [
    {
      id: 'charge',
      label: 'Laden',
      icon: 'M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM18 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM8 18v-4.5H6L10 6v5h2l-4 7z',
    },
    {
      id: 'history',
      label: 'Verlauf',
      icon: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
    },
    {
      id: 'settings',
      label: 'Einstellungen',
      icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    },
  ];
</script>

<nav aria-label="Hauptnavigation">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      class:active={active === tab.id}
      aria-current={active === tab.id ? 'page' : undefined}
      onclick={() => (active = tab.id)}
    >
      <span class="indicator">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.icon} /></svg>
      </span>
      <span class="label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    inset: auto 0 0 0;
    display: flex;
    gap: var(--space-2);
    height: calc(var(--nav-height) + env(safe-area-inset-bottom));
    padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom));
    background: var(--color-surface-container);
  }

  button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: var(--touch-target);
    border: none;
    border-radius: var(--radius-l);
    background: none;
    color: var(--color-on-surface-variant);
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .indicator {
    display: grid;
    place-items: center;
  }

  svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
  }

  .active {
    background: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
  }
</style>
