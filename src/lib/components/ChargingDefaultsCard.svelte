<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatDecimal, parseDecimal } from '../format';
  import { useStore } from '../store/context';
  import { errorMessage } from '../errorMessage';
  import { defaultRates, type ChargingRates, type Settings } from '../store/store';
  import ChargingRatesFields from './ChargingRatesFields.svelte';

  type Field = keyof ChargingRates;

  /** The setting that holds the default for each rate. */
  const SETTING = {
    pricePerKwh: 'defaultPricePerKwh',
    chargingLossPercent: 'defaultChargingLossPercent',
  } as const satisfies Record<Field, keyof Settings>;

  const store = useStore();

  /** The text in each input; seeded from the store, saved when the input is left. */
  let text = $state<Record<Field, string>>({ pricePerKwh: '', chargingLossPercent: '' });
  let errors = $state<Partial<Record<Field, string>>>({});
  let saved: ChargingRates | undefined;

  const subscription = store.watchSettings().subscribe((settings) => {
    const rates = defaultRates(settings);
    // Only overwrite what the user hasn't changed, so a save of one field
    // doesn't wipe an unsaved edit in the other.
    for (const field of ['pricePerKwh', 'chargingLossPercent'] as const) {
      if (!saved || parseDecimal(text[field]) === saved[field]) {
        text[field] = formatDecimal(rates[field]);
      }
    }
    saved = rates;
  });
  onDestroy(() => subscription.unsubscribe());

  async function save(field: Field) {
    errors[field] = undefined;
    try {
      await store.updateSettings({ [SETTING[field]]: parseDecimal(text[field]) });
    } catch (e) {
      errors[field] = errorMessage(e, 'Der Wert konnte nicht gespeichert werden.');
    }
  }
</script>

<section class="card">
  <h2>Strompreis und Ladeverlust</h2>
  <p class="hint">Gelten für neue Ladevorgänge. Bereits gespeicherte bleiben unverändert.</p>

  <ChargingRatesFields bind:text {errors} onchange={(field) => void save(field)} />
</section>

<style>
  .hint {
    font-size: var(--font-size-label);
  }
</style>
