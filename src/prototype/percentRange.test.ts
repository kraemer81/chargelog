import { describe, expect, it } from 'vitest';
import { moveHandle, nearestHandle, percentAt } from './percentRange';

const bar = { left: 20, width: 200 };

describe('percentAt', () => {
  it('maps a finger position on the bar to a whole percent', () => {
    expect(percentAt(20, bar)).toBe(0);
    expect(percentAt(120, bar)).toBe(50);
    expect(percentAt(161, bar)).toBe(71); // 70.5 rounds up
    expect(percentAt(220, bar)).toBe(100);
  });

  it('stays within 0–100 when the finger leaves the bar', () => {
    expect(percentAt(-50, bar)).toBe(0);
    expect(percentAt(400, bar)).toBe(100);
  });
});

describe('nearestHandle', () => {
  const range = { start: 20, end: 80 };

  it('grabs the handle closer to the finger', () => {
    expect(nearestHandle(5, range)).toBe('start');
    expect(nearestHandle(45, range)).toBe('start');
    expect(nearestHandle(55, range)).toBe('end');
    expect(nearestHandle(100, range)).toBe('end');
  });

  it('prefers the end handle exactly halfway between both', () => {
    expect(nearestHandle(50, range)).toBe('end');
  });

  it('separates handles sitting next to each other by the side touched', () => {
    const adjacent = { start: 99, end: 100 };
    expect(nearestHandle(99, adjacent)).toBe('start');
    expect(nearestHandle(100, adjacent)).toBe('end');
  });
});

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
});
