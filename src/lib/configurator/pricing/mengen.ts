// Claude-quantified projects (docs/angebot.md §4.4). Claude returns quantities only; this module
// prices them with the §4.1–4.2 rates and the ± 30 % width. Backend only, never imported by the site.
// PLACEHOLDER: all rates are pilot assumptions (docs/owner-checklist.md).
import { FINISH_LABEL, SPECIES } from '../furniture/species';
import type { Board, Finish, Species } from '../furniture/types';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from './common';
import { PILOT_RULES } from './pilot-rules';
import type { Ctx, Kalkulation, Position } from './types';

/** Beschlag kinds with a §4.2 rate (door / drawer / hinge). */
export type BeschlagArt = 'tuer' | 'schubkasten' | 'scharnier';

export interface MaterialZeile {
  art: 'platte' | 'oberflaeche' | 'beschlag' | 'pauschal';
  holz?: Species;
  staerke?: Board;
  oberflaeche?: Finish;
  /** Required for `beschlag`: which §4.2 rate applies. */
  beschlag?: BeschlagArt;
  menge: number;
  einheit: string;
  /** Why this line (required for `pauschal`). */
  begruendung: string;
}

export interface Mengen {
  werkstatt_h: number;
  montage_h: number;
  material: MaterialZeile[];
}

/** Hard upper bounds, enforced in code whatever Claude returns (§6.2). Material bounds apply to the
 *  case total per kind (all board lines together, all finish lines, all Beschlag lines), not per line. */
export const MENGEN_LIMITS = {
  werkstatt_h: 400,
  montage_h: 160,
  materialZeilen: 30,
  platteM2: 200,
  /** Both faces of the largest board area. */
  oberflaecheM2: 400,
  beschlagStk: 500,
} as const;

/** € net per Beschlag piece, from the §4.2 Möbel rates. */
const BESCHLAG: Record<BeschlagArt, { rate: number; label: string }> = {
  tuer: { rate: PILOT_RULES.doorEach as number, label: 'Türbeschläge' },
  schubkasten: { rate: PILOT_RULES.drawerEach as number, label: 'Schubkastenbeschläge' },
  scharnier: { rate: PILOT_RULES.hingeEach as number, label: 'Scharniere' },
};

export const regelVersion = hashRates(
  PILOT_RULES.boardPerM2,
  PILOT_RULES.finishPerM2,
  PILOT_RULES.doorEach,
  PILOT_RULES.drawerEach,
  PILOT_RULES.hingeEach,
  SHARED,
);

/** Thrown for input that cannot be priced at all (negative, NaN, missing data, too many lines). */
export class MengenFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MengenFehler';
  }
}

/** German number text: at most 2 decimals, decimal comma. */
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/** A finite number ≥ 0, else MengenFehler. */
function nonNegative(n: unknown, what: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new MengenFehler(`${what}: ungültiger Wert`);
  return n;
}

/**
 * Prices Claude's quantities: board, finish and Beschläge from the pilot rate tables, Werkstatt and
 * Montage hours at the shared rates, one Anfahrt per Montage day. A Pauschale has no rate: it is
 * listed for the owner at 0 € and the assumptions say it is not included (§4.4). Values above the
 * limits are clamped and noted in the assumptions (material per case total of its kind); a missing
 * Mengen object, a line that is not an object, negative or non-finite values, unknown rate keys, more
 * than 30 lines and a Pauschale without justification throw MengenFehler.
 */
