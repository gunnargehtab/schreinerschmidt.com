// German number, money and date formatting for everything the backend writes (TL;DR, review page,
// customer mails, PDF). House rules (CLAUDE.md, docs/plan.md §3.4): U+202F (narrow no-break space)
// between a number and its unit (€, %, m², h), and, as in the spec's examples („2 450 € bis 3 300 €“,
// docs/angebot.md §8.1), as the thousands separator, so an amount never breaks across lines.
// Dates are Europe/Berlin, whatever the host's time zone.

/** U+202F NARROW NO-BREAK SPACE. */
export const NNBSP = '\u202f';
/** U+2013 EN DASH. */
export const EN_DASH = '–';
export const TIME_ZONE = 'Europe/Berlin';

const whole = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const upTo2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** de-DE digits with U+202F instead of the thousands dot: 2450 → „2 450“, 1234.5 → „1 234,5“. */
export function formatZahl(n: number, o: { cents?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '–';
  const f = o.cents ? cents : Number.isInteger(n) ? whole : upTo2;
  return f.format(n).replace(/\./g, NNBSP);
}

/** „2 450 €“ (whole euros) or „1 234,56 €“ with `cents`. */
export const formatEuro = (n: number, o: { cents?: boolean } = {}): string => `${formatZahl(n, o)}${NNBSP}€`;

/** The customer's range: „2 450 € bis 3 300 €“. */
export const formatEuroRange = (min: number, max: number): string =>
  min === max ? formatEuro(min) : `${formatEuro(min)} bis ${formatEuro(max)}`;

/** Short range for a subject line: „2 450–3 300 €“. */
export const formatEuroSpanne = (min: number, max: number): string =>
  min === max ? formatEuro(min) : `${formatZahl(min)}${EN_DASH}${formatZahl(max)}${NNBSP}€`;

/** „19 %“ */
export const formatProzent = (n: number): string => `${formatZahl(n)}${NNBSP}%`;

/** A range width 0.15 → „± 15 %“. */
export const formatBreite = (breite: number): string => `±${NNBSP}${formatProzent(Math.round(breite * 100))}`;

/** A quantity with its unit: „24,5 m²“, „12 h“. */
export const formatMenge = (n: number, einheit: string): string =>
  einheit ? `${formatZahl(n)}${NNBSP}${einheit}` : formatZahl(n);

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIME_ZONE,
});
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
const isoFmt = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
});

/** „23.10.2026“ (Europe/Berlin). */
export const formatDatum = (ms: number): string => dateFmt.format(new Date(ms));

/** „23.10.2026, 14:05 Uhr“ (Europe/Berlin). */
export const formatZeitpunkt = (ms: number): string =>
  `${dateFmt.format(new Date(ms))}, ${timeFmt.format(new Date(ms))}${NNBSP}Uhr`;

/** `YYYY-MM-DD` of the Berlin calendar day of an instant. */
export const berlinTag = (ms: number): string => isoFmt.format(new Date(ms));

/** The Berlin calendar year of an instant (the Angebotsnummer's year). */
export const berlinJahr = (ms: number): number => Number(berlinTag(ms).slice(0, 4));
