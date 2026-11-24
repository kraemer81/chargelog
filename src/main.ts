import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { storeContext } from './lib/store/context';
import { openChargeLogStore } from './lib/store/store';

const store = await openChargeLogStore();

mount(App, {
  target: document.getElementById('app')!,
  context: storeContext(store),
});
