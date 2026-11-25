/**
 * Domain rules shared by the store and the backup check: the default settings,
 * what makes a value valid, and how names and notes are normalised.
 */
import type { Settings } from './store';

/**
 * A rejected store operation. The message is German and meant to be shown to
 * the user as-is.
 */
export class ValidationError extends Error {
  override name = 'ValidationError';
}

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The settings of a fresh install. */
export const DEFAULT_SETTINGS: Settings = {
  themePreference: 'system',
  defaultPricePerKwh: 0.3,
  defaultChargingLossPercent: 10,
};

/**
 * Why a start/end pair of a charging session can't be saved, as a German
 * message for the user, or `undefined` if it is valid.
 */
export function percentageError(startPercent: number, endPercent: number): string | undefined {
  if (!(startPercent >= 0 && startPercent <= 100)) {
    return 'Der Start muss zwischen 0 und 100 % liegen.';
  }
  if (!(endPercent >= 0 && endPercent <= 100)) {
    return 'Das Ende muss zwischen 0 und 100 % liegen.';
  }
  if (endPercent <= startPercent) {
    return 'Das Ende muss über dem Start liegen.';
  }
  return undefined;
}

/** Why a price per kWh can't be used, as a German message, or `undefined` if it is valid. */
export function priceError(pricePerKwh: number): string | undefined {
  return Number.isFinite(pricePerKwh) && pricePerKwh >= 0
    ? undefined
    : 'Bitte gib einen Preis von mindestens 0 € ein.';
}

/** Why a charging loss can't be used, as a German message, or `undefined` if it is valid. */
export function chargingLossError(chargingLossPercent: number): string | undefined {
  return chargingLossPercent >= 0 && chargingLossPercent < 100
    ? undefined
    : 'Der Ladeverlust muss zwischen 0 und 100 % liegen.';
}

/** True for a real calendar date written as `YYYY-MM-DD`. */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/** Vehicle names are unique regardless of case. */
export function vehicleNameKey(name: string): string {
  return name.toLocaleLowerCase('de');
}

/** A note as stored: trimmed, and left out (`{}`) if blank. */
export function noteField(note: string | undefined): { note?: string } {
  const trimmed = note?.trim();
  return trimmed ? { note: trimmed } : {};
}

/** True for a plain JSON object, as read from a backup file. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
