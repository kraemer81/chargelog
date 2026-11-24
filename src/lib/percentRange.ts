/** Start and end of a charge in whole percent; valid while 0 ≤ start < end ≤ 100. */
export type PercentRange = { start: number; end: number };
export type Handle = 'start' | 'end';

/**
 * `range` with `handle` moved towards `percent`, stopping 1 % short of the
 * other handle. An already inverted range (typed on the keypad) only keeps
 * 0–100, so the handle follows the finger instead of jumping.
 */
export function moveHandle(range: PercentRange, handle: Handle, percent: number): PercentRange {
  const inverted = range.start >= range.end;
  return handle === 'start'
    ? { start: Math.max(0, Math.min(percent, inverted ? 100 : range.end - 1)), end: range.end }
    : { start: range.start, end: Math.min(100, Math.max(percent, inverted ? 0 : range.start + 1)) };
}
