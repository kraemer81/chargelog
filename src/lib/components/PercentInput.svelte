<script lang="ts">
  import { insertedText } from '../insertedText';

  let {
    label,
    value = $bindable(),
  }: {
    label: string;
    /** Whole percent, kept within 0–100. */
    value: number;
  } = $props();

  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

  // The input shows its own text while focused, so typing isn't fought by
  // re-formatting; it is committed back to `value` on every keystroke.
  // svelte-ignore state_referenced_locally
  let text = $state(String(value));
  let focused = $state(false);
  // The value isn't selected on focus (that pops up the selection toolbar on
  // phones); instead the first thing typed after focusing replaces it.
  let replaceOnType = false;
  let textAtFocus = '';

  $effect(() => {
    if (!focused) text = String(value);
  });

  function oninput() {
    let typed = text;
    if (replaceOnType) {
      replaceOnType = false;
      // Deleting yields nothing inserted; then edit the existing value as usual.
      typed = insertedText(textAtFocus, text) || text;
    }
    const digits = typed.replace(/\D/g, '').slice(0, 3);
    if (digits === '') {
      text = '';
      return;
    }
    value = clamp(Number(digits));
    text = String(value);
  }

  /** Enter on the keypad only confirms the number; it must not submit the form. */
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    (event.currentTarget as HTMLInputElement).blur();
  }

  function onblur() {
    focused = false;
    text = String(value);
  }

  function onfocus() {
    focused = true;
    replaceOnType = true;
    textAtFocus = text;
  }
</script>

<div class="percent" role="group" aria-label={label}>
  <span class="label">{label}</span>
  <div class="row">
    <button
      type="button"
      class="step"
      aria-label="{label} verringern"
      disabled={value <= 0}
      onclick={() => (value = clamp(value - 1))}
    >
      −
    </button>
    <label class="number">
      <input
        bind:value={text}
        {oninput}
        {onkeydown}
        {onfocus}
        {onblur}
        inputmode="numeric"
        pattern="[0-9]*"
        enterkeyhint="done"
        autocomplete="off"
        aria-label="{label} in Prozent"
      />
      <span aria-hidden="true">%</span>
    </label>
    <button
      type="button"
      class="step"
      aria-label="{label} erhöhen"
      disabled={value >= 100}
      onclick={() => (value = clamp(value + 1))}
    >
      +
    </button>
  </div>
</div>

<style>
  .percent {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .label {
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .step {
    width: var(--touch-target);
    height: var(--touch-target);
    flex: none;
    border: none;
    border-radius: var(--radius-full);
    background: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .number {
    display: flex;
    align-items: baseline;
    font-size: 2.25rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: text;
  }

  .number input {
    width: 3ch;
    padding: 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: inherit;
    font: inherit;
    text-align: right;
  }

  .number input:focus {
    outline: none;
    border-bottom-color: var(--color-primary);
  }

  .number span {
    font-size: 1.25rem;
    color: var(--color-on-surface-variant);
  }
</style>
