// Working days for the owner reminder (docs/angebot.md §3): the configurator promises a reply within
// 2 Werktage, so a case still waiting after 2 working days gets one reminder. Working days are
// Monday to Friday in Europe/Berlin, without the public holidays of Baden-Württemberg.
//
// PLACEHOLDER (docs/owner-checklist.md "Angebot pilot"): the holiday list is hard-coded for 2026 and
// 2027 only (gesetzliche Feiertage BW; 24 and 31 December are not holidays). After 2027 only
// weekends count until the list is extended. test/timers.test.ts recomputes the Easter-based dates.
import { TIME_ZONE } from './format';

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

const teileFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Berlin wall-clock parts of an instant. */
function berlinTeile(ms: number): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const p = Object.fromEntries(teileFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p['year']!, m: +p['month']!, d: +p['day']!, h: +p['hour']!, min: +p['minute']!, s: +p['second']! };
}

/** The Berlin UTC offset (ms) at an instant. */
const offset = (ms: number): number => {
  const t = berlinTeile(ms);
  return Date.UTC(t.y, t.m - 1, t.d, t.h, t.min, t.s) - (ms - (((ms % 1000) + 1000) % 1000));
};

/** The instant of a Berlin wall-clock time (two offset passes cover a DST change in between). */
function berlinZeit(y: number, m: number, d: number, h: number, min: number, s: number, msRest: number): number {
  const lokal = Date.UTC(y, m - 1, d, h, min, s, msRest);
  let t = lokal - offset(lokal);
  t = lokal - offset(t);
  return t;
}

/**
 * The instant `n` working days after `ms`: the n-th working day after the Berlin calendar day of
 * `ms`, at the same Berlin wall-clock time (a TL;DR on Friday 10:00 CEST → Tuesday 10:00 CET across
 * the DST change; Thursday 10:00 before Karfreitag → the Wednesday after Easter, 10:00). Working days
 * fall on weekdays, never on a DST switch night, so the wall-clock time always exists.
 */
export function nachArbeitstagen(ms: number, n: number): number {
  const t = berlinTeile(ms);
  const msRest = ((ms % 1000) + 1000) % 1000;
  for (let k = 1, count = 0; k <= 366; k++) {
    const tag = iso(t.y, t.m - 1, t.d + k);
    if (istArbeitstag(tag)) count++;
    if (count >= n) {
      const [y, m, d] = tag.split('-').map(Number) as [number, number, number];
      return berlinZeit(y, m, d, t.h, t.min, t.s, msRest);
    }
  }
  return ms + 366 * DAY;
}
