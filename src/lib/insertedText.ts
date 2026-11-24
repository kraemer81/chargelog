/**
 * The text that was typed into `before` to produce `after`, wherever the caret
 * was: everything between their common prefix and common suffix.
 */
export function insertedText(before: string, after: string): string {
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  // The suffix may not reach back into the prefix, or repeated digits overlap.
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  return after.slice(start, after.length - end);
}
