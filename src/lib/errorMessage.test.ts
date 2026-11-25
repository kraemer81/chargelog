import { describe, expect, it } from 'vitest';
import { errorDetail } from './errorMessage';
import { ValidationError } from './store/store';

describe('errorDetail', () => {
  it('names an unexpected error and its message', () => {
    const error = new DOMException('#<Object> could not be cloned.', 'DataCloneError');

    expect(errorDetail(error)).toBe('DataCloneError: #<Object> could not be cloned.');
  });

  it('has nothing to add to a rejected input, whose message is shown already', () => {
    expect(errorDetail(new ValidationError('Bitte gib einen Namen ein.'))).toBeUndefined();
  });

  it('shows anything else that was thrown as text', () => {
    expect(errorDetail('kaputt')).toBe('kaputt');
  });
});
