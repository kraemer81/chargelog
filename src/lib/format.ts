/** German number and date formatting, and parsing of numbers the user types. */

const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const exact = new Intl.NumberFormat('de-DE', {
  maximumSignificantDigits: 15,
  useGrouping: false,
});
const fixed2 = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const price = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const shortDate = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "58,5" — up to 2 decimals, none if not needed. */
export function formatDecimal(value: number): string {
  return decimal.format(value);
}

/** "0,3249" — every decimal kept (up to float precision), no grouping, so `parseDecimal` reads back the same value. */
export function formatEditableDecimal(value: number): string {
  return exact.format(value);
}

/** "38,28 kWh" */
export function formatKwh(value: number): string {
  return `${fixed2.format(value)} kWh`;
}

/** "0,32 €/kWh" — at least 2 decimals, up to 4 for exact tariffs. */
export function formatPricePerKwh(value: number): string {
  return `${price.format(value)} €/kWh`;
}

/** "12,25 €" */
export function formatEuro(value: number): string {
  return euro.format(value);
}

/** "Di., 24.11.2026" for `2026-11-24`. */
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return shortDate.format(new Date(year!, month! - 1, day));
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Accepts German ("58,5") and English ("58.5") decimals; anything else is NaN. */
export function parseDecimal(text: string): number {
  const trimmed = text.trim();
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN;
}

const longMonth = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const shortMonth = new Intl.DateTimeFormat('de-DE', { month: 'short' });

function monthDate(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year!, monthNumber! - 1, 1);
}

/** "Oktober 2026" for `2026-10`. */
export function formatMonth(month: string): string {
  return longMonth.format(monthDate(month));
}

/** "Okt" for `2026-10`. */
export function formatShortMonth(month: string): string {
  return shortMonth.format(monthDate(month)).replace('.', '');
}

/** "Ladevorgang" for exactly one session, otherwise "Ladevorgänge". */
export function sessionsLabel(count: number): string {
  return count === 1 ? 'Ladevorgang' : 'Ladevorgänge';
}
