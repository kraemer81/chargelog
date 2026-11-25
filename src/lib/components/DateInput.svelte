<script lang="ts">
  let {
    label,
    value = $bindable(),
    required = false,
  }: {
    label: string;
    /** `YYYY-MM-DD`, or empty when no date is chosen. */
    value: string;
    required?: boolean;
  } = $props();
</script>

<label class="field">
  <span>{label}</span>
  <div class="date">
    <input type="date" bind:value {required} />
    <!-- Material Icons "calendar_today" (Apache License 2.0). -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"
      />
    </svg>
  </div>
</label>

<style>
  .date {
    position: relative;
  }

  /*
   * Mobile browsers give date inputs an intrinsic width; make it fill the field.
   * The native indicator (a tiny arrow on some phones) is replaced by our icon,
   * indented like the text on the left.
   */
  .date input {
    position: relative;
    width: 100%;
    min-width: 0;
    padding-right: calc(2 * var(--space-3) + 24px);
    -webkit-appearance: none;
    appearance: none;
  }

  /* Invisible but stretched over the field, so tapping anywhere opens the picker. */
  .date input::-webkit-calendar-picker-indicator {
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    margin: 0;
    padding: 0;
    opacity: 0;
    cursor: pointer;
  }

  .date svg {
    position: absolute;
    top: 50%;
    right: var(--space-3);
    width: 24px;
    height: 24px;
    transform: translateY(-50%);
    fill: var(--color-on-surface-variant);
    pointer-events: none;
  }

  /* iOS Safari centres the date value by default. */
  .date input::-webkit-date-and-time-value {
    text-align: left;
  }
</style>
