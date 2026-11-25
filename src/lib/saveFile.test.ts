import { describe, expect, it, vi } from 'vitest';
import { saveFile, type SaveFileTargets } from './saveFile';

const file = new File(['{}'], 'chargelog-sicherung.json', { type: 'application/json' });

function targets(navigator: SaveFileTargets['navigator']) {
  return { navigator, download: vi.fn<(file: File) => void>() };
}

describe('saveFile', () => {
  it('hands the file to the share sheet when it can share files', async () => {
    const share = vi.fn(async () => {});
    const t = targets({ canShare: () => true, share });

    await saveFile(file, t);

    expect(share).toHaveBeenCalledWith({ files: [file] });
    expect(t.download).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no share sheet', {}],
    ['the share sheet cannot share files', { canShare: () => false, share: async () => {} }],
  ])('downloads the file when %s', async (_, navigator) => {
    const t = targets(navigator);

    await saveFile(file, t);

    expect(t.download).toHaveBeenCalledWith(file);
  });

  it('treats closing the share sheet without choosing a target as done', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    });
    const t = targets({ canShare: () => true, share });

    await expect(saveFile(file, t)).resolves.toBeUndefined();
    expect(t.download).not.toHaveBeenCalled();
  });

  it('downloads the file when the share sheet fails', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('No user activation', 'NotAllowedError');
    });
    const t = targets({ canShare: () => true, share });

    await saveFile(file, t);

    expect(t.download).toHaveBeenCalledWith(file);
  });
});
