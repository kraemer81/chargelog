<script lang="ts">
  import { errorMessage } from '../errorMessage';
  import { formatIsoDate, todayIsoDate } from '../format';
  import { saveFile } from '../saveFile';
  import { useStore } from '../store/context';
  import { readBackup, writeBackup, type Backup } from '../store/store';

  const store = useStore();

  let error = $state<string | undefined>();
  let status = $state<string | undefined>();
  let busy = $state(false);
  let fileInput = $state<HTMLInputElement>();
  /** The backup read from the chosen file, while asking whether to restore it. */
  let pendingRestore = $state<Backup | undefined>();
  let restoreDialog = $state<HTMLDialogElement>();
  let deleteDialog = $state<HTMLDialogElement>();

  /** Clears earlier messages, runs `action` and shows its error, if any. */
  async function run(action: () => Promise<void>, failure: string) {
    error = undefined;
    status = undefined;
    busy = true;
    try {
      await action();
    } catch (e) {
      error = errorMessage(e, failure);
    } finally {
      busy = false;
    }
  }

  function exportBackup() {
    void run(async () => {
      const backup = await store.exportBackup();
      const file = new File(
        [writeBackup(backup)],
        `chargelog-sicherung-${todayIsoDate()}.json`,
        { type: 'application/json' },
      );
      await saveFile(file);
    }, 'Die Sicherung konnte nicht erstellt werden.');
  }

  function chooseBackupFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Reset, so choosing the same file again fires another change.
    input.value = '';
    if (!file) return;
    void run(async () => {
      pendingRestore = readBackup(await file.text());
      restoreDialog?.showModal();
    }, 'Die Datei konnte nicht gelesen werden.');
  }

  async function confirmRestore() {
    const backup = pendingRestore;
    restoreDialog?.close();
    if (!backup) return;
    await run(async () => {
      await store.restoreBackup(backup);
      status = 'Die Sicherung wurde wiederhergestellt.';
    }, 'Die Sicherung konnte nicht wiederhergestellt werden.');
  }

  async function confirmDelete() {
    deleteDialog?.close();
    await run(async () => {
      await store.deleteAllData();
      status = 'Alle Daten wurden gelöscht.';
    }, 'Die Daten konnten nicht gelöscht werden.');
  }

  function count(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
  }
</script>

<section class="card">
  <h2>Daten</h2>
  <p class="hint">
    Sichere alle Fahrzeuge, Ladevorgänge und Einstellungen in einer Datei, z. B. vor einem
    Gerätewechsel.
  </p>

  <div class="actions">
    <button type="button" class="tonal" disabled={busy} onclick={exportBackup}>
      Sicherung exportieren
    </button>
    <button type="button" class="tonal" disabled={busy} onclick={() => fileInput?.click()}>
      Sicherung wiederherstellen
    </button>
    <button
      type="button"
      class="text danger"
      disabled={busy}
      onclick={() => deleteDialog?.showModal()}
    >
      Alle Daten löschen
    </button>
  </div>
  <input
    bind:this={fileInput}
    type="file"
    accept=".json,application/json"
    hidden
    onchange={chooseBackupFile}
  />

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  <p class="status" role="status">{status ?? ''}</p>

  <dialog
    bind:this={restoreDialog}
    onclose={() => (pendingRestore = undefined)}
    aria-labelledby="restore-heading"
  >
    {#if pendingRestore}
      <h2 id="restore-heading">Sicherung wiederherstellen?</h2>
      <p>
        Die Sicherung vom {formatIsoDate(todayIsoDate(new Date(pendingRestore.exportedAt)))}
        enthält {count(pendingRestore.vehicles.length, 'Fahrzeug', 'Fahrzeuge')} und
        {count(pendingRestore.sessions.length, 'Ladevorgang', 'Ladevorgänge')}. Alle aktuellen Daten
        werden dabei ersetzt. Das lässt sich nicht rückgängig machen.
      </p>
      <div class="dialog-actions">
        <button type="button" class="text" onclick={() => restoreDialog?.close()}>
          Abbrechen
        </button>
        <button type="button" class="filled danger" onclick={() => void confirmRestore()}>
          Wiederherstellen
        </button>
      </div>
    {/if}
  </dialog>

  <dialog bind:this={deleteDialog} aria-labelledby="delete-all-heading">
    <h2 id="delete-all-heading">Alle Daten löschen?</h2>
    <p>
      Alle Fahrzeuge und Ladevorgänge werden gelöscht und die Einstellungen zurückgesetzt. Das lässt
      sich nicht rückgängig machen. Exportiere vorher eine Sicherung, wenn du die Daten behalten
      willst.
    </p>
    <div class="dialog-actions">
      <button type="button" class="text" onclick={() => deleteDialog?.close()}>Abbrechen</button>
      <button type="button" class="filled danger" onclick={() => void confirmDelete()}>
        Alles löschen
      </button>
    </div>
  </dialog>
</section>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .error,
  .status {
    margin-top: var(--space-3);
  }

  .status {
    font-size: var(--font-size-label);
    color: var(--color-on-surface-variant);
  }

  /* Kept in the DOM while empty, so screen readers announce the next status. */
  .status:empty {
    margin: 0;
  }
</style>
