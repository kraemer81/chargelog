import { describe, expect, it } from 'vitest';
import { moveHandle } from './percentRange';

describe('moveHandle', () => {
  const range = { start: 20, end: 80 };

  it('moves only the dragged handle', () => {
    expect(moveHandle(range, 'start', 35)).toEqual({ start: 35, end: 80 });
    expect(moveHandle(range, 'end', 90)).toEqual({ start: 20, end: 90 });
  });

  it('stops a handle one percent before the other, so end stays above start', () => {
    expect(moveHandle(range, 'start', 95)).toEqual({ start: 79, end: 80 });
    expect(moveHandle(range, 'end', 3)).toEqual({ start: 20, end: 21 });
  });

  it('lets the handles reach the ends of the bar', () => {
    expect(moveHandle(range, 'start', 0)).toEqual({ start: 0, end: 80 });
    expect(moveHandle(range, 'end', 100)).toEqual({ start: 20, end: 100 });
  });

  // Typing on the keypad can leave start at or above end; sliding must then
  // follow the finger instead of jumping past the other value.
  it('moves freely within 0–100 while the range is inverted', () => {
    const inverted = { start: 90, end: 80 };
    expect(moveHandle(inverted, 'end', 85)).toEqual({ start: 90, end: 85 });
    expect(moveHandle(inverted, 'start', 70)).toEqual({ start: 70, end: 80 });
    expect(moveHandle(inverted, 'end', 120)).toEqual({ start: 90, end: 100 });
  });
});
