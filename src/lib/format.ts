// de-DE formatting helpers (build time). House rules from CLAUDE.md:
// - U+202F (narrow no-break space) between a number and its unit, including € and %.
// - Ranges use an en dash without spaces ("10–20 mm", DIN 5008 "bis"-Strich).

export const LOCALE = 'de-DE';
export const TIME_ZONE = 'Europe/Berlin';
/** U+202F NARROW NO-BREAK SPACE. */
export const NNBSP = '\u202F';
/** U+2013 EN DASH. */
export const EN_DASH = '\u2013';

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, options);
    numberFormats.set(key, format);
  }
  return format;
}

function assertFinite(value: number, fn: string): void {
  if (!Number.isFinite(value)) throw new Error(`${fn}(): expected a finite number, got ${value}`);
}

/** "1.234,5". Defaults to at most 2 fraction digits. */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  assertFinite(value, 'formatNumber');
  return nf({ maximumFractionDigits: 2, ...options }).format(value);
}

/** "1.500 €", "1.234,50 €". Whole amounts drop the cents unless `cents: true`. */
export function formatCurrency(value: number, { cents }: { cents?: boolean } = {}): string {
  assertFinite(value, 'formatCurrency');
  const digits = (cents ?? !Number.isInteger(value)) ? 2 : 0;
  const parts = nf({
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(value);
  return parts.map((p) => (p.type === 'literal' && /^\s+$/.test(p.value) ? NNBSP : p.value)).join('');
}

/** "20 mm", "2,4 m", "19 %" with U+202F. */
export function formatUnit(value: number, unit: string, options: Intl.NumberFormatOptions = {}): string {
  return `${formatNumber(value, options)}${NNBSP}${unit}`;
}

export interface RangeOptions extends Intl.NumberFormatOptions {
  /** Unit written once after the range: "10–20 mm". */
  unit?: string;
}

/** "10–20 mm", "2,4–3 m". Equal ends collapse to a single value. */
export function formatRange(min: number, max: number, { unit, ...options }: RangeOptions = {}): string {
  if (min > max) throw new Error(`formatRange(): min ${min} > max ${max}`);
  const text =
    min === max ? formatNumber(min, options) : `${formatNumber(min, options)}${EN_DASH}${formatNumber(max, options)}`;
  return unit ? `${text}${NNBSP}${unit}` : text;
}

/** "1.500–3.000 €". Cents are shown on both ends if either end needs them. */
export function formatCurrencyRange(min: number, max: number): string {
  if (min > max) throw new Error(`formatCurrencyRange(): min ${min} > max ${max}`);
  if (min === max) return formatCurrency(min);
  const digits = Number.isInteger(min) && Number.isInteger(max) ? 0 : 2;
  const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return `${formatNumber(min, opts)}${EN_DASH}${formatNumber(max, opts)}${NNBSP}€`;
}

/** Joins two arbitrary range ends with an en dash: "Mo–Fr", "2019–2023". */
export const range = (from: string | number, to: string | number): string => `${from}${EN_DASH}${to}`;

export type DateStyle = 'long' | 'short' | 'month';

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' }, // 9. Oktober 2026
  short: { day: '2-digit', month: '2-digit', year: 'numeric' }, // 09.10.2026
  month: { month: 'long', year: 'numeric' }, // Oktober 2026
};

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`formatDate(): invalid date "${String(value)}"`);
  return date;
}

/** German dates in Europe/Berlin, independent of the build machine's time zone. */
export function formatDate(value: Date | string, style: DateStyle = 'long'): string {
  return new Intl.DateTimeFormat(LOCALE, { ...DATE_OPTIONS[style], timeZone: TIME_ZONE }).format(toDate(value));
}

/** `YYYY-MM-DD` in Europe/Berlin, for `<time datetime>` and JSON-LD. */
export function isoDate(value: Date | string): string {
  // sv-SE formats dates as ISO 8601.
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

const E164 = /^\+[1-9]\d{6,14}$/;

/** Strips spaces, slashes, dashes and brackets; throws unless the result is E.164. */
export function normalizeE164(phone: string): string {
  const e164 = phone.replace(/[\s/()\-.]/g, '');
  if (!E164.test(e164)) throw new Error(`phone: "${phone}" is not an E.164 number (+49…)`);
  return e164;
}

/** `tel:` href from an E.164 number. */
export const telHref = (phone: string): string => `tel:${normalizeE164(phone)}`;

/**
 * DIN 5008 display for German numbers: national "0621 1234567" or international "+49 621 1234567".
 * German area codes vary in length (2–5 digits), so pass `areaCodeLength` (without the 0);
 * the default 3 fits Mannheim (621). Non-German numbers are returned as E.164.
 */
export function formatPhone(
  phone: string,
  { areaCodeLength = 3, international = false }: { areaCodeLength?: number; international?: boolean } = {},
): string {
  const e164 = normalizeE164(phone);
  if (!e164.startsWith('+49')) return e164;
  const national = e164.slice(3);
  if (areaCodeLength < 2 || areaCodeLength >= national.length) {
    throw new Error(`formatPhone(): bad areaCodeLength ${areaCodeLength} for ${e164}`);
  }
  const area = national.slice(0, areaCodeLength);
  const subscriber = national.slice(areaCodeLength);
  return international ? `+49 ${area} ${subscriber}` : `0${area} ${subscriber}`;
}
