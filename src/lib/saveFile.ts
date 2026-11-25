/** Where `saveFile` can put a file; the browser's by default. */
export interface SaveFileTargets {
  navigator: { canShare?(data: ShareData): boolean; share?(data: ShareData): Promise<void> };
  download(file: File): void;
}

const browserTargets: SaveFileTargets = {
  navigator: globalThis.navigator,
  download(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    // Revoke later: some browsers start the download only after `click` returns.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

/**
 * Hands the file to the share sheet (e.g. on Android) or, where it can't take
 * files or fails, downloads it. Closing the share sheet without choosing a
 * target is not an error.
 */
export async function saveFile(file: File, targets = browserTargets): Promise<void> {
  const { navigator } = targets;
  const data = { files: [file] };
  if (!navigator.share || !navigator.canShare?.(data)) {
    targets.download(file);
    return;
  }
  try {
    await navigator.share(data);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    // E.g. a lost user activation after the export took too long.
    targets.download(file);
  }
}
