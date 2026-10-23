// Working days for the owner reminder (docs/angebot.md §3): the configurator promises a reply within
// 2 Werktage, so a case still waiting after 2 working days gets one reminder. Working days are
// Monday to Friday in Europe/Berlin, without the public holidays of Baden-Württemberg.
//
// PLACEHOLDER (docs/owner-checklist.md "Angebot pilot"): the holiday list is hard-coded for 2026 and
// 2027 only (gesetzliche Feiertage BW; 24 and 31 December are not holidays). After 2027 only
// weekends count until the list is extended. test/timers.test.ts recomputes the Easter-based dates.
import { berlinTag } from './format';

/** Gesetzliche Feiertage in Baden-Württemberg, 2026–2027 (placeholder list, see above). */
export const FEIERTAGE_BW: ReadonlySet<string> = new Set([
  // 2026 (Ostersonntag 5 April)
  '2026-01-01', // Neujahr
  '2026-01-06', // Heilige Drei Könige
  '2026-04-03', // Karfreitag
  '2026-04-06', // Ostermontag
  '2026-05-01', // Tag der Arbeit
  '2026-05-14', // Christi Himmelfahrt
  '2026-05-25', // Pfingstmontag
  '2026-06-04', // Fronleichnam
  '2026-10-03', // Tag der Deutschen Einheit
  '2026-11-01', // Allerheiligen
  '2026-12-25', // 1. Weihnachtstag
  '2026-12-26', // 2. Weihnachtstag
  // 2027 (Ostersonntag 28 March)
  '2027-01-01',
  '2027-01-06',
  '2027-03-26', // Karfreitag
  '2027-03-29', // Ostermontag
  '2027-05-01',
  '2027-05-06', // Christi Himmelfahrt
  '2027-05-17', // Pfingstmontag
  '2027-05-27', // Fronleichnam
  '2027-10-03',
  '2027-11-01',
  '2027-12-25',
  '2027-12-26',
]);

const DAY = 86_400_000;

/** `YYYY-MM-DD` of a UTC calendar date. */
const iso = (y: number, m: number, d: number): string => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** True for Monday–Friday that is not a BW holiday (`YYYY-MM-DD`). */
export function istArbeitstag(tag: string): boolean {
  const [y, m, d] = tag.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !FEIERTAGE_BW.has(tag);
}

/**
 * The instant `n` working days after `ms`: the same time of day on the n-th working day after the
 * Berlin calendar day of `ms` (a TL;DR on Thursday 10:00 before a holiday Friday → Tuesday 10:00).
 * Counted in whole days, so a DST change shifts it by an hour at most.
 */
export function nachArbeitstagen(ms: number, n: number): number {
  const [y, m, d] = berlinTag(ms).split('-').map(Number) as [number, number, number];
  let count = 0;
  for (let k = 1; k <= 366; k++) {
    if (istArbeitstag(iso(y, m - 1, d + k))) count++;
    if (count >= n) return ms + k * DAY;
  }
  return ms + 366 * DAY;
}