export function preiseMengen(m: Mengen, ctx: Ctx): Kalkulation {
  if (!m || typeof m !== 'object') throw new MengenFehler('Mengen: ungültiger Wert');
  const annahmen: string[] = ['Mengen geschätzt, vor dem Aufmaß zu prüfen.'];
  const clamp = (n: number, max: number, what: string): number => {
    if (n <= max) return n;
    annahmen.push(`${what} auf das Maximum von ${fmt(max)} begrenzt.`);
    return max;
  };
  // Material bounds hold for the case total per kind (§4.4): each line takes what is left, the
  // first line over the bound is cut and noted once, later lines of that kind get 0.
  const used = { platte: 0, oberflaeche: 0, beschlag: 0 };
  const cut = new Set<keyof typeof used>();
  const take = (kind: keyof typeof used, n: number, max: number, what: string): number => {
    const x = Math.min(n, max - used[kind]);
    used[kind] += x;
    if (x < n && !cut.has(kind)) {
      cut.add(kind);
      annahmen.push(`${what} insgesamt auf das Maximum von ${fmt(max)} begrenzt.`);
    }
    return x;
  };
  if (!Array.isArray(m.material)) throw new MengenFehler('Material: ungültiger Wert');
  if (m.material.length > MENGEN_LIMITS.materialZeilen) throw new MengenFehler('Material: zu viele Zeilen');

  const werkstatt = clamp(
    nonNegative(m.werkstatt_h, 'Werkstattstunden'),
    MENGEN_LIMITS.werkstatt_h,
    'Werkstattstunden',
  );
  const montage = clamp(nonNegative(m.montage_h, 'Montagestunden'), MENGEN_LIMITS.montage_h, 'Montagestunden');

  const positionen: Position[] = [];
  let pauschal = false;
  for (const z of m.material) {
    if (!z || typeof z !== 'object') throw new MengenFehler('Material: ungültige Zeile');
    const menge = nonNegative(z.menge, 'Menge');
    const warum = typeof z.begruendung === 'string' ? z.begruendung.trim() : '';
    if (z.art === 'platte') {
      const rate = z.holz && z.staerke ? PILOT_RULES.boardPerM2[z.holz]?.[z.staerke] : undefined;
      if (typeof rate !== 'number' || !z.holz || !z.staerke)
        throw new MengenFehler('Platte: Holz oder Stärke unbekannt');
      const m2 = take('platte', menge, MENGEN_LIMITS.platteM2, 'Plattenfläche');
      positionen.push({
        text: `Plattenmaterial ${SPECIES[z.holz].name}, ${z.staerke} mm, ${fmt(m2)} m²`,
        menge: m2,
        einheit: 'm²',
        netto: m2 * rate,
      });
    } else if (z.art === 'oberflaeche') {
      const rate = z.oberflaeche ? PILOT_RULES.finishPerM2[z.oberflaeche] : undefined;
      if (typeof rate !== 'number' || !z.oberflaeche) throw new MengenFehler('Oberfläche: unbekannte Oberfläche');
      const m2 = take('oberflaeche', menge, MENGEN_LIMITS.oberflaecheM2, 'Oberfläche');
      positionen.push({
        text: `Oberfläche ${FINISH_LABEL[z.oberflaeche]}, ${fmt(m2)} m²`,
        menge: m2,
        einheit: 'm²',
        netto: m2 * rate,
      });
    } else if (z.art === 'beschlag') {
      // Object.hasOwn: a prototype key like „constructor“ is not a Beschlag kind.
      const b = z.beschlag && Object.hasOwn(BESCHLAG, z.beschlag) ? BESCHLAG[z.beschlag] : undefined;
      if (!b) throw new MengenFehler('Beschlag: Art unbekannt');
      const stk = take('beschlag', menge, MENGEN_LIMITS.beschlagStk, 'Beschläge');
      positionen.push({
        text: `${b.label}, ${fmt(stk)} Stk.${warum ? ` (${warum})` : ''}`,
        menge: stk,
        einheit: 'Stk.',
        netto: stk * b.rate,
      });
    } else if (z.art === 'pauschal') {
      // No rate exists for a Pauschale and Claude may not name amounts (§1, §4.4): the owner sees
      // the line at 0 € and prices it by hand; the customer is told it is not included.
      if (!warum) throw new MengenFehler('Pauschale ohne Begründung');
      pauschal = true;
      positionen.push({ text: `Material pauschal: ${warum} (nicht bewertet)`, menge, einheit: 'Pausch.', netto: 0 });
    } else {
      throw new MengenFehler('Material: unbekannte Art');
    }
  }
  if (pauschal) annahmen.push('Pauschales Material ist im Preis nicht enthalten und wird nach dem Aufmaß ergänzt.');

  positionen.push({ text: 'Werkstatt', menge: werkstatt, einheit: 'h', netto: werkstatt * SHARED.werkstattStunde });
  positionen.push(montagePosition(montage));
  positionen.push(anfahrtPosition(ctx, tripsFor(montage)));

  return kalkulation(positionen, { breite: 0.3, quelle: 'ki-mengen', annahmen, regelVersion, ctx });
}
