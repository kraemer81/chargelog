import { describe, expect, it } from 'vitest';
import { insertedText } from './insertedText';

describe('insertedText', () => {
  it('returns a digit typed after the existing text', () => {
    expect(insertedText('20', '205')).toBe('5');
  });

  it.each([
    ['20', '520', '5'],
    ['20', '250', '5'],
    ['20', '200', '0'],
    ['20', '020', '0'],
    ['80', '8880', '88'],
  ])('finds what was typed into %o giving %o wherever the caret was', (before, after, typed) => {
    expect(insertedText(before, after)).toBe(typed);
  });
});
