/**
 * Drag math for the battery-bar prototype (issue #13): a bar from 0 to 100 %
 * with a start and an end handle that never cross.
 */

/** Whole percent under a finger at `clientX` on a bar, clamped to 0–100. */
export function percentAt(clientX: number, bar: { left: number; width: number }): number {
  const percent = Math.round(((clientX - bar.left) / bar.width) * 100);
  return Math.min(100, Math.max(0, percent));
}

export type PercentRange = { start: number; end: number };
export type Handle = 'start' | 'end';

/** The handle a finger at `percent` grabs: the closer one, the end one on a tie. */
export function nearestHandle(percent: number, range: PercentRange): Handle {
  return Math.abs(percent - range.start) < Math.abs(percent - range.end) ? 'start' : 'end';
}

/** `range` with `handle` moved towards `percent`, stopping 1 % short of the other handle. */
export function moveHandle(range: PercentRange, handle: Handle, percent: number): PercentRange {
  return handle === 'start'
    ? { start: Math.max(0, Math.min(percent, range.end - 1)), end: range.end }
    : { start: range.start, end: Math.min(100, Math.max(percent, range.start + 1)) };
}
