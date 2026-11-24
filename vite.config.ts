import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from https://kraemer81.github.io/chargelog/
const BASE = '/chargelog/';

export default defineConfig({
  base: BASE,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      pwaAssets: { config: true },
      manifest: {
        name: 'ChargeLog',
        short_name: 'ChargeLog',
        description: 'Ladekosten deines Elektroautos erfassen und auswerten',
        lang: 'de',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        theme_color: '#006c4c',
        background_color: '#fbfdf9',
      },
      workbox: {
        // The plugin adds manifest.webmanifest itself; globbing it too creates a
        // conflicting duplicate precache entry and breaks the SW install.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Let the first service worker take control of the already-open page,
        // so it works offline right away and a later update can reload it.
        // Updates still wait for the user to accept the prompt.
        clientsClaim: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
