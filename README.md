# ChargeLog

A progressive web app for logging and analysing the home charging costs of electric vehicles. The UI is German only.

Live: <https://kraemer81.github.io/chargelog/>

Built with Svelte 5, TypeScript (strict) and Vite. Data stays on the device in IndexedDB (via Dexie). `vite-plugin-pwa` provides the manifest, offline caching and the update prompt.

## Requirements

- Node.js 26 (see `.nvmrc`; with nvm: `nvm use`)

## Run

```sh
npm install
npm run dev        # dev server at http://localhost:5173/chargelog/
```

The service worker only exists in production builds. To try offline mode, installation and the update prompt locally:

```sh
npm run build
npm run preview    # http://localhost:4173/chargelog/
```

## Test

```sh
npm run check      # svelte-check: type-checks .ts and .svelte files
npm test           # Vitest, single run
npm run test:watch # Vitest in watch mode
```

Tests exercise the public interface of the ChargeLog store (`src/lib/store/store.ts`) against a real Dexie database running on `fake-indexeddb`, with a fresh database per test. See `src/lib/store/store.test.ts` for the pattern. Pure UI helpers in `src/lib/` (e.g. `percentRange.ts`) have their own small tests; Svelte components are not unit-tested.

## Deploy

Every push to `main` runs `.github/workflows/ci.yml`: install → type-check → test → build → deploy to GitHub Pages. The deploy job only runs when all previous steps pass. Pull requests run the same checks without deploying.

One-time repository setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The app is served from the `/chargelog/` sub-path. The Vite `base` and the PWA `scope`/`start_url` in `vite.config.ts` must match the repository name. Renaming the repository changes the URL, and an installed app must then be reinstalled.

## Project structure

```
src/
  main.ts                 opens the store and mounts the app
  App.svelte              app shell: tabs, theme, update prompt
  app.css                 design tokens (light/dark) and base styles
  lib/store/store.ts      ChargeLog store: all domain behaviour and persistence
  lib/format.ts           German number/date formatting and number parsing for the UI
  lib/insertedText.ts     finds the text typed into an input (first digit replaces the percent value)
  lib/percentRange.ts     moves start/end of a charge without letting them cross (sliders)
  lib/components/         shared UI components
  tabs/                   Laden, Verlauf, Einstellungen
public/favicon.svg        source for all generated app icons (pwa-assets.config.ts)
```
