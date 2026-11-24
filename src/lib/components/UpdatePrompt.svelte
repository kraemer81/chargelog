<script lang="ts">
  import { registerSW } from 'virtual:pwa-register';

  const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

  let needRefresh = $state(false);
  let offlineReady = $state(false);

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      needRefresh = true;
    },
    onOfflineReady() {
      offlineReady = true;
    },
    // The plugin only reloads when the page was already controlled at
    // registration, which misses the first session. applyUpdate() reloads.
    onNeedReload() {},
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // An open app never navigates, so check for new deployments ourselves:
      // periodically and whenever the app comes back to the foreground.
      const checkForUpdate = () => {
        if (navigator.onLine) void registration.update();
      };
      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });

  function applyUpdate() {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    void updateServiceWorker();
  }

  function dismiss() {
    needRefresh = false;
    offlineReady = false;
  }
</script>

{#if needRefresh}
  <div class="snackbar" role="status">
    <span>Neue Version verfügbar.</span>
    <button type="button" onclick={applyUpdate}>Aktualisieren</button>
    <button type="button" onclick={dismiss}>Später</button>
  </div>
{:else if offlineReady}
  <div class="snackbar" role="status">
    <span>App ist jetzt offline verfügbar.</span>
    <button type="button" onclick={dismiss}>OK</button>
  </div>
{/if}

<style>
  .snackbar {
    position: fixed;
    left: var(--space-4);
    right: var(--space-4);
    bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-3));
    max-width: 608px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-radius: var(--radius-s);
    background: var(--color-inverse-surface);
    color: var(--color-inverse-on-surface);
    box-shadow: var(--elevation-2);
  }

  span {
    flex: 1;
  }

  button {
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: none;
    border-radius: var(--radius-full);
    background: none;
    color: var(--color-inverse-primary);
    font-weight: 500;
    cursor: pointer;
  }
</style>
