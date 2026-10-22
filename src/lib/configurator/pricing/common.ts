// Shared pilot rates and helpers for the Angebot calculation (docs/angebot.md §4.1).
// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
import type { ServiceTier } from '../service-area';
import type { Breite, Ctx, Kalkulation, Position } from './types';

export const SHARED = {
  /** Werkstatt, € net per hour. */
  werkstattStunde: 68,
  /** Montage, € net per hour. */
  montageStunde: 62,
  /** € net per trip. */
  anfahrt: { kern: 35, region: 65, aussen: 120 } satisfies Record<ServiceTier, number>,
  /** Hours per Montage day (trip count = ceil(Montage hours / 8), at least 1). */
  montageTag: 8,
  /** € net; below it the recommendation is „Absagen“ (§7.1). */
  mindestauftrag: 500,
  vatPercent: 19,
} as const;

/** Rounds to 50 € below 5 000 €, else to 100 € (the existing rule of estimate()). */
export function roundRange(v: number): number {
  const step = v < 5000 ? 50 : 100;
  return Math.round(v / step) * step;
}

/** True for a known service tier (ctx comes from the backend, but a bad value must not price as NaN). */
const knownTier = (t: unknown): t is ServiceTier => t === 'kern' || t === 'region' || t === 'aussen';

/** Tier for pricing; an unknown PLZ (null, missing or an unexpected value) is priced as 'aussen'. */
export const tierOf = (ctx: Ctx): ServiceTier => (knownTier(ctx.tier) ? ctx.tier : 'aussen');

/** Anfahrt position for `trips` trips. */
export function anfahrtPosition(ctx: Ctx, trips: number): Position {
  const t = tierOf(ctx);
  const label = { kern: 'Kerngebiet', region: 'Region', aussen: 'außerhalb' }[t];
  return { text: `Anfahrt (${label})`, menge: trips, einheit: 'Fahrt', netto: trips * SHARED.anfahrt[t] };
}

/** Trips for a given number of Montage hours: one per started Montage day, at least one. */
export const tripsFor = (montageStunden: number): number => Math.max(1, Math.ceil(montageStunden / SHARED.montageTag));

/** Montage position for `stunden` hours. */
export const montagePosition = (stunden: number): Position => ({
  text: 'Montage',
  menge: stunden,
  einheit: 'h',
  netto: stunden * SHARED.montageStunde,
});

/** Stable short hash (FNV-1a, hex) of a rate table, for Kalkulation.regelVersion. */
export function hashRates(...tables: unknown[]): string {
  const s = JSON.stringify(tables);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds the Kalkulation from net positions: sums, adds VAT, applies the range width and rounds.
 * Every calculator ends with this, so the arithmetic lives in one place. Adds the unknown-PLZ
 * assumption when ctx.tier is not a known tier.
 */
export function kalkulation(
  positionen: Position[],
  opts: { breite: Breite; quelle: Kalkulation['quelle']; annahmen: string[]; regelVersion: string; ctx: Ctx },
): Kalkulation {
  const netto = positionen.reduce((s, p) => s + p.netto, 0);
  const brutto = netto * (1 + SHARED.vatPercent / 100);
  const annahmen = [...opts.annahmen];
  if (!knownTier(opts.ctx.tier)) annahmen.push('Anfahrt wie außerhalb des Einzugsgebiets berechnet (PLZ unbekannt).');
  return {
    netto,
    brutto,
    min: roundRange(brutto * (1 - opts.breite)),
    max: roundRange(brutto * (1 + opts.breite)),
    breite: opts.breite,
    quelle: opts.quelle,
    positionen,
    annahmen,
    regelVersion: opts.regelVersion,
  };
}
