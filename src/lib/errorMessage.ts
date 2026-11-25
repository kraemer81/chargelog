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

/**
 * Technical details of an unexpected error, e.g. `DataCloneError: …`, to show
 * under the German message so a failure on a phone can be diagnosed without
 * a console. A rejected input (`ValidationError`) has none.
 */
export function errorDetail(error: unknown): string | undefined {
  if (error instanceof ValidationError) return undefined;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
