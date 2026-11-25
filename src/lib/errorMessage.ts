import { ValidationError } from './store/store';

/**
 * The German message to show for a failed store operation: a rejected
 * input's own message, or `fallback` for anything unexpected (which is logged).
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError) return error.message;
  console.error(error);
  return fallback;
}
