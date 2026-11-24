<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<h1>{title}</h1>
<p>Hier entsteht bald etwas.</p>

<style>
  h1 {
    font-size: var(--font-size-title);
    margin-bottom: var(--space-4);
  }

  p {
    color: var(--color-on-surface-variant);
  }
</style>
